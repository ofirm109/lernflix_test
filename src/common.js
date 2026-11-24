// כלים משותפים לכל המסכים: יצירת אלמנטים, אייקונים, סוגי פריטים, ניקוד ועוד.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** יוצר אלמנט: h('div', {class:'x', onclick}, 'טקסט', child, [children]) */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}
/** אייקון SVG כאלמנט */
export function icon(name, cls) {
  const span = document.createElement('span');
  span.innerHTML = ICONS[name] || '';
  const svg = span.firstElementChild;
  if (svg) { svg.setAttribute('width', '1.25em'); svg.setAttribute('height', '1.25em'); svg.setAttribute('aria-hidden', 'true'); }
  if (cls && svg) svg.setAttribute('class', cls);
  return svg || span;
}
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const S = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
export const ICONS = {
  quiz: S('<circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.5-2.7 4"/><circle cx="12" cy="17.3" r=".6" fill="currentColor"/>'),
  cloud: S('<path d="M7 18.5h10.2a4.3 4.3 0 0 0 .6-8.6 5.8 5.8 0 0 0-11.1 1.4A3.6 3.6 0 0 0 7 18.5z"/>'),
  rating: S('<path d="M5 20V13M10 20V8M15 20v-5M20 20V4"/>'),
  bubbles: S('<path d="M4 5.5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3.5v-3.5H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z"/><path d="M17 9h3a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1v3l-3-3h-3"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  play: S('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>'),
  link: S('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>'),
  phone: S('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18h2"/>'),
  copy: S('<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>'),
  trash: S('<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12.5a2 2 0 0 0 2 1.5h7a2 2 0 0 0 2-1.5L18.5 7M9 7V4.5h6V7"/>'),
  up: S('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  down: S('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  x: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: S('<path d="M4.5 12.5l5 5 10-11"/>', 'stroke-width="3"'),
  checkThin: S('<path d="M4.5 12.5l5 5 10-11"/>'),
  folder: S('<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  book: S('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>'),
  calendar: S('<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'),
  layers: S('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  chev: S('<path d="M15 6l-6 6 6 6"/>'),
  arrowLeft: S('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  arrowRight: S('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  full: S('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  logout: S('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"/>'),
  info: S('<circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.5v.5"/>'),
  alert: S('<path d="M12 3l10 18H2z"/><path d="M12 10v4.5M12 17.5v.5"/>'),
  lock: S('<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>'),
  eyeOff: S('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5.5 0 9.5 7 9.5 7a17 17 0 0 1-3 3.7M6.5 6.6C4 8.3 2.5 12 2.5 12s4 7 9.5 7a9.5 9.5 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  stop: S('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>'),
  users: S('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>'),
  trophy: S('<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v3.5M8 21h8M9 17.5h6"/>'),
  heart: S('<path d="M12 20s-7.5-4.6-9-9.4C1.8 6.9 4.3 4 7.3 4c2 0 3.4 1.2 4.7 2.9C13.3 5.2 14.7 4 16.7 4c3 0 5.5 2.9 4.3 6.6-1.5 4.8-9 9.4-9 9.4z"/>'),
  send: S('<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>'),
  refresh: S('<path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5M20 20v-4h-4"/>'),
  edit: S('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  image: S('<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5.5-5.5L5 20"/>'),
  download: S('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>'),
  sparkle: S('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>'),
};

// צורות לתשובות (כמו בחידונים מוכרים) – עיגול, משולש, ריבוע, מעוין
export const SHAPES = [
  '<svg class="shape" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17"/></svg>',
  '<svg class="shape" viewBox="0 0 40 40"><path d="M20 3 L37.5 35 H2.5 Z"/></svg>',
  '<svg class="shape" viewBox="0 0 40 40"><rect x="4" y="4" width="32" height="32" rx="3"/></svg>',
  '<svg class="shape" viewBox="0 0 40 40"><path d="M20 2 L38 20 L20 38 L2 20 Z"/></svg>',
  '<svg class="shape" viewBox="0 0 40 40"><path d="M20 2.5l5.1 11.2 12.2 1.3-9.1 8.3 2.6 12-10.8-6.2-10.8 6.2 2.6-12-9.1-8.3 12.2-1.3z"/></svg>',
  '<svg class="shape" viewBox="0 0 40 40"><path d="M11 4h18l9 16-9 16H11L2 20z"/></svg>',
  '<svg class="shape" viewBox="0 0 40 40"><path d="M20 2.5l17.5 12.7-6.7 20.6H9.2L2.5 15.2z"/></svg>',
];
export function shape(i) {
  const s = document.createElement('span');
  s.innerHTML = SHAPES[i % SHAPES.length];
  return s.firstElementChild;
}
export const OPT_NAMES = ['עיגול', 'משולש', 'ריבוע', 'מעוין', 'כוכב', 'משושה', 'מחומש'];
export const MAX_OPTIONS = 7;

// סוגי פריטים
export const TYPES = {
  quiz: { label: 'שאלת חידון', desc: 'שאלה אמריקאית עם ניקוד – תשובה נכונה ומהירה מזכה ביותר נקודות', icon: 'quiz', color: '#0090FF', competitive: true, placeholder: 'כתבו כאן את השאלה…' },
  wordcloud: { label: 'ענן מילים', desc: 'כל משתתף שולח מילה או שתיים – הענן גדל בזמן אמת', icon: 'cloud', color: '#32A9E0', competitive: false, placeholder: 'למשל: במילה אחת – מה ביקורת טובה בעיניכם?' },
  rating: { label: 'דירוג 1–10', desc: 'המשתתפים מדרגים קריטריונים מ-1 עד 10 ורואים ממוצע', icon: 'rating', color: '#6236FF', competitive: false, placeholder: 'למשל: דרגו את המפגש של היום' },
  bubbles: { label: 'בועות מחשבה', desc: 'תשובות פתוחות שמופיעות על הלוח כבועות – באופן אנונימי', icon: 'bubbles', color: '#202C60', competitive: false, placeholder: 'למשל: מה תיקחו איתכם מהמפגש?' },
};

/** מפתח סודי אקראי (לקישור המרצה) */
export function randomKey(n = 24) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const arr = new Uint32Array(n);
  (window.crypto || window.msCrypto).getRandomValues(arr);
  return Array.from(arr, (x) => abc[x % abc.length]).join('');
}
export function uid8() {
  return Math.random().toString(36).slice(2, 10);
}
export function newItem(type) {
  const base = { id: uid8(), type, text: '' };
  if (type === 'quiz') return { ...base, options: ['', '', '', ''], correct: [], time: 20, points: 1 };
  if (type === 'wordcloud') return { ...base, maxWords: 3 };
  if (type === 'rating') return { ...base, criteria: ['', ''] };
  if (type === 'bubbles') return { ...base, maxPosts: 2 };
  return base;
}
/** Firebase מחזיר לעיתים אובייקט במקום מערך */
export function toArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined);
  return Object.keys(v).sort((a, b) => Number(a) - Number(b)).map((k) => v[k]).filter((x) => x !== null && x !== undefined);
}
export function normItem(it) {
  const out = { ...it };
  if (it.type === 'quiz') {
    out.options = toArray(it.options).map((s) => s || '');
    out.correct = toArray(it.correct).map(Number);
    out.time = Number(it.time) || 20;
    out.points = it.points === undefined ? 1 : Number(it.points);
  }
  if (it.type === 'rating') out.criteria = toArray(it.criteria).map((s) => s || '');
  if (it.type === 'wordcloud') out.maxWords = Number(it.maxWords) || 3;
  if (it.type === 'bubbles') out.maxPosts = Number(it.maxPosts) || 2;
  out.id = it.id || uid8();
  out.text = it.text || '';
  return out;
}
/** בעיות בפריט (לתצוגה בעורך) */
export function itemProblems(it) {
  const p = [];
  if (!it.text || !it.text.trim()) p.push('חסר נוסח לשאלה');
  if (it.type === 'quiz') {
    const filled = it.options.filter((o) => o.trim()).length;
    if (filled < 2) p.push('צריך לפחות 2 תשובות');
    if (!it.correct.length) p.push('יש לסמן את התשובה הנכונה (לחצו על "נכונה")');
    else if (it.correct.some((c) => !it.options[c] || !it.options[c].trim())) p.push('התשובה שסומנה כנכונה ריקה');
  }
  if (it.type === 'rating' && !it.criteria.some((c) => c.trim())) p.push('צריך לפחות קריטריון אחד');
  return p;
}
/** הכנת פריט למשחק: מנקה תשובות ריקות ומסדר אינדקסים */
export function prepareItem(raw) {
  const it = normItem(raw);
  if (it.type === 'quiz') {
    const keep = [];
    it.options.forEach((o, i) => { if (o.trim()) keep.push(i); });
    const options = keep.map((i) => it.options[i].trim());
    const correct = it.correct.map((c) => keep.indexOf(c)).filter((c) => c >= 0);
    return { ...it, options, correct };
  }
  if (it.type === 'rating') return { ...it, criteria: it.criteria.map((c) => c.trim()).filter(Boolean) };
  return it;
}
/** מה שהמשתתפים רואים (בלי התשובה הנכונה) */
export function publicItem(it) {
  const o = { type: it.type, text: it.text };
  if (it.image) { o.hasImage = true; o.imgPhone = it.imgPhone !== false; }
  if (it.type === 'quiz') Object.assign(o, { options: it.options, time: it.time, points: it.points });
  if (it.type === 'wordcloud') o.maxWords = Number(it.maxWords) || 3;
  if (it.type === 'bubbles') o.maxPosts = Number(it.maxPosts) || 2;
  if (it.type === 'rating') o.criteria = it.criteria;
  return o;
}
/** ניקוד: תשובה נכונה = 500–1000 נק' (כפול הכפלה), לפי מהירות */
export function calcPoints(rtMs, timeS, mult) {
  if (!mult) return 0;
  const frac = Math.min(1, Math.max(0, rtMs / (timeS * 1000)));
  return Math.round(1000 * mult * (1 - frac / 2));
}
export function normWord(s) {
  return String(s || '')
    .replace(/[֑-ׇ]/g, '') // ניקוד
    .replace(/["'״׳.,!?;:()\[\]{}<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 30);
}
export function genPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
export const fmt = (n) => Number(n || 0).toLocaleString('he-IL');

export function pageUrl(file, params) {
  const u = new URL(file, location.href);
  u.search = '';
  u.hash = '';
  if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}
export function baseDisplayUrl() {
  const u = new URL('./', location.href);
  return (u.host + u.pathname).replace(/\/$/, '');
}

// ---------- Toast / Modal ----------
let toastBox;
export function toast(msg, kind = '') {
  if (!toastBox) { toastBox = h('div', { class: 'toasts' }); document.body.appendChild(toastBox); }
  const t = h('div', { class: 'toast ' + kind }, msg);
  toastBox.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, 2600);
}
export function confirmDialog({ title, text = '', ok = 'אישור', cancel = 'ביטול', danger = false }) {
  return new Promise((resolve) => {
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    const okBtn = h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), onclick: () => close(true) }, ok);
    const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(false); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        h('h3', null, title),
        text ? h('p', null, text) : null,
        h('div', { class: 'actions' }, okBtn, h('button', { class: 'btn btn-ghost', onclick: () => close(false) }, cancel))));
    document.body.appendChild(back);
    document.addEventListener('keydown', onKey);
    okBtn.focus();
  });
}
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    return ok;
  }
}
export function demoBanner(store, short = false) {
  if (store.mode !== 'demo') return null;
  return h('div', { class: 'demo-banner' }, short
    ? 'מצב הדגמה – עובד רק בדפדפן הזה'
    : 'מצב הדגמה: המשחק פועל רק בתוך הדפדפן הזה (אפשר לפתוח כמה לשוניות כדי לנסות). לחיבור טלפונים אמיתיים – ממלאים את config.js לפי מדריך ההתקנה.');
}
export function logo(cls = 'logo', iconOnly = false) {
  return h('img', { class: cls, src: iconOnly ? 'assets/logo-icon.svg' : 'assets/logo.svg', alt: 'משרד מבקר המדינה ונציב תלונות הציבור' });
}
/** QR כ-SVG בצבע הנייבי של המותג */
export function qrSvg(qrcode, text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const m = 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  const size = n + m * 2;
  return `<svg class="qr" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#202C60"/></svg>`;
}
export function medalSvg(place) {
  const col = ['#D09E00', '#8E9AAF', '#C76322'][place - 1] || '#C8D3DB';
  return `<svg class="medal" viewBox="0 0 64 64"><path d="M20 2h10l6 18H26z" fill="#0090FF"/><path d="M44 2H34l-6 18h10z" fill="#32C4FF"/><circle cx="32" cy="40" r="20" fill="${col}"/><circle cx="32" cy="40" r="14.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/><text x="32" y="47.5" text-anchor="middle" font-family="Assistant, Arial" font-weight="800" font-size="21" fill="#fff">${place}</text></svg>`;
}

