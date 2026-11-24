// לוח המשחק (מסך המרצה / מקרן): לובי עם QR, שאלות, חשיפת תשובה, טבלת מובילים, פעילויות ופודיום.
import qrcode from 'qrcode-generator';
import { store, friendlyError } from './store.js';
import {
  h, icon, shape, TYPES, toArray, prepareItem, itemProblems, publicItem, calcPoints, normWord, genPin, fmt, pageUrl,
  baseDisplayUrl, confirmDialog, demoBanner, logo, qrSvg, medalSvg, NEXT_KEYS, isLong, fitText, fitGroup, fitBalanced, lightbox, toast,
} from './common.js';
import { renderCloud } from './wordcloud.js';
import { installUnlock, unlock, sfx, music, setMuted, isMuted, isLocked, onSoundChange, consumeGestureUnlock } from './sound.js';
import { confetti } from './confetti.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
let unitId = params.get('unit');
let hostKey = params.get('k');
let pin = params.get('game');

const G = {
  meta: null, items: [], state: null, key: null, players: {}, scores: {},
  phaseUnsub: [], timer: null, ending: false, lastAdvance: 0, hidden: new Set(), chips: new Map(),
  images: {}, fits: [], results: {}, lastBack: 0,
};

/** טעינת התמונות של הפריטים (רק ללוח) */
async function loadImages(items) {
  const out = {};
  await Promise.all(items.map(async (it, i) => {
    if (!it.image) return;
    try { const v = await store.get('images/' + it.image); if (v) out[i] = v; } catch (e) { console.warn('image', e); }
  }));
  return out;
}
let headEl, stageEl, footEl, joinBoxEl;

// ================================================================ אתחול
// קישור המרצה (?k=…) מאפשר להפעיל משחק בלי להתחבר: המפתח הסודי פותח את "חבילת ההפעלה" של היחידה.
async function boot() {
  await store.authReady;
  // קישור ישן לפי יחידה (רק למרצה מחובר) – ממירים לקישור עם מפתח
  if (!hostKey && unitId && store.isAdmin()) {
    hostKey = await store.get(`units/${unitId}/hostKey`);
  }
  if (!hostKey) return renderError('הקישור לא שלם', 'פתחו את המשחק מתוך ממשק העורך, או בקשו מהמרצה את "קישור להפעלה".');
  let uid;
  try { uid = await store.ensureUser(); } catch (e) { return renderError('לא הצלחנו להתחבר', friendlyError(e)); }
  const pack = await store.get(`hostpack/${hostKey}`);
  if (!pack || !pack.unitId) return renderError('הקישור כבר לא פעיל', 'ייתכן שנוצר למשחקון קישור מרצה חדש או שהיחידה נמחקה. בקשו את הקישור העדכני מממשק העורך.');
  unitId = pack.unitId;
  let resumed = false;
  if (pin) {
    const g = await store.get(`games/${pin}`);
    if (g && g.meta && g.meta.unitId === unitId && (g.meta.host === uid || store.isAdmin())) {
      try {
        const sec = await store.get(`secret/${pin}`);
        G.items = toArray(sec && sec.items).map(prepareItem);
        G.images = await loadImages(G.items);
        G.meta = g.meta;
        resumed = G.items.length > 0;
      } catch (e) { console.warn('resume failed', e); }
    }
  }
  if (!resumed) { const ok = await createGame(pack, uid); if (!ok) return; }
  startBoard();
}

function renderError(title, text) {
  app.replaceChildren(demoBanner(store) || '', h('div', { class: 'center-screen' }, h('div', { class: 'card b-error' },
    logo(), h('h2', { style: { marginTop: '20px' } }, title), h('p', null, text),
    h('a', { class: 'btn btn-ghost btn-lg', href: 'editor.html' + (unitId ? '#u=' + encodeURIComponent(unitId) : '') }, 'לממשק העורך'))));
}

async function createGame(pack, uid) {
  const items = toArray(pack.items).map(prepareItem).filter((it) => !itemProblems(it).length);
  if (!items.length) { renderError('אין ביחידה פריטים מוכנים', 'הוסיפו לפחות שאלה או פעילות אחת (שלמה) בממשק העורך ונסו שוב.'); return false; }
  let p = genPin();
  for (let i = 0; i < 8; i++) { if (!(await store.get(`games/${p}/meta`))) break; p = genPin(); }
  pin = p;
  G.items = items;
  G.images = await loadImages(items);
  // גרסה קטנה של התמונות לטלפונים (רק לשאלות שסומן בהן "להציג גם בטלפונים")
  const media = {};
  items.forEach((it, i) => { if (G.images[i] && it.imgPhone !== false) media[i] = G.images[i].small || G.images[i].data; });
  G.meta = {
    unitId, title: pack.title || '', created: store.TS, host: uid,
    kinds: items.map((it) => it.type), hasQuiz: items.some((it) => it.type === 'quiz'),
  };
  await store.update('', {
    [`secret/${pin}`]: { items, key: hostKey },
    [`games/${pin}`]: { meta: G.meta, state: { phase: 'lobby', index: -1 }, media: Object.keys(media).length ? media : null },
    [`live/${unitId}`]: pin,
  });
  history.replaceState(null, '', `?k=${encodeURIComponent(hostKey)}&game=${pin}`);
  return true;
}

