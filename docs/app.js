// Shadab Dental Care — front-end behaviour for every page.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const C = window.CLINIC || {};
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    n.append(...kids.filter(k => k != null));
    return n;
  };
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const asDate = s => new Date(`${s}T12:00:00`);
  const fmtDate = (s, opts = { dateStyle: 'full' }) => new Intl.DateTimeFormat(undefined, opts).format(asDate(s));
  const fmtTime = t => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(`2000-01-01T${t}:00`));
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const store = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { sessionStorage.removeItem(k); } catch {} }
  };
  async function api(path, body, headers = {}) {
    const res = await fetch(path, body === undefined ? { headers } : {
      method: body.__method || 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body, (k, v) => (k === '__method' ? undefined : v))
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) { const e = new Error(data.error || 'Something went wrong. Please try again.'); e.status = res.status; throw e; }
    return data;
  }

  // ---------- shared: year, menu, clinic details ----------
  $$('[data-year]').forEach(n => (n.textContent = new Date().getFullYear()));
  const toggle = $('.menu-toggle'), nav = $('#nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      toggle.textContent = open ? '✕' : '☰';
      nav.classList.toggle('open', open);
    });
    nav.addEventListener('click', e => { if (e.target.closest('a')) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.textContent = '☰'; } });
  }

  // Static GitHub Pages build (mode "whatsapp"): there is no server, so a booking is sent as a WhatsApp message.
  const WA = C.mode === 'whatsapp';
  $$('[data-mode="server"]').forEach(n => (n.hidden = WA));
  $$('[data-mode="whatsapp"]').forEach(n => (n.hidden = !WA));

  const has = k => typeof C[k] === 'string' && C[k].trim() && !C[k].includes('[');
  const links = {
    phone: v => `tel:${v.replace(/[^+\d]/g, '')}`,
    whatsapp: v => `https://wa.me/${v.replace(/\D/g, '')}`,
    email: v => `mailto:${v}`,
    mapUrl: v => v
  };
  $$('[data-c]').forEach(n => {
    const k = n.dataset.c;
    if (!has(k)) { n.hidden = true; return; }
    n.hidden = false;
    const target = $('[data-v]', n) || n;
    if (k !== 'mapUrl') target.textContent = C[k];
    const a = n.tagName === 'A' ? n : $('a', n);
    if (a && links[k]) { a.href = links[k](C[k]); if (k === 'whatsapp' || k === 'mapUrl') { a.target = '_blank'; a.rel = 'noopener'; } }
  });
  // Phone number everywhere: header call link + floating call button on every page.
  if (has('phone')) {
    const tel = links.phone(C.phone);
    const icon = () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>'; return s; };
    const actions = $('.header-actions');
    if (actions) actions.prepend(el('a', { class: 'header-phone', href: tel, 'aria-label': `Call ${C.phone}` }, icon(), el('span', { text: C.phone })));
    if (!/\/admin/.test(location.pathname)) document.body.append(el('a', { class: 'call-fab', href: tel, 'aria-label': `Call ${C.phone}` }, icon(), el('span', { text: 'Call us' })));
  }
  const anyContact =['address', 'phone', 'email', 'whatsapp'].some(has);
  $$('[data-c-pending]').forEach(n => (n.hidden = anyContact));
  $$('[data-c-any]').forEach(n => (n.hidden = !anyContact));
  $$('[data-if]').forEach(n => (n.hidden = !has(n.dataset.if)));
  $$('[data-if-not]').forEach(n => (n.hidden = has(n.dataset.ifNot)));

  // ---------- reveal on scroll ----------
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
    $$('.reveal').forEach(n => io.observe(n));
  } else $$('.reveal').forEach(n => n.classList.add('in'));

  // ---------- opening hours table ----------
  $$('[data-hours]').forEach(table => {
    const hours = C.weeklyHours || {};
    const today = new Date().getDay();
    const body = el('tbody');
    for (const d of [1, 2, 3, 4, 5, 6, 0]) {
      const h = hours[d];
      body.append(el('tr', { class: d === today ? 'today' : '' },
        el('th', { scope: 'row', text: DAYS[d] + (d === today ? ' (today)' : '') }),
        el('td', { class: h ? '' : 'closed', text: h ? `${fmtTime(h[0])} – ${fmtTime(h[1])}` : 'Closed' })));
    }
    table.replaceChildren(body);
  });
  $$('[data-sample]').forEach(n => (n.hidden = !C.scheduleIsSample));

  // ---------- next available (home hero) ----------
  const nextCard = $('#nextAvailable');
  if (nextCard && WA) nextCard.hidden = true; // live availability needs the server
  else if (nextCard) {
    api('/api/open-days').then(async ({ days }) => {
      if (!days.length) { $('strong', nextCard).textContent = 'Call to arrange a time'; return; }
      const { slots } = await api(`/api/slots?date=${days[0].date}`);
      const d = days[0].date === iso(new Date()) ? 'Today' : fmtDate(days[0].date, { weekday: 'short', day: 'numeric', month: 'short' });
      $('strong', nextCard).textContent = `${d}, ${fmtTime(slots[0])}`;
      nextCard.href = `/booking?date=${days[0].date}`;
    }).catch(() => { nextCard.hidden = true; });
  }

  // ---------- booking ----------
  const form = $('#bookingForm');
  if (form) {
    const params = new URLSearchParams(location.search);
    const dateInput = $('#date'), slots = $('#slotList'), time = $('#time'), error = $('#formError');
    const concern = $('#concern'), counter = $('#charCount'), reasonInput = $('#reason'), dayChips = $('#dayChips');
    const summary = $('#summary'), submit = $('.submit-button', form);
    const days = Number(C.bookingDaysAhead) || 90;
    const last = new Date(); last.setDate(last.getDate() + days);
    dateInput.min = iso(new Date()); dateInput.max = iso(last);
    $('#daysAhead').textContent = days;
    if (C.scheduleIsSample) $('#scheduleNotice').hidden = false;

    const setPressed = (wrap, btn) => { $$('[aria-pressed]', wrap).forEach(x => x.setAttribute('aria-pressed', String(x === btn))); };
    const updateSummary = () => {
      if (dateInput.value && time.value) {
        summary.replaceChildren('Your visit: ', el('b', { text: `${fmtDate(dateInput.value)} at ${fmtTime(time.value)}` }), reasonInput.value ? ` · ${reasonInput.value}` : '');
        summary.hidden = false;
      } else summary.hidden = true;
    };

    // reason chips
    $$('#reasonChips .chip').forEach(b => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      setPressed($('#reasonChips'), on ? b : null);
      reasonInput.value = on ? b.dataset.reason : '';
      updateSummary();
    }));
    const pre = params.get('reason');
    if (pre) { const b = $$('#reasonChips .chip').find(x => x.dataset.reason === pre); if (b) b.click(); }

    concern.addEventListener('input', () => (counter.textContent = concern.value.length));

    // WhatsApp mode: build the times from the opening hours; the clinic confirms the exact time in the chat.
    const hhmm = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    const localSlots = date => {
      const h = (C.weeklyHours || {})[asDate(date).getDay()];
      const size = Number(C.slotMinutes) || 30;
      if (!h || (C.closedDates || []).includes(date)) return [];
      const [s, e] = h.map(x => Number(x.slice(0, 2)) * 60 + Number(x.slice(3)));
      const out = [], now = new Date();
      for (let t = s; t + size <= e; t += size) if (new Date(`${date}T${hhmm(t)}:00`) > now) out.push(hhmm(t));
      return out;
    };
    const localDays = () => {
      const out = [], d = new Date();
      for (let i = 0; i < days && out.length < 10; i++, d.setDate(d.getDate() + 1)) if (localSlots(iso(d)).length) out.push({ date: iso(d) });
      return out;
    };

    async function loadSlots() {
      time.value = ''; updateSummary();
      $$('.chip', dayChips).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.date === dateInput.value)));
      if (!dateInput.value) { slots.replaceChildren(el('p', { class: 'muted', text: 'Pick a day above to see open times.' })); return; }
      slots.replaceChildren(el('p', { class: 'muted', text: 'Checking open times…' }));
      try {
        const data = WA ? { slots: localSlots(dateInput.value) } : await api(`/api/slots?date=${encodeURIComponent(dateInput.value)}`);
        if (!data.slots.length) { slots.replaceChildren(el('p', { class: 'muted', text: `No open times on ${fmtDate(dateInput.value, { weekday: 'long', day: 'numeric', month: 'long' })}. Please try another day.` })); return; }
        const groups = [['Morning', t => t < '12:00'], ['Afternoon', t => t >= '12:00' && t < '17:00'], ['Evening', t => t >= '17:00']];
        const out = [];
        for (const [label, test] of groups) {
          const list = data.slots.filter(test);
          if (!list.length) continue;
          out.push(el('p', { class: 'slot-group', text: label }));
          for (const v of list) {
            const b = el('button', { type: 'button', class: 'slot', 'aria-pressed': 'false', text: fmtTime(v), onclick: () => { setPressed(slots, b); time.value = v; error.hidden = true; updateSummary(); } });
            out.push(b);
          }
        }
        slots.replaceChildren(...out);
      } catch (e) { slots.replaceChildren(el('p', { class: 'muted', text: e.message })); }
    }
    dateInput.addEventListener('change', loadSlots);

    (WA ? Promise.resolve({ days: localDays() }) : api('/api/open-days')).then(({ days }) => {
      dayChips.replaceChildren(...days.slice(0, 6).map(d => el('button', {
        type: 'button', class: 'chip day-chip', 'data-date': d.date, 'aria-pressed': 'false',
        onclick: () => { dateInput.value = d.date; loadSlots(); }
      }, d.date === iso(new Date()) ? 'Today' : fmtDate(d.date, { weekday: 'short' }), el('small', { text: fmtDate(d.date, { day: 'numeric', month: 'short' }) }))));
      if (!days.length) dayChips.replaceChildren(el('p', { class: 'footnote', text: 'No open days found right now. Please contact the clinic.' }));
      const want = params.get('date');
      if (want) { dateInput.value = want; loadSlots(); }
    }).catch(() => (dayChips.hidden = true));

    form.addEventListener('submit', async e => {
      e.preventDefault();
      error.hidden = true;
      if (!dateInput.value || !time.value) { error.textContent = 'Please choose a day and an open time first.'; error.hidden = false; $('#whenTitle').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (!form.reportValidity()) return;
      if (WA) {
        let num = (C.whatsapp || '').replace(/\D/g, '');
        if (num.length === 10) num = '91' + num; // assume India for 10-digit numbers
        if (!num) { error.textContent = 'The clinic’s WhatsApp number is not set up yet. Please call the clinic instead.'; error.hidden = false; return; }
        const email = $('#email').value.trim();
        const text = [
          'Hello Shadab Dental Care, I would like to request an appointment.', '',
          `Name: ${$('#name').value.trim()}`, `Phone: ${$('#phone').value.trim()}`, ...(email ? [`Email: ${email}`] : []),
          `Preferred time: ${fmtDate(dateInput.value)}, ${fmtTime(time.value)}`,
          ...(reasonInput.value ? [`Reason: ${reasonInput.value}`] : []), `Details: ${concern.value.trim()}`
        ].join('\n');
        const url = `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
        summary.replaceChildren('✓ Your request is ready. WhatsApp should open — just press ', el('b', { text: 'Send' }), '. ',
          el('a', { href: url, target: '_blank', rel: 'noopener', class: 'text-link', text: 'Tap here if it didn’t open ↗' }));
        summary.hidden = false;
        if (!window.open(url, '_blank')) location.href = url;
        return;
      }
      submit.disabled = true; submit.textContent = 'Booking your visit…';
      try {
        const data = await api('/api/appointments', {
          name: $('#name').value, phone: $('#phone').value, email: $('#email').value,
          date: dateInput.value, time: time.value, reason: reasonInput.value, concern: concern.value, consent: $('#consent').checked
        });
        store.set('newAppointment', data);
        location.href = `/confirmation?ref=${encodeURIComponent(data.reference)}`;
      } catch (err) {
        error.textContent = err.message; error.hidden = false;
        if (err.status === 409) loadSlots();
        submit.disabled = false; submit.innerHTML = 'Confirm appointment <span class="arrow">↗</span>';
      }
    });
  }

  // ---------- details / ticket rendering ----------
  function detailsList(a, extra = []) {
    const rows = [
      ['Date', fmtDate(a.date)], ['Time', fmtTime(a.time)],
      ...(a.reason ? [['Reason', a.reason]] : []), ...extra
    ];
    return el('dl', { class: 'details' }, ...rows.map(([k, v, full]) => el('div', { class: full ? 'full' : '' }, el('dt', { text: k }), el('dd', { text: v }))));
  }
  function icsFor(a) {
    const mins = Number(C.slotMinutes) || 30;
    const start = new Date(`${a.date}T${a.time}:00`), end = new Date(start.getTime() + mins * 60000);
    const f = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const loc = has('address') ? `\r\nLOCATION:${C.address.replace(/[,;]/g, '\\$&')}` : '';
    const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Shadab Dental Care//Booking//EN\r\nBEGIN:VEVENT\r\nUID:${a.reference}@shadab-dental-care\r\nDTSTAMP:${f(new Date())}\r\nDTSTART:${f(start)}\r\nDTEND:${f(end)}\r\nSUMMARY:Dental appointment — Shadab Dental Care\r\nDESCRIPTION:Booking reference ${a.reference}${loc}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
    return URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  }

  // ---------- confirmation ----------
  const conf = $('#confirmationContent');
  if (conf) {
    const a = store.get('newAppointment');
    const ref = new URLSearchParams(location.search).get('ref');
    if (!a || a.reference !== ref) {
      conf.append(
        el('h1', {}, 'Your booking ', el('em', { text: 'is saved.' })),
        el('p', { text: 'For privacy, full confirmation details are only shown once, right after booking. You can always look them up with your reference and phone number.' }),
        el('div', { class: 'actions', style: 'justify-content:center' }, el('a', { class: 'button button-dark', href: `/details${ref ? '?ref=' + encodeURIComponent(ref) : ''}`, text: 'Look up my appointment ↗' })));
      $('.check').textContent = '✳';
    } else {
      const copy = el('button', { type: 'button', class: 'button button-ghost button-sm', text: 'Copy', onclick: async () => { try { await navigator.clipboard.writeText(a.reference); copy.textContent = 'Copied ✓'; } catch { copy.textContent = 'Select & copy'; } } });
      conf.append(
        el('h1', {}, 'You’re all ', el('em', { text: 'set.' })),
        el('p', { text: `Thank you, ${a.name}. Your appointment is confirmed — we look forward to seeing you.` }),
        el('div', { class: 'card ticket' },
          el('div', { class: 'ref' }, el('div', {}, el('small', { class: 'eyebrow', text: 'Booking reference' }), el('br'), el('strong', { text: a.reference })), copy),
          detailsList(a, [['Status', 'Confirmed ✓']])),
        el('div', { class: 'actions', style: 'justify-content:center;margin-top:0' },
          el('a', { class: 'button button-dark', href: icsFor(a), download: `dental-appointment-${a.reference}.ics`, text: 'Add to calendar' }),
          el('button', { type: 'button', class: 'button button-ghost', text: 'Print / save as PDF', onclick: () => print() })),
        el('p', { class: 'reference-note', style: 'margin-top:22px', text: 'Keep your reference and the phone number you booked with — you’ll need both to check or cancel this appointment.' }));
      store.del('newAppointment');
    }
  }

  // ---------- lookup / cancel ----------
  const lookup = $('#lookupForm');
  if (lookup) {
    const result = $('#appointmentResult'), error = $('#lookupError'), empty = $('#lookupEmpty'), btn = $('.submit-button', lookup);
    const ref = new URLSearchParams(location.search).get('ref');
    if (ref) $('#reference').value = ref.toUpperCase().slice(0, 10);
    $('#reference').addEventListener('input', e => (e.target.value = e.target.value.toUpperCase().replace(/[^A-F0-9]/g, '')));
    const creds = () => ({ reference: $('#reference').value, phone: $('#phone').value });

    function show(a) {
      const active = a.status === 'confirmed';
      const isPast = new Date(`${a.date}T${a.time}:00`) < new Date();
      const label = { confirmed: isPast ? 'Past appointment' : 'Confirmed', cancelled: 'Cancelled', completed: 'Completed', 'no-show': 'Missed' }[a.status] || a.status;
      const actions = el('div', { class: 'result-actions' });
      if (active && !isPast) {
        actions.append(
          el('a', { class: 'button button-dark button-sm', href: icsFor(a), download: `dental-appointment-${a.reference}.ics`, text: 'Add to calendar' }),
          el('button', { type: 'button', class: 'button button-danger button-sm', text: 'Cancel appointment', onclick: async ev => {
            if (!confirm(`Cancel your appointment on ${fmtDate(a.date)} at ${fmtTime(a.time)}? This frees the time for someone else.`)) return;
            ev.target.disabled = true;
            try { show(await api('/api/appointment-cancel', creds())); } catch (err) { error.textContent = err.message; error.hidden = false; ev.target.disabled = false; }
          } }));
      }
      if (a.status === 'cancelled') actions.append(el('a', { class: 'button button-dark button-sm', href: '/booking', text: 'Book a new time ↗' }));
      result.replaceChildren(
        el('span', { class: `result-badge ${a.status}`, text: (active ? '✓ ' : '') + label }),
        el('h2', { text: active ? `See you soon, ${a.name.split(' ')[0]}.` : `Hello, ${a.name.split(' ')[0]}.` }),
        el('p', { text: active ? 'Here are the details of your visit.' : 'This appointment is no longer active.' }),
        detailsList(a, [['Reference', a.reference], ['Status', label], ['What you shared', a.concern, true]]),
        actions);
      result.hidden = false; empty.hidden = true;
    }

    lookup.addEventListener('submit', async e => {
      e.preventDefault();
      error.hidden = true;
      if (!lookup.reportValidity()) return;
      btn.disabled = true;
      try { show(await api('/api/appointment-lookup', creds())); }
      catch (err) { error.textContent = err.message; error.hidden = false; result.hidden = true; empty.hidden = false; }
      finally { btn.disabled = false; }
    });
  }
})();
