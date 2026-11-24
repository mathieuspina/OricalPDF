// Favoris du ruban (1.1.0), interface (CDP, hors écran) : clic droit sur une commande de 3 onglets (souris et clavier Maj+F10 / touche Menu)
// → « Ajouter aux favoris » → favori visible dans Accueil (groupe « Favoris », absent s'il n'y a aucun favori) ; un favori déclenche la MÊME
// commande et reflète l'état du bouton d'origine (outil persistant, bascule, infobulle) ; déplacement, retrait ; contrôles complexes (listes)
// non épinglables ; persistance après redémarrage (settings.json, ORICALPDF_USER_DATA) ; identifiant inconnu ignoré ; plafond de 12 ;
// clic droit sur un bouton désactivé (aucun document ouvert) ; ruban inchangé (aucune commande retirée de son onglet).
// Usage : node test/test-favorites-ui.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFLib = require('@cantoo/pdf-lib');
const { launchApp, sleep } = require('./lib/app.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oricalpdf-fav-ui-'));
  const d = await PDFLib.PDFDocument.create();
  d.addPage([595, 842]); d.addPage([595, 842]);
  const pdf = path.join(dir, 'plan-favoris.pdf');
  fs.writeFileSync(pdf, await d.save());

  const helpers = (c) => {
    const J = async (e) => JSON.parse(await c.ev(e));
    const rclick = async (sel) => {
      const [x, y, w, h] = await c.rect(sel);
      const X = x + w / 2, Y = y + h / 2;
      await c.mouse('mouseMoved', X, Y);
      await c.mouse('mousePressed', X, Y, { button: 'right', buttons: 2 });
      await c.mouse('mouseReleased', X, Y, { button: 'right', buttons: 0 });
      await sleep(200);
    };
    const menu = () => J(`JSON.stringify(document.getElementById('favmenu').hidden ? null : [...document.querySelectorAll('#favmenu button')].map(b=>({id:b.dataset.fav,label:b.textContent,disabled:b.disabled,title:b.title})))`);
    const favs = () => J(`JSON.stringify([...document.querySelectorAll('#fav-body .fav')].map(b=>b.dataset.cmd))`);
    const groupShown = () => c.ev(`(()=>{const g=document.getElementById('fav-group'); return !!g && !g.hidden && g.getBoundingClientRect().width>0})()`);
    const tab = async (t) => { await c.click('#rtab-' + t); await sleep(200); };
    const settingsFile = () => { try { return JSON.parse(fs.readFileSync(path.join(c.userData, 'settings.json'), 'utf8')); } catch { return {}; } };
    const pressed = (sel) => c.ev(`document.querySelector(${JSON.stringify(sel)}).getAttribute('aria-pressed')`);
    return { J, rclick, menu, favs, groupShown, tab, settingsFile, pressed };
  };
  const ribbonCmds = (c) => c.ev(`JSON.stringify([...document.querySelectorAll('#ribbon .rpanel [data-cmd]:not(.fav)')].map(b=>b.closest('.rpanel').id+':'+b.dataset.cmd))`);

  let settingsJson = null, ribbon0 = null;
  const c = await launchApp({ files: [pdf] });
  try {
    const h = helpers(c);
    await c.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`);
    await sleep(600);
    ribbon0 = await ribbonCmds(c);
    check('0 favori : aucun groupe « Favoris » dans Accueil', !(await h.groupShown()));

    // 1. Mesure : outil persistant (Distance), clic droit souris
    await h.tab('measure');
    await h.rclick('#rpanel-measure [data-cmd=tool-m-dist]');
    let m = await h.menu();
    check('clic droit sur « Distance » (Mesure) : menu « Ajouter aux favoris »', m && m.length === 1 && m[0].id === 'add' && !m[0].disabled && m[0].label === 'Ajouter aux favoris', m);
    check('menu : no-drag et au premier plan à sa position (elementFromPoint)', await c.ev(`(()=>{const b=document.querySelector('#favmenu button');const r=b.getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return (e===b||b.contains(e)) && getComputedStyle(document.getElementById('favmenu')).webkitAppRegion!=='drag'})()`));
    await c.click('#favmenu [data-fav=add]'); await sleep(250);
    check('menu fermé après le choix', (await h.menu()) === null);
    check('favori ajouté et mémorisé (settings.json : favorites)', eq(await h.favs(), ['tool-m-dist']) && eq(h.settingsFile().favorites, ['tool-m-dist']), [await h.favs(), h.settingsFile().favorites]);

    // 2. Mesure : bascule (Aimanter)
    await h.rclick('#rpanel-measure [data-cmd=m-snap]');
    await c.click('#favmenu [data-fav=add]'); await sleep(250);
    // 3. Affichage : clavier (focus sur le bouton puis Maj+F10), entrée choisie avec Entrée
    await h.tab('view');
    await c.ev(`document.querySelector('#rpanel-view [data-cmd=zoom-in]').focus()`);
    await c.key('F10', { code: 'F10', windowsVirtualKeyCode: 121, modifiers: 8 }); await sleep(250);
    m = await h.menu();
    check('Maj+F10 sur « Zoom + » (Affichage) : menu ouvert, focus sur « Ajouter aux favoris »', m && m[0].id === 'add' && (await c.ev(`document.activeElement && document.activeElement.dataset.fav`)) === 'add', m);
    await c.key('Enter', { code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(250);
    check('Entrée : ajouté ; ordre = ordre d\'ajout', eq(await h.favs(), ['tool-m-dist', 'm-snap', 'zoom-in']), await h.favs());
    // touche Menu + Échap
    await c.ev(`document.querySelector('#rpanel-view [data-cmd=fit-page]').focus()`);
    await c.key('ContextMenu', { code: 'ContextMenu', windowsVirtualKeyCode: 93 }); await sleep(200);
    check('touche Menu : menu ouvert', (await h.menu()) !== null);
    await c.key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(150);
    check('Échap : menu fermé, focus rendu au bouton', (await h.menu()) === null && (await c.ev(`document.activeElement && document.activeElement.dataset.cmd`)) === 'fit-page');
    // clic extérieur
    await h.rclick('#rpanel-view [data-cmd=fit-page]');
    await c.clickXY(400, 600); await sleep(150);
    check('clic extérieur : menu fermé, rien ajouté', (await h.menu()) === null && (await h.favs()).length === 3);

    // 4. Contrôle complexe (liste déroulante de l'unité, onglet Mesure) : non épinglable
    await h.tab('measure');
    await h.rclick('#m-unit');
    m = await h.menu();
    check('liste déroulante « Unité » : « Ajouter aux favoris » grisé, avec infobulle', m && m.length === 1 && m[0].disabled && /listes déroulantes/.test(m[0].title), m);
    await c.key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(100);
    // commande déjà favorite : le menu de l'original propose le retrait
    await h.rclick('#rpanel-measure [data-cmd=tool-m-dist]');
    m = await h.menu();
    check('commande déjà favorite (bouton d\'origine) : « Retirer des favoris »', m && m.length === 1 && m[0].id === 'remove', m);
    await c.key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(100);

    // 5. Accueil : favoris visibles, même commande, même état
    await h.tab('home');
    check('Accueil : groupe « Favoris » visible, 3 favoris (icône, libellé, infobulle de l\'original)', (await h.groupShown()) && eq(await h.J(`JSON.stringify([...document.querySelectorAll('#fav-body .fav')].map(b=>{const s=document.querySelector('#ribbon .rpanel [data-cmd="'+b.dataset.cmd+'"]:not(.fav)');return b.title===s.title && b.querySelector('.ico').dataset.icon===s.querySelector('.ico').dataset.icon && b.querySelector('.lbl').textContent.length>0}))`), [true, true, true]));
    await c.click('#fav-body [data-cmd=tool-m-dist]'); await sleep(200);
    check('favori « Distance » : outil Distance actif, favori ET bouton d\'origine enfoncés', (await c.ev(`import('./js/ui.js').then(m=>m.store.active.tool)`)) === 'm-dist' && (await h.pressed('#fav-body [data-cmd=tool-m-dist]')) === 'true' && (await h.pressed('#rpanel-measure [data-cmd=tool-m-dist]')) === 'true');
    await c.click('#rpanel-home [data-cmd=tool-select]:not(.fav)'); await sleep(200);
    check('outil changé ailleurs (Souris) : le favori n\'est plus enfoncé', (await h.pressed('#fav-body [data-cmd=tool-m-dist]')) === 'false');
    const snap0 = await h.pressed('#rpanel-measure [data-cmd=m-snap]');
    await c.click('#fav-body [data-cmd=m-snap]'); await sleep(200);
    const snap1 = await h.pressed('#rpanel-measure [data-cmd=m-snap]');
    check('favori « Aimanter » (bascule) : état basculé, synchronisé avec l\'original', snap0 !== snap1 && (await h.pressed('#fav-body [data-cmd=m-snap]')) === snap1, [snap0, snap1]);
    await c.click('#fav-body [data-cmd=m-snap]'); await sleep(200);
    check('second clic : état d\'origine rétabli', (await h.pressed('#rpanel-measure [data-cmd=m-snap]')) === snap0);
    const z0 = await c.ev(`import('./js/ui.js').then(m=>m.store.active.view.zoom)`);
    await c.click('#fav-body [data-cmd=zoom-in]'); await sleep(300);
    check('favori « Zoom + » : zoom augmenté', (await c.ev(`import('./js/ui.js').then(m=>m.store.active.view.zoom)`)) > z0);

    // 6. Déplacement et retrait
    await h.rclick('#fav-body [data-cmd=tool-m-dist]');
    m = await h.menu();
    check('menu d\'un favori : Retirer, Déplacer à gauche (grisé : premier), Déplacer à droite', m && eq(m.map((x) => x.id), ['remove', 'left', 'right']) && m[1].disabled && !m[2].disabled, m);
    await c.key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(100);
    await h.rclick('#fav-body [data-cmd=zoom-in]');
    await c.click('#favmenu [data-fav=left]'); await sleep(250);
    check('Déplacer à gauche : ordre mis à jour et mémorisé', eq(await h.favs(), ['tool-m-dist', 'zoom-in', 'm-snap']) && eq(h.settingsFile().favorites, ['tool-m-dist', 'zoom-in', 'm-snap']));
    await h.rclick('#fav-body [data-cmd=tool-m-dist]');
    await c.click('#favmenu [data-fav=right]'); await sleep(250);
    check('Déplacer à droite', eq(await h.favs(), ['zoom-in', 'tool-m-dist', 'm-snap']));
    await h.rclick('#fav-body [data-cmd=m-snap]');
    await c.click('#favmenu [data-fav=remove]'); await sleep(250);
    check('Retirer des favoris : retiré et mémorisé', eq(await h.favs(), ['zoom-in', 'tool-m-dist']) && eq(h.settingsFile().favorites, ['zoom-in', 'tool-m-dist']));
    check('ruban inchangé : aucune commande retirée de son onglet', (await ribbonCmds(c)) === ribbon0);
    check('aucune erreur JavaScript', c.logs.length === 0, c.logs);
    settingsJson = h.settingsFile();
  } catch (err) {
    check('exécution sans exception', false, String(err && err.stack || err));
  } finally {
    await c.close();
  }

  // 7. Redémarrage : favoris relus (même ordre) ; identifiant inconnu ignoré ; sans document : clic droit sur un bouton désactivé
  const s2 = Object.assign({}, settingsJson, { favorites: ['commande-supprimee'].concat((settingsJson && settingsJson.favorites) || []) });
  const c2 = await launchApp({ userDataFiles: { 'settings.json': s2 } });
  try {
    const h = helpers(c2);
    await c2.waitFor(`document.getElementById('fav-group') !== null`);
    await sleep(500);
    check('redémarrage : favoris relus dans le même ordre, identifiant inconnu ignoré', eq(await h.favs(), ['zoom-in', 'tool-m-dist']) && (await h.groupShown()), await h.favs());
    check('sans document : favoris désactivés comme les originaux', await c2.ev(`[...document.querySelectorAll('#fav-body .fav')].every(b=>b.disabled)`));
    await h.tab('view');
    await h.rclick('#rpanel-view [data-cmd=spread]');
    const m = await h.menu();
    check('clic droit sur un bouton désactivé (aucun document) : menu « Ajouter aux favoris »', m && m[0] && m[0].id === 'add' && !m[0].disabled, m);
    if (m) { await c2.click('#favmenu [data-fav=add]'); await sleep(250); }
    check('ajouté sans document ouvert', eq(await h.favs(), ['zoom-in', 'tool-m-dist', 'spread']), await h.favs());
    check('aucune erreur JavaScript (2e lancement)', c2.logs.length === 0, c2.logs);
  } catch (err) {
    check('2e lancement sans exception', false, String(err && err.stack || err));
  } finally {
    await c2.close();
  }

  // 8. Plafond : 12 favoris → groupe sur 2 rangs dans le ruban, ajout grisé
  const twelve = ['open', 'print', 'saveas', 'search', 'undo', 'redo', 'zoom-in', 'zoom-out', 'tool-m-dist', 'tool-m-dim', 'm-snap', 'fit-page'];
  const c3 = await launchApp({ files: [pdf], userDataFiles: { 'settings.json': { favorites: twelve } } });
  try {
    const h = helpers(c3);
    await c3.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`);
    await sleep(600);
    check('12 favoris affichés', eq(await h.favs(), twelve));
    const lay = await h.J(`JSON.stringify((()=>{const g=document.getElementById('fav-group'),body=document.getElementById('fav-body'),p=document.getElementById('rpanel-home');const pb=p.getBoundingClientRect();const tops=new Set([...body.children].map(b=>Math.round(b.getBoundingClientRect().top)));const out=[...body.children].filter(b=>b.getBoundingClientRect().bottom>pb.bottom+1).length;const lab=g.querySelector('.rgroup-label');return {rows:tops.size,out,labelOk:lab.scrollHeight<=lab.clientHeight+1&&lab.getBoundingClientRect().bottom<=pb.bottom+1,lines:Math.max(...[...body.querySelectorAll('.lbl')].map(l=>Math.round(l.getBoundingClientRect().height/parseFloat(getComputedStyle(l).lineHeight))))}})())`);
    check('12 favoris : 2 rangs, aucun bouton ne dépasse, étiquette entière, libellés ≤ 2 lignes', lay.rows === 2 && lay.out === 0 && lay.labelOk && lay.lines <= 2, lay);
    await h.tab('view');
    await h.rclick('#rpanel-view [data-cmd=fit-width]');
    const m = await h.menu();
    check('plafond atteint : « Ajouter aux favoris » grisé, infobulle « 12 favoris au plus »', m && m[0].disabled && /12 favoris au plus/.test(m[0].title), m);
    check('aucune erreur JavaScript (3e lancement)', c3.logs.length === 0, c3.logs);
  } catch (err) {
    check('3e lancement sans exception', false, String(err && err.stack || err));
  } finally {
    await c3.close();
  }
  console.log(`\n${passed} vérifications réussies, ${failures.length} échec(s).`);
  if (failures.length) { console.log('Échecs :\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('OK : favoris du ruban (interface).');
})();
