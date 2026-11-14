// Shadab Dental Care — website + appointment booking server.
// Uses only Node.js built-ins (Node 22.5+). Start with: node server.js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const CONFIG_PATH = path.join(ROOT, 'clinic.json');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'appointments.sqlite');
const KEY_PATH = path.join(path.dirname(DB_PATH), 'admin-key.txt');

// ---------- database ----------
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  visit_date TEXT NOT NULL,
  visit_time TEXT NOT NULL,
  reason TEXT,
  concern TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);`);
// Upgrade databases created by the earlier version of this project.
const cols = new Set(db.prepare('PRAGMA table_info(appointments)').all().map(c => c.name));
if (!cols.has('status')) db.exec("ALTER TABLE appointments ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed'");
if (!cols.has('reason')) db.exec('ALTER TABLE appointments ADD COLUMN reason TEXT');
if (!cols.has('updated_at')) db.exec('ALTER TABLE appointments ADD COLUMN updated_at TEXT');
// Only one *confirmed* booking per slot; cancelled bookings free the slot.
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS one_booking_per_slot ON appointments(visit_date, visit_time) WHERE status='confirmed'");

// ---------- admin key ----------
let ADMIN_KEY = process.env.ADMIN_KEY || '';
if (!ADMIN_KEY) {
  try { ADMIN_KEY = fs.readFileSync(KEY_PATH, 'utf8').trim(); } catch {}
  if (!ADMIN_KEY) {
    ADMIN_KEY = crypto.randomBytes(12).toString('base64url');
    fs.writeFileSync(KEY_PATH, ADMIN_KEY + '\n', { mode: 0o600 });
  }
}
const isAdmin = req => {
  const given = Buffer.from(String(req.headers['x-admin-key'] || ''));
  const real = Buffer.from(ADMIN_KEY);
  return given.length === real.length && crypto.timingSafeEqual(given, real);
};

// ---------- config ----------
const config = () => JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const publicConfig = c => {
  const out = { ...c };
  delete out._help;
  return out;
};

// ---------- booking alerts (WhatsApp via CallMeBot, or SMS via Fast2SMS) ----------
const NOTIFY_PATH = path.join(ROOT, 'notify.json');
function notifySettings() {
  let n = {};
  try { n = JSON.parse(fs.readFileSync(NOTIFY_PATH, 'utf8')); } catch {}
  return {
    to: process.env.NOTIFY_TO || n.to || '',
    callmebot: process.env.CALLMEBOT_APIKEY || n.callmebotApiKey || '',
    fast2sms: process.env.FAST2SMS_APIKEY || n.fast2smsApiKey || ''
  };
}
function notifyStatus() {
  const s = notifySettings();
  if (!digits(s.to)) return 'off (no number in notify.json)';
  const via = [s.callmebot && 'WhatsApp', s.fast2sms && 'SMS'].filter(Boolean);
  return via.length ? `${via.join(' + ')} to ${s.to}` : `not set up yet: add a key in notify.json to send alerts to ${s.to}`;
}
async function sendAlert(text) {
  const s = notifySettings();
  let num = digits(s.to);
  if (!num) return [{ via: 'none', ok: false, error: 'No number set in notify.json' }];
  if (num.length === 10) num = '91' + num; // assume India for 10-digit numbers
  const results = [];
  if (s.callmebot) {
    try {
      const url = `https://api.callmebot.com/whatsapp.php?phone=${num}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(s.callmebot)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const body = (await r.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      const ok = r.ok && /queued|sent/i.test(body);
      results.push({ via: 'WhatsApp', ok, error: ok ? undefined : body || `HTTP ${r.status}` });
    } catch (e) { results.push({ via: 'WhatsApp', ok: false, error: e.message }); }
  }
  if (s.fast2sms) {
    try {
      const r = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { authorization: s.fast2sms, 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: 'q', message: text, language: 'english', flash: 0, numbers: num.slice(-10) })
      });
      const data = await r.json().catch(() => ({}));
      const ok = r.ok && data.return === true;
      results.push({ via: 'SMS', ok, error: ok ? undefined : [].concat(data.message || `HTTP ${r.status}`).join(' ') });
    } catch (e) { results.push({ via: 'SMS', ok: false, error: e.message }); }
  }
  if (!results.length) results.push({ via: 'none', ok: false, error: 'No WhatsApp or SMS key in notify.json yet' });
  for (const r of results) console.log(`[alert] ${r.via}: ${r.ok ? 'sent' : 'FAILED - ' + r.error}`);
  return results;
}
const prettyWhen = (date, time) => {
  const d = new Date(`${date}T${time}:00`);
  return `${d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
};
const bookingAlert = a => [
  'New booking - Shadab Dental Care',
  `Name: ${a.name}`,
  `Phone: ${a.phone}`,
  `When: ${prettyWhen(a.date, a.time)}`,
  a.reason ? `Reason: ${a.reason}` : null,
  `Note: ${a.concern.slice(0, 300)}`,
  `Ref: ${a.reference}`
].filter(Boolean).join('\n');
const cancelAlert = a => `Booking CANCELLED by patient - Shadab Dental Care\nName: ${a.name}\nPhone: ${a.phone}\nWas: ${prettyWhen(a.visit_date, a.visit_time)}\nRef: ${a.reference}`;

// ---------- helpers ----------
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};
const send = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};
const pad = n => String(n).padStart(2, '0');
const dateText = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const validDate = s => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00`);
  return !Number.isNaN(d.valueOf()) && dateText(d) === s;
};
const toMinutes = x => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
const digits = s => String(s || '').replace(/\D/g, '');
const clean = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const REASONS = ['Check-up', 'Cleaning', 'Tooth pain', 'Sensitivity', 'Broken or chipped tooth', 'Gum concern', 'Cosmetic question', 'Child’s visit', 'Second opinion', 'Something else'];

