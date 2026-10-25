import { db } from '../db.js';
import { saveFile, deleteFile, loadBlob, unpackBlob } from '../data.js';
import { esc, fmtDate, fmtSize, todayISO, byDateDesc, viewUrl, toast, pickFiles, shareOrDownload } from '../util.js';
import { icon } from '../icons.js';
import { DOC_CATEGORIES } from '../config.js';
import { formDialog, actionSheet, openViewer } from '../ui.js';
import { empty, chips } from './common.js';
import { editTransaction } from './finanzen.js';

const state = { cat: 'alle', q: '' };
const catOptions = DOC_CATEGORIES.map((c) => ({ value: c, label: c }));

export async function render() {
  const files = (await db.all('files')).sort(byDateDesc);
  const counts = {};
  files.forEach((f) => (counts[f.category] = (counts[f.category] || 0) + 1));
  const q = state.q.toLowerCase();
  const list = files.filter(
    (f) => (state.cat === 'alle' || f.category === state.cat) && (!q || `${f.name} ${f.note}`.toLowerCase().includes(q)),
  );
  const chipItems = [['alle', `Alle (${files.length})`]].concat(
    DOC_CATEGORIES.filter((c) => counts[c]).map((c) => [c, `${c} (${counts[c]})`]),
  );

  const html = `
    ${files.length ? `<input type="search" class="search" placeholder="Dokumente durchsuchen" value="${esc(state.q)}" data-change="doc-search">` : ''}
    ${files.length ? chips(chipItems, state.cat, 'doc-cat') : ''}
    ${
      list.length
        ? `<ul class="list">${list
            .map(
              (f) => `<li><button type="button" class="row" data-action="doc-open" data-id="${f.id}">
                ${f.thumb ? `<img class="file-thumb" src="${viewUrl(unpackBlob(f.thumb))}" alt="">` : `<span class="file-thumb">${icon('file')}<em>${esc((f.name.split('.').pop() || '').slice(0, 4))}</em></span>`}
                <span class="grow"><strong>${esc(f.name)}</strong>
                  <small class="muted">${esc(f.category)} · ${fmtDate(f.date)} · ${fmtSize(f.size)}</small>
                  ${f.note ? `<small class="muted clamp">${esc(f.note)}</small>` : ''}</span>
              </button></li>`,
            )
            .join('')}</ul>`
        : files.length
          ? '<p class="muted pad">Keine Treffer.</p>'
          : empty('folder', 'Noch keine Dokumente', 'Kaufvertrag, Baubeschreibung, Grundrisse, Finanzierung, Protokolle – alles an einem Ort, auch offline.', '<button class="btn primary" data-action="doc-add">Dokumente hinzufügen</button>')
    }`;
  return { title: 'Dokumente', html, fab: { action: 'doc-add', icon: 'upload', label: 'Dokument hinzufügen' } };
}

export async function uploadDocuments(category) {
  const files = await pickFiles({ accept: 'application/pdf,image/*,.doc,.docx,.xls,.xlsx,.txt,.eml,.msg' });
  if (!files.length) return false;
  const vals = await formDialog({
    title: `${files.length} Dokument${files.length === 1 ? '' : 'e'} ablegen`,
    intro: `<ul class="mini-files">${files.map((f) => `<li>${icon('file')} ${esc(f.name)} <small class="muted">${fmtSize(f.size)}</small></li>`).join('')}</ul>`,
    fields: [
      { name: 'category', label: 'Kategorie', type: 'select', value: category || (state.cat !== 'alle' ? state.cat : 'Sonstiges'), options: catOptions },
      { name: 'date', label: 'Datum', type: 'date', value: todayISO() },
      { name: 'note', label: 'Notiz / Stichworte', type: 'textarea' },
    ],
  });
  if (!vals) return false;
  let i = 0;
  for (const f of files) {
    toast(`Speichere ${++i} von ${files.length} …`, 0);
    await saveFile(f, vals);
  }
  toast('Gespeichert');
}

async function openDoc(id) {
  const f = await db.get('files', id);
  if (!f) return false;
  const choice = await actionSheet({
    title: f.name,
    subtitle: `${f.category} · ${fmtDate(f.date)} · ${fmtSize(f.size)}`,
    actions: [
      { label: 'Ansehen', value: 'view', icon: 'image' },
      { label: 'Teilen / Sichern', value: 'share', icon: 'share' },
      { label: 'Bearbeiten', value: 'edit', icon: 'edit' },
      ...(f.transactionId ? [{ label: 'Zugehörige Buchung', value: 'tx', icon: 'euro' }] : []),
      { label: 'Löschen', value: 'delete', icon: 'trash', danger: true },
    ],
  });
  if (!choice) return false;
  if (choice === 'view' || choice === 'share') {
    const blob = await loadBlob(f.id);
    if (!blob) return toast('Datei nicht gefunden'), false;
    if (choice === 'view') openViewer(blob, f.name);
    else await shareOrDownload(blob, f.name);
    return false;
  }
  if (choice === 'tx') {
    const t = await db.get('transactions', f.transactionId);
    return t ? editTransaction(t) : false;
  }
  if (choice === 'delete') {
    if (!confirm(`„${f.name}“ löschen?`)) return false;
    await deleteFile(f.id);
    if (f.transactionId) {
      const t = await db.get('transactions', f.transactionId);
      if (t) await db.put('transactions', { ...t, receiptIds: (t.receiptIds || []).filter((x) => x !== f.id) });
    }
    if (f.taskId) {
      const t = await db.get('tasks', f.taskId);
      if (t) await db.put('tasks', { ...t, fileIds: (t.fileIds || []).filter((x) => x !== f.id) });
    }
    toast('Gelöscht');
    return;
  }
  const vals = await formDialog({
    title: 'Dokument bearbeiten',
    fields: [
      { name: 'name', label: 'Dateiname', value: f.name, required: true },
      { name: 'category', label: 'Kategorie', type: 'select', value: f.category, options: catOptions },
      { name: 'date', label: 'Datum', type: 'date', value: f.date },
      { name: 'note', label: 'Notiz / Stichworte', type: 'textarea', value: f.note },
    ],
  });
  if (!vals) return false;
  await db.put('files', { ...f, ...vals });
}

export const actions = {
  'doc-add': () => uploadDocuments(),
  'doc-open': (el) => openDoc(el.dataset.id),
  'doc-cat': (el) => {
    state.cat = el.dataset.value;
  },
  'doc-search': (el) => {
    state.q = el.value.trim();
  },
};
