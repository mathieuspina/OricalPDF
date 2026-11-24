// Impression (processus principal) : imprimantes et capacités, FILE D'IMPRESSION, envoi des tâches, propriétés de l'imprimante.
//
// Architecture (l'interface ne doit jamais geler) :
//   renderer (index.html)  → 'print:submit' : tâche FIGÉE (PDF édité + feuilles à composer + réglages), retour immédiat ; la boîte se ferme.
//   main (ce module)       → file d'attente (une tâche à la fois), notifications de progression vers l'interface, annulation.
//   fenêtre cachée         → src/print-worker.html : assemble le PDF d'impression (print-compose), rasterise par bandes (print-raster) dans
//                            son PROPRE processus de rendu ; rend chaque PDF de tâche à main.
//   main                   → écrit le PDF dans un dossier temporaire unique, nommé d'après le document, l'ouvre dans une fenêtre cachée (lecteur PDF
//                            de Chromium) et appelle webContents.print : Chromium n'a plus rien à mettre à l'échelle (A4, A3, A1 exacts à 0,1 mm).
// Choix : une fenêtre cachée (et non un Worker) parce que pdf.js, pdf-lib et les canvas y fonctionnent tels quels (mêmes scripts que
// l'interface), qu'elle isole la mémoire des grands formats et qu'elle se détruit à la fin de la file.
//
// Variables d'environnement de test :
//   SPINADOC_TEST_PRINT_DIR   : les tâches sont écrites dans ce dossier (job-1.pdf, jobs.json) au lieu d'être envoyées (aucune impression).
//   SPINADOC_TEST_PRINTERS    : JSON [{ name, isDefault?, caps?: { color, duplex, hardMarginMm, maxCopies, papers } }] : imprimantes simulées (avec le dossier ci-dessus).
//   SPINADOC_PRINT_ALLOW      : nom de l'unique imprimante autorisée ; toute autre est REFUSÉE (garde-fou des tests).
//   SPINADOC_TEST_PRINT_PENDING : (avec SPINADOC_TEST_PRINT_DIR) chaque tâche laisse aussi une fenêtre d'envoi cachée « sans rappel du pilote »
//                               et son dossier temporaire spinadoc-print-*, comme printOne après 8 s (test de la fermeture : test/test-quit.js).
const { BrowserWindow, app } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PrintLayout = require('./src/print-layout.js');
const PrintLog = require('./src/print-log.js');
const UserData = require('./src/user-data.js');
const AppInfo = require('./app-info.js');

const ALLOW = () => process.env.SPINADOC_PRINT_ALLOW || '';
// Registre central des fenêtres cachées créées ici (fenêtre de travail, fenêtres d'envoi) et des dossiers temporaires spinadoc-print-* :
// à la fermeture de l'application (shutdown), tout est détruit. Sans cela, une fenêtre cachée encore vivante (fenêtre de travail gardée 15 s,
// fenêtre d'envoi « sans rappel du pilote » gardée jusqu'à 10 min) empêchait 'window-all-closed' : le processus restait vivant avec le verrou
// d'instance unique, et un nouveau lancement se fermait aussitôt (1.3.1).
const windows = new Set();
const tmpDirs = new Set();
let shuttingDown = false;
function track(w) { windows.add(w); w.on('closed', () => windows.delete(w)); return w; }
const rmTmp = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } tmpDirs.delete(d); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toBuffer = (b) => Buffer.from(b.buffer ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : b);
const testPrinters = () => {
  if (!process.env.SPINADOC_TEST_PRINT_DIR) return null;
  try { if (process.env.SPINADOC_TEST_PRINTERS) return JSON.parse(process.env.SPINADOC_TEST_PRINTERS); } catch { /* */ }
  return [{ name: 'Imprimante de test', isDefault: true }];
};

