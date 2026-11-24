// ממשק העורך: קורסים › מפגשים › יחידות לימוד, ועריכת הפריטים בכל יחידה.
import { store, friendlyError } from './store.js';
import {
  h, icon, shape, TYPES, newItem, toArray, normItem, itemProblems, uid8, toast, confirmDialog, copyText, pageUrl,
  demoBanner, logo, OPT_NAMES, MAX_OPTIONS, fmt, lightbox, randomKey, prepareItem,
} from './common.js';

const app = document.getElementById('app');
const S = {
  courses: {}, sessions: {}, units: {},
  sel: { kind: null, id: null },
  open: new Set(JSON.parse(localStorage.getItem('livequiz-open') || '[]')),
  items: [], itemsUnit: null,
  saveTimer: null, titleTimer: null,
  imgCache: new Map(),
  loaded: { courses: false, sessions: false, units: false },
};
let side, main, saveEl;

// ---------------------------------------------------------------- כניסה
async function boot() {
  await store.authReady;
  if (!store.isAdmin()) return renderLogin();
  startApp();
}

function renderLogin() {
  const err = h('div', { class: 'err', role: 'alert' });
  const email = h('input', { class: 'input input-lg ltr', type: 'email', placeholder: 'מייל', autocomplete: 'username', 'aria-label': 'מייל', dir: 'ltr' });
  const pass = h('input', { class: 'input input-lg', type: 'password', placeholder: 'סיסמה', 'aria-label': 'סיסמה', autocomplete: 'current-password', dir: 'ltr' });
  const btn = h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'submit' }, icon('lock'), 'כניסה');
  const isDemo = store.mode === 'demo';
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (!isDemo && !email.value.trim()) { err.textContent = 'הקלידו את המייל'; email.focus(); return; }
      if (!isDemo && !pass.value) { err.textContent = 'הקלידו את הסיסמה'; pass.focus(); return; }
      btn.disabled = true;
      try { await store.login(email.value, pass.value); startApp(); } catch (ex) { err.textContent = friendlyError(ex); btn.disabled = false; pass.select(); }
    },
  }, isDemo ? null : email, isDemo ? null : pass, btn, err);
  app.replaceChildren(
    demoBanner(store) || '',
    h('div', { class: 'center-screen' },
      h('div', { class: 'card login-card' },
        logo(),
        h('h1', null, 'ממשק העורך'),
        h('p', null, isDemo ? 'מצב הדגמה – אין צורך בסיסמה. אחרי חיבור Firebase הכניסה תהיה עם מייל וסיסמה של מרצה.' : 'הקלידו את המייל והסיסמה של המרצה כדי לבנות ולערוך משחקונים.'),
        form)));
  if (!isDemo) email.focus();
}

// ---------------------------------------------------------------- מעטפת
function startApp() {
  saveEl = h('div', { class: 'save-state', 'aria-live': 'polite' });
  side = h('aside', { class: 'ed-side', 'aria-label': 'עץ הקורסים' });
  main = h('main', { class: 'ed-main' });
  app.replaceChildren(
    demoBanner(store) || '',
    h('header', { class: 'ed-top' },
      logo(),
      h('div', { class: 'app-name' }, 'חידון חי', h('small', null, 'ממשק עורך – קורסים, מפגשים ויחידות לימוד')),
      h('div', { class: 'grow' }),
      saveEl,
      h('button', { class: 'btn btn-ghost btn-sm', onclick: logout, title: 'יציאה' }, icon('logout'), 'יציאה')),
    h('div', { class: 'ed-layout' }, side, main));

  const ready = () => S.loaded.courses && S.loaded.sessions && S.loaded.units;
  const onData = (key) => (v) => {
    S[key] = v || {};
    S.loaded[key] = true;
    if (!ready()) return;
    renderTree();
    if (!S.booted) { S.booted = true; afterLoad(); return; }
    const coll = { course: S.courses, session: S.sessions, unit: S.units }[S.sel.kind];
    if (S.sel.kind && !(coll && coll[S.sel.id])) route();
    else if (S.sel.kind !== 'unit') refreshMainSoft();
  };
  const onErr = (e) => {
    main.replaceChildren(h('div', { class: 'card welcome' },
      h('h1', null, 'אין גישה לנתונים'),
      h('p', null, 'Firebase סירב לקריאת הנתונים. בדקו שהדבקתם את כללי האבטחה (database.rules.json) ושהמשתמש שלכם מופיע ברשימת admins במסד הנתונים.'),
      h('p', { class: 'muted', style: { fontSize: '14px' } }, friendlyError(e)),
      h('button', { class: 'btn btn-primary', onclick: logout }, 'יציאה וכניסה מחדש')));
  };
  store.on('courses', onData('courses'), onErr);
  store.on('sessions', onData('sessions'), onErr);
  store.on('units', onData('units'), onErr);
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => { if (S.saveTimer) { flushSave(); e.preventDefault(); e.returnValue = ''; } });
  cleanupOldGames();
}

async function afterLoad() {
  if (store.mode === 'demo' && !Object.keys(S.courses).length && !localStorage.getItem('livequiz-demo-seeded')) {
    localStorage.setItem('livequiz-demo-seeded', '1');
    const unitId = await seedSample();
    location.hash = 'u=' + unitId;
    return;
  }
  route();
}

async function logout() {
  await flushSave();
  await store.logout();
  location.reload();
}

async function cleanupOldGames() {
  try {
    const old = await store.olderThan('games', 'meta/created', store.now() - 3 * 86400000);
    const upd = {};
    for (const pin of Object.keys(old)) { upd['games/' + pin] = null; upd['secret/' + pin] = null; }
    if (Object.keys(upd).length) {
      await store.update('', upd);
      const cl = {};
      for (const pin of Object.keys(old)) cl['claims/' + pin] = null;
      await store.update('', cl).catch(() => {});
    }
  } catch (e) { console.warn('cleanup skipped', e); }
}

// ---------------------------------------------------------------- ניתוב
function route() {
  const m = /^#(c|s|u)=(.+)$/.exec(location.hash);
  const kind = m ? { c: 'course', s: 'session', u: 'unit' }[m[1]] : null;
  const id = m ? decodeURIComponent(m[2]) : null;
  const coll = { course: S.courses, session: S.sessions, unit: S.units }[kind];
  if (kind && !(coll && coll[id])) { S.sel = { kind: null, id: null }; history.replaceState(null, '', location.pathname + location.search); }
  else S.sel = { kind, id };
  // פתיחת ההורים בעץ
  if (S.sel.kind === 'session') S.open.add(S.sessions[id].courseId);
  if (S.sel.kind === 'unit') { S.open.add(S.units[id].courseId); S.open.add(S.units[id].sessionId); }
  if (S.sel.kind === 'course') S.open.add(id);
  if (S.sel.kind === 'session') S.open.add(id);
  saveOpen();
  renderTree();
  renderMain();
}
function go(kind, id) {
  const p = { course: 'c', session: 's', unit: 'u' }[kind];
  const target = '#' + p + '=' + encodeURIComponent(id);
  if (location.hash === target) route(); else location.hash = target;
}
function saveOpen() { localStorage.setItem('livequiz-open', JSON.stringify([...S.open])); }

