import { db } from '../db.js';
import { getProperty, isRentalPhase, planAmount, unpackBlob } from '../data.js';
import { esc, fmtEUR0, fmtEUR, fmtDate, fmtPct, todayISO, daysBetween, sum, byDateDesc, viewUrl } from '../util.js';
import { icon } from '../icons.js';
import { TASK_KINDS } from '../config.js';
import { progress } from './common.js';
import { addPhotos } from './bau.js';
import { editTransaction } from './finanzen.js';
import { uploadDocuments } from './dokumente.js';
import { editTask } from './mehr.js';

export async function render() {
  const [p, photos, txs, payments, tasks, tenancies, lastBackup] = await Promise.all([
    getProperty(),
    db.all('photos'),
    db.all('transactions'),
    db.all('payments'),
    db.all('tasks'),
    db.all('tenancies'),
    db.getMeta('lastBackup', null),
  ]);
  const today = todayISO();
  const year = today.slice(0, 4);
  const rental = isRentalPhase(p, today);
  const price = p.purchasePrice || 0;
  const paid = sum(payments.filter((x) => x.status === 'bezahlt'), (x) => planAmount(x, p));
  const requested = sum(payments.filter((x) => x.status === 'abgerufen'), (x) => planAmount(x, p));
  const spent = sum(txs.filter((t) => t.kind === 'expense' && t.category !== 'tilgung'), (t) => t.amount);
  const incomeYear = sum(txs.filter((t) => t.kind === 'income' && t.taxClass === 'einnahme' && t.date.startsWith(year)), (t) => t.amount);
  const open = tasks.filter((t) => t.status !== 'erledigt');
  const defects = open.filter((t) => t.kind === 'mangel').length;
  const upcoming = open
    .filter((t) => t.due)
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 4);
  const latest = [...photos].sort(byDateDesc).slice(0, 6);
  const active = tenancies.find((t) => t.start && t.start <= today && (!t.end || t.end >= today));
  const yieldPct = active && price ? ((active.coldRent || 0) * 12 * 100) / price : null;

  let status;
  if (!p.handoverDate) status = 'Bauphase';
  else if (!rental) {
    const d = daysBetween(today, p.handoverDate);
    status = `Bauphase · Übergabe in ${d} Tag${d === 1 ? '' : 'en'}`;
  } else status = active ? 'Vermietet' : 'Fertiggestellt · nicht vermietet';

  const backupDue = (photos.length || txs.length) && (!lastBackup || daysBetween(lastBackup.slice(0, 10), today) > 30);

  const html = `
    <section class="hero">
      <div class="hero-top">
        <div>
          <h2>${esc(p.name)}</h2>
          <p>${esc([p.address, p.unit].filter(Boolean).join(' · ')) || 'Adresse unter Objektdaten eintragen'}</p>
        </div>
        <span class="pill ${rental ? 'pos' : 'accent'}">${esc(status)}</span>
      </div>
      ${
        price
          ? `<div class="hero-progress">
              <div class="row-between"><span>Kaufpreis bezahlt</span><strong>${fmtEUR0(paid)} / ${fmtEUR0(price)}</strong></div>
              ${progress((paid / price) * 100)}
              ${requested ? `<small>${fmtEUR0(requested)} abgerufen, noch nicht bezahlt</small>` : ''}
            </div>`
          : `<a class="hero-cta" href="#/objekt">${icon('edit')} Objektdaten & Kaufpreis eintragen</a>`
      }
    </section>

    ${backupDue ? `<a class="notice warn" href="#/daten">${icon('alert')}<span>Letztes Backup ${lastBackup ? `am ${fmtDate(lastBackup.slice(0, 10))}` : 'noch nie'} – jetzt sichern</span></a>` : ''}

    <div class="quick">
      <button type="button" data-action="home-photo">${icon('camera')}<span>Fotos</span></button>
      <button type="button" data-action="home-tx">${icon('euro')}<span>Buchung</span></button>
      <button type="button" data-action="home-doc">${icon('file')}<span>Dokument</span></button>
      <button type="button" data-action="home-task">${icon('list')}<span>Aufgabe</span></button>
    </div>

    <div class="stats">
      <a class="stat" href="#/finanzen"><small>Ausgaben gesamt</small><strong>${fmtEUR0(spent)}</strong><span>ohne Tilgung</span></a>
      <a class="stat" href="#/finanzen/auswertung"><small>Einnahmen ${year}</small><strong>${fmtEUR0(incomeYear)}</strong><span>Miete & NK</span></a>
      <a class="stat" href="#/aufgaben"><small>Offene Aufgaben</small><strong>${open.length}</strong><span>${defects ? `davon ${defects} Mängel` : 'keine Mängel'}</span></a>
      <a class="stat" href="#/vermietung"><small>Bruttomietrendite</small><strong>${yieldPct != null ? fmtPct(yieldPct, 2) : '–'}</strong><span>${active ? `${fmtEUR(active.coldRent)} kalt/Monat` : 'noch keine Miete'}</span></a>
    </div>

    <section class="card">
      <div class="card-head"><h3>Baufortschritt</h3><a href="#/bau">Alle ${photos.length ? `(${photos.length})` : ''} ${icon('right')}</a></div>
      ${
        latest.length
          ? `<div class="strip">${latest
              .map((ph) => `<button type="button" data-action="photo-open" data-id="${ph.id}"><img src="${viewUrl(unpackBlob(ph.thumb))}" alt=""></button>`)
              .join('')}</div>
            <small class="muted">Letztes Update: ${fmtDate(latest[0].date)}${latest[0].title ? ` · ${esc(latest[0].title)}` : ''}</small>`
          : `<p class="muted">Noch keine Fotos. Lade das erste Baustellen-Update hoch.</p>`
      }
    </section>

    <section class="card">
      <div class="card-head"><h3>Als Nächstes</h3><a href="#/aufgaben">Alle ${icon('right')}</a></div>
      ${
        upcoming.length
          ? `<ul class="list compact">${upcoming
              .map(
                (t) => `<li><button type="button" class="row" data-action="task-edit" data-id="${t.id}">
                  <span class="badge ${t.kind}">${TASK_KINDS[t.kind] || ''}</span>
                  <span class="grow">${esc(t.title)}</span>
                  <span class="${t.due < today ? 'neg' : 'muted'}">${fmtDate(t.due, { day: '2-digit', month: '2-digit' })}</span>
                </button></li>`,
              )
              .join('')}</ul>`
          : '<p class="muted">Keine anstehenden Termine.</p>'
      }
    </section>`;

  return { title: 'THE44', html, tab: 'home' };
}

export const actions = {
  'home-photo': () => addPhotos(),
  'home-tx': () => editTransaction(),
  'home-doc': () => uploadDocuments(),
  'home-task': () => editTask(),
};
