#!/usr/bin/env node
// Code Crew command line: start the server, run first-time setup, manage the always-on service.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config, DATA_DIR, CONFIG_FILE, HOME, readConfigFile, writeConfigFile, isLoopback, migrateLegacyData } from '../config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'bin', 'code-crew.js');
const LABEL = 'dev.code-crew.server';
const [, , cmd = 'start', ...rest] = process.argv;
const say = (...a) => console.log(...a);
const sh = (file, args = []) => { try { return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const which = (bin) => sh('/usr/bin/which', [bin]) || sh('which', [bin]);

function link(c = config) { const host = isLoopback(c.host) ? 'localhost' : c.host; return `http://${host}:${c.port}/${c.token ? `?token=${c.token}` : ''}`; }
async function showLink(c = config) {
  say(`\nOpen on this computer or your phone:\n  ${link(c)}\n`);
  try { const qr = (await import('qrcode-terminal')).default; qr.generate(link(c), { small: true }, (q) => say(q)); } catch {}
  const magic = sh(which('tailscale'), ['status', '--json']);
  if (magic) { try { const j = JSON.parse(magic); const name = j.Self?.DNSName?.replace(/\.$/, ''); if (name && !isLoopback(c.host)) say(`Tailscale name: http://${name}:${c.port}/${c.token ? `?token=${c.token}` : ''}`); } catch {} }
}

async function setup() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q, def = '') => { const a = (await rl.question(def ? `${q} [${def}] ` : `${q} `)).trim(); return a || def; };
  const yes = async (q, def = true) => /^y/i.test(await ask(`${q} ${def ? '(Y/n)' : '(y/N)'}`, def ? 'y' : 'n'));
  migrateLegacyData();
  const c = { ...readConfigFile() };
  say('\nCode Crew setup\n');

  // 1. Claude Code
  const claude = which('claude');
  if (!claude) say('• Claude Code CLI not found. Install it first: https://docs.anthropic.com/en/docs/claude-code  (npm i -g @anthropic-ai/claude-code), then run `claude` once and log in with your Claude subscription.');
  else say(`• Claude Code found: ${sh(claude, ['--version'])}`);
  say('  Code Crew runs Bots on your own Claude subscription through Claude Code. One person, one subscription, one install.');

  // 2. Long-lived token for running as a service
  const tokenFile = c.oauthTokenFile || path.join(DATA_DIR, 'oauth-token');
  const hasToken = fs.existsSync(tokenFile) && /^sk-ant-/.test(fs.readFileSync(tokenFile, 'utf8'));
  if (hasToken) say('• Subscription token for background use: present.');
  else if (await yes('• Run Code Crew in the background (recommended, needed on macOS for an always-on service)?')) {
    say('  Run `claude setup-token` in another terminal. It opens a browser, then prints a token starting with sk-ant-oat01-.');
    const t = await ask('  Paste the token here (or leave empty to skip):');
    if (/^sk-ant-/.test(t)) { fs.writeFileSync(tokenFile, t.trim(), { mode: 0o600 }); say(`  Saved to ${tokenFile}`); }
    else if (t) say('  That does not look like a setup token; skipped. You can add it later to ' + tokenFile);
  }

  // 3. Access token and address
  c.token = c.token || randomBytes(8).toString('hex');
  const tsIp = sh(which('tailscale'), ['ip', '-4']).split('\n')[0];
  const choices = ['Only this computer (localhost)', ...(tsIp ? [`Tailscale (${tsIp}) — reach it from your phone`] : []), 'All interfaces (0.0.0.0) — put a reverse proxy with https in front'];
  choices.forEach((x, i) => say(`  ${i + 1}. ${x}`));
  const pick = Number(await ask('• Where should it listen?', tsIp ? '2' : '1'));
  c.host = pick === 1 ? '127.0.0.1' : (tsIp && pick === 2) ? tsIp : '0.0.0.0';
  c.port = Number(await ask('• Port', String(c.port || 4747)));

  // 4. Bots
  c.botsDir = await ask('• Folder for new Bots', c.botsDir || path.join(HOME, 'Bots'));
  c.defaultPermission = (await yes('• Should new Bots ask before running shell commands? (you can change this per Bot)', true)) ? 'acceptEdits' : 'bypassPermissions';
  writeConfigFile(c);
  say(`\nSaved ${CONFIG_FILE}`);

  // 5. Service
  if (process.platform === 'darwin' || process.platform === 'linux') {
    if (await yes('• Install as an always-on service (starts at login, restarts itself)?', true)) await serviceInstall();
    else say(`  Start it any time with: ${path.basename(SCRIPT) === 'code-crew.js' ? 'code-crew start' : 'npm start'}`);
  }
  if (tsIp && !isLoopback(c.host)) say(`\nFor https and phone notifications: tailscale serve --bg --https=443 http://${c.host}:${c.port}`);
  rl.close();
  await showLink({ ...config, ...c });
}

