/* claude-chat v2 — Bots UI. Vanilla JS, no build step. */
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries(['app','botList','connDot','btnNewBot','btnNewBot2','btnBack','botHead','headAvatar','headName','headLabel','headState','btnDetails','scroll','thread','emptyNoBot','emptyNewBot','emptyAvatar','emptyTitle','starters','composerWrap','input','btnSend','btnStop','busyLabel','drawer','btnCloseDrawer','scrim','dAvatar','dShapes','dColors','dName','dLabel','dCwd','dModel','dPerm','dSave','routineCount','routineList','addRoutine','rName','rPrompt','rKind','rTimeWrap','rMinWrap','rTime','rMinutes','rAdd','dMemory','dReset','dDelete','createDialog','createForm','cAvatar','cShapes','cColors','cName','cLabel','cCwd','cCancel','cFolderHint','cAdv','cDirChips','dDirChips','authGate','authInput','authBtn','jump','sideBanner','decisionList','mainBanner','btnNotify','notifyHint','attachList','btnAttach','fileInput','dropOverlay','cPerm','connDialog','connGrid','connForm','connClose','btnConnectors','dConnectors','dManageConn','btnVault','vaultDialog','vaultClose','vaultList','vaultAddForm','opStatus','opToken','opSave','mentionPop','btnMic','recBar','recTime','btnRecCancel','slashPop','btnAccount','acctAvatar','acctAvatar2','accountDialog','acctClose','acctName','acctEmail','acctUsageRow','acctUsageSub','acctUsagePct','acctUsageDetail','docDialog','docTitle','docBody','docClose','docShare','btnThreads','threadCount','threadBar','threadBarText','threadBarClose','btnNewThread','threadPanel','threadFrame','alsoMainWrap','alsoMain','catchup'].map((k) => [k, $(k)]));

