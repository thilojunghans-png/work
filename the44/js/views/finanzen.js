import { db } from '../db.js';
import { getProperty, saveTransaction, deleteTransaction, saveFile, deleteFile, loadBlob, computeAfa, loanStats, isRentalPhase } from '../data.js';
import { esc, fmtEUR, fmtEUR0, fmtDate, fmtMonth, fmtPct, fmtNum, todayISO, sum, byDateDesc, toast, shareOrDownload, uid } from '../util.js';
import { icon } from '../icons.js';
import { CATEGORIES, TAX_CLASSES, catById } from '../config.js';
import { formDialog, openViewer } from '../ui.js';
import { segmented, empty, chips, kv, yearOptions } from './common.js';

const state = { year: String(new Date().getFullYear()), kind: 'alle', evalYear: String(new Date().getFullYear()) };

const tabs = (active) =>
  segmented(
    [
      ['#/finanzen', 'Buchungen'],
      ['#/finanzen/auswertung', 'Auswertung'],
      ['#/finanzen/darlehen', 'Darlehen'],
    ],
    active,
  );

const yearsOf = (txs) => {
  const ys = new Set(txs.map((t) => t.date.slice(0, 4)));
  ys.add(String(new Date().getFullYear()));
  return [...ys].sort().reverse();
};

const signed = (t) => (t.kind === 'income' ? t.amount : -t.amount);

export async function renderBuchungen() {
  const txs = (await db.all('transactions')).sort(byDateDesc);
  const list = txs.filter(
    (t) => (state.year === 'alle' || t.date.startsWith(state.year)) && (state.kind === 'alle' || t.kind === state.kind),
  );
  const income = sum(list.filter((t) => t.kind === 'income'), (t) => t.amount);
  const expense = sum(list.filter((t) => t.kind === 'expense'), (t) => t.amount);
  const byMonth = [];
  for (const t of list) {
    const ym = t.date.slice(0, 7);
    let g = byMonth[byMonth.length - 1];
    if (!g || g.ym !== ym) byMonth.push((g = { ym, items: [] }));
    g.items.push(t);
  }

  const html = `${tabs('#/finanzen')}
    <div class="filters">
      <select data-change="fin-year" aria-label="Jahr">${yearOptions(yearsOf(txs), state.year)}</select>
      ${chips(
        [
          ['alle', 'Alle'],
          ['expense', 'Ausgaben'],
          ['income', 'Einnahmen'],
        ],
        state.kind,
        'fin-kind',
      )}
    </div>
    <div class="stats three">
      <div class="stat"><small>Einnahmen</small><strong class="pos">${fmtEUR0(income)}</strong></div>
      <div class="stat"><small>Ausgaben</small><strong class="neg">${fmtEUR0(expense)}</strong></div>
      <div class="stat"><small>Saldo</small><strong>${fmtEUR0(income - expense)}</strong></div>
    </div>
    ${
      byMonth.length
        ? byMonth
            .map(
              (g) => `<h3 class="list-head">${fmtMonth(g.ym)}<span>${fmtEUR(sum(g.items, signed))}</span></h3>
              <ul class="list">${g.items.map(txRow).join('')}</ul>`,
            )
            .join('')
        : empty('euro', 'Keine Buchungen', 'Erfasse Kaufpreisraten, Notar, Grunderwerbsteuer, Zinsen und später Mieteinnahmen – mit Beleg-Foto.')
    }`;
  return { title: 'Finanzen', html, fab: { action: 'tx-add', label: 'Buchung hinzufügen' } };
}

function txRow(t) {
  const cat = catById(t.category);
  return `<li><button type="button" class="row" data-action="tx-edit" data-id="${t.id}">
    <span class="tx-icon ${t.kind}">${icon(t.kind === 'income' ? 'arrowDown' : 'arrowUp')}</span>
    <span class="grow"><strong>${esc(t.description || cat.label)}</strong>
      <small class="muted">${fmtDate(t.date)} · ${esc(cat.label)}${t.receiptIds?.length ? ` · ${icon('clip', 'inline')}${t.receiptIds.length}` : ''}</small></span>
    <span class="amount ${t.kind === 'income' ? 'pos' : ''}">${fmtEUR(signed(t))}</span>
  </button></li>`;
}

