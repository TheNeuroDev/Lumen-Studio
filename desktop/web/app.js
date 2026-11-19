(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
function svg(path, extra = '') { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${path}</svg>`; }

/* ---------------- icons ---------------- */
const IC = {
  image: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 16l-4.5-4.5L7 19.5"/>'),
  edit: svg('<path d="M4 20l4.5-1 10-10a2.1 2.1 0 00-3-3l-10 10L4 20z"/><path d="M13.5 7.5l3 3"/>'),
  video: svg('<rect x="3" y="5.5" width="13" height="13" rx="3"/><path d="M16 10.5l5-3v9l-5-3"/>'),
  voice: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>'),
  music: svg('<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
  upscale: svg('<path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"/>'),
  animate: svg('<circle cx="12" cy="12" r="8.5"/><path d="M10 8.8v6.4l5.2-3.2z" fill="currentColor"/>'),
  download: svg('<path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/>'),
  remix: svg('<path d="M4 7h11a4 4 0 010 8H8m0 0l3-3m-3 3l3 3"/>'),
  reroll: svg('<path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2"/>'),
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>',
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>', 'stroke-width="2.2"'),
  archive: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M3.5 9.5h17"/>'),
  upload: svg('<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 19.5h14"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v.5M12 11v5"/>'),
  dice: svg('<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/>'),
  lockOpen: svg('<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 017.6-1.8"/>'),
  lockShut: svg('<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
  current: svg('<path d="M4 12h12m0 0l-4-4m4 4l-4 4M20 5v14"/>'),
  send: svg('<path d="M12 19V5m0 0l-6 6m6-6l6 6"/>', 'stroke-width="2.2"'),
  stop: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
  folder: svg('<path d="M3.5 7.5a2 2 0 012-2h4l2 2.5h7a2 2 0 012 2v7.5a2 2 0 01-2 2h-13a2 2 0 01-2-2z"/>'),
  chat: svg('<path d="M5 18.5V7a2.5 2.5 0 012.5-2.5h9A2.5 2.5 0 0119 7v6.5a2.5 2.5 0 01-2.5 2.5H9z"/>')
};

/* ---------------- models & modes ---------------- */
const PROFILE_LABEL = { turbo: 'Z-Image Turbo', quality: 'Qwen-Image 2512', real: 'Qwen-Image 2.1', max: 'Qwen-Image 2.1 Max', turbo21: 'Qwen-Image 2.1 Turbo', edit: 'Qwen-Image 2.1 Edit', video: 'Wan 2.2 5B' };
const ENGINE_LABEL = { image: 'Images', voice: 'Chatterbox Turbo', music: 'ACE-Step 1.5', llm: 'Chat', code: 'Code' };
const MODES = [
  { key: 'image', label: 'Image', icon: IC.image, go: 'Generate', verb: 'image' },
  { key: 'edit', label: 'Edit', icon: IC.edit, go: 'Edit image', verb: 'edit' },
  { key: 'video', label: 'Video', icon: IC.video, go: 'Make video', verb: 'video' },
  { key: 'voice', label: 'Voice', icon: IC.voice, go: 'Speak', verb: 'clip' },
  { key: 'music', label: 'Music', icon: IC.music, go: 'Compose', verb: 'song' }
];
const HERO = {
  image: ['Make light<br><em>out of words.</em>', 'Describe a scene and press Generate. Every image is saved to your desktop and waits for you in the archive.'],
  edit: ['Change anything,<br><em>keep the rest.</em>', 'Pick an image, say what should change, and Qwen-Image 2.1 repaints just that part.'],
  video: ['Set it<br><em>in motion.</em>', 'Experimental. Describe a shot, or start from one of your images, and Wan 2.2 turns it into a short, often wonderfully wrong clip.'],
  voice: ['Give it<br><em>a voice.</em>', 'Type a script and pick a voice. Add your own from a short recording; it stays on your desktop.'],
  music: ['A song<br><em>in a minute.</em>', 'Describe the style, write lyrics or let the model write them, and ACE-Step composes the track.']
};
const RATIOS = [['1:1',1,1],['4:5',4,5],['3:4',3,4],['2:3',2,3],['9:16',9,16],['4:3',4,3],['3:2',3,2],['16:9',16,9],['21:9',21,9]];
const SIZES = [['draft','Draft',0.5],['standard','Standard',1.0],['high','High',1.6]];
const FORMATS = [['png','PNG'],['jpeg','JPEG']];
const IMG_MODELS = [['turbo21', 'Turbo', 'Qwen-Image 2.1 Turbo, about 10 s'], ['real', 'Standard', 'Qwen-Image 2.1, about a minute'], ['max', 'Realistic', 'Qwen-Image 2.1 at native 2K, slow']];
const STEP_RANGE = { turbo21: [8, 8, 8, '2.1 Turbo uses a fixed 8-step schedule.'],
                     turbo: [4, 16, 8, 'Z-Image Turbo is tuned for 8. More steps add detail but take longer.'],
                     quality: [10, 40, 20, 'Qwen-Image 2512 is tuned for 20. Each step adds time.'],
                     real: [20, 60, 40, 'Qwen-Image 2.1 is tuned for 40. Fewer steps finish sooner with less detail.'],
                     max: [30, 80, 50, 'Realistic renders at the model’s native 2K for the most natural detail. Expect several minutes per image.'] };
// Max ('Realistic' in the picker since 2026-11-18) is the Standard model (engine profile 'real') at 4x the pixels and more steps.
const engProfile = m => m === 'max' ? 'real' : m;
// Qwen-Image 2.1 Turbo's request (tests\ab-2026-11-16\turbo-profile.md): 8 steps, euler, cfg 1 (the negative prompt has no effect), fixed sigmas.
const TURBO21_SP = { sample_steps: 8, sample_method: 'euler', guidance: { txt_cfg: 1.0 }, custom_sigmas: [1.0, 0.978453, 0.95418, 0.926626, 0.89508, 0.845148, 0.704534, 0.414568, 0.0] };
const MAX_MP = { draft: 2.0, standard: 4.0, high: 4.2 };   // Qwen-Image 2.1 is trained up to 2048x2048 / 2752x1536
// Archive label -> image profile (old Z-Image items have no model or a Z-Image label).
function profileOf(it) { const m = it.model || ''; return /Qwen-Image 2\.1 Max/.test(m) ? 'max' : /Qwen-Image 2\.1 Turbo/.test(m) ? 'turbo21' : /Qwen-Image 2\.1/.test(m) ? 'real' : /Qwen-Image 2512/.test(m) ? 'quality' : 'turbo'; }
const EDIT_SIZES = [['small', 'Small', 0.35], ['draft', 'Medium', 0.6], ['standard', 'Full', 1.0]];
const VID_SHAPES = [['16:9', '16:9'], ['9:16', '9:16'], ['1:1', '1:1']];
const VID_RES = [['480', '480p'], ['704', '720p']];
const VID_DIMS = { '480': { '16:9': [832, 480], '9:16': [480, 832], '1:1': [640, 640] },
                   '704': { '16:9': [1280, 704], '9:16': [704, 1280], '1:1': [960, 960] } };
const VID_LEN = [['2', '2s', 49], ['3', '3s', 73], ['5', '5s', 121]];
const VID_FPS = 24;
const VOICE_TAGS = ['[laugh]', '[chuckle]', '[sigh]', '[gasp]', '[cough]', '[clear throat]', '[sniff]', '[groan]', '[shush]'];
const IDEAS = {
  image: [
    'A lighthouse keeper reading by lamplight during a storm, cinematic, warm tungsten glow, rain on the window',
    'Macro photo of a dewdrop on a fern at sunrise, the forest reflected inside the drop, shallow depth of field',
    'Brutalist concrete villa on a cliff above a turquoise sea, golden hour, architectural photography',
    'Portrait of an elderly jazz musician in a smoky club, Rembrandt lighting, Kodak Portra 400',
    'A tiny greenhouse full of glowing mushrooms inside a glass bottle, studio product shot, soft rim light',
    'Street market in Marrakech at dusk, lanterns and spice stalls, motion blur of passers-by, 35mm film',
    'An astronaut kneeling in a field of red poppies, overcast soft light, quiet and melancholic, photoreal',
    'Minimalist Japanese tea room, morning light through shoji screens, steam rising from a cup',
    'Aerial view of a winding river through autumn forest, mist in the valleys, drone photography',
    'A vintage motorcycle in a cluttered workshop, dust in the light beams, hyperreal detail',
    'Fashion editorial, model in a sculptural white coat on salt flats, harsh noon sun, long shadows',
    'Cozy bookshop café on a snowy evening, warm windows, people silhouetted inside, cinematic wide shot',
    'Close-up of a hummingbird drinking from a fuchsia flower, frozen wings, crisp detail, bokeh background',
    'Underwater shot of a diver beside a sunken sailing ship, god rays through clear blue water',
    'Neon-lit ramen stand in a rainy Tokyo backstreet at 2am, reflections in puddles, shot on 35mm',
    'A wolf on a snowy ridge under the northern lights, long exposure, National Geographic style'
  ],
  edit: [
    'Make it a snowy winter night. Keep everything else the same.',
    'Turn the scene into golden hour, warm low sun and long shadows.',
    'Change the season to autumn, orange and red leaves everywhere.',
    'Turn it into a watercolor painting on textured paper.',
    'Remove the people in the background.',
    'Add a small neon sign that reads LUMEN above the door.',
    'Make it look like a 1970s film photo, faded colors and grain.',
    'Replace the sky with a dramatic stormy sunset.'
  ],
  video: [
    'A red fox trotting through a misty pine forest at dawn, slow tracking shot, cinematic',
    'Waves crashing against black volcanic rocks, slow motion, overcast light, spray in the air',
    'A steaming cup of coffee on a windowsill, rain streaking the glass, shallow depth of field',
    'Drone shot gliding over a turquoise lagoon and white sand, bright midday sun',
    'Neon signs flickering on a rainy Tokyo street at night, people with umbrellas walking past',
    'A hot air balloon rising over misty hills at sunrise, gentle camera push-in',
    'Close-up of ink dropping into water, swirling clouds of color, macro, black background',
    'A paper boat drifting down a rain gutter, low angle, cinematic lighting'
  ],
  voice: [
    'Welcome back to Lumen. Tonight we are going somewhere new, so get comfortable, and let the story begin.',
    'In a world where every machine can dream, one small robot just wanted to learn how to paint the sunrise.',
    'Breaking news this evening: scientists have confirmed that cats do, in fact, understand every word you say. [chuckle] They simply choose to ignore it.',
    'Take a slow breath in. Hold it for a moment. And let it go. Feel your shoulders soften, and your thoughts begin to settle.',
    'Ladies and gentlemen, the doors are now closing. Please hold on, and enjoy the ride.'
  ],
  music: [
    'Warm lo-fi hip hop, dusty vinyl drums, mellow Rhodes, rainy night, 80 BPM',
    'Upbeat indie pop, bright jangly guitars, handclaps, female vocals, summer road trip',
    'Cinematic orchestral score, soaring strings, French horns, building to an epic climax',
    'Dark synthwave, pulsing analog bass, gated reverb drums, neon night drive, 100 BPM',
    'Acoustic folk ballad, fingerpicked guitar, soft male vocals, harmonica, campfire feel',
    'Smooth jazz trio, brushed drums, upright bass, late-night piano, relaxed',
    'Euphoric progressive house, rolling bassline, airy pads, big festival drop, 126 BPM',
    'Delta blues, slide guitar, stomping foot percussion, gritty raspy vocals'
  ]
};

/* ---------------- settings ---------------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('lumen.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lumen.' + k, JSON.stringify(v)); } catch {} }
};
const DEFAULTS = {
  mode: 'image', filter: 'all',
  image: { prompt: '', model: 'turbo21', ratio: '1:1', size: 'standard', count: 1, steps: { turbo: 8, quality: 20, real: 40, max: 50, turbo21: 8 }, format: 'png', seed: '', seedLock: false },
  edit: { prompt: '', size: 'draft', steps: 40, seed: '', seedLock: false, srcId: null, v21: true },
  video: { prompt: '', shape: '16:9', res: '480', len: '2', steps: 20, seed: '', seedLock: false, srcId: null },
  voice: { text: '', voice: '', temp: 0.8 },
  music: { prompt: '', lyrics: '', instrumental: false, auto: true, duration: 60, seed: '', seedLock: false }
};
const cfg = (() => {
  const saved = store.get('settings2', null);
  const c = JSON.parse(JSON.stringify(DEFAULTS));
  if (saved) { for (const k of Object.keys(c)) { if (saved[k] == null) continue; c[k] = typeof c[k] === 'object' ? Object.assign(c[k], saved[k]) : saved[k]; } }
  else {
    const old = store.get('settings', null);   // v1 page
    if (old) Object.assign(c.image, { prompt: old.prompt || '', ratio: old.ratio || '1:1', size: old.size || 'standard', count: old.count || 1,
      format: old.format || 'png', seed: old.seed || '', seedLock: !!old.seedLock, steps: { turbo: old.steps || 8, quality: 20 } });
  }
  if (typeof c.image.steps !== 'object') c.image.steps = { turbo: +c.image.steps || 8, quality: 20 };
  if (!IMG_MODELS.some(m => m[0] === c.image.model)) c.image.model = 'turbo21';   // new devices start on Fast (2.1 Turbo), user's choice 2026-11-16
  if (!MODES.some(m => m.key === c.mode)) c.mode = 'image';
  if (!c.edit.v21) { c.edit.v21 = true; c.edit.steps = 40; }   // 2511's 20-step default -> Qwen-Image 2.1's 40
  c.edit.steps = Math.min(60, Math.max(20, +c.edit.steps || 40));
  return c;
})();
const save = () => store.set('settings2', cfg);

/* ---------------- api ---------------- */
async function req(url, opts = {}) {
  const r = await fetch(url, Object.assign({ cache: 'no-store' }, opts));
  let d = null; try { d = await r.json(); } catch {}
  if (!r.ok) { const e = new Error((d && (d.error || d.message)) || `HTTP ${r.status}`); e.status = r.status; e.data = d; throw e; }
  return d;
}
const post = (url, body, headers = {}) => req(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(body || {}) });
const api = {
  status: () => req('/gw/status'),
  use: (engine, profile, force) => post('/gw/use', { engine, profile: profile || '', force: !!force }),
  gallery: () => req('/gw/gallery'),
  remove: ids => post('/gw/delete', { ids }),
  submit: (kind, body, meta) => post('/sdcpp/v1/' + kind, body, { 'X-Lumen-Meta': JSON.stringify(meta || {}) }),
  job: id => req('/sdcpp/v1/jobs/' + encodeURIComponent(id)),
  cancel: id => req('/sdcpp/v1/jobs/' + encodeURIComponent(id) + '/cancel', { method: 'POST' }),
  upscale: (id, repeats) => post('/gw/upscale', { id, repeats: repeats || 1 }),
  tts: body => post('/gw/voice/tts', body),
  voices: () => req('/gw/voice/voices'),
  addVoice: (name, wav) => post('/gw/voice/voices', { name, wav }),
  delVoice: name => post('/gw/voice/delete', { name }),
  music: body => post('/gw/music', body),
  task: id => req('/gw/task/' + encodeURIComponent(id))
};
const fileUrl = rel => '/gw/file/' + String(rel).split('/').map(encodeURIComponent).join('/');

/* ---------------- state ---------------- */
const S = {
  st: null, reachable: true, pending: null, dismissed: null, autoWoke: false,
  gallery: [], ids: new Set(), filtered: [], rendered: 0, savedCount: -1, query: '',
  jobs: new Map(), tasks: new Map(), activeId: null, pumping: false,
  shown: null, lbList: [], lbIndex: -1,
  src: { edit: null, video: null }, pickFor: null,
  voices: store.get('voices', []), voicesLoaded: false
};

/* ---------------- helpers ---------------- */
const r64 = v => Math.max(256, Math.round(v / 64) * 64);
const r16 = v => Math.max(256, Math.round(v / 16) * 16);
const randSeed = () => Math.floor(Math.random() * 2147483647);
const kindOf = it => (it && it.kind) || 'image';
const isAudio = it => ['voice', 'music'].includes(kindOf(it));
function dims(ratioKey = cfg.image.ratio, sizeKey = cfg.image.size, model = cfg.image.model) {
  const [, a, b] = RATIOS.find(r => r[0] === ratioKey) || RATIOS[0];
  const mp = model === 'max' ? (MAX_MP[sizeKey] || 4.0) : (SIZES.find(s => s[0] === sizeKey) || SIZES[1])[2];
  const px = mp * 1024 * 1024;
  return { w: r64(Math.sqrt(px * a / b)), h: r64(Math.sqrt(px * b / a)) };
}
function editDims() {
  const s = S.src.edit; if (!s) return null;
  const mp = (EDIT_SIZES.find(x => x[0] === cfg.edit.size) || EDIT_SIZES[1])[2];
  const ar = s.w / s.h, px = mp * 1048576;
  return { w: r16(Math.sqrt(px * ar)), h: r16(Math.sqrt(px / ar)) };
}
function vidDims() { const [w, h] = VID_DIMS[cfg.video.res][cfg.video.shape]; return { w, h }; }
const vidFrames = () => (VID_LEN.find(l => l[0] === cfg.video.len) || VID_LEN[0])[2];
function fmtMs(ms) { if (!ms) return '—'; const s = ms / 1000; return s < 60 ? s.toFixed(1) + 's' : Math.floor(s / 60) + 'm ' + Math.round(s % 60) + 's'; }
function fmtDur(s) { s = Math.max(0, Math.round(+s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function fmtBytes(b) { if (!b) return '—'; return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'; }
function fmtEst(sec) { if (!sec || !isFinite(sec)) return ''; return sec < 60 ? '≈ ' + (sec < 10 ? sec.toFixed(1) : Math.round(sec)) + 's' : '≈ ' + Math.round(sec / 60) + ' min'; }
function fmtDate(ms) {
  if (!ms) return '—';
  const d = new Date(ms), now = new Date();
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return 'Today, ' + t;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday, ' + t;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }) + ', ' + t;
}
function hue(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; }
function coverBg(it) { const h = hue(it.id); return `linear-gradient(135deg, hsl(${h} 80% 62%), hsl(${(h + 55) % 360} 70% 42%) 55%, hsl(${(h + 110) % 360} 65% 26%))`; }
function toast(msg, kind = 'ok', ms = 3600) {
  const t = el('div', 'toast ' + kind); t.append(el('i'), el('span', null, msg));
  $('#toasts').append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
}
function shake(node) { node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake'); }
function downloadName(it) {
  const ext = String(it.file).split('.').pop();
  const tag = kindOf(it) === 'image' ? (it.seed || 'x') : kindOf(it);
  return `lumen-${tag}-${String(it.id).replace(/[^\w-]/g, '').slice(-12)}.${ext}`;
}
function itemTitle(it) { return (it.prompt || '').trim() || (kindOf(it) === 'music' ? 'Untitled song' : 'Untitled'); }

/* ---------------- time estimates (learned from the archive) ---------------- */
const FALLBACK_RATE = { edit: 2500, voice: 45, upscale: null };   // ms per unit, from first benchmarks
function median(a) { if (!a.length) return null; a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; }
function rateFor(test, unit) {
  const byJob = new Map(), rates = [];
  for (const g of S.gallery.slice(0, 250)) {
    if (!g.ms || !test(g)) continue;
    const key = g.job || g.id, u = unit(g);
    if (!(u > 0)) continue;
    const j = byJob.get(key) || { ms: g.ms, u: 0 }; j.u += u; byJob.set(key, j);
  }
  for (const j of byJob.values()) rates.push(j.ms / j.u);
  return median(rates);
}
const mp = (w, h) => w * h / 1048576;
function estimate(mode) {
  let r, u;
  if (mode === 'image') {
    const { w, h } = dims(), steps = cfg.image.steps[cfg.image.model];
    r = rateFor(g => kindOf(g) === 'image' && (g.mode || 'create') === 'create' && profileOf(g) === cfg.image.model, g => mp(g.width, g.height) * (g.steps || 8));
    u = mp(w, h) * steps * cfg.image.count;
  } else if (mode === 'edit') {
    const d = editDims(); if (!d) return null;
    r = rateFor(g => g.mode === 'edit' && g.model === PROFILE_LABEL.edit, g => mp(g.width, g.height) * (g.steps || 40)) || FALLBACK_RATE.edit;
    u = mp(d.w, d.h) * cfg.edit.steps;
  } else if (mode === 'video') {
    const { w, h } = vidDims();
    r = rateFor(g => kindOf(g) === 'video', g => mp(g.width, g.height) * (g.frames || 49) * (g.steps || 20));
    u = mp(w, h) * vidFrames() * cfg.video.steps;
  } else if (mode === 'voice') {
    r = rateFor(g => kindOf(g) === 'voice', g => (g.prompt || '').length) || FALLBACK_RATE.voice;
    u = $('#voiceText').value.trim().length;
  } else if (mode === 'music') {
    r = rateFor(g => kindOf(g) === 'music', g => g.duration || 60);
    u = cfg.music.duration;
  }
  return r && u ? r * u / 1000 : null;
}

/* ---------------- engine status ---------------- */
function needFor(mode) {
  if (mode === 'image') return { engine: 'image', profile: engProfile(cfg.image.model) };
  if (mode === 'edit') return { engine: 'image', profile: 'real' };   // Qwen-Image 2.1 edits (same weights as Realistic) since 2026-11-17
  if (mode === 'video') return { engine: 'image', profile: 'video' };
  return { engine: mode, profile: null };
}
function needLabel(n) { return n.profile ? PROFILE_LABEL[n.profile] : n.engine === 'image' ? 'the image engine' : ENGINE_LABEL[n.engine]; }
function installed(mode) {
  const i = (S.st && S.st.installed) || {};
  if (mode === 'image') return cfg.image.model === 'turbo' || i[engProfile(cfg.image.model)] !== false;
  if (mode === 'edit') return i.edit !== false;
  if (mode === 'video') return i.video !== false;
  if (mode === 'voice') return i.voice !== false;
  if (mode === 'music') return i.music !== false;
  return true;
}
const switching = () => !!(S.st && S.st.switching && !['done', 'error'].includes(S.st.switching.stage));
function isReady(n) {
  const st = S.st; if (!st || !S.reachable) return false;
  return st.engine === n.engine && !!st.ready && (!n.profile || st.profile === n.profile) && !switching();
}
const sameNeed = (a, b) => a && b && a.engine === b.engine && (a.profile || null) === (b.profile || null);

async function ensure(need, label, run) {
  if (isReady(need)) return run();
  S.pending = { need, label, run, t0: Date.now(), requested: false, llm: false, error: null, retryAt: 0 };
  S.dismissed = null;
  renderEngine();
  await requestSwitch(false);
  pollStatusSoon();
}
async function requestSwitch(force) {
  const p = S.pending; if (!p) return;
  p.requested = true; p.llm = false; p.error = null;
  try {
    const r = await api.use(p.need.engine, p.need.profile, force);
    if (r && r.ready) { await refreshStatus(); return; }
  } catch (e) {
    if (e.status === 409 && e.data && e.data.error === 'llm-busy') { p.llm = true; p.requested = false; }
    else if (e.status === 409) { p.requested = false; p.retryAt = Date.now() + 2500; }
    else { p.error = e.message; }
  }
  renderEngine();
}
function onStatus() {
  const p = S.pending;
  if (!p) return;
  if (isReady(p.need)) {
    S.pending = null;
    renderEngine();
    try { p.run(); } catch (e) { toast(e.message, 'error'); }
    return;
  }
  const sw = S.st && S.st.switching;
  if (sw && sw.stage === 'error' && sw.engine === p.need.engine && (sw.profile || null) === (p.need.profile || null) && p.requested) {
    p.error = sw.error || 'The model did not load.'; p.requested = false;
  } else if (!p.requested && !p.llm && !p.error && !switching() && Date.now() > p.retryAt) {
    requestSwitch(false);
  }
}
let statusTimer = null;
function pollStatusSoon() { clearTimeout(statusTimer); statusTimer = setTimeout(tickStatus, 900); }
async function tickStatus() {
  clearTimeout(statusTimer);
  if (!document.hidden) await refreshStatus();
  statusTimer = setTimeout(tickStatus, (S.pending || switching() || V.boot) ? 1000 : 4000);
}
async function refreshStatus() {
  try {
    const st = await api.status();
    S.st = st; S.reachable = true;
    if (st.saved !== S.savedCount) { S.savedCount = st.saved; loadGallery(); }
    if (!S.autoWoke) {
      S.autoWoke = true;
      if (V.launch) { V.launch = false; launchPick(st); }
      // Like before: if nothing is running, start the image engine so Generate is quicker (weights load on the first job).
      if (V.view === 'studio' && st.engine === 'off' && !st.llm && !switching() && cfg.mode === 'image' && installed('image')) api.use('image', engProfile(cfg.image.model)).then(pollStatusSoon).catch(() => {});
    }
    if (st.engine === 'voice' && st.ready && !S.voicesLoaded) loadVoices();
  } catch { S.reachable = false; }
  onStatus();
  if (V.view === 'code') Code.sync();
  renderEngine();
  try { Cost.onStatus(S.reachable ? S.st : null); } catch {}
  onViewStatus();
}

// Opened from the laptop's Lumen Studio shortcut (#launch): land on whatever already runs on the GPU.
// Nothing running: stay on Studio's image mode, and the auto-wake in refreshStatus loads its model.
function launchPick(st) {
  const e = st.engine, p = st.profile;
  if (e === 'code') return goView('code', { passive: true });
  if (e === 'llm' || (e === 'off' && st.llm)) return goView('chat', { passive: true });
  if (e === 'voice' || e === 'music') setMode(e, false);
  else if (e === 'image' && p === 'video') setMode('video', false);
  else if (e === 'image') {
    if (p && engProfile(cfg.image.model) !== p && IMG_MODELS.some(m => m[0] === p)) cfg.image.model = p;
    setMode('image', false);
  } else setMode('image', false);
  goView('studio', { passive: true });
}

function renderEngine() {
  const st = S.st, e = $('#engine'), txt = $('#engineText');
  let state = 'unknown', a = 'Connecting', b = ' to desktop…';
  if (!S.reachable) { state = 'unreachable'; a = 'Desktop'; b = ' unreachable'; }
  else if (st) {
    const sw = st.switching;
    if (switching()) { state = 'switching'; a = 'Loading'; b = ' ' + needLabel(sw) + '…'; }
    else if (st.engine === 'off') { state = st.llm ? 'llm' : 'idle'; a = st.llm ? 'GPU on Chat' : 'GPU idle'; b = ''; }
    else if ((st.engine === 'llm' || st.engine === 'code') && !st.ready) { state = 'starting'; a = 'Starting'; b = st.engine === 'code' ? ' Code…' : ' Chat…'; }
    else if (st.engine === 'llm' || st.engine === 'code') { state = 'llm'; a = '<b>' + (st.engine === 'code' ? 'Code' : 'Chat') + '</b>'; b = ' · ready'; }
    else if (!st.ready) { state = 'starting'; a = 'Starting'; b = ' ' + (st.engine === 'image' ? 'images' : ENGINE_LABEL[st.engine]) + '…'; }
    else {
      state = 'ready';
      const lbl = st.engine === 'image' ? (PROFILE_LABEL[st.profile] || 'Images') : ENGINE_LABEL[st.engine];
      a = '<b>' + lbl + '</b>'; b = ' · ready';
    }
  }
  e.dataset.state = state;
  txt.innerHTML = a + '<span class="long">' + b + '</span>';
  renderOverlay();
  syncGo();
}

function renderOverlay() {
  const sl = $('#sleep'), p = S.pending, st = S.st;
  const title = $('#sleepTitle'), text = $('#sleepText'), bar = $('#swBar'), time = $('#swTime'), row = $('#sleepRow');
  const go = $('#wakeBtn'), cancel = $('#sleepCancel');
  let show = false;
  bar.style.display = 'none'; time.textContent = ''; row.style.display = ''; go.style.display = ''; cancel.style.display = '';
  if (!S.reachable && S.st) {
    show = true;
    title.innerHTML = "Can't reach <em>your desktop.</em>";
    text.textContent = 'Check that the desktop is on and that Tailscale is connected on this device.';
    row.style.display = 'none';
  } else if (p && p.llm) {
    show = true;
    title.innerHTML = 'The GPU is busy with <em>Chat.</em>';
    text.textContent = `Your desktop runs one model at a time. Switching stops Chat (and Code) so ${p.label} can load.`;
    $('#wakeLabel').textContent = 'Stop Chat and switch'; go.disabled = false;
    go.onclick = () => requestSwitch(true).then(pollStatusSoon);
  } else if (p && p.error) {
    show = true;
    title.innerHTML = `Couldn't load <em>${esc(p.label)}.</em>`;
    text.textContent = p.error;
    $('#wakeLabel').textContent = 'Try again'; go.disabled = false;
    go.onclick = () => { p.error = null; requestSwitch(false).then(pollStatusSoon); };
  } else if (p || switching()) {
    const sw = st && st.switching;
    const key = sw ? sw.engine + '/' + (sw.profile || '') : '';
    show = !!p || S.dismissed !== key;
    const lbl = p ? p.label : needLabel(sw);
    title.innerHTML = `Loading <em>${esc(lbl)}…</em>`;
    text.textContent = p ? `Your ${MODES.find(m => m.key === p.mode)?.verb || 'request'} starts by itself as soon as it's ready. The first load of a model can take a minute.`
                         : 'The desktop is switching models. This usually takes under a minute.';
    bar.style.display = '';
    const secs = sw && switching() ? sw.elapsed : p ? Math.round((Date.now() - p.t0) / 1000) : 0;
    time.textContent = secs ? secs + 's' : '';
    go.style.display = 'none';
    cancel.textContent = p ? 'Cancel' : 'Hide';
  }
  cancel.onclick = () => {
    if (S.pending) { S.pending = null; toast('Cancelled. The model keeps loading in the background.', 'info', 2600); }
    else if (st && st.switching) S.dismissed = st.switching.engine + '/' + (st.switching.profile || '');
    renderEngine();
  };
  sl.classList.toggle('on', show);
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- composer ---------------- */
const T = { image: $('#imgPrompt'), edit: $('#editPrompt'), video: $('#vidPrompt'), voice: $('#voiceText'), music: $('#musicPrompt') };
const TKEY = { image: 'prompt', edit: 'prompt', video: 'prompt', voice: 'text', music: 'prompt' };
const COUNT = { image: '#imgCount', edit: '#editCount', video: '#vidCount', voice: '#voiceCount', music: '#musicCount' };

function segButtons(container, items, get, set) {
  const box = $(container); box.innerHTML = '';
  for (const [key, label] of items) {
    const b = el('button', null, label); b.type = 'button'; b.dataset.key = key;
    b.onclick = () => { set(key); save(); syncComposer(); };
    box.append(b);
  }
  box._sync = () => { for (const b of box.children) b.setAttribute('aria-pressed', b.dataset.key === String(get())); };
}
function buildSeed(mode) {
  const box = $(`.seed[data-seed="${mode}"]`), c = cfg[mode];
  box.innerHTML = `<input inputmode="numeric" placeholder="Random" aria-label="Seed (leave empty for random)">
    <button type="button" class="dice" title="New random seed" aria-label="Roll a random seed">${IC.dice}</button>
    <button type="button" class="lock" aria-pressed="false" title="Lock the seed (otherwise every run gets a new one)" aria-label="Lock seed"></button>`;
  const inp = box.querySelector('input'), lock = box.querySelector('.lock');
  inp.value = c.seed || '';
  inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 10); c.seed = inp.value; c.seedLock = !!c.seed; save(); box._sync(); });
  box.querySelector('.dice').onclick = () => { c.seed = String(randSeed()); c.seedLock = true; inp.value = c.seed; save(); box._sync(); };
  lock.onclick = () => { c.seedLock = !c.seedLock; if (c.seedLock && !c.seed) c.seed = String(randSeed()); if (!c.seedLock) c.seed = ''; inp.value = c.seed; save(); box._sync(); };
  box._sync = () => { lock.setAttribute('aria-pressed', c.seedLock); lock.innerHTML = c.seedLock ? IC.lockShut : IC.lockOpen; inp.value = c.seed || ''; };
  box._sync();
}
const seedFor = mode => (cfg[mode].seedLock && cfg[mode].seed ? +cfg[mode].seed : randSeed());

