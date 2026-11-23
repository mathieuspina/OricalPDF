// Journal d'impression (1.3.1) : une ligne par tâche envoyée au pilote, pour comprendre un échec sur un poste réel (orientation, format, options).
// Fichier texte dans le dossier des données (userData/print-log.txt), au plus MAX lignes (les plus anciennes sont retirées). JAMAIS de nom de
// fichier, de chemin ni de contenu de document : imprimante masquée comme dans le diagnostic (serveur, nom d'utilisateur), titre jamais écrit.
// Pur (UMD) : utilisé par print-main.js (processus principal) et par les tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PrintLog = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAX = 200;
  const FILE = 'print-log.txt';
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  const r1 = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');
  const oneLine = (s) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim();

  // e : { date, printer (déjà masquée), wMm, hMm, plan (résultat de PrintLayout.printOptions, options dont deviceName déjà masqué), result }
  function line(e) {
    const p = e.plan;
    const orient = (p.landscape ? 'paysage' : 'portrait') + (p.forced === 'auto' ? ' (automatique)' : ' (imposée)') + ', feuille ' + p.sheet;
    const fmt = p.format ? p.format : 'personnalisé';
    const ann = p.paper != null ? 'annoncé par l\'imprimante : « ' + oneLine(p.paper) + ' »' : 'non annoncé par l\'imprimante';
    return [stamp(e.date || new Date()), oneLine(e.printer), `${r1(e.wMm)} × ${r1(e.hMm)} mm`, orient, `format ${fmt} (${ann})`,
      'options ' + JSON.stringify(p.options), 'résultat : ' + oneLine(e.result)].join(' | ');
  }
  function append(prev, l, max) {
    const lines = String(prev || '').split(/\r?\n/).filter((x) => x.trim());
    lines.push(oneLine(l));
    return lines.slice(-(max || MAX)).join('\n') + '\n';
  }
  return { MAX, FILE, line, append, stamp };
});