marked.setOptions({ gfm: true, breaks: false });
const MEDIA_RE = /(?:^|(?<=[\s(\[`"']))(\/(?:[^\s`"'<>()\[\]]|\\ )+?\.(png|jpe?g|gif|webp|svg|mp4|m4v|mov|webm|mp3|wav|m4a|pdf|md|markdown|txt|csv))(?=$|[\s`"')\]>.,;:!?])/gi;
const fileUrl = (p) => `/api/bots/${state.botId}/file?path=${encodeURIComponent(p)}${state.mediaKey ? `&k=${state.mediaKey}` : token ? `&token=${encodeURIComponent(token)}` : ''}`;
const DOC_EXT = /^(md|markdown|txt|csv)$/;
const DOC_ICON = '<svg width="22" height="26" viewBox="0 0 22 26" fill="none"><path d="M3 1.5h10.5L20.5 8.5V23a1.5 1.5 0 01-1.5 1.5H3A1.5 1.5 0 011.5 23V3A1.5 1.5 0 013 1.5z" stroke="currentColor" stroke-width="1.4"/><path d="M13.5 1.5V7a1.5 1.5 0 001.5 1.5h5.5M6 13h10M6 17h10M6 21h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
// A document the Bot wrote: a card in the chat; tap to read it in a sheet, share it from there.
function docCard(p, caption = '') {
  const name = p.split('/').pop(), ext = name.split('.').pop().toUpperCase();
  return `<a class="doc-card" href="${esc(fileUrl(p))}" data-doc="${esc(p)}"><span class="doc-icon">${DOC_ICON}</span><span class="doc-text"><span class="doc-name">${esc(caption && caption !== name ? caption : name.replace(/\.[^.]+$/, ''))}</span><span class="doc-meta" data-ext="${esc(ext)}">${esc(ext)}</span></span></a>`;
}
function mediaTag(p, caption = '', inline = false) {
  const ext = p.split('.').pop().toLowerCase(), name = p.split('/').pop(), u = fileUrl(p);
  if (inline && /^(png|jpe?g|gif|webp)$/.test(ext)) return `<a class="inline-media" href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="${esc(name)}" loading="lazy"><span>${esc(name)}</span></a>`;
  if (/^(mp4|m4v|mov|webm)$/.test(ext)) return `<figure class="media"><video controls playsinline preload="metadata" src="${esc(u)}#t=0.1"></video><figcaption>${esc(caption || name)}</figcaption></figure>`;
  if (/^(mp3|wav|m4a)$/.test(ext)) return `<figure class="media"><audio controls preload="metadata" src="${esc(u)}"></audio><figcaption>${esc(caption || name)}</figcaption></figure>`;
  if (DOC_EXT.test(ext)) return docCard(p, caption);
  if (ext === 'pdf') return `<a class="file-link" href="${esc(u)}" target="_blank" rel="noopener">📄 ${esc(caption || name)}</a>`;
  return `<figure class="media"><a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="${esc(caption || name)}" loading="lazy"></a><figcaption>${esc(caption || name)}</figcaption></figure>`;
}
// Absolute paths to media inside the Bot's folder become inline players/images. Markdown images with a local path too.
function withMedia(t) {
  if (!state.botId) return t;
  const lines = t.split('\n'); let fence = false;
  return lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return line; }
    if (fence) return line;
    const EXT = 'png|jpe?g|gif|webp|svg|mp4|m4v|mov|webm|mp3|wav|m4a|pdf|md|markdown|txt|csv';
    // markdown image or link with a local path (spaces allowed inside the parentheses)
    line = line.replace(new RegExp(`!?\\[([^\\]]*)\\]\\((\\/[^)]+?\\.(?:${EXT}))\\)`, 'gi'), (_, cap, p) => `\n\n${mediaTag(p.replace(/\\ /g, ' ').replace(/%20/g, ' '), cap)}\n\n`);
    // a whole line that is just a path (spaces allowed)
    const whole = line.trim().match(new RegExp(`^(\\/.+?\\.(?:${EXT}))$`, 'i')); if (whole) return `\n\n${mediaTag(whole[1].replace(/\\ /g, ' '))}\n\n`;
    // Inside a list item or a sentence the media goes inline, so the list stays a list; on its own it becomes a block.
    const inList = /^\s*([-*+]|\d+[.)])\s/.test(line);
    const put = (p) => inList ? mediaTag(p, '', true) : `\n\n${mediaTag(p)}\n\n`;
    // path in backticks (spaces allowed)
    line = line.replace(new RegExp('`(\\/[^`]+?\\.(?:' + EXT + '))`', 'gi'), (_, p) => put(p));
    // bare absolute paths under the usual roots, spaces allowed ("/Users/me/Bots/GF Videos/out/a.jpg")
    line = line.replace(new RegExp(`(^|[\\s:(])(\\/(?:Users|tmp|private|Volumes|opt|var|home)\\/[^\\n\`"'<>()\\[\\]]*?\\.(?:${EXT}))(?=$|[\\s\`"')\\]>,;!?]|\\.(?:\\s|$))`, 'gi'), (_, pre, p) => `${pre}${put(p.replace(/\\ /g, ' '))}`);
    return line.replace(MEDIA_RE, (full, p) => put(p.replace(/\\ /g, ' ')));
  }).join('\n');
}
const PURIFY = { ADD_TAGS: ['video', 'audio', 'source', 'figure', 'figcaption'], ADD_ATTR: ['controls', 'playsinline', 'preload', 'poster', 'loading', 'target', 'data-doc'] };
const renderMd = (t, { media = true } = {}) => enhanceLinks(DOMPurify.sanitize(marked.parse(media ? withMedia(t || '') : (t || '')), PURIFY));
// Links: "#123" and "owner/repo#123" become pull-request links (the Bot's own repo fills in the bare form), and every
// external link gets the site's favicon in front so you can see where it goes before tapping.
const PR_RE = /(^|[\s(\[,;])((?:[\w.-]+\/[\w.-]+)?#(\d{1,7}))(?=$|[\s)\].,;:!?])/g;
function enhanceLinks(html) {
  const box = document.createElement('template'); box.innerHTML = html;
  const repo = currentBot()?.repo;
  const walker = document.createTreeWalker(box.content, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.parentElement?.closest('a, code, pre, .media') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const texts = []; while (walker.nextNode()) texts.push(walker.currentNode);
  for (const node of texts) {
    if (!PR_RE.test(node.nodeValue)) continue; PR_RE.lastIndex = 0;
    const frag = document.createDocumentFragment(); let last = 0, m;
    while ((m = PR_RE.exec(node.nodeValue))) {
      const [full, pre, ref, num] = m; const r = ref.includes('/') ? ref.slice(0, ref.indexOf('#')) : repo; if (!r) continue;
      frag.appendChild(document.createTextNode(node.nodeValue.slice(last, m.index) + pre));
      const a = document.createElement('a'); a.href = `https://github.com/${r}/pull/${num}`; a.textContent = ref; a.title = `${r} pull request #${num}`; frag.appendChild(a);
      last = m.index + full.length;
    }
    frag.appendChild(document.createTextNode(node.nodeValue.slice(last))); node.replaceWith(frag);
  }
  for (const pre of box.content.querySelectorAll('pre')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'copy-btn'; b.setAttribute('aria-label', 'Copy'); b.innerHTML = COPY_ICON; pre.appendChild(b); }
  for (const c of box.content.querySelectorAll('code')) if (!c.closest('pre, a')) { c.classList.add('tap-copy'); c.title = 'Tap to copy'; }
  for (const a of box.content.querySelectorAll('a[href^="http"]')) {
    let host; try { host = new URL(a.href).host; } catch { continue; }
    if (host === location.host || a.querySelector('img, video, figure')) continue;
    a.target = '_blank'; a.rel = 'noopener'; a.classList.add('ext');
    const ico = document.createElement('img'); ico.className = 'favicon'; ico.alt = ''; ico.loading = 'lazy'; ico.src = `https://${host}/favicon.ico`; ico.onerror = () => ico.replaceWith(Object.assign(document.createElement('span'), { className: 'favicon glyph', textContent: '↗' }));
    a.prepend(ico);
  }
  return box.innerHTML;
}
const COPY_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="8.5" y="8.5" width="12" height="12" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 8.5V6a2.5 2.5 0 00-2.5-2.5H6A2.5 2.5 0 003.5 6v7A2.5 2.5 0 006 15.5h2.5" stroke="currentColor" stroke-width="1.8"/></svg>';
const CHECK_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDur = (ms) => ms < 1000 ? `${Math.round(ms)}ms` : ms < 60000 ? `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
const fmtAgo = (ts) => { if (!ts) return ''; const d = Date.now() - ts; if (d < 60e3) return 'now'; if (d < 3600e3) return `${Math.floor(d / 60e3)}m`; if (d < 86400e3) return `${Math.floor(d / 3600e3)}h`; return `${Math.floor(d / 86400e3)}d`; };
// Access token: taken from ?token= once, then kept in this browser so reloads, bookmarks and home-screen apps keep working.
const urlToken = new URLSearchParams(location.search).get('token');
if (urlToken) { try { localStorage.setItem('cc_token', urlToken); } catch {} const u = new URL(location.href); u.searchParams.delete('token'); history.replaceState(null, '', u); }
let token = urlToken || (() => { try { return localStorage.getItem('cc_token') || ''; } catch { return ''; } })();
const api = async (path, opts = {}) => { const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { 'x-cc-token': token } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined }); if (r.status === 401) { showAuthGate(); throw new Error('unauthorized'); } const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText); return j; };
function showAuthGate() { els.authGate.classList.remove('hidden'); els.authInput.focus(); }
const shortPath = (p) => (state.home && p.startsWith(state.home)) ? '~' + p.slice(state.home.length) : p;
function renderChips(container, input) { container.innerHTML = state.dirs.map((d) => `<button type="button" class="chip" data-dir="${esc(d)}">${esc(shortPath(d))}</button>`).join(''); container.onclick = (e) => { const b = e.target.closest('.chip'); if (b) input.value = b.dataset.dir; }; }
async function loadDirs() { const d = await api('/api/dirs'); state.dirs = d.dirs; state.defaultDir = d.default; state.botsDir = d.botsDir; state.home = d.home; state.defaultPermission = d.defaultPermission || 'acceptEdits'; }

// ---- avatars ----
const SHAPES = {
  circle: '<circle cx="50" cy="50" r="42"/>',
  square: '<rect x="10" y="10" width="80" height="80" rx="20"/>',
  triangle: '<path d="M50 8 L94 86 L6 86 Z" stroke-linejoin="round"/>',
  diamond: '<path d="M50 6 L94 50 L50 94 L6 50 Z" stroke-linejoin="round"/>',
  hexagon: '<path d="M50 6 L88 28 L88 72 L50 94 L12 72 L12 28 Z"/>',
  blob: '<path d="M50 8c22 0 42 14 42 38s-12 46-40 46S8 74 8 48 28 8 50 8z"/>',
};
const COLORS = ['#6fb3ff', '#7fd49a', '#f0b64a', '#ff8a7a', '#c58cff', '#5ad0d0', '#f2a1c6', '#b9c2cc'];
const avatarSvg = (shape, color, initial = '') => `<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="${esc(color)}">${SHAPES[shape] || SHAPES.circle}</g>${initial ? `<text x="50" y="50" dy=".36em" text-anchor="middle" font-size="42" font-weight="600" font-family="-apple-system,Helvetica,Arial" fill="rgba(0,0,0,.72)">${esc(initial[0].toUpperCase())}</text>` : ''}</svg>`;
const setAvatar = (el, bot) => { el.innerHTML = avatarSvg(bot.shape, bot.color, bot.name); };

// ---- state ----
const state = { ws: null, reconnectTimer: null, lastMsgAt: 0, bots: [], botId: null, busy: false, turn: null, toolsById: new Map(), replaying: false, decisions: [], reactions: {}, threads: [], pendingThread: null, dirs: [], defaultDir: '' };
const threadById = (id) => state.threads.find((t) => t.id === id);
// A thread is shown as its Bot (same avatar), titled with the thread's auto title and TL;DR.
function threadView(t) { const p = t && state.bots.find((b) => b.id === t.threadOf); return p && { ...p, id: t.id, isThread: true, threadOf: p.id, parentName: p.name, name: t.title || 'New thread', label: t.tldr || `Thread with ${p.name}`, busy: t.busy, pendingApprovals: t.pendingApprovals, thread: t }; }
const currentBot = () => state.bots.find((b) => b.id === state.botId) || threadView(threadById(state.botId));

// ---- websocket ----
function connect() {
  clearTimeout(state.reconnectTimer); state.reconnectTimer = null;
  if (state.ws && state.ws.readyState <= 1) { try { state.ws.onclose = null; state.ws.close(); } catch {} }
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`);
  state.ws = ws;
  ws.onopen = () => { els.connDot.className = 'status-dot on'; els.connDot.title = 'Connected'; state.lastMsgAt = Date.now(); if (state.botId) wsSend({ type: 'subscribe', botId: state.botId }); };
  ws.onclose = (e) => {
    if (state.ws !== ws) return;
    els.connDot.className = 'status-dot off';
    if (e && e.code === 4001) { els.connDot.title = 'Not signed in'; showAuthGate(); return; } // the server refused our credentials: ask, don't retry every 1.5 s
    els.connDot.title = 'Reconnecting…'; clearTimeout(state.reconnectTimer); state.reconnectTimer = setTimeout(connect, 1500);
  };
  ws.onmessage = (e) => { state.lastMsgAt = Date.now(); handle(JSON.parse(e.data)); };
}
// Phones suspend a background app and often leave its socket half-open: no close event, so no reconnect, and a tapped
// Bot shows an empty conversation. When the app comes back, prove the link is alive or replace it.
function checkLink() {
  if (document.visibilityState === 'hidden') return;
  const ws = state.ws;
  if (!ws) return;                                          // first connection is made by the startup code
  if (ws.readyState > 1) return connect();                 // closed, or closing: reconnect now rather than after the timer
  if (ws.readyState === 0 || !state.botId || Date.now() - state.lastMsgAt < 15000) return;
  const seen = state.lastMsgAt;
  wsSend({ type: 'subscribe', botId: state.botId });        // the server answers with history; also catches up on what was missed
  setTimeout(() => { if (state.ws === ws && state.lastMsgAt === seen) { try { ws.close(); } catch {} ws.onclose?.(); } }, 5000);
}
document.addEventListener('visibilitychange', checkLink);
window.addEventListener('pageshow', checkLink); window.addEventListener('focus', checkLink); window.addEventListener('online', checkLink);
const wsSend = (o) => state.ws?.readyState === 1 && state.ws.send(JSON.stringify(o));

function handle(m) {
  if (m.type === 'bots') { const before = pendingTotal(); state.bots = m.bots; state.decisions = m.decisions || []; state.threads = m.threads || state.threads; renderBots(); renderDecisions(); updateHead(); paintThreadChips(); if (currentBot()?.isThread) paintThreadRoot(); if (pendingTotal() > before) alertUser(); return; }
  if (m.type === 'bot_deleted') { if (m.botId === state.botId) showNoBot(); return; }
  if (m.botId && m.botId !== state.botId) return; // another bot's stream
  switch (m.type) {
    case 'history': {
      state.reactions = m.reactions || {}; state.readKey = m.readKey || null;
      resetThread();
      replayHistory(m.messages || []);
      for (const msg of m.live || []) onSdk(msg);
      for (const req of m.pending || []) showPermission(req);
      setBusy(!!m.busy);
      paintThreadRoot(); paintThreadChips();
      if (!(m.messages || []).length && !(m.live || []).length) showNewBotIntro();
      openAtNew();
      break;
    }
    case 'sdk': onSdk(m.msg); break;
    case 'permission_request': showPermission(m); break;
    case 'reactions': state.reactions[m.key] = m.list; document.querySelectorAll(`.reactions[data-key="${CSS.escape(m.key)}"]`).forEach((r) => paintReactions(r, m.key)); break;
    case 'permission_resolved': { const c = document.querySelector(`.perm[data-id="${m.id}"]`); if (c && !c.classList.contains('answered')) { c.classList.add('answered'); c.querySelector('.perm-title').textContent += m.behavior === 'allow' ? ' — allowed' : ' — not approved'; } break; }
    case 'error': ensureTurn(); addError(m.error); break;
    case 'user_message': if (!state.replaying) { finishTurn(); addUserBubble(m.text); scrollBottom(); } break;
    case 'thread_created': if (state.awaitThread && m.nonce === state.awaitThread) { state.awaitThread = null; openBot(m.id); } break;
  }
}

// ---- SDK message rendering ----
function onSdk(msg) {
  if (msg.parent_tool_use_id) return onSubagent(msg);
  switch (msg.type) {
    case 'system': if (msg.subtype === 'init' && msg.model) els.busyLabel.dataset.model = msg.model.replace(/^claude-/, ''); break;
    case 'stream_event': onStream(msg.event); break;
    case 'assistant': onAssistant(msg.message); if (state.turn && msg.uuid) state.turn.uuid = msg.uuid; break;
    case 'user': onUserMsg(msg); break;
    case 'result': onResult(msg); break;
    case 'tool_progress': { const rec = state.toolsById.get(msg.tool_use_id); if (rec?.time) rec.time.textContent = fmtDur(msg.elapsed_time_seconds * 1000); break; }
  }
}

function hideEmpties() { els.emptyNoBot.classList.add('hidden'); els.emptyNewBot.classList.add('hidden'); }

function ensureTurn() {
  if (state.turn) return state.turn;
  hideEmpties();
  const el = document.createElement('div'); el.className = 'msg turn';
  const activity = document.createElement('div'); activity.className = 'activity live';
  activity.innerHTML = `<button class="activity-summary"><span class="pulse"></span><span class="sum-text">Working…</span><svg class="chev" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button><div class="steps"></div>`;
  activity.querySelector('.activity-summary').onclick = () => activity.classList.toggle('open');
  el.appendChild(activity); els.thread.appendChild(el);
  state.turn = { el, activity, steps: activity.querySelector('.steps'), sumText: activity.querySelector('.sum-text'), started: Date.now(), stepCount: 0, textEl: null, textBuf: '', thinkingStep: null, thinkingBuf: '', blockTypes: {} };
  scrollBottom(); return state.turn;
}
function finishTurn(result) {
  const t = state.turn; if (!t) return;
  t.textEl?.classList.remove('cursor');
  t.activity.classList.remove('live'); t.activity.querySelector('.pulse')?.remove();
  if (t.stepCount === 0 && !t.steps.children.length) t.activity.remove();
  else { const steps = `${t.stepCount} step${t.stepCount === 1 ? '' : 's'}`; const dur = result ? fmtDur(result.duration_ms) : state.replaying ? null : fmtDur(Date.now() - t.started); t.sumText.textContent = dur ? `Worked for ${dur} · ${steps}` : steps; }
  for (const s of t.steps.querySelectorAll('.step.running')) s.classList.remove('running');
  if (t.uuid) t.el.dataset.key = t.uuid;
  if (!state.replaying) setTimeout(noteSeen, 300);
  if (t.textEl?.dataset.raw && !t.el.querySelector(':scope > .msg-actions')) addMsgActions(t.el, { raw: t.textEl.dataset.raw, key: t.uuid, md: t.textEl });
  state.turn = null;
}
function addStep(t, { cls = '', verb, arg = '', body = '' }) {
  const step = document.createElement('div'); step.className = `step ${cls}`;
  step.innerHTML = `<button class="step-head"><span class="step-verb">${esc(verb)}</span><span class="step-arg" title="${esc(arg)}">${esc(arg)}</span><span class="step-time"></span></button><div class="step-body">${body}</div>`;
  step.querySelector('.step-head').onclick = () => step.classList.toggle('open');
  if (verb === 'Messaged') { const target = state.bots.find((b) => b.name.toLowerCase() === String(arg).toLowerCase()); if (target) { step.querySelector('.step-head').dataset.bot = target.id; step.querySelector('.step-head').title = `Open ${target.name}'s conversation`; } }
  t.steps.appendChild(step); if (t.textEl) t.el.appendChild(t.textEl);
  if (t.activity.classList.contains('live') && cls !== 'note') { t.sumText.innerHTML = `Working… <span class="sum-now">${esc(verb)} ${esc(arg)}</span>`; }
  scrollBottom(); return step;
}
function describeTool(name, input = {}) {
  const short = (p) => (p || '').replace(/^\/Users\/[^/]+\//, '~/');
  switch (name) {
    case 'Read': return ['Read', short(input.file_path)];
    case 'Write': return ['Wrote', short(input.file_path)];
    case 'Edit': case 'MultiEdit': return ['Edited', short(input.file_path)];
    case 'Bash': return ['Ran', input.description || input.command || ''];
    case 'Glob': return ['Found files', input.pattern || ''];
    case 'Grep': return ['Searched', input.pattern || ''];
    case 'WebSearch': return ['Searched the web', input.query || ''];
    case 'WebFetch': return ['Fetched', input.url || ''];
    case 'Agent': case 'Task': return ['Delegated', input.description || input.subagent_type || ''];
    case 'TodoWrite': return ['Updated plan', `${(input.todos || []).length} items`];
    case 'Skill': return ['Used skill', input.skill || ''];
    case 'mcp__bots__message_bot': return ['Messaged', input.to || input.bot || ''];
    case 'mcp__vault__vault_list': return ['Checked', 'the vault'];
    case 'mcp__vault__vault_get': return ['Used login', input.name || ''];
    case 'mcp__vault__vault_request': return ['Asked for', input.name || ''];
    case 'mcp__bots__list_bots': return ['Checked Bots', ''];
    default: return [name.replace(/^mcp__/, '').replace(/__/g, ' › '), Object.values(input).find((v) => typeof v === 'string') || ''];
  }
}
function toolBody(name, input) {
  let main;
  if (name === 'Bash' && input.command) main = `<pre class="plain">${esc(input.command)}</pre>`;
  else if (name === 'Edit' && input.old_string !== undefined) main = `<div class="lbl">replace</div><pre class="plain">${esc(input.old_string)}</pre><div class="lbl">with</div><pre class="plain">${esc(input.new_string)}</pre>`;
  else if (name === 'Write' && input.content) main = `<pre class="plain">${esc(input.content.slice(0, 4000))}${input.content.length > 4000 ? '\n…' : ''}</pre>`;
  else if (name === 'TodoWrite' && input.todos) main = `<ul>${input.todos.map((t) => `<li>${t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '▸' : '○'} ${esc(t.content)}</li>`).join('')}</ul>`;
  else if (name === 'mcp__bots__message_bot') main = `<pre class="plain">${esc(input.message || '')}</pre>`;
  else if (name === 'Agent' || name === 'Task') main = `<pre class="plain">${esc(input.prompt || '')}</pre>`;
  else main = `<pre class="plain">${esc(JSON.stringify(input, null, 2))}</pre>`;
  return main + `<div class="lbl">result</div><pre class="plain result">…</pre>`;
}
function onStream(ev) {
  const t = ensureTurn();
  if (ev.type === 'content_block_start') {
    t.blockTypes[ev.index] = ev.content_block.type;
    if (ev.content_block.type === 'text') { if (!t.textEl) { t.textEl = document.createElement('div'); t.textEl.className = 'md cursor'; t.el.appendChild(t.textEl); t.textBuf = ''; } else { t.textBuf = t.textEl.dataset.raw || ''; if (t.textBuf) t.textBuf += '\n\n'; } }
    else if (ev.content_block.type === 'thinking') { t.thinkingStep = addStep(t, { cls: 'thinking running', verb: 'Thinking', arg: '' }); t.thinkingBuf = ''; }
  } else if (ev.type === 'content_block_delta') {
    if (ev.delta.type === 'text_delta' && t.textEl) { t.textBuf += ev.delta.text; t.textEl.dataset.raw = t.textBuf; t.textEl.innerHTML = renderMd(t.textBuf, { media: false }); scrollBottom(); }
    else if (ev.delta.type === 'thinking_delta' && t.thinkingStep) { t.thinkingBuf += ev.delta.thinking; t.thinkingStep.querySelector('.step-body').textContent = t.thinkingBuf; t.thinkingStep.querySelector('.step-arg').textContent = t.thinkingBuf.trim().split('\n')[0].slice(0, 90); }
  } else if (ev.type === 'content_block_stop') {
    if (t.blockTypes[ev.index] === 'thinking' && t.thinkingStep) { t.thinkingStep.classList.remove('running'); if (!t.thinkingBuf) t.thinkingStep.remove(); t.thinkingStep = null; }
  }
}
function onAssistant(message) {
  const t = ensureTurn();
  for (const block of message.content || []) {
    if (block.type === 'tool_use' && block.name === 'mcp__bots__decision_card') {
      if (state.toolsById.has(block.id)) continue;
      const el = decisionCard({ ...block.input, botId: state.botId, status: 'posting' });
      t.el.appendChild(el); if (t.textEl) t.el.appendChild(t.textEl);
      state.toolsById.set(block.id, { decisionEl: el, input: block.input }); scrollBottom();
    } else if (block.type === 'tool_use') {
      const [verb, arg] = describeTool(block.name, block.input);
      const step = addStep(t, { cls: 'running', verb, arg, body: toolBody(block.name, block.input) });
      t.stepCount++;
      state.toolsById.set(block.id, { step, time: step.querySelector('.step-time'), name: block.name, started: Date.now(), subs: null });
      t.sumText.textContent = `${verb}${arg ? ' ' + arg.split('/').pop().slice(0, 40) : ''}…`;
    } else if (block.type === 'text' && block.text) {
      if (!t.textEl) { t.textEl = document.createElement('div'); t.textEl.className = 'md'; t.el.appendChild(t.textEl); }
      const raw = t.textEl.dataset.raw || '';
      if (!raw.endsWith(block.text)) { const merged = raw ? raw + '\n\n' + block.text : block.text; t.textEl.dataset.raw = merged; t.textEl.innerHTML = renderMd(merged); }
      t.textEl.querySelectorAll('pre code').forEach((c) => hljs.highlightElement(c));
    } else if (block.type === 'thinking' && block.thinking && state.replaying) {
      const st = addStep(t, { cls: 'thinking', verb: 'Thinking', arg: block.thinking.trim().split('\n')[0].slice(0, 90) }); st.querySelector('.step-body').textContent = block.thinking;
    }
  }
  if (message.stop_reason === 'tool_use' && t.textEl) {
    t.textEl.classList.remove('cursor');
    const note = document.createElement('div'); note.className = 'step note'; note.innerHTML = `<div class="step-body">${t.textEl.innerHTML}</div>`;
    const lastTool = [...t.steps.children].reverse().find((c) => !c.classList.contains('note') && !c.classList.contains('thinking'));
    t.steps.insertBefore(note, lastTool || null);
    t.textEl.remove(); t.textEl = null; t.textBuf = '';
  }
}
function onUserMsg(msg) {
  const content = msg.message?.content; if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block.type !== 'tool_result') continue;
    const rec = state.toolsById.get(block.tool_use_id); if (!rec) continue;
    if (rec.decisionEl) { const txt = JSON.stringify(block.content || ''); const id = (txt.match(/\[decision:([\w-]+)\]/) || [])[1]; if (id) { rec.decisionEl.dataset.id = id; refreshDecisionEl(rec.decisionEl); } else rec.decisionEl.classList.add('failed'); continue; }
    rec.step.classList.remove('running'); if (block.is_error) rec.step.classList.add('error');
    if (!state.replaying) rec.time.textContent = fmtDur(Date.now() - rec.started); // replayed history has no real timing
    const txt = typeof block.content === 'string' ? block.content : (block.content || []).map((c) => c.type === 'text' ? c.text : `[${c.type}]`).join('\n');
    const pre = rec.step.querySelector('pre.result'); if (pre) pre.textContent = txt.length > 6000 ? txt.slice(0, 6000) + '\n… (truncated)' : txt || '(no output)';
  }
}
function onSubagent(msg) {
  const rec = state.toolsById.get(msg.parent_tool_use_id); if (!rec) return;
  if (!rec.subs) { rec.subs = document.createElement('div'); rec.subs.className = 'substeps'; rec.step.querySelector('.step-head').after(rec.subs); }
  if (msg.type === 'assistant') for (const b of msg.message.content || []) if (b.type === 'tool_use') { const [v, a] = describeTool(b.name, b.input); const line = document.createElement('div'); line.textContent = `↳ ${v} ${a}`.slice(0, 120); rec.subs.appendChild(line); }
}
function onResult(res) {
  const t = ensureTurn();
  if (res.is_error && res.result) addError(res.result);
  const foot = document.createElement('div'); foot.className = 'turn-foot';
  const parts = [fmtDur(res.duration_ms)]; // no cost shown: this runs on a subscription, the SDK figure is only an API-equivalent estimate
  foot.innerHTML = parts.map((p) => `<span>${esc(p)}</span>`).join(''); t.el.appendChild(foot);
  finishTurn(res); setBusy(false); scrollBottom();
}
function addError(text) { const t = ensureTurn(); const box = document.createElement('div'); box.className = 'error-box'; box.textContent = text; t.el.appendChild(box); }

function showPermission(req) {
  if (document.querySelector(`.perm[data-id="${req.id}"]`)) return;
  const t = ensureTurn();
  if (req.toolName === 'vault' || req.toolName === 'vault_request') {
    const card = document.createElement('div'); card.className = 'perm vault'; card.dataset.id = req.id; const who = esc(currentBot()?.name || 'The Bot');
    card.innerHTML = req.toolName === 'vault'
      ? `<div class="perm-title">🔑 ${who} wants to use your <b>${esc(req.input.name)}</b> login</div><p class="reason">${esc(req.input.reason || '')}</p><div class="perm-actions"><button class="pill primary" data-a="once">Allow once</button><button class="pill" data-a="always">Always for this Bot</button><button class="pill" data-a="deny">Don't</button></div>`
      : `<div class="perm-title">🔑 ${who} needs a credential: <b>${esc(req.input.name)}</b></div><p class="reason">${esc(req.input.why || '')}</p><input type="password" placeholder="Paste it here; it is saved to your vault" autocomplete="off"><div class="perm-actions"><button class="pill primary" data-a="once">Save and allow</button><button class="pill" data-a="deny">Don't</button></div>`;
    card.querySelector('.perm-actions').onclick = (e) => { const a = e.target.dataset.a; if (!a) return; const value = card.querySelector('input')?.value; if (a !== 'deny' && req.toolName === 'vault_request' && !value) return; wsSend({ type: 'permission', botId: state.botId, id: req.id, allow: a !== 'deny', always: a === 'always', value }); card.classList.add('answered'); card.querySelector('.perm-title').textContent += a === 'deny' ? ' — not approved' : a === 'always' ? ' — always allowed' : ' — approved'; };
    t.el.appendChild(card); if (t.textEl) t.el.appendChild(t.textEl); scrollBottom(); return;
  }
  const [verb, arg] = describeTool(req.toolName, req.input);
  const card = document.createElement('div'); card.className = 'perm'; card.dataset.id = req.id;
  const detail = req.toolName === 'Bash' ? req.input.command : JSON.stringify(req.input, null, 2);
  card.innerHTML = `<div class="perm-title">${esc(currentBot()?.name || 'The Bot')} wants to ${esc(verb.toLowerCase().replace(/ed$|ran/, (m) => ({ ed: 'e', ran: 'run' }[m] || m)))} ${esc(arg)}</div><pre class="plain">${esc(detail || '')}</pre>
    <div class="perm-actions"><button class="pill primary" data-a="once">Allow</button>${req.suggestions?.length ? '<button class="pill" data-a="always">Always allow</button>' : ''}<button class="pill" data-a="deny">Don't</button></div>`;
  card.querySelector('.perm-actions').onclick = (e) => { const a = e.target.dataset.a; if (!a) return; wsSend({ type: 'permission', botId: state.botId, id: req.id, allow: a !== 'deny', always: a === 'always' }); card.classList.add('answered'); card.querySelector('.perm-title').textContent += a === 'deny' ? ' — not approved' : ' — allowed'; };
  t.el.appendChild(card); if (t.textEl) t.el.appendChild(t.textEl); scrollBottom();
}

// ---- user-side rendering ----
function addUserBubble(text) {
  hideEmpties();
  let m;
  if ((m = text.match(/^\[Decision\] ([^\n]*)\n→ ([^\n]*)(?:\nNote: ([\s\S]*))?$/))) {
    const el = document.createElement('div'); el.className = 'msg system-note'; el.innerHTML = `<span class="chip">✓ You decided <b>${esc(m[2])}</b>${m[3] ? ` · “${esc(m[3].slice(0, 80))}”` : ''}</span>`; el.title = m[1]; els.thread.appendChild(el); return;
  }
  if ((m = text.match(/^\[Routine: ([^\]]+)\]( \(run now\))?\n?([\s\S]*)$/))) {
    const el = document.createElement('div'); el.className = 'msg system-note'; el.innerHTML = `<span class="chip">Routine <b>${esc(m[1])}</b> ran${m[2] ? ' (manual)' : ''}</span>`; els.thread.appendChild(el); return;
  }
  // Harness notices that arrive as user-role messages (a background sub-agent finished, a system reminder): compact, not a bubble of yours.
  if (/^\s*<task-notification>/.test(text)) {
    const pick = (tag) => (text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1]?.trim() || '';
    const summary = pick('summary').replace(/^Agent\s+/, 'Agent ') || 'Background agent finished', result = pick('result');
    const el = document.createElement('div'); el.className = 'msg system-note';
    el.innerHTML = `<details class="chip-details"><summary class="chip">⟲ <b>${esc(summary)}</b>${result ? ' <span class="muted">details</span>' : ''}</summary>${result ? `<div class="note-body md">${renderMd(result)}</div>` : ''}</details>`;
    els.thread.appendChild(el); return;
  }
  if (/^\s*<(system-reminder|local-command|command-name|bash-input|bash-stdout)/.test(text)) return;
  if ((m = text.match(/^\[Message from Bot "([^"]+)"\]\n?([\s\S]*)$/))) {
    const from = state.bots.find((b) => b.name.toLowerCase() === m[1].toLowerCase());
    const el = document.createElement('div'); el.className = 'msg from-bot'; el.innerHTML = `<div class="card" ${from ? `data-bot="${from.id}" title="Open ${esc(from.name)}'s conversation"` : ''}><div class="from"><span class="avatar sm"></span>From ${esc(m[1])}${from ? ' <span class="muted">· open conversation ›</span>' : ''}</div><div class="body">${mentionChips(esc(m[2]))}</div></div>`;
    if (from) setAvatar(el.querySelector('.avatar'), from); else el.querySelector('.avatar').remove();
    els.thread.appendChild(el); return;
  }
  text = text.replace(/\n*\[thread:[0-9a-f-]+(?: — replying to: "[\s\S]*")?\]\s*$/, '');
  let fromChat = null, fromThread = null;
  if ((m = text.match(/^\[From your thread "([^"]*)"\]\n([\s\S]*)$/))) { fromThread = m[1]; text = m[2]; }
  if ((m = text.match(/^\[Mentioned by the user in Bot "([^"]+)"'s conversation\]\n?([\s\S]*)$/))) { fromChat = m[1]; text = m[2]; }
  let files = [];
  if ((m = text.match(/^([\s\S]*?)\n*\[Attached files\]\n([\s\S]*)$/))) { text = m[1].trim(); files = m[2].split('\n').map((l) => l.replace(/^- /, '').trim()).filter(Boolean); }
  const u = document.createElement('div'); u.className = 'msg user';
  const rawText = text; let quote = '';
  if ((m = text.match(/^((?:> ?[^\n]*\n?)+)\n*([\s\S]*)$/))) { quote = m[1].replace(/^> ?/gm, '').trim(); text = m[2]; }
  const isMedia = (f) => /\.(png|jpe?g|gif|webp|mp4|m4v|mov|webm|m4a|mp3|wav)$/i.test(f);
  u.innerHTML = `${fromThread ? `<div class="muted small" style="text-align:right;margin-bottom:2px">↳ from thread “${esc(fromThread)}”</div>` : ''}${fromChat ? `<div class="muted small" style="text-align:right;margin-bottom:2px">You, in ${esc(fromChat)}'s chat</div>` : ''}<div class="bubble">${quote ? `<div class="quote">${esc(quote)}</div>` : ''}${mentionChips(esc(text))}${files.map((f) => isMedia(f) ? `<div class="thumb">${mediaTag(f)}</div>` : `<span class="attach" title="${esc(f)}"><span class="name">${esc(f.split('/').pop())}</span></span>`).join('')}</div>`;
  addMsgActions(u, { raw: rawText, user: true });
  u.querySelector('.bubble').addEventListener('click', (e) => { if (e.target.closest('a, video, img, .attach') || String(getSelection()).trim()) return; const open = threadFor(u.dataset.key); if (open && !currentBot()?.isThread) openBot(open.id); else u.classList.toggle('show-actions'); });
  els.thread.appendChild(u);
}
function replayHistory(messages) {
  state.replaying = true;
  for (const m of messages) {
    if (m.parent_tool_use_id) { onSubagent(m); continue; }
    const content = m.message?.content;
    if (m.type === 'user') {
      if (typeof content === 'string' || (Array.isArray(content) && content.some((b) => b.type === 'text'))) {
        const text = typeof content === 'string' ? content : content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
        if (/^<(local-command|command-name|system-reminder|bash-input)/.test(text.trim())) continue;
        finishTurn(); addUserBubble(text); const last = els.thread.lastElementChild; if (m.uuid && last?.classList.contains('user')) last.dataset.key = m.uuid;
      }
      if (Array.isArray(content)) onUserMsg(m);
    } else if (m.type === 'assistant') { onAssistant(m.message); if (state.turn && m.uuid) state.turn.uuid = m.uuid; }
  }
  finishTurn(); state.replaying = false;
}
function resetThread() { finishTurn(); els.thread.querySelectorAll('.msg').forEach((n) => n.remove()); state.toolsById.clear(); hideEmpties(); }

function send(text) {
  text = (text ?? els.input.value).trim();
  if (state.attachments.some((a) => a.uploading)) return; // wait for uploads
  const files = state.attachments.map((a) => a.path);
  const heard = state.attachments.filter((a) => a.transcript && !text.includes(a.transcript)).map((a) => `[Transcript of ${a.name}]\n${a.transcript}`);
  if (heard.length) text = [text, ...heard].filter(Boolean).join('\n\n');
  if ((!text && !files.length) || !state.botId) return;
  if (state.pendingThread && !currentBot()?.isThread) {
    const pt = state.pendingThread, nonce = Math.random().toString(36).slice(2);
    state.awaitThread = nonce; state.pendingThread = null; renderThreadBar();
    wsSend({ type: 'thread_start', botId: state.botId, text: `${text}${files.length ? `\n\n[Attached files]\n${files.map((f) => `- ${f}`).join('\n')}` : ''}`.trim(), rootKey: pt.rootKey, rootText: pt.rootText, nonce });
    els.input.value = ''; autosize(); state.attachments = []; renderAttachments(); return;
  }
  const cb = currentBot();
  if (cb?.isThread && els.alsoMain.checked && text) { wsSend({ type: 'send', botId: cb.threadOf, text: `[From your thread "${cb.name}"]\n${text}` }); els.alsoMain.checked = false; }
  state.anchor = null; state.stick = true; els.catchup.classList.add('hidden');
  hideEmpties(); finishTurn(); addUserBubble(`${text}${files.length ? `\n\n[Attached files]\n${files.map((f) => `- ${f}`).join('\n')}` : ''}`.trim());
  els.input.value = ''; autosize(); saveDraft(); setBusy(true); state.attachments = []; renderAttachments();
  wsSend({ type: 'send', botId: state.botId, text, attachments: files }); ensureTurn();
}
// ---- attachments: picked, dropped or pasted; uploaded into the Bot's folder before sending
state.attachments = [];
const fmtSize = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
function renderAttachments() {
  const list = state.attachments;
  els.attachList.classList.toggle('hidden', !list.length);
  els.attachList.innerHTML = list.map((a, i) => `<span class="attach${a.uploading ? ' uploading' : ''}"><span class="name">${esc(a.name)}</span><span class="size">${a.uploading ? (/\.(m4a|mp3|wav|aac|ogg|oga|opus|webm|amr|flac|aiff?|caf)$/i.test(a.name) ? 'uploading + transcribing…' : 'uploading…') : a.transcript ? 'transcribed' : fmtSize(a.size)}</span><button class="x" data-i="${i}" aria-label="Remove">×</button></span>`).join('');
  els.attachList.querySelectorAll('.x').forEach((b) => (b.onclick = () => { state.attachments.splice(Number(b.dataset.i), 1); renderAttachments(); }));
}
async function addFiles(fileList) {
  if (!state.botId) return;
  for (const f of Array.from(fileList || [])) {
    const entry = { name: f.name || 'pasted image.png', size: f.size, uploading: true }; state.attachments.push(entry); renderAttachments();
    try {
      const r = await fetch(`/api/bots/${state.botId}/upload`, { method: 'POST', headers: { 'x-filename': encodeURIComponent(entry.name), 'content-type': 'application/octet-stream', ...(token ? { 'x-cc-token': token } : {}) }, body: f });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText);
      Object.assign(entry, { path: j.path, name: j.name, size: j.size, uploading: false, transcript: j.text || '' });
    } catch (e) { state.attachments.splice(state.attachments.indexOf(entry), 1); alert(`Could not attach ${entry.name}: ${e.message}`); }
    renderAttachments();
  }
  els.input.focus();
}
els.btnAttach.onclick = () => els.fileInput.click();
els.fileInput.onchange = () => { addFiles(els.fileInput.files); els.fileInput.value = ''; };
els.input.addEventListener('paste', (e) => { const files = Array.from(e.clipboardData?.files || []); if (files.length) { e.preventDefault(); addFiles(files); } });
let dragDepth = 0;
document.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types?.includes('Files') && state.botId) { dragDepth++; els.dropOverlay.classList.remove('hidden'); } });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; els.dropOverlay.classList.add('hidden'); } });
document.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
document.addEventListener('drop', (e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); dragDepth = 0; els.dropOverlay.classList.add('hidden'); addFiles(e.dataTransfer.files); });
function setBusy(b) { state.busy = b; els.btnSend.classList.remove('hidden'); els.btnStop.classList.toggle('hidden', !b); /* send stays available while busy: the message is queued */ els.busyLabel.textContent = b ? `Working…${els.busyLabel.dataset.model ? ' · ' + els.busyLabel.dataset.model : ''}` : ''; if (!b && state.turn) finishTurn(); updateHead(); }
// Follow the conversation: stay pinned to the bottom while the reader is there, stop following once they scroll up,
// and offer a "Latest" button instead of yanking them back.
state.stick = true;
const atBottom = () => { const s = els.scroll; return s.scrollHeight - s.scrollTop - s.clientHeight < 40; };
function scrollBottom(force) {
  if (!force && !state.stick) { els.jump.classList.remove('hidden'); return; }
  const s = els.scroll; s.scrollTop = s.scrollHeight;
  requestAnimationFrame(() => { s.scrollTop = s.scrollHeight; });
  els.jump.classList.add('hidden');
}
els.scroll.addEventListener('scroll', () => { state.stick = atBottom(); if (state.stick) els.jump.classList.add('hidden'); }, { passive: true });
els.jump.onclick = () => { state.stick = true; scrollBottom(true); };
// iOS: the on-screen keyboard shrinks the visual viewport instead of the layout. Size the app to it so the composer stays visible.
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fit = () => { document.documentElement.style.setProperty('--vh', vv.height + 'px'); if (document.querySelector('dialog[open]') || vv.scale > 1.01) return; window.scrollTo(0, 0); if (state.stick) scrollBottom(true); };
  vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit();
}
new ResizeObserver(() => { document.documentElement.style.setProperty('--composer-h', els.composerWrap.offsetHeight + 'px'); if (state.stick) scrollBottom(true); }).observe(els.composerWrap);
function autosize() { els.input.style.height = 'auto'; els.input.style.height = Math.min(els.input.scrollHeight, window.innerHeight * 0.4) + 'px'; }

