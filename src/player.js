// מסך המשתתף (טלפון): הצטרפות, מענה לשאלות, פעילויות ותוצאות.
import { store, friendlyError } from './store.js';
import { h, icon, shape, TYPES, toArray, fmt, demoBanner, logo, medalSvg, normWord, isLong, lightbox } from './common.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const P = {
  uid: null, pin: (params.get('pin') || '').replace(/\D/g, ''), unit: params.get('unit'), name: '',
  meta: null, state: null, key: null, score: null, phaseUnsub: [], timer: null, unsubs: [],
};
let headEl, bodyEl, scoreEl;

// ================================================================ אתחול
async function boot() {
  try { P.uid = await store.ensureUser(); } catch (e) { return fatal('לא הצלחנו להתחבר', friendlyError(e)); }
  if (!P.pin && P.unit) {
    const live = await store.get(`live/${P.unit}`);
    if (!live) return waitForLive();
    P.pin = String(live);
  }
  if (!P.pin) return renderJoin();
  const meta = await store.get(`games/${P.pin}/meta`);
  if (!meta) return renderJoin('לא מצאנו משחק עם הקוד הזה. בדקו את הקוד שעל הלוח.');
  P.meta = meta;
  const me = await store.get(`games/${P.pin}/players/${P.uid}`);
  if (me && me.name) { P.name = me.name; return enterGame(); }
  renderJoin();
}

function shell(content, center = true) {
  app.replaceChildren(
    demoBanner(store, true) || '',
    h('div', { class: 'p-wrap' }, h('div', { class: 'p-ribbon' }), h('div', { class: 'p-body' + (center ? ' center' : '') }, content)));
}
function fatal(title, text) {
  shell(h('div', { class: 'card p-card' }, h('h1', null, title), h('p', null, text)));
}

function waitForLive() {
  shell(h('div', { class: 'card p-card' },
    h('div', { class: 'wait-anim' }, h('i'), h('i'), h('i'), logo('', true)),
    h('h1', null, 'המשחק עוד לא התחיל'),
    h('p', null, 'הדף יתעדכן לבד ברגע שהמרצה יפעיל את המשחק. אין צורך לרענן.')));
  const un = store.on(`live/${P.unit}`, (v) => { if (v) { un(); P.pin = String(v); boot(); } });
}

// ================================================================ הצטרפות
function renderJoin(errMsg = '') {
  const saved = JSON.parse(localStorage.getItem('livequiz-player') || '{}');
  const err = h('div', { class: 'err', role: 'alert' }, errMsg);
  const knownGame = P.meta && P.pin;
  const pinIn = h('input', { class: 'input input-lg ltr', inputmode: 'numeric', autocomplete: 'off', maxlength: '7', placeholder: 'קוד משחק', value: P.pin || '', 'aria-label': 'קוד משחק (6 ספרות)' });
  const nameIn = h('input', { class: 'input input-lg', maxlength: '20', autocomplete: 'nickname', placeholder: 'השם שלך', value: saved.name || '', 'aria-label': 'שם או כינוי' });
  const btn = h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'submit' }, 'כניסה למשחק', icon('arrowLeft'));
  const form = h('form', {
    class: 'card p-join',
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      const pin = knownGame ? P.pin : pinIn.value.replace(/\D/g, '');
      const name = nameIn.value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
      if (pin.length !== 6) { err.textContent = 'קוד המשחק הוא 6 ספרות – מופיע על הלוח'; pinIn.focus(); return; }
      if (!name) { err.textContent = 'כתבו שם או כינוי'; nameIn.focus(); return; }
      btn.disabled = true;
      try {
        const meta = await store.get(`games/${pin}/meta`);
        if (!meta) { err.textContent = 'לא מצאנו משחק עם הקוד הזה'; btn.disabled = false; return; }
        if (await store.get(`games/${pin}/kicked/${P.uid}`)) { err.textContent = 'הוסרת מהמשחק הזה על ידי המרצה'; btn.disabled = false; return; }
        const st = await store.get(`games/${pin}/state`);
        if (st && st.phase === 'end') { err.textContent = 'המשחק הזה כבר הסתיים'; btn.disabled = false; return; }
        await store.update(`games/${pin}/players/${P.uid}`, { name, joined: store.TS, online: true });
        localStorage.setItem('livequiz-player', JSON.stringify({ name }));
        P.pin = pin; P.meta = meta; P.name = name;
        history.replaceState(null, '', '?pin=' + pin);
        enterGame();
      } catch (ex) { err.textContent = friendlyError(ex); btn.disabled = false; }
    },
  },
  logo(),
  h('h1', null, 'הצטרפות למשחק'),
  h('p', { class: 'sub' }, 'כמה שניות ואתם בפנים'),
  knownGame ? h('div', { class: 'gamebox' }, h('b', null, P.meta.title)) : h('div', { class: 'field' }, h('label', null, 'קוד המשחק (מופיע על הלוח)'), pinIn),
  h('div', { class: 'field' }, h('label', null, 'איך לקרוא לך?'), nameIn),
  btn, err);
  shell(form);
  setTimeout(() => (knownGame || P.pin ? nameIn : pinIn).focus(), 50);
}