function buildComposer() {
  // mode tabs
  const tabs = $('#modes');
  for (const m of MODES) {
    const b = el('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.mode = m.key;
    b.innerHTML = m.icon + `<span>${m.label}</span>`;
    b.onclick = () => setMode(m.key, true);
    tabs.append(b);
  }
  // text areas
  for (const [mode, ta] of Object.entries(T)) {
    ta.value = cfg[mode][TKEY[mode]] || '';
    ta.addEventListener('input', () => { cfg[mode][TKEY[mode]] = ta.value; save(); autosize(ta); countFor(mode); if (mode === 'voice') syncGo(); });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } });
  }
  const lyr = $('#musicLyrics');
  lyr.value = cfg.music.lyrics || '';
  lyr.addEventListener('input', () => { cfg.music.lyrics = lyr.value; save(); autosize(lyr); });
  lyr.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } });
  for (const b of $$('[data-surprise]')) b.onclick = () => surprise(b.dataset.surprise);
  for (const b of $$('[data-clear]')) b.onclick = () => { const ta = $('#' + b.dataset.clear); ta.value = ''; ta.dispatchEvent(new Event('input')); ta.focus(); };

  // image
  segButtons('#imgModel', IMG_MODELS, () => cfg.image.model, k => { cfg.image.model = k; });
  const ratios = $('#ratios');
  for (const [key, a, b] of RATIOS) {
    const btn = el('button', 'ratio'); btn.type = 'button'; btn.dataset.key = key;
    const g = el('span', 'glyph'); const s = 22 / Math.max(a, b); g.style.width = (a * s) + 'px'; g.style.height = (b * s) + 'px';
    btn.append(g, el('span', null, key)); btn.setAttribute('aria-label', 'Aspect ratio ' + key);
    btn.onclick = () => { cfg.image.ratio = key; save(); syncComposer(); };
    ratios.append(btn);
  }
  segButtons('#sizes', SIZES, () => cfg.image.size, k => { cfg.image.size = k; });
  segButtons('#formats', FORMATS, () => cfg.image.format, k => { cfg.image.format = k; });
  $('#countDown').onclick = () => { cfg.image.count = Math.max(1, cfg.image.count - 1); save(); syncComposer(); };
  $('#countUp').onclick = () => { cfg.image.count = Math.min(4, cfg.image.count + 1); save(); syncComposer(); };
  $('#imgSteps').addEventListener('input', e => { cfg.image.steps[cfg.image.model] = +e.target.value; save(); syncComposer(); });

  // edit
  segButtons('#editSizes', EDIT_SIZES, () => cfg.edit.size, k => { cfg.edit.size = k; });
  $('#editSteps').value = cfg.edit.steps;
  $('#editSteps').addEventListener('input', e => { cfg.edit.steps = +e.target.value; save(); syncComposer(); });

  // video
  segButtons('#vidShapes', VID_SHAPES, () => cfg.video.shape, k => { cfg.video.shape = k; });
  segButtons('#vidRes', VID_RES, () => cfg.video.res, k => { cfg.video.res = k; });
  segButtons('#vidLengths', VID_LEN, () => cfg.video.len, k => { cfg.video.len = k; });
  $('#vidSteps').value = cfg.video.steps;
  $('#vidSteps').addEventListener('input', e => { cfg.video.steps = +e.target.value; save(); syncComposer(); });

  // voice
  const tags = $('#voiceTags');
  for (const t of VOICE_TAGS) { const b = el('button', null, t); b.type = 'button'; b.title = 'Insert ' + t; b.onclick = () => insertAtCursor(T.voice, t + ' '); tags.append(b); }
  $('#voiceTemp').value = cfg.voice.temp;
  $('#voiceTemp').addEventListener('input', e => { cfg.voice.temp = +e.target.value; save(); syncComposer(); });

  // music
  $('#musicInstr').checked = !!cfg.music.instrumental;
  $('#musicAuto').checked = !!cfg.music.auto;
  $('#musicInstr').onchange = e => { cfg.music.instrumental = e.target.checked; save(); syncComposer(); };
  $('#musicAuto').onchange = e => { cfg.music.auto = e.target.checked; save(); syncComposer(); };
  $('#musicDur').value = cfg.music.duration;
  $('#musicDur').addEventListener('input', e => { cfg.music.duration = +e.target.value; save(); syncComposer(); });

  for (const m of ['image', 'edit', 'video', 'music']) buildSeed(m);
  buildSource('edit'); buildSource('video');
  renderVoices();
  $('#goBtn').onclick = () => go();
  for (const ta of [...Object.values(T), lyr]) autosize(ta);
  for (const m of Object.keys(T)) countFor(m);
  setMode(cfg.mode, false);
}
function countFor(mode) { const n = T[mode].value.length; $(COUNT[mode]).textContent = mode === 'voice' ? `${n} / 6000` : n; }
function autosize(ta) { const min = ta.classList.contains('short') ? 92 : ta.classList.contains('mono') ? 140 : 120; ta.style.height = 'auto'; ta.style.height = Math.min(360, Math.max(min, ta.scrollHeight)) + 'px'; }
function insertAtCursor(ta, text) {
  const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s;
  const before = ta.value.slice(0, s), pad = before && !/\s$/.test(before) ? ' ' : '';
  ta.value = before + pad + text + ta.value.slice(e);
  const pos = s + pad.length + text.length; ta.focus(); ta.setSelectionRange(pos, pos);
  ta.dispatchEvent(new Event('input'));
}
function surprise(mode) {
  const pool = IDEAS[mode], ta = T[mode]; let p;
  do { p = pool[Math.floor(Math.random() * pool.length)]; } while (p === ta.value && pool.length > 1);
  ta.value = p; ta.dispatchEvent(new Event('input'));
}

function setMode(mode, user) {
  cfg.mode = mode; save();
  for (const b of $('#modes').children) b.setAttribute('aria-selected', b.dataset.mode === mode);
  for (const p of $$('.panel')) p.classList.toggle('on', p.dataset.panel === mode);
  const [h, t] = HERO[mode];
  $('#heroTitle').innerHTML = h; $('#heroText').textContent = t;
  const n = needFor(mode);
  $('#heroEyebrow').textContent = (n.profile ? PROFILE_LABEL[n.profile] : ENGINE_LABEL[mode]) + ' · running on your desktop';
  buildIdeas();
  if (mode === 'voice' && !S.voicesLoaded && S.st && S.st.engine === 'voice' && S.st.ready) loadVoices();
  syncComposer();
  for (const ta of Object.values(T)) autosize(ta);
  if (user && matchMedia('(max-width: 900px)').matches) {
    const c = $('.composer'); if (c.getBoundingClientRect().top > innerHeight * .9) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function syncComposer() {
  // image
  const model = cfg.image.model, [lo, hi, , hint] = STEP_RANGE[model];
  const steps = Math.min(hi, Math.max(lo, cfg.image.steps[model] || STEP_RANGE[model][2]));
  cfg.image.steps[model] = steps;
  const st = $('#imgSteps'); st.min = lo; st.max = hi; st.value = steps; st.style.setProperty('--p', (hi > lo ? (steps - lo) / (hi - lo) * 100 : 100) + '%');
  st.closest('.field').hidden = hi === lo;   // 2.1 Turbo: the sigma schedule fixes the step count
  $('#imgStepsOut').textContent = steps; $('#imgStepsHint').textContent = hint;
  $('#imgModelNote').textContent = (IMG_MODELS.find(m => m[0] === model) || [])[2] || '';
  for (const b of $('#ratios').children) b.setAttribute('aria-pressed', b.dataset.key === cfg.image.ratio);
  const { w, h } = dims();
  $('#dimsLabel').textContent = `${w} × ${h}`; $('#mpLabel').textContent = (w * h / 1e6).toFixed(1) + ' MP';
  $('#countOut').textContent = cfg.image.count;
  $('#countDown').disabled = cfg.image.count <= 1; $('#countUp').disabled = cfg.image.count >= 4;
  // edit
  const ed = editDims(); $('#editDims').textContent = ed ? `${ed.w} × ${ed.h}` : '—';
  const es = $('#editSteps'); $('#editStepsOut').textContent = cfg.edit.steps; es.style.setProperty('--p', ((cfg.edit.steps - 20) / 40 * 100) + '%');
  // video
  const vd = vidDims(); $('#vidDims').textContent = `${vd.w} × ${vd.h} · ${vidFrames()} frames`;
  const vs = $('#vidSteps'); $('#vidStepsOut').textContent = cfg.video.steps; vs.style.setProperty('--p', ((cfg.video.steps - 8) / 32 * 100) + '%');
  // voice
  $('#voiceTempOut').textContent = (+cfg.voice.temp).toFixed(2).replace(/0$/, '');
  $('#voiceTemp').style.setProperty('--p', ((cfg.voice.temp - 0.4) / 0.8 * 100) + '%');
  // music
  const instr = cfg.music.instrumental;
  $('#autoLyricsRow').style.display = instr ? 'none' : '';
  $('#lyricsField').style.display = instr || cfg.music.auto ? 'none' : '';
  $('#musicDurOut').textContent = fmtDur(cfg.music.duration);
  $('#musicDur').style.setProperty('--p', ((cfg.music.duration - 10) / 230 * 100) + '%');
  for (const box of $$('.seg, .seed')) if (box._sync) box._sync();
  // notes
  const i = (S.st && S.st.installed) || {};
  setNote('#editNote', i.edit === false ? 'The editing model is still downloading on your desktop.' : '');
  setNote('#vidNote', i.video === false ? 'The video model is still downloading on your desktop. It will appear here when it finishes.' : '');
  syncGo();
}
function setNote(sel, msg) { const n = $(sel); n.hidden = !msg; n.innerHTML = msg ? IC.info + '<span>' + esc(msg) + '</span>' : ''; }

function syncGo() {
  const mode = cfg.mode, m = MODES.find(x => x.key === mode), need = needFor(mode);
  const go = $('#goBtn');
  let label = m.go, sub = '', disabled = false;
  if (mode === 'image' && cfg.image.count > 1) label = `Generate ${cfg.image.count}`;
  if (!S.reachable) { label = 'Desktop unreachable'; disabled = true; }
  else if (!installed(mode)) { label = 'Model still downloading'; disabled = true; }
  else if (mode === 'edit' && !S.src.edit) { label = 'Choose an image to edit'; disabled = true; }
  else if (S.pending && sameNeed(S.pending.need, need)) { label = 'Loading model…'; disabled = true; }
  else if (isReady(need)) {
    if (need.engine === 'image' && S.jobs.size) label = 'Add to queue';
    sub = fmtEst(estimate(mode));
  } else sub = '+ load model';
  go.disabled = disabled;
  $('#goLabel').textContent = label; $('#goSub').textContent = sub;
}

/* ---------------- sources (edit / animate) ---------------- */
function buildSource(which) {
  const box = $(`.src[data-src="${which}"]`);
  box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('drag'); });
  box.addEventListener('dragleave', () => box.classList.remove('drag'));
  box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('drag'); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) setSourceFile(which, f); });
  renderSource(which);
}
function renderSource(which) {
  const box = $(`.src[data-src="${which}"]`), s = S.src[which];
  box.classList.toggle('has', !!s); box.innerHTML = '';
  const th = el('div', 'src-thumb');
  if (s) { const im = el('img'); im.src = s.thumb || s.url; im.alt = ''; th.append(im); } else th.innerHTML = IC.image;
  const body = el('div', 'src-body');
  body.append(el('div', 'src-title', s ? (s.title || 'Image') : which === 'edit' ? 'No image chosen' : 'None, start from text'),
              el('div', 'src-sub', s ? `${s.w} × ${s.h}` : which === 'edit' ? 'Pick one from the archive or upload' : 'Optional: animate one of your images'));
  const btns = el('div', 'src-btns');
  const mk = (html, fn, title) => { const b = el('button', 'tool'); b.type = 'button'; b.innerHTML = html; if (title) b.title = title; b.onclick = fn; btns.append(b); };
  mk(IC.archive + 'Archive', () => openPicker(which), 'Choose from the archive');
  mk(IC.upload + 'Upload', () => { S.pickFor = which; $('#imgFile').value = ''; $('#imgFile').click(); }, 'Upload an image');
  if (S.shown && kindOf(S.shown) === 'image' && (!s || s.item !== S.shown)) mk(IC.current + 'Current', () => setSourceItem(which, S.shown), 'Use the image on the canvas');
  if (s) mk(IC.x + 'Remove', () => { setSource(which, null); }, 'Remove');
  body.append(btns);
  box.append(th, body);
}
function setSource(which, src) {
  const old = S.src[which]; if (old && old.objectUrl) URL.revokeObjectURL(old.objectUrl);
  S.src[which] = src;
  cfg[which].srcId = src && src.item ? src.item.id : null; save();
  if (which === 'video' && src) {   // pick the closest shape to the image
    const ar = src.w / src.h; cfg.video.shape = ar > 1.25 ? '16:9' : ar < 0.8 ? '9:16' : '1:1'; save();
  }
  renderSource(which); syncComposer();
}
function setSourceItem(which, it) {
  if (!it) return;
  setSource(which, { item: it, url: fileUrl(it.file), thumb: fileUrl(it.thumb || it.file), w: it.width, h: it.height, title: it.prompt || 'Image' });
}
function setSourceFile(which, file) {
  const url = URL.createObjectURL(file), im = new Image();
  im.onload = () => setSource(which, { item: null, url, objectUrl: url, w: im.naturalWidth, h: im.naturalHeight, title: file.name || 'Uploaded image' });
  im.onerror = () => { URL.revokeObjectURL(url); toast("That file isn't an image this browser can read.", 'error'); };
  im.src = url;
}
$('#imgFile').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f && S.pickFor) setSourceFile(S.pickFor, f); });
function restoreSources() {
  for (const which of ['edit', 'video']) {
    if (S.src[which] || !cfg[which].srcId) continue;
    const it = S.gallery.find(g => g.id === cfg[which].srcId);
    if (it) setSourceItem(which, it);
  }
}
// Draw a source into a w×h canvas (cover crop) and return a JPEG data URL.
function sourceDataUrl(src, w, h) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
      const s = Math.max(w / im.naturalWidth, h / im.naturalHeight);
      const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
      g.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
      res(c.toDataURL('image/jpeg', 0.95));
    };
    im.onerror = () => rej(new Error('Could not read the source image.'));
    im.src = src.url;
  });
}
function openPicker(which) {
  S.pickFor = which;
  const grid = $('#pickGrid'); grid.innerHTML = '';
  const imgs = S.gallery.filter(g => kindOf(g) === 'image').slice(0, 300);
  if (!imgs.length) grid.append(el('div', 'pick-empty', 'No images yet. Make one first, or upload a file.'));
  for (const it of imgs) {
    const b = el('button'); b.type = 'button'; b.title = it.prompt || '';
    const im = el('img'); im.loading = 'lazy'; im.src = fileUrl(it.thumb || it.file); im.alt = it.prompt || '';
    b.append(im); b.onclick = () => { setSourceItem(which, it); $('#picker').close(); };
    grid.append(b);
  }
  $('#picker').showModal();
}
for (const d of $$('dialog.sheet')) {
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
}

/* ---------------- voices ---------------- */
async function loadVoices() {
  try { const d = await api.voices(); S.voices = (d.voices || []).map(v => v.name); S.voicesLoaded = true; store.set('voices', S.voices); }
  catch {}
  if (cfg.voice.voice && !S.voices.includes(cfg.voice.voice) && S.voicesLoaded) { cfg.voice.voice = ''; save(); }
  renderVoices();
}
let armedVoice = null, armTimerV;
function renderVoices() {
  const box = $('#voices'); box.innerHTML = '';
  const chip = (name, label) => {
    const b = el('button', 'vchip'); b.type = 'button'; b.setAttribute('aria-pressed', cfg.voice.voice === name);
    b.append(el('span', null, label));
    if (name) {
      const x = el('span', 'x'); x.innerHTML = armedVoice === name ? IC.trash : IC.x; x.title = armedVoice === name ? 'Tap again to delete' : 'Delete voice'; x.setAttribute('role', 'button');
      x.onclick = e => { e.stopPropagation(); deleteVoice(name); };
      b.append(x);
    }
    b.onclick = () => { cfg.voice.voice = name; save(); renderVoices(); };
    box.append(b);
  };
  chip('', 'Default');
  for (const v of S.voices) chip(v, v);
  const add = el('button', 'vchip add'); add.type = 'button'; add.innerHTML = IC.plus + '<span>Add voice</span>'; add.onclick = openVoiceSheet; box.append(add);
  $('#voiceNote').textContent = cfg.voice.voice ? 'cloned' : 'built-in';
}
function deleteVoice(name) {
  if (armedVoice !== name) { armedVoice = name; clearTimeout(armTimerV); armTimerV = setTimeout(() => { armedVoice = null; renderVoices(); }, 3500); renderVoices(); toast(`Tap the bin again to delete “${name}”.`, 'info', 2400); return; }
  armedVoice = null;
  ensure({ engine: 'voice', profile: null }, 'the voice engine', async () => {
    try { await api.delVoice(name); if (cfg.voice.voice === name) { cfg.voice.voice = ''; save(); } toast(`Deleted “${name}”.`, 'info', 2000); }
    catch (e) { toast('Delete failed: ' + e.message, 'error'); }
    loadVoices();
  });
}