// Capacités d'une imprimante (formats de papier, recto-verso, couleur annoncée, marge matérielle) via .NET (PowerShell, hors ligne). null si indisponible.
// NB : « color » vient de PrinterSettings.SupportsColor, c'est-à-dire de ce que le PILOTE annonce. Des pilotes d'imprimante PDF virtuelle (PDFCreator)
// annoncent « pas de couleur » alors qu'ils enregistrent la couleur : c'est une information, pas un interdit (voir print-ui.js).
// capabilitiesEx → { caps, status: 'ok' | 'invalide' | 'expiré' | 'échec', ms } ; papers[].kind = code de papier du pilote (RawKind, dmPaperSize),
// defaultPaper = papier par défaut du pilote. Une imprimante réseau injoignable peut bloquer la lecture .NET bien au-delà de 15 s (mesuré : 114 s
// pour un serveur absent) : PowerShell est alors arrêté au bout de 15 s et le résultat est « expiré » (journalisé).
const CAPS_TIMEOUT = () => Number(process.env.SPINADOC_CAPS_TIMEOUT_MS) || 15000; // délai réglable pour les tests
function capabilitiesEx(name) {
  const t0 = Date.now();
  return new Promise((resolve0) => {
    const resolve = (caps, status) => resolve0({ caps, status, ms: Date.now() - t0 });
    const script = [
      'Add-Type -AssemblyName System.Drawing;',
      '$p = New-Object System.Drawing.Printing.PrinterSettings; $p.PrinterName = $env:SPIN_PRN;',
      'if (-not $p.IsValid) { "null"; exit }',
      '$d = $p.DefaultPageSettings;',
      '[pscustomobject]@{ duplex = $p.CanDuplex; color = $p.SupportsColor; maxCopies = $p.MaximumCopies; hx = $d.HardMarginX; hy = $d.HardMarginY;',
      'def = [pscustomobject]@{ name = $d.PaperSize.PaperName; w = $d.PaperSize.Width; h = $d.PaperSize.Height; kind = $d.PaperSize.RawKind };',
      'papers = @($p.PaperSizes | ForEach-Object { [pscustomobject]@{ name = $_.PaperName; w = $_.Width; h = $_.Height; kind = $_.RawKind } }) } | ConvertTo-Json -Compress -Depth 4',
    ].join(' ');
    let out = '';
    let done = false;
    const finish = (v, status) => { if (!done) { done = true; resolve(v, status || (v ? 'ok' : 'échec')); } };
    try {
      const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: Object.assign({}, process.env, { SPIN_PRN: name }), windowsHide: true });
      ps.stdout.on('data', (d) => { out += d; });
      ps.on('error', () => finish(null));
      ps.on('close', () => {
        try {
          const j = JSON.parse(out.trim());
          if (!j) return finish(null, 'invalide');
          const paper = (q) => ({ name: q.name, w: Math.round((q.w / 100) * 254) / 10, h: Math.round((q.h / 100) * 254) / 10, kind: Number.isInteger(q.kind) ? q.kind : null });
          const papers = (Array.isArray(j.papers) ? j.papers : []).filter((q) => q.w > 0 && q.h > 0).map(paper);
          const defaultPaper = j.def && j.def.w > 0 && j.def.h > 0 ? paper(j.def) : null;
          const hard = Math.max(Number(j.hx) || 0, Number(j.hy) || 0);
          finish({ duplex: !!j.duplex, color: j.color !== false, maxCopies: j.maxCopies || 1, papers, defaultPaper, hardMarginMm: hard > 0 ? Math.round((hard / 100) * 254) / 10 : null });
        } catch { finish(null); }
      });
      setTimeout(() => { try { ps.kill(); } catch { /* */ } finish(null, 'expiré'); }, CAPS_TIMEOUT());
    } catch { finish(null); }
  });
}

