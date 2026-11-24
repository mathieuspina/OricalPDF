// Annotations modifiables (1.2.0), interface réelle (CDP) : boîte « Modifiable / Aplati » et avertissement, indicateur de la barre d'état,
// enregistrer en modifiable → rouvrir une COPIE → déplacer une annotation → réenregistrer (sans question) ; choix Aplati et mémorisation ;
// réglage « Modifiables » ; repli sur fichier modifié par un autre outil ; gros PDF (bandeau après 1 s, interface fluide, « Ouvrir sans les
// annotations modifiables ») ; fichier protégé par mot de passe (détection après déchiffrement) ; information de fusion.
// Usage : node test/test-editable-ui.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFLib = require('@cantoo/pdf-lib');
const { createCanvas } = require('@napi-rs/canvas');
const { launchApp, sleep } = require('./lib/app.js');
const Shapes = require('../src/shapes.js');
const PdfEdit = require('../src/pdf-edit.js');
const ES = require('../src/editable-state.js');
const EP = require('../src/editable-pdf.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail).slice(0, 400) : ''); } };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), 'oricalpdf-edit-' + p + '-'));
const dir = tmp('in');
const pdfIn = (name) => path.join(dir, name);
const D = (t, o) => Object.assign(Shapes.defaultsFor(t), { type: t, page: 0 }, o);
const OBJS = [
  D('rect', { id: 1, cx: 200, cy: 600, w: 120, h: 60, rot: 0, fill: [0.85, 0.9, 1] }),
  D('stamp', { id: 2, label: 'Approuvé', cx: 420, cy: 700, w: 140, h: 44, rot: 0 }),
  D('note', { id: 3, x: 80, y: 300, text: 'Note de relecture', size: 11, width: 170 }),
];

async function a4(n = 1) {
  const d = await PDFLib.PDFDocument.create(); const f = await d.embedFont(PDFLib.StandardFonts.Helvetica);
  for (let k = 0; k < n; k++) { const p = d.addPage([595, 842]); p.drawText(`Page ${k + 1} du document exemple`, { x: 60, y: 780, size: 14, font: f }); }
  return d.save();
}
// PDF lourd : 150 pages, 30 images distinctes + texte par page, un objet modifiable par page.
async function heavy() {
  const d = await PDFLib.PDFDocument.create(); const f = await d.embedFont(PDFLib.StandardFonts.Helvetica);
  for (let p = 0; p < 150; p++) {
    const pg = d.addPage([595, 842]);
    for (let k = 0; k < 30; k++) { const c = createCanvas(24, 24); const g = c.getContext('2d'); g.fillStyle = `rgb(${p},${k * 8},90)`; g.fillRect(0, 0, 24, 24 - (k % 7)); pg.drawImage(await d.embedPng(new Uint8Array(c.toBuffer('image/png'))), { x: 40 + (k % 6) * 90, y: 60 + Math.floor(k / 6) * 120, width: 60, height: 60 }); }
    for (let l = 0; l < 20; l++) pg.drawText('Ligne ' + l + ' page ' + p, { x: 40, y: 800 - l * 9, size: 7, font: f });
  }
  const orig = await d.save();
  const edits = Array.from({ length: 150 }, (_, p) => D('rect', { id: p + 1, page: p, cx: 300, cy: 420, w: 100, h: 50, rot: 0 }));
  return PdfEdit.applyEdits(PDFLib, orig, edits, { editable: { numbering: [], nextId: 200 } });
}

(async () => {
  const A4 = pdfIn('plan-exemple.pdf'); fs.writeFileSync(A4, await a4());
  const docJs = (expr) => `import('./js/ui.js').then((m)=>{const d=m.store.active; return d ? (${expr}) : null;})`;
  const addObjs = (c) => c.ev(`Promise.all([import('./js/ui.js'), import('./js/annot/render.js')]).then(([m, r])=>{const d=m.store.active; window.DocModel.addEdits(d, ${JSON.stringify(OBJS)}); r.renderAll(d); m.bus.emit('doc-changed', d); return d.edits.length;})`);
  const key = (c, k, code, vk, mods = 0) => c.key(k, { code, windowsVirtualKeyCode: vk, modifiers: mods });
  const save = (c) => key(c, 's', 'KeyS', 83, 2);
  const toastText = (c) => c.ev(`document.getElementById('toast') ? document.getElementById('toast').textContent : ''`);
  const visible = (c, id) => c.ev(`(()=>{const e=document.getElementById('${id}'); return !!e && !e.hidden && e.getClientRects().length>0})()`);
  const waitRestored = (c, ms = 20000) => c.waitFor(`(async()=>{const m=await import('./js/ui.js'); const d=m.store.active; return !!d && d.runtime && !d.runtime.restoring && d.editable === true;})()`, ms);
  const pdfFiles = (d) => fs.readdirSync(d).filter((f) => f.endsWith('.pdf'));

  // ------------------------------------------------------------------ 1. boîte, avertissement, enregistrement modifiable, indicateur
  console.log('1. Enregistrer : boîte « Modifiable / Aplati », avertissement, indicateur');
  const S1 = tmp('s1');
  const E1 = pdfIn('copie-modifiable.pdf');
  let c = await launchApp({ files: [A4], env: { ORICALPDF_TEST_SAVE_DIR: S1 }, saveMode: null }); // vrai défaut : demander
  try {
    await c.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`); await sleep(600);
    check('3 objets ajoutés (rectangle, tampon, note)', (await addObjs(c)) === 3);
    check('indicateur « Annotations modifiables » absent pour un document ordinaire', !(await visible(c, 'sb-editable')));
    await save(c); await sleep(500);
    check('Ctrl+S : boîte « Enregistrer les annotations » (réglage par défaut : demander), « Aplaties » présélectionné, sans avertissement',
      (await visible(c, 'savemode')) && (await c.ev(`document.getElementById('sm-flat').checked`)) && !(await visible(c, 'sm-warn')));
    await c.click('#sm-editable'); await sleep(150);
    const warn = await c.ev(`document.getElementById('sm-warn').textContent`);
    check('« Modifiables » : avertissement (tampons et signatures retirables), 1 tampon compté', (await visible(c, 'sm-warn')) && /tampons et signatures/.test(warn) && /1 tampon/.test(warn), warn);
    await key(c, 'Escape', 'Escape', 27); await sleep(300);
    check('Échap : boîte fermée, rien d\'enregistré', !(await visible(c, 'savemode')) && pdfFiles(S1).length === 0);
    await save(c); await sleep(500);
    await c.click('#sm-editable'); await c.click('#sm-ok');
    await c.waitFor(`!document.getElementById('sm-ok').closest('.overlay-dialog').hidden === false`, 3000).catch(() => {});
    await sleep(1500);
    const f1 = pdfFiles(S1);
    const b1 = f1.length ? fs.readFileSync(path.join(S1, f1[0])) : Buffer.alloc(0);
    check('fichier écrit en modifiable (état présent)', f1.length === 1 && ES.detect(b1), f1);
    check('message « Enregistré (annotations modifiables) » et indicateur visible', /annotations modifiables/.test(await toastText(c)) && (await visible(c, 'sb-editable')), await toastText(c));
    fs.writeFileSync(E1, b1);
    const r1 = await EP.read(PDFLib, new Uint8Array(b1));
    check('état du fichier : 3 objets', r1.status === 'ok' && r1.state.edits.length === 3, r1.status);
    // indicateur : enregistrer en choisissant le mode → Aplaties + mémoriser
    await c.click('#sb-editable'); await sleep(400);
    check('clic sur l\'indicateur : boîte avec « Modifiables » présélectionné', (await visible(c, 'savemode')) && (await c.ev(`document.getElementById('sm-editable').checked`)));
    await c.click('#sm-flat'); await c.click('#sm-remember'); await c.click('#sm-ok'); await sleep(1500);
    const b2 = fs.readFileSync(path.join(S1, pdfFiles(S1)[0]));
    const settings = JSON.parse(fs.readFileSync(path.join(c.userData, 'settings.json'), 'utf8'));
    check('Aplaties : plus d\'état dans le fichier, indicateur masqué', !ES.detect(b2) && !(await visible(c, 'sb-editable')));
    check('« Mémoriser mon choix » : réglage saveMode = flat', settings.saveMode === 'flat', settings.saveMode);
    await c.click('#btn-settings'); await sleep(300);
    check('Réglages : « Annotations : Aplaties » affiché', (await c.ev(`document.getElementById('opt-savemode').value`)) === 'flat');
    await c.click('#settings-close');
    check('aucune erreur JavaScript (1)', c.logs.length === 0, c.logs);
  } catch (e) { check('exécution sans exception (1)', false, String(e && e.stack || e)); } finally { await c.close(); }

  // ------------------------------------------------------------------ 2. rouvrir une copie, déplacer, réenregistrer
  console.log('2. Rouvrir la copie modifiable : objets restaurés, déplacer, réenregistrer sans question');
  const S2 = tmp('s2');
  c = await launchApp({ files: [E1], env: { ORICALPDF_TEST_SAVE_DIR: S2, ORICALPDF_TEST_OPEN: JSON.stringify([E1]) } });
  try {
    await c.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`); await waitRestored(c); await sleep(800);
    const st = JSON.parse(await c.ev(docJs(`JSON.stringify({n:d.edits.length, dirty:d.dirty, undo:d.undo.length, types:d.edits.map(e=>e.type)})`)));
    check('3 objets restaurés, document non modifié, historique vide', st.n === 3 && !st.dirty && st.undo === 0 && st.types.join() === 'rect,stamp,note', st);
    check('indicateur « Annotations modifiables » visible', await visible(c, 'sb-editable'));
    const baseText = await c.ev(`import('./js/viewer.js').then(async(V)=>{const m=await import('./js/ui.js'); const p=await V.getPdf(m.store.active).getPage(1); return (await p.getTextContent()).items.map(i=>i.str).join('|');})`);
    check('page affichée sans les annotations figées (aucun doublon : texte du tampon et de la note absent de la page)', !/Approuv|relecture/.test(baseText) && /document exemple/.test(baseText), baseText);
    const svgN = await c.ev(`document.querySelectorAll('.docview.active .page .objs > *').length`);
    check('objets affichés en calque (modifiables)', svgN >= 3, svgN);
    // déplacer le rectangle de 60 px vers la droite
    const SC = 4 / 3;
    const [l, t] = await c.rect('.docview.active .page');
    const x0 = l + 200 * SC, y0 = t + (842 - 600) * SC;
    await c.mouse('mouseMoved', x0, y0); await c.mouse('mousePressed', x0, y0, { clickCount: 1 });
    for (let k = 1; k <= 6; k++) await c.mouse('mouseMoved', x0 + k * 10, y0, { buttons: 1 });
    await c.mouse('mouseReleased', x0 + 60, y0, { clickCount: 1 }); await sleep(400);
    const mv = JSON.parse(await c.ev(docJs(`JSON.stringify({cx:d.edits.find(e=>e.id===1).cx, dirty:d.dirty, undo:d.undo.length})`)));
    check('rectangle déplacé à la souris (+45 pt), document modifié, une étape d\'historique', Math.abs(mv.cx - 245) < 1 && mv.dirty && mv.undo === 1, mv);
    await save(c); await sleep(1800);
    check('Ctrl+S : pas de question (document ouvert en modifiable)', !(await visible(c, 'savemode')));
    const f2 = pdfFiles(S2);
    const r2 = f2.length ? await EP.read(PDFLib, new Uint8Array(fs.readFileSync(path.join(S2, f2[0])))) : { status: 'absent' };
    check('fichier réenregistré en modifiable : rectangle à sa nouvelle place, 3 objets', r2.status === 'ok' && r2.state.edits.length === 3 && Math.abs(r2.state.edits.find((e) => e.id === 1).cx - 245) < 1, r2.status);
    // fusion : information
    await c.click('#rtab-home'); await c.click('#rpanel-home [data-cmd=merge-open]'); await sleep(500);
    await c.click('#mw-tabs'); await sleep(300);
    await c.ev(`(()=>{const b=[...document.querySelectorAll('.menu:not([hidden]) .recent-item')].find(x=>/copie-modifiable/.test(x.textContent)); b.click(); return 1})()`); await sleep(1500);
    check('fusion d\'un document modifiable : information « annotations figées dans le fichier fusionné »', /figées dans le fichier fusionné/.test(await toastText(c)), await toastText(c));
    await c.click('#mw-cancel'); await sleep(300);
    check('aucune erreur JavaScript (2)', c.logs.length === 0, c.logs);
  } catch (e) { check('exécution sans exception (2)', false, String(e && e.stack || e)); } finally { await c.close(); }

  // ------------------------------------------------------------------ 3. réglage « Modifiables » : aucune question
  console.log('3. Réglage « Modifiables » mémorisé : document ordinaire enregistré sans question');
  const S3 = tmp('s3');
  c = await launchApp({ files: [A4], env: { ORICALPDF_TEST_SAVE_DIR: S3 }, userDataFiles: { 'settings.json': { saveMode: 'editable' } } });
  try {
    await c.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`); await sleep(600);
    await addObjs(c); await save(c); await sleep(1800);
    const f3 = pdfFiles(S3);
    check('enregistré directement en modifiable', !(await visible(c, 'savemode')) && f3.length === 1 && ES.detect(fs.readFileSync(path.join(S3, f3[0]))));
  } catch (e) { check('exécution sans exception (3)', false, String(e && e.stack || e)); } finally { await c.close(); }

  // ------------------------------------------------------------------ 4. repli : fichier modifié par un autre outil
  console.log('4. Repli : page ajoutée par un autre outil');
  const F1 = pdfIn('modifie-ailleurs.pdf');
  { const d = await PDFLib.PDFDocument.load(fs.readFileSync(E1)); d.addPage([595, 842]); fs.writeFileSync(F1, await d.save()); }
  c = await launchApp({ files: [F1] });
  try {
    await c.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`);
    await c.waitFor(`/annotations figées/.test(document.getElementById('toast').textContent)`, 15000).catch(() => {});
    const msg = await toastText(c);
    const st = JSON.parse(await c.ev(docJs(`JSON.stringify({n:d.edits.length, ed:!!d.editable, pages:d.pages.length})`)));
    check('message clair (« annotations figées », nombre de pages changé) ; ouvert comme PDF normal', /annotations figées/.test(msg) && /nombre de pages/.test(msg) && st.n === 0 && !st.ed && st.pages === 2, { msg, st });
    check('indicateur absent', !(await visible(c, 'sb-editable')));
  } catch (e) { check('exécution sans exception (4)', false, String(e && e.stack || e)); } finally { await c.close(); }

  // ------------------------------------------------------------------ 5. gros PDF : bandeau, interface fluide, annulation
  console.log('5. PDF de 150 pages : restauration en arrière-plan, bandeau après 1 s, « Ouvrir sans les annotations modifiables »');
  const H = pdfIn('gros-modifiable.pdf'); fs.writeFileSync(H, await heavy());
  c = await launchApp({ files: [H] });
  try {
    await c.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`, 30000);
    await c.ev(`(()=>{window.__gaps=[]; let last=performance.now(); window.__gapTimer=setInterval(()=>{const n=performance.now(); window.__gaps.push(n-last); last=n;}, 20); return 1})()`);
    const sawBanner = await c.waitFor(`!document.getElementById('edit-restore').hidden`, 8000).then(() => true, () => false);
    await waitRestored(c, 60000);
    const gaps = JSON.parse(await c.ev(`(()=>{clearInterval(window.__gapTimer); return JSON.stringify(window.__gaps)})()`));
    const maxGap = Math.round(Math.max(...gaps));
    const n = await c.ev(docJs('d.edits.length'));
    check(`restauration terminée : 150 objets modifiables, bandeau affiché pendant l'opération (> 1 s)`, n === 150 && sawBanner, { n, sawBanner });
    check(`interface fluide pendant la restauration (plus longue pause du fil principal : ${maxGap} ms < 400 ms)`, maxGap < 400, maxGap);
    check('bandeau masqué à la fin', !(await visible(c, 'edit-restore')));
  } catch (e) { check('exécution sans exception (5)', false, String(e && e.stack || e)); } finally { await c.close(); }
  c = await launchApp({ files: [H] });
  try {
    await c.waitFor(`!document.getElementById('edit-restore').hidden`, 30000);
    await c.click('#edit-restore-skip'); await sleep(800);
    const st = JSON.parse(await c.ev(docJs(`JSON.stringify({n:d.edits.length, ed:!!d.editable, restoring:!!d.runtime.restoring})`)));
    check('« Ouvrir sans les annotations modifiables » : PDF normal (annotations figées), message', st.n === 0 && !st.ed && !st.restoring && /annotations figées/.test(await toastText(c)), st);
    check('aucune erreur JavaScript (5)', c.logs.length === 0, c.logs);
  } catch (e) { check('exécution sans exception (5b)', false, String(e && e.stack || e)); } finally { await c.close(); }

  // ------------------------------------------------------------------ 6. mot de passe : détection après déchiffrement
  console.log('6. Fichier modifiable protégé par mot de passe');
  const P1 = pdfIn('modifiable-protege.pdf');
  fs.writeFileSync(P1, await PdfEdit.applyEdits(PDFLib, await a4(), OBJS, { editable: { numbering: [], nextId: 4 }, encrypt: { userPassword: 'sesame' } }));
  c = await launchApp({ files: [P1] });
  try {
    await c.waitFor(`!document.getElementById('pgdlg').hidden`, 20000);
    await c.ev(`(()=>{const e=document.getElementById('pgf-pw'); e.value='sesame'; return 1})()`); await c.click('#pgdlg-ok');
    await waitRestored(c, 30000); await sleep(500);
    const st = JSON.parse(await c.ev(docJs(`JSON.stringify({n:d.edits.length, prot:!!(d.protect&&d.protect.userPassword), dirty:d.dirty})`)));
    check('après déchiffrement : 3 objets restaurés, protection conservée pour l\'enregistrement', st.n === 3 && st.prot && !st.dirty, st);
    check('aucune erreur JavaScript (6)', c.logs.length === 0, c.logs);
  } catch (e) { check('exécution sans exception (6)', false, String(e && e.stack || e)); } finally { await c.close(); }

  console.log(`\n${passed} vérifications réussies, ${failures.length} échec(s).`);
  if (failures.length) { console.log('Échecs :\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('OK : annotations modifiables (interface).');
})();
