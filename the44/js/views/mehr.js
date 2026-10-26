import { db, STORES } from '../db.js';
import { getProperty, saveProperty, saveFile, deleteFile, unpackBlob, saveTransaction, isRentalPhase } from '../data.js';
import { esc, fmtEUR, fmtDate, fmtPct, fmtNum, fmtSize, todayISO, viewUrl, toast, pickFiles, shareOrDownload, uid, MONTHS_SHORT } from '../util.js';
import { icon } from '../icons.js';
import { TASK_KINDS, TASK_STATUS, CONTACT_ROLES } from '../config.js';
import { formDialog, actionSheet } from '../ui.js';
import { empty, chips, kv, yearOptions } from './common.js';
import { createBackup, restoreBackup } from '../backup.js';

const state = { taskFilter: 'offen', rentYear: String(new Date().getFullYear()) };
const sub = (title, html, extra = {}) => ({ title, html, back: '#/mehr', tab: 'mehr', ...extra });

// ---------- Menü ----------

export async function renderMenu() {
  const [tasks, contacts, tenancies] = await Promise.all([db.all('tasks'), db.all('contacts'), db.all('tenancies')]);
  const open = tasks.filter((t) => t.status !== 'erledigt').length;
  const item = (href, ic, label, meta = '') =>
    `<li><a class="row" href="${href}"><span class="menu-icon">${icon(ic)}</span><span class="grow">${label}</span>${meta ? `<span class="muted">${meta}</span>` : ''}${icon('right', 'chev')}</a></li>`;
  const html = `
    <ul class="list">
      ${item('#/aufgaben', 'list', 'Aufgaben, Termine & Mängel', open ? `${open} offen` : '')}
      ${item('#/vermietung', 'key', 'Vermietung', tenancies.length ? `${tenancies.length}` : '')}
      ${item('#/kontakte', 'users', 'Kontakte', contacts.length ? `${contacts.length}` : '')}
    </ul>
    <ul class="list">
      ${item('#/objekt', 'building', 'Objektdaten & Steuer')}
      ${item('#/daten', 'database', 'Daten & Backup')}
      ${item('#/info', 'info', 'Installation & Hilfe')}
    </ul>`;
  return { title: 'Mehr', html, tab: 'mehr' };
}

// ---------- Aufgaben / Termine / Mängel ----------

export async function renderAufgaben() {
  const tasks = await db.all('tasks');
  const today = todayISO();
  const f = state.taskFilter;
  const list = tasks
    .filter((t) =>
      f === 'alle' ? true : f === 'erledigt' ? t.status === 'erledigt' : t.status !== 'erledigt' && (f === 'offen' || t.kind === f),
    )
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (b.createdAt || 0) - (a.createdAt || 0));
  const cnt = (k) => tasks.filter((t) => t.status !== 'erledigt' && t.kind === k).length;
  const html = `
    ${chips(
      [
        ['offen', 'Offen'],
        ['mangel', `Mängel (${cnt('mangel')})`],
        ['termin', `Termine (${cnt('termin')})`],
        ['aufgabe', `Aufgaben (${cnt('aufgabe')})`],
        ['erledigt', 'Erledigt'],
      ],
      f,
      'task-filter',
    )}
    ${
      list.length
        ? `<ul class="list">${list
            .map(
              (t) => `<li class="task ${t.status === 'erledigt' ? 'done' : ''}">
                <button type="button" class="check-btn" data-action="task-toggle" data-id="${t.id}" aria-label="Erledigt umschalten">${t.status === 'erledigt' ? icon('check') : ''}</button>
                <button type="button" class="row" data-action="task-edit" data-id="${t.id}">
                  <span class="grow"><strong>${esc(t.title)}</strong>
                    <small class="muted"><span class="badge ${t.kind}">${TASK_KINDS[t.kind]}</span>${t.status === 'gemeldet' ? ' · gemeldet' : ''}${t.location ? ` · ${esc(t.location)}` : ''}${t.fileIds?.length ? ` · ${icon('image', 'inline')}${t.fileIds.length}` : ''}</small></span>
                  ${t.due ? `<span class="${t.status !== 'erledigt' && t.due < today ? 'neg' : 'muted'} small">${fmtDate(t.due)}${t.time ? `<br>${esc(t.time)}` : ''}</span>` : ''}
                </button>
              </li>`,
            )
            .join('')}</ul>`
        : empty('list', 'Nichts offen', 'Halte Termine (Abnahme, Übergabe, Eigentümerversammlung), Aufgaben und Mängel mit Fotos fest.')
    }`;
  return sub('Aufgaben', html, { fab: { action: 'task-add', label: 'Aufgabe hinzufügen' } });
}