function bookingWindow(c) {
  const today = new Date();
  const max = new Date(today);
  max.setDate(max.getDate() + Math.min(Math.max(Number(c.bookingDaysAhead) || 90, 1), 365));
  return { min: dateText(today), max: dateText(max) };
}
function inWindow(date, c) {
  const w = bookingWindow(c);
  return validDate(date) && date >= w.min && date <= w.max;
}
function slotsFor(date, c) {
  if (!validDate(date) || (c.closedDates || []).includes(date)) return [];
  const hours = c.weeklyHours?.[String(new Date(`${date}T12:00:00`).getDay())];
  if (!Array.isArray(hours) || hours.length !== 2) return [];
  const [start, end] = hours.map(toMinutes);
  const size = Number(c.slotMinutes);
  if (![start, end, size].every(Number.isFinite) || size < 10 || size > 180 || end <= start) return [];
  const booked = new Set(db.prepare("SELECT visit_time FROM appointments WHERE visit_date=? AND status='confirmed'").all(date).map(x => x.visit_time));
  const now = new Date();
  const out = [];
  for (let t = start; t + size <= end; t += size) {
    const time = `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
    if (new Date(`${date}T${time}:00`) > now && !booked.has(time)) out.push(time);
  }
  return out;
}
async function readBody(req) {
  let s = '';
  for await (const chunk of req) { s += chunk; if (s.length > 12000) throw new Error('too large'); }
  return JSON.parse(s || '{}');
}
const limits = new Map();
function limited(key, max = 12) {
  const now = Date.now();
  const old = limits.get(key);
  if (!old || now - old.at > 15 * 60 * 1000) { limits.set(key, { at: now, n: 1 }); return false; }
  old.n++;
  return old.n > max;
}
setInterval(() => { const cut = Date.now() - 15 * 60 * 1000; for (const [k, v] of limits) if (v.at < cut) limits.delete(k); }, 60 * 1000).unref();

const publicRow = r => ({ reference: r.reference, name: r.name, date: r.visit_date, time: r.visit_time, reason: r.reason || '', concern: r.concern, status: r.status });
function findOwned(body) {
  const reference = clean(body.reference, 20).toUpperCase();
  const phone = clean(body.phone, 30);
  const row = db.prepare('SELECT * FROM appointments WHERE reference=?').get(reference);
  if (!row || !digits(phone) || digits(row.phone) !== digits(phone)) return null;
  return row;
}

// ---------- API ----------
async function api(req, res, url) {
  // On hosts like Render the app sits behind a proxy; TRUST_PROXY=1 uses the real visitor address.
  const fwd = process.env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  const ip = fwd || req.socket.remoteAddress || 'local';
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /api/config') return send(res, 200, publicConfig(config()));

  if (route === 'GET /api/slots') {
    const c = config();
    const date = url.searchParams.get('date') || '';
    if (!inWindow(date, c)) return send(res, 400, { error: `Choose a date within the next ${c.bookingDaysAhead || 90} days.` });
    return send(res, 200, { slots: slotsFor(date, c) });
  }

  if (route === 'GET /api/open-days') {
    // Next N days that have at least one free slot (used for quick date chips).
    const c = config();
    const w = bookingWindow(c);
    const out = [];
    const d = new Date();
    while (out.length < 10 && dateText(d) <= w.max) {
      const s = dateText(d);
      const n = slotsFor(s, c).length;
      if (n) out.push({ date: s, free: n });
      d.setDate(d.getDate() + 1);
    }
    return send(res, 200, { days: out });
  }

  if (route === 'POST /api/appointments') {
    if (limited('book:' + ip)) return send(res, 429, { error: 'Too many attempts. Please try again in 15 minutes.' });
    let b;
    try { b = await readBody(req); } catch { return send(res, 400, { error: 'Please check the form and try again.' }); }
    const c = config();
    const name = clean(b.name, 100), phone = clean(b.phone, 30), email = clean(b.email, 254);
    const date = clean(b.date, 10), time = clean(b.time, 5), concern = clean(b.concern, 1200);
    const reason = REASONS.includes(b.reason) ? b.reason : '';
    if (name.length < 2 || !/^[\p{L}\p{M} .'-]+$/u.test(name)) return send(res, 400, { error: 'Please enter your name (letters only).' });
    if (!/^\+?[0-9 ()-]{7,25}$/.test(phone) || digits(phone).length < 7) return send(res, 400, { error: 'Please enter a valid phone number.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: 'Please enter a valid email address, or leave it blank.' });
    if (concern.length < 5) return send(res, 400, { error: 'Please add a short description of what you need.' });
    if (b.consent !== true) return send(res, 400, { error: 'Please tick the box to confirm you agree to share these details.' });
    if (!inWindow(date, c) || !/^\d{2}:\d{2}$/.test(time) || !slotsFor(date, c).includes(time)) {
      return send(res, 409, { error: 'That time is no longer available. Please choose another slot.' });
    }
    const reference = crypto.randomBytes(5).toString('hex').toUpperCase();
    try {
      db.exec('BEGIN IMMEDIATE');
      if (!slotsFor(date, c).includes(time)) { db.exec('ROLLBACK'); return send(res, 409, { error: 'That time was just booked. Please choose another slot.' }); }
      db.prepare('INSERT INTO appointments(reference,name,phone,email,visit_date,visit_time,reason,concern) VALUES(?,?,?,?,?,?,?,?)')
        .run(reference, name, phone, email || null, date, time, reason || null, concern);
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      if (String(e).includes('UNIQUE')) return send(res, 409, { error: 'That time was just booked. Please choose another slot.' });
      throw e;
    }
    console.log(`[booking] ${reference} ${date} ${time}`);
    sendAlert(bookingAlert({ name, phone, date, time, reason, concern, reference })).catch(() => {}); // don't make the patient wait
    return send(res, 201, { reference, name, date, time, reason, status: 'confirmed' });
  }

  if (route === 'POST /api/appointment-lookup') {
    if (limited('look:' + ip, 20)) return send(res, 429, { error: 'Too many attempts. Please try again in 15 minutes.' });
    let b;
    try { b = await readBody(req); } catch { return send(res, 400, { error: 'Enter your reference and phone number.' }); }
    const row = findOwned(b);
    if (!row) return send(res, 404, { error: 'No appointment matched those details. Check the reference and the phone number you booked with.' });
    return send(res, 200, publicRow(row));
  }

  if (route === 'POST /api/appointment-cancel') {
    if (limited('look:' + ip, 20)) return send(res, 429, { error: 'Too many attempts. Please try again in 15 minutes.' });
    let b;
    try { b = await readBody(req); } catch { return send(res, 400, { error: 'Enter your reference and phone number.' }); }
    const row = findOwned(b);
    if (!row) return send(res, 404, { error: 'No appointment matched those details.' });
    if (row.status !== 'confirmed') return send(res, 409, { error: 'This appointment is not active, so it cannot be cancelled.' });
    db.prepare("UPDATE appointments SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(row.id);
    console.log(`[cancel] ${row.reference} by patient`);
    sendAlert(cancelAlert(row)).catch(() => {});
    return send(res, 200, publicRow({ ...row, status: 'cancelled' }));
  }

  // ----- clinic staff -----
  if (url.pathname.startsWith('/api/admin/')) {
    if (limited('admin:' + ip, 120)) return send(res, 429, { error: 'Too many requests. Please wait a few minutes.' });
    if (!isAdmin(req)) return send(res, 401, { error: 'Incorrect staff key.' });

    if (route === 'GET /api/admin/appointments') {
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';
      const status = url.searchParams.get('status') || '';
      const where = [], args = [];
      if (validDate(from)) { where.push('visit_date >= ?'); args.push(from); }
      if (validDate(to)) { where.push('visit_date <= ?'); args.push(to); }
      if (['confirmed', 'cancelled', 'completed', 'no-show'].includes(status)) { where.push('status = ?'); args.push(status); }
      const rows = db.prepare(`SELECT reference,name,phone,email,visit_date AS date,visit_time AS time,reason,concern,status,created_at FROM appointments ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY visit_date, visit_time LIMIT 1000`).all(...args);
      return send(res, 200, { appointments: rows });
    }

    if (route === 'GET /api/admin/notify') return send(res, 200, { status: notifyStatus() });
    if (route === 'POST /api/admin/notify-test') {
      const results = await sendAlert('Test message from your Shadab Dental Care website. Booking alerts are working!');
      return send(res, 200, { status: notifyStatus(), results });
    }

    const m = url.pathname.match(/^\/api\/admin\/appointments\/([A-F0-9]{10})$/);
    if (m && req.method === 'PATCH') {
      let b;
      try { b = await readBody(req); } catch { return send(res, 400, { error: 'Bad request.' }); }
      if (!['confirmed', 'cancelled', 'completed', 'no-show'].includes(b.status)) return send(res, 400, { error: 'Unknown status.' });
      const row = db.prepare('SELECT * FROM appointments WHERE reference=?').get(m[1]);
      if (!row) return send(res, 404, { error: 'Appointment not found.' });
      try {
        db.prepare("UPDATE appointments SET status=?, updated_at=datetime('now') WHERE id=?").run(b.status, row.id);
      } catch (e) {
        if (String(e).includes('UNIQUE')) return send(res, 409, { error: 'Another confirmed booking already holds that slot.' });
        throw e;
      }
      return send(res, 200, { ok: true });
    }
  }

  return send(res, 404, { error: 'Not found.' });
}

// ---------- HTTP ----------
function serveFile(res, req, file, status = 200) {
  const data = fs.readFileSync(file);
  res.writeHead(status, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : data);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  if (process.env.TRUST_PROXY) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src https://www.google.com https://maps.google.com; frame-ancestors 'none'");
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }

    if (url.pathname === '/clinic-config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(`window.CLINIC=${JSON.stringify(publicConfig(config()))};`);
    }

    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    if (!path.extname(pathname)) pathname += '.html'; // /booking -> /booking.html
    const file = path.resolve(PUBLIC, '.' + pathname);
    if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return serveFile(res, req, path.join(PUBLIC, '404.html'), 404);
    return serveFile(res, req, file);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'Something went wrong. Please try again.' });
    else res.end();
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`\n  Shadab Dental Care is running:  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`  Clinic staff page:              http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/admin`);
    console.log(`  Staff key: ${process.env.ADMIN_KEY ? '(from ADMIN_KEY)' : 'saved in ' + path.relative(ROOT, KEY_PATH)}`);
    console.log(`  Booking alerts: ${notifyStatus()}\n`);
  });
}
module.exports = { server, db };
