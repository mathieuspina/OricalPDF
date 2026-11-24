// Installation et désinstallation propres d'un poste (npm run test:update), en silencieux, dans un dossier temporaire.
// Depuis la 1.4.0, l'identité d'installation est com.orical.pdf et AUCUNE version antérieure de cette identité n'a été publiée : le test de
// mise à jour « par-dessus » n'a pas encore de sens. Il reprendra à la version suivante (installeur 1.4.0 gardé dans dist/, puis nouvel
// installeur par-dessus, profil conservé à l'octet près).
// Vérifie : installation (code 0, version du fichier), une seule entrée de désinstallation (version, dossier), raccourcis Bureau et menu
// Démarrer, association « Ouvrir avec » posée (OpenWithProgids, classe OricalPDF.pdf → exécutable, Applications\Orical PDF.exe,
// Software\Orical\OricalPDF\Capabilities, RegisteredApplications, icône des fichiers PDF), valeur par défaut de .pdf inchangée ; application
// lancée sur un profil de test (réglage écrit et relu, À propos = version) ; désinstallation silencieuse SANS option (désinstalleur lancé
// normalement : il se copie hors du dossier, qui doit disparaître entièrement) : aucune trace (registre, raccourcis, entrée de
// désinstallation, clé d'emplacement, dossier d'installation) ; données de l'utilisateur conservées par défaut (dossier de test /DATADIR=
// avec le témoin .oricalpdf-test, comparé à l'octet près) ; vrai profil %APPDATA%\Orical PDF inchangé. Aucune relance : un code non nul est un échec.
// Refus si Orical PDF est déjà installé sur le compte (même identité que l'installeur de test).
// Usage : node scripts/test-update.js
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launchApp, sleep } = require('../test/lib/app.js');
const { makeAll } = require('../test/lib/make-pdfs.js');
const Names = require('./install-names.js');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const version = require('../package.json').version;
const setup = path.join(dist, `OricalPDF-Setup-${version}.exe`);
const failures = [];
const crashes = []; // plantages de l'installeur (relance), rappelés en fin de rapport
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };
const BS = String.fromCharCode(92);
const key = (...p) => p.join(BS);
const ps = (cmd) => (spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], { encoding: 'utf8' }).stdout || '').trim();
const regQuery = (k, extra) => { const r = spawnSync('reg', ['query', k, ...(extra || [])], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('HKEY_')).join(' ; ') : '(absent)'; };
// Entrées de désinstallation : [{ id, name, version, uninstall, location }]. electron-builder n'écrit pas InstallLocation dans la clé de
// désinstallation : l'emplacement est sous HKCU\Software\<même identifiant que la clé>.
const entries = () => { const o = ps(`Get-ChildItem 'HKCU:${BS}Software${BS}Microsoft${BS}Windows${BS}CurrentVersion${BS}Uninstall' | % { $p = Get-ItemProperty $_.PSPath; if ($p.DisplayName -like 'Orical PDF*') { $k = Get-ItemProperty ('HKCU:${BS}Software${BS}' + $_.PSChildName) -ErrorAction SilentlyContinue; $_.PSChildName + '|' + $p.DisplayName + '|' + $p.DisplayVersion + '|' + $p.UninstallString + '|' + $k.InstallLocation } }`); return o ? o.split(/\r?\n/).map((l) => { const [id, name, v, un, loc] = l.split('|'); return { id, name, version: v, uninstall: un, location: loc }; }) : []; };
const rmRetry = (p) => { try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 }); } catch (e) { console.log('     (nettoyage : ' + p + ' non supprimé : ' + e.code + ')'); } };
const lnks = () => Names.shortcuts(Names.CURRENT).filter((p) => fs.existsSync(p));
const fileVersion = (exe) => ps(`(Get-Item -LiteralPath '${exe.split("'").join("''")}').VersionInfo.ProductVersion`);
const running = () => /\.exe/i.test(spawnSync('tasklist', ['/FI', `IMAGENAME eq ${Names.CURRENT}.exe`, '/NH'], { encoding: 'utf8' }).stdout || '');
// Empreinte d'un dossier (noms + contenus), pour comparer un profil avant / après.
function treeHash(dir) {
  const h = crypto.createHash('sha256');
  const walk = (d, rel) => { for (const n of fs.readdirSync(d).sort()) { const p = path.join(d, n); const r = rel + '/' + n; if (fs.statSync(p).isDirectory()) { h.update('D' + r); walk(p, r); } else { h.update('F' + r); h.update(fs.readFileSync(p)); } } };
  if (fs.existsSync(dir)) walk(dir, ''); else h.update('(absent)');
  return h.digest('hex');
}
const assoc = (exe) => ({
  pdfDefault: regQuery(key('HKCU', 'Software', 'Classes', '.pdf'), ['/ve']),
  openWith: regQuery(key('HKCU', 'Software', 'Classes', '.pdf', 'OpenWithProgids'), ['/v', 'OricalPDF.pdf']),
  progId: regQuery(key('HKCU', 'Software', 'Classes', 'OricalPDF.pdf', 'shell', 'open', 'command'), ['/ve']),
  defaultIcon: regQuery(key('HKCU', 'Software', 'Classes', 'OricalPDF.pdf', 'DefaultIcon'), ['/ve']),
  app: regQuery(key('HKCU', 'Software', 'Classes', 'Applications', Names.CURRENT + '.exe', 'shell', 'open', 'command'), ['/ve']),
  caps: regQuery(key('HKCU', 'Software', 'Orical', 'OricalPDF', 'Capabilities', 'FileAssociations')),
  orical: regQuery(key('HKCU', 'Software', 'Orical')),
  registered: regQuery(key('HKCU', 'Software', 'RegisteredApplications'), ['/v', Names.CURRENT]),
  exe,
});

