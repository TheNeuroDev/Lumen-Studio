// C:\AI\tools\oc-rename.js - re-points OpenCode's saved sessions when a Lumen Code project folder is renamed.
// Run on OpenCode's own binary in Bun mode (it has bun:sqlite built in):
//   set BUN_BE_BUN=1 && lumen-gate.exe oc-rename.js <opencode.db> <old folder> <new folder> <backup dir>
// OpenCode keys every session to its folder (session.directory / session.path, the session events it replays,
// and each message's path.cwd). Lumen projects have no git commits, so they all sit in OpenCode's "global"
// project and the folder is the only link. Prints one JSON line; exit code 0 = ok.
import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

const [dbPath, oldDir, newDir, backupDir] = process.argv.slice(2);
const out = o => { console.log(JSON.stringify(o)); process.exit(o.ok ? 0 : 1); };
if (!dbPath || !oldDir || !newDir) out({ ok: false, error: 'usage: oc-rename.js <db> <old> <new> [backupDir]' });

const norm = s => String(s).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const rel = s => String(s).replace(/^[A-Za-z]:/, '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
const O = norm(oldDir), OR = rel(oldDir).toLowerCase(), NR = rel(newDir);
// Folder value (either slash style, any case) -> the same value under the new folder, in its own slash style.
function moveDir(v) {
  if (typeof v !== 'string') return v;
  const n = norm(v);
  if (n !== O && !n.startsWith(O + '/')) return v;
  const tail = v.replace(/[\\/]+$/, '').slice(oldDir.replace(/[\\/]+$/, '').length);
  const nd = newDir.replace(/[\\/]+$/, '');
  return (v.includes('\\') ? nd.replace(/\//g, '\\') : nd.replace(/\\/g, '/')) + tail;
}
// session.path is the folder relative to the worktree ("/" for the global project): Lumen/Code/<name>
function movePath(v) {
  if (typeof v !== 'string') return v;
  const n = v.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
  if (n !== OR && !n.startsWith(OR + '/')) return v;
  return NR + v.replace(/\\/g, '/').replace(/^\/+/, '').slice(OR.length);
}
// Walks parsed JSON and moves folder-valued fields. Returns true when something changed.
function walk(o) {
  let ch = false;
  if (!o || typeof o !== 'object') return false;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'string') {
      const nv = (k === 'directory' || k === 'cwd' || k === 'worktree') ? moveDir(v) : (k === 'path' ? movePath(v) : v);
      if (nv !== v) { o[k] = nv; ch = true; }
    } else if (v && typeof v === 'object') { if (walk(v)) ch = true; }
  }
  return ch;
}

let db;
try {
  db = new Database(dbPath);
  db.exec('PRAGMA busy_timeout = 10000');
  let backup = null;
  if (backupDir) {
    mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.(\d+)Z$/, '-$1');
    backup = join(backupDir, `opencode-${stamp}.db`);
    if (existsSync(backup)) unlinkSync(backup);
    db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
    // keep the newest 5
    const old = readdirSync(backupDir).filter(f => /^opencode-\d{8}-\d{6}(-\d+)?\.db$/.test(f)).sort();
    for (const f of old.slice(0, Math.max(0, old.length - 5))) { try { unlinkSync(join(backupDir, f)); } catch {} }
  }
  const leaf = oldDir.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  const like = '%' + leaf.replace(/[%_\\]/g, c => '\\' + c) + '%';
  const n = { sessions: 0, events: 0, messages: 0, dirs: 0 };
  db.transaction(() => {
    for (const s of db.query('SELECT id, directory, path FROM session').all()) {
      const d = moveDir(s.directory), p = movePath(s.path);
      if (d !== s.directory || p !== s.path) { db.query('UPDATE session SET directory = ?, path = ? WHERE id = ?').run(d, p, s.id); n.sessions++; }
    }
    for (const t of ['project_directory', 'workspace']) {
      for (const r of db.query(`SELECT rowid AS rid, directory FROM ${t} WHERE directory IS NOT NULL`).all()) {
        const d = moveDir(r.directory);
        if (d !== r.directory) { db.query(`UPDATE ${t} SET directory = ? WHERE rowid = ?`).run(d, r.rid); n.dirs++; }
      }
    }
    for (const [t, key] of [['event', 'events'], ['message', 'messages']]) {
      const where = t === 'event' ? "type LIKE 'session.%' AND data LIKE ? ESCAPE '\\'" : "data LIKE ? ESCAPE '\\'";
      for (const r of db.query(`SELECT id, data FROM ${t} WHERE ${where}`).all(like)) {
        let j; try { j = JSON.parse(r.data); } catch { continue; }
        if (walk(j)) { db.query(`UPDATE ${t} SET data = ? WHERE id = ?`).run(JSON.stringify(j), r.id); n[key]++; }
      }
    }
  })();
  db.close();
  out({ ok: true, ...n, backup });
} catch (e) {
  try { db && db.close(); } catch {}
  out({ ok: false, error: String((e && e.message) || e) });
}
