// Mise à jour d'un poste : l'installeur de la NOUVELLE version lancé par-dessus l'ancienne (comme le fera un collègue), en silencieux, dans
// un dossier temporaire. Scénario réel de 1.3.0 : l'ancienne version (« Spin A Doc », 1.2.1) est installée dans un dossier « …\Spin A Doc »
// et la nouvelle est lancée SANS /D (elle reprend l'emplacement enregistré) : elle doit s'installer dans le dossier voisin « …\Orical PDF ».
// Vérifie : programme remplacé (version du fichier), ancien dossier supprimé, une seule entrée de désinstallation (nouvelle version, nouveau
// dossier), un seul raccourci par type au nouveau nom et aucun à l'ancien, registre sans l'ancien nom (Applications\Spin A Doc.exe,
// RegisteredApplications), icône des fichiers PDF, profil de l'utilisateur conservé à l'octet près (réglages, récents, bibliothèque),
// réglages relus, À propos = nouvelle version et nouveau nom, profil réel inchangé, registre et raccourcis revenus à l'état initial après
// désinstallation. Aucune relance : un code non nul est un échec.
// Le profil utilisé est un dossier temporaire (SPINADOC_USER_DATA) : le vrai %APPDATA%\Spin A Doc n'est jamais lu ni écrit.
// Refus si Orical PDF ou Spin A Doc est déjà installé sur le compte (même identité que l'installeur de test).
// Usage : node scripts/test-update.js [ancien-setup.exe]   (par défaut : l'installeur de version inférieure le plus récent dans dist/,
//         OricalPDF-Setup-x.y.z.exe ou SpinADoc-Setup-x.y.z.exe)
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
const newSetup = path.join(dist, `OricalPDF-Setup-${version}.exe`);
const vnum = (v) => v.split('.').map(Number).reduce((s, x) => s * 1000 + x, 0);
const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };
const BS = String.fromCharCode(92);
const key = (...p) => p.join(BS);
const ps = (cmd) => (spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], { encoding: 'utf8' }).stdout || '').trim();
const regQuery = (k, extra) => { const r = spawnSync('reg', ['query', k, ...(extra || [])], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('HKEY_')).join(' ; ') : '(absent)'; };
// Entrées de désinstallation des deux noms : [{ name, version, uninstall, location }]. electron-builder n'écrit pas InstallLocation dans la
// clé de désinstallation : l'emplacement (relu par la mise à jour suivante) est sous HKCU\Software\<même identifiant que la clé>.
const entries = () => { const o = ps(`Get-ChildItem 'HKCU:${BS}Software${BS}Microsoft${BS}Windows${BS}CurrentVersion${BS}Uninstall' | % { $p = Get-ItemProperty $_.PSPath; if ($p.DisplayName -like 'Orical PDF*' -or $p.DisplayName -like 'Spin A Doc*') { $k = Get-ItemProperty ('HKCU:${BS}Software${BS}' + $_.PSChildName) -ErrorAction SilentlyContinue; $p.DisplayName + '|' + $p.DisplayVersion + '|' + $p.UninstallString + '|' + $k.InstallLocation } }`); return o ? o.split(/\r?\n/).map((l) => { const [name, v, un, loc] = l.split('|'); return { name, version: v, uninstall: un, location: loc }; }) : []; };
const rmRetry = (p) => { try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 }); } catch (e) { console.log('     (nettoyage : ' + p + ' non supprimé : ' + e.code + ')'); } };
const lnksOf = (name) => Names.shortcuts(name).filter((p) => fs.existsSync(p));
const allLnks = () => [...lnksOf(Names.CURRENT), ...lnksOf(Names.LEGACY)];
const fileVersion = (exe) => ps(`(Get-Item -LiteralPath '${exe.split("'").join("''")}').VersionInfo.ProductVersion`);
// Empreinte d'un dossier (noms + contenus), pour comparer le profil avant / après.
function treeHash(dir) {
  const h = crypto.createHash('sha256');
  const walk = (d, rel) => { for (const n of fs.readdirSync(d).sort()) { const p = path.join(d, n); const r = rel + '/' + n; if (fs.statSync(p).isDirectory()) { h.update('D' + r); walk(p, r); } else { h.update('F' + r); h.update(fs.readFileSync(p)); } } };
  if (fs.existsSync(dir)) walk(dir, ''); else h.update('(absent)');
  return h.digest('hex');
}

