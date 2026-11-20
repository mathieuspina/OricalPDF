// Favoris du ruban (1.1.0) : clic droit (ou touche Menu / Maj+F10) sur une commande du ruban → « Ajouter aux favoris » ; la commande apparaît
// dans l'onglet Accueil, groupe « Favoris » (#fav-group, affiché seulement s'il y a au moins un favori). Clic droit sur un favori → « Retirer
// des favoris », « Déplacer à gauche / à droite ». Liste mémorisée dans les réglages (clé favorites, logique pure : src/favorites.js).
// UNE SEULE SOURCE DE VÉRITÉ : un favori est un bouton du ruban portant le MÊME data-cmd que le bouton d'origine ; le gestionnaire de clic du
// ruban (app.js) déclenche donc la même commande, et refreshRibbon met à jour son état (actif, désactivé) comme celui de l'original ;
// l'infobulle (raccourci compris) est recopiée de l'original à chaque rafraîchissement (sync).
// Épinglables : tous les boutons [data-cmd] du ruban (boutons simples, outils persistants, bascules, boutons à menu). Non épinglables : listes
// déroulantes et champs (select, input) : l'entrée du menu est grisée, avec une infobulle.
import { $, toast } from './ui.js';
import * as Settings from './settings.js';

const { Favorites } = window;
let refresh = () => {};
let menuFor = null;        // { el, cmd, fav, keyboard, at }
const SRC = '#ribbon .rpanel [data-cmd]:not(.fav)';

const sourceOf = (cmd) => document.querySelector(`${SRC.replace('[data-cmd]', `[data-cmd="${cmd}"]`)}`);
export const known = () => new Set([...document.querySelectorAll(SRC)].map((b) => b.dataset.cmd));
export const list = () => Favorites.parse(Settings.get('favorites'), known());
const labelOf = (b) => ((b.querySelector('.lbl') && b.querySelector('.lbl').textContent) || b.getAttribute('aria-label') || b.title || b.dataset.cmd).trim();

function save(l) { Settings.set('favorites', Favorites.normalize(l)); render(); refresh(); }

// Groupe « Favoris » de l'onglet Accueil, reconstruit depuis la liste (même data-cmd, icône, libellé et infobulle que l'original).
export function render() {
  let g = $('fav-group');
  if (!g) {
    g = document.createElement('div');
    g.id = 'fav-group'; g.className = 'rgroup'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', 'Favoris');
    g.innerHTML = '<div class="rgroup-body fav-grid" id="fav-body"></div><div class="rgroup-label">Favoris</div>';
    $('rpanel-home').append(g);
  }
  const body = $('fav-body');
  body.replaceChildren();
  for (const cmd of list()) {
    const src = sourceOf(cmd);
    if (!src) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rbtn small fav';
    b.dataset.cmd = cmd;
    for (const a of ['data-pressable', 'aria-haspopup']) if (src.hasAttribute(a)) b.setAttribute(a, src.getAttribute(a));
    if (src.hasAttribute('aria-haspopup')) b.setAttribute('aria-expanded', 'false');
    b.title = src.title;
    const ico = src.querySelector('.ico');
    b.innerHTML = `<span class="ico" data-icon="${ico ? ico.dataset.icon : 'pin'}"></span><span class="lbl"></span>`;
    b.querySelector('.lbl').textContent = labelOf(src);
    body.append(b);
  }
  g.hidden = !body.children.length;
}

// Appelé à la fin de refreshRibbon : infobulle (et raccourci qu'elle contient) recopiée de l'original.
export function sync() {
  for (const b of document.querySelectorAll('#fav-body .fav')) { const s = sourceOf(b.dataset.cmd); if (s && b.title !== s.title) b.title = s.title; }
}

// ------------------------------------------------------------------ menu contextuel (#favmenu, même style que #pgmenu)
export function closeMenu(restoreFocus) {
  const m = $('favmenu');
  if (m.hidden) return;
  m.hidden = true;
  const f = menuFor;
  menuFor = null;
  if (restoreFocus && f && f.keyboard && f.el.isConnected) f.el.focus();
}

function item(label, fn, opts = {}) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'recent-item'; b.setAttribute('role', 'menuitem');
  b.textContent = label;
  if (opts.id) b.dataset.fav = opts.id;
  if (opts.disabled) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
  if (opts.title) b.title = opts.title;
  b.addEventListener('click', () => { closeMenu(true); fn(); });
  return b;
}

