// Annotations modifiables (1.2.0) : interactions avec les autres fonctions, après réouverture (logique, rendu relu avec pdf.js).
// 1. Opérations de pages APRÈS réouverture (suppression, déplacement, rotation, duplication) : objets, échelles et numérotation suivent ;
//    aller-retour : rendu identique au pixel au même travail fait sans réouverture (A4 ; tolérance d'aller-retour ≤ 0,2 mm, ici 0 px).
// 2. Impression (print-compose) et fusion (merge-worker) d'un fichier modifiable : annotations imprimées / fusionnées UNE fois.
// 3. Formulaire d'origine rempli : valeurs dans la base, conservées après réouverture ; optimisation (flux d'objets) ; protection.
// 4. Export d'un document restauré sans mode modifiable (comparaison, export en images, fusion modifiée) : rendu identique au fichier.
// 5. Plan A0 : réouverture, rotation de la page, réenregistrement : rendu identique au travail direct.
// Usage : node test/test-editable-ops.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const PDFLib = require('@cantoo/pdf-lib');
const Shapes = require('../src/shapes.js');
require('../src/callout.js');
const Measure = require('../src/measure.js');
const Numbering = require('../src/numbering.js');
const PageOps = require('../src/page-ops.js');
const PdfEdit = require('../src/pdf-edit.js');
const PrintCompose = require('../src/print-compose.js');
const ES = require('../src/editable-state.js');
const EP = require('../src/editable-pdf.js');
const { makeForm } = require('./lib/make-form.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail).slice(0, 400) : ''); } };
const FONTS = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'standard_fonts').split('\\').join('/') + '/';
const { PDFDocument, StandardFonts } = PDFLib;
let pdfjs;
const load = (bytes) => pdfjs.getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: FONTS, verbosity: 0, isEvalSupported: false }).promise;
async function renderAll(bytes, scale = 1) {
  const pdf = await load(bytes);
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n); const vp = page.getViewport({ scale });
    const cc = pdf.canvasFactory.create(Math.ceil(vp.width), Math.ceil(vp.height));
    await page.render({ canvasContext: cc.context, viewport: vp, canvasFactory: pdf.canvasFactory }).promise;
    const tc = await page.getTextContent();
    pages.push({ px: cc.context.getImageData(0, 0, cc.canvas.width, cc.canvas.height).data, text: tc.items.map((i) => i.str).join('|') });
  }
  await pdf.destroy();
  return pages;
}
function diff(a, b) {
  if (a.length !== b.length) return { px: -1, n: [a.length, b.length] };
  let px = 0;
  a.forEach((p, k) => { const q = b[k]; if (p.px.length !== q.px.length) { px = -1; return; } for (let i = 0; i < p.px.length; i += 4) if (p.px[i] !== q.px[i] || p.px[i + 1] !== q.px[i + 1] || p.px[i + 2] !== q.px[i + 2]) px++; });
  return { px, text: a.every((p, k) => p.text === b[k].text) };
}
const same = (d) => d.px === 0 && d.text;
const count = (s, w) => s.split(w).length - 1;

async function a4(n) {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  for (let k = 0; k < n; k++) { const p = d.addPage([595, 842]); for (let l = 0; l < 30; l++) p.drawText(`Ligne ${l + 1} page ${k + 1} : document exemple.`, { x: 50, y: 790 - l * 18, size: 11, font: f }); }
  return d.save();
}
const D = (t, o) => Object.assign(Shapes.defaultsFor(t), { type: t }, o);

