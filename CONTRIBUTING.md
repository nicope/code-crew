# Contributing

Small project, small rules.

- No build step: `server.js` (Node 20+, ESM), `public/` (vanilla JS, CSS), `bin/code-crew.js` (CLI). Run with
  `node bin/code-crew.js start` and open the printed link.
- Keep it dependency-light. Current deps: the Claude Agent SDK, `ws`, `zod`, `web-push`, `qrcode-terminal`.
- New connectors go in the `CATALOG` array in `server.js`. Prefer an official MCP server that accepts a token;
  otherwise the `rest` kind gives Bots a request tool over the service's API. Include a `test` call so a wrong key
  is caught when connecting.
- Mobile first: check everything at 390px wide. The page never scrolls; only the thread does.
- Write user-facing text in plain words. "Approvals", not "permission modes".
- Before a PR: `node --check server.js public/app.js bin/code-crew.js`, then create a Bot, send a message, trigger an
  approval, run a routine, attach a file.
