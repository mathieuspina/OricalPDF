// Reproduction : N installations silencieuses (comme test:packaged) dans un dossier temporaire, désinstallation entre chaque.
// Usage : node scripts/repro-install.js <setup.exe> <N> <A|B|C|D> <journal>   (D = désinstallation puis réinstallation immédiate, voir seriesD)
//   A = même fichier à chaque fois ; B = copie à empreinte unique (octets ajoutés en fin de fichier) => analyse antivirus « première vue » ;
//   C = dossier fixe %TEMP%/oricalpdf-installed (comme test:packaged). Relevé des processus en parallèle : scripts/watch-procs.ps1.
const { spawnSync, spawn } = require('child_process');
const Names = require('./install-names.js');
const fs = require('fs');
const os = require('os');
const path = require('path');
const [setupSrc, nStr, mode, logFile] = process.argv.slice(2);
const N = +nStr || 10;
const out = (s) => { fs.appendFileSync(logFile, s + '\n'); console.log(s); };
const wait = (ms) => spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},' + ms + ')']);
const running = (img) => /\.exe/i.test(spawnSync('tasklist', ['/FI', 'IMAGENAME eq ' + img, '/NH'], { encoding: 'utf8' }).stdout || '');
const ps = (cmd) => spawnSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' }).stdout.trim();
function events(t0, t1) {
  const f = (d) => d.toISOString();
  const cmd = `$s=[datetime]::Parse('${f(t0)}').ToLocalTime().AddSeconds(-2);$t=[datetime]::Parse('${f(t1)}').ToLocalTime().AddSeconds(5);` +
    `$a=Get-WinEvent -FilterHashtable @{LogName='Application';StartTime=$s;EndTime=$t} -EA SilentlyContinue | ?{ $_.Id -in 1000,1001,1002,1005,1026 };` +
    `$d=Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Windows Defender/Operational';StartTime=$s;EndTime=$t} -EA SilentlyContinue | ?{ $_.Id -notin 1150,1151 };` +
    `$w=Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-WER-Diag/Operational';StartTime=$s;EndTime=$t} -EA SilentlyContinue;` +
    `@($a)+@($d)+@($w) | ?{$_} | %{ '  [' + $_.LogName + ' ' + $_.Id + ' ' + $_.TimeCreated.ToString('HH:mm:ss') + '] ' + (($_.Message -split "\`n" | select -first 8) -join ' / ') }`;
  return ps(cmd);
}
// Surveille l'apparition de « Orical PDF.exe » pendant l'installation (application lancée à la fin ?)
function watchApp() {
  const w = spawn(process.execPath, ['-e', `const {spawnSync}=require('child_process');let seen=0;const t=setInterval(()=>{const o=spawnSync('tasklist',['/FI','IMAGENAME eq Orical PDF.exe','/NH'],{encoding:'utf8'}).stdout||'';if(/Orical PDF/i.test(o))seen++;},400);process.stdin.on('data',()=>{clearInterval(t);process.stdout.write(String(seen));process.exit(0);});`], { stdio: ['pipe', 'pipe', 'ignore'] });
  let buf = '';
  w.stdout.on('data', (d) => (buf += d));
  return { stop: () => new Promise((r) => { w.on('exit', () => r(+buf || 0)); w.stdin.write('x'); }) };
}
// Série D (motif vu en 0.12.2) : désinstallation puis RÉINSTALLATION IMMÉDIATE, N fois, dans le dossier fixe %TEMP%/oricalpdf-installed, exactement
// comme test:packaged (stdio hérité, dossier vidé juste avant, attente que « Orical PDF.exe » ne tourne plus, /DATADIR= d'un dossier témoin).
// Aucune relance : un code non nul est noté, puis une installation de RATTRAPAGE (comptée à part) remet l'application pour l'essai suivant.
// Refus si Orical PDF est déjà installé sur le compte (même identité que l'installeur de test).
function seriesD() {
  const BS = String.fromCharCode(92);
  const found = Names.existingInstall();
  if (found.length) { out('REFUS : Orical PDF est installé sur ce compte (' + found.join(', ') + ') : série D non lancée.'); return; }
  const dir = path.join(os.tmpdir(), 'oricalpdf-installed');
  const keep = fs.mkdtempSync(path.join(os.tmpdir(), 'oricalpdf-uninst-repro-'));
  fs.writeFileSync(path.join(keep, '.oricalpdf-test'), '');
  const hexOf = (c) => (c == null ? 'null' : '0x' + (c >>> 0).toString(16).toUpperCase());
  const install = (label) => {
    fs.rmSync(dir, { recursive: true, force: true });
    for (let k = 0; k < 30 && running('Orical PDF.exe'); k++) wait(1000);
    const t0 = Date.now();
    const r = spawnSync(setupSrc, ['/S', '/D=' + dir], { stdio: 'inherit' });
    const ms = Date.now() - t0;
    let ok = fs.existsSync(path.join(dir, 'Orical PDF.exe'));
    for (let k = 0; k < 45 && !ok && r.status === 0; k++) { wait(1000); ok = fs.existsSync(path.join(dir, 'Orical PDF.exe')); }
    out(`${label} installeur : code ${r.status} (${hexOf(r.status)}), ${(ms / 1000).toFixed(1)} s, installé : ${ok}`);
    return { code: r.status, ok };
  };
  const uninstall = (label) => {
    const un = path.join(dir, 'Uninstall Orical PDF.exe');
    for (let k = 0; k < 30 && running('Orical PDF.exe'); k++) wait(1000);
    const t0 = Date.now();
    const u = spawnSync(un, ['/S', '/DATADIR=' + keep, '_?=' + dir], { stdio: 'inherit' });
    out(`${label} désinstalleur : code ${u.status} (${hexOf(u.status)}), ${((Date.now() - t0) / 1000).toFixed(1)} s, programme retiré : ${!fs.existsSync(path.join(dir, 'Orical PDF.exe'))}`);
  };
  const t0 = new Date();
  out(`=== Série D : ${N} × (désinstallation → réinstallation immédiate) — ${t0.toISOString()} — ${path.basename(setupSrc)}`);
  let crashes = 0, rescue = 0;
  if (!install('#0 (installation initiale, non comptée)').ok) { out('Installation initiale impossible : série arrêtée.'); return; }
  for (let i = 1; i <= N; i++) {
    uninstall(`#${i}`);
    const r = install(`#${i}`);
    if (r.code !== 0) crashes++;
    if (!r.ok) { rescue++; install(`#${i} (rattrapage, non compté)`); }
  }
  uninstall('#fin');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(keep, { recursive: true, force: true });
  const ev = events(t0, new Date());
  out(ev ? `événements de la série :\n${ev}` : 'événements de la série : aucun (Application 1000/1001/1002/1005/1026, Defender hors 1150/1151, WER-Diag)');
  out(`=== Série D : ${crashes} code(s) non nul(s) de l'installeur sur ${N} réinstallations immédiates ; ${rescue} rattrapage(s)`);
}

