// Nom du produit : « Orical PDF » PARTOUT. Décision de l'utilisateur du 2026-11-24 : aucune compatibilité avec l'ancien nom (ni données,
// ni marqueurs de PDF, ni installation). Ce test interdit TOUTE occurrence de l'ancien nom, sous toutes ses formes (avec ou sans espaces,
// tirets, soulignés, casse quelconque, identifiants de variables d'environnement), dans TOUS les fichiers du dépôt (texte et binaires).
// Seules exceptions : ce fichier lui-même, et dans CLAUDE.md la seule ligne qui documente la décision (repérée par MARK).
// L'ancien nom ne subsiste que dans l'historique Git, les tags et les Releases déjà publiés (jamais modifiés).
// Vérifie aussi les nouveaux identifiants techniques (appId, ProgId, clés de registre, dossier de données, marqueurs de PDF, pont).
// Usage : node test/test-rename.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// Ancien nom : spin a doc / spinadoc / orical-pdf / spin_a_doc (séparateurs quelconques), « Spin A » seul, préfixe ORICALPDF_TEST_.
const OLD = /spin[\s_.%20-]*a[\s_.%20-]*doc|\bspin\s+a\b|ORICALPDF_TEST_/i;
const SELF = 'test/test-rename.js';
const MARK = 'DÉCISION DE L\'UTILISATEUR DU 2026-11-24 (renommage sans compatibilité)';

const ls = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
const files = ls.stdout.split(/\r?\n/).filter((f) => f && fs.existsSync(path.join(root, f)) && fs.statSync(path.join(root, f)).isFile());
check('fichiers du dépôt listés (git ls-files)', ls.status === 0 && files.length > 100, files.length);
const hits = [];
let claudeLines = 0;
for (const f of files) {
  if (f === SELF) continue;
  const buf = fs.readFileSync(path.join(root, f));
  // binaires : lus en latin1 (octet = caractère) et en UTF-16LE (chaînes des ressources Windows)
  const texts = buf.includes(0) ? [buf.toString('latin1'), buf.toString('utf16le')] : [buf.toString('utf8')];
  texts.forEach((t) => t.split(/\r?\n/).forEach((l, i) => {
    if (!OLD.test(l)) return;
    if (f === 'CLAUDE.md' && l.includes(MARK)) { claudeLines++; return; }
    hits.push(`${f}:${i + 1}: ${l.trim().slice(0, 140)}`);
  }));
  // nom du fichier lui-même
  if (OLD.test(f)) hits.push('nom de fichier : ' + f);
}
check('aucune occurrence de l\'ancien nom dans le dépôt (noms et contenus ; exceptions : ce test, la ligne de décision de CLAUDE.md)', hits.length === 0, hits.slice(0, 30));
check('CLAUDE.md : au plus UNE ligne d\'exception (la décision)', claudeLines <= 1, claudeLines);
check('le motif reconnaît bien toutes les formes (témoins positifs)', ['Spin A Doc', 'SpinADoc', 'orical-pdf', 'spin_a_doc', 'ORICALPDF_X', 'ORICALPDF_TEST_HEADLESS', 'window.oricalpdf', 'Spin%20A%20Doc', 'Spin A'].every((s) => OLD.test(s)) &&
  !['Orical PDF', 'spinner', 'spin', 'Edieresis', 'SpinASoft'].some((s) => OLD.test(s)));

// Nouveaux identifiants
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
check('package.json : name orical-pdf (et package-lock), appId com.orical.pdf', pkg.name === 'orical-pdf' && lock.name === 'orical-pdf' && lock.packages[''].name === 'orical-pdf' && pkg.build.appId === 'com.orical.pdf');
check('package.json : productName, raccourci, installeurs, description, éditeur, copyright', pkg.build.productName === 'Orical PDF' && pkg.build.nsis.shortcutName === 'Orical PDF' &&
  pkg.build.nsis.artifactName === 'OricalPDF-Setup-${version}.${ext}' && pkg.build.portable.artifactName === 'OricalPDF-Portable-${version}.${ext}' &&
  /^Orical PDF/.test(pkg.description) && pkg.author === 'Orical' && /Orical$/.test(pkg.build.copyright));
check('main.js : nom de l\'application et titre de la fenêtre = Orical PDF', /app\.setName\('Orical PDF'\)/.test(read('main.js')) && /title: 'Orical PDF'/.test(read('main.js')));
check('index.html : <title>, marque de la barre de titre, accueil', /<title>Orical PDF<\/title>/.test(read('src/index.html')) && /class="brand-name">Orical PDF</.test(read('src/index.html')) && /<h1>Orical PDF<\/h1>/.test(read('src/index.html')));
check('THIRD_PARTY_LICENSES et son générateur : en-tête « Orical PDF »', /^Orical PDF — licences tierces/.test(read('THIRD_PARTY_LICENSES')) && read('scripts/check-licenses.js').includes("'Orical PDF — licences tierces"));
check('CHANGELOG : titre « Orical PDF »', /^# Journal des versions — Orical PDF/.test(read('CHANGELOG.md')));
const nsh = read('build/installer.nsh');
check('installeur : ProgId OricalPDF.pdf, Software\\Orical\\OricalPDF\\Capabilities, données $APPDATA\\Orical PDF, témoin .oricalpdf-test',
  /!define ORICAL_PROGID "OricalPDF\.pdf"/.test(nsh) && /!define ORICAL_CAPS "Software\\Orical\\OricalPDF\\Capabilities"/.test(nsh) && /\$APPDATA\\Orical PDF"/.test(nsh) && /\.oricalpdf-test/.test(nsh));
check('installeur : aucun code de migration (customInit, page après le choix du dossier, RMDir d\'un ancien dossier)', !/customInit|customPageAfterChangeDir|OldDir|LEGACY/i.test(nsh));
check('données : src/user-data.js → « Orical PDF », ORICALPDF_USER_DATA', /const DIR = 'Orical PDF';/.test(read('src/user-data.js')) && /ORICALPDF_USER_DATA/.test(read('src/user-data.js')));
const es = read('src/editable-state.js');
check('PDF modifiables : clé /OricalPDF, /Type /OricalPDFState, étiquette OricalPDF, app « Orical PDF »', /const KEY = 'OricalPDF';/.test(es) && /const TYPE = 'OricalPDFState';/.test(es) && /const TAG = 'OricalPDF';/.test(es) && /app: 'Orical PDF'/.test(es));
check('pont du processus de rendu : window.oricalpdf', /exposeInMainWorld\('oricalpdf'/.test(read('preload.js')));

console.log(`\n${passed} ok, ${failures.length} échec(s)`);
if (failures.length) process.exit(1);