export async function editTask(t) {
  const isNew = !t;
  t = t || { id: uid(), kind: state.taskFilter === 'mangel' || state.taskFilter === 'termin' ? state.taskFilter : 'aufgabe', status: 'offen', fileIds: [], createdAt: Date.now() };
  const files = (await Promise.all((t.fileIds || []).map((id) => db.get('files', id)))).filter(Boolean);
  const vals = await formDialog({
    title: isNew ? 'Neuer Eintrag' : 'Eintrag bearbeiten',
    fields: [
      { name: 'title', label: 'Titel', value: t.title || '', required: true },
      { name: 'kind', label: 'Art', type: 'select', value: t.kind, half: true, options: Object.entries(TASK_KINDS).map(([value, label]) => ({ value, label })) },
      { name: 'status', label: 'Status', type: 'select', value: t.status, half: true, options: Object.entries(TASK_STATUS).map(([value, label]) => ({ value, label })) },
      { name: 'due', label: 'Fällig / Datum', type: 'date', value: t.due || '', half: true },
      { name: 'time', label: 'Uhrzeit', type: 'time', value: t.time || '', half: true },
      { name: 'location', label: 'Ort / Raum', value: t.location || '', placeholder: 'z. B. Bad, Balkon, Notar' },
      { name: 'note', label: 'Beschreibung', type: 'textarea', value: t.note || '' },
      ...(files.length
        ? [
            {
              type: 'html',
              html: `<span class="label">Fotos & Dateien</span><div class="thumb-row">${files
                .map((f) => `<button type="button" data-action="file-view" data-id="${f.id}">${f.thumb ? `<img src="${viewUrl(unpackBlob(f.thumb))}" alt="">` : icon('file')}</button>`)
                .join('')}</div>`,
            },
          ]
        : []),
      { name: 'files', label: 'Fotos / Dateien anhängen', type: 'file', accept: 'image/*,application/pdf' },
      ...(isNew ? [] : [{ type: 'html', html: `<button type="button" class="btn full" data-action="task-ics" data-id="${t.id}">${icon('calendar')} In Kalender übernehmen</button>` }]),
    ],
    deleteLabel: isNew ? null : 'Eintrag löschen',
  });
  if (!vals) return false;
  if (vals === 'delete') {
    for (const id of t.fileIds || []) await deleteFile(id);
    await db.del('tasks', t.id);
    return;
  }
  const { files: newFiles, ...rest } = vals;
  const rec = { ...t, ...rest };
  for (const f of newFiles) {
    const saved = await saveFile(f, { category: 'Mängel & Aufgaben', date: rec.due || todayISO(), note: rec.title, taskId: rec.id });
    rec.fileIds = [...(rec.fileIds || []), saved.id];
  }
  if (rec.status === 'erledigt' && !rec.doneAt) rec.doneAt = todayISO();
  await db.put('tasks', rec);
  toast('Gespeichert');
}

const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
const icsDate = (iso) => iso.replace(/-/g, '');

