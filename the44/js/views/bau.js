import { db } from '../db.js';
import { getProperty, savePhotos, deletePhoto, loadBlob, unpackBlob, planAmount, saveTransaction } from '../data.js';
import { esc, fmtEUR, fmtEUR0, fmtDate, fmtPct, todayISO, sum, byDateDesc, viewUrl, toast, pickFiles, shareOrDownload, uid } from '../util.js';
import { icon } from '../icons.js';
import { MABV_PLAN, PAYMENT_STATUS } from '../config.js';
import { formDialog } from '../ui.js';
import { segmented, empty, progress } from './common.js';
import { refresh } from '../app.js';

const tabs = (active) =>
  segmented(
    [
      ['#/bau', 'Fotos'],
      ['#/bau/zahlungsplan', 'Zahlungsplan'],
    ],
    active,
  );

const sortedPhotos = async () => (await db.all('photos')).sort(byDateDesc);

export async function renderFotos() {
  const photos = await sortedPhotos();
  const groups = [];
  for (const ph of photos) {
    const key = `${ph.date}|${ph.title}`;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) groups.push((g = { key, date: ph.date, title: ph.title, note: ph.note, items: [] }));
    g.items.push(ph);
  }
  const html = `${tabs('#/bau')}
    ${
      groups.length
        ? groups
            .map(
              (g) => `<section class="photo-group">
                <div class="group-head"><h3>${esc(g.title || 'Baustellen-Update')}</h3><span class="muted">${fmtDate(g.date)} · ${g.items.length} Foto${g.items.length === 1 ? '' : 's'}</span></div>
                ${g.note ? `<p class="muted small">${esc(g.note)}</p>` : ''}
                <div class="photo-grid">${g.items
                  .map((ph) => `<button type="button" data-action="photo-open" data-id="${ph.id}"><img loading="lazy" src="${viewUrl(unpackBlob(ph.thumb))}" alt="${esc(ph.title)}"></button>`)
                  .join('')}</div>
              </section>`,
            )
            .join('')
        : empty('camera', 'Noch keine Baufotos', 'Lade die Update-Fotos vom Bauträger hoch – sie werden nach Datum sortiert und platzsparend gespeichert.', `<button class="btn primary" data-action="photo-add">${icon('camera')} Fotos hinzufügen</button>`)
    }`;
  return { title: 'Bau', html, fab: { action: 'photo-add', icon: 'camera', label: 'Fotos hinzufügen' } };
}

export async function addPhotos() {
  const files = await pickFiles({ accept: 'image/*' });
  if (!files.length) return false;
  const vals = await formDialog({
    title: `${files.length} Foto${files.length === 1 ? '' : 's'} hinzufügen`,
    fields: [
      { name: 'date', label: 'Datum des Updates', type: 'date', value: todayISO(), required: true },
      { name: 'title', label: 'Titel / Bauabschnitt', placeholder: 'z. B. Rohbau 3. OG' },
      { name: 'note', label: 'Notiz', type: 'textarea' },
    ],
  });
  if (!vals) return false;
  await savePhotos(files, vals, (i, n) => toast(`Speichere Foto ${i} von ${n} …`, 0));
  toast(`${files.length} Foto${files.length === 1 ? '' : 's'} gespeichert`);
}

async function editPhoto(ph) {
  const vals = await formDialog({
    title: 'Foto bearbeiten',
    fields: [
      { name: 'date', label: 'Datum', type: 'date', value: ph.date, required: true },
      { name: 'title', label: 'Titel / Bauabschnitt', value: ph.title },
      { name: 'note', label: 'Notiz', type: 'textarea', value: ph.note },
    ],
    deleteLabel: 'Foto löschen',
  });
  if (vals === 'delete') {
    await deletePhoto(ph.id);
    return 'deleted';
  }
  if (vals) await db.put('photos', { ...ph, ...vals });
  return vals ? 'saved' : null;
}