// ================================================================ במשחק
function enterGame() {
  scoreEl = h('span', { class: 'score', hidden: !P.meta.hasQuiz }, '0');
  headEl = h('header', { class: 'p-head' }, logo('logo', true), h('div', { class: 'me' }, h('span', { class: 'nm' }, P.name), scoreEl));
  bodyEl = h('main', { class: 'p-body center' });
  app.replaceChildren(demoBanner(store, true) || '', h('div', { class: 'p-wrap' }, h('div', { class: 'p-ribbon' }), headEl, bodyEl));
  P.unsubs.push(store.presence(`games/${P.pin}/players/${P.uid}/online`));
  P.unsubs.push(store.on(`games/${P.pin}/state`, onState));
  P.unsubs.push(store.on(`games/${P.pin}/scores/${P.uid}`, (v) => { P.score = v; scoreEl.textContent = fmt((v && v.score) || 0); if (P.onScore) P.onScore(); }));
  let seen = false;
  P.unsubs.push(store.on(`games/${P.pin}/players/${P.uid}`, async (v) => {
    if (v && v.name) { seen = true; return; }
    if (!seen) return;
    const kicked = await store.get(`games/${P.pin}/kicked/${P.uid}`);
    stopAll();
    shell(h('div', { class: 'card p-card' }, h('h1', null, kicked ? 'הוסרת מהמשחק' : 'המשחק נסגר'), h('p', null, kicked ? 'המרצה הסיר/ה אותך מהמשחק הזה.' : 'אפשר לסגור את הדף.')));
  }));
}
function stopAll() { P.unsubs.forEach((u) => u && u()); P.unsubs = []; cleanupPhase(); }

function onState(st) {
  P.state = st || { phase: 'lobby', index: -1 };
  const key = P.state.phase + ':' + P.state.index;
  if (key !== P.key) { P.key = key; enterPhase(); }
  else if (P.onStateUpdate) P.onStateUpdate();
}
function cleanupPhase() {
  P.phaseUnsub.forEach((u) => u());
  P.phaseUnsub = [];
  clearInterval(P.timer);
  clearTimeout(P.timer);
  P.onScore = null;
  P.onStateUpdate = null;
}
function setBody(el, center = false) {
  bodyEl.className = 'p-body' + (center ? ' center' : '');
  bodyEl.replaceChildren(el);
  window.scrollTo(0, 0);
}
function enterPhase() {
  cleanupPhase();
  const st = P.state;
  if (st.phase === 'lobby') return lobby();
  if (st.phase === 'question') return question();
  if (st.phase === 'reveal') return reveal();
  if (st.phase === 'leaderboard') return leaderboard();
  if (st.phase === 'activity') return activity();
  if (st.phase === 'slide') return slide();
  if (st.phase === 'end') return end();
}

