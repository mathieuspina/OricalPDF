// Intégration à Windows (logique, lecture des sources, aucune commande système) : association « Ouvrir avec » seulement (valeur par défaut
// de .pdf jamais écrite, chaque clé écrite retirée à la désinstallation), aucune trace de l'ancienne imprimante virtuelle (retirée en 0.12.2),
// deuxième lancement et page « Applications par défaut » dans le processus principal.
// Usage : node test/test-winint.js
const fs = require('fs');
const path = require('path');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ins = read('build/installer.nsh');
const pkg = require('../package.json');
const main = read('main.js');

// 1. Association « Ouvrir avec » (installeur NSIS)
check('package.json : pas de fileAssociations (qui écrirait la valeur par défaut de .pdf)', !pkg.build.fileAssociations);
check('installer.nsh : jamais d\'écriture de la valeur par défaut de Software\\Classes\\.pdf', !/WriteRegStr\s+\S+\s+"Software\\Classes\\\.pdf"\s+""/.test(ins) && !/APP_ASSOCIATE/.test(ins));
check('installer.nsh : OpenWithProgids SpinADoc.pdf écrit puis retiré', /WriteRegStr SHCTX "Software\\Classes\\\.pdf\\OpenWithProgids" "\$\{SPIN_PROGID\}" ""/.test(ins) && /DeleteRegValue SHCTX "Software\\Classes\\\.pdf\\OpenWithProgids" "\$\{SPIN_PROGID\}"/.test(ins));
check('installer.nsh : Applications\\…exe et RegisteredApplications écrits', /Software\\Classes\\Applications\\\$\{APP_EXECUTABLE_FILENAME\}\\SupportedTypes" "\.pdf"/.test(ins) && /WriteRegStr SHCTX "Software\\RegisteredApplications" "Orical PDF"/.test(ins));
const caps = /!define SPIN_CAPS "([^"]+)"/.exec(ins)[1];
const expand = (k) => k.split('${SPIN_CAPS}').join(caps);
const written = [...ins.matchAll(/WriteRegStr SHCTX "([^"]+)"/g)].map((m) => m[1]);
const removed = [...ins.matchAll(/DeleteReg(?:Key|Value) SHCTX "([^"]+)"/g)].map((m) => m[1]);
const orphan = written.map(expand).filter((k) => k !== 'Software\\Classes\\.pdf\\OpenWithProgids' && !removed.some((r) => k === r || k.startsWith(r + '\\')));
check(`installer.nsh : chaque clé écrite (${written.length}) est retirée à la désinstallation`, written.length >= 8 && orphan.length === 0, orphan);
check('installer.nsh : case « Supprimer aussi mes réglages » et /DELETEDATA conservées', /Supprimer aussi mes réglages et ma bibliothèque/.test(ins) && /"\/DELETEDATA="/.test(ins));

// 1 bis. Orical PDF (1.3.0) : icône des fichiers PDF, noms affichés, traces de l'ancien nom retirées, identifiants techniques gardés
const customInstall = /!macro customInstall([\s\S]*?)!macroend/.exec(ins)[1];
check('icône des fichiers PDF : DefaultIcon de la classe = resources\\pdf-file.ico livré par extraResources (fichier présent)',
  /WriteRegStr SHCTX "Software\\Classes\\\$\{SPIN_PROGID\}\\DefaultIcon" "" "\$INSTDIR\\resources\\pdf-file\.ico,0"/.test(ins) &&
  pkg.build.extraResources.some((r) => r.from === 'build/pdf-file.ico' && r.to === 'pdf-file.ico') && fs.existsSync(path.join(root, 'build', 'pdf-file.ico')));
check('noms affichés = « Orical PDF » (classe, FriendlyAppName, ApplicationName, RegisteredApplications), aucun « Spin A Doc » écrit',
  /"Software\\Classes\\\$\{SPIN_PROGID\}" "" "Document PDF \(Orical PDF\)"/.test(ins) && /"FriendlyAppName" "Orical PDF"/.test(ins) && /"ApplicationName" "Orical PDF"/.test(ins) &&
  /"Software\\RegisteredApplications" "Orical PDF" "\$\{SPIN_CAPS\}"/.test(ins) && ![...ins.matchAll(/WriteRegStr[^\n]*/g)].some((m) => /Spin A Doc|SPIN_LEGACY/.test(m[0])));
