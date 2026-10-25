// App-Shell: Routing, Aktionen, Tab-Leiste.
import { takeViewUrls, toast } from './util.js';
import { icon } from './icons.js';
import * as home from './views/home.js';
import * as bau from './views/bau.js';
import * as finanzen from './views/finanzen.js';
import * as dokumente from './views/dokumente.js';
import * as mehr from './views/mehr.js';

const routes = {
  home: home.render,
  bau: bau.renderFotos,
  'bau/zahlungsplan': bau.renderPlan,
  finanzen: finanzen.renderBuchungen,
  'finanzen/auswertung': finanzen.renderAuswertung,
  'finanzen/darlehen': finanzen.renderDarlehen,
  dokumente: dokumente.render,
  mehr: mehr.renderMenu,
  aufgaben: mehr.renderAufgaben,
  vermietung: mehr.renderVermietung,
  kontakte: mehr.renderKontakte,
  objekt: mehr.renderObjekt,
  daten: mehr.renderDaten,
  info: mehr.renderInfo,
};

const actions = { ...home.actions, ...bau.actions, ...finanzen.actions, ...dokumente.actions, ...mehr.actions };

const $ = (id) => document.getElementById(id);
let rendering = Promise.resolve();

export function refresh() {
  rendering = rendering.then(render).catch((e) => {
    console.error(e);
    toast(`Fehler: ${e.message}`);
  });
  return rendering;
}

async function render() {
  const hash = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, query] = hash.split('?');
  const route = routes[path] || routes.home;
  const revokeOld = takeViewUrls();
  const view = await route(new URLSearchParams(query || ''));
  $('view').innerHTML = view.html;
  revokeOld();
  $('title').textContent = view.title;
  document.title = view.title === 'THE44' ? 'THE44' : `${view.title} · THE44`;
  const back = $('back');
  back.hidden = !view.back;
  back.dataset.href = view.back || '';
  const fab = $('fab');
  fab.hidden = !view.fab;
  if (view.fab) {
    fab.dataset.action = view.fab.action;
    fab.innerHTML = icon(view.fab.icon || 'plus');
    fab.setAttribute('aria-label', view.fab.label);
  }
  const tab = view.tab || path.split('/')[0];
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
}

window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  refresh();
});

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  try {
    const changed = await fn(el, e);
    if (changed !== false) await refresh();
  } catch (err) {
    console.error(err);
    toast(`Fehler: ${err.message}`);
  }
});

document.addEventListener('change', async (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = actions[el.dataset.change];
  if (fn) {
    await fn(el, e);
    await refresh();
  }
});

$('back').addEventListener('click', () => {
  location.hash = $('back').dataset.href || '#/home';
});

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

refresh();