// ---------------------------------------------------------------- עזרי נתונים
const byOrder = (obj) => Object.entries(obj || {}).map(([id, v]) => ({ id, ...v })).sort((a, b) => (a.order || 0) - (b.order || 0));
const sessionsOf = (cid) => byOrder(S.sessions).filter((s) => s.courseId === cid);
const unitsOf = (sid) => byOrder(S.units).filter((u) => u.sessionId === sid);

// ---------------------------------------------------------------- עץ צד
function treeRow(cls, onclick, ...children) {
  return h('div', {
    class: 'tree-row ' + cls, role: 'button', tabindex: '0', onclick,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onclick(e); } },
  }, ...children);
}
function renderTree() {
  if (!side) return;
  const courses = byOrder(S.courses);
  const isSel = (k, id) => S.sel.kind === k && S.sel.id === id;
  const toggle = (id) => { S.open.has(id) ? S.open.delete(id) : S.open.add(id); saveOpen(); renderTree(); };

  const unitLi = (u) => {
    const row = treeRow(isSel('unit', u.id) ? 'active' : '', () => go('unit', u.id),
      icon('layers', 'ico'), h('span', null, u.title || 'ללא שם'), h('span', { class: 'count', title: 'מספר פריטים' }, fmt(u.count || 0)));
    dnd(row, 'unit', u.id, 'v');
    return h('li', { class: 'lvl-unit' }, row);
  };
  const sessLi = (s) => {
    const open = S.open.has(s.id);
    const units = unitsOf(s.id);
    const row = treeRow((open ? 'open ' : '') + (isSel('session', s.id) ? 'active' : ''), () => { if (!open) toggle(s.id); go('session', s.id); },
      h('span', { onclick: (e) => { e.stopPropagation(); toggle(s.id); } }, icon('chev', 'chev')), icon('calendar', 'ico'), h('span', null, s.title || 'ללא שם'), h('span', { class: 'count' }, fmt(units.length)));
    dnd(row, 'session', s.id, 'v');
    return h('li', { class: 'lvl-session' }, row,
      open ? h('ul', null, units.map(unitLi), h('li', null, h('button', { class: 'tree-add', onclick: () => addUnit(s.id) }, icon('plus'), 'יחידת לימוד'))) : null);
  };
  const courseLi = (c) => {
    const open = S.open.has(c.id);
    const sess = sessionsOf(c.id);
    const row = treeRow((open ? 'open ' : '') + (isSel('course', c.id) ? 'active' : ''), () => { if (!open) toggle(c.id); go('course', c.id); },
      h('span', { onclick: (e) => { e.stopPropagation(); toggle(c.id); } }, icon('chev', 'chev')), icon('book', 'ico'), h('span', null, c.title || 'ללא שם'), h('span', { class: 'count' }, fmt(sess.length)));
    dnd(row, 'course', c.id, 'v');
    return h('li', { class: 'lvl-course' }, row,
      open ? h('ul', null, sess.map(sessLi), h('li', null, h('button', { class: 'tree-add', onclick: () => addSession(c.id) }, icon('plus'), 'מפגש'))) : null);
  };
  side.replaceChildren(
    h('h2', null, 'הקורסים שלי'),
    courses.length ? h('ul', { class: 'tree' }, courses.map(courseLi)) : h('p', { class: 'muted', style: { margin: '0 8px 10px', fontSize: '14px' } }, 'עדיין אין קורסים.'),
    h('button', { class: 'tree-add', style: { marginTop: '10px' }, onclick: addCourse }, icon('plus'), 'קורס חדש'),
    courses.length ? h('div', { class: 'drag-hint' }, icon('info'), 'גוררים מפגש או יחידה כדי לשנות את הסדר, או אל מפגש/קורס אחר כדי להעביר') : null);
}

// ---------------------------------------------------------------- גרירה לשינוי סדר
function clearDropMarks() {
  document.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'drop-into'));
}
function dropPos(kind, id, e, el, orient) {
  const d = S.drag;
  if (!d || (d.kind === kind && d.id === id)) return null;
  if (d.kind === kind) {
    const r = el.getBoundingClientRect();
    if (orient === 'h') return e.clientX > r.left + r.width / 2 ? 'before' : 'after'; // מימין לשמאל
    return e.clientY < r.top + r.height / 2 ? 'before' : 'after';
  }
  if (d.kind === 'session' && kind === 'course') return 'into';
  if (d.kind === 'unit' && kind === 'session') return 'into';
  return null;
}
function dnd(el, kind, id, orient) {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    S.drag = { kind, id };
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch {}
    requestAnimationFrame(() => el.classList.add('dragging'));
  });
  el.addEventListener('dragend', () => { el.classList.remove('dragging'); clearDropMarks(); S.drag = null; });
  el.addEventListener('dragover', (e) => {
    const pos = dropPos(kind, id, e, el, orient);
    if (!pos) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!el.classList.contains('drop-' + pos)) { clearDropMarks(); el.classList.add('drop-' + pos); }
  });
  el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('drop-before', 'drop-after', 'drop-into'); });
  el.addEventListener('drop', (e) => {
    const pos = dropPos(kind, id, e, el, orient);
    if (!pos) return;
    e.preventDefault();
    e.stopPropagation();
    clearDropMarks();
    const d = S.drag;
    S.drag = null;
    doDrop(d, kind, id, pos).catch((err) => toast(friendlyError(err), 'bad'));
  });
}
function placeIn(list, dragId, targetId, pos) {
  const ids = list.filter((x) => x !== dragId);
  if (pos === 'into') ids.push(dragId);
  else ids.splice(ids.indexOf(targetId) + (pos === 'after' ? 1 : 0), 0, dragId);
  return ids;
}
async function doDrop(d, kind, id, pos) {
  const upd = {};
  let moved = false;
  if (d.kind === 'course') {
    placeIn(byOrder(S.courses).map((c) => c.id), d.id, id, pos).forEach((cid, i) => { upd[`courses/${cid}/order`] = (i + 1) * 1000; });
  } else if (d.kind === 'session') {
    const courseId = pos === 'into' ? id : S.sessions[id].courseId;
    placeIn(sessionsOf(courseId).map((x) => x.id), d.id, id, pos).forEach((sid, i) => { upd[`sessions/${sid}/order`] = (i + 1) * 1000; });
    if (S.sessions[d.id].courseId !== courseId) {
      moved = true;
      upd[`sessions/${d.id}/courseId`] = courseId;
      unitsOf(d.id).forEach((u) => { upd[`units/${u.id}/courseId`] = courseId; });
      S.open.add(courseId);
    }
  } else if (d.kind === 'unit') {
    const sessionId = pos === 'into' ? id : S.units[id].sessionId;
    const courseId = S.sessions[sessionId].courseId;
    placeIn(unitsOf(sessionId).map((x) => x.id), d.id, id, pos).forEach((uid, i) => { upd[`units/${uid}/order`] = (i + 1) * 1000; });
    if (S.units[d.id].sessionId !== sessionId) {
      moved = true;
      upd[`units/${d.id}/sessionId`] = sessionId;
      upd[`units/${d.id}/courseId`] = courseId;
      S.open.add(courseId); S.open.add(sessionId);
    }
  }
  saveOpen();
  await store.update('', upd);
  toast(moved ? 'הועבר בהצלחה' : 'הסדר עודכן', 'ok');
}

