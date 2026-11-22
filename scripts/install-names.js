// Noms d'installation sous Windows : actuel « Orical PDF » (depuis 1.3.0) et ANCIEN « Spin A Doc » (jusqu'à 1.2.1). Même appId : les
// installeurs de test (test:packaged, test:update, repro-install) retireraient les raccourcis et l'entrée de désinstallation d'une VRAIE
// installation de l'un ou l'autre → refus si l'une existe sur le compte. Utilisé aussi pour vérifier qu'aucune trace de l'ancien nom ne reste.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CURRENT = 'Orical PDF';
const LEGACY = 'Spin A Doc';
const NAMES = [CURRENT, LEGACY];
const BS = String.fromCharCode(92);
const UNINSTALL = ['HKCU', 'Software', 'Microsoft', 'Windows', 'CurrentVersion', 'Uninstall'].join(BS);

// Raccourcis Bureau et menu Démarrer d'un nom donné.
const shortcuts = (name) => [
  path.join(process.env.USERPROFILE || '', 'Desktop', name + '.lnk'),
  path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', name + '.lnk'),
];

// Une donnée du registre de désinstallation (HKCU) contient-elle ce nom ?
const inUninstall = (name) => { const q = spawnSync('reg', ['query', UNINSTALL, '/s', '/f', name, '/d'], { encoding: 'utf8' }); return (q.stdout || '').includes(name); };

// Traces d'une installation réelle (des deux noms) : liste lisible, vide si aucune.
function existingInstall() {
  const found = [];
  for (const n of NAMES) {
    if (inUninstall(n)) found.push('entrée de désinstallation « ' + n + ' »');
    for (const p of shortcuts(n)) if (fs.existsSync(p)) found.push(path.basename(path.dirname(p)) + BS + path.basename(p));
  }
  return found;
}

module.exports = { CURRENT, LEGACY, NAMES, shortcuts, inUninstall, existingInstall };
