// Dépôt public (logique, lecture des sources) : titulaire des droits « SpinASoft », pas de fournisseur de mise à jour (publish: null),
// page de licence de l'installeur (EULA), politique de confidentialité, fichiers privés ignorés par git, CLAUDE.md sans chemin local ni
// adresse de dépôt ; si un build existe : pas de resources/app-update.yml, EULA / politique / licences tierces livrées.
// 1.2.1 : aucune mention de brouillon (« à faire relire par un juriste »…) dans le texte visible (EULA, page de licence de l'installeur,
// politique, README, aide, notes) ; contrat et politique inchangés par ailleurs (empreintes) ; rappel interne dans RELEASING.md seulement.
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
const clauses = { 'usage personnel et professionnel gratuit': /gratuitement[^.]*personnel ou professionnel/s, 'redistribution interdite sans accord': /redistribuer le Logiciel/, 'modification interdite': /modifier, adapter/, 'aucune garantie': /« en l'état »/, 'limitation de responsabilité': /Limitation de responsabilité/, 'caviardage : vérifier dans un autre lecteur': /vérifiez toujours le fichier produit dans un autre lecteur PDF/, 'signature sans valeur juridique': /pas de valeur de signature électronique/ };
const missing = Object.entries(clauses).filter(([, re]) => !re.test(eula)).map(([k]) => k);
check('EULA.fr.md : clauses attendues', missing.length === 0, missing);
check('EULA.fr.md : mention de brouillon ABSENTE (retirée en 1.2.1 ; avant : exigée)', !/BROUILLON/i.test(eula));
check('installeur : page de licence = build/eula.txt, générée par « npm run dist »', pkg.build.nsis.license === 'build/eula.txt' && /make-eula\.js/.test(pkg.scripts.dist) && pkg.build.nsis.oneClick === false);
const txt = toText('# Titre\n\n> **Gras** et `code` [lien](http://x)\n');
check('EULA en texte brut : titres, gras, code et liens simplifiés, fins de ligne Windows', txt === 'Titre\r\n\r\nGras et code lien\r\n', txt);

// 3 bis. Mention de brouillon retirée (1.2.1) : absente de tout texte visible ; le reste du contrat est inchangé mot pour mot.
// Empreintes SHA-256 = fichiers de la 1.2.0 (main 4e45cc8) moins les 2 lignes « > **BROUILLON — … » et la ligne vide qui suivait (vérifié par
// diff au moment du retrait). Toute modification du contrat ou de la politique doit être voulue : mettre alors l'empreinte à jour ici.
{
  const crypto = require('crypto');
  const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
  const DRAFT = /brouillon|juriste|faire relire|à relire|conseil juridique|\bdraft\b|TODO/i;
  const visible = {
    'EULA.fr.md': eula, 'page de licence de l\'installeur (texte généré)': toText(eula), 'POLITIQUE-CONFIDENTIALITE.md': read('POLITIQUE-CONFIDENTIALITE.md'),
    'README.md': read('README.md'), 'aide (help-content.js)': read('src/js/help-content.js'), 'docs/NOTES-INFORMATIQUE.md': read('docs/NOTES-INFORMATIQUE.md'),
    'LICENSE': read('LICENSE'), 'À propos (app-info.js)': read('app-info.js'),
  };
  const hit = Object.entries(visible).filter(([, s]) => DRAFT.test(s)).map(([k, s]) => k + ' : ' + s.match(DRAFT)[0]);
  check('aucune mention de brouillon / relecture juridique dans le texte visible (EULA, installeur, politique, README, aide, notes, LICENSE, À propos)', hit.length === 0, hit);
  check('EULA.fr.md : reste du contrat inchangé (empreinte de la 1.2.0 sans la mention), en-tête conservé (titre, version du 12 novembre 2026, Éditeur, Logiciel)',
    sha(eula) === '1ee696864b9132f0f639ab162e75f3b88581b6eef2fc158133bd868a52ac2d66' && /^# Contrat de licence utilisateur final — Spin A Doc\n\nVersion du 12 novembre 2026\. Éditeur : SpinASoft/.test(eula), sha(eula));
  check('POLITIQUE-CONFIDENTIALITE.md : reste inchangé (empreinte de la 1.2.0 sans la mention)', sha(read('POLITIQUE-CONFIDENTIALITE.md')) === 'a9e184eddf1ff126e98001515470aff7eb4b45fb9e07fd49f3315574bdf40585');
  check('EULA : pas de double ligne vide laissée par le retrait', !/\n\n\n/.test(eula) && !/\n\n\n/.test(read('POLITIQUE-CONFIDENTIALITE.md')));
  const rel = read('RELEASING.md');
  check('rappel interne dans RELEASING.md : « Contrat de licence (EULA) rédigé sans conseil juridique : à faire relire par un juriste avant une diffusion large »',
    rel.includes('Contrat de licence (EULA) rédigé sans conseil juridique : à faire relire par un juriste avant une diffusion large'));
  const shipped = JSON.stringify(pkg.build.files) + JSON.stringify(pkg.build.extraResources);
  check('RELEASING.md jamais embarqué dans l\'application (build.files, extraResources)', !/RELEASING/i.test(shipped), shipped);
}

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
  let builtVersion = null;
  try { builtVersion = JSON.parse(require(path.join(root, 'node_modules', '@electron', 'asar')).extractFile(path.join(res, 'app.asar'), 'package.json').toString('utf8')).version; } catch { /* asar illisible */ }
  if (builtVersion === pkg.version) {
    check(`build ${builtVersion} : EULA et politique livrées = celles du dépôt (sans mention de brouillon)`, ['EULA.fr.md', 'POLITIQUE-CONFIDENTIALITE.md'].every((f) => fs.readFileSync(path.join(res, f), 'utf8') === read(f)));
    const eulaTxt = path.join(root, 'build', 'eula.txt');
    check('build : page de licence de l\'installeur (build/eula.txt) = texte généré depuis EULA.fr.md, sans mention de brouillon', fs.existsSync(eulaTxt) && fs.readFileSync(eulaTxt, 'utf8') === '\ufeff' + toText(read('EULA.fr.md')) && !/brouillon|juriste/i.test(fs.readFileSync(eulaTxt, 'utf8')));
  } else console.log(`   (build de la version ${builtVersion} ≠ ${pkg.version} : contrôle du texte de licence livré sauté)`);
} else console.log('   (pas de build dans dist/ : contrôles du build sautés)');

console.log(failures.length ? `\n${failures.length} échec(s) / ${passed + failures.length}` : `\nOK : ${passed} vérifications.`);
process.exit(failures.length ? 1 : 0);
