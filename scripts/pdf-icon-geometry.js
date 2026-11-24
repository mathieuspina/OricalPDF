// Icône des FICHIERS PDF associés à Orical PDF (build/pdf-file.ico, DefaultIcon de la classe OricalPDF.pdf) : proposition C validée.
// Repère 100 × 100 : page rouge #F23A3A à coin plié rose #FFB9B9, disque sombre #121214 (centre 46, 62, r 23) portant le pictogramme du
// logo (page + plus) en trait rose, lettrage « PDF » #121214 en haut à gauche de la page, DESSINÉ EN TRACÉS (aucune police : rendu
// identique partout). Chaque taille est dessinée à sa taille, fond transparent :
//   - 40 à 256 px : complet (lettrage, pictogramme page + plus) ; trait du pictogramme épaissi à 40-48 px ;
//   - 32 px : complet, traits épaissis (lettrage et pictogramme) ;
//   - 16 à 24 px : page + coin + disque + petit plus rose épais ; ni lettrage ni page dans le disque.
// Variante « dégradé » (option) : dégradé radial du logo sur la page rouge (planche de comparaison) ; la variante retenue est PAGE_FILL.
// Pur (Node seul) : utilisé par scripts/make-icon.js --target pdf et test/test-icon.js. Outils ICO / PNG : scripts/icon-geometry.js.
const SIZES = [16, 20, 24, 32, 40, 48, 64, 256];
const COLORS = { page: '#F23A3A', fold: '#FFB9B9', disc: '#121214', stroke: '#FFB9B9', letters: '#121214', grad: ['#FFD0D0', '#F64E4E', '#F02C2C', '#E31414'] };
const PAGE = 'M26 8H58L80 30V86Q80 92 74 92H26Q20 92 20 86V14Q20 8 26 8Z';
const FOLD = 'M58 8V24Q58 30 64 30H80Z';
const DISC = { cx: 46, cy: 62, r: 23 };
const ICON = 'M38 50H47L54 57V72H38Z M47 50V57H54 M46 60V68 M42 64H50';
const PLUS_SMALL = { arm: 8.5 };   // demi-longueur des branches du petit plus (16-24 px), centré sur le disque
// « PDF » en tracés (x 27-53, y 17-26) : P = fût + panse, D = fût + demi-cercle, F = fût + 2 barres.
const LETTERS = 'M28.2 25.8V17.2H31.3A2.9 2.9 0 0 1 31.3 23H28.2 M37.2 17.2H39.6A4.3 4.3 0 0 1 39.6 25.8H37.2Z M51.8 17.2H47V25.8M47 21.4H50.6';
const LETTER_BOX = { x0: 27, y0: 16, x1: 53, y1: 27 };
const VB = { x: 8, y: 8, s: 84 }; // carré autour de la page (20..80 × 8..92)
let PAGE_FILL = 'flat';           // 'flat' (rouge uni) ou 'gradient' (dégradé radial du logo)

function tierOf(n) { return n >= 40 ? 'full' : n >= 32 ? 'mid' : 'small'; }

function geometry(n, variant) {
  const tier = tierOf(n);
  const m = n >= 64 ? Math.round(n / 64) : 0.5;
  const k = (n - 2 * m) / VB.s;
  const g = { n, tier, m, vb: VB, k, fill: variant || PAGE_FILL };
  g.letters = tier !== 'small';
  g.letterStroke = tier === 'mid' ? 3.2 : 2.4;
  // Trait du pictogramme : au moins ~1,1 px à l'écran, 2 unités au plus grand.
  g.iconStroke = tier === 'small' ? Math.max(5, 1.25 / k) : Math.max(2, Math.min(3.4, 1.15 / k));
  g.icon = tier === 'small' ? `M${DISC.cx} ${DISC.cy - PLUS_SMALL.arm}V${DISC.cy + PLUS_SMALL.arm}M${DISC.cx - PLUS_SMALL.arm} ${DISC.cy}H${DISC.cx + PLUS_SMALL.arm}` : ICON;
  return g;
}

const toPx = (g, ux, uy) => ({ x: g.m + (ux - g.vb.x) * g.k, y: g.m + (uy - g.vb.y) * g.k });
const f3 = (v) => +v.toFixed(3);

function svg(n, variant) {
  const g = geometry(n, variant);
  const sc = f3(g.k), tx = f3(g.m - g.vb.x * g.k), ty = f3(g.m - g.vb.y * g.k);
  const grad = g.fill === 'gradient'
    ? '<radialGradient id="p" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(32 20) scale(90)">' +
      COLORS.grad.map((c, i) => `<stop offset="${[0, 0.4, 0.72, 1][i]}" stop-color="${c}"/>`).join('') + '</radialGradient>' : '';
  const page = `<path d="${PAGE}" fill="${g.fill === 'gradient' ? 'url(#p)' : COLORS.page}"/><path d="${FOLD}" fill="${COLORS.fold}"/>`;
  const letters = g.letters ? `<path d="${LETTERS}" fill="none" stroke="${COLORS.letters}" stroke-width="${g.letterStroke}" stroke-linecap="butt" stroke-linejoin="round"/>` : '';
  const disc = `<circle cx="${DISC.cx}" cy="${DISC.cy}" r="${DISC.r}" fill="${COLORS.disc}"/>` +
    `<path d="${g.icon}" fill="none" stroke="${COLORS.stroke}" stroke-width="${f3(g.iconStroke)}" stroke-linecap="${g.tier === 'small' ? 'butt' : 'round'}" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n}" height="${n}"><defs>${grad}</defs>` +
    `<g transform="matrix(${sc} 0 0 ${sc} ${tx} ${ty})">${page}${letters}${disc}</g></svg>`;
}

module.exports = { SIZES, COLORS, PAGE, FOLD, DISC, ICON, LETTERS, LETTER_BOX, VB, get PAGE_FILL() { return PAGE_FILL; }, setPageFill: (v) => { PAGE_FILL = v; }, tierOf, geometry, toPx, svg };
