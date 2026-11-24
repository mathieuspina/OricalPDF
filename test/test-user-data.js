// Dossier des données de l'utilisateur (src/user-data.js + main.js) : « %APPDATA%\Orical PDF », imposé avant « ready », indépendant de
// productName ; ORICALPDF_USER_DATA respecté (tests) ; dossier créé au démarrage ; isolation des tests : un lancement de test n'écrit
// jamais dans le vrai dossier de l'utilisateur (ni dans un autre dossier de %APPDATA%).
// Usage : node test/test-user-data.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const UD = require('../src/user-data.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };
const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const appData = 'C:\\Users\\exemple\\AppData\\Roaming';

check('nom du dossier = « Orical PDF »', UD.DIR === 'Orical PDF');
check('résolu sans variable : %APPDATA%\\Orical PDF', UD.resolve({}, appData, path.win32.join) === 'C:\\Users\\exemple\\AppData\\Roaming\\Orical PDF');
check('ORICALPDF_USER_DATA respecté (tests)', UD.resolve({ ORICALPDF_USER_DATA: 'C:\\Tests\\profil-test' }, appData, path.win32.join) === 'C:\\Tests\\profil-test');
check('ORICALPDF_USER_DATA vide : dossier normal', UD.resolve({ ORICALPDF_USER_DATA: '' }, appData, path.win32.join).endsWith('\\Orical PDF'));
check('indépendant du nom du produit : user-data.js ne lit ni productName ni app.getName', !/\.productName|getName\(/.test(fs.readFileSync(path.join(root, 'src', 'user-data.js'), 'utf8')));

// main.js : setPath('userData', UserData.resolve(…)) au chargement, avant tout « ready », verrou d'instance unique et lecture de réglages.
const iSet = main.indexOf("app.setPath('userData', UserData.resolve(process.env, app.getPath('appData'), path.join))");
const firstOf = (re) => { const m = re.exec(main); return m ? m.index : Infinity; };
check('main.js : chemin imposé par UserData.resolve', iSet > 0);
check('main.js : imposé avant whenReady / ready / requestSingleInstanceLock / userFile', iSet > 0 && iSet < firstOf(/app\.whenReady\(|app\.on\('ready'|requestSingleInstanceLock\(|userFile\('/));
check('main.js : aucun autre setPath(\'userData\')', (main.match(/setPath\('userData'/g) || []).length === 1);
check('harnais de test : chaque lancement reçoit son propre ORICALPDF_USER_DATA (dossier temporaire)', /ORICALPDF_USER_DATA: userData/.test(fs.readFileSync(path.join(root, 'test', 'lib', 'app.js'), 'utf8')));

// Lancement réel (Electron de développement, hors écran) : dossier de test INEXISTANT → créé au démarrage ; %APPDATA% inchangé.
(async () => {
  const realAppData = process.env.APPDATA;
  const listAppData = () => { try { return fs.readdirSync(realAppData).sort(); } catch { return []; } };
  const real = path.join(realAppData, UD.DIR);
  const stamp = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return null; } };
  const before = { list: listAppData(), real: stamp(real) };
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'oricalpdf-userdata-'));
  const dir = path.join(base, 'profil', 'Orical PDF');
  const electron = process.env.ORICALPDF_EXE || require(path.join(root, 'node_modules', 'electron'));
  const env = Object.assign({}, process.env, { ORICALPDF_TEST_HEADLESS: '1', ORICALPDF_USER_DATA: dir });
  const p = spawn(electron, process.env.ORICALPDF_EXE ? [] : [root], { stdio: 'ignore', env });
  let created = false;
  for (let i = 0; i < 150 && !created; i++) { await new Promise((r) => setTimeout(r, 200)); created = fs.existsSync(dir) && fs.readdirSync(dir).length > 0; }
  await new Promise((r) => setTimeout(r, 1500));
  spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  check('démarrage avec un dossier inexistant : dossier créé (profil Chromium écrit dedans)', created, fs.existsSync(dir) ? fs.readdirSync(dir) : 'absent');
  const after = { list: listAppData(), real: stamp(real) };
  check('isolation : aucun dossier créé ni supprimé dans %APPDATA% par un lancement de test', JSON.stringify(after.list) === JSON.stringify(before.list), after.list.filter((x) => !before.list.includes(x)));
  check('isolation : le vrai dossier « %APPDATA%\\Orical PDF » n\'est pas touché', after.real === before.real, { before: before.real, after: after.real });
  try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* */ }
  console.log(`\n${passed} ok, ${failures.length} échec(s)`);
  if (failures.length) process.exit(1);
})();