// ---- bots list / head ----
// ---- never miss an approval: banners in both screens, a count in the tab title, a short sound and a vibration.
const pendingTotal = () => state.bots.reduce((n, b) => n + (b.pendingApprovals || 0), 0);
function renderBanners() {
  const waiting = state.bots.filter((b) => b.pendingApprovals);
  document.title = waiting.length ? `(${pendingTotal()}) Code Crew` : 'Code Crew';
  const html = (list) => list.length ? `<span>⚠︎</span><span><b>${esc(list.map((b) => b.name).join(', '))}</b> ${list.length === 1 ? 'needs' : 'need'} your approval</span><span class="needs-ok">${list.reduce((n, b) => n + b.pendingApprovals, 0)}</span>` : '';
  const show = (el, list) => { el.classList.toggle('hidden', !list.length); el.innerHTML = html(list); el.onclick = () => { openBot(list[0].id); }; };
  show(els.sideBanner, waiting);
  show(els.mainBanner, waiting.filter((b) => b.id !== state.botId));
}
let audioCtx = null;
function alertUser() {
  try { navigator.vibrate?.([120, 60, 120]); } catch {}
  try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = 880; g.gain.value = 0.06; o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.18); } catch {}
}
function renderBots() {
  renderBanners();
  // Update rows in place (keyed by Bot id) instead of rebuilding: a rebuild between touchstart and touchend swallowed taps on phones.
  const sorted = [...state.bots].sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0) || (b.lastActivity || 0) - (a.lastActivity || 0));
  const rows = new Map([...els.botList.querySelectorAll('.bot-row')].map((r) => [r.dataset.id, r]));
  sorted.forEach((b, i) => {
    let row = rows.get(b.id); rows.delete(b.id);
    if (!row) { row = document.createElement('button'); row.className = 'bot-row'; row.dataset.id = b.id; row.innerHTML = '<span class="avatar"></span><span class="bot-text"><span class="bot-name"></span><span class="bot-sub"></span></span><span class="bot-right"></span>'; row.onclick = () => openBot(row.dataset.id); }
    row.classList.toggle('active', b.id === state.botId || b.id === threadById(state.botId)?.threadOf);
    const av = `${b.shape}|${b.color}|${b.name}`; if (row.dataset.av !== av) { setAvatar(row.querySelector('.avatar'), b); row.dataset.av = av; }
    const put = (sel, html) => { const el = row.querySelector(sel); if (el.innerHTML !== html) el.innerHTML = html; };
    put('.bot-name', esc(b.name));
    put('.bot-sub', esc(b.busy ? 'Working…' : b.preview || b.label || 'Tap to give it a job'));
    const right = b.pendingApprovals ? `<span class="needs-ok">${b.pendingApprovals} to approve</span>` : b.busy ? '<span class="working" title="Working"></span>' : b.unread ? '<span class="unread" title="New reply"></span>' : '';
    put('.bot-right', `${right}<span>${fmtAgo(b.lastActivity)}</span>`);
    if (els.botList.children[i] !== row) els.botList.insertBefore(row, els.botList.children[i] || null);
  });
  for (const r of rows.values()) r.remove();
}
function updateHead() {
  const b = currentBot();
  if (!b) { els.headName.textContent = 'Pick a Bot'; els.headLabel.textContent = ''; els.headAvatar.innerHTML = ''; els.headState.textContent = ''; return; }
  els.headName.textContent = b.isThread ? `🧵 ${b.name}` : b.name; els.headLabel.textContent = b.isThread ? `${b.parentName} · ${b.label}` : b.label || ''; setAvatar(els.headAvatar, b.isThread ? { ...b, name: b.parentName } : b);
  els.btnDetails.classList.toggle('hidden', !!b.isThread); els.alsoMainWrap.classList.toggle('hidden', !b.isThread); els.btnNewThread.classList.toggle('hidden', !!b.isThread);
  const nThreads = b.isThread ? 0 : state.threads.filter((t) => t.threadOf === b.id).length;
  els.btnThreads.classList.toggle('hidden', !nThreads); els.threadCount.textContent = nThreads || '';
  els.headState.textContent = b.busy ? 'Working…' : b.pendingApprovals ? 'Waiting for your approval' : '';
}
// Wide screens: a thread opens in a right-hand panel beside its main chat (Slack-style). The panel is the same app in
// embed mode, so it renders and streams on its own. Phones (and the panel itself) open threads full screen.
const EMBED = new URLSearchParams(location.search).has('embed');
if (EMBED) document.documentElement.classList.add('embed');
const wideForPanel = () => !EMBED && window.innerWidth > 1100;
function openThreadPanel(t) {
  if (state.botId !== t.threadOf) openBot(t.threadOf);
  if (els.threadPanel.dataset.id !== t.id) { els.threadFrame.src = `/?bot=${encodeURIComponent(t.id)}&embed=1`; els.threadPanel.dataset.id = t.id; }
  els.threadPanel.classList.remove('hidden'); els.app.classList.add('with-thread');
  els.thread.querySelectorAll('.thread-chip').forEach((c) => c.classList.toggle('active', c.dataset.id === t.id));
}
function closeThreadPanel() { els.threadPanel.classList.add('hidden'); els.app.classList.remove('with-thread'); els.threadFrame.src = 'about:blank'; delete els.threadPanel.dataset.id; els.thread.querySelectorAll('.thread-chip.active').forEach((c) => c.classList.remove('active')); }
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  if (e.data?.type === 'cc-close-thread') closeThreadPanel();
  if (e.data?.type === 'cc-open-bot' && e.data.id) { closeThreadPanel(); openBot(e.data.id); }
});
function openBot(id) {
  const th = threadById(id);
  if (th && wideForPanel()) return openThreadPanel(th);
  if (EMBED && !th && state.botId) return parent.postMessage({ type: 'cc-open-bot', id }, location.origin); // "open main chat" from inside the panel
  if (!EMBED && !th && els.threadPanel.dataset.id && threadById(els.threadPanel.dataset.id)?.threadOf !== id) closeThreadPanel();
  if (state.botId && state.botId !== id) wsSend({ type: 'unsubscribe' });
  saveDraft(); // the half-written message stays with the chat it was written in
  state.botId = id; if (!EMBED) localStorage.setItem('botId', id);
  loadDraft();
  if (state.pendingThread) { state.pendingThread = null; renderThreadBar(); }
  els.app.classList.add('show-chat'); els.composerWrap.classList.remove('hidden');
  resetThread(); renderBots(); updateHead();
  wsSend({ type: 'subscribe', botId: id });
  if (window.innerWidth > 760) els.input.focus();
}
function showNoBot() { state.botId = null; localStorage.removeItem('botId'); resetThread(); els.emptyNoBot.classList.remove('hidden'); els.composerWrap.classList.add('hidden'); els.app.classList.remove('show-chat'); renderBots(); updateHead(); }
function showNewBotIntro() {
  const b = currentBot(); if (!b) return;
  els.emptyNewBot.classList.remove('hidden'); setAvatar(els.emptyAvatar, b); els.emptyTitle.textContent = `Meet ${b.name}`;
  const ideas = [
    ['Give it this folder', `Your job: know this folder inside out. Start by reading it and tell me what it does. Remember what you learn.`],
    ['Morning briefing', `Your job: every morning, check what changed in this folder and any TODO notes, and give me a 5-line briefing. Don't change files without asking. Remember this.`],
    ['Research partner', `Your job: research what I ask and save findings as markdown notes in a notes/ folder here. Always cite sources. Remember this.`],
  ];
  els.starters.innerHTML = ideas.map(([t, q]) => `<button class="pill" data-q="${esc(q)}">${esc(t)}</button>`).join('');
  els.starters.querySelectorAll('button').forEach((x) => (x.onclick = () => send(x.dataset.q)));
}