// Document « en mémoire » minimal : comme doc-model + viewer.exportBytes (pages, échelles par indice, numérotation par uid).
function docOf(bytes, n, edits, scales, numbering, nextId) { return { bytes, st: Object.assign(PageOps.identity(n), { edits, scales, nextId }), numbering }; }
async function exportDoc(doc, o = {}) {
  const rep = {};
  const s = doc.st;
  const assets = {
    images: {}, measure: { scales: s.scales, unit: 'm', precision: 2, include: true }, pages: { list: s.pages, sources: {} },
    numbering: Numbering.resolve(doc.numbering, s.pages), purge: !!o.purge, form: o.form || null, encrypt: o.encrypt || null, useObjectStreams: o.useObjectStreams,
  };
  if (o.editable) { assets.editable = { numbering: ES.numberingToIndex(doc.numbering, s.pages), nextId: s.nextId }; assets.onEditable = (r) => Object.assign(rep, r); }
  return { out: await PdfEdit.applyEdits(PDFLib, doc.bytes, s.edits, assets), rep };
}
// Réouverture : comme editable-ui.apply (base, objets, échelles, numérotation par uid de la nouvelle liste identité).
async function reopen(bytes) {
  const r = await EP.read(PDFLib, bytes);
  if (r.status !== 'ok') return { r };
  const st = r.state;
  const ids = PageOps.identity(st.pages);
  return { r, doc: docOf(r.base, st.pages, st.edits, st.measure.scales, ES.numberingFromIndex(st.numbering, ids.pages), st.nextId) };
}
// Le même enchaînement d'opérations de pages (pages-ui → PageOps → setPagesState).
function ops(st) {
  st = PageOps.remove(st, [0]);        // 4 → 3 pages
  st = PageOps.move(st, [2], 0);       // dernière page en tête
  st = PageOps.rotate(st, [1], 90);
  st = PageOps.duplicate(st, [0]);     // 4 pages
  return st;
}

