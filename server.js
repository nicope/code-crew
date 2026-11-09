// Code Crew — persistent Bots (agents with a job, a folder, memory and routines) on top of Claude Code via the Agent SDK.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { config, DATA_DIR, HOME, isLoopback, writeConfigFile, migrateLegacyData } from './config.js';
migrateLegacyData();
import { WebSocketServer } from 'ws';
import webpush from 'web-push';
import { z } from 'zod';
import { query, getSessionMessages, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = config.port, HOST = config.host;
const DEFAULT_CWD = config.defaultCwd, DEFAULT_PERMISSION = config.defaultPermission, DEFAULT_MODEL = config.defaultModel, BOTS_DIR = config.botsDir;
const MEMORY_DIR = path.join(DATA_DIR, 'memory');
const STORE = path.join(DATA_DIR, 'store.json');
const OAUTH_TOKEN_FILE = config.oauthTokenFile;
const IDLE_SHUTDOWN_MS = 15 * 60 * 1000;
const APPROVAL_EXPIRY_MS = 30 * 60 * 1000;
const FOLD_GRACE_MS = 20000;       // after a result, how long to wait for the next API call before treating queued messages as answered
const DIR_ROOTS = config.dirRoots;

let TOKEN = config.token;
if (!TOKEN) { TOKEN = randomBytes(8).toString('hex'); writeConfigFile({ token: TOKEN }); console.error('Generated an access token and saved it to the config file. Run `code-crew link` to see the link.'); }
fs.mkdirSync(MEMORY_DIR, { recursive: true });
// Headless auth: a long-lived subscription token from `claude setup-token`, saved to ~/.code-crew/oauth-token.
// Needed when the server runs under launchd/systemd, which cannot read the macOS Keychain where `claude login` stores credentials.
function childEnv() {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // never let an API key silently take over subscription usage
  const t = readOauthToken(); if (t) env.CLAUDE_CODE_OAUTH_TOKEN = t;
  return env;
}
let warnedToken = false;
function readOauthToken() {
  let t = ''; try { t = fs.readFileSync(OAUTH_TOKEN_FILE, 'utf8').trim(); } catch { return ''; }
  if (/^sk-ant-/.test(t)) return t;
  if (!warnedToken) { warnedToken = true; console.error(`Ignoring ${OAUTH_TOKEN_FILE}: not a token from \`claude setup-token\` (should start with sk-ant-).`); }
  return '';
}
const authMode = () => (readOauthToken() ? 'setup-token file' : 'claude login (Keychain)');
fs.mkdirSync(path.join(DATA_DIR, 'trash'), { recursive: true });

// ---------------------------------------------------------------- web push (approvals and finished work reach the phone)
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');
let vapid = null;
try { vapid = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8')); } catch { vapid = webpush.generateVAPIDKeys(); fs.writeFileSync(VAPID_FILE, JSON.stringify(vapid), { mode: 0o600 }); }
webpush.setVapidDetails(config.pushSubject, vapid.publicKey, vapid.privateKey);
async function notify({ title, body, tag, url }) {
  if (!store.push?.length) return;
  const payload = JSON.stringify({ title, body: String(body || '').slice(0, 180), tag, url });
  await Promise.all(store.push.map(async (sub) => {
    try { await webpush.sendNotification(sub, payload, { TTL: 60 * 60, urgency: 'high' }); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) { store.push = store.push.filter((s) => s.endpoint !== sub.endpoint); save(); } else console.error('push failed', e.statusCode || e.message); }
  }));
}
const toolSummary = (name, input = {}) => name === 'vault' ? `use your “${input.name}” login` : name === 'vault_request' ? `needs a credential: ${input.name}` : name === 'Bash' ? input.command : name === 'Edit' || name === 'Write' || name === 'Read' ? path.basename(String(input.file_path || '')) : name === 'mcp__bots__message_bot' ? `message ${input.to}` : name === 'WebFetch' ? input.url : Object.values(input).find((v) => typeof v === 'string') || '';

// ----------------------------------------------------------------  connectors: services the Bots can use (MCP servers under the hood)
const CONNECTORS_FILE = path.join(DATA_DIR, 'connectors.json');
let connectors = {}; try { connectors = JSON.parse(fs.readFileSync(CONNECTORS_FILE, 'utf8')); } catch {}
const saveConnectors = () => fs.writeFileSync(CONNECTORS_FILE, JSON.stringify(connectors, null, 2), { mode: 0o600 });
// kind: 'stdio' (official MCP package run locally), 'http' (remote MCP with a header), 'rest' (a request tool over the service's REST API, for services whose MCP is login-only)
const CATALOG = [
  { id: 'github', name: 'GitHub', color: '#24292f', tagline: 'Repos, issues, pull requests, Actions', kind: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer {token}' }, fields: [{ key: 'token', label: 'Personal access token', secret: true, help: 'https://github.com/settings/tokens' }], test: { url: 'https://api.github.com/user', headers: { Authorization: 'Bearer {token}', 'User-Agent': 'code-crew' } } },
  { id: 'supabase', name: 'Supabase', color: '#3ecf8e', tagline: 'Projects, SQL, tables, logs, edge functions', kind: 'stdio', command: 'npx', args: ['-y', '@supabase/mcp-server-supabase@0.16.1'], env: { SUPABASE_ACCESS_TOKEN: '{token}' }, fields: [{ key: 'token', label: 'Personal access token', secret: true, help: 'https://supabase.com/dashboard/account/tokens' }], test: { url: 'https://api.supabase.com/v1/projects', headers: { Authorization: 'Bearer {token}' } } },
  { id: 'vercel', name: 'Vercel', color: '#171717', tagline: 'Deployments, projects, domains, env vars', kind: 'rest', base: 'https://api.vercel.com', headers: { Authorization: 'Bearer {token}' }, docs: 'https://vercel.com/docs/rest-api', fields: [{ key: 'token', label: 'API token', secret: true, help: 'https://vercel.com/account/tokens' }], test: { path: '/v2/user' } },
  { id: 'cloudflare', name: 'Cloudflare', color: '#f6821f', tagline: 'DNS, Workers, Pages, KV, R2, D1', kind: 'rest', base: 'https://api.cloudflare.com/client/v4', headers: { Authorization: 'Bearer {token}' }, docs: 'https://developers.cloudflare.com/api/', fields: [{ key: 'token', label: 'API token', secret: true, help: 'https://dash.cloudflare.com/profile/api-tokens' }], test: { path: '/user/tokens/verify' } },
  { id: 'stripe', name: 'Stripe', color: '#635bff', tagline: 'Customers, payments, subscriptions, invoices', kind: 'stdio', command: 'npx', args: ['-y', '@stripe/mcp@0.3.4', '--tools=all'], env: { STRIPE_SECRET_KEY: '{token}' }, fields: [{ key: 'token', label: 'Secret key (sk_live_… or sk_test_…)', secret: true, help: 'https://dashboard.stripe.com/apikeys' }], test: { url: 'https://api.stripe.com/v1/balance', headers: { Authorization: 'Bearer {token}' } } },
  { id: 'notion', name: 'Notion', color: '#2f2f2f', tagline: 'Pages and databases', kind: 'stdio', command: 'npx', args: ['-y', '@notionhq/notion-mcp-server@2.6.1'], env: { OPENAPI_MCP_HEADERS: '{"Authorization":"Bearer {token}","Notion-Version":"2022-06-28"}' }, fields: [{ key: 'token', label: 'Internal integration secret', secret: true, help: 'https://www.notion.so/profile/integrations' }], test: { url: 'https://api.notion.com/v1/users/me', headers: { Authorization: 'Bearer {token}', 'Notion-Version': '2022-06-28' } } },
  { id: 'linear', name: 'Linear', color: '#5e6ad2', tagline: 'Issues, projects, cycles', kind: 'rest', base: 'https://api.linear.app', headers: { Authorization: '{token}' }, docs: 'https://developers.linear.app/docs/graphql/working-with-the-graphql-api', note: 'GraphQL only: POST /graphql with body {"query": "..."}.', fields: [{ key: 'token', label: 'Personal API key', secret: true, help: 'https://linear.app/settings/account/security' }], test: { path: '/graphql', method: 'POST', body: { query: '{ viewer { id } }' } } },
  { id: 'slack', name: 'Slack', color: '#4a154b', tagline: 'Read and post messages, channels, users', kind: 'rest', base: 'https://slack.com/api', headers: { Authorization: 'Bearer {token}' }, docs: 'https://api.slack.com/methods', fields: [{ key: 'token', label: 'Bot token (xoxb-…)', secret: true, help: 'https://api.slack.com/apps' }], test: { path: '/auth.test', method: 'POST' } },
  { id: 'klaviyo', name: 'Klaviyo', color: '#1f1f1f', tagline: 'Profiles, lists, campaigns, flows, metrics', kind: 'rest', base: 'https://a.klaviyo.com/api', headers: { Authorization: 'Klaviyo-API-Key {token}', revision: '2024-10-15' }, docs: 'https://developers.klaviyo.com/en/reference/api_overview', fields: [{ key: 'token', label: 'Private API key (pk_…)', secret: true, help: 'https://www.klaviyo.com/settings/account/api-keys' }], test: { path: '/accounts' } },
  { id: 'shopify', name: 'Shopify', color: '#5e8e3e', tagline: 'Products, orders, customers (Admin API)', kind: 'rest', base: 'https://{store}.myshopify.com/admin/api/2025-01', headers: { 'X-Shopify-Access-Token': '{token}' }, docs: 'https://shopify.dev/docs/api/admin-rest', fields: [{ key: 'store', label: 'Store subdomain (before .myshopify.com)' }, { key: 'token', label: 'Admin API access token (shpat_…)', secret: true, help: 'https://help.shopify.com/en/manual/apps/app-types/custom-apps' }], test: { path: '/shop.json' } },
  { id: 'resend', name: 'Resend', color: '#111111', tagline: 'Send email, manage domains and audiences', kind: 'rest', base: 'https://api.resend.com', headers: { Authorization: 'Bearer {token}' }, docs: 'https://resend.com/docs/api-reference', fields: [{ key: 'token', label: 'API key (re_…)', secret: true, help: 'https://resend.com/api-keys' }], test: { path: '/domains' } },
  { id: 'firecrawl', name: 'Firecrawl', color: '#ff5a1f', tagline: 'Scrape and crawl websites into clean text', kind: 'stdio', command: 'npx', args: ['-y', 'firecrawl-mcp@3.38.0'], env: { FIRECRAWL_API_KEY: '{token}' }, fields: [{ key: 'token', label: 'API key (fc-…)', secret: true, help: 'https://www.firecrawl.dev/app/api-keys' }] },
  { id: 'context7', name: 'Context7', color: '#6b57ff', tagline: 'Up-to-date documentation for any library', kind: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp@4.5.1'], fields: [] },
  { id: 'playwright', name: 'Browser', color: '#2ead33', tagline: 'A headless browser: open pages, click, fill forms, screenshots', kind: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@0.0.84', '--headless'], fields: [] },
];
const fill = (s, f) => String(s).replace(/\{(\w+)\}/g, (_, k) => f[k] ?? '');
const fillObj = (o, f) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, fill(v, f)]));
const connectorDef = (id) => { const c = connectors[id]; if (!c) return null; const cat = c.custom ? { id, kind: c.custom.kind, name: c.custom.name, ...c.custom } : CATALOG.find((x) => x.id === id); return cat ? { cat, fields: c.fields || {}, serverName: id.replace(/[^a-zA-Z0-9]/g, '_') } : null; };
function restServer(name, cat, fields) {
  const base = fill(cat.base, fields).replace(/\/$/, ''), headers = fillObj(cat.headers, fields);
  return createSdkMcpServer({ name, version: '1.0.0', tools: [tool('request',
    `Call the ${cat.name} API at ${base}. ${cat.note || ''} ${cat.docs ? `Docs: ${cat.docs}.` : ''} Authentication is added for you. Returns the HTTP status and the response body (truncated at 60 KB).`,
    { method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']), path: z.string().describe('Path under the base URL, with query string if needed, e.g. /v2/user?limit=10'), body: z.any().optional().describe('JSON body for POST/PUT/PATCH') },
    async ({ method, path: p, body }) => {
      const r = await fetch(base + (p.startsWith('/') ? p : '/' + p), { method, headers: { accept: 'application/json', ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
      const text = await r.text();
      return { content: [{ type: 'text', text: `HTTP ${r.status}\n${text.slice(0, 60000)}` }], isError: r.status >= 400 };
    })] });
}
function connectorServers(bot) {
  const servers = {}, allowed = [], described = [];
  for (const id of Object.keys(connectors)) {
    if (bot.connectorsOff?.includes(id)) continue;
    const d = connectorDef(id); if (!d) continue; const { cat, fields, serverName } = d;
    if (cat.kind === 'stdio') servers[serverName] = { type: 'stdio', command: cat.command, args: (cat.args || []).map((a) => fill(a, fields)), env: fillObj(cat.env, fields) };
    else if (cat.kind === 'http') servers[serverName] = { type: 'http', url: fill(cat.url, fields), headers: fillObj(cat.headers, fields) };
    else if (cat.kind === 'rest') servers[serverName] = restServer(serverName, cat, fields);
    else continue;
    allowed.push(`mcp__${serverName}`);
    described.push(cat.kind === 'rest' ? `${cat.name}: call its API with the mcp__${serverName}__request tool` : `${cat.name}: its tools are named mcp__${serverName}__*`);
  }
  return { servers, allowed, described };
}
async function testConnector(cat, fields) {
  if (!cat.test) return;
  const t = cat.test; const url = t.url ? fill(t.url, fields) : fill(cat.base, fields).replace(/\/$/, '') + t.path;
  const headers = { accept: 'application/json', ...fillObj(t.headers || cat.headers, fields), ...(t.body ? { 'content-type': 'application/json' } : {}) };
  let r; try { r = await fetch(url, { method: t.method || 'GET', headers, body: t.body ? JSON.stringify(t.body) : undefined, signal: AbortSignal.timeout(15000) }); } catch (e) { throw new Error(`Could not reach ${cat.name}: ${e.message}`); }
  if (r.status === 401 || r.status === 403) throw new Error(`${cat.name} rejected this key (HTTP ${r.status}). Check the token and its permissions.`);
  if (!r.ok) throw new Error(`${cat.name} answered HTTP ${r.status} to a test call.`);
  if (cat.id === 'slack') { const j = await r.json().catch(() => ({})); if (j.ok === false) throw new Error(`Slack rejected this token: ${j.error}`); }
}
const publicConnectors = () => [
  ...CATALOG.map((c) => ({ id: c.id, name: c.name, color: c.color, tagline: c.tagline, kind: c.kind, fields: c.fields, connected: !!connectors[c.id], values: Object.fromEntries(c.fields.map((f) => [f.key, f.secret ? (connectors[c.id]?.fields?.[f.key] ? '••••' + String(connectors[c.id].fields[f.key]).slice(-4) : '') : connectors[c.id]?.fields?.[f.key] || ''])) })),
  ...Object.entries(connectors).filter(([, c]) => c.custom).map(([id, c]) => ({ id, name: c.custom.name, color: '#777', tagline: c.custom.kind === 'rest' ? c.custom.base : c.custom.kind === 'http' ? c.custom.url : c.custom.command, kind: c.custom.kind, custom: true, fields: [], connected: true, values: {} })),
];
function applyConnectors() { for (const rt of runtimes.values()) { if (rt.busy) rt.needsRestart = true; else rt.restart(); } broadcastBots(); }

// ---------------------------------------------------------------- vault: logins a Bot may ask for; you approve each request
// Items live in ~/.code-crew/vault.json (mode 600). With the 1Password CLI and a service-account token, 1Password items are offered too.
const VAULT_FILE = path.join(DATA_DIR, 'vault.json');
let vault = { items: {} }; try { vault = JSON.parse(fs.readFileSync(VAULT_FILE, 'utf8')); } catch {}
const saveVault = () => fs.writeFileSync(VAULT_FILE, JSON.stringify(vault, null, 2), { mode: 0o600 });
const opBin = () => { for (const p of ['/opt/homebrew/bin/op', '/usr/local/bin/op', '/usr/bin/op']) if (fs.existsSync(p)) return p; return ''; };
const opEnabled = () => !!(config.onePasswordToken && opBin());
function opRun(args) { return new Promise((resolve, reject) => execFile(opBin(), ['--format', 'json', ...args], { env: { ...process.env, OP_SERVICE_ACCOUNT_TOKEN: config.onePasswordToken }, timeout: 20000, maxBuffer: 4e6 }, (err, out) => err ? reject(new Error(String(err.message).split('\n').pop())) : resolve(JSON.parse(out || 'null')))); }
async function vaultList() {
  const local = Object.entries(vault.items).map(([name, it]) => ({ name, note: it.note || '', source: 'local' }));
  if (!opEnabled()) return local;
  try { const items = await opRun(['item', 'list', '--categories', 'Login,Password,API Credential,Database,Secure Note']); return [...local, ...items.map((i) => ({ name: i.title, note: `1Password · ${i.vault?.name || ''}${i.additional_information ? ` · ${i.additional_information}` : ''}`, source: '1password', id: i.id }))]; }
  catch (e) { return [...local, { name: '(1Password unavailable)', note: e.message, source: 'error' }]; }
}
async function vaultValue(name) {
  if (vault.items[name]) return { value: vault.items[name].value };
  if (!opEnabled()) return null;
  const items = await opRun(['item', 'list']); const hit = items.find((i) => i.title.toLowerCase() === String(name).toLowerCase()); if (!hit) return null;
  const full = await opRun(['item', 'get', hit.id, '--reveal']);
  const fields = Object.fromEntries((full.fields || []).filter((f) => f.value && ['username', 'password', 'credential', 'notesPlain', 'url'].includes(f.id || f.label)).map((f) => [f.label || f.id, f.value]));
  for (const u of full.urls || []) if (u.primary) fields.url = u.href;
  return { value: fields.password || fields.credential || fields.notesPlain || '', fields };
}
function vaultMcpServer(rt) {
  return createSdkMcpServer({ name: 'vault', version: '1.0.0', tools: [
    tool('vault_list', 'List the names of logins and secrets the user keeps in their vault (names and notes only, no values). Use it to find the right name before vault_get.', {}, async () => ({ content: [{ type: 'text', text: (await vaultList()).map((i) => `- ${i.name}${i.note ? ` — ${i.note}` : ''}`).join('\n') || 'The vault is empty. Use vault_request to ask the user for what you need.' }] })),
    tool('vault_get', 'Ask the user for permission to use one vault item. Returns the secret (and username/url fields when it is a login) only after the user approves. Give a specific reason: what you will do with it.', { name: z.string().describe('Item name exactly as listed by vault_list'), reason: z.string().describe('One sentence: what you need it for') }, async ({ name, reason }) => {
      const found = await vaultValue(name).catch((e) => ({ error: e.message })); if (!found) return { content: [{ type: 'text', text: `No vault item named "${name}". Call vault_list, or vault_request to ask the user to add it.` }], isError: true };
      if (found.error) return { content: [{ type: 'text', text: `Vault error: ${found.error}` }], isError: true };
      if (!(rt.bot.vaultAlways || []).includes(name)) {
        const res = await rt.askPermission('vault', { name, reason });
        if (res.behavior !== 'allow') return { content: [{ type: 'text', text: `The user did not approve using "${name}". Do not retry; explain what you would need it for.` }], isError: true };
        if (res.always) { rt.bot.vaultAlways = [...new Set([...(rt.bot.vaultAlways || []), name])]; save(); }
      }
      return { content: [{ type: 'text', text: found.fields ? JSON.stringify({ ...found.fields, password: undefined, secret: found.value }, null, 2) : found.value }] };
    }),
    tool('vault_request', 'Ask the user to add a login or secret you need and do not have. They see a card where they can paste it; it is stored in their vault and returned to you.', { name: z.string().describe('Short name for the item, e.g. "Vercel token" or "Shopify admin login"'), why: z.string().describe('What you need it for and where to get it, in one or two sentences') }, async ({ name, why }) => {
      const res = await rt.askPermission('vault_request', { name, why });
      if (res.behavior !== 'allow' || !res.value) return { content: [{ type: 'text', text: 'The user did not provide it. Continue without it or explain what it would unlock.' }], isError: true };
      vault.items[name] = { value: res.value, note: `Added for ${rt.bot.name}: ${why.slice(0, 80)}`, createdAt: Date.now() }; saveVault();
      return { content: [{ type: 'text', text: res.value }] };
    }),
  ] });
}

// ---------------------------------------------------------------- store
const store = { bots: [], routines: [], push: [] };
try { Object.assign(store, JSON.parse(fs.readFileSync(STORE, 'utf8'))); } catch {}
for (const b of store.bots) b.turns ||= []; // messages queued or in flight, kept so a restart cannot lose them
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFileSync(STORE, JSON.stringify(store, null, 2)), 150); }
const flush = () => { clearTimeout(saveTimer); fs.writeFileSync(STORE, JSON.stringify(store, null, 2)); };
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { flush(); process.exit(0); }); // launchd restarts must not lose a pending save
const botById = (id) => store.bots.find((b) => b.id === id);
const botByName = (name) => store.bots.find((b) => b.name.toLowerCase() === String(name).toLowerCase());

// GitHub repo behind a Bot's folder (origin remote), so "#123" in its replies can link to the pull request. Cached per folder.
const repoCache = new Map();
function repoFor(cwd) {
  const hit = repoCache.get(cwd); if (hit && hit.at > Date.now() - 60000) return hit.repo;
  let repo = null;
  try { const out = execFileSync('git', ['-C', cwd, 'remote', '-v'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }); const lines = out.split('\n').filter((l) => /github\.com/.test(l)); const pick = lines.find((l) => l.startsWith('origin\t')) || lines[0] || ''; const m = pick.match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?(?:\s|$)/); if (m) repo = m[1]; } catch {} // any GitHub remote counts; origin preferred
  repoCache.set(cwd, { repo, at: Date.now() }); return repo;
}
function publicBot(b) {
  const rt = runtimes.get(b.id);
  const { turns = [], ...pub } = b;
  return { ...pub, repo: repoFor(b.cwd), busy: !!rt?.busy || turns.length > 0, queued: turns.length, pendingApprovals: rt ? rt.pending.size : 0, routines: store.routines.filter((r) => r.botId === b.id).length };
}

if (store.bots.length === 0) {
  store.bots.push({ id: randomUUID(), name: 'Claude', label: 'Primary Bot', shape: 'circle', color: '#6fb3ff', cwd: DEFAULT_CWD, model: DEFAULT_MODEL, permissionMode: 'acceptEdits', sessionId: null, createdAt: Date.now(), lastActivity: Date.now(), unread: false, primary: true });
  save();
}

// ---------------------------------------------------------------- bot runtimes
const runtimes = new Map();      // botId -> BotRuntime
const sockets = new Set();       // all websocket clients
const broadcastBots = () => { const payload = JSON.stringify({ type: 'bots', bots: store.bots.map(publicBot) }); for (const ws of sockets) if (ws.readyState === 1) ws.send(payload); };

function makeInbox() {
  const queue = []; let wake = null; let closed = false;
  return {
    push(m) { queue.push(m); wake?.(); wake = null; },
    close() { closed = true; wake?.(); wake = null; },
    async *[Symbol.asyncIterator]() { while (true) { if (queue.length) { yield queue.shift(); continue; } if (closed) return; await new Promise((r) => { wake = r; }); } },
  };
}

function botsMcpServer(self) {
  return createSdkMcpServer({
    name: 'bots',
    instructions: 'Tools for working with the other Bots in this workspace.',
    tools: [
      tool('message_bot', 'Send a message to another Bot by name. Use it to hand off work or share a result. The other Bot will read it in its own conversation and act on it.', { to: z.string().describe('Name of the Bot to message'), message: z.string().describe('What to tell it. Include context, since it cannot see this conversation.') },
        async ({ to, message }) => { const bot = to;
          const target = botByName(bot);
          if (!target) return { content: [{ type: 'text', text: `No Bot named "${bot}". Available: ${store.bots.filter((b) => b.id !== self.id).map((b) => b.name).join(', ') || 'none'}` }], isError: true };
          if (target.id === self.id) return { content: [{ type: 'text', text: 'That is you.' }], isError: true };
          getRuntime(target.id).enqueue(`[Message from Bot "${self.name}"]\n${message}`, { origin: 'bot' });
          return { content: [{ type: 'text', text: `Delivered to ${target.name}. It will reply in its own conversation.` }] };
        }),
      tool('list_bots', 'List the Bots in this workspace with their labels.', {}, async () => ({ content: [{ type: 'text', text: store.bots.map((b) => `- ${b.name}${b.label ? ` (${b.label})` : ''}${b.id === self.id ? ' — you' : ''}`).join('\n') }] })),
    ],
  });
}

function identityPrompt(bot) {
  const others = store.bots.filter((b) => b.id !== bot.id).map((b) => `${b.name}${b.label ? ` (${b.label})` : ''}`);
  return [
    `# Your identity`,
    `You are "${bot.name}"${bot.label ? `, ${bot.label}` : ''}: one of the user's personal Bots. A Bot is a durable teammate with one job, its own ongoing conversation, and its own memory. The user talks to you in a chat UI (often from a phone), so keep replies short and skimmable, lead with the outcome, and do the work rather than describing how you would.`,
    `# Memory`,
    `Your private memory file is ${path.join(MEMORY_DIR, bot.id + '.md')}. Read it at the start of a task when it might matter. When you learn something durable (your job, the user's preferences, rules like "ask before sending", decisions, recurring context), append it there without being asked. Never store passwords or secrets in it.`,
    `# Connected services`,
    connectorServers(bot).described.length ? `The user connected these services for you; use them directly instead of asking for keys: ${connectorServers(bot).described.join('; ')}.` : `No external services are connected yet. The user can connect some (GitHub, Supabase, Vercel, Cloudflare, Stripe, …) from the Connectors screen.`,
    `# Showing files to the user`,
    `Images, videos, audio and PDFs inside your folder (${bot.cwd || DEFAULT_CWD}) are displayed inline in the chat when you write their absolute path on its own line, or as a markdown image like ![caption](/absolute/path.mp4). Do this whenever you produce or find media worth seeing; the user is often on a phone and cannot open files otherwise. Files outside your folder are not displayed, so copy them in first.`,
    `# Vault`,
    `The user keeps logins and secrets in a vault. When a task needs a credential you do not have (a login for a site, a database password, an API key with no connector), call vault_list to see what exists and vault_get(name, reason) to request it; the user approves each request. If it is not there, vault_request(name, why) asks them to add it. Never ask the user to paste secrets into the chat.`,
    `# Other Bots`,
    others.length ? `Other Bots you can message with the message_bot tool: ${others.join('; ')}. Hand off work that fits another Bot's job better, and say so to the user.` : `There are no other Bots yet.`,
    `# Messages that start with [Routine: …] are scheduled runs you were given; do the task and report briefly. A message starting with [Mentioned by the user in Bot "X"'s conversation] was typed by the user in another Bot's chat with your @name: do what is asked, then send your answer to Bot X with message_bot so it appears in that conversation, and keep your own reply here to one line. If there is nothing worth saying, reply with one line. Messages that start with [Message from Bot "…"] come from another Bot; act on them and reply to the user, not to the Bot, unless a reply to the Bot is needed.`,
  ].join('\n');
}

// One line for the Bot list: who the message came from and how it starts.
function previewFor(text) {
  const rm = text.match(/^\[Routine: ([^\]]+)\]/), bm = text.match(/^\[Message from Bot "([^"]+)"\]/);
  const mm = text.match(/^\[Mentioned by the user in Bot "([^"]+)"'s conversation\]/);
  return rm ? `Routine ${rm[1]} ran` : mm ? `You (in ${mm[1]}'s chat): ${text.split('\n').slice(1).join(' ').trim().slice(0, 100)}` : bm ? `From ${bm[1]}: ${text.split('\n').slice(1).join(' ').trim().slice(0, 100)}` : `You: ${text.replace(/\n\n\[Attached files\][\s\S]*$/, '').replace(/\s+/g, ' ').slice(0, 120)}`;
}