// ---- create dialog ----
let cPick = { shape: 'circle', color: COLORS[0] };
function pickers(shapesEl, colorsEl, avatarEl, pick, nameEl) {
  shapesEl.innerHTML = Object.keys(SHAPES).map((s) => `<button type="button" data-s="${s}" class="${pick.shape === s ? 'sel' : ''}">${avatarSvg(s, 'currentColor')}</button>`).join('');
  colorsEl.innerHTML = COLORS.map((c) => `<button type="button" data-c="${c}" style="background:${c}" class="${pick.color === c ? 'sel' : ''}" aria-label="${c}"></button>`).join('');
  const refresh = () => { avatarEl.innerHTML = avatarSvg(pick.shape, pick.color, nameEl.value || '?'); };
  shapesEl.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; pick.shape = b.dataset.s; pickers(shapesEl, colorsEl, avatarEl, pick, nameEl); };
  colorsEl.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; pick.color = b.dataset.c; pickers(shapesEl, colorsEl, avatarEl, pick, nameEl); };
  nameEl.oninput = refresh; refresh();
}
function folderHint() { const n = els.cName.value.trim() || 'Name'; els.cFolderHint.textContent = els.cAdv.open ? 'Pick a folder below, or type a path.' : `Gets its own folder: ${shortPath(state.botsDir || '~/Bots')}/${n}`; }
function openCreate() { cPick = { shape: Object.keys(SHAPES)[state.bots.length % 6], color: COLORS[state.bots.length % COLORS.length] }; els.cName.value = ''; els.cLabel.value = ''; els.cCwd.value = ''; els.cAdv.open = false; els.cPerm.value = state.defaultPermission || 'acceptEdits'; renderChips(els.cDirChips, els.cCwd); folderHint(); pickers(els.cShapes, els.cColors, els.cAvatar, cPick, els.cName); els.createDialog.showModal(); els.cName.focus(); }
els.cName.addEventListener('input', folderHint); els.cAdv.addEventListener('toggle', folderHint);
els.createForm.onsubmit = async (e) => {
  e.preventDefault();
  try { const { bot } = await api('/api/bots', { method: 'POST', body: { name: els.cName.value, label: els.cLabel.value, shape: cPick.shape, color: cPick.color, permissionMode: els.cPerm.value, cwd: els.cAdv.open ? els.cCwd.value.trim() : '' } }); els.createDialog.close(); state.bots.push(bot); openBot(bot.id); loadDirs().catch(() => {}); }
  catch (err) { alert(err.message); }
};
els.cCancel.onclick = () => els.createDialog.close();