// ================================================================ מעטפת הלוח
function startBoard() {
  const joinUrl = pageUrl('index.html', { pin });
  joinBoxEl = h('div', { class: 'b-join', hidden: true },
    h('div', { class: 'txt' }, 'הצטרפות באמצע?', h('b', { class: 'ltr' }, pinFmt(pin))),
    h('div', { class: 'qr-mini', html: qrSvg(qrcode, joinUrl) }));
  headEl = h('header', { class: 'b-head' },
    logo(),
    h('div', { class: 'titles' }, h('div', { class: 't' }, G.meta.title)),
    joinBoxEl,
    h('div', { class: 'tools' },
      soundBtn(),
      h('button', { class: 'btn btn-icon', title: 'ייצוא התוצאות עד עכשיו לאקסל', onclick: exportExcel }, icon('download')),
      h('button', { class: 'btn btn-icon', title: 'מסך מלא (F)', onclick: toggleFull }, icon('full')),
      store.isAdmin() ? h('a', { class: 'btn btn-icon', title: 'חזרה לעורך', href: 'editor.html#u=' + encodeURIComponent(unitId) }, icon('edit')) : null));
  stageEl = h('main', { class: 'b-stage' });
  footEl = h('footer', { class: 'b-foot' });
  app.replaceChildren(demoBanner(store) || '', h('div', { class: 'board-wrap' }, headEl, stageEl, footEl));
  if (store.mode === 'demo') document.querySelector('.board-wrap').style.height = 'calc(100vh - 34px)';

  installUnlock();
  store.on(`games/${pin}/state`, onState);
  store.on(`games/${pin}/players`, (v) => { G.players = v || {}; onPlayers(); });
  store.on(`games/${pin}/scores`, (v) => { G.scores = v || {}; });
  store.on(`games/${pin}/results`, (v) => { G.results = v || {}; });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, .modal')) return;
    if (NEXT_KEYS.has(e.key)) { e.preventDefault(); advance(); }
    else if (e.key === 'PageUp' || e.key === 'Backspace') { e.preventDefault(); goBack(); }
    else if (e.key === 'f' || e.key === 'F' || e.key === 'כ') toggleFull();
    else if (e.key === 'm' || e.key === 'M' || e.key === 'צ') setMuted(!isMuted());
  });
  window.addEventListener('resize', () => { if (G.onResize) G.onResize(); runFits(); });
  if (document.fonts) document.fonts.ready.then(runFits);
}
const VOL_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="1.25em" height="1.25em"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
const VOL_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="1.25em" height="1.25em"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
function soundBtn() {
  const tip = h('span', { class: 'sound-tip' });
  const btn = h('button', {
    class: 'btn btn-icon sound-btn', type: 'button',
    onclick: () => {
      // אם הלחיצה הזו היא זו ששחררה את הסאונד – לא משתיקים מיד
      if (consumeGestureUnlock() && !isMuted()) return;
      if (isLocked()) unlock();
      setMuted(!isMuted());
    },
  });
  const upd = () => {
    const locked = isLocked() && !isMuted();
    btn.innerHTML = isMuted() ? VOL_OFF : VOL_ON;
    btn.classList.toggle('locked', locked);
    btn.title = locked ? 'לחצו כדי להפעיל סאונד' : isMuted() ? 'הפעלת סאונד (M)' : 'השתקה (M)';
    tip.textContent = locked ? 'להפעלת סאונד' : '';
  };
  onSoundChange(upd);
  upd();
  return h('div', { class: 'row', style: { gap: '6px' } }, tip, btn);
}
// ---------------------------------------------------------------- ייצוא לאקסל
function loadExportLib() {
  if (window.LiveQuizExport) return Promise.resolve();
  return new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'js/export.js';
    sc.onload = () => res();
    sc.onerror = () => rej(new Error('network'));
    document.head.appendChild(sc);
  });
}
async function exportExcel() {
  const btn = document.getElementById('export');
  const oldTxt = btn && btn.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = 'מכינים את הקובץ…'; }
  try {
    await loadExportLib();
    const g = (await store.get(`games/${pin}`)) || {};
    const buf = await window.LiveQuizExport.buildWorkbook({
      title: G.meta.title, pin, created: g.meta && g.meta.created, items: G.items,
      players: g.players, scores: g.scores, answers: g.answers, results: g.results, subs: g.subs, ratings: g.ratings,
    });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const name = `תוצאות - ${(G.meta.title || 'משחק').replace(/[\\/:*?"<>|]/g, ' ').trim()} - ${date}.xlsx`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('קובץ האקסל ירד למחשב', 'ok');
  } catch (e) {
    console.error(e);
    toast('הייצוא נכשל – ' + friendlyError(e), 'bad');
  }
  if (btn) { btn.disabled = false; btn.innerHTML = oldTxt; }
}

function pinFmt(p) { return String(p).replace(/(\d{3})(\d{3})/, '$1 $2'); }
function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
}

function onState(st) {
  G.state = st || { phase: 'lobby', index: -1 };
  const key = G.state.phase + ':' + G.state.index;
  if (key !== G.key) { G.key = key; enterPhase(); }
  else if (G.onStateUpdate) G.onStateUpdate();
  renderFoot();
}