(async () => {
  if (!fs.existsSync(setup)) { console.error('Il faut dist/OricalPDF-Setup-' + version + '.exe (lancez « npm run dist »).'); process.exit(2); }
  const found = Names.existingInstall();
  if (found.length || entries().length) { console.error('REFUS : Orical PDF est déjà installé sur ce compte (' + found.join(', ') + ') ; le test le toucherait.'); process.exit(3); }
  const realProfile = path.join(process.env.APPDATA || '', 'Orical PDF');
  const realBefore = treeHash(realProfile);
  const base = path.join(os.tmpdir(), 'oricalpdf-install-test');
  const dir = path.join(base, Names.CURRENT);
  const exe = path.join(dir, Names.CURRENT + '.exe');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'oricalpdf-install-profile-'));
  fs.writeFileSync(path.join(profile, '.oricalpdf-test'), ''); // témoin exigé par le désinstalleur pour /DATADIR=
  const before = assoc(null);
  rmRetry(base);
  fs.mkdirSync(base, { recursive: true });
  const f = await makeAll(path.join(os.tmpdir(), 'oricalpdf-ui-pdfs'));
  console.log(`Installation propre de ${version} dans ${dir}`);
  let id = null;
  try {
    // 1. Installation
    // Plantage connu de l'installeur au démarrage (0xC0000005 dans le greffon NSIS System.dll, voir CLAUDE.md « PLANTAGE DE L'INSTALLEUR ») :
    // UNE relance, comme test:packaged, notée dans test-logs/installer-crashes.log et rappelée en fin de rapport (jamais masquée).
    let r = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const t0 = Date.now();
      r = spawnSync(setup, ['/S', '/D=' + dir], { stdio: 'inherit' });
      const s = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`     installeur : code ${r.status}, ${s} s (essai ${attempt})`);
      if (r.status === 0) break;
      const hx = '0x' + ((r.status >>> 0).toString(16).toUpperCase());
      fs.mkdirSync(path.join(__dirname, '..', 'test-logs'), { recursive: true });
      fs.appendFileSync(path.join(__dirname, '..', 'test-logs', 'installer-crashes.log'), `${new Date().toISOString()}\ntest:update : INSTALLEUR ${hx} à l'essai ${attempt}, ${s} s\n`);
      crashes.push(`INSTALLEUR : ${hx} à l'essai ${attempt}`);
    }
    check('installation : code 0 (au plus une relance après plantage, signalée)', r.status === 0, r.status);
    let v = '';
    for (let i = 0; i < 60 && !v.startsWith(version); i++) { await sleep(1000); v = fs.existsSync(exe) ? fileVersion(exe) : ''; }
    check(`programme ${version} installé (version du fichier)`, v.startsWith(version), v);
    if (!v.startsWith(version)) throw new Error('programme non installé : suite du test impossible');
    const e = entries();
    id = e.length ? e[0].id : null;
    check(`une seule entrée de désinstallation : « ${Names.CURRENT} » ${version}, dans le dossier choisi`, e.length === 1 && e[0].version === version && e[0].name.startsWith(Names.CURRENT) && !!e[0].location && path.resolve(e[0].location) === path.resolve(dir) && e[0].uninstall.includes(path.join(dir, 'Uninstall ' + Names.CURRENT + '.exe')), e);
    check('raccourcis Bureau et menu Démarrer « Orical PDF »', lnks().length === 2, lnks());
    const a = assoc(exe);
    check('valeur par défaut de .pdf inchangée (jamais écrite)', a.pdfDefault === before.pdfDefault, [before.pdfDefault, a.pdfDefault]);
    check('« Ouvrir avec » : OricalPDF.pdf ajouté', /OricalPDF\.pdf/.test(a.openWith), a.openWith);
    check('classe OricalPDF.pdf et Applications\\Orical PDF.exe → exécutable installé "%1"', a.progId.includes('"' + exe + '" "%1"') && a.app.includes('"' + exe + '" "%1"'), [a.progId, a.app]);
    check('Software\\Orical\\OricalPDF\\Capabilities (.pdf → OricalPDF.pdf) et RegisteredApplications « Orical PDF »', /OricalPDF\.pdf/.test(a.caps) && a.registered.includes(key('Software', 'Orical', 'OricalPDF', 'Capabilities')), [a.caps, a.registered]);
    check('icône des fichiers PDF : DefaultIcon = <dossier>\\resources\\pdf-file.ico (présent)', a.defaultIcon.includes(path.join(dir, 'resources', 'pdf-file.ico')) && fs.existsSync(path.join(dir, 'resources', 'pdf-file.ico')), a.defaultIcon);

    // 2. Application installée lancée sur le profil de test
    const c = await launchApp({ exe, files: [f.a], env: { ORICALPDF_USER_DATA: profile } });
    try {
      await c.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`, 20000);
      await c.ev(`window.oricalpdf.setSettings({ installProbe: 'réglage écrit 42' })`);
      const s = JSON.parse(await c.ev(`window.oricalpdf.getSettings().then(JSON.stringify)`));
      check('réglage écrit puis relu', s.installProbe === 'réglage écrit 42', s);
      const about = JSON.parse(await c.ev(`window.oricalpdf.getAbout().then(JSON.stringify)`));
      check(`À propos : ${Names.CURRENT} ${version}`, about && about.version === version && about.name === Names.CURRENT, about && [about.name, about.version]);
      check('aucune erreur JavaScript', c.logs.length === 0, c.logs);
      await sleep(500);
    } finally { await c.close(); }
    check('profil de test rempli (réglages, récents)', ['settings.json', 'recents.json'].every((n) => fs.existsSync(path.join(profile, n))), fs.readdirSync(profile));
  } catch (err) {
    check('exécution sans exception', false, String(err && err.stack || err));
  } finally {
    // 3. Désinstallation silencieuse SANS option (données conservées). Lancée normalement (sans _?=) : le désinstalleur se copie dans un
    // dossier temporaire et supprime tout le dossier d'installation ; il rend la main avant la fin → attente.
    const profileBefore = treeHash(profile);
    for (let i = 0; i < 30 && running(); i++) await sleep(1000);
    const un = path.join(dir, `Uninstall ${Names.CURRENT}.exe`);
    if (fs.existsSync(un)) {
      const u = spawnSync(un, ['/S', '/DATADIR=' + profile], { stdio: 'inherit' });
      check('désinstallation : code 0', u.status === 0, u.status);
      for (let i = 0; i < 60 && (fs.existsSync(dir) || entries().length || lnks().length); i++) await sleep(1000);
    } else check('désinstalleur présent', false, un);
    const after = assoc(null);
    const left = {
      dossier: fs.existsSync(dir) ? fs.readdirSync(dir) : null,
      entrées: entries(), raccourcis: lnks(),
      emplacement: id ? regQuery(key('HKCU', 'Software', id)) : '(identifiant inconnu)',
      openWith: after.openWith, progId: regQuery(key('HKCU', 'Software', 'Classes', 'OricalPDF.pdf')),
      app: regQuery(key('HKCU', 'Software', 'Classes', 'Applications', Names.CURRENT + '.exe')), orical: after.orical, registered: after.registered,
    };
    check('aucune trace : dossier d\'installation supprimé entièrement', left.dossier === null, left.dossier);
    check('aucune trace : entrée de désinstallation, clé d\'emplacement HKCU\\Software\\<identifiant>, raccourcis', left.entrées.length === 0 && left.emplacement === '(absent)' && left.raccourcis.length === 0, left);
    check('aucune trace : OpenWithProgids, classe OricalPDF.pdf, Applications\\Orical PDF.exe, Software\\Orical, RegisteredApplications',
      left.openWith === '(absent)' && left.progId === '(absent)' && left.app === '(absent)' && left.orical === before.orical && left.registered === '(absent)', left);
    check('valeur par défaut de .pdf inchangée après désinstallation', after.pdfDefault === before.pdfDefault);
    check('données de l\'utilisateur conservées par défaut (dossier de test identique à l\'octet près)', fs.existsSync(profile) && treeHash(profile) === profileBefore);
    check('vrai profil %APPDATA%\\Orical PDF inchangé', treeHash(realProfile) === realBefore);
    rmRetry(base);
    rmRetry(profile);
  }
  console.log(failures.length ? `\n${failures.length} échec(s) / ${passed + failures.length}` : `\nOK : installation et désinstallation propres (${passed} vérifications).`);
  if (crashes.length) console.log('\n!!!!! AVERTISSEMENT : relance après plantage (NON masqué) :\n' + crashes.map((w) => '  - ' + w).join('\n'));
  process.exit(failures.length ? 1 : 0);
})();
