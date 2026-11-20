// שכבת נתונים: Firebase (מצב אמיתי) או מצב הדגמה מקומי (בלי שרת, בתוך דפדפן אחד).
import { initializeApp } from 'firebase/app';
import {
  getDatabase, ref, get, set, update, push, remove, onValue, serverTimestamp, onDisconnect, query, orderByChild, endAt,
} from 'firebase/database';
import { getAuth, signInAnonymously, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';

const CFG = window.QUIZ_CONFIG || {};
const hasFirebase = !!(CFG.firebase && CFG.firebase.apiKey && CFG.firebase.databaseURL);

// ---------------------------------------------------------------------------
class FirebaseStore {
  constructor(conf) {
    this.mode = 'firebase';
    this.app = initializeApp(conf);
    this.db = getDatabase(this.app);
    this.auth = getAuth(this.app);
    this.offset = 0;
    this.TS = serverTimestamp();
    onValue(ref(this.db, '.info/serverTimeOffset'), (s) => { this.offset = s.val() || 0; });
    this._admin = false;
    // מרצה = משתמש שמופיע ברשימת admins במסד הנתונים (אין בקוד שום מייל או סיסמה)
    this.authReady = new Promise((res) => {
      const un = onAuthStateChanged(this.auth, async (u) => {
        un();
        this._admin = await this._checkAdmin(u);
        res(u);
      });
    });
  }
  async _checkAdmin(u) {
    if (!u || u.isAnonymous) return false;
    try { return (await get(ref(this.db, 'admins/' + u.uid))).val() === true; } catch { return false; }
  }
  uid() { return this.auth.currentUser ? this.auth.currentUser.uid : null; }
  isAdmin() {
    const u = this.auth.currentUser;
    return !!u && !u.isAnonymous && this._admin;
  }
  async ensureUser() {
    await this.authReady;
    if (!this.auth.currentUser) await signInAnonymously(this.auth);
    return this.auth.currentUser.uid;
  }
  async login(email, password) {
    const cred = await signInWithEmailAndPassword(this.auth, String(email || '').trim(), password);
    this._admin = await this._checkAdmin(cred.user);
    if (!this._admin) {
      await signOut(this.auth);
      const e = new Error('not-admin');
      e.code = 'not-admin';
      throw e;
    }
  }
  async logout() { await signOut(this.auth); }
  r(p) { return p ? ref(this.db, p) : ref(this.db); }
  async get(p) { return (await get(this.r(p))).val(); }
  set(p, v) { return set(this.r(p), v); }
  update(p, obj) { return update(this.r(p), obj); }
  remove(p) { return remove(this.r(p)); }
  newKey(p) { return push(this.r(p)).key; }
  async push(p, v) { const r = push(this.r(p)); await set(r, v); return r.key; }
  on(p, cb, onErr) {
    return onValue(this.r(p), (s) => cb(s.val()), (err) => { console.warn('listen failed', p, err); if (onErr) onErr(err); });
  }
  now() { return Date.now() + this.offset; }
  /** מסמן נוכחות: true כשמחובר, false כשהחיבור נסגר */
  presence(p) {
    return onValue(ref(this.db, '.info/connected'), (s) => {
      if (s.val() === true) {
        onDisconnect(this.r(p)).set(false).then(() => set(this.r(p), true)).catch(() => {});
      }
    });
  }
  async olderThan(p, childPath, maxVal) {
    const s = await get(query(this.r(p), orderByChild(childPath), endAt(maxVal)));
    return s.val() || {};
  }
}

// ---------------------------------------------------------------------------
// מצב הדגמה: עץ נתונים ב-localStorage, סנכרון בין לשוניות עם BroadcastChannel
const DEMO_KEY = 'livequiz-demo-db-v1';
function clone(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }
function parts(p) { return String(p).split('/').filter(Boolean); }

class DemoStore {
  constructor() {
    this.mode = 'demo';
    this.TS = { '.sv': 'timestamp' };
    this.tree = this._load();
    this.listeners = new Set();
    let id = sessionStorage.getItem('livequiz-demo-uid');
    if (!id) { id = 'u' + Math.random().toString(36).slice(2, 11); sessionStorage.setItem('livequiz-demo-uid', id); }
    this._uid = id;
    this.authReady = Promise.resolve();
    // כל לשונית מחזיקה עותק בזיכרון; שינויים נשלחים כ"פעולות" לשאר הלשוניות
    if ('BroadcastChannel' in window) {
      this.ch = new BroadcastChannel('livequiz-demo');
      this.ch.onmessage = (e) => { if (Array.isArray(e.data)) { for (const [p, v] of e.data) this._setAt(p, v); this._emit(); } };
    } else {
      window.addEventListener('storage', (e) => { if (e.key === DEMO_KEY) { this.tree = this._load(); this._emit(); } });
    }
  }
  _load() { try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || {}; } catch { return {}; } }
  _write(ops) {
    ops = ops.map(([p, v]) => [p, v === undefined ? null : this._resolve(clone(v))]);
    for (const [p, v] of ops) this._setAt(p, v);
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(this.tree)); } catch {}
    if (this.ch) this.ch.postMessage(ops);
    this._emit();
  }
  _resolve(v) {
    if (v && typeof v === 'object') {
      if (v['.sv'] === 'timestamp') return Date.now();
      const o = Array.isArray(v) ? [] : {};
      for (const k of Object.keys(v)) o[k] = this._resolve(v[k]);
      return o;
    }
    return v;
  }
  _getAt(p) {
    let cur = this.tree;
    for (const k of parts(p)) { if (cur === null || typeof cur !== 'object') return null; cur = cur[k]; }
    return cur === undefined ? null : cur;
  }
  _setAt(p, v) {
    const ks = parts(p);
    if (!ks.length) { this.tree = v || {}; return; }
    let cur = this.tree;
    const chain = [];
    for (let i = 0; i < ks.length - 1; i++) {
      if (cur[ks[i]] === null || typeof cur[ks[i]] !== 'object') {
        if (v === null || v === undefined) return;
        cur[ks[i]] = {};
      }
      chain.push([cur, ks[i]]);
      cur = cur[ks[i]];
    }
    const last = ks[ks.length - 1];
    if (v === null || v === undefined) {
      if (Array.isArray(cur)) cur[last] = null; else delete cur[last];
      // ניקוי הורים ריקים
      for (let i = chain.length - 1; i >= 0; i--) {
        const [obj, key] = chain[i];
        const child = obj[key];
        if (child && typeof child === 'object' && Object.keys(child).filter((k) => child[k] !== null).length === 0) delete obj[key];
        else break;
      }
    } else cur[last] = this._resolve(clone(v));
  }
  _emit() {
    for (const l of this.listeners) {
      const v = this._getAt(l.path);
      const j = JSON.stringify(v);
      if (j !== l.last) { l.last = j; try { l.cb(clone(v)); } catch (e) { console.error(e); } }
    }
  }
  uid() { return this._uid; }
  isAdmin() { return sessionStorage.getItem('livequiz-demo-admin') === '1' || localStorage.getItem('livequiz-demo-admin') === '1'; }
  async ensureUser() { return this._uid; }
  async login() { localStorage.setItem('livequiz-demo-admin', '1'); }
  async logout() { localStorage.removeItem('livequiz-demo-admin'); sessionStorage.removeItem('livequiz-demo-admin'); }
  async get(p) { return clone(this._getAt(p)); }
  async set(p, v) { this._write([[p, v]]); }
  async update(p, obj) { this._write(Object.entries(obj).map(([k, v]) => [parts(p).concat(parts(k)).join('/'), v])); }
  async remove(p) { this._write([[p, null]]); }
  newKey() { return Date.now().toString(36).padStart(9, '0') + Math.random().toString(36).slice(2, 7); }
  async push(p, v) { const k = this.newKey(); await this.set(p + '/' + k, v); return k; }
  on(p, cb) {
    const l = { path: p, cb, last: undefined };
    this.listeners.add(l);
    queueMicrotask(() => { if (!this.listeners.has(l)) return; const v = this._getAt(p); l.last = JSON.stringify(v); cb(clone(v)); });
    return () => this.listeners.delete(l);
  }
  now() { return Date.now(); }
  presence(p) {
    this.set(p, true);
    const off = () => { try { this._write([[p, false]]); } catch {} };
    window.addEventListener('pagehide', off);
    return () => window.removeEventListener('pagehide', off);
  }
  async olderThan(p, childPath, maxVal) {
    const all = this._getAt(p) || {};
    const out = {};
    for (const [k, v] of Object.entries(all)) {
      const val = parts(childPath).reduce((o, kk) => (o ? o[kk] : undefined), v);
      if (val !== undefined && val <= maxVal) out[k] = v;
    }
    return out;
  }
}

export const store = hasFirebase ? new FirebaseStore(CFG.firebase) : new DemoStore();

/** הודעת שגיאה ידידותית לשגיאות Firebase */
export function friendlyError(e) {
  const code = (e && (e.code || e.message)) || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login|invalid-email|missing-password/.test(code)) return 'המייל או הסיסמה שגויים. נסו שוב.';
  if (/not-admin/.test(code)) return 'המשתמש הזה עדיין לא הוגדר כמרצה (צריך להוסיף אותו לרשימת admins – ראו מדריך ההתקנה).';
  if (/too-many-requests/.test(code)) return 'יותר מדי ניסיונות. המתינו דקה ונסו שוב.';
  if (/network/.test(code)) return 'אין חיבור לאינטרנט. בדקו את החיבור ונסו שוב.';
  if (/operation-not-allowed|admin-restricted/.test(code)) return 'שיטת הכניסה לא הופעלה ב-Firebase (Authentication › Sign-in method). ראו מדריך ההתקנה.';
  if (/PERMISSION_DENIED|permission/i.test(code)) return 'אין הרשאה לפעולה הזו.';
  return 'משהו השתבש. נסו שוב. (' + code + ')';
}