export async function editTransaction(t, preset = {}) {
  const isNew = !t;
  t = t || { date: todayISO(), category: 'kaufpreis', receiptIds: [], ...preset };
  const cat = catById(t.category);
  const receipts = (await Promise.all((t.receiptIds || []).map((id) => db.get('files', id)))).filter(Boolean);
  const receiptHtml = receipts.length
    ? `<span class="label">Belege</span><ul class="mini-files">${receipts
        .map(
          (f) => `<li><button type="button" data-action="file-view" data-id="${f.id}">${icon('clip')} ${esc(f.name)}</button>
            <button type="button" class="icon-btn small" data-action="tx-receipt-del" data-id="${f.id}" data-tx="${t.id}" aria-label="Beleg entfernen">${icon('x')}</button></li>`,
        )
        .join('')}</ul>`
    : '';
  const vals = await formDialog({
    title: isNew ? 'Neue Buchung' : 'Buchung bearbeiten',
    fields: [
      { name: 'amount', label: 'Betrag', type: 'money', value: t.amount, required: true, half: true },
      { name: 'date', label: 'Datum', type: 'date', value: t.date, required: true, half: true },
      {
        name: 'category',
        label: 'Kategorie',
        type: 'select',
        value: t.category,
        options: CATEGORIES.map((c) => ({ value: c.id, label: c.label, group: c.group })),
        hint: cat.hint || '',
      },
      { name: 'taxClass', label: 'Steuerliche Behandlung', type: 'select', value: t.taxClass || cat.tax, options: Object.entries(TAX_CLASSES).map(([value, label]) => ({ value, label })) },
      { name: 'description', label: 'Beschreibung', value: t.description || '', placeholder: 'z. B. 2. Rate Rohbau' },
      { name: 'counterparty', label: 'Empfänger / Zahler', value: t.counterparty || '' },
      { name: 'note', label: 'Notiz', type: 'textarea', value: t.note || '' },
      ...(receiptHtml ? [{ type: 'html', html: receiptHtml }] : []),
      { name: 'files', label: receipts.length ? 'Weitere Belege anhängen' : 'Beleg anhängen (Foto/PDF)', type: 'file', accept: 'image/*,application/pdf' },
    ],
    deleteLabel: isNew ? null : 'Buchung löschen',
    onInput: (form, e) => {
      if (e.target.name !== 'category') return;
      const c = catById(e.target.value);
      form.elements.taxClass.value = c.tax;
      const h = form.querySelector('[data-hint="category"]');
      if (h) h.textContent = c.hint || '';
    },
  });
  if (!vals) return false;
  if (vals === 'delete') {
    await deleteTransaction(t);
    toast('Buchung gelöscht');
    return;
  }
  const { files, ...rest } = vals;
  const rec = { ...t, ...rest, amount: Math.abs(rest.amount), id: t.id || uid() };
  // Belege können im offenen Formular entfernt worden sein.
  const stored = t.id ? await db.get('transactions', t.id) : null;
  if (stored) rec.receiptIds = stored.receiptIds || [];
  for (const f of files) {
    const saved = await saveFile(f, { category: 'Belege', date: rec.date, note: rec.description, transactionId: rec.id });
    rec.receiptIds = [...(rec.receiptIds || []), saved.id];
  }
  await saveTransaction(rec);
  toast(isNew ? 'Buchung gespeichert' : 'Änderungen gespeichert');
}

// ---------- Auswertung ----------