function runFits() { G.fits.forEach((f) => { try { f(); } catch (e) { console.warn(e); } }); }
function addFit(fn) { G.fits.push(fn); requestAnimationFrame(() => requestAnimationFrame(fn)); }
/** מחלקות פריסה לפי אורך השאלה והתשובות – כדי לחלק את המקום בלוח בצורה הוגנת */
function lengthClasses(it) {
  const lq = (it.text || '').length;
  const lo = Math.max(0, ...it.options.map((o) => o.length + (o.includes('\n') ? 80 : 0)));
  return (lo > 140 ? ' long-opts' : '') + (lo > 400 ? ' xl-opts' : '') + (lq > 140 || (it.text || '').includes('\n') ? ' long-q' : '');
}
/** התאמת גופן לשאלה ולתשובות. כשהתשובות ארוכות הן מתחלקות במקום עם השאלה, ולכן מאזנים ביניהן */
function fitQuestion(view, qText, optEls) {
  if (view.classList.contains('long-opts')) { fitBalanced(qText, optEls); fitOptions(optEls); }
  else { fitText(qText, 13); fitOptions(optEls); }
}
/** התאמת גופן לתשובות; אם גם בגודל המינימלי לא נכנס – גלילה בתוך התשובה במקום לחתוך */
function fitOptions(els) {
  els.forEach((e) => e.classList.remove('scroll'));
  fitGroup(els, 12);
  els.forEach((e) => { if (e.scrollHeight > e.clientHeight + 2) e.classList.add('scroll'); });
}
function mediaEl(i, cls) {
  const im = G.images[i];
  if (!im) return null;
  return h('div', { class: cls }, h('img', { src: im.data, alt: 'תמונת השאלה', title: 'לחיצה להגדלה', onclick: () => lightbox(im.data) }));
}

function cleanupPhase() {
  G.fits = [];
  G.phaseUnsub.forEach((u) => u());
  G.phaseUnsub = [];
  clearInterval(G.timer);
  G.timer = null;
  G.onResize = null;
  G.onStateUpdate = null;
  G.onPlayersUpdate = null;
  G.ending = false;
}

function enterPhase() {
  cleanupPhase();
  const st = G.state;
  joinBoxEl.hidden = st.phase === 'lobby' || st.phase === 'end';
  let view;
  if (st.phase === 'lobby') view = lobbyView();
  else if (st.phase === 'question') view = questionView();
  else if (st.phase === 'reveal') view = revealView();
  else if (st.phase === 'leaderboard') view = leaderboardView();
  else if (st.phase === 'activity') view = activityView();
  else if (st.phase === 'end') view = endView();
  stageEl.replaceChildren(view || '');
  phaseSound(st);
}
function phaseSound(st) {
  const it = G.items[st.index];
  if (st.phase === 'lobby') music('lobby');
  else if (st.phase === 'question') { music('question'); sfx('start'); }
  else if (st.phase === 'reveal') { music(null); sfx('reveal'); }
  else if (st.phase === 'leaderboard') { music(null); sfx('leaderboard'); }
  else if (st.phase === 'activity') { music('calm'); sfx('softStart'); }
  else if (st.phase === 'end') { music(null); sfx(G.meta.hasQuiz && toArray(st.top).length ? 'finale' : 'thanks'); }
  return it;
}

const realPlayers = () => Object.entries(G.players || {}).filter(([, p]) => p && p.name);
const onlineCount = () => realPlayers().filter(([, p]) => p.online).length;
const playerCount = () => realPlayers().length;
function onPlayers() {
  if (G.onPlayersUpdate) G.onPlayersUpdate();
}

// ================================================================ פוטר וניווט
function nextLabel() {
  const st = G.state;
  const i = st.index;
  const isLast = i >= G.items.length - 1;
  const nextKind = G.items[i + 1] && G.items[i + 1].type;
  const toNext = isLast ? (G.meta.hasQuiz ? 'לתוצאות הסופיות' : 'לסיום') : nextKind === 'quiz' ? 'לשאלה הבאה' : 'לפעילות הבאה';
  switch (st.phase) {
    case 'lobby': return Object.keys(G.results || {}).length ? 'המשך המשחק' : 'התחלת המשחק';
    case 'question': return 'חשיפת התשובה';
    case 'reveal': return isLast ? 'לתוצאות הסופיות' : (G.items[i].points === 0 ? toNext : 'לטבלת המובילים');
    case 'leaderboard': return toNext;
    case 'activity': return toNext;
    default: return null;
  }
}
function renderFoot() {
  const st = G.state;
  const label = nextLabel();
  const kinds = G.meta.kinds || G.items.map((x) => x.type);
  const dots = h('div', { class: 'dots', 'aria-hidden': 'true' }, kinds.map((k, j) => h('i', {
    class: (k === 'quiz' ? 'quiz ' : '') + (j < st.index ? 'done' : j === st.index ? 'cur' : ''), title: TYPES[k].label,
  })));
  let progText = 'ממתינים למשתתפים';
  if (st.phase === 'end') progText = 'המשחק הסתיים';
  else if (st.index >= 0) progText = `פריט ${st.index + 1} מתוך ${G.items.length}`;

  const secondary = h('div', { class: 'secondary' });
  if (st.phase === 'activity') {
    secondary.append(h('button', { class: 'btn btn-ghost', onclick: () => store.update(`games/${pin}/state`, { closed: !st.closed }) },
      st.closed ? icon('refresh') : icon('stop'), st.closed ? 'פתיחת התגובות מחדש' : 'עצירת התגובות'));
  }
  if (st.phase === 'lobby' && store.mode === 'demo') {
    secondary.append(h('a', { class: 'btn btn-ghost', href: pageUrl('index.html', { pin }), target: '_blank', rel: 'noopener' }, icon('phone'), 'פתיחת מסך משתתף לבדיקה'));
  }
  if (st.phase === 'end') {
    secondary.append(
      h('button', { class: 'btn btn-blue btn-lg', id: 'export', onclick: exportExcel }, icon('download'), 'ייצוא התוצאות לאקסל'),
      h('a', { class: 'btn btn-ghost btn-lg', href: pageUrl('host.html', { k: hostKey }) }, icon('refresh'), 'משחק חדש'),
      store.isAdmin() ? h('a', { class: 'btn btn-ghost btn-lg', href: 'editor.html#u=' + encodeURIComponent(unitId) }, icon('edit'), 'חזרה לעורך') : '');
  }
  const kids = [
    h('div', { class: 'prog' }, dots, h('span', null, progText)),
    secondary,
    label ? h('span', { class: 'hint-k' }, 'אפשר גם ', h('kbd', null, 'רווח'), ' או שלט מצגות') : h('span', { class: 'grow' }),
  ];
  if (st.phase !== 'lobby') {
    kids.push(h('button', { class: 'btn btn-ghost back-btn', onclick: goBack, id: 'back', title: 'חזרה לשלב הקודם (PageUp)' },
      icon('arrowRight', 'arr'), st.phase === 'question' ? 'ביטול השאלה' : 'הקודם'));
  }
  if (label) {
    kids.push(h('button', { class: 'btn btn-primary next-btn' + (st.phase === 'lobby' && playerCount() > 0 ? ' pulse' : ''), onclick: advance, id: 'next' },
      label, icon('arrowLeft', 'arr')));
  }
  footEl.replaceChildren(...kids);
}