function nodeBin() { return process.execPath; }
async function serviceInstall() {
  const logDir = path.join(HOME, process.platform === 'darwin' ? 'Library/Logs' : '.local/state'); fs.mkdirSync(logDir, { recursive: true });
  const vars = { NODE: nodeBin(), SCRIPT, HOME, PATH: `${path.dirname(nodeBin())}:${path.dirname(which('claude') || '/usr/local/bin/claude')}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin`, LOG: path.join(logDir, 'code-crew.log'), LABEL };
  const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k]);
  if (process.platform === 'darwin') {
    const plist = path.join(HOME, 'Library/LaunchAgents', `${LABEL}.plist`); fs.mkdirSync(path.dirname(plist), { recursive: true });
    fs.writeFileSync(plist, fill(fs.readFileSync(path.join(ROOT, 'templates/launchd.plist'), 'utf8')));
    spawnSync('launchctl', ['bootout', `gui/${os.userInfo().uid}/${LABEL}`], { stdio: 'ignore' });
    const r = spawnSync('launchctl', ['bootstrap', `gui/${os.userInfo().uid}`, plist], { stdio: 'inherit' });
    say(r.status === 0 ? `Service installed (${plist}). Logs: ${vars.LOG}` : 'launchctl could not start the service; see the message above.');
    if (!fs.existsSync(config.oauthTokenFile)) say('Note: on macOS a service cannot read the Keychain login. Add a `claude setup-token` token to ' + config.oauthTokenFile + ' or Bots will fail to authenticate.');
  } else {
    const unit = path.join(HOME, '.config/systemd/user', 'code-crew.service'); fs.mkdirSync(path.dirname(unit), { recursive: true });
    fs.writeFileSync(unit, fill(fs.readFileSync(path.join(ROOT, 'templates/code-crew.service'), 'utf8')));
    spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' });
    const r = spawnSync('systemctl', ['--user', 'enable', '--now', 'code-crew'], { stdio: 'inherit' });
    say(r.status === 0 ? `Service installed (${unit}). Logs: journalctl --user -u code-crew -f` : 'systemctl could not start the service; see the message above. (Headless box? run: loginctl enable-linger $USER)');
  }
}
function serviceCmd(action) {
  if (process.platform === 'darwin') {
    const target = `gui/${os.userInfo().uid}/${LABEL}`;
    const args = { restart: ['kickstart', '-k', target], stop: ['bootout', target], status: ['print', target], uninstall: ['bootout', target] }[action];
    const r = spawnSync('launchctl', args, { encoding: 'utf8' });
    if (action === 'status') say(r.stdout.split('\n').filter((l) => /state|pid|path/.test(l)).join('\n') || r.stderr);
    if (action === 'uninstall') { try { fs.unlinkSync(path.join(HOME, 'Library/LaunchAgents', `${LABEL}.plist`)); } catch {} say('Service removed.'); }
  } else {
    const args = { restart: ['restart', 'code-crew'], stop: ['stop', 'code-crew'], status: ['status', 'code-crew', '--no-pager'], uninstall: ['disable', '--now', 'code-crew'] }[action];
    spawnSync('systemctl', ['--user', ...args], { stdio: 'inherit' });
    if (action === 'uninstall') { try { fs.unlinkSync(path.join(HOME, '.config/systemd/user/code-crew.service')); } catch {} say('Service removed.'); }
  }
}

switch (cmd) {
  case 'start': await import('../server.js'); break;
  case 'setup': await setup(); break;
  case 'link': case 'token': await showLink(); break;
  case 'service': {
    const sub = rest[0] || 'status';
    if (sub === 'install') await serviceInstall(); else if (['restart', 'stop', 'status', 'uninstall'].includes(sub)) serviceCmd(sub); else say('code-crew service install|restart|stop|status|uninstall');
    break;
  }
  default: say(`Code Crew\n\n  code-crew start            run the server (foreground)\n  code-crew setup            first-time setup: Claude login, access token, address, service\n  code-crew link             show the link and a QR code for your phone\n  code-crew service <cmd>    install | restart | stop | status | uninstall\n\nConfig: ${CONFIG_FILE}`);
}