class BotRuntime {
  constructor(bot) {
    this.bot = bot; bot.turns ||= []; this.subscribers = new Set(); this.turnBuffer = []; this.pending = new Map();
    this.busy = false; this.query = null; this.inbox = null; this.abort = null; this.idleTimer = null; this.turnOrigin = 'user';
  }
  broadcast(obj) { const s = JSON.stringify({ botId: this.bot.id, ...obj }); for (const ws of this.subscribers) if (ws.readyState === 1) ws.send(s); }

  ensureStarted() {
    if (this.query) return;
    const bot = this.bot;
    this.inbox = makeInbox(); this.abort = new AbortController();
    const opts = {
      cwd: bot.cwd || DEFAULT_CWD,
      model: bot.model || undefined,
      permissionMode: bot.permissionMode || 'acceptEdits',
      settingSources: ['user', 'project', 'local'], // honour the same allow/deny rules, CLAUDE.md and hooks as the terminal; without this every curl/git/npm call asks
      includePartialMessages: true,
      abortController: this.abort,
      additionalDirectories: [MEMORY_DIR],
      env: childEnv(),
      systemPrompt: { type: 'preset', preset: 'claude_code', append: identityPrompt(bot) },
      mcpServers: { bots: botsMcpServer(bot), vault: vaultMcpServer(this), ...connectorServers(bot).servers },
      allowedTools: ['mcp__bots__message_bot', 'mcp__bots__list_bots', 'mcp__vault', ...connectorServers(bot).allowed],
      canUseTool: (toolName, input, { suggestions, signal }) => this.askPermission(toolName, input, suggestions, signal),
      hooks: { PreToolUse: [{ matcher: 'Read|Grep|Glob|Bash|Edit|Write|MultiEdit|NotebookEdit', hooks: [protectSecretsHook] }] },
    };
    opts.allowDangerouslySkipPermissions = true; // needed so a Bot can be switched to "Never ask" while running
    if (bot.sessionId) opts.resume = bot.sessionId;
    this.query = query({ prompt: this.inbox, options: opts });
    this.pump();
  }