async function advance() {
  const now = Date.now();
  if (now - G.lastAdvance < 700) return;
  G.lastAdvance = now;
  const st = G.state;
  const i = st.index;
  if (st.phase === 'lobby') {
    if (!playerCount()) {
      const ok = await confirmDialog({ title: 'עדיין אף אחד לא הצטרף', text: 'להתחיל בכל זאת? משתתפים יוכלו להצטרף גם באמצע.', ok: 'להתחיל', cancel: 'לחכות עוד' });
      if (!ok) return;
    }
    return goTo(0);
  }
  if (st.phase === 'question') return endQuestion();
  if (st.phase === 'reveal') {
    if (i >= G.items.length - 1) return finish();
    if (G.items[i].points === 0) return goTo(i + 1);
    return store.update(`games/${pin}/state`, { phase: 'leaderboard' });
  }
  if (st.phase === 'leaderboard' || st.phase === 'activity') {
    if (i + 1 >= G.items.length) return finish();
    return goTo(i + 1);
  }
}

async function goTo(i) {
  const it = G.items[i];
  const quizIdx = G.items.map((x, j) => (x.type === 'quiz' ? j : -1)).filter((j) => j >= 0);
  const pub = publicItem(it);
  if (!G.images[i]) { delete pub.hasImage; delete pub.imgPhone; }
  const base = { index: i, item: pub, qNo: quizIdx.indexOf(i) + 1, qTotal: quizIdx.length };
  if (it.type === 'quiz' && G.results[i]) {
    // שאלה שכבר נשאלה – מציגים את התוצאות שנשמרו (לא שואלים מחדש)
    return showReveal(i);
  }
  if (it.type === 'quiz') {
    G.localStart = store.now();
    await store.set(`games/${pin}/state`, { ...base, phase: 'question', startedAt: store.TS });
  } else {
    await store.set(`games/${pin}/state`, { ...base, phase: 'activity', closed: false });
  }
}

function baseFor(i) {
  const it = G.items[i];
  const quizIdx = G.items.map((x, j) => (x.type === 'quiz' ? j : -1)).filter((j) => j >= 0);
  const pub = publicItem(it);
  if (!G.images[i]) { delete pub.hasImage; delete pub.imgPhone; }
  return { index: i, item: pub, qNo: quizIdx.indexOf(i) + 1, qTotal: quizIdx.length };
}
async function showReveal(i) {
  const r = G.results[i] || {};
  await store.set(`games/${pin}/state`, {
    ...baseFor(i), phase: 'reveal', review: true,
    correct: r.correct || null, counts: r.counts || null, okCount: r.okCount || 0, answered: r.answered || 0, players: r.players || 0, top: r.top || null,
  });
}
async function showLeaderboard(i) {
  const r = G.results[i] || {};
  await store.set(`games/${pin}/state`, { ...baseFor(i), phase: 'leaderboard', review: true, top: r.top || null });
}
/** השלב האחרון של פריט (כדי לחזור אליו אחורה) */
function lastStepOf(j) {
  const it = G.items[j];
  if (it.type !== 'quiz') return goTo(j);
  if (!G.results[j]) return goTo(j);
  if (j < G.items.length - 1 && it.points !== 0) return showLeaderboard(j);
  return showReveal(j);
}
function stepBefore(i) {
  if (i <= 0) return store.set(`games/${pin}/state`, { phase: 'lobby', index: -1 });
  return lastStepOf(i - 1);
}
/** חזרה אחורה – שום מידע לא נמחק (חוץ משאלה שבוטלה באמצע) */
async function goBack() {
  const now = Date.now();
  if (now - G.lastBack < 600 || now - G.lastAdvance < 400) return;
  G.lastBack = now;
  const st = G.state;
  const i = st.index;
  if (st.phase === 'lobby') return;
  if (st.phase === 'question') {
    const n = Object.keys((await store.get(`games/${pin}/answers/${i}`)) || {}).length;
    const ok = await confirmDialog({
      title: 'לבטל את השאלה ולחזור?',
      text: n ? `${n} תשובות שכבר נשלחו לשאלה הזו יימחקו. כשתגיעו אליה שוב היא תתחיל מההתחלה.` : 'כשתגיעו לשאלה הזו שוב היא תתחיל מההתחלה.',
      ok: 'ביטול השאלה וחזרה', cancel: 'להמשיך בשאלה',
    });
    if (!ok || G.state.phase !== 'question' || G.state.index !== i) return;
    G.ending = true;
    clearInterval(G.timer);
    await store.update(`games/${pin}`, { [`answers/${i}`]: null });
    return stepBefore(i);
  }
  if (st.phase === 'leaderboard') return showReveal(i);
  if (st.phase === 'reveal' || st.phase === 'activity') return stepBefore(i);
  if (st.phase === 'end') return lastStepOf(G.items.length - 1);
}