/* ----- add-voice sheet: record or upload, convert to WAV in the browser ----- */
const VS = { blob: null, rec: null, stream: null, t0: 0, timer: null, url: null };
function openVoiceSheet() {
  resetVoiceSheet();
  $('#voiceSheet').showModal();
  setTimeout(() => $('#vName').focus(), 50);
}
function resetVoiceSheet() {
  stopRecording(true);
  VS.blob = null; if (VS.url) URL.revokeObjectURL(VS.url); VS.url = null;
  $('#vName').value = ''; $('#vRecTime').textContent = 'No sample yet'; $('#vPreview').hidden = true; $('#vPreview').removeAttribute('src');
  $('#vRec').classList.remove('live'); $('#vRecBtn span').textContent = 'Record';
  syncVoiceSave();
}
function syncVoiceSave() { $('#vSave').disabled = !(VS.blob && $('#vName').value.trim()); }
$('#vName').addEventListener('input', syncVoiceSave);
$('#voiceSheet').addEventListener('close', () => stopRecording(true));
function setSample(blob, label) {
  VS.blob = blob; if (VS.url) URL.revokeObjectURL(VS.url); VS.url = URL.createObjectURL(blob);
  const a = $('#vPreview'); a.src = VS.url; a.hidden = false;
  $('#vRecTime').textContent = label; syncVoiceSave();
}
$('#vUpBtn').onclick = () => $('#vFile').click();
$('#vFile').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) { setSample(f, f.name); if (!$('#vName').value) $('#vName').value = f.name.replace(/\.[^.]+$/, '').slice(0, 40); syncVoiceSave(); } e.target.value = ''; });
$('#vRecBtn').onclick = async () => {
  if (VS.rec) { stopRecording(false); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) { toast('This browser cannot record audio here. Upload a file instead.', 'error'); return; }
  try {
    VS.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } });
    const chunks = [];
    VS.rec = new MediaRecorder(VS.stream);
    VS.rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    VS.rec.onstop = () => {
      const secs = (Date.now() - VS.t0) / 1000;
      if (chunks.length && !VS.discard) setSample(new Blob(chunks, { type: VS.rec.mimeType || 'audio/webm' }), `Recorded ${secs.toFixed(1)}s`);
      VS.rec = null;
    };
    VS.discard = false; VS.t0 = Date.now(); VS.rec.start();
    $('#vRec').classList.add('live'); $('#vRecBtn span').textContent = 'Stop';
    VS.timer = setInterval(() => {
      const s = (Date.now() - VS.t0) / 1000; $('#vRecTime').textContent = `Recording… ${s.toFixed(1)}s`;
      if (s >= 20) stopRecording(false);
    }, 100);
  } catch (e) { toast('Microphone unavailable: ' + (e.message || e.name), 'error'); stopRecording(true); }
};
function stopRecording(discard) {
  clearInterval(VS.timer); VS.timer = null;
  if (VS.rec && VS.rec.state !== 'inactive') { VS.discard = discard; VS.rec.stop(); }
  if (VS.stream) { VS.stream.getTracks().forEach(t => t.stop()); VS.stream = null; }
  $('#vRec').classList.remove('live'); $('#vRecBtn span').textContent = 'Record';
}
let AC = null;
const audioCtx = () => AC || (AC = new (window.AudioContext || window.webkitAudioContext)());
function decode(buf) { const c = audioCtx(); return new Promise((res, rej) => { const p = c.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); }); }
function wavBase64(abuf, maxSecs = 20) {
  const sr = abuf.sampleRate, n = Math.min(abuf.length, Math.floor(sr * maxSecs)), chs = abuf.numberOfChannels;
  const mono = new Float32Array(n);
  for (let c = 0; c < chs; c++) { const d = abuf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / chs; }
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, sr, true); out.setUint32(28, sr * 2, true);
  out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, mono[i])); out.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  const bytes = new Uint8Array(out.buffer); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { b64: btoa(bin), secs: n / sr };
}
$('#vSave').onclick = async () => {
  const name = $('#vName').value.trim(); if (!VS.blob || !name) return;
  const btn = $('#vSave'); btn.disabled = true; btn.textContent = 'Preparing…';
  try {
    const abuf = await decode(await VS.blob.arrayBuffer());
    const { b64, secs } = wavBase64(abuf);
    if (secs < 3) throw new Error('The sample is too short. Use 5 to 20 seconds of clear speech.');
    $('#voiceSheet').close();
    ensure({ engine: 'voice', profile: null }, 'the voice engine', async () => {
      try { const r = await api.addVoice(name, b64); cfg.voice.voice = r.name || name; save(); toast(`Saved “${r.name || name}”.`, 'ok', 2200); await loadVoices(); }
      catch (e) { toast('Could not save the voice: ' + e.message, 'error', 5000); }
    });
  } catch (e) { toast(e.message || 'Could not read that audio.', 'error', 5000); }
  finally { btn.textContent = 'Save voice'; syncVoiceSave(); }
};

/* ---------------- run ---------------- */
function go(over) {
  const mode = cfg.mode;
  const ta = T[mode];
  const needsText = mode !== 'music' || !cfg.music.instrumental;
  if (needsText && !ta.value.trim() && !(over && over.prompt)) { shake(ta.closest('.prompt-wrap')); ta.focus(); return; }
  if (mode === 'edit' && !S.src.edit) { shake($('.src[data-src="edit"]')); return; }
  if (!installed(mode)) { toast('That model is still downloading on your desktop.', 'info'); return; }
  const m = MODES.find(x => x.key === mode), need = needFor(mode);
  const run = { image: runImage, edit: runEdit, video: runVideo, voice: runVoice, music: runMusic }[mode];
  const snap = snapshot(mode, over);
  ensure(need, needLabel(need), () => run(snap));
  if (S.pending) S.pending.mode = mode;
  renderEngine();
}
// Capture the settings now, so a model switch in between doesn't change what runs.
function snapshot(mode, over = {}) {
  const s = JSON.parse(JSON.stringify(cfg[mode]));
  s.prompt = over.prompt != null ? over.prompt : (mode === 'voice' ? cfg.voice.text : cfg[mode].prompt);
  s.seedValue = over.seed != null ? over.seed : (s.seedLock !== undefined ? seedFor(mode) : null);
  s.over = over;
  if (mode === 'edit' || mode === 'video') s.src = S.src[mode];
  return s;
}
async function submitSd(kind, body, meta, mode) {
  try {
    const job = await api.submit(kind, body, meta);
    S.jobs.set(job.id, { id: job.id, kind, mode, status: job.status || 'queued', body, t0: Date.now(), progress: null, preview: null, queue: 0, errors: 0 });
    pickActive(); renderQueue(); syncGo();
    const j = S.jobs.get(S.activeId); if (j) showProgress(j);
    pump();
    if (matchMedia('(max-width: 900px)').matches) $('#canvas').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    toast(e.status === 503 ? 'The image engine is not ready. Try again in a moment.' : 'Could not start: ' + e.message, 'error', 5000);
    pollStatusSoon();
  }
}
function runImage(s) {
  const o = s.over || {};
  const d = o.w ? { w: o.w, h: o.h } : dims(s.ratio, s.size, s.model);
  const steps = o.steps || s.steps[s.model];
  const sp = { sample_steps: steps };
  if (s.model === 'turbo') sp.guidance = { txt_cfg: 1.0 };
  else if (s.model === 'turbo21') Object.assign(sp, TURBO21_SP);
  else if (s.model === 'real' || s.model === 'max') sp.guidance = { txt_cfg: 6.0 };   // sd.cpp's Qwen-Image 2.1 recipe: euler, cfg 6
  const body = { prompt: s.prompt, negative_prompt: '', width: d.w, height: d.h, seed: s.seedValue,
    batch_count: o.count || s.count, output_format: s.format, output_compression: s.format === 'jpeg' ? 92 : 100,
    preview: 'proj', preview_interval: 1, sample_params: sp };
  submitSd('img_gen', body, { model: PROFILE_LABEL[s.model], mode: 'create' }, 'image');
}
async function runEdit(s) {
  const src = s.src; if (!src) return;
  const mp0 = (EDIT_SIZES.find(x => x[0] === s.size) || EDIT_SIZES[1])[2], ar = src.w / src.h;
  const w = r16(Math.sqrt(mp0 * 1048576 * ar)), h = r16(Math.sqrt(mp0 * 1048576 / ar));
  let ref; try { ref = await sourceDataUrl(src, w, h); } catch (e) { toast(e.message, 'error'); return; }
  const body = { prompt: s.prompt, negative_prompt: '', width: w, height: h, seed: s.seedValue, batch_count: 1,
    ref_images: [ref], output_format: 'png', output_compression: 100, preview: 'proj', preview_interval: 1,
    sample_params: { sample_steps: s.steps, guidance: { txt_cfg: 6.0 } } };   // 2.1's recipe: euler, cfg 6 (as Realistic)
  submitSd('img_gen', body, { model: PROFILE_LABEL.edit, mode: 'edit', parent: src.item ? src.item.id : null }, 'edit');
}
async function runVideo(s) {
  const [w, h] = VID_DIMS[s.res][s.shape], frames = (VID_LEN.find(l => l[0] === s.len) || VID_LEN[0])[2];
  const body = { prompt: s.prompt, negative_prompt: '', width: w, height: h, seed: s.seedValue, video_frames: frames, fps: VID_FPS,
    output_format: 'webm', output_compression: 100, preview: 'proj', preview_interval: 1, sample_params: { sample_steps: s.steps } };
  if (s.src) { try { body.init_image = await sourceDataUrl(s.src, w, h); } catch (e) { toast(e.message, 'error'); return; } }
  submitSd('vid_gen', body, { model: PROFILE_LABEL.video, mode: s.src ? 'animate' : 'video', parent: s.src && s.src.item ? s.src.item.id : null }, 'video');
}
async function runVoice(s) {
  try {
    const r = await api.tts({ text: s.prompt, voice: s.voice || '', temperature: s.temp });
    addTask(r.task, 'voice', 'Speaking', s.prompt);
  } catch (e) { toast('Could not start: ' + e.message, 'error', 5000); pollStatusSoon(); }
}
async function runMusic(s) {
  const body = { prompt: s.prompt, lyrics: s.instrumental || s.auto ? '' : s.lyrics, duration: s.duration,
    instrumental: !!s.instrumental, auto_lyrics: !s.instrumental && !!s.auto };
  if (s.seedLock && s.seed) body.seed = +s.seed;
  try { const r = await api.music(body); addTask(r.task, 'music', 'Composing', s.prompt || 'Instrumental'); }
  catch (e) { toast('Could not start: ' + e.message, 'error', 5000); pollStatusSoon(); }
}
function runUpscale(it) {
  if (Math.max(it.width, it.height) * 4 > 8192) { toast('This image is too large to upscale 4× (the limit is 8192 px).', 'info', 4000); return; }
  if (!(S.st && S.st.installed && S.st.installed.upscale !== false)) { toast('The upscaler is still downloading.', 'info'); return; }
  ensure({ engine: 'image', profile: null }, 'the image engine', async () => {
    try { const r = await api.upscale(it.id, 1); addTask(r.task, 'upscale', 'Upscaling 4×', it.prompt || 'Image', it); }
    catch (e) { toast('Could not upscale: ' + e.message, 'error', 5000); }
  });
  if (S.pending) S.pending.mode = 'upscale';
  closeLb();
}

/* ---------------- background work: sd jobs + gateway tasks ---------------- */
function addTask(id, kind, label, title, source) {
  S.tasks.set(id, { id, kind, label, title, source, t0: Date.now(), status: 'running', stage: 'starting', progress: '', errors: 0 });
  pickActive(); renderQueue(); syncGo();
  const a = activeWork(); if (a) showProgress(a);
  pump();
}
function activeWork() { return (S.activeId && (S.jobs.get(S.activeId) || S.tasks.get(S.activeId))) || null; }
function pickActive() {
  let pick = null;
  for (const j of S.jobs.values()) { if (j.status === 'generating') { pick = j; break; } if (!pick) pick = j; }
  if (!pick) for (const t of S.tasks.values()) { pick = t; break; }
  S.activeId = pick ? pick.id : null;
}
async function pump() {
  if (S.pumping) return; S.pumping = true;
  try {
    while (S.jobs.size || S.tasks.size) {
      for (const j of [...S.jobs.values()]) {
        try {
          const d = await api.job(j.id);
          j.errors = 0;
          if (d.status === 'generating' && j.status !== 'generating') j.startedAt = Date.now();
          j.status = d.status; j.progress = d.progress; j.queue = d.queue_position || 0;
          if (d.preview && d.preview.b64_json) j.preview = 'data:image/png;base64,' + d.preview.b64_json;
          if (d.status === 'completed') { S.jobs.delete(j.id); await onJobDone(j, d); }
          else if (d.status === 'failed' || d.status === 'cancelled') {
            S.jobs.delete(j.id);
            if (d.status === 'failed') toast((d.error && d.error.message) || 'Generation failed.', 'error', 6000);
            else toast('Cancelled.', 'info', 2000);
            afterWork();
          }
        } catch (e) {
          if (++j.errors > 25) { S.jobs.delete(j.id); toast('Lost track of a job. It may still appear in the archive.', 'error', 6000); afterWork(); }
        }
      }
      for (const t of [...S.tasks.values()]) {
        try {
          const d = await api.task(t.id);
          t.errors = 0; t.stage = d.stage || t.stage; t.progress = d.progress || '';
          if (d.status === 'done') { S.tasks.delete(t.id); await onTaskDone(t, d.entry); }
          else if (d.status === 'failed') { S.tasks.delete(t.id); toast(d.error || 'That failed.', 'error', 7000); afterWork(); }
        } catch (e) {
          if (++t.errors > 25 || e.status === 404) { S.tasks.delete(t.id); toast('Lost track of a task. It may still appear in the archive.', 'error', 6000); afterWork(); }
        }
      }
      pickActive(); renderQueue(); syncGo();
      const a = activeWork(); if (a) showProgress(a);
      await sleep(S.jobs.size ? 1200 : 1000);   // each job poll carries a full preview image: keep phone data down
    }
  } finally { S.pumping = false; }
}
function afterWork() { if (!S.jobs.size && !S.tasks.size) { hideProgress(); if (S.shown) showEntry(S.shown); else resetStage(); } }
async function onJobDone(job, data) {
  await loadGallery(true);
  const items = S.gallery.filter(g => g.job === job.id).sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  if (!S.jobs.size && !S.tasks.size) hideProgress();
  const secs = ((job.startedAt ? Date.now() - job.startedAt : Date.now() - job.t0) / 1000);
  if (items.length) {
    if (!S.jobs.size || !S.jobs.has(S.activeId)) { showEntry(items[0], { animate: true }); showBatch(items); }
    const what = job.kind === 'vid_gen' ? 'Video' : items.length > 1 ? items.length + ' images' : job.mode === 'edit' ? 'Edit' : 'Image';
    toast(`${what} saved to your desktop · ${fmtMs(secs * 1000)}`, 'ok', 2600);
    flashTiles(items.map(i => i.id));
  } else {
    const r = data.result || {};
    if (job.kind === 'img_gen' && r.images && r.images[0]) {
      $('#ph').style.display = 'none'; const f = $('#final'); f.src = `data:image/${r.output_format || 'png'};base64,${r.images[0].b64_json}`; f.classList.add('instant');
    }
    toast('Finished, but the desktop could not save it. Check C:\\AI\\logs\\gateway.log.', 'error', 7000);
  }
}
async function onTaskDone(t, entry) {
  await loadGallery(true);
  if (!S.jobs.size && !S.tasks.size) hideProgress();
  const it = (entry && S.gallery.find(g => g.id === entry.id)) || entry;
  if (it) { showEntry(it, { animate: true }); flashTiles([it.id]); }
  const what = { voice: 'Voice clip', music: 'Song', upscale: 'Upscaled image' }[t.kind] || 'Result';
  toast(`${what} saved to your desktop · ${fmtMs(Date.now() - t.t0)}`, 'ok', 2800);
}

/* ---------------- stage ---------------- */
const canvas = $('#canvas'), fit = $('#fit'), preview = $('#preview'), finalImg = $('#final'), finalVid = $('#finalVid');
let stageAR = 1;
function layoutStage() {
  const mobile = matchMedia('(max-width: 900px)').matches;
  const framed = canvas.classList.contains('has-frame'), audio = canvas.classList.contains('audio-mode');
  if (mobile) {
    const w = canvas.clientWidth;
    canvas.style.height = framed && !audio ? Math.round(Math.min(w / stageAR, window.innerHeight * 0.72) + 24) + 'px' : '';
  } else canvas.style.height = '';
  if (audio) return;
  const pad = mobile ? 12 : 28;
  const cw = canvas.clientWidth - pad * 2, ch = canvas.clientHeight - pad * 2 - (mobile ? 0 : 20);
  let w = cw, h = cw / stageAR;
  if (h > ch) { h = ch; w = ch * stageAR; }
  fit.style.width = Math.max(0, Math.round(w)) + 'px'; fit.style.height = Math.max(0, Math.round(h)) + 'px';
}
new ResizeObserver(layoutStage).observe(canvas);
window.addEventListener('resize', layoutStage);
function frameOn(ar) { stageAR = ar || 1; canvas.classList.add('has-frame'); canvas.classList.remove('is-empty', 'audio-mode'); $('#audioStage').classList.remove('on'); layoutStage(); }
function stopStageMedia() { finalVid.pause(); finalVid.classList.remove('on'); for (const a of $$('#audioStage audio')) a.pause(); }

function showProgress(w) {
  const isTask = S.tasks.has(w.id);
  $('#sleep').classList.remove('on');
  $('#cancelBtn').style.display = isTask ? 'none' : '';
  let pct = 4, label = '<strong>Queued</strong>';
  if (!isTask) {
    const j = w, p = j.progress || {};
    stopStageMedia();
    frameOn(j.body.width / j.body.height);
    $('#ph').style.display = '';
    finalImg.classList.remove('on', 'instant'); finalImg.style.opacity = 0;
    if (j.status === 'queued') label = j.queue > 0 ? `<strong>Queued</strong> · ${j.queue} ahead` : '<strong>Starting</strong>';
    else if (p.stage === 'sampling' && p.total) { pct = 8 + 82 * (p.completed || 0) / p.total; label = `<strong>${j.kind === 'vid_gen' ? 'Rendering' : 'Developing'}</strong> · step ${Math.min(p.total, (p.completed || 0) + 1)} of ${p.total}`; }
    else if (p.stage === 'vae_decode' || p.stage === 'encoding') { pct = 95; label = '<strong>Finishing</strong>'; }
    else if (j.status === 'generating') { pct = 6; label = j.mode === 'edit' ? '<strong>Studying your image</strong>' : '<strong>Reading your prompt</strong>'; }
    if (j.body.batch_count > 1) label += ` · ${j.body.batch_count} images`;
    if (j.preview) {
      if (preview.src !== j.preview) preview.src = j.preview;
      preview.classList.add('on');
      const frac = p.total ? (p.completed || 0) / p.total : 0;
      preview.style.filter = `blur(${Math.max(0, 16 - frac * 16).toFixed(1)}px) saturate(${(0.6 + frac * 0.5).toFixed(2)})`;
    } else preview.classList.remove('on');
    $('#meta').classList.add('on');
    $('#metaPrompt').innerHTML = ''; $('#metaPrompt').append(el('b', null, j.body.prompt));
    const chips = [`${j.body.width}×${j.body.height}`];
    if (j.kind === 'vid_gen') chips.push(j.body.video_frames + ' frames');
    chips.push('seed ' + j.body.seed, j.body.sample_params.sample_steps + ' steps');
    setChips(chips);
    $('#strip').innerHTML = '';
  } else {
    const t = w, secs = (Date.now() - t.t0) / 1000;
    const est = t.kind === 'voice' ? estimateTask('voice', t.title) : t.kind === 'music' ? estimate('music') : 30;
    pct = Math.min(92, 6 + 86 * (est ? secs / est : 0.5));
    label = `<strong>${t.label}</strong>`;
    if (t.progress) label += ' · ' + esc(String(t.progress).slice(0, 60));
    else if (t.stage && !['starting', 'speaking', 'upscaling'].includes(t.stage)) label += ' · ' + esc(t.stage);
  }
  $('#bar').classList.add('on'); $('#bar').style.width = pct + '%';
  $('#hud').classList.add('on'); $('#hudText').innerHTML = label;
}
function estimateTask(kind, text) { const r = rateFor(g => kindOf(g) === kind, g => (g.prompt || '').length) || FALLBACK_RATE.voice; return r * (text || '').length / 1000; }
function hideProgress() { $('#bar').classList.remove('on'); $('#hud').classList.remove('on'); setTimeout(() => { if (!S.jobs.size && !S.tasks.size) $('#bar').style.width = '0'; }, 500); }
setInterval(() => {
  const a = activeWork();
  if (a) $('#hudTime').textContent = ((Date.now() - (a.startedAt || a.t0)) / 1000).toFixed(1) + 's';
}, 100);
$('#cancelBtn').onclick = async () => {
  const id = S.activeId; if (!id || !S.jobs.has(id)) return;
  try { await api.cancel(id); toast('Cancelling…', 'info', 1800); } catch (e) { toast(e.message, 'error'); }
};

function setChips(list) { const c = $('#metaChips'); c.innerHTML = ''; for (const t of list) if (t) c.append(el('span', 'chip', t)); }
function showEntry(it, opts = {}) {
  if (!it) return;
  S.shown = it;
  const k = kindOf(it);
  const dl = $('#dlBtn'); dl.href = fileUrl(it.file); dl.setAttribute('download', downloadName(it));
  $('#rerollBtn').style.display = isAudio(it) ? 'none' : '';
  $('#expandBtn').style.display = '';
  $('#meta').classList.add('on');
  $('#metaPrompt').innerHTML = ''; $('#metaPrompt').append(el('b', null, itemTitle(it)));
  if (k === 'image') {
    stopStageMedia();
    frameOn(it.width / it.height);
    const src = fileUrl(it.file);
    const done = () => {
      $('#ph').style.display = 'none';
      finalImg.classList.remove('on', 'instant'); void finalImg.offsetWidth;
      finalImg.style.opacity = '';
      finalImg.classList.add(opts.animate ? 'on' : 'instant');
      setTimeout(() => preview.classList.remove('on'), 500);
    };
    if (finalImg.getAttribute('src') === src) done(); else { finalImg.onload = done; finalImg.src = src; }
    finalImg.alt = it.prompt || '';
    const chips = [`${it.width}×${it.height}`];
    if (it.mode === 'edit') chips.push('edited'); else if (it.mode === 'upscale') chips.push('upscaled'); else chips.push('seed ' + it.seed);
    chips.push(fmtMs(it.ms));
    setChips(chips);
  } else if (k === 'video') {
    for (const a of $$('#audioStage audio')) a.pause();
    frameOn(it.width / it.height);
    $('#ph').style.display = 'none'; preview.classList.remove('on');
    finalImg.classList.remove('on', 'instant'); finalImg.style.opacity = 0;
    const src = fileUrl(it.file);
    if (finalVid.getAttribute('src') !== src) { finalVid.src = src; if (it.thumb) finalVid.poster = fileUrl(it.thumb); else finalVid.removeAttribute('poster'); }
    finalVid.classList.add('on');
    finalVid.muted = true; finalVid.play().catch(() => {});
    setChips([`${it.width}×${it.height}`, (it.duration || 0).toFixed(1) + 's', it.fps ? it.fps + ' fps' : '', fmtMs(it.ms)]);
  } else {
    stopStageMedia();
    canvas.classList.add('has-frame', 'audio-mode'); canvas.classList.remove('is-empty');
    const stage = $('#audioStage'); stage.innerHTML = ''; stage.append(audioCard(it)); stage.classList.add('on');
    layoutStage();
    setChips(k === 'voice' ? [it.voice || 'Default', fmtDur(it.duration), fmtMs(it.ms)] : [fmtDur(it.duration), it.bpm ? it.bpm + ' BPM' : '', it.key || '', fmtMs(it.ms)]);
  }
  for (const w of ['edit', 'video']) renderSource(w);
}
function showBatch(items) {
  const strip = $('#strip'); strip.innerHTML = '';
  if (items.length < 2) return;
  items.forEach((it, i) => {
    const b = el('button'); b.type = 'button'; b.setAttribute('aria-label', 'Show image ' + (i + 1));
    const im = el('img'); im.src = fileUrl(it.thumb || it.file); im.alt = ''; b.append(im);
    b.onclick = () => { showEntry(it); for (const x of strip.children) x.classList.toggle('on', x === b); };
    if (i === 0) b.classList.add('on');
    strip.append(b);
  });
}
function resetStage() {
  stopStageMedia();
  canvas.classList.remove('has-frame', 'audio-mode'); canvas.classList.add('is-empty');
  $('#audioStage').classList.remove('on');
  $('#meta').classList.remove('on'); $('#strip').innerHTML = ''; layoutStage();
}
$('#expandBtn').onclick = () => { if (S.shown) openLb(S.shown); };
$('#remixBtn').onclick = () => { if (S.shown) remix(S.shown); };
$('#rerollBtn').onclick = () => { if (S.shown) reroll(S.shown); };