// Une tâche : fichier PDF dont toutes les pages ont la taille du papier. Résout { ok, message }.
// Le nom du travail vu par le spouleur vient du titre du document : nom du fichier temporaire, /Title du PDF et titre de la fenêtre sont tous trois
// le nom du document (voir print-layout.js jobTitle / jobFileName).
// Appel natif d'Electron 33 : webContents.print(o) remplace pageSize par un mediaSize SANS code de papier puis appelle this._print(o, cb).
// Passer par _print avec notre mediaSize (vendor_id) est le seul moyen de faire écrire dmPaperSize par Chromium (voir print-layout.js).
// Sans _print (autre version d'Electron) : API publique, taille personnalisée (journalisé « API publique »).
const hasInternalPrint = (wc) => !!wc && typeof wc._print === 'function';
async function printOne(file, plan, title) {
  let send = PrintLayout.sendArgs(plan, false);
  const win = track(new BrowserWindow({ show: false, title, webPreferences: { plugins: true, backgroundThrottling: false } }));
  let keepAlive = false;
  try {
    win.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle(title); });
    await win.loadURL('file:///' + file.replace(/\\/g, '/'));
    win.setTitle(title);
    await sleep(2000); // le lecteur PDF a besoin d'un court instant pour charger le document
    send = PrintLayout.sendArgs(plan, hasInternalPrint(win.webContents));
    const o = send.args;
    if (ALLOW() && o.deviceName !== ALLOW()) throw new Error('Imprimante refusée par le garde-fou de test : ' + o.deviceName);
    let finished = false;
    const done = (success, reason) => { finished = true; return { success, reason }; };
    const cb = new Promise((res) => {
      if (send.api === 'interne') win.webContents._print(o, (success, reason) => res(done(success, reason)));
      else win.webContents.print(o, (success, reason) => res(done(success, reason)));
    });
    // Certains pilotes (imprimantes virtuelles à port fichier) ne rappellent pas : après 8 s la tâche est considérée comme envoyée ; la fenêtre
    // reste vivante (jusqu'au rappel, ou 10 min) pour ne pas interrompre un gros travail en cours d'envoi.
    const r = await Promise.race([cb, sleep(!o.silent ? 600000 : 8000).then(() => ({ success: true, reason: '', pending: true }))]);
    if (r.pending && !finished) {
      keepAlive = true;
      const kill = () => { try { win.destroy(); } catch { /* */ } };
      cb.then(kill);
      setTimeout(kill, 600000);
    }
    return r.success ? { ok: true, pending: !!(r.pending && !finished), send } : { ok: false, message: r.reason || 'Échec de l\'impression', send };
  } catch (e) { return { ok: false, message: String((e && e.message) || e), send };
  } finally { if (!keepAlive) { try { win.destroy(); } catch { /* */ } } }
}

// ---------------------------------------------------------------- file d'impression
let ipc = null;
let getMain = () => null;
let seq = 0;
const queue = [];      // tâches en attente
let running = null;    // tâche en cours
let worker = null;     // fenêtre de travail cachée
let workerReady = null;
let idleTimer = null;

const publicView = (t) => ({ id: t.id, name: t.name, state: t.state, label: t.label || '', fraction: t.fraction || 0, sheet: t.sheet || 0, total: t.total || 0, message: t.message || '', device: t.opts.device });
function notify(t) { const w = getMain(); if (w && !w.isDestroyed()) w.webContents.send('print:progress', publicView(t)); }
const active = () => queue.length + (running ? 1 : 0);

function ensureWorker() {
  clearTimeout(idleTimer);
  if (worker && !worker.isDestroyed()) return workerReady;
  if (shuttingDown) throw new Error('Application en cours de fermeture.');
  worker = track(new BrowserWindow({
    show: false, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  }));
  workerReady = new Promise((res) => { worker._ready = res; });
  worker.webContents.on('will-navigate', (e) => e.preventDefault());
  worker.loadFile(path.join(__dirname, 'src', 'print-worker.html'));
  worker.on('closed', () => { worker = null; });
  return workerReady;
}
function releaseWorker() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!running && worker && !worker.isDestroyed()) { worker.destroy(); worker = null; } }, 15000);
}

