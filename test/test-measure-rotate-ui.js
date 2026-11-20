// Cotes et distances lisibles dans l'interface (1.0.2) : une Cote tracée de droite à gauche puis de haut en bas a sa valeur lisible et AU-DESSUS
// de sa ligne de cote ; la page est ensuite pivotée de 180° par l'application (Accueil, « Pivoter à droite » × 2) : les cotes restent lisibles, une
// Distance horizontale tracée à l'écran aussi ; le PDF enregistré, relu avec pdf.js sur sa page affichée (/Rotate 180), a tous ses textes lisibles.
// Fenêtre hors écran (SPIN_TEST_HEADLESS=1 par défaut). Usage : node test/test-measure-rotate-ui.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFLib = require('@cantoo/pdf-lib');
const { launchApp, sleep } = require('./lib/app.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };
const readable = (deg) => deg > -90 + 1e-3 && deg <= 90 + 1e-3;

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spinadoc-mrot-ui-'));
  const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spinadoc-mrot-save-'));
  const d = await PDFLib.PDFDocument.create();
  const pg = d.addPage([595, 842]);
  pg.drawRectangle({ x: 100, y: 450, width: 300, height: 250, borderWidth: 1, borderColor: PDFLib.rgb(0, 0, 0) });
  const planPath = path.join(dir, 'plan-cotes.pdf');
  fs.writeFileSync(planPath, await d.save());

  const c = await launchApp({ files: [planPath], env: { SPINADOC_TEST_SAVE_DIR: saveDir } });
  const J = async (e) => JSON.parse(await c.ev(e));
  try {
    await c.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`);
    await sleep(800);
    const SC = 4 / 3;
    let rot = 0;
    // point PDF → écran (page affichée à 0° ou 180°)
    const P = async (x, y) => { const [l, t] = await c.rect('.docview.active .page'); return rot === 180 ? [l + (595 - x) * SC, t + y * SC] : [l + x * SC, t + (842 - y) * SC]; };
    const click = async (x, y) => { const [sx, sy] = await P(x, y); await c.mouse('mouseMoved', sx, sy); await c.mouse('mousePressed', sx, sy, { clickCount: 1 }); await c.mouse('mouseReleased', sx, sy, { clickCount: 1 }); await sleep(150); };
    const key = (k, code, vk, mods = 0) => c.key(k, { code, windowsVirtualKeyCode: vk, modifiers: mods });
    // textes SVG affichés : contenu, angle à l'écran (anti-horaire, degrés) et centre à l'écran
    const texts = () => J(`JSON.stringify([...document.querySelectorAll('.docview.active .page:nth-child(1) .objs text')].map(t=>{const m=/rotate\\(([-0-9.e]+)\\)/.exec(t.getAttribute('transform')||'');const r=t.getBoundingClientRect();return {s:t.textContent,ang:-(m?+m[1]:0),cx:r.left+r.width/2,cy:r.top+r.height/2}}))`);
    const norm = (a) => { a %= 360; if (a <= -180) a += 360; if (a > 180) a -= 360; return a; };

    await c.click('#rtab-measure'); await sleep(200);
    await c.click('#scale-label'); await sleep(200);
    await c.ev(`(()=>{const s=document.getElementById('mc-preset');s.value='50';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await c.click('#mc-ok'); await sleep(300);

    // 1. Cote de droite à gauche (horizontale) : décalage par défaut (20 pt) → ligne de cote SOUS les points ; valeur au-dessus de la ligne de cote
    await c.click('#rpanel-measure [data-cmd=tool-m-dim]'); await sleep(150);
    await click(400, 500); await click(100, 500);
    let t = await texts();
    const c1 = t.find((x) => x.s === '5,29 m');
    const line1 = await P(250, 480); // milieu de la ligne de cote (A + n × 20, n vers le bas pour un tracé vers la gauche)
    check('Cote de droite à gauche : valeur 300 pt à 1:50 = 5,29 m, lisible (horizontale à l\'écran)', !!c1 && Math.abs(norm(c1.ang)) < 0.01, t);
    check('Cote de droite à gauche : valeur AU-DESSUS de la ligne de cote (à l\'écran), à moins de 2 corps', !!c1 && c1.cy < line1[1] - 3 && c1.cy > line1[1] - 2 * 10 * SC * 1.2 && Math.abs(c1.cx - line1[0]) < 3, { c1, line1 });

    // 2. Cote de haut en bas (verticale) : lue de bas en haut (90°), au-dessus de sa ligne = à GAUCHE de la ligne à l'écran
    await click(450, 700); await click(450, 450);
    t = await texts();
    const c2 = t.find((x) => x.s === '4,41 m');
    const line2 = await P(470, 575); // A + n × 20, n vers la droite pour un tracé vers le bas
    check('Cote de haut en bas : valeur 250 pt = 4,41 m, lisible (verticale, lue de bas en haut)', !!c2 && Math.abs(norm(c2.ang) - 90) < 0.01, t);
    check('Cote de haut en bas : valeur du côté « haut » du texte (à gauche de la ligne de cote à l\'écran)', !!c2 && c2.cx < line2[0] - 3 && c2.cx > line2[0] - 2 * 10 * SC * 1.2 && Math.abs(c2.cy - line2[1]) < 3, { c2, line2 });
    await key('Escape', 'Escape', 27); await sleep(150);

    // 3. Page pivotée de 180° dans l'application (rotation de PAGE, écrite dans le PDF) : les cotes restent lisibles
    await c.click('#rtab-home'); await sleep(200);
    await c.click('#rpanel-home [data-cmd=pg-rot-right]'); await sleep(500);
    await c.click('#rpanel-home [data-cmd=pg-rot-right]'); await sleep(800);
    rot = 180;
    check('page pivotée de 180° (doc.pages[0].rot)', (await c.ev(`import('./js/ui.js').then(m=>m.store.active.pages[0].rot)`)) === 180);
    t = await texts();
    check('page pivotée de 180° : les deux cotes restent lisibles (0° et 90° à l\'écran)', ['5,29 m', '4,41 m'].every((s, i) => { const x = t.find((y) => y.s === s); return x && Math.abs(norm(x.ang) - [0, 90][i]) < 0.01; }), t);

    // 4. Cas réel : Distance horizontale à l'écran sur la page pivotée
    await c.click('#rtab-measure'); await sleep(200);
    await c.click('#rpanel-measure [data-cmd=tool-m-dist]'); await sleep(150);
    await click(400, 300); await click(200, 300); // de gauche à droite à l'écran (page à 180°)
    t = await texts();
    const d1 = t.find((x) => x.s === '3,53 m');
    check('page pivotée de 180° : Distance horizontale lisible (0° à l\'écran, pas à l\'envers)', !!d1 && Math.abs(norm(d1.ang)) < 0.01, t);
    check('tous les textes de mesure affichés sont lisibles', t.length >= 3 && t.every((x) => readable(norm(x.ang))), t);
    await key('Escape', 'Escape', 27); await sleep(150);

    // 5. Enregistrement : relu avec pdf.js sur la page affichée (/Rotate 180), textes lisibles
    await key('s', 'KeyS', 83, 2); await sleep(2500);
    const out = fs.readdirSync(saveDir).find((f) => f.endsWith('.pdf'));
    check('PDF enregistré', !!out, fs.readdirSync(saveDir));
    if (out) {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const fontDir = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'standard_fonts').split('\\').join('/') + '/';
      const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(saveDir, out))), standardFontDataUrl: fontDir, verbosity: 0 }).promise;
      const page = await doc.getPage(1);
      const vp = page.getViewport({ scale: 1 });
      const items = (await page.getTextContent()).items.filter((i) => /m$/.test(i.str.trim()));
      const angs = items.map((i) => { const [a, b, , , x, y] = i.transform; const [x0, y0] = vp.convertToViewportPoint(x, y), [x1, y1] = vp.convertToViewportPoint(x + a, y + b); return { s: i.str, read: +(Math.atan2(-(y1 - y0), x1 - x0) * 180 / Math.PI).toFixed(2) }; });
      check('PDF écrit : /Rotate 180 et les 3 valeurs lisibles sur la page affichée (pdf.js)', page.rotate === 180 && angs.length === 3 && angs.every((a) => readable(a.read)), { rotate: page.rotate, angs });
    }
    check('aucune erreur JavaScript', c.logs.length === 0, c.logs);
  } catch (err) {
    check('exécution sans exception', false, String(err && err.stack || err));
  } finally {
    await c.close();
  }
  console.log(`\n${passed} vérifications réussies, ${failures.length} échec(s).`);
  if (failures.length) { console.log('Échecs :\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('OK : cotes et distances lisibles (interface).');
})();
