// Fachlogik: Objektdaten, Dateien, Fotos, Steuer-Berechnungen.
import { db } from './db.js';
import { PROPERTY_DEFAULTS, catById } from './config.js';
import { uid, compressImage, isoDate, todayISO, sum } from './util.js';

export async function getProperty() {
  return { ...PROPERTY_DEFAULTS, ...(await db.getMeta('property', {})) };
}
export const saveProperty = (p) => db.setMeta('property', p);

// Binärdaten werden als ArrayBuffer gespeichert (robuster als Blob in Safari).
export const packBlob = async (blob) => (blob ? { type: blob.type, data: await blob.arrayBuffer() } : null);
export const unpackBlob = (p) => (p ? new Blob([p.data], { type: p.type }) : null);

export async function storeBlob(id, blob) {
  await db.put('blobs', { id, ...(await packBlob(blob)) });
}
export async function loadBlob(id) {
  return unpackBlob(await db.get('blobs', id));
}

const MIME_BY_EXT = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic' };
const guessMime = (name) => MIME_BY_EXT[(name.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

/** Speichert ein Dokument/einen Beleg. meta: { category, date, note, transactionId, taskId } */
export async function saveFile(file, meta = {}) {
  let blob = file;
  let mime = file.type || guessMime(file.name);
  let name = file.name;
  const isImage = mime.startsWith('image/') && mime !== 'image/gif';
  if (isImage && file.size > 1.5e6) {
    try {
      blob = await compressImage(file, 2400, 0.85);
      mime = 'image/jpeg';
      name = name.replace(/\.\w+$/, '') + '.jpg';
    } catch {
      /* Original behalten */
    }
  }
  let thumb = null;
  if (isImage) {
    try {
      thumb = await packBlob(await compressImage(blob, 320, 0.7));
    } catch {
      thumb = null;
    }
  }
  const id = uid();
  await storeBlob(id, new Blob([blob], { type: mime }));
  const rec = {
    id,
    name,
    mime,
    size: blob.size,
    category: meta.category || 'Sonstiges',
    date: meta.date || todayISO(),
    note: meta.note || '',
    transactionId: meta.transactionId || null,
    taskId: meta.taskId || null,
    thumb,
    createdAt: Date.now(),
  };
  await db.put('files', rec);
  return rec;
}

export async function deleteFile(id) {
  await db.del('files', id);
  await db.del('blobs', id);
}

export async function savePhotos(files, meta, onProgress) {
  let i = 0;
  for (const f of files) {
    onProgress?.(++i, files.length);
    const full = await compressImage(f, 2400, 0.85);
    const thumb = await compressImage(full, 480, 0.75);
    const id = uid();
    await storeBlob(id, full);
    await db.put('photos', {
      id,
      date: meta.date || isoDate(f.lastModified || Date.now()),
      title: meta.title || '',
      note: meta.note || '',
      name: f.name,
      thumb: await packBlob(thumb),
      createdAt: Date.now() + i,
    });
  }
}

export async function deletePhoto(id) {
  await db.del('photos', id);
  await db.del('blobs', id);
}

export const isRentalPhase = (p, date = todayISO()) => !!p.handoverDate && date >= p.handoverDate;

export const planAmount = (pay, p) => (pay.amount != null ? pay.amount : ((p.purchasePrice || 0) * (pay.pct || 0)) / 100);

/** Legt eine Buchung an bzw. aktualisiert sie; kind folgt immer der Kategorie. */
export async function saveTransaction(t) {
  const cat = catById(t.category);
  const rec = { taxClass: cat.tax, createdAt: Date.now(), receiptIds: [], ...t, kind: cat.kind };
  if (!rec.id) rec.id = uid();
  await db.put('transactions', rec);
  return rec;
}

export async function deleteTransaction(t) {
  for (const fid of t.receiptIds || []) await deleteFile(fid);
  if (t.paymentId) {
    const pay = await db.get('payments', t.paymentId);
    if (pay && pay.transactionId === t.id) await db.put('payments', { ...pay, transactionId: null });
  }
  await db.del('transactions', t.id);
}

/**
 * AfA-Berechnung (vereinfacht, zeitanteilig ab Übergabemonat).
 * Basis = (Kaufpreis + Anschaffungsnebenkosten) × Gebäudeanteil.
 */
export function computeAfa(p, transactions, year) {
  const neben = sum(transactions.filter((t) => t.taxClass === 'anschaffung' && t.category !== 'kaufpreis'), (t) => t.amount);
  const kaufpreis = p.purchasePrice || sum(transactions.filter((t) => t.category === 'kaufpreis'), (t) => t.amount);
  const total = kaufpreis + neben;
  const base = (total * (Number(p.buildingSharePct) || 0)) / 100;
  const res = { kaufpreis, neben, total, base, amount: 0, started: false, bookValueEnd: base };
  if (!p.handoverDate || !base) return res;
  const start = new Date(`${p.handoverDate}T00:00:00`);
  const sy = start.getFullYear();
  if (year < sy) return res;
  res.started = true;
  const rate = (Number(p.afaRate) || 0) / 100;
  let bv = base;
  for (let y = sy; y <= year; y++) {
    const months = y === sy ? 12 - start.getMonth() : 12;
    const amt = p.afaMethod === 'degressiv' ? (bv * rate * months) / 12 : Math.min(bv, (base * rate * months) / 12);
    if (y === year) {
      res.amount = amt;
      res.bookValueEnd = bv - amt;
    }
    bv -= amt;
  }
  return res;
}

/** Vereinfachte Annuitätenrechnung eines Darlehens. */
export function loanStats(loan, atDate = todayISO()) {
  const amount = loan.amount || 0;
  const i = (loan.interest || 0) / 100;
  const monthly = (amount * (i + (loan.repayment || 0) / 100)) / 12;
  const res = { monthly, balanceNow: amount, balanceFixedEnd: null, interestThisYear: 0 };
  if (!loan.start || !amount) return res;
  const year = Number(atDate.slice(0, 4));
  const now = atDate.slice(0, 7);
  const fixedEnd = loan.fixedUntil ? loan.fixedUntil.slice(0, 7) : null;
  const end = fixedEnd && fixedEnd > `${year}-12` ? fixedEnd : `${year}-12`;
  let balance = amount;
  const d = new Date(`${loan.start}T00:00:00`);
  for (let n = 0; n < 720 && balance > 0.005; n++) {
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (ym > end) break;
    const interest = (balance * i) / 12;
    if (d.getFullYear() === year) res.interestThisYear += interest;
    balance = Math.max(0, balance - (monthly - interest));
    if (ym <= now) res.balanceNow = balance;
    if (fixedEnd && ym === fixedEnd) res.balanceFixedEnd = balance;
    d.setMonth(d.getMonth() + 1);
  }
  return res;
}