  async pump() {
    const q = this.query;
    let handled = false; // the catch below already closed the dying turn
    try {
      for await (const msg of q) {
        if (msg.session_id && msg.session_id !== this.bot.sessionId) { this.bot.sessionId = msg.session_id; save(); }
        this.turnBuffer.push(msg);
        if (msg.type === 'system' && msg.subtype === 'status' && msg.status === 'requesting') this.markStarted(); // Claude Code is building an API request: queued messages are in it
        if (msg.type === 'assistant') for (const b of msg.message?.content || []) if (b.type === 'text' && b.text?.trim()) (this.turnBufferText ||= []).push(b.text.trim());
        this.broadcast({ type: 'sdk', msg });
        if (msg.type === 'result') this.finishTurn();
      }
    } catch (err) {
      if (!this.abort.signal.aborted) { this.broadcast({ type: 'error', error: String(err?.message || err) }); if (this.busy) { this.finishTurn(); handled = true; } }
    } finally {
      if (this.query === q) {
        this.query = null; this.inbox = null;
        if (this.abort?.signal.aborted) return;
        if (this.busy && !handled) this.finishTurn();
        const left = this.bot.turns.splice(0); // queued behind the turn that just died; the closed inbox would have swallowed them
        if (left.length) { this.busy = false; for (const t of left) this.enqueue(t.text, { origin: t.origin, resumed: true }); }
      }
    }
  }