// ---------------------------------------------------------------- יצירה
async function addCourse() {
  const id = store.newKey('courses');
  await store.set('courses/' + id, { title: 'קורס חדש', order: Date.now(), created: store.TS });
  S.open.add(id);
  S.focusTitle = true;
  go('course', id);
}
async function addSession(courseId) {
  const n = sessionsOf(courseId).length + 1;
  const id = store.newKey('sessions');
  await store.set('sessions/' + id, { courseId, title: 'מפגש ' + n, order: Date.now() });
  S.open.add(courseId); S.open.add(id);
  S.focusTitle = true;
  go('session', id);
}
async function addUnit(sessionId) {
  const s = S.sessions[sessionId];
  const id = store.newKey('units');
  const key = randomKey();
  await store.update('', {
    ['units/' + id]: { courseId: s.courseId, sessionId, title: 'יחידת לימוד חדשה', order: Date.now(), count: 0, hostKey: key },
    ['hostpack/' + key]: { unitId: id, title: 'יחידת לימוד חדשה', updated: store.TS },
  });
  S.focusTitle = true;
  go('unit', id);
}

// ---------------------------------------------------------------- תוכן ראשי
function titleInput(path, value, placeholder, extraPaths) {
  const inp = h('input', {
    class: 'title-input', value: value || '', placeholder, 'aria-label': 'שם',
    oninput: () => {
      clearTimeout(S.titleTimer);
      setSave('saving');
      S.titleTimer = setTimeout(async () => {
        try {
          const title = inp.value.trim() || placeholder;
          const upd = { [path + '/title']: title };
          (extraPaths ? extraPaths() : []).forEach((p) => { upd[p] = title; });
          await store.update('', upd);
          setSave('saved');
        } catch (e) { setSave('error', e); }
      }, 500);
    },
    onkeydown: (e) => { if (e.key === 'Enter') inp.blur(); },
  });
  if (S.focusTitle) { S.focusTitle = false; setTimeout(() => { inp.focus(); inp.select(); }, 30); }
  return inp;
}

async function renderMain() {
  await flushSave();
  const { kind, id } = S.sel;
  if (kind !== 'unit') { S.itemsUnit = null; S.items = []; }
  if (!kind) return renderHome();
  if (kind === 'course') return renderCourse(id);
  if (kind === 'session') return renderSession(id);
  if (kind === 'unit') return renderUnit(id);
}
function refreshMainSoft() {
  // עדכון כרטיסים (ספירות ושמות) בלי לאבד פוקוס מכותרת שנערכת
  const active = document.activeElement;
  if (active && active.classList.contains('title-input')) return;
  renderMain();
}

function renderHome() {
  const courses = byOrder(S.courses);
  if (!courses.length) {
    main.replaceChildren(h('div', { class: 'card welcome' },
      h('h1', null, 'ברוכים הבאים לחידון חי'),
      h('p', null, 'כאן בונים משחקונים לכיתה: חידונים עם ניקוד, ענני מילים, דירוגים ובועות מחשבה.'),
      h('div', { class: 'steps3' },
        h('div', null, h('i', null, '1'), h('b', null, 'יוצרים קורס'), h('span', null, 'ובתוכו מפגשים ויחידות לימוד')),
        h('div', null, h('i', null, '2'), h('b', null, 'מוסיפים פריטים'), h('span', null, 'שאלות חידון, פעילויות ללא תחרות ושקפים')),
        h('div', null, h('i', null, '3'), h('b', null, 'מפעילים בכיתה'), h('span', null, 'הלוח מציג QR והמשתתפים עונים מהטלפון'))),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn btn-primary btn-lg', onclick: addCourse }, icon('plus'), 'יצירת קורס ראשון'),
        h('button', { class: 'btn btn-ghost btn-lg', onclick: async () => { const u = await seedSample(); go('unit', u); } }, icon('sparkle'), 'טעינת קורס לדוגמה'))));
    return;
  }
  main.replaceChildren(
    h('div', { class: 'level-tag' }, icon('book'), 'כל הקורסים'),
    h('h1', { style: { fontSize: '32px' } }, 'הקורסים שלי'),
    h('p', { class: 'muted' }, 'בחרו קורס כדי לראות את המפגשים ויחידות הלימוד שבו.'),
    h('div', { class: 'child-list' },
      courses.map((c) => {
        const sess = sessionsOf(c.id);
        const nUnits = sess.reduce((a, s) => a + unitsOf(s.id).length, 0);
        const card = h('div', { class: 'card child-card', onclick: () => go('course', c.id), role: 'button', tabindex: '0', title: 'אפשר לגרור כדי לשנות סדר' },
          h('h3', null, c.title || 'ללא שם'), h('div', { class: 'meta' }, `${fmt(sess.length)} מפגשים · ${fmt(nUnits)} יחידות לימוד`));
        dnd(card, 'course', c.id, 'h');
        return card;
      }),
      h('button', { class: 'card child-card add-card', onclick: addCourse }, icon('plus'), 'קורס חדש')));
}