function rankList(scores) {
  const arr = realPlayers().map(([uid]) => ({
    uid, name: (G.players[uid] && G.players[uid].name) || '—', score: (scores[uid] && scores[uid].score) || 0,
    prevRank: (scores[uid] && scores[uid].rank) || null, last: scores[uid] && scores[uid].last,
  }));
  arr.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'he'));
  arr.forEach((x) => { x.rank = 1 + arr.filter((y) => y.score > x.score).length; });
  return arr;
}

async function endQuestion() {
  const st = G.state;
  if (G.ending || st.phase !== 'question') return;
  G.ending = true;
  clearInterval(G.timer);
  const i = st.index;
  const it = G.items[i];
  try {
    const [ans, stNow, scoresNow, players] = await Promise.all([
      store.get(`games/${pin}/answers/${i}`), store.get(`games/${pin}/state`), store.get(`games/${pin}/scores`), store.get(`games/${pin}/players`),
    ]);
    G.players = players || {};
    const started = (stNow && stNow.startedAt) || G.localStart || store.now();
    const limit = started + it.time * 1000 + 1500;
    const counts = it.options.map(() => 0);
    const prev = scoresNow || {};
    const next = {};
    let okCount = 0;
    let answered = 0;
    for (const [uid] of realPlayers()) {
      const a = ans && ans[uid];
      const p = prev[uid] || {};
      let ok = false; let pts = 0; let did = false; let c = null;
      if (a && typeof a.c === 'number' && a.c >= 0 && a.c < it.options.length && (!a.at || a.at <= limit)) {
        did = true; c = a.c; counts[c]++; answered++;
        ok = it.correct.includes(c);
        if (ok) { okCount++; pts = calcPoints(Math.max(0, (a.at || started) - started), it.time, it.points); }
      }
      const hist = { ...(p.hist && typeof p.hist === 'object' ? Object.fromEntries(Object.entries(p.hist).filter(([, v]) => v)) : {}) };
      hist[i] = { ok, pts, answered: did, c };
      next[uid] = { score: (p.score || 0) + pts, rank: p.rank || null, last: { i, ok, pts, answered: did, c }, hist };
    }
    const ranked = rankList(next);
    ranked.forEach((x) => { next[x.uid].prevRank = next[x.uid].rank; next[x.uid].rank = x.rank; next[x.uid].hist[i].rank = x.rank; });
    const top = ranked.slice(0, 5).map((x) => ({ uid: x.uid, name: x.name, score: x.score, rank: x.rank, prevRank: x.prevRank }));
    // עדכון חלקי של state – כך הטלפונים מקבלים רק את מה שהשתנה (חוסך תעבורה)
    await store.update(`games/${pin}`, {
      scores: next,
      [`results/${i}`]: { correct: it.correct, counts, okCount, answered, players: playerCount(), top, startedAt: started },
      'state/phase': 'reveal', 'state/correct': it.correct, 'state/counts': counts, 'state/okCount': okCount,
      'state/answered': answered, 'state/players': playerCount(), 'state/top': top,
    });
  } catch (e) {
    console.error(e);
    G.ending = false;
  }
}

async function finish() {
  const scores = (await store.get(`games/${pin}/scores`)) || {};
  G.players = (await store.get(`games/${pin}/players`)) || {};
  const ranked = rankList(scores);
  const top = ranked.slice(0, 10).map((x) => ({ uid: x.uid, name: x.name, score: x.score, rank: x.rank }));
  const finalRanks = {};
  ranked.forEach((x) => { finalRanks[`scores/${x.uid}/final`] = x.rank; });
  await store.update(`games/${pin}`, { ...finalRanks, state: { phase: 'end', index: G.items.length, top, players: ranked.length } });
}

// ================================================================ לובי
function lobbyView() {
  const joinUrl = pageUrl('index.html', { pin });
  const count = h('span', { class: 'big-count' }, '0');
  const chips = h('div', { class: 'chips' });
  const waiting = h('div', { class: 'waiting-note' }, 'השמות של מי שמצטרף יופיעו כאן');
  G.chips = new Map();
  let lobbyReady = false;
  const step = (n, t) => h('div', null, h('i', null, String(n)), t);
  const view = h('div', { class: 'lobby phase-in' },
    h('section', { class: 'lobby-hero' },
      h('div', { class: 'kicker' }, 'ברוכים הבאים למשחק'),
      h('h1', null, G.meta.title),
      h('div', { class: 'join-steps' },
        step(1, 'סורקים את הקוד במצלמת הטלפון'),
        step(2, 'מקלידים שם או כינוי'),
        step(3, 'עונים מהטלפון – ועוקבים כאן על הלוח')),
      h('div', { class: 'join-url' },
        h('div', null, h('div', { class: 'lbl' }, 'בלי מצלמה? נכנסים לכתובת'), h('div', { class: 'u ltr' }, baseDisplayUrl())),
        h('div', null, h('div', { class: 'lbl' }, 'ומקלידים את קוד המשחק'), h('div', { class: 'pin ltr' }, pinFmt(pin))))),
    h('section', { class: 'lobby-side' },
      h('div', { class: 'card qr-card', html: qrSvg(qrcode, joinUrl), 'aria-label': 'קוד QR להצטרפות' }),
      h('div', { class: 'card players-card' },
        h('div', { class: 'ph' }, icon('users'), h('h3', null, 'משתתפים שהצטרפו'), count),
        chips, waiting,
        h('div', { class: 'muted', style: { fontSize: '13px', marginTop: '8px' } }, 'לחיצה על שם מסירה את המשתתף מהמשחק'))));
  G.onPlayersUpdate = () => {
    const entries = realPlayers().sort((a, b) => (a[1].joined || 0) - (b[1].joined || 0));
    count.textContent = fmt(entries.length);
    waiting.hidden = entries.length > 0;
    const seen = new Set();
    for (const [uid, p] of entries) {
      seen.add(uid);
      let el = G.chips.get(uid);
      if (!el) {
        el = h('button', { class: 'chip-name', title: 'הסרה מהמשחק', onclick: () => kick(uid) });
        G.chips.set(uid, el);
        chips.appendChild(el);
        if (lobbyReady) sfx('join', null, 90);
      }
      el.textContent = p.name;
      el.classList.toggle('off', !p.online);
    }
    for (const [uid, el] of G.chips) if (!seen.has(uid)) { el.remove(); G.chips.delete(uid); }
    renderFoot();
  };
  G.onPlayersUpdate();
  lobbyReady = true;
  return view;
}
async function kick(uid) {
  const p = G.players[uid];
  if (!p) return;
  const ok = await confirmDialog({ title: `להסיר את "${p.name}"?`, text: 'המשתתף יוסר מהמשחק ולא יוכל להצטרף שוב עם אותו מכשיר.', ok: 'הסרה', danger: true });
  if (!ok) return;
  await store.update(`games/${pin}`, { [`players/${uid}`]: null, [`kicked/${uid}`]: true });
}