async function pump() {
  if (running || !queue.length) return;
  const t = queue.shift();
  running = t;
  t.state = 'running'; t.label = 'Préparation'; t.chain = Promise.resolve(); t.jobs = [];
  notify(t);
  try {
    await ensureWorker();
    await new Promise((resolve) => {
      t.finish = resolve;
      worker.webContents.send('pw:run', { id: t.id, edBytes: t.edBytes, groups: t.groups, raster: t.raster, name: t.name });
    });
    await t.chain; // envois à l'imprimante terminés
    if (t.cancelled) { t.state = 'cancelled'; t.message = 'Impression annulée.'; }
    else if (t.error) t.state = 'error';
    else { t.state = 'done'; t.fraction = 1; }
  } catch (e) { t.state = 'error'; t.error = String((e && e.message) || e); t.message = t.error; }
  t.edBytes = null; // libère la copie figée
  notify(t);
  running = null;
  if (queue.length) pump(); else releaseWorker();
}

// Capacités par imprimante (formats annoncés) : lues une fois, gardées pour calculer les options d'envoi.
// → { caps, status, ms } ; un échec ou un délai dépassé n'est gardé qu'une minute (nouvel essai ensuite).
const capsCache = new Map();
async function capsOf(name) {
  const tp = testPrinters();
  if (tp) { const p = tp.find((x) => x.name === name); return { caps: (p && p.caps) || null, status: 'test', ms: 0 }; }
  const c = capsCache.get(name);
  if (!c || (c.failed && Date.now() - c.at > 60000)) {
    const e = { at: Date.now(), failed: false, p: capabilitiesEx(String(name)) };
    e.p.then((r) => { e.failed = r.status !== 'ok'; e.at = Date.now(); });
    capsCache.set(name, e);
    return e.p;
  }
  return c.p;
}

// ---------------------------------------------------------------- journal d'impression (userData/print-log.txt)
const logPath = () => path.join(UserData.resolve(process.env, app.getPath('appData'), path.join), PrintLog.FILE);
let userName = '';
try { userName = os.userInfo().username || ''; } catch { /* */ }
const mask = (name) => AppInfo.maskPrinter(name, userName);
// Rien d'identifiant : imprimante masquée (aussi dans deviceName et dans un message d'erreur), titre et nom du fichier remplacés par <document>.
function logJob(t, j, plan, result, send, capsRec) {
  try {
    const dev = String(t.opts.device || '');
    let msg = String(result || '');
    for (const s of [j.title, j.fileName, t.name]) if (s && String(s).length > 2) msg = msg.split(String(s)).join('<document>');
    if (dev) msg = msg.split(dev).join(mask(dev));
    const p = Object.assign({}, plan, { options: Object.assign({}, plan.options, { deviceName: mask(dev) }) });
    const sent = send ? Object.assign({}, send, { args: Object.assign({}, send.args, { deviceName: mask(dev) }) }) : undefined;
    const caps = capsRec ? { status: capsRec.status, ms: capsRec.ms, papers: (capsRec.caps && capsRec.caps.papers) || [] } : undefined;
    const l = PrintLog.line({ date: new Date(), printer: mask(dev), wMm: j.wMm, hMm: j.hMm, plan: p, sent, send: send ? PrintLayout.sendText(plan, send.applied) : undefined, caps, result: msg });
    const f = logPath();
    let prev = '';
    try { prev = fs.readFileSync(f, 'utf8'); } catch { /* premier journal */ }
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, PrintLog.append(prev, l));
  } catch { /* le journal ne doit jamais faire échouer une impression */ }
}
function readLog() { try { return fs.readFileSync(logPath(), 'utf8'); } catch { return ''; } }

