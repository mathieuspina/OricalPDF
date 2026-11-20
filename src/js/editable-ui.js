// Annotations modifiables (1.2.0) : interface. Format et écriture : src/editable-state.js, src/editable-pdf.js, pdf-edit (assets.editable).
//  - À l'ouverture : détection par octets (aucun coût pour un PDF ordinaire), restauration dans un Web Worker (editable-worker.js) : le
//    document s'affiche tout de suite (annotations figées), un bandeau apparaît si l'opération dépasse 1 s, avec « Ouvrir sans les annotations
//    modifiables ». Résultat : la base (sans le flux dédié) remplace les octets du document, les objets redeviennent modifiables ; l'historique
//    d'annulation repart de zéro. Replis (fichier modifié par un autre outil, version inconnue…) : PDF normal + message.
//  - À l'enregistrement : choix Modifiable / Aplati (boîte #savemode, réglage « saveMode » : ask | editable | flat ; un document ouvert ou
//    enregistré en modifiable reste modifiable par défaut). Caviardage appliqué ou métadonnées à nettoyer : Aplati forcé (avec message).
//  - Indicateur « Annotations modifiables » dans la barre d'état (#sb-editable) : clic = enregistrer en choisissant le mode.
import { $, store, toast } from './ui.js';
import * as V from './viewer.js';
import * as Settings from './settings.js';

const { EditableState: ES, DocModel, Redact } = window;
let hooks = { save: null, refresh: () => {}, activate: () => {}, scanForm: () => {} };

export function init(h) {
  hooks = Object.assign(hooks, h);
  $('sb-editable').addEventListener('click', () => { const d = store.active; if (d && hooks.save) hooks.save(d, { chooseMode: true }); });
  $('opt-savemode').addEventListener('change', (e) => Settings.set('saveMode', e.target.value));
}
export function syncSettings() { $('opt-savemode').value = Settings.get('saveMode') || 'ask'; }

export function refreshIndicator(doc) {
  const b = $('sb-editable');
  b.hidden = !(doc && doc.editable);
}

// ----------------------------------------------------------------------------- ouverture
const RESTORE_BANNER_MS = 1000;
// fileBytes : octets du fichier tels que lus (déchiffrés s'il est protégé) = ceux que montre l'onglet. Ne rejette jamais.
export async function afterOpen(doc) {
  const bytes = doc.bytes;
  if (!bytes || !ES.detect(bytes)) return 'none';
  doc.runtime.restoring = true;
  const startState = doc.stateId;
  let w = null;
  let cancelled = false;
  let timer = null;
  const banner = $('edit-restore');
  const hide = () => { clearTimeout(timer); if (banner.dataset.doc === doc.id) { banner.hidden = true; delete banner.dataset.doc; } };
  const r = await new Promise((resolve) => {
    w = new Worker(new URL('./editable-worker.js', import.meta.url));
    w.onmessage = (e) => resolve(e.data);
    w.onerror = (e) => resolve({ status: 'fallback', reason: 'lecture', message: e.message });
    timer = setTimeout(() => {
      $('edit-restore-msg').textContent = `Restauration des annotations modifiables de « ${doc.name} »…`;
      banner.dataset.doc = doc.id;
      banner.hidden = false;
      $('edit-restore-skip').onclick = () => { cancelled = true; resolve({ status: 'cancelled' }); };
    }, RESTORE_BANNER_MS);
    const buf = bytes.slice().buffer;
    w.postMessage({ bytes: buf }, [buf]);
  });
  w.terminate();
  hide();
  doc.runtime.restoring = false;
  if (!store.docs.includes(doc)) return 'closed';
  if (cancelled || r.status === 'cancelled') { toast(`« ${doc.name} » ouvert avec ses annotations figées (non modifiables).`, 6000); return 'cancelled'; }
  if (r.status === 'none') return 'none';
  if (r.status !== 'ok') { if (r.message) console.warn('Annotations modifiables :', r.message); toast(ES.message(doc.name, r.reason), 9000); return 'fallback'; }
  if (doc.stateId !== startState || doc.dirty) { toast(`« ${doc.name} » : annotations restées figées (le document a été modifié pendant leur restauration).`, 8000); return 'busy'; }
  await apply(doc, r, bytes);
  return 'ok';
}

