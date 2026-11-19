// Lumen Code gate: sits between tailscale serve (:8443) and OpenCode (127.0.0.1:4096).
// The Lumen page signs in with its own form (POST /__lumen/signin); the gate checks the login
// against the secrets files, sets an HttpOnly cookie, and adds OpenCode's Basic auth itself.
// It never sends WWW-Authenticate, so the browser never shows its own password prompt.
// Runs on Bun (Lumen starts it with OpenCode's own binary and BUN_BE_BUN=1). Never logs passwords.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = process.env.LUMEN_ROOT || 'C:\\AI';
const SECRETS = path.join(ROOT, 'secrets');
const PORT = +(process.env.LUMEN_GATE_PORT || 4097);
const UP = process.env.LUMEN_GATE_UPSTREAM || 'http://127.0.0.1:4096';
const SECURE = process.env.LUMEN_GATE_INSECURE ? '' : '; Secure';
const COOKIE = 'lumen_code', MAX_AGE = 30 * 24 * 3600;
const STORE = path.join(SECRETS, 'code-gate-sessions.txt');   // sha256 of each token + expiry, never the token itself
// Hide OpenCode's session tab strip (it lists sessions from every project); Lumen's own Projects page replaces it.
// frame.js tells the Lumen page (same host, port 443) which chat is open, so re-entering a project reopens it.
const INJECT = '<style id="lumen-gate">header[data-slot="titlebar-v2"]{display:none!important}</style><script src="/__lumen/frame.js"></script>';
const FRAME_JS = `(function(){if(parent===window)return;var o=location.protocol+'//'+location.hostname,last='';
function tell(){var p=location.pathname;if(p===last)return;last=p;try{parent.postMessage({lumen:'oc-loc',path:p},o)}catch(e){}}
['pushState','replaceState'].forEach(function(k){var f=history[k];history[k]=function(){var r=f.apply(this,arguments);tell();return r}});
addEventListener('popstate',tell);setInterval(tell,1000);tell()})();`;

const read = f => { try { return fs.readFileSync(path.join(SECRETS, f), 'utf8').trim(); } catch { return ''; } };
const login = () => ({ user: read('opencode-username.txt') || 'opencode', pass: read('opencode-password.txt') });
const basic = () => { const l = login(); return 'Basic ' + Buffer.from(`${l.user}:${l.pass}`).toString('base64'); };
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const same = (a, b) => { const x = Buffer.from(sha(a)), y = Buffer.from(sha(b)); return crypto.timingSafeEqual(x, y); };

let sessions = new Map();   // hash -> expiry (ms)
try { for (const line of fs.readFileSync(STORE, 'utf8').split(/\r?\n/)) { const [h, e] = line.split(' '); if (h && +e > Date.now()) sessions.set(h, +e); } } catch {}
const save = () => { try { fs.writeFileSync(STORE, [...sessions].map(([h, e]) => `${h} ${e}`).join('\n')); } catch {} };
function tokenOf(req) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-f0-9]{64})'));
  return m ? m[1] : null;
}
function signedIn(req) { const t = tokenOf(req); if (!t) return false; const e = sessions.get(sha(t)); return !!e && e > Date.now(); }

// Only Lumen's own page (same host, any port) may call the sign-in endpoints.
function allowedOrigin(req) {
  const o = req.headers.get('origin'); if (!o) return null;
  try { const host = (req.headers.get('host') || '').replace(/:\d+$/, ''); return new URL(o).hostname === host ? o : null; } catch { return null; }
}
const cors = o => o ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin' } : {};

