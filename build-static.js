// Builds the static copy of the website for GitHub Pages into ./docs
// (no server: bookings are sent as a WhatsApp message). Run: node build-static.js
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'docs');
const SERVER_ONLY = new Set(['admin.html', 'admin.js', 'details.html', 'confirmation.html']);

const clinic = JSON.parse(fs.readFileSync(path.join(ROOT, 'clinic.json'), 'utf8'));
delete clinic._help;
clinic.mode = 'whatsapp';
if (!String(clinic.whatsapp || '').replace(/\D/g, '')) {
  console.error('clinic.json has no "whatsapp" number, so bookings would have nowhere to go.');
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(SRC)) {
  if (SERVER_ONLY.has(f)) continue;
  fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
}
fs.writeFileSync(path.join(OUT, 'clinic-config.js'), `window.CLINIC=${JSON.stringify(clinic)};\n`);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log(`Built ${fs.readdirSync(OUT).length} files into docs/ (WhatsApp booking to ${clinic.whatsapp})`);
