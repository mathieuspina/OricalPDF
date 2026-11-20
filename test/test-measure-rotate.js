// Mesures sur pages pivotées (1.0.2) : texte TOUJOURS lisible sur la page AFFICHÉE (angle de lecture dans ]−90°, 90°], comme dans AutoCAD),
// valeur de la Cote toujours au-dessus de sa ligne de cote, aperçu (primitives avec la rotation de la page, comme render.js) = PDF écrit (relu
// avec pdf.js) à ±0,2 mm. Rotations 0, 90, 180, 270 par les DEUX chemins : /Rotate d'origine du PDF et rotation faite dans l'application
// (onglet Pages / Accueil : doc.pages[].rot, appliquée par buildPages). Cas réel : plan pivoté, Distance horizontale et Cote en biais à l'envers.
// Usage : node test/test-measure-rotate.js
const path = require('path');
const PDFLib = require('@cantoo/pdf-lib');
const Shapes = require('../src/shapes.js');
const Measure = require('../src/measure.js');
const PdfEdit = require('../src/pdf-edit.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };
const D2R = Math.PI / 180;
const MM = Measure.MM_PER_PT; // mm par point
const TOL_PT = 0.2 / MM;     // 0,2 mm en points
const norm180 = (deg) => { let d = deg % 360; if (d <= -180) d += 360; if (d > 180) d -= 360; return d; };
const readable = (deg) => deg > -90 + 1e-6 && deg <= 90 + 1e-6; // angle de lecture sur la page affichée
const ROTS = [0, 90, 180, 270];
// 8 directions (4 quadrants, axes) + angles limites autour de ±90° et 0 / 180°
const DIRS = [0, 45, 90, 135, 180, -135, -90, -45, 89.99, 90.01, -89.99, -90.01, 0.01, -0.01, 179.99, -179.99];
const ctx = { scales: {}, unit: 'm', precision: 2 };
const fakeMeasure = (f, t, s) => t.length * s * 0.5;
const obj = (type, A, B, extra) => Object.assign(Shapes.defaultsFor(type), { id: 1, page: 0, type, points: [A, B] }, extra || {});
// direction « écran » (degrés, repère de la page affichée, y vers le haut) → point B dans le repère PDF (affichage = PDF − rot)
const along = (A, dispDeg, rot, L) => [A[0] + L * Math.cos((dispDeg + rot) * D2R), A[1] + L * Math.sin((dispDeg + rot) * D2R)];
const textsOf = (prims) => prims.filter((p) => p.kind === 'text');
const dispAngle = (p, rot) => norm180(p.rot - rot);
// centre du texte (repère PDF) à partir de la primitive : origine + w/2 le long, + 0,36 corps vers le haut du texte
const centerOf = (p, w) => { const a = p.rot * D2R; return [p.x + Math.cos(a) * w / 2 - Math.sin(a) * p.size * 0.36, p.y + Math.sin(a) * w / 2 + Math.cos(a) * p.size * 0.36]; };
// ligne de cote (repère PDF)
const dimLine = (o) => { const [A, B] = o.points; const a = Math.atan2(B[1] - A[1], B[0] - A[0]), nx = -Math.sin(a), ny = Math.cos(a), d = o.offset; return [[A[0] + nx * d, A[1] + ny * d], [B[0] + nx * d, B[1] + ny * d]]; };
// distance signée du centre du texte à la ligne de cote, comptée vers le HAUT du texte (positive = au-dessus de la ligne pour le lecteur)
const aboveBy = (p, w, o) => { const c = centerOf(p, w), [L0] = dimLine(o), a = p.rot * D2R; return (c[0] - L0[0]) * -Math.sin(a) + (c[1] - L0[1]) * Math.cos(a); };

// ------------------------------------------------------------------ 1. logique : readableAngle (4 quadrants, limites)
{
  const bad = [];
  for (const rot of ROTS) for (const dir of DIRS) {
    const r = Measure.readableAngle((dir + rot) * D2R, rot) / D2R; // une ligne de direction écran `dir`
    const disp = norm180(r - rot);
    const sameLine = Math.abs(norm180(r - (dir + rot))) < 1e-6 || Math.abs(Math.abs(norm180(r - (dir + rot))) - 180) < 1e-6;
    if (!readable(disp) || !sameLine) bad.push({ rot, dir, r, disp });
  }
  check('readableAngle : 4 rotations × 16 directions (quadrants, ±90°, 0°, 180° et voisins) → lecture dans ]−90°, 90°], le long du trait', !bad.length, bad.slice(0, 5));
  const lim = ROTS.map((rot) => [0, 180, 90, -90].map((dir) => Math.round(norm180(Measure.readableAngle((dir + rot) * D2R, rot) / D2R - rot))));
  check('angles limites : 0° → 0°, 180° → 0°, 90° → 90°, −90° → 90° (vertical lu de bas en haut), sur chaque rotation', lim.every((l) => l.join() === '0,0,90,90'), lim);
}

// ------------------------------------------------------------------ 2. logique : chaque objet de mesure avec texte, chaque rotation, chaque direction
{
  const bad = { dist: [], dim: [], dimAbove: [], poly: [], horiz: [], delta: [] };
  for (const rot of ROTS) {
    const sc = { measure: ctx, pageRot: rot };
    for (const dir of DIRS) {
      const A = [300, 400], B = along(A, dir, rot, 150);
      const pd = textsOf(Shapes.primitives(obj('m-dist', A, B), fakeMeasure, sc));
      if (!pd.length || !pd.every((p) => readable(dispAngle(p, rot)))) bad.dist.push({ rot, dir, a: pd.map((p) => dispAngle(p, rot)) });
      for (const offset of [20, -30]) {
        const o = obj('m-dim', A, B, { offset });
        const [t] = textsOf(Shapes.primitives(o, fakeMeasure, sc));
        if (!readable(dispAngle(t, rot))) bad.dim.push({ rot, dir, offset, a: dispAngle(t, rot) });
        const w = fakeMeasure('', t.text, t.size), up = aboveBy(t, w, o);
        if (!(up > t.size * 0.5 && up < t.size * 1.2)) bad.dimAbove.push({ rot, dir, offset, up: +up.toFixed(2) });
      }
      const pp = textsOf(Shapes.primitives(Object.assign(obj('m-poly', A, B), { points: [A, B, along(B, dir + 60, rot, 80)], showSegments: true }), fakeMeasure, sc));
      if (!pp.every((p) => readable(dispAngle(p, rot)))) bad.poly.push({ rot, dir });
      // dX / dY (Distance) : dX horizontal, dY vertical sur la page affichée
      const pdx = textsOf(Shapes.primitives(obj('m-dist', A, B, { showDelta: true }), fakeMeasure, sc));
      const dX = pdx.find((p) => /^dX /.test(p.text)), dY = pdx.find((p) => /^dY /.test(p.text));
      if (dX && (Math.abs(dispAngle(dX, rot)) > 1e-6 || Math.abs(dispAngle(dY, rot) - 90) > 1e-6)) bad.delta.push({ rot, dir, dX: dispAngle(dX, rot), dY: dispAngle(dY, rot) });
    }
    // surface, angle, cercle : étiquette horizontale sur la page affichée
    const horiz = [
      Object.assign(obj('m-area', [100, 100], [300, 100]), { points: [[100, 100], [300, 100], [300, 250], [100, 250]] }),
      Object.assign(obj('m-angle', [200, 400], [150, 400]), { points: [[200, 400], [150, 400], [150, 450]] }),
      Object.assign(obj('m-circle', [400, 300], [350, 350]), { points: [[400, 300], [350, 350], [300, 300]] }),
    ];
    for (const o of horiz) for (const p of textsOf(Shapes.primitives(o, fakeMeasure, sc))) if (Math.abs(dispAngle(p, rot)) > 1e-6) bad.horiz.push({ rot, type: o.type, a: dispAngle(p, rot) });
    // cercle : valeur SOUS le centre à l'écran (direction écran −90°)
    const ci = textsOf(Shapes.primitives(horiz[2], fakeMeasure, sc))[0], cc = Measure.circumcircle(...horiz[2].points);
    const cw = fakeMeasure('', ci.text, ci.size), cen = centerOf(ci, cw), down = [Math.cos((-90 + rot) * D2R), Math.sin((-90 + rot) * D2R)];
    if (!((cen[0] - cc.cx) * down[0] + (cen[1] - cc.cy) * down[1] > ci.size)) bad.horiz.push({ rot, circle: 'valeur pas sous le centre' });
  }
  check('Distance : texte lisible, 4 rotations × 16 directions', !bad.dist.length, bad.dist.slice(0, 4));
  check('Cote : texte lisible, 4 rotations × 16 directions × décalage + / −', !bad.dim.length, bad.dim.slice(0, 4));
  check('Cote : valeur au-dessus de la ligne de cote pour le lecteur (0,5 à 1,2 corps), même tracée de droite à gauche ou de haut en bas', !bad.dimAbove.length, bad.dimAbove.slice(0, 4));
  check('Polyligne (valeur totale et longueurs des segments) : lisible', !bad.poly.length, bad.poly.slice(0, 4));
  check('Distance dX / dY : dX horizontal et dY vertical sur la page affichée', !bad.delta.length, bad.delta.slice(0, 4));
  check('Surface, Angle, Cercle : valeur horizontale sur la page affichée ; Cercle : valeur sous le centre', !bad.horiz.length, bad.horiz.slice(0, 4));
  const r0 = textsOf(Shapes.primitives(obj('m-dist', [100, 100], [200, 160]), fakeMeasure, { measure: ctx }));
  const r1 = textsOf(Measure.primitives(obj('m-dist', [100, 100], [200, 160]), fakeMeasure, ctx));
  check('sans rotation (pageRot absent) : résultat inchangé', JSON.stringify(r0) === JSON.stringify(r1));
}

// ------------------------------------------------------------------ 3. PDF écrit, relu avec pdf.js : aperçu = écriture, lisible sur la page affichée
let pdfjsP = null;
async function load(bytes) {
  pdfjsP = pdfjsP || import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfjs = await pdfjsP;
  const fontDir = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'standard_fonts').split('\\').join('/') + '/';
  return pdfjs.getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: fontDir, verbosity: 0 }).promise;
}

