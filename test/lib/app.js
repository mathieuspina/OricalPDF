// Outillage de test d'interface : lance l'application Electron et la pilote via le protocole CDP.
// Nécessite un affichage (fenêtre réelle). Node >= 22 (WebSocket global).
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const net = require('net');

const root = path.join(__dirname, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Requête HTTP avec délai maximal : un port occupé par un autre programme qui accepte la connexion sans jamais répondre bloquait la suite
// indéfiniment (cause du blocage de test-measure-ui en 1.2.1 : port CDP tiré au hasard déjà pris par un service système).
const getJson = (u, ms = 2000) => new Promise((res, rej) => {
  const req = http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); });
  req.setTimeout(ms, () => req.destroy(new Error('pas de réponse HTTP en ' + ms + ' ms')));
  req.on('error', rej);
});

// Délais maximaux (ms), lus à chaque lancement : connexion à l'application (page CDP trouvée + WebSocket ouvert), réponse à UNE commande CDP,
// durée totale de la suite (fichier de test). Au-delà : message clair (suite, étape, état), application tuée, échec.
const limits = () => ({
  connect: Number(process.env.SPIN_TEST_CONNECT_MS) || 30000,
  cdp: Number(process.env.SPIN_TEST_CDP_MS) || 60000,
  suite: Number(process.env.SPIN_TEST_SUITE_MS) || 20 * 60000,
});
const suiteName = () => path.basename(process.argv[1] || 'suite');

// Dernière ligne écrite par la suite (pour l'instantané d'état en cas de délai dépassé).
let lastLine = '';
for (const stream of [process.stdout, process.stderr]) {
  const write = stream.write.bind(stream);
  stream.write = (chunk, ...rest) => { const t = String(chunk).trim(); if (t) lastLine = t.split('\n').pop().slice(0, 200); return write(chunk, ...rest); };
}

// Port local libre ? (un programme qui écoute déjà sur 127.0.0.1:port empêche Electron d'y ouvrir son port de débogage)
const portFree = (port) => new Promise((res) => {
  const s = net.createServer();
  s.once('error', () => res(false));
  s.listen({ port, host: '127.0.0.1', exclusive: true }, () => s.close(() => res(true)));
});
async function pickPort(avoid = []) {
  for (let i = 0; i < 50; i++) {
    const p = 9300 + Math.floor(Math.random() * 500);
    if (!avoid.includes(p) && (await portFree(p))) return p;
  }
  throw new Error('aucun port libre trouvé entre 9300 et 9799');
}

const killTree = (proc) => {
  if (!proc || proc.exitCode !== null || proc.signalCode) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F']); else proc.kill('SIGKILL');
};

// Délai global de la suite : armé au premier lancement, ne retient pas le processus (unref).
const live = new Set();
let suiteTimer = null;
function armSuiteTimer() {
  if (suiteTimer) return;
  const ms = limits().suite;
  suiteTimer = setTimeout(() => {
    const states = [...live].map((a) => a.state()).join('\n') || '  (aucune application en cours)';
    process.stderr.write(`\nÉCHEC : délai global de la suite dépassé (${suiteName()}, ${ms} ms, SPIN_TEST_SUITE_MS)\n${states}\n  dernière ligne du journal : ${lastLine || '(aucune)'}\n`);
    for (const a of live) a.kill();
    process.exit(1);
  }, ms);
  suiteTimer.unref();
}