// ================================================================ שאלה
function timerEl() {
  const C = 2 * Math.PI * 44;
  const wrap = h('div', { class: 'timer', role: 'timer' });
  wrap.innerHTML = `<svg viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="44"/><circle class="val" cx="50" cy="50" r="44" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg><div class="num"></div>`;
  wrap.set = (left, total) => {
    wrap.querySelector('.val').style.strokeDashoffset = String(C * (1 - left / total));
    wrap.querySelector('.num').textContent = String(Math.ceil(left / 1000));
    wrap.classList.toggle('low', left <= 5000);
  };
  return wrap;
}
function qCountLine(it, st) {
  const extra = it.points === 2 ? ' · ניקוד כפול!' : it.points === 0 ? ' · שאלת תרגול, ללא ניקוד' : '';
  return h('div', { class: 'q-count' }, `שאלה ${st.qNo} מתוך ${st.qTotal}${extra}`);
}
function questionView() {
  const st = G.state;
  const i = st.index;
  const it = G.items[i];
  const tm = timerEl();
  const cnt = h('b', null, '0');
  const ofEl = h('span', null, 'ענו');
  const qText = h('div', { class: 'card q-text' + (isLong(it.text) ? ' long' : '') }, it.text);
  const optEls = it.options.map((o, k) => h('div', { class: `q-opt opt-c${k}` }, shape(k), h('span', { class: 'txt' }, o)));
  const media = mediaEl(i, 'q-media');
  const view = h('div', { class: 'phase-in q-wrap' + (media ? ' has-img' : '') + lengthClasses(it), style: { display: 'flex', flexDirection: 'column', height: '100%' } },
    qCountLine(it, st),
    h('div', { class: 'q-top' }, tm, media ? h('div', { class: 'q-center' }, qText, media) : qText, h('div', { class: 'ans-count' }, cnt, ofEl)),
    h('div', { class: 'q-opts' + (it.options.length <= 2 ? ' two' : '') + ' n' + it.options.length }, optEls));
  addFit(() => fitQuestion(view, qText, optEls));
  const total = it.time * 1000;
  let lastSec = null;
  const tick = () => {
    const started = (G.state && G.state.startedAt) || G.localStart || store.now();
    const left = Math.max(0, started + total - store.now());
    tm.set(left, total);
    const sec = Math.ceil(left / 1000);
    if (sec !== lastSec) { if (lastSec !== null && sec > 0 && sec <= 5) sfx('tick', sec); lastSec = sec; }
    if (left <= 0) endQuestion();
  };
  tick();
  G.timer = setInterval(tick, 200);
  let answers = {};
  let prevN = null;
  const check = () => {
    const n = Object.keys(answers).filter((u) => G.players[u] && G.players[u].name).length;
    if (prevN !== null && n > prevN) sfx('answer', null, 70);
    prevN = n;
    const on = onlineCount();
    cnt.textContent = fmt(n);
    ofEl.textContent = `מתוך ${fmt(on)} ענו`;
    if (on > 0 && n >= on) setTimeout(() => { if (G.key === `question:${i}`) endQuestion(); }, 800);
  };
  G.phaseUnsub.push(store.on(`games/${pin}/answers/${i}`, (v) => { answers = v || {}; check(); }));
  G.onPlayersUpdate = check;
  return view;
}

// ================================================================ חשיפה
function revealView() {
  const st = G.state;
  const it = G.items[st.index];
  const counts = toArray(st.counts);
  const correct = toArray(st.correct);
  const maxC = Math.max(1, ...counts);
  const bars = [];
  const qText = h('div', { class: 'card q-text small' + (isLong(it.text) ? ' long' : '') }, it.text);
  const optEls = [];
  const view = h('div', { class: 'reveal phase-in' + lengthClasses(it), style: { display: 'flex', flexDirection: 'column', height: '100%' } },
    qCountLine(it, st),
    qText,
    h('div', { class: 'q-opts' + (it.options.length <= 2 ? ' two' : '') + ' n' + it.options.length, style: { marginTop: '2.2vh' } }, it.options.map((o, k) => {
      const right = correct.includes(k);
      const bar = h('i', { class: 'bar', style: { width: '0%' } });
      bars.push([bar, ((counts[k] || 0) / maxC) * 100]);
      const el = h('div', { class: `q-opt opt-c${k} ${right ? 'right' : 'wrong'}` },
        right ? h('span', { class: 'tick' }, icon('check')) : shape(k),
        h('span', { class: 'txt' }, o),
        h('span', { class: 'cnt', title: 'מספר העונים' }, fmt(counts[k] || 0)),
        bar);
      optEls.push(el);
      return el;
    })),
    h('div', { class: 'reveal-sum' },
      h('span', { class: 'pill pill-ok' }, icon('checkThin'), `${fmt(st.okCount || 0)} ענו נכון`),
      h('span', { class: 'pill' }, `${fmt(st.answered || 0)} מתוך ${fmt(st.players || 0)} ענו`)));
  requestAnimationFrame(() => requestAnimationFrame(() => bars.forEach(([b, w]) => { b.style.width = w + '%'; })));
  addFit(() => fitQuestion(view, qText, optEls));
  return view;
}

