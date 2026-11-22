// Icône de l'application Orical PDF : tailles, dessin par taille, assemblage et lecture de l'ICO, décodage PNG (pour les tests).
// Source de vérité : build/logo-orical-pdf.svg (80 × 80) = halo rouge flou + disque au dégradé radial (centre 44, 40, r 22), disque sombre
// #121214 (centre 35, 39.4, r 19.6), pictogramme « page + plus » en trait rose #FFB9B9 de 2. Fond transparent, recadré sur le dessin.
// Chaque taille est DESSINÉE à sa taille :
//   - 40 à 256 px : logo complet (halo flou + dégradé radial), fidèle ;
//   - 32 px : halo simplifié = cercle rouge plat décalé, sans flou ; trait un peu épaissi ;
//   - 16 à 24 px : halo plat, trait rose épaissi, pictogramme simplifié et agrandi dans le disque (24 : page + plus ; 16 et 20 : page seule).
// Pur (Node seul) : utilisé par scripts/make-icon.js (génération, sous Electron) et test/test-icon.js (contrôle de build/icon.ico).
// L'icône des FICHIERS PDF (build/pdf-file.ico) est décrite dans scripts/pdf-icon-geometry.js (mêmes outils ICO / PNG).
const zlib = require('zlib');

const SIZES = [16, 20, 24, 32, 40, 48, 64, 256];
const COLORS = { halo: '#F23A3A', disc: '#121214', stroke: '#FFB9B9', grad: ['#FFD0D0', '#F64E4E', '#F02C2C', '#E31414'] };
const HALO = { cx: 44, cy: 40, r: 22 };
const DISC = { cx: 35, cy: 39.4, r: 19.6 };
const BLUR = 2.4;
// Pictogramme d'origine (page à coin plié + plus), unités du logo.
const ICON_FULL = 'M43 41V38.375C43 37.4799 42.6444 36.6215 42.0115 35.9885C41.3786 35.3556 40.5201 35 39.625 35H38.125C37.8266 35 37.5405 34.8815 37.3295 34.6705C37.1185 34.4595 37 34.1734 37 33.875V32.375C37 31.4799 36.6444 30.6214 36.0115 29.9885C35.3785 29.3556 34.5201 29 33.625 29H31.75M35.5 38V44M38.5 41H32.5M34 29H29.125C28.504 29 28 29.504 28 30.125V47.375C28 47.996 28.504 48.5 29.125 48.5H41.875C42.496 48.5 43 47.996 43 47.375V38C43 35.6131 42.0518 33.3239 40.364 31.636C38.6761 29.9482 36.3869 29 34 29Z';
// Simplifiés (petites tailles) : page à coin coupé (+ plus), contenus dans la même boîte (28..43 × 29..48.5) malgré un trait épais.
const ICON_PAGE = 'M29.5 30H36.5L41.5 35V47.5H29.5Z';
const ICON_PLUS = 'M35.5 38.5V44M32.75 41.25H38.25';
const ICON_BOX = { x0: 28, y0: 29, x1: 43, y1: 48.5 };
const ICON_C = { x: 35.5, y: 39 }; // centre d'agrandissement du pictogramme aux petites tailles (≈ centre du disque)

function tierOf(n) { return n >= 40 ? 'full' : n >= 32 ? 'mid' : 'small'; }

// Géométrie de la taille n : cadrage (vb, en unités du logo), marge en pixels, épaisseur du trait, pictogramme, halo flou ou plat.
function geometry(n) {
  const tier = tierOf(n);
  const m = n >= 64 ? Math.round(n / 64) : 0.5;           // marge : le pourtour reste transparent malgré l'anticrénelage
  // Avec flou : carré de 60 autour du dessin et de son halo (comme la barre de titre) ; sans flou : carré de 52 autour des deux disques.
  const vb = tier === 'full' ? { x: 14, y: 10, s: 60 } : { x: 14.7, y: 14, s: 52 };
  const k = (n - 2 * m) / vb.s;                           // pixels par unité du logo
  const g = { n, tier, m, vb, k, blur: tier === 'full', iconScale: 1 };
  if (tier === 'full') { g.stroke = 2; g.icon = ICON_FULL; }
  else if (tier === 'mid') { g.stroke = 2.5; g.icon = ICON_FULL; }
  else { g.stroke = n >= 24 ? 2.9 : n >= 20 ? 3 : 2.9; g.icon = n >= 24 ? ICON_PAGE + ICON_PLUS : ICON_PAGE; g.iconScale = n >= 24 ? 1.1 : n >= 20 ? 1.2 : 1.3; }
  return g;
}

// Unités du logo → pixels de l'image n × n.
const toPx = (g, ux, uy) => ({ x: g.m + (ux - g.vb.x) * g.k, y: g.m + (uy - g.vb.y) * g.k });

const f3 = (v) => +v.toFixed(3);
function svg(n) {
  const g = geometry(n);
  const sc = f3(g.k), tx = f3(g.m - g.vb.x * g.k), ty = f3(g.m - g.vb.y * g.k);
  const grad = `<radialGradient id="g" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(35.2 28.56) scale(34.32)">` +
    COLORS.grad.map((c, i) => `<stop offset="${[0, 0.4, 0.72, 1][i]}" stop-color="${c}"/>`).join('') + '</radialGradient>';
  const blur = `<filter id="b" x="17.2" y="13.2" width="53.6" height="53.6" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${BLUR}"/></filter>`;
  const halo = g.blur
    ? `<g opacity="0.9" filter="url(#b)"><circle cx="${HALO.cx}" cy="${HALO.cy}" r="${HALO.r}" fill="${COLORS.halo}"/></g><circle cx="${HALO.cx}" cy="${HALO.cy}" r="${HALO.r}" fill="url(#g)"/>`
    : `<circle cx="${HALO.cx}" cy="${HALO.cy}" r="${HALO.r}" fill="${COLORS.halo}"/>`;
  const body = `<circle cx="${DISC.cx}" cy="${DISC.cy}" r="${DISC.r}" fill="${COLORS.disc}"/>` +
    `<path d="${g.icon}"${g.iconScale !== 1 ? ` transform="translate(${ICON_C.x} ${ICON_C.y}) scale(${g.iconScale}) translate(${-ICON_C.x} ${-ICON_C.y})"` : ''} fill="none" stroke="${COLORS.stroke}" stroke-width="${g.stroke}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n}" height="${n}"><defs>${g.blur ? grad + blur : ''}</defs>` +
    `<g transform="matrix(${sc} 0 0 ${sc} ${tx} ${ty})">${halo}${body}</g></svg>`;
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

// Pixel (x, y) d'une image décodée, coordonnées arrondies et bornées.
function pixel(p, x, y) {
  x = Math.min(p.width - 1, Math.max(0, Math.round(x))); y = Math.min(p.height - 1, Math.max(0, Math.round(y)));
  const i = (y * p.width + x) * 4;
  return { r: p.rgba[i], g: p.rgba[i + 1], b: p.rgba[i + 2], a: p.rgba[i + 3] };
}

module.exports = { SIZES, COLORS, HALO, DISC, ICON_BOX, ICON_C, tierOf, geometry, toPx, svg, buildIco, readIco, decodePng, pixel };
