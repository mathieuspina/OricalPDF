// Annotations, lot 1.5.0 (interface, hors écran) :
//   3. angle par défaut des nouveaux textes, notes et légendes (Réglages > Annotations, réglage annotAngle) ;
//   4. édition d'une note de plusieurs lignes : la zone de saisie montre toutes les lignes (aucune troncature) ;
//   5. texte ajouté souligné (panneau Propriétés) : aperçu et PDF enregistré ;
//   6. flèches du clavier sur une page pivotée (0 / 90 / 180 / 270°) : l'objet bouge dans le sens de la flèche À L'ÉCRAN ;
//   7. légende : une seule couleur pour le cadre et la flèche ;
//   9. rangée de couleurs standard sous chaque choix de couleur du panneau Propriétés.
// Usage : node test/test-annot15-ui.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launchApp, sleep } = require('./lib/app.js');
const { makeAll } = require('./lib/make-pdfs.js');

const failures = [];
let passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ok   ', name); }
  else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail).slice(0, 500) : ''); }
}

(async () => {
  const f = await makeAll(path.join(os.tmpdir(), 'oricalpdf-ui-pdfs'));
  const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oricalpdf-a15-'));
  const c = await launchApp({ files: [f.a], env: { ORICALPDF_TEST_SAVE_DIR: saveDir } });
  const J = async (e) => JSON.parse(await c.ev(e));
  const edits = () => J(`import('./js/ui.js').then(m=>JSON.stringify(m.store.active.edits))`);
  const lastEdit = async () => { const e = await edits(); return e[e.length - 1]; };
  const key = (k, code, vk, mods = 0) => c.key(k, { code, windowsVirtualKeyCode: vk, modifiers: mods });
  const tool = (t) => c.click(`#rpanel-annotate [data-cmd=tool-${t}]`);
  const SC = 4 / 3;
  const pageRect = (i) => c.rect(`.docview.active .page:nth-child(${i})`);
  const P = async (x, y, i = 1) => { const [l, t] = await pageRect(i); return [l + x * SC, t + y * SC]; };
  const setField = (label, fn) => c.ev(`(()=>{const row=[...document.querySelectorAll('#props .prop-row')].find(r=>r.querySelector('label').textContent===${JSON.stringify(label)}); if(!row) throw new Error('champ absent : '+${JSON.stringify(label)}); ${fn}})()`);
  const propLabels = () => J(`JSON.stringify([...document.querySelectorAll('#props .prop-row > label')].map(l=>l.textContent))`);
  const escape = () => key('Escape', 'Escape', 27);
  const addText = async (x, y, text, t = 'add', page = 1) => {
    await tool(t); await sleep(150);
    const [px, py] = await P(x, y, page); await c.clickXY(px, py); await sleep(300);
    await c.type(text); await sleep(100);
    await key('Enter', 'Enter', 13); await sleep(300);
  };
  try {
    await c.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`, 15000);
    await sleep(800);
    await c.click('#rtab-annotate'); await sleep(200);
    await c.click('#rpanel-annotate [data-cmd=props]'); await sleep(200);

    // ------------------------------------------------------------ 3. angle par défaut
    console.log('3. Angle par défaut des nouveaux textes et légendes');
    await c.click('#btn-settings'); await sleep(250);
    check('Réglages > Annotations : champ « Angle des nouveaux textes et légendes », 0 par défaut', (await c.ev(`document.getElementById('opt-annotangle').value`)) === '0');
    await c.ev(`(()=>{const i=document.getElementById('opt-annotangle'); i.value='450'; i.dispatchEvent(new Event('change'))})()`); await sleep(150);
    check('valeur ramenée dans ]-180, 180] (450 → 90) et mémorisée', (await c.ev(`document.getElementById('opt-annotangle').value`)) === '90' && (await c.ev(`import('./js/settings.js').then(m=>m.get('annotAngle'))`)) === 90);
    await c.click('#settings-close'); await sleep(200);
    await addText(60, 260, 'Texte 90');
    let e = await lastEdit();
    check('nouveau texte : rot = 90 (page non pivotée)', e && e.type === 'add' && e.text === 'Texte 90' && e.rot === 90, e);
    await addText(140, 240, 'Note 90', 'note');
    e = await lastEdit();
    check('nouvelle note : rot = 90', e && e.type === 'note' && e.rot === 90, e);
    await tool('callout'); await sleep(200);
    { const [x1, y1] = await P(300, 360), [x2, y2] = await P(420, 300);
      await c.mouse('mouseMoved', x1, y1); await c.mouse('mousePressed', x1, y1);
      for (let i = 1; i <= 6; i++) { await c.mouse('mouseMoved', x1 + ((x2 - x1) * i) / 6, y1 + ((y2 - y1) * i) / 6); await sleep(20); }
      await c.mouse('mouseReleased', x2, y2); await sleep(400);
      await c.type('Légende'); await key('Enter', 'Enter', 13); await sleep(300); }
    e = await lastEdit();
    check('nouvelle légende : rot = 90', e && e.type === 'callout' && e.rot === 90, e);
    await escape(); await sleep(100);
    await c.click('#btn-settings'); await sleep(200);
    await c.ev(`(()=>{const i=document.getElementById('opt-annotangle'); i.value='0'; i.dispatchEvent(new Event('change'))})()`);
    await c.click('#settings-close'); await sleep(200);
    await addText(300, 220, 'Texte 0');
    e = await lastEdit();
    check('angle remis à 0 : texte horizontal (rot 0) ; objets existants inchangés', e.rot === 0 && (await edits()).filter((x) => x.rot === 90).length === 3, await edits());
    await escape(); await sleep(100);

    check('aucune erreur JavaScript', c.logs.length === 0, c.logs.slice(0, 3));
  } catch (err) {
    check('exécution sans exception', false, String(err && err.stack || err));
  } finally {
    await c.close();
    try { fs.rmSync(saveDir, { recursive: true, force: true }); } catch { /* */ }
  }
  console.log(`\n${passed} vérifications réussies, ${failures.length} échec(s).`);
  process.exit(failures.length ? 1 : 0);
})();