// ---- drawer ----
let dPick = { shape: 'circle', color: COLORS[0] };
async function openDrawer() {
  const b = currentBot(); if (!b) return;
  dPick = { shape: b.shape, color: b.color };
  els.dName.value = b.name; els.dLabel.value = b.label || ''; els.dCwd.value = b.cwd; renderChips(els.dDirChips, els.dCwd); els.dModel.value = b.model || ''; els.dPerm.value = b.permissionMode || 'acceptEdits';
  pickers(els.dShapes, els.dColors, els.dAvatar, dPick, els.dName);
  els.drawer.classList.add('open'); els.scrim.classList.remove('hidden');
  loadRoutines(); renderBotConnectors(b); api(`/api/bots/${b.id}/memory`).then((r) => { els.dMemory.textContent = r.memory?.trim() || 'Nothing saved yet. The Bot writes here on its own as it learns your preferences and rules.'; }).catch(() => {});
}
function closeDrawer() { els.drawer.classList.remove('open'); els.scrim.classList.add('hidden'); }
els.dSave.onclick = async () => { const b = currentBot(); if (!b) return; try { await api(`/api/bots/${b.id}`, { method: 'PATCH', body: { name: els.dName.value, label: els.dLabel.value, shape: dPick.shape, color: dPick.color, cwd: els.dCwd.value, model: els.dModel.value, permissionMode: els.dPerm.value, connectorsOff: [...els.dConnectors.querySelectorAll('input[type=checkbox]')].filter((i) => !i.checked).map((i) => i.dataset.id) } }); closeDrawer(); } catch (err) { alert(err.message); } };
els.dReset.onclick = async () => { const b = currentBot(); if (!b || !confirm(`Reset the conversation with ${b.name}? Memory and routines stay.`)) return; await api(`/api/bots/${b.id}/reset`, { method: 'POST' }); closeDrawer(); openBot(b.id); };
els.dDelete.onclick = async () => { const b = currentBot(); if (!b || !confirm(`Delete ${b.name}? This removes its routines and memory. It can't be undone.`)) return; await api(`/api/bots/${b.id}`, { method: 'DELETE' }); closeDrawer(); showNoBot(); };

async function loadRoutines() {
  const b = currentBot(); if (!b) return;
  const { routines } = await api(`/api/bots/${b.id}/routines`);
  els.routineCount.textContent = routines.length ? `· ${routines.length}` : '';
  const when = (r) => ({ daily: `every day at ${r.schedule.time}`, weekdays: `weekdays at ${r.schedule.time}`, hourly: 'every hour', interval: `every ${r.schedule.minutes} min` })[r.schedule.kind];
  els.routineList.innerHTML = routines.length ? routines.map((r) => `<div class="routine ${r.enabled ? '' : 'off'}" data-id="${r.id}"><div class="r-text"><div class="r-name">${esc(r.name)}</div><div class="r-when">${when(r)} · next ${r.enabled && r.nextRun ? new Date(r.nextRun).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'paused'}${r.runs ? ` · ran ${r.runs}×` : ''}</div></div><div class="r-actions"><button data-a="run" title="Run now">Run</button><button data-a="toggle">${r.enabled ? 'Pause' : 'Resume'}</button><button data-a="del">Delete</button></div></div>`).join('') : '<div class="muted small">No routines yet. A routine gives this Bot a task on a schedule, and it reports back in the chat.</div>';
  els.routineList.onclick = async (e) => {
    const btn = e.target.closest('button'); if (!btn) return; const id = btn.closest('.routine').dataset.id; const r = routines.find((x) => x.id === id);
    if (btn.dataset.a === 'run') { await api(`/api/routines/${id}/run`, { method: 'POST' }); closeDrawer(); }
    if (btn.dataset.a === 'toggle') { await api(`/api/routines/${id}`, { method: 'PATCH', body: { enabled: !r.enabled } }); loadRoutines(); }
    if (btn.dataset.a === 'del' && confirm(`Delete routine "${r.name}"?`)) { await api(`/api/routines/${id}`, { method: 'DELETE' }); loadRoutines(); }
  };
}
els.rKind.onchange = () => { const k = els.rKind.value; els.rTimeWrap.classList.toggle('hidden', k === 'hourly' || k === 'interval'); els.rMinWrap.classList.toggle('hidden', k !== 'interval'); };
els.rAdd.onclick = async () => { const b = currentBot(); if (!b) return; if (!els.rPrompt.value.trim()) return alert('Say what the routine should do.'); await api(`/api/bots/${b.id}/routines`, { method: 'POST', body: { name: els.rName.value, prompt: els.rPrompt.value, schedule: { kind: els.rKind.value, time: els.rTime.value, minutes: Number(els.rMinutes.value) } } }); els.rName.value = ''; els.rPrompt.value = ''; els.addRoutine.open = false; loadRoutines(); };

// ---- wiring ----
els.btnSend.onclick = () => (rec.mr ? sendVoice() : send());
els.btnStop.onclick = () => wsSend({ type: 'interrupt', botId: state.botId });
els.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && ((e.metaKey || e.ctrlKey) || (!e.shiftKey && window.innerWidth > 760))) { e.preventDefault(); send(); } });
els.input.addEventListener('input', autosize);
els.btnNewBot.onclick = openCreate; els.btnNewBot2.onclick = openCreate;
function goBack() { if (EMBED) return parent.postMessage({ type: 'cc-close-thread' }, location.origin); const t = threadById(state.botId); if (t) openBot(t.threadOf); else els.app.classList.remove('show-chat'); }
els.btnBack.onclick = goBack;
els.botHead.onclick = openDrawer; els.btnDetails.onclick = openDrawer; els.btnCloseDrawer.onclick = closeDrawer; els.scrim.onclick = closeDrawer;
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); openCreate(); } if (e.key === 'Escape') closeDrawer(); });

(async () => {
  els.authBtn.onclick = () => { const t = els.authInput.value.trim().replace(/^.*token=/, ''); if (!t) return; try { localStorage.setItem('cc_token', t); } catch {} location.reload(); };
  els.authInput.onkeydown = (e) => { if (e.key === 'Enter') els.authBtn.onclick(); };
  state.dirs = [];
  try { await loadDirs(); } catch (e) { if (e.message === 'unauthorized') return; }
  try { state.mediaKey = (await api('/api/media-key')).key || ''; } catch {}
  setupNotifications();
  connect();
  const { bots, threads } = await api('/api/bots'); state.bots = bots; state.threads = threads || []; renderBots();
  const remembered = new URLSearchParams(location.search).get('bot') || localStorage.getItem('botId');
  const wanted = bots.find((b) => b.id === remembered || b.name.toLowerCase() === String(remembered).toLowerCase()) || state.threads.find((t) => t.id === remembered);
  if ((window.innerWidth > 760 && bots.length) || (wanted && new URLSearchParams(location.search).get('bot'))) openBot(wanted?.id || bots[0].id);
  else { els.composerWrap.classList.add('hidden'); els.emptyNoBot.classList.remove('hidden'); }
})();

// ---- push notifications (needs the https link; on iPhone also "Add to Home Screen")
const b64ToU8 = (s) => { const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
async function setupNotifications() {
  if (EMBED) return;
  const btn = els.btnNotify, hint = els.notifyHint;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const iOS = /iPhone|iPad/.test(navigator.userAgent);
  if (!window.isSecureContext) { btn.classList.add('hidden'); hint.textContent = 'Notifications need the https link.'; return; }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) { btn.classList.add('hidden'); hint.textContent = iOS && !standalone ? 'For notifications: Share → Add to Home Screen, then open it from there.' : 'This browser cannot receive notifications.'; return; }
  const reg = await navigator.serviceWorker.register('/sw.js').catch(() => null);
  if (!reg) { btn.classList.add('hidden'); hint.textContent = 'Notifications unavailable here.'; return; }
  const existing = await reg.pushManager.getSubscription();
  const setOn = () => { btn.textContent = 'On'; btn.disabled = true; hint.textContent = 'On for this device'; };
  if (existing && Notification.permission === 'granted') { api('/api/push/subscribe', { method: 'POST', body: { subscription: existing.toJSON() } }).catch(() => {}); setOn(); return; }
  btn.onclick = async () => {
    try {
      const perm = await Notification.requestPermission(); if (perm !== 'granted') { hint.textContent = 'Allow notifications in the browser settings to turn this on.'; return; }
      const { key } = await api('/api/push/key');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
      await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
      setOn(); api('/api/push/test', { method: 'POST' }).catch(() => {});
    } catch (e) { hint.textContent = 'Could not turn on notifications: ' + e.message; }
  };
}

// ---- connectors: services the Bots can use. Managed in one gallery; each Bot can opt out of any of them in its details.
state.connectors = [];
async function loadConnectors() { try { state.connectors = (await api('/api/connectors')).connectors; } catch {} return state.connectors; }
const tile = (c) => `<span class="tile" style="background:${esc(c.color)}">${esc(c.name[0])}</span>`;
async function openConnectors() {
  await loadConnectors(); renderConnGrid(); els.connForm.classList.add('hidden'); els.connGrid.classList.remove('hidden'); els.connDialog.showModal();
}
function renderConnGrid() {
  const connected = state.connectors.filter((c) => c.connected), available = state.connectors.filter((c) => !c.connected);
  const card = (c) => `<button type="button" class="conn-card${c.connected ? ' on' : ''}" data-id="${esc(c.id)}">${tile(c)}<span class="conn-name">${esc(c.name)}</span><span class="conn-tag">${esc(c.tagline || '')}</span><span class="conn-state">${c.connected ? 'Connected' : 'Connect'}</span></button>`;
  els.connGrid.innerHTML = `${connected.length ? `<div class="sec-title">Connected</div><div class="conn-cards">${connected.map(card).join('')}</div>` : ''}<div class="sec-title">Available</div><div class="conn-cards">${available.map(card).join('')}<button type="button" class="conn-card custom" data-id="custom"><span class="tile" style="background:var(--raised-2);color:var(--text)">+</span><span class="conn-name">Custom MCP</span><span class="conn-tag">Any MCP server or REST API</span><span class="conn-state">Add</span></button></div>`;
  els.connGrid.querySelectorAll('.conn-card').forEach((b) => (b.onclick = () => openConnForm(b.dataset.id)));
}
function openConnForm(id) {
  const c = id === 'custom' ? { id: 'custom', name: 'Custom MCP', color: '#777', fields: [], custom: false } : state.connectors.find((x) => x.id === id);
  if (!c) return;
  const f = els.connForm; f.dataset.id = id;
  let fields = '';
  if (id === 'custom') fields = `<label>Name<input name="name" maxlength="40" placeholder="My service" required></label>
    <label>Type<select name="kind"><option value="rest">REST API (Bot gets a request tool)</option><option value="http">Remote MCP server (URL)</option><option value="stdio">Local MCP server (command)</option></select></label>
    <label data-kind="rest http">URL<input name="url" placeholder="https://api.example.com" spellcheck="false" autocomplete="off"></label>
    <label data-kind="stdio" class="hidden">Command<input name="command" placeholder="npx -y some-mcp-server --flag" spellcheck="false" autocomplete="off"></label>
    <div class="two" data-kind="rest http"><label>Header name <span class="muted">(optional)</span><input name="headerName" placeholder="Authorization" autocomplete="off"></label><label>Header value<input name="headerValue" type="password" placeholder="Bearer …" autocomplete="off"></label></div>
    <label data-kind="rest">Docs URL <span class="muted">(optional, helps the Bot)</span><input name="docs" placeholder="https://…/api-reference" autocomplete="off"></label>`;
  else if (c.custom) fields = `<p class="muted">${esc(c.tagline || '')}</p>`;
  else if (!c.fields.length) fields = `<p class="muted">No key needed. Connecting lets every Bot use it.</p>`;
  else fields = c.fields.map((fl) => `<label>${esc(fl.label)}${fl.help ? ` <a class="muted" href="${esc(fl.help)}" target="_blank" rel="noopener">where to get it ↗</a>` : ''}<input name="${esc(fl.key)}" ${fl.secret ? 'type="password"' : ''} value="${esc(c.values?.[fl.key] || '')}" spellcheck="false" autocomplete="off" required></label>`).join('');
  f.innerHTML = `<div class="conn-head">${tile(c)}<div><div class="dialog-title" style="margin:0">${esc(c.name)}</div><div class="muted small">${esc(id === 'custom' ? 'Give a Bot access to anything with an API or an MCP server.' : c.tagline || '')}</div></div></div>
    ${fields}<div class="form-error" id="connError"></div>
    <div class="dialog-actions"><button type="button" class="pill" id="connBack">Back</button>${c.connected ? '<button type="button" class="pill danger" id="connRemove">Disconnect</button>' : ''}${c.custom ? '' : `<button type="submit" class="pill primary" id="connSave">${c.connected ? 'Save' : 'Connect'}</button>`}</div>`;
  f.querySelector('[name=kind]')?.addEventListener('change', (e) => { f.querySelectorAll('[data-kind]').forEach((el) => el.classList.toggle('hidden', !el.dataset.kind.split(' ').includes(e.target.value))); });
  f.querySelector('#connBack').onclick = () => { f.classList.add('hidden'); els.connGrid.classList.remove('hidden'); };
  const rm = f.querySelector('#connRemove'); if (rm) rm.onclick = async () => { if (!confirm(`Disconnect ${c.name} from all Bots?`)) return; await api(`/api/connectors/${id}`, { method: 'DELETE' }); await loadConnectors(); renderConnGrid(); f.classList.add('hidden'); els.connGrid.classList.remove('hidden'); };
  f.onsubmit = async (e) => {
    e.preventDefault(); const err = f.querySelector('#connError'); err.textContent = ''; const btn = f.querySelector('#connSave'); btn.disabled = true; btn.textContent = 'Checking…';
    const data = Object.fromEntries(new FormData(f).entries());
    try {
      if (id === 'custom') await api('/api/connectors/custom', { method: 'PUT', body: data }); else await api(`/api/connectors/${id}`, { method: 'PUT', body: { fields: data } });
      await loadConnectors(); renderConnGrid(); f.classList.add('hidden'); els.connGrid.classList.remove('hidden');
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; btn.textContent = c.connected ? 'Save' : 'Connect'; }
  };
  els.connGrid.classList.add('hidden'); f.classList.remove('hidden'); f.querySelector('input')?.focus();
}
els.btnConnectors.onclick = () => { els.accountDialog.close(); openConnectors(); }; els.connClose.onclick = () => els.connDialog.close();
els.dManageConn.onclick = () => { closeDrawer(); openConnectors(); };
async function renderBotConnectors(b) {
  await loadConnectors();
  const on = state.connectors.filter((c) => c.connected);
  els.dConnectors.innerHTML = on.length ? on.map((c) => `<label class="check"><input type="checkbox" data-id="${esc(c.id)}" ${(b.connectorsOff || []).includes(c.id) ? '' : 'checked'}> ${tile(c)} ${esc(c.name)}</label>`).join('') : '<p class="muted small">Nothing connected yet.</p>';
}

