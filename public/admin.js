// Clinic staff dashboard.
(() => {
  const $ = s => document.querySelector(s);
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDay = s => new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${s}T12:00:00`));
  const fmtTime = t => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(`2000-01-01T${t}:00`));
  let key = '';
  try { key = sessionStorage.getItem('staffKey') || ''; } catch {}
  let rows = [];

  async function call(path, opts = {}) {
    const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', 'x-admin-key': key, ...(opts.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Request failed.'); e.status = res.status; throw e; }
    return data;
  }
  const td = (text, cls) => { const n = document.createElement('td'); if (cls) n.className = cls; n.textContent = text; return n; };

  function render() {
    const q = $('#q').value.trim().toLowerCase();
    const list = rows.filter(r => !q || [r.name, r.phone, r.email, r.reference].join(' ').toLowerCase().includes(q));
    const body = $('#rows');
    body.replaceChildren();
    if (!list.length) { const tr = document.createElement('tr'); tr.append(td('No appointments match these filters.')); tr.firstChild.colSpan = 6; body.append(tr); }
    let day = '';
    for (const r of list) {
      if (r.date !== day) {
        day = r.date;
        const tr = document.createElement('tr'); tr.className = 'day-row';
        const c = td(fmtDay(day) + (day === iso(new Date()) ? '  · Today' : '')); c.colSpan = 6; tr.append(c); body.append(tr);
      }
      const tr = document.createElement('tr');
      const contact = td(r.phone);
      if (r.email) { contact.append(document.createElement('br'), r.email); }
      const note = td('', 'concern');
      if (r.reason) { const b = document.createElement('b'); b.textContent = r.reason; note.append(b, document.createElement('br')); }
      note.append(r.concern);
      const st = document.createElement('td');
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', `Status for ${r.name}`);
      for (const v of ['confirmed', 'completed', 'no-show', 'cancelled']) { const o = document.createElement('option'); o.value = v; o.textContent = v[0].toUpperCase() + v.slice(1); sel.append(o); }
      sel.value = r.status;
      const badge = document.createElement('span'); badge.className = `status ${r.status}`; badge.textContent = r.status;
      sel.addEventListener('change', async () => {
        if (sel.value === 'cancelled' && !confirm(`Cancel ${r.name}'s appointment? The time slot will become available again.`)) { sel.value = r.status; return; }
        try { await call(`/api/admin/appointments/${r.reference}`, { method: 'PATCH', body: JSON.stringify({ status: sel.value }) }); r.status = sel.value; badge.className = `status ${r.status}`; badge.textContent = r.status; loadStats(); }
        catch (e) { alert(e.message); sel.value = r.status; }
      });
      st.append(badge, document.createElement('br'), sel);
      st.lastChild.style.marginTop = '6px';
      tr.append(td(fmtTime(r.time)), td(r.name), contact, note, td(r.reference), st);
      body.append(tr);
    }
    $('#sCancelled').textContent = list.filter(r => r.status === 'cancelled').length;
  }

  async function load() {
    $('#dashError').hidden = true;
    const p = new URLSearchParams();
    if ($('#from').value) p.set('from', $('#from').value);
    if ($('#to').value) p.set('to', $('#to').value);
    if ($('#status').value) p.set('status', $('#status').value);
    try { rows = (await call(`/api/admin/appointments?${p}`)).appointments; render(); }
    catch (e) { if (e.status === 401) return signOut(e.message); $('#dashError').textContent = e.message; $('#dashError').hidden = false; }
  }
  async function loadStats() {
    try {
      const today = iso(new Date()), week = new Date(); week.setDate(week.getDate() + 6);
      const up = (await call(`/api/admin/appointments?from=${today}&status=confirmed`)).appointments;
      $('#sToday').textContent = up.filter(r => r.date === today).length;
      $('#sWeek').textContent = up.filter(r => r.date <= iso(week)).length;
      $('#sUpcoming').textContent = up.length;
    } catch {}
  }
  function signOut(msg) {
    key = ''; try { sessionStorage.removeItem('staffKey'); } catch {}
    $('#dash').hidden = true; $('#logout').hidden = true; $('#login').hidden = false;
    if (msg) { $('#loginError').textContent = msg; $('#loginError').hidden = false; }
  }
  async function open() {
    try { await call('/api/admin/appointments?from=2999-01-01'); }
    catch (e) { return signOut(e.message); }
    try { sessionStorage.setItem('staffKey', key); } catch {}
    $('#login').hidden = true; $('#dash').hidden = false; $('#logout').hidden = false;
    $('#from').value = iso(new Date());
    load(); loadStats();
    call('/api/admin/notify').then(d => ($('#notifyStatus').textContent = d.status)).catch(() => {});
  }
  $('#notifyTest').addEventListener('click', async () => {
    const btn = $('#notifyTest'), out = $('#notifyResult');
    btn.disabled = true; out.textContent = 'Sending…';
    try {
      const d = await call('/api/admin/notify-test', { method: 'POST', body: '{}' });
      $('#notifyStatus').textContent = d.status;
      out.textContent = d.results.map(r => `${r.via}: ${r.ok ? 'sent ✓ — check your phone' : 'failed — ' + r.error}`).join('  ·  ');
    } catch (e) { out.textContent = e.message; }
    btn.disabled = false;
  });

  $('#login').addEventListener('submit', e => { e.preventDefault(); $('#loginError').hidden = true; key = $('#key').value.trim(); open(); });
  $('#logout').addEventListener('click', () => signOut());
  ['#from', '#to', '#status'].forEach(s => $(s).addEventListener('change', load));
  $('#q').addEventListener('input', render);
  $('#refresh').addEventListener('click', () => { load(); loadStats(); });
  $('#csv').addEventListener('click', () => {
    const cols = ['date', 'time', 'name', 'phone', 'email', 'reason', 'concern', 'reference', 'status', 'created_at'];
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `appointments-${iso(new Date())}.csv`;
    a.click();
  });
  if (key) open();
})();
