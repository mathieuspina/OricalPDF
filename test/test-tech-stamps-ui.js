// Interface des tampons techniques (1.4.0) : bouton à menu de l'onglet Annoter (catégories, miniatures vectorielles), pose par clic (outil
// persistant), poignées (proportions verrouillées, Maj = libre), libellé / plein-contour / épaisseur au panneau Propriétés (champs utiles
// seulement), annuler / rétablir, dupliquer / supprimer, favori d'un symbole (clic droit sur sa miniature), enregistrement relu avec pdf.js.
// Headless (SPIN_TEST_HEADLESS=1 par défaut). Usage : node test/test-tech-stamps-ui.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFLib = require('@cantoo/pdf-lib');
const { launchApp, sleep } = require('./lib/app.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail).slice(0, 600) : ''); } };
const FONTS = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'standard_fonts').split('\\').join('/') + '/';

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spinadoc-tech-ui-'));
  const d = await PDFLib.PDFDocument.create();
  d.addPage([842, 595]); // plan paysage
  const pdf = path.join(dir, 'plan-technique.pdf');
  fs.writeFileSync(pdf, await d.save());
  const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spinadoc-tech-save-'));
  const c = await launchApp({ files: [pdf], env: { SPINADOC_TEST_SAVE_DIR: saveDir } });
  const J = async (e) => JSON.parse(await c.ev(e));
  try {
    await c.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`);
    await sleep(800);
    await c.ev(`import('./js/settings.js').then(s=>s.set('propsAuto', true))`); // panneau Propriétés ouvert à la sélection
    const SC = 4 / 3;
    const P = async (x, y) => { const [l, t] = await c.rect('.docview.active .page'); return [l + x * SC, t + y * SC]; };
    const click = async (x, y) => c.clickXY(...(await P(x, y)));
    const mouse = (type, x, y, mods = 0) => c.mouse(type, x, y, { modifiers: mods });
    const drag = async (x1, y1, x2, y2, mods = 0) => {
      await mouse('mouseMoved', x1, y1, mods); await mouse('mousePressed', x1, y1, mods);
      for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', x1 + ((x2 - x1) * i) / 6, y1 + ((y2 - y1) * i) / 6, mods); await sleep(15); }
      await mouse('mouseReleased', x2, y2, mods); await sleep(250);
    };
    const key = (k, code, vk, mods = 0) => c.key(k, { code, windowsVirtualKeyCode: vk, modifiers: mods });
    const edits = () => J(`import('./js/ui.js').then(m=>JSON.stringify(m.store.active.edits.filter(e=>e.type==='tstamp').map(e=>({id:e.id,sym:e.sym,label:e.label,style:e.style,weight:e.weight,w:e.w,h:e.h,color:e.color}))))`);
    const texts = () => J(`JSON.stringify([...document.querySelectorAll('.docview.active .page .objs > g text')].map(t=>t.textContent))`);
    const toolLabel = () => c.ev(`document.getElementById('tool-label').textContent`);
    const handles = () => J(`JSON.stringify([...document.querySelectorAll('.docview.active .page .sel-handle')].map(h=>{const r=h.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}))`);
    const box = () => J(`(()=>{const s=document.querySelector('.docview.active .page .sel-outline').getBoundingClientRect(); return JSON.stringify([s.width,s.height])})()`);
    const propRows = () => J(`JSON.stringify([...document.querySelectorAll('#props .prop-row > label')].map(l=>l.textContent))`);
    const setProp = (label, value) => c.ev(`(()=>{const row=[...document.querySelectorAll('#props .prop-row')].find(r=>r.querySelector('label').textContent===${JSON.stringify(label)}); const i=row.querySelector('input,select'); i.value=${JSON.stringify(value)}; i.dispatchEvent(new Event('change'))})()`);
    const rclick = async (sel) => {
      const [x, y, w, h] = await c.rect(sel);
      await c.mouse('mouseMoved', x + w / 2, y + h / 2);
      await c.mouse('mousePressed', x + w / 2, y + h / 2, { button: 'right', buttons: 2 });
      await c.mouse('mouseReleased', x + w / 2, y + h / 2, { button: 'right', buttons: 0 });
      await sleep(250);
    };

    console.log('1. Ruban et menu');
    await c.click('#rtab-annotate'); await sleep(250);
    const btn = '#rpanel-annotate [data-cmd=tech-menu]';
    check('onglet Annoter : bouton à menu « Tampons techniques » (icône dessinée depuis la géométrie)', await c.ev(`(()=>{const b=document.querySelector('${btn}'); return !!b && b.getAttribute('aria-haspopup')==='menu' && b.textContent.trim()==='Tampons techniques' && /^url\\("data:image\\/svg\\+xml/.test(b.querySelector('.ico').style.maskImage)})()`));
    await c.click(btn); await sleep(300);
    const menu = await J(`JSON.stringify({shown:!document.getElementById('tech-menu-pop').hidden, titles:[...document.querySelectorAll('#tech-menu-pop .menu-title')].map(t=>t.textContent), cells:document.querySelectorAll('#tech-menu-pop .tech-cell').length, thumbs:[...document.querySelectorAll('#tech-menu-pop .tech-cell')].every(b=>b.querySelector('svg path') && !b.querySelector('img')), focus:document.activeElement.classList.contains('tech-cell'), expanded:document.querySelector('${btn}').getAttribute('aria-expanded')})`);
    const nCat = await c.ev(`window.TechStamps.CATALOG.length`);
    check('menu : 3 catégories, une miniature vectorielle (SVG, aucune image) par entrée du catalogue', menu.shown && menu.titles.join('|') === 'Profilés|Bardage et couverture|Repères' && menu.cells === nCat && menu.thumbs && menu.expanded === 'true', menu);
    check('menu : focus clavier sur une miniature', menu.focus);
    await key('Escape', 'Escape', 27); await sleep(200);
    check('Échap ferme le menu', await c.ev(`document.getElementById('tech-menu-pop').hidden`));

    console.log('2. Pose');
    await c.click(btn); await sleep(250);
    await c.click('#tech-menu-pop [data-sym=ipe]'); await sleep(250);
    check('IPE choisi : outil « Tampon technique » actif, menu fermé, bouton enfoncé', (await toolLabel()) === 'Outil : Tampon technique' && await c.ev(`document.getElementById('tech-menu-pop').hidden`) && (await c.ev(`document.querySelector('${btn}').getAttribute('aria-pressed')`)) === 'true');
    await click(200, 200); await click(400, 200); await sleep(300);
    let e = await edits();
    check('deux IPE posés de suite (outil persistant), libellé « IPE 200 », noir, plein', e.length === 2 && e.every((x) => x.sym === 'ipe' && x.label === 'IPE 200' && x.color.join() === '0,0,0' && x.style === 'solid'), e);
    check('aperçu : libellé affiché sous la silhouette', (await texts()).filter((t) => t === 'IPE 200').length === 2);
    await key('Escape', 'Escape', 27); await sleep(200);

    console.log('3. Sélection, poignées, propriétés');
    await c.click('#rpanel-annotate [data-cmd=tool-select]'); await sleep(150);
    await click(200, 190); await sleep(300);
    check('IPE sélectionné : panneau « Tampon technique »', (await c.ev(`document.getElementById('props-title').textContent`)) === 'Tampon technique');
    const rows = await propRows();
    check('propriétés : couleur, opacité, libellé, plein / contour, épaisseur ; aucun champ de tampon texte', ['Couleur', 'Opacité', 'Libellé', 'Remplissage', 'Épaisseur du trait'].every((l) => rows.includes(l)) && !rows.some((l) => /Cadre|Date|Incliné|Texte du tampon/.test(l)), rows);
    const b0 = await box();
    let hs = await handles();
    await drag(hs[4][0], hs[4][1], hs[4][0] + 50, hs[4][1] + 10);
    const b1 = await box();
    check('poignée : agrandi, proportions conservées', b1[0] > b0[0] + 25 && Math.abs(b1[0] / b1[1] - b0[0] / b0[1]) < 0.02, { b0, b1 });
    hs = await handles();
    await drag(hs[4][0], hs[4][1], hs[4][0] + 60, hs[4][1] + 2, 8);
    const b2 = await box();
    check('Maj + poignée : proportions libres ; poignée de rotation présente', Math.abs(b2[0] / b2[1] - b1[0] / b1[1]) > 0.1 && (await handles()).length === 9, { b1, b2 });
    e = await edits();
    const w0 = e[0].w;
    await setProp('Libellé', 'IPE 300 (réservation)'); await sleep(300);
    e = await edits();
    check('libellé modifié : texte affiché, le cadre s\'élargit (échelle conservée)', (await texts()).includes('IPE 300 (réservation)') && e[0].label === 'IPE 300 (réservation)' && e[0].w > w0, e[0]);
    await key('z', 'KeyZ', 90, 2); await sleep(300);
    check('Ctrl+Z : libellé d\'origine', (await edits())[0].label !== 'IPE 300 (réservation)' && !(await texts()).includes('IPE 300 (réservation)'));
    await key('y', 'KeyY', 89, 2); await sleep(300);
    check('Ctrl+Y : libellé rétabli', (await edits())[0].label === 'IPE 300 (réservation)');
    await setProp('Remplissage', 'outline'); await setProp('Épaisseur du trait', 'bold'); await sleep(300);
    e = await edits();
    const fills = await J(`JSON.stringify([...document.querySelectorAll('.docview.active .page .objs > g[data-id="${e[0].id}"] path')].map(p=>p.getAttribute('fill')))`);
    check('contour + épais : chemins sans remplissage', e[0].style === 'outline' && e[0].weight === 'bold' && fills.length && fills.every((f) => f === 'none'), { e: e[0], fills });
    await key('d', 'KeyD', 68, 2); await sleep(300);
    check('Ctrl+D : copie (même symbole, même libellé)', (await edits()).filter((x) => x.label === 'IPE 300 (réservation)').length === 2);
    await key('Delete', 'Delete', 46); await sleep(250);
    check('Suppr : copie supprimée', (await edits()).length === 2);

    console.log('4. Repère (bulle) : rouge, numéro modifiable');
    await c.click(btn); await sleep(250);
    await c.ev(`document.querySelector('#tech-menu-pop [data-sym=bubble]').scrollIntoView({block:'nearest'})`); await sleep(100);
    await c.click('#tech-menu-pop [data-sym=bubble]'); await sleep(200);
    await click(450, 330); await sleep(300);
    await key('Escape', 'Escape', 27); await c.click('#rpanel-annotate [data-cmd=tool-select]'); await sleep(150);
    await click(450, 330); await sleep(300);
    const rowsB = await propRows();
    check('bulle : rouge ; propriétés sans plein / contour (aucun corps)', (await edits()).find((x) => x.sym === 'bubble').color[0] > 0.8 && rowsB.includes('Libellé') && !rowsB.includes('Remplissage'), rowsB);
    await setProp('Libellé', '12'); await sleep(250);
    check('bulle : numéro « 12 »', (await texts()).includes('12'));
    await key('Escape', 'Escape', 27);

    console.log('5. Favori d\'un symbole');
    await c.click(btn); await sleep(250);
    check('réouverture : focus sur le dernier symbole utilisé (bulle)', await c.ev(`document.activeElement.dataset.sym==='bubble'`));
    await c.ev(`document.querySelector('#tech-menu-pop [data-sym=heb]').scrollIntoView({block:'nearest'})`); await sleep(100);
    await rclick('#tech-menu-pop [data-sym=heb]');
    const fm = await J(`JSON.stringify(document.getElementById('favmenu').hidden ? null : [...document.querySelectorAll('#favmenu button')].map(b=>b.dataset.fav))`);
    check('clic droit sur la miniature HEB : menu des favoris « Ajouter »', Array.isArray(fm) && fm.includes('add'), fm);
    await c.click('#favmenu [data-fav=add]'); await sleep(300);
    await c.ev(`document.getElementById('tech-menu-pop').hidden || document.querySelector('${btn}').click()`); await sleep(150);
    await c.click('#rtab-home'); await sleep(250);
    const fav = await J(`JSON.stringify((()=>{const b=document.querySelector('#fav-body [data-cmd=tst-heb]'); return b && {label:b.textContent.trim(), mask:/^url/.test(b.querySelector('.ico').style.maskImage), shown:b.getBoundingClientRect().width>0}})())`);
    check('favori « HEB » dans l\'onglet Accueil (icône dessinée, libellé du symbole)', fav && fav.label === 'HEB' && fav.mask && fav.shown, fav);
    await c.click('#fav-body [data-cmd=tst-heb]'); await sleep(250);
    check('clic sur le favori : outil Tampon technique HEB, favori enfoncé', (await toolLabel()) === 'Outil : Tampon technique' && (await c.ev(`document.querySelector('#fav-body [data-cmd=tst-heb]').getAttribute('aria-pressed')`)) === 'true');
    await click(150, 340); await sleep(300);
    check('HEB posé depuis le favori', (await edits()).some((x) => x.sym === 'heb' && x.label === 'HEB 200'));
    await key('Escape', 'Escape', 27); await sleep(150);
    const settings = JSON.parse(fs.readFileSync(path.join(c.userData, 'settings.json'), 'utf8'));
    check('favori mémorisé dans les réglages (identifiant de commande tst-heb)', (settings.favorites || []).includes('tst-heb'), settings.favorites);

    console.log('6. Enregistrement');
    await key('s', 'KeyS', 83, 2); await sleep(2500);
    const saved = fs.readdirSync(saveDir).filter((f) => f.endsWith('.pdf'));
    let pdfTexts = [];
    if (saved.length) {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(saveDir, saved[0]))), standardFontDataUrl: FONTS, verbosity: 0 }).promise;
      pdfTexts = (await (await doc.getPage(1)).getTextContent()).items.map((i) => i.str);
    }
    check('Ctrl+S : PDF écrit, libellés lus par pdf.js', saved.length === 1 && ['IPE 200', 'IPE 300 (réservation)', '12', 'HEB 200'].every((t) => pdfTexts.includes(t)), { saved, pdfTexts });
    const errs = c.logs.filter((l) => /error|exception/i.test(l));
    check('aucune erreur dans la console', errs.length === 0, errs.slice(0, 5));
  } catch (err) {
    failures.push('exception : ' + err.message);
    console.log(err);
  } finally {
    await c.close();
  }
  console.log(`\n${passed} vérifications réussies, ${failures.length} échec(s).`);
  if (failures.length) { console.log('Échecs :\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('OK : interface des tampons techniques.');
})();