// ---- vault: logins Bots may request. Names only in the UI list; values stay on the server.
async function openVault() {
  els.vaultDialog.showModal(); els.vaultList.innerHTML = '<p class="muted">Loading…</p>';
  const v = await api('/api/vault').catch(() => ({ items: [], onePassword: {} }));
  els.vaultList.innerHTML = v.items.length ? v.items.map((i) => `<div class="vault-row"><span class="tile" style="background:${i.source === '1password' ? '#0a2a66' : 'var(--raised-2)'};color:${i.source === '1password' ? '#fff' : 'var(--text)'}">${i.source === '1password' ? '1' : '🔑'}</span><div class="vault-text"><div class="vault-name">${esc(i.name)}</div><div class="muted small">${esc(i.note || (i.source === '1password' ? '1Password' : 'Stored here'))}</div></div>${i.source === 'local' ? `<button class="x" data-name="${esc(i.name)}" aria-label="Remove">×</button>` : ''}</div>`).join('') : '<p class="muted">Nothing stored yet. Add a login below, or connect 1Password.</p>';
  els.vaultList.querySelectorAll('.x').forEach((b) => (b.onclick = async () => { if (confirm(`Remove "${b.dataset.name}" from the vault?`)) { await api(`/api/vault/item/${encodeURIComponent(b.dataset.name)}`, { method: 'DELETE' }); openVault(); } }));
  els.opStatus.textContent = !v.onePassword.cli ? 'Needs the 1Password CLI on this machine: brew install 1password-cli' : v.onePassword.token ? 'Connected with a service account.' : 'CLI found. Paste a service-account token to let Bots request items from 1Password.';
  els.opToken.classList.toggle('hidden', !v.onePassword.cli); els.opSave.classList.toggle('hidden', !v.onePassword.cli);
}
els.btnVault.onclick = () => { els.accountDialog.close(); openVault(); }; els.vaultClose.onclick = () => els.vaultDialog.close();
els.vaultAddForm.onsubmit = async (e) => { e.preventDefault(); const f = new FormData(els.vaultAddForm); const name = String(f.get('name')).trim(); if (!name || !f.get('value')) return; try { await api(`/api/vault/item/${encodeURIComponent(name)}`, { method: 'PUT', body: { value: f.get('value'), note: f.get('note') } }); els.vaultAddForm.reset(); openVault(); } catch (err) { alert(err.message); } };
els.opSave.onclick = async () => { try { await api('/api/vault/onepassword', { method: 'PUT', body: { token: els.opToken.value.trim() } }); els.opToken.value = ''; openVault(); } catch (err) { alert(err.message); } };

// ---- @mentions: type @ to bring another Bot into this conversation
let mentionIdx = -1;
function mentionQuery() { const v = els.input.value.slice(0, els.input.selectionStart); const m = v.match(/(?:^|\s)@([^@\n]{0,30})$/); return m ? m[1] : null; }
function renderMentions() {
  const q = mentionQuery(); const list = q === null ? [] : state.bots.filter((b) => b.id !== state.botId && b.name.toLowerCase().startsWith(q.toLowerCase().trim()));
  els.mentionPop.classList.toggle('hidden', !list.length); if (!list.length) { mentionIdx = -1; return; }
  mentionIdx = Math.max(0, Math.min(mentionIdx, list.length - 1));
  els.mentionPop.innerHTML = list.map((b, i) => `<button type="button" class="mention-opt${i === mentionIdx ? ' sel' : ''}" data-id="${b.id}"><span class="avatar sm"></span><span><b>${esc(b.name)}</b> <span class="muted">${esc(b.label || '')}</span></span></button>`).join('');
  list.forEach((b, i) => setAvatar(els.mentionPop.children[i].querySelector('.avatar'), b));
  els.mentionPop.querySelectorAll('.mention-opt').forEach((o) => (o.onmousedown = (e) => { e.preventDefault(); insertMention(o.dataset.id); }));
}
function insertMention(id) {
  const b = state.bots.find((x) => x.id === id); if (!b) return;
  const pos = els.input.selectionStart, before = els.input.value.slice(0, pos).replace(/@[^@\n]{0,30}$/, `@${b.name} `), after = els.input.value.slice(pos);
  els.input.value = before + after; els.input.selectionStart = els.input.selectionEnd = before.length; els.mentionPop.classList.add('hidden'); mentionIdx = -1; autosize(); els.input.focus();
}
els.input.addEventListener('input', renderMentions);
els.input.addEventListener('keydown', (e) => {
  if (els.mentionPop.classList.contains('hidden')) return;
  const n = els.mentionPop.children.length;
  if (e.key === 'ArrowDown') { e.preventDefault(); mentionIdx = (mentionIdx + 1) % n; renderMentions(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); mentionIdx = (mentionIdx - 1 + n) % n; renderMentions(); }
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); insertMention(els.mentionPop.children[Math.max(0, mentionIdx)].dataset.id); }
  else if (e.key === 'Escape') els.mentionPop.classList.add('hidden');
}, true);
// @Name in text → chip with that Bot's avatar; tapping it opens that Bot
function mentionChips(html) {
  for (const b of [...state.bots].sort((a, c) => c.name.length - a.name.length)) {
    const re = new RegExp(`(^|[^\\w])@(${b.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\w])`, 'gi');
    html = html.replace(re, (_, pre) => `${pre}<button type="button" class="mention" data-bot="${b.id}" style="--c:${esc(b.color)}">@${esc(b.name)}</button>`);
  }
  return html;
}
document.addEventListener('click', (e) => { const el = e.target.closest('[data-bot]'); if (el && state.bots.some((b) => b.id === el.dataset.bot)) openBot(el.dataset.bot); });

// ---- copy: a button on every code block, and tapping inline code copies it. Works on plain http too (fallback).
async function copyText(t) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(t); return true; } } catch {}
  const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, t.length); let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok;
}
document.addEventListener('click', async (e) => {
  const el = e.target.closest('.copy-btn, code.tap-copy'); if (!el) return;
  e.preventDefault();
  const pre = el.classList.contains('copy-btn') ? el.parentElement : null;
  const text = pre ? (pre.querySelector('code') || pre).textContent.replace(/\n$/, '') : el.textContent;
  const ok = await copyText(text);
  if (pre) { el.innerHTML = ok ? CHECK_ICON : '!'; el.classList.add('copied'); setTimeout(() => { el.innerHTML = COPY_ICON; el.classList.remove('copied'); }, 1400); }
  else { el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 1000); }
  if (ok) try { navigator.vibrate?.(15); } catch {}
});

// ---- voice notes: tap the mic, talk, tap send. Transcribed on the Mac (whisper.cpp); the Bot reads the transcript.
const rec = { mr: null, chunks: [], started: 0, timer: null, stream: null };
const recTick = () => { const s = Math.floor((Date.now() - rec.started) / 1000); els.recTime.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
async function startVoice() {
  if (!state.botId || rec.mr || rec.starting) return;
  rec.starting = true;
  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return alert(window.isSecureContext ? 'This browser cannot record audio.' : 'Voice notes need the https address of Code Crew (browsers only allow the microphone on https).');
    try { rec.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return alert(`Microphone not available: ${e.message}`); }
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
    rec.mr = new MediaRecorder(rec.stream, type ? { mimeType: type } : undefined); rec.chunks = [];
    rec.mr.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
    rec.mr.start(250); rec.started = Date.now(); recTick(); rec.timer = setInterval(recTick, 250);
    els.composerWrap.classList.add('recording'); els.btnSend.classList.remove('hidden'); els.btnStop.classList.add('hidden');
  } finally { rec.starting = false; }
}
function stopVoice() {
  return new Promise((resolve) => {
    const mr = rec.mr; if (!mr) return resolve(null);
    mr.onstop = () => resolve(new Blob(rec.chunks, { type: mr.mimeType || 'audio/mp4' }));
    try { mr.stop(); } catch { resolve(null); }
    rec.stream?.getTracks().forEach((t) => t.stop()); clearInterval(rec.timer); rec.mr = null; rec.stream = null;
    els.composerWrap.classList.remove('recording'); setBusy(state.busy);
  });
}
async function sendVoice() {
  const botId = state.botId, blob = await stopVoice();
  if (!blob || blob.size < 800) return;
  els.btnMic.disabled = true; els.busyLabel.textContent = 'Transcribing…';
  try {
    const ext = /webm/.test(blob.type) ? 'webm' : /ogg/.test(blob.type) ? 'ogg' : 'm4a', stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const r = await fetch(`/api/bots/${botId}/upload`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-filename': encodeURIComponent(`voice-${stamp}.${ext}`), ...(token ? { 'x-cc-token': token } : {}) }, body: blob });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText);
    const voice = j.text ? `🎙️ ${j.text}` : '🎙️ (voice note: no transcript, listen to the attached recording)';
    if (state.botId !== botId) { wsSend({ type: 'send', botId, text: voice, attachments: [j.path] }); return; }
    for (let i = 0; i < 300 && state.attachments.some((a) => a.uploading); i++) await new Promise((r) => setTimeout(r, 200)); // another file still uploading
    const draft = els.input.value.trim();
    state.attachments.push({ path: j.path, name: j.name, size: j.size }); send([draft, voice].filter(Boolean).join('\n\n'));
  } catch (e) { alert(`Voice note failed: ${e.message}`); }
  finally { els.btnMic.disabled = false; if (!state.busy) els.busyLabel.textContent = ''; }
}
els.btnMic.onclick = startVoice;
els.btnRecCancel.onclick = () => { stopVoice(); };

// ---- swipe right in a conversation to go back to the Bot list (phones; home-screen apps get no native back gesture)
(() => {
  const main = document.getElementById('main'); let sx = 0, sy = 0, st = 0, dx = 0, mode = null; // null → undecided, 'swipe', 'scroll'
  const scrollsSideways = (el) => { for (let n = el; n && n !== main; n = n.parentElement) if (n.scrollWidth > n.clientWidth + 2 && getComputedStyle(n).overflowX !== 'visible' && n.scrollLeft > 0) return true; return false; };
  main.addEventListener('touchstart', (e) => {
    mode = null; dx = 0;
    if (window.innerWidth > 760 || !els.app.classList.contains('show-chat') || e.touches.length !== 1 || rec.mr) return (mode = 'scroll');
    if (e.target.closest('textarea, input, select, dialog, .drawer') || scrollsSideways(e.target)) return (mode = 'scroll');
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
  }, { passive: true });
  main.addEventListener('touchmove', (e) => {
    if (mode === 'scroll') return;
    const x = e.touches[0].clientX - sx, y = e.touches[0].clientY - sy;
    if (!mode) { if (Math.abs(x) < 10 && Math.abs(y) < 10) return; mode = x > 0 && Math.abs(x) > Math.abs(y) * 1.5 ? 'swipe' : 'scroll'; if (mode === 'swipe') els.app.classList.add('swiping'); else return; }
    dx = Math.max(0, x); main.style.transform = `translateX(${dx}px)`;
  }, { passive: true });
  const end = () => {
    if (mode !== 'swipe') return; mode = null;
    const fast = dx > 40 && dx / Math.max(1, Date.now() - st) > 0.5, go = dx > window.innerWidth * 0.33 || fast;
    main.style.transition = 'transform .18s ease-out'; main.style.transform = go ? `translateX(${window.innerWidth}px)` : '';
    setTimeout(() => { main.style.transition = ''; main.style.transform = ''; els.app.classList.remove('swiping'); if (go) goBack(); }, 190);
  };
  main.addEventListener('touchend', end); main.addEventListener('touchcancel', end);
})();

// ---- send grows while there is something to send
const syncHasText = () => els.composerWrap.classList.toggle('has-text', !!els.input.value.trim() || state.attachments.length > 0);
els.input.addEventListener('input', syncHasText);
const _renderAttachments = renderAttachments; renderAttachments = function () { _renderAttachments(); syncHasText(); };
const _autosize = autosize; autosize = function () { _autosize(); syncHasText(); };

// ---- / menu: the Bot's Claude Code commands (skills, project commands, built-ins), like typing / in the terminal
const slash = { cache: new Map(), idx: 0, list: [] };
function slashCommands(botId) {
  let c = slash.cache.get(botId);
  if (!c) { c = api(`/api/bots/${botId}/commands`).then((r) => r.commands || []).catch(() => []); slash.cache.set(botId, c); c.then((l) => { if (!l.length) setTimeout(() => slash.cache.get(botId) === c && slash.cache.delete(botId), 30000); }); }
  return c;
}
const hideSlash = () => { els.slashPop.classList.add('hidden'); slash.list = []; };
async function renderSlash() {
  const v = els.input.value, m = v.match(/^\/([\w:.-]*)$/);
  if (!m || !state.botId) return hideSlash();
  const q = m[1].toLowerCase(), botId = state.botId;
  if (!slash.cache.has(botId)) { els.slashPop.innerHTML = '<div class="slash-empty">Loading commands…</div>'; els.slashPop.classList.remove('hidden'); }
  const all = await slashCommands(botId);
  if (els.input.value !== v || state.botId !== botId) return;
  const list = all.filter((c) => c.name.toLowerCase().includes(q))
    .sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name));
  slash.list = list; slash.idx = Math.max(0, Math.min(slash.idx, list.length - 1));
  els.slashPop.classList.remove('hidden');
  if (!list.length) { els.slashPop.innerHTML = `<div class="slash-empty">${all.length ? 'No matching command' : 'Could not load commands'}</div>`; return; }
  els.slashPop.innerHTML = list.map((c, i) => `<button type="button" class="slash-opt${i === slash.idx ? ' sel' : ''}" data-i="${i}"><span class="slash-name">/${esc(c.name)}${c.hint ? ` <span class="slash-hint">${esc(c.hint)}</span>` : ''}</span>${c.description ? `<span class="slash-desc">${esc(c.description)}</span>` : ''}</button>`).join('');
  els.slashPop.querySelectorAll('.slash-opt').forEach((o) => (o.onmousedown = (e) => { e.preventDefault(); pickSlash(Number(o.dataset.i)); }));
  els.slashPop.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
}
function pickSlash(i) { const c = slash.list[i]; if (!c) return; els.input.value = `/${c.name} `; hideSlash(); autosize(); els.input.focus(); els.input.setSelectionRange(els.input.value.length, els.input.value.length); }
els.input.addEventListener('input', () => { slash.idx = 0; renderSlash(); });
els.input.addEventListener('keydown', (e) => {
  if (els.slashPop.classList.contains('hidden') || !slash.list.length) { if (e.key === 'Escape') hideSlash(); return; }
  const n = slash.list.length;
  if (e.key === 'ArrowDown') { e.preventDefault(); slash.idx = (slash.idx + 1) % n; renderSlash(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); slash.idx = (slash.idx - 1 + n) % n; renderSlash(); }
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); pickSlash(slash.idx); }
  else if (e.key === 'Escape') hideSlash();
}, true);
const _autosize2 = autosize; autosize = function () { _autosize2(); if (!els.input.value) hideSlash(); };

