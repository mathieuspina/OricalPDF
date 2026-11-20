// Dépôt public (logique, lecture des sources) : titulaire des droits « SpinASoft », pas de fournisseur de mise à jour (publish: null),
// page de licence de l'installeur (EULA), politique de confidentialité, fichiers privés ignorés par git, CLAUDE.md sans chemin local ni
// adresse de dépôt ; si un build existe : pas de resources/app-update.yml, EULA / politique / licences tierces livrées.
// La recherche de données personnelles elle-même se fait avec scripts/scan-private.js (motifs privés hors du dépôt).
// Usage : node test/test-public.js
const fs = require('fs');
const path = require('path');
const { toText } = require('../scripts/make-eula.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = require('../package.json');

// 1. Titulaire des droits
check('LICENSE : « Copyright (c) 2026 SpinASoft », tous droits réservés, renvoi à l\'EULA et aux licences tierces', /^Copyright \(c\) 2026 SpinASoft\. Tous droits réservés\./.test(read('LICENSE')) && /EULA\.fr\.md/.test(read('LICENSE')) && /THIRD_PARTY_LICENSES/.test(read('LICENSE')));
check('package.json : author et copyright = SpinASoft (propriétés de l\'exécutable)', pkg.author === 'SpinASoft' && pkg.build.copyright === 'Copyright © 2026 SpinASoft');
check('À propos : © SpinASoft', /© \$\{year\} SpinASoft\. Tous droits réservés\./.test(read('app-info.js')));

// 2. Pas de mise à jour automatique ni de fournisseur de publication
check('package.json : build.publish = null (pas de resources/app-update.yml)', pkg.build.publish === null);

// 3. EULA et page de licence de l'installeur
const eula = read('EULA.fr.md');
const clauses = { 'usage personnel et professionnel gratuit': /gratuitement[^.]*personnel ou professionnel/s, 'redistribution interdite sans accord': /redistribuer le Logiciel/, 'modification interdite': /modifier, adapter/, 'aucune garantie': /« en l'état »/, 'limitation de responsabilité': /Limitation de responsabilité/, 'caviardage : vérifier dans un autre lecteur': /vérifiez toujours le fichier produit dans un autre lecteur PDF/, 'signature sans valeur juridique': /pas de valeur de signature électronique/, 'mention de brouillon': /BROUILLON/ };
const missing = Object.entries(clauses).filter(([, re]) => !re.test(eula)).map(([k]) => k);
check('EULA.fr.md : clauses attendues', missing.length === 0, missing);
check('installeur : page de licence = build/eula.txt, générée par « npm run dist »', pkg.build.nsis.license === 'build/eula.txt' && /make-eula\.js/.test(pkg.scripts.dist) && pkg.build.nsis.oneClick === false);
const txt = toText('# Titre\n\n> **Gras** et `code` [lien](http://x)\n');
check('EULA en texte brut : titres, gras, code et liens simplifiés, fins de ligne Windows', txt === 'Titre\r\n\r\nGras et code lien\r\n', txt);

// 4. Confidentialité
const pol = read('POLITIQUE-CONFIDENTIALITE.md');
check('POLITIQUE-CONFIDENTIALITE.md : aucune donnée collectée, garde réseau, données locales', /ne collecte, ne transmet et ne vend aucune donnée/.test(pol) && /bloquée/.test(pol) && /%APPDATA%\\Spin A Doc/.test(pol));
check('garde réseau toujours installée au démarrage (main.js)', /AppInfo\.installNetGuard\(/.test(read('main.js')));
const extra = (pkg.build.extraResources || []).map((e) => e.from);
check('EULA, politique et licences tierces livrées avec l\'application (resources)', ['EULA.fr.md', 'POLITIQUE-CONFIDENTIALITE.md', 'THIRD_PARTY_LICENSES'].every((f) => extra.includes(f)), extra);

// 5. Fichiers privés : jamais suivis
const gi = read('.gitignore');
check('.gitignore : CLAUDE.local.md, motifs privés, build/eula.txt, binaires (.exe .dll .msi .7z .zip .asar .pdf)', ['CLAUDE.local.md', 'private-patterns*.txt', 'build/eula.txt', '*.exe', '*.dll', '*.msi', '*.7z', '*.zip', '*.asar', '*.pdf'].every((s) => gi.split(/\r?\n/).includes(s)));
const tracked = require('child_process').spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
const big = tracked.filter((f) => fs.statSync(path.join(root, f)).size > 5 * 1024 * 1024);
check('git : aucun fichier suivi de plus de 5 Mo, aucun binaire (.exe .dll .pdf .msi .7z .zip .asar)', !big.length && !tracked.some((f) => /\.(exe|dll|pdf|msi|7z|zip|asar)$/i.test(f)), big);
const cl = read('CLAUDE.md');
check('CLAUDE.md public : aucun chemin de lecteur D:\\ à Z:\\ ni adresse de dépôt GitHub', !/\b[D-Z]:\\/.test(cl) && !/github\.com\//.test(cl));
check('scanner de données personnelles présent, motifs privés HORS du dépôt', fs.existsSync(path.join(root, 'scripts', 'scan-private.js')) && !fs.existsSync(path.join(root, 'private-patterns.txt')));
// Motifs du scanner : limite de mot (re:\bNOM\b, casse ignorée) et casse respectée (rec:) ; un nom court ne sort plus dans « Edieresis »
// (nom de glyphe de pdf.js). Noms FICTIFS, dossier temporaire.
{
  const os = require('os');
  const { spawnSync } = require('child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spinadoc-scan-'));
  fs.mkdirSync(path.join(tmp, 'd'));
  fs.writeFileSync(path.join(tmp, 'd', 'a.txt'), 'glyphes : Edieresis edieresis Edieresissmall\nnom : EDIER et Edier, Edier-Dupont\n');
  const B = String.fromCharCode(92);
  const run = (pat) => {
    fs.writeFileSync(path.join(tmp, 'p.txt'), pat + '\n');
    spawnSync(process.execPath, [path.join(root, 'scripts', 'scan-private.js'), '--patterns', path.join(tmp, 'p.txt'), '--dir', path.join(tmp, 'd'), '--json', path.join(tmp, 'r.json')], { stdio: 'ignore' });
    return JSON.parse(fs.readFileSync(path.join(tmp, 'r.json'), 'utf8')).filter((h) => h.kind === 'privé').map((h) => h.match).join(',');
  };
  const lit = run('EDIER'), word = run('re:' + B + 'bEDIER' + B + 'b'), cs = run('rec:' + B + 'bEDIER' + B + 'b');
  fs.rmSync(tmp, { recursive: true, force: true });
  check('scanner : re: avec limite de mot = mot entier, casse ignorée (pas « Edieresis ») ; rec: = casse respectée ; texte littéral inchangé', word === 'EDIER,Edier,Edier' && cs === 'EDIER' && lit.split(',').length === 6, { lit, word, cs });
}

// 6. Build (si présent)
const res = path.join(root, 'dist', 'win-unpacked', 'resources');
if (fs.existsSync(res)) {
  check('build : pas de resources/app-update.yml', !fs.existsSync(path.join(res, 'app-update.yml')));
  check('build : EULA, politique et licences tierces dans resources', ['EULA.fr.md', 'POLITIQUE-CONFIDENTIALITE.md', 'THIRD_PARTY_LICENSES.txt'].every((f) => fs.existsSync(path.join(res, f))));
} else console.log('   (pas de build dans dist/ : contrôles du build sautés)');

console.log(failures.length ? `\n${failures.length} échec(s) / ${passed + failures.length}` : `\nOK : ${passed} vérifications.`);
process.exit(failures.length ? 1 : 0);
