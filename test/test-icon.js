// Icône (build/icon.ico) = logo d'origine SANS fond, dessiné à chaque taille (scripts/icon-geometry.js). Vérifie, à TOUTES les tailles :
// fond transparent aux coins et sur le pourtour, aucun pixel sombre quasi opaque (plus de « tache noire »), document rouge, lignes blanches ;
// anneaux présents à 32 px et plus ; un arc à 16 / 20 px ; références cohérentes (package.json, main.js, installeur).
// Usage : node test/test-icon.js   (régénérer l'icône : npx electron scripts/make-icon.js)
const fs = require('fs');
const path = require('path');
const G = require('../scripts/icon-geometry.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

check('tailles prévues : 16, 20, 24, 32, 40, 48, 64, 256', JSON.stringify(G.SIZES) === '[16,20,24,32,40,48,64,256]');
check('niveaux de détail : 40-256 fidèle (4 anneaux), 24-32 (2 anneaux épais), 16-20 (un arc)', G.SIZES.every((n) => G.geometry(n).rings.length === (n >= 40 ? 4 : n >= 24 ? 2 : 1)) && G.geometry(32).rings.every((r) => r.stroke >= 1.5 && r.opacity >= 0.6));
const ico = G.readIco(fs.readFileSync(path.join(root, 'build', 'icon.ico')));
check('build/icon.ico contient exactement ces tailles', JSON.stringify(ico.map((e) => e.size)) === JSON.stringify(G.SIZES), ico.map((e) => e.size));
const imgs = ico.map((e) => Object.assign({ size: e.size }, G.decodePng(e.data)));
check('chaque entrée est un PNG carré de la bonne taille', imgs.every((p) => p.width === p.size && p.height === p.size), imgs.map((p) => [p.size, p.width, p.height]));

const px = (p, x, y) => { x = Math.round(x); y = Math.round(y); const i = (y * p.width + x) * 4; return { r: p.rgba[i], g: p.rgba[i + 1], b: p.rgba[i + 2], a: p.rgba[i + 3] }; };
const around = (p, x, y) => { let best = { a: 0 }; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const c = px(p, Math.min(p.size - 1, Math.max(0, x + dx)), Math.min(p.size - 1, Math.max(0, y + dy))); if (c.a > best.a) best = c; } return best; };
const isRed = (c) => c.a > 200 && c.r > 150 && c.r > c.g + 90 && c.r > c.b + 80;
const isWhite = (c) => c.a > 200 && c.r > 220 && c.g > 220 && c.b > 220;

const report = { fond: [], sombre: [], rouge: [], lignes: [], anneaux: [] };
for (const p of imgs) {
  const n = p.size, g = G.geometry(n);
  // Fond : coins et pourtour (première et dernière ligne / colonne) transparents.
  let edge = 0;
  for (let i = 0; i < n; i++) for (const [x, y] of [[i, 0], [i, n - 1], [0, i], [n - 1, i]]) if (px(p, x, y).a > 8) edge++;
  if (edge || [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]].some(([x, y]) => px(p, x, y).a)) report.fond.push(n + ' px : ' + edge + ' pixel(s) du pourtour non transparents');
  let transparent = 0, dark = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const c = px(p, x, y); if (c.a === 0) transparent++; if (c.a > 200 && Math.max(c.r, c.g, c.b) < 70) dark++; }
  if (transparent < n * n * 0.25) report.fond.push(n + ' px : seulement ' + Math.round(100 * transparent / (n * n)) + ' % transparent');
  if (dark) report.sombre.push(n + ' px : ' + dark + ' pixel(s)');
  // Document rouge (près du coin haut-gauche, partie claire du dégradé) et lignes blanches complètes (centre de chaque ligne).
  if (!isRed(px(p, g.x + Math.max(1, g.w * 0.15), g.y + Math.max(1, g.h * 0.15)))) report.rouge.push(n + ' px');
  for (const l of g.lines) {
    const xs = [l.x + Math.min(1, l.w / 4), l.x + l.w / 2, l.x + l.w - 1 - Math.min(1, l.w / 4)];
    if (!xs.every((x) => isWhite(px(p, Math.floor(x), l.y + Math.floor((l.h - 1) / 2))))) { report.lignes.push(`${n} px : ligne y=${l.y}`); break; }
  }
  // Anneaux (>= 24 px) : rouge visible sur chaque anneau, hors du document ; arc (16 / 20 px) : rouge à gauche du document.
  if (n >= 24) {
    const miss = g.rings.filter((r) => { const q = G.ringProbe(g, r); const c = around(p, q.x, q.y); return !(c.a > 40 && c.r > c.g + 60); });
    if (miss.length) report.anneaux.push(`${n} px : anneau(x) ${miss.map((r) => r.angle).join(', ')}° absent(s)`);
  } else {
    let arc = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < g.x - 1; x++) { const c = px(p, x, y); if (c.a > 120 && c.r > c.g + 90) arc++; }
    if (arc < 3) report.anneaux.push(`${n} px : arc absent (${arc} pixel(s))`);
  }
}
check('toutes les tailles : fond transparent (coins, pourtour, au moins 25 % de l\'image)', !report.fond.length, report.fond);
check('toutes les tailles : aucun pixel sombre quasi opaque (plus de carré sombre ni de halo)', !report.sombre.length, report.sombre);
check('toutes les tailles : document rouge', !report.rouge.length, report.rouge);
check('toutes les tailles : 3 lignes blanches nettes', !report.lignes.length, report.lignes);
check('anneaux présents à 24 px et plus (chaque anneau), un arc à 16 / 20 px', !report.anneaux.length, report.anneaux);

const pkg = require('../package.json');
check('package.json : build.icon et build.win.icon = build/icon.ico (exécutable, installeur, désinstalleur)', pkg.build.icon === 'build/icon.ico' && pkg.build.win.icon === 'build/icon.ico' && pkg.build.files.includes('build/icon.ico'));
check('main.js : icône de la fenêtre (barre des tâches) = build/icon.ico', read('main.js').includes("icon: path.join(__dirname, 'build', 'icon.ico')"));
check('installeur : DefaultIcon de la classe .pdf = icône de l\'exécutable', /DefaultIcon" "" "\$0,0"/.test(read('build/installer.nsh')));
check('make-icon : chaque taille dessinée à sa taille par icon-geometry (pas de réduction d\'une grande image)', /rasterize\(svg\(n\), n\)/.test(read('scripts/make-icon.js')) && !fs.existsSync(path.join(root, 'build', 'logo-small.svg')));

console.log(failures.length ? `\n${failures.length} échec(s) / ${passed + failures.length}` : `\nOK : ${passed} vérifications.`);
process.exit(failures.length ? 1 : 0);