// סדר עדיפויות של מקשים להתקדמות (כולל שלט מצגות)
export const NEXT_KEYS = new Set([' ', 'Enter', 'PageDown', 'ArrowLeft', 'ArrowRight']);

export function plural(n, one, many) {
  return n === 1 ? one : `${fmt(n)} ${many}`;
}

/** האם הטקסט ארוך (לעיצוב מותאם) */
export function isLong(text, n = 140) {
  return String(text || '').length > n || /\n/.test(text || '');
}

/**
 * הקטנת גופן אוטומטית עד שהטקסט נכנס במקום (האלמנט צריך גובה מוגבל ו-overflow:hidden).
 * מחזיר את הגודל שנבחר.
 */
export function fitText(el, min = 14) {
  if (!el || !el.isConnected) return 0;
  el.style.fontSize = '';
  const max = parseFloat(getComputedStyle(el).fontSize) || 16;
  const fits = () => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
  if (fits()) return max;
  let lo = min;
  let hi = max;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = mid + 'px';
    if (fits()) lo = mid; else hi = mid;
  }
  el.style.fontSize = lo + 'px';
  return lo;
}
/** אותו גודל גופן לקבוצת אלמנטים (למשל כל התשובות) */
export function fitGroup(els, min = 14) {
  if (!els.length) return;
  const sizes = els.map((e) => fitText(e, min) || 0);
  const m = Math.min(...sizes);
  els.forEach((e) => { e.style.fontSize = m + 'px'; });
}