export async function renderAuswertung() {
  const [p, txs] = await Promise.all([getProperty(), db.all('transactions')]);
  const y = state.evalYear;
  const inYear = txs.filter((t) => t.date.startsWith(y));
  const byTax = (c) => sum(inYear.filter((t) => t.taxClass === c), (t) => (t.kind === 'income' ? t.amount : -t.amount));
  const income = byTax('einnahme');
  const wk = -byTax('werbungskosten');
  const check = inYear.filter((t) => t.taxClass === 'pruefen');
  const afa = computeAfa(p, txs, Number(y));
  const result = income - wk - afa.amount;

  const cats = {};
  for (const t of inYear) {
    const k = t.category;
    cats[k] = (cats[k] || 0) + (t.kind === 'income' ? t.amount : -t.amount);
  }
  const catRows = Object.entries(cats).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  const html = `${tabs('#/finanzen/auswertung')}
    <div class="filters">
      <select data-change="fin-eval-year" aria-label="Jahr">${yearOptions(yearsOf(txs), y, false)}</select>
      <button type="button" class="btn small" data-action="csv-export" data-year="${y}">${icon('download')} CSV ${y}</button>
    </div>

    <section class="card">
      <div class="card-head"><h3>Anlage V ${y} (Orientierung)</h3></div>
      ${kv([
        ['Einnahmen (Miete, NK, Erstattungen)', `<span class="pos">${fmtEUR(income)}</span>`],
        ['Werbungskosten (sofort abziehbar)', `<span class="neg">${fmtEUR(-wk)}</span>`],
        ['AfA Gebäude', afa.started ? `<span class="neg">${fmtEUR(-afa.amount)}</span>` : '<span class="muted">noch nicht begonnen</span>'],
        ['Ergebnis Vermietung & Verpachtung', `<strong class="${result >= 0 ? 'pos' : 'neg'}">${fmtEUR(result)}</strong>`],
      ])}
      ${check.length ? `<p class="small warn-text">${icon('alert')} ${check.length} Buchung(en) mit „Prüfen“ (${fmtEUR(sum(check, (t) => t.amount))}) sind nicht enthalten.</p>` : ''}
      ${!isRentalPhase(p) && wk ? '<p class="small muted">In der Bauphase entstandene Werbungskosten (z. B. Bereitstellungs- und Bauzeitzinsen) sind als vorweggenommene Werbungskosten absetzbar.</p>' : ''}
    </section>

    <section class="card">
      <div class="card-head"><h3>Abschreibung (AfA)</h3><a href="#/objekt">Einstellungen ${icon('right')}</a></div>
      ${kv([
        ['Kaufpreis', fmtEUR(afa.kaufpreis)],
        ['Anschaffungsnebenkosten (gebucht)', fmtEUR(afa.neben)],
        ['Gebäudeanteil', fmtPct(Number(p.buildingSharePct) || 0, 0)],
        ['AfA-Bemessungsgrundlage', `<strong>${fmtEUR(afa.base)}</strong>`],
        ['Methode', `${p.afaMethod === 'degressiv' ? 'degressiv' : 'linear'} ${fmtNum(Number(p.afaRate))} % ab ${p.handoverDate ? fmtDate(p.handoverDate) : '–'}`],
        afa.started ? ['Restbuchwert Ende ' + y, fmtEUR(afa.bookValueEnd)] : null,
      ])}
    </section>

    <section class="card">
      <div class="card-head"><h3>Nach Kategorie ${y}</h3></div>
      ${
        catRows.length
          ? `<dl class="kv">${catRows
              .map(([k, v]) => `<div><dt>${esc(catById(k).label)}<small>${esc(TAX_CLASSES[catById(k).tax] || '')}</small></dt><dd class="${v >= 0 ? 'pos' : ''}">${fmtEUR(v)}</dd></div>`)
              .join('')}</dl>`
          : '<p class="muted">Keine Buchungen in diesem Jahr.</p>'
      }
    </section>
    <p class="small muted pad">Alle Berechnungen sind vereinfacht und ersetzen keine Steuerberatung. Die CSV-Datei kannst du direkt an deinen Steuerberater geben.</p>`;
  return { title: 'Finanzen', html };
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function exportCsv(year) {
  const [p, txs] = await Promise.all([getProperty(), db.all('transactions')]);
  const rows = txs.filter((t) => year === 'alle' || t.date.startsWith(year)).sort((a, b) => a.date.localeCompare(b.date));
  const head = ['Datum', 'Art', 'Kategorie', 'Steuerliche Behandlung', 'Beschreibung', 'Empfänger/Zahler', 'Betrag', 'Phase', 'Belege', 'Notiz'];
  const lines = [head.join(';')].concat(
    rows.map((t) =>
      [
        fmtDate(t.date),
        t.kind === 'income' ? 'Einnahme' : 'Ausgabe',
        catById(t.category).label,
        TAX_CLASSES[t.taxClass] || '',
        t.description,
        t.counterparty,
        (t.kind === 'income' ? t.amount : -t.amount).toFixed(2).replace('.', ','),
        isRentalPhase(p, t.date) ? 'Vermietung' : 'Bauphase',
        (t.receiptIds || []).length,
        t.note,
      ]
        .map(csvCell)
        .join(';'),
    ),
  );
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  await shareOrDownload(blob, `THE44_Buchungen_${year}.csv`);
}

// ---------- Darlehen ----------

export async function renderDarlehen() {
  const loans = await db.all('loans');
  const year = new Date().getFullYear();
  const html = `${tabs('#/finanzen/darlehen')}
    ${
      loans.length
        ? loans
            .map((l) => {
              const s = loanStats(l);
              return `<section class="card tap" data-action="loan-edit" data-id="${l.id}">
                <div class="card-head"><h3>${esc(l.bank || 'Darlehen')}${l.label ? ` · ${esc(l.label)}` : ''}</h3>${icon('right')}</div>
                ${kv([
                  ['Darlehensbetrag', fmtEUR(l.amount)],
                  ['Sollzins / Tilgung', `${fmtNum(l.interest)} % / ${fmtNum(l.repayment)} %`],
                  ['Monatsrate', `<strong>${fmtEUR(s.monthly)}</strong>`],
                  ['Restschuld heute (ca.)', fmtEUR(s.balanceNow)],
                  [`Zinsen ${year} (ca.)`, fmtEUR(s.interestThisYear)],
                  l.fixedUntil ? [`Restschuld Zinsbindungsende ${fmtDate(l.fixedUntil)}`, fmtEUR(s.balanceFixedEnd)] : null,
                ])}
              </section>`;
            })
            .join('') +
          '<p class="small muted pad">Vereinfachte Annuitätenrechnung ab erster Rate. In der Bauphase wird das Darlehen meist schrittweise ausgezahlt – die echten Zinsen findest du in deinen Kontoauszügen.</p>'
        : empty('bank', 'Kein Darlehen erfasst', 'Hinterlege deine Finanzierung, um Rate, Restschuld und Zinsanteil im Blick zu behalten.', '<button class="btn primary" data-action="loan-add">Darlehen hinzufügen</button>')
    }`;
  return { title: 'Finanzen', html, fab: { action: 'loan-add', label: 'Darlehen hinzufügen' } };
}

async function editLoan(l) {
  const isNew = !l;
  l = l || { id: uid() };
  const vals = await formDialog({
    title: isNew ? 'Neues Darlehen' : 'Darlehen bearbeiten',
    fields: [
      { name: 'bank', label: 'Bank', value: l.bank || '', required: true, half: true },
      { name: 'label', label: 'Bezeichnung', value: l.label || '', half: true, placeholder: 'z. B. KfW 297' },
      { name: 'amount', label: 'Darlehensbetrag', type: 'money', value: l.amount, required: true },
      { name: 'interest', label: 'Sollzins % p. a.', type: 'number', value: l.interest, half: true },
      { name: 'repayment', label: 'Anfangstilgung %', type: 'number', value: l.repayment, half: true },
      { name: 'start', label: 'Erste Rate', type: 'date', value: l.start || '', half: true },
      { name: 'fixedUntil', label: 'Zinsbindung bis', type: 'date', value: l.fixedUntil || '', half: true },
      { name: 'freeUntil', label: 'Bereitstellungszinsfrei bis', type: 'date', value: l.freeUntil || '' },
      { name: 'note', label: 'Notiz', type: 'textarea', value: l.note || '' },
    ],
    deleteLabel: isNew ? null : 'Darlehen löschen',
  });
  if (!vals) return false;
  if (vals === 'delete') await db.del('loans', l.id);
  else await db.put('loans', { ...l, ...vals });
}

export const actions = {
  'fin-year': (el) => {
    state.year = el.value;
  },
  'fin-kind': (el) => {
    state.kind = el.dataset.value;
  },
  'fin-eval-year': (el) => {
    state.evalYear = el.value;
  },
  'tx-add': () => editTransaction(),
  'tx-edit': async (el) => editTransaction(await db.get('transactions', el.dataset.id)),
  'tx-receipt-del': async (el) => {
    if (!confirm('Beleg entfernen?')) return false;
    const t = await db.get('transactions', el.dataset.tx);
    await deleteFile(el.dataset.id);
    if (t) await db.put('transactions', { ...t, receiptIds: t.receiptIds.filter((id) => id !== el.dataset.id) });
    el.closest('li')?.remove();
    toast('Beleg entfernt');
  },
  'file-view': async (el) => {
    const f = await db.get('files', el.dataset.id);
    const blob = f && (await loadBlob(f.id));
    if (blob) openViewer(blob, f.name);
    return false;
  },
  'csv-export': async (el) => {
    await exportCsv(el.dataset.year);
    return false;
  },
  'loan-add': () => editLoan(null),
  'loan-edit': async (el) => editLoan(await db.get('loans', el.dataset.id)),
};

export { exportCsv };