// ---- account sheet (top-left avatar): who is logged in, plan usage left, vault, connectors, notifications
const fmtReset = (ts) => { if (!ts) return ''; const d = ts - Date.now(); if (d <= 0) return 'resets now'; if (d < 3600e3) return `resets in ${Math.ceil(d / 60e3)} min`; if (d < 86400e3) return `resets in ${Math.round(d / 3600e3)} h`; return `resets ${new Date(ts).toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`; };
const PLAN_NAMES = { max: 'Max', pro: 'Pro', team: 'Team', enterprise: 'Enterprise', free: 'Free' };
async function loadAccount() {
  let a; try { a = await api('/api/account'); } catch { els.acctEmail.textContent = 'Could not load the account'; return; }
  const initial = (a.email || 'C')[0].toUpperCase();
  els.acctAvatar.textContent = initial; els.acctAvatar2.textContent = initial;
  els.acctName.textContent = a.email ? a.email.split('@')[0] : 'Your Claude account';
  els.acctEmail.textContent = [a.email, PLAN_NAMES[String(a.plan).toLowerCase()] || a.plan].filter(Boolean).join(' · ') || 'Claude subscription';
  const L = a.limits || [];
  if (!L.length) { els.acctUsagePct.textContent = ''; els.acctUsageSub.textContent = 'Shows up after a Bot replies'; els.acctUsageDetail.innerHTML = ''; return; }
  const top = L.reduce((m, x) => (x.utilization > m.utilization ? x : m), L[0]);
  els.acctUsagePct.textContent = `${Math.round(top.utilization)}%`;
  els.acctUsagePct.classList.toggle('warn', top.utilization >= 80);
  els.acctUsageSub.textContent = `${top.label}${top.resetsAt ? ' · ' + fmtReset(top.resetsAt) : ''}`;
  els.acctUsageDetail.innerHTML = L.map((x) => `<div class="u-line"><div class="u-head"><span>${esc(x.label)}</span><span>${Math.round(x.utilization)}% used</span></div><div class="u-bar"><span style="width:${Math.min(100, Math.max(0, x.utilization))}%" class="${x.utilization >= 80 ? 'warn' : ''}"></span></div><div class="u-sub">${esc(fmtReset(x.resetsAt))}${x.seenAt ? ` · as of ${fmtAgo(x.seenAt)} ago` : ''}</div></div>`).join('') + (a.source === 'replies' ? '<p class="u-note">From the latest Bot replies.</p>' : '');
}
els.btnAccount.onclick = () => { els.accountDialog.showModal(); loadAccount(); };
els.acctClose.onclick = () => els.accountDialog.close();
els.accountDialog.addEventListener('click', (e) => { if (e.target === els.accountDialog) els.accountDialog.close(); });
els.acctUsageRow.onclick = () => els.acctUsageDetail.classList.toggle('hidden');
loadAccount();

// ---- document viewer: tap a doc card → read it in a sheet (Markdown rendered), share or download from there
const fmtBytes = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
const docSizeSeen = new Map();
function fillDocSizes(root = document) {
  for (const meta of root.querySelectorAll('.doc-card .doc-meta:not([data-sized])')) {
    meta.dataset.sized = '1'; const href = meta.closest('.doc-card').getAttribute('href');
    const done = (n) => { if (n != null) meta.textContent = `${meta.dataset.ext} · ${fmtBytes(n)}`; };
    if (docSizeSeen.has(href)) { done(docSizeSeen.get(href)); continue; }
    fetch(href, { headers: { Range: 'bytes=0-0', ...(token ? { 'x-cc-token': token } : {}) } }).then((r) => { const total = Number((r.headers.get('content-range') || '').split('/')[1]); if (total) { docSizeSeen.set(href, total); done(total); } }).catch(() => {});
  }
}
new MutationObserver(() => fillDocSizes()).observe(els.thread, { childList: true, subtree: true });
let docOpen = null;
async function openDoc(card) {
  const href = card.getAttribute('href'), p = card.dataset.doc, name = p.split('/').pop(), ext = name.split('.').pop().toLowerCase();
  els.docTitle.textContent = name; els.docBody.innerHTML = '<p class="muted">Loading…</p>'; els.docDialog.showModal(); els.docBody.scrollTop = 0;
  try {
    const r = await fetch(href, { headers: token ? { 'x-cc-token': token } : {} }); if (!r.ok) throw new Error(r.status === 404 ? 'the file is gone' : r.status === 403 ? "it is outside this Bot's folder" : r.statusText);
    const text = await r.text(); docOpen = { name, text, type: r.headers.get('content-type') || 'text/plain' };
    if (ext === 'md' || ext === 'markdown') { els.docBody.className = 'doc-body md'; els.docBody.innerHTML = renderMd(text, { media: false }); els.docBody.querySelectorAll('pre code').forEach((c) => hljs.highlightElement(c)); const dir = p.slice(0, p.lastIndexOf('/')); for (const img of els.docBody.querySelectorAll('img[src]')) { const src = img.getAttribute('src'); if (!/^(https?:|data:|\/api\/)/.test(src)) img.src = fileUrl(src.startsWith('/') ? src : `${dir}/${src.replace(/^\.\//, '')}`); } }
    else if (ext === 'json') { let pretty = text; try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch {} els.docBody.className = 'doc-body md'; els.docBody.innerHTML = renderMd('```json\n' + pretty + '\n```', { media: false }); }
    else { els.docBody.className = 'doc-body'; els.docBody.innerHTML = `<pre class="plain">${esc(text)}</pre>`; }
  } catch (e) { els.docBody.innerHTML = `<p class="muted">Could not open it: ${esc(e.message)}</p>`; docOpen = null; }
}
document.addEventListener('click', (e) => { const card = e.target.closest('.doc-card'); if (!card) return; e.preventDefault(); openDoc(card); });
els.docClose.onclick = () => els.docDialog.close();
els.docShare.onclick = async () => {
  if (!docOpen) return;
  const file = new File([docOpen.text], docOpen.name, { type: docOpen.name.endsWith('.md') ? 'text/markdown' : 'text/plain' });
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: docOpen.name }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: docOpen.name }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};


// ---- decision cards: a Bot posts a question with 2-4 options; one tap answers it and the choice goes back to the Bot as a message.
function decisionCard(d, { inbox = false } = {}) {
  const el = document.createElement('div'); el.className = 'decision' + (inbox ? ' inbox' : ''); if (d.id) el.dataset.id = d.id;
  el.dataset.bot = d.botId || ''; el._d = d;
  paintDecision(el, d, inbox); return el;
}
const decExpanded = new Set(); // inbox cards the user opened; the rest stay one line
function paintDecision(el, d, inbox = el.classList.contains('inbox')) {
  el._d = d;
  if (inbox && d.status === 'open' && !decExpanded.has(d.id)) {
    const bot = state.bots.find((b) => b.id === d.botId);
    el.classList.add('compact'); el.classList.remove('answered');
    el.innerHTML = `<div class="dec-line"><span class="dec-icon">◆</span><span class="dec-line-text"><b>${esc(bot?.name || 'A Bot')}</b> ${esc(d.question || '')}</span><span class="dec-ago">${esc(fmtAgo(d.createdAt))}</span><button class="dec-x" title="Dismiss" aria-label="Dismiss">✕</button></div>${(d.options || []).length === 2 ? `<div class="dec-quick">${d.options.map((o, i) => `<button class="dq${i === 0 ? ' yes' : ' no'}${i === d.recommended ? ' rec' : ''}" data-i="${i}">${esc(o)}</button>`).join('')}</div>` : ''}`;
    el.onclick = (e) => { if (e.target.closest('.dec-x')) return dismissDecision(el, d); const q = e.target.closest('.dq'); if (q) { el.classList.add('leaving'); return setTimeout(() => decide(d, { choice: +q.dataset.i }), 160); } decExpanded.add(d.id); el.onclick = null; paintDecision(el, d, true); };
    return;
  }
  el.classList.remove('compact'); el.onclick = null;
  const bot = state.bots.find((b) => b.id === d.botId);
  const open = d.status === 'open', opts = d.options || [];
  const done = d.status === 'replied' ? '↩ Answered in the chat' : d.status === 'answered' ? `✓ Decided: <b>${esc(d.answer)}</b>${d.note ? ` · “${esc(d.note)}”` : ''}` : d.status === 'dismissed' ? 'Dismissed' : d.status === 'posting' ? 'Posting…' : 'This card is no longer open';
  el.classList.toggle('answered', !open);
  el.innerHTML = `<div class="dec-head"><span class="dec-icon">◆</span><span>${inbox ? `<b>${esc(bot?.name || 'A Bot')}</b> · ` : ''}Decision</span>${inbox ? '<span class="dec-ago">' + esc(fmtAgo(d.createdAt)) + '</span>' : ''}</div>
    <div class="dec-q">${esc(d.question || '')}</div>${d.context ? `<div class="dec-ctx md">${renderMd(d.context, { media: false })}</div>` : ''}
    ${open ? `<div class="dec-opts${opts.length === 2 ? ' two' : ''}">${opts.map((o, i) => `<button class="pill${i === d.recommended ? ' primary' : ''}" data-i="${i}">${esc(o)}${i === d.recommended ? ' <span class="dec-rec">recommended</span>' : ''}</button>`).join('')}<button class="pill ghost" data-other>Other…</button></div>
    <div class="dec-other hidden"><textarea rows="2" placeholder="Your answer, or a note to send with an option"></textarea><div class="dec-other-actions"><button class="pill primary" data-send>Send</button><button class="pill ghost" data-dismiss>Dismiss card</button></div></div>` : `<div class="dec-done">${done}</div>`}`;
  if (inbox) el.querySelector('.dec-head').innerHTML += '<button class="dec-collapse" title="Collapse">▴</button><button class="dec-x" title="Dismiss" aria-label="Dismiss">✕</button>';
  if (inbox) el.querySelector('.dec-head').onclick = (e) => { if (e.target.closest('.dec-x')) return dismissDecision(el, d); if (e.target.closest('.dec-collapse')) { decExpanded.delete(d.id); paintDecision(el, d, true); } else openBot(d.botId); };
  if (!open) return;
  const note = () => el.querySelector('textarea').value.trim();
  el.querySelector('.dec-opts').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.other !== undefined) { el.querySelector('.dec-other').classList.toggle('hidden'); el.querySelector('textarea').focus(); return; }
    decide(d, { choice: +b.dataset.i, note: note() });
  };
  el.querySelector('.dec-other').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.send !== undefined) { if (note()) decide(d, { note: note() }); }
    else if (b.dataset.dismiss !== undefined) decide(d, { dismiss: true });
  };
}
function decide(d, body) {
  if (!d.id) return;
  wsSend({ type: 'decide', botId: d.botId, id: d.id, ...body });
  // optimistic: the server broadcast confirms it a moment later
  const local = { ...d, status: body.dismiss ? 'dismissed' : 'answered', answer: body.choice != null ? d.options[body.choice] : 'Other', note: body.note || '' };
  document.querySelectorAll(`.decision[data-id="${d.id}"]`).forEach((el) => paintDecision(el, local));
}
function refreshDecisionEl(el) {
  const d = state.decisions.find((x) => x.id === el.dataset.id);
  if (d && el._d && el._d.status === d.status && el._d.id === d.id) return; // unchanged: repainting would wipe a half-typed answer
  if (d) paintDecision(el, d); else if (el._d?.status === 'posting') paintDecision(el, { ...el._d, status: 'expired' });
}
function renderDecisions() {
  const open = state.decisions.filter((d) => d.status === 'open').sort((a, b) => b.createdAt - a.createdAt);
  const list = els.decisionList; if (!list) return;
  const sig = open.map((d) => d.id).join(',');
  if (list.dataset.sig !== sig) {
    list.dataset.sig = sig; list.innerHTML = '';
    if (open.length) { const h = document.createElement('div'); h.className = 'dec-title'; h.textContent = `Decisions · ${open.length}`; list.appendChild(h); }
    for (const d of open) list.appendChild(decisionCard(d, { inbox: true }));
  }
  list.classList.toggle('hidden', !open.length);
  document.querySelectorAll('#thread .decision[data-id]').forEach(refreshDecisionEl);
  const n = pendingTotal() + open.length; document.title = n ? `(${n}) Code Crew` : 'Code Crew';
}