async function openLightbox(id) {
  let photos = await sortedPhotos();
  let idx = Math.max(0, photos.findIndex((p) => p.id === id));
  let url = null;
  const ov = document.createElement('dialog');
  ov.className = 'lightbox';
  ov.innerHTML = `
    <header class="viewer-head">
      <button type="button" class="icon-btn" data-lb="close" aria-label="Schließen">${icon('x')}</button>
      <span class="lb-count"></span>
      <span class="lb-tools">
        <button type="button" class="icon-btn" data-lb="share" aria-label="Teilen">${icon('share')}</button>
        <button type="button" class="icon-btn" data-lb="edit" aria-label="Bearbeiten">${icon('edit')}</button>
      </span>
    </header>
    <div class="lb-stage"><img alt=""></div>
    <button type="button" class="lb-nav prev" data-lb="prev" aria-label="Zurück">${icon('left')}</button>
    <button type="button" class="lb-nav next" data-lb="next" aria-label="Weiter">${icon('right')}</button>
    <footer class="lb-caption"></footer>`;
  document.body.appendChild(ov);
  const img = ov.querySelector('img');

  async function show() {
    const ph = photos[idx];
    const blob = await loadBlob(ph.id);
    if (url) URL.revokeObjectURL(url);
    url = blob ? URL.createObjectURL(blob) : '';
    img.src = url;
    ov.querySelector('.lb-count').textContent = `${idx + 1} / ${photos.length}`;
    ov.querySelector('.lb-caption').innerHTML = `<strong>${esc(ph.title || 'Baustellen-Update')}</strong> · ${fmtDate(ph.date)}${ph.note ? `<br><span>${esc(ph.note)}</span>` : ''}`;
    ov.querySelector('.prev').hidden = idx === 0;
    ov.querySelector('.next').hidden = idx === photos.length - 1;
  }
  const go = (d) => {
    const n = idx + d;
    if (n >= 0 && n < photos.length) {
      idx = n;
      show();
    }
  };
  const close = () => {
    ov.close();
    ov.remove();
    if (url) URL.revokeObjectURL(url);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  ov.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-lb]')?.dataset.lb;
    if (a === 'close') close();
    if (a === 'prev') go(-1);
    if (a === 'next') go(1);
    if (a === 'share') {
      const ph = photos[idx];
      shareOrDownload(await loadBlob(ph.id), `THE44_${ph.date}_${idx + 1}.jpg`);
    }
    if (a === 'edit') {
      const r = await editPhoto(photos[idx]);
      if (!r) return;
      photos = await sortedPhotos();
      if (!photos.length) {
        close();
      } else {
        idx = Math.min(idx, photos.length - 1);
        show();
      }
      refresh();
    }
  });
  let x0 = null;
  ov.addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
  ov.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    x0 = null;
  });
  ov.showModal();
  await show();
}

// ---------- Zahlungsplan (MaBV) ----------

export async function renderPlan() {
  const [p, payments] = await Promise.all([getProperty(), db.all('payments')]);
  payments.sort((a, b) => a.order - b.order);
  const price = p.purchasePrice || 0;
  const amountOf = (x) => planAmount(x, p);
  const paid = sum(payments.filter((x) => x.status === 'bezahlt'), amountOf);
  const requested = sum(payments.filter((x) => x.status === 'abgerufen'), amountOf);
  const pctTotal = sum(payments, (x) => x.pct);

  let html = tabs('#/bau/zahlungsplan');
  if (!price) {
    html += `<a class="notice" href="#/objekt">${icon('info')}<span>Trage den Kaufpreis unter <strong>Objektdaten</strong> ein, damit die Raten in Euro berechnet werden.</span></a>`;
  }
  if (!payments.length) {
    html += empty(
      'bank',
      'Noch kein Zahlungsplan',
      'Bauträger rechnen nach Baufortschritt gemäß Makler- und Bauträgerverordnung (MaBV) ab. Übernimm den Standardplan und passe ihn an deinen Kaufvertrag an.',
      `<button class="btn primary" data-action="plan-seed">MaBV-Standardplan übernehmen</button><button class="btn" data-action="plan-add">Eigene Rate anlegen</button>`,
    );
  } else {
    html += `<section class="card">
        <div class="row-between"><span>Bezahlt</span><strong>${fmtEUR0(paid)}${price ? ` von ${fmtEUR0(price)}` : ''}</strong></div>
        ${progress(price ? (paid / price) * 100 : 0)}
        <div class="row-between small muted"><span>Abgerufen, offen: ${fmtEUR0(requested)}</span><span>Rest: ${fmtEUR0(price - paid - requested)}</span></div>
        ${Math.abs(pctTotal - 100) > 0.01 ? `<p class="small warn-text">${icon('alert')} Summe der Raten: ${fmtPct(pctTotal)} (sollte 100 % sein)</p>` : ''}
      </section>
      <ul class="list">${payments
        .map(
          (x, i) => `<li><button type="button" class="row" data-action="plan-edit" data-id="${x.id}">
            <span class="num-badge ${x.status}">${x.status === 'bezahlt' ? icon('check') : i + 1}</span>
            <span class="grow"><strong>${esc(x.label)}</strong>
              <small class="muted">${fmtPct(x.pct)} · ${PAYMENT_STATUS[x.status]}${x.paidDate ? ` am ${fmtDate(x.paidDate)}` : x.requestedDate ? ` am ${fmtDate(x.requestedDate)}` : ''}${x.transactionId ? ` · ${icon('euro', 'inline')} gebucht` : ''}</small></span>
            <span class="amount">${fmtEUR(amountOf(x))}</span>
          </button></li>`,
        )
        .join('')}</ul>
      <p class="small muted pad">Nach § 3 MaBV dürfen höchstens sieben Raten verlangt werden – einzelne Positionen können also zusammengefasst sein. Maßgeblich ist dein Kaufvertrag.</p>`;
  }
  return { title: 'Bau', html, fab: { action: 'plan-add', label: 'Rate hinzufügen' } };
}