check('installation : clé Applications\\Spin A Doc.exe et valeur « Spin A Doc » de RegisteredApplications (1.2.1) supprimées',
  /!define SPIN_LEGACY_EXE "Spin A Doc\.exe"/.test(ins) && /!define SPIN_LEGACY_NAME "Spin A Doc"/.test(ins) &&
  /DeleteRegKey SHCTX "Software\\Classes\\Applications\\\$\{SPIN_LEGACY_EXE\}"/.test(customInstall) && /DeleteRegValue SHCTX "Software\\RegisteredApplications" "\$\{SPIN_LEGACY_NAME\}"/.test(customInstall));
check('identifiants gardés : ProgId SpinADoc.pdf, Software\\SpinADoc\\Capabilities, appId', /!define SPIN_PROGID "SpinADoc\.pdf"/.test(ins) && caps === 'Software\\SpinADoc\\Capabilities' && pkg.build.appId === 'com.spinadoc.app');
check('exécutable « Orical PDF.exe » (productName) : la clé Applications\\<exe> suit le nouveau nom', pkg.build.productName === 'Orical PDF' && !pkg.build.win.executableName);

// 1 ter. Mise à jour depuis la 1.2.1 : dossier « …\Spin A Doc » remplacé par le dossier voisin « …\Orical PDF » (silencieux et assistant)
const fixFn = (/Function spinFixInstDir([\s\S]*?)FunctionEnd/.exec(ins) || [])[1] || '';
check('dossier d\'installation : « Spin A Doc » (nom exact) → dossier voisin ${APP_FILENAME}, ancien dossier noté',
  /\$\{GetFileName\} "\$INSTDIR" \$R8/.test(fixFn) && /\$R8 == "\$\{SPIN_LEGACY_NAME\}"/.test(fixFn) && /\$\{GetParent\} "\$INSTDIR" \$R9/.test(fixFn) && /StrCpy \$INSTDIR "\$R9\\\$\{APP_FILENAME\}"/.test(fixFn) && /StrCpy \$SpinOldDir "\$INSTDIR"/.test(fixFn));
check('redirection appliquée à l\'initialisation (silencieux) ET après la page du dossier (assistant, avant instFilesPre)',
  /!macro customInit\s+Call spinFixInstDir\s+!macroend/.test(ins) && /!macro customPageAfterChangeDir\s+Page custom spinFixDirPage\s+!macroend/.test(ins) && /Function spinFixDirPage\s+Call spinFixInstDir\s+Abort/.test(ins));
check('ancien dossier : seulement RMDir non récursif (s\'il est vide) ; tout le code d\'installation hors du désinstalleur', /RMDir "\$SpinOldDir"/.test(customInstall) && !/RMDir \/r "\$SpinOldDir"/.test(ins) &&
  ins.indexOf('Var SpinOldDir') > ins.indexOf('!ifndef BUILD_UNINSTALLER') && ins.indexOf('Var SpinOldDir') < ins.indexOf('!ifdef BUILD_UNINSTALLER'));

// 2. Imprimante virtuelle retirée (0.12.2)
check('installer.nsh : plus d\'imprimante (case, /REMOVEPRINTER, PowerShell, vprinter.nsh)', !/imprimante|printer|powershell|vprinter/i.test(ins));
check('fichiers de l\'imprimante supprimés', ['vprinter-main.js', 'src/vprinter.js', 'src/js/vprinter-ui.js', 'build/vprinter.nsh', 'scripts/make-vprinter-nsh.js'].every((p) => !fs.existsSync(path.join(root, p))));
check('package.json : rien de l\'imprimante empaqueté', !pkg.build.files.some((f) => /vprinter/.test(f)));
check('main.js / preload.js : plus d\'IPC vprinter ni de dossier « Impressions »', !/vprinter|Impressions/.test(main + read('preload.js')));

// 3. Processus principal : deuxième lancement et page « Applications par défaut »
check('main.js : instance unique, fichiers d\'un deuxième lancement ouverts (ou mis en attente si la fenêtre n\'est pas prête)', /requestSingleInstanceLock/.test(main) && /'second-instance'/.test(main) && /pending\.push\(\.\.\.files\)/.test(main));
check('main.js : app:default-apps → ms-settings:defaultapps?registeredAppUser=Orical PDF', /'app:default-apps'/.test(main) && /ms-settings:defaultapps\?registeredAppUser=' \+ encodeURIComponent\('Orical PDF'\)/.test(main));

console.log(failures.length ? `\n${failures.length} échec(s) / ${passed + failures.length}` : `\nOK : ${passed} vérifications.`);
process.exit(failures.length ? 1 : 0);