function onJob(t, j) {
  const dir = process.env.SPINADOC_TEST_PRINT_DIR;
  if (dir) { // test : aucune impression, le PDF d'impression est écrit dans le dossier
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `job-${j.index + 1}.pdf`), toBuffer(j.bytes));
    const job = { wMm: j.wMm, hMm: j.hMm, title: j.title, fileName: j.fileName };
    t.jobs.push(job);
    t.chain = t.chain.then(async () => { // options qui AURAIENT été passées à webContents.print (tests) + ligne de journal
      const capsRec = await capsOf(t.opts.device);
      const plan = PrintLayout.printOptions(j, t.opts, capsRec.caps);
      const main = getMain();
      const send = PrintLayout.sendArgs(plan, hasInternalPrint(main && !main.isDestroyed() ? main.webContents : null));
      job.print = plan;
      job.send = Object.assign({ text: PrintLayout.sendText(plan, send.applied) }, send);
      logJob(t, j, plan, 'test : non imprimé (dossier de test)', send, capsRec);
      fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify({ opts: t.opts, name: t.name, jobs: t.jobs, pendingTmp: t.pendingTmp || [] }));
    });
    if (process.env.SPINADOC_TEST_PRINT_PENDING) { // simulation d'un pilote qui ne rappelle pas : fenêtre cachée gardée jusqu'à 10 min
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spinadoc-print-'));
      tmpDirs.add(tmp);
      fs.writeFileSync(path.join(tmp, j.fileName), toBuffer(j.bytes));
      const w = track(new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } }));
      w.loadURL('about:blank');
      setTimeout(() => { try { w.destroy(); } catch { /* */ } }, 600000);
      t.pendingTmp = (t.pendingTmp || []).concat(tmp);
    }
    fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify({ opts: t.opts, name: t.name, jobs: t.jobs, pendingTmp: t.pendingTmp || [] }));
    return;
  }
  // dossier temporaire UNIQUE par travail (pas de collision entre files), fichier nommé d'après le document
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spinadoc-print-'));
  tmpDirs.add(tmp);
  const f = path.join(tmp, j.fileName);
  fs.writeFileSync(f, toBuffer(j.bytes));
  t.chain = t.chain.then(async () => {
    if (t.cancelled || t.error) return;
    t.label = 'Envoi'; t.sheet = t.total; notify(t);
    if (ALLOW() && t.opts.device !== ALLOW()) { t.error = 'Imprimante refusée par le garde-fou de test.'; t.message = t.error; return; }
    const capsRec = await capsOf(t.opts.device);
    const plan = PrintLayout.printOptions(j, t.opts, capsRec.caps);
    const r = await printOne(f, plan, j.title);
    logJob(t, j, plan, r.ok ? (r.pending ? "envoyé (le pilote n'a pas répondu en 8 s : considéré comme envoyé)" : 'envoyé') : 'échec : ' + r.message, r.send, capsRec);
    if (!r.ok) { t.error = r.message; t.message = r.message; }
  }).finally(() => { setTimeout(() => rmTmp(tmp), 120000).unref(); });
}

