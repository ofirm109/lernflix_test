// ייצוא תוצאות המשחק לקובץ Excel (נטען רק כשלוחצים "ייצוא").
import ExcelJS from 'exceljs';
import { normWord, toArray, TYPES } from './common.js';

const NAVY = 'FF202C60';
const WHITE = 'FFFFFFFF';
const OK_FILL = 'FFDDF3EA';
const BAD_FILL = 'FFF9E1E6';
const NONE_FILL = 'FFEFF1F6';
const SECTION_FILL = 'FFE6F2FF';

const at = (obj, i) => (obj ? obj[i] : undefined);

function addSheet(wb, name, cols) {
  const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.h, key: c.k, width: c.w || 16 }));
  const hr = ws.getRow(1);
  hr.height = 24;
  hr.eachCell((cell) => {
    cell.font = { name: 'Arial', bold: true, color: { argb: WHITE }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true, readingOrder: 'rightToLeft' };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  ws._cols = cols;
  return ws;
}
function addRow(ws, values, opts = {}) {
  const row = ws.addRow(values);
  row.eachCell({ includeEmpty: true }, (cell, n) => {
    const c = ws._cols[n - 1] || {};
    cell.font = { name: 'Arial', size: 11, bold: !!opts.bold };
    cell.alignment = { horizontal: c.num ? 'center' : 'right', vertical: 'top', wrapText: !!c.wrap, readingOrder: 'rightToLeft' };
    if (c.fmt) cell.numFmt = c.fmt;
    if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
  });
  return row;
}
function fillCell(cell, argb) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }; }
function fmtDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * @param {object} d  { title, pin, created, items, players, scores, answers, results, subs, ratings }
 * @returns {Promise<ArrayBuffer>}
 */