// exe : exécutable de l'application empaquetée (sinon Electron + dossier du projet = version de développement).
// userDataFiles : { 'recents.json': contenu } écrits dans le dossier de données avant le démarrage.
// saveMode (1.2.0) : réglage « annotations à l'enregistrement » écrit dans settings.json : 'flat' par défaut (comportement d'avant 1.2.0 :
// aucune boîte « Modifiable / Aplati » dans les tests existants) ; null = vrai défaut de l'application (« demander ») ; un saveMode fourni
// dans userDataFiles['settings.json'] l'emporte.
// port : port de débogage (par défaut : tiré au hasard parmi les ports LIBRES) ; exeArgs : arguments placés avant les autres (test du
// harnais : exe = node, exeArgs = [script d'une fausse application]).
async function launchApp({ files = [], port = null, env = {}, exe = process.env.SPINADOC_EXE || null, exeArgs = [], userDataFiles = {}, saveMode = 'flat' } = {}) {
  armSuiteTimer();
  const lim = limits();
  if (port === null) port = await pickPort();
  else if (!(await portFree(port))) throw new Error(`${suiteName()} : port de débogage ${port} déjà utilisé par un autre programme (choisir un port libre)`);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'spinadoc-test-'));
  userDataFiles = Object.assign({}, userDataFiles);
  const st = userDataFiles['settings.json'];
  if (saveMode !== null && (st === undefined || (st && typeof st === 'object' && !Buffer.isBuffer(st) && st.saveMode === undefined))) userDataFiles['settings.json'] = Object.assign({ saveMode }, st || {});
  for (const [name, content] of Object.entries(userDataFiles)) {
    fs.mkdirSync(path.dirname(path.join(userData, name)), { recursive: true }); // « sous-dossier/fichier » accepté
    fs.writeFileSync(path.join(userData, name), typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content));
  }
  const electron = exe || require(path.join(root, 'node_modules', 'electron'));
  // Par défaut les tests tournent hors écran (SPIN_TEST_HEADLESS=1) : aucune fenêtre visible, aucun focus volé. SPIN_TEST_HEADLESS=0 pour voir.
  // Garde-fou DUR : aucun test ne peut imprimer ailleurs que sur « SpinADoc Test PDF » (ou écrire les tâches dans un dossier, sans impression).
  const allow = (env && env.SPINADOC_PRINT_ALLOW) || process.env.SPINADOC_PRINT_ALLOW;
  if (allow && allow !== 'SpinADoc Test PDF') throw new Error('Test refusé : SPINADOC_PRINT_ALLOW doit valoir « SpinADoc Test PDF » (reçu : ' + allow + ')');
  if (!(env && env.SPINADOC_TEST_PRINT_DIR) && !allow) env = Object.assign({}, env, { SPINADOC_PRINT_ALLOW: 'SpinADoc Test PDF' });
  const headlessEnv = { SPIN_TEST_HEADLESS: process.env.SPIN_TEST_HEADLESS === '0' ? '0' : '1' };
  const proc = spawn(electron, [
    ...(exe ? exeArgs : [root]), `--remote-debugging-port=${port}`, '--disable-features=CalculateNativeWinOcclusion',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', ...files,
  ], { stdio: 'ignore', env: Object.assign({}, process.env, headlessEnv, { SPINADOC_USER_DATA: userData }, env) });

  // Instantané d'état et arrêt propre, utilisés par chaque délai dépassé.
  let step = 'démarrage', page = null, ws = null, killed = false;
  const pending = new Map();
  const logs = [];
  const state = () => [
    `  processus : PID ${proc.pid}, ${proc.exitCode === null && !proc.signalCode ? (killed ? 'arrêté par le harnais' : 'en cours') : 'terminé (code ' + proc.exitCode + (proc.signalCode ? ', ' + proc.signalCode : '') + ')'}`,
    `  port de débogage : ${port} ; page : ${page ? page.url : '(aucune trouvée)'} ; WebSocket : ${ws ? ['connexion', 'ouvert', 'fermeture', 'fermé'][ws.readyState] : '(non créé)'}`,
    `  commandes CDP en attente : ${pending.size} ; dernière erreur de la page : ${logs.length ? logs[logs.length - 1].slice(0, 200) : '(aucune)'}`,
    `  dernière ligne du journal : ${lastLine || '(aucune)'}`,
  ].join('\n');
  const kill = () => { if (killed) return; killed = true; try { ws && ws.close(); } catch { /* */ } killTree(proc); try { fs.rmSync(userData, { recursive: true, force: true }); } catch { /* */ } };
  const handle = { state, kill };
  live.add(handle);
  const fail = (what) => { const msg = `${suiteName()} : ${what} (étape : ${step})\n${state()}`; kill(); live.delete(handle); return new Error(msg); };
  proc.on('exit', () => { for (const p of pending.values()) p.reject(new Error(`${suiteName()} : application terminée pendant « ${p.what} »\n${state()}`)); pending.clear(); });

  const t0 = Date.now();
  step = 'recherche de la page CDP';
  while (!page) {
    if (Date.now() - t0 > lim.connect) throw fail(`application non connectée en ${lim.connect} ms (SPIN_TEST_CONNECT_MS) : port ${port} sans réponse CDP`);
    if (proc.exitCode !== null) throw fail('application terminée avant la connexion');
    await sleep(250);
    try { page = (await getJson(`http://127.0.0.1:${port}/json`)).find((p) => p.type === 'page'); } catch { /* pas encore prêt */ }
  }

  step = 'ouverture du WebSocket CDP';
  ws = new WebSocket(page.webSocketDebuggerUrl);
  const opened = await new Promise((r) => {
    const t = setTimeout(() => r(false), Math.max(1000, lim.connect - (Date.now() - t0)));
    ws.onopen = () => { clearTimeout(t); r(true); };
    ws.onerror = () => { clearTimeout(t); r(false); };
  });
  if (!opened) throw fail(`WebSocket CDP non ouvert en ${lim.connect} ms (SPIN_TEST_CONNECT_MS)`);
  let id = 0;
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); p.resolve(d); }
    else if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('console.error ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  // Chaque commande CDP attend au plus lim.cdp ms (SPIN_TEST_CDP_MS) ; au-delà : application tuée, promesse rejetée avec l'état.
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (killed) return reject(new Error(`${suiteName()} : application déjà arrêtée (commande ${method})`));
    const i = ++id;
    const what = method + (params.expression ? ' ' + String(params.expression).replace(/\s+/g, ' ').slice(0, 120) : '');
    step = what;
    const t = setTimeout(() => { pending.delete(i); reject(fail(`aucune réponse CDP en ${lim.cdp} ms (SPIN_TEST_CDP_MS)`)); }, lim.cdp);
    pending.set(i, { what, resolve: (d) => { clearTimeout(t); resolve(d); }, reject: (e) => { clearTimeout(t); reject(e); } });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  if (headlessEnv.SPIN_TEST_HEADLESS === '0') await send('Page.bringToFront');

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error('Évaluation : ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result.result.value;
  };
  const rect = async (sel) => JSON.parse(await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw new Error('introuvable: '+${JSON.stringify(sel)}); if(e.closest('#ribbon')||e.closest('#doctabs')) e.scrollIntoView({block:'nearest',inline:'nearest'}); const r=e.getBoundingClientRect();return JSON.stringify([r.left,r.top,r.width,r.height])})()`));
  const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' || type === 'mouseMoved' ? 0 : 1, ...extra });
  const clickXY = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); await sleep(120); };
  const click = async (sel) => { const [x, y, w, h] = await rect(sel); await clickXY(x + w / 2, y + h / 2); };
  const hover = async (sel) => { const [x, y, w, h] = await rect(sel); await mouse('mouseMoved', x + w / 2, y + h / 2); await sleep(250); };
  const wheel = async (x, y, deltaY, modifiers = 0) => { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY, modifiers }); };
  const key = async (k, extra = {}) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, ...extra });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, ...extra });
    await sleep(80);
  };
  const type = (text) => send('Input.insertText', { text });
  const shot = async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); };
  const waitFor = async (expr, ms = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(100); }
    return false;
  };
  // Deuxième lancement : le fichier doit s'ouvrir dans un nouvel onglet de la fenêtre existante.
  const openMore = async (file) => {
    const p = spawn(electron, [...(exe ? [] : [root]), file], { stdio: 'ignore', env: Object.assign({}, process.env, { SPIN_TEST_HEADLESS: process.env.SPIN_TEST_HEADLESS === '0' ? '0' : '1', SPINADOC_USER_DATA: userData }) });
    step = 'deuxième lancement (' + path.basename(file) + ')';
    const done = await new Promise((r) => { const t = setTimeout(() => r(false), lim.connect); p.on('exit', () => { clearTimeout(t); r(true); }); });
    if (!done) { killTree(p); throw fail(`deuxième lancement non terminé en ${lim.connect} ms (SPIN_TEST_CONNECT_MS)`); }
  };
  // Arbre de processus complet (la version portable lance l'application dans un processus fils).
  const close = async () => { kill(); live.delete(handle); await sleep(300); try { fs.rmSync(userData, { recursive: true, force: true }); } catch { /* */ } };
  return { send, ev, rect, mouse, click, clickXY, hover, wheel, key, type, shot, waitFor, logs, close, openMore, proc, userData, sleep };
}

module.exports = { launchApp, sleep, internal: { portFree, pickPort, getJson } };