/** תצוגת תמונה במסך מלא */
export function lightbox(src) {
  if (!src) return;
  const back = h('div', { class: 'lightbox', role: 'dialog', 'aria-label': 'תמונה מוגדלת', onclick: () => back.remove() },
    h('img', { src, alt: '' }), h('span', { class: 'lb-close' }, 'סגירה ✕'));
  document.body.appendChild(back);
}

/**
 * התאמה מאוזנת: מקטין יחד את השאלה ואת התשובות עד שהכול נכנס,
 * כך שטקסט ארוך בשאלה לא "גונב" את כל המקום מהתשובות (ולהפך).
 */
export function fitBalanced(q, opts, ratio = 1.12, min = 12) {
  const all = [q, ...opts].filter((e) => e && e.isConnected);
  if (!all.length) return;
  all.forEach((e) => { e.style.fontSize = ''; e.classList.remove('scroll'); });
  const qMax = q ? parseFloat(getComputedStyle(q).fontSize) : 0;
  const oMax = opts.length ? parseFloat(getComputedStyle(opts[0]).fontSize) : 0;
  const over = (e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1;
  const apply = (f) => {
    if (q) q.style.fontSize = Math.max(min, Math.min(qMax, f * ratio)) + 'px';
    opts.forEach((o) => { o.style.fontSize = Math.max(min, Math.min(oMax, f)) + 'px'; });
  };
  const ok = () => all.every((e) => !over(e));
  let hi = Math.max(qMax / ratio, oMax);
  apply(hi);
  if (ok()) { all.forEach((e) => { e.style.fontSize = ''; }); return; }
  let lo = min;
  while (hi - lo > 0.4) {
    const mid = (lo + hi) / 2;
    apply(mid);
    if (ok()) lo = mid; else hi = mid;
  }
  apply(lo);
  all.forEach((e) => { if (over(e)) e.classList.add('scroll'); });
}
