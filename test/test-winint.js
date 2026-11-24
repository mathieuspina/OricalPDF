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
check('installer.nsh : OpenWithProgids OricalPDF.pdf écrit puis retiré', /WriteRegStr SHCTX "Software\\Classes\\\.pdf\\OpenWithProgids" "\$\{ORICAL_PROGID\}" ""/.test(ins) && /DeleteRegValue SHCTX "Software\\Classes\\\.pdf\\OpenWithProgids" "\$\{ORICAL_PROGID\}"/.test(ins));
check('installer.nsh : Applications\\…exe et RegisteredApplications écrits', /Software\\Classes\\Applications\\\$\{APP_EXECUTABLE_FILENAME\}\\SupportedTypes" "\.pdf"/.test(ins) && /WriteRegStr SHCTX "Software\\RegisteredApplications" "Orical PDF"/.test(ins));
const caps = /!define ORICAL_CAPS "([^"]+)"/.exec(ins)[1];
const expand = (k) => k.split('${ORICAL_CAPS}').join(caps);
const written = [...ins.matchAll(/WriteRegStr SHCTX "([^"]+)"/g)].map((m) => m[1]);
const removed = [...ins.matchAll(/DeleteReg(?:Key|Value) SHCTX "([^"]+)"/g)].map((m) => m[1]);
const orphan = written.map(expand).filter((k) => k !== 'Software\\Classes\\.pdf\\OpenWithProgids' && !removed.some((r) => k === r || k.startsWith(r + '\\')));
check(`installer.nsh : chaque clé écrite (${written.length}) est retirée à la désinstallation`, written.length >= 8 && orphan.length === 0, orphan);
check('installer.nsh : case « Supprimer aussi mes réglages » et /DELETEDATA conservées', /Supprimer aussi mes réglages et ma bibliothèque/.test(ins) && /"\/DELETEDATA="/.test(ins));

// 1 bis. Icône des fichiers PDF, noms affichés, identifiants, aucune migration
const customInstall = /!macro customInstall([\s\S]*?)!macroend/.exec(ins)[1];
check('icône des fichiers PDF : DefaultIcon de la classe = resources\\pdf-file.ico livré par extraResources (fichier présent)',
  /WriteRegStr SHCTX "Software\\Classes\\\$\{ORICAL_PROGID\}\\DefaultIcon" "" "\$INSTDIR\\resources\\pdf-file\.ico,0"/.test(ins) &&
  pkg.build.extraResources.some((r) => r.from === 'build/pdf-file.ico' && r.to === 'pdf-file.ico') && fs.existsSync(path.join(root, 'build', 'pdf-file.ico')));
check('noms affichés = « Orical PDF » (classe, FriendlyAppName, ApplicationName, RegisteredApplications)',
  /"Software\\Classes\\\$\{ORICAL_PROGID\}" "" "Document PDF \(Orical PDF\)"/.test(ins) && /"FriendlyAppName" "Orical PDF"/.test(ins) && /"ApplicationName" "Orical PDF"/.test(ins) &&
  /"Software\\RegisteredApplications" "Orical PDF" "\$\{ORICAL_CAPS\}"/.test(ins));
check('identifiants : ProgId OricalPDF.pdf, Software\\Orical\\OricalPDF\\Capabilities, appId com.orical.pdf', /!define ORICAL_PROGID "OricalPDF\.pdf"/.test(ins) && caps === 'Software\\Orical\\OricalPDF\\Capabilities' && pkg.build.appId === 'com.orical.pdf');
check('désinstallation : Software\\Orical\\OricalPDF retirée, puis Software\\Orical seulement si vide', /DeleteRegKey SHCTX "Software\\Orical\\OricalPDF"/.test(ins) && /DeleteRegKey \/ifempty SHCTX "Software\\Orical"/.test(ins));
check('exécutable « Orical PDF.exe » (productName) : la clé Applications\\<exe> suit le nom', pkg.build.productName === 'Orical PDF' && !pkg.build.win.executableName);
check('aucun code de migration d\'une installation antérieure (customInit, page après le dossier, RMDir d\'un ancien dossier, suppression d\'anciennes clés)',
  !/customInit|customPageAfterChangeDir|OldDir|LEGACY|FixInstDir/i.test(ins) && !/RMDir "\$/.test(customInstall) && !/DeleteReg/.test(customInstall));

// 2. Imprimante virtuelle retirée (0.12.2)
check('installer.nsh : plus d\'imprimante (case, /REMOVEPRINTER, PowerShell, vprinter.nsh)', !/imprimante|printer|powershell|vprinter/i.test(ins));
check('fichiers de l\'imprimante supprimés', ['vprinter-main.js', 'src/vprinter.js', 'src/js/vprinter-ui.js', 'build/vprinter.nsh', 'scripts/make-vprinter-nsh.js'].every((p) => !fs.existsSync(path.join(root, p))));
check('package.json : rien de l\'imprimante empaqueté', !pkg.build.files.some((f) => /vprinter/.test(f)));
check('main.js / preload.js : plus d\'IPC vprinter ni de dossier « Impressions »', !/vprinter|Impressions/.test(main + read('preload.js')));

// 3. Processus principal : deuxième lancement et page « Applications par défaut »
check('main.js : instance unique, fichiers d\'un deuxième lancement ouverts (ou mis en attente si la fenêtre n\'est pas prête)', /requestSingleInstanceLock/.test(main) && /'second-instance'/.test(main) && /pending\.push\(\.\.\.files\)/.test(main));
check('main.js : app:default-apps → ms-settings:defaultapps?registeredAppUser=Orical PDF', /'app:default-apps'/.test(main) && /ms-settings:defaultapps\?registeredAppUser=' \+ encodeURIComponent\('Orical PDF'\)/.test(main));
{
  // 1.4.0 : le modèle d'electron-builder fait « SetOutPath $INSTDIR » dans un.onInit : le dossier d'installation, vide, restait après la
  // désinstallation (dossier courant du désinstalleur). customUnInstall en sort puis RMDir SANS /r (seulement si vide), en dernier.
  const un = (ins.split('!macro customUnInstall')[1] || '').split('!macroend')[0];
  const tail = un.trim().split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith(';')).slice(-2);
  check('installer.nsh : désinstallation → dossier d\'installation vide retiré (SetOutPath "$TEMP" puis RMDir "$INSTDIR" sans /r, en dernier)',
    tail[0] === 'SetOutPath "$TEMP"' && tail[1] === 'RMDir "$INSTDIR"' && !/RMDir\s+\/r\s+"?\$INSTDIR/.test(un.split('\n').filter((l) => !l.trim().startsWith(';')).join('\n')), tail);
}

console.log(failures.length ? `\n${failures.length} échec(s) / ${passed + failures.length}` : `\nOK : ${passed} vérifications.`);
process.exit(failures.length ? 1 : 0);
