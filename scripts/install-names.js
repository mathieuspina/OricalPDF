// Nom d'installation sous Windows : « Orical PDF ». Les installeurs de test (test:packaged, test:update, repro-install) ont le même appId
// qu'une vraie installation : ils retireraient ses raccourcis et son entrée de désinstallation → refus si une installation réelle existe
// sur le compte.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CURRENT = 'Orical PDF';
const NAMES = [CURRENT];
const BS = String.fromCharCode(92);
const UNINSTALL = ['HKCU', 'Software', 'Microsoft', 'Windows', 'CurrentVersion', 'Uninstall'].join(BS);

// Raccourcis Bureau et menu Démarrer d'un nom donné.
const shortcuts = (name) => [
  path.join(process.env.USERPROFILE || '', 'Desktop', name + '.lnk'),
  path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', name + '.lnk'),
];

// Une donnée du registre de désinstallation (HKCU) contient-elle ce nom ?
const inUninstall = (name) => { const q = spawnSync('reg', ['query', UNINSTALL, '/s', '/f', name, '/d'], { encoding: 'utf8' }); return (q.stdout || '').includes(name); };

// Traces d'une installation réelle : liste lisible, vide si aucune.
function existingInstall() {
  const found = [];
  for (const n of NAMES) {
    if (inUninstall(n)) found.push('entrée de désinstallation « ' + n + ' »');
    for (const p of shortcuts(n)) if (fs.existsSync(p)) found.push(path.basename(path.dirname(p)) + BS + path.basename(p));
  }
  return found;
}

module.exports = { CURRENT, NAMES, shortcuts, inUninstall, existingInstall };