function renderCourse(id) {
  const c = S.courses[id];
  const sess = sessionsOf(id);
  main.replaceChildren(
    h('div', { class: 'crumbs' }, h('button', { onclick: () => { location.hash = ''; } }, 'כל הקורסים')),
    h('div', { class: 'level-tag' }, icon('book'), 'קורס'),
    titleInput('courses/' + id, c.title, 'קורס ללא שם'),
    h('div', { class: 'section-head' }, h('h2', null, 'מפגשים בקורס')),
    h('div', { class: 'child-list' },
      sess.map((s) => {
        const card = h('div', { class: 'card child-card', onclick: () => go('session', s.id), role: 'button', tabindex: '0', title: 'אפשר לגרור כדי לשנות סדר' },
          h('div', { class: 'level-tag' }, icon('calendar'), 'מפגש'),
          h('h3', null, s.title || 'ללא שם'),
          h('div', { class: 'meta' }, `${fmt(unitsOf(s.id).length)} יחידות לימוד`));
        dnd(card, 'session', s.id, 'h');
        return card;
      }),
      h('button', { class: 'card child-card add-card', onclick: () => addSession(id) }, icon('plus'), 'מפגש חדש')),
    h('div', { class: 'danger-zone' },
      h('button', { class: 'btn btn-danger', onclick: () => deleteCourse(id) }, icon('trash'), 'מחיקת הקורס')));
}

function renderSession(id) {
  const s = S.sessions[id];
  const c = S.courses[s.courseId] || {};
  const units = unitsOf(id);
  main.replaceChildren(
    h('div', { class: 'crumbs' }, h('button', { onclick: () => go('course', s.courseId) }, c.title || 'קורס'), '›'),
    h('div', { class: 'level-tag' }, icon('calendar'), 'מפגש'),
    titleInput('sessions/' + id, s.title, 'מפגש ללא שם'),
    h('div', { class: 'section-head' }, h('h2', null, 'יחידות לימוד (משחקונים)')),
    h('div', { class: 'child-list' },
      units.map((u) => {
        const card = h('div', { class: 'card child-card', onclick: () => go('unit', u.id), role: 'button', tabindex: '0', title: 'אפשר לגרור כדי לשנות סדר' },
          h('div', { class: 'level-tag' }, icon('layers'), 'יחידת לימוד'),
          h('h3', null, u.title || 'ללא שם'),
          h('div', { class: 'meta' }, `${fmt(u.count || 0)} פריטים`),
          h('div', { class: 'row' },
            h('button', { class: 'btn btn-blue btn-sm', onclick: (e) => { e.stopPropagation(); launch(u.id); } }, icon('play'), 'הפעלה'),
            h('button', { class: 'btn btn-ghost btn-sm', onclick: (e) => { e.stopPropagation(); go('unit', u.id); } }, icon('edit'), 'עריכה')));
        dnd(card, 'unit', u.id, 'h');
        return card;
      }),
      h('button', { class: 'card child-card add-card', onclick: () => addUnit(id) }, icon('plus'), 'יחידת לימוד חדשה')),
    h('div', { class: 'danger-zone' },
      h('button', { class: 'btn btn-danger', onclick: () => deleteSession(id) }, icon('trash'), 'מחיקת המפגש')));
}

// ---------------------------------------------------------------- יחידת לימוד
const hostUrl = (key) => pageUrl('host.html', { k: key });
const playerUrl = (unitId) => pageUrl('index.html', { unit: unitId });

async function renderUnit(id) {
  const u = S.units[id];
  if (S.itemsUnit !== id) {
    main.replaceChildren(h('div', { class: 'center-screen', style: { minHeight: '40vh' } }, h('div', { class: 'spinner' })));
    const raw = await store.get('items/' + id);
    if (S.sel.id !== id) return;
    S.items = toArray(raw).map(normItem);
    S.itemsUnit = id;
  }
  const c = S.courses[u.courseId] || {};
  const s = S.sessions[u.sessionId] || {};
  S.unitHeader = h('div', { class: 'crumbs' },
    h('button', { onclick: () => go('course', u.courseId) }, c.title || 'קורס'), '›',
    h('button', { onclick: () => go('session', u.sessionId) }, s.title || 'מפגש'), '›');
  S.itemsBox = h('div', { class: 'items' });
  main.replaceChildren(
    S.unitHeader,
    h('div', { class: 'level-tag' }, icon('layers'), 'יחידת לימוד · משחקון'),
    titleInput('units/' + id, u.title, 'יחידה ללא שם', () => (S.units[id] && S.units[id].hostKey ? ['hostpack/' + S.units[id].hostKey + '/title'] : [])),
    h('div', { class: 'unit-actions' },
      h('button', { class: 'btn btn-blue btn-lg', onclick: () => launch(id) }, icon('play'), 'הפעלת המשחק'),
      h('button', { class: 'btn btn-ghost', onclick: async () => copyLink(hostUrl(await ensurePack(id)), 'הקישור להפעלה הועתק'), title: 'פותח את לוח המשחק – בלי צורך בהתחברות' }, icon('link'), 'קישור להפעלה (מרצה)'),
      h('button', { class: 'btn btn-ghost', onclick: () => copyLink(playerUrl(id), 'הקישור למשתתפים הועתק'), title: 'מוביל את המשתתפים למשחק הפעיל של היחידה' }, icon('phone'), 'קישור למשתתפים'),
      h('span', { class: 'sep' }),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => duplicateUnit(id) }, icon('copy'), 'שכפול'),
      h('button', { class: 'btn btn-danger btn-sm', onclick: () => deleteUnit(id) }, icon('trash'), 'מחיקה')),
    h('div', { class: 'hint', style: { marginTop: '-12px', marginBottom: '22px', flexWrap: 'wrap' } }, icon('info'),
      'קישור להפעלה – כל מי שמחזיק בו יכול להפעיל את המשחק בלי להתחבר (ולראות את התשובות הנכונות), לכן שלחו אותו רק למרצים. קישור למשתתפים – מוביל ישר למשחק שפועל כרגע ביחידה הזו.',
      h('button', { class: 'btn btn-ghost btn-sm', style: { marginInlineStart: '6px' }, onclick: () => resetHostLink(id), title: 'הקישור הישן יפסיק לעבוד' }, icon('refresh'), 'יצירת קישור מרצה חדש')),
    S.itemsBox,
    addBar());
  renderItems();
}

async function copyLink(url, msg) {
  const ok = await copyText(url);
  toast(ok ? msg : url, ok ? 'ok' : '');
}

async function launch(unitId) {
  if (S.itemsUnit === unitId) await flushSave();
  const items = S.itemsUnit === unitId ? S.items : toArray(await store.get('items/' + unitId)).map(normItem);
  if (!items.length) { toast('אין עדיין פריטים ביחידה הזו – הוסיפו שאלה או פעילות', 'bad'); return; }
  const bad = items.filter((it) => itemProblems(it).length);
  if (bad.length) {
    if (S.itemsUnit === unitId) markInvalid();
    const ok = await confirmDialog({
      title: 'יש פריטים לא שלמים',
      text: `${bad.length === 1 ? 'פריט אחד לא שלם' : bad.length + ' פריטים לא שלמים'} (מסומנים באדום). במשחק הם ידולגו. להפעיל בכל זאת?`,
      ok: 'להפעיל בכל זאת', cancel: 'חזרה לתיקון',
    });
    if (!ok) return;
  }
  const key = await ensurePack(unitId);
  window.open(hostUrl(key), '_blank', 'noopener');
}