// ================================================================ טבלת מובילים
function moveBadge(x) {
  if (!x.prevRank) return h('span', { class: 'mv same' }, '');
  const d = x.prevRank - x.rank;
  if (d > 0) return h('span', { class: 'mv up' }, `▲${d}`);
  if (d < 0) return h('span', { class: 'mv down' }, `▼${-d}`);
  return h('span', { class: 'mv same' }, '—');
}
function leaderboardView() {
  const st = G.state;
  const top = toArray(st.top);
  const max = Math.max(1, ...top.map((x) => x.score));
  const fills = [];
  const view = h('div', { class: 'lb phase-in' },
    h('h2', null, h('small', null, `אחרי שאלה ${st.qNo} מתוך ${st.qTotal}`), 'טבלת המובילים'),
    top.length ? h('div', { class: 'lb-rows' }, top.map((x, j) => {
      const fill = h('i');
      fills.push([fill, (x.score / max) * 100]);
      return h('div', { class: 'lb-row', style: { animationDelay: `${0.12 * j}s` } },
        h('span', { class: 'rk' }, String(x.rank)),
        moveBadge(x),
        h('div', { class: 'mid' }, h('span', { class: 'nm' }, x.name), h('div', { class: 'barwrap' }, fill)),
        h('span', { class: 'sc' }, fmt(x.score)));
    })) : h('div', { class: 'lb-empty' }, 'עדיין אין משתתפים בטבלה'));
  requestAnimationFrame(() => requestAnimationFrame(() => fills.forEach(([f, w]) => { f.style.width = w + '%'; })));
  return view;
}

// ================================================================ פעילויות (ללא תחרות)
function actHead(it, countBox) {
  const t = TYPES[it.type];
  const closedBadge = h('span', { class: 'pill closed-badge', hidden: !G.state.closed }, 'התגובות נעצרו');
  G.onStateUpdate = () => { closedBadge.hidden = !G.state.closed; };
  const qText = h('div', { class: 'card q-text small act-q' + (isLong(it.text) ? ' long' : '') }, it.text);
  addFit(() => fitText(qText, 14));
  return h('div', { class: 'act-head' },
    h('div', { class: 'act-type', style: `--tc:${t.color}` }, icon(t.icon), h('div', null, t.label, h('div', null, closedBadge))),
    qText,
    mediaEl(G.state.index, 'act-thumb'),
    countBox);
}
function countBox(label) {
  const b = h('b', null, '0');
  const s = h('span', null, label);
  const el = h('div', { class: 'act-count' }, b, s);
  el.set = (n, lbl) => { b.textContent = fmt(n); if (lbl) s.textContent = lbl; };
  return el;
}
function emptyState(ic, text) {
  return h('div', { class: 'act-empty' }, h('div', null, icon(ic), text));
}

function activityView() {
  const st = G.state;
  const i = st.index;
  const it = G.items[i];
  if (it.type === 'wordcloud') return wordcloudView(it, i);
  if (it.type === 'rating') return ratingView(it, i);
  return bubblesView(it, i);
}

function wordcloudView(it, i) {
  const cb = countBox('משתתפים');
  const cloud = h('div', { class: 'cloud' });
  const empty = emptyState('cloud', 'מחכים למילים הראשונות…');
  const view = h('div', { class: 'phase-in', style: { display: 'flex', flexDirection: 'column', height: '100%' } },
    actHead(it, cb),
    h('div', { class: 'act-body' }, cloud, empty, h('div', { class: 'mod-hint' }, 'לחיצה על מילה מסתירה אותה')));
  let subs = {};
  const draw = () => {
    const map = new Map();
    for (const s of Object.values(subs)) {
      if (!s || !s.t) continue;
      const key = normWord(s.t);
      if (!key || G.hidden.has('w:' + key)) continue;
      const cur = map.get(key) || { key, text: s.t.trim(), count: 0 };
      cur.count++;
      map.set(key, cur);
    }
    const words = [...map.values()];
    empty.hidden = words.length > 0;
    renderCloud(cloud, words, (k) => { G.hidden.add('w:' + k); draw(); });
  };
  G.onResize = draw;
  let nSubs = null;
  G.phaseUnsub.push(store.on(`games/${pin}/subs/${i}`, (v) => {
    subs = v || {};
    const n = Object.keys(subs).length;
    if (nSubs !== null && n > nSubs) sfx('pop', null, 120);
    nSubs = n;
    requestAnimationFrame(draw);
  }));
  G.phaseUnsub.push(store.on(`games/${pin}/done/${i}`, (v) => cb.set(Object.keys(v || {}).length)));
  document.fonts && document.fonts.ready.then(() => requestAnimationFrame(draw));
  return view;
}