  // Claude Code folds a message that arrives during a tool call into the running turn, but one that arrives while the
  // final answer is already being generated starts a new turn. Every message pushed before an API request is in that
  // request, so each "requesting" status marks the queued turns as started, and a result closes exactly the started ones.
  markStarted() {
    clearTimeout(this.foldTimer);
    const cutoff = Date.now() - 500;
    for (const t of this.bot.turns) if (!t.started && t.at < cutoff) t.started = true;
  }
  finishTurn(all = false) {
    clearTimeout(this.foldTimer);
    const turns = this.bot.turns;
    if (all || !turns.some((t) => t.started)) turns.splice(0, all ? turns.length : 1);
    else this.bot.turns = turns.filter((t) => !t.started);
    this.busy = this.bot.turns.length > 0; // a message that arrived mid-turn is already running: the Bot is not idle
    // If no new API call follows, the remaining messages were folded into the turn that just ended after all.
    if (this.busy && this.query) this.foldTimer = setTimeout(() => this.busy && this.query && this.finishTurn(true), FOLD_GRACE_MS);
    this.turnBuffer = [];
    const lastText = [...(this.turnBufferText || [])].pop(); this.turnBufferText = [];
    this.bot.lastActivity = Date.now();
    if (this.busy) this.bot.preview = previewFor(this.bot.turns[0].text);
    else if (lastText) this.bot.preview = lastText.replace(/\s+/g, ' ').slice(0, 140);
    if (this.needsRestart && !this.busy) { this.needsRestart = false; setTimeout(() => !this.busy && this.restart(), 50); }
    if (this.subscribers.size === 0) {
      this.bot.unread = true;
      notify({ title: `${this.bot.name} finished`, body: lastText || 'Open to see the result.', tag: `bot-${this.bot.id}`, url: `/?bot=${this.bot.id}` });
    }
    save(); broadcastBots(); this.scheduleIdle();
  }