// ---------------------------------------------------------------- המתנה
function lobby() {
  setBody(h('div', { class: 'card p-card phase-in' },
    h('div', { class: 'wait-anim' }, h('i'), h('i'), h('i'), logo('', true)),
    h('h1', null, `נרשמת, ${P.name}!`),
    h('p', null, 'המשחק יתחיל בעוד רגע. שימו עין על הלוח – השאלות יופיעו גם כאן.'),
    h('div', { class: 'gamebox', style: { marginTop: '18px', background: 'var(--tint)', borderRadius: '12px', padding: '10px' } }, h('b', { style: { color: 'var(--navy)' } }, P.meta.title))), true);
}
function waitCard(title, text) {
  return h('div', { class: 'card p-card phase-in' }, h('div', { class: 'wait-anim' }, h('i'), h('i'), h('i'), logo('', true)), h('h2', null, title), text ? h('p', { style: { marginTop: '6px' } }, text) : null);
}

// ---------------------------------------------------------------- כרטיס שאלה (טקסט + תמונה)
const mediaCache = {};
function qCard(it, i) {
  const card = h('div', { class: 'card p-q' + (isLong(it.text) ? ' long' : '') + ((it.text || '').length > 500 ? ' xl' : '') }, h('div', { class: 'p-qt' }, it.text));
  if (it.hasImage && it.imgPhone) {
    const img = h('img', { class: 'p-img', alt: 'תמונת השאלה' });
    const show = (src) => { img.src = src; img.onclick = () => lightbox(src); };
    if (mediaCache[i]) show(mediaCache[i]);
    else store.get(`games/${P.pin}/media/${i}`).then((v) => { if (v) { mediaCache[i] = v; show(v); } else img.remove(); }).catch(() => img.remove());
    card.prepend(img);
  } else if (it.hasImage) {
    card.append(h('div', { class: 'p-imgnote' }, icon('image'), 'יש תמונה – הסתכלו על הלוח'));
  }
  return card;
}

// ---------------------------------------------------------------- שקף (לא שאלה)
function slide() {
  const i = P.state.index;
  const it = P.state.item || {};
  const title = (it.title || '').trim();
  const text = (it.text || '').trim();
  const card = h('div', { class: 'card p-slide phase-in' + (text.length > 500 ? ' xl' : '') },
    h('div', { class: 'p-qhead' }, h('span', { class: 'row', style: { gap: '6px', color: TYPES.slide.color } }, icon('slide'), 'שקף')));
  if (it.hasImage && it.imgPhone) {
    const img = h('img', { class: 'p-img', alt: title || 'תמונת השקף' });
    const show = (src) => { img.src = src; img.onclick = () => lightbox(src); };
    if (mediaCache[i]) show(mediaCache[i]);
    else store.get(`games/${P.pin}/media/${i}`).then((v) => { if (v) { mediaCache[i] = v; show(v); } else img.remove(); }).catch(() => img.remove());
    card.append(img);
  }
  if (title) card.append(h('h2', { class: 'p-slide-title' }, title));
  if (text) card.append(h('div', { class: 'p-slide-text' + (text.length > 220 || /\n\s*([•\-*–]|\d+[.)])/.test(text) ? ' long' : '') }, text));
  if (it.hasImage && !it.imgPhone) card.append(h('div', { class: 'p-imgnote' }, icon('image'), 'יש תמונה – הסתכלו על הלוח'));
  card.append(h('div', { class: 'p-slide-foot' }, icon('eye'), 'אין צורך לענות – המרצה ימשיך בעוד רגע'));
  setBody(card, text.length < 260);
}

