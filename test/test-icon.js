// Icône de l'application (build/icon.ico) = logo Orical PDF (build/logo-orical-pdf.svg), dessiné à chaque taille (scripts/icon-geometry.js).
// Vérifie, à TOUTES les tailles : fond transparent (coins, pourtour), halo rouge à droite du disque, disque sombre, trait rose du
// pictogramme, aucun pixel sombre hors du disque, aucun blanc (lignes blanches de l'ancien logo) ; flou seulement à 40 px et plus ;
// logo source identique dans build/ et src/assets/, anciens logos absents ; références cohérentes (package.json, main.js, installeur).
// Si build/pdf-file.ico existe : mêmes contrôles de format pour l'icône des fichiers PDF (détail dans test-pdf-icon, appelé à la fin).
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
check('tailles prévues : 16, 20, 24, 32, 40, 48, 64, 256', JSON.stringify(G.SIZES) === '[16,20,24,32,40,48,64,256]');
check('niveaux de détail : flou à 40 px et plus seulement, halo plat en dessous ; trait épaissi en dessous de 40 px', G.SIZES.every((n) => G.geometry(n).blur === (n >= 40) && /feGaussianBlur/.test(G.svg(n)) === (n >= 40)) && G.SIZES.every((n) => n >= 40 || G.geometry(n).stroke > 2));
check('pictogramme : d\'origine à 32 px et plus, page + plus à 24 px, page seule à 16 / 20 px (agrandi dans le disque)', G.geometry(32).iconScale === 1 && /M35\.5 38V44/.test(G.svg(32)) && /M35\.5 38\.5V44/.test(G.svg(24)) && !/V44/.test(G.svg(20)) && !/V44/.test(G.svg(16)) && G.geometry(16).iconScale > 1);

// 3. Images de build/icon.ico
function analyse(file, probes) {
  const ico = G.readIco(fs.readFileSync(path.join(root, file)));
  const imgs = ico.map((e) => Object.assign({ size: e.size }, G.decodePng(e.data)));
  const report = { tailles: ico.map((e) => e.size), carre: imgs.every((p) => p.width === p.size && p.height === p.size), fond: [], details: [] };
  for (const p of imgs) {
    const n = p.size;
    let edge = 0;
    for (let i = 0; i < n; i++) for (const [x, y] of [[i, 0], [i, n - 1], [0, i], [n - 1, i]]) if (G.pixel(p, x, y).a > 8) edge++;
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

// 4. Références
const pkg = require('../package.json');
check('package.json : build.icon et build.win.icon = build/icon.ico (exécutable, installeur, désinstalleur)', pkg.build.icon === 'build/icon.ico' && pkg.build.win.icon === 'build/icon.ico' && pkg.build.files.includes('build/icon.ico'));
check('main.js : icône de la fenêtre (barre des tâches) = build/icon.ico', read('main.js').includes("icon: path.join(__dirname, 'build', 'icon.ico')"));
check('make-icon : chaque taille dessinée à sa taille par icon-geometry (pas de réduction d\'une grande image)', /rasterize\(svg\(n\), n\)/.test(read('scripts/make-icon.js')));

module.exports = { analyse, isRed, isDark, isPink, isWhite };
if (require.main === module) {
  console.log(failures.length ? `\n${failures.length} échec(s) / ${passed + failures.length}` : `\nOK : ${passed} vérifications.`);
  process.exit(failures.length ? 1 : 0);
}
