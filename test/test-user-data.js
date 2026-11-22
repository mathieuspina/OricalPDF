// Dossier des données de l'utilisateur (src/user-data.js + main.js) : identique à celui de la 1.2.1 (%APPDATA%\Spin A Doc) quel que soit le
// nom du produit (« Orical PDF » depuis 1.3.0), imposé avant « ready », SPINADOC_USER_DATA respecté (tests).
// Comparaison avec la 1.2.1 : lue dans git (tag v1.2.1) si disponible, sinon avec la valeur connue.
// Usage : node test/test-user-data.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const UD = require('../src/user-data.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };
const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const appData = 'C:\\Users\\exemple\\AppData\\Roaming';

check('nom historique du dossier = « Spin A Doc »', UD.LEGACY_DIR === 'Spin A Doc');
check('résolu sans variable : %APPDATA%\\Spin A Doc', UD.resolve({}, appData, path.win32.join) === 'C:\\Users\\exemple\\AppData\\Roaming\\Spin A Doc');
check('SPINADOC_USER_DATA respecté (tests)', UD.resolve({ SPINADOC_USER_DATA: 'D:\\profil-test' }, appData, path.win32.join) === 'D:\\profil-test');
check('SPINADOC_USER_DATA vide : dossier historique', UD.resolve({ SPINADOC_USER_DATA: '' }, appData, path.win32.join).endsWith('\\Spin A Doc'));
check('indépendant du nom du produit : user-data.js ne lit ni productName ni app.getName', !/\.productName|getName\(/.test(fs.readFileSync(path.join(root, 'src', 'user-data.js'), 'utf8')));

// main.js : setPath('userData', UserData.resolve(…)) au chargement, avant tout « ready », verrou d'instance unique et lecture de réglages.
const iSet = main.indexOf("app.setPath('userData', UserData.resolve(process.env, app.getPath('appData'), path.join))");
const firstOf = (re) => { const m = re.exec(main); return m ? m.index : Infinity; };
check('main.js : chemin imposé par UserData.resolve', iSet > 0);
check('main.js : imposé avant whenReady / ready / requestSingleInstanceLock / userFile', iSet > 0 && iSet < firstOf(/app\.whenReady\(|app\.on\('ready'|requestSingleInstanceLock\(|userFile\('/));
check('main.js : aucun autre setPath(\'userData\')', (main.match(/setPath\('userData'/g) || []).length === 1);

// Comparaison avec la 1.2.1 (même dossier) : expression de main.js au tag v1.2.1.
const old = spawnSync('git', ['show', 'v1.2.1:main.js'], { cwd: root, encoding: 'utf8' });
if (old.status === 0) {
  const m = /setPath\('userData', process\.env\.SPINADOC_USER_DATA \|\| path\.join\(app\.getPath\('appData'\), '([^']+)'\)\)/.exec(old.stdout);
  check('1.2.1 (git v1.2.1:main.js) : même dossier', m && m[1] === UD.LEGACY_DIR, m && m[1]);
} else {
  console.log('  (tag v1.2.1 absent : comparaison avec la valeur connue de la 1.2.1)');
  check('1.2.1 (valeur connue) : même dossier', UD.LEGACY_DIR === 'Spin A Doc');
}

console.log(`\n${passed} ok, ${failures.length} échec(s)`);
if (failures.length) process.exit(1);
