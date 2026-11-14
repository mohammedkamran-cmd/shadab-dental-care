# Shadab Dental Care — website

A complete dental clinic website with live online booking, patient self-service, and a staff dashboard.
It runs on Node.js with **no npm install needed** (it uses Node's built-in SQLite).

## Start it

1. Install Node.js 22.5 or newer.
2. Open PowerShell in this folder.
3. Run:
   ```
   node server.js
   ```
4. Open **http://127.0.0.1:3000** in your browser. Stop with `Ctrl+C`.

On first start the server creates `data/appointments.sqlite` (the bookings) and `data/admin-key.txt` (the staff password).

## Pages

| URL | What it is |
| --- | --- |
| `/` | Home: hero with live "next open time", approach, "what brings you in" shortcuts, first-visit steps, opening hours & contact, FAQ |
| `/booking` | Pick a day and time (live availability), reason for visit, details, instant confirmation |
| `/confirmation` | Booking reference, copy button, **Add to calendar** (.ics), print |
| `/details` | Patients look up **or cancel** their booking with reference + phone number |
| `/about` | Dentist introduction, what to expect, full FAQ, plain-language privacy |
| `/admin` | **Staff dashboard**: today / week counts, filter, search, mark completed / no-show / cancelled, export CSV |

## Fill in your clinic's details — `clinic.json`

Open `clinic.json`, fill in the values, and restart the server. Every page updates automatically.

- `doctor`, `credentials`, `bio`: shown on the About page
- `address`, `phone`, `whatsapp`, `email`, `mapUrl`: shown in the contact card, booking sidebar and footer
- `weeklyHours`: opening hours per weekday (`0` = Sunday … `6` = Saturday). Remove a day to close it.
- `slotMinutes`: appointment length; `bookingDaysAhead`: how far ahead patients can book
- `closedDates`: holidays, e.g. `["2026-12-25"]`
- `scheduleIsSample`: set to `false` once the hours are real (this removes the "sample hours" notes)

Leave a value as `""` to hide it; the site shows a polite "coming soon" message instead.

## Booking alerts to your phone — `notify.json`

Every new booking (and every cancellation by a patient) sends a message to the number in `notify.json`
(currently **+91 6200352125**). It needs a one-time setup. Choose one option:

**Option A: WhatsApp (free) with CallMeBot**
1. Go to https://www.callmebot.com/blog/free-api-whatsapp-messages/ and follow the steps: save their number
   in your phone's contacts and send them the activation message from **6200352125** on WhatsApp.
2. They reply with your **API key**. Paste it into `notify.json` as `"callmebotApiKey": "123456"`.

**Option B: normal SMS with Fast2SMS (paid, India)**
1. Sign up at https://www.fast2sms.com, add some balance, and copy your API key from the **Dev API** page.
2. Paste it into `notify.json` as `"fast2smsApiKey": "..."`.

Restart the server, open `/admin`, and click **Send test message**. You should get a message within a few seconds.
If both keys are filled in, you get both a WhatsApp message and an SMS. To change the number, edit `"to"`.
`notify.json` is private and is never shown on the website.

## Staff dashboard

Go to `/admin` and enter the key from `data/admin-key.txt` (also printed when the server starts).
To choose your own key, start the server with `$env:ADMIN_KEY="your-long-secret"; node server.js`.

## Booking rules

- Only free, future slots within the clinic hours are offered; one confirmed booking per slot (enforced by the database).
- Cancelling (by the patient or staff) frees the slot immediately.
- Lookups and cancellations need **both** the reference and the phone number.
- Basic per-IP rate limiting on booking, lookup and staff requests.

## Before going live with real patients

1. Fill in `clinic.json` with confirmed details and real hours.
2. Host it behind **HTTPS** (e.g. a VPS with Caddy/Nginx, or any Node host that keeps the `data/` folder between restarts). Set `HOST=0.0.0.0` so the server accepts outside connections.
3. Back up `data/appointments.sqlite` regularly, and keep it and `data/admin-key.txt` private.
4. Check local privacy rules for storing patient contact details.

Settings via environment variables: `PORT` (default 3000), `HOST` (default 127.0.0.1), `DB_PATH`, `ADMIN_KEY`.
