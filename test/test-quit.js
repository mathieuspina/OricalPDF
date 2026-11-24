// Fermeture après une impression (1.3.1) : après une impression, fermer Orical PDF puis le relancer ne marchait plus (processus resté vivant à
// cause des fenêtres cachées d'impression : fenêtre de travail gardée 15 s, fenêtre d'envoi « sans rappel du pilote » gardée jusqu'à 10 min ;
// il gardait le verrou d'instance unique et le relancement se fermait aussitôt). Headless, sans impression réelle (ORICALPDF_TEST_PRINT_DIR).
//   1. impression puis fermeture immédiate (fenêtre de travail encore vivante) : le processus sort en moins de N s ;
//   2. idem avec une fenêtre d'envoi cachée « sans rappel » vivante (ORICALPDF_TEST_PRINT_PENDING) : sortie en moins de N s, dossier temporaire
//      oricalpdf-print-* supprimé, puis un nouveau lancement sur le même profil démarre normalement (verrou libéré) ;
//   3. instance orpheline (ORICALPDF_TEST_ORPHAN : la fermeture ne quitte pas) : un deuxième lancement recrée la fenêtre et ouvre le fichier.
// Usage : node test/test-quit.js
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const PDFLib = require('@cantoo/pdf-lib');
const { launchApp, sleep } = require('./lib/app.js');

const N = 5000; // délai maximal de sortie après la fermeture de la fenêtre (ms)
const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail).slice(0, 400) : ''); } };
const root = path.join(__dirname, '..');
const electron = process.env.ORICALPDF_EXE || require(path.join(root, 'node_modules', 'electron'));
const killTree = (p) => { try { spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* */ } };
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const getJson = (u) => new Promise((res, rej) => { const r = http.get(u, (x) => { let d = ''; x.on('data', (c) => (d += c)); x.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }); r.setTimeout(2000, () => r.destroy(new Error('délai'))); r.on('error', rej); });
// Évaluation CDP ponctuelle sur la page de l'application écoutant sur `port`.
async function evalOn(port, expr) {
  const pages = (await getJson(`http://127.0.0.1:${port}/json`)).filter((p) => p.type === 'page' && /index\.html/.test(p.url));
  if (!pages.length) return undefined;
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; setTimeout(() => j(new Error('ws')), 5000); });
  const out = await new Promise((r) => { ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) r(d.result && d.result.result && d.result.result.value); }; ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } })); setTimeout(() => r(undefined), 5000); });
  ws.close();
  return out;
}
const exitWithin = (proc, ms) => new Promise((r) => { if (proc.exitCode !== null) return r(0); const t0 = Date.now(); const to = setTimeout(() => r(null), ms); proc.on('exit', () => { clearTimeout(to); r(Date.now() - t0); }); });

