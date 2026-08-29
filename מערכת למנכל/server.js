/*
 * מתרגם חי — שרת מקומי
 * ---------------------------------
 * מגיש את הממשק ב-http://localhost:8765
 * מתווך בקשות תרגום ושומר תמלילים לדיסק. ללא תלויות — רק Node.js.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8765);
const ROOT = __dirname;
const TRANSCRIPT_DIR = path.join(ROOT, 'transcripts');
if (!fs.existsSync(TRANSCRIPT_DIR)) fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });

/* חיבור מתמיד — חוסך לחיצת יד מחדש בכל תרגום (כ-200-400 מ״ש לבקשה) */
const agent = new https.Agent({ keepAlive: true, keepAliveMsecs: 30000, maxSockets: 8 });

function httpsGet(url, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        agent,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          Accept: '*/*',
          'Accept-Encoding': 'identity',
          Connection: 'keep-alive',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return httpsGet(res.headers.location, timeoutMs).then(resolve, reject);
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
          resolve(data);
        });
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/* ---------- ספקי תרגום ----------
   נמדד בפועל: clients5 מהיר פי 3 מ-translate.googleapis, ולכן הוא ראשון. */
const GOOGLE_LANG = { he: 'iw', iw: 'iw', es: 'es', en: 'en', ca: 'ca' };
const L = (x) => GOOGLE_LANG[x] || x;

const providers = [
  {
    name: 'fast',
    async run(q, sl, tl) {
      const raw = await httpsGet(
        'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=' + L(sl) + '&tl=' + L(tl) +
        '&q=' + encodeURIComponent(q)
      );
      const j = JSON.parse(raw);
      let out = '';
      if (Array.isArray(j)) out = j.map((x) => (typeof x === 'string' ? x : (x && x[0]) || '')).join(' ');
      else if (j && j.sentences) out = j.sentences.map((s) => s.trans || '').join('');
      if (!out.trim()) throw new Error('empty');
      return out;
    },
  },
  {
    name: 'google',
    async run(q, sl, tl) {
      const raw = await httpsGet(
        'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=' + L(sl) + '&tl=' + L(tl) +
        '&q=' + encodeURIComponent(q)
      );
      const j = JSON.parse(raw);
      if (!Array.isArray(j) || !Array.isArray(j[0])) throw new Error('bad shape');
      const out = j[0].map((seg) => (seg && seg[0]) || '').join('');
      if (!out.trim()) throw new Error('empty');
      return out;
    },
  },
  {
    name: 'mymemory',
    async run(q, sl, tl) {
      const raw = await httpsGet(
        'https://api.mymemory.translated.net/get?langpair=' + encodeURIComponent(sl) + '|' +
        encodeURIComponent(L(tl) === 'iw' ? 'he' : tl) + '&q=' + encodeURIComponent(q)
      );
      const j = JSON.parse(raw);
      const out = j && j.responseData && j.responseData.translatedText;
      if (!out || !String(out).trim()) throw new Error('empty');
      if (/^MYMEMORY WARNING/i.test(out)) throw new Error('quota');
      return String(out);
    },
  },
];

/* ---------- מטמון ---------- */
const cache = new Map();
const CACHE_MAX = 6000;
function cacheGet(k) {
  if (!cache.has(k)) return null;
  const v = cache.get(k);
  cache.delete(k); cache.set(k, v);
  return v;
}
function cacheSet(k, v) {
  cache.set(k, v);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

let lastGood = 0;
async function translate(q, sl, tl) {
  const key = sl + '>' + tl + '>' + q;
  const hit = cacheGet(key);
  if (hit) return { text: hit, provider: 'cache' };

  const order = [];
  for (let i = 0; i < providers.length; i++) order.push(providers[(lastGood + i) % providers.length]);

  const errors = [];
  for (const p of order) {
    try {
      const text = await p.run(q, sl, tl);
      lastGood = providers.indexOf(p);
      cacheSet(key, text);
      return { text, provider: p.name };
    } catch (e) {
      errors.push(p.name + ': ' + e.message);
    }
  }
  throw new Error(errors.join(' | '));
}

/* ---------- שמירת תמליל ----------
   הלקוח מרכיב את הקבצים; השרת רק כותב אותם, כדי ששמור == מוצג. */
function safeName(s) {
  return String(s || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 90) || 'session';
}
function saveTranscript(session, txt, html) {
  const base = path.join(TRANSCRIPT_DIR, safeName(session));
  const out = {};
  if (typeof txt === 'string') { fs.writeFileSync(base + '.txt', '﻿' + txt, 'utf8'); out.txt = base + '.txt'; }
  if (typeof html === 'string') { fs.writeFileSync(base + '.html', html, 'utf8'); out.html = base + '.html'; }
  return out;
}

/* ---------- שרת ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}
function readBody(req, limit = 32 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > limit) reject(new Error('too large')); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  let u;
  try { u = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, '{"error":"bad url"}'); }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    });
    return res.end();
  }

  const p = u.pathname.replace(/^\/+/, '/');

  if (p === '/api/translate') {
    const q = (u.searchParams.get('q') || '').trim();
    const sl = u.searchParams.get('sl') || 'es';
    const tl = u.searchParams.get('tl') || 'he';
    if (!q) return send(res, 200, JSON.stringify({ text: '', provider: 'none' }));
    try {
      return send(res, 200, JSON.stringify(await translate(q, sl, tl)));
    } catch (e) {
      return send(res, 502, JSON.stringify({ error: String(e.message || e) }));
    }
  }

  if (p === '/api/health') {
    return send(res, 200, JSON.stringify({ ok: true, port: PORT, node: process.version, time: new Date().toISOString() }));
  }

  if (p === '/api/save' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      return send(res, 200, JSON.stringify({ ok: true, files: saveTranscript(body.session, body.txt, body.html) }));
    } catch (e) {
      return send(res, 500, JSON.stringify({ error: String(e.message || e) }));
    }
  }

  let file = p === '/' ? '/index.html' : p;
  file = decodeURIComponent(file).replace(/\.\./g, '');
  const full = path.join(ROOT, file);
  if (!full.startsWith(ROOT)) return send(res, 403, '{"error":"forbidden"}');
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, '{"error":"not found"}');
    send(res, 200, data, MIME[path.extname(full).toLowerCase()] || 'application/octet-stream');
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('\n  !! Port ' + PORT + ' is busy - the server is probably already running.');
    console.error('     Just open:  http://localhost:' + PORT + '\n');
  } else {
    console.error('Server error:', e.message);
  }
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  ==========================================');
  console.log('   Live Translator  ES -> HE   |   RUNNING');
  console.log('  ==========================================');
  console.log('');
  console.log('   URL:         http://localhost:' + PORT);
  console.log('   Transcripts: ' + TRANSCRIPT_DIR);
  console.log('');
  console.log('   Keep this window open while you use the app.');
  console.log('   To stop: press Ctrl+C or close this window.');
  console.log('');
  /* חימום החיבור מראש כדי שהתרגום הראשון לא ייתקע */
  translate('hola', 'es', 'he').catch(() => {});
});
