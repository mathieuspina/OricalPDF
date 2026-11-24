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

  const METHOD = { auto: 'automatique', custom: 'taille personnalisée', driver: 'papier par défaut du pilote' };
  const APPLIED = { code: 'code de papier', custom: 'taille personnalisée', driver: 'papier par défaut du pilote' };
  const MAX_PAPERS = 40;
  // Papiers annoncés par l'imprimante : « nom l × h mm #code », 40 au plus.
  function papersText(papers) {
    const list = Array.isArray(papers) ? papers : [];
    const one = (p) => `${oneLine(p.name)} ${r1(Math.min(p.w, p.h))} × ${r1(Math.max(p.w, p.h))} mm${p.kind != null ? ' #' + p.kind : ''}`;
    const shown = list.slice(0, MAX_PAPERS).map(one).join(' ; ');
    return `papiers annoncés (${list.length}) : ${shown || 'aucun'}${list.length > MAX_PAPERS ? ` ; … (+${list.length - MAX_PAPERS})` : ''}`;
  }
  // Lecture des capacités : { status: 'ok' | 'expiré' | 'échec' | 'invalide' | 'test', ms }.
  function capsText(c) {
    if (!c) return 'capacités : non lues';
    const t = c.ms != null ? ` en ${c.ms < 1000 ? c.ms + ' ms' : r1(c.ms / 1000) + ' s'}` : '';
    if (c.status === 'ok') return 'capacités : lues' + t;
    if (c.status === 'expiré') return 'capacités : délai dépassé' + t + ' (aucun papier connu)';
    if (c.status === 'invalide') return "capacités : imprimante non reconnue par Windows" + t;
    if (c.status === 'test') return 'capacités : imprimante de test';
    return 'capacités : échec de la lecture' + t;
  }

  // e : { date, printer (déjà masquée), wMm, hMm, plan (PrintLayout.printOptions, options dont deviceName déjà masqué),
  //       sent (PrintLayout.sendArgs : { api, args (deviceName masqué), applied }), send (texte « Envoi : … »), caps ({ status, ms, papers }), result }
  function line(e) {
    const p = e.plan;
    const orient = (p.landscape ? 'paysage' : 'portrait') + (p.forced === 'auto' ? ' (automatique)' : ' (imposée)') + ', feuille ' + p.sheet;
    const fmt = p.format ? p.format : 'personnalisé';
    const ann = p.paper != null ? "annoncé par l'imprimante : « " + oneLine(p.paper) + ' »' : "non annoncé par l'imprimante";
    const sent = e.sent || { api: 'publique', args: p.options, applied: null };
    const meth = e.sent && p.method ? `méthode ${METHOD[p.method] || p.method}, appliquée : ${APPLIED[sent.applied] || sent.applied} (API ${sent.api})` : null;
    const caps = e.caps ? [capsText(e.caps), papersText(e.caps.papers)] : [];
    return [stamp(e.date || new Date()), oneLine(e.printer), `${r1(e.wMm)} × ${r1(e.hMm)} mm`, orient, `format ${fmt} (${ann})`]
      .concat(meth ? [meth] : [], e.send ? [oneLine(e.send)] : [], ['options ' + JSON.stringify(sent.args)], caps, ['résultat : ' + oneLine(e.result)]).join(' | ');
  }
  function append(prev, l, max) {
    const lines = String(prev || '').split(/\r?\n/).filter((x) => x.trim());
    lines.push(oneLine(l));
    return lines.slice(-(max || MAX)).join('\n') + '\n';
  }
  return { MAX, MAX_PAPERS, FILE, line, append, stamp, papersText, capsText };
});
