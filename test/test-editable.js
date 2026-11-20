// Annotations modifiables (1.2.0) : format (editable-state), écriture du flux dédié et de l'état (pdf-edit), lecture et retrait
// (editable-pdf). Rendu relu avec pdf.js (identique au pixel), réenregistrements stables, aplati sans trace, replis, mot de passe,
// opérations de pages, numérotation, échelles, OCR, champs créés, caviardage (secrets), plan A0. Usage : node test/test-editable.js
const PDFLib = require('@cantoo/pdf-lib');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const Shapes = require('../src/shapes.js');
require('../src/callout.js');
const Measure = require('../src/measure.js');
const Numbering = require('../src/numbering.js');
const DocModel = require('../src/doc-model.js');
const PageOps = require('../src/page-ops.js');
const PdfEdit = require('../src/pdf-edit.js');
const ES = require('../src/editable-state.js');
const EP = require('../src/editable-pdf.js');
const Redact = require('../src/redact.js');
const RedactApply = require('../src/redact-apply.js');
const { makeRedactPdf, SECRET, ZONE } = require('./lib/make-redact-pdf.js');
const { scan } = require('./lib/secret-scan.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail).slice(0, 400) : ''); } };
const FONTS = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'standard_fonts').split('\\').join('/') + '/';
const { PDFDocument, PDFName, StandardFonts } = PDFLib;
const has = (bytes, s) => Buffer.from(bytes).includes(s);
const measure = Shapes.makeMeasure(PDFLib);

let pdfjs;
const load = (bytes) => pdfjs.getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: FONTS, verbosity: 0, isEvalSupported: false }).promise;
async function renderAll(bytes, scale) {
  const pdf = await load(bytes);
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n); const vp = page.getViewport({ scale });
    const cc = pdf.canvasFactory.create(Math.ceil(vp.width), Math.ceil(vp.height));
    await page.render({ canvasContext: cc.context, viewport: vp, canvasFactory: pdf.canvasFactory }).promise;
    const tc = await page.getTextContent();
    pages.push({ px: cc.context.getImageData(0, 0, cc.canvas.width, cc.canvas.height).data, text: tc.items.map((i) => i.str).join('|'), annots: (await page.getAnnotations()).length });
  }
  await pdf.destroy();
  return pages;
}
function diff(a, b) {
  if (a.length !== b.length) return { px: -1 };
  let px = 0;
  a.forEach((p, k) => { const q = b[k]; if (p.px.length !== q.px.length) { px = -1; return; } for (let i = 0; i < p.px.length; i += 4) if (p.px[i] !== q.px[i] || p.px[i + 1] !== q.px[i + 1] || p.px[i + 2] !== q.px[i + 2]) px++; });
  return { px, text: a.every((p, k) => p.text === b[k].text) };
}
const same = (d) => d.px === 0 && d.text;

// ------------------------------------------------------------------ entrées
async function a4(n = 3) {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  for (let k = 0; k < n; k++) { const p = d.addPage([595, 842]); for (let l = 0; l < 40; l++) p.drawText(`Ligne ${l + 1} de la page ${k + 1} : texte courant du document exemple.`, { x: 50, y: 790 - l * 16, size: 11, font: f }); }
  return d.save();
}
async function a0dense() {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica); const p = d.addPage([2384, 3370]);
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 40000; i++) { const x = rnd() * 2384, y = rnd() * 3370; p.drawLine({ start: { x, y }, end: { x: x + (rnd() - 0.5) * 170, y: y + (rnd() - 0.5) * 170 }, thickness: 0.3 }); }
  for (let i = 0; i < 600; i++) p.drawText('Cote ' + i, { x: rnd() * 2300, y: rnd() * 3300, size: 8, font: f });
  return d.save();
}
const png = () => { const c = createCanvas(300, 100); const g = c.getContext('2d'); g.strokeStyle = 'rgba(16,32,128,0.9)'; g.lineWidth = 7; g.beginPath(); for (let x = 10; x < 290; x += 4) g.lineTo(x, 50 + Math.sin(x / 17) * 35); g.stroke(); return new Uint8Array(c.toBuffer('image/png')); };
const jpg = () => { const c = createCanvas(400, 300); const g = c.getContext('2d'); for (let i = 0; i < 600; i++) { g.fillStyle = `rgb(${(i * 37) % 255},${(i * 91) % 255},${(i * 13) % 255})`; g.fillRect((i * 53) % 400, (i * 29) % 300, 30, 20); } return new Uint8Array(c.toBuffer('image/jpeg', 90)); };
const IMAGES = { SIG: { mime: 'image/png', bytes: png() }, PHOTO: { mime: 'image/jpeg', bytes: jpg() } };