/** "חבילת הפעלה": עותק של היחידה שנגיש למי שיש לו את קישור המרצה (בלי התחברות) */
function packItems(items) {
  return JSON.parse(JSON.stringify(items.map((it) => prepareItem(it)), (k, v) => (k === '_uploading' || k === '_touched' ? undefined : v)));
}
async function ensurePack(unitId) {
  if (S.itemsUnit === unitId) await flushSave();
  const u = S.units[unitId] || (await store.get('units/' + unitId)) || {};
  let key = u.hostKey;
  const items = S.itemsUnit === unitId ? S.items : toArray(await store.get('items/' + unitId)).map(normItem);
  const upd = {};
  if (!key) { key = randomKey(); upd['units/' + unitId + '/hostKey'] = key; }
  upd['hostpack/' + key] = { unitId, title: u.title || '', items: items.length ? packItems(items) : null, updated: store.TS };
  await store.update('', upd);
  return key;
}
async function resetHostLink(unitId) {
  const ok = await confirmDialog({ title: 'ליצור קישור מרצה חדש?', text: 'הקישור הקודם יפסיק לעבוד מיד. מתאים אם הקישור הגיע לאנשים שלא צריכים אותו.', ok: 'יצירת קישור חדש' });
  if (!ok) return;
  await flushSave();
  const old = S.units[unitId] && S.units[unitId].hostKey;
  if (old) await store.remove('hostpack/' + old);
  await store.update('', { ['units/' + unitId + '/hostKey']: null });
  if (S.units[unitId]) delete S.units[unitId].hostKey;
  const key = await ensurePack(unitId);
  const okc = await copyText(hostUrl(key));
  toast(okc ? 'נוצר קישור חדש והוא הועתק' : 'נוצר קישור חדש', 'ok');
}
function markInvalid() {
  S.items.forEach((it) => {
    const card = S.itemsBox && S.itemsBox.querySelector(`[data-id="${it.id}"]`);
    if (card) card.classList.toggle('invalid', itemProblems(it).length > 0);
  });
}

// ---------------------------------------------------------------- פריטים
function addBar() {
  return h('div', { class: 'add-bar' },
    h('h3', null, 'הוספת פריט ליחידה'),
    h('div', { class: 'add-types' },
      Object.entries(TYPES).map(([type, t]) => h('button', { class: 'add-type', style: `--tc:${t.color}`, onclick: () => addItem(type) },
        h('span', { class: 'ti' }, icon(t.icon)), h('b', null, t.label), h('span', null, t.desc)))));
}
function addItem(type) {
  const it = newItem(type);
  S.items.push(it);
  renderItems();
  save();
  const card = S.itemsBox.querySelector(`[data-id="${it.id}"]`);
  if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => card.querySelector('.slide-title-in, textarea').focus(), 350); }
}
function renderItems() {
  if (!S.items.length) {
    S.itemsBox.replaceChildren(h('div', { class: 'card empty-items' },
      h('b', null, 'היחידה עדיין ריקה'),
      'בחרו למטה איזה פריט להוסיף: שאלת חידון עם ניקוד, פעילות ללא תחרות, או שקף מידע.'));
    return;
  }
  S.itemsBox.replaceChildren(...S.items.map((it, i) => itemCard(it, i)));
}
function rerenderCard(it) {
  const old = S.itemsBox.querySelector(`[data-id="${it.id}"]`);
  if (old) old.replaceWith(itemCard(it, S.items.indexOf(it)));
}