// Cible d'un clic droit dans le ruban : bouton de commande (favori ou non), contrôle complexe, ou rien.
function targetOf(el) {
  if (!el || !el.closest || !el.closest('#ribbon .rpanel')) return null;
  const b = el.closest('[data-cmd]');
  if (b) return { el: b, cmd: b.dataset.cmd, fav: b.classList.contains('fav') };
  const c = el.closest('select, input, textarea, label');
  if (c) return { el: c, complex: true };
  return null;
}

function openFor(t, x, y, keyboard) {
  const m = $('favmenu');
  const now = Date.now();
  // touche Menu / Maj+F10 : Chromium envoie aussi un contextmenu juste après ; on garde l'ouverture « clavier » (focus dans le menu)
  if (!keyboard && menuFor && menuFor.el === t.el && menuFor.keyboard && now - menuFor.at < 400) return;
  menuFor = Object.assign({ keyboard, at: now }, t);
  m.replaceChildren();
  const l = list();
  if (t.complex) {
    m.append(item('Ajouter aux favoris', () => {}, { id: 'add', disabled: true, title: 'Les listes déroulantes et les champs ne peuvent pas être ajoutés aux favoris : ajoutez une commande (bouton) du ruban.' }));
  } else if (t.fav || l.includes(t.cmd)) {
    m.append(item('Retirer des favoris', () => { save(Favorites.remove(l, t.cmd)); toast('Retiré des favoris.', 1500); }, { id: 'remove' }));
    if (t.fav) {
      m.append(item('Déplacer à gauche', () => save(Favorites.move(l, t.cmd, -1)), { id: 'left', disabled: !Favorites.canMove(l, t.cmd, -1) }));
      m.append(item('Déplacer à droite', () => save(Favorites.move(l, t.cmd, 1)), { id: 'right', disabled: !Favorites.canMove(l, t.cmd, 1) }));
    }
  } else {
    const full = l.length >= Favorites.MAX;
    m.append(item('Ajouter aux favoris', () => {
      const r = Favorites.add(l, t.cmd, known());
      if (r.ok) { save(r.list); toast('Ajouté aux favoris (onglet Accueil).', 1800); }
    }, { id: 'add', disabled: full, title: full ? `${Favorites.MAX} favoris au plus : retirez-en un d'abord (clic droit sur un favori).` : 'La commande reste aussi dans son onglet.' }));
  }
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
  if (keyboard) { const first = m.querySelector('button:not(:disabled)') || m.querySelector('button'); if (first) { first.tabIndex = 0; first.focus(); } }
}

function openFromKeyboard(el) {
  const t = targetOf(el);
  if (!t) return false;
  const r = t.el.getBoundingClientRect();
  openFor(t, r.left + 4, r.bottom + 2, true);
  return true;
}

export function initFavorites(opts = {}) {
  refresh = opts.refresh || refresh;
  render();
  // Clic droit : mousedown/contextmenu ne sont pas toujours envoyés sur un bouton DÉSACTIVÉ (aucun document ouvert) : on retrouve la commande
  // sous le pointeur depuis le ruban lui-même.
  $('ribbon').addEventListener('contextmenu', (e) => {
    const t = targetOf(e.target) || targetOf(document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.closest && x.closest('[data-cmd], select, input')));
    if (!t) return;
    e.preventDefault();
    const kb = e.clientX === 0 && e.clientY === 0; // contextmenu clavier sans position
    if (kb) openFromKeyboard(t.el); else openFor(t, e.clientX, e.clientY, false);
  });
  document.addEventListener('keydown', (e) => {
    const m = $('favmenu');
    if (!m.hidden) {
      if (e.key === 'Escape') { closeMenu(true); e.preventDefault(); e.stopPropagation(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        const items = [...m.querySelectorAll('button:not(:disabled)')];
        if (items.length) {
          const i = items.indexOf(document.activeElement);
          const j = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[j].focus();
        }
        e.preventDefault(); e.stopPropagation(); return;
      }
      if (e.key === 'Tab') { closeMenu(true); return; }
      // Entrée / Espace : activer l'entrée qui a le focus (sans attendre l'activation native, qui dépend de l'événement de caractère)
      if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.closest('#favmenu') && !document.activeElement.disabled) {
        e.preventDefault(); e.stopPropagation(); document.activeElement.click(); return;
      }
    }
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      if (openFromKeyboard(document.activeElement)) { e.preventDefault(); e.stopPropagation(); }
    }
  }, true);
  document.addEventListener('mousedown', (e) => { if (!$('favmenu').hidden && !e.target.closest('#favmenu')) closeMenu(false); });
  window.addEventListener('blur', () => closeMenu(false));
  window.addEventListener('resize', () => closeMenu(false));
}