// Remplace les octets de l'onglet par la base et rend les objets modifiables (sans étape d'historique).
async function apply(doc, r, fileBytes) {
  const wasActive = store.active === doc;
  const st = r.state;
  V.closeDocument(doc);
  const images = {};
  for (const [id, a] of Object.entries(r.images || {})) {
    const b = new Uint8Array(a.bytes);
    images[id] = { mime: a.mime, bytes: b, w: a.w, h: a.h, url: URL.createObjectURL(new Blob([b], { type: a.mime })) };
  }
  const lost = st.edits.filter((e) => e.imgId && !images[e.imgId]);
  const edits = st.edits.filter((e) => !(e.imgId && !images[e.imgId]));
  Object.assign(doc, {
    bytes: new Uint8Array(r.base), fileBytes, editable: true, restored: true,
    pages: null, edits, nextId: Math.max(st.nextId || 1, 1 + Math.max(0, ...edits.map((e) => e.id || 0))),
    assets: { images }, measure: { scales: st.measure.scales || {}, unit: st.measure.unit || 'm', precision: st.measure.precision === undefined ? 2 : st.measure.precision, include: true },
    numbering: [], undo: [], redo: [], selection: [],
  });
  if (r.values && Object.keys(r.values).length) doc.form = { values: Object.assign({}, doc.form ? doc.form.values : {}, r.values) };
  await V.openDocument(doc);
  doc.numbering = ES.numberingFromIndex(st.numbering || [], doc.pages);
  doc.runtime.mxLoaded = true; // échelles : celles de l'état (pas celles mémorisées pour ce chemin)
  doc.savedStateId = doc.stateId;
  doc.dirty = false;
  if (wasActive) hooks.activate(doc);
  hooks.scanForm(doc);
  hooks.refresh();
  toast(`« ${doc.name} » : ${edits.length} annotation${edits.length > 1 ? 's' : ''} modifiable${edits.length > 1 ? 's' : ''} restaurée${edits.length > 1 ? 's' : ''}.`
    + (lost.length ? ` ${lost.length} image(s) illisible(s) n'ont pas pu être restaurées.` : ''), 5000);
}

// ----------------------------------------------------------------------------- enregistrement
const hasContent = (doc) => ES.writable(doc.edits, doc.measure).length > 0 || (doc.numbering && doc.numbering.length > 0);
export const FORCED = {
  caviardage: 'Enregistré en Aplati : le document est caviardé, les annotations ne restent pas modifiables (aucune information cachée ne doit subsister).',
  metadonnees: 'Enregistré en Aplati : « Nettoyer les métadonnées » est demandé, les annotations ne restent pas modifiables (aucune information cachée).',
};

// → { editable, forced? } ou null (annulé). o.chooseMode : toujours demander (clic sur l'indicateur).
export async function chooseMode(doc, o) {
  if (!hasContent(doc)) return { editable: false };
  const forced = Redact.hasRedacted(doc.pages || []) ? 'caviardage' : doc.clean ? 'metadonnees' : null;
  if (forced) return { editable: false, forced };
  const setting = Settings.get('saveMode') || 'ask';
  if (!(o && o.chooseMode)) {
    if (doc.editable || setting === 'editable') return { editable: true };
    if (setting === 'flat') return { editable: false };
  }
  return ask(doc, doc.editable || setting === 'editable' ? 'editable' : 'flat');
}

function ask(doc, preset) {
  return new Promise((resolve) => {
    const dlg = $('savemode');
    const sensitive = doc.edits.filter((e) => e.type === 'stamp' || e.type === 'sig' || e.type === 'image').length;
    $('sm-sensitive').textContent = sensitive ? `Ce document contient ${sensitive} tampon${sensitive > 1 ? 's' : ''}, signature${sensitive > 1 ? 's' : ''} ou image${sensitive > 1 ? 's' : ''}.` : '';
    $(preset === 'editable' ? 'sm-editable' : 'sm-flat').checked = true;
    $('sm-remember').checked = false;
    const sync = () => { $('sm-warn').hidden = !$('sm-editable').checked; };
    sync();
    const finish = (v) => {
      dlg.hidden = true;
      dlg.removeEventListener('keydown', onKey, true);
      $('sm-editable').onchange = $('sm-flat').onchange = $('sm-ok').onclick = $('sm-cancel').onclick = null;
      resolve(v);
    };
    const ok = () => {
      const editable = $('sm-editable').checked;
      if ($('sm-remember').checked) Settings.set('saveMode', editable ? 'editable' : 'flat');
      finish({ editable });
    };
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); }
      else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); e.stopPropagation(); ok(); }
      else e.stopPropagation();
    }
    $('sm-editable').onchange = sync; $('sm-flat').onchange = sync;
    $('sm-ok').onclick = ok; $('sm-cancel').onclick = () => finish(null);
    dlg.addEventListener('keydown', onKey, true);
    dlg.hidden = false;
    $('sm-ok').focus();
  });
}

// Options d'exportBytes pour un enregistrement modifiable ; report reçoit { written, reason, objects }.
export function exportOptions(doc, report) {
  return { editable: { numbering: ES.numberingToIndex(doc.numbering || [], doc.pages || []), nextId: doc.nextId }, onEditable: (r) => Object.assign(report, r) };
}

// Fusion : un fichier modifiable ajouté garde ses annotations figées et visibles.
export function mergeNotice(name, bytes, doc) {
  if ((doc && doc.editable) || (bytes && ES.detect(bytes))) toast(`« ${name} » : ses annotations seront figées dans le fichier fusionné (plus modifiables).`, 6000);
}
