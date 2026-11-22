// Génère les icônes en rasterisant leur dessin avec Electron (fenêtres cachées, hors écran : show: false ; jamais le bureau) :
//  - application (défaut) : build/icon.ico (16, 20, 24, 32, 40, 48, 64, 256) et build/icon-512.png = logo Orical PDF
//    (build/logo-orical-pdf.svg ; scripts/icon-geometry.js : logo complet dès 40 px, halo plat et trait épaissi en dessous) ;
//  - --target pdf : build/pdf-file.ico = icône des fichiers PDF associés (scripts/pdf-icon-geometry.js ; page rouge, disque, lettrage).
// Chaque taille est dessinée à sa taille et rendue à la taille exacte, pas réduite depuis une grande image (sinon flou et « tache » dans
// l'Explorateur et la barre des tâches). Fond transparent.
// Usage : npx electron scripts/make-icon.js [--target pdf] [--preview dossier [--old ancienne.ico]]
//   --preview : chaque taille en PNG + planche agrandie (fonds clair, sombre, damier) : application = avant / après ; PDF = page unie /
//   page en dégradé (variante non retenue montrée pour comparaison).
// Aucune dépendance supplémentaire : l'ICO est assemblé à la main (entrées PNG). Géométries pures et testées (test/test-icon.js).
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const AppIcon = require('./icon-geometry.js');
const PdfIcon = require('./pdf-icon-geometry.js');

const { SIZES, buildIco } = AppIcon;
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const build = path.join(__dirname, '..', 'build');
const target = arg('--target') === 'pdf' ? 'pdf' : 'app';
const previewDir = arg('--preview');
const oldFile = arg('--old') || path.join(build, 'icon.ico'); // icône « avant » de la planche (application)
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
// taille réelle ; colonnes = jeux d'images (sets : [{ title, ico? , images? }]) sur fond clair, sombre (barre des tâches) et damier.
async function previewSheet(dir, sets, file) {
  const pick = (ico, n) => { const c = ico.readUInt16LE(4); for (let i = 0; i < c; i++) { const o = 6 + 16 * i; if ((ico[o] || 256) === n) return ico.subarray(ico.readUInt32LE(o + 12), ico.readUInt32LE(o + 12) + ico.readUInt32LE(o + 8)); } return null; };
  const k = (n) => (n >= 256 ? 0.5 : Math.max(2, Math.floor(112 / n)));
  const tag = (buf, px) => (buf ? `<img style="width:${px}px;height:${px}px" src="data:image/png;base64,${buf.toString('base64')}">` : '—');
  const of = (s, n) => (s.ico ? pick(s.ico, n) : s.images[SIZES.indexOf(n)]);
  const bgs = [['clair', '#ffffff'], ['sombre', '#202020'], ['damier', 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/16px 16px']];
  const cols = bgs.flatMap(([l, bg]) => sets.map((s) => [s.title, l, bg, s]));
  const rows = SIZES.map((n) => `<tr><th>${n} px<br><small>× ${k(n)}</small></th>${cols.map((c) => `<td style="background:${c[2]}">${tag(of(c[3], n), n * k(n))}</td>`).join('')}</tr>`).join('') +
    `<tr><th>taille<br>réelle</th>${cols.map((c) => `<td style="background:${c[2]}">${SIZES.filter((n) => n <= 32).map((n) => tag(of(c[3], n), n)).join(' ')}<br>${SIZES.filter((n) => n > 32 && n <= 64).map((n) => tag(of(c[3], n), n)).join(' ')}</td>`).join('')}</tr>`;
  const html = `<html><head><meta charset="utf-8"><style>body{margin:0;padding:12px;background:#f3f3f3;font:13px Segoe UI,sans-serif;color:#222}table{border-collapse:collapse}th{padding:4px 8px;font-weight:600;white-space:nowrap}small{font-weight:400;color:#666}td{padding:6px;border:1px solid #ccc;text-align:center;vertical-align:middle;white-space:nowrap}img{image-rendering:pixelated;display:inline-block;vertical-align:middle}</style></head><body>
<table><tr><th></th>${cols.map((c) => `<th>${c[0]}<br><small>${c[1]}</small></th>`).join('')}</tr>${rows}</table></body></html>`;
  const w = new BrowserWindow({ show: false, width: 1500, height: 2400, enableLargerThanScreen: true, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  await new Promise((r) => setTimeout(r, 600));
  const size = JSON.parse(await w.webContents.executeJavaScript('(() => { const r = document.querySelector("table").getBoundingClientRect(); return JSON.stringify([Math.ceil(r.right + 12), Math.ceil(r.bottom + 12)]); })()'));
  const img = await w.webContents.capturePage({ x: 0, y: 0, width: Math.min(1500, size[0]), height: Math.min(2400, size[1]) });
  fs.writeFileSync(path.join(dir, file), img.toPNG());
  w.destroy();
}

async function renderAll(svgOf) { const out = []; for (const n of SIZES) out.push((await rasterize(svgOf(n), n)).toPNG()); return out; }

async function main() {
  if (target === 'pdf') {
    const images = await renderAll((n) => PdfIcon.svg(n));
    if (previewDir) {
      fs.mkdirSync(previewDir, { recursive: true });
      SIZES.forEach((s, i) => fs.writeFileSync(path.join(previewDir, `pdf-file-${s}.png`), images[i]));
      const other = PdfIcon.PAGE_FILL === 'flat' ? 'gradient' : 'flat';
      const alt = await renderAll((n) => PdfIcon.svg(n, other));
      const label = { flat: 'PAGE UNIE', gradient: 'DÉGRADÉ' };
      await previewSheet(previewDir, [{ title: label[PdfIcon.PAGE_FILL] + ' (retenue)', images }, { title: label[other], images: alt }], 'apercu-icone-pdf.png');
    }
    fs.writeFileSync(path.join(build, 'pdf-file.ico'), buildIco(SIZES, images));
    console.log('build/pdf-file.ico (' + SIZES.join(', ') + ' px) généré.' + (previewDir ? ' Aperçu : ' + path.join(previewDir, 'apercu-icone-pdf.png') : ''));
    return;
  }
  const images = await renderAll((n) => AppIcon.svg(n));
  const oldIco = fs.existsSync(oldFile) ? fs.readFileSync(oldFile) : null;
  if (previewDir) {
    fs.mkdirSync(previewDir, { recursive: true });
    SIZES.forEach((s, i) => fs.writeFileSync(path.join(previewDir, `icon-${s}.png`), images[i]));
    await previewSheet(previewDir, [...(oldIco ? [{ title: 'AVANT', ico: oldIco }] : []), { title: 'APRÈS', images }], 'apercu-icone.png');
  }
  fs.writeFileSync(path.join(build, 'icon.ico'), buildIco(SIZES, images));
  fs.writeFileSync(path.join(build, 'icon-512.png'), (await rasterize(AppIcon.svg(512), 512)).toPNG());
  console.log('build/icon.ico (' + SIZES.join(', ') + ' px) et build/icon-512.png générés.' + (previewDir ? ' Aperçu : ' + path.join(previewDir, 'apercu-icone.png') : ''));
}

app.whenReady().then(main).then(() => app.exit(0)).catch((e) => { console.error(e); app.exit(1); });
