// Code Crew configuration: ~/.code-crew/config.json, overridable by environment variables.
// Legacy CLAUDE_CHAT_* names and the ~/.claude-chat folder are still honoured (early installs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const HOME = os.homedir();
const envOr = (...names) => { for (const n of names) if (process.env[n] !== undefined && process.env[n] !== '') return process.env[n]; return undefined; };

export const DATA_DIR = envOr('CODE_CREW_DATA', 'CLAUDE_CHAT_DATA') || path.join(HOME, '.code-crew');
const LEGACY_DATA_DIR = path.join(HOME, '.claude-chat');
// Called by `start` and `setup` only (never by read-only commands): an older install's folder is moved into place once.
export function migrateLegacyData() {
  if (!fs.existsSync(DATA_DIR) && fs.existsSync(LEGACY_DATA_DIR) && !fs.lstatSync(LEGACY_DATA_DIR).isSymbolicLink() && !envOr('CODE_CREW_DATA', 'CLAUDE_CHAT_DATA')) {
    try { fs.renameSync(LEGACY_DATA_DIR, DATA_DIR); console.error(`Moved ${LEGACY_DATA_DIR} → ${DATA_DIR}`); } catch {}
  }
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

export function readConfigFile() { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; } }
export function writeConfigFile(patch) {
  const next = { ...readConfigFile(), ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === null || next[k] === '') delete next[k];
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  return next;
}

const file = readConfigFile();
export const config = {
  port: Number(envOr('CODE_CREW_PORT', 'PORT') || file.port || 4747),
  host: envOr('CODE_CREW_HOST', 'HOST') || file.host || '127.0.0.1',
  token: envOr('CODE_CREW_TOKEN', 'CLAUDE_CHAT_TOKEN') || file.token || '',
  defaultCwd: envOr('CODE_CREW_CWD', 'CLAUDE_CHAT_CWD') || file.defaultCwd || HOME,
  // What new Bots start with. 'acceptEdits' asks before shell commands; 'bypassPermissions' never asks.
  defaultPermission: envOr('CODE_CREW_PERMISSION', 'CLAUDE_CHAT_PERMISSION') || file.defaultPermission || 'acceptEdits',
  defaultModel: envOr('CODE_CREW_MODEL', 'CLAUDE_CHAT_MODEL') ?? file.defaultModel ?? 'opus',
  botsDir: envOr('CODE_CREW_BOTS_DIR', 'CLAUDE_CHAT_BOTS_DIR') || file.botsDir || path.join(HOME, 'Bots'),
  oauthTokenFile: envOr('CODE_CREW_OAUTH_TOKEN_FILE', 'CLAUDE_CHAT_OAUTH_TOKEN_FILE') || file.oauthTokenFile || path.join(DATA_DIR, 'oauth-token'),
  pushSubject: envOr('CODE_CREW_PUSH_SUBJECT', 'CLAUDE_CHAT_PUSH_SUBJECT') || file.pushSubject || 'https://code-crew.invalid',
  // Folders offered when picking where a Bot works; only the ones that exist are shown.
  dirRoots: file.dirRoots || [HOME, ...['Projects', 'Github', 'GitHub', 'Developer', 'code', 'src', 'repos', 'Documents', 'Desktop'].map((d) => path.join(HOME, d))],
  onePasswordToken: envOr('OP_SERVICE_ACCOUNT_TOKEN') || file.onePasswordToken || '',
};
export const isLoopback = (h) => h === '127.0.0.1' || h === 'localhost' || h === '::1';
