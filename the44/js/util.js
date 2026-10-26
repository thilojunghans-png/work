// Formatierung, Datei- und Bildhilfen.

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const eur0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const fmtEUR = (n) => (n == null || isNaN(n) ? '–' : eur.format(n));
export const fmtEUR0 = (n) => (n == null || isNaN(n) ? '–' : eur0.format(n));
export const fmtPct = (n, d = 1) =>
  n == null || isNaN(n) ? '–' : `${n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
export const fmtNum = (n, d = 2) => (n == null || isNaN(n) ? '' : n.toLocaleString('de-DE', { maximumFractionDigits: d }));

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => {
  d = new Date(d);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const todayISO = () => isoDate(new Date());
export const fmtDate = (iso, opts) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', opts || { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const fmtMonth = (ym) => {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
};
export const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);

// "1.234,56 €" → 1234.56 ; leer → null ; ungültig → NaN
export function parseAmount(s) {
  if (typeof s === 'number') return s;
  s = String(s ?? '').replace(/[€\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? NaN : n;
}

export const fmtSize = (b) =>
  b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1).replace('.', ',')} MB`;

export const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f ? f(x) : x) || 0), 0);

export const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0);

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// Skaliert ein Bild auf maxDim (längste Kante) und liefert ein JPEG.
export async function compressImage(blob, maxDim, quality = 0.82) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Öffnet die Dateiauswahl (auf dem iPhone: Kamera, Fotos oder Dateien).
export function pickFiles({ accept = '', multiple = true } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    document.body.appendChild(input);
    const done = (files) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done([...input.files]));
    input.addEventListener('cancel', () => done([]));
    input.click();
  });
}

// Teilen-Dialog (iOS: „In Dateien sichern“) – sonst klassischer Download.
export async function shareOrDownload(blob, filename) {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 4000);
}

// Objekt-URLs der aktuellen Ansicht – werden beim Neuzeichnen freigegeben.
let viewUrls = [];
export function viewUrl(blob) {
  const u = URL.createObjectURL(blob);
  viewUrls.push(u);
  return u;
}
export function takeViewUrls() {
  const old = viewUrls;
  viewUrls = [];
  return () => old.forEach((u) => URL.revokeObjectURL(u));
}
