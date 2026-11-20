// Icône de l'application : tailles, dessin par taille, assemblage et lecture de l'ICO, décodage PNG (pour les tests).
// Dessin = logo d'origine (build/logo.svg) SANS le fond (carré arrondi sombre et son contour), recadré sur le dessin (comme
// build/logo-mark.svg) et redessiné à CHAQUE taille : document (dégradé, coins arrondis, pli clair, 3 lignes blanches) calé sur la grille de
// pixels, « anneaux » (feuilles rouges en contour tournées autour du document) adaptés à la taille :
//   - 40 à 256 px : 4 anneaux du logo (−80, −60, −40, −20°, opacités d'origine), fidèle ;
//   - 24 et 32 px : 2 anneaux plus épais et plus opaques (comme build/logo-mark-small.svg) ;
//   - 16 et 20 px : document agrandi, dégradé léger, un seul arc d'anneau net, en « ( » à gauche du document (légèrement incliné).
// Pur (Node seul) : utilisé par scripts/make-icon.js (génération, sous Electron) et test/test-icon.js (contrôle de build/icon.ico).
const zlib = require('zlib');

const SIZES = [16, 20, 24, 32, 40, 48, 64, 256];
// Logo d'origine (unités du SVG 256) : document 80 × 116 en (88, 70), dessin contenu dans le carré (54, 54, 148, 148).
const O = { box: 148, w: 80, h: 116, fold: 26, lineX: 14, lineW: 52, lineW3: 32 };
const GRAD = {
  ring: ['#FF4A4A', '#9B0F1C'],
  doc: ['#E0272F', '#5E0710'],      // d'origine (40 px et plus)
  docMid: ['#E3303A', '#8E0D19'],   // 24-32 px : fin du dégradé un peu plus claire (lisible sur la barre des tâches sombre)
  docSmall: ['#EA3A43', '#B3151F'], // 16-20 px : dégradé léger
};

function tierOf(n) { return n >= 40 ? 'full' : n >= 24 ? 'mid' : 'small'; }

// Géométrie en pixels de la taille n. Document : entiers (bords nets) ; anneaux : rectangles arrondis tournés autour du centre du document.
function geometry(n) {
  const tier = tierOf(n);
  const g = { n, tier };
  if (tier !== 'small') {
    const m = Math.max(1, Math.round(n / 48));           // marge : le pourtour reste transparent malgré l'anticrénelage
    const sw = tier === 'full' ? 5 : 10;                 // épaisseur des anneaux (unités du logo)
    const k = (n - 2 * m) / (O.box + sw * 0.6);
    g.w = Math.round(O.w * k); g.h = Math.round(O.h * k);
    g.x = Math.round((n - g.w) / 2); g.y = Math.round((n - g.h) / 2);
    g.r = Math.max(1, Math.round((tier === 'full' ? 9 : 10) * k * 2) / 2);
    g.fold = Math.round(O.fold / O.w * g.w);
    g.t = Math.max(1, Math.round((tier === 'full' ? 7 : 11) / O.h * g.h));
    const ys = tier === 'full' ? [46, 64, 82] : [42, 62, 82];
    g.lines = ys.map((yy, i) => ({ x: g.x + Math.round(O.lineX / O.w * g.w), y: g.y + Math.round(yy / O.h * g.h), w: Math.round((i === 2 ? O.lineW3 : O.lineW) / O.w * g.w), h: g.t }));
    const stroke = Math.max(tier === 'full' ? 1 : 1.5, sw * k);
    const rings = tier === 'full' ? [[-80, 0.25], [-60, 0.4], [-40, 0.6], [-20, 0.82]] : [[-60, 0.6], [-30, 0.92]];
    g.rings = rings.map(([angle, opacity]) => ({ kind: 'rect', angle, opacity, stroke, rx: g.r }));
    g.grad = tier === 'full' ? GRAD.doc : GRAD.docMid;
  } else {
    // 16 / 20 px : document le plus grand possible, décalé à droite ; un seul arc d'anneau à sa gauche, derrière lui.
    const S = { 16: { x: 5, y: 1, w: 9, h: 13, r: 1, ys: [4, 7, 10], lw: [5, 5, 3], fold: 3, rx: 6, ry: 6.3, stroke: 1.25 },
                20: { x: 7, y: 2, w: 11, h: 16, r: 1.5, ys: [6, 9, 12], lw: [7, 7, 4], fold: 4, rx: 7.5, ry: 7.8, stroke: 1.5 } }[n];
    Object.assign(g, { x: S.x, y: S.y, w: S.w, h: S.h, r: S.r, fold: S.fold, t: 1 });
    g.lines = S.ys.map((yy, i) => ({ x: g.x + 2, y: g.y + yy, w: S.lw[i], h: 1 }));
    g.rings = [{ kind: 'arc', angle: -15, opacity: 1, stroke: S.stroke, rx: S.rx, ry: S.ry, from: 105, to: 255 }];
    g.grad = GRAD.docSmall;
  }
  g.cx = g.x + g.w / 2; g.cy = g.y + g.h / 2;
  return g;
}