/* ---------------- audio card (stage + viewer) ---------------- */
const PEAKS = new Map();
async function peaksFor(it, n = 140) {
  if (PEAKS.has(it.id)) return PEAKS.get(it.id);
  const p = (async () => {
    const buf = await (await fetch(fileUrl(it.file))).arrayBuffer();
    const ab = await decode(buf), d = ab.getChannelData(0), step = Math.max(1, Math.floor(d.length / n)), out = [];
    let max = 0;
    for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step, e = Math.min(d.length, j + step); j < e; j += 4) { const v = Math.abs(d[j]); if (v > m) m = v; } out.push(m); if (m > max) max = m; }
    return out.map(v => max ? Math.max(0.04, v / max) : 0.04);
  })();
  PEAKS.set(it.id, p);
  p.catch(() => PEAKS.delete(it.id));
  return p;
}
let nowPlaying = null;
function audioCard(it) {
  const k = kindOf(it);
  const card = el('div', 'acard');
  const top = el('div', 'acard-top');
  const cover = el('div', 'cover'); cover.style.background = coverBg(it); cover.innerHTML = k === 'voice' ? IC.voice : IC.music;
  const info = el('div', 'acard-info');
  info.append(el('div', 'acard-kind', k === 'voice' ? `Voice · ${it.voice || 'Default'}` : `Song${it.bpm ? ' · ' + it.bpm + ' BPM' : ''}${it.key ? ' · ' + it.key : ''}`),
              el('div', 'acard-title', itemTitle(it)),
              el('div', 'acard-meta', `${it.model || ''} · ${fmtDate(it.created)}`));
  top.append(cover, info);
  const audio = new Audio(); audio.preload = 'metadata'; audio.src = fileUrl(it.file);
  const player = el('div', 'player');
  const play = el('button', 'play'); play.type = 'button'; play.innerHTML = IC.play; play.setAttribute('aria-label', 'Play');
  const wave = el('div', 'wave'); const cv = el('canvas'); wave.append(cv);
  player.append(play, wave);
  const times = el('div', 'times'); const tNow = el('span', null, '0:00'), tAll = el('span', null, fmtDur(it.duration)); times.append(tNow, tAll);
  card.append(top, player, times, audio);
  let peaks = null, raf = 0;
  const draw = () => {
    const r = wave.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    if (!r.width) return;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const g = cv.getContext('2d'), n = peaks ? peaks.length : 70, bw = cv.width / n;
    const frac = audio.duration ? audio.currentTime / audio.duration : 0;
    const grad = g.createLinearGradient(0, 0, cv.width, 0); grad.addColorStop(0, '#ffb46b'); grad.addColorStop(.5, '#ff5d8f'); grad.addColorStop(1, '#8d6bff');
    for (let i = 0; i < n; i++) {
      const v = peaks ? peaks[i] : 0.12 + 0.08 * Math.sin(i * 0.7);
      const h = Math.max(2 * dpr, v * cv.height * 0.92), x = i * bw;
      g.fillStyle = (i + 0.5) / n <= frac ? grad : 'rgba(255,255,255,.2)';
      g.beginPath(); const rr = Math.min(bw * 0.3, 2 * dpr);
      if (g.roundRect) g.roundRect(x + bw * 0.18, (cv.height - h) / 2, bw * 0.64, h, rr); else g.rect(x + bw * 0.18, (cv.height - h) / 2, bw * 0.64, h);
      g.fill();
    }
  };
  const loop = () => { draw(); tNow.textContent = fmtDur(audio.currentTime); if (!audio.paused) raf = requestAnimationFrame(loop); };
  audio.addEventListener('play', () => { if (nowPlaying && nowPlaying !== audio) nowPlaying.pause(); nowPlaying = audio; play.innerHTML = IC.pause; play.setAttribute('aria-label', 'Pause'); cancelAnimationFrame(raf); loop(); });
  audio.addEventListener('pause', () => { play.innerHTML = IC.play; play.setAttribute('aria-label', 'Play'); cancelAnimationFrame(raf); draw(); });
  audio.addEventListener('ended', () => { audio.currentTime = 0; draw(); });
  audio.addEventListener('loadedmetadata', () => { if (isFinite(audio.duration)) tAll.textContent = fmtDur(audio.duration); });
  play.onclick = () => { if (audio.paused) audio.play().catch(e => toast('Could not play: ' + e.message, 'error')); else audio.pause(); };
  const seek = e => { const r = wave.getBoundingClientRect(); if (!audio.duration) return; audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration; draw(); tNow.textContent = fmtDur(audio.currentTime); };
  wave.addEventListener('pointerdown', e => { seek(e); wave.setPointerCapture(e.pointerId); const mv = ev => seek(ev); wave.addEventListener('pointermove', mv); wave.addEventListener('pointerup', () => wave.removeEventListener('pointermove', mv), { once: true }); });
  new ResizeObserver(draw).observe(wave);
  peaksFor(it).then(p => { peaks = p; draw(); }).catch(() => {});
  return card;
}

/* ---------------- remix / re-roll ---------------- */
function nearestRatio(ar) { let best = RATIOS[0], bd = 9; for (const r of RATIOS) { const d = Math.abs(Math.log((r[1] / r[2]) / ar)); if (d < bd) { bd = d; best = r; } } return best[0]; }
function remix(it) {
  const k = kindOf(it);
  closeLb();
  if (k === 'image' && it.mode === 'edit') {
    setMode('edit', false);
    T.edit.value = it.prompt || ''; T.edit.dispatchEvent(new Event('input'));
    const parent = it.parent && S.gallery.find(g => g.id === it.parent); if (parent) setSourceItem('edit', parent);
  } else if (k === 'image') {
    setMode('image', false);
    cfg.image.model = IMG_MODELS.some(m => m[0] === profileOf(it)) ? profileOf(it) : 'real';
    T.image.value = it.prompt || ''; T.image.dispatchEvent(new Event('input'));
    cfg.image.ratio = nearestRatio(it.width / it.height);
    const m = it.width * it.height / 1048576; let bs = SIZES[1], bm = 9; for (const s of SIZES) { const d = Math.abs(s[2] - m); if (d < bm) { bm = d; bs = s; } }
    cfg.image.size = bs[0];
    if (it.seed) { cfg.image.seed = String(it.seed); cfg.image.seedLock = true; }
    if (it.steps) cfg.image.steps[cfg.image.model] = it.steps;
  } else if (k === 'video') {
    setMode('video', false);
    T.video.value = it.prompt || ''; T.video.dispatchEvent(new Event('input'));
    const ar = it.width / it.height; cfg.video.shape = ar > 1.25 ? '16:9' : ar < 0.8 ? '9:16' : '1:1';
    cfg.video.res = Math.min(it.width, it.height) > 600 ? '704' : '480';
    const f = it.frames || 49; cfg.video.len = f > 100 ? '5' : f > 60 ? '3' : '2';
    if (it.seed) { cfg.video.seed = String(it.seed); cfg.video.seedLock = true; }
    if (it.steps) cfg.video.steps = it.steps;
    const parent = it.parent && S.gallery.find(g => g.id === it.parent); if (parent) setSourceItem('video', parent);
  } else if (k === 'voice') {
    setMode('voice', false);
    T.voice.value = it.prompt || ''; T.voice.dispatchEvent(new Event('input'));
    cfg.voice.voice = it.voice && it.voice !== 'Default' ? it.voice : ''; renderVoices();
  } else if (k === 'music') {
    setMode('music', false);
    T.music.value = it.prompt || ''; T.music.dispatchEvent(new Event('input'));
    const instr = !it.lyrics || it.lyrics === '[Instrumental]';
    cfg.music.instrumental = instr; cfg.music.auto = false;
    $('#musicLyrics').value = instr ? '' : it.lyrics; cfg.music.lyrics = $('#musicLyrics').value;
    $('#musicInstr').checked = instr; $('#musicAuto').checked = false;
    if (it.duration) cfg.music.duration = Math.max(10, Math.min(240, Math.round(it.duration / 5) * 5));
    $('#musicDur').value = cfg.music.duration;
    if (it.seed) { cfg.music.seed = String(it.seed).split(',')[0]; cfg.music.seedLock = !!cfg.music.seed; }
  }
  save(); syncComposer();
  const ta = T[cfg.mode]; ta.focus({ preventScroll: true }); autosize(ta); autosize($('#musicLyrics'));
  $('.composer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  toast('Settings loaded. Tweak and go.', 'info', 2200);
}
function reroll(it) {
  const k = kindOf(it);
  closeLb();
  if (k === 'image' && it.mode !== 'edit' && it.mode !== 'upscale') {
    const model = profileOf(it);
    const s = snapshot('image', { prompt: it.prompt, w: it.width, h: it.height, seed: randSeed(), count: 1, steps: it.steps });
    s.model = model;
    setMode('image', false);
    ensure({ engine: 'image', profile: engProfile(model) }, PROFILE_LABEL[model], () => runImage(s)); if (S.pending) S.pending.mode = 'image';
  } else if (k === 'video') { remix(it); cfg.video.seedLock = false; cfg.video.seed = ''; save(); syncComposer(); go(); }
  else if (k === 'image' && it.mode === 'edit') { remix(it); cfg.edit.seedLock = false; cfg.edit.seed = ''; save(); syncComposer(); go(); }
  else remix(it);
}

/* ---------------- archive ---------------- */
const grid = $('#grid');
const PAGE = 40;
const FILTERS = [['all', 'All'], ['image', 'Images'], ['video', 'Video'], ['audio', 'Audio']];
function buildFilters() {
  const box = $('#filters'); box.innerHTML = '';
  for (const [key, label] of FILTERS) {
    const b = el('button'); b.type = 'button'; b.dataset.key = key; b.innerHTML = `${label}<span class="n"></span>`;
    b.onclick = () => { cfg.filter = key; save(); syncFilters(); applyFilter(); };
    box.append(b);
  }
  syncFilters();
}
function syncFilters() {
  const c = { all: S.gallery.length, image: 0, video: 0, audio: 0 };
  for (const g of S.gallery) { const k = kindOf(g); if (k === 'image') c.image++; else if (k === 'video') c.video++; else c.audio++; }
  for (const b of $('#filters').children) { b.setAttribute('aria-pressed', b.dataset.key === cfg.filter); b.querySelector('.n').textContent = c[b.dataset.key] || ''; }
}
async function loadGallery(force) {
  let data;
  try { data = await api.gallery(); } catch { return; }
  const items = data.items || [];
  const newIds = new Set(items.map(i => i.id));
  const added = items.filter(i => !S.ids.has(i.id));
  const removed = [...S.ids].some(id => !newIds.has(id));
  const onlyPrepend = !removed && added.length && items.slice(0, added.length).every(i => !S.ids.has(i.id));
  S.gallery = items; S.ids = newIds; S.savedCount = data.count;
  $('#navCount').textContent = items.length;
  const n = items.length;
  $('#archSub').textContent = n ? `${n} creation${n === 1 ? '' : 's'} · kept on your desktop` : 'Everything you make is kept on your desktop.';
  syncFilters();
  if (onlyPrepend && S.rendered) {
    const fresh = added.filter(matches);
    S.filtered = items.filter(matches);
    const first = grid.firstChild;
    for (const it of fresh) grid.insertBefore(tile(it), first);
    S.rendered += fresh.length;
  } else if (added.length || removed || force === 'reset' || !S.rendered) applyFilter();
  $('#archEmpty').hidden = items.length > 0;
  restoreSources();
  if (!S.shown && items.length && !S.jobs.size && !S.tasks.size) showEntry(items[0]);
  syncGo();
}
function matches(it) {
  const k = kindOf(it), f = cfg.filter;
  if (f === 'image' && k !== 'image') return false;
  if (f === 'video' && k !== 'video') return false;
  if (f === 'audio' && !isAudio(it)) return false;
  if (!S.query) return true;
  return [it.prompt, it.lyrics, it.voice, it.model].some(v => String(v || '').toLowerCase().includes(S.query));
}
function applyFilter() { S.filtered = S.gallery.filter(matches); grid.innerHTML = ''; S.rendered = 0; renderMore(); }
function renderMore() {
  const next = S.filtered.slice(S.rendered, S.rendered + PAGE);
  const frag = document.createDocumentFragment();
  next.forEach((it, i) => { const t = tile(it); t.style.animationDelay = Math.min(i, 12) * 35 + 'ms'; frag.append(t); });
  grid.append(frag); S.rendered += next.length;
}
const hoverable = matchMedia('(hover: hover) and (pointer: fine)').matches;
function tile(it) {
  const k = kindOf(it);
  const b = el('button', 'tile'); b.type = 'button'; b.dataset.id = it.id;
  b.setAttribute('aria-label', 'Open: ' + itemTitle(it));
  b.onclick = () => openLb(it);
  if (isAudio(it)) {
    b.classList.add('audio'); b.style.background = coverBg(it);
    const ic = el('span', 'a-icon'); ic.innerHTML = k === 'voice' ? IC.voice : IC.music;
    const bars = el('span', 'bars'); for (let i = 0; i < 9; i++) { const x = el('i'); x.style.height = (6 + ((hue(it.id + i) % 24))) + 'px'; bars.append(x); }
    const meta = el('span', 'a-meta'); meta.append(el('span', null, k === 'voice' ? (it.voice || 'Voice') : 'Song'), el('span', null, fmtDur(it.duration)));
    b.append(ic, bars, el('span', 'a-text', itemTitle(it)), meta);
    return b;
  }
  b.style.aspectRatio = `${it.width || 1} / ${it.height || 1}`;
  if (it.thumb || k === 'image') {
    const im = el('img'); im.loading = 'lazy'; im.decoding = 'async'; im.alt = it.prompt || '';
    im.onload = () => im.classList.add('ld'); im.src = fileUrl(it.thumb || it.file);
    b.append(im);
  } else b.classList.add('noposter');
  if (k === 'video') {
    const badge = el('span', 'badge'); badge.innerHTML = IC.video + (it.mode === 'animate' ? 'Animated' : 'Video'); b.append(badge);
    const d = el('span', 'dur'); d.innerHTML = IC.play + fmtDur(it.duration); b.append(d);
    if (hoverable) {
      let v = null;
      b.addEventListener('mouseenter', () => { v = el('video', 'hover'); v.muted = true; v.loop = true; v.playsInline = true; v.src = fileUrl(it.file); b.append(v); v.play().catch(() => {}); });
      b.addEventListener('mouseleave', () => { if (v) { v.pause(); v.remove(); v = null; } });
    }
  } else if (it.mode === 'edit' || it.mode === 'upscale') {
    const badge = el('span', 'badge'); badge.innerHTML = it.mode === 'edit' ? IC.edit + 'Edited' : IC.upscale + '4×'; b.append(badge);
  }
  const cap = el('span', 'cap'); cap.append(el('span', 'p', it.prompt || ''), el('span', 'm', `${it.width}×${it.height} · ${fmtDate(it.created)}`));
  b.append(cap);
  return b;
}
function flashTiles(ids) {
  for (const id of ids) { const t = grid.querySelector(`[data-id="${CSS.escape(id)}"]`); if (t) { t.classList.add('fresh'); setTimeout(() => t.classList.remove('fresh'), 4000); } }
}
new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && S.rendered < S.filtered.length) renderMore(); }, { rootMargin: '800px' }).observe($('#sentinel'));
let qTimer;
$('#search').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.query = e.target.value.trim().toLowerCase(); applyFilter(); }, 140); });

/* ---------------- viewer ---------------- */
const lb = $('#lb'), lbImg = $('#lbImg'), lbVid = $('#lbVid'), lbAudio = $('#lbAudio');
function openLb(it) {
  S.lbList = S.filtered.some(x => x.id === it.id) ? S.filtered : S.gallery;
  S.lbIndex = Math.max(0, S.lbList.findIndex(x => x.id === it.id));
  if (S.lbIndex < 0 || !S.lbList[S.lbIndex]) { S.lbList = [it]; S.lbIndex = 0; }
  stopStageMedia();
  renderLb();
  if (!lb.open) lb.showModal();
}
function stopLbMedia() { lbVid.pause(); for (const a of $$('audio', lbAudio)) a.pause(); }
function renderLb() {
  const it = S.lbList[S.lbIndex]; if (!it) return closeLb();
  const k = kindOf(it);
  stopLbMedia();
  lbImg.hidden = k !== 'image'; lbVid.hidden = k !== 'video'; lbAudio.hidden = !isAudio(it);
  if (k === 'image') {
    lbImg.style.animation = 'none'; void lbImg.offsetWidth; lbImg.style.animation = '';
    const full = fileUrl(it.file), thumb = fileUrl(it.thumb || it.file);
    lbImg.src = thumb; lbImg.alt = it.prompt || '';
    if (full !== thumb) { const hi = new Image(); hi.onload = () => { if (S.lbList[S.lbIndex] === it) lbImg.src = full; }; hi.src = full; }
  } else if (k === 'video') {
    lbVid.src = fileUrl(it.file); if (it.thumb) lbVid.poster = fileUrl(it.thumb); else lbVid.removeAttribute('poster');
    lbVid.muted = false; lbVid.play().catch(() => { lbVid.muted = true; lbVid.play().catch(() => {}); });
  } else { lbAudio.innerHTML = ''; lbAudio.append(audioCard(it)); }
  $('#lbCount').textContent = `${S.lbIndex + 1} / ${S.lbList.length}`;
  $('#lbPrompt').textContent = itemTitle(it);
  const lyr = k === 'music' && it.lyrics && it.lyrics !== '[Instrumental]' ? it.lyrics : '';
  $('#lbLyricsHead').hidden = !lyr; $('#lbLyrics').hidden = !lyr; $('#lbLyrics').textContent = lyr;
  const specs = $('#lbSpecs'); specs.innerHTML = '';
  const file = `${(it.format || String(it.file).split('.').pop() || '').toUpperCase()} · ${fmtBytes(it.bytes)}`;
  let rows;
  if (k === 'image') rows = [['Size', `${it.width} × ${it.height}`], ['Model', it.model ? String(it.model).split(/[\\/]/).pop() : 'Z-Image Turbo'],
    it.mode === 'upscale' || it.mode === 'edit' ? ['Made by', it.mode === 'edit' ? 'Editing' : 'Upscaling'] : ['Seed', it.seed || '—'],
    ['Steps', it.steps || '—'], ['Render time', fmtMs(it.ms)], ['Created', fmtDate(it.created)], ['File', file]];
  else if (k === 'video') rows = [['Size', `${it.width} × ${it.height}`], ['Length', `${(it.duration || 0).toFixed(1)}s · ${it.frames || '?'} frames`],
    ['Model', it.model || 'Wan 2.2 5B'], ['Seed', it.seed || '—'], ['Steps', it.steps || '—'], ['Render time', fmtMs(it.ms)], ['Created', fmtDate(it.created)], ['File', file]];
  else if (k === 'voice') rows = [['Voice', it.voice || 'Default'], ['Length', fmtDur(it.duration)], ['Model', it.model || 'Chatterbox Turbo'],
    ['Render time', fmtMs(it.ms)], ['Created', fmtDate(it.created)], ['File', file]];
  else rows = [['Length', fmtDur(it.duration)], ['Tempo', it.bpm ? it.bpm + ' BPM' : '—'], ['Key', it.key || '—'], ['Seed', it.seed || '—'],
    ['Model', it.model || 'ACE-Step 1.5'], ['Render time', fmtMs(it.ms)], ['Created', fmtDate(it.created)], ['File', file]];
  for (const [a, b] of rows) { const d = el('div', 'spec'); d.append(el('dt', null, a), el('dd', null, String(b))); specs.append(d); }
  renderLbActions(it);
  $('#lbPrev').disabled = S.lbIndex <= 0; $('#lbNext').disabled = S.lbIndex >= S.lbList.length - 1;
  $('#lbPrev').style.opacity = S.lbIndex <= 0 ? .3 : 1; $('#lbNext').style.opacity = S.lbIndex >= S.lbList.length - 1 ? .3 : 1;
}
function renderLbActions(it) {
  const box = $('#lbActions'); box.innerHTML = '';
  const k = kindOf(it);
  const dl = el('a', 'btn primary'); dl.href = fileUrl(it.file); dl.setAttribute('download', downloadName(it)); dl.innerHTML = IC.download + 'Download'; box.append(dl);
  const btn = (icon, label, fn, opts = {}) => { const b = el('button', 'btn' + (opts.cls ? ' ' + opts.cls : '')); b.type = 'button'; b.innerHTML = icon + `<span>${label}</span>`; if (opts.title) b.title = opts.title; if (opts.disabled) b.disabled = true; b.onclick = fn; box.append(b); return b; };
  if (k === 'image') {
    btn(IC.edit, 'Edit', () => { closeLb(); setMode('edit', true); setSourceItem('edit', it); T.edit.focus({ preventScroll: true }); });
    btn(IC.animate, 'Animate', () => { closeLb(); setMode('video', true); setSourceItem('video', it); T.video.focus({ preventScroll: true }); });
    const big = Math.max(it.width, it.height) * 4 > 8192;
    btn(IC.upscale, 'Upscale 4×', () => runUpscale(it), { disabled: big, title: big ? 'Too large to upscale 4× (limit 8192 px)' : `To ${it.width * 4} × ${it.height * 4}` });
    btn(IC.chat, 'Ask in Chat', () => { closeLb(); Chat.askAboutUrl(fileUrl(it.file)); }, { title: 'Start a chat about this image' });
  }
  btn(IC.remix, 'Remix', () => remix(it));
  if (!isAudio(it) && it.mode !== 'upscale') btn(IC.reroll, 'Re-roll', () => reroll(it));
  btn(IC.copy, k === 'voice' ? 'Copy text' : 'Copy prompt', () => copyText(it.prompt || ''));
  const del = btn(IC.trash, 'Delete', () => deleteItem(it, del), { cls: 'danger' });
  if (box.children.length % 2 === 0) del.classList.add('wide');
}
async function copyText(p) {
  try { await navigator.clipboard.writeText(p); toast('Copied.', 'ok', 1600); }
  catch { const t = el('textarea'); t.value = p; document.body.append(t); t.select(); try { document.execCommand('copy'); toast('Copied.', 'ok', 1600); } catch { toast('Copy failed.', 'error'); } t.remove(); }
}
let armTimer;
async function deleteItem(it, b) {
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.querySelector('span').textContent = 'Tap again to delete'; clearTimeout(armTimer); armTimer = setTimeout(() => { b.classList.remove('armed'); b.querySelector('span').textContent = 'Delete'; }, 3500); return; }
  try {
    stopLbMedia();
    await api.remove([it.id]);
    toast('Moved to the trash folder on your desktop.', 'info', 2600);
    if (S.shown && S.shown.id === it.id) { S.shown = null; resetStage(); }
    await loadGallery('reset');
    S.lbList = S.filtered;
    if (!S.lbList.length) { closeLb(); return; }
    S.lbIndex = Math.min(S.lbIndex, S.lbList.length - 1); renderLb();
  } catch (e) { toast('Delete failed: ' + e.message, 'error'); }
}
function closeLb() { stopLbMedia(); if (lb.open) lb.close(); }
lb.addEventListener('close', stopLbMedia);
function step(n) { const i = S.lbIndex + n; if (i >= 0 && i < S.lbList.length) { S.lbIndex = i; renderLb(); } }
$('#lbPrev').onclick = () => step(-1); $('#lbNext').onclick = () => step(1); $('#lbClose').onclick = closeLb;
lb.addEventListener('click', e => { if (e.target === lb || e.target === $('#lbView')) closeLb(); });
lb.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1); });
let tx = null, ty = null;
$('#lbView').addEventListener('touchstart', e => { if (e.target.closest('.wave, video')) { tx = null; return; } tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
$('#lbView').addEventListener('touchend', e => {
  if (tx == null) return; const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; tx = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1); else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) closeLb();
}, { passive: true });

