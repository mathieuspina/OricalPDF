// Icône de l'application (build/icon.ico) = logo Orical PDF (build/logo-orical-pdf.svg), dessiné à chaque taille (scripts/icon-geometry.js).
// Vérifie, à TOUTES les tailles : fond transparent (coins, pourtour), halo rouge à droite du disque, disque sombre, trait rose du
// pictogramme, aucun pixel sombre hors du disque, aucun blanc (lignes blanches de l'ancien logo) ; cadrage serré, sans flou (1.5.0) ;
// logo source identique dans build/ et src/assets/, anciens logos absents ; références cohérentes (package.json, main.js, installeur).
// Icône des fichiers PDF (build/pdf-file.ico, scripts/pdf-icon-geometry.js) : section 4.
// Usage : node test/test-icon.js   (régénérer l'icône : npx electron scripts/make-icon.js)
const fs = require('fs');
const path = require('path');
const G = require('../scripts/icon-geometry.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));

// 1. Source du logo et anciens fichiers
check('logo source : build/logo-orical-pdf.svg = src/assets/logo-orical-pdf.svg (copie à l\'identique)', exists('build/logo-orical-pdf.svg') && read('build/logo-orical-pdf.svg') === read('src/assets/logo-orical-pdf.svg'));
check('logo source : halo flou, dégradé radial, disque #121214, trait #FFB9B9', /feGaussianBlur stdDeviation="2.4"/.test(read('build/logo-orical-pdf.svg')) && /radialGradient/.test(read('build/logo-orical-pdf.svg')) && /#121214/.test(read('build/logo-orical-pdf.svg')) && /stroke="#FFB9B9"/.test(read('build/logo-orical-pdf.svg')));
const oldFiles = ['build/logo.svg', 'build/logo-mark.svg', 'build/logo-mark-small.svg', 'src/assets/logo.svg', 'src/assets/logo-mark.svg', 'src/assets/logo-mark-small.svg'].filter(exists);
check('anciens logos supprimés (build/ et src/assets/)', oldFiles.length === 0, oldFiles);
const html = read('src/index.html');
check('interface : favicon, accueil, À propos, aide, chargement = logo-orical-pdf.svg ; barre de titre = logo inline (halo + disque)', (html.match(/assets\/logo-orical-pdf\.svg/g) || []).length >= 6 &&
  /rel="icon" href="assets\/logo-orical-pdf\.svg"/.test(html) && /id="brand-mark"[\s\S]{0,400}tb-blur[\s\S]{0,1200}class="halo"[\s\S]{0,600}#121214[\s\S]{0,900}#FFB9B9/.test(html) && /spinner\.src = 'assets\/logo-orical-pdf\.svg'/.test(read('src/js/viewer.js')));

// 2. Géométrie
check('tailles prévues : 16, 20, 24, 32, 40, 48, 64, 128, 256', JSON.stringify(G.SIZES) === '[16,20,24,32,40,48,64,128,256]');
// 1.5.0 : le logo remplit l'image (barre des tâches) : même cadrage serré (carré de 52 centré sur les disques) à toutes les tailles,
// le dessin occupe au moins 90 % de la largeur (avant : 82 % de 40 à 256 px) ; plus de halo flou (il imposait un carré de 60 : 84 % de la largeur, dessin décalé).
check('cadrage serré : carré de 52 centré sur les deux disques, dessin ≥ 90 % de la largeur (avant : 82 % à 40 px et plus)', G.SIZES.every((n) => { const g = G.geometry(n); const x0 = G.DISC.cx - G.DISC.r, x1 = G.HALO.cx + G.HALO.r; return g.vb.s === 52 && (x1 - x0) * g.k / n >= 0.9 && Math.abs((g.vb.x + g.vb.s / 2) - (x0 + x1) / 2) < 0.1; }));
check('niveaux de détail : aucun flou ; dégradé radial à 40 px et plus, halo plat en dessous ; trait épaissi en dessous de 40 px', G.SIZES.every((n) => !G.geometry(n).blur && !/feGaussianBlur/.test(G.svg(n)) && /radialGradient/.test(G.svg(n)) === (n >= 40)) && G.SIZES.every((n) => n >= 40 || G.geometry(n).stroke > 2));
check('pictogramme : d\'origine à 32 px et plus, page + plus à 24 px, page seule à 16 / 20 px (agrandi dans le disque)', G.geometry(32).iconScale === 1 && /M35\.5 38V44/.test(G.svg(32)) && /M35\.5 38\.5V44/.test(G.svg(24)) && !/V44/.test(G.svg(20)) && !/V44/.test(G.svg(16)) && G.geometry(16).iconScale > 1);

// 3. Images de build/icon.ico
function analyse(file, probes, sidesOnly) {
  const ico = G.readIco(fs.readFileSync(path.join(root, file)));
  const imgs = ico.map((e) => Object.assign({ size: e.size }, G.decodePng(e.data)));
  const report = { tailles: ico.map((e) => e.size), carre: imgs.every((p) => p.width === p.size && p.height === p.size), fond: [], details: [] };
  for (const p of imgs) {
    const n = p.size;
    let edge = 0;
    for (let i = 0; i < n; i++) for (const [x, y] of (sidesOnly ? [[0, i], [n - 1, i]] : [[i, 0], [i, n - 1], [0, i], [n - 1, i]])) if (G.pixel(p, x, y).a > 8) edge++;
    let transparent = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (G.pixel(p, x, y).a === 0) transparent++;
    // Pourtour transparent à 40 px et plus ; en dessous, le dessin peut toucher le bord (au plus le quart du pourtour, coins transparents).
    const corners = [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]].filter(([x, y]) => G.pixel(p, x, y).a > 8).length;
    if (n >= 40 ? edge : (corners || edge > n)) report.fond.push(n + ' px : ' + edge + ' pixel(s) du pourtour non transparents, ' + corners + ' coin(s)');
    if (transparent < n * n * 0.15) report.fond.push(n + ' px : seulement ' + Math.round(100 * transparent / (n * n)) + ' % transparent');
    const miss = probes(p, n);
    if (miss.length) report.details.push(n + ' px : ' + miss.join(', '));
  }
  return report;
}
const isRed = (c) => c.a > 150 && c.r > 170 && c.r > c.g + 80 && c.r > c.b + 80;
const isDark = (c) => c.a > 200 && Math.max(c.r, c.g, c.b) < 60;
const isPink = (c) => c.a > 120 && c.r > 160 && c.g > 90 && c.b > 90 && c.r > c.g + 25 && c.g < 225;
const isWhite = (c) => c.a > 200 && c.r > 232 && c.g > 232 && c.b > 232;
const app = analyse('build/icon.ico', (p, n) => {
  const g = G.geometry(n), miss = [];
  const at = (ux, uy) => { const q = G.toPx(g, ux, uy); return G.pixel(p, q.x, q.y); };
  if (!isRed(at(G.HALO.cx + G.HALO.r - 4.5, G.HALO.cy))) miss.push('halo rouge');
  if (!isDark(at(G.DISC.cx - G.DISC.r + 3.5, G.DISC.cy))) miss.push('disque sombre');
  // Trait rose : pixels roses dans la boîte du pictogramme (agrandie aux petites tailles).
  const s = g.iconScale, a = G.toPx(g, G.ICON_C.x + (G.ICON_BOX.x0 - G.ICON_C.x) * s, G.ICON_C.y + (G.ICON_BOX.y0 - G.ICON_C.y) * s), b = G.toPx(g, G.ICON_C.x + (G.ICON_BOX.x1 - G.ICON_C.x) * s, G.ICON_C.y + (G.ICON_BOX.y1 - G.ICON_C.y) * s);
  let pink = 0;
  for (let y = Math.floor(a.y); y <= Math.ceil(b.y); y++) for (let x = Math.floor(a.x); x <= Math.ceil(b.x); x++) if (isPink(G.pixel(p, x, y))) pink++;
  if (pink < Math.max(4, n / 3)) miss.push('trait rose (' + pink + ' px)');
  // Aucun pixel sombre hors du disque, aucun blanc (ancien logo : document rouge à lignes blanches).
  const c = G.toPx(g, G.DISC.cx, G.DISC.cy), R = G.DISC.r * g.k + 1.5;
  let darkOut = 0, white = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const q = G.pixel(p, x, y); if (isDark(q) && Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) > R) darkOut++; if (isWhite(q)) white++; }
  if (darkOut) miss.push(darkOut + ' pixel(s) sombre(s) hors du disque');
  if (white) miss.push(white + ' pixel(s) blanc(s) (ancien dessin ?)');
  return miss;
});
check('build/icon.ico contient exactement ces tailles, en PNG carrés', JSON.stringify(app.tailles) === JSON.stringify(G.SIZES) && app.carre, app.tailles);
check('toutes les tailles : fond transparent (coins, pourtour, au moins 15 % de l\'image)', !app.fond.length, app.fond);
check('toutes les tailles : halo rouge, disque sombre, trait rose ; rien de sombre hors du disque ; aucun blanc de l\'ancien logo', !app.details.length, app.details);