async function printAndClose(c, outDir) {
  await c.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`, 20000);
  await sleep(1500);
  await c.ev('document.body.click()');
  await c.key('p', { code: 'KeyP', windowsVirtualKeyCode: 80, modifiers: 2 }); await sleep(3000);
  await c.click('#pr-ok');
  const t0 = Date.now();
  while (Date.now() - t0 < 30000 && !fs.existsSync(path.join(outDir, 'jobs.json'))) await sleep(200);
  await c.waitFor(`window.oricalpdf.printActive().then(n=>n===0)`, 20000); await sleep(300);
  const jobs = JSON.parse(fs.readFileSync(path.join(outDir, 'jobs.json'), 'utf8'));
  // fermeture de la fenêtre principale comme par le bouton Fermer (événement 'close') : aucune modification, aucune impression active → pas de question
  c.send('Runtime.evaluate', { expression: 'setTimeout(()=>window.oricalpdf.testClose(), 50); 1' }).catch(() => {});
  return jobs;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oricalpdf-quit-'));
  const d = await PDFLib.PDFDocument.create(); d.addPage([595, 842]).drawRectangle({ x: 50, y: 50, width: 200, height: 100, color: PDFLib.rgb(0.2, 0.2, 0.2) });
  const pdf = path.join(dir, 'document.pdf'); fs.writeFileSync(pdf, await d.save());
  const pdf2 = path.join(dir, 'second.pdf'); fs.writeFileSync(pdf2, await d.save());

  console.log('1. Impression puis fermeture immédiate (fenêtre de travail cachée encore vivante)');
  {
    const out = path.join(dir, 'out1');
    const c = await launchApp({ files: [pdf], env: { ORICALPDF_TEST_PRINT_DIR: out } });
    try {
      await printAndClose(c, out);
      const ms = await exitWithin(c.proc, N);
      check(`processus terminé en moins de ${N / 1000} s après la fermeture`, ms !== null, { ms });
    } finally { await c.close(); }
  }

  console.log('2. Fenêtre d\'envoi cachée « sans rappel du pilote » vivante à la fermeture');
  {
    const out = path.join(dir, 'out2');
    const c = await launchApp({ files: [pdf], env: { ORICALPDF_TEST_PRINT_DIR: out, ORICALPDF_TEST_PRINT_PENDING: '1' } });
    const profile = path.join(dir, 'profil-2');
    let second = null;
    try {
      const jobs = await printAndClose(c, out);
      check('tâche simulée : dossier temporaire oricalpdf-print-* créé', jobs.pendingTmp.length === 1 && /oricalpdf-print-/.test(jobs.pendingTmp[0]));
      const ms = await exitWithin(c.proc, N);
      check(`processus terminé en moins de ${N / 1000} s malgré la fenêtre d'envoi cachée`, ms !== null, { ms });
      check('dossier temporaire d\'impression supprimé à la fermeture', jobs.pendingTmp.every((t) => !fs.existsSync(t)), jobs.pendingTmp);
      // nouveau lancement sur le MÊME profil (même verrou d'instance unique) : il doit démarrer normalement
      fs.cpSync(c.userData, profile, { recursive: true });
      const port = await freePort();
      second = spawn(electron, [...(process.env.ORICALPDF_EXE ? [] : [root]), `--remote-debugging-port=${port}`, pdf2], { stdio: 'ignore', env: Object.assign({}, process.env, { ORICALPDF_TEST_HEADLESS: '1', ORICALPDF_USER_DATA: c.userData }) });
      let tabs;
      for (let i = 0; i < 60 && second.exitCode === null; i++) { await sleep(250); try { tabs = await evalOn(port, `document.querySelectorAll('.doctab, [role=tab][data-id]').length + document.querySelectorAll('.docview').length`); if (tabs) break; } catch { /* pas encore prêt */ } }
      check('relancement : la nouvelle instance démarre (verrou libéré) et ouvre le fichier', second.exitCode === null && tabs > 0, { exit: second.exitCode, tabs });
    } finally { if (second) killTree(second); await sleep(300); await c.close(); fs.rmSync(profile, { recursive: true, force: true }); }
  }

  console.log('3. Instance orpheline (fenêtre fermée, processus resté vivant) : un deuxième lancement recrée la fenêtre');
  {
    const out = path.join(dir, 'out3');
    const port = await freePort();
    const c = await launchApp({ files: [pdf], port, env: { ORICALPDF_TEST_PRINT_DIR: out, ORICALPDF_TEST_PRINT_PENDING: '1', ORICALPDF_TEST_ORPHAN: '1' } });
    try {
      await printAndClose(c, out);
      await sleep(1500);
      const pagesBefore = (await getJson(`http://127.0.0.1:${port}/json`).catch(() => [])).filter((p) => p.type === 'page' && /index\.html/.test(p.url)).length;
      check('orpheline : processus vivant sans fenêtre principale', c.proc.exitCode === null && pagesBefore === 0, { exit: c.proc.exitCode, pagesBefore });
      const p2 = spawn(electron, [...(process.env.ORICALPDF_EXE ? [] : [root]), pdf2], { stdio: 'ignore', env: Object.assign({}, process.env, { ORICALPDF_TEST_HEADLESS: '1', ORICALPDF_USER_DATA: c.userData }) });
      const quick = await exitWithin(p2, 15000);
      let n;
      for (let i = 0; i < 60; i++) { await sleep(250); try { n = await evalOn(port, `document.querySelectorAll('.docview').length`); if (n) break; } catch { /* */ } }
      check('deuxième lancement : rendu à l\'instance existante, qui recrée sa fenêtre et ouvre le fichier', quick !== null && n === 1, { quick, n });
    } finally { await c.close(); }
  }

  console.log('4. Fermeture PENDANT une impression : confirmation gardée, puis tout est détruit');
  {
    const out = path.join(dir, 'out4');
    const big = await PDFLib.PDFDocument.create();
    big.addPage([1684, 2384]).drawRectangle({ x: 100, y: 100, width: 1400, height: 2000, borderColor: PDFLib.rgb(0, 0, 0), borderWidth: 2 });
    const bigPdf = path.join(dir, 'plan-A1.pdf'); fs.writeFileSync(bigPdf, await big.save());
    const c = await launchApp({ files: [bigPdf], env: { ORICALPDF_TEST_PRINT_DIR: out } });
    try {
      await c.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`, 20000);
      await sleep(1500);
      await c.ev('document.body.click()');
      await c.key('p', { code: 'KeyP', windowsVirtualKeyCode: 80, modifiers: 2 }); await sleep(3000);
      const setv = (id, v) => c.ev(`(()=>{const e=document.getElementById(${JSON.stringify(id)}); e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('change')); return 1})()`);
      await setv('pr-paper', '594x841'); await setv('pr-color', 'bw'); await setv('pr-dpi', '600'); await sleep(1500); // rasterisation : tâche longue
      await c.click('#pr-ok'); await sleep(300);
      const busy = await c.ev(`window.oricalpdf.printActive()`);
      c.send('Runtime.evaluate', { expression: 'setTimeout(()=>window.oricalpdf.testClose(), 50); 1' }).catch(() => {});
      await sleep(1200);
      const asked = await c.ev(`!document.getElementById('choice').hidden && /Impression en cours/.test(document.getElementById('choice-title').textContent)`);
      check('impression active : la fermeture demande confirmation, l\'application reste ouverte', busy > 0 && asked === true && c.proc.exitCode === null, { busy, asked });
      await c.ev(`[...document.querySelectorAll('#choice-actions button')].find(b=>/Quitter/.test(b.textContent)).click()`).catch(() => {});
      const ms = await exitWithin(c.proc, N);
      check(`« Quitter quand même » : processus terminé en moins de ${N / 1000} s (fenêtre de travail détruite en pleine tâche)`, ms !== null, { ms });
    } finally { await c.close(); }
  }

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${passed} vérifications réussies, ${failures.length} échec(s).`);
  if (failures.length) { console.log('Échecs :\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('OK : fermeture après impression.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
