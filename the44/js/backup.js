// Vollständiges Backup aller Daten (inkl. Fotos und Dokumente) als NDJSON-Datei.
import { db, STORES } from './db.js';

const FORMAT = 1;

function abToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function b64ToAb(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function encode(v) {
  if (v instanceof ArrayBuffer) return { __ab: abToB64(v) };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
}

function decode(v) {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    if (typeof v.__ab === 'string') return b64ToAb(v.__ab);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  }
  return v;
}

export async function createBackup() {
  const parts = [JSON.stringify({ app: 'THE44', format: FORMAT, exportedAt: new Date().toISOString() }) + '\n'];
  for (const s of STORES) {
    // Einzeln lesen, damit nicht alle Binärdaten gleichzeitig im Speicher liegen.
    for (const key of await db.keys(s)) {
      const r = await db.get(s, key);
      if (r) parts.push(JSON.stringify({ s, r: encode(r) }) + '\n');
    }
  }
  return new Blob(parts, { type: 'application/x-ndjson' });
}

async function* readLines(file) {
  if (file.stream && typeof TextDecoderStream !== 'undefined') {
    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        yield buf.slice(0, i);
        buf = buf.slice(i + 1);
      }
    }
    if (buf.trim()) yield buf;
  } else {
    for (const line of (await file.text()).split('\n')) yield line;
  }
}

/** Ersetzt alle lokalen Daten durch das Backup. Liefert die Anzahl Datensätze. */
export async function restoreBackup(file, onProgress) {
  const lines = readLines(file);
  const first = await lines.next();
  let header;
  try {
    header = JSON.parse(first.value || '');
  } catch {
    header = null;
  }
  if (!header || header.app !== 'THE44') throw new Error('Keine gültige THE44-Backup-Datei');
  if (header.format > FORMAT) throw new Error('Backup stammt aus einer neueren App-Version');
  for (const s of STORES) await db.clear(s);
  let n = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    const { s, r } = JSON.parse(line);
    if (!STORES.includes(s)) continue;
    await db.put(s, decode(r));
    if (++n % 25 === 0) onProgress?.(n);
  }
  return n;
}