// 4. Icône des fichiers PDF (build/pdf-file.ico, scripts/pdf-icon-geometry.js) : mêmes tailles, fond transparent, page rouge unie à coin
// rose, disque sombre et plus rose ; lettrage « PDF » en tracés à 32 px et plus, omis de 16 à 24 px.
const P = require('../scripts/pdf-icon-geometry.js');
check('icône PDF : lettrage en TRACÉS (aucun <text>, aucune police), omis à 16-24 px ; page unie retenue', P.SIZES.every((n) => !/<text|font/.test(P.svg(n)) && /M28\.2 25\.8V17\.2/.test(P.svg(n)) === (n >= 32)) && P.PAGE_FILL === 'flat' && /fill="#F23A3A"/.test(P.svg(64)));
const pdf = analyse('build/pdf-file.ico', (p, n) => {
  const g = P.geometry(n), miss = [];
  const at = (ux, uy) => { const q = P.toPx(g, ux, uy); return G.pixel(p, q.x, q.y); };
  if (!isRed(at(25, 30))) miss.push('page rouge');
  if (!isPink(at(62, 22))) miss.push('coin plié rose');
  if (!isDark(at(P.DISC.cx - P.DISC.r + 4, P.DISC.cy))) miss.push('disque sombre');
  const c = P.toPx(g, P.DISC.cx, P.DISC.cy), R = P.DISC.r * g.k;
  let pink = 0, letters = 0, white = 0;
  const a = P.toPx(g, P.LETTER_BOX.x0, P.LETTER_BOX.y0), b = P.toPx(g, P.LETTER_BOX.x1, P.LETTER_BOX.y1);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const q = G.pixel(p, x, y);
    if (isPink(q) && Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) < R) pink++;
    if (x >= a.x && x <= b.x && y >= a.y && y <= b.y && q.a > 200 && Math.max(q.r, q.g, q.b) < 120) letters++;
    if (isWhite(q)) white++;
  }
  if (pink < Math.max(4, n / 3)) miss.push('plus / pictogramme rose (' + pink + ' px)');
  if (n >= 32 ? letters < n / 4 : letters > 0) miss.push('lettrage « PDF » (' + letters + ' px sombres)');
  if (white) miss.push(white + ' pixel(s) blanc(s)');
  return miss;
}, true); // la page occupe toute la hauteur : seuls les côtés gauche et droit du pourtour sont contrôlés
check('build/pdf-file.ico : exactement ses 8 tailles (16 à 256, sans 128), en PNG carrés', JSON.stringify(pdf.tailles) === JSON.stringify(P.SIZES) && JSON.stringify(P.SIZES) === '[16,20,24,32,40,48,64,256]' && pdf.carre, pdf.tailles);
check('icône PDF, toutes les tailles : fond transparent (coins ; bords gauche et droit à 40 px et plus ; au moins 15 %)', !pdf.fond.length, pdf.fond);
check('icône PDF, toutes les tailles : page rouge, coin rose, disque sombre, plus rose, lettrage seulement à 32 px et plus, aucun blanc', !pdf.details.length, pdf.details);