const f2 = (v) => +v.toFixed(3);
function svg(n) {
  const g = geometry(n);
  const defs = `<defs><linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GRAD.ring[0]}"/><stop offset="1" stop-color="${GRAD.ring[1]}"/></linearGradient>` +
    `<linearGradient id="doc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${g.grad[0]}"/><stop offset="1" stop-color="${g.grad[1]}"/></linearGradient></defs>`;
  const rings = g.rings.map((r) => {
    if (r.kind === 'rect') return `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="${r.rx}" fill="none" stroke="url(#ring)" stroke-width="${f2(r.stroke)}" opacity="${r.opacity}" transform="rotate(${r.angle} ${g.cx} ${g.cy})"/>`;
    // Arc : partie gauche (de r.from à r.to degrés) d'une ellipse centrée sur le document ; ses extrémités passent sous le document.
    const P = (deg) => { const t = deg * Math.PI / 180; return `${f2(g.cx + r.rx * Math.cos(t))} ${f2(g.cy + r.ry * Math.sin(t))}`; };
    return `<path d="M${P(r.from)} A${r.rx} ${r.ry} 0 0 1 ${P(r.to)}" fill="none" stroke="${GRAD.ring[0]}" stroke-width="${r.stroke}" stroke-linecap="round" opacity="${r.opacity}" transform="rotate(${r.angle} ${g.cx} ${g.cy})"/>`;
  }).join('');
  const doc = `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="${g.r}" fill="url(#doc)"/>`;
  const fold = `<path d="M${g.x + g.w - g.fold} ${g.y}L${g.x + g.w} ${g.y + g.fold}H${g.x + g.w - g.fold}Z" fill="#fff" fill-opacity="0.3"/>`;
  const lines = g.lines.map((l) => `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="${n >= 40 ? l.h / 2 : 0}" fill="#F7F7F7" shape-rendering="${n >= 40 ? 'auto' : 'crispEdges'}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n}" height="${n}">${defs}${rings}${doc}${fold}${lines}</svg>`;
}

// Point (en pixels) sur un anneau, hors du document : milieu du petit côté haut du rectangle tourné (pour les tests).
function ringProbe(g, ring) {
  const a = ring.angle * Math.PI / 180, dy = -g.h / 2;
  return { x: g.cx - dy * Math.sin(a), y: g.cy + dy * Math.cos(a) };
}

// ICO à entrées PNG (Windows Vista et suivants).
function buildIco(sizes, pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e[0] = s >= 256 ? 0 : s;
    e[1] = s >= 256 ? 0 : s;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...pngs]);
}

function readIco(buf) {
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) throw new Error('pas un fichier ICO');
  const out = [];
  for (let i = 0, c = buf.readUInt16LE(4); i < c; i++) {
    const o = 6 + 16 * i;
    const len = buf.readUInt32LE(o + 8), at = buf.readUInt32LE(o + 12);
    out.push({ size: buf[o] || 256, data: buf.subarray(at, at + len) });
  }
  return out;
}

// Décodeur PNG minimal : 8 bits, RGBA ou RGB, non entrelacé (ce que produit Chromium). Renvoie {width, height, rgba}.
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('pas un PNG');
  let pos = 8, width = 0, height = 0, ch = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('latin1', pos + 4, pos + 8), d = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = d.readUInt32BE(0); height = d.readUInt32BE(4);
      if (d[8] !== 8 || d[12] !== 0 || (d[9] !== 6 && d[9] !== 2)) throw new Error('PNG non pris en charge');
      ch = d[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * ch, px = Buffer.alloc(height * stride), rgba = Buffer.alloc(width * height * 4);
  for (let yy = 0; yy < height; yy++) {
    const ft = raw[yy * (stride + 1)], src = raw.subarray(yy * (stride + 1) + 1, (yy + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? px[yy * stride + i - ch] : 0, b = yy ? px[(yy - 1) * stride + i] : 0, c = yy && i >= ch ? px[(yy - 1) * stride + i - ch] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][ft];
      px[yy * stride + i] = (src[i] + pred) & 255;
    }
  }
  for (let i = 0; i < width * height; i++) { for (let k = 0; k < 3; k++) rgba[i * 4 + k] = px[i * ch + k]; rgba[i * 4 + 3] = ch === 4 ? px[i * ch + 3] : 255; }
  return { width, height, rgba };
}

module.exports = { SIZES, GRAD, tierOf, geometry, svg, ringProbe, buildIco, readIco, decodePng };