  enqueue(text, { origin = 'user', resumed = false } = {}) {
    this.ensureStarted();
    clearTimeout(this.idleTimer);
    this.busy = true; this.turnOrigin = origin; this.bot.lastActivity = Date.now();
    if (origin === 'user') this.bot.unread = false;
    this.bot.turns.push({ text, origin, at: Date.now(), started: false });
    this.bot.preview = previewFor(text);
    const body = resumed ? `${text}\n\n[Re-delivered: the previous session ended before this message was finished. If your transcript shows you already started on it, continue from where you stopped instead of starting over.]` : text;
    this.inbox.push({ type: 'user', message: { role: 'user', content: body }, parent_tool_use_id: null, session_id: this.bot.sessionId || '' });
    save(); broadcastBots();
  }

  askPermission(toolName, input, suggestions, signal) {
    const id = randomUUID();
    return new Promise((resolve) => {
      const req = { id, toolName, input, suggestions: suggestions || [], createdAt: Date.now() };
      let timer = null;
      const done = (res) => { clearTimeout(timer); this.pending.delete(id); broadcastBots(); this.broadcast({ type: 'permission_resolved', id, behavior: res.behavior }); resolve(res); };
      this.pending.set(id, { req, done });
      this.broadcast({ type: 'permission_request', ...req });
      broadcastBots();
      notify({ title: `${this.bot.name} needs your approval`, body: `${toolName}: ${toolSummary(toolName, input)}`, tag: `perm-${id}`, url: `/?bot=${this.bot.id}` });
      if (this.turnOrigin !== 'user') timer = setTimeout(() => this.pending.has(id) && done({ behavior: 'deny', message: 'No one approved this within 30 minutes. Stop and summarize what still needs approval.' }), APPROVAL_EXPIRY_MS);
      signal?.addEventListener('abort', () => this.pending.has(id) && done({ behavior: 'deny', message: 'Cancelled' }));
    });
  }
  answerPermission(id, allow, always, value) {
    const p = this.pending.get(id); if (!p) return;
    p.done(allow ? { behavior: 'allow', updatedPermissions: always && p.req.suggestions?.length ? p.req.suggestions : undefined, always: !!always, value: typeof value === 'string' ? value : undefined } : { behavior: 'deny', message: 'The user declined this action.' });
  }