// ---------------------------------------------------------------- שאלה
async function question() {
  const st = P.state;
  const i = st.index;
  const it = st.item || {};
  const opts = toArray(it.options);
  const total = (it.time || 20) * 1000;
  const bar = h('i', { style: { width: '100%' } });
  const barWrap = h('div', { class: 'p-timebar' }, bar);
  const secs = h('span', { class: 'ltr' }, '');
  const status = h('div');
  const listMode = opts.some((o) => o.length > 38 || o.includes('\n')) || isLong(it.text, 220);
  const xl = opts.some((o) => o.length > 200 || o.includes('\n'));
  const grid = h('div', { class: 'p-opts' + (listMode ? ' list' : opts.length <= 2 ? ' single' : '') + (xl ? ' xl' : '') + (opts.length > 4 ? ' many' : '') });
  let locked = false;

  const lock = (k, msg) => {
    locked = true;
    grid.classList.add('locked');
    if (k !== null && grid.children[k]) grid.children[k].classList.add('mine');
    status.replaceChildren(h('div', { class: 'card p-card phase-in', style: { padding: '12px' } }, h('h2', { style: { fontSize: '18px' } }, msg)));
  };
  opts.forEach((o, k) => {
    grid.appendChild(h('button', {
      class: `p-opt opt-c${k}`, 'aria-label': o,
      onclick: async () => {
        if (locked) return;
        lock(k, 'התשובה נקלטה! ממתינים לשאר…');
        if (navigator.vibrate) navigator.vibrate(30);
        try {
          await store.set(`games/${P.pin}/answers/${i}/${P.uid}`, { c: k, at: store.TS });
        } catch (e) {
          lock(k, 'אופס, התשובה לא נקלטה – כנראה שהזמן נגמר.');
        }
      },
    }, shape(k), h('span', null, o)));
  });
  setBody(h('div', { class: 'phase-in', style: { display: 'flex', flexDirection: 'column', gap: '12px', flex: '1' } },
    h('div', { class: 'p-sticky' },
      h('div', { class: 'p-qhead' }, h('span', null, `שאלה ${st.qNo} מתוך ${st.qTotal}`), it.points === 2 ? h('span', { class: 'pill pill-violet' }, 'ניקוד כפול') : it.points === 0 ? h('span', { class: 'pill' }, 'תרגול') : null, secs),
      barWrap),
    qCard(it, i),
    status,
    grid));

  const tick = () => {
    const started = st.startedAt || store.now();
    const left = Math.max(0, started + total - store.now());
    bar.style.width = (left / total) * 100 + '%';
    barWrap.classList.toggle('low', left <= 5000);
    secs.textContent = Math.ceil(left / 1000) + ' שנ׳';
    if (left <= 0 && !locked) lock(null, 'הזמן נגמר ⏱️');
  };
  tick();
  P.timer = setInterval(tick, 200);
  const mine = await store.get(`games/${P.pin}/answers/${i}/${P.uid}`);
  if (mine && P.key === `question:${i}`) lock(mine.c, 'התשובה נקלטה! ממתינים לשאר…');
}

