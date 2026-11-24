// Impression : calculs de mise en page (purs) et assemblage du PDF d'impression (mesures sur le rendu pdf.js, tolérance 0,6 mm).
// Usage : node test/test-print.js
const assert = require('assert');
const PDFLib = require('@cantoo/pdf-lib');
const L = require('../src/print-layout.js');
const C = require('../src/print-compose.js');

const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≠ ${b} (±${tol})`);
const { mm } = L;
const A4 = { w: mm(210), h: mm(297) }, A3p = { w: mm(297), h: mm(420) }, A1 = { w: mm(594), h: mm(841) };

// ------------------------------------------------------------ plages de pages
assert.deepStrictEqual(L.parseRanges('1-3, 5, 8-12', 12).pages, [0, 1, 2, 4, 7, 8, 9, 10, 11]);
assert.deepStrictEqual(L.parseRanges('3-1', 5).pages, [2, 1, 0], 'plage décroissante');
assert.deepStrictEqual(L.parseRanges('2,2,1-2', 5).pages, [1, 0], 'sans doublon');
assert(L.parseRanges('0', 5).error && L.parseRanges('1-9', 5).error && L.parseRanges('a', 5).error && L.parseRanges('', 5).error, 'erreurs');

// ------------------------------------------------------------ échelle et placement
const plan = (pages, o) => L.planSheet(pages, Object.assign({ paperW: 297, paperH: 420, orientation: 'auto', mode: 'fit', center: true }, o));
let p = plan([A4], { mode: 'actual' });
near(p.items[0].scale, 1, 1e-9, 'A4 sur A3 taille réelle');
near(p.sheet.w, mm(297), 1e-6); near(p.sheet.h, mm(420), 1e-6);
near(p.items[0].x, (mm(297) - mm(210)) / 2, 1e-6, 'centré en x'); near(p.items[0].y, (mm(420) - mm(297)) / 2, 1e-6, 'centré en y');
assert(!p.items[0].cropped && !p.items[0].reduced);
p = plan([A4], { mode: 'fit' });
near(p.items[0].scale, Math.min(297 / 210, 420 / 297), 1e-9, 'A4 ajusté sur A3 : agrandi'); assert(p.items[0].enlarged);
p = plan([A4], { mode: 'shrink' });
near(p.items[0].scale, 1, 1e-9, 'réduire seulement : pas d\'agrandissement');
p = plan([A1], { mode: 'fit' });
near(p.items[0].scale, Math.min(297 / 594, 420 / 841), 1e-9, 'A1 ajusté sur A3'); assert(p.items[0].reduced && p.warnings.some((w) => /réduite/.test(w)));
p = plan([A1], { mode: 'shrink' });
near(p.items[0].scale, Math.min(297 / 594, 420 / 841), 1e-9, 'A1 réduit sur A3');
p = plan([A1], { mode: 'actual' });
assert(p.items[0].cropped && p.warnings.some((w) => /coupée/.test(w)), 'A1 à 100 % sur A3 : coupé, avertissement');
p = plan([A4], { mode: 'percent', percent: 50 });
near(p.items[0].scale, 0.5, 1e-9, 'pourcentage');
p = plan([A4], { mode: 'fit', margins: { top: 10, right: 10, bottom: 10, left: 10 } });
near(p.items[0].scale, Math.min((297 - 20) / 210, (420 - 20) / 297), 1e-9, 'marges prises en compte');
p = plan([A4], { mode: 'actual', center: false, margins: { top: 5, right: 5, bottom: 5, left: 5 } });
near(p.items[0].x, mm(5), 1e-6, 'sans centrage : coin haut-gauche de la zone'); near(p.items[0].y + p.items[0].h, mm(420 - 5), 1e-6);
assert(plan([A4], { margins: { top: 300, right: 0, bottom: 300, left: 0 } }).warnings.length === 1, 'marges trop grandes');

// ------------------------------------------------------------ orientation
const land = { w: mm(420), h: mm(297) };
p = plan([land], {});
assert(p.sheet.w > p.sheet.h, 'automatique : page paysage → feuille paysage'); near(p.items[0].scale, 1, 1e-9, 'A3 paysage sur A3 paysage, ajusté = 1');
p = plan([A4], { orientation: 'landscape' });
assert(p.sheet.w > p.sheet.h && p.items[0].rotate === 90, 'paysage imposé : feuille paysage, page tournée');
near(p.items[0].scale, Math.min(420 / 297, 297 / 210), 1e-9, 'paysage imposé : ajustement avec la page tournée');
p = plan([land], { orientation: 'portrait' });
assert(p.sheet.h > p.sheet.w && p.items[0].rotate === 90, 'portrait imposé');

// ------------------------------------------------------------ planches 2 / 4 pages par feuille
p = L.planSheet([A4, A4], { paperW: 297, paperH: 420, nup: 2, mode: 'fit', center: true });
assert(p.sheet.w > p.sheet.h && p.items.length === 2, '2 pages A4 portrait : feuille paysage');
assert(p.items[0].x + p.items[0].w <= p.items[1].x + 1e-6, 'les deux pages ne se chevauchent pas');
p = L.planSheet([A4, A4, A4, A4], { paperW: 297, paperH: 420, nup: 4, mode: 'fit', center: true });
const rects = p.items.map((i) => [i.x, i.y, i.x + i.w, i.y + i.h]);
for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert(rects[i][2] <= rects[j][0] + 1e-6 || rects[j][2] <= rects[i][0] + 1e-6 || rects[i][3] <= rects[j][1] + 1e-6 || rects[j][3] <= rects[i][1] + 1e-6, 'planche de 4 : sans chevauchement');
// groupement par taille de feuille
const g = L.groupBySize([{ sheet: { w: mm(210), h: mm(297) } }, { sheet: { w: mm(210), h: mm(297) } }, { sheet: { w: mm(297), h: mm(420) } }, { sheet: { w: mm(210), h: mm(297) } }]);
assert.deepStrictEqual(g.map((x) => x.sheets.length), [2, 1, 1], 'une tâche par taille de feuille consécutive');
console.log('  ok   mise en page : plages, échelle, orientation, marges, planches');

// ------------------------------------------------------------ exactitude géométrique du PDF d'impression (lue dans les opérateurs, sans pixels)
// Matrices cumulées : CTM de la page (opérateurs cm) × /Matrix du formulaire intégré, appliquées aux extrémités du trait (m / l).
const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
async function exactLine(outBytes) {
  const d = await PDFLib.PDFDocument.load(outBytes);
  let pageTxt = null, form = null;
  for (const [, o] of d.context.enumerateIndirectObjects()) {
    if (!o.contents) continue;
    const t = Buffer.from(PDFLib.decodePDFRawStream(o).decode()).toString('latin1');
    const sub = o.dict.get(PDFLib.PDFName.of('Subtype'));
    if (sub && String(sub) === '/Form') form = { t, m: o.dict.get(PDFLib.PDFName.of('Matrix')).asArray().map((n) => n.asNumber()) };
    else if (/ Do\b/.test(t)) pageTxt = t;
  }
  let ctm = [1, 0, 0, 1, 0, 0], atDo = null; const st = [];
  for (const ln of pageTxt.split('\n')) {
    const t = ln.trim();
    if (t === 'q') st.push(ctm.slice()); else if (t === 'Q') ctm = st.pop() || ctm;
    else if (/ Do$/.test(t)) atDo = ctm.slice();
    else if (/ cm$/.test(t)) ctm = mul(t.split(/\s+/).slice(0, 6).map(Number), ctm);
  }
  const M = mul(form.m, atDo);
  const pts = [...form.t.matchAll(/(-?[\d.]+) (-?[\d.]+) [ml]\n/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const [a, b] = [pts[0], pts[pts.length - 1]].map(([x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]);
  return { len: L.toMm(Math.hypot(b[0] - a[0], b[1] - a[1])), a, b };
}
async function lineDoc(wmm, hmm, rotate) {
  const dd = await PDFLib.PDFDocument.create();
  const pg = dd.addPage([mm(wmm), mm(hmm)]);
  pg.drawLine({ start: { x: mm(20), y: mm(hmm - 30) }, end: { x: mm(120), y: mm(hmm - 30) }, thickness: mm(0.3) });
  if (rotate) pg.setRotation(PDFLib.degrees(rotate));
  return dd.save();
}
async function exactCase(label, wmm, hmm, o, expectLen) {
  const src = await lineDoc(wmm, hmm, o.rot || 0);
  const infos = await C.pageInfos(PDFLib, src);
  const pl = L.planSheet([infos[0]], o);
  const out = await C.compose(PDFLib, src, [{ w: pl.sheet.w, h: pl.sheet.h, items: [Object.assign({ page: 0 }, pl.items[0])] }]);
  const r = await exactLine(out);
  near(r.len, expectLen(pl.items[0]), 1e-6, label + ' : longueur exacte du trait (opérateurs)');
  const sz = (await PDFLib.PDFDocument.load(out)).getPage(0).getSize();
  near(sz.width, pl.sheet.w, 1e-9, label + ' : largeur de page'); near(sz.height, pl.sheet.h, 1e-9, label + ' : hauteur de page');
}
(async () => {
  await exactCase('A4', 210, 297, { paperW: 210, paperH: 297, mode: 'actual', center: true }, () => 100);
  await exactCase('A3', 297, 420, { paperW: 297, paperH: 420, mode: 'actual', center: true }, () => 100);
  await exactCase('A1', 594, 841, { paperW: 594, paperH: 841, mode: 'actual', center: true }, () => 100);
  await exactCase('A1 sur A3 ajusté', 594, 841, { paperW: 297, paperH: 420, mode: 'fit', center: true }, (it) => 100 * it.scale);
  await exactCase('A4 /Rotate 90 sur A3', 210, 297, { paperW: 297, paperH: 420, mode: 'actual', center: true, rot: 90 }, () => 100);
  await exactCase('A4 paysage imposé', 210, 297, { paperW: 297, paperH: 420, orientation: 'landscape', mode: 'actual', center: true }, () => 100);
  console.log('  ok   PDF d\'impression exact (A4, A3, A1, réduit, tourné) : longueur lue dans les opérateurs, sans pixels');
})().catch((e) => { console.error('ÉCHEC (exactitude) :', e); process.exit(1); });

// ------------------------------------------------------------ assemblage : mesures sur le rendu
let pdfjsP = null;
async function renderDark(bytes, pageNo, dpi) {
  pdfjsP = pdfjsP || import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfjs = await pdfjsP;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const page = await doc.getPage(pageNo);
  const vp0 = page.getViewport({ scale: dpi / 72 });
  const W = Math.ceil(vp0.width), H = Math.ceil(vp0.height);
  const cc = doc.canvasFactory.create(W, H);
  cc.context.fillStyle = '#fff'; cc.context.fillRect(0, 0, W, H);
  await page.render({ canvasContext: cc.context, viewport: vp0, canvasFactory: doc.canvasFactory }).promise;
  const img = cc.context.getImageData(0, 0, W, H);
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (img.data[i] < 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  const k = 25.4 / dpi;
  return { w: vp0.width * k, h: vp0.height * k, x0: x0 * k, y0: y0 * k, x1: (x1 + 1) * k, y1: (y1 + 1) * k };
}
// Source : page w × h (mm) avec une équerre : trait horizontal de 100 mm et vertical de 100 mm à 20 mm du bord gauche / 30 mm du haut
async function source(wmm, hmm, rotate) {
  const d = await PDFLib.PDFDocument.create();
  const pg = d.addPage([mm(wmm), mm(hmm)]);
  const top = (y) => mm(hmm - y);
  pg.drawLine({ start: { x: mm(20), y: top(30) }, end: { x: mm(120), y: top(30) }, thickness: mm(0.3) });
  pg.drawLine({ start: { x: mm(20), y: top(30) }, end: { x: mm(20), y: top(130) }, thickness: mm(0.3) });
  if (rotate) pg.setRotation(PDFLib.degrees(rotate));
  return d.save();
}
const TOL = 0.6;
async function check(label, srcBytes, o, expect) {
  const infos = await C.pageInfos(PDFLib, srcBytes);
  const pl = L.planSheet([infos[0]], o);
  const it = pl.items[0];
  const out = await C.compose(PDFLib, srcBytes, [{ w: pl.sheet.w, h: pl.sheet.h, items: [Object.assign({ page: 0 }, it)] }]);
  const r = await renderDark(out, 1, 300);
  near(r.w, L.toMm(pl.sheet.w), 0.05, label + ' : largeur de la feuille'); near(r.h, L.toMm(pl.sheet.h), 0.05, label + ' : hauteur de la feuille');
  const e = expect(pl, it);
  near(r.x1 - r.x0, e.w, TOL, label + ' : largeur du tracé'); near(r.y1 - r.y0, e.h, TOL, label + ' : hauteur du tracé');
  near(r.x0, e.x, TOL, label + ' : position x'); near(r.y0, e.y, TOL, label + ' : position y (depuis le haut)');
  console.log('  ok   ' + label);
}
(async () => {
  const mmOf = (v) => L.toMm(v);
  // équerre dans la page : x 19,85…120,15 ; y(haut) 29,85…130,15 (traits de 0,3 mm)
  const sq = { x: 19.85, y: 29.85, w: 100.3, h: 100.3 };
  const A4s = await source(210, 297, 0);
  // 1. A4 sur A3, taille réelle, centré : trait de 100 mm exact, décalé de (43,5 ; 61,5) mm
  await check('A4 sur A3, taille réelle', A4s, { paperW: 297, paperH: 420, mode: 'actual', center: true }, (pl, it) => ({ w: sq.w, h: sq.h, x: sq.x + 43.5, y: sq.y + 61.5 }));
  // 2. A4 sur A3 ajusté : agrandi
  await check('A4 sur A3, ajusté (×1,414)', A4s, { paperW: 297, paperH: 420, mode: 'fit', center: true }, (pl, it) => ({ w: sq.w * it.scale, h: sq.h * it.scale, x: sq.x * it.scale, y: sq.y * it.scale }));
  // 3. A1 sur A3 ajusté : réduit, vectoriel
  const A1s = await source(594, 841, 0);
  await check('A1 sur A3, ajusté (réduit)', A1s, { paperW: 297, paperH: 420, mode: 'fit', center: true }, (pl, it) => ({ w: sq.w * it.scale, h: sq.h * it.scale, x: it.x ? mmOf(it.x) + sq.x * it.scale : 0, y: (mmOf(pl.sheet.h) - mmOf(it.y) - mmOf(it.h)) + sq.y * it.scale }));
  // 4. A1 sur A3, 50 %
  await check('A1 sur A3, 50 %', A1s, { paperW: 297, paperH: 420, mode: 'percent', percent: 50, center: false }, (pl, it) => ({ w: sq.w * 0.5, h: sq.h * 0.5, x: mmOf(it.x) + sq.x * 0.5, y: (mmOf(pl.sheet.h) - mmOf(it.y) - mmOf(it.h)) + sq.y * 0.5 }));
  // 5. page tournée de 90° (paysage imposé) : équerre tournée, boîte placée connue
  await check('A4 portrait sur A3 paysage imposé (rotation 90°)', A4s, { paperW: 297, paperH: 420, orientation: 'landscape', mode: 'actual', center: true }, (pl, it) => {
    // page (px, py) en mm depuis le coin bas-gauche → feuille : x = it.x + it.w − s·py, y(bas) = it.y + s·px
    const s = it.scale, X = mmOf(it.x), Y = mmOf(it.y), W = mmOf(it.w), Hs = mmOf(pl.sheet.h);
    const pts = [[19.85, 297 - 29.85], [120.15, 297 - 29.85], [19.85, 297 - 130.15], [120.15, 297 - 130.15]].map(([px, py]) => [X + W - s * py, Y + s * px]);
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    return { w: maxX - minX, h: maxY - minY, x: minX, y: Hs - maxY };
  });
  // 6. page source avec /Rotate 90 : affichée tournée, tracé à sa place
  const rot = await source(210, 297, 90);
  await check('A4 avec /Rotate 90 sur A3, taille réelle', rot, { paperW: 297, paperH: 420, mode: 'actual', center: true }, (pl, it) => {
    // page non tournée (W=210, H=297) affichée tournée de 90° horaire : (px, py) → (py, 210 − px) ; affichage 297 × 210
    const X = mmOf(it.x), Y = mmOf(it.y), Hs = mmOf(pl.sheet.h);
    const pts = [[19.85, 297 - 29.85], [120.15, 297 - 29.85], [19.85, 297 - 130.15], [120.15, 297 - 130.15]].map(([px, py]) => [X + py, Y + (210 - px)]);
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), x: Math.min(...xs), y: Hs - Math.max(...ys) };
  });
  // 7. A1 aux dimensions exactes (feuille personnalisée) : taille réelle sur feuille A1
  await check('A1 sur A1, taille réelle (feuille 594 × 841 mm)', A1s, { paperW: 594, paperH: 841, mode: 'actual', center: true }, (pl, it) => ({ w: sq.w, h: sq.h, x: sq.x, y: sq.y }));
  console.log('OK : impression (mise en page et assemblage vectoriel).');
})().catch((e) => { console.error('ÉCHEC :', e); process.exit(1); });

// ------------------------------------------------------------ nom du travail, marges, imprimantes (fonctions pures)
(function names() {
  assert.strictEqual(L.cleanName('C:\\dossier\\1234_56 CLIENT EXEMPLE - PLANS.pdf'), '1234_56 CLIENT EXEMPLE - PLANS', 'chemin et extension retirés');
  assert.strictEqual(L.jobTitle('1234_56 CLIENT EXEMPLE - PLANS.pdf', 0, 1), '1234_56 CLIENT EXEMPLE - PLANS.pdf');
  assert.strictEqual(L.jobTitle('Plan.pdf', 1, 2), 'Plan (2/2).pdf');
  assert.strictEqual(L.jobFileName('Plan.pdf', 0, 2), 'Plan (1-2).pdf', 'pas de « / » dans un nom de fichier');
  assert.strictEqual(L.cleanName('a<b>c:d"e|h?i*j.pdf'), 'a b c d e h i j');
  assert.strictEqual(L.cleanName('Éléphant à l’été — rapport.pdf'), 'Éléphant à l’été — rapport', 'accents conservés');
  assert.strictEqual(L.cleanName('   ...  '), 'Sans titre'); assert.strictEqual(L.cleanName(''), 'Sans titre'); assert.strictEqual(L.cleanName(null), 'Sans titre');
  const long = L.cleanName('x'.repeat(300) + '.pdf');
  assert(long.length <= 90 && long.endsWith('…'), 'nom très long tronqué');
  assert(!/[<>:"/\\|?*…]/.test(L.jobFileName('x'.repeat(300) + '.pdf', 0, 1)), 'nom de fichier sûr');
  assert(L.isPdfPrinter('PDFCreator') && L.isPdfPrinter('Microsoft Print to PDF') && L.isPdfPrinter('SpinADoc Test PDF') && !L.isPdfPrinter('\\\\serveur\\imprimante'));
  assert.strictEqual(L.normMargin('', 2), 2, 'champ vide : valeur précédente'); assert.strictEqual(L.normMargin('abc', 3), 3); assert.strictEqual(L.normMargin('-1', 3), 3);
  assert.strictEqual(L.normMargin('2,5', 0), 2.5); assert.strictEqual(L.normMargin('0', 2), 0, '0 est une valeur valide'); assert.strictEqual(L.normMargin('500', 2), 2);
  assert.strictEqual(L.defaultMargin(null), 2); assert.strictEqual(L.defaultMargin(0), 2); assert.strictEqual(L.defaultMargin(4.2), 4.2, 'jamais sous la marge matérielle');
  // coupe due à la marge matérielle : A4 ajusté avec 2 mm de marge sur une imprimante à 4,2 mm
  const pp = L.planSheet([A4], { paperW: 210, paperH: 297, mode: 'fit', center: true, margins: { top: 2, right: 2, bottom: 2, left: 2 } });
  near(L.hardwareCut(pp.sheet, pp.items, 4.2).cutMm, 2.2, 0.11, 'coupe annoncée en mm');
  assert.strictEqual(L.hardwareCut(pp.sheet, pp.items, 1.5).cutMm, 0, 'marge suffisante : rien de coupé');
  assert.strictEqual(L.hardwareCut(pp.sheet, pp.items, null).cutMm, 0);
  console.log('  ok   nom du travail, marge par défaut / saisie, imprimantes PDF, coupe matérielle');
})();

// ------------------------------------------------------------ 1.3.1 : options passées au pilote (orientation, format) et journal d'impression
// Matrice A4 / A3 / A2 × page portrait / paysage × /Rotate source 0 / 90 × orientation envoyée auto / portrait / paysage × 1 / 2 pages par
// feuille : PDF composé (MediaBox = feuille exacte, aucun /Rotate) et options calculées (pageSize toujours en portrait, landscape selon la feuille
// ou imposé, dimensions exactes du papier annoncé). Aucune impression.
(async function printOptionsMatrix() {
  const mm = L.mm;
  const PL = require('../src/print-log.js');
  const caps = { papers: [{ name: 'A4', w: 210, h: 297 }, { name: 'A3 (exact pilote)', w: 296.9, h: 420.1 }, { name: 'Letter', w: 215.9, h: 279.4 }] }; // pas d'A2 annoncé
  const formats = { A4: [210, 297], A3: [297, 420], A2: [420, 594] };
  let n = 0;
  for (const [fname, [pw, ph]] of Object.entries(formats)) {
    for (const srcLand of [false, true]) {
      for (const rot of [0, 90]) {
        // page source : w × h (mm) avant /Rotate ; affichée paysage si (srcLand XOR rotation 90)
        const d = await PDFLib.PDFDocument.create();
        for (let k = 0; k < 2; k++) {
          const pg = d.addPage(srcLand ? [mm(ph), mm(pw)] : [mm(pw), mm(ph)]);
          pg.drawLine({ start: { x: 20, y: 20 }, end: { x: 120, y: 20 }, thickness: 1 });
          if (rot) pg.setRotation(PDFLib.degrees(rot));
        }
        const src = await d.save();
        const infos = await C.pageInfos(PDFLib, src);
        const shownLand = srcLand !== (rot === 90);
        for (const nup of [1, 2]) {
          const pl = L.planSheet(nup === 1 ? [infos[0]] : [infos[0], infos[1]], { paperW: pw, paperH: ph, orientation: 'auto', mode: 'fit', center: true, nup });
          const sheetLand = pl.sheet.w > pl.sheet.h;
          const label = `${fname} ${srcLand ? 'paysage' : 'portrait'} /Rotate ${rot} ${nup} p./feuille`;
          assert.strictEqual(sheetLand, nup === 1 ? shownLand : !shownLand, label + ' : orientation de la feuille composée');
          const out = await PDFLib.PDFDocument.load(await C.compose(PDFLib, src, [{ w: pl.sheet.w, h: pl.sheet.h, items: pl.items.map((it, i) => Object.assign({ page: i }, it)) }]));
          const op = out.getPages()[0];
          const mb = op.getMediaBox();
          assert.ok(Math.abs(mb.x) < 1e-6 && Math.abs(mb.y) < 1e-6 && Math.abs(mb.width - pl.sheet.w) < 0.01 && Math.abs(mb.height - pl.sheet.h) < 0.01, label + ' : MediaBox = feuille exacte');
          assert.ok(!op.node.get(PDFLib.PDFName.of('Rotate')) && op.getRotation().angle === 0, label + ' : aucun /Rotate sur la feuille composée');
          const job = { wMm: L.toMm(pl.sheet.w), hMm: L.toMm(pl.sheet.h) };
          for (const orient of ['auto', 'portrait', 'landscape']) {
            const r = L.printOptions(job, { device: 'SpinADoc Test PDF', copies: 3, collate: true, color: false, duplex: 'longEdge', orient }, caps);
            const o = r.options;
            const want = orient === 'auto' ? sheetLand : orient === 'landscape';
            assert.strictEqual(o.landscape, want, `${label}, envoi ${orient} : landscape`);
            assert.ok(o.pageSize.width < o.pageSize.height, `${label}, envoi ${orient} : pageSize en portrait`);
            const exp = fname === 'A2' ? [420000, 594000] : fname === 'A3' ? [296900, 420100] : [210000, 297000];
            assert.deepStrictEqual([o.pageSize.width, o.pageSize.height], exp, `${label} : pageSize (papier annoncé exact, sinon format standard)`);
            assert.strictEqual(r.format, fname, label + ' : format reconnu');
            assert.strictEqual(r.paper, fname === 'A2' ? null : fname === 'A3' ? 'A3 (exact pilote)' : 'A4', label + ' : papier annoncé');
            assert.strictEqual(r.sheet, sheetLand ? 'paysage' : 'portrait');
            assert.strictEqual(r.forced, orient);
            assert.deepStrictEqual([o.silent, o.deviceName, o.printBackground, o.margins.marginType, o.copies, o.collate, o.color, o.duplexMode], [true, 'SpinADoc Test PDF', true, 'none', 3, true, false, 'longEdge'], label + ' : options conservées');
            n++;
          }
        }
      }
    }
  }
  // formats mélangés : une tâche par taille de feuille, chacune avec SA bonne orientation
  const sheets = [[210, 297, false], [297, 420, true], [297, 420, true], [210, 297, false]].map(([w, h, land]) => ({ sheet: L.sheetSize(w, h, land) }));
  const groups = L.groupBySize(sheets);
  assert.deepStrictEqual(groups.map((g) => g.sheets.length), [1, 2, 1], 'formats mélangés : A4 / A3 paysage ×2 / A4');
  const og = groups.map((g) => L.printOptions({ wMm: L.toMm(g.w), hMm: L.toMm(g.h) }, {}, null));
  assert.deepStrictEqual(og.map((r) => [r.format, r.landscape, r.options.pageSize.width, r.options.pageSize.height]), [['A4', false, 210000, 297000], ['A3', true, 297000, 420000], ['A4', false, 210000, 297000]], 'formats mélangés : options par tâche');
  // tolérance ±1 mm, format personnalisé, valeurs par défaut
  assert.strictEqual(L.standardFormat(216, 279), 'Letter');
  assert.strictEqual(L.standardFormat(211, 298), 'A4');
  assert.strictEqual(L.standardFormat(212.5, 297), null, 'hors tolérance : personnalisé');
  const cu = L.printOptions({ wMm: 900, hMm: 600 }, { device: 'x' }, caps);
  assert.deepStrictEqual([cu.format, cu.paper, cu.landscape, cu.options.pageSize.width, cu.options.pageSize.height, cu.options.copies, cu.options.duplexMode, cu.options.color], [null, null, true, 600000, 900000, 1, 'simplex', true], 'taille personnalisée paysage');
  const dlg = L.printOptions({ wMm: 210, hMm: 297 }, { dialog: true }, null);
  assert.strictEqual(dlg.options.silent, false, 'boîte Windows : silent false');
  // journal : une ligne, sans nom de fichier, rotation à 200 lignes
  const line = PL.line({ date: new Date(2026, 10, 23, 9, 5, 7), printer: 'Traceur de test', wMm: 420, hMm: 297, plan: L.printOptions({ wMm: 420, hMm: 297 }, { device: 'Traceur de test', orient: 'auto' }, caps), result: 'envoyé' });
  assert.ok(line.startsWith("2026-11-23 09:05:07 | Traceur de test | 420 × 297 mm | paysage (automatique), feuille paysage | format A3 (annoncé par l'imprimante : « A3 (exact pilote) ») | options {") && line.endsWith('} | résultat : envoyé') && line.includes('"landscape":true') && line.includes('"pageSize":{"width":296900,"height":420100}'), line);
  let text = '';
  for (let i = 0; i < 230; i++) text = PL.append(text, 'ligne ' + i);
  const lines = text.trim().split('\n');
  assert.strictEqual(lines.length, PL.MAX, 'journal limité à 200 lignes');
  assert.strictEqual(lines[0], 'ligne 30'); assert.strictEqual(lines[199], 'ligne 229');
  assert.ok(!/\n/.test(PL.append('', 'a\nb').trim()), 'une entrée = une ligne');
  console.log(`  ok   options d'impression : matrice ${n} cas (A4/A3/A2 × portrait/paysage × /Rotate 90 × envoi auto/portrait/paysage × 1/2 p.), formats mélangés, ±1 mm, journal`);
})().catch((e) => { console.error('ÉCHEC (options d\'impression) :', e); process.exit(1); });