function itemCard(it, idx) {
  const t = TYPES[it.type];
  const warnBox = h('div');
  const updateWarn = () => {
    const p = itemProblems(it).filter((x) => !(x === 'חסר נוסח לשאלה' && !it.text && isFresh(it)) && !(x.startsWith('השקף ריק') && !it._touched));
    warnBox.replaceChildren(...p.map((x) => h('div', { class: 'warn' }, icon('alert'), x)));
    if (!p.length) card.classList.remove('invalid');
  };
  const changed = () => { if (it.type === 'slide') it._touched = true; save(); updateWarn(); };
  const isSlide = it.type === 'slide';
  const ta = h('textarea', { class: 'textarea', rows: isSlide ? 3 : 2, maxlength: isSlide ? '6000' : '4000', placeholder: t.placeholder, 'aria-label': isSlide ? 'טקסט השקף' : 'נוסח', oninput: (e) => { it.text = e.target.value; autoGrow(e.target); changed(); } });
  ta.value = it.text;
  setTimeout(() => autoGrow(ta), 0);
  const titleIn = isSlide ? h('input', { class: 'input slide-title-in', maxlength: '200', placeholder: 'כותרת השקף (לא חובה)', 'aria-label': 'כותרת השקף', value: it.title || '', oninput: (e) => { it.title = e.target.value; changed(); } }) : null;

  const tools = h('div', { class: 'item-tools' },
    h('button', { class: 'btn btn-icon', title: 'הזזה למעלה', disabled: idx === 0, onclick: () => move(idx, -1) }, icon('up')),
    h('button', { class: 'btn btn-icon', title: 'הזזה למטה', disabled: idx === S.items.length - 1, onclick: () => move(idx, 1) }, icon('down')),
    h('button', { class: 'btn btn-icon', title: 'שכפול', onclick: () => dupItem(idx) }, icon('copy')),
    h('button', { class: 'btn btn-icon del', title: 'מחיקה', onclick: () => delItem(idx) }, icon('trash')));

  const card = h('div', { class: 'card item-card', style: `--tc:${t.color}`, 'data-id': it.id },
    h('div', { class: 'item-head' },
      h('span', { class: 'item-num' }, String(idx + 1)),
      h('span', { class: 'type-badge' }, icon(t.icon), t.label, h('span', { class: 'comp' }, isSlide ? '· לא שאלה' : t.competitive ? (it.points === 0 ? '· ללא ניקוד' : '· עם ניקוד') : '· ללא תחרות')),
      tools),
    titleIn,
    ta,
    imageField(it),
    typeFields(it, changed),
    warnBox);
  updateWarn();
  // הדבקת תמונה (Ctrl+V) כשהפוקוס בתוך הכרטיס
  card.addEventListener('paste', (e) => {
    const f = [...((e.clipboardData && e.clipboardData.files) || [])].find((x) => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); uploadImage(it, f); }
  });
  return card;
}
function isLongQ(it) { return (it.text || '').length > 220 || it.options.some((o) => o.length > 80); }
function isFresh(it) { return it.type === 'quiz' ? !it.options.some((o) => o.trim()) : true; }
function autoGrow(el) { el.style.height = 'auto'; el.style.height = Math.max(60, el.scrollHeight + 4) + 'px'; }
function growOpt(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

function selectField(label, value, options, onchange) {
  const sel = h('select', { class: 'select', onchange: (e) => onchange(Number(e.target.value)) },
    options.map(([v, l]) => h('option', { value: String(v), selected: Number(value) === v }, l)));
  return h('div', { class: 'field' }, h('label', null, label), sel);
}

// ---------------------------------------------------------------- תמונות
const IMG_BIG = store.mode === 'demo' ? [1200, 800, 0.78] : [1600, 1000, 0.82];
const IMG_SMALL = [720, 720, 0.7];
function loadImg(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
async function compress(file) {
  const url = URL.createObjectURL(file);
  try {
    const im = await loadImg(url);
    const w = im.naturalWidth;
    const hh = im.naturalHeight;
    const make = (maxW, maxH, q) => {
      const sc = Math.min(1, maxW / w, maxH / hh);
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w * sc));
      cv.height = Math.max(1, Math.round(hh * sc));
      const c = cv.getContext('2d');
      c.fillStyle = '#fff';
      c.fillRect(0, 0, cv.width, cv.height);
      c.drawImage(im, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/jpeg', q);
    };
    let data = make(...IMG_BIG);
    if (data.length > 1200000) data = make(IMG_BIG[0] * 0.75, IMG_BIG[1] * 0.75, 0.72);
    const small = make(...IMG_SMALL);
    return { data, small, w, h: hh };
  } finally { URL.revokeObjectURL(url); }
}
async function getImage(id) {
  if (!id) return null;
  if (S.imgCache.has(id)) return S.imgCache.get(id);
  const v = await store.get('images/' + id);
  if (v) S.imgCache.set(id, v);
  return v;
}
async function uploadImage(it, file) {
  if (!file || !file.type || !file.type.startsWith('image/')) { toast('אפשר להעלות רק קובץ תמונה (JPG, PNG, GIF, WebP)', 'bad'); return; }
  if (file.size > 25 * 1024 * 1024) { toast('הקובץ גדול מדי (מעל 25MB)', 'bad'); return; }
  it._uploading = true;
  rerenderCard(it);
  try {
    const img = await compress(file);
    const id = store.newKey('images');
    await store.set('images/' + id, { ...img, created: store.TS });
    S.imgCache.set(id, img);
    const old = it.image;
    it.image = id;
    if (it.imgPhone === undefined) it.imgPhone = true;
    if (old) store.remove('images/' + old).catch(() => {});
    save();
    toast('התמונה נוספה', 'ok');
  } catch (e) {
    console.error(e);
    toast('לא הצלחנו לקרוא את התמונה. נסו קובץ אחר.', 'bad');
  }
  it._uploading = false;
  rerenderCard(it);
}
function removeImage(it) {
  const old = it.image;
  delete it.image;
  delete it.imgPhone;
  if (old) store.remove('images/' + old).catch(() => {});
  save();
  rerenderCard(it);
}
async function copyImage(id) {
  const v = await getImage(id);
  if (!v) return null;
  const nid = store.newKey('images');
  await store.set('images/' + nid, { data: v.data, small: v.small || null, w: v.w || null, h: v.h || null, created: store.TS });
  return nid;
}
function imageField(it) {
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => { const f = e.target.files[0]; if (f) uploadImage(it, f); } });
  if (it._uploading) return h('div', { class: 'img-field' }, h('div', { class: 'img-drop busy' }, h('div', { class: 'spinner', style: { width: '26px', height: '26px', borderWidth: '3px' } }), 'מכינים את התמונה…'));
  if (!it.image) {
    const drop = h('button', { class: 'img-drop', type: 'button', onclick: () => file.click() },
      icon('image'), h('span', null, h('b', null, it.type === 'slide' ? 'הוספת תמונה לשקף' : 'הוספת תמונה לשאלה'), h('small', null, 'בחירה מהמחשב, גרירה לכאן או הדבקה (Ctrl+V)')));
    wireDrop(drop, it);
    return h('div', { class: 'img-field' }, drop, file);
  }
  const img = h('img', { class: 'img-prev', alt: 'תמונת השאלה', title: 'לחיצה להגדלה' });
  getImage(it.image).then((v) => { if (v) { img.src = v.data; img.onclick = () => lightbox(v.data); } else img.replaceWith(h('div', { class: 'warn' }, icon('alert'), 'התמונה לא נמצאה – העלו אותה מחדש')); });
  const phone = h('input', { type: 'checkbox', checked: it.imgPhone !== false, onchange: (e) => { it.imgPhone = e.target.checked; save(); } });
  const box = h('div', { class: 'img-field has' },
    img,
    h('div', { class: 'img-actions' },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => file.click() }, icon('refresh'), 'החלפה'),
      h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => removeImage(it) }, icon('trash'), 'הסרה'),
      h('label', { class: 'img-check' }, phone, 'להציג את התמונה גם בטלפונים'),
      file));
  wireDrop(box, it);
  return box;
}
function wireDrop(el, it) {
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('over');
    const f = [...(e.dataTransfer.files || [])].find((x) => x.type.startsWith('image/'));
    if (f) uploadImage(it, f);
  });
}

