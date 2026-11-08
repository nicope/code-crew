# Security

Code Crew gives AI agents real access to the machine it runs on. Read this before exposing it anywhere.

- **The access token is the only lock.** Anyone with the link can create Bots that run commands as your user. Keep the
  server on localhost, on a Tailscale tailnet, or behind an https reverse proxy with its own authentication. Never
  publish it on a plain public port. Repeated wrong tokens from one address are blocked for ten minutes, and the server refuses cross-origin
  requests and WebSocket connections. A token is always required, including on localhost.
- **Approval levels are per Bot.** "Never ask" means exactly that. New Bots default to asking before shell commands;
  you choose at creation and can change it later.
- **Connector keys and vault items** live in `~/.code-crew/connectors.json` and `~/.code-crew/vault.json` with
  mode 600. Connector keys are injected into tools rather than prompts, and vault items are handed over only after
  you approve a request; approved values then become part of that Bot's transcript on disk. Bots run as your user,
  so this gate is enforced by a tool hook that blocks reads of Code Crew's own folder and environment dumps, not by
  the operating system. A Bot on "Never ask" with shell access is trusted by definition; keep secrets you would not
  hand to it out of the vault.
- **Files a Bot shows you** are served only from inside that Bot's own folder.
- **Uploads** land in `<Bot folder>/attachments/` with sanitised names, 50 MB max.
- **Your Claude login** stays in Claude Code's own storage, or in `~/.code-crew/oauth-token` (mode 600) for
  background use. Code Crew never sends it anywhere except to Claude Code.

Report a vulnerability through a private security advisory on the GitHub repository.