// Tous les types dessinés par pdf-edit autour de (ox, oy).
function set(page, ox, oy, s) {
  const D = (t, o) => Object.assign(Shapes.defaultsFor(t), { type: t, page }, o);
  const pt = (x, y) => [ox + x * s, oy + y * s];
  const pen = []; for (let k = 0; k < 200; k++) pen.push(pt(10 + k * 0.8, 300 + Math.sin(k / 9) * 12));
  return [
    D('add', { x: ox, y: oy + 400 * s, text: 'Texte ajouté\nsur deux lignes', size: 12 * s }),
    D('note', { x: ox + 200 * s, y: oy + 400 * s, text: 'Note : vérifier', shadow: true, size: 11 * s, width: 170 * s }),
    D('stamp', { label: 'Approuvé', cx: pt(80, 340)[0], cy: pt(80, 340)[1], w: 120 * s, h: 40 * s, rot: 0, withDate: true, date: '20/11/2026' }),
    D('sig', { cx: pt(250, 340)[0], cy: pt(250, 340)[1], w: 100 * s, h: 40 * s, w0: 100 * s, lw: 3, rot: 0, strokes: [[[0.05, 0.1], [0.3, 0.9], [0.5, 0.2], [0.95, 0.1]]] }),
    D('image', { imgId: 'SIG', cx: pt(80, 260)[0], cy: pt(80, 260)[1], w: 120 * s, h: 40 * s, rot: 0, opacity: 1 }),
    D('image', { imgId: 'PHOTO', cx: pt(250, 250)[0], cy: pt(250, 250)[1], w: 80 * s, h: 60 * s, rot: 15, opacity: 0.8 }),
    D('rect', { cx: pt(50, 180)[0], cy: pt(50, 180)[1], w: 60 * s, h: 40 * s, rot: 0, fill: [0.9, 0.9, 1] }),
    D('ellipse', { cx: pt(130, 180)[0], cy: pt(130, 180)[1], w: 60 * s, h: 40 * s, rot: 20 }),
    D('hlrect', { cx: pt(210, 180)[0], cy: pt(210, 180)[1], w: 60 * s, h: 20 * s, rot: 0 }),
    D('arrow', { points: [pt(100, 120), pt(180, 150)] }),
    D('polygon', { points: [pt(200, 110), pt(260, 110), pt(240, 150)] }),
    D('cloud', { points: [pt(0, 20), pt(90, 20), pt(90, 90), pt(0, 90)], arc: 14 * s }),
    D('pen', { points: pen }),
    D('highlight', { rects: [[ox, oy + 470 * s, 200 * s, 12 * s]] }),
    D('strike', { rects: [[ox, oy + 510 * s, 200 * s, 12 * s]] }),
    D('callout', { x: pt(150, 60)[0], y: pt(150, 60)[1], text: 'Poteau P12', size: 11 * s, tip: pt(110, 20) }),
    D('replace', { x: ox, y: oy + 540 * s, text: 'Remplacé', size: 11 * s, color: [0, 0, 0], bgMode: 'white', cover: PdfEdit.coverFor(ox, oy + 540 * s, 150 * s, 11 * s) }),
    D('m-dist', { points: [pt(100, 20), pt(200, 20)] }),
    D('m-dim', { points: [pt(210, 20), pt(330, 60)] }),
    D('m-poly', { points: [pt(100, 40), pt(150, 40), pt(150, 80)], showSegments: true }),
    D('m-area', { points: [pt(210, 70), pt(260, 70), pt(260, 100), pt(210, 100)], fill: [0, 0.45, 0.8] }),
    D('m-angle', { points: [pt(300, 80), pt(270, 80), pt(270, 100)] }),
    D('m-circle', { points: [pt(330, 90), pt(310, 110), pt(290, 90)] }),
  ];
}
const number = (list) => { list.forEach((e, i) => { e.id = i + 1; }); return list; };
const scalesFor = (n) => Object.fromEntries([...Array(n).keys()].map((i) => [i, Measure.scaleFromRatio(50)]));
const RULE = Numbering.newRule();
const ident = (n) => [...Array(n).keys()].map((i) => ({ u: i + 1 }));

