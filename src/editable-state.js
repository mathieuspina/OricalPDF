// Annotations « modifiables » (1.2.0) : état JSON versionné écrit dans le PDF à côté d'un flux de contenu DÉDIÉ (voir editable-pdf.js).
// Pur (ni DOM ni Electron). Le PDF reste lisible partout : les objets sont dessinés dans un flux ajouté à /Contents de chaque page
// (/SpinADoc BMC … EMC) ; l'état (objets, échelles, numérotation, empreinte SHA-256 de chaque flux) est un flux référencé par la clé
// /SpinADoc du catalogue. À la réouverture, le flux est retiré (la page redevient celle d'avant les annotations) et l'état restauré.
//
// Contenu de l'état (version 1) — UNIQUEMENT ce qui est écrit dans le PDF (jamais de mesure non incluse ni de zone de caviardage) :
//   { v: 1, app, pages: nombre de pages écrites, edits: [objets, page = indice de page écrite], nextId,
//     measure: { scales: { [indice]: mm/pt }, unit, precision }, numbering: [règles, ancres fromI / toI = indices de pages écrites],
//     streams: [{ i, hash, added: { Font: [clés], XObject: [clés], ExtGState: [clés] } }], images: { [imgId]: { mime, page, key } },
//     fields: [noms des champs de formulaire créés] }
// La liste de pages repart de l'identité à la réouverture : les opérations de pages faites avant l'enregistrement sont intégrées au PDF.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EditableState = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = 1;
  const KEY = 'SpinADoc'; // clé du catalogue → flux d'état
  const TYPE = 'SpinADocState'; // /Type du flux d'état (dictionnaire de flux : jamais compressé dans un flux d'objets, donc repérable par octets)
  const TAG = 'SpinADoc'; // étiquette du contenu marqué (BMC) du flux dédié

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isMeasure = (e) => /^m-/.test(e.type);

  // Objets réellement écrits dans le PDF : ni zone de caviardage (jamais écrite), ni mesure si « inclure dans le PDF » est désactivé.
  function writable(edits, measure) {
    const noMeasures = !!(measure && measure.include === false);
    return (edits || []).filter((e) => e && e.type !== 'redact' && !(noMeasures && isMeasure(e)));
  }

  // Règles de numérotation : ancres par identifiant de page (fromU / toU) ↔ indices de pages écrites (fromI / toI).
  function numberingToIndex(rules, pages) {
    const idx = (u) => { if (u === null || u === undefined) return null; const i = pages.findIndex((p) => p.u === u); return i < 0 ? null : i; };
    return (rules || []).map((r) => { const o = clone(r); o.fromI = idx(r.fromU); o.toI = idx(r.toU); delete o.fromU; delete o.toU; return o; });
  }
  function numberingFromIndex(rules, pages) {
    const uid = (i) => (i === null || i === undefined || !pages[i] ? null : pages[i].u);
    return (rules || []).map((r) => { const o = clone(r); o.fromU = uid(r.fromI); o.toU = uid(r.toI); delete o.fromI; delete o.toI; return o; });
  }

  // État à écrire : edits = objets écrits (déjà filtrés), pages = nombre de pages écrites.
  function build(o) {
    const m = o.measure || {};
    return {
      v: VERSION, app: 'Spin A Doc', pages: o.pages, edits: clone(o.edits || []), nextId: o.nextId || 1 + Math.max(0, ...(o.edits || []).map((e) => e.id || 0)),
      measure: { scales: clone(m.scales || {}), unit: m.unit || 'm', precision: m.precision === undefined ? 2 : m.precision },
      numbering: clone(o.numbering || []), streams: o.streams || [], images: o.images || {}, fields: o.fields || [],
    };
  }
  const serialize = (state) => JSON.stringify(state);

  // Lecture : { ok: true, state } ou { ok: false, reason: 'version' | 'corrompu' }.
  function parse(text) {
    let s;
    try { s = JSON.parse(text); } catch { return { ok: false, reason: 'corrompu' }; }
    if (!s || typeof s !== 'object' || !Number.isInteger(s.v)) return { ok: false, reason: 'corrompu' };
    if (s.v > VERSION) return { ok: false, reason: 'version' };
    return migrate(s);
  }
  // Migration des versions antérieures (aucune pour l'instant : v1 est la première) puis validation de la forme.
  function migrate(s) {
    if (s.v !== 1) return { ok: false, reason: 'version' };
    const okArr = (a) => Array.isArray(a);
    if (!Number.isInteger(s.pages) || s.pages < 1 || !okArr(s.edits) || !okArr(s.streams) || !okArr(s.numbering) || !okArr(s.fields || [])
      || !s.measure || typeof s.measure !== 'object' || typeof (s.images || {}) !== 'object'
      || s.streams.some((r) => !Number.isInteger(r.i) || r.i < 0 || r.i >= s.pages || !/^[0-9a-f]{64}$/.test(r.hash || ''))
      || s.edits.some((e) => !e || typeof e.type !== 'string' || !Number.isInteger(e.page) || e.page < 0 || e.page >= s.pages)) return { ok: false, reason: 'corrompu' };
    return { ok: true, state: s };
  }

  // Le fichier contient-il un état ? Recherche des octets « /SpinADocState » (dictionnaire d'un flux : en clair, même chiffré ou avec flux
  // d'objets). Coût : une recherche d'octets ; un PDF ordinaire n'est pas analysé.
  const NEEDLE = '/' + TYPE;
  function detect(bytes) {
    if (!bytes || !bytes.length) return false;
    const n = NEEDLE.length, c0 = NEEDLE.charCodeAt(0);
    let i = bytes.indexOf(c0);
    while (i >= 0 && i <= bytes.length - n) {
      let k = 1;
      while (k < n && bytes[i + k] === NEEDLE.charCodeAt(k)) k++;
      if (k === n) return true;
      i = bytes.indexOf(c0, i + 1);
    }
    return false;
  }

  // Messages de repli (le fichier s'ouvre comme un PDF normal, annotations figées).
  const REASONS = {
    version: 'il a été enregistré par une version plus récente d’Orical PDF',
    corrompu: 'les informations de modification sont illisibles',
    pages: 'le nombre de pages a changé depuis l\'enregistrement (fichier modifié par un autre outil)',
    flux: 'le contenu des pages a été réécrit par un autre outil depuis l\'enregistrement',
    empreinte: 'les annotations ont été modifiées par un autre outil depuis l\'enregistrement',
    lecture: 'le fichier n\'a pas pu être analysé',
  };
  const message = (name, reason) => `« ${name} » s'ouvre avec ses annotations figées : ${REASONS[reason] || REASONS.lecture}.`;

  // SHA-256 en hexadécimal (Web Crypto : renderer, worker et Node ≥ 19).
  async function sha256(bytes) {
    const h = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
    let s = ''; for (const b of h) s += b.toString(16).padStart(2, '0');
    return s;
  }

  return { VERSION, KEY, TYPE, TAG, writable, numberingToIndex, numberingFromIndex, build, serialize, parse, detect, REASONS, message, sha256 };
});