(async () => {
  const W = 842, Hh = 595; // plan A4 paysage
  const mk = async (rots) => { const d = await PDFLib.PDFDocument.create(); for (const r of rots) { const p = d.addPage([W, Hh]); if (r) p.setRotation(PDFLib.degrees(r)); } return d.save(); };
  const native = await mk(ROTS);       // page k : /Rotate ROTS[k] d'origine
  const plain = await mk([0, 0, 0, 0]); // page k : pivotée dans l'application (doc.pages[k].rot)
  const measure = Shapes.makeMeasure(PDFLib);
  const mctx = { scales: { 0: Measure.scaleFromRatio(50), 1: Measure.scaleFromRatio(50), 2: Measure.scaleFromRatio(50), 3: Measure.scaleFromRatio(50) }, unit: 'm', precision: 2 };
  // Cas réel : Distance horizontale à l'écran (tracée dans les deux sens) et Cote en biais (montante et descendante), sur chaque page.
  const C = [W / 2, Hh / 2];
  const edits = [];
  ROTS.forEach((rot, k) => {
    const add = (type, A, B, extra) => edits.push(Object.assign(Shapes.defaultsFor(type), { id: edits.length + 1, page: k, type, points: [A, B] }, extra || {}));
    add('m-dist', C, along(C, 0, rot, 200));                                                                                   // gauche → droite à l'écran
    add('m-dist', along(along(C, -90, rot, 80), 0, rot, 200), along(C, -90, rot, 80));                                         // droite → gauche
    add('m-dim', along(C, 90, rot, 90), along(along(C, 90, rot, 90), 150, rot, 180), { offset: 25 });                         // en biais, vers le haut à gauche
    add('m-dim', along(C, 180, rot, 150), along(along(C, 180, rot, 150), -60, rot, 160), { offset: 25 });                     // en biais, vers le bas à droite
  });
  const prev = (e, rot) => textsOf(Shapes.primitives(e, measure, { measure: mctx, pageRot: rot })); // aperçu (render.js : pageRot = /Rotate + rot de la page)
  for (const [label, bytes, pages] of [
    ['/Rotate d\'origine', native, null],
    ['rotation dans l\'application (onglet Pages / Accueil)', plain, { list: ROTS.map((rot, i) => ({ u: 'p' + i, src: '0', i, rot, crop: null })), sources: {} }],
  ]) {
    const out = await PdfEdit.applyEdits(PDFLib, bytes, edits, { measure: mctx, pages });
    const pdf = await load(out);
    for (let k = 0; k < ROTS.length; k++) {
      const rot = ROTS[k];
      const page = await pdf.getPage(k + 1);
      const vp = page.getViewport({ scale: 1 });
      const items = (await page.getTextContent()).items.filter((i) => i.str.trim());
      const mine = edits.filter((e) => e.page === k);
      const exp = mine.flatMap((e) => prev(e, rot).map((p) => ({ e, p })));
      const errs = [];
      check(`${label}, page pivotée de ${rot}° : /Rotate écrit = ${rot}`, page.rotate === rot, page.rotate);
      for (const { e, p } of exp) {
        const it = items.find((i) => i.str === p.text && Math.hypot(i.transform[4] - p.x, i.transform[5] - p.y) < 5);
        if (!it) { errs.push({ manque: p.text, type: e.type }); continue; }
        const [a, b, , , x, y] = it.transform;
        const ang = Math.atan2(b, a) / D2R;
        const w = measure('Helvetica', p.text, p.size);
        const end = (X, Y, deg) => [X + Math.cos(deg * D2R) * w, Y + Math.sin(deg * D2R) * w];
        const e1 = end(x, y, ang), e0 = end(p.x, p.y, p.rot);
        const dOrig = Math.hypot(x - p.x, y - p.y), dEnd = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]);
        // lecture sur la page affichée par pdf.js (viewport avec /Rotate) : y vers le bas → angle = atan2(−dy, dx)
        const [vx0, vy0] = vp.convertToViewportPoint(x, y), [vx1, vy1] = vp.convertToViewportPoint(...e1);
        const read = Math.atan2(-(vy1 - vy0), vx1 - vx0) / D2R;
        if (dOrig > TOL_PT || dEnd > TOL_PT) errs.push({ type: e.type, text: p.text, ecart_mm: +(Math.max(dOrig, dEnd) * MM).toFixed(3) });
        if (!readable(read)) errs.push({ type: e.type, text: p.text, lecture: +read.toFixed(2) });
        if (e.type === 'm-dim') {
          // au-dessus de la ligne de cote, sur la page affichée : côté « haut » du texte lu par pdf.js
          const [L0, L1] = dimLine(e).map((q) => vp.convertToViewportPoint(...q));
          const cen = vp.convertToViewportPoint(...centerOf({ x, y, rot: ang, size: p.size }, w));
          const ux = (vx1 - vx0) / w, uy = (vy1 - vy0) / w, upx = uy, upy = -ux; // haut du texte à l'écran (y vers le bas)
          const lx = L1[0] - L0[0], ly = L1[1] - L0[1], ll = Math.hypot(lx, ly);
          const side = ((cen[0] - L0[0]) * -ly + (cen[1] - L0[1]) * lx) / ll * Math.sign(-ly * upx + lx * upy);
          if (!(side > p.size * 0.5)) errs.push({ type: e.type, text: p.text, au_dessus: +side.toFixed(2) });
        }
      }
      check(`${label}, page pivotée de ${rot}° : Distance horizontale (2 sens) et Cotes en biais (2 sens) lisibles, Cote au-dessus de sa ligne, aperçu = PDF écrit à ±0,2 mm (${exp.length} textes)`, !errs.length, errs);
    }
  }
  console.log(failures.length ? `\n${failures.length} échec(s) / ${passed + failures.length}` : `\nOK : ${passed} vérifications.`);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC :', e); process.exit(1); });
