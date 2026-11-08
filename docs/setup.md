# Setting up Code Crew

Fifteen minutes from nothing to a Bot answering on your phone. Follow the steps in order; each one is checked by
`npm run setup`, so if you skip something the wizard tells you.

## 0. What you need

- A computer that stays on: a Mac mini, a home server, a laptop that doesn't sleep, or a Linux VPS.
- Node.js 20 or newer (`node --version`).
- A Claude **Pro or Max** subscription. Bots use your plan's usage, not API credits.
- Optional but recommended: a free [Tailscale](https://tailscale.com) account, to reach it from your phone.

## 1. Claude Code, logged in with your subscription

Code Crew drives Claude Code, so Claude Code must be installed and logged in on the same machine, as the same user.

```bash
curl -fsSL https://claude.ai/install.sh | bash     # or: npm install -g @anthropic-ai/claude-code
claude                                             # first run asks how to log in
```

When it asks, choose **Claude account with subscription** and finish in the browser. Do not pick the API console
option: that bills per token. Check it took:

```bash
claude auth status --text
```

It should say logged in, `claude.ai`, and your plan (pro or max). If `ANTHROPIC_API_KEY` is set in your shell,
unset it for Code Crew; the server strips it anyway so Bots can never bill the API by accident.

## 2. Install Code Crew

```bash
git clone https://github.com/nicope/code-crew && cd code-crew
npm install
```

## 3. Tailscale (phone access without opening ports)

Skip this if you only want it on the computer itself.

1. Install Tailscale on the computer: macOS `brew install --cask tailscale` or the App Store app; Linux
   `curl -fsSL https://tailscale.com/install.sh | sh`. Then `tailscale up` and sign in.
2. Install the Tailscale app on your phone and sign in to the **same** account. Toggle it on.
3. In the [admin console](https://login.tailscale.com/admin/dns) under DNS, turn on **MagicDNS** and **HTTPS
   Certificates**. This is what lets the wizard give you an `https://` link, which the phone needs for notifications.

## 4. Run setup

```bash
npm run setup
```

The wizard:

- confirms Claude Code is installed and logged in with a subscription, and offers to log you in if not;
- asks for a token from `claude setup-token` if you want it to run in the background (see step 6 for why);
- generates the access token that protects the page;
- detects Tailscale and offers its address; otherwise localhost or all interfaces;
- asks where new Bots' folders go and whether they should ask before running shell commands;
- offers to install the always-on service and to set up https through `tailscale serve`;
- prints the link and a QR code.

Everything it decides is in `~/.code-crew/config.json`; edit it or re-run setup any time. Environment variables
(`CODE_CREW_HOST`, `CODE_CREW_PORT`, `CODE_CREW_TOKEN`, `CODE_CREW_PERMISSION`, `CODE_CREW_MODEL`,
`CODE_CREW_BOTS_DIR`, `CODE_CREW_CWD`, `CODE_CREW_DATA`) override the file.

## 5. On the phone

1. Scan the QR code or open the link. The token in the link is remembered by the browser; the page works from a
   bookmark afterwards. If you ever land on "Access token needed", paste the part after `?token=`.
2. Safari: Share → **Add to Home Screen**. Open Code Crew from that icon; it behaves like an app.
3. In the Bot list footer tap **Turn on notifications**. Needs the https link and the Home Screen app on iPhone.
4. Tap **+**, name your first Bot, give it a job in the first message.

## 6. Running in the background

The wizard installs a **launchd** agent on macOS or a **systemd user unit** on Linux. It starts at login and
restarts itself. Manage it with `node bin/code-crew.js service status|restart|stop|uninstall`.

**macOS caveat.** `claude login` keeps your credentials in the Keychain, and a launchd process cannot read it.
Bots started by the service fail with "OAuth session expired and could not be refreshed". The fix is a long-lived
token from Claude Code itself:

```bash
claude setup-token          # browser login; prints a token starting with sk-ant-oat01-
```

Paste it when the wizard asks, or save it yourself to `~/.code-crew/oauth-token` (mode 600). The server passes it
to Claude Code only. It lasts about a year; when Bots start failing to authenticate, run it again.

**Linux headless.** For the user service to run without a login session: `loginctl enable-linger $USER`.

## 7. VPS or Docker

Run `claude setup-token` on any machine you can log in from, then on the server:

```bash
docker build -t code-crew .
docker run -d --name code-crew -p 127.0.0.1:4747:4747 -v code-crew-data:/data \
  -e CODE_CREW_TOKEN=$(openssl rand -hex 8) -e CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-... code-crew
```

Put Tailscale (`tailscale serve --bg --https=443 http://127.0.0.1:4747`) or an https reverse proxy in front.
Never publish the plain http port: the token is the only lock and it grants command execution on that box.

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Bots reply "Failed to authenticate… OAuth session expired" | Running as a service; Keychain not readable | Step 6: `claude setup-token` into `~/.code-crew/oauth-token` |
| "401 Invalid bearer token" | The oauth-token file holds something that isn't a token | Overwrite it with the exact `sk-ant-oat01-…` string; the server ignores values that don't start with `sk-ant-` |
| "unauthorized" or the Access token screen | Page opened without the token and no saved copy | Open the full link once, or paste the token |
| Bots ask for approval constantly | Allow rules from `~/.claude/settings.json` apply, so add rules there, use "Always allow", or set the Bot to "Never ask" | Bot details → Approvals |
| Service won't start, log shows `EADDRINUSE` | Another copy is already listening | `node bin/code-crew.js service restart`, or `lsof -i :4747` |
| Bots fail to start under the service but work from a terminal | `claude` not on the service's PATH | Re-run `npm run setup` (it records the `claude` location) |
| Phone shows "Notifications need the https link" | Opened over http | Step 3 item 3, then `tailscale serve`, then open the https link |
| Disk fills up | Bots are allowed to build, render and download | Check `~/Bots/*` and the Bots' folders; Bots are not sandboxed on disk |

## 9. Usage and limits

Every Bot turn counts against your Claude plan exactly like a terminal session. Routines running around the clock
add up: start with a couple, watch your usage page for a week. Haiku and Sonnet are cheaper per turn than Opus and
can be set per Bot.
