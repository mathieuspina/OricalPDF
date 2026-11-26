// Tampons techniques (1.4.0, src/tech-stamps.js) : catalogue (primitives valides, boîte unitaire, sens des trous), objets (création, libellé,
// échelle conservée), écriture PDF relue avec pdf.js sur page portrait, paysage et /Rotate 90 à 3 tailles (chaque extrémité de tracé encrée,
// aucune encre hors du cadre de l'objet, libellés à leur place), aperçu = écriture (mêmes primitives), plein / contour, aller-retour PDF
// modifiable, symbole inconnu, anciens tampons inchangés. Usage : node test/test-tech-stamps.js
// ORICALPDF_SRC=<dossier src> : modules testés lus ailleurs (test:packaged : sources extraites de app.asar du build).
const path = require('path');
const PDFLib = require('@cantoo/pdf-lib');
const SRC = process.env.ORICALPDF_SRC || path.join(__dirname, '..', 'src');
if (process.env.ORICALPDF_SRC) console.log('Modules lus dans : ' + SRC);
const Shapes = require(path.join(SRC, 'shapes.js'));

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail).slice(0, 500) : ''); } };
const measure = Shapes.makeMeasure(PDFLib);

// Anciens tampons : primitives calculées AVANT le chargement du module, comparées après.
const OLD = Shapes.STAMPS.map((s, i) => { const o = Object.assign(Shapes.defaultsFor('stamp'), s, { type: 'stamp', cx: 100, cy: 100, rot: i * 15, date: i % 2 ? '10/11/2026' : null }); const n = Shapes.stampSize(o, measure, 0.8); return Object.assign(o, { w: n.w, h: n.h }); });
const OLD_PRIMS = JSON.stringify(OLD.map((o) => Shapes.primitives(o, measure)));
const OLD_DEF = JSON.stringify(Shapes.defaultsFor('stamp'));

const T = require(path.join(SRC, 'tech-stamps.js'));
const PdfEdit = require(path.join(SRC, 'pdf-edit.js'));
const ES = require(path.join(SRC, 'editable-state.js'));
const EP = require(path.join(SRC, 'editable-pdf.js'));
const FONTS = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'standard_fonts').split('\\').join('/') + '/';
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

let pdfjs;
async function render(bytes, scale) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: FONTS, verbosity: 0, isEvalSupported: false }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale });
    const W = Math.ceil(vp.width), H = Math.ceil(vp.height); // canevas à dimensions entières (voir CLAUDE.md)
    const cc = pdf.canvasFactory.create(W, H);
    await page.render({ canvasContext: cc.context, viewport: vp, canvasFactory: pdf.canvasFactory }).promise;
    const img = cc.context.getImageData(0, 0, W, H);
    const at = (x, y) => { const i = (y * W + x) * 4; return [img.data[i] / 255, img.data[i + 1] / 255, img.data[i + 2] / 255]; };
    const ink = (c) => Math.max(1 - c[0], 1 - c[1], 1 - c[2]) > 0.3;
    // encre à moins de r pixels du point PDF (x, y) ; renvoie la couleur la plus marquée trouvée
    const inkNear = (x, y, r) => {
      const [vx, vy] = vp.convertToViewportPoint(x, y);
      let best = null;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const px = Math.round(vx) + dx, py = Math.round(vy) + dy;
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const c = at(px, py);
        if (ink(c) && (!best || c[0] + c[1] + c[2] < best[0] + best[1] + best[2])) best = c;
      }
      return best;
    };
    const inkPdf = []; // pixels encrés, en coordonnées PDF
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ink(at(x, y))) inkPdf.push(vp.convertToPdfPoint(x + 0.5, y + 0.5));
    const texts = (await page.getTextContent()).items.filter((i) => i.str.trim());
    pages.push({ inkNear, inkPdf, texts, at, vp });
  }
  return pages;
}

// Points de contrôle d'une primitive : extrémités des segments (les tracés en tirets : seulement le départ, qui est un tiret).
function anchors(p) {
  const pts = [];
  for (const s of p.segs) { if (s[0] === 'Z') continue; pts.push(s[0] === 'C' ? [s[5], s[6]] : [s[1], s[2]]); }
  return p.stroke && p.stroke.dash ? pts.slice(0, 1) : pts;
}