// ------------------------------------------------------------ 1.3.1 (correctif du 24/11) : méthode d'envoi du format au pilote
// Electron 33 / Chromium 130 n'écrivent le code de papier Windows (dmPaperSize) que si mediaSize.vendor_id est un code < 256 ; sinon largeur /
// longueur seulement, que beaucoup de pilotes de copieurs ignorent (papier par défaut, A4). Matrice : formats A5 … A0, Letter, Legal, Tabloid ×
// portrait / paysage × méthode auto / custom / driver × orientation envoyée auto / portrait / paysage × imprimante type copieur (codes < 256,
// pas d'A2-A0) / capacités inconnues / traceur (codes du pilote ≥ 256). La sortie est un objet d'options : aucune impression.
(function paperMethodMatrix() {
  const PL = require('../src/print-log.js');
  const copier = { papers: [{ name: 'Lettre', w: 215.9, h: 279.4, kind: 1 }, { name: '11x17', w: 279.4, h: 431.8, kind: 17 }, { name: 'Légal', w: 215.9, h: 355.6, kind: 5 },
    { name: 'A5', w: 148.1, h: 210.1, kind: 11 }, { name: 'Personnalisé [Nom fixe]', w: 210.1, h: 296.9, kind: 256 }, { name: 'A4', w: 210.1, h: 296.9, kind: 9 },
    { name: 'A3', w: 296.9, h: 420.1, kind: 8 }], defaultPaper: { name: 'A4', w: 210.1, h: 296.9, kind: 9 } };
  const plotter = { papers: [['A0', 841, 1189, 261], ['A1', 594.1, 841, 262], ['A2', 420.1, 594.1, 263], ['A3', 296.9, 420.1, 264], ['A4', 210.1, 296.9, 265]].map(([name, w, h, kind]) => ({ name, w, h, kind })),
    defaultPaper: { name: 'A0', w: 841, h: 1189, kind: 261 } };
  const profiles = { copieur: copier, inconnues: null, traceur: plotter };
  const copierCode = { A3: 8, A4: 9, A5: 11, Letter: 1, Legal: 5, Tabloid: 17 };
  const copierDims = { A3: [296.9, 420.1], A4: [210.1, 296.9], A5: [148.1, 210.1], Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8] };
  const plotDims = { A0: [841, 1189], A1: [594.1, 841], A2: [420.1, 594.1], A3: [296.9, 420.1], A4: [210.1, 296.9] };
  let n = 0;
  for (const f of L.STD_FORMATS) {
    const [fw, fh] = L.PAPERS[f];
    for (const land of [false, true]) {
      const job = land ? { wMm: fh, hMm: fw } : { wMm: fw, hMm: fh };
      for (const [prof, caps] of Object.entries(profiles)) {
        for (const method of L.PAPER_METHODS) {
          for (const orient of ['auto', 'portrait', 'landscape']) {
            const label = `${f} ${land ? 'paysage' : 'portrait'}, ${prof}, ${method}, envoi ${orient}`;
            const r = L.printOptions(job, { device: 'SpinADoc Test PDF', copies: 2, collate: true, color: true, duplex: 'simplex', orient, paperMethod: method }, caps);
            assert.strictEqual(r.landscape, orient === 'auto' ? land : orient === 'landscape', label + ' : landscape');
            assert.strictEqual(r.method, method, label + ' : méthode demandée');
            assert.strictEqual(r.format, f, label + ' : format reconnu');
            // attendu
            let applied = 'custom', code = null;
            let dims = prof === 'copieur' && copierDims[f] ? copierDims[f] : prof === 'traceur' && plotDims[f] ? plotDims[f] : [fw, fh];
            if (method === 'auto') {
              if (prof === 'copieur' && copierCode[f]) { applied = 'code'; code = copierCode[f]; }
              if (prof === 'inconnues' && L.DMPAPER[f]) { applied = 'code'; code = L.DMPAPER[f]; }
            } else if (method === 'driver' && caps) { applied = 'driver'; code = prof === 'copieur' ? 9 : null; dims = prof === 'copieur' ? [210.1, 296.9] : [841, 1189]; }
            assert.strictEqual(r.applied, applied, label + ' : méthode appliquée');
            assert.strictEqual(r.code, code, label + ' : code de papier');
            const W = Math.round(dims[0] * 1000), H = Math.round(dims[1] * 1000);
            assert.deepStrictEqual([r.options.pageSize.width, r.options.pageSize.height], [W, H], label + ' : pageSize (repli, portrait)');
            assert.deepStrictEqual([r.media.width_microns, r.media.height_microns, r.media.imageable_area_right_microns, r.media.imageable_area_top_microns, r.media.imageable_area_left_microns], [W, H, W, H, 0], label + ' : mediaSize');
            assert.strictEqual(r.media.vendor_id, code ? String(code) : undefined, label + ' : vendor_id');
            const si = L.sendArgs(r, true);
            assert.strictEqual(si.api, 'interne');
            assert.ok(!('pageSize' in si.args) && si.args.mediaSize.vendor_id === r.media.vendor_id && si.args.landscape === r.landscape, label + ' : appel interne (mediaSize avec code, sans pageSize)');
            assert.deepStrictEqual([si.args.silent, si.args.deviceName, si.args.copies, si.args.collate, si.args.color, si.args.duplexMode, si.args.margins.marginType], [true, 'SpinADoc Test PDF', 2, true, true, 'simplex', 'none'], label + ' : options conservées');
            assert.notStrictEqual(si.args.mediaSize, r.media, 'mediaSize copié (Electron ne modifie pas le plan)');
            const sp = L.sendArgs(r, false);
            assert.ok(sp.api === 'publique' && !('mediaSize' in sp.args) && sp.args.pageSize.width === W, label + ' : repli API publique');
            assert.strictEqual(sp.applied, applied === 'code' ? 'custom' : applied, label + ' : repli = code perdu');
            const t = L.sendText(r);
            const o = r.landscape ? 'paysage' : 'portrait';
            if (applied === 'code') assert.ok(t.startsWith('Envoi : ') && t.includes(`code ${code}), ${o}`), label + ' : ' + t);
            else if (applied === 'driver') assert.ok(t.startsWith('Envoi : papier par défaut du pilote (') && t.endsWith(o), label + ' : ' + t);
            else assert.ok(/^Envoi : taille personnalisée [\d,]+ × [\d,]+ mm, (portrait|paysage)$/.test(t) && t.endsWith(o), label + ' : ' + t);
            n++;
          }
        }
      }
    }
  }
  assert.strictEqual(n, 9 * 2 * 3 * 3 * 3);
  // cas du 24/11 : A3 paysage sur le copieur → code 8, paysage ; dimensions exactes du papier annoncé
  const a3 = L.printOptions({ wMm: 420, hMm: 297 }, { device: 'copieur' }, copier);
  assert.deepStrictEqual([a3.applied, a3.code, a3.codeFrom, a3.landscape, a3.media.vendor_id, a3.media.width_microns, a3.media.height_microns], ['code', 8, 'imprimante', true, '8', 296900, 420100]);
  assert.strictEqual(L.sendText(a3), "Envoi : A3 (papier de l'imprimante, code 8), paysage");
  assert.strictEqual(L.sendText(L.printOptions({ wMm: 420, hMm: 297 }, { paperMethod: 'custom' }, null)), 'Envoi : taille personnalisée 420 × 297 mm, paysage');
  assert.strictEqual(L.sendText(L.printOptions({ wMm: 420, hMm: 297 }, {}, null)), 'Envoi : A3 (format standard, code 8), paysage');
  // préférence : parmi les papiers de mêmes dimensions, celui dont le code est transmissible (« Personnalisé » #256 avant A4 #9 dans la liste)
  assert.strictEqual(L.announcedPaper(copier, 210, 297).kind, 9);
  // papier annoncé sans code (capacités d'une ancienne version, imprimantes simulées) → code standard
  const nok = L.printOptions({ wMm: 297, hMm: 420 }, {}, { papers: [{ name: 'A3', w: 297, h: 420 }] });
  assert.deepStrictEqual([nok.applied, nok.code, nok.codeFrom], ['code', 8, 'standard']);
  // méthode inconnue → auto ; taille libre → personnalisée ; codes hors bornes refusés
  assert.strictEqual(L.printOptions({ wMm: 300, hMm: 500 }, { paperMethod: 'xyz' }, copier).method, 'auto');
  assert.strictEqual(L.printOptions({ wMm: 300, hMm: 500 }, {}, null).applied, 'custom');
  assert.deepStrictEqual([0, 256, -3, 8.5, '8', 255].map(L.paperCode), [null, null, null, null, null, 255]);
  // journal : méthode demandée et appliquée, envoi exact, capacités (état, durée, papiers tronqués à 40), aucun nom de fichier
  const many = Array.from({ length: 45 }, (_, i) => ({ name: 'P' + i, w: 100 + i, h: 200 + i, kind: 300 + i }));
  const capsL = { papers: copier.papers.concat(many), defaultPaper: copier.defaultPaper };
  const plan = L.printOptions({ wMm: 420, hMm: 297 }, { device: 'Copieur de test' }, capsL);
  const sent = L.sendArgs(plan, true);
  const line = PL.line({ date: new Date(2026, 10, 24, 8, 21, 8), printer: 'Copieur de test', wMm: 420, hMm: 297, plan, sent, send: L.sendText(plan, sent.applied), caps: { status: 'ok', ms: 117, papers: capsL.papers }, result: 'envoyé' });
  for (const s of ['| méthode automatique, appliquée : code de papier (API interne) |', "| Envoi : A3 (papier de l'imprimante, code 8), paysage |", '"vendor_id":"8"', '"landscape":true', '"width_microns":296900,"height_microns":420100',
    '| capacités : lues en 117 ms |', 'papiers annoncés (52) : Lettre 215,9 × 279,4 mm #1 ;', 'A3 296,9 × 420,1 mm #8', ' ; … (+12) |', '| résultat : envoyé']) assert.ok(line.includes(s), 'journal : ' + s + '\n' + line);
  assert.ok(!line.includes('"pageSize"') && !line.includes('P33 '), 'journal : arguments réellement envoyés, 40 papiers au plus');
  const lineP = PL.line({ date: new Date(), printer: 'x', wMm: 420, hMm: 297, plan, sent: L.sendArgs(plan, false), send: 'Envoi : …', caps: { status: 'expiré', ms: 15000, papers: [] }, result: 'envoyé' });
  assert.ok(lineP.includes('appliquée : taille personnalisée (API publique)') && lineP.includes('"pageSize":{"width":296900') && lineP.includes('capacités : délai dépassé en 15 s (aucun papier connu) | papiers annoncés (0) : aucun'), lineP);
  assert.ok(PL.capsText({ status: 'échec', ms: 40 }) === 'capacités : échec de la lecture en 40 ms' && PL.capsText(null) === 'capacités : non lues' && PL.capsText({ status: 'test' }) === 'capacités : imprimante de test');
  console.log(`  ok   méthode d'envoi du format : matrice ${n} cas (9 formats × portrait/paysage × copieur/inconnues/traceur × auto/custom/driver × envoi auto/portrait/paysage), API interne / publique, texte « Envoi », journal`);
})();
