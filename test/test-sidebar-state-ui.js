// Panneau latéral (1.5.0) : son état (ouvert / fermé) et son onglet sont mémorisés dans settings.json (sidebarOpen, sidebarTab) et
// restaurés au lancement suivant ; un ancien settings.json (sans ces clés) garde le comportement d'avant : panneau fermé, Miniatures.
// Hors écran (harnais habituel). Usage : node test/test-sidebar-state-ui.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launchApp, sleep } = require('./lib/app.js');
const { makeAll } = require('./lib/make-pdfs.js');

const failures = [];
let passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ok   ', name); }
  else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail).slice(0, 400) : ''); }
}

(async () => {
  const f = await makeAll(path.join(os.tmpdir(), 'oricalpdf-ui-pdfs'));
  const visible = (c) => c.ev(`!document.getElementById('sidebar').hidden`);
  const tab = (c) => c.ev(`document.querySelector('#sb-tabs [aria-selected=true]').id`);
  const ready = (c) => c.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`, 15000);
  const settingsOf = (c) => JSON.parse(fs.readFileSync(path.join(c.userData, 'settings.json'), 'utf8'));
  let c = null;
  try {
    console.log('1. Ancien settings.json (sans les clés 1.5.0)');
    c = await launchApp({ files: [f.a], userDataFiles: { 'settings.json': { keepTool: true, pinSidebar: false, favorites: [] } } });
    await ready(c); await sleep(300);
    check('panneau fermé, onglet Miniatures (comportement d\'avant)', (await visible(c)) === false && (await tab(c)) === 'sbtab-thumbs');
    await c.click('#sb-corner'); await sleep(300);
    check('ouvert par le bouton du coin', (await visible(c)) === true);
    await c.click('#sbtab-outline'); await sleep(300);
    let s = settingsOf(c);
    check('mémorisé : sidebarOpen = true, sidebarTab = sbtab-outline (autres réglages gardés)', s.sidebarOpen === true && s.sidebarTab === 'sbtab-outline' && s.keepTool === true, s);
    await c.close(); c = null;

    console.log('2. Relance avec le même réglage');
    c = await launchApp({ files: [f.a], userDataFiles: { 'settings.json': s } });
    await ready(c); await sleep(300);
    check('panneau rouvert au lancement, onglet Signets', (await visible(c)) === true && (await tab(c)) === 'sbtab-outline', [await visible(c), await tab(c)]);
    check('aucun focus volé par la restauration', (await c.ev(`document.activeElement && document.activeElement.id`)) !== 'search-input');
    await c.click('#sb-corner'); await sleep(300);
    s = settingsOf(c);
    check('refermé : sidebarOpen = false', (await visible(c)) === false && s.sidebarOpen === false, s);
    await c.close(); c = null;

    console.log('3. Relance après fermeture');
    c = await launchApp({ files: [f.a], userDataFiles: { 'settings.json': s } });
    await ready(c); await sleep(300);
    check('panneau resté fermé', (await visible(c)) === false);
    check('aucune erreur JavaScript', c.logs.length === 0, c.logs.slice(0, 3));
  } catch (e) {
    check('exécution sans exception', false, String(e && e.stack || e));
  } finally {
    if (c) await c.close();
  }
  console.log(`\n${passed} vérifications réussies, ${failures.length} échec(s).`);
  process.exit(failures.length ? 1 : 0);
})();
