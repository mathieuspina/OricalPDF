// Fichier de recherche de mise à jour : écrit dist/latest.json (schéma 1, voir src/update-check.js) à partir de package.json (version), de la
// date du jour, de la page de téléchargement https://orical.app/orical-pdf/, de l'empreinte SHA-256 de dist/OricalPDF-Setup-<version>.exe et des
// 8 premières lignes de la section de la version dans CHANGELOG.md (lignes logiques : un point de liste avec ses lignes de suite).
// Le résultat est validé par le MÊME UpdateCheck.parse que l'application : échec (code 2) si invalide ou si l'installeur est absent.
// À transmettre à la personne qui publie le site APRÈS la Release ET la mise à jour de la page de téléchargement (voir RELEASING.md).
// Usage : npm run latest-json
const fs = require('fs');
const path = require('path');
const UpdateCheck = require('../src/update-check.js');
const { sha256 } = require('./checksums.js');
const { section } = require('./release-notes.js');

const PAGE = UpdateCheck.PAGE;
const MAX_NOTES = 8;

// Lignes logiques de la section : « - x » + lignes de suite indentées réunies ; lignes vides et titres « ### » écartés.
function noteLines(text, max = MAX_NOTES) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (!raw.trim() || /^#{1,6}\s/.test(raw)) continue;
    if (/^\s{2,}\S/.test(raw) && out.length) { out[out.length - 1] += ' ' + raw.trim(); continue; }
    out.push(raw.replace(/^\s*[-*]\s+/, '').trim());
  }
  return out.slice(0, max);
}

const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// { ok, json, info } ou { ok: false, reason }
function build({ changelog, version, sha, date }) {
  const sec = section(changelog, version);
  if (!sec) return { ok: false, reason: `CHANGELOG.md : aucune section « ## ${version} »` };
  const draft = { schema: 1, version, date, url: PAGE, sha256: sha, notes: noteLines(sec) };
  const p = UpdateCheck.parse(JSON.stringify(draft));
  if (!p.ok) return { ok: false, reason: 'fichier refusé par UpdateCheck.parse : ' + p.reason };
  const json = JSON.stringify(Object.assign({ schema: 1 }, p.info), null, 2) + '\n'; // forme normalisée (notes nettoyées, tronquées)
  const back = UpdateCheck.parse(json);
  if (!back.ok || back.info.version !== version || back.info.sha256 !== sha.toLowerCase()) return { ok: false, reason: 'relecture incohérente' };
  return { ok: true, json, info: back.info };
}

function main(root = path.join(__dirname, '..')) {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const setup = path.join(root, 'dist', `OricalPDF-Setup-${version}.exe`);
  if (!fs.existsSync(setup)) return { code: 2, message: `Installeur absent : dist/OricalPDF-Setup-${version}.exe (lancer « npm run dist » d'abord).` };
  const r = build({ changelog: fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version, sha: sha256(setup), date: today() });
  if (!r.ok) return { code: 2, message: r.reason };
  fs.writeFileSync(path.join(root, 'dist', 'latest.json'), r.json);
  return { code: 0, message: 'Écrit : dist/latest.json (version ' + version + ', ' + r.info.notes.length + ' ligne(s) de notes)', info: r.info };
}

if (require.main === module) {
  const r = main(process.argv[2] || path.join(__dirname, '..'));
  (r.code ? console.error : console.log)(r.message);
  process.exit(r.code);
}

module.exports = { build, main, noteLines, today, PAGE, MAX_NOTES };