  async interrupt() { try { await this.query?.interrupt(); } catch {} }
  subscribe(ws) { this.subscribers.add(ws); clearTimeout(this.idleTimer); if (this.bot.unread) { this.bot.unread = false; save(); broadcastBots(); } }
  unsubscribe(ws) { this.subscribers.delete(ws); this.scheduleIdle(); }
  scheduleIdle() { clearTimeout(this.idleTimer); if (!this.busy && this.subscribers.size === 0) this.idleTimer = setTimeout(() => this.shutdown(), IDLE_SHUTDOWN_MS); }
  shutdown() { if (!this.query || this.busy) return; this.inbox?.close(); this.abort?.abort(); this.query = null; this.inbox = null; }
  restart() { clearTimeout(this.foldTimer); this.inbox?.close(); this.abort?.abort(); this.query = null; this.inbox = null; this.busy = false; this.turnBuffer = []; this.bot.turns = []; for (const [, p] of this.pending) p.done({ behavior: 'deny', message: 'Bot restarted' }); }
  destroy() { this.restart(); for (const ws of this.subscribers) ws.readyState === 1 && ws.send(JSON.stringify({ type: 'bot_deleted', botId: this.bot.id })); this.subscribers.clear(); }
}
// Bots that already had conversations before previews existed: take the last message from the session transcript.
async function backfillPreviews() {
  let changed = false;
  for (const bot of store.bots) {
    if (bot.preview || !bot.sessionId) continue;
    let msgs = []; try { msgs = await getSessionMessages(bot.sessionId, { dir: bot.cwd }); } catch {} if (!msgs.length) { try { msgs = await getSessionMessages(bot.sessionId); } catch {} }
    for (const m of [...msgs].reverse()) {
      if (m.parent_tool_use_id) continue;
      const content = m.message?.content; const text = typeof content === 'string' ? content : (content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ');
      if (!text?.trim()) continue;
      const t = text.replace(/\n\n\[Attached files\][\s\S]*$/, '').replace(/\s+/g, ' ').trim();
      bot.preview = m.type === 'user' ? `You: ${t.slice(0, 120)}` : t.slice(0, 140); changed = true; break;
    }
  }
  if (changed) { save(); broadcastBots(); }
}
setTimeout(() => backfillPreviews().catch(() => {}), 500);
// Turns that were queued or running when the last process died: hand them back to their Bots.
function redeliverTurns() {
  for (const bot of store.bots) {
    const left = (bot.turns || []).splice(0); if (!left.length) continue;
    console.log(`${bot.name}: re-delivering ${left.length} message(s) interrupted by the restart`);
    for (const t of left) getRuntime(bot.id).enqueue(t.text, { origin: t.origin || 'user', resumed: true });
  }
}
setTimeout(redeliverTurns, 1500);
// "@Name" in a message brings that Bot in; longest names first so "@GF Videos" beats "@GF".
const mentionsIn = (text, self) => store.bots.filter((b) => b.id !== self.id).sort((a, b) => b.name.length - a.name.length).filter((b) => new RegExp(`(^|[^\\w])@${b.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'i').test(text));
// Bots run as the same OS user as this server, so file permissions alone cannot keep them out of Code Crew's own
// secrets (vault, connector keys, access token, login token). This hook denies tool calls that touch them.
const SECRET_MARKERS = [DATA_DIR, path.join(HOME, '.claude-chat'), '.code-crew', 'CLAUDE_CODE_OAUTH_TOKEN', 'OP_SERVICE_ACCOUNT_TOKEN', '.credentials.json'];
async function protectSecretsHook(input) {
  const text = JSON.stringify(input.tool_input || {});
  const hit = SECRET_MARKERS.find((mk) => text.includes(mk)) || (input.tool_name === 'Bash' && /(^|[\s;&|])(env|printenv|set)(\s|$|;)/.test(input.tool_input?.command || '') ? 'environment dump' : null);
  if (!hit) return {};
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `Blocked by Code Crew: this touches its own secrets (${hit}). Use the vault_get / connector tools instead.` } };
}
const getRuntime = (id) => { let rt = runtimes.get(id); if (!rt) { const bot = botById(id); if (!bot) throw new Error('No such bot'); rt = new BotRuntime(bot); runtimes.set(id, rt); } return rt; };

// ---------------------------------------------------------------- routines
function nextRunFor(r, from = Date.now()) {
  const d = new Date(from); const s = r.schedule || {};
  if (s.kind === 'interval') return (r.lastRun || from) + Math.max(5, Number(s.minutes || 60)) * 60000;
  if (s.kind === 'hourly') { d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d.getTime(); }
  const [hh, mm] = String(s.time || '09:00').split(':').map(Number);
  d.setHours(hh, mm, 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  if (s.kind === 'weekdays') while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.getTime();
}
function runRoutine(r, manual = false) {
  const bot = botById(r.botId); if (!bot) return;
  r.lastRun = Date.now(); r.nextRun = nextRunFor(r); r.runs = (r.runs || 0) + 1; save();
  getRuntime(bot.id).enqueue(`[Routine: ${r.name}]${manual ? ' (run now)' : ''}\n${r.prompt}`, { origin: 'routine' });
}
setInterval(() => { const now = Date.now(); for (const r of store.routines) { if (!r.enabled) continue; if (!r.nextRun) { r.nextRun = nextRunFor(r); save(); continue; } if (now >= r.nextRun) runRoutine(r); } }, 30000);

// ---------------------------------------------------------------- http
const FILE_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const MAX_UPLOAD = 50 * 1024 * 1024;
const readRaw = (req) => new Promise((resolve, reject) => { const chunks = []; let n = 0; req.on('data', (c) => { n += c.length; if (n > MAX_UPLOAD) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); }); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); });
const safeName = (s) => String(s || 'file').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '').slice(0, 120) || 'file';
const readBody = (req) => new Promise((resolve) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve({}); } }); });
const safeEq = (a, b) => { a = Buffer.from(String(a || '')); b = Buffer.from(String(b || '')); return a.length === b.length && a.length > 0 && timingSafeEqual(a, b); };
// Browsers send Origin on WebSocket upgrades and cross-origin requests; a page from another origin (another localhost port, a random site via DNS rebinding) must not drive this server.
const sameOrigin = (req) => { const o = req.headers.origin; if (!o) return true; try { return new URL(o).host === req.headers.host; } catch { return false; } };
const clientKey = (req) => { const peer = req.socket?.remoteAddress || '?'; const fwd = req.headers['x-forwarded-for']; return (fwd && /^(::1|127\.|::ffff:127\.|100\.)/.test(peer)) ? String(fwd).split(',')[0].trim() : peer; };
const failures = new Map(); // client → { n, until }
function authorized(url, req) {
  if (!TOKEN) return true;
  const ip = clientKey(req); const f = failures.get(ip);
  if (f && f.until > Date.now()) return false;
  const cookieTok = (req.headers.cookie || '').match(/(?:^|;\s*)cc_token=([^;]+)/)?.[1];
  const ok = safeEq(url.searchParams.get('token'), TOKEN) || safeEq(req.headers['x-cc-token'], TOKEN) || safeEq(cookieTok, TOKEN);
  if (ok) { failures.delete(ip); return true; }
  if (url.searchParams.get('token') || req.headers['x-cc-token'] || cookieTok) { const n = (f?.n || 0) + 1; failures.set(ip, { n, until: n >= 10 ? Date.now() + 10 * 60 * 1000 : 0 }); }
  return false;
}
const shortPath = (p) => p.startsWith(HOME) ? '~' + p.slice(HOME.length) : p;
// A fresh folder for a Bot: ~/Bots/<Name>, suffixed if another Bot already lives there.
function newBotDir(name) {
  const slug = String(name || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Bot';
  let dir = path.join(BOTS_DIR, slug), n = 2;
  while (store.bots.some((b) => b.cwd === dir)) dir = path.join(BOTS_DIR, `${slug} ${n++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function listDirs() {
  const out = new Set([HOME, DEFAULT_CWD, ...store.bots.map((b) => b.cwd)]);
  try { for (const e of fs.readdirSync(BOTS_DIR, { withFileTypes: true })) if (e.isDirectory()) out.add(path.join(BOTS_DIR, e.name)); } catch {}
  for (const root of DIR_ROOTS) { try { for (const e of fs.readdirSync(root, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith('.') && !['Library', 'Movies', 'Music', 'Pictures', 'Public', 'Applications', 'node_modules'].includes(e.name)) out.add(path.join(root, e.name)); } catch {} }
  return [...out].filter(Boolean).sort();
}
const clean = (s, n = 80) => String(s ?? '').trim().slice(0, n);
const PERMISSION_MODES = ['acceptEdits', 'default', 'plan', 'bypassPermissions'];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  try {
    if (p.startsWith('/api/') && !authorized(url, req)) return json(res, 401, { error: 'unauthorized' });
    if (p.startsWith('/api/') && req.method !== 'GET' && req.method !== 'HEAD') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'cross-origin request refused' });
      const ct = String(req.headers['content-type'] || ''); if (!/^(application\/json|application\/octet-stream)/.test(ct)) return json(res, 415, { error: 'send JSON (content-type: application/json)' });
    }
    if (TOKEN && p === '/' && url.searchParams.get('token') === TOKEN) res.setHeader('set-cookie', `cc_token=${TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);

    if (p === '/api/dirs') return json(res, 200, { dirs: listDirs(), default: DEFAULT_CWD, botsDir: BOTS_DIR, home: HOME, defaultPermission: DEFAULT_PERMISSION, defaultModel: DEFAULT_MODEL });
    let m;
    if (p === '/api/connectors' && req.method === 'GET') return json(res, 200, { connectors: publicConnectors() });
    if ((m = p.match(/^\/api\/connectors\/([a-z0-9-]+)$/))) {
      const id = m[1];
      if (req.method === 'DELETE') { delete connectors[id]; saveConnectors(); applyConnectors(); return json(res, 200, { ok: true }); }
      if (req.method === 'PUT') {
        const b = await readBody(req);
        if (id === 'custom') {
          const name = clean(b.name, 40); const kind = ['rest', 'http', 'stdio'].includes(b.kind) ? b.kind : 'rest';
          if (!name) return json(res, 400, { error: 'Give it a name' });
          const headers = {}; if (clean(b.headerName, 80) && clean(b.headerValue, 2000)) headers[clean(b.headerName, 80)] = clean(b.headerValue, 2000);
          const custom = { name, kind, headers, docs: clean(b.docs, 300) };
          if (kind === 'stdio') { const parts = clean(b.command, 500).split(/\s+/).filter(Boolean); if (!parts.length) return json(res, 400, { error: 'Command is required' }); custom.command = parts[0]; custom.args = parts.slice(1); }
          else { const u = clean(b.url, 500); if (!/^https?:\/\//.test(u)) return json(res, 400, { error: 'URL must start with http:// or https://' }); if (kind === 'rest') custom.base = u; else custom.url = u; }
          const cid = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          connectors[cid] = { custom, fields: {} }; saveConnectors(); applyConnectors();
          return json(res, 200, { ok: true, id: cid });
        }
        const cat = CATALOG.find((c) => c.id === id); if (!cat) return json(res, 404, { error: 'unknown connector' });
        const fields = {}; for (const f of cat.fields) { const v = clean(b.fields?.[f.key], 2000); if (v && !(f.secret && v.startsWith('••••'))) fields[f.key] = v; else if (f.secret && v.startsWith('••••') && connectors[id]?.fields?.[f.key]) fields[f.key] = connectors[id].fields[f.key]; }
        const missing = cat.fields.filter((f) => !fields[f.key]); if (missing.length) return json(res, 400, { error: `Missing: ${missing.map((f) => f.label).join(', ')}` });
        if (fields.store !== undefined && !/^[a-z0-9-]+$/i.test(fields.store)) return json(res, 400, { error: 'Store must be the subdomain only, letters, digits and dashes' });
        try { await testConnector(cat, fields); } catch (e) { return json(res, 400, { error: e.message }); }
        connectors[id] = { fields, connectedAt: Date.now() }; saveConnectors(); applyConnectors();
        return json(res, 200, { ok: true });
      }
    }
    if (p === '/api/vault' && req.method === 'GET') return json(res, 200, { items: await vaultList(), onePassword: { cli: !!opBin(), token: !!config.onePasswordToken } });
    if (p === '/api/vault/onepassword' && req.method === 'PUT') { const { token } = await readBody(req); config.onePasswordToken = clean(token, 400); writeConfigFile({ onePasswordToken: config.onePasswordToken }); return json(res, 200, { ok: true, cli: !!opBin() }); }
    if ((m = p.match(/^\/api\/vault\/item\/(.+)$/))) {
      const name = clean(decodeURIComponent(m[1]), 80); if (!name) return json(res, 400, { error: 'name required' });
      if (req.method === 'PUT') { const b = await readBody(req); const value = String(b.value || ''); if (!value) return json(res, 400, { error: 'value required' }); vault.items[name] = { value, note: clean(b.note, 120), createdAt: Date.now() }; saveVault(); return json(res, 200, { ok: true }); }
      if (req.method === 'DELETE') { delete vault.items[name]; saveVault(); return json(res, 200, { ok: true }); }
    }
    if (p === '/api/push/key') return json(res, 200, { key: vapid.publicKey, subscribers: store.push.length });
    if (p === '/api/push/subscribe' && req.method === 'POST') {
      const { subscription: sub } = await readBody(req);
      if (!sub?.endpoint || !sub?.keys?.p256dh) return json(res, 400, { error: 'bad subscription' });
      store.push = [...(store.push || []).filter((s) => s.endpoint !== sub.endpoint), { endpoint: sub.endpoint, keys: sub.keys, expirationTime: sub.expirationTime ?? null }]; save();
      return json(res, 200, { ok: true, subscribers: store.push.length });
    }
    if (p === '/api/push/subscribe' && req.method === 'DELETE') { const { endpoint } = await readBody(req); store.push = (store.push || []).filter((s) => s.endpoint !== endpoint); save(); return json(res, 200, { ok: true }); }
    if (p === '/api/push/test' && req.method === 'POST') { await notify({ title: 'Bots', body: 'Notifications are working.', tag: 'test', url: '/' }); return json(res, 200, { ok: true, subscribers: store.push.length }); }
    if (p === '/api/bots' && req.method === 'GET') return json(res, 200, { bots: store.bots.map(publicBot) });
    if (p === '/api/bots' && req.method === 'POST') {
      const b = await readBody(req);
      const bot = { id: randomUUID(), name: clean(b.name, 40) || 'New Bot', label: clean(b.label, 60), shape: clean(b.shape, 20) || 'circle', color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#6fb3ff', cwd: clean(b.cwd, 400), model: clean(b.model, 40) || DEFAULT_MODEL, permissionMode: PERMISSION_MODES.includes(b.permissionMode) ? b.permissionMode : DEFAULT_PERMISSION, sessionId: null, createdAt: Date.now(), lastActivity: Date.now(), unread: false };
      if (bot.cwd && !fs.existsSync(bot.cwd)) return json(res, 400, { error: `Folder not found: ${bot.cwd}` });
      if (!bot.cwd) bot.cwd = newBotDir(bot.name);
      store.bots.push(bot); save(); broadcastBots();
      return json(res, 200, { bot: publicBot(bot) });
    }
    // Files a Bot produced (videos, images, PDFs…) are shown inline in the chat; only files inside the Bot's folder are served.
    if ((m = p.match(/^\/api\/bots\/([0-9a-f-]+)\/file$/)) && req.method === 'GET') {
      const bot = botById(m[1]); if (!bot) return json(res, 404, { error: 'no such bot' });
      const file = path.resolve(url.searchParams.get('path') || '');
      let root, real; try { root = fs.realpathSync(bot.cwd); real = fs.realpathSync(file); } catch { return json(res, 404, { error: 'not found' }); }
      if (real !== root && !real.startsWith(root + path.sep)) return json(res, 403, { error: 'outside the Bot folder' });
      const st = fs.statSync(real); if (!st.isFile()) return json(res, 404, { error: 'not a file' });
      const type = FILE_MIME[path.extname(real).toLowerCase()] || 'application/octet-stream';
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      let start = 0, end = st.size - 1, status = 200;
      if (range && st.size) { start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2])); end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : end; if (start > end || start >= st.size) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); } status = 206; }
      const inline = /^(image\/(png|jpeg|gif|webp)|video\/|audio\/)/.test(type); // SVG, PDF, text and unknown types download instead of rendering in the app's origin
      res.writeHead(status, { 'content-type': type, 'content-length': end - start + 1, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'", ...(inline ? {} : { 'content-disposition': `attachment; filename="${path.basename(real).replace(/[^\w. -]/g, '_')}"` }), ...(status === 206 ? { 'content-range': `bytes ${start}-${end}/${st.size}` } : {}) });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(real, { start, end }).pipe(res); return;
    }
    // Attachments: saved into the Bot's folder (<cwd>/attachments) so the Bot can open them with its own tools.
    if ((m = p.match(/^\/api\/bots\/([0-9a-f-]+)\/upload$/)) && req.method === 'POST') {
      const bot = botById(m[1]); if (!bot) return json(res, 404, { error: 'no such bot' });
      let data; try { data = await readRaw(req); } catch { return json(res, 413, { error: 'File is larger than 50 MB' }); }
      const dir = path.join(bot.cwd, 'attachments'); fs.mkdirSync(dir, { recursive: true });
      const name = safeName(decodeURIComponent(req.headers['x-filename'] || 'file'));
      const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
      let file = path.join(dir, name), k = 2; while (fs.existsSync(file)) file = path.join(dir, `${base} (${k++})${ext}`);
      fs.writeFileSync(file, data);
      return json(res, 200, { path: file, name: path.basename(file), size: data.length });
    }
    if ((m = p.match(/^\/api\/bots\/([0-9a-f-]+)$/))) {
      const bot = botById(m[1]); if (!bot) return json(res, 404, { error: 'no such bot' });
      if (req.method === 'PATCH') {
        const b = await readBody(req); let restart = false;
        if (Array.isArray(b.connectorsOff)) { bot.connectorsOff = b.connectorsOff.map((x) => clean(x, 60)).filter(Boolean); restart = true; }
        for (const k of ['name', 'label', 'shape', 'color', 'cwd', 'model', 'permissionMode']) if (b[k] !== undefined) { const v = clean(b[k], k === 'cwd' ? 400 : 60); if (k === 'cwd' && !fs.existsSync(v)) return json(res, 400, { error: `Folder not found: ${v}` }); if (k === 'color' && !/^#[0-9a-f]{6}$/i.test(v)) return json(res, 400, { error: 'color must be #rrggbb' }); if (k === 'permissionMode' && !PERMISSION_MODES.includes(v)) return json(res, 400, { error: 'unknown approval level' }); if (['cwd', 'model', 'permissionMode', 'name', 'label'].includes(k) && bot[k] !== v) restart = true; bot[k] = v; }
        if (b.primary) { for (const o of store.bots) o.primary = false; bot.primary = true; }
        save(); broadcastBots();
        const rt = runtimes.get(bot.id);
        if (rt && b.permissionMode !== undefined && rt.query) { try { await rt.query.setPermissionMode(bot.permissionMode); } catch {} } // applies mid-turn too
        if (restart && rt && !rt.busy) rt.restart();
        return json(res, 200, { bot: publicBot(bot) });
      }
      if (req.method === 'DELETE') {
        runtimes.get(bot.id)?.destroy(); runtimes.delete(bot.id);
        store.bots = store.bots.filter((x) => x.id !== bot.id); store.routines = store.routines.filter((r) => r.botId !== bot.id);
        const mem = path.join(MEMORY_DIR, bot.id + '.md'); if (fs.existsSync(mem)) fs.renameSync(mem, path.join(DATA_DIR, 'trash', `${bot.id}-${Date.now()}.md`));
        save(); broadcastBots();
        return json(res, 200, { ok: true });
      }
    }
    if ((m = p.match(/^\/api\/bots\/([0-9a-f-]+)\/reset$/)) && req.method === 'POST') {
      const bot = botById(m[1]); if (!bot) return json(res, 404, { error: 'no such bot' });
      runtimes.get(bot.id)?.restart(); bot.sessionId = null; bot.preview = ''; save(); broadcastBots();
      return json(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/api\/bots\/([0-9a-f-]+)\/memory$/))) {
      const bot = botById(m[1]); if (!bot) return json(res, 404, { error: 'no such bot' });
      const f = path.join(MEMORY_DIR, bot.id + '.md');
      return json(res, 200, { memory: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '' });
    }
    if ((m = p.match(/^\/api\/bots\/([0-9a-f-]+)\/routines$/))) {
      const bot = botById(m[1]); if (!bot) return json(res, 404, { error: 'no such bot' });
      if (req.method === 'GET') return json(res, 200, { routines: store.routines.filter((r) => r.botId === bot.id) });
      if (req.method === 'POST') {
        const b = await readBody(req);
        const r = { id: randomUUID(), botId: bot.id, name: clean(b.name, 60) || 'Routine', prompt: clean(b.prompt, 4000), schedule: { kind: ['daily', 'weekdays', 'hourly', 'interval'].includes(b.schedule?.kind) ? b.schedule.kind : 'daily', time: /^\d{2}:\d{2}$/.test(b.schedule?.time || '') ? b.schedule.time : '09:00', minutes: Number(b.schedule?.minutes || 60) }, enabled: true, createdAt: Date.now(), lastRun: null, runs: 0 };
        r.nextRun = nextRunFor(r); store.routines.push(r); save(); broadcastBots();
        return json(res, 200, { routine: r });
      }
    }
    if ((m = p.match(/^\/api\/routines\/([0-9a-f-]+)(\/run)?$/))) {
      const r = store.routines.find((x) => x.id === m[1]); if (!r) return json(res, 404, { error: 'no such routine' });
      if (m[2] && req.method === 'POST') { runRoutine(r, true); return json(res, 200, { routine: r }); }
      if (req.method === 'PATCH') { const b = await readBody(req); if (b.enabled !== undefined) r.enabled = !!b.enabled; if (r.enabled) r.nextRun = nextRunFor(r); save(); return json(res, 200, { routine: r }); }
      if (req.method === 'DELETE') { store.routines = store.routines.filter((x) => x.id !== r.id); save(); broadcastBots(); return json(res, 200, { ok: true }); }
    }
    // static
    let file = p === '/' ? '/index.html' : p;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    const abs = path.join(PUBLIC, file);
    if (!abs.startsWith(PUBLIC) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(abs).pipe(res);
  } catch (err) { json(res, 500, { error: String(err?.message || err) }); }
});

// ---------------------------------------------------------------- websocket
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  if (!sameOrigin(req) || !authorized(new URL(req.url, 'http://x'), { ...req, headers: { ...req.headers, cookie: '' } })) { ws.close(4001, 'unauthorized'); return; }
  sockets.add(ws);
  let current = null; // runtime this socket is viewing
  const reply = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
  reply({ type: 'bots', bots: store.bots.map(publicBot) });

  ws.on('message', async (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    try {
      const bot = m.botId ? botById(m.botId) : null;
      if (m.type !== 'unsubscribe' && !bot) return reply({ type: 'error', error: 'Unknown bot' });
      switch (m.type) {
        case 'subscribe': {
          current?.unsubscribe(ws);
          current = getRuntime(bot.id); current.subscribe(ws);
          let messages = [];
          if (bot.sessionId) { try { messages = await getSessionMessages(bot.sessionId, { dir: bot.cwd }); } catch {} if (!messages.length) { try { messages = await getSessionMessages(bot.sessionId); } catch {} } }
          reply({ type: 'history', botId: bot.id, messages, live: current.turnBuffer, busy: current.busy, pending: [...current.pending.values()].map((p) => p.req) });
          break;
        }
        case 'unsubscribe': current?.unsubscribe(ws); current = null; break;
        case 'send': {
          let text = String(m.text || '').slice(0, 100000);
          const files = (Array.isArray(m.attachments) ? m.attachments : []).filter((f) => typeof f === 'string' && f.startsWith(path.join(bot.cwd, 'attachments') + path.sep)).slice(0, 20);
          if (files.length) text = `${text}\n\n[Attached files]\n${files.map((f) => `- ${f}`).join('\n')}`.trim();
          const mentioned = mentionsIn(text, bot);
          if (text) getRuntime(bot.id).enqueue(mentioned.length ? `${text}\n\n[The user also addressed this to ${mentioned.map((b) => `Bot "${b.name}"`).join(' and ')}; they received it and will answer you with message_bot. Do your own part only and coordinate instead of duplicating their work.]` : text, { origin: 'user' });
          for (const other of mentioned) getRuntime(other.id).enqueue(`[Mentioned by the user in Bot "${bot.name}"'s conversation]\n${text}`, { origin: 'user' });
          break;
        }
        case 'interrupt': await runtimes.get(bot.id)?.interrupt(); break;
        case 'permission': runtimes.get(bot.id)?.answerPermission(m.id, !!m.allow, !!m.always, m.value); break;
      }
    } catch (err) { reply({ type: 'error', botId: m.botId, error: String(err?.message || err) }); }
  });
  ws.on('close', () => { sockets.delete(ws); current?.unsubscribe(ws); });
});

server.listen(PORT, HOST, () => console.log(`Code Crew ready → http://${HOST === '0.0.0.0' ? '<host>' : HOST}:${PORT}${process.stdout.isTTY ? '/?token=' + TOKEN : '  (token: run `code-crew link`)'}  data: ${DATA_DIR}  auth: ${authMode()}`));