function bubblesView(it, i) {
  const cb = countBox('תשובות');
  const box = h('div', { class: 'bubbles' });
  const empty = emptyState('bubbles', 'מחכים לתשובות הראשונות… (הכול אנונימי)');
  const view = h('div', { class: 'phase-in', style: { display: 'flex', flexDirection: 'column', height: '100%' } },
    actHead(it, cb),
    h('div', { class: 'act-body' }, box, empty, h('div', { class: 'mod-hint' }, 'לחיצה על בועה מסתירה אותה')));
  const colors = ['#0090FF', '#6236FF', '#32C4FF', '#202C60', '#F2784B'];
  const els = new Map();
  let n = 0;
  let first = true;
  G.phaseUnsub.push(store.on(`games/${pin}/subs/${i}`, (v) => {
    const entries = Object.entries(v || {}).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    for (const [k, s] of entries) {
      if (els.has(k) || !s || !s.t || G.hidden.has('b:' + k)) continue;
      const el = h('div', { class: 'bubble', style: `--bc:${colors[n++ % colors.length]}`, title: 'לחיצה מסתירה את הבועה' }, s.t);
      el.addEventListener('click', () => { G.hidden.add('b:' + k); el.remove(); els.delete(k); cb.set(els.size); empty.hidden = els.size > 0; });
      els.set(k, el);
      box.prepend(el);
      if (!first) sfx('pop', null, 120);
    }
    first = false;
    for (const [k, el] of els) if (!(v && v[k])) { el.remove(); els.delete(k); }
    cb.set(els.size);
    empty.hidden = els.size > 0;
    box.style.setProperty('--bfs', els.size <= 6 ? '3.4vh' : els.size <= 14 ? '2.7vh' : els.size <= 30 ? '2.2vh' : '1.9vh');
  }));
  return view;
}

function ratingView(it, i) {
  const cb = countBox('דירגו');
  const crit = toArray(it.criteria);
  const cards = crit.map((name) => {
    const avg = h('div', { class: 'avg' }, '–');
    const scale = h('i', { style: { width: '0%' } });
    const cols = Array.from({ length: 10 }, (_, k) => {
      const bar = h('i', { style: { height: '0%' } });
      const d = h('div', { class: 'zero' }, bar, h('span', null, String(k + 1)));
      d.bar = bar;
      return d;
    });
    const el = h('div', { class: 'card rate-card' },
      h('div', { class: 'top' }, h('div', { class: 'nm' }, name), avg),
      h('div', { class: 'scale-bar' }, scale),
      h('div', { class: 'hist' }, cols));
    return { el, avg, scale, cols };
  });
  const view = h('div', { class: 'phase-in', style: { display: 'flex', flexDirection: 'column', height: '100%' } },
    actHead(it, cb),
    h('div', { class: 'act-body' }, h('div', { class: 'ratings' }, cards.map((c) => c.el))));
  let nRates = null;
  G.phaseUnsub.push(store.on(`games/${pin}/ratings/${i}`, (v) => {
    const rows = Object.values(v || {}).map((x) => toArray(x && x.r));
    if (nRates !== null && rows.length > nRates) sfx('pop', null, 120);
    nRates = rows.length;
    cb.set(rows.length);
    cards.forEach((c, k) => {
      const vals = rows.map((r) => Number(r[k])).filter((n) => n >= 1 && n <= 10);
      const hist = Array(10).fill(0);
      vals.forEach((n) => { hist[n - 1]++; });
      const mx = Math.max(1, ...hist);
      const a = vals.length ? vals.reduce((s, n) => s + n, 0) / vals.length : null;
      c.avg.replaceChildren(a === null ? '–' : a.toFixed(1), h('small', null, ' / 10'));
      c.scale.style.width = a === null ? '0%' : (a / 10) * 100 + '%';
      c.cols.forEach((d, j) => { d.bar.style.height = (hist[j] / mx) * 100 + '%'; d.classList.toggle('zero', !hist[j]); d.title = `${hist[j]} דירגו ${j + 1}`; });
    });
  }));
  return view;
}

// ================================================================ סיום
function endView() {
  const st = G.state;
  const top = toArray(st.top);
  if (!G.meta.hasQuiz || !top.length) {
    setTimeout(() => confetti(3500), 300);
    return h('div', { class: 'end-wrap phase-in' }, h('div', { class: 'thanks' },
      icon('heart'), h('h2', null, 'תודה על ההשתתפות!'), h('div', { class: 'sub' }, G.meta.title)));
  }
  const pod = (place, delay, height) => {
    const x = top[place - 1];
    if (!x) return h('div', { class: `pod p${place}` });
    const block = h('div', { class: 'block' }, String(place));
    setTimeout(() => { block.style.height = height; }, delay * 1000 - 300);
    return h('div', { class: `pod p${place}` },
      h('div', { class: 'who', style: { animationDelay: delay + 's' } },
        h('div', { html: medalSvg(place) }), h('div', { class: 'n' }, x.name), h('div', { class: 'p' }, fmt(x.score) + ' נקודות')),
      block);
  };
  setTimeout(() => confetti(5000), 2600);
  return h('div', { class: 'end-wrap phase-in' },
    h('div', { class: 'sub' }, G.meta.title),
    h('h2', null, 'המנצחים'),
    h('div', { class: 'podium' }, pod(2, 1.3, '46%'), pod(1, 2.3, '62%'), pod(3, 0.5, '32%')),
    top.length > 3 ? h('div', { class: 'end-rest' }, top.slice(3).map((x) => h('span', null, `${x.rank}. ${x.name} · ${fmt(x.score)}`))) : null);
}

boot().catch((e) => {
  console.error(e);
  renderError('שגיאה בטעינת המשחק', friendlyError(e));
});