// ---------------------------------------------------------------- תוצאה
function reveal() {
  const st = P.state;
  const i = st.index;
  const it = st.item || {};
  const opts = toArray(it.options);
  const correct = toArray(st.correct);
  const render = () => {
    const s = P.score;
    // התוצאה של השאלה הזו – גם כשהמרצה חוזר אחורה לשאלה קודמת
    const hist = s && s.hist;
    const last = (hist && hist[i]) || (s && s.last && s.last.i === i ? s.last : null);
    if (!last) {
      const msg = st.review ? waitCard('השאלה הזו הייתה לפני שהצטרפת', 'הסתכלו על הלוח – התשובה הנכונה מוצגת שם.')
        : late ? waitCard('הצטרפת באמצע – מעולה!', 'השאלה הבאה בדרך. הסתכלו על הלוח.') : waitCard('מחשבים תוצאות…');
      setBody(msg, true);
      return;
    }
    const rightTxt = correct.map((c) => opts[c]).join(' / ');
    let card;
    if (last.ok) {
      card = h('div', { class: 'result ok phase-in' }, h('div', { class: 'ic' }, icon('check')), h('h2', null, 'תשובה נכונה!'),
        it.points === 0 ? h('p', null, 'שאלת תרגול – בלי ניקוד') : h('div', { class: 'pts' }, h('span', { class: 'ltr' }, '+' + fmt(last.pts)), h('small', { style: { fontSize: '20px', fontWeight: '700' } }, ' נקודות')),
        it.points ? h('p', null, last.pts >= 900 * (it.points || 1) ? 'מהירות שיא! ⚡' : 'כל הכבוד!') : null);
    } else if (last.answered) {
      card = h('div', { class: 'result bad phase-in' }, h('div', { class: 'ic' }, icon('x')), h('h2', null, 'לא הפעם'), h('p', null, 'בשאלה הבאה זה יקרה!'),
        h('div', { class: 'right-ans' }, 'התשובה הנכונה: ', rightTxt));
    } else {
      card = h('div', { class: 'result none phase-in' }, h('div', { class: 'ic' }, icon('stop')), h('h2', null, 'לא הספקת לענות'),
        h('div', { class: 'right-ans' }, 'התשובה הנכונה: ', rightTxt));
    }
    setBody(h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } }, card, rankLine()), true);
  };
  let late = !!st.review;
  P.onScore = render;
  render();
  P.timer = setTimeout(() => { late = true; if (P.key === `reveal:${i}`) render(); }, 2500);
}
function rankLine() {
  const s = P.score;
  if (!s || !s.rank || !P.meta.hasQuiz) return null;
  return h('div', { class: 'card rank-card' }, h('div', { class: 'lbl' }, 'המקום שלך כרגע'), h('div', { class: 'big' }, String(s.rank)), h('div', { class: 'lbl' }, fmt(s.score) + ' נקודות'));
}

// ---------------------------------------------------------------- טבלת מובילים
function leaderboard() {
  const st = P.state;
  const render = () => {
    const s = P.score || {};
    const top = toArray(st.top);
    let note = 'המשיכו כך – עוד יש זמן לטפס!';
    if (!s.score) note = 'בשאלה הבאה – הזדמנות לצבור נקודות!';
    else if (s.rank === 1) note = 'את/ה במקום הראשון! 🏆';
    else if (s.rank && s.rank <= 5) note = 'את/ה בטבלת המובילים על הלוח! 🎉';
    else {
      const above = top.filter((x) => x.score > (s.score || 0)).pop();
      if (above) note = `עוד ${fmt(above.score - (s.score || 0))} נקודות ותיכנס/י לטבלה`;
    }
    setBody(h('div', { class: 'card rank-card phase-in' },
      h('div', { class: 'lbl' }, 'המקום שלך'),
      h('div', { class: 'big' }, s.rank ? String(s.rank) : '–'),
      h('div', { class: 'lbl' }, fmt(s.score || 0) + ' נקודות'),
      h('div', { class: 'gap' }, note),
      h('p', { style: { marginTop: '14px' } }, 'הסתכלו על הלוח – השאלה הבאה בדרך')), true);
  };
  P.onScore = render;
  render();
}

// ---------------------------------------------------------------- פעילויות
function closedCard() {
  return h('div', { class: 'card p-card' }, h('h2', null, 'התגובות נעצרו'), h('p', { style: { marginTop: '6px' } }, 'המרצה עצר/ה את קבלת התגובות. הסתכלו על הלוח.'));
}
function activity() {
  const it = P.state.item || {};
  if (it.type === 'wordcloud' || it.type === 'bubbles') return textActivity(it);
  if (it.type === 'rating') return ratingActivity(it);
}