// Enregistrement : editable = true → mode modifiable (numérotation : règle par défaut, ancres d'indices).
async function save(bytes, edits, o = {}) {
  const n = o.n || 3;
  const report = {};
  const assets = {
    images: o.images || IMAGES, measure: o.measure || { scales: scalesFor(n), unit: 'm', precision: 2, include: true },
    numbering: o.numbering === false ? [] : Numbering.resolve([RULE], ident(n)), pages: o.pages, ocr: o.ocr, purge: !!o.purge,
    scrub: !!o.scrub, clean: o.clean || null, encrypt: o.encrypt || null, form: o.form || null, onEditable: (r) => Object.assign(report, r),
  };
  if (o.editable !== false) assets.editable = { numbering: o.numbering === false ? [] : ES.numberingToIndex([RULE], ident(n)), nextId: 999 };
  const out = await PdfEdit.applyEdits(PDFLib, bytes, edits, assets);
  return { out, report };
}
const imagesOf = (r) => Object.fromEntries(Object.entries(r.images).map(([id, a]) => [id, { mime: a.mime, bytes: a.bytes }]));
async function pixels(bytes) { const im = await loadImage(Buffer.from(bytes)); const c = createCanvas(im.width, im.height); const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; }

(async () => {
  pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  console.log('1. Format (editable-state, pur)');
  {
    const e = [{ id: 1, type: 'rect', page: 0 }, { id: 2, type: 'redact', page: 0 }, { id: 3, type: 'm-dist', page: 0 }];
    check('objets écrits : jamais de zone de caviardage', ES.writable(e, { include: true }).map((x) => x.id).join() === '1,3');
    check('objets écrits : pas de mesure si « inclure dans le PDF » est désactivé', ES.writable(e, { include: false }).map((x) => x.id).join() === '1');
    const pages = [{ u: 7 }, { u: 3 }, { u: 9 }];
    const rules = [Object.assign(Numbering.newRule(), { fromU: 3, toU: 9 }), Numbering.newRule()];
    const ix = ES.numberingToIndex(rules, pages);
    check('numérotation : ancres → indices de pages écrites', ix[0].fromI === 1 && ix[0].toI === 2 && ix[1].fromI === null && !('fromU' in ix[0]));
    const back = ES.numberingFromIndex(ix, ident(3));
    check('numérotation : indices → nouveaux identifiants à la réouverture', back[0].fromU === 2 && back[0].toU === 3 && back[1].fromU === null && !('fromI' in back[0]));
    const st = ES.build({ pages: 1, edits: [{ id: 4, type: 'rect', page: 0 }], measure: { scales: { 0: 0.5 }, unit: 'mm', precision: 1 } });
    const rt = ES.parse(ES.serialize(st));
    check('état : version 1, aller-retour JSON, nextId déduit', rt.ok && rt.state.v === 1 && rt.state.nextId === 5 && rt.state.measure.unit === 'mm');
    check('état : version future → repli « version »', ES.parse(JSON.stringify(Object.assign({}, st, { v: 2 }))).reason === 'version');
    check('état : JSON illisible ou incohérent → repli « corrompu »', ES.parse('{').reason === 'corrompu' && ES.parse(JSON.stringify(Object.assign({}, st, { edits: [{ type: 'rect', page: 5 }] }))).reason === 'corrompu'
      && ES.parse(JSON.stringify(Object.assign({}, st, { streams: [{ i: 0, hash: 'zz' }] }))).reason === 'corrompu');
    check('détection par octets : présent / absent / vide', ES.detect(new TextEncoder().encode('x /Type /SpinADocState y')) && !ES.detect(new TextEncoder().encode('/SpinADocStat')) && !ES.detect(new Uint8Array(0)));
    check('messages de repli pour chaque raison', ['version', 'corrompu', 'pages', 'flux', 'empreinte', 'lecture'].every((r) => ES.message('a.pdf', r).includes(ES.REASONS[r])));
  }

  console.log('2. A4, 3 pages, tous les types : écriture, rendu, lecture, réenregistrements');
  const orig = await a4();
  const E = number([0, 1, 2].flatMap((p) => set(p, 60, 120, 1)));
  const flat = (await save(orig, E, { editable: false })).out;
  const t0 = Date.now();
  const w1 = await save(orig, E);
  const tW = Date.now() - t0;
  check(`modifiable écrit (${E.length} objets, ${tW} ms ; ${(flat.length / 1024).toFixed(0)} Ko aplati → ${(w1.out.length / 1024).toFixed(0)} Ko modifiable)`, w1.report.written && w1.report.objects === E.length && ES.detect(w1.out) && w1.out.length < flat.length * 1.1, w1.report);
  const rOrig = await renderAll(orig, 1), rFlat = await renderAll(flat, 1), rW1 = await renderAll(w1.out, 1);
  check('rendu pdf.js : modifiable identique à l\'aplati (pixels et texte), aucune annotation PDF', same(diff(rFlat, rW1)) && rW1.every((p) => p.annots === 0), diff(rFlat, rW1));
  const t1 = Date.now();
  const r1 = await EP.read(PDFLib, w1.out);
  const tR = Date.now() - t1;
  check(`lecture : état restauré à l'identique (${tR} ms)`, r1.status === 'ok' && JSON.stringify(r1.state.edits) === JSON.stringify(E) && r1.state.pages === 3 && r1.state.nextId === 999, r1.status === 'ok' ? null : r1);
  const rBase = await renderAll(r1.base, 1);
  check('base restaurée = original (pixels et texte) : aucun doublon à l\'écran une fois les objets réaffichés', same(diff(rOrig, rBase)), diff(rOrig, rBase));
  check('base = octets reçus + mise à jour incrémentale', Buffer.compare(Buffer.from(r1.base.subarray(0, w1.out.length)), Buffer.from(w1.out)) === 0 && r1.base.length > w1.out.length);
  check('JPEG relu à l\'identique depuis la page (non recopié dans l\'état)', r1.images.PHOTO && Buffer.compare(Buffer.from(r1.images.PHOTO.bytes), Buffer.from(IMAGES.PHOTO.bytes)) === 0);
  const pa = await pixels(IMAGES.SIG.bytes), pb = r1.images.SIG ? await pixels(r1.images.SIG.bytes) : [];
  check('PNG reconstruit depuis la page : mêmes pixels (transparence comprise), 300 × 100', r1.images.SIG && r1.images.SIG.w === 300 && pa.length === pb.length && pa.every((v, i) => v === pb[i]));
  check('échelles des mesures restaurées par indice de page', JSON.stringify(r1.state.measure.scales) === JSON.stringify(scalesFor(3)));
  // réenregistrements successifs depuis la base restaurée
  const sizes = [w1.out.length];
  let cur = w1.out, rLast = null;
  for (let k = 0; k < 3; k++) {
    const r = await EP.read(PDFLib, cur);
    cur = (await save(r.base, r.state.edits, { images: imagesOf(r), measure: r.state.measure, purge: true })).out;
    sizes.push(cur.length);
    rLast = r;
  }
  const spread = Math.max(...sizes.slice(1)) - Math.min(...sizes.slice(1));
  check(`3 réenregistrements : taille stable (${sizes.join(' / ')} octets ; écart ${spread})`, spread <= 64 && Math.abs(sizes[1] - sizes[0]) < 2048, sizes);
  check('3e réenregistrement : rendu identique au 1er (pixels et texte)', same(diff(rW1, await renderAll(cur, 1))));
  check('3e réenregistrement : état toujours identique', rLast && JSON.stringify(rLast.state.edits) === JSON.stringify(E));
  // aplati depuis un document ouvert en modifiable : flux et état supprimés définitivement
  const base1 = r1.base;
  const flat2 = (await save(base1, E, { editable: false, purge: true })).out;
  check('aplati depuis la base restaurée : aucun état, aucun flux dédié (même parmi les objets inutilisés)', !has(flat2, '/SpinADocState') && scan(flat2, 'SpinADoc BMC').hits.length === 0 && scan(w1.out, 'SpinADoc BMC').hits.length > 0);
  check('aplati depuis la base restaurée : rendu identique à l\'aplati d\'origine', same(diff(rFlat, await renderAll(flat2, 1))));
  check('aplati depuis la base restaurée : taille comparable à l\'aplati d\'origine (objets inutilisés supprimés)', Math.abs(flat2.length - flat.length) < 4096, [flat2.length, flat.length]);
  const empty = await save(orig, [], { numbering: false });
  check('modifiable sans aucune annotation : ni flux ni état', !empty.report.written && empty.report.reason === 'vide' && !has(empty.out, '/SpinADocState') && scan(empty.out, 'SpinADoc BMC').hits.length === 0);
  const cl = await save(orig, E, { clean: { title: true, author: true, subject: true, keywords: true, creator: true, producer: true, dates: true, xmp: true } });
  check('« Nettoyer les métadonnées » : enregistré aplati (raison signalée), aucun état', cl.report.written === false && cl.report.reason === 'metadonnees' && !has(cl.out, '/SpinADocState'));
  const sc = await save(orig, E, { scrub: true });
  check('caviardage appliqué : enregistré aplati (raison signalée), aucun état', sc.report.written === false && sc.report.reason === 'caviardage' && !has(sc.out, '/SpinADocState'));
  const nm = await save(orig, E.filter((e) => e.type !== 'm-dist'), { measure: { scales: scalesFor(3), unit: 'm', precision: 2, include: false } });
  const rnm = await EP.read(PDFLib, nm.out);
  check('mesures non incluses : absentes de l\'état', rnm.status === 'ok' && !rnm.state.edits.some((e) => /^m-/.test(e.type)) && rnm.state.edits.length > 0);

  console.log('3. Replis : fichier modifié par un autre outil, version inconnue, fusion');
  const rewrite = async (bytes, fn, opts) => { const d = await PDFDocument.load(bytes, { updateMetadata: false }); await fn(d); return d.save(opts); };
  const setState = (d, mut) => { const ref = d.catalog.get(PDFName.of('SpinADoc')); const s = d.context.lookup(ref); const st = JSON.parse(Buffer.from(PDFLib.decodePDFRawStream(s).decode()).toString()); mut(st); d.catalog.set(PDFName.of('SpinADoc'), d.context.register(d.context.flateStream(Buffer.from(JSON.stringify(st)), { Type: 'SpinADocState', V: 1 }))); };
  const fv = await EP.read(PDFLib, await rewrite(w1.out, (d) => setState(d, (st) => { st.v = 7; })));
  check('version de format inconnue → repli « version »', fv.status === 'fallback' && fv.reason === 'version', fv);
  const fc = await EP.read(PDFLib, await rewrite(w1.out, (d) => { const ref = d.catalog.get(PDFName.of('SpinADoc')); d.context.assign(ref, d.context.flateStream(Buffer.from('{pas du json'), { Type: 'SpinADocState' })); }));
  check('état illisible → repli « corrompu »', fc.status === 'fallback' && fc.reason === 'corrompu', fc);
  const fp = await EP.read(PDFLib, await rewrite(w1.out, (d) => { d.addPage([595, 842]); }));
  check('page ajoutée par un autre outil → repli « pages »', fp.status === 'fallback' && fp.reason === 'pages', fp);
  const fm = await EP.read(PDFLib, await rewrite(w1.out, (d) => { // contenu fusionné en un seul flux (outil qui « nettoie » les pages)
    for (const pg of d.getPages()) { const arr = pg.node.lookup(PDFName.of('Contents')); const parts = arr.asArray().map((r) => Buffer.from(PDFLib.decodePDFRawStream(d.context.lookup(r)).decode())); pg.node.set(PDFName.of('Contents'), d.context.register(d.context.flateStream(Buffer.concat(parts.map((b) => Buffer.concat([b, Buffer.from('\n')])))))); }
  }));
  check('flux de contenu fusionnés par un autre outil → repli « flux »', fm.status === 'fallback' && fm.reason === 'flux', fm);
  const fe = await EP.read(PDFLib, await rewrite(w1.out, (d) => { // un trait ajouté dans le flux dédié
    const pg = d.getPages()[0]; const arr = pg.node.lookup(PDFName.of('Contents')); const items = arr.asArray();
    for (let k = items.length - 1; k >= 0; k--) { const b = Buffer.from(PDFLib.decodePDFRawStream(d.context.lookup(items[k])).decode()); if (b.includes('/SpinADoc BMC')) { d.context.assign(items[k], d.context.flateStream(Buffer.concat([b, Buffer.from('\n0 0 m 100 100 l S\n')]))); break; } }
  }));
  check('flux dédié modifié par un autre outil → repli « empreinte »', fe.status === 'fallback' && fe.reason === 'empreinte', fe);
  const merged = await PDFDocument.create(); const src = await PDFDocument.load(w1.out);
  for (const p of await merged.copyPages(src, [0, 1, 2])) merged.addPage(p);
  const mb = await merged.save();
  const rm = await EP.read(PDFLib, mb);
  check('fusion : l\'état ne suit pas les pages copiées (PDF ordinaire, annotations figées et visibles)', rm.status === 'none' && same(diff(rW1, await renderAll(mb, 1))));
  check('PDF ordinaire : « aucun état », sans analyse (recherche d\'octets seulement)', (await EP.read(PDFLib, orig)).status === 'none');

  console.log('4. Protection par mot de passe : détection APRÈS déchiffrement');
  const enc = await save(orig, E, { encrypt: { userPassword: 'exemple' } });
  check('fichier chiffré : état écrit, contenu de l\'état illisible sans le mot de passe', enc.report.written && !has(enc.out, '"edits"'));
  const dec = async (bytes, pw) => { const d = await PDFDocument.load(bytes, { password: pw, updateMetadata: false }); const d2 = await PDFDocument.load(await d.save(), { ignoreEncryption: true, updateMetadata: false }); delete d2.context.trailerInfo.Encrypt; return d2.save(); };
  const plain = await dec(enc.out, 'exemple');
  const re = await EP.read(PDFLib, plain);
  check('copie déchiffrée (comme decrypt-worker) : état restauré à l\'identique', re.status === 'ok' && JSON.stringify(re.state.edits) === JSON.stringify(E), re.status);
  check('copie déchiffrée : base = original (pixels et texte)', re.status === 'ok' && same(diff(rOrig, await renderAll(re.base, 1))));

  console.log('5. Opérations de pages avant l\'enregistrement, numérotation, OCR, champ créé');
  {
    const spec = { list: [{ src: '0', i: 2 }, { src: '0', i: 0, rot: 90 }, { src: '0', i: 1 }], sources: {} };
    const pagesU = [{ u: 3 }, { u: 1 }, { u: 2 }];
    const rules = [Object.assign(Numbering.newRule(), { fromU: 1, start: 5 })];
    const ed = number([Object.assign(Shapes.defaultsFor('rect'), { type: 'rect', page: 1, cx: 300, cy: 400, w: 80, h: 40, rot: 0 }), Object.assign(Shapes.defaultsFor('m-dist'), { type: 'm-dist', page: 2, points: [[100, 100], [300, 100]] }),
      Object.assign(require('../src/fields.js').create('text', 0, [100, 700, 260, 722], [], { name: 'Nom' }), { id: 3 })]);
    const ocr = [{ words: [{ t: 'Reconnu', x0: 60, y0: 60, x1: 140, y1: 74, c: 95, a: 0 }] }, null, null];
    const report = {};
    const out = await PdfEdit.applyEdits(PDFLib, orig, ed, {
      images: {}, measure: { scales: { 1: Measure.scaleFromRatio(100) }, unit: 'm', precision: 2, include: true }, pages: spec, ocr,
      numbering: Numbering.resolve(rules, pagesU), form: { values: { Nom: 'Valeur saisie' }, flatten: false },
      editable: { numbering: ES.numberingToIndex(rules, pagesU), nextId: 4 }, onEditable: (r) => Object.assign(report, r),
    });
    const r = await EP.read(PDFLib, out);
    check('pages réordonnées / pivotées avant l\'enregistrement : état par indice de page écrite', r.status === 'ok' && r.state.pages === 3 && r.state.edits.map((e) => e.page).join() === '1,2,0', r.status);
    check('échelle de la page 2 écrite (indice 1) conservée', r.state && JSON.stringify(r.state.measure.scales[1]) === JSON.stringify(Measure.scaleFromRatio(100)));
    const nb = r.state ? ES.numberingFromIndex(r.state.numbering, ident(3)) : [];
    check('numérotation : ancre « à partir de la 2e page écrite » restaurée (fromU = 2 dans la liste identité)', nb.length === 1 && nb[0].fromU === 2 && nb[0].start === 5, nb);
    const rb = r.base ? await renderAll(r.base, 1) : [];
    check('OCR écrit dans la base (texte cherchable après réouverture, comme avant 1.2.0)', rb[0] && rb[0].text.includes('Reconnu'));
    check('numérotation retirée de la base (elle reste modifiable)', rb.length === 3 && !rb[1].text.split('|').includes('5') && (await renderAll(out, 1))[1].text.split('|').includes('5'));
    const bd = r.base ? await PDFDocument.load(r.base) : null;
    const names = bd ? bd.getForm().getFields().map((f) => f.getName()) : ['?'];
    check('champ créé : retiré du formulaire de la base, valeur saisie relue, objet restauré', r.state && r.state.fields.join() === 'Nom' && !names.includes('Nom') && r.values.Nom === 'Valeur saisie' && r.state.edits.some((e) => e.type === 'field' && e.name === 'Nom'), [names, r.values]);
    const ann = r.base ? (await (await (await load(r.base)).getPage(1)).getAnnotations()).length : -1;
    check('champ créé : plus aucun widget sur la page de la base', ann === 0, ann);
  }

  console.log('6. Caviardage après réouverture : aucune donnée caviardée dans l\'état ni dans la base écrite');
  {
    const secretPdf = await makeRedactPdf();
    const deps = { PDFLib, measure, loadPdf: (b) => load(b.slice ? b.slice() : b), createCanvas: (w, h) => { const c = createCanvas(w, h); return { canvas: c, context: c.getContext('2d') }; }, renderCanvasFactory: 'auto' };
    const note = Object.assign(Shapes.defaultsFor('add'), { type: 'add', id: 1, page: 0, x: ZONE[0] + 4, y: ZONE[1] + 6, text: 'Note ' + SECRET, size: 10 });
    const other = Object.assign(Shapes.defaultsFor('add'), { type: 'add', id: 2, page: 1, x: 72, y: 300, text: 'Annotation publique', size: 12 });
    const w = await save(secretPdf, [note, other], { n: 2, images: {} });
    const r = await EP.read(PDFLib, w.out);
    check('témoin positif : le secret est dans l\'état et la base avant caviardage', r.status === 'ok' && scan(w.out, SECRET).hits.length > 0 && scan(r.base, SECRET).hits.length > 0);
    const doc = DocModel.createDoc({ bytes: r.base, name: 'piege.pdf' });
    const id = PageOps.identity(2); DocModel.initPages(doc, id.pages, id.nextUid);
    DocModel.setEdits ? DocModel.setEdits(doc, r.state.edits) : (doc.edits = r.state.edits);
    DocModel.addEdit(doc, Redact.zoneFromRect(0, ZONE));
    const res = await RedactApply.apply(doc, deps, { dpi: 120 });
    RedactApply.commit(DocModel, doc, res);
    check('après application : la note qui touchait la zone n\'est plus un objet (intégrée à l\'image), l\'autre reste', doc.edits.length === 1 && doc.edits[0].id === 2, doc.edits.map((e) => e.id));
    const report = {};
    const out = await PdfEdit.applyEdits(PDFLib, doc.bytes.slice(), doc.edits, {
      images: {}, measure: doc.measure, pages: { list: doc.pages, sources: doc.sources }, numbering: [], ocr: [], purge: true,
      scrub: Redact.hasRedacted(doc.pages), editable: { numbering: [], nextId: 3 }, onEditable: (o) => Object.assign(report, o),
      clean: { title: true, author: true, subject: true, keywords: true, creator: true, producer: true, dates: true, xmp: true }, // le titre du PDF piège contient le secret
    });
    check('enregistrement demandé en modifiable : forcé en aplati (raison « caviardage »)', report.written === false && report.reason === 'caviardage' && !has(out, '/SpinADocState'));
    check("la note qui contenait le secret n'existe plus nulle part (même hors pages)", scan(out, 'Note ' + SECRET).hits.length === 0);
    check('aucune trace du secret dans le fichier écrit, métadonnées nettoyées (octets bruts, flux décompressés, tous encodages)', scan(out, SECRET).hits.length === 0, scan(out, SECRET).hits.slice(0, 4));
    check('aucun ancien flux dédié ni état dans le fichier écrit', scan(out, 'SpinADoc BMC').hits.length === 0 && scan(out, '"edits"').hits.length === 0);
  }

  console.log('7. Plan A0 vectoriel dense (40 000 traits), 312 objets');
  {
    const a0 = await a0dense();
    const E0 = number(Array.from({ length: 12 }, (_, k) => set(0, 100 + (k % 4) * 520, 100 + Math.floor(k / 4) * 1000, 1.5)).flat());
    const ms = { scales: { 0: Measure.scaleFromRatio(100) }, unit: 'm', precision: 2, include: true };
    const fl = (await save(a0, E0, { n: 1, measure: ms, editable: false })).out;
    let t = Date.now(); const w = await save(a0, E0, { n: 1, measure: ms }); const tw = Date.now() - t;
    t = Date.now(); const r = await EP.read(PDFLib, w.out); const tr = Date.now() - t;
    const again = (await save(r.base, r.state.edits, { n: 1, images: imagesOf(r), measure: r.state.measure, purge: true })).out;
    const rf = await renderAll(fl, 0.5), rw = await renderAll(w.out, 0.5), rb = await renderAll(r.base, 0.5), ra = await renderAll(again, 0.5), ro = await renderAll(a0, 0.5);
    console.log(`        (A0 : ${(a0.length / 1048576).toFixed(2)} Mo ; aplati ${(fl.length / 1048576).toFixed(2)} Mo ; modifiable ${(w.out.length / 1048576).toFixed(2)} Mo, écrit en ${tw} ms ; relu et retiré en ${tr} ms)`);
    check('A0 : modifiable identique à l\'aplati ; base identique au plan d\'origine ; réenregistrement identique', same(diff(rf, rw)) && same(diff(ro, rb)) && same(diff(rw, ra)));
    check('A0 : état restauré à l\'identique, taille du modifiable ≤ aplati + 5 %', r.status === 'ok' && JSON.stringify(r.state.edits) === JSON.stringify(E0) && w.out.length <= fl.length * 1.05, [w.out.length, fl.length]);
  }

  console.log(`\n${passed} vérifications réussies, ${failures.length} échec(s).`);
  if (failures.length) { console.log('Échecs :\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('OK : annotations modifiables (format, écriture, lecture).');
})().catch((e) => { console.error(e); process.exit(1); });
