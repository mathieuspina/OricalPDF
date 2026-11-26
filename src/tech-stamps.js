// Tampons techniques (1.4.0) : silhouettes schématiques de profilés (sections en coupe) et repères de plan, sans cotes ni échelle (UMD, pur).
// Objet : { type: 'tstamp', sym (id du catalogue), label (texte éditable ; '' à la pose depuis 1.5.0 | null = libellé du catalogue, anciens objets), cx, cy, w, h (= taille naturelle × k), rot, color, opacity,
//           style 'solid' | 'outline' (corps des profilés plein ou en contour), weight 'fine' | 'normal' | 'bold' | 'xbold' (épaisseur relative) }.
// Le type est un cadre (comme 'stamp') : poignées, rotation, proportions verrouillées (Maj = libre), copier / coller, annulation, écriture par
// les primitives partagées aperçu / PDF (Shapes.primitives → pdf-edit.drawPrimitives). Épaisseur des traits et taille du libellé
// proportionnelles à la taille du tampon.
//
// CATALOGUE DATA-DRIVEN : une entrée = { id, cat, name, label (libellé par défaut | null), place (position du libellé), size (pt), font,
// nat (taille naturelle en pt : { h } | { w } | { scale } = unités brutes en pt), lw (trait naturel en pt), color, els (éléments) }.
// Un élément = { segs (chemin en unités brutes : ['M',x,y] ['L',x,y] ['C',x1,y1,x2,y2,x,y] ['Z']), role, w (multiplicateur de trait), dash }.
//   role 'body' : plein (remplissage + liseré) ou contour selon style ; 'line' : trait seul ; 'fill' : toujours plein.
// À la lecture du module, la géométrie est normalisée dans la boîte unitaire [0,1]² (y vers le haut) ; `aspect` = largeur / hauteur.
// Ajouter un tampon = ajouter une entrée (les dessins sont créés ici : aucune bibliothèque de symboles externe, aucune image).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./shapes.js'));
  else root.TechStamps = factory(root.Shapes);
})(typeof self !== 'undefined' ? self : this, function (Shapes) {
  'use strict';

  const DEG = Shapes.DEG;
  const KAPPA = 0.5522847498;
  const CATS = [
    { id: 'profiles', name: 'Profilés' },
    { id: 'cladding', name: 'Bardage et couverture' },
    { id: 'marks', name: 'Repères' },
  ];
  const BLACK = [0, 0, 0];
  const RED = [0.85, 0.1, 0.1];
  const WEIGHTS = { fine: 0.6, normal: 1, bold: 1.6, xbold: 2.4 };
  const WEIGHT_OPTIONS = [['fine', 'Fine'], ['normal', 'Normale'], ['bold', 'Épaisse'], ['xbold', 'Très épaisse']];
  const STYLE_OPTIONS = [['solid', 'Plein'], ['outline', 'Contour']];

  // ------------------------------------------------------------------ constructeurs de chemins (unités brutes, y vers le haut)
  const M = (x, y) => ['M', x, y];
  const L = (x, y) => ['L', x, y];
  const C = (a, b, c, d, e, f) => ['C', a, b, c, d, e, f];
  const Z = ['Z'];
  const poly = (pts, closed = true) => [M(...pts[0]), ...pts.slice(1).map((p) => L(...p)), ...(closed ? [Z] : [])];

  // Polygone fermé à coins arrondis : r = rayon (nombre) ou tableau de rayons par sommet (0 = angle vif).
  function roundPoly(pts, r) {
    const n = pts.length;
    const rad = (i) => (Array.isArray(r) ? r[i] || 0 : r || 0);
    const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l, l]; };
    const segs = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], prev = pts[(i + n - 1) % n], next = pts[(i + 1) % n];
      const ri = rad(i);
      if (!ri) { segs.push(segs.length ? L(p[0], p[1]) : M(p[0], p[1])); continue; }
      const din = unit(prev, p), dout = unit(p, next);
      const rr = Math.min(ri, din[2] / 2, dout[2] / 2);
      const a = [p[0] - din[0] * rr, p[1] - din[1] * rr], b = [p[0] + dout[0] * rr, p[1] + dout[1] * rr];
      segs.push(segs.length ? L(a[0], a[1]) : M(a[0], a[1]));
      segs.push(C(a[0] + din[0] * rr * KAPPA, a[1] + din[1] * rr * KAPPA, b[0] - dout[0] * rr * KAPPA, b[1] - dout[1] * rr * KAPPA, b[0], b[1]));
    }
    segs.push(Z);
    return segs;
  }
  const rect = (x0, y0, x1, y1, r) => roundPoly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], r || 0);
  function circle(cx, cy, r) {
    const k = r * KAPPA;
    return [M(cx + r, cy), C(cx + r, cy + k, cx + k, cy + r, cx, cy + r), C(cx - k, cy + r, cx - r, cy + k, cx - r, cy),
      C(cx - r, cy - k, cx - k, cy - r, cx, cy - r), C(cx + k, cy - r, cx + r, cy - k, cx + r, cy), Z];
  }
  // Aire signée d'un sous-chemin fermé (polygone des points d'extrémité et de contrôle : le signe suffit).
  function signedArea(segs) {
    const pts = [];
    for (const s of segs) { if (s[0] === 'C') pts.push([s[1], s[2]], [s[3], s[4]], [s[5], s[6]]); else if (s[0] !== 'Z') pts.push([s[1], s[2]]); }
    let a = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return a / 2;
  }
  // Inverse le sens de parcours d'un sous-chemin fermé (M, L, C, Z).
  function reverse(segs) {
    const body = segs.filter((s) => s[0] !== 'Z');
    const pts = body.map((s) => (s[0] === 'C' ? [s[5], s[6]] : [s[1], s[2]]));
    const out = [M(...pts[pts.length - 1])];
    for (let i = body.length - 1; i >= 1; i--) {
      const s = body[i];
      if (s[0] === 'C') out.push(C(s[3], s[4], s[1], s[2], pts[i - 1][0], pts[i - 1][1]));
      else out.push(L(pts[i - 1][0], pts[i - 1][1]));
    }
    if (body.length && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1])) out.push(L(pts[0][0], pts[0][1]));
    out.push(Z);
    return out;
  }
  // Anneau : contour extérieur dans le sens trigonométrique, trous dans l'autre sens (règle « non nulle » : PDF et SVG identiques).
  function ring(outer, ...holes) {
    const o = signedArea(outer) < 0 ? reverse(outer) : outer;
    return o.concat(...holes.map((h) => (signedArea(h) > 0 ? reverse(h) : h)));
  }
  // Tôle pliée : ligne moyenne `pts` épaissie de t (joints en onglet, limités), contour fermé.
  function thick(pts, t) {
    const h = t / 2;
    const nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
    const left = [], right = [];
    for (let i = 0; i < pts.length; i++) {
      const n1 = i > 0 ? nrm(pts[i - 1], pts[i]) : nrm(pts[i], pts[i + 1]);
      const n2 = i < pts.length - 1 ? nrm(pts[i], pts[i + 1]) : n1;
      let mx = n1[0] + n2[0], my = n1[1] + n2[1];
      const ml = Math.hypot(mx, my) || 1;
      mx /= ml; my /= ml;
      const len = Math.min(h / Math.max(0.25, mx * n1[0] + my * n1[1]), 4 * h);
      left.push([pts[i][0] + mx * len, pts[i][1] + my * len]);
      right.push([pts[i][0] - mx * len, pts[i][1] - my * len]);
    }
    return ring(poly(left.concat(right.reverse())));
  }
  const arrowHead = (tip, dir, len, half) => { // triangle plein, pointe en tip, direction dir (unitaire)
    const b = [tip[0] - dir[0] * len, tip[1] - dir[1] * len];
    return poly([tip, [b[0] - dir[1] * half, b[1] + dir[0] * half], [b[0] + dir[1] * half, b[1] - dir[0] * half]]);
  };

  // ------------------------------------------------------------------ silhouettes de profilés (proportions typiques, légèrement épaissies)
  // Poutrelle en I / H : h hauteur, b largeur d'aile, tw âme, tf aile, r congé, taper pente intérieure des ailes (IPN : 14 %).
  function iBeam(h, b, tw, tf, r, taper) {
    const s = taper || 0;
    const t1 = tf - (s * (b - tw)) / 4, t2 = tf + (s * (b - tw)) / 4; // épaisseur à l'extrémité et à la racine de l'aile
    const y0 = -h / 2, y1 = h / 2;
    const pts = [[-b / 2, y0], [b / 2, y0], [b / 2, y0 + t1], [tw / 2, y0 + t2], [tw / 2, y1 - t2], [b / 2, y1 - t1], [b / 2, y1], [-b / 2, y1],
      [-b / 2, y1 - t1], [-tw / 2, y1 - t2], [-tw / 2, y0 + t2], [-b / 2, y0 + t1]];
    const rr = [0, 0, r * 0.3, r, r, r * 0.3, 0, 0, r * 0.3, r, r, r * 0.3];
    return roundPoly(pts, rr);
  }
  function channel(h, b, tw, tf, r, taper) { // U : âme à gauche, ailes vers la droite
    const s = taper || 0;
    const t1 = tf - (s * (b - tw)) / 2, t2 = tf + (s * (b - tw)) / 2;
    const pts = [[0, 0], [b, 0], [b, t1], [tw, t2], [tw, h - t2], [b, h - t1], [b, h], [0, h]];
    return roundPoly(pts, [0, 0, r * 0.4, r, r, r * 0.4, 0, 0]);
  }
  function angle(a, bb, t, r) { // cornière : aile verticale a (à gauche), aile horizontale bb
    return roundPoly([[0, 0], [bb, 0], [bb, t], [t, t], [t, a], [0, a]], [0, 0, r * 0.5, r, r * 0.5, 0]);
  }
  function tee(b, h, tw, tf, r) {
    return roundPoly([[-tw / 2, 0], [tw / 2, 0], [tw / 2, h - tf], [b / 2, h - tf], [b / 2, h], [-b / 2, h], [-b / 2, h - tf], [-tw / 2, h - tf]],
      [0, 0, r, r * 0.4, 0, 0, r * 0.4, r]);
  }
  function trapezoid(n, pitch, hRib, top, bottom, x0) { // ligne moyenne d'une tôle nervurée trapézoïdale (n nervures)
    const pts = [[x0, 0]];
    const slope = (pitch - top - bottom) / 2;
    for (let i = 0; i < n; i++) {
      const s = x0 + i * pitch + bottom / 2;
      pts.push([s, 0], [s + slope, hRib], [s + slope + top, hRib], [s + 2 * slope + top, 0]);
    }
    pts.push([x0 + n * pitch, 0]);
    return pts;
  }
  const N_LETTER = [M(-3.2, 20), L(-3.2, 27), L(3.2, 20), L(3.2, 27)];

  const body = (segs) => ({ segs, role: 'body' });
  const line = (segs, extra) => Object.assign({ segs, role: 'line' }, extra);
  const fill = (segs) => ({ segs, role: 'fill' });
  const AXIS_DASH = [9, 2.5, 0.01, 2.5]; // trait mixte (tiret long, point), en pt à la taille naturelle

  // Sandwich : parement supérieur nervuré, parement inférieur plat, âme isolante en zigzag.
  function sandwich() {
    const W = 450, H = 100;
    const top = trapezoid(3, 150, 32, 30, 50, 0).map((p) => [p[0], p[1] + H]);
    const zig = [];
    for (let x = 12, i = 0; x <= W - 12; x += 18, i++) zig.push([x, i % 2 ? H - 14 : 14]);
    return [body(thick(top, 4)), body(thick([[0, 0], [W, 0]], 4)), line(poly([[0, 0], [0, H]], false)), line(poly([[W, 0], [W, H]], false)),
      line(poly(zig, false), { w: 0.55 })];
  }

  const RAW = [
    // ---- Profilés laminés (désignation + taille courante ; noir, plein par défaut)
    { id: 'ipe', cat: 'profiles', name: 'IPE', label: 'IPE 200', els: [body(iBeam(200, 100, 8, 11, 12))] },
    { id: 'ipn', cat: 'profiles', name: 'IPN', label: 'IPN 200', els: [body(iBeam(200, 90, 9, 11.5, 9, 0.14))] },
    { id: 'hea', cat: 'profiles', name: 'HEA', label: 'HEA 200', els: [body(iBeam(190, 200, 8, 11, 18))] },
    { id: 'heb', cat: 'profiles', name: 'HEB', label: 'HEB 200', els: [body(iBeam(200, 200, 10, 15, 18))] },
    { id: 'hem', cat: 'profiles', name: 'HEM', label: 'HEM 200', els: [body(iBeam(220, 206, 15, 25, 18))] },
    { id: 'upn', cat: 'profiles', name: 'UPN', label: 'UPN 200', els: [body(channel(200, 75, 9, 11.5, 11, 0.08))] },
    { id: 'upe', cat: 'profiles', name: 'UPE', label: 'UPE 200', els: [body(channel(200, 80, 7, 11, 13))] },
    { id: 'l-equal', cat: 'profiles', name: 'Cornière à ailes égales', label: 'L 80×8', els: [body(angle(80, 80, 9, 10))] },
    { id: 'l-unequal', cat: 'profiles', name: 'Cornière à ailes inégales', label: 'L 100×65×8', els: [body(angle(100, 65, 9, 10))] },
    { id: 'tee', cat: 'profiles', name: 'Profilé en T', label: 'T 80', els: [body(tee(80, 80, 10, 10, 9))] },
    { id: 'tube-sq', cat: 'profiles', name: 'Tube carré', label: 'Tube 100×100×5', els: [body(ring(rect(0, 0, 100, 100, 12), rect(8, 8, 92, 92, 5)))] },
    { id: 'tube-rect', cat: 'profiles', name: 'Tube rectangulaire', label: 'Tube 120×80×5', els: [body(ring(rect(0, 0, 120, 80, 12), rect(8, 8, 112, 72, 5)))] },
    { id: 'tube-round', cat: 'profiles', name: 'Tube rond', label: 'Tube Ø114,3×5', els: [body(ring(circle(0, 0, 57), circle(0, 0, 49)))] },
    { id: 'flat', cat: 'profiles', name: 'Plat', label: 'Plat 100×10', nat: { w: 56 }, els: [body(rect(0, 0, 100, 16))] },
    { id: 'round-bar', cat: 'profiles', name: 'Rond plein', label: 'Rond Ø20', nat: { h: 24 }, els: [body(circle(0, 0, 50))] },
    // ---- Bardage et couverture (tôles minces : épaisseur exagérée pour rester visible)
    { id: 'purlin-z', cat: 'cladding', name: 'Panne Z', label: 'Z 200', els: [body(thick([[-62, 24], [-70, 0], [0, 0], [0, 200], [70, 200], [62, 176]], 8))] },
    { id: 'purlin-c', cat: 'cladding', name: 'Panne C', label: 'C 200', els: [body(thick([[70, 176], [70, 200], [0, 200], [0, 0], [70, 0], [70, 24]], 8))] },
    { id: 'purlin-sigma', cat: 'cladding', name: 'Panne Sigma', label: 'Sigma 200', els: [body(thick([[70, 176], [70, 200], [0, 200], [0, 140], [20, 120], [20, 80], [0, 60], [0, 0], [70, 0], [70, 24]], 8))] },
    { id: 'rail-omega', cat: 'cladding', name: 'Lisse oméga', label: 'Oméga 40', nat: { h: 26 }, els: [body(thick([[-18, 0], [0, 0], [8, 40], [42, 40], [50, 0], [68, 0]], 3.2))] },
    { id: 'deck', cat: 'cladding', name: 'Bac acier (trapèze)', label: 'Bac acier 40/250', nat: { w: 120 }, els: [body(thick(trapezoid(3, 150, 40, 36, 50, 0), 4))] },
    { id: 'sandwich', cat: 'cladding', name: 'Panneau sandwich', label: 'Panneau 100 mm', nat: { w: 120 }, els: sandwich() },
    // ---- Repères (rouge, pour la correction de plans ; dessinés en pt à la taille naturelle)
    { id: 'bubble', cat: 'marks', name: 'Bulle de repère', label: '1', place: 'in', boxes: [[-8, -6.5, 8, 6.5]], size: 13, font: 'Helvetica-Bold', els: [line(circle(0, 0, 11))] },
    { id: 'north', cat: 'marks', name: 'Flèche Nord', label: null, els: [line(circle(0, 0, 15)), fill(poly([[0, 13], [-6, -10], [0, -5]])), line(poly([[0, 13], [-6, -10], [0, -5], [6, -10]])), line(N_LETTER)] },
    { id: 'weld-fillet', cat: 'marks', name: 'Soudure d\'angle', label: 'a5', place: 'in', boxes: [[14, 2, 25, 12]], size: 8, els: weld('fillet') },
    { id: 'weld-butt', cat: 'marks', name: 'Soudure bout à bout', label: '', place: 'in', boxes: [[14, 2, 25, 12]], size: 8, els: weld('butt') },
    { id: 'weld-around', cat: 'marks', name: 'Soudure tout autour', label: 'a5', place: 'in', boxes: [[14, 2, 25, 12]], size: 8, els: weld('around') },
    { id: 'level', cat: 'marks', name: 'Cote de niveau', label: '±0,00', place: 'in', boxes: [[17, 1.5, 52, 11]], size: 9, els: [line(poly([[0, 0], [52, 0]], false)), fill(poly([[2, 9], [8, 9], [8, 0]])), line(poly([[2, 9], [14, 9], [8, 0]]))] },
    { id: 'section', cat: 'marks', name: 'Repère de coupe', label: 'A', place: 'in', boxes: [[-1, 17, 15, 29], [75, 17, 91, 29]], size: 11, font: 'Helvetica-Bold', els: [
      line(poly([[14, 14], [76, 14]], false), { w: 0.6, dash: AXIS_DASH }), line(poly([[0, 14], [14, 14]], false), { w: 2.2 }), line(poly([[76, 14], [90, 14]], false), { w: 2.2 }),
      line(poly([[2, 14], [2, 5]], false)), fill(arrowHead([2, 0], [0, -1], 6, 3)), line(poly([[88, 14], [88, 5]], false)), fill(arrowHead([88, 0], [0, -1], 6, 3))] },
    { id: 'slope', cat: 'marks', name: 'Flèche de pente', label: '5 %', place: 'above', size: 9, els: [line(poly([[0, 0], [54, 0]], false)), fill(arrowHead([62, 0], [1, 0], 9, 3.5))] },
    { id: 'axis', cat: 'marks', name: 'Axe (trait mixte)', label: 'A', place: 'in', boxes: [[-6.5, -5.5, 6.5, 5.5]], size: 11, font: 'Helvetica-Bold', els: [line(circle(0, 0, 9)), line(poly([[9, 0], [110, 0]], false), { w: 0.6, dash: AXIS_DASH })] },
    { id: 'hole', cat: 'marks', name: 'Perçage / boulon', label: 'M16', place: 'below', size: 8, els: [line(circle(0, 0, 8)), line(poly([[-12, 0], [12, 0]], false), { w: 0.55 }), line(poly([[0, -12], [0, 12]], false), { w: 0.55 })] },
    { id: 'anchor', cat: 'marks', name: 'Tige d\'ancrage', label: 'M20', place: 'below', size: 8, els: [
      line(poly([[10, 64], [10, 14]], false), { w: 1.6 }), line([M(10, 14), C(10, 9, 13, 6, 18, 6), L(28, 6)], { w: 1.6 }),
      body(rect(1, 47, 19, 50)), body(rect(3.5, 50, 16.5, 56))] },
    { id: 'detail', cat: 'marks', name: 'Voir détail (bulle double)', label: '1/05', place: 'in', split: '/', boxes: [[-8, 1.5, 8, 10], [-8, -10, 8, -1.5]], size: 9, font: 'Helvetica-Bold',
      els: [line(circle(0, 0, 14)), line(poly([[-14, 0], [14, 0]], false))] },
  ];
  // Symboles de soudure : flèche + ligne de référence ; symbole sous la ligne (côté flèche).
  function weld(kind) {
    const els = [line(poly([[0, 0], [14, 14], [56, 14]], false)), fill(arrowHead([0, 0], [-Math.SQRT1_2, -Math.SQRT1_2], 7, 2.8))];
    if (kind === 'butt') els.push(line(poly([[28, 14], [28, 5]], false)), line(poly([[33, 14], [33, 5]], false)));
    else els.push(line(poly([[27, 14], [27, 4], [37, 14]], false)));
    if (kind === 'around') els.push(line(circle(14, 14, 3.5)));
    return els;
  }

  // ------------------------------------------------------------------ normalisation (boîte unitaire, y vers le haut)
  function bboxOf(els, boxes) { // dessin + boîtes des libellés placés dans le symbole (lettres de coupe, valeur de niveau…)
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const q of boxes || []) { b.x0 = Math.min(b.x0, q[0]); b.x1 = Math.max(b.x1, q[2]); b.y0 = Math.min(b.y0, q[1]); b.y1 = Math.max(b.y1, q[3]); }
    for (const e of els) for (const s of e.segs) for (let i = 1; i + 1 < s.length; i += 2) { b.x0 = Math.min(b.x0, s[i]); b.x1 = Math.max(b.x1, s[i]); b.y0 = Math.min(b.y0, s[i + 1]); b.y1 = Math.max(b.y1, s[i + 1]); }
    return b;
  }
  function normalize(r) {
    const prof = r.cat !== 'marks';
    const b = bboxOf(r.els, r.boxes);
    const W = b.x1 - b.x0, H = b.y1 - b.y0;
    const nu = (x, y) => [(x - b.x0) / W, (y - b.y0) / H];
    const mapSeg = (s) => { if (s[0] === 'Z') return s; const o = [s[0]]; for (let i = 1; i + 1 < s.length; i += 2) o.push(...nu(s[i], s[i + 1])); return o; };
    const nat = r.nat || (prof ? { h: 40 } : { scale: 1 });
    const k = nat.scale || (nat.h ? nat.h / H : nat.w / W); // pt par unité brute
    return {
      id: r.id, cat: r.cat, name: r.name, aspect: W / H, natW: W * k, natH: H * k,
      label: r.label === undefined ? null : r.label, place: r.place || 'below', size: r.size || 8, font: r.font || 'Helvetica', split: r.split || null,
      boxes: (r.boxes || []).map((q) => { const a = nu(q[0], q[1]), c = nu(q[2], q[3]); return [a[0], a[1], c[0], c[1]]; }),
      lw: r.lw || (prof ? 1.1 : 1.3), color: r.color || (prof ? BLACK : RED),
      hasBody: r.els.some((e) => e.role === 'body'),
      els: r.els.map((e) => ({ segs: e.segs.map(mapSeg), role: e.role, w: e.w || 1, dash: e.dash || null })),
    };
  }
  const CATALOG = RAW.map(normalize);
  const BY_ID = {};
  for (const e of CATALOG) BY_ID[e.id] = e;
  const entry = (id) => BY_ID[id] || null;

  // ------------------------------------------------------------------ mise en page naturelle (repère local centré, pt, y vers le haut)
  // → { W, H, sym: { x0, y0, w, h }, texts: [{ text, cx, my (milieu de la hauteur des capitales), size, font }] }
  function labelText(o, e) {
    if (!e.label && e.label !== '') return '';
    const v = o.label === undefined || o.label === null ? e.label : o.label;
    return Shapes.sanitize(String(v).replace(/\s*\n\s*/g, ' ')).trim();
  }
  function layout(o, measure) {
    const e = entry(o.sym);
    if (!e) return { W: 40, H: 40, sym: { x0: -18, y0: -18, w: 36, h: 36 }, texts: [], missing: true };
    const m = e.lw * 0.75;                    // marge : le trait ne dépasse pas du cadre
    const sw = e.natW + 2 * m, sh = e.natH + 2 * m;
    const t = labelText(o, e);
    const s = e.size;
    const CAP = 0.36;                          // milieu des capitales Helvetica (fraction du corps)
    if (!t || e.place === 'in') {
      const sym = { x0: -sw / 2 + m, y0: -sh / 2 + m, w: e.natW, h: e.natH };
      const texts = [];
      if (t) {
        const parts = e.split ? t.split(e.split) : null;
        e.boxes.forEach((bx, i) => {
          const part = (parts ? parts[i] || '' : t).trim();
          if (!part) return;
          const x0 = sym.x0 + bx[0] * sym.w, x1 = sym.x0 + bx[2] * sym.w, y0 = sym.y0 + bx[1] * sym.h, y1 = sym.y0 + bx[3] * sym.h;
          const w1 = measure(e.font, part, 1) || 1;
          const size = Math.min(s, (0.96 * (x1 - x0)) / w1, (y1 - y0) / 0.78);
          texts.push({ text: part, cx: (x0 + x1) / 2, my: (y0 + y1) / 2, size, font: e.font });
        });
      }
      return { W: sw, H: sh, sym, texts };
    }
    const tw = measure(e.font, t, s);
    const th = s * 1.15, gap = s * 0.3;
    if (e.place === 'right') {
      const W = sw + gap + tw, H = Math.max(sh, th);
      return { W, H, sym: { x0: -W / 2 + m, y0: -e.natH / 2, w: e.natW, h: e.natH }, texts: [{ text: t, cx: -W / 2 + sw + gap + tw / 2, my: 0, size: s, font: e.font }] };
    }
    const W = Math.max(sw, tw + 2), H = sh + gap + th;
    if (e.place === 'above') {
      return { W, H, sym: { x0: -e.natW / 2, y0: -H / 2 + m, w: e.natW, h: e.natH }, texts: [{ text: t, cx: 0, my: H / 2 - 0.93 * s + CAP * s, size: s, font: e.font }] };
    }
    return { W, H, sym: { x0: -e.natW / 2, y0: H / 2 - sh + m, w: e.natW, h: e.natH }, texts: [{ text: t, cx: 0, my: -H / 2 + 0.22 * s + CAP * s, size: s, font: e.font }] };
  }
  function natural(o, measure) { const L0 = layout(o, measure); return { w: L0.W, h: L0.H }; }

  // ------------------------------------------------------------------ primitives (aperçu SVG = écriture PDF)
  function primitives(o, measure) {
    const e = entry(o.sym);
    const L0 = layout(o, measure);
    const kx = o.w / L0.W, ky = o.h / L0.H, k = Math.min(kx, ky);
    const a = (o.rot || 0) * DEG;
    const op = o.opacity === undefined ? 1 : o.opacity;
    const col = o.color || (e ? e.color : RED);
    const xf = (x, y) => Shapes.rotAbout(o.cx + kx * x, o.cy + ky * y, o.cx, o.cy, a);
    const sym = L0.sym;
    const toLocal = (u, v) => xf(sym.x0 + u * sym.w, sym.y0 + v * sym.h);
    const mapSegs = (segs) => segs.map((s) => { if (s[0] === 'Z') return s; const out = [s[0]]; for (let i = 1; i + 1 < s.length; i += 2) out.push(...toLocal(s[i], s[i + 1])); return out; });
    const out = [];
    if (!e) { // symbole inconnu (document d'une version plus récente) : cadre barré, rien n'est perdu à l'enregistrement de l'objet
      const segs = Shapes.polySegs([[0, 0], [1, 0], [1, 1], [0, 1]].map((p) => toLocal(p[0], p[1])), true);
      out.push({ kind: 'path', segs, fill: null, stroke: { color: col, width: 1.2 * k, opacity: op, dash: null }, blend: null });
      out.push({ kind: 'path', segs: Shapes.polySegs([toLocal(0, 0), toLocal(1, 1)], false), fill: null, stroke: { color: col, width: 1.2 * k, opacity: op, dash: null }, blend: null });
      return out;
    }
    const lw = e.lw * (WEIGHTS[o.weight] || 1) * k;
    const solid = o.style !== 'outline';
    for (const el of e.els) {
      const segs = mapSegs(el.segs);
      const width = lw * el.w;
      const dash = el.dash ? el.dash.map((d) => d * k) : null;
      if (el.role === 'line' || (el.role === 'body' && !solid)) out.push({ kind: 'path', segs, fill: null, stroke: { color: col, width, opacity: op, dash }, blend: null });
      else out.push({ kind: 'path', segs, fill: { color: col, opacity: op }, stroke: { color: col, width: width * 0.45, opacity: op, dash: null }, blend: null });
    }
    for (const t of L0.texts) {
      const size = t.size * k;
      const tw = measure(t.font, t.text, size);
      const p = Shapes.rotAbout(o.cx + kx * t.cx - tw / 2, o.cy + ky * t.my - 0.36 * size, o.cx, o.cy, a);
      out.push({ kind: 'text', text: t.text, x: p[0], y: p[1], size, fontName: t.font, color: col, rot: o.rot || 0, opacity: op });
    }
    return out;
  }

  // ------------------------------------------------------------------ objets
  const DEFAULTS = { sym: 'ipe', label: null, color: BLACK, opacity: 1, style: 'solid', weight: 'normal', rot: 0 };
  // Nouvel objet du catalogue à l'échelle `scale` (1 = taille naturelle), centré en (cx, cy).
  function create(sym, cx, cy, measure, extra) {
    const e = entry(sym);
    // 1.5.0 : libellé VIDE à la pose (le libellé du catalogue n'est plus qu'un exemple) ; null pour un symbole sans libellé.
    const o = Object.assign({ type: 'tstamp' }, DEFAULTS, { sym, label: e && e.label !== null ? '' : null, color: e ? e.color.slice() : RED }, extra || {}, { cx, cy });
    const sc = (extra && extra.scale) || 1;
    delete o.scale;
    const n = natural(o, measure);
    return Object.assign(o, { w: n.w * sc, h: n.h * sc });
  }
  // Libellé modifié : la taille suit, l'échelle (horizontale et verticale) est conservée.
  function relabel(o, label, measure) {
    const n0 = natural(o, measure);
    const n1 = natural(Object.assign({}, o, { label }), measure);
    return { label, w: n1.w * (o.w / n0.w), h: n1.h * (o.h / n0.h) };
  }
  const hasLabel = (o) => { const e = entry(o.sym); return !!e && e.label !== null; };
  const hasBody = (o) => { const e = entry(o.sym); return !!e && e.hasBody; };

  Shapes.FRAME.add('tstamp');
  Shapes.SOLID.add('tstamp');
  Shapes.ASPECT_LOCKED.add('tstamp');
  Shapes.register('tstamp', { primitives, label: 'Tampon technique', defaults: () => Object.assign({}, DEFAULTS, { color: BLACK.slice() }) });

  return {
    CATS, CATALOG, WEIGHTS, WEIGHT_OPTIONS, STYLE_OPTIONS, DEFAULTS, entry, layout, natural, primitives, create, relabel, hasLabel, hasBody,
    // constructeurs (tests, futures entrées)
    _geom: { roundPoly, rect, circle, ring, reverse, signedArea, thick },
  };
});