function register(ipcMain, mainGetter) {
  ipc = ipcMain;
  if (mainGetter) getMain = mainGetter;

  ipcMain.handle('print:printers', async () => {
    const tp = testPrinters();
    if (tp) return tp.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault, status: 0 }));
    const w = getMain() || BrowserWindow.getAllWindows()[0];
    if (!w) return [];
    let list = [];
    try { list = await w.webContents.getPrintersAsync(); } catch { list = []; }
    if (ALLOW()) list = list.filter((p) => p.name === ALLOW());
    return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault, status: p.status }));
  });

  // appel interne d'Electron disponible (code de papier transmissible) : affiché dans la ligne « Envoi » de la boîte d'impression
  ipcMain.handle('print:api', async () => { const w = getMain(); return { internal: hasInternalPrint(w && !w.isDestroyed() ? w.webContents : null) }; });

  ipcMain.handle('print:caps', async (_e, name) => {
    const tp = testPrinters();
    if (tp) { const p = tp.find((x) => x.name === name); return (p && p.caps) || null; }
    return (await capsOf(name)).caps;
  });

  // task : { name, edBytes, groups: [{ w, h, sheets }], raster: null | { mode, dpi, thin }, opts: { device, copies, collate, duplex, color, dialog } }
  // Retour immédiat : { id }. La tâche travaille sur la copie figée reçue ici (fermer l'onglet ou modifier le document ne change rien).
  ipcMain.handle('print:submit', (_e, task) => {
    if (ALLOW() && !process.env.SPINADOC_TEST_PRINT_DIR && task.opts.device !== ALLOW()) return { ok: false, message: 'Imprimante refusée par le garde-fou de test.' };
    const t = { id: ++seq, name: task.name || 'Sans titre', edBytes: task.edBytes, groups: task.groups, raster: task.raster || null, opts: task.opts, state: 'queued', label: 'En attente', fraction: 0 };
    queue.push(t);
    notify(t);
    pump();
    return { ok: true, id: t.id, test: !!process.env.SPINADOC_TEST_PRINT_DIR };
  });

  ipcMain.handle('print:cancel', (_e, id) => {
    const qi = queue.findIndex((t) => t.id === id);
    if (qi >= 0) { const [t] = queue.splice(qi, 1); t.state = 'cancelled'; t.message = 'Impression annulée.'; t.edBytes = null; notify(t); return true; }
    if (running && running.id === id) {
      running.cancelled = true;
      if (worker && !worker.isDestroyed()) worker.webContents.send('pw:cancel', id);
      return true;
    }
    return false;
  });
  ipcMain.handle('print:active', () => active());

  // messages de la fenêtre de travail
  ipcMain.on('pw:ready', () => { if (worker && worker._ready) worker._ready(); });
  ipcMain.on('pw:progress', (_e, d) => {
    if (!running || running.id !== d.id) return;
    Object.assign(running, { fraction: d.fraction, sheet: d.sheet, total: d.total, label: d.label });
    notify(running);
  });
  ipcMain.handle('pw:job', (_e, j) => { if (running && running.id === j.id && !running.cancelled) onJob(running, j); return true; });
  ipcMain.on('pw:done', (_e, d) => {
    if (!running || running.id !== d.id) return;
    if (d.error && !running.cancelled) { running.error = d.error; running.message = d.error; }
    if (running.finish) running.finish();
  });

  // Propriétés de l'imprimante : la boîte de préférences de Windows (printui.dll). Elle règle les valeurs par défaut du pilote.
  ipcMain.handle('print:props', async (_e, name) => {
    if (process.env.SPINADOC_TEST_PRINT_DIR) return { ok: true, test: true };
    if (ALLOW() && name !== ALLOW()) return { ok: false };
    try { spawn('rundll32.exe', ['printui.dll,PrintUIEntry', '/e', '/n', String(name)], { detached: true, stdio: 'ignore' }).unref(); return { ok: true }; } catch { return { ok: false }; }
  });
}

// Fermeture de l'application : file abandonnée, toutes les fenêtres cachées détruites (y compris une fenêtre d'envoi qui attend encore le
// rappel du pilote), dossiers temporaires supprimés. Idempotent. Appelé par main.js à la fermeture de la fenêtre principale et sur 'before-quit'.
function shutdown() {
  shuttingDown = true;
  clearTimeout(idleTimer);
  for (const t of queue.splice(0)) { t.state = 'cancelled'; t.edBytes = null; }
  if (running) { running.cancelled = true; if (running.finish) running.finish(); }
  for (const w of [...windows]) { try { if (!w.isDestroyed()) w.destroy(); } catch { /* */ } }
  windows.clear();
  worker = null;
  for (const d of [...tmpDirs]) rmTmp(d);
}

module.exports = { register, active, shutdown, readLog, capabilitiesEx, _windows: () => windows.size };
