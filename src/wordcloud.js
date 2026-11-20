// ענן מילים: פריסה בספירלה עם בדיקת התנגשויות, מילים ממורכזות, ללא סיבוב (קריא בעברית).
const COLORS = ['#0090FF', '#6236FF', '#202C60', '#1E9FD8', '#4B5FDB', '#0068C2'];
let ctx;

function hash(s) { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return Math.abs(x); }

/**
 * @param {HTMLElement} box  מכל עם position:absolute; inset:0
 * @param {{key:string,text:string,count:number}[]} words
 * @param {(key:string)=>void} onHide  לחיצה על מילה מסתירה אותה
 */
export function renderCloud(box, words, onHide) {
  const W = box.clientWidth;
  const H = box.clientHeight;
  if (!W || !H) return;
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  const list = words.slice().sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'he')).slice(0, 80);
  const counts = list.map((w) => w.count);
  const max = Math.max(1, ...counts);
  const min = Math.min(max, ...counts);
  const maxFs = Math.min(H * 0.24, W * 0.11, 130);
  const minFs = Math.max(18, maxFs * 0.24);
  const cx = W / 2;
  const cy = H / 2;
  const unit = Math.min(W, H) / 220;

  let best = null;
  let scale = list.length > 25 ? 0.85 : 1;
  for (let attempt = 0; attempt < 7; attempt++) {
    const placed = [];
    let failed = false;
    for (const w of list) {
      const t = max === min ? 0.55 : Math.sqrt((w.count - min) / (max - min));
      const fs = Math.max(14, Math.round((minFs + (maxFs - minFs) * t) * scale));
      ctx.font = `800 ${fs}px Assistant, Arial, sans-serif`;
      const tw = ctx.measureText(w.text).width;
      const th = fs * 1.02;
      const pad = Math.max(4, fs * 0.16);
      const rw = tw + pad * 2;
      const rh = th + pad;
      let ok = false;
      const start = (hash(w.key) % 628) / 100; // נקודת התחלה שונה לכל מילה – פריסה יציבה
      for (let s = 0; s < 2200; s++) {
        const a = start + s * 0.28;
        const r = unit * s * 0.28 * 1.15;
        const x = cx + r * Math.cos(a) * 1.5;
        const y = cy + r * Math.sin(a);
        const rect = { x: x - rw / 2, y: y - rh / 2, w: rw, h: rh };
        if (rect.x < 6 || rect.y < 6 || rect.x + rect.w > W - 6 || rect.y + rect.h > H - 6) {
          if (r > Math.max(W, H)) break;
          continue;
        }
        let hit = false;
        for (const p of placed) {
          if (rect.x < p.rect.x + p.rect.w && rect.x + rect.w > p.rect.x && rect.y < p.rect.y + p.rect.h && rect.y + rect.h > p.rect.y) { hit = true; break; }
        }
        if (hit) continue;
        placed.push({ w, x, y, fs, rect });
        ok = true;
        break;
      }
      if (!ok) { failed = true; break; }
    }
    best = placed;
    if (!failed) break;
    scale *= 0.84;
  }
  apply(box, best || [], onHide);
}

function apply(box, placed, onHide) {
  if (!box._spans) box._spans = new Map();
  const seen = new Set();
  placed.forEach((p, i) => {
    let el = box._spans.get(p.w.key);
    if (!el) {
      el = document.createElement('span');
      el.className = 'new';
      el.title = 'לחיצה מסתירה את המילה';
      el.addEventListener('click', () => onHide && onHide(p.w.key));
      el.addEventListener('animationend', () => el.classList.remove('new'));
      box.appendChild(el);
      box._spans.set(p.w.key, el);
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
    }
    el.textContent = p.w.text;
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.style.fontSize = p.fs + 'px';
    el.style.color = i === 0 ? '#202C60' : COLORS[hash(p.w.key) % COLORS.length];
    seen.add(p.w.key);
  });
  for (const [k, el] of box._spans) if (!seen.has(k)) { el.remove(); box._spans.delete(k); }
}
