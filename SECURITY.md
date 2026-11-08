# Security

Code Crew gives AI agents real access to the machine it runs on. Read this before exposing it anywhere.

- **The access token is the only lock.** Anyone with the link can create Bots that run commands as your user. Keep the
  server on localhost, on a Tailscale tailnet, or behind an https reverse proxy with its own authentication. Never
  publish it on a plain public port. Repeated wrong tokens from one address are blocked for ten minutes.
- **Approval levels are per Bot.** "Never ask" means exactly that. New Bots default to asking before shell commands;
  you choose at creation and can change it later.
- **Connector keys and vault items** live in `~/.code-crew/connectors.json` and `~/.code-crew/vault.json` with
  mode 600. Connector keys are injected into tools and never enter a prompt. Vault items are handed to a Bot only
  after you approve the request, and then do become part of that Bot's conversation transcript on disk.
- **Files a Bot shows you** are served only from inside that Bot's own folder.
- **Uploads** land in `<Bot folder>/attachments/` with sanitised names, 50 MB max.
- **Your Claude login** stays in Claude Code's own storage, or in `~/.code-crew/oauth-token` (mode 600) for
  background use. Code Crew never sends it anywhere except to Claude Code.

Report a vulnerability by opening a private security advisory on GitHub or emailing the maintainer listed in
`package.json`.