async function exportIcs(t) {
  if (!t.due) return toast('Bitte zuerst ein Datum eintragen');
  const p = await getProperty();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  let start;
  let end;
  if (t.time) {
    const [h, m] = t.time.split(':').map(Number);
    const s = `${icsDate(t.due)}T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
    const e = `${icsDate(t.due)}T${String(Math.min(h + 1, 23)).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
    start = `DTSTART;TZID=Europe/Berlin:${s}`;
    end = `DTEND;TZID=Europe/Berlin:${e}`;
  } else {
    const next = new Date(`${t.due}T12:00:00`);
    next.setDate(next.getDate() + 1);
    start = `DTSTART;VALUE=DATE:${icsDate(t.due)}`;
    end = `DTEND;VALUE=DATE:${icsDate(next.toISOString().slice(0, 10))}`;
  }
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//THE44//Immobilien-App//DE',
    'BEGIN:VEVENT',
    `UID:${t.id}@the44`,
    `DTSTAMP:${stamp}`,
    start,
    end,
    `SUMMARY:${icsText(`${p.name}: ${t.title}`)}`,
    t.location ? `LOCATION:${icsText(t.location)}` : '',
    `DESCRIPTION:${icsText(t.note)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
  await shareOrDownload(new Blob([ics], { type: 'text/calendar' }), `THE44_${t.due}.ics`);
}

// ---------- Vermietung ----------

const isActive = (t, d = todayISO()) => t.start && t.start <= d && (!t.end || t.end >= d);

export async function renderVermietung() {
  const [p, tenancies, txs] = await Promise.all([getProperty(), db.all('tenancies'), db.all('transactions')]);
  tenancies.sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  const today = todayISO();
  const y = state.rentYear;
  const years = [...new Set(tenancies.flatMap((t) => [t.start?.slice(0, 4)]).concat([String(new Date().getFullYear())]).filter(Boolean))].sort().reverse();

  const card = (t) => {
    const warm = (t.coldRent || 0) + (t.utilities || 0);
    const months = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
    const cells = months
      .map((ym, i) => {
        const booked = txs.some((x) => x.tenancyId === t.id && x.rentMonth === ym && x.category === 'miete_kalt');
        const inTerm = t.start && t.start.slice(0, 7) <= ym && (!t.end || t.end.slice(0, 7) >= ym);
        const cls = booked ? 'booked' : !inTerm ? 'na' : ym <= today.slice(0, 7) ? 'due' : 'future';
        return `<button type="button" class="month ${cls}" ${inTerm && !booked ? `data-action="rent-book" data-id="${t.id}" data-month="${ym}"` : 'disabled'}>${MONTHS_SHORT[i]}${booked ? icon('check') : ''}</button>`;
      })
      .join('');
    return `<section class="card">
      <div class="card-head"><h3>${esc(t.tenant || 'Mieter')}</h3><span class="pill ${isActive(t, today) ? 'pos' : ''}">${isActive(t, today) ? 'aktiv' : t.start > today ? 'künftig' : 'beendet'}</span></div>
      ${kv([
        ['Mietbeginn', fmtDate(t.start)],
        t.end ? ['Mietende', fmtDate(t.end)] : null,
        ['Kaltmiete', `${fmtEUR(t.coldRent)}${p.sizeM2 ? ` <small class="muted">(${fmtNum((t.coldRent || 0) / p.sizeM2)} €/m²)</small>` : ''}`],
        ['NK-Vorauszahlung', fmtEUR(t.utilities)],
        ['Warmmiete', `<strong>${fmtEUR(warm)}</strong>`],
        t.deposit ? ['Kaution', fmtEUR(t.deposit)] : null,
        p.purchasePrice ? ['Bruttomietrendite', fmtPct(((t.coldRent || 0) * 1200) / p.purchasePrice, 2)] : null,
      ])}
      <div class="row-between small"><strong>Mieteingänge ${y}</strong><span class="muted">${txs.filter((x) => x.tenancyId === t.id && x.category === 'miete_kalt' && x.rentMonth?.startsWith(y)).length}/12 gebucht</span></div>
      <div class="months">${cells}</div>
      <div class="card-actions">
        <button type="button" class="btn small" data-action="tenancy-edit" data-id="${t.id}">${icon('edit')} Bearbeiten</button>
      </div>
    </section>`;
  };

  const html = `
    ${!isRentalPhase(p) ? `<div class="notice">${icon('info')}<span>Die Wohnung ist noch im Bau${p.handoverDate ? ` (Übergabe ${fmtDate(p.handoverDate)})` : ''}. Hier verwaltest du später Mietverträge und Mieteingänge.</span></div>` : ''}
    ${tenancies.length ? `<div class="filters"><select data-change="rent-year" aria-label="Jahr">${yearOptions(years, y, false)}</select><span class="small muted">Tippe auf einen offenen Monat, um die Miete zu buchen.</span></div>` : ''}
    ${tenancies.length ? tenancies.map(card).join('') : empty('key', 'Noch kein Mietverhältnis', 'Lege den Mietvertrag an, sobald du vermietest. Mieteingänge buchst du dann mit einem Tipp pro Monat.', '<button class="btn primary" data-action="tenancy-add">Mietverhältnis anlegen</button>')}`;
  return sub('Vermietung', html, { fab: { action: 'tenancy-add', label: 'Mietverhältnis anlegen' } });
}

async function editTenancy(t) {
  const isNew = !t;
  t = t || { id: uid() };
  const vals = await formDialog({
    title: isNew ? 'Neues Mietverhältnis' : 'Mietverhältnis bearbeiten',
    fields: [
      { name: 'tenant', label: 'Mieter', value: t.tenant || '', required: true },
      { name: 'start', label: 'Mietbeginn', type: 'date', value: t.start || '', required: true, half: true },
      { name: 'end', label: 'Mietende', type: 'date', value: t.end || '', half: true },
      { name: 'coldRent', label: 'Kaltmiete / Monat', type: 'money', value: t.coldRent, required: true, half: true },
      { name: 'utilities', label: 'NK-Vorauszahlung', type: 'money', value: t.utilities, half: true },
      { name: 'deposit', label: 'Kaution', type: 'money', value: t.deposit, half: true },
      { name: 'rentType', label: 'Mietart', type: 'select', value: t.rentType || 'fest', half: true, options: [{ value: 'fest', label: 'Festmiete' }, { value: 'index', label: 'Indexmiete' }, { value: 'staffel', label: 'Staffelmiete' }] },
      { name: 'phone', label: 'Telefon', type: 'tel', value: t.phone || '', half: true },
      { name: 'email', label: 'E-Mail', type: 'email', value: t.email || '', half: true },
      { name: 'note', label: 'Notiz (z. B. Mieterhöhungen)', type: 'textarea', value: t.note || '' },
    ],
    deleteLabel: isNew ? null : 'Mietverhältnis löschen',
  });
  if (!vals) return false;
  if (vals === 'delete') await db.del('tenancies', t.id);
  else await db.put('tenancies', { ...t, ...vals });
}

async function bookRent(tenancyId, ym) {
  const t = await db.get('tenancies', tenancyId);
  if (!t) return false;
  const [yy, mm] = ym.split('-');
  const label = `${MONTHS_SHORT[Number(mm) - 1]} ${yy}`;
  const vals = await formDialog({
    title: `Miete ${label} buchen`,
    submitLabel: 'Buchen',
    fields: [
      { name: 'date', label: 'Zahlungseingang', type: 'date', value: `${ym}-01`, required: true },
      { name: 'coldRent', label: 'Kaltmiete', type: 'money', value: t.coldRent, required: true, half: true },
      { name: 'utilities', label: 'NK-Vorauszahlung', type: 'money', value: t.utilities, half: true },
    ],
  });
  if (!vals) return false;
  const base = { date: vals.date, counterparty: t.tenant, tenancyId: t.id, rentMonth: ym };
  await saveTransaction({ ...base, category: 'miete_kalt', amount: vals.coldRent, description: `Kaltmiete ${label}` });
  if (vals.utilities) await saveTransaction({ ...base, category: 'miete_nk', amount: vals.utilities, description: `NK-Vorauszahlung ${label}` });
  toast(`Miete ${label} gebucht`);
}

// ---------- Kontakte ----------

export async function renderKontakte() {
  const contacts = await db.all('contacts');
  const groups = CONTACT_ROLES.map((r) => [r, contacts.filter((c) => c.role === r).sort((a, b) => a.name.localeCompare(b.name))]).filter(([, l]) => l.length);
  const html = groups.length
    ? groups
        .map(
          ([role, list]) => `<h3 class="list-head">${esc(role)}</h3><ul class="list">${list
            .map(
              (c) => `<li><button type="button" class="row" data-action="contact-open" data-id="${c.id}">
                <span class="avatar">${esc((c.name || '?').trim().charAt(0).toUpperCase())}</span>
                <span class="grow"><strong>${esc(c.name)}</strong><small class="muted">${esc([c.company, c.phone || c.email].filter(Boolean).join(' · '))}</small></span>
                ${icon('right', 'chev')}
              </button></li>`,
            )
            .join('')}</ul>`,
        )
        .join('')
    : empty('users', 'Noch keine Kontakte', 'Bauträger, Notar, Bank, Verwaltung, Steuerberater – alle Ansprechpartner mit einem Tipp erreichbar.', '<button class="btn primary" data-action="contact-add">Kontakt hinzufügen</button>');
  return sub('Kontakte', html, { fab: { action: 'contact-add', label: 'Kontakt hinzufügen' } });
}

async function editContact(c) {
  const isNew = !c;
  c = c || { id: uid(), role: 'Bauträger' };
  const vals = await formDialog({
    title: isNew ? 'Neuer Kontakt' : 'Kontakt bearbeiten',
    fields: [
      { name: 'name', label: 'Name', value: c.name || '', required: true },
      { name: 'company', label: 'Firma', value: c.company || '' },
      { name: 'role', label: 'Rolle', type: 'select', value: c.role, options: CONTACT_ROLES.map((r) => ({ value: r, label: r })) },
      { name: 'phone', label: 'Telefon', type: 'tel', value: c.phone || '', half: true },
      { name: 'email', label: 'E-Mail', type: 'email', value: c.email || '', half: true },
      { name: 'address', label: 'Adresse', value: c.address || '' },
      { name: 'note', label: 'Notiz', type: 'textarea', value: c.note || '' },
    ],
    deleteLabel: isNew ? null : 'Kontakt löschen',
  });
  if (!vals) return false;
  if (vals === 'delete') await db.del('contacts', c.id);
  else await db.put('contacts', { ...c, ...vals });
}

async function openContact(id) {
  const c = await db.get('contacts', id);
  if (!c) return false;
  const choice = await actionSheet({
    title: c.name,
    subtitle: [c.role, c.company].filter(Boolean).join(' · '),
    actions: [
      ...(c.phone ? [{ label: `Anrufen (${c.phone})`, value: 'call', icon: 'phone' }] : []),
      ...(c.email ? [{ label: 'E-Mail schreiben', value: 'mail', icon: 'mail' }] : []),
      { label: 'Bearbeiten', value: 'edit', icon: 'edit' },
    ],
  });
  if (choice === 'call') location.href = `tel:${c.phone.replace(/[^\d+]/g, '')}`;
  if (choice === 'mail') location.href = `mailto:${c.email}`;
  if (choice === 'edit') return editContact(c);
  return false;
}

// ---------- Objektdaten ----------

export async function renderObjekt() {
  const p = await getProperty();
  const html = `
    <section class="card">
      <div class="card-head"><h3>${esc(p.name)}</h3></div>
      ${kv([
        ['Adresse', esc(p.address)],
        ['Wohnung / Lage', esc(p.unit) || '–'],
        ['Wohnfläche', p.sizeM2 ? `${fmtNum(p.sizeM2)} m²` : '–'],
        ['Zimmer', p.rooms ? fmtNum(p.rooms, 1) : '–'],
        ['Bauträger', esc(p.developer) || '–'],
        ['Kaufvertrag (Beurkundung)', fmtDate(p.contractDate)],
        ['Übergabe (Nutzen & Lasten)', fmtDate(p.handoverDate)],
      ])}
    </section>
    <section class="card">
      <div class="card-head"><h3>Kaufpreis & Steuer</h3></div>
      ${kv([
        ['Kaufpreis', fmtEUR(p.purchasePrice)],
        ['Preis pro m²', p.purchasePrice && p.sizeM2 ? fmtEUR(p.purchasePrice / p.sizeM2) : '–'],
        ['Gebäudeanteil (Rest = Grund & Boden)', fmtPct(Number(p.buildingSharePct) || 0, 0)],
        ['AfA', `${p.afaMethod === 'degressiv' ? 'degressiv' : 'linear'} ${fmtNum(Number(p.afaRate))} %`],
      ])}
    </section>
    ${p.note ? `<section class="card"><div class="card-head"><h3>Notizen</h3></div><p class="pre">${esc(p.note)}</p></section>` : ''}
    <button type="button" class="btn primary full" data-action="property-edit">${icon('edit')} Objektdaten bearbeiten</button>`;
  return sub('Objektdaten', html);
}

async function editProperty() {
  const p = await getProperty();
  const vals = await formDialog({
    title: 'Objektdaten',
    fields: [
      { name: 'name', label: 'Name', value: p.name, required: true, half: true },
      { name: 'unit', label: 'Wohnung / Lage', value: p.unit, half: true, placeholder: 'z. B. WE 12, 3. OG' },
      { name: 'address', label: 'Adresse', value: p.address },
      { name: 'sizeM2', label: 'Wohnfläche m²', type: 'number', value: p.sizeM2, half: true },
      { name: 'rooms', label: 'Zimmer', type: 'number', value: p.rooms, half: true },
      { name: 'developer', label: 'Bauträger', value: p.developer },
      { name: 'contractDate', label: 'Kaufvertrag vom', type: 'date', value: p.contractDate, half: true },
      { name: 'handoverDate', label: 'Übergabe (geplant)', type: 'date', value: p.handoverDate, half: true },
      { name: 'purchasePrice', label: 'Kaufpreis', type: 'money', value: p.purchasePrice },
      { name: 'buildingSharePct', label: 'Gebäudeanteil %', type: 'number', value: p.buildingSharePct, hint: 'Anteil des Kaufpreises, der auf das Gebäude entfällt (nur dieser wird abgeschrieben). Ggf. Kaufpreisaufteilung im Vertrag oder Arbeitshilfe des BMF.' },
      { name: 'afaMethod', label: 'AfA-Methode', type: 'select', value: p.afaMethod, half: true, options: [{ value: 'linear', label: 'Linear' }, { value: 'degressiv', label: 'Degressiv' }] },
      { name: 'afaRate', label: 'AfA-Satz %', type: 'number', value: p.afaRate, half: true },
      {
        type: 'html',
        html: '<small class="hint">Orientierung: Neubau mit Fertigstellung ab 2023 → 3 % linear. Kaufvertrag zwischen 10/2023 und 9/2029 → ggf. 5 % degressiv (§ 7 Abs. 5a EStG); zusätzlich ggf. Sonder-AfA nach § 7b. Bitte mit dem Steuerberater abstimmen.</small>',
      },
      { name: 'note', label: 'Notizen', type: 'textarea', value: p.note },
    ],
  });
  if (!vals) return false;
  await saveProperty({ ...p, ...vals });
  toast('Objektdaten gespeichert');
}

// ---------- Daten & Backup ----------

export async function renderDaten() {
  const [lastBackup, est, persisted, counts] = await Promise.all([
    db.getMeta('lastBackup', null),
    navigator.storage?.estimate?.().catch(() => null),
    navigator.storage?.persisted?.().catch(() => false),
    Promise.all(['photos', 'files', 'transactions', 'tasks'].map(async (s) => (await db.keys(s)).length)),
  ]);
  const html = `
    <section class="card">
      <div class="card-head"><h3>Gespeichert auf diesem Gerät</h3></div>
      ${kv([
        ['Baufotos', counts[0]],
        ['Dokumente & Belege', counts[1]],
        ['Buchungen', counts[2]],
        ['Aufgaben', counts[3]],
        est ? ['Speicherbedarf', `${fmtSize(est.usage)}${est.quota ? ` <small class="muted">von ${fmtSize(est.quota)}</small>` : ''}`] : null,
        ['Dauerhafter Speicher', persisted ? '<span class="pos">aktiv</span>' : '<span class="muted">nicht bestätigt</span>'],
        ['Letztes Backup', lastBackup ? new Date(lastBackup).toLocaleString('de-DE') : '<span class="neg">noch nie</span>'],
      ])}
    </section>
    <div class="notice">${icon('info')}<span>Alle Daten liegen nur lokal in dieser App. Erstelle regelmäßig ein Backup und sichere es z. B. in iCloud Drive – damit kannst du auch auf ein neues Gerät umziehen.</span></div>
    <div class="stack">
      <button type="button" class="btn primary full" data-action="backup-create">${icon('download')} Backup erstellen</button>
      <button type="button" class="btn full" data-action="backup-restore">${icon('upload')} Backup wiederherstellen</button>
      <button type="button" class="btn full" data-action="csv-export" data-year="alle">${icon('chart')} Alle Buchungen als CSV</button>
      <button type="button" class="btn danger full" data-action="data-wipe">${icon('trash')} Alle Daten löschen</button>
    </div>`;
  return sub('Daten & Backup', html);
}

export async function renderInfo() {
  const html = `
    <section class="card prose">
      <h3>Auf dem iPhone installieren</h3>
      <ol>
        <li>Diese Seite in <strong>Safari</strong> öffnen.</li>
        <li>Unten auf <strong>Teilen</strong> ${icon('share', 'inline')} tippen.</li>
        <li><strong>„Zum Home-Bildschirm“</strong> wählen.</li>
      </ol>
      <p>Danach startet THE44 wie eine normale App, funktioniert offline und Safari löscht die Daten nicht automatisch.</p>
      <h3>Was die App kann</h3>
      <ul>
        <li><strong>Bau:</strong> Update-Fotos nach Datum & Bauabschnitt, MaBV-Zahlungsplan mit automatischer Buchung.</li>
        <li><strong>Finanzen:</strong> Buchungen mit Beleg-Foto, steuerliche Zuordnung, Anlage-V-Übersicht inkl. AfA, CSV-Export, Darlehen.</li>
        <li><strong>Dokumente:</strong> Verträge, Pläne, Protokolle – durchsuchbar, offline, teilbar.</li>
        <li><strong>Mehr:</strong> Aufgaben, Termine (Kalender-Export) & Mängel mit Fotos, Vermietung mit Mieteingängen, Kontakte.</li>
      </ul>
      <h3>Datenschutz</h3>
      <p>Es gibt keinen Server und kein Konto. Alles bleibt auf deinem Gerät, bis du selbst ein Backup oder eine Datei teilst.</p>
      <p class="small muted">Steuerliche Hinweise sind vereinfacht und ersetzen keine Steuerberatung.</p>
    </section>`;
  return sub('Hilfe', html);
}

export const actions = {
  'task-filter': (el) => {
    state.taskFilter = el.dataset.value;
  },
  'task-add': () => editTask(null),
  'task-edit': async (el) => editTask(await db.get('tasks', el.dataset.id)),
  'task-toggle': async (el) => {
    const t = await db.get('tasks', el.dataset.id);
    const done = t.status !== 'erledigt';
    await db.put('tasks', { ...t, status: done ? 'erledigt' : 'offen', doneAt: done ? todayISO() : null });
  },
  'task-ics': async (el) => {
    const t = await db.get('tasks', el.dataset.id);
    if (t) await exportIcs(t);
    return false;
  },
  'tenancy-add': () => editTenancy(null),
  'tenancy-edit': async (el) => editTenancy(await db.get('tenancies', el.dataset.id)),
  'rent-book': (el) => bookRent(el.dataset.id, el.dataset.month),
  'rent-year': (el) => {
    state.rentYear = el.value;
  },
  'contact-add': () => editContact(null),
  'contact-open': (el) => openContact(el.dataset.id),
  'property-edit': () => editProperty(),
  'backup-create': async () => {
    toast('Backup wird erstellt …', 0);
    const blob = await createBackup();
    await db.setMeta('lastBackup', new Date().toISOString());
    toast(`Backup erstellt (${fmtSize(blob.size)})`);
    await shareOrDownload(blob, `THE44-Backup_${todayISO()}.ndjson`);
  },
  'backup-restore': async () => {
    const [file] = await pickFiles({ multiple: false });
    if (!file) return false;
    if (!confirm('Alle aktuellen Daten werden durch das Backup ersetzt. Fortfahren?')) return false;
    toast('Stelle Backup wieder her …', 0);
    const n = await restoreBackup(file, (k) => toast(`${k} Datensätze wiederhergestellt …`, 0));
    toast(`Backup wiederhergestellt (${n} Datensätze)`);
  },
  'data-wipe': async () => {
    if (!confirm('Wirklich ALLE Daten (Fotos, Dokumente, Buchungen …) von diesem Gerät löschen?')) return false;
    if (prompt('Zur Bestätigung LÖSCHEN eingeben') !== 'LÖSCHEN') return false;
    for (const s of STORES) await db.clear(s);
    toast('Alle Daten gelöscht');
  },
};
