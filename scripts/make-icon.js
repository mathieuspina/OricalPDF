// Génère build/icon.ico (16, 20, 24, 32, 40, 48, 64, 256) et build/icon-512.png en rasterisant le logo avec Electron.
// Logo d'origine SANS fond (ni carré arrondi sombre ni contour) : fond transparent à toutes les tailles. Chaque taille est dessinée à sa
// taille (scripts/icon-geometry.js : document calé sur les pixels, anneaux adaptés à la taille) et rendue à la taille exacte, pas réduite
// depuis une grande image (sinon flou et « tache » dans l'Explorateur et la barre des tâches). Fenêtres cachées, hors écran (show: false).
// Usage : npx electron scripts/make-icon.js [--preview dossier [--old ancienne.ico]]   (--preview écrit chaque taille en PNG et une planche
//         d'aperçu agrandie, avant / après)
// Aucune dépendance supplémentaire : l'ICO est assemblé à la main (entrées PNG). Géométrie pure : scripts/icon-geometry.js (testée).
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { SIZES, svg, buildIco } = require('./icon-geometry.js');

const build = path.join(__dirname, '..', 'build');
const previewIdx = process.argv.indexOf('--preview');
const previewDir = previewIdx > 0 ? process.argv[previewIdx + 1] : null;
const oldIdx = process.argv.indexOf('--old'); // --old fichier.ico : icône « avant » de la planche (sinon build/icon.ico avant écrasement)
const oldFile = oldIdx > 0 ? process.argv[oldIdx + 1] : path.join(build, 'icon.ico');
const CANVAS = 1024;

// Une seule fenêtre hors-écran réutilisée pour toutes les rasterisations ; capture du coin haut-gauche à la taille demandée.
let win = null;
async function page() {
  if (win) return win;
  win = new BrowserWindow({ show: false, width: CANVAS, height: CANVAS, useContentSize: true, transparent: true, frame: false, webPreferences: { offscreen: true } });
  const html = '<html><body style="margin:0;background:transparent;overflow:hidden"><img id="i" style="display:block"></body></html>';
  await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  return win;
}
async function rasterize(svg, px) {
  const w = await page();
  const uri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  await w.webContents.executeJavaScript(`new Promise((res, rej) => { const i = document.getElementById('i'); i.style.width = i.style.height = '${px}px'; i.onload = () => res(); i.onerror = () => rej(new Error('image')); i.src = ${JSON.stringify(uri)}; })`);
  await new Promise((r) => setTimeout(r, 400));
  const img = await w.webContents.capturePage({ x: 0, y: 0, width: px, height: px });
  const s = img.getSize();
  return s.width === px ? img : img.resize({ width: px, height: px, quality: 'best' }); // écran à mise à l'échelle ≠ 100 %
}

// Planche d'aperçu : lignes = tailles 16 à 64 agrandies d'un facteur entier (pixels nets) et 256 px réduit de moitié, plus une ligne à
// taille réelle ; colonnes = avant / après sur fond clair, sombre (barre des tâches) et damier (transparence). Tient dans un écran.
async function previewSheet(dir, oldIco, images) {
  const pick = (ico, n) => { if (!ico) return null; const c = ico.readUInt16LE(4); for (let i = 0; i < c; i++) { const o = 6 + 16 * i; if ((ico[o] || 256) === n) return ico.subarray(ico.readUInt32LE(o + 12), ico.readUInt32LE(o + 12) + ico.readUInt32LE(o + 8)); } return null; };
  const show = [16, 20, 24, 32, 40, 48, 64, 256];
  const k = (n) => (n >= 256 ? 0.5 : Math.max(2, Math.floor(112 / n)));
  const tag = (buf, px) => (buf ? `<img style="width:${px}px;height:${px}px${px === 128 ? ';image-rendering:auto' : ''}" src="data:image/png;base64,${buf.toString('base64')}">` : '—');
  const of = (ico, n) => (ico ? pick(ico, n) : images[SIZES.indexOf(n)]);
  const bgs = [['clair', '#ffffff'], ['sombre', '#202020'], ['damier', 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/16px 16px']];
  const cols = bgs.flatMap(([l, bg]) => [...(oldIco ? [['AVANT', l, bg, oldIco]] : []), ['APRÈS', l, bg, null]]);
  const rows = show.map((n) => `<tr><th>${n} px<br><small>× ${k(n)}</small></th>${cols.map((c) => `<td style="background:${c[2]}">${tag(of(c[3], n), n * k(n))}</td>`).join('')}</tr>`).join('') +
    `<tr><th>taille<br>réelle</th>${cols.map((c) => `<td style="background:${c[2]}">${show.filter((n) => n <= 32).map((n) => tag(of(c[3], n), n)).join(' ')}<br>${show.filter((n) => n > 32 && n <= 64).map((n) => tag(of(c[3], n), n)).join(' ')}</td>`).join('')}</tr>`;
  const html = `<html><head><meta charset="utf-8"><style>body{margin:0;padding:12px;background:#f3f3f3;font:13px Segoe UI,sans-serif;color:#222}table{border-collapse:collapse}th{padding:4px 8px;font-weight:600;white-space:nowrap}small{font-weight:400;color:#666}td{padding:6px;border:1px solid #ccc;text-align:center;vertical-align:middle;white-space:nowrap}img{image-rendering:pixelated;display:inline-block;vertical-align:middle}</style></head><body>
<table><tr><th></th>${cols.map((c) => `<th>${c[0]}<br><small>${c[1]}</small></th>`).join('')}</tr>${rows}</table></body></html>`;
  const w = new BrowserWindow({ show: false, width: 1500, height: 2400, enableLargerThanScreen: true, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  await new Promise((r) => setTimeout(r, 600));
  const size = JSON.parse(await w.webContents.executeJavaScript('(() => { const r = document.querySelector("table").getBoundingClientRect(); return JSON.stringify([Math.ceil(r.right + 12), Math.ceil(r.bottom + 12)]); })()'));
  const img = await w.webContents.capturePage({ x: 0, y: 0, width: Math.min(1500, size[0]), height: Math.min(2400, size[1]) });
  fs.writeFileSync(path.join(dir, 'apercu-icone.png'), img.toPNG());
  w.destroy();
}

async function main() {
  const images = [];
  for (const n of SIZES) images.push((await rasterize(svg(n), n)).toPNG());
  const oldIco = fs.existsSync(oldFile) ? fs.readFileSync(oldFile) : null;
  if (previewDir) {
    fs.mkdirSync(previewDir, { recursive: true });
    SIZES.forEach((s, i) => fs.writeFileSync(path.join(previewDir, `icon-${s}.png`), images[i]));
    await previewSheet(previewDir, oldIco, images);
  }
  fs.writeFileSync(path.join(build, 'icon.ico'), buildIco(SIZES, images));
  fs.writeFileSync(path.join(build, 'icon-512.png'), (await rasterize(svg(512), 512)).toPNG());
  console.log('build/icon.ico (' + SIZES.join(', ') + ' px) et build/icon-512.png générés.' + (previewDir ? ' Aperçu : ' + path.join(previewDir, 'apercu-icone.png') : ''));
}

app.whenReady().then(main).then(() => app.exit(0)).catch((e) => { console.error(e); app.exit(1); });