/* ---------------- misc ---------------- */
function renderQueue() {
  const q = $('#queue'); q.innerHTML = '';
  for (const j of S.jobs.values()) {
    if (j.id === S.activeId) continue;
    const it = el('div', 'qitem'); it.append(el('span', null, j.body.prompt));
    const x = el('button'); x.type = 'button'; x.setAttribute('aria-label', 'Remove from queue'); x.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    x.onclick = async () => { try { await api.cancel(j.id); } catch (e) { toast(e.message, 'error'); } };
    it.append(x); q.append(it);
  }
  for (const t of S.tasks.values()) {
    if (t.id === S.activeId) continue;
    const it = el('div', 'qitem'); it.append(el('span', null, `${t.label}: ${t.title}`)); q.append(it);
  }
}
function buildIdeas() {
  const box = $('#ideas'); box.innerHTML = '';
  const mode = cfg.mode;
  const pool = [...IDEAS[mode]].sort(() => Math.random() - .5).slice(0, 3);
  for (const p of pool) { const b = el('button', 'idea', p); b.type = 'button'; b.onclick = () => { T[mode].value = p; T[mode].dispatchEvent(new Event('input')); T[mode].focus(); }; box.append(b); }
}
window.addEventListener('scroll', () => { $('#top').classList.toggle('scrolled', scrollY > 8); }, { passive: true });
document.addEventListener('keydown', e => {
  if (e.key === '/' && !lb.open && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); if (V.view === 'chat') $('#chatInput').focus(); else if (V.view === 'studio') T[cfg.mode].focus(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickStatus(); });

/* ================= v3: Studio · Chat · Code ================= */
const VIEWS = ['studio', 'chat', 'code'];
const VIEW_NEED = { chat: { engine: 'llm', profile: null }, code: { engine: 'code', profile: null } };
const V = { view: 'studio', prev: 'studio', boot: null, bootTimer: null };
const chatModelName = () => (S.st && S.st.chat_model) || 'Qwen3.6 35B';
const codeModelName = () => (S.st && S.st.code_model) || chatModelName();
// Chat and Code are separate modes on the GPU: the gateway reports engine 'llm' (Chat) or 'code' (Code).
const llmUp = () => !!(S.st && S.reachable && S.st.engine === 'llm' && S.st.ready && !switching());
const codeUp = () => !!(S.st && S.reachable && S.st.engine === 'code' && S.st.ready && S.st.code && !switching());
const onLlm = st => !!st && (st.engine === 'llm' || st.engine === 'code');
function viewNeed(v) { return v === 'studio' ? needFor(cfg.mode) : VIEW_NEED[v]; }
function viewReady(v) {
  if (v === 'chat') return llmUp();
  if (v === 'code') return codeUp();
  return isReady(viewNeed('studio'));
}
function setTopH() { document.documentElement.style.setProperty('--top-h', $('#top').offsetHeight + 'px'); }
function applyView(v) {
  V.view = v; document.body.dataset.view = v;
  $('#viewName').textContent = v === 'studio' ? 'Studio' : v === 'chat' ? 'Chat' : 'Code';
  for (const b of $$('#views button')) b.setAttribute('aria-selected', b.dataset.view === v);
  const hash = v === 'studio' ? '' : '#' + v;
  if (location.hash !== hash && !(v === 'studio' && location.hash === '#archive')) history.replaceState(null, '', location.pathname + location.search + hash);
  store.set('view', v);
  requestAnimationFrame(setTopH);
  if (v === 'chat') { Chat.show(); }
  if (v === 'code') { Code.load(); }
  if (v === 'studio') { layoutStage(); window.scrollTo({ top: 0 }); }
}
// A click on Studio / Chat / Code: show that view behind the loading screen until its model is ready.
function goView(v, opts = {}) {
  if (!VIEWS.includes(v)) v = 'studio';
  if (v !== V.view) V.prev = V.view;
  applyView(v);
  if (viewReady(v)) { closeBoot(); return; }
  if (!S.st || !S.reachable) { openBoot(v, 'idle'); return; }
  if (opts.passive) { openBoot(v, isSwitchingTo(v) ? 'loading' : 'idle'); return; }
  startBoot(v, false);
}
function isSwitchingTo(v) {
  const sw = S.st && S.st.switching; if (!sw || !switching()) return false;
  const n = viewNeed(v);
  if (v === 'chat') return sw.engine === 'llm' || (sw.engine === 'code' && !!S.st.same_model);
  return sw.engine === n.engine && (!n.profile || sw.profile === n.profile);
}
async function startBoot(v, force) {
  const n = viewNeed(v);
  const localBusy = S.jobs.size + S.tasks.size;
  if (!force && v !== 'studio' && ((S.st && S.st.busy) || localBusy) && !onLlm(S.st)) { openBoot(v, 'ask'); return; }
  openBoot(v, 'loading');
  try {
    // An explicit click on a mode means "switch the GPU", so it always takes over from whatever runs.
    const r = await api.use(n.engine, n.profile, true);
    if (r && r.ready) { await refreshStatus(); }
  } catch (e) {
    if (e.status === 409 && /switching/i.test(e.message)) { V.boot && (V.boot.retryAt = Date.now() + 2500); }
    else if (V.boot) { V.boot.state = 'error'; V.boot.error = e.message; }
  }
  pollStatusSoon(); renderBoot();
}
function openBoot(v, state) {
  V.boot = { view: v, state, t0: Date.now(), error: null, retryAt: 0, sawSwitch: false };
  $('#boot').classList.remove('out'); $('#boot').classList.add('on');
  clearInterval(V.bootTimer); V.bootTimer = setInterval(renderBoot, 1000);
  renderBoot();
}
function closeBoot() {
  clearInterval(V.bootTimer);
  const b = $('#boot');
  if (!b.classList.contains('on')) { V.boot = null; return; }
  b.classList.add('out');
  setTimeout(() => { b.classList.remove('on', 'out'); }, 450);
  const was = V.boot; V.boot = null;
  if (was && was.view === 'chat') setTimeout(() => $('#chatInput').focus({ preventScroll: true }), 300);
}
const VIEW_COPY = {
  studio: { name: 'Studio', model: () => needLabel(viewNeed('studio')), text: m => `Stopping ${S.st && S.st.engine === 'code' ? 'Code' : 'Chat'} and loading ${m}. Your images, voice and music tools come back as soon as it's ready.` },
  chat: { name: 'Chat', model: chatModelName, text: m => S.st && S.st.engine === 'code' ? `Stopping Code's model and loading ${m} onto your GPU. The first load takes about a minute.` : `Stopping the image, voice and music models and loading ${m} onto your GPU. The first load takes about a minute.` },
  code: { name: 'Code', model: codeModelName, text: m => S.st && S.st.same_model ? `Loading ${m} and starting your coding workspace. Code uses the same model as Chat, so if Chat is on this is quick.` : `Loading ${m}, your coding model, and starting the coding workspace.` }
};
function bootSteps(v, st) {
  const sw = st && st.switching, sws = switching() ? sw.stage : null;
  const run = st && st.engine;
  const want = viewNeed(v);
  const llmRun = run === 'llm' || run === 'code';
  // Chat/Code: the right model is loaded when this mode runs, or the other one runs on the same model.
  const engineUp = v === 'studio' ? (run === want.engine && st.ready) : !!(st && st.ready && (run === want.engine || (llmRun && st.same_model)));
  const steps = [];
  const freed = engineUp || sws === 'wait' || sws === 'load';
  steps.push(['Free the GPU', freed ? 'done' : 'active', freed ? '' : llmRun ? 'stopping ' + (run === 'code' ? 'Code' : 'Chat') : 'stopping media']);
  const label = v === 'studio' ? needLabel(want) : v === 'code' ? codeModelName() : chatModelName();
  steps.push(['Load ' + label, engineUp ? 'done' : freed ? 'active' : 'wait', '']);
  if (v === 'studio' && want.profile && want.profile !== 'turbo') steps[1][2] = 'weights load on first use';
  if (v === 'code') steps.push(['Start the workspace', st && st.code ? 'done' : engineUp ? 'active' : 'wait', 'OpenCode']);
  return steps;
}
function renderBoot() {
  const B = V.boot; if (!B) return;
  const st = S.st, v = B.view, copy = VIEW_COPY[v], model = copy.model();
  if (B.state === 'loading' && viewReady(v)) { closeBoot(); return; }
  const sw = st && st.switching;
  if (B.state === 'loading' && switching()) B.sawSwitch = true;
  // The gateway reports a failed switch for our engine: show it.
  if (B.state === 'loading' && sw && sw.stage === 'error' && B.sawSwitch) { B.state = 'error'; B.error = sw.error || 'The model did not load.'; }
  // Loading but nothing happening (another device took the GPU, or the request was refused): ask again.
  if (B.state === 'loading' && !switching() && st && !viewReady(v) && Date.now() - B.t0 > 8000 && (B.sawSwitch || Date.now() > B.retryAt + 6000) && B.retryAt !== -1) {
    if (B.retryAt && Date.now() > B.retryAt) { B.retryAt = -1; startBoot(v, true); return; }
  }
  const box = $('#boot'); box.classList.toggle('idle', B.state === 'idle'); box.classList.toggle('error', B.state === 'error'); box.classList.toggle('ask', B.state === 'ask');
  const title = $('#bootTitle'), text = $('#bootText'), eb = $('#bootEyebrow'), go = $('#bootGo'), back = $('#bootBack'), list = $('#bootSteps'), time = $('#bootTime');
  go.hidden = true; list.hidden = false; back.hidden = false;
  back.textContent = V.prev && V.prev !== v ? 'Back to ' + VIEW_COPY[V.prev].name : 'Not now';
  if (!S.reachable) {
    eb.textContent = 'Offline'; title.innerHTML = "Can't reach <em>your desktop.</em>";
    text.textContent = 'Check that the desktop is on and that Tailscale is connected on this device.'; list.hidden = true; time.textContent = '';
    return;
  }
  if (B.state === 'ask') {
    eb.textContent = 'Something is still rendering';
    title.innerHTML = `Switch to <em>${copy.name}?</em>`;
    text.textContent = `Your desktop runs one model at a time, and a job is still running in Studio. Switching to ${copy.name} stops it.`;
    list.hidden = true; time.textContent = '';
    go.hidden = false; $('#bootGoLabel').textContent = 'Stop it and switch'; go.onclick = () => startBoot(v, true);
  } else if (B.state === 'idle') {
    eb.textContent = st && st.engine && st.engine !== 'off' && st.engine !== 'llm' ? 'The GPU is on ' + (st.engine === 'image' ? 'Studio' : ENGINE_LABEL[st.engine]) : st && st.engine === 'llm' ? 'The GPU is on Chat' : 'The GPU is idle';
    title.innerHTML = `${copy.name} is <em>asleep.</em>`;
    text.textContent = v === 'studio' ? `Load ${model} to start making things. This stops Chat if it's running.` : `Load ${model} to start. This stops the image, voice and music models if one is running.`;
    list.hidden = true; time.textContent = '';
    go.hidden = false; $('#bootGoLabel').textContent = 'Load ' + copy.name; go.onclick = () => startBoot(v, false);
  } else if (B.state === 'error') {
    eb.textContent = 'Something went wrong';
    title.innerHTML = `Couldn't load <em>${copy.name}.</em>`;
    text.textContent = B.error || 'The model did not load.'; list.hidden = true; time.textContent = '';
    go.hidden = false; $('#bootGoLabel').textContent = 'Try again'; go.onclick = () => startBoot(v, true);
  } else {
    eb.textContent = "Switching your desktop's GPU";
    title.innerHTML = `Loading <em>${copy.name}…</em>`;
    text.textContent = copy.text(model);
    list.innerHTML = '';
    for (const [label, s, sub] of bootSteps(v, st)) {
      const li = el('li'); li.dataset.s = s === 'wait' ? '' : s;
      li.append(el('span', 'st'), el('span', null, label)); if (sub) li.append(el('span', 'sub', sub)); list.append(li);
    }
    const secs = Math.round((Date.now() - B.t0) / 1000);
    time.textContent = secs > 1 ? secs + 's' : '';
  }
  back.onclick = () => { const to = V.prev && V.prev !== v ? V.prev : null; closeBoot(); if (to) { applyView(to); if (!viewReady(to)) openBoot(to, isSwitchingTo(to) ? 'loading' : 'idle'); } else if (v !== 'studio') { applyView('studio'); } };
}
// Called after every /gw/status refresh.
function onViewStatus() {
  const st = S.st;
  for (const b of $$('#views button')) {
    const w = b.dataset.view;
    const live = !!st && S.reachable && (w === 'studio' ? ['image', 'voice', 'music'].includes(st.engine) && st.ready : w === 'chat' ? llmUp() : codeUp());
    b.classList.toggle('live', live);
    b.title = ({ studio: 'Studio', chat: 'Chat', code: 'Code' })[w] + (live ? ' · loaded on the GPU' : '');
  }
  $('#chatModel').textContent = chatModelName() + (llmUp() ? '' : ' · asleep');
  $('#chatEyebrow').textContent = chatModelName() + ' · running on your desktop';
  $('#codeEyebrow').textContent = 'OpenCode · ' + chatModelName() + ' · on your desktop';
  if (V.boot) { renderBoot(); return; }
  // The model for the open view went away (another device took the GPU): say so.
  if (V.view !== 'studio' && st && S.reachable && !viewReady(V.view) && !Chat.streaming) openBoot(V.view, isSwitchingTo(V.view) ? 'loading' : 'idle');
  if (V.view === 'chat' && llmUp()) Chat.props();
  Chat.syncSend();
}
for (const b of $$('#views button')) b.onclick = () => { if (b.dataset.view === V.view && !V.boot) return; goView(b.dataset.view, { user: true }); };
for (const m of $$('.mark-link')) m.onclick = e => { e.preventDefault(); goView('studio', { user: true }); };
for (const b of $$('#views button')) b.title = { studio: 'Studio', chat: 'Chat', code: 'Code' }[b.dataset.view];
// Archive: browse saved work without switching the GPU.
$('#railArch').onclick = e => {
  e.preventDefault();
  if (V.view !== 'studio') { closeBoot(); applyView('studio'); }
  requestAnimationFrame(() => $('#archive').scrollIntoView({ behavior: 'smooth' }));
};
window.addEventListener('resize', setTopH);

/* ---------------- markdown (escaped first, so model output can't inject HTML) ---------------- */
function mdInline(s) {
  const codes = [];
  s = s.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  s = esc(s);
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g, (_, p, u) => `${p}<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => '<code>' + esc(codes[+i]) + '</code>');
}
function md(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  let out = '', i = 0;
  const isTableSep = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => mdInline(c.trim()));
  while (i < lines.length) {
    const l = lines[i];
    const fence = l.match(/^\s*(```+|~~~+)\s*([\w+#.-]*)/);
    if (fence) {
      const close = fence[1]; const lang = fence[2] || ''; const body = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith(close)) body.push(lines[i++]);
      i++;
      out += `<div class="code"><div class="code-head"><span>${esc(lang || 'text')}</span><button type="button" data-code>${IC.copy}Copy</button></div><pre><code>${esc(body.join('\n'))}</code></pre></div>`;
      continue;
    }
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) { const n = Math.min(4, m[1].length); out += `<h${n}>${mdInline(m[2])}</h${n}>`; i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { out += '<hr>'; i++; continue; }
    if (l.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(l); i += 2; let rows = '';
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows += '<tr>' + cells(lines[i]).map(c => `<td>${c}</td>`).join('') + '</tr>'; i++; }
      out += `<div class="tbl"><table><thead><tr>${head.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
      continue;
    }
    if (/^\s*>/.test(l)) {
      const q = []; while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      out += '<blockquote>' + md(q.join('\n')) + '</blockquote>'; continue;
    }
    if ((m = l.match(/^(\s*)([-*+]|\d+[.)])\s+/))) {
      const ordered = /\d/.test(m[2]); const items = []; let cur = null;
      while (i < lines.length) {
        const x = lines[i], mm = x.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (mm && mm[1].length <= m[1].length + 1) { cur = [mm[3]]; items.push(cur); i++; continue; }
        if (x.trim() && cur && (/^\s{2,}/.test(x) || !/^\S/.test(x))) { cur.push(x.replace(/^\s{2,4}/, '')); i++; continue; }
        if (!x.trim() && cur && i + 1 < lines.length && /^\s+([-*+]|\d+[.)])\s+|^\s{2,}\S/.test(lines[i + 1])) { cur.push(''); i++; continue; }
        break;
      }
      const tag = ordered ? 'ol' : 'ul', start = ordered ? parseInt(m[2], 10) : 1;
      out += `<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>` + items.map(it => '<li>' + (it.length > 1 ? md(it.join('\n')) : mdInline(it[0])) + '</li>').join('') + `</${tag}>`;
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*~~~|\s*>|\s*([-*+]|\d+[.)])\s+)/.test(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) para.push(lines[i++]);
    if (!para.length) { para.push(lines[i++]); }
    out += '<p>' + para.map(mdInline).join('<br>') + '</p>';
  }
  return out;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-code]'); if (!b) return;
  const code = b.closest('.code')?.querySelector('pre code')?.textContent; if (code == null) return;   // read from the block itself: no copy kept per render
  navigator.clipboard?.writeText(code).then(() => { b.innerHTML = IC.copy + 'Copied'; setTimeout(() => { b.innerHTML = IC.copy + 'Copy'; }, 1400); }, () => toast('Could not copy', 'error'));
});

/* ---------------- chat ---------------- */
const PRESETS = [
  ['general', 'General', 'A candid, capable assistant.', "You are Lumen, a capable, candid assistant running privately on the user's own computer. Answer directly and completely. Use Markdown when it helps (headings, lists, tables, code blocks)."],
  ['prompts', 'Prompt writer', 'Writes prompts for Studio. "Use in Studio" picks them up.', "You write prompts for Lumen Studio's generators: images (Qwen-Image 2.1), image edits (Qwen-Image 2.1), voice (Chatterbox) and music (ACE-Step: style tags plus lyrics with [verse]/[chorus] sections). When asked for a prompt, reply with the prompt alone in one fenced code block labelled prompt, then at most one short line of notes. Be vivid and concrete: subject, setting, light, lens, mood, style."],
  ['coder', 'Coder', 'Working code first, short explanations.', 'You are a senior software engineer. Give correct, complete, runnable code first, then a brief explanation. Prefer minimal diffs when changing existing code. Say when you are unsure.'],
  ['custom', 'Custom', 'Your own instructions below.', '']
];
const CHAT_IDEAS = [
  'Write a cinematic image prompt for a rainy neon night market',
  'Explain how mixture-of-experts models run on a 12 GB GPU',
  'Draft lyrics for a melancholy synth-pop song about leaving a city',
  'Give me a weekly workout plan with no equipment',
  'What should I look for when buying a used electric car?',
  'Write a short horror story that takes place in a lighthouse',
  'Help me name a small coffee roastery',
  'Summarise the trade-offs between Rust and Go for a CLI tool'
];
const Chat = (() => {
  const C = { list: [], cur: null, streaming: null, propsAt: 0, nctx: 0, vision: null, attach: [], editFrom: null, loaded: false, saveT: null };
  const newId = () => 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const mid = () => 'm' + Math.random().toString(36).slice(2, 10);
  const pref = store.get('chatPrefs', { think: false, preset: 'general', temp: 0.7 });
  function blank() { const p = PRESETS.find(x => x[0] === pref.preset) || PRESETS[0]; return { id: newId(), title: '', created: Date.now(), updated: Date.now(), preset: p[0], system: p[3], temp: pref.temp, messages: [] }; }
  const thread = $('#thread'), msgs = $('#msgs'), input = $('#chatInput');

  async function loadList() {
    try { const r = await req('/gw/chats'); C.list = r.chats || []; } catch { C.list = C.list || []; }
    C.loaded = true; renderList();
  }
  function groupOf(ms) {
    const d = new Date(ms), now = new Date(); const day = 864e5;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ms >= start) return 'Today'; if (ms >= start - day) return 'Yesterday'; if (ms >= start - 6 * day) return 'Previous 7 days';
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  let armed = null, armT;
  function renderRecent() {
    const box = $('#chatRecent'); if (!box) return; box.innerHTML = '';
    const items = C.list.slice(0, 3); if (!items.length) return;
    box.append(el('div', 'chat-recent-h', 'Recent'));
    for (const c of items) { const b = el('button', 'chat-recent-i', c.title || c.preview || 'New chat'); b.type = 'button'; b.onclick = () => open(c.id); box.append(b); }
  }
  function renderList() {
    renderRecent();
    const box = $('#chatList'); box.innerHTML = '';
    const q = $('#chatSearch').value.trim().toLowerCase();
    const items = C.list.filter(c => !q || (c.title + ' ' + (c.preview || '')).toLowerCase().includes(q));
    if (!items.length) { box.append(el('div', 'chat-empty', q ? 'No chats match.' : 'Your chats will appear here.')); return; }
    let g = null;
    for (const c of items) {
      const gg = groupOf(+c.updated || 0); if (gg !== g) { g = gg; box.append(el('div', 'chat-group', g)); }
      const b = el('div', 'chat-item' + (C.cur && C.cur.id === c.id ? ' on' : '')); b.tabIndex = 0; b.setAttribute('role', 'button');
      b.append(el('span', 't', c.title || c.preview || 'New chat'));
      const x = el('span', 'x' + (armed === c.id ? ' armed' : '')); x.innerHTML = IC.trash; x.title = armed === c.id ? 'Click again to delete' : 'Delete'; x.setAttribute('role', 'button');
      x.onclick = ev => { ev.stopPropagation(); del(c.id); };
      b.append(x);
      b.onclick = () => { open(c.id); closeRail(); };
      b.onkeydown = ev => { if (ev.key === 'Enter') b.click(); };
      box.append(b);
    }
  }
  async function del(id) {
    if (armed !== id) { armed = id; clearTimeout(armT); armT = setTimeout(() => { armed = null; renderList(); }, 3000); renderList(); return; }
    armed = null;
    try { await post('/gw/chats/delete', { ids: [id] }); } catch (e) { toast(e.message, 'error'); return; }
    C.list = C.list.filter(c => c.id !== id);
    if (C.cur && C.cur.id === id) startNew(); else renderList();
    toast('Chat deleted. It is kept in C:\\Lumen\\Chats\\.trash.', 'info', 2600);
  }
  async function open(id) {
    if (C.streaming) stop();
    try { C.cur = await req('/gw/chats/' + encodeURIComponent(id)); } catch (e) { toast(e.message, 'error'); return; }
    C.cur.messages = C.cur.messages || [];
    C.editFrom = null; $('#editChip').hidden = true;
    store.set('chatOpen', id);
    render(true); renderList();
  }
  function startNew() {
    if (C.streaming) stop();
    C.cur = blank(); C.editFrom = null; $('#editChip').hidden = true; C.attach = []; renderAttach();
    store.set('chatOpen', null);
    render(true); renderList(); input.focus({ preventScroll: true });
  }
  function save() {
    const c = C.cur; if (!c || !c.messages.length) return;
    c.updated = Date.now();
    clearTimeout(C.saveT);
    C.saveT = setTimeout(async () => {
      try { await post('/gw/chats/save', c); } catch (e) { toast('Could not save the chat: ' + e.message, 'error'); return; }
      const meta = { id: c.id, title: c.title, created: c.created, updated: c.updated, count: c.messages.length, preview: (c.messages.find(m => m.role === 'user') || {}).text || '' };
      C.list = [meta, ...C.list.filter(x => x.id !== c.id)]; renderList();
      store.set('chatOpen', c.id);
    }, 150);
  }

  /* ----- rendering ----- */
  function msgNode(m, i, last) {
    const n = el('div', 'msg ' + m.role + (last ? ' last' : '')); n.dataset.id = m.id;
    if (m.role === 'user') {
      if (m.images && m.images.length) { const im = el('div', 'imgs'); for (const s of m.images) { const g = el('img'); g.src = s; g.alt = 'Attached image'; im.append(g); } n.append(im); }
      n.append(el('div', 'bubble', m.text));
    } else {
      if (m.reasoning) {
        const d = el('details', 'think'); const s = el('summary', null, m.thinking ? 'Thinking…' : `Thought for ${Math.max(1, Math.round((m.thinkMs || 0) / 1000))}s`);
        d.append(s, el('div', 'tt', m.reasoning)); if (m.thinking) d.open = true; n.append(d);
      }
      const body = el('div', 'body md' + (m.error ? ' err' : ''));
      if (m.error) body.textContent = m.error;
      else if (!m.text && m.pending) body.innerHTML = m.reasoning ? '' : '<span class="typing"><i></i><i></i><i></i></span>';
      else body.innerHTML = md(m.text) + (m.pending ? '<span class="caret"></span>' : '');
      n.append(body);
    }
    if (!m.pending) n.append(actions(m, i, last));
    return n;
  }
  function actions(m, i, last) {
    const a = el('div', 'acts');
    const b = (icon, label, fn) => { const x = el('button'); x.type = 'button'; x.innerHTML = icon + label; x.onclick = fn; a.append(x); return x; };
    b(IC.copy, 'Copy', () => copyText(m.text));
    if (m.role === 'user') b(IC.edit, 'Edit', () => editAt(i));
    else {
      if (last) b(IC.reroll, 'Regenerate', () => regenerate());
      if (m.text) b(IC.image, 'To Studio', () => useInStudio(m.text)).title = 'Use this as the image prompt in Studio';
      if (m.stats) a.append(el('span', 'stats', m.stats));
    }
    return a;
  }
  function render(toBottom) {
    const c = C.cur; if (!c) return;
    $('#chatTitle').textContent = c.title || 'New chat';
    $('#chatHero').hidden = c.messages.length > 0;
    msgs.innerHTML = '';
    c.messages.forEach((m, i) => msgs.append(msgNode(m, i, i === c.messages.length - 1)));
    $('#thinkBtn').setAttribute('aria-pressed', !!pref.think);
    renderCtx(); syncSend();
    if (toBottom) requestAnimationFrame(() => { thread.scrollTop = thread.scrollHeight; });
  }
  function renderLast() {
    const c = C.cur, i = c.messages.length - 1, m = c.messages[i];
    const old = msgs.lastElementChild; const n = msgNode(m, i, true);
    // keep the reasoning panel the way the user left it
    const od = old && old.querySelector('details.think'), nd = n.querySelector('details.think');
    if (od && nd && !m.thinking) nd.open = od.open;
    if (old && old.dataset.id === m.id) old.replaceWith(n); else msgs.append(n);
  }
  let raf = 0;
  function renderSoon() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const stick = nearBottom(); renderLast(); if (stick) thread.scrollTop = thread.scrollHeight; }); }
  const nearBottom = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120;
  thread.addEventListener('scroll', () => $('#jumpBtn').classList.toggle('on', !nearBottom() && C.cur && C.cur.messages.length > 1), { passive: true });
  $('#jumpBtn').onclick = () => thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
  function renderCtx() {
    const c = C.cur, u = c && c.usage;
    const w = $('#ctxWrap'), N = C.nctx; w.hidden = !N; if (!N) return;
    const used = Math.min(u || 0, N), pct = used / N * 100, f = n => n.toLocaleString();
    const shown = used && pct < 1 ? '<1' : String(Math.round(pct));
    w.dataset.lvl = pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : '';
    $('#ctxArc').setAttribute('stroke-dasharray', (used ? Math.max(pct, 2) : 0) + ' 100');
    $('#ctxBar').style.width = pct + '%';
    $('#ctxPct').textContent = shown + '%';
    $('#ctxUsed').textContent = f(used); $('#ctxLeft').textContent = f(N - used); $('#ctxTotal').textContent = f(N);
    $('#ctxNote').textContent = pct >= 90 ? 'Almost full. Start a new chat soon to keep replies working.' : pct >= 70 ? 'Getting full. Long chats slow down near the limit.' : 'Tokens in this chat, counted after each reply.';
    $('#ctxMeter').setAttribute('aria-label', `Context ${shown}% used: ${f(used)} of ${f(N)} tokens, ${f(N - used)} left`);
  }
  { const w = $('#ctxWrap'), b = $('#ctxMeter');
    const set = on => { w.classList.toggle('open', on); b.setAttribute('aria-expanded', on); };
    b.addEventListener('click', e => { e.stopPropagation(); set(!w.classList.contains('open')); });
    document.addEventListener('pointerdown', e => { if (!w.contains(e.target)) set(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
    w.addEventListener('mouseleave', () => set(false)); }
  function syncSend() {
    const s = $('#sendBtn');
    if (C.streaming) { s.disabled = false; s.innerHTML = IC.stop; s.setAttribute('aria-label', 'Stop'); return; }
    s.innerHTML = IC.send; s.setAttribute('aria-label', 'Send');
    s.disabled = !llmUp() || !(input.value.trim() || C.attach.length);
  }

  /* ----- composer ----- */
  function autosizeIn() { input.style.height = 'auto'; input.style.height = Math.min(260, Math.max(54, input.scrollHeight)) + 'px'; }
  input.addEventListener('input', () => { autosizeIn(); syncSend(); store.set('chatDraft', input.value); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(hover: hover) and (pointer: fine)').matches) { e.preventDefault(); if (!C.streaming) send(); }
  });
  input.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])].filter(x => x.type.startsWith('image/')); if (f.length) { e.preventDefault(); addFiles(f); } });
  $('#chatView').addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.kind === 'file')) e.preventDefault(); });
  $('#chatView').addEventListener('drop', e => { const f = [...e.dataTransfer.files].filter(x => x.type.startsWith('image/')); if (f.length) { e.preventDefault(); addFiles(f); } });
  $('#sendBtn').onclick = () => C.streaming ? stop() : send();
  $('#thinkBtn').onclick = () => { pref.think = !pref.think; store.set('chatPrefs', pref); $('#thinkBtn').setAttribute('aria-pressed', pref.think); };
  $('#attachBtn').onclick = () => $('#chatFile').click();
  $('#chatFile').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  $('#newChat').onclick = () => { startNew(); closeRail(); };
  $('#chatNewBtn').onclick = () => startNew();
  $('#chatSearch').oninput = renderList;
  $('#editCancel').onclick = () => { C.editFrom = null; $('#editChip').hidden = true; input.value = ''; autosizeIn(); syncSend(); };
  const openRail = () => { $('#chatRail').classList.add('open'); $('#railScrim').classList.add('on'); };
  const closeRail = () => { $('#chatRail').classList.remove('open'); $('#railScrim').classList.remove('on'); };
  $('#railBtn').onclick = openRail; $('#railClose').onclick = closeRail; $('#railScrim').onclick = closeRail;

  function shrink(file, max = 1280) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); res(cv.toDataURL('image/jpeg', .88)); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read that image')); };
      img.src = url;
    });
  }
  async function addFiles(files) {
    for (const f of files.slice(0, 4 - C.attach.length)) { try { C.attach.push(await shrink(f)); } catch (e) { toast(e.message, 'error'); } }
    renderAttach(); syncSend();
    if (C.vision === false) toast("This model build can't see images yet. They'll be skipped.", 'info', 3200);
  }
  function renderAttach() {
    const row = $('#attachRow'); row.innerHTML = '';
    C.attach.forEach((s, i) => { const a = el('div', 'att'); const g = el('img'); g.src = s; g.alt = ''; const x = el('button'); x.type = 'button'; x.innerHTML = IC.x; x.setAttribute('aria-label', 'Remove image'); x.onclick = () => { C.attach.splice(i, 1); renderAttach(); syncSend(); }; a.append(g, x); row.append(a); });
  }
  function editAt(i) {
    const m = C.cur.messages[i]; if (!m || C.streaming) return;
    C.editFrom = i; input.value = m.text; C.attach = [...(m.images || [])]; renderAttach();
    $('#editChip').hidden = false; autosizeIn(); syncSend(); input.focus();
  }

  /* ----- talking to the model ----- */
  function apiMessages(list) {
    const c = C.cur, out = [];
    if (c.system && c.system.trim()) out.push({ role: 'system', content: c.system.trim() });
    for (const m of list) {
      if (m.error || (m.role === 'assistant' && !m.text)) continue;
      if (m.role === 'user' && m.images && m.images.length && C.vision !== false) out.push({ role: 'user', content: [{ type: 'text', text: m.text || 'Describe this image.' }, ...m.images.map(u => ({ type: 'image_url', image_url: { url: u } }))] });
      else out.push({ role: m.role, content: m.text || '' });
    }
    return out;
  }
  async function send() {
    const text = input.value.trim(); if ((!text && !C.attach.length) || !llmUp() || C.streaming) return;
    const c = C.cur;
    if (C.editFrom != null) { c.messages.splice(C.editFrom); C.editFrom = null; $('#editChip').hidden = true; }
    c.messages.push({ id: mid(), role: 'user', text, images: C.attach.length ? [...C.attach] : undefined, at: Date.now() });
    input.value = ''; store.set('chatDraft', ''); C.attach = []; renderAttach(); autosizeIn();
    render(true);
    await reply();
  }
  async function regenerate() {
    const c = C.cur; if (C.streaming || !llmUp()) return;
    while (c.messages.length && c.messages[c.messages.length - 1].role === 'assistant') c.messages.pop();
    render(true); await reply();
  }
  async function reply() {
    const c = C.cur;
    const history = c.messages.slice();
    const m = { id: mid(), role: 'assistant', text: '', reasoning: '', pending: true, at: Date.now() };
    c.messages.push(m); render(true);
    const ctrl = new AbortController(); C.streaming = ctrl; syncSend();
    const t0 = performance.now(); let tFirst = 0, tThinkEnd = 0, timings = null, usage = null;
    try {
      const res = await fetch('/llm/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lumen-Chat': c.id }, signal: ctrl.signal,
        body: JSON.stringify({ model: 'lumen-chat', messages: apiMessages(history), stream: true, stream_options: { include_usage: true },
          temperature: +c.temp || 0.7, top_p: pref.think ? 0.95 : 0.8, top_k: 20, chat_template_kwargs: { enable_thinking: !!pref.think } })
      });
      if (!res.ok) { let d = null; try { d = await res.json(); } catch {} throw new Error((d && (d.error && (d.error.message || d.error))) || `The model answered HTTP ${res.status}`); }
      const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim(); if (data === '[DONE]') continue;
          let j; try { j = JSON.parse(data); } catch { continue; }
          if (j.error) throw new Error(j.error.message || String(j.error));
          if (j.timings) timings = j.timings; if (j.usage) usage = j.usage;
          const d = j.choices && j.choices[0] && j.choices[0].delta; if (!d) continue;
          if (d.reasoning_content) { m.reasoning += d.reasoning_content; m.thinking = true; }
          if (d.content) { if (m.thinking) { m.thinking = false; tThinkEnd = performance.now(); m.thinkMs = tThinkEnd - t0; } if (!tFirst) tFirst = performance.now(); m.text += d.content; }
          renderSoon();
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') { if (!m.text && !m.reasoning) m.error = 'Stopped.'; }
      else { m.error = e.message === 'Failed to fetch' ? "Lost the connection to the desktop." : e.message; }
    }
    if (m.thinking) { m.thinking = false; m.thinkMs = performance.now() - t0; }
    m.text = m.text.replace(/^\s+/, '');
    delete m.pending;
    if (timings && timings.predicted_per_second) m.stats = `${Math.round(timings.predicted_per_second)} tok/s · ${fmtMs(performance.now() - t0)}`;
    if (usage && usage.total_tokens) c.usage = usage.total_tokens; else if (timings) c.usage = (timings.prompt_n || 0) + (timings.cache_n || 0) + (timings.predicted_n || 0);
    C.streaming = null;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    render(nearBottom());
    save();
    if (!c.title && m.text && !m.error) nameChat(c);
  }
  function stop() { if (C.streaming) C.streaming.abort(); }
  async function nameChat(c) {
    const first = (c.messages.find(x => x.role === 'user') || {}).text || '';
    const fallback = first.split(/\s+/).slice(0, 6).join(' ').replace(/[.,:;!?]+$/, '') || 'Image chat';
    try {
      const r = await post('/llm/v1/chat/completions', { model: 'lumen-chat', max_tokens: 24, temperature: 0.3, chat_template_kwargs: { enable_thinking: false },
        messages: [{ role: 'user', content: `Write a short title (2 to 6 words) for a conversation that starts with this message. Reply with the title only, no quotes.\n\n${first.slice(0, 600)}` }] }, { 'X-Lumen-Chat': c.id });
      let t = ((r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content) || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim().split('\n')[0].replace(/^["'*#\s]+|["'*.\s]+$/g, '');
      c.title = t && t.length <= 60 ? t : fallback;
    } catch { c.title = fallback; }
    if (C.cur === c) $('#chatTitle').textContent = c.title;
    save();
  }
  async function props() {
    if (Date.now() - C.propsAt < 60000) return; C.propsAt = Date.now();
    try {
      const p = await req('/llm/props');
      C.nctx = (p.default_generation_settings && (p.default_generation_settings.n_ctx || (p.default_generation_settings.params && p.default_generation_settings.params.n_ctx))) || p.n_ctx || 0;
      C.vision = p.modalities ? !!p.modalities.vision : null;
      $('#attachBtn').hidden = C.vision === false;
      renderCtx();
    } catch {}
  }
  function useInStudio(text) {
    const block = text.match(/```(?:prompt|text)?\s*\n([\s\S]*?)```/);
    const prompt = (block ? block[1] : text.replace(/```[\s\S]*?```/g, '')).trim().slice(0, 1500);
    cfg.image.prompt = prompt; save(); T.image.value = prompt; T.image.dispatchEvent(new Event('input'));
    setMode('image');
    goView('studio', { user: true });
    toast('Prompt sent to Studio. Press Generate when the model is ready.', 'info', 3200);
  }
  function askAbout(src) {
    goView('chat', { user: true });
    if (C.cur && C.cur.messages.length) startNew();
    C.attach = [src]; renderAttach();
    input.value = input.value || 'Describe this image in detail, then suggest three ways to make it better.'; autosizeIn(); syncSend();
  }

  /* ----- settings sheet ----- */
  $('#chatSetBtn').onclick = () => {
    const c = C.cur; const seg = $('#presetSeg'); seg.innerHTML = '';
    const sync = () => { for (const b of seg.children) b.setAttribute('aria-pressed', b.dataset.k === c.preset); $('#presetNote').textContent = (PRESETS.find(p => p[0] === c.preset) || PRESETS[3])[2]; };
    for (const [k, label, , sys] of PRESETS) {
      const b = el('button', null, label); b.type = 'button'; b.dataset.k = k;
      b.onclick = () => { c.preset = k; if (k !== 'custom') { c.system = sys; $('#sysPrompt').value = sys; } pref.preset = k; store.set('chatPrefs', pref); sync(); save(); };
      seg.append(b);
    }
    $('#sysPrompt').value = c.system || ''; $('#tempRange').value = c.temp || 0.7; $('#tempVal').textContent = (+c.temp || 0.7).toFixed(2);
    sync(); $('#chatSheet').showModal();
  };
  $('#sysPrompt').oninput = e => { const c = C.cur; c.system = e.target.value; const p = PRESETS.find(x => x[0] === c.preset); if (p && p[0] !== 'custom' && p[3] !== c.system) { c.preset = 'custom'; for (const b of $('#presetSeg').children) b.setAttribute('aria-pressed', b.dataset.k === 'custom'); } save(); };
  $('#tempRange').oninput = e => { C.cur.temp = +e.target.value; pref.temp = C.cur.temp; store.set('chatPrefs', pref); $('#tempVal').textContent = C.cur.temp.toFixed(2); save(); };

  function ideas() {
    const box = $('#chatIdeas'); box.innerHTML = '';
    for (const p of [...CHAT_IDEAS].sort(() => Math.random() - .5).slice(0, 3)) { const b = el('button', 'idea', p); b.type = 'button'; b.onclick = () => { input.value = p; autosizeIn(); syncSend(); input.focus(); }; box.append(b); }
  }
  let shown = false;
  async function show() {
    if (!shown) {
      shown = true; ideas();
      input.value = store.get('chatDraft', '') || ''; autosizeIn();
      if (!C.cur) C.cur = blank();
      render(true);
      await loadList();
      const last = store.get('chatOpen', null);
      if (last && C.list.some(c => c.id === last) && !C.cur.messages.length) open(last);
    } else { renderList(); }
    if (llmUp()) props();
    syncSend();
  }
  async function askAboutUrl(url) {
    try { const b = await (await fetch(url)).blob(); askAbout(await shrink(b)); } catch (e) { toast('Could not load that image: ' + e.message, 'error'); }
  }
  return { show, syncSend, props, askAboutUrl, get streaming() { return !!C.streaming; } };
})();

/* ---------------- code ---------------- */
const Code = (() => {
  // The address every device opens (the launcher too): https://<publicHost>/ from C:\AI\config\lumen.json.
  const tailnet = () => (data && data.publicHost) ? `https://${data.publicHost}/` : '';
  let data = null;
  const wsUrl = () => location.protocol === 'https:' && !/^(localhost|127\.)/.test(location.hostname) ? `https://${location.hostname}:${(data && data.port) || 8443}/` : null;
  function b64url(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  // OpenCode's web app keys a project by its folder: /<base64url(path)>/session
  const projUrl = p => { const u = wsUrl(); return u ? u + b64url(p.path) + '/session' : null; };
  // Two states: 'workspace' = OpenCode in an iframe under the Lumen header; 'launcher' = hero + projects.
  // The iframe is made the first time it's needed and then only hidden, so a session survives view switches.
  let state = null, frame = null, frameUrl = null, probeN = 0, authed = false;
  const isInstalled = () => !(S.st && S.st.installed && S.st.installed.code === false);
  const canEmbed = () => !!wsUrl() && isInstalled();
  const current = () => { const base = wsUrl(), u = store.get('code.ws', null); return base && typeof u === 'string' && u.startsWith(base) ? u : base; };
  function nameOf(u) {
    const base = wsUrl(), seg = u && base && u.startsWith(base) ? u.slice(base.length).split('/')[0] : '';
    if (!seg) return 'Workspace';
    try { const p = decodeURIComponent(escape(atob(seg.replace(/-/g, '+').replace(/_/g, '/')))); return p.split(/[\\/]/).filter(Boolean).pop() || p; }
    catch { return 'Workspace'; }
  }
  function setState(s) {
    if (s === 'workspace' && !canEmbed()) s = 'launcher';
    state = s; store.set('code.state', s); $('#codeView').dataset.state = s;
    if (s === 'workspace') { window.scrollTo({ top: 0 }); ensureFrame(); } else render();
  }
  function ensureFrame() {
    if (state !== 'workspace' || V.view !== 'code' || !viewReady('code')) return;
    const u = current();
    // Never open OpenCode without a project: a session at the top would not be fenced to one folder.
    if (u === wsUrl()) { if (frame) { frame.src = 'about:blank'; frameUrl = u; } $('#wsName').textContent = 'No project open'; $('#wsRename').hidden = true; if (tab === 'ws') setTab('art'); return; }
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = 'OpenCode workspace'; frame.allow = 'clipboard-read; clipboard-write';
      frame.addEventListener('load', frameLoaded);
      $('#wsStage').prepend(frame);
    }
    $('#wsName').textContent = nameOf(u); $('#wsNewTab').href = u; $('#wsRename').hidden = !wsProject(); renderChats();
    if (frameUrl === u) return;
    // The workspace sits behind Lumen's sign-in gate: load it only once signed in.
    if (!authed) return checkAuth();
    frameUrl = u; frame.src = u;
  }
  function openWs(u) {
    if (!u || !canEmbed()) return;
    store.set('code.ws', u); setState('workspace');
  }
  // ---- chats: a project can hold many OpenCode chats; they all share the project's folder ----
  // /<dir>/session with no id makes OpenCode start a blank chat, which is why re-entering a project used to look
  // like the chat was gone. Lumen now remembers the open chat per project (code.chat.<dir>) and reopens it.
  const segOf = u => { const base = wsUrl(); return u && base && u.startsWith(base) ? u.slice(base.length).split('/')[0] : ''; };
  const chatOf = u => { const m = /\/session\/(ses_?[A-Za-z0-9]+)/.exec(u || ''); return m ? m[1] : null; };
  const chatUrl = (seg, id) => wsUrl() + seg + '/session' + (id ? '/' + id : '');
  const chatTitle = c => c.title && !/^(New session|Child session) - \d{4}-/.test(c.title) ? c.title : 'New chat';
  let chats = null, chatEdit = null, chatDel = null, chatBusy = false;   // chats: the open project's, newest first
  const fetchChats = proj => req('/gw/code/chats?project=' + encodeURIComponent(proj)).then(d => d.chats || []);
  async function openProject(p) {
    if (!p || !canEmbed()) return;
    const seg = b64url(p.path); let id = store.get('code.chat.' + seg, null);
    try {
      const list = await fetchChats(p.name);
      if (!list.some(c => c.id === id)) id = list.length ? list[0].id : (await post('/gw/code/chats/new', { project: p.name })).id;
    } catch { /* workspace not up yet: the remembered chat, or OpenCode's own new one */ }
    if (id) store.set('code.chat.' + seg, id);
    chats = null; openWs(chatUrl(seg, id)); refreshChats();
  }
  async function refreshChats() {
    const proj = wsProject();
    if (proj) { try { const l = await fetchChats(proj); if (wsProject() === proj) chats = l; } catch {} } else chats = null;
    renderChats();
  }
  function switchChat(id) {
    const seg = segOf(current()); if (!seg || !id) return;
    store.set('code.chat.' + seg, id); chatEdit = chatDel = null; closeChats();
    if (tab !== 'ws') setTab('ws');
    openWs(chatUrl(seg, id)); renderChats();
  }
  // OpenCode (through the gate's frame.js) says where it is; a chat opened or made inside it becomes the remembered one.
  addEventListener('message', e => {
    const d = e.data;
    if (!frame || e.source !== frame.contentWindow || e.origin + '/' !== wsUrl() || !d || d.lumen !== 'oc-loc' || typeof d.path !== 'string') return;
    const id = chatOf(d.path), seg = segOf(current());
    if (!id || !seg || chatOf(current()) === id) return;
    store.set('code.chat.' + seg, id);
    const u = chatUrl(seg, id); store.set('code.ws', u); frameUrl = u; $('#wsNewTab').href = u;   // frameUrl too, so it isn't reloaded
    refreshChats();
  });
  const chatMenu = $('#wsChatMenu'), chatBtn = $('#wsChats');
  const closeChats = () => { chatMenu.hidden = true; chatBtn.setAttribute('aria-expanded', 'false'); chatEdit = chatDel = null; };
  function renderChats() {
    const proj = wsProject(), cur = chatOf(current()), c = chats && chats.find(x => x.id === cur);
    chatBtn.hidden = !proj;
    $('#wsChatName').textContent = c ? chatTitle(c) : 'Chats';
    chatBtn.title = c ? `Chat: ${chatTitle(c)} (switch, start, rename or delete chats)` : 'Chats in this project';
    if (chatMenu.hidden || !proj) return;
    const head = el('div', 'ws-menu-head'); head.innerHTML = `Chats in <b>${esc(proj)}</b> · they share its files`;
    const nb = el('button', 'occ-new'); nb.type = 'button'; nb.innerHTML = IC.plus + '<span>New chat</span>'; nb.disabled = chatBusy;
    nb.onclick = newChat;
    const list = el('div', 'occ-list');
    if (!chats) list.innerHTML = '<div class="occ-empty">Loading…</div>';
    else if (!chats.length) list.innerHTML = '<div class="occ-empty">No chats yet. New chat starts one.</div>';
    for (const x of chats || []) {
      const r = el('div', 'occ-row' + (x.id === cur ? ' cur' : '')), t = chatTitle(x);
      if (chatEdit === x.id) {
        r.innerHTML = '<form><input type="text" maxlength="100" autocomplete="off" spellcheck="false" aria-label="Chat name"><button class="btn solid" type="submit">Save</button></form>';
        const f = r.querySelector('form'), inp = f.querySelector('input');
        inp.value = t === 'New chat' ? '' : t; inp.placeholder = 'Name this chat';
        inp.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); chatEdit = null; renderChats(); } };
        f.onsubmit = e => { e.preventDefault(); renameChat(x.id, inp.value); };
        setTimeout(() => { inp.focus(); inp.select(); }, 20);
      } else if (chatDel === x.id) {
        r.innerHTML = `<div class="occ-confirm" role="alert"><span>Delete “${esc(t)}” for good? The project's files stay.</span><button class="btn danger solid" type="button" data-y>Delete chat</button><button class="btn" type="button" data-n>Cancel</button></div>`;
        r.querySelector('[data-y]').onclick = () => deleteChat(x.id);
        r.querySelector('[data-n]').onclick = () => { chatDel = null; renderChats(); };
        setTimeout(() => r.querySelector('[data-n]').focus(), 20);
      } else {
        r.innerHTML = `<button class="occ-open" type="button" role="menuitem"><b></b><small>${esc(x.id === cur ? 'open now · ' : '')}${esc(ago(x.updated || x.created))}</small></button><button class="icon-btn ren" type="button">${IC.edit}</button><button class="icon-btn del" type="button">${IC.trash}</button>`;
        r.querySelector('b').textContent = t;
        const ren = r.querySelector('.ren'), del = r.querySelector('.del');
        ren.title = 'Rename'; ren.setAttribute('aria-label', 'Rename ' + t); del.title = 'Delete'; del.setAttribute('aria-label', 'Delete ' + t);
        r.querySelector('.occ-open').onclick = () => x.id === cur ? closeChats() : switchChat(x.id);
        ren.onclick = () => { chatEdit = x.id; chatDel = null; renderChats(); };
        del.onclick = () => { chatDel = x.id; chatEdit = null; renderChats(); };
      }
      list.append(r);
    }
    chatMenu.replaceChildren(head, nb, list);
  }
  async function newChat() {
    const proj = wsProject(); if (!proj || chatBusy) return;
    chatBusy = true; renderChats();
    try { const r = await post('/gw/code/chats/new', { project: proj }); chats = null; switchChat(r.id); refreshChats(); }
    catch (e) { toast(e.message, 'error'); }
    finally { chatBusy = false; renderChats(); }
  }
  async function renameChat(id, title) {
    const proj = wsProject(); title = title.trim(); if (!proj) return;
    if (!title) { chatEdit = null; renderChats(); return; }
    try { await post('/gw/code/chats/rename', { project: proj, id, title }); chatEdit = null; const c = chats && chats.find(x => x.id === id); if (c) c.title = title; renderChats(); refreshChats(); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function deleteChat(id) {
    const proj = wsProject(); if (!proj) return;
    const wasCur = chatOf(current()) === id;
    try {
      await post('/gw/code/chats/delete', { project: proj, id });
      chatDel = null; chats = (chats || []).filter(x => x.id !== id);
      toast('Chat deleted. The files are still in the project.', 'ok', 2600);
      if (wasCur) { if (chats.length) switchChat(chats[0].id); else await newChat(); }
      refreshChats();
    } catch (e) { toast(e.message, 'error', 5000); }
  }
  chatBtn.onclick = e => {
    e.stopPropagation();
    if (!chatMenu.hidden) { closeChats(); return; }
    closeMenu(); chatMenu.hidden = false; chatBtn.setAttribute('aria-expanded', 'true'); renderChats(); refreshChats();
  };
  chatMenu.addEventListener('click', e => e.stopPropagation());   // rows re-render under the click; keep the menu open
  document.addEventListener('click', () => { if (!chatMenu.hidden) closeChats(); });
  addEventListener('blur', () => { if (!chatMenu.hidden && !chatEdit && !chatDel) closeChats(); });   // a click into OpenCode's frame
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !chatMenu.hidden && !chatEdit && !chatDel) closeChats(); });
  // Titles change once the agent names a new chat; keep the bar's label fresh while the workspace is in view.
  setInterval(() => { if (state === 'workspace' && V.view === 'code' && !document.hidden && wsProject()) refreshChats(); }, 20000);
  // The gate in front of OpenCode answers these itself, never with a browser password prompt.
  const gate = (p, opts = {}) => fetch(wsUrl() + '__lumen/' + p, { credentials: 'include', cache: 'no-store', ...opts });
  async function probe(cb) {
    if (!wsUrl()) return;
    const n = ++probeN; let ok = false;
    try { ok = (await gate('check')).status === 204; } catch {}
    if (n !== probeN) return;
    authed = ok; cb(ok);
  }
  function showAuth(on, err) {
    const card = $('#wsAuth'), was = !card.hidden;
    card.hidden = !on;
    if (err !== undefined || !was) { $('#wsAuthErr').hidden = !err; $('#wsAuthErr').textContent = err || ''; }   // a background re-check keeps the last error
    if (on && !was && !matchMedia('(pointer: coarse)').matches) setTimeout(() => ($('#wsUser').value ? $('#wsPass') : $('#wsUser')).focus(), 50);
  }
  function checkAuth() { probe(ok => { if (ok) { showAuth(false); ensureFrame(); } else showAuth(true); }); }
  // A load that ends on the gate's locked page (sign-in ran out) brings the card back.
  function frameLoaded() {
    if (!frameUrl || frameUrl === wsUrl()) return;
    probe(ok => { if (!ok) { frameUrl = null; frame.src = 'about:blank'; showAuth(true); } });
  }
  async function signIn(e) {
    e.preventDefault();
    const btn = $('#wsSignIn'); if (btn.disabled) return;
    btn.disabled = true; btn.textContent = 'Signing in…';
    let err = null;
    try {
      const r = await gate('signin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('#wsUser').value.trim(), password: $('#wsPass').value }) });
      if (r.status !== 204) { const d = await r.json().catch(() => ({})); err = d.error || "Couldn't sign in."; }
    } catch { err = "Couldn't reach the workspace."; }
    btn.disabled = false; btn.textContent = 'Sign in';
    if (err) { showAuth(true, err); $('#wsPass').select(); return; }
    authed = true; $('#wsPass').value = ''; showAuth(false); ensureFrame();
  }
  function reload() { if (!frame) return ensureFrame(); if (!authed) return checkAuth(); showAuth(false); frameUrl = current(); frame.src = frameUrl; }
  function sync() { if (state === 'workspace') { if (!canEmbed()) setState('launcher'); else ensureFrame(); } }
  async function load() {
    if (!state) setState('launcher');   // Code always opens on the Projects page
    try { data = await req('/gw/code/projects'); } catch { data = data || { root: 'C:\\Lumen\\Code', port: 8443, projects: [] }; }
    render(); sync(); loadModels();
  }
  function render() {
    const u = wsUrl(), open = $('#codeOpen'), note = $('#codeNote');
    const installed = isInstalled();
    open.href = u ? current() : '#';
    open.lastChild.textContent = frame ? 'Back to workspace' : 'Open workspace';
    open.toggleAttribute('aria-disabled', !u || !installed);
    note.hidden = true;
    if (!installed) { note.hidden = false; note.innerHTML = IC.info + '<span>The coding workspace isn\'t installed on the desktop yet (C:\\AI\\tools\\setup-code.ps1).</span>'; }
    else if (!u) { note.hidden = false; note.innerHTML = IC.info + `<span>The workspace only works from Lumen's tailnet address.${tailnet() ? ` <a href="${tailnet()}">Open ${esc(tailnet().replace(/^https:\/\/|\/$/g, ''))}</a>` : ''}</span>`; }
    const root = (data && data.root) || 'C:\\Lumen\\Code';
    for (const k of ['#codeRoot', '#tipRoot']) { const e = $(k); e.textContent = ''; root.split('\\').forEach((p, i, a) => { e.append(p + (i < a.length - 1 ? '\\' : '')); if (i < a.length - 1) e.append(document.createElement('wbr')); }); }
    const grid = $('#projGrid'); grid.innerHTML = '';
    const nb = el('button', 'proj new'); nb.type = 'button'; nb.innerHTML = `<span class="ic">${IC.plus}</span><div><b>New project</b><small>empty, from files, or GitHub</small></div>`;
    nb.onclick = newProject; grid.append(nb);
    for (const p of (data && data.projects) || []) {
      const a = el('a', 'proj'); const pu = projUrl(p); if (pu) { a.href = pu; a.target = '_blank'; a.rel = 'noopener';
        // A plain click opens it in the embedded workspace; Ctrl/middle-click still gets a new tab.
        a.onclick = e => { if (!canEmbed() || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return; e.preventDefault(); openProject(p); }; }
      else a.onclick = e => { e.preventDefault(); copyText(p.path); };
      a.innerHTML = `<span class="ic">${IC.folder}</span><div><b>${esc(p.name)}</b><small>${p.git ? '<span>git</span>·' : ''}<span>${esc(fmtDate(p.modified))}</span></small></div>`;
      a.title = p.path;
      grid.append(a);
    }
  }
  // ---- new project: empty, from files/folder, or from GitHub ----
  const ROOT0 = 'C:\\Lumen\\Code';
  let pickFor = null, picked = [];   // pickFor: 'sheet' | 'ws'
  const canDir = 'webkitdirectory' in document.createElement('input');
  if (!canDir) document.body.classList.add('no-dir');
  function newProject() {
    const root = (data && data.root) || ROOT0;
    const inp = $('#projName'), go = $('#projCreate'), gh = $('#projGh'), err = $('#projErr');
    let kind = 'empty'; picked = [];
    inp.value = ''; gh.value = ''; err.hidden = true; $('#projFilesInfo').textContent = 'nothing chosen';
    const sync = () => {
      for (const b of $$('#projKind button')) b.setAttribute('aria-pressed', b.dataset.kind === kind);
      $('#projGhField').hidden = kind !== 'github'; $('#projFilesField').hidden = kind !== 'files';
      inp.placeholder = kind === 'github' ? 'defaults to the repo name' : 'my-app';
      $('#projPath').textContent = root + '\\' + (inp.value.trim() || (kind === 'github' ? repoOf(gh.value) : ''));
      go.textContent = kind === 'github' ? 'Import repository' : kind === 'files' ? 'Create and upload' : 'Create project';
      go.disabled = kind === 'github' ? !repoOf(gh.value) : kind === 'files' ? !(inp.value.trim() && picked.length) : !inp.value.trim();
    };
    for (const b of $$('#projKind button')) b.onclick = () => { kind = b.dataset.kind; err.hidden = true; sync(); (kind === 'github' ? gh : inp).focus(); };
    for (const b of $$('#projFilesField [data-pick]')) b.onclick = () => pick('sheet', b.dataset.pick);
    inp.oninput = sync; gh.oninput = sync;
    const enter = e => { if (e.key === 'Enter' && !go.disabled) go.click(); };
    inp.onkeydown = enter; gh.onkeydown = enter;
    newProject.picked = list => {   // files chosen in the sheet
      picked = list; const n = list.length, bytes = list.reduce((s, x) => s + x.file.size, 0);
      $('#projFilesInfo').textContent = n ? `${n} file${n === 1 ? '' : 's'} · ${fmtBytes(bytes)}` : 'nothing chosen';
      if (!inp.value.trim() && list.top) inp.value = list.top;
      sync();
    };
    go.onclick = async () => {
      go.disabled = true; err.hidden = true;
      const label = go.textContent;
      try {
        if (kind === 'github') {
          const r = await post('/gw/code/import', { url: gh.value, name: inp.value });
          const done = await waitTask(r.task, s => { go.textContent = 'Importing: ' + s + '…'; });
          $('#projSheet').close(); toast(`Imported ${done.repo} into ${done.name}`, 'ok', 3200);
          await load(); openProject(done);
          return;
        }
        const r = await post('/gw/code/new', { name: inp.value });
        if (kind === 'files') {
          await uploadAll(r.name, picked, (pct, i, n) => { go.textContent = `Uploading ${i} of ${n} · ${pct}%`; });
        }
        $('#projSheet').close(); toast(kind === 'files' ? `Created ${r.name} with ${picked.length} file${picked.length === 1 ? '' : 's'}` : `Created ${r.path}`, 'ok', 2600);
        await load(); openProject(r);
      } catch (e) { err.hidden = false; err.innerHTML = IC.info + `<span>${esc(e.message)}</span>`; go.disabled = false; }
      finally { if (go.textContent !== label && err.hidden === false) go.textContent = label; }
    };
    sync();
    $('#projSheet').showModal(); setTimeout(() => inp.focus(), 50);
  }
  // owner/repo from what was typed (the gateway does the real parsing)
  function repoOf(s) {
    const m = String(s || '').trim().replace(/[?#].*$/, '').replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '').match(/^([\w-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/.+)?\/?$/);
    return m ? m[2] : '';
  }
  const fmtBytes = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
  async function waitTask(id, onStage) {
    for (;;) {
      await new Promise(r => setTimeout(r, 900));
      const t = await req('/gw/task/' + encodeURIComponent(id));
      if (t.status === 'done') return t.entry;
      if (t.status === 'failed') throw new Error(t.error || 'The import failed.');
      if (onStage && t.stage) onStage(t.stage);
    }
  }

  // ---- uploads ----
  const UP_MAX = 2 * 1073741824;
  const SKIP = /(^|\/)(node_modules|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/i;
  // Picked or dropped files -> [{file, path}] (path relative, '/' separated). Folder picks keep the folder name;
  // list.top is that folder's name (used as the new project's name).
  function fromInput(files, stripTop) {
    const list = [];
    for (const f of files) {
      let p = f.webkitRelativePath || f.name;
      if (SKIP.test(p)) continue;
      list.push({ file: f, path: p });
    }
    const top = list.length && list[0].path.includes('/') ? list[0].path.split('/')[0] : '';
    if (top && list.every(x => x.path.startsWith(top + '/'))) { list.top = top; if (stripTop) for (const x of list) x.path = x.path.slice(top.length + 1); }
    return list;
  }
  async function fromDrop(dt) {
    const out = [], entries = [...(dt.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (!entries.length) { for (const f of dt.files || []) out.push({ file: f, path: f.name }); return out; }
    const walk = async (e, pre) => {
      const p = pre + e.name;
      if (SKIP.test(p)) return;
      if (e.isFile) { out.push({ file: await new Promise((res, rej) => e.file(res, rej)), path: p }); return; }
      const rd = e.createReader();
      for (;;) { const batch = await new Promise((res, rej) => rd.readEntries(res, rej)); if (!batch.length) break; for (const c of batch) await walk(c, p + '/'); }
    };
    for (const e of entries) await walk(e, '');
    return out;
  }
  function putFile(project, item, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', `/gw/code/upload?project=${encodeURIComponent(project)}&path=${encodeURIComponent(item.path)}`);
      x.upload.onprogress = e => onProgress(e.loaded);
      x.onload = () => { let d = null; try { d = JSON.parse(x.responseText); } catch {} if (x.status >= 200 && x.status < 300) resolve(d); else reject(new Error((d && d.error) || `Upload failed (HTTP ${x.status})`)); };
      x.onerror = () => reject(new Error('Upload failed: the connection dropped.'));
      x.send(item.file);
    });
  }
  // Three files at a time; progress is by bytes.
  async function uploadAll(project, list, onProgress) {
    const big = list.find(x => x.file.size > UP_MAX);
    if (big) throw new Error(`${big.path} is over 2 GB.`);
    const total = list.reduce((s, x) => s + x.file.size, 0) || 1;
    const sent = new Array(list.length).fill(0);
    let next = 0, done = 0;
    const tell = () => onProgress(Math.min(100, Math.round(sent.reduce((a, b) => a + b, 0) / total * 100)), done, list.length);
    const worker = async () => {
      while (next < list.length) {
        const i = next++;
        await putFile(project, list[i], n => { sent[i] = n; tell(); });
        sent[i] = list[i].file.size; done++; tell();
      }
    };
    tell();
    await Promise.all([worker(), worker(), worker()].slice(0, Math.max(1, Math.min(3, list.length))));
  }
  // The project open in the workspace, when it's one of the folders in AI Projects.
  function wsProject() {
    const base = wsUrl(), u = current(), seg = u && base && u.startsWith(base) ? u.slice(base.length).split('/')[0] : '';
    if (!seg) return null;
    let p; try { p = decodeURIComponent(escape(atob(seg.replace(/-/g, '+').replace(/_/g, '/')))); } catch { return null; }
    const root = ((data && data.root) || ROOT0).toLowerCase() + '\\';
    if (!p.toLowerCase().startsWith(root)) return null;
    const rest = p.slice(root.length).replace(/[\\/]+$/, '');
    return rest && !/[\\/]/.test(rest) ? rest : null;
  }
  let upBusy = false;
  async function uploadToWs(list) {
    const proj = wsProject();
    if (!proj) { toast('Open one of your projects first (Projects), then upload into it.', 'info', 3600); return; }
    if (!list.length) return;
    if (upBusy) { toast('An upload is already running.', 'info'); return; }
    upBusy = true;
    const txt = $('#wsUpText'), bar = $('#wsProgress');
    txt.hidden = false; bar.hidden = false;
    try {
      await uploadAll(proj, list, (pct, i, n) => { txt.textContent = `${i}/${n} · ${pct}%`; bar.firstElementChild.style.width = pct + '%'; });
      toast(`Uploaded ${list.length} file${list.length === 1 ? '' : 's'} into ${proj}`, 'ok', 2800);
    } catch (e) { toast(e.message, 'error', 5000); }
    finally { upBusy = false; txt.hidden = true; bar.hidden = true; bar.firstElementChild.style.width = '0'; }
  }
  function pick(who, what) {
    pickFor = who;
    const inp = what === 'dir' ? $('#upDir') : $('#upFiles');
    inp.value = ''; inp.click();
  }
  for (const id of ['#upFiles', '#upDir']) {
    $(id).addEventListener('change', e => {
      const list = fromInput(e.target.files, pickFor === 'sheet');
      if (pickFor === 'sheet') newProject.picked && newProject.picked(list);
      else uploadToWs(list);
    });
  }
  const menu = $('#wsUpMenu'), upBtn = $('#wsUpload');
  const closeMenu = () => { menu.hidden = true; upBtn.setAttribute('aria-expanded', 'false'); };
  upBtn.onclick = e => {
    e.stopPropagation();
    if (!menu.hidden) { closeMenu(); return; }
    closeChats();
    const proj = wsProject();
    $('#wsUpInto').textContent = proj ? 'Into ' + proj : 'Open a project first';
    for (const b of menu.querySelectorAll('button')) b.disabled = !proj;
    menu.hidden = false; upBtn.setAttribute('aria-expanded', 'true');
  };
  for (const b of menu.querySelectorAll('[data-pick]')) b.onclick = () => { closeMenu(); pick('ws', b.dataset.pick); };
  document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('.ws-menu-wrap')) closeMenu(); });
  // Drag files or folders onto the workspace bar.
  const bar = $('.ws-bar'), drop = $('#wsDrop');
  let dragN = 0;
  const hasFiles = e => [...(e.dataTransfer && e.dataTransfer.types || [])].includes('Files');
  bar.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragN++; $('#wsDropInto').textContent = wsProject() || 'a project (open one first)'; drop.hidden = false; });
  bar.addEventListener('dragover', e => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  bar.addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; drop.hidden = true; } });
  bar.addEventListener('drop', async e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragN = 0; drop.hidden = true;
    try { uploadToWs(await fromDrop(e.dataTransfer)); } catch (er) { toast('Could not read the dropped files: ' + er.message, 'error'); }
  });

  // ---- coding model ----
  async function loadModels() {
    const row = $('#codeModelRow'), sel = $('#codeModel');
    let d; try { d = await req('/gw/code/models'); } catch { row.hidden = true; return; }
    sel.innerHTML = '';
    for (const m of d.models || []) {
      const o = el('option'); o.value = m.file;
      o.textContent = `${m.file === d.chat ? d.chat_name : m.name} · ${(m.bytes / 1073741824).toFixed(1)} GB${m.file === d.chat ? ' · same as Chat' : ''}`;
      o.selected = m.file === d.current; sel.append(o);
    }
    row.hidden = !sel.options.length;
  }
  $('#codeModel').addEventListener('change', async e => {
    try { const r = await post('/gw/code/model', { gguf: e.target.value }); toast(`Coding model: ${r.current_name}. Takes effect next time Code loads.`, 'ok', 3600); }
    catch (er) { toast(er.message, 'error'); }
    loadModels(); pollStatusSoon();
  });

  // ---- Workspace · Artifacts · Preview · Settings ----
  // The agent writes into the open project's folder on the desktop; these tabs show, preview and fetch those
  // files from any device, and Settings manages every project folder. Files are served by /gw/code/raw with a
  // sandbox CSP, so a page the model wrote can't reach Lumen or its API.
  const ICF = {
    file: svg('<path d="M14 3.5H7a2 2 0 00-2 2v13a2 2 0 002 2h10a2 2 0 002-2V8.5z"/><path d="M14 3.5v5h5"/>'),
    html: svg('<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>'),
    img: IC.image, media: IC.video, audio: IC.music,
    chev: svg('<path d="M6 9l6 6 6-6"/>')
  };
  const ext = p => (p.match(/\.([^./]+)$/) || [, ''])[1].toLowerCase();
  const KINDS = {
    html: ['html', 'htm', 'svg'], img: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico'], video: ['mp4', 'webm', 'mov'],
    audio: ['mp3', 'wav', 'ogg', 'opus', 'flac', 'm4a'], pdf: ['pdf'], md: ['md', 'markdown'],
    text: ['txt', 'log', 'csv', 'tsv', 'json', 'js', 'mjs', 'ts', 'tsx', 'jsx', 'css', 'py', 'ps1', 'sh', 'bat', 'c', 'h', 'cpp', 'cs', 'java', 'go', 'rs', 'rb', 'php', 'sql', 'xml', 'yml', 'yaml', 'toml', 'ini', 'env', 'gitignore']
  };
  const kindOf = p => { const e = ext(p) || p.split('/').pop().toLowerCase(); for (const k in KINDS) if (KINDS[k].includes(e)) return k; return null; };
  const rawUrl = (proj, p, dl) => `/gw/code/raw/${encodeURIComponent(proj)}/${p.split('/').map(encodeURIComponent).join('/')}${dl ? '?download=1' : ''}`;
  const zipUrl = names => '/gw/code/zip?projects=' + encodeURIComponent(names.join('|'));
  const ago = ms => { const s = (Date.now() - ms) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : fmtDate(ms); };

  let tab = 'ws', art = null, artTimer = null, seen = {}, shut = new Set(), prevPath = null;
  function setTab(t) {
    tab = t; $('#codeWs').dataset.tab = t;
    for (const b of $$('#wsTabs button')) b.setAttribute('aria-selected', b.dataset.tab === t);
    $('#wsArt').hidden = t !== 'art'; $('#wsPrev').hidden = t !== 'prev'; $('#wsSet').hidden = t !== 'set';
    clearInterval(artTimer); artTimer = null;
    if (t === 'art' || t === 'prev') { loadArt(); artTimer = setInterval(() => { if (!document.hidden && V.view === 'code' && state === 'workspace') loadArt(true); }, 4000); }
    if (t === 'set') loadSet();
  }
  for (const b of $$('#wsTabs button')) b.onclick = () => setTab(b.dataset.tab);

  // Artifacts: the open project's files, as a tree (folders first), newest files marked.
  async function loadArt(quiet) {
    const proj = wsProject();
    if (!proj) { art = null; renderArt(); renderPrevList(); return; }
    let d; try { d = await req('/gw/code/tree?project=' + encodeURIComponent(proj)); } catch (e) { if (!quiet) toast(e.message, 'error'); return; }
    if (wsProject() !== proj) return;
    const sig = d.files.map(f => f.p + f.m).join('|');
    if (quiet && art && art.sig === sig) return;
    d.sig = sig; art = d;
    if (!seen[proj]) seen[proj] = Date.now();
    renderArt(); renderPrevList();
    if (tab === 'prev' && !prevPath) pickDefault();
  }
  function renderArt() {
    const list = $('#artList'), proj = wsProject();
    $('#wsArtCount').textContent = art && art.count ? art.count : '';
    $('#artZip').disabled = !art || !art.count;
    if (!proj) { $('#artTitle').textContent = 'Artifacts'; $('#artMeta').textContent = ''; list.innerHTML = `<div class="pane-empty"><b>No project open</b>Open a project from the Projects list, or start one with New project. Files the agent makes there show up here.</div>`; return; }
    $('#artTitle').textContent = proj;
    if (!art) { list.innerHTML = ''; return; }
    $('#artMeta').textContent = `${art.count} file${art.count === 1 ? '' : 's'} · ${fmtBytes(art.bytes)}${art.last ? ' · changed ' + ago(art.last) : ''}`;
    if (!art.count) { list.innerHTML = `<div class="pane-empty"><b>Nothing here yet</b>Ask the agent to build something. Every file it writes in <code>${esc(proj)}</code> appears here as it lands.</div>`; return; }
    // Build a tree from the paths.
    const root = { dirs: {}, files: [] };
    for (const f of art.files) {
      const parts = f.p.split('/'); let n = root;
      for (let i = 0; i < parts.length - 1; i++) { n = n.dirs[parts[i]] || (n.dirs[parts[i]] = { dirs: {}, files: [], path: parts.slice(0, i + 1).join('/') }); }
      n.files.push(f);
    }
    const frag = document.createDocumentFragment(), fresh = seen[proj] || 0;
    const walk = (n, depth) => {
      for (const name of Object.keys(n.dirs).sort((a, b) => a.localeCompare(b))) {
        const d = n.dirs[name], r = el('div', 'art-row dir' + (shut.has(proj + '/' + d.path) ? ' shut' : ''));
        r.style.setProperty('--d', depth);
        r.innerHTML = `<span class="ic">${ICF.chev}</span><span class="nm">${esc(name)}</span>`;
        r.onclick = () => { const k = proj + '/' + d.path; shut.has(k) ? shut.delete(k) : shut.add(k); renderArt(); };
        frag.append(r);
        if (!shut.has(proj + '/' + d.path)) walk(d, depth + 1);
      }
      for (const f of n.files.sort((a, b) => a.p.localeCompare(b.p))) {
        const k = kindOf(f.p), r = el('div', 'art-row' + (f.p === prevPath ? ' sel' : ''));
        r.style.setProperty('--d', depth);
        const ic = k === 'html' ? ICF.html : k === 'img' ? ICF.img : k === 'video' ? ICF.media : k === 'audio' ? ICF.audio : ICF.file;
        r.innerHTML = `<span class="ic">${ic}</span><span class="nm"></span>${f.m > fresh ? '<span class="new">new</span>' : ''}<span class="mt">${esc(fmtBytes(f.s))} · ${esc(ago(f.m))}</span><a class="dl" title="Download" aria-label="Download ${esc(f.p)}">${IC.download}</a>`;
        r.querySelector('.nm').textContent = f.p.split('/').pop(); r.title = f.p;
        const a = r.querySelector('.dl'); a.href = rawUrl(proj, f.p, true); a.onclick = e => e.stopPropagation();
        r.onclick = () => { prevPath = f.p; setTab('prev'); showPrev(); };
        frag.append(r);
      }
    };
    walk(root, 0);
    if (art.truncated) { const m = el('div', 'art-more', `Showing the newest ${art.files.length} of ${art.count} files. Download all to get everything.`); frag.append(m); }
    list.replaceChildren(frag);
  }
  $('#artRefresh').onclick = () => loadArt();
  $('#artZip').onclick = () => { const p = wsProject(); if (p) location.href = zipUrl([p]); };

  // Preview: viewable files in a picker; HTML runs in a locked iframe.
  function previewable() { return art ? art.files.filter(f => kindOf(f.p)).map(f => f.p).sort((a, b) => a.localeCompare(b)) : []; }
  function pickDefault() {
    const list = previewable(); if (!list.length) return showPrev();
    prevPath = list.find(p => /(^|\/)index\.html?$/i.test(p)) || list.find(p => kindOf(p) === 'html') || art.files.find(f => kindOf(f.p)).p;
    renderPrevList(); showPrev();
  }
  function renderPrevList() {
    const sel = $('#prevFile'), list = previewable();
    sel.innerHTML = '';
    if (!list.length) { const o = el('option', null, art ? 'No previewable files yet' : 'Open a project first'); sel.append(o); sel.disabled = true; }
    else {
      sel.disabled = false;
      for (const p of list) { const o = el('option', null, p); o.value = p; o.selected = p === prevPath; sel.append(o); }
      if (prevPath && !list.includes(prevPath)) { const o = el('option', null, prevPath + ' (gone)'); o.value = prevPath; o.selected = true; sel.prepend(o); }
    }
    if (tab === 'prev' && !$('#prevBody').firstChild) showPrev();
  }
  $('#prevFile').onchange = e => { prevPath = e.target.value; showPrev(); };
  $('#prevReload').onclick = () => { if (tab === 'prev') { loadArt(true); showPrev(true); } };
  let prevShown = null;
  async function showPrev(force) {
    const body = $('#prevBody'), proj = wsProject(), p = prevPath;
    const open = $('#prevOpen'), dl = $('#prevDl');
    const off = !proj || !p;
    for (const a of [open, dl]) a.toggleAttribute('aria-disabled', off);
    if (off) { prevShown = null; body.innerHTML = `<div class="pane-empty"><b>Nothing to preview</b>${proj ? 'When the agent makes an HTML page, an image, a PDF or a text file, pick it here or click it in Artifacts.' : 'Open a project first.'}</div>`; return; }
    const url = rawUrl(proj, p), key = proj + '/' + p;
    open.href = url; dl.href = rawUrl(proj, p, true);
    if (!force && prevShown === key) return;
    prevShown = key;
    const bust = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    const k = kindOf(p);
    if (k === 'html' || k === 'pdf') {
      const f = document.createElement('iframe');
      f.title = 'Preview of ' + p;
      if (k === 'html') f.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups allow-downloads'); else f.className = 'pdf';
      f.src = bust; body.replaceChildren(f); return;
    }
    if (k === 'img' || k === 'video' || k === 'audio') {
      const w = el('div', 'prev-media'), m = document.createElement(k === 'img' ? 'img' : k);
      m.src = bust; if (k !== 'img') { m.controls = true; m.preload = 'metadata'; m.playsInline = true; } else m.alt = p;
      w.append(m); body.replaceChildren(w); return;
    }
    if (k === 'md' || k === 'text') {
      try {
        const r = await fetch(bust, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const len = +r.headers.get('content-length') || 0;
        if (len > 2 * 1048576) { body.innerHTML = `<div class="pane-empty"><b>Too big to show here</b>${esc(fmtBytes(len))}. Download it instead.</div>`; return; }
        const t = await r.text();
        if (prevShown !== key) return;
        if (k === 'md') { const d = el('div', 'prev-md md'); d.innerHTML = md(t); body.replaceChildren(d); }
        else { const pre = el('pre', 'prev-text'); pre.textContent = t; body.replaceChildren(pre); }
      } catch (e) { body.innerHTML = `<div class="pane-empty"><b>Couldn't load it</b>${esc(e.message)}</div>`; }
      return;
    }
    body.innerHTML = `<div class="pane-empty"><b>No preview for this type</b>Download it to open it on this device.</div>`;
  }

  // Settings: every project folder, with sessions; download or delete several at once.
  let all = null; const picked2 = new Set();
  async function loadSet() {
    $('#setList').innerHTML = '<div class="pane-empty">Loading…</div>';
    try { all = await req('/gw/code/all'); } catch (e) { $('#setList').innerHTML = `<div class="pane-empty"><b>Couldn't list projects</b>${esc(e.message)}</div>`; return; }
    for (const n of [...picked2]) if (!all.projects.some(p => p.name === n)) picked2.delete(n);
    renderSet();
  }
  function renderSet() {
    const list = $('#setList');
    if (!all) return;
    const ps = all.projects.slice().sort((a, b) => b.modified - a.modified);
    $('#setMeta').textContent = `${ps.length} project${ps.length === 1 ? '' : 's'} · ${fmtBytes(all.bytes)} used${all.free != null ? ' · ' + fmtBytes(all.free) + ' free on the desktop' : ''}`;
    if (!ps.length) list.innerHTML = '<div class="pane-empty"><b>No projects yet</b>New project makes the first one.</div>';
    else {
      const frag = document.createDocumentFragment();
      for (const p of ps) {
        const r = el(renaming === p.name ? 'div' : 'label', 'set-row');   // a label would tick the box on clicks in the name field
        const ses = p.sessions || [];
        const sesTxt = ses.length ? ses.slice().sort((a, b) => b.updated - a.updated).map(s => s.title || 'Untitled session').slice(0, 2).join(' · ') + (ses.length > 2 ? ` · +${ses.length - 2} more` : '') : (all.sessions_known ? 'no sessions' : 'sessions show while Code is running');
        r.innerHTML = `<input type="checkbox"><div class="nm"><a href="#"></a><small></small></div><div class="st">${esc(fmtBytes(p.bytes))}<small>${p.files} file${p.files === 1 ? '' : 's'} · ${esc(ago(p.modified))}</small></div><button class="icon-btn ren" type="button">${IC.edit}</button>`;
        const cb = r.querySelector('input'); cb.checked = picked2.has(p.name);
        cb.onchange = () => { cb.checked ? picked2.add(p.name) : picked2.delete(p.name); syncSel(); };
        const a = r.querySelector('a'); a.textContent = p.name; a.title = p.path;
        a.onclick = e => { e.preventDefault(); if (canEmbed()) { openProject(p); setTab('art'); } };
        r.querySelector('small').textContent = sesTxt;
        const rb = r.querySelector('.ren'); rb.title = 'Rename'; rb.setAttribute('aria-label', 'Rename ' + p.name);
        rb.onclick = e => { e.preventDefault(); renaming = p.name; renderSet(); };
        if (renaming === p.name) renameRow(r, p);
        frag.append(r);
      }
      list.replaceChildren(frag);
    }
    syncSel();
  }
  // Rename: the row's name turns into a field. Same rules as the gateway (letters, numbers, spaces, dots, dashes;
  // up to 60; no clash). The project's OpenCode chats move with the folder (gateway: Rename-CodeProject).
  let renaming = null;
  const NAME_OK = /^[\p{L}\p{N}_ .\-]+$/u;
  function nameProblem(v, from) {
    const t = v.trim();
    if (!t) return 'Type a name.';
    if (t.length > 60) return 'Up to 60 characters.';
    if (!NAME_OK.test(t)) return 'Only letters, numbers, spaces, dots and dashes.';
    if (/^[. ]|[. ]$/.test(t)) return "Names can't start or end with a dot.";
    if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(t)) return "Windows doesn't allow that name.";
    if (t !== from && all && all.projects.some(p => p.name !== from && p.name.toLowerCase() === t.toLowerCase())) return 'There\'s already a project with that name.';
    return null;
  }
  function renameRow(r, p) {
    r.classList.add('renaming');
    const nm = r.querySelector('.nm');
    nm.innerHTML = `<form class="ren-form"><input class="ren-in" type="text" maxlength="60" autocomplete="off" spellcheck="false" aria-label="New name for ${esc(p.name)}"><button class="btn solid" type="submit">Save</button><button class="btn" type="button" data-x>Cancel</button></form><small class="ren-err" role="alert"></small>`;
    const f = nm.querySelector('form'), inp = f.querySelector('input'), save = f.querySelector('[type=submit]'), msg = nm.querySelector('.ren-err');
    inp.value = p.name;
    const check = () => { const e = nameProblem(inp.value, p.name); msg.textContent = inp.value.trim() === p.name ? '' : (e || ''); msg.classList.toggle('bad', !!e); save.disabled = !!e || inp.value.trim() === p.name; };
    inp.oninput = check;
    inp.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); renaming = null; renderSet(); } };
    f.querySelector('[data-x]').onclick = () => { renaming = null; renderSet(); };
    f.onsubmit = async e => {
      e.preventDefault(); if (save.disabled) return;
      const to = inp.value.trim(), wasOpen = wsProject() === p.name;
      save.disabled = true; inp.disabled = true; save.textContent = 'Renaming…'; msg.classList.remove('bad'); msg.textContent = '';
      // Let go of the open workspace first, so OpenCode isn't holding the folder while it moves.
      if (wasOpen && frame) { frame.src = 'about:blank'; frameUrl = null; }
      try {
        const res = await post('/gw/code/rename', { from: p.name, to });
        renaming = null;
        if (picked2.delete(p.name)) picked2.add(res.name);
        if (wasOpen) {   // keep the workspace on this project (same session) under its new folder
          const base = wsUrl(), u = store.get('code.ws', '') || '', rest = u.startsWith(base) ? u.slice(base.length).replace(/^[^/]*/, '') : '/session';
          store.set('code.ws', base + b64url(res.path) + (rest || '/session'));
          lastProj = res.name; art = null; ensureFrame();
        }
        toast(`Renamed to ${res.name}${res.sessions ? ` · ${res.sessions} chat${res.sessions === 1 ? '' : 's'} moved with it` : ''}`, 'ok', 3200);
        await loadSet(); load();
        if (wasOpen) { renderArt(); loadArt(true); }
      } catch (er) {
        if (wasOpen) ensureFrame();
        inp.disabled = false; save.textContent = 'Save'; check(); msg.classList.add('bad'); msg.textContent = er.message; inp.focus();
      }
    };
    check();
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  }
  function syncSel() {
    const n = picked2.size, total = all ? all.projects.length : 0;
    const bytes = all ? all.projects.filter(p => picked2.has(p.name)).reduce((s, p) => s + p.bytes, 0) : 0;
    $('#setSel').textContent = n ? `${n} selected · ${fmtBytes(bytes)}` : 'None selected';
    const all1 = $('#setAll'); all1.checked = n > 0 && n === total; all1.indeterminate = n > 0 && n < total;
    const z = $('#setZip'); z.href = n ? zipUrl([...picked2]) : '#'; z.setAttribute('aria-disabled', n ? 'false' : 'true');
    $('#setDel').disabled = !n; $('#setConfirm').hidden = true;
  }
  $('#setAll').onchange = e => { picked2.clear(); if (e.target.checked && all) for (const p of all.projects) picked2.add(p.name); renderSet(); };
  $('#setRefresh').onclick = loadSet;
  $('#setZip').onclick = e => { if (!picked2.size) e.preventDefault(); };
  $('#setDel').onclick = () => {
    const n = picked2.size; if (!n) return;
    const names = [...picked2];
    $('#setConfirmText').textContent = `Delete ${n === 1 ? names[0] : n + ' projects'} from the desktop for good? There's no trash, so download first if you want a copy.`;
    $('#setConfirm').hidden = false; $('#setYes').focus();
  };
  $('#setNo').onclick = () => { $('#setConfirm').hidden = true; };
  $('#setYes').onclick = async () => {
    const names = [...picked2], open = wsProject();
    $('#setYes').disabled = true;
    try {
      const r = await post('/gw/code/delete', { names });
      for (const n of r.deleted || []) picked2.delete(n);
      if ((r.failed || []).length) toast(`Couldn't delete ${r.failed.map(f => f.name).join(', ')}: ${r.failed[0].error}`, 'error', 7000);
      else toast(`Deleted ${r.deleted.length} project${r.deleted.length === 1 ? '' : 's'}`, 'ok', 2600);
      if (open && (r.deleted || []).includes(open)) { art = null; prevPath = null; }
    } catch (e) { toast(e.message, 'error'); }
    finally { $('#setYes').disabled = false; $('#setConfirm').hidden = true; }
    await loadSet(); load();
  };
  $('#codeManage').onclick = () => { if (canEmbed()) { setState('workspace'); setTab('set'); } else toast('Open Lumen from its tailnet address to manage projects.', 'info'); };
  // A different project opened in the workspace: start its tabs fresh.
  let lastProj = null;
  function projChanged() { const p = wsProject(); if (p === lastProj) return; lastProj = p; chats = null; refreshChats(); art = null; prevPath = null; prevShown = null; $('#prevBody').replaceChildren(); if (tab === 'art' || tab === 'prev') loadArt(); else { renderArt(); loadArt(true); } }
  setInterval(() => { if (state === 'workspace') projChanged(); }, 1500);
  setTab('ws');

  $('#codeNew').onclick = newProject;
  $('#codeOpen').addEventListener('click', e => {
    if ($('#codeOpen').hasAttribute('aria-disabled')) { e.preventDefault(); return; }
    if (canEmbed() && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); openWs(current()); }
  });
  $('#wsProjects').onclick = () => setState('launcher');
  $('#wsRename').onclick = () => { const p = wsProject(); if (!p) return; renaming = p; setTab('set'); };
  $('#wsReload').onclick = reload;
  $('#wsAuthForm').addEventListener('submit', signIn);
  return { load, sync };
})();

