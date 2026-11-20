// À propos dans l'application réelle : les licences tierces sont lues (pas « introuvable »). Court, fait pour test:packaged : la version
// empaquetée lit resources/THIRD_PARTY_LICENSES.txt (le fichier sans extension n'est pas embarqué dans app.asar).
// Usage : node test/test-about-ui.js   |   SPINADOC_EXE="chemin\Spin A Doc.exe" node test/test-about-ui.js
const path = require('path');
const { launchApp } = require('./lib/app.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };

(async () => {
  console.log('À propos — variante : ' + (process.env.SPINADOC_EXE ? path.basename(process.env.SPINADOC_EXE) : 'développement'));
  const c = await launchApp({ files: [] });
  try {
    const a = JSON.parse(await c.ev(`window.spinadoc.getAbout().then((i) => JSON.stringify({ v: i.version, n: i.licenses.length, head: i.licenses.slice(0, 80) }))`));
    check('À propos : version de package.json', a.v === require('../package.json').version, a.v);
    check('À propos : licences tierces lues (> 1000 caractères, pas « introuvable »)', a.n > 1000 && !/introuvable/i.test(a.head), a);
  } finally { await c.close(); }
  console.log(failures.length ? `\n${failures.length} échec(s) / ${passed + failures.length}` : `\nOK : ${passed} vérifications.`);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
