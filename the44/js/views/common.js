import { esc } from '../util.js';
import { icon } from '../icons.js';

export const segmented = (items, active) =>
  `<nav class="segmented">${items
    .map(([href, label]) => `<a href="${href}" class="${href === active ? 'active' : ''}">${esc(label)}</a>`)
    .join('')}</nav>`;

export const empty = (ic, title, text, button = '') =>
  `<div class="empty">${icon(ic, 'big')}<h3>${esc(title)}</h3><p>${esc(text)}</p>${button}</div>`;

export const chips = (items, active, action) =>
  `<div class="chips">${items
    .map(
      ([value, label]) =>
        `<button type="button" class="chip${value === active ? ' active' : ''}" data-action="${action}" data-value="${esc(value)}">${esc(label)}</button>`,
    )
    .join('')}</div>`;

export const kv = (rows) =>
  `<dl class="kv">${rows
    .filter(Boolean)
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`)
    .join('')}</dl>`;

export const progress = (pct) => `<div class="progress"><span style="width:${Math.max(0, Math.min(100, pct || 0)).toFixed(1)}%"></span></div>`;

export const yearOptions = (years, selected, withAll = true) =>
  (withAll ? [`<option value="alle"${selected === 'alle' ? ' selected' : ''}>Alle Jahre</option>`] : [])
    .concat(years.map((y) => `<option value="${y}"${String(y) === String(selected) ? ' selected' : ''}>${y}</option>`))
    .join('');