/* ---------------- power & cost tracker ---------------- */
const Cost = (() => {
  const KIND = {
    image: ['Images', '#ffb46b'], video: ['Video', '#ff8a5c'], voice: ['Voice', '#ff5d8f'], music: ['Music', '#d46bff'],
    chat: ['Chat', '#8d6bff'], code: ['Code', '#5b8cff'], llm: ['Chat model (other)', '#6b7cff'], load: ['Model loads', '#67636f']
  };
  const ICON = {
    image: '<path d="M4 5h16v14H4z"/><path d="M4 16l5-5 4 4 3-3 4 4"/>', video: '<path d="M4 6h11v12H4z"/><path d="M15 10l5-3v10l-5-3"/>',
    voice: '<path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    chat: '<path d="M4 5h16v11H8l-4 4z"/>', code: '<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>', llm: '<path d="M4 5h16v11H8l-4 4z"/>',
    load: '<path d="M12 4v10M8 10l4 4 4-4M5 20h14"/>', idle: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'
  };
  const SUB = { create: 'Image', edit: 'Edit', upscale: 'Upscale', animate: 'Video', video: 'Video', voice: 'Voice', music: 'Song' };
  let range = 'today', tab = 'studio', sum = null, det = null, detRange = null;
  const money = c => { c = +c || 0; if (c >= 100) return '$' + (c / 100).toFixed(2); if (c >= 10) return c.toFixed(1) + '¢'; if (c >= 0.01) return c.toFixed(2) + '¢'; return c > 0 ? '<0.01¢' : '0¢'; };
  const energy = wh => { wh = +wh || 0; return wh >= 1000 ? (wh / 1000).toFixed(2) + ' kWh' : wh >= 10 ? Math.round(wh) + ' Wh' : wh.toFixed(1) + ' Wh'; };
  const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ICON.idle}</svg>`;
  const secs = s => s >= 3600 ? (s / 3600).toFixed(1) + ' h' : s >= 60 ? Math.round(s / 60) + ' min' : Math.max(1, s) + ' s';
  const when = ms => { if (!ms) return ''; const d = new Date(ms), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }); };

  function onStatus(st) {
    const c = st && st.cost, pill = $('#costPill'); if (!pill) return;
    pill.hidden = !c; if (!c) return;
    $('#costPillVal').textContent = money(c.today_c);
    pill.classList.toggle('live', !!(st.busy || (st.switching && st.switching.stage !== 'done')));
    pill.title = `Lumen work today ${money(c.today_c)} · idle ${money(c.idle_c)}${c.w ? ` · ${Math.round(c.w)} W now` : ''}`;
  }
  async function load() {
    try { sum = await req('/gw/energy'); } catch { sum = null; }
    render();
  }
  function render() {
    for (const b of $$('#costRange button')) b.setAttribute('aria-pressed', b.dataset.r === range);
    if (!sum) { $('#costBig').textContent = '–'; $('#costSub').textContent = "Couldn't reach the desktop."; return; }
    const t = sum[range] || {}, p = sum.power || {}, r = sum.rate || {};
    $('#costBig').innerHTML = esc(money(t.jobs_c)) + '<small>Lumen work</small>';
    $('#costSub').innerHTML = `Plus <b>${esc(money(t.idle_c))}</b> while the desktop sat on with Lumen idle. Together <b>${esc(money(t.cents))}</b> for ${esc(energy(t.wh))}.`;
    $('#costWatts').textContent = p.w ? Math.round(p.w) + ' W' : '– W';
    const by = t.by_kind || {}, total = Object.values(by).reduce((a, b) => a + b, 0);
    const keys = Object.keys(KIND).filter(k => by[k] > 0);
    $('#costSplit').innerHTML = total ? keys.map(k => `<i style="width:${(by[k] / total * 100).toFixed(2)}%;background:${KIND[k][1]}"></i>`).join('') : '';
    $('#costLegend').innerHTML = keys.length ? keys.map(k => `<li><i style="background:${KIND[k][1]}"></i>${esc(KIND[k][0])} <b>${esc(money(by[k]))}</b></li>`).join('') : '<li>Nothing made yet in this period.</li>';
    const since = sum.since ? new Date(sum.since + 'T00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
    $('#costStats').innerHTML = [['Today', sum.today], ['7 days', sum.week], ['Month', sum.month]]
      .map(([l, x]) => `<div><span>${l}</span><b>${esc(money(x.jobs_c))}</b><small>${esc(money(x.cents))} with idle</small></div>`).join('');
    $('#costUtil').textContent = (r.utility || 'Rate').split(',')[0];
    $('#costRateVal').textContent = (+r.total_c).toFixed(3) + '¢/kWh';
    const inS = $('#rateSupply'), inD = $('#rateDelivery');
    if (document.activeElement !== inS) inS.value = r.supply_c; if (document.activeElement !== inD) inD.value = r.delivery_c;
    const src = (r.sources || []).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">source ${i + 1}</a>`).join(', ');
    $('#rateNote').innerHTML = `${esc(r.town || '')}: ${esc(r.utility || '')}. Supply ${esc(r.supply_c)}¢ (${esc(r.supply_note || '')}). Delivery ${esc(r.delivery_c)}¢ (${esc(r.delivery_note || '')}). ` +
      `The $${esc(r.customer_charge)} monthly customer charge isn't counted. ${src ? 'From ' + src + '. ' : ''}Changing the rate re-prices all history. Tracking since ${esc(since)}.`;
    $('#powerNote').textContent = `How it's measured: the GPU reports its own draw${p.gpu_measured ? '' : ' (not reading right now, using an estimate)'}` +
      `${p.gpu_w != null ? ` (${Math.round(p.gpu_w)} W now)` : ''}. CPU is estimated from its load (${p.cpu_w != null ? Math.round(p.cpu_w) + ' W now' : 'n/a'}), plus ${esc(r.rest_w)} W for the rest of the PC, ` +
      `divided by ${Math.round((r.psu_eff || .88) * 100)}% power-supply efficiency. The monitor isn't included. Expect roughly ±15–20%; a smart plug would make it exact.`;
  }
  async function loadDetails() {
    $('#costRows').innerHTML = '<li class="cost-empty" style="display:block">Loading…</li>';
    try { det = await req('/gw/energy/details?range=' + range); detRange = range; } catch { det = null; }
    renderDetails();
  }
  function renderDetails() {
    for (const b of $$('#costTab button')) b.setAttribute('aria-pressed', b.dataset.t === tab);
    const box = $('#costRows');
    if (!det) { box.innerHTML = `<li class="cost-empty" style="display:block">Couldn't load the details.</li>`; return; }
    let rows = [];
    if (tab === 'studio') rows = det.studio.map(x => {
      const kind = x.kind || 'image', sub = SUB[x.sub] || SUB[kind] || kind;
      const th = x.thumb ? `<span class="th" style="background-image:url('${esc(fileUrl(x.thumb))}')"></span>` : `<span class="th">${svg(kind)}</span>`;
      const extra = x.status && x.status !== 'done' ? ` · <span class="tag">${esc(x.status === 'deleted' ? 'deleted' : x.status)}</span>` : '';
      const batch = x.batch > 1 ? ` · 1 of ${x.batch}` : '';
      return `<li>${th}<div class="t"><p>${esc(x.label || sub)}</p><span>${esc(sub)} · ${esc(secs(x.secs))}${batch} · ${esc(when(x.at))}${extra}</span></div><div class="c">${esc(money(x.cents))}<small>${esc(energy(x.wh))}</small></div></li>`;
    });
    else if (tab === 'chats') rows = det.chats.map(x =>
      `<li><span class="th">${svg('chat')}</span><div class="t"><p>${esc(x.label || (x.exists ? 'New chat' : 'Deleted chat'))}</p><span>${x.exists ? esc(x.messages + ' messages') : 'deleted'} · last ${esc(when(x.at))}</span></div><div class="c">${esc(money(x.cents))}<small>${esc(energy(x.wh))}</small></div></li>`);
    else {
      rows = det.other.map(x => `<li><span class="th">${svg(x.kind)}</span><div class="t"><p>${esc((KIND[x.kind] || [x.label])[0] === 'Code' ? 'Code workspace' : (KIND[x.kind] || [x.label])[0])}</p><span>${esc(x.days + (x.days === 1 ? ' day' : ' days'))} · last ${esc(when(x.at))}</span></div><div class="c">${esc(money(x.cents))}<small>${esc(energy(x.wh))}</small></div></li>`);
      const t = det.total;
      rows.push(`<li><span class="th">${svg('idle')}</span><div class="t"><p>Desktop on, Lumen idle</p><span>Not counted as Lumen work. Includes anything else the PC does.</span></div><div class="c">${esc(money(t.idle_c))}<small>${esc(energy(t.idle_wh))}</small></div></li>`);
    }
    const label = { today: 'today', week: 'in the last 7 days', month: 'this month', all: 'yet' }[detRange] || '';
    box.innerHTML = rows.length ? rows.join('') : `<li class="cost-empty" style="display:block">Nothing here ${esc(label)}.</li>`;
  }
  function showDetail(on) {
    $('#costBody').hidden = on; $('#costDetail').hidden = !on;
    if (on) loadDetails();
  }
  function open() { showDetail(false); render(); load(); $('#costSheet').showModal(); }
  function init() {
    if (!$('#costPill')) return;
    $('#costPill').addEventListener('click', open);
    $('#costRange').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; range = b.dataset.r; render(); });
    $('#costTab').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.t; renderDetails(); });
    $('#costDetailsBtn').addEventListener('click', () => showDetail(true));
    $('#costBack').addEventListener('click', () => showDetail(false));
    $('#rateSave').addEventListener('click', async () => {
      const s = parseFloat($('#rateSupply').value), d = parseFloat($('#rateDelivery').value), btn = $('#rateSave');
      if (!(s >= 0 && s <= 200 && d >= 0 && d <= 200)) { btn.textContent = 'Check the numbers'; setTimeout(() => btn.textContent = 'Save', 1800); return; }
      try { sum = await post('/gw/energy/rate', { supply_c: s, delivery_c: d }); btn.textContent = 'Saved'; render(); refreshStatus(); }
      catch (e) { btn.textContent = 'Not saved'; }
      setTimeout(() => btn.textContent = 'Save', 1800);
    });
    setInterval(() => { if ($('#costSheet').open && !$('#costBody').hidden) load(); }, 5000);
  }
  return { init, onStatus };
})();
Cost.init();

buildComposer(); buildFilters(); layoutStage();
{
  const h = location.hash.slice(1);
  V.launch = h === 'launch';
  const v0 = VIEWS.includes(h) ? h : (h ? 'studio' : store.get('view', 'studio'));
  applyView(VIEWS.includes(v0) ? v0 : 'studio');
  addEventListener('hashchange', () => { const x = location.hash.slice(1); if (VIEWS.includes(x) && x !== V.view) goView(x, { passive: true }); });
}
tickStatus();
})();