function typeFields(it, changed) {
  if (it.type === 'quiz') {
    const optRow = (o, i) => {
      const isC = it.correct.includes(i);
      const inp = h('textarea', {
        rows: 1, placeholder: `תשובה ${i + 1}`, 'aria-label': `תשובה ${i + 1} (${OPT_NAMES[i]})`, maxlength: '2000',
        title: 'Enter – מעבר לתשובה הבאה · Shift+Enter – שורה חדשה',
        oninput: (e) => { it.options[i] = e.target.value; growOpt(e.target); changed(); },
        onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const nx = e.target.closest('.opt-edit').nextElementSibling; if (nx) nx.querySelector('textarea').focus(); } },
      });
      inp.value = o;
      setTimeout(() => growOpt(inp), 0);
      return h('div', { class: `opt-edit opt-c${i}` + (isC ? ' correct' : '') },
        h('span', { class: 'chip' }, shape(i)),
        inp,
        h('button', { class: 'mark', title: 'סימון כתשובה הנכונה', 'aria-pressed': String(isC), onclick: () => { it.correct = isC ? [] : [i]; save(); rerenderCard(it); } }, icon('checkThin'), isC ? 'נכונה' : 'נכונה?'),
        it.options.length > 2 ? h('button', { class: 'rm', title: 'הסרת התשובה', onclick: () => removeOpt(it, i) }, icon('x')) : null);
    };
    return h('div', null,
      h('div', { class: 'opts' + (it.options.some((o) => o.length > 100 || o.includes('\n')) ? ' one-col' : '') }, it.options.map(optRow)),
      h('div', { class: 'row wrap', style: { marginTop: '10px' } },
        it.options.length < MAX_OPTIONS ? h('button', { class: 'btn btn-soft btn-sm', onclick: () => { it.options.push(''); save(); rerenderCard(it); } }, icon('plus'), `הוספת תשובה (עד ${MAX_OPTIONS})`) : null,
        h('button', { class: 'btn btn-soft btn-sm', onclick: () => { it.options = ['נכון', 'לא נכון']; it.correct = []; save(); rerenderCard(it); } }, 'נכון / לא נכון')),
      h('div', { class: 'item-settings' },
        selectField('זמן לתשובה', it.time, [[5, '5 שניות'], [10, '10 שניות'], [15, '15 שניות'], [20, '20 שניות'], [30, '30 שניות'], [45, '45 שניות'], [60, 'דקה'], [90, 'דקה וחצי'], [120, '2 דקות']], (v) => { it.time = v; changed(); }),
        selectField('ניקוד', it.points, [[1, 'רגיל (עד 1,000)'], [2, 'כפול (עד 2,000)'], [0, 'ללא ניקוד – תרגול']], (v) => { it.points = v; save(); rerenderCard(it); })),
      isLongQ(it) ? h('div', { class: 'hint' }, icon('info'), 'שאלה ארוכה: על הלוח הטקסט יוקטן אוטומטית כדי להיכנס. כדאי לתת לה יותר זמן לתשובה.') : null);
  }
  if (it.type === 'wordcloud') {
    return h('div', null,
      h('div', { class: 'item-settings' },
        selectField('כמה מילים כל משתתף יכול לשלוח', it.maxWords || 3, [[1, 'מילה אחת'], [2, '2 מילים'], [3, '3 מילים'], [5, '5 מילים']], (v) => { it.maxWords = v; changed(); })),
      h('div', { class: 'hint' }, icon('info'), 'מילים שחוזרות על עצמן גדלות בענן. המילים מוצגות בלי שמות, ולחיצה על מילה בלוח מסתירה אותה.'));
  }
  if (it.type === 'rating') {
    const row = (c, i) => h('div', { class: 'crit-row' },
      h('span', { class: 'n' }, String(i + 1)),
      h('input', { class: 'input', value: c, placeholder: 'שם הקריטריון, למשל: בהירות ההסבר', maxlength: '150', oninput: (e) => { it.criteria[i] = e.target.value; changed(); } }),
      it.criteria.length > 1 ? h('button', { class: 'btn btn-icon btn-ghost', title: 'הסרה', onclick: () => { it.criteria.splice(i, 1); save(); rerenderCard(it); } }, icon('x')) : null);
    return h('div', null,
      h('div', { class: 'crit-list' }, it.criteria.map(row)),
      it.criteria.length < 8 ? h('button', { class: 'btn btn-soft btn-sm', style: { marginTop: '10px' }, onclick: () => { it.criteria.push(''); save(); rerenderCard(it); } }, icon('plus'), 'הוספת קריטריון') : null,
      h('div', { class: 'hint' }, icon('info'), 'כל משתתף מדרג כל קריטריון מ-1 עד 10. על הלוח מוצגים הממוצע וההתפלגות – בלי שמות.'));
  }
  if (it.type === 'slide') {
    return h('div', { class: 'hint' }, icon('info'), 'שקף הוא לא שאלה: הוא מוצג על הלוח ובטלפונים, בלי תשובות ובלי ניקוד. אפשר כותרת, טקסט, תמונה או כל שילוב – והגודל מותאם אוטומטית.');
  }
  if (it.type === 'bubbles') {
    return h('div', null,
      h('div', { class: 'item-settings' },
        selectField('כמה תשובות כל משתתף יכול לשלוח', it.maxPosts || 2, [[1, 'תשובה אחת'], [2, '2 תשובות'], [3, '3 תשובות'], [5, '5 תשובות']], (v) => { it.maxPosts = v; changed(); })),
      h('div', { class: 'hint' }, icon('eyeOff'), 'התשובות אנונימיות לגמרי – לא נשמר מי כתב מה. לחיצה על בועה בלוח מסתירה אותה.'));
  }
  return null;
}
function removeOpt(it, i) {
  it.options.splice(i, 1);
  it.correct = it.correct.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c));
  save();
  rerenderCard(it);
}
function move(idx, d) {
  const j = idx + d;
  if (j < 0 || j >= S.items.length) return;
  [S.items[idx], S.items[j]] = [S.items[j], S.items[idx]];
  save();
  renderItems();
}
async function dupItem(idx) {
  const copy = JSON.parse(JSON.stringify(S.items[idx]));
  copy.id = uid8();
  delete copy._uploading;
  if (copy.image) copy.image = await copyImage(copy.image);
  if (!copy.image) { delete copy.image; delete copy.imgPhone; }
  S.items.splice(idx + 1, 0, copy);
  save();
  renderItems();
}
async function delItem(idx) {
  const it = S.items[idx];
  if (it.text.trim()) {
    const ok = await confirmDialog({ title: 'למחוק את הפריט?', text: `"${it.text.trim().slice(0, 60)}"`, ok: 'מחיקה', danger: true });
    if (!ok) return;
  }
  S.items.splice(idx, 1);
  if (it.image) store.remove('images/' + it.image).catch(() => {});
  save();
  renderItems();
}

// ---------------------------------------------------------------- שמירה
function setSave(state, err) {
  if (!saveEl) return;
  saveEl.className = 'save-state ' + state;
  saveEl.replaceChildren(
    state === 'saving' ? 'שומר…' : state === 'saved' ? h('span', { class: 'row', style: { gap: '4px' } }, icon('checkThin'), 'כל השינויים נשמרו') : state === 'error' ? 'השמירה נכשלה – ' + friendlyError(err) : '');
  if (state === 'saved') { clearTimeout(S.savedFade); S.savedFade = setTimeout(() => { if (saveEl.classList.contains('saved')) saveEl.replaceChildren(); }, 3500); }
}
function save() {
  setSave('saving');
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(doSave, 600);
}
async function doSave() {
  S.saveTimer = null;
  const id = S.itemsUnit;
  if (!id) return;
  const items = JSON.parse(JSON.stringify(S.items, (k, v) => (k === '_uploading' || k === '_touched' ? undefined : v)));
  try {
    const upd = { ['items/' + id]: items.length ? items : null, ['units/' + id + '/count']: items.length, ['units/' + id + '/updated']: store.TS };
    const u = S.units[id] || {};
    let key = u.hostKey;
    if (!key) { key = randomKey(); upd['units/' + id + '/hostKey'] = key; }
    upd['hostpack/' + key] = { unitId: id, title: u.title || '', items: items.length ? packItems(items) : null, updated: store.TS };
    await store.update('', upd);
    setSave('saved');
  } catch (e) { setSave('error', e); }
}
async function flushSave() {
  if (S.saveTimer) { clearTimeout(S.saveTimer); await doSave(); }
}

