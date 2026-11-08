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
  // Answers are queued as they arrive so piped/scripted input works as well as a terminal.
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  const queue = []; let waiting = null, closed = false;
  rl.on('line', (l) => { if (waiting) { const w = waiting; waiting = null; w(l); } else queue.push(l); });
  rl.on('close', () => { closed = true; if (waiting) { const w = waiting; waiting = null; w(''); } });
  const ask = async (q, def = '') => { process.stdout.write(def ? `${q} [${def}] ` : `${q} `); const a = (queue.length ? queue.shift() : closed ? '' : await new Promise((r) => (waiting = r))).trim(); if (!process.stdin.isTTY) process.stdout.write(a + '\n'); return a || def; };
  const yes = async (q, def = true) => /^y/i.test(await ask(`${q} ${def ? '(Y/n)' : '(y/N)'}`, def ? 'y' : 'n'));
  migrateLegacyData();
  const c = { ...readConfigFile() };
  say('\nCode Crew setup\n');

  // 1. Claude Code, logged in with a subscription (not an API key)
  const claude = which('claude');
  if (!claude) {
    say('• Claude Code is not installed. Install it, then come back:');
    say('    macOS / Linux:  curl -fsSL https://claude.ai/install.sh | bash      (or: npm install -g @anthropic-ai/claude-code)');
    say('    then run `claude` once and choose "Claude account with subscription" when it asks how to log in.');
    if (!(await yes('  Continue setup anyway?', false))) { rl.close(); return; }
  } else {
    say(`• Claude Code found: ${sh(claude, ['--version'])}`);
    let st = null; try { st = JSON.parse(sh(claude, ['auth', 'status', '--json']) || 'null'); } catch {}
    if (!st?.loggedIn) {
      say('  Not logged in yet. Bots need your Claude subscription login (Pro or Max), not an API key.');
      if (await yes('  Log in now? (opens a browser)', true)) { spawnSync(claude, ['auth', 'login'], { stdio: 'inherit' }); try { st = JSON.parse(sh(claude, ['auth', 'status', '--json']) || 'null'); } catch {} }
    }
    if (st?.loggedIn && st.authMethod && st.authMethod !== 'claude.ai') say(`  Warning: Claude Code is logged in via ${st.authMethod}, which bills an API account, not a subscription. Run \`claude auth login\` and pick your Claude account if you meant to use your plan.`);
    else if (st?.loggedIn) say(`  Logged in with a Claude ${st.subscriptionType ? st.subscriptionType.toUpperCase() + ' ' : ''}subscription. Bots will use that plan's usage, not API credits.`);
  }
  if (process.env.ANTHROPIC_API_KEY) say('  Note: ANTHROPIC_API_KEY is set in this shell. Code Crew strips it so Bots never bill the API by accident.');
  say('  One person, one subscription, one install: do not share one Code Crew with other people.');

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
  const ts = which('tailscale') || (fs.existsSync('/Applications/Tailscale.app/Contents/MacOS/Tailscale') ? '/Applications/Tailscale.app/Contents/MacOS/Tailscale' : '');
  let tsIp = ts ? sh(ts, ['ip', '-4']).split('\n')[0] : '';
  if (!ts) {
    say('• Tailscale is not installed. It is the easiest way to reach Code Crew from your phone without opening ports:');
    say('    computer: https://tailscale.com/download   (macOS: brew install --cask tailscale; Linux: curl -fsSL https://tailscale.com/install.sh | sh)');
    say('    phone: the Tailscale app from the App Store / Play Store, signed into the same account.');
    say('  You can finish setup on localhost now and re-run `code-crew setup` later to switch.');
  } else if (!tsIp) { say('• Tailscale is installed but not connected. Run `tailscale up`, then re-run setup to use it.'); }
  else say(`• Tailscale is connected (${tsIp}).`);
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
  // 6. https through Tailscale (needed for phone notifications; also hides the token from plain-http sniffing on the tailnet)
  if (tsIp && !isLoopback(c.host)) {
    say('\n• https: Tailscale can terminate https for you at https://<machine>.<tailnet>.ts.net. Requirements, in the Tailscale admin console under DNS: MagicDNS on and "HTTPS Certificates" enabled.');
    if (await yes('  Set it up now with `tailscale serve`? (tailnet only; undo with `tailscale serve reset`)', true)) {
      const r = spawnSync(ts, ['serve', '--bg', '--https=443', `http://${c.host}:${c.port}`], { stdio: 'inherit' });
      if (r.status === 0) say('  Done. Use the https link printed above on your phone; then Share → Add to Home Screen, open it from there, and tap "Turn on notifications".');
      else say('  tailscale serve did not succeed; the plain http link still works. Common cause: HTTPS Certificates not enabled in the admin console.');
    } else say(`  Later: tailscale serve --bg --https=443 http://${c.host}:${c.port}`);
  }
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
