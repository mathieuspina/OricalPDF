// Impression : marges par défaut sûres (jamais vides), réglages par imprimante, marge matérielle (zone hachurée + message chiffré),
// « Couleur » toujours sélectionnable (imprimante simulée sans couleur annoncée), imprimante PDF vectorielle, nom du travail.
// Imprimantes SIMULÉES (ORICALPDF_TEST_PRINTERS) et tâches écrites dans un dossier (ORICALPDF_TEST_PRINT_DIR) : aucune impression réelle.
// Usage : node test/test-print-opts-ui.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFLib = require('@cantoo/pdf-lib');
const { launchApp, sleep } = require('./lib/app.js');
const { makeAll } = require('./lib/make-pdfs.js');

const failures = [];
let passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ok   ', name); }
  else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); }
}

(async () => {
  const f = await makeAll(path.join(os.tmpdir(), 'oricalpdf-ui-pdfs'));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'oricalpdf-print-opts-'));
  const papers = [{ name: 'A4', w: 210, h: 297 }, { name: 'A3', w: 297, h: 420 }];
  // avec codes de papier du pilote (RawKind) et papier par défaut, comme les lit print-main.js depuis 1.3.1 (correctif du 24/11)
  const papersK = [{ name: 'A4', w: 210, h: 297, kind: 9 }, { name: 'A3', w: 297, h: 420, kind: 8 }];
  const printers = [
    { name: 'Imprimante Exemple', isDefault: true, caps: { duplex: true, color: true, maxCopies: 99, hardMarginMm: 4.2, papers } },
    { name: 'PDFCreator', caps: { duplex: false, color: false, maxCopies: 1, hardMarginMm: null, papers } },
    { name: 'Autre imprimante', caps: { duplex: true, color: true, maxCopies: 99, hardMarginMm: null, papers: papersK, defaultPaper: papersK[0] } },
  ];
  let c2 = null;
  const c = await launchApp({ files: [f.a], env: { ORICALPDF_TEST_PRINT_DIR: out, ORICALPDF_TEST_PRINTERS: JSON.stringify(printers) } });
  const key = (k, code, vk, mods = 0) => c.key(k, { code, windowsVirtualKeyCode: vk, modifiers: mods });
  const setv = (id, v) => c.ev(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const val = (id) => c.ev(`document.getElementById(${JSON.stringify(id)}).value`);
  const txt = (id) => c.ev(`document.getElementById(${JSON.stringify(id)}).textContent`);
  const settle = () => sleep(900);
  const pick = async (name) => { await setv('pr-printer', name); await sleep(1000); };
  const jobs = () => JSON.parse(fs.readFileSync(path.join(out, 'jobs.json'), 'utf8'));
  const waitJob = async () => { for (let i = 0; i < 60; i++) { await sleep(250); if (fs.existsSync(path.join(out, 'jobs.json'))) return; } };
  const clearOut = () => { for (const x of fs.readdirSync(out)) fs.unlinkSync(path.join(out, x)); };
  async function pdfInfo(file) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 }).promise;
    let images = 0, text = '';
    for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i); const ol = await p.getOperatorList(); images += ol.fnArray.filter((x) => x === pdfjs.OPS.paintImageXObject || x === pdfjs.OPS.paintInlineImageXObject).length; text += (await p.getTextContent()).items.map((x) => x.str).join(' '); }
    return { pages: doc.numPages, images, text };
  }
  try {
    await c.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`);
    await sleep(800);
    await c.ev(`document.body.click()`);
    await key('p', 'KeyP', 80, 2); await sleep(1800);

    console.log('1. Marges par défaut sûres');
    check('imprimante par défaut : « Imprimante Exemple »', (await val('pr-printer')) === 'Imprimante Exemple');
    check('marge par défaut = marge matérielle annoncée (4,2 mm, jamais moins)', (await val('pr-margin')) === '4.2', await val('pr-margin'));
    await setv('pr-margin', '');
    await c.ev(`document.getElementById('pr-margin').dispatchEvent(new Event('blur'))`);
    check('champ vidé : valeur précédente rétablie (jamais vide)', (await val('pr-margin')) === '4.2', await val('pr-margin'));
    await setv('pr-margin', 'abc');
    await c.ev(`document.getElementById('pr-margin').dispatchEvent(new Event('blur'))`);
    check('valeur illisible : valeur précédente rétablie', (await val('pr-margin')) === '4.2', await val('pr-margin'));
    await pick('PDFCreator');
    check('changement d\'imprimante : champ de marge jamais vide, défaut 2 mm', (await val('pr-margin')) === '2', await val('pr-margin'));
    await pick('Autre imprimante');
    check('imprimante sans marge matérielle connue : 2 mm', (await val('pr-margin')) === '2', await val('pr-margin'));
    // même vidé pendant la frappe, l'aperçu et les tâches utilisent une marge valide
    await c.ev(`(()=>{const e=document.getElementById('pr-margin'); e.value=''; e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await settle();
    check('champ vide pendant la saisie : l\'aperçu reste calculé (pas d\'erreur)', !/Erreur|NaN/.test(await txt('pr-warn')) && /Papier/.test(await txt('pr-info')), await txt('pr-warn'));
    await setv('pr-margin', '2');

    console.log('2. Réglages par imprimante');
    await pick('Imprimante Exemple');
    await setv('pr-margin', '7'); await setv('pr-scale', 'actual'); await setv('pr-orient', 'landscape'); await settle();
    await pick('PDFCreator');
    check('autre imprimante : ses propres réglages par défaut (2 mm, ajusté, automatique)', (await val('pr-margin')) === '2' && (await val('pr-scale')) === 'fit' && (await val('pr-orient')) === 'auto', { m: await val('pr-margin'), s: await val('pr-scale'), o: await val('pr-orient') });
    await setv('pr-margin', '3');
    await pick('Imprimante Exemple');
    check('retour : marge, échelle et orientation mémorisées pour « Imprimante Exemple »', (await val('pr-margin')) === '7' && (await val('pr-scale')) === 'actual' && (await val('pr-orient')) === 'landscape', { m: await val('pr-margin'), s: await val('pr-scale'), o: await val('pr-orient') });
    await pick('PDFCreator');
    check('« PDFCreator » : 3 mm mémorisés', (await val('pr-margin')) === '3');

    console.log('3. Marge matérielle : zone hachurée et message chiffré');
    await pick('Imprimante Exemple');
    await setv('pr-scale', 'fit'); await setv('pr-orient', 'auto'); await setv('pr-paper', '210x297'); await setv('pr-margin', '1'); await settle();
    check('marge 1 mm < 4,2 mm : message chiffré', /1 mm/.test(await txt('pr-warn')) && /4,2 mm/.test(await txt('pr-warn')), await txt('pr-warn'));
    check('zone hachurée affichée (4 bandes)', (await c.ev(`(()=>{const h=document.getElementById('pr-hard'); return !h.hidden && h.children.length===4})()`)) === true);
    check('le message annonce la coupe en mm', /coupés/.test(await txt('pr-warn')) && /\d(,\d)? mm de contenu/.test(await txt('pr-warn')), await txt('pr-warn'));
    await setv('pr-margin', '6'); await settle();
    check('marge 6 mm ≥ 4,2 mm : plus d\'avertissement ni de zone hachurée', !/matérielle/.test(await txt('pr-warn')) && (await c.ev(`document.getElementById('pr-hard').hidden`)) === true, await txt('pr-warn'));

    console.log('4. Couleur : information, jamais un interdit');
    await pick('PDFCreator');
    check('« Couleur » reste sélectionnable pour une imprimante sans couleur annoncée', (await c.ev(`!document.querySelector('#pr-color option[value=color]').disabled`)) === true);
    check('aucune bascule automatique : « Couleur » reste choisi', (await val('pr-color')) === 'color', await val('pr-color'));
    check('note discrète : « Ce pilote n\'annonce pas la couleur »', /n'annonce pas la couleur/.test(await txt('pr-cnote')), await txt('pr-cnote'));
    check('imprimante PDF : « le résultat reste vectoriel »', /Imprimante PDF : le résultat reste vectoriel/.test(await txt('pr-cnote')), await txt('pr-cnote'));
    check('mention « Impression vectorielle »', /vectorielle/.test(await txt('pr-rnote')));
    await c.ev(`document.querySelector('input[name=pr-pages][value=current]').click()`); await settle();
    clearOut();
    await c.click('#pr-ok'); await waitJob(); await sleep(500);
    const j = jobs();
    const info = await pdfInfo(path.join(out, 'job-1.pdf'));
    check('tâche vers l\'imprimante sans couleur annoncée : couleur demandée, PDF vectoriel (texte, aucune image de page)', j.opts.color === true && info.images === 0 && /Doc A/.test(info.text), { opts: j.opts, info });

    console.log('5. Autre imprimante : couleur non grisée, note absente');
    await c.ev(`document.body.click()`); await key('p', 'KeyP', 80, 2); await sleep(1500);
    await pick('Autre imprimante');
    check('pas de note « n\'annonce pas la couleur »', !/n'annonce pas/.test(await txt('pr-cnote')) && !/Imprimante PDF/.test(await txt('pr-cnote')), await txt('pr-cnote'));
    await pick('PDFCreator');
    await setv('pr-color', 'gray'); await settle();
    check('niveaux de gris choisis par l\'utilisateur : mention de rasterisation, plus de « reste vectoriel »', /rasterise/.test(await txt('pr-rnote')) && !/reste vectoriel/.test(await txt('pr-cnote')), { r: await txt('pr-rnote'), c: await txt('pr-cnote') });
    await setv('pr-color', 'color');
    await pick('Autre imprimante'); await pick('PDFCreator');
    check('« Couleur » conservé après plusieurs changements d\'imprimante', (await val('pr-color')) === 'color');
    await c.click('#pr-cancel'); await sleep(300);

    console.log('6. Nom du travail d\'impression');
    clearOut();
    await c.ev(`document.body.click()`); await key('p', 'KeyP', 80, 2); await sleep(1500);
    await pick('Autre imprimante');
    await c.ev(`document.querySelector('input[name=pr-pages][value=all]').click()`); await setv('pr-paper', '210x297'); await settle();
    await c.click('#pr-ok'); await waitJob(); await sleep(800);
    const j1 = jobs();
    check('un seul format : titre = nom du document (avec .pdf, sans chemin)', j1.jobs.length === 1 && j1.jobs[0].title === 'a-huit-pages.pdf' && j1.jobs[0].fileName === 'a-huit-pages.pdf', j1.jobs[0]);
    const t1 = (await PDFLib.PDFDocument.load(fs.readFileSync(path.join(out, 'job-1.pdf')))).getTitle();
    check('métadonnée /Title du PDF d\'impression = nom du document', t1 === 'a-huit-pages.pdf', t1);
    check('nom du travail transmis (document sans chemin)', j1.name === 'a-huit-pages.pdf', j1.name);

    console.log('7. Orientation envoyée au pilote (1.3.1) et journal d\'impression');
    const waitPrint = async () => { for (let i = 0; i < 60; i++) { await sleep(250); try { const x = jobs(); if (x.jobs.length && x.jobs.every((q) => q.print)) return x; } catch { /* en cours d'écriture */ } } return null; };
    const printWith = async (paper, orient, send) => {
      clearOut();
      await c.ev(`document.body.click()`); await key('p', 'KeyP', 80, 2); await sleep(1500);
      await pick('Autre imprimante');
      await c.ev(`document.querySelector('input[name=pr-pages][value=current]').click()`);
      await setv('pr-paper', paper); await setv('pr-orient', orient); if (send) await setv('pr-sendorient', send); await settle();
      await c.click('#pr-ok');
      return waitPrint();
    };
    check('réglage avancé « Orientation envoyée à l\'imprimante » : Automatique par défaut', await c.ev(`(()=>{const e=document.getElementById('pr-sendorient');return e.value==='auto' && [...e.options].map(o=>o.textContent).join('|')==='Automatique (défaut)|Portrait|Paysage'})()`) === true);
    let pj = await printWith('297x420', 'landscape', 'auto');
    let po = pj && pj.jobs[0].print;
    check('A3 paysage, automatique : landscape true, pageSize A3 en portrait (dimensions du papier annoncé)', po && po.options.landscape === true && po.options.pageSize.width === 297000 && po.options.pageSize.height === 420000 && po.format === 'A3' && po.paper === 'A3', po);
    pj = await printWith('210x297', 'portrait', 'auto');
    po = pj && pj.jobs[0].print;
    check('A4 portrait, automatique : landscape false, pageSize A4', po && po.options.landscape === false && po.options.pageSize.width === 210000 && po.options.pageSize.height === 297000, po);
    const sheetBox = (await PDFLib.PDFDocument.load(fs.readFileSync(path.join(out, 'job-1.pdf')))).getPages()[0].getMediaBox();
    check('PDF d\'impression A4 : MediaBox = feuille exacte', Math.abs(sheetBox.width - 595.28) < 0.05 && Math.abs(sheetBox.height - 841.89) < 0.05, sheetBox);
    pj = await printWith('297x420', 'landscape', 'portrait');
    po = pj && pj.jobs[0].print;
    check('orientation envoyée imposée « Portrait » : landscape false, feuille et pageSize inchangées', po && po.options.landscape === false && po.forced === 'portrait' && po.sheet === 'paysage' && po.options.pageSize.width === 297000, po);
    await c.ev(`document.body.click()`); await key('p', 'KeyP', 80, 2); await sleep(1500);
    await pick('Autre imprimante');
    check('réglage avancé mémorisé pour cette imprimante', (await val('pr-sendorient')) === 'portrait', await val('pr-sendorient'));
    await pick('PDFCreator');
    check('autre imprimante : Automatique', (await val('pr-sendorient')) === 'auto', await val('pr-sendorient'));
    await pick('Autre imprimante'); await setv('pr-sendorient', 'auto');
    await c.click('#pr-cancel'); await sleep(300);

    console.log('8. Méthode d\'envoi du format (1.3.1, correctif du 24/11) : code de papier, taille personnalisée, papier par défaut du pilote');
    const printMethod = async (paper, orient, method) => {
      clearOut();
      await c.ev(`document.body.click()`); await key('p', 'KeyP', 80, 2); await sleep(1500);
      await pick('Autre imprimante');
      await c.ev(`document.querySelector('input[name=pr-pages][value=current]').click()`);
      await setv('pr-paper', paper); await setv('pr-orient', orient); await setv('pr-sendpaper', method); await settle();
      const line = await txt('pr-send');
      await c.click('#pr-ok');
      const x = await waitPrint();
      return { line, job: x && x.jobs[0] };
    };
    await c.ev(`document.body.click()`); await key('p', 'KeyP', 80, 2); await sleep(1500);
    check('réglage avancé « Méthode d\'envoi du format » : Automatique par défaut', await c.ev(`(()=>{const e=document.getElementById('pr-sendpaper');return e.value==='auto' && [...e.options].map(o=>o.textContent).join('|')==='Automatique (défaut)|Taille personnalisée|Papier par défaut du pilote'})()`) === true);
    await c.click('#pr-cancel'); await sleep(300);
    let r8 = await printMethod('297x420', 'landscape', 'auto');
    check('automatique, A3 paysage : ligne « Envoi : A3 (papier de l\'imprimante, code 8), paysage »', r8.line === "Envoi : A3 (papier de l'imprimante, code 8), paysage", r8.line);
    let sd = r8.job && r8.job.send;
    check('automatique : appel interne d\'Electron disponible (Electron 33 : _print) — le code de papier peut partir', sd && sd.api === 'interne' && sd.applied === 'code', sd && { api: sd.api, applied: sd.applied });
    check('automatique : mediaSize avec vendor_id 8, dimensions du papier annoncé, landscape, sans pageSize', sd && sd.args.mediaSize.vendor_id === '8' && sd.args.mediaSize.width_microns === 297000 && sd.args.mediaSize.height_microns === 420000 && sd.args.landscape === true && !('pageSize' in sd.args) && sd.text === r8.line, sd && sd.args);
    r8 = await printMethod('297x420', 'landscape', 'custom');
    sd = r8.job && r8.job.send;
    check('taille personnalisée : ligne « Envoi : taille personnalisée 420 × 297 mm, paysage », aucun code', r8.line === 'Envoi : taille personnalisée 420 × 297 mm, paysage' && sd && !('vendor_id' in sd.args.mediaSize) && sd.applied === 'custom' && r8.job.print.method === 'custom', { line: r8.line, ms: sd && sd.args.mediaSize });
    r8 = await printMethod('297x420', 'landscape', 'driver');
    sd = r8.job && r8.job.send;
    check('papier par défaut du pilote : ligne « … (A4, code 9), paysage », code 9 et dimensions A4 envoyés', r8.line === 'Envoi : papier par défaut du pilote (A4, code 9), paysage' && sd && sd.args.mediaSize.vendor_id === '9' && sd.args.mediaSize.width_microns === 210000 && sd.applied === 'driver', { line: r8.line, ms: sd && sd.args.mediaSize });
    await c.ev(`document.body.click()`); await key('p', 'KeyP', 80, 2); await sleep(1500);
    await pick('Autre imprimante');
    check('méthode mémorisée pour cette imprimante', (await val('pr-sendpaper')) === 'driver', await val('pr-sendpaper'));
    await pick('PDFCreator');
    check('autre imprimante : Automatique ; PDF A3 sans code annoncé → code standard', (await val('pr-sendpaper')) === 'auto', await val('pr-sendpaper'));
    await setv('pr-paper', '297x420'); await setv('pr-orient', 'landscape'); await settle();
    check('ligne « Envoi » mise à jour avec l\'imprimante (papier sans code annoncé : format standard)', (await txt('pr-send')) === 'Envoi : A3 (format standard, code 8), paysage', await txt('pr-send'));
    await setv('pr-sendorient', 'portrait'); await settle();
    check('ligne « Envoi » suit l\'orientation envoyée', (await txt('pr-send')) === 'Envoi : A3 (format standard, code 8), portrait', await txt('pr-send'));
    await setv('pr-sendorient', 'auto');
    await pick('Autre imprimante'); await setv('pr-sendpaper', 'auto');
    await c.click('#pr-cancel'); await sleep(300);
    const logFile = path.join(c.userData, 'print-log.txt');
    const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
    const lines = log.trim().split('\n').filter(Boolean);
    check('journal : une ligne par tâche dans le dossier des données', lines.length >= 5 && lines.every((l) => /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d \| /.test(l)), lines.length);
    check('journal : orientation, format, options exactes, résultat', /420 × 297 mm \| portrait \(imposée\), feuille paysage \| format A3 \(annoncé par l'imprimante : « A3 »\) \| méthode automatique, appliquée : code de papier \(API interne\) \| Envoi : A3 \(papier de l'imprimante, code 8\), portrait \| options \{.*"landscape":false.*"vendor_id":"8".*\} \| capacités : imprimante de test \| papiers annoncés \(2\) : A4 210 × 297 mm #9 ; A3 297 × 420 mm #8 \| résultat : test/.test(log) && /"deviceName":"Autre imprimante"/.test(log), lines.slice(-1));
    check('journal : les trois méthodes (demandée et appliquée)', /méthode taille personnalisée, appliquée : taille personnalisée \(API interne\) \| Envoi : taille personnalisée 420 × 297 mm, paysage/.test(log) && /méthode papier par défaut du pilote, appliquée : papier par défaut du pilote \(API interne\) \| Envoi : papier par défaut du pilote \(A4, code 9\), paysage/.test(log), lines.slice(-3));
    check('journal : jamais de nom de fichier ni de chemin', !/a-huit-pages|\.pdf|[A-Za-z]:\\|oricalpdf-/i.test(log), log.slice(0, 300));
    const copied = await c.ev(`(async()=>{document.getElementById('about-printlog').click(); await new Promise(r=>setTimeout(r,400)); return [document.getElementById('about-diag-msg').textContent, await window.oricalpdf.printLog()];})()`);
    check('À propos : « Copier le journal d\'impression » copie le journal', /Journal d'impression copié/.test(copied[0]) && copied[1] === log, copied[0]);

    console.log('9. Copies : toujours 1 à l\'ouverture (jamais mémorisées)');
    const openDlg = async () => { await c.ev(`document.body.click()`); await key('p', 'KeyP', 80, 2); await sleep(1500); };
    clearOut();
    await openDlg();
    await pick('Autre imprimante');
    await c.ev(`document.querySelector('input[name=pr-pages][value=current]').click()`);
    await setv('pr-copies', '6'); await settle();
    await c.click('#pr-ok');
    const j6 = await waitPrint();
    check('tâche imprimée avec 6 copies', j6 && j6.opts && j6.opts.copies === 6, j6 && j6.opts);
    const st6 = JSON.parse(fs.readFileSync(path.join(c.userData, 'settings.json'), 'utf8'));
    check('settings.json : aucune valeur « copies » écrite', st6.print && !('copies' in st6.print), st6.print);
    await openDlg();
    check('même document, boîte rouverte : copies = 1', (await val('pr-copies')) === '1', await val('pr-copies'));
    await c.click('#pr-cancel'); await sleep(300);
    await c.openMore(f.b);
    await c.waitFor(`document.querySelectorAll('.doctab').length===2`, 15000); await sleep(1200);
    await openDlg();
    check('autre document : copies = 1', (await val('pr-copies')) === '1' && (await c.ev(`!document.getElementById('printdlg').hidden`)), await val('pr-copies'));
    await c.click('#pr-cancel'); await sleep(300);
    check('aucune erreur JavaScript', c.logs.length === 0, c.logs);
    // Nouvelle session avec le même profil (settings.json recopié) ; on y ajoute une ANCIENNE valeur « copies: 6 », qui doit être ignorée.
    const profile = JSON.parse(fs.readFileSync(path.join(c.userData, 'settings.json'), 'utf8'));
    profile.print = Object.assign({}, profile.print, { copies: 6 });
    c2 = await launchApp({ files: [f.a], userDataFiles: { 'settings.json': profile }, env: { ORICALPDF_TEST_PRINT_DIR: out, ORICALPDF_TEST_PRINTERS: JSON.stringify(printers) } });
    await c2.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`); await sleep(800);
    await c2.ev(`document.body.click()`); await c2.key('p', { code: 'KeyP', windowsVirtualKeyCode: 80, modifiers: 2 }); await sleep(1800);
    const v2 = await c2.ev(`document.getElementById('pr-copies').value`);
    const p2 = await c2.ev(`document.getElementById('pr-printer').value`);
    check('nouvelle session, même profil, ancienne valeur « copies: 6 » dans settings.json : copies = 1 (autres réglages relus : imprimante)', v2 === '1' && p2 === 'Autre imprimante', { v2, p2 });
    check('nouvelle session : aucune erreur JavaScript', c2.logs.length === 0, c2.logs);
  } catch (e) {
    check('exécution sans exception', false, String(e && e.stack || e));
  } finally {
    await c.close();
    if (c2) await c2.close();
    try { fs.rmSync(out, { recursive: true, force: true }); } catch { /* */ }
  }
  console.log(`\n${passed} vérifications réussies, ${failures.length} échec(s).`);
  if (failures.length) { console.log('Échecs :\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('OK : options d\'impression (interface).');
})();