function textActivity(it) {
  const st = P.state;
  const i = st.index;
  const isCloud = it.type === 'wordcloud';
  const max = (isCloud ? it.maxWords : it.maxPosts) || (isCloud ? 3 : 2);
  const storeKey = `livequiz-sent-${P.pin}-${i}`;
  let sent = JSON.parse(sessionStorage.getItem(storeKey) || '[]');
  let doneCount = sent.length;
  const t = TYPES[it.type];

  const render = () => {
    const left = Math.max(0, max - doneCount);
    const sentList = sent.length ? h('div', { class: 'sent-list' }, sent.map((w) => h('span', null, isCloud ? w : '✓ נשלח'))) : null;
    if (P.state.closed && left > 0) { setBody(h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } }, closedCard(), sentList), true); return; }
    if (!left) {
      setBody(h('div', { class: 'card p-card phase-in' },
        h('div', { class: 'big-check' }, icon('check')),
        h('h2', null, isCloud ? 'המילים שלך בענן!' : 'התשובות שלך על הלוח!'),
        h('p', { style: { margin: '6px 0 14px' } }, 'תודה! עכשיו מסתכלים על הלוח.'),
        isCloud ? sentList : h('div', { class: 'anon-note' }, icon('eyeOff'), 'התשובות הוצגו בלי שם')), true);
      return;
    }
    const input = isCloud
      ? h('input', { class: 'input input-lg', maxlength: '40', placeholder: 'מילה או צירוף קצר', enterkeyhint: 'send', 'aria-label': 'המילה שלך' })
      : h('textarea', { class: 'textarea', maxlength: '300', rows: '4', placeholder: 'כתבו כאן…', 'aria-label': 'התשובה שלך', style: { fontSize: '18px' } });
    const counter = h('div', { class: 'left-count' });
    const updCounter = () => { counter.textContent = isCloud ? `אפשר לשלוח עוד ${left === 1 ? 'מילה אחת' : left + ' מילים'}` : `${input.value.length}/300 · אפשר לשלוח עוד ${left === 1 ? 'תשובה אחת' : left + ' תשובות'}`; };
    updCounter();
    input.addEventListener('input', updCounter);
    const btn = h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'submit' }, icon('send'), 'שליחה');
    const err = h('div', { class: 'err' });
    const form = h('form', {
      class: 'p-form',
      onsubmit: async (e) => {
        e.preventDefault();
        const val = input.value.replace(/\s+/g, ' ').trim();
        if (!val) { input.focus(); return; }
        if (isCloud && !normWord(val)) { err.textContent = 'כתבו מילה עם אותיות'; return; }
        btn.disabled = true;
        try {
          const k = store.newKey(`games/${P.pin}/subs/${i}`);
          await store.update(`games/${P.pin}`, { [`subs/${i}/${k}`]: { t: val, at: store.TS }, [`done/${i}/${P.uid}`]: doneCount + 1 });
          doneCount++;
          sent.push(isCloud ? val : '✓');
          sessionStorage.setItem(storeKey, JSON.stringify(sent));
          if (navigator.vibrate) navigator.vibrate(25);
          render();
        } catch (ex) {
          err.textContent = P.state.closed ? 'התגובות נעצרו' : 'השליחה לא הצליחה. נסו שוב.';
          btn.disabled = false;
        }
      },
    }, input, counter, btn, err);
    setBody(h('div', { class: 'phase-in', style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      h('div', { class: 'p-qhead' }, h('span', { class: 'row', style: { gap: '6px', color: t.color } }, icon(t.icon), t.label)),
      qCard(it, i),
      !isCloud ? h('div', { class: 'anon-note' }, icon('eyeOff'), 'אנונימי – השם שלך לא יוצג ולא נשמר עם התשובה') : h('div', { class: 'anon-note' }, icon('eyeOff'), 'המילים מוצגות בענן בלי שמות'),
      h('div', { class: 'card', style: { padding: '16px' } }, form),
      sentList), false);
    setTimeout(() => input.focus(), 60);
  };
  P.onStateUpdate = render;
  // סנכרון מול השרת (למקרה של רענון)
  store.get(`games/${P.pin}/done/${i}/${P.uid}`).then((n) => {
    if (typeof n === 'number' && n > doneCount) { doneCount = n; while (sent.length < n) sent.push(isCloud ? '✓' : '✓'); }
    if (P.key === `activity:${i}`) render();
  });
  render();
}