(async () => {
  pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const orig = await a4(4);
  const mk = () => [
    D('rect', { id: 1, page: 0, cx: 150, cy: 650, w: 90, h: 40, rot: 0 }),
    D('stamp', { id: 2, page: 1, label: 'Validé', cx: 420, cy: 700, w: 140, h: 44, rot: 0 }),
    D('note', { id: 3, page: 2, x: 80, y: 300, text: 'Relecture page trois', size: 11, width: 170 }),
    D('m-dist', { id: 4, page: 3, points: [[100, 200], [400, 200]] }),
    D('callout', { id: 5, page: 3, x: 300, y: 500, size: 11, tip: [150, 420], text: 'Légende quatre' }),
  ];
  const scales = { 2: Measure.scaleFromRatio(50), 3: Measure.scaleFromRatio(100) };
  const rules = () => [Object.assign(Numbering.newRule(), { fromU: 'p2', start: 1 })];

  console.log('1. Opérations de pages après réouverture : objets, échelles, numérotation ; aller-retour');
  const first = await exportDoc(docOf(orig, 4, mk(), scales, rules(), 6), { editable: true });
  check('fichier modifiable écrit (5 objets, numérotation)', first.rep.written === true && first.rep.objects === 5, first.rep);
  const ro = await reopen(first.out);
  check('réouverture : 5 objets, échelles des pages 3 et 4, numérotation à partir de la page 2', ro.doc && ro.doc.st.edits.length === 5 && Object.keys(ro.doc.st.scales).join() === '2,3' && ro.doc.numbering[0].fromU === 'p2', ro.r.status);
  // a) travail direct (sans réouverture), b) après réouverture : mêmes opérations, aplati
  const direct = docOf(orig, 4, mk(), scales, rules(), 6); direct.st = ops(direct.st);
  const after = ro.doc; after.st = ops(after.st);
  const pDirect = await renderAll((await exportDoc(direct)).out);
  const flatAfter = await exportDoc(after, { purge: true });
  const pAfter = await renderAll(flatAfter.out);
  const d1 = diff(pDirect, pAfter);
  check(`aplati après réouverture + opérations de pages = travail direct (4 pages, ${d1.px} px différents, textes identiques)`, same(d1), d1);
  check('pages : la page supprimée a emporté son objet (rectangle), les autres ont suivi (pages 0,1,2,3 après opérations)',
    !after.st.edits.some((e) => e.id === 1) && after.st.edits.map((e) => `${e.type}@${e.page}`).sort().join() === direct.st.edits.map((e) => `${e.type}@${e.page}`).sort().join(), after.st.edits.map((e) => `${e.type}@${e.page}`));
  check('échelles remappées comme dans le travail direct', JSON.stringify(after.st.scales) === JSON.stringify(direct.st.scales), [after.st.scales, direct.st.scales]);
  const numText = (p) => p.map((x) => x.text.split('|').filter((t) => /^\d+$/.test(t)).join(',')).join(' / ');
  check('numérotation : mêmes numéros sur les mêmes pages', numText(pDirect) === numText(pAfter), [numText(pDirect), numText(pAfter)]);
  // réenregistrement modifiable après opérations, puis réouverture : état cohérent, rendu = aplati
  const again = await exportDoc(after, { purge: true, editable: true });
  const ro2 = await reopen(again.out);
  check('réenregistré en modifiable après opérations : 4 pages, objets aux mêmes pages et mêmes coordonnées', ro2.doc && ro2.r.state.pages === 4
    && JSON.stringify(ro2.doc.st.edits.map((e) => [e.id, e.page, e.cx, e.cy, e.points])) === JSON.stringify(after.st.edits.map((e) => [e.id, e.page, e.cx, e.cy, e.points])), ro2.r.status);
  const d2 = diff(pAfter, await renderAll(again.out));
  check(`fichier modifiable : rendu identique à l'aplati (${d2.px} px)`, same(d2), d2);
  const base2 = await renderAll(ro2.r.base);
  check('base relue : page sans annotation ni numéro (aucun doublon à la réédition)', base2.every((p) => !/Validé|Relecture|Légende/.test(p.text)) && numText(base2).replace(/[ /]/g, '') === '', base2.map((p) => p.text.slice(0, 60)));

  console.log('2. Impression et fusion d\'un fichier modifiable : annotations présentes une seule fois');
  {
    // une feuille à la taille affichée de chaque page (page pivotée comprise) : l'impression doit reproduire le fichier au pixel près
    const sheets = (await PrintCompose.pageInfos(PDFLib, again.out)).map((p, k) => ({ w: p.w, h: p.h, items: [{ page: k, x: 0, y: 0, scale: 1, rotate: 0 }] }));
    const printed = await renderAll(await PrintCompose.compose(PDFLib, again.out, sheets));
    const all = printed.map((p) => p.text).join('|');
    const dp = diff(printed, await renderAll(again.out));
    const once = (t) => count(t, 'VALIDÉ') === 1 && count(t, 'Relecture page trois') === 1 && count(t, 'Légende quatre') === 2 && count(t, '10,58 m') === 2;
    check('fichier modifiable : tampon ×1, note ×1, légende et cote ×2 (page dupliquée)', once((await renderAll(again.out)).map((p) => p.text).join('|')));
    check(`impression (print-compose, feuille à la taille de chaque page) : rendu identique au fichier (${dp.px} px), donc annotations imprimées une seule fois`, dp.px === 0, dp);
    void all;
    const messages = [];
    const sandbox = { PDFLib, importScripts: (...urls) => { for (const u of urls) if (!/pdf-lib/.test(u)) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', u), 'utf8'), sandbox); }, self: { postMessage: (m) => messages.push(m) }, console, setTimeout };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'merge-worker.js'), 'utf8'), sandbox);
    sandbox.self.onmessage({ data: { files: [{ name: 'a.pdf', bytes: again.out.slice().buffer, pages: [0, 1, 2, 3], rotate: 0 }, { name: 'b.pdf', bytes: orig.slice().buffer, pages: [0], rotate: 0 }] } });
    let end = null; for (let i = 0; i < 600 && !end; i++) { end = messages.find((m) => m.type === 'done' || m.type === 'error'); if (!end) await new Promise((r) => setTimeout(r, 50)); }
    const merged = end && end.type === 'done' ? new Uint8Array(end.bytes) : null;
    const mtext = merged ? (await renderAll(merged)).map((p) => p.text).join('|') : '';
    check('fusion (merge-worker) : annotations visibles une fois, fichier fusionné ordinaire (sans état)', !!merged && once(mtext) && !ES.detect(merged), end && end.type);
  }

  console.log('3. Formulaire d\'origine rempli, optimisation, protection');
  {
    const ff = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'oricalpdf-edops-')), 'formulaire.pdf');
    const fb = new Uint8Array(fs.readFileSync(await makeForm(ff)));
    const doc = docOf(fb, 2, [D('stamp', { id: 1, page: 0, label: 'Reçu', cx: 450, cy: 790, w: 110, h: 36, rot: 0 })], {}, [], 2);
    const w = await exportDoc(doc, { editable: true, form: { values: { nom: 'Client Exemple' }, flatten: false } });
    const ro3 = await reopen(w.out);
    const fields = ro3.doc ? await (async () => { const pdf = await load(ro3.r.base); const objs = await pdf.getFieldObjects(); await pdf.destroy(); return objs; })() : {};
    check('formulaire rempli : valeur dans la base (conservée à la réouverture), champs d\'origine intacts', ro3.doc && fields.nom && fields.nom.some((x) => x.value === 'Client Exemple') && Object.keys(fields).length >= 9, Object.keys(fields || {}));
    check('formulaire : le tampon reste un objet modifiable', ro3.doc && ro3.doc.st.edits.length === 1 && ro3.doc.st.edits[0].type === 'stamp');
    const opt = await exportDoc(after, { purge: true, editable: true, useObjectStreams: true });
    const ro4 = await reopen(opt.out);
    check(`optimisation (flux d'objets) : état détecté et relu (${opt.out.length} o contre ${again.out.length} o)`, ro4.doc && ro4.doc.st.edits.length === after.st.edits.length && same(diff(await renderAll(opt.out), pAfter)), ro4.r.status);
    const prot = await exportDoc(after, { purge: true, editable: true, encrypt: { userPassword: 'sesame' } });
    let decOk = false;
    try { await (await load(prot.out)).destroy(); } catch (e) { decOk = /password/i.test(e.name + e.message); }
    check('protection par mot de passe en mode modifiable : fichier chiffré (mot de passe exigé), état écrit', decOk && prot.rep.written === true, prot.rep);
  }

  console.log('4. Document restauré exporté sans mode modifiable (comparaison, export en images, fusion après modification)');
  {
    const r = await reopen(again.out);
    const flat = await exportDoc(r.doc, { purge: true });
    const d = diff(await renderAll(flat.out), await renderAll(again.out));
    check(`export aplati d'un document restauré = fichier modifiable tel qu'affiché (${d.px} px), sans état`, same(d) && !ES.detect(flat.out), d);
    const noPurge = await PDFDocument.load(flat.out);
    check('purge : aucun objet orphelin de la base incrémentale (nombre d\'objets ≤ celui du fichier modifiable)', noPurge.context.enumerateIndirectObjects().length <= (await PDFDocument.load(again.out)).context.enumerateIndirectObjects().length);
  }

  console.log('5. Plan A0 : réouverture, rotation de page, réenregistrement');
  {
    const d = await PDFDocument.create(); const p = d.addPage([2384, 3370]);
    let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let k = 0; k < 6000; k++) { const x = rnd() * 2384, y = rnd() * 3370; p.drawLine({ start: { x, y }, end: { x: x + (rnd() - 0.5) * 300, y: y + (rnd() - 0.5) * 300 }, thickness: 0.4 }); }
    const a0 = await d.save();
    const objs = Array.from({ length: 60 }, (_, k) => D(k % 2 ? 'rect' : 'm-dist', k % 2 ? { id: k + 1, page: 0, cx: 200 + (k % 10) * 200, cy: 300 + Math.floor(k / 10) * 450, w: 120, h: 60, rot: 0 } : { id: k + 1, page: 0, points: [[100 + (k % 10) * 200, 200 + Math.floor(k / 10) * 450], [250 + (k % 10) * 200, 260 + Math.floor(k / 10) * 450]] }));
    const sc = { 0: Measure.scaleFromRatio(100) };
    const w = await exportDoc(docOf(a0, 1, objs, sc, [], 61), { editable: true });
    const t0 = Date.now(); const ro5 = await reopen(w.out); const tRead = Date.now() - t0;
    ro5.doc.st = PageOps.rotate(ro5.doc.st, [0], 90);
    const direct5 = docOf(a0, 1, objs, sc, [], 61); direct5.st = PageOps.rotate(direct5.st, [0], 90);
    const again5 = await exportDoc(ro5.doc, { purge: true, editable: true });
    const dd = diff(await renderAll((await exportDoc(direct5)).out, 0.25), await renderAll(again5.out, 0.25));
    check(`A0 (6 000 traits, 60 objets) : relu en ${tRead} ms, pivoté après réouverture = travail direct (${dd.px} px), ${again5.out.length} o`, ro5.doc && same(dd) && again5.rep.written, dd);
  }

  console.log(`\n${passed} vérifications réussies, ${failures.length} échec(s).`);
  if (failures.length) { console.log('Échecs :\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('OK : annotations modifiables (interactions).');
})().catch((e) => { console.error(e); process.exit(1); });
