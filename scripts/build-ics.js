// בונה קובצי ICS למנוי ביומן (calendar.ics + calendar-<כיתה>.ics) מגיליון האירועים. רץ אוטומטית ב-GitHub Actions.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const win = {}; new Function('window', fs.readFileSync(path.join(root, 'data.js'), 'utf8'))(win);
const D = win.MOFET_DATA, cfg = D.cfg;
const TYPE = {'מבחן':['exam','📝'],'בוחן':['quiz','✏️'],'הגשה':['hw','📚'],'הגשת עבודה':['hw','📚'],'טיול':['trip','🚌'],'סיור':['trip','🚌'],'אירוע':['event','🎉'],'טקס':['event','🎉'],'אסיפה':['parents','👨‍👩‍👦'],'אסיפת הורים':['parents','👨‍👩‍👦'],'שיחת הורים':['parents','👨‍👩‍👦'],'חופשה':['vacation','🏖️'],'אין לימודים':['vacation','🏖️'],'אחר':['other','📌']};
const norm = x => String(x || '').replace(/[׳'`"״]/g, '').replace(/\s+/g, '').trim();
function parseCsv(t) { const rows = []; let row = [], cur = '', q = false; t = t.replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c; }
  if (cur || row.length) { row.push(cur); rows.push(row); } return rows.filter(r => r.some(x => x && x.trim())); }
function normDate(v) { v = String(v || '').trim(); let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v); if (m) return m[1] + m[2].padStart(2, '0') + m[3].padStart(2, '0');
  m = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/.exec(v); if (m) return m[3] + m[2].padStart(2, '0') + m[1].padStart(2, '0'); return ''; }
const addDay = d => { const x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8) + 1)); return x.toISOString().slice(0, 10).replace(/-/g, ''); };
const esc = x => String(x == null ? '' : x).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = l => { const b = Buffer.from(l, 'utf8'); if (b.length <= 74) return l; const out = []; let cur = '', len = 0;
  for (const ch of l) { const n = Buffer.byteLength(ch); if (len + n > (out.length ? 73 : 74)) { out.push(cur); cur = ch; len = n; } else { cur += ch; len += n; } } out.push(cur); return out.join('\r\n '); };
const h36 = s => { let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h.toString(36); };
const GV = {'א':1,'ב':2,'ג':3,'ד':4,'ה':5,'ו':6,'ז':7,'ח':8,'ט':9,'י':10,'כ':20,'ך':20,'ל':30,'מ':40,'ם':40,'נ':50,'ן':50,'ס':60,'ע':70,'פ':80,'ף':80,'צ':90,'ץ':90,'ק':100,'ר':200,'ש':300,'ת':400};
const heYear = v => { v = String(v || '').trim(); if (/^\d{4}$/.test(v)) return +v; let n = 0; for (const ch of v.replace(/[׳'"״\s]/g, '')) n += GV[ch] || 0; return n > 0 && n < 1000 ? 5000 + n : 0; };
const currentHeYear = () => { const t = new Date(); return t.getUTCFullYear() + (t.getUTCMonth() >= 6 ? 3761 : 3760); };
const get = async name => { const u = cfg.eventsSheetCsv.replace(/sheet=[^&]*/, 'sheet=' + encodeURIComponent(name)); const r = await fetch(u); if (!r.ok) throw new Error(name + ' ' + r.status); return parseCsv(await r.text()).slice(1); };
(async () => {
  const classes = (cfg.classes || []).map(c => ({ id: c.id, name: c.name }));
  try { for (const r of await get('כיתות')) { const [name, , year] = r.map(x => (x || '').trim()); if (!name) continue;
    if (!classes.some(c => norm(c.name) === norm(name))) classes.push({ id: 'x' + h36(norm(name) + '_' + (heYear(year) || currentHeYear())), name }); } } catch (e) { console.log('classes tab:', e.message); }
  const events = [];
  const rows = await get('אירועים');
  rows.forEach((r, i) => { const [title, type, date, end, st, en, cls, subj, place, notes] = r.map(x => (x || '').trim());
    const d = normDate(date); if (!title || !d) return;
    const t = TYPE[type] || ['other', '📌']; const ids = cls ? cls.split(/[,،;]/).map(x => (classes.find(c => norm(c.name) === norm(x)) || {}).id).filter(Boolean) : [];
    events.push({ title, emoji: t[1], d, ed: normDate(end), st, en, ids, subj, place, notes, cn: cls }); });
  const stamp = '20260101T000000Z';
  const build = list => { const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mofet Calendar//HE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + esc(cfg.program || 'תוכנית מופת'), 'X-WR-TIMEZONE:Asia/Jerusalem', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
    for (const e of list) { const desc = [e.subj && 'מקצוע: ' + e.subj, e.cn ? 'כיתות: ' + e.cn : 'כל הכיתות', e.notes].filter(Boolean).join('\n');
      L.push('BEGIN:VEVENT', 'UID:' + Buffer.from(e.title + e.d + e.st).toString('hex').slice(0, 40) + '@mofet-calendar', 'DTSTAMP:' + stamp);
      if (e.st) { L.push('DTSTART;TZID=Asia/Jerusalem:' + e.d + 'T' + e.st.replace(':', '').padStart(4, '0') + '00', 'DTEND;TZID=Asia/Jerusalem:' + (e.ed || e.d) + 'T' + (e.en || e.st).replace(':', '').padStart(4, '0') + '00'); }
      else L.push('DTSTART;VALUE=DATE:' + e.d, 'DTEND;VALUE=DATE:' + addDay(e.ed && e.ed > e.d ? e.ed : e.d));
      L.push('SUMMARY:' + esc(e.emoji + ' ' + e.title), 'DESCRIPTION:' + esc(desc)); if (e.place) L.push('LOCATION:' + esc(e.place)); L.push('END:VEVENT'); }
    L.push('END:VCALENDAR'); return L.map(fold).join('\r\n') + '\r\n'; };
  fs.writeFileSync(path.join(root, 'calendar.ics'), build(events));
  for (const c of classes) fs.writeFileSync(path.join(root, 'calendar-' + c.id + '.ics'), build(events.filter(e => !e.ids.length || e.ids.includes(c.id))));
  console.log('events:', events.length, 'classes:', classes.length);
})().catch(e => { console.error(e); process.exit(1); });
