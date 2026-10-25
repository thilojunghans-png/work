// Formulare, Auswahl-Sheets und Datei-Viewer als native <dialog>-Elemente.
import { esc, parseAmount, toast, shareOrDownload } from './util.js';
import { icon } from './icons.js';

const moneyValue = (n) => (n == null || isNaN(n) ? '' : Number(n).toFixed(2).replace('.', ','));

function optionsHtml(options, value) {
  const opt = (o) => `<option value="${esc(o.value)}"${String(o.value) === String(value ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`;
  let html = '';
  let group = null;
  for (const o of options) {
    if (o.group !== group) {
      if (group) html += '</optgroup>';
      if (o.group) html += `<optgroup label="${esc(o.group)}">`;
      group = o.group;
    }
    html += opt(o);
  }
  if (group) html += '</optgroup>';
  return html;
}

function fieldHtml(f) {
  const cls = `field${f.half ? ' half' : ''}`;
  const label = `<span>${esc(f.label)}${f.required ? ' *' : ''}</span>`;
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
  const hint = f.hint ? `<small class="hint" data-hint="${esc(f.name)}">${esc(f.hint)}</small>` : '';
  switch (f.type) {
    case 'html':
      return `<div class="field full">${f.html}</div>`;
    case 'textarea':
      return `<label class="${cls}">${label}<textarea name="${f.name}" rows="3"${ph}>${esc(f.value)}</textarea>${hint}</label>`;
    case 'select':
      return `<label class="${cls}">${label}<select name="${f.name}">${optionsHtml(f.options, f.value)}</select>${hint}</label>`;
    case 'checkbox':
      return `<label class="field check full"><input type="checkbox" name="${f.name}"${f.value ? ' checked' : ''}><span>${esc(f.label)}</span></label>`;
    case 'file':
      return `<label class="${cls}">${label}<input type="file" name="${f.name}"${f.multiple === false ? '' : ' multiple'}${f.accept ? ` accept="${esc(f.accept)}"` : ''}>${hint}</label>`;
    case 'money':
      return `<label class="${cls}">${label}<input type="text" inputmode="decimal" name="${f.name}" value="${esc(moneyValue(f.value))}"${ph || ' placeholder="0,00"'}>${hint}</label>`;
    case 'number':
      return `<label class="${cls}">${label}<input type="text" inputmode="decimal" name="${f.name}" value="${esc(f.value == null ? '' : String(f.value).replace('.', ','))}"${ph}>${hint}</label>`;
    default:
      return `<label class="${cls}">${label}<input type="${f.type || 'text'}" name="${f.name}" value="${esc(f.value)}"${ph}>${hint}</label>`;
  }
}

function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    if (!f.name || f.type === 'html') continue;
    const el = form.elements[f.name];
    if (!el) continue;
    if (f.type === 'checkbox') out[f.name] = el.checked;
    else if (f.type === 'file') out[f.name] = [...el.files];
    else if (f.type === 'money' || f.type === 'number') out[f.name] = parseAmount(el.value);
    else out[f.name] = el.value.trim();
  }
  return out;
}

function isEmpty(v) {
  return v == null || v === '' || (typeof v === 'number' && isNaN(v));
}

/**
 * Zeigt ein Formular als Bottom-Sheet.
 * Liefert die Werte, null (Abbruch) oder 'delete'.
 */
export function formDialog({ title, fields, submitLabel = 'Speichern', deleteLabel, onInput, intro }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML = `<form novalidate>
      <header class="sheet-head">
        <button type="button" class="btn-text" data-close>Abbrechen</button>
        <h2>${esc(title)}</h2>
        <button type="submit" class="btn-text strong">${esc(submitLabel)}</button>
      </header>
      <div class="sheet-body">
        ${intro ? `<div class="field full intro">${intro}</div>` : ''}
        ${fields.map(fieldHtml).join('')}
        ${deleteLabel ? `<button type="button" class="btn danger full" data-delete>${icon('trash')} ${esc(deleteLabel)}</button>` : ''}
      </div>
    </form>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      dlg.close();
      dlg.remove();
      resolve(val);
    };
    dlg.querySelector('[data-close]').addEventListener('click', () => finish(null));
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    dlg.querySelector('[data-delete]')?.addEventListener('click', () => {
      if (confirm('Wirklich löschen?')) finish('delete');
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const vals = readForm(form, fields);
      const invalid = fields.find(
        (f) => (f.required && isEmpty(vals[f.name])) || ((f.type === 'money' || f.type === 'number') && Number.isNaN(vals[f.name])),
      );
      if (invalid) {
        toast(`Bitte „${invalid.label}“ prüfen`);
        form.elements[invalid.name]?.focus();
        return;
      }
      finish(vals);
    });
    if (onInput) {
      form.addEventListener('change', (e) => onInput(form, e));
    }
    dlg.showModal();
  });
}

/** Auswahl-Sheet mit Aktionen. Liefert den value der gewählten Aktion oder null. */
export function actionSheet({ title, subtitle, actions }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet action-sheet';
    dlg.innerHTML = `<div class="sheet-body">
      ${title ? `<div class="as-title"><strong>${esc(title)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</div>` : ''}
      ${actions
        .map(
          (a, i) =>
            `<button type="button" class="as-btn${a.danger ? ' danger' : ''}" data-i="${i}">${a.icon ? icon(a.icon) : ''}<span>${esc(a.label)}</span></button>`,
        )
        .join('')}
      <button type="button" class="as-btn cancel" data-i="-1"><span>Abbrechen</span></button>
    </div>`;
    document.body.appendChild(dlg);
    const finish = (val) => {
      dlg.close();
      dlg.remove();
      resolve(val);
    };
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) finish(b.dataset.i === '-1' ? null : actions[Number(b.dataset.i)].value);
      else if (e.target === dlg) finish(null);
    });
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    dlg.showModal();
  });
}

/** Vollbild-Viewer für Bilder und PDFs mit Teilen-Button. */
export function openViewer(blob, name) {
  const url = URL.createObjectURL(blob);
  const isImg = blob.type.startsWith('image/');
  const isPdf = blob.type === 'application/pdf';
  const dlg = document.createElement('dialog');
  dlg.className = 'viewer';
  dlg.innerHTML = `<header class="viewer-head">
      <button type="button" class="icon-btn" data-v="close" aria-label="Schließen">${icon('x')}</button>
      <span class="viewer-name">${esc(name)}</span>
      <button type="button" class="icon-btn" data-v="share" aria-label="Teilen">${icon('share')}</button>
    </header>
    <div class="viewer-body">
      ${isImg ? `<img src="${url}" alt="${esc(name)}">` : isPdf ? `<iframe src="${url}" title="${esc(name)}"></iframe>` : `<div class="empty">${icon('file', 'big')}<p>Vorschau nicht möglich.<br>Über „Teilen“ in einer anderen App öffnen.</p></div>`}
    </div>`;
  document.body.appendChild(dlg);
  const close = () => {
    dlg.close();
    dlg.remove();
    URL.revokeObjectURL(url);
  };
  dlg.addEventListener('click', (e) => {
    const v = e.target.closest('[data-v]')?.dataset.v;
    if (v === 'close') close();
    if (v === 'share') shareOrDownload(blob, name);
  });
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dlg.showModal();
}