async function editPayment(x) {
  const isNew = !x;
  x = x || { id: uid(), order: Date.now(), label: '', pct: 0, status: 'offen' };
  const p = await getProperty();
  const vals = await formDialog({
    title: isNew ? 'Neue Rate' : 'Rate bearbeiten',
    fields: [
      { name: 'label', label: 'Bautenstand / Bezeichnung', value: x.label, required: true },
      { name: 'pct', label: 'Anteil in %', type: 'number', value: x.pct, half: true },
      { name: 'amount', label: 'Betrag (optional)', type: 'money', value: x.amount, half: true, hint: p.purchasePrice ? `Leer = ${fmtEUR(((x.pct || 0) * p.purchasePrice) / 100)} aus dem Prozentsatz` : 'Leer = aus Prozentsatz und Kaufpreis' },
      { name: 'status', label: 'Status', type: 'select', value: x.status, options: Object.entries(PAYMENT_STATUS).map(([value, label]) => ({ value, label })) },
      { name: 'requestedDate', label: 'Abgerufen am', type: 'date', value: x.requestedDate || '', half: true },
      { name: 'paidDate', label: 'Bezahlt am', type: 'date', value: x.paidDate || '', half: true },
      { name: 'note', label: 'Notiz', type: 'textarea', value: x.note || '' },
      ...(x.transactionId ? [] : [{ name: 'createTx', label: 'Bei Status „Bezahlt“ automatisch als Ausgabe buchen', type: 'checkbox', value: true }]),
    ],
    deleteLabel: isNew ? null : 'Rate löschen',
  });
  if (!vals) return false;
  if (vals === 'delete') {
    await db.del('payments', x.id);
    return;
  }
  const { createTx, ...rest } = vals;
  const rec = { ...x, ...rest, pct: rest.pct || 0 };
  if (rec.status === 'bezahlt' && !rec.paidDate) rec.paidDate = todayISO();
  if (rec.status === 'bezahlt' && createTx && !rec.transactionId) {
    const t = await saveTransaction({
      date: rec.paidDate,
      amount: planAmount(rec, p),
      category: 'kaufpreis',
      description: `Kaufpreisrate: ${rec.label}`,
      counterparty: p.developer || '',
      paymentId: rec.id,
    });
    rec.transactionId = t.id;
    toast('Rate bezahlt und als Ausgabe gebucht');
  }
  await db.put('payments', rec);
}

export const actions = {
  'photo-add': () => addPhotos(),
  'photo-open': (el) => {
    openLightbox(el.dataset.id);
    return false;
  },
  'plan-seed': async () => {
    let i = 0;
    for (const s of MABV_PLAN) await db.put('payments', { id: uid(), order: ++i, label: s.label, pct: s.pct, status: 'offen' });
    toast('MaBV-Standardplan angelegt');
  },
  'plan-add': () => editPayment(null),
  'plan-edit': async (el) => editPayment(await db.get('payments', el.dataset.id)),
};