// ---- message actions (react · reply · more), like Slack/Claude: under every reply, on hover/tap for your own messages.
const REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '✅', '🙏', '🔥'];
const ICONS = {
  react: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/></svg>',
  reply: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v5"/></svg>',
  more: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
  thread: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 10.5h7M8.5 13.5h4.5"/></svg>',
  copy: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
};
function addMsgActions(el, { raw, key, md, user }) {
  if (key) { const r = document.createElement('div'); r.className = 'reactions'; r.dataset.key = key; el.appendChild(r); paintReactions(r, key); }
  const bar = document.createElement('div'); bar.className = 'msg-actions';
  const inThread = !!currentBot()?.isThread;
  bar.innerHTML = `${key ? `<button data-a="react" title="React">${ICONS.react}</button>` : ''}<button data-a="reply" title="Reply (quote)">${ICONS.reply}</button>${inThread ? '' : `<button data-a="thread" title="Reply in thread">${ICONS.thread}</button>`}<button data-a="more" title="More">${ICONS.more}</button>`;
  bar.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
    if (b.dataset.a === 'reply') return quoteReply(raw);
    if (b.dataset.a === 'thread') { const open = state.threads.find((t) => t.threadOf === state.botId && (key || el.dataset.key) && t.rootKey === (key || el.dataset.key)); return open ? openBot(open.id) : startThread(key || el.dataset.key || null, (md || el.querySelector('.bubble'))?.innerText.trim() || raw); }
    const plain = () => (md || el.querySelector('.bubble'))?.innerText.trim() || raw;
    const items = b.dataset.a === 'react'
      ? REACTIONS.map((x) => ({ emoji: x, run: () => wsSend({ type: 'react', botId: state.botId, key, emoji: x }) }))
      : [{ label: 'Copy', copy: true, run: () => copyText(raw) }, ...(md ? [{ label: 'Copy as plain text', copy: true, run: () => copyText(plain()) }] : []), ...(key ? [{ label: 'Copy message ID', copy: true, run: () => copyText(key) }] : [])];
    openMsgMenu(b, items, b.dataset.a === 'react');
  };
  el.appendChild(bar);
  // Slack-style: tapping a reply's text opens its thread (or starts one). Links, code, media, buttons and text selection keep working.
  if (!inThread && md) md.addEventListener('click', (e) => {
    if (e.target.closest('a, button, code, pre, img, video, audio, table, .doc-card, summary, details') || String(getSelection()).trim()) return;
    const k = key || el.dataset.key, open = threadFor(k);
    if (open) openBot(open.id); else startThread(k || null, md.innerText.trim() || raw);
  });
}
const threadFor = (key) => key ? state.threads.find((t) => t.threadOf === state.botId && t.rootKey === key) : null;
function paintReactions(r, key) {
  const list = state.reactions[key] || [];
  r.innerHTML = list.map((x) => `<button class="reaction" data-e="${x}" title="Remove">${x}</button>`).join('');
  r.onclick = (e) => { const b = e.target.closest('.reaction'); if (b) wsSend({ type: 'react', botId: state.botId, key, emoji: b.dataset.e }); };
}
let msgMenu = null;
function closeMsgMenu() { msgMenu?.remove(); msgMenu = null; }
function openMsgMenu(anchor, items, emojis) {
  closeMsgMenu();
  msgMenu = document.createElement('div'); msgMenu.className = 'msg-menu' + (emojis ? ' emojis' : '');
  msgMenu.innerHTML = items.map((it, i) => `<button data-i="${i}">${emojis ? it.emoji : `${it.icon ?? ICONS.copy}<span class="mm-text"><span>${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>`}</button>`).join('');
  msgMenu.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
    const it = items[+b.dataset.i]; const ok = await it.run();
    if (it.copy && ok !== false) { try { navigator.vibrate?.(15); } catch {} b.querySelector('.mm-text span').textContent = 'Copied'; setTimeout(closeMsgMenu, 450); } else closeMsgMenu();
  };
  document.body.appendChild(msgMenu);
  const a = anchor.getBoundingClientRect(), w = msgMenu.offsetWidth, h = msgMenu.offsetHeight;
  const left = Math.min(Math.max(8, a.left), window.innerWidth - w - 8);
  const top = a.bottom + 6 + h > window.innerHeight - 8 ? a.top - h - 6 : a.bottom + 6;
  msgMenu.style.left = `${left}px`; msgMenu.style.top = `${top}px`;
}
document.addEventListener('click', (e) => { if (msgMenu && !e.target.closest('.msg-menu')) closeMsgMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMsgMenu(); });
els.scroll?.addEventListener('scroll', closeMsgMenu, { passive: true });
function quoteReply(raw) {
  let q = String(raw).trim().replace(/\n\[Attached files\][\s\S]*$/, '');
  if (q.length > 400) q = q.slice(0, 400).replace(/\s+\S*$/, '') + ' …';
  const quoted = q.split('\n').map((l) => `> ${l}`).join('\n');
  const rest = els.input.value.replace(/^(?:> [^\n]*\n)+\n*/, '');
  els.input.value = `${quoted}\n\n${rest}`;
  autosize(); els.input.focus(); els.input.selectionStart = els.input.selectionEnd = els.input.value.length;
  els.input.dispatchEvent(new Event('input'));
}


// ---- threads: a side conversation with the same Bot, branched from a message (or started fresh from the composer).
function startThread(rootKey, rootText) { state.pendingThread = { rootKey, rootText: rootText || '' }; renderThreadBar(); els.input.focus(); }
function renderThreadBar() {
  const pt = state.pendingThread;
  els.threadBar.classList.toggle('hidden', !pt);
  els.btnNewThread.classList.toggle('on', !!pt);
  if (pt) els.threadBarText.innerHTML = pt.rootText ? `🧵 Reply in thread to <span class="muted">“${esc(pt.rootText.replace(/\s+/g, ' ').slice(0, 90))}”</span>` : '🧵 <b>New thread</b> <span class="muted">— your message starts it</span>';
}
els.btnNewThread.onclick = () => { if (state.pendingThread) { state.pendingThread = null; renderThreadBar(); } else startThread(null, ''); };
els.threadBarClose.onclick = () => { state.pendingThread = null; renderThreadBar(); };
const fmtThreadMeta = (t) => `${t.busy ? 'working… · ' : ''}${t.replies ? `${t.replies} repl${t.replies === 1 ? 'y' : 'ies'}` : 'new'} · ${fmtAgo(t.lastActivity)}`;
function paintThreadChips() {
  const b = currentBot(); if (!b || b.isThread) return;
  els.thread.querySelectorAll('.thread-chip').forEach((c) => c.remove());
  for (const t of state.threads.filter((x) => x.threadOf === b.id && x.rootKey)) {
    const anchor = els.thread.querySelector(`.msg[data-key="${CSS.escape(t.rootKey)}"]`); if (!anchor) continue;
    const chip = document.createElement('button'); chip.className = 'thread-chip' + (t.busy ? ' busy' : '');
    chip.innerHTML = `<span class="tc-title">🧵 ${esc(t.title || 'Thread')}</span>${t.tldr ? `<span class="tc-tldr">${esc(t.tldr)}</span>` : ''}<span class="tc-meta">${esc(fmtThreadMeta(t))}</span>`;
    chip.dataset.id = t.id; chip.classList.toggle('active', els.threadPanel.dataset.id === t.id);
    chip.onclick = () => openBot(t.id);
    const bar = anchor.querySelector(':scope > .msg-actions'); anchor.insertBefore(chip, bar || null);
  }
}
function paintThreadRoot() {
  els.thread.querySelector('.thread-root')?.remove();
  const b = currentBot(); if (!b?.isThread) return;
  const t = b.thread, el = document.createElement('div'); el.className = 'msg thread-root';
  el.innerHTML = `<div class="tr-card"><div class="tr-kicker">Thread with <b>${esc(b.parentName)}</b> · <button class="tr-back">open main chat</button></div><div class="tr-title">${esc(t.title || 'New thread')}</div>${t.tldr ? `<div class="tr-tldr">TL;DR · ${esc(t.tldr)}</div>` : ''}${t.rootText ? `<div class="tr-root">${esc(t.rootText.slice(0, 400))}${t.rootText.length > 400 ? '…' : ''}</div>` : ''}</div>`;
  el.querySelector('.tr-back').onclick = () => openBot(t.threadOf);
  els.thread.insertBefore(el, els.thread.firstChild);
}
els.btnThreads.onclick = (e) => {
  e.stopPropagation();
  const list = state.threads.filter((t) => t.threadOf === state.botId).sort((a, b) => b.lastActivity - a.lastActivity);
  openMsgMenu(els.btnThreads, list.map((t) => ({ icon: ICONS.thread, label: t.title || 'New thread', sub: `${t.tldr ? t.tldr + ' · ' : ''}${fmtThreadMeta(t)}`, run: () => openBot(t.id) })));
};

// Dismiss from the sidebar in one tap: the card slides away; the Bot is not told (same as "Dismiss card").
function dismissDecision(el, d) {
  el.classList.add('leaving');
  setTimeout(() => { decide(d, { dismiss: true }); el.remove(); const n = els.decisionList.querySelectorAll('.decision').length; const h = els.decisionList.querySelector('.dec-title'); if (h) h.textContent = `Decisions · ${n}`; els.decisionList.classList.toggle('hidden', !n); }, 160);
}


// ---- open where it matters: land on the latest message, mark what is new since you last read, offer a jump back and a TL;DR.
const chatMsgs = () => [...els.thread.querySelectorAll(':scope > .msg:not(.thread-root)')];
function scrollToEl(el, pad = 8) { const s = els.scroll; s.scrollTop += el.getBoundingClientRect().top - s.getBoundingClientRect().top - pad; }
function openAtNew() {
  els.catchup.classList.add('hidden'); els.catchup.innerHTML = ''; state.anchor = null; state.sentRead = state.readKey;
  els.thread.querySelector('.new-divider')?.remove();
  const msgs = chatMsgs();
  if (!msgs.length) { state.stick = true; scrollBottom(true); return; }
  const readEl = state.readKey && els.thread.querySelector(`:scope > .msg[data-key="${CSS.escape(state.readKey)}"]`);
  const firstNew = readEl ? msgs[msgs.indexOf(readEl) + 1] : null;
  const fresh = firstNew ? msgs.slice(msgs.indexOf(firstNew)) : [];
  if (firstNew) { const d = document.createElement('div'); d.className = 'new-divider'; d.innerHTML = '<span>New</span>'; els.thread.insertBefore(d, firstNew); }
  // Land on the start of the latest message; a short one simply shows at the bottom.
  const last = msgs[msgs.length - 1];
  requestAnimationFrame(() => {
    if (last.offsetHeight > els.scroll.clientHeight * 0.75) { state.stick = false; state.anchor = last; scrollToEl(last); }
    else { state.stick = true; scrollBottom(true); }
    setTimeout(noteSeen, 1200);
  });
  if (fresh.length) showCatchup(fresh, firstNew);
}
function showCatchup(fresh, firstNew) {
  const n = fresh.length, size = fresh.reduce((a, el) => a + (el.innerText || '').length, 0);
  const bar = els.catchup; bar.classList.remove('hidden');
  bar.innerHTML = `<div class="cu-row"><span class="cu-dot"></span><span class="cu-text"><b>${n} new</b> since you last read</span><button class="cu-btn" data-a="first">↑ First new</button><button class="cu-btn" data-a="tldr">✨ TL;DR</button><button class="cu-x" data-a="close" aria-label="Close">✕</button></div><div class="cu-body hidden md"></div>`;
  const body = bar.querySelector('.cu-body'), forKey = state.readKey, botId = state.botId;
  const loadTldr = async () => {
    body.classList.remove('hidden'); body.innerHTML = '<span class="muted">Reading what you missed…</span>';
    try {
      const r = await api(`/api/bots/${botId}/catchup`, { method: 'POST', body: { after: forKey } });
      if (state.botId !== botId) return;
      body.innerHTML = r.summary ? renderMd(r.summary) : '<span class="muted">Short enough to read as is.</span>';
    } catch (e) { body.innerHTML = `<span class="muted">Couldn't summarize: ${esc(e.message)}</span>`; }
  };
  bar.onclick = (e) => {
    const a = e.target.closest('button')?.dataset.a; if (!a) return;
    if (a === 'first') { state.stick = false; state.anchor = null; scrollToEl(els.thread.querySelector('.new-divider') || firstNew, 4); }
    if (a === 'tldr') body.classList.contains('hidden') || !body.innerHTML ? loadTldr() : body.classList.add('hidden');
    if (a === 'close') bar.classList.add('hidden');
  };
  if (n >= 3 || size > 1500) loadTldr(); // a lot happened: summarize without being asked
}
// Remember the newest message you have actually had on screen (server-side, so every device agrees).
function noteSeen() {
  if (!state.botId || document.hidden) return;
  const s = els.scroll.getBoundingClientRect(); let key = null;
  for (const el of els.thread.querySelectorAll(':scope > .msg[data-key]')) if (el.getBoundingClientRect().top < s.bottom - 40) key = el.dataset.key;
  if (!key || key === state.sentRead) return;
  clearTimeout(state.readTimer);
  state.readTimer = setTimeout(() => { state.sentRead = key; wsSend({ type: 'read', botId: state.botId, key }); }, 800);
}
let seenThrottle = 0;
els.scroll.addEventListener('scroll', () => { const now = Date.now(); if (now - seenThrottle > 400) { seenThrottle = now; noteSeen(); } }, { passive: true });
for (const ev of ['wheel', 'touchstart', 'keydown']) els.scroll.addEventListener(ev, () => { state.anchor = null; }, { passive: true });
// Images and videos load after the jump and push content around: keep the landing spot (or the bottom) in place.
new ResizeObserver(() => { if (state.anchor) scrollToEl(state.anchor); else if (state.stick) scrollBottom(true); }).observe(els.thread);

// ---- drafts: what you type belongs to that chat; switching chats keeps it there (and survives a reload).
const DRAFTS_KEY = 'cc-drafts';
const draftsAll = () => { try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}'); } catch { return {}; } };
function saveDraft() {
  if (!state.botId) return;
  const all = draftsAll(), v = els.input.value;
  if (v.trim()) all[state.botId] = v; else delete all[state.botId];
  try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(all)); } catch {}
}
function loadDraft() { els.input.value = draftsAll()[state.botId] || ''; autosize(); }
let draftTimer = null;
els.input.addEventListener('input', () => { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 400); });
// Cmd/Ctrl+Enter also sends from a card's "Other…" box.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
  const ta = e.target.closest?.('.dec-other textarea'); if (!ta) return;
  e.preventDefault(); ta.closest('.dec-other').querySelector('[data-send]')?.click();
});
