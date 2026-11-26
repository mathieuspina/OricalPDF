// Tampons techniques (1.4.0) : bouton à menu « Tampons techniques » de l'onglet Annoter (#tech-menu-pop : catégories, miniatures vectorielles
// tirées de la MÊME géométrie que la page, src/tech-stamps.js), pose par clic (outil persistant 'tstamp', voir annot/place.js).
// Favoris : chaque symbole a une commande du ruban `tst-<id>` (boutons cachés du conteneur #tech-cmds, créés depuis le catalogue) : un symbole
// épinglé est un favori ordinaire (même data-cmd, même gestionnaire de clic, même état « actif »). Clic droit (ou touche Menu) sur une
// miniature du menu = menu des favoris de cette commande. Icônes : masque CSS généré depuis la géométrie (aucune image).
import { $, store } from './ui.js';
import * as A from './annotate.js';
import * as FavUI from './favorites-ui.js';

const { TechStamps, Shapes, PDFLib } = window;
const measure = Shapes.makeMeasure(PDFLib);
const active = () => store.active;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
export const cmdOf = (id) => 'tst-' + id;
let lastSym = null;

// Masque d'icône (SVG en data:) : silhouette du symbole sans libellé, remplie / tracée en noir (la couleur vient de currentColor).
export function iconUrl(sym) {
  const o = TechStamps.create(sym, 0, 0, measure, { label: '' });
  const b = Shapes.bounds(o, measure);
  const s = 22 / Math.max(b.x1 - b.x0, b.y1 - b.y0);
  const w = (b.x1 - b.x0) * s, h = (b.y1 - b.y0) * s;
  const map = (x, y) => [(x - b.x0) * s + (24 - w) / 2, (b.y1 - y) * s + (24 - h) / 2];
  const paths = TechStamps.primitives(o, measure).filter((p) => p.kind === 'path').map((p) => {
    const sw = p.stroke ? Math.max(1.4, p.stroke.width * s) : 0;
    return `<path d="${Shapes.pathD(p.segs, map)}" fill="${p.fill ? '#000' : 'none'}"${p.stroke ? ` stroke="#000" stroke-width="${sw.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"` : ''}${p.stroke && p.stroke.dash ? ` stroke-dasharray="${p.stroke.dash.map((d) => Math.max(0.6, d * s).toFixed(2)).join(' ')}"` : ''}/>`;
  }).join('');
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${paths}</svg>`)}")`;
}
const setIcon = (ico, sym) => { const u = iconUrl(sym); ico.style.webkitMaskImage = u; ico.style.maskImage = u; };

// ------------------------------------------------------------------ pose
export function pick(sym) {
  const doc = active();
  const e = TechStamps.entry(sym);
  if (!doc || !e) return;
  closeMenu();
  lastSym = sym;
  // libellé vide à la pose (1.5.0) : à saisir dans le panneau Propriétés ; null = symbole sans libellé
  A.startPlacing(doc, { tool: 'tstamp', kind: 'tstamp', tstamp: { sym, label: e.label === null ? null : '', color: e.color.slice() } });
}
// Le symbole `sym` est-il l'outil actif ? (état « enfoncé » de sa commande et de son favori)
export const isActive = (doc, cmd) => !!doc && doc.tool === 'tstamp' && cmdOf(A.defaultsOf('tstamp').sym) === cmd;
export const commands = {};

// ------------------------------------------------------------------ menu
const pop = () => $('tech-menu-pop');
export function closeMenu() {
  const m = pop();
  if (!m || m.hidden) return;
  m.hidden = true;
  document.querySelectorAll('[data-cmd=tech-menu]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}
export const isOpen = () => !!pop() && !pop().hidden;

function cell(e) {
  const b = el('button', 'tech-cell');
  b.type = 'button';
  b.dataset.sym = e.id;
  b.setAttribute('role', 'menuitem');
  b.title = `${e.name}${e.label ? ` (« ${e.label} »)` : ''} — cliquer pour poser ; clic droit : favoris`;
  const th = el('span', 'tech-thumb');
  th.append(A.thumbSvg(TechStamps.create(e.id, 0, 0, measure, { label: '' }), 64, 40));
  b.append(th, el('span', 'tech-name', e.name));
  b.addEventListener('click', () => pick(e.id));
  b.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); FavUI.openForCommand(cmdOf(e.id), ev.clientX || b.getBoundingClientRect().left + 4, ev.clientY || b.getBoundingClientRect().bottom); });
  return b;
}

export function openMenu(anchor) {
  const m = pop();
  if (!m.hidden && m._anchor === anchor) return closeMenu();
  m.replaceChildren();
  m._anchor = anchor;
  for (const c of TechStamps.CATS) {
    m.append(el('div', 'menu-title', c.name));
    const g = el('div', 'tech-grid');
    for (const e of TechStamps.CATALOG.filter((x) => x.cat === c.id)) g.append(cell(e));
    m.append(g);
  }
  m.append(el('p', 'menu-note', 'Silhouettes schématiques, sans cotes ni échelle. Un clic pose le tampon (l\'outil reste actif) ; poignées pour l\'agrandir (Maj : proportions libres). Libellé, couleur, plein / contour et épaisseur : panneau Propriétés.'));
  m.hidden = false;
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.top = r.bottom + 6 + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  const sel = lastSym && m.querySelector(`[data-sym="${lastSym}"]`);
  (sel || m.querySelector('.tech-cell')).focus();
}

// Commandes cachées (une par symbole) : sources des favoris ; créées avant initFavorites.
export function initTechStamps() {
  const host = el('div');
  host.id = 'tech-cmds';
  host.hidden = true;
  for (const e of TechStamps.CATALOG) {
    const b = el('button', 'rbtn big');
    b.type = 'button';
    b.dataset.cmd = cmdOf(e.id);
    b.setAttribute('data-pressable', '');
    b.title = `Tampon technique : ${e.name}`;
    const ico = el('span', 'ico');
    ico.dataset.icon = 'stamp';
    setIcon(ico, e.id);
    b.append(ico, el('span', 'lbl', e.name));
    host.append(b);
    commands[cmdOf(e.id)] = () => pick(e.id);
  }
  $('rpanel-annotate').append(host);
  document.querySelectorAll('[data-cmd=tech-menu] .ico').forEach((i) => setIcon(i, 'heb'));
  const m = pop();
  m.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); const a = m._anchor; closeMenu(); if (a && a.isConnected) a.focus(); return; }
    const cells = [...m.querySelectorAll('.tech-cell')];
    const i = cells.indexOf(document.activeElement);
    if (i < 0) return;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 }[e.key];
    if (step) { e.preventDefault(); e.stopPropagation(); cells[Math.max(0, Math.min(cells.length - 1, i + step))].focus(); }
  });
  document.addEventListener('mousedown', (e) => {
    if (isOpen() && !e.target.closest('#tech-menu-pop') && !e.target.closest('#favmenu') && !e.target.closest('[data-cmd=tech-menu]')) closeMenu();
  });
}
