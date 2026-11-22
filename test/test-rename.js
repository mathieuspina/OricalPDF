// Renommage 1.3.0 « Spin A Doc » → « Orical PDF » (éditeur « SpinASoft » → « Orical ») : plus aucune occurrence VISIBLE de l'ancien nom
// dans les fichiers du dépôt (interface, aide, installeur, documentation, textes juridiques, scripts de publication).
// Liste blanche (identifiants techniques gardés exprès) :
//  - dossier des données %APPDATA%\Spin A Doc (nom historique, src/user-data.js) ;
//  - champ « app » de l'état des PDF modifiables (format v1 inchangé) ;
//  - nettoyage de l'ancienne installation (installer.nsh : SPIN_LEGACY_*) ;
//  - outils de développement qui reconnaissent l'ancienne installation (gardes de test, mise à jour depuis la 1.2.1) ;
//  - CHANGELOG (entrées historiques), CLAUDE.md (journal du projet), THIRD_PARTY_LICENSES (en-tête seulement vérifié).
// Usage : node test/test-rename.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const OLD = /Spin A Doc|SpinASoft|SpinADoc-(Setup|Portable)|Spin%20A%20Doc/;
// Fichiers de développement qui DOIVENT connaître l'ancien nom (jamais livrés ni affichés à l'utilisateur).
const DEV_FILES = new Set(['scripts/install-names.js', 'scripts/test-packaged.js', 'scripts/test-update.js', 'scripts/repro-install.js', 'scripts/watch-procs.ps1',
  'test/test-user-data.js', 'test/test-public.js', 'test/test-rename.js', 'test/test-winint.js', 'test/test-editable.js', 'CHANGELOG.md', 'CLAUDE.md']);
// Lignes autorisées ailleurs : identifiants techniques.
const ALLOWED_LINE = [
  /%APPDATA%\\+Spin A Doc/, /\$APPDATA\\Spin A Doc/, /\bLEGACY/, /SPIN_LEGACY/, /app: 'Spin A Doc'/,
  // Mentions EXPLICITES du renommage ou de l'ancienne installation (documentation pour le service informatique, aide, notes de version).
  /ancien nom|[Rr]enommage|ancien dossier s'appelle|raccourcis « Spin A Doc » sont remplacés|SpinADoc-Setup-(…|1\.2\.1)|devient « ?Orical|laissées? par la 1\.2\.1|Applications\\+Spin A Doc\.exe|« Spin A Doc » de `?RegisteredApplications/,
];
// Commentaires de code (.nsh, .js, .ps1) : jamais affichés à l'utilisateur.
const isComment = (f, l) => /\.(nsh|js|ps1)$/.test(f) && /^\s*(;|\/\/|#|\*)/.test(l);

const ls = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
const files = ls.stdout.split(/\r?\n/).filter((f) => f && !f.startsWith('src/icons/') && !f.startsWith('vendor/') && /\.(js|html|css|md|nsh|json|ps1|txt)$|^LICENSE$|^THIRD_PARTY_LICENSES$/.test(f) && fs.existsSync(path.join(root, f)));
check('fichiers du dépôt listés (git ls-files)', ls.status === 0 && files.length > 100, files.length);
const hits = [];
for (const f of files) {
  if (DEV_FILES.has(f) || f === 'package-lock.json') continue;
  read(f).split(/\r?\n/).forEach((l, i) => { if (OLD.test(l) && !isComment(f, l) && !ALLOWED_LINE.some((re) => re.test(l))) hits.push(`${f}:${i + 1}: ${l.trim().slice(0, 120)}`); });
}
check('aucune occurrence visible de « Spin A Doc », « SpinASoft » ni des anciens noms d\'installeurs (hors liste blanche)', hits.length === 0, hits.slice(0, 20));

// Points précis
const pkg = JSON.parse(read('package.json'));
check('package.json : productName, raccourci, installeurs, description, éditeur', pkg.build.productName === 'Orical PDF' && pkg.build.nsis.shortcutName === 'Orical PDF' &&
  pkg.build.nsis.artifactName === 'OricalPDF-Setup-${version}.${ext}' && pkg.build.portable.artifactName === 'OricalPDF-Portable-${version}.${ext}' &&
  /^Orical PDF/.test(pkg.description) && pkg.author === 'Orical' && /Orical$/.test(pkg.build.copyright));
check('package.json : appId inchangé (même désinstallation, mise à jour par-dessus)', pkg.build.appId === 'com.spinadoc.app');
check('main.js : nom de l\'application et titre de la fenêtre = Orical PDF', /app\.setName\('Orical PDF'\)/.test(read('main.js')) && /title: 'Orical PDF'/.test(read('main.js')));
check('index.html : <title>, marque de la barre de titre, accueil, À propos', /<title>Orical PDF<\/title>/.test(read('src/index.html')) && /class="brand-name">Orical PDF</.test(read('src/index.html')) && /<h1>Orical PDF<\/h1>/.test(read('src/index.html')));
check('THIRD_PARTY_LICENSES et son générateur : en-tête « Orical PDF »', /^Orical PDF — licences tierces/.test(read('THIRD_PARTY_LICENSES')) && read('scripts/check-licenses.js').includes("'Orical PDF — licences tierces"));
check('CHANGELOG : titre « Orical PDF »', /^# Journal des versions — Orical PDF/.test(read('CHANGELOG.md')));
// Identifiants techniques conservés
check('ProgId SpinADoc.pdf, clé Software\\SpinADoc, préfixe SPINADOC_ conservés', /!define SPIN_PROGID "SpinADoc\.pdf"/.test(read('build/installer.nsh')) && /Software\\SpinADoc\\Capabilities/.test(read('build/installer.nsh')) && /SPINADOC_USER_DATA/.test(read('src/user-data.js')));
check('PDF modifiables : clé /SpinADoc, /Type /SpinADocState, étiquette SpinADoc conservées', /const KEY = 'SpinADoc';/.test(read('src/editable-state.js')) && /const TYPE = 'SpinADocState';/.test(read('src/editable-state.js')) && /const TAG = 'SpinADoc';/.test(read('src/editable-state.js')));

console.log(`\n${passed} ok, ${failures.length} échec(s)`);
if (failures.length) process.exit(1);
