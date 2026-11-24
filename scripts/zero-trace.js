// Contrôle « zéro trace » de l'ancien nom du produit (décision de l'utilisateur du 2026-11-24 : aucune compatibilité, aucune trace sur le
// disque). Motif : celui de test/test-rename.js (source unique, toutes les formes : espaces, tirets, soulignés, casse quelconque).
// Cherche dans : les NOMS de fichiers et de dossiers, le CONTENU de chaque fichier (texte UTF-8 ; binaires lus en latin1 ET en UTF-16LE,
// où sont les chaînes des ressources Windows), app.asar (liste des fichiers + contenu de chacun), les informations de version des
// exécutables (ProductName, FileDescription, OriginalFilename, InternalName, CompanyName, LegalCopyright…), des clés de registre (reg query
// /s) et des raccourcis (.lnk : nom et contenu).
// Usage en ligne de commande : node scripts/zero-trace.js <dossier> [<dossier>…]   (code 1 si une occurrence est trouvée)
// Utilisé par scripts/test-packaged.js (application dépaquetée, installeur extrait par 7za, installation de test, registre, raccourcis).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { OLD } = require('../test/test-rename.js');

const G = new RegExp(OLD.source, 'gi');
// Occurrences dans un tampon : [{ at, text }] (extrait lisible autour de chaque occurrence ; 20 au plus).
function scanBuffer(buf) {
  const out = [];
  const texts = buf.includes(0) ? [['latin1', buf.toString('latin1')], ['utf16le', buf.toString('utf16le')], ['utf16le+1', buf.subarray(1).toString('utf16le')]] : [['utf8', buf.toString('utf8')]];
  for (const [enc, t] of texts) {
    G.lastIndex = 0;
    let m;
    while ((m = G.exec(t)) && out.length < 20) out.push({ enc, at: m.index, text: t.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/[^\x20-\x7e -ɏ]/g, '.') });
  }
  return out;
}
function scanAsar(file, label, hits) {
  const asar = require('@electron/asar');
  const list = asar.listPackage(file, { isPack: false });
  for (const p of list) {
    if (OLD.test(p)) hits.push({ where: label + ' (liste)', what: p });
    let st; try { st = asar.statFile(file, p.replace(/^[\\/]/, ''), false); } catch { continue; }
    if (!st || st.files || st.link) continue;
    let buf; try { buf = asar.extractFile(file, p.replace(/^[\\/]/, '')); } catch { continue; }
    for (const h of scanBuffer(buf)) hits.push({ where: label + p, what: h.text, enc: h.enc });
  }
  return list.length;
}
// Dossier complet : noms, contenus, app.asar. Renvoie { files, asarFiles, hits }.
function scanDir(dir) {
  const hits = [];
  let files = 0, asarFiles = 0;
  const walk = (d) => {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      const rel = path.relative(dir, p);
      if (OLD.test(n)) hits.push({ where: 'nom', what: rel });
      const st = fs.lstatSync(p);
      if (st.isDirectory()) { walk(p); continue; }
      files++;
      if (/\.asar$/i.test(n)) asarFiles += scanAsar(p, rel + ':', hits);
      for (const h of scanBuffer(fs.readFileSync(p))) hits.push({ where: rel, what: h.text, enc: h.enc });
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return { files, asarFiles, hits };
}
// Informations de version d'un exécutable (PowerShell, lecture seule).
function exeInfo(exe) {
  const q = "$v=(Get-Item -LiteralPath '" + exe.split("'").join("''") + "').VersionInfo; [ordered]@{ProductName=$v.ProductName;FileDescription=$v.FileDescription;OriginalFilename=$v.OriginalFilename;InternalName=$v.InternalName;CompanyName=$v.CompanyName;LegalCopyright=$v.LegalCopyright;LegalTrademarks=$v.LegalTrademarks;ProductVersion=$v.ProductVersion;FileVersion=$v.FileVersion} | ConvertTo-Json -Compress";
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', q], { encoding: 'utf8' });
  let info = {}; try { info = JSON.parse(r.stdout); } catch { info = { error: (r.stderr || r.stdout || '').trim().slice(0, 200) }; }
  const bad = Object.entries(info).filter(([, v]) => typeof v === 'string' && OLD.test(v));
  return { info, hits: bad.map(([k, v]) => ({ where: path.basename(exe) + ' : ' + k, what: v })) };
}
// Clés de registre (récursif) : occurrences dans les noms et les valeurs.
function scanReg(keys) {
  const hits = [];
  for (const k of keys) {
    const r = spawnSync('reg', ['query', k, '/s'], { encoding: 'utf8' });
    if (r.status !== 0) continue;
    for (const l of r.stdout.split(/\r?\n/)) if (OLD.test(l)) hits.push({ where: 'registre ' + k, what: l.trim() });
  }
  return hits;
}
// Raccourcis : nom + contenu (cible, dossier de travail, description).
function scanLnks(paths) {
  const hits = [];
  for (const p of paths) {
    if (OLD.test(path.basename(p))) hits.push({ where: 'raccourci', what: p });
    if (fs.existsSync(p)) for (const h of scanBuffer(fs.readFileSync(p))) hits.push({ where: 'raccourci ' + path.basename(p), what: h.text });
  }
  return hits;
}
const show = (hits, max = 15) => hits.slice(0, max).map((h) => '    ' + h.where + ' : ' + h.what + (h.enc ? ' [' + h.enc + ']' : '')).join('\n');

module.exports = { OLD, scanBuffer, scanDir, exeInfo, scanReg, scanLnks, show };

if (require.main === module) {
  let bad = 0;
  for (const d of process.argv.slice(2)) {
    const r = scanDir(d);
    console.log(`${d} : ${r.files} fichiers, ${r.asarFiles} entrées app.asar, ${r.hits.length} occurrence(s)`);
    if (r.hits.length) { bad++; console.log(show(r.hits, 40)); }
  }
  process.exit(bad ? 1 : 0);
}