export async function buildWorkbook(d) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'חידון חי';
  wb.created = new Date();
  const items = toArray(d.items);
  const players = Object.entries(d.players || {}).filter(([, p]) => p && p.name);
  const scores = d.scores || {};
  const results = d.results || {};
  const quizIdx = items.map((it, i) => (it.type === 'quiz' ? i : -1)).filter((i) => i >= 0);
  const asked = quizIdx.filter((i) => at(results, i));
  const qNo = (i) => quizIdx.indexOf(i) + 1;
  const hist = (uid, i) => { const s = scores[uid]; return s && s.hist ? at(s.hist, i) : undefined; };

  // ------------------------------------------------ סיכום
  const s1 = addSheet(wb, 'סיכום', [{ h: 'פרט', k: 'a', w: 26 }, { h: 'ערך', k: 'b', w: 80, wrap: true }]);
  addRow(s1, ['שם המשחק', d.title || '']);
  addRow(s1, ['קוד המשחק', String(d.pin || '')]);
  addRow(s1, ['תאריך המשחק', fmtDate(d.created)]);
  addRow(s1, ['תאריך הייצוא', fmtDate(Date.now())]);
  addRow(s1, ['מספר משתתפים', players.length]);
  addRow(s1, ['שאלות חידון שנשאלו', `${asked.length} מתוך ${quizIdx.length}`]);
  addRow(s1, ['פעילויות ללא תחרות', items.length - quizIdx.length]);
  addRow(s1, []);
  addRow(s1, ['פריטים במשחק', ''], { bold: true, fill: SECTION_FILL });
  items.forEach((it, i) => addRow(s1, [`${i + 1}. ${(TYPES[it.type] || {}).label || it.type}`, it.text || '']));

  // ------------------------------------------------ דירוג משתתפים
  if (quizIdx.length) {
    const s2 = addSheet(wb, 'דירוג משתתפים', [
      { h: 'מקום', k: 'r', w: 8, num: true }, { h: 'שם', k: 'n', w: 26 }, { h: 'ניקוד', k: 's', w: 12, num: true, fmt: '#,##0' },
      { h: 'תשובות נכונות', k: 'c', w: 15, num: true }, { h: 'שאלות שנענו', k: 'a', w: 14, num: true }, { h: 'אחוז הצלחה', k: 'p', w: 13, num: true, fmt: '0%' },
    ]);
    const arr = players.map(([uid, p]) => {
      let correct = 0; let answered = 0;
      asked.forEach((i) => { const hh = hist(uid, i); if (hh && hh.answered) answered++; if (hh && hh.ok) correct++; });
      return { uid, name: p.name, score: (scores[uid] && scores[uid].score) || 0, correct, answered };
    });
    arr.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'he'));
    arr.forEach((x) => {
      const rank = 1 + arr.filter((y) => y.score > x.score).length;
      const row = addRow(s2, [rank, x.name, x.score, x.correct, x.answered, asked.length ? x.correct / asked.length : 0]);
      if (rank <= 3) row.getCell(1).font = { name: 'Arial', bold: true, color: { argb: 'FF0090FF' } };
    });

    // ------------------------------------------------ תשובות משתתפים (שורה לכל משתתף ושאלה)
    const s3 = addSheet(wb, 'תשובות משתתפים', [
      { h: 'שם', k: 'n', w: 22 }, { h: 'מס׳ שאלה', k: 'q', w: 10, num: true }, { h: 'שאלה', k: 't', w: 50, wrap: true },
      { h: 'התשובה שנבחרה', k: 'a', w: 40, wrap: true }, { h: 'תוצאה', k: 'r', w: 12 }, { h: 'נקודות', k: 'p', w: 10, num: true, fmt: '#,##0' },
      { h: 'זמן תגובה (שניות)', k: 's', w: 16, num: true, fmt: '0.0' },
    ]);
    asked.forEach((i) => {
      const it = items[i];
      const opts = toArray(it.options);
      const r = at(results, i) || {};
      const ans = at(d.answers, i) || {};
      players.forEach(([uid, p]) => {
        const hh = hist(uid, i);
        const a = ans[uid];
        const c = hh && typeof hh.c === 'number' ? hh.c : a && typeof a.c === 'number' ? a.c : null;
        const did = hh ? !!hh.answered : c !== null;
        const ok = hh ? !!hh.ok : false;
        const secs = a && a.at && r.startedAt ? Math.max(0, (a.at - r.startedAt) / 1000) : null;
        const row = addRow(s3, [p.name, qNo(i), it.text || '', did && c !== null ? opts[c] || '' : '—', did ? (ok ? 'נכון' : 'לא נכון') : 'לא ענה', (hh && hh.pts) || 0, did && secs !== null ? Math.round(secs * 10) / 10 : null]);
        fillCell(row.getCell(5), did ? (ok ? OK_FILL : BAD_FILL) : NONE_FILL);
      });
    });

    // ------------------------------------------------ סטטיסטיקה לשאלות
    const maxOpts = Math.max(2, ...quizIdx.map((i) => toArray(items[i].options).length));
    const cols = [
      { h: 'מס׳', k: 'q', w: 7, num: true }, { h: 'שאלה', k: 't', w: 50, wrap: true }, { h: 'התשובה הנכונה', k: 'c', w: 32, wrap: true },
      { h: 'ענו', k: 'a', w: 8, num: true }, { h: 'ענו נכון', k: 'o', w: 10, num: true }, { h: 'אחוז נכונים', k: 'p', w: 12, num: true, fmt: '0%' },
      { h: 'זמן ממוצע (שניות)', k: 's', w: 16, num: true, fmt: '0.0' },
    ];
    for (let k = 0; k < maxOpts; k++) { cols.push({ h: `תשובה ${k + 1}`, k: 'o' + k, w: 26, wrap: true }, { h: `בחרו (${k + 1})`, k: 'n' + k, w: 10, num: true }); }
    const s4 = addSheet(wb, 'סטטיסטיקה לשאלות', cols);
    quizIdx.forEach((i) => {
      const it = items[i];
      const opts = toArray(it.options);
      const r = at(results, i);
      const correct = toArray(it.correct);
      const counts = r ? toArray(r.counts) : [];
      const ans = Object.values(at(d.answers, i) || {});
      const times = r && r.startedAt ? ans.filter((a) => a && a.at).map((a) => Math.max(0, (a.at - r.startedAt) / 1000)) : [];
      const answered = r ? r.answered || 0 : 0;
      const row = [qNo(i), it.text || '', correct.map((c) => opts[c]).join(' / '), r ? answered : 'לא נשאלה', r ? r.okCount || 0 : null,
        r && answered ? (r.okCount || 0) / answered : null, times.length ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10 : null];
      for (let k = 0; k < maxOpts; k++) row.push(opts[k] !== undefined ? opts[k] : '', opts[k] !== undefined && r ? counts[k] || 0 : null);
      const xr = addRow(s4, row);
      correct.forEach((c) => { if (c < maxOpts) fillCell(xr.getCell(8 + c * 2), OK_FILL); });
    });
  }

  // ------------------------------------------------ ענן מילים
  const clouds = items.map((it, i) => (it.type === 'wordcloud' ? i : -1)).filter((i) => i >= 0);
  if (clouds.length) {
    const ws = addSheet(wb, 'ענן מילים', [{ h: 'פעילות', k: 'q', w: 44, wrap: true }, { h: 'מילה', k: 'w', w: 28 }, { h: 'מספר פעמים', k: 'n', w: 13, num: true }]);
    clouds.forEach((i) => {
      const map = new Map();
      Object.values(at(d.subs, i) || {}).forEach((s) => {
        if (!s || !s.t) return;
        const key = normWord(s.t);
        if (!key) return;
        const cur = map.get(key) || { text: s.t.trim(), n: 0 };
        cur.n++;
        map.set(key, cur);
      });
      const rows = [...map.values()].sort((a, b) => b.n - a.n || a.text.localeCompare(b.text, 'he'));
      if (!rows.length) addRow(ws, [items[i].text, '(אין מילים)', 0]);
      rows.forEach((x) => addRow(ws, [items[i].text, x.text, x.n]));
    });
  }

  // ------------------------------------------------ דירוגים (אנונימי – רק סיכומים)
  const rates = items.map((it, i) => (it.type === 'rating' ? i : -1)).filter((i) => i >= 0);
  if (rates.length) {
    const cols = [{ h: 'פעילות', k: 'q', w: 40, wrap: true }, { h: 'קריטריון', k: 'c', w: 30, wrap: true }, { h: 'ממוצע', k: 'a', w: 10, num: true, fmt: '0.0' }, { h: 'מספר מדרגים', k: 'n', w: 13, num: true }];
    for (let v = 1; v <= 10; v++) cols.push({ h: `ציון ${v}`, k: 'v' + v, w: 8, num: true });
    const ws = addSheet(wb, 'דירוגים', cols);
    rates.forEach((i) => {
      const rows = Object.values(at(d.ratings, i) || {}).map((x) => toArray(x && x.r));
      toArray(items[i].criteria).forEach((name, k) => {
        const vals = rows.map((r) => Number(r[k])).filter((n) => n >= 1 && n <= 10);
        const histo = Array(10).fill(0);
        vals.forEach((n) => { histo[n - 1]++; });
        addRow(ws, [items[i].text, name, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, vals.length, ...histo]);
      });
    });
  }

  // ------------------------------------------------ בועות מחשבה (אנונימי)
  const bubs = items.map((it, i) => (it.type === 'bubbles' ? i : -1)).filter((i) => i >= 0);
  if (bubs.length) {
    const ws = addSheet(wb, 'בועות מחשבה', [{ h: 'פעילות', k: 'q', w: 40, wrap: true }, { h: 'תשובה', k: 't', w: 70, wrap: true }, { h: 'שעה', k: 'h', w: 10 }]);
    bubs.forEach((i) => {
      const list = Object.entries(at(d.subs, i) || {}).filter(([, s]) => s && s.t).sort((a, b) => (a[0] < b[0] ? -1 : 1));
      if (!list.length) addRow(ws, [items[i].text, '(אין תשובות)', '']);
      list.forEach(([, s]) => addRow(ws, [items[i].text, s.t, s.at ? new Date(s.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '']));
    });
  }

  return wb.xlsx.writeBuffer();
}

window.LiveQuizExport = { buildWorkbook };