(async () => {
  if (mode === 'D') { seriesD(); return; }
  out(`=== Série ${mode} : ${N} installations silencieuses — ${new Date().toISOString()} — ${path.basename(setupSrc)}`);
  let crashes = 0;
  for (let i = 1; i <= N; i++) {
    const dir = mode === 'C' ? path.join(os.tmpdir(), 'oricalpdf-installed') : fs.mkdtempSync(path.join(os.tmpdir(), 'oricalpdf-repro-'));
    if (mode === 'C') fs.rmSync(dir, { recursive: true, force: true });
    let setup = setupSrc;
    if (mode === 'B') {
      setup = path.join(os.tmpdir(), 'oricalpdf-repro-setup-' + process.pid + '-' + i + '.exe');
      fs.copyFileSync(setupSrc, setup);
      fs.appendFileSync(setup, Buffer.from('SPINREPRO' + Date.now() + Math.random()));
    }
    for (let k = 0; k < 30 && running('Orical PDF.exe'); k++) wait(1000);
    const watcher = watchApp();
    const t0 = new Date();
    const r = spawnSync(setup, ['/S', '/D=' + dir], { stdio: 'ignore' });
    const t1 = new Date();
    const appSeen = await watcher.stop();
    let installed = fs.existsSync(path.join(dir, 'Orical PDF.exe'));
    for (let k = 0; k < 30 && !installed; k++) { wait(1000); installed = fs.existsSync(path.join(dir, 'Orical PDF.exe')); }
    const code = r.status, hex = code == null ? String(r.signal || r.error) : '0x' + (code >>> 0).toString(16).toUpperCase();
    if (code !== 0) crashes++;
    out(`#${i} installeur : code ${code} (${hex}), ${((t1 - t0) / 1000).toFixed(1)} s, installé : ${installed}, application vue pendant l'installation : ${appSeen ? 'oui (' + appSeen + ')' : 'non'}`);
    // désinstallation silencieuse
    let ucode = '(pas de désinstalleur)', ut1 = new Date();
    const un = path.join(dir, 'Uninstall Orical PDF.exe');
    if (fs.existsSync(un)) { const u = spawnSync(un, ['/S', '_?=' + dir], { stdio: 'ignore' }); ucode = u.status + ' (0x' + ((u.status >>> 0).toString(16).toUpperCase()) + ')'; ut1 = new Date(); }
    out(`#${i} désinstalleur : code ${ucode}`);
    const ev = events(t0, ut1);
    out(ev ? `#${i} événements :\n${ev}` : `#${i} événements : aucun (Application 1000/1001/1002/1005/1026, Defender hors 1150/1151, WER-Diag)`);
    fs.rmSync(dir, { recursive: true, force: true });
    if (mode === 'B') { try { fs.rmSync(setup, { force: true }); } catch (e) {} }
  }
  out(`=== Série ${mode} : ${crashes} code(s) non nul(s) sur ${N}`);
})();