// ---------------------------------------------------------------- שכפול / מחיקה
async function duplicateUnit(id) {
  await flushSave();
  const u = S.units[id];
  const nid = store.newKey('units');
  const src = S.itemsUnit === id ? S.items : toArray(await store.get('items/' + id));
  const items = [];
  for (const it of src) {
    const c = { ...JSON.parse(JSON.stringify(it)), id: uid8() };
    delete c._uploading;
    if (c.image) c.image = await copyImage(c.image);
    if (!c.image) { delete c.image; delete c.imgPhone; }
    items.push(c);
  }
  const nkey = randomKey();
  const ntitle = (u.title || '') + ' (עותק)';
  await store.update('', {
    ['units/' + nid]: { courseId: u.courseId, sessionId: u.sessionId, title: ntitle, order: Date.now(), count: items.length, hostKey: nkey },
    ['items/' + nid]: items.length ? items : null,
    ['hostpack/' + nkey]: { unitId: nid, title: ntitle, items: items.length ? packItems(items.map(normItem)) : null, updated: store.TS },
  });
  toast('היחידה שוכפלה', 'ok');
  go('unit', nid);
}
async function deleteUnit(id) {
  const u = S.units[id];
  const ok = await confirmDialog({ title: 'למחוק את יחידת הלימוד?', text: `"${u.title}" וכל הפריטים שבה יימחקו. אי אפשר לבטל.`, ok: 'מחיקה', danger: true });
  if (!ok) return;
  clearTimeout(S.saveTimer); S.saveTimer = null;
  S.itemsUnit = null;
  const upd = { ['units/' + id]: null, ['items/' + id]: null, ['live/' + id]: null };
  await addImageDeletes(upd, [id]);
  await store.update('', upd);
  toast('היחידה נמחקה');
  go('session', u.sessionId);
}
async function deleteSession(id) {
  const s = S.sessions[id];
  const units = unitsOf(id);
  const ok = await confirmDialog({ title: 'למחוק את המפגש?', text: `"${s.title}" ו-${units.length} יחידות הלימוד שבו יימחקו. אי אפשר לבטל.`, ok: 'מחיקה', danger: true });
  if (!ok) return;
  const upd = { ['sessions/' + id]: null };
  units.forEach((u) => { upd['units/' + u.id] = null; upd['items/' + u.id] = null; upd['live/' + u.id] = null; });
  await addImageDeletes(upd, units.map((u) => u.id));
  await store.update('', upd);
  toast('המפגש נמחק');
  go('course', s.courseId);
}
async function deleteCourse(id) {
  const c = S.courses[id];
  const sess = sessionsOf(id);
  const ok = await confirmDialog({ title: 'למחוק את הקורס?', text: `"${c.title}" על כל ${sess.length} המפגשים והיחידות שבו יימחק. אי אפשר לבטל.`, ok: 'מחיקת הקורס', danger: true });
  if (!ok) return;
  const upd = { ['courses/' + id]: null };
  const unitIds = [];
  sess.forEach((s) => {
    upd['sessions/' + s.id] = null;
    unitsOf(s.id).forEach((u) => { unitIds.push(u.id); upd['units/' + u.id] = null; upd['items/' + u.id] = null; upd['live/' + u.id] = null; });
  });
  await addImageDeletes(upd, unitIds);
  await store.update('', upd);
  toast('הקורס נמחק');
  location.hash = '';
}

async function addImageDeletes(upd, unitIds) {
  for (const uid of unitIds) {
    if (S.units[uid] && S.units[uid].hostKey) upd['hostpack/' + S.units[uid].hostKey] = null;
    const items = S.itemsUnit === uid ? S.items : toArray(await store.get('items/' + uid));
    items.forEach((it) => { if (it && it.image) upd['images/' + it.image] = null; });
  }
}

// ---------------------------------------------------------------- קורס לדוגמה
async function seedSample() {
  const cid = store.newKey('courses');
  const sid = store.newKey('sessions');
  const uid = store.newKey('units');
  const seedKey = randomKey();
  const items = [
    { id: uid8(), type: 'slide', title: 'ברוכים הבאים!', text: 'במשחקון הקצר הזה נכיר את ערכי הליבה של המשרד.\nענו מהטלפון – תשובה נכונה ומהירה מזכה ביותר נקודות.' },
    { id: uid8(), type: 'quiz', text: 'איזה מהבאים הוא אחד מערכי הליבה של המשרד?', options: ['אובייקטיביות ואי-תלות', 'רווחיות', 'תחרותיות', 'מהירות על פני דיוק'], correct: [0], time: 20, points: 1 },
    { id: uid8(), type: 'wordcloud', text: 'במילה אחת – מה הופך ביקורת לביקורת טובה?', maxWords: 2 },
    { id: uid8(), type: 'quiz', text: 'נכון או לא נכון: נציבות תלונות הציבור מבררת תלונות המתקבלות מכל אדם.', options: ['נכון', 'לא נכון'], correct: [0], time: 15, points: 1 },
    { id: uid8(), type: 'rating', text: 'איך היה המפגש עד עכשיו?', criteria: ['בהירות התוכן', 'רלוונטיות לעבודה שלי', 'עניין והשתתפות'] },
    { id: uid8(), type: 'quiz', text: 'כמה ערכי ליבה מופיעים בספר המותג של המשרד?', options: ['5', '6', '7', '8'], correct: [2], time: 20, points: 2 },
    { id: uid8(), type: 'bubbles', text: 'מה תיקחו איתכם מהמפגש היום?', maxPosts: 2 },
  ];
  await store.update('', {
    ['courses/' + cid]: { title: 'קורס לדוגמה: היכרות עם המשרד', order: Date.now(), created: store.TS },
    ['sessions/' + sid]: { courseId: cid, title: 'מפגש 1 – ערכים ושליחות', order: Date.now() },
    ['units/' + uid]: { courseId: cid, sessionId: sid, title: 'ערכי הליבה – משחקון פתיחה', order: Date.now(), count: items.length, hostKey: seedKey },
    ['items/' + uid]: items,
    ['hostpack/' + seedKey]: { unitId: uid, title: 'ערכי הליבה – משחקון פתיחה', items: packItems(items.map(normItem)), updated: store.TS },
  });
  S.open.add(cid); S.open.add(sid); saveOpen();
  return uid;
}

boot().catch((e) => {
  console.error(e);
  app.replaceChildren(h('div', { class: 'center-screen' }, h('div', { class: 'card login-card' }, h('h1', null, 'שגיאה בטעינה'), h('p', null, friendlyError(e)))));
});