(async () => {
  // Ancien installeur
  let oldSetup = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (!oldSetup) {
    const older = fs.readdirSync(dist).map((n) => /^(?:OricalPDF|SpinADoc)-Setup-(\d+\.\d+\.\d+)\.exe$/.exec(n)).filter((m) => m && vnum(m[1]) < vnum(version)).sort((a, b) => vnum(b[1]) - vnum(a[1]));
    if (older.length) oldSetup = path.join(dist, older[0][0]);
  }
  if (!fs.existsSync(newSetup) || !oldSetup || !fs.existsSync(oldSetup)) { console.error('Il faut dist/OricalPDF-Setup-' + version + '.exe et un installeur de version inférieure (argument ou dist/).'); process.exit(2); }
  const oldVersion = /(\d+\.\d+\.\d+)/.exec(path.basename(oldSetup))[1];
  const oldName = vnum(oldVersion) < vnum('1.3.0') ? Names.LEGACY : Names.CURRENT;
  // Garde : aucune vraie installation sur ce compte (des deux noms)
  const found = Names.existingInstall();
  if (found.length || entries().length) { console.error('REFUS : Orical PDF ou Spin A Doc est déjà installé sur ce compte (' + found.join(', ') + ') ; la mise à jour de test la toucherait.'); process.exit(3); }
  const realProfile = path.join(process.env.APPDATA || '', 'Spin A Doc');
  const realBefore = treeHash(realProfile);
  const base = path.join(os.tmpdir(), 'spinadoc-update-test');
  const oldDir = path.join(base, oldName);
  const newDir = path.join(base, Names.CURRENT);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'spinadoc-update-profile-'));
  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(base, { recursive: true });
  const f = await makeAll(path.join(os.tmpdir(), 'spinadoc-ui-pdfs'));
  const oldExe = path.join(oldDir, oldName + '.exe');
  const exe = path.join(newDir, Names.CURRENT + '.exe');
  console.log(`Mise à jour ${oldVersion} (${oldName}) → ${version} (${Names.CURRENT}) dans ${base}`);
  try {
    // 1. Ancienne version installée dans « …\<ancien nom> », utilisée : un réglage, un document récent, un élément de bibliothèque
    let r = spawnSync(oldSetup, ['/S', '/D=' + oldDir], { stdio: 'inherit' });
    check(`installation ${oldVersion} : code 0`, r.status === 0, r.status);
    for (let i = 0; i < 45 && !fs.existsSync(oldExe); i++) await sleep(1000);
    check(`programme ${oldVersion} installé dans « ${oldName} » (version du fichier)`, fs.existsSync(oldExe) && fileVersion(oldExe).startsWith(oldVersion), fs.existsSync(oldExe) && fileVersion(oldExe));
    // Ancienne version absente (installeur planté, voir « PLANTAGE DE L'INSTALLEUR ») : arrêt propre, nettoyage ci-dessous.
    if (!fs.existsSync(oldExe)) throw new Error(`ancienne version non installée (code ${r.status}${r.status > 0x7fffffff || r.status === 3221225477 ? ' = 0x' + r.status.toString(16).toUpperCase() : ''}) : mise à jour non testée`);
    let c = await launchApp({ exe: oldExe, files: [f.a], env: { SPINADOC_USER_DATA: profile } });
    try {
      await c.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`, 20000);
      await c.ev(`window.spinadoc.setSettings({ updateProbe: 'réglage conservé 42', zoomStep: 25 })`);
      fs.mkdirSync(path.join(profile, 'library'), { recursive: true });
      fs.writeFileSync(path.join(profile, 'library', 'tampon-exemple.json'), JSON.stringify({ name: 'Tampon exemple', text: 'VU' }));
      await sleep(500);
    } finally { await c.close(); }
    const before = treeHash(profile);
    check('profil de test rempli (réglages, récents, bibliothèque)', ['settings.json', 'recents.json', 'library'].every((n) => fs.existsSync(path.join(profile, n))), fs.readdirSync(profile));
    check(`raccourcis de l'ancienne version « ${oldName} » présents`, lnksOf(oldName).length === 2, lnksOf(oldName));

    // 2. Nouvel installeur par-dessus, SANS /D (emplacement repris du registre), aucune désinstallation préalable
    const t0 = Date.now();
    r = spawnSync(newSetup, ['/S'], { stdio: 'inherit' });
    console.log(`     installeur ${version} par-dessus : code ${r.status}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    check(`mise à jour ${version} : code 0 (aucune relance)`, r.status === 0, r.status);
    let v = '';
    for (let i = 0; i < 60 && !v.startsWith(version); i++) { await sleep(1000); v = fs.existsSync(exe) ? fileVersion(exe) : ''; }
    check(`programme ${version} installé dans le dossier voisin « ${Names.CURRENT} » (version du fichier)`, v.startsWith(version), { v, contenu: fs.existsSync(base) ? fs.readdirSync(base) : null });
    if (oldDir !== newDir) check(`ancien dossier « ${oldName} » supprimé (aucun reste)`, !fs.existsSync(oldDir), fs.existsSync(oldDir) && fs.readdirSync(oldDir));
    check('aucun dossier imbriqué « …\\Spin A Doc\\Orical PDF »', !fs.existsSync(path.join(oldDir, Names.CURRENT)));
    const e = entries();
    check(`une seule entrée de désinstallation : « ${Names.CURRENT} » ${version}, dans le nouveau dossier`, e.length === 1 && e[0].version === version && e[0].name.startsWith(Names.CURRENT) && !!e[0].location && path.resolve(e[0].location) === path.resolve(newDir) && e[0].uninstall.includes(path.join(newDir, 'Uninstall ' + Names.CURRENT + '.exe')), e);
    check(`un seul raccourci par type (Bureau, menu Démarrer), au nom « ${Names.CURRENT} »`, lnksOf(Names.CURRENT).length === 2, lnksOf(Names.CURRENT));
    check(`aucun raccourci « ${Names.LEGACY} »`, lnksOf(Names.LEGACY).length === 0, lnksOf(Names.LEGACY));
    const reg = {
      legacyApp: regQuery(key('HKCU', 'Software', 'Classes', 'Applications', Names.LEGACY + '.exe')),
      legacyRegistered: regQuery(key('HKCU', 'Software', 'RegisteredApplications'), ['/v', Names.LEGACY]),
      app: regQuery(key('HKCU', 'Software', 'Classes', 'Applications', Names.CURRENT + '.exe', 'shell', 'open', 'command'), ['/ve']),
      registered: regQuery(key('HKCU', 'Software', 'RegisteredApplications'), ['/v', Names.CURRENT]),
      progId: regQuery(key('HKCU', 'Software', 'Classes', 'SpinADoc.pdf', 'shell', 'open', 'command'), ['/ve']),
      defaultIcon: regQuery(key('HKCU', 'Software', 'Classes', 'SpinADoc.pdf', 'DefaultIcon'), ['/ve']),
    };
    check('registre : plus aucune trace de l\'ancien nom (Applications\\Spin A Doc.exe, RegisteredApplications « Spin A Doc »)', reg.legacyApp === '(absent)' && reg.legacyRegistered === '(absent)', reg);
    check('registre : Applications\\Orical PDF.exe, RegisteredApplications « Orical PDF », classe SpinADoc.pdf → nouvel exécutable', reg.app.includes(exe) && /SpinADoc/.test(reg.registered) && reg.progId.includes(exe), reg);
    check('icône des fichiers PDF : DefaultIcon = <nouveau dossier>\\resources\\pdf-file.ico (présent)', reg.defaultIcon.includes(path.join(newDir, 'resources', 'pdf-file.ico')) && fs.existsSync(path.join(newDir, 'resources', 'pdf-file.ico')), reg.defaultIcon);
    check('profil conservé à l\'octet près par la mise à jour', treeHash(profile) === before);

    // 3. La nouvelle version relit les réglages
    c = await launchApp({ exe, files: [f.b], env: { SPINADOC_USER_DATA: profile } });
    try {
      await c.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`, 20000);
      const s = JSON.parse(await c.ev(`window.spinadoc.getSettings().then(JSON.stringify)`));
      check('réglages relus par la nouvelle version', s.updateProbe === 'réglage conservé 42' && s.zoomStep === 25, s);
      const rec = JSON.parse(await c.ev(`window.spinadoc.listRecents().then(JSON.stringify)`));
      check('document récent de l\'ancienne version toujours listé', JSON.stringify(rec).includes(path.basename(f.a)), rec);
      const about = JSON.parse(await c.ev(`window.spinadoc.getAbout().then(JSON.stringify)`));
      check(`À propos : ${Names.CURRENT} ${version}`, about && about.version === version && about.name === Names.CURRENT, about && [about.name, about.version]);
      check('aucune erreur JavaScript', c.logs.length === 0, c.logs);
    } finally { await c.close(); }
    check('bibliothèque conservée', fs.existsSync(path.join(profile, 'library', 'tampon-exemple.json')));
  } catch (err) {
    check('exécution sans exception', false, String(err && err.stack || err));
  } finally {
    // 4. Désinstallation (données conservées : profil de test supprimé ensuite par le script) ; reste d'une mise à jour ratée : ancien désinstalleur
    // Comme test:packaged : attendre la fin des processus de l'application (fermée juste avant), sinon le désinstalleur rend la main
    // avant d'avoir tout retiré (constaté : entrée, raccourcis et clés retirés quelques secondes APRÈS le code 0).
    const running = () => Names.NAMES.some((n) => /\.exe/i.test(spawnSync('tasklist', ['/FI', `IMAGENAME eq ${n}.exe`, '/NH'], { encoding: 'utf8' }).stdout || ''));
    for (let i = 0; i < 30 && running(); i++) await sleep(1000);
    for (const [d, n] of [[newDir, Names.CURRENT], [oldDir, oldName]]) {
      const un = path.join(d, `Uninstall ${n}.exe`);
      if (fs.existsSync(un)) { const u = spawnSync(un, ['/S', '_?=' + d], { stdio: 'inherit' }); check(`désinstallation (${n}) : code 0`, u.status === 0, u.status); }
    }
    for (let i = 0; i < 30 && (entries().length || allLnks().length); i++) await sleep(1000);
    rmRetry(base);
    rmRetry(profile);
    const leftovers = { entries: entries(), lnk: allLnks(), app: regQuery(key('HKCU', 'Software', 'Classes', 'Applications', Names.CURRENT + '.exe')), legacyApp: regQuery(key('HKCU', 'Software', 'Classes', 'Applications', Names.LEGACY + '.exe')), progId: regQuery(key('HKCU', 'Software', 'Classes', 'SpinADoc.pdf')) };
    check('registre et raccourcis revenus à l\'état initial (des deux noms)', leftovers.entries.length === 0 && leftovers.lnk.length === 0 && leftovers.app === '(absent)' && leftovers.legacyApp === '(absent)' && leftovers.progId === '(absent)', leftovers);
    check('profil réel %APPDATA%\\Spin A Doc inchangé', treeHash(realProfile) === realBefore);
  }
  console.log(failures.length ? `\n${failures.length} échec(s) / ${passed + failures.length}` : `\nOK : mise à jour (${passed} vérifications).`);
  process.exit(failures.length ? 1 : 0);
})();