// 5. Références
const pkg = require('../package.json');
check('package.json : build.icon et build.win.icon = build/icon.ico (exécutable, installeur, désinstalleur)', pkg.build.icon === 'build/icon.ico' && pkg.build.win.icon === 'build/icon.ico' && pkg.build.files.includes('build/icon.ico'));
check('main.js : icône de la fenêtre (barre des tâches) = build/icon.ico', read('main.js').includes("icon: path.join(__dirname, 'build', 'icon.ico')"));
check('installeur / désinstalleur : nsis.installerIcon et nsis.uninstallerIcon = build/icon.ico (1.5.0, explicites)', pkg.build.nsis.installerIcon === 'build/icon.ico' && pkg.build.nsis.uninstallerIcon === 'build/icon.ico');
check('main.js : AppUserModelID = appId (fenêtre rangée sous le raccourci, icône de l\'exécutable)', read('main.js').includes(`app.setAppUserModelId('${pkg.build.appId}')`));
check('make-icon : chaque taille dessinée à sa taille par icon-geometry (pas de réduction d\'une grande image)', /rasterize\(svgOf\(n\), n\)/.test(read('scripts/make-icon.js')) && /AppIcon\.svg\(n\)/.test(read('scripts/make-icon.js')) && /PdfIcon\.svg\(n\)/.test(read('scripts/make-icon.js')));

module.exports = { analyse, isRed, isDark, isPink, isWhite };
if (require.main === module) {
  console.log(failures.length ? `\n${failures.length} échec(s) / ${passed + failures.length}` : `\nOK : ${passed} vérifications.`);
  process.exit(failures.length ? 1 : 0);
}