// Range les objets en lignes dans des pages de taille [w, h] (marge 20 pt) ; une page de plus quand la page est pleine.
function flow(objs, w, h) {
  const out = [];
  let page = 0, x = 20, y = h - 20, rowH = 0;
  for (const o of objs) {
    const b = Shapes.bounds(o, measure);
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    if (x + bw > w - 20) { x = 20; y -= rowH + 14; rowH = 0; }
    if (y - bh < 20) { page++; x = 20; y = h - 20; rowH = 0; }
    out.push(Object.assign(o, { page, cx: o.cx + (x - b.x0), cy: o.cy + (y - b.y1) }));
    x += bw + 14; rowH = Math.max(rowH, bh);
  }
  return { objs: out, pages: page + 1 };
}

async function source(n, size, rot) {
  const d = await PDFLib.PDFDocument.create();
  for (let i = 0; i < n; i++) { const p = d.addPage(size); if (rot) p.setRotation(PDFLib.degrees(rot)); }
  return d.save();
}

(async () => {
  pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  console.log('1. Catalogue');
  {
    const ids = T.CATALOG.map((e) => e.id);
    check(`${ids.length} entrées, identifiants uniques`, ids.length >= 30 && new Set(ids).size === ids.length, ids);
    check('chaque entrée a une catégorie connue, un nom, un rapport largeur / hauteur et une taille naturelle', T.CATALOG.every((e) => T.CATS.some((c) => c.id === e.cat) && e.name && finite(e.aspect) && e.aspect > 0 && e.natW > 4 && e.natH > 4 && e.natW < 200 && e.natH < 200),
      T.CATALOG.filter((e) => !(e.natW > 4 && e.natH > 4 && e.natW < 200 && e.natH < 200)).map((e) => [e.id, e.natW, e.natH]));
    const inUnit = (e) => e.els.every((el) => el.segs.every((s) => s[0] === 'Z' || (['M', 'L', 'C'].includes(s[0]) && s.slice(1).every((v) => finite(v) && v >= -1e-9 && v <= 1 + 1e-9))));
    check('géométrie normalisée dans la boîte unitaire (M, L, C, Z ; nombres finis)', T.CATALOG.every(inUnit), T.CATALOG.filter((e) => !inUnit(e)).map((e) => e.id));
    check('chaque chemin commence par M', T.CATALOG.every((e) => e.els.every((el) => el.segs[0][0] === 'M')));
    // trous (tubes) : sous-chemins de sens opposé au contour (règle « non nulle » identique en PDF et en SVG)
    const G = T._geom;
    const sub = (segs) => { const out = []; for (const s of segs) { if (s[0] === 'M') out.push([]); out[out.length - 1].push(s); } return out; };
    const tubes = ['tube-sq', 'tube-rect', 'tube-round'].map((id) => sub(T.entry(id).els[0].segs).map((p) => Math.sign(G.signedArea(p))));
    check('tubes : contour extérieur et trou de sens opposés', tubes.every((s) => s.length === 2 && s[0] === -s[1]), tubes);
    check('profilés et bardage : noirs, avec un corps (plein / contour) ; repères : rouges', T.CATALOG.every((e) => (e.cat === 'marks' ? e.color[0] > 0.8 && e.color[1] < 0.2 : e.color.join() === '0,0,0' && e.hasBody)));
    check('profilés : libellé par défaut sous la silhouette (nom + taille courante)', T.CATALOG.filter((e) => e.cat !== 'marks').every((e) => e.place === 'below' && /\d/.test(e.label)));
    check('libellés par défaut écrits en WinAnsi (aucun caractère remplacé)', T.CATALOG.every((e) => e.label === null || Shapes.sanitize(e.label) === e.label), T.CATALOG.filter((e) => e.label && Shapes.sanitize(e.label) !== e.label).map((e) => e.label));
  }

  console.log('2. Objets');
  {
    // 1.5.0 : aucun libellé à la pose (champ vide) ; un ancien objet (label null) garde le libellé du catalogue
    const o0 = T.create('ipe', 100, 200, measure);
    check('création : libellé VIDE par défaut (aucun texte), null pour un symbole sans libellé', o0.label === '' && !T.primitives(o0, measure).some((p) => p.kind === 'text') && T.create('north', 0, 0, measure).label === null);
    check('ancien objet (label null) : libellé du catalogue toujours dessiné', T.primitives(Object.assign({}, o0, { label: null }), measure).some((p) => p.kind === 'text' && p.text === 'IPE 200'));
    const o = T.create('ipe', 100, 200, measure, { label: 'IPE 200' });
    check('création : type tstamp, libellé saisi, noir, plein, taille naturelle', o.type === 'tstamp' && o.label === 'IPE 200' && o.color.join() === '0,0,0' && o.style === 'solid' && o.weight === 'normal' && o.cx === 100 && o.cy === 200
      && Math.abs(o.w - T.natural(o, measure).w) < 1e-9 && Math.abs(o.h - T.natural(o, measure).h) < 1e-9);
    const big = T.create('ipe', 0, 0, measure, { scale: 2.5, label: 'IPE 200' });
    check('création à l\'échelle 2,5', Math.abs(big.w - 2.5 * o.w) < 1e-9 && Math.abs(big.h - 2.5 * o.h) < 1e-9 && !('scale' in big));
    check('cadre : sélection à l\'intérieur, proportions verrouillées, rotation et redimensionnement permis', Shapes.kindOf(o) === 'frame' && Shapes.SOLID.has('tstamp') && Shapes.ASPECT_LOCKED.has('tstamp')
      && Shapes.hitTest(o, 100, 200, 0, measure) && !Shapes.hitTest(o, 100 + o.w, 200, 1, measure) && Shapes.canRotate(o) && Shapes.canResize(o));
    const r = T.relabel(Object.assign({}, big, { w: big.w * 1.3 }), 'IPE 600 très long', measure);
    const after = Object.assign({}, big, { w: big.w * 1.3 }, r);
    const n1 = T.natural(after, measure);
    check('libellé modifié : la taille suit, échelles horizontale et verticale conservées', Math.abs(after.w / n1.w - 2.5 * 1.3) < 1e-9 && Math.abs(after.h / n1.h - 2.5) < 1e-9 && n1.w > T.natural(big, measure).w);
    const empty = Object.assign({}, o, T.relabel(o, '', measure));
    check('libellé vide : silhouette seule, cadre réduit, aucun texte', !T.primitives(empty, measure).some((p) => p.kind === 'text') && empty.h < o.h);
    check('libellé : champ présent sauf flèche Nord ; plein / contour seulement s\'il y a un corps', T.hasLabel(o) && !T.hasLabel({ sym: 'north' }) && T.hasBody(o) && !T.hasBody({ sym: 'bubble' }) && T.hasBody({ sym: 'anchor' }));
    const det = T.layout(T.create('detail', 0, 0, measure, { label: '1/05' }), measure);
    check('bulle double : « 1/05 » réparti en haut et en bas', det.texts.length === 2 && det.texts[0].text === '1' && det.texts[1].text === '05' && det.texts[0].my > det.texts[1].my);
    const sec = T.layout(T.create('section', 0, 0, measure, { label: 'B' }), measure);
    check('repère de coupe : la lettre aux deux extrémités, dans le cadre', sec.texts.length === 2 && sec.texts.every((t) => t.text === 'B' && Math.abs(t.my) < sec.H / 2 && Math.abs(t.cx) < sec.W / 2));
    const longB = T.layout(T.create('bubble', 0, 0, measure, { label: '1234' }), measure);
    check('bulle : numéro long réduit pour tenir dans le cercle (taille du tampon inchangée)', longB.texts[0].size < 13 && measure('Helvetica-Bold', '1234', longB.texts[0].size) < 17 && longB.W === T.layout(T.create('bubble', 0, 0, measure), measure).W);
    const tr = Object.assign({}, o); Shapes.translate(tr, 10, -5); Shapes.rotateBy(tr, 90, tr.cx, tr.cy);
    check('déplacement et rotation (cadre)', tr.cx === 110 && tr.cy === 195 && tr.rot === 90);
    const w2 = T.primitives(Object.assign({}, o, { weight: 'xbold' }), measure)[0].stroke.width / T.primitives(o, measure)[0].stroke.width;
    const k2 = T.primitives(big, measure)[0].stroke.width / T.primitives(o, measure)[0].stroke.width;
    check('épaisseur : relative (très épaisse = 2,4 ×) et proportionnelle à la taille du tampon (× 2,5)', Math.abs(w2 - 2.4) < 1e-9 && Math.abs(k2 - 2.5) < 1e-9);
    const out = T.primitives(Object.assign({}, o, { style: 'outline' }), measure).filter((p) => p.kind === 'path');
    check('contour : aucun remplissage ; plein : remplissage + liseré', out.every((p) => !p.fill && p.stroke) && T.primitives(o, measure).filter((p) => p.kind === 'path').every((p) => p.fill && p.stroke));
    check('valeurs par défaut du type (Shapes.defaultsFor)', Shapes.defaultsFor('tstamp').style === 'solid' && Shapes.defaultsFor('tstamp').weight === 'normal' && Shapes.LABELS.tstamp === 'Tampon technique');
    const all = T.CATALOG.map((e) => T.create(e.id, 300, 300, measure, { rot: 30, label: e.label })); // libellés d'exemple du catalogue (vides par défaut depuis 1.5.0)
    const bad = all.filter((x) => { const ps = T.primitives(x, measure); return !ps.length || ps.some((p) => (p.kind === 'text' ? !(finite(p.x) && finite(p.y) && p.size > 1 && p.text) : !(p.segs.length > 1 && p.segs.every((s) => s.slice(1).every(finite)) && (p.fill || p.stroke) && (!p.stroke || p.stroke.width > 0)))); });
    check('chaque entrée produit des primitives valides (chemins, textes), même tournée', bad.length === 0, bad.map((x) => x.sym));
    check('aperçu = écriture : Shapes.primitives (aperçu SVG et pdf-edit) = TechStamps.primitives', all.every((x) => JSON.stringify(Shapes.primitives(x, measure, { pageRot: 90 })) === JSON.stringify(T.primitives(x, measure))));
    const unk = { type: 'tstamp', sym: 'inconnu-futur', cx: 50, cy: 50, w: 40, h: 40, rot: 0, color: [0, 0, 1] };
    check('symbole inconnu (version future) : cadre barré, pas d\'erreur', T.primitives(unk, measure).length === 2);
  }

  console.log('3. Écriture PDF relue avec pdf.js (portrait, paysage, /Rotate 90 ; 3 tailles)');
  const CONF = [
    { name: 'portrait', size: [595, 842], rot: 0 },
    { name: 'paysage', size: [842, 595], rot: 0 },
    { name: '/Rotate 90', size: [595, 842], rot: 90 },
  ];
  const SIZES = [['petite', 0.6], ['normale', 1], ['grande', 2.5]];
  for (const c of CONF) {
    for (const [sname, sc] of SIZES) {
      const objs = T.CATALOG.map((e, i) => T.create(e.id, 0, 0, measure, { label: e.label, scale: sc, rot: c.rot + (sc === 1 && i % 3 === 1 ? 30 : 0), style: i % 4 === 3 ? 'outline' : 'solid' }));
      const f = flow(objs, c.rot ? c.size[0] : c.size[0], c.size[1]);
      const src = await source(f.pages, c.size, c.rot);
      const edits = f.objs.map((o, i) => Object.assign({ id: i + 1 }, o));
      const out = await PdfEdit.applyEdits(PDFLib, src, edits, {});
      const pages = await render(out, 2);
      const miss = [], outside = [], badText = [], badColor = [];
      for (const o of f.objs) {
        const pg = pages[o.page];
        for (const p of T.primitives(o, measure)) {
          if (p.kind === 'text') {
            const it = pg.texts.find((t) => t.str === p.text && Math.hypot(t.transform[4] - p.x, t.transform[5] - p.y) < 0.6);
            if (!it) badText.push([o.sym, p.text]);
            continue;
          }
          for (const a of anchors(p)) {
            const ink = pg.inkNear(a[0], a[1], 2);
            if (!ink) miss.push([o.sym, a.map((v) => Math.round(v))]);
            else if (o.color[0] > 0.5 && !(ink[0] > ink[1] + 0.25)) badColor.push(o.sym);
          }
        }
      }
      // aucune encre hors du cadre d'un objet (marge : lissage + débord des glyphes)
      for (let n = 0; n < pages.length; n++) {
        const boxes = f.objs.filter((o) => o.page === n).map((o) => { const b = Shapes.bounds(o, measure); return [b, 1 + 0.05 * sc * 9]; });
        let stray = 0;
        for (const pt of pages[n].inkPdf) if (!boxes.some(([b, t]) => pt[0] >= b.x0 - t && pt[0] <= b.x1 + t && pt[1] >= b.y0 - t && pt[1] <= b.y1 + t)) stray++;
        if (stray) outside.push({ page: n, stray });
      }
      check(`${c.name}, ${sname} (${f.objs.length} tampons, ${f.pages} page(s)) : chaque extrémité de tracé encrée, couleurs justes`, !miss.length && !badColor.length, { miss: miss.slice(0, 8), badColor: badColor.slice(0, 5) });
      check(`${c.name}, ${sname} : libellés écrits à leur place (±0,6 pt), aucune encre hors des cadres`, !badText.length && !outside.length, { badText: badText.slice(0, 8), outside });
    }
  }

  console.log('4. Plein / contour : trous des tubes, intérieur des contours');
  {
    const src = await source(1, [400, 400], 0);
    const sq = T.create('tube-sq', 100, 300, measure, { scale: 2 });
    const rd = T.create('tube-round', 250, 300, measure, { scale: 2 });
    const ipeO = T.create('heb', 100, 120, measure, { scale: 2, style: 'outline' });
    const ipeS = T.create('heb', 250, 120, measure, { scale: 2 });
    const out = await PdfEdit.applyEdits(PDFLib, src, [sq, rd, ipeO, ipeS].map((o, i) => Object.assign({ id: i + 1, page: 0 }, o)), {});
    const [pg] = await render(out, 2);
    const symC = (o) => { const L0 = T.layout(o, measure); const kx = o.w / L0.W, ky = o.h / L0.H; return [o.cx + kx * (L0.sym.x0 + L0.sym.w / 2), o.cy + ky * (L0.sym.y0 + L0.sym.h / 2)]; };
    const flangeMid = (o) => { const L0 = T.layout(o, measure); const k = o.w / L0.W; return [o.cx + k * (L0.sym.x0 + L0.sym.w * 0.75), o.cy + k * (L0.sym.y0 + L0.sym.h * 0.97)]; };
    const wall = (o) => { const L0 = T.layout(o, measure); const k = o.w / L0.W; return [o.cx + k * (L0.sym.x0 + L0.sym.w * 0.04), o.cy + k * (L0.sym.y0 + L0.sym.h / 2)]; };
    check('tubes pleins : le trou reste vide (blanc au centre), la paroi est noire', !pg.inkNear(...symC(sq), 1) && !pg.inkNear(...symC(rd), 1) && pg.inkNear(...wall(sq), 1));
    check('HEB : âme pleine en mode plein ; aile creuse en mode contour', !!pg.inkNear(...symC(ipeS), 1) && !pg.inkNear(...flangeMid(ipeO), 0) && !!pg.inkNear(...flangeMid(ipeS), 0));
  }

  console.log('5. PDF modifiable : aller-retour');
  {
    const src = await source(2, [842, 595], 0);
    const f = flow(T.CATALOG.map((e, i) => T.create(e.id, 0, 0, measure, { rot: i % 5 === 0 ? 45 : 0, style: i % 2 ? 'outline' : 'solid', weight: ['fine', 'normal', 'bold', 'xbold'][i % 4], opacity: i % 3 ? 1 : 0.6 })), 842, 595);
    const edits = f.objs.map((o, i) => Object.assign({ id: i + 1 }, o));
    edits[3].label = 'HEB 300 (modifié)';
    const report = {};
    const flat = await PdfEdit.applyEdits(PDFLib, src, edits, {});
    const out = await PdfEdit.applyEdits(PDFLib, src, edits, { editable: { numbering: [], nextId: edits.length + 1 }, onEditable: (r) => Object.assign(report, r) });
    const r = await EP.read(PDFLib, out);
    check(`écrit en modifiable (${edits.length} tampons techniques)`, report.written && ES.detect(out), report);
    check('relu : objets identiques (symbole, libellé, style, épaisseur, couleur, cadre, rotation)', r.status === 'ok' && JSON.stringify(r.state.edits) === JSON.stringify(edits), r.status);
    const [a, b] = [await render(flat, 1), await render(out, 1)];
    const same = a.every((p, i) => p.inkPdf.length === b[i].inkPdf.length);
    check('rendu du modifiable = rendu de l\'aplati', same, a.map((p, i) => [p.inkPdf.length, b[i].inkPdf.length]));
    const again = r.status === 'ok' ? await PdfEdit.applyEdits(PDFLib, r.base, r.state.edits, { editable: { numbering: [], nextId: edits.length + 1 }, onEditable: () => {} }) : null;
    const r2 = again && await EP.read(PDFLib, again);
    check('réenregistré depuis la base restaurée : relu à l\'identique', r2 && r2.status === 'ok' && JSON.stringify(r2.state.edits) === JSON.stringify(edits));
  }

  console.log('6. Anciens tampons inchangés');
  check('primitives et valeurs par défaut des tampons existants identiques avant / après chargement du module', JSON.stringify(OLD.map((o) => Shapes.primitives(o, measure))) === OLD_PRIMS && JSON.stringify(Shapes.defaultsFor('stamp')) === OLD_DEF);

  console.log(`\n${passed} vérifications réussies, ${failures.length} échec(s).`);
  if (failures.length) { console.log('Échecs :\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('OK : tampons techniques.');
})().catch((e) => { console.error(e); process.exit(1); });