function ratingActivity(it) {
  const st = P.state;
  const i = st.index;
  const crit = toArray(it.criteria);
  const vals = crit.map(() => 0);
  let done = false;
  const render = () => {
    if (done) {
      setBody(h('div', { class: 'card p-card phase-in' }, h('div', { class: 'big-check' }, icon('check')), h('h2', null, 'הדירוג נשלח, תודה!'),
        h('p', { style: { marginTop: '6px' } }, 'התוצאות מוצגות על הלוח, בלי שמות.')), true);
      return;
    }
    if (P.state.closed) { setBody(closedCard(), true); return; }
    const btn = h('button', { class: 'btn btn-primary btn-lg btn-block', disabled: vals.some((v) => !v) }, icon('send'), 'שליחת הדירוג');
    const err = h('div', { class: 'err' });
    const rows = crit.map((name, k) => {
      const grid = h('div', { class: 'scale10', role: 'radiogroup', 'aria-label': name });
      for (let n = 1; n <= 10; n++) {
        grid.appendChild(h('button', {
          class: vals[k] === n ? 'on' : '', role: 'radio', 'aria-checked': String(vals[k] === n),
          onclick: () => {
            vals[k] = n;
            [...grid.children].forEach((b, j) => { b.classList.toggle('on', j + 1 === n); b.setAttribute('aria-checked', String(j + 1 === n)); });
            btn.disabled = vals.some((v) => !v);
          },
        }, String(n)));
      }
      return h('div', { class: 'card crit' }, h('div', { class: 'cn' }, name), grid, h('div', { class: 'scale-legend' }, h('span', null, '1 – נמוך'), h('span', null, '10 – גבוה')));
    });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await store.set(`games/${P.pin}/ratings/${i}/${P.uid}`, { r: vals, at: store.TS });
        done = true;
        render();
      } catch (e) { err.textContent = P.state.closed ? 'התגובות נעצרו' : 'השליחה לא הצליחה. נסו שוב.'; btn.disabled = false; }
    });
    setBody(h('div', { class: 'phase-in', style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('div', { class: 'p-qhead' }, h('span', { class: 'row', style: { gap: '6px', color: TYPES.rating.color } }, icon('rating'), 'דירוג 1–10')),
      qCard(it, i),
      h('div', { class: 'anon-note' }, icon('eyeOff'), 'הדירוג מוצג על הלוח רק כממוצע, בלי שמות'),
      rows, btn, err), false);
  };
  P.onStateUpdate = () => { if (!done) render(); };
  store.get(`games/${P.pin}/ratings/${i}/${P.uid}`).then((v) => { if (v && P.key === `activity:${i}`) { done = true; render(); } });
  render();
}

// ---------------------------------------------------------------- סיום
function end() {
  const render = () => {
    const s = P.score || {};
    const rank = s.final || s.rank;
    const kids = [];
    if (P.meta.hasQuiz && rank) {
      if (rank <= 3) kids.push(h('div', { class: 'medal-big', html: medalSvg(rank) }));
      kids.push(h('div', { class: 'lbl' }, 'סיימת במקום'), h('div', { class: 'big' }, String(rank)), h('div', { class: 'lbl' }, fmt(s.score || 0) + ' נקודות'),
        h('div', { class: 'gap' }, rank === 1 ? 'ניצחון! כל הכבוד 🏆' : rank <= 3 ? 'עלית לפודיום! 🎉' : 'כל הכבוד על ההשתתפות!'));
    } else {
      kids.push(h('div', { class: 'big-check' }, icon('heart')), h('h2', null, 'תודה על ההשתתפות!'));
    }
    kids.push(h('p', { style: { marginTop: '14px' } }, 'המשחק הסתיים. אפשר לסגור את הדף.'));
    setBody(h('div', { class: 'card rank-card phase-in' }, kids), true);
  };
  P.onScore = render;
  render();
}

boot().catch((e) => { console.error(e); fatal('שגיאה', friendlyError(e)); });