let fails = 0, lockUntil = 0;
async function api(req, url) {
  const o = allowedOrigin(req), h = { ...cors(o), 'Cache-Control': 'no-store' };
  if (req.method === 'OPTIONS') return new Response(null, { status: o ? 204 : 403, headers: h });
  if (url.pathname === '/__lumen/check') return new Response(null, { status: signedIn(req) ? 204 : 401, headers: h });
  if (req.method !== 'POST' || !o) return new Response(null, { status: 403, headers: h });
  if (url.pathname === '/__lumen/signout') {
    const t = tokenOf(req); if (t) { sessions.delete(sha(t)); save(); }
    return new Response(null, { status: 204, headers: { ...h, 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${SECURE}` } });
  }
  if (url.pathname !== '/__lumen/signin') return new Response(null, { status: 404, headers: h });
  if (Date.now() < lockUntil) return Response.json({ error: 'Too many tries. Wait a minute.' }, { status: 429, headers: h });
  let body = {}; try { body = await req.json(); } catch {}
  const l = login(), ok = !!l.pass && same(String(body.username || ''), l.user) & same(String(body.password || ''), l.pass);
  if (!ok) {
    if (++fails >= 5) { fails = 0; lockUntil = Date.now() + 60000; }
    await Bun.sleep(400);
    return Response.json({ error: 'Wrong username or password.' }, { status: 401, headers: h });
  }
  fails = 0;
  const t = crypto.randomBytes(32).toString('hex');
  for (const [k, e] of sessions) if (e < Date.now()) sessions.delete(k);
  sessions.set(sha(t), Date.now() + MAX_AGE * 1000); save();
  return new Response(null, { status: 204, headers: { ...h, 'Set-Cookie': `${COOKIE}=${t}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${SECURE}` } });
}

const LOCKED = '<!doctype html><meta charset="utf-8"><title>Sign in</title><body style="margin:0;display:grid;place-items:center;height:100vh;background:#07070a;color:#9a97a3;font:14px system-ui">Sign in from Lumen to open the workspace.</body>';

function upstreamHeaders(req) {
  const h = new Headers(req.headers);
  h.set('authorization', basic()); h.set('accept-encoding', 'identity');
  // Keep Lumen's cookie away from OpenCode.
  const c = (h.get('cookie') || '').split(/;\s*/).filter(x => x && !x.startsWith(COOKIE + '=')).join('; ');
  c ? h.set('cookie', c) : h.delete('cookie');
  h.delete('host');
  return h;
}

Bun.serve({
  hostname: '127.0.0.1', port: PORT, idleTimeout: 0,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === '/__lumen/frame.js') return new Response(FRAME_JS, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' } });
    if (url.pathname.startsWith('/__lumen/')) return api(req, url);
    if (!signedIn(req)) return new Response(LOCKED, { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    const target = UP + url.pathname + url.search;
    if ((req.headers.get('upgrade') || '').toLowerCase() === 'websocket') {
      const proto = req.headers.get('sec-websocket-protocol');
      return server.upgrade(req, { data: { target: target.replace(/^http/, 'ws'), proto } }) ? undefined : new Response('upgrade failed', { status: 400 });
    }
    let res;
    try {
      res = await fetch(target, { method: req.method, headers: upstreamHeaders(req), body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body, redirect: 'manual', duplex: 'half' });
    } catch { return new Response('The workspace is not running.', { status: 502 }); }
    const h = new Headers(res.headers); h.delete('www-authenticate'); h.delete('content-encoding');
    if ((h.get('content-type') || '').startsWith('text/html')) {
      const html = (await res.text()).replace('</head>', INJECT + '</head>');
      h.delete('content-length');
      return new Response(html, { status: res.status, headers: h });
    }
    return new Response(res.body, { status: res.status, headers: h });
  },
  websocket: {
    open(ws) {
      const q = ws.data.q = [];
      const up = ws.data.up = new WebSocket(ws.data.target, { headers: { authorization: basic() }, protocols: ws.data.proto ? ws.data.proto.split(/,\s*/) : undefined });
      up.binaryType = 'arraybuffer';
      up.onopen = () => { for (const m of q.splice(0)) up.send(m); };
      up.onmessage = e => ws.send(e.data);
      up.onclose = e => { try { ws.close(e.code === 1005 ? 1000 : e.code, e.reason); } catch {} };
      up.onerror = () => { try { ws.close(1011); } catch {} };
    },
    message(ws, m) { const up = ws.data.up; up.readyState === 1 ? up.send(m) : ws.data.q.push(m); },
    close(ws) { try { ws.data.up.close(); } catch {} },
  },
});
console.log(`Lumen Code gate on 127.0.0.1:${PORT} -> ${UP}`);
