// Favoris du ruban : liste ORDONNÉE d'identifiants de commandes (data-cmd du ruban), affichée dans l'onglet Accueil, groupe « Favoris ».
// Pur (ni DOM ni Electron). Mémorisée dans les réglages (settings.json, clé `favorites`) : uniquement des identifiants de commandes, jamais de
// chemin ni de donnée personnelle. `known` (facultatif) = identifiants épinglables présents dans le ruban : un identifiant inconnu (commande
// supprimée dans une version future, fichier modifié à la main) est ignoré à la lecture.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Favorites = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX = 12;
  const ID = /^[a-z0-9][a-z0-9-]{0,63}$/; // forme des data-cmd du ruban

  const isKnown = (id, known) => !known || (known instanceof Set ? known.has(id) : known.includes(id));

  // Liste propre : chaînes de forme valide, connues, sans doublon (première occurrence gardée), au plus MAX.
  function normalize(list, known) {
    const out = [];
    if (!Array.isArray(list)) return out;
    for (const id of list) {
      if (typeof id !== 'string' || !ID.test(id) || !isKnown(id, known) || out.includes(id)) continue;
      out.push(id);
      if (out.length >= MAX) break;
    }
    return out;
  }

  // Lecture : valeur du réglage (tableau) ou texte JSON (tableau, ou objet de réglages avec la clé favorites) ; corrompu → liste vide.
  function parse(value, known) {
    let v = value;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return []; } }
    if (v && !Array.isArray(v) && typeof v === 'object') v = v.favorites;
    return normalize(v, known);
  }
  const serialize = (list) => JSON.stringify(normalize(list));

  const has = (list, id) => normalize(list).includes(id);

  // Ajout en fin de liste. Renvoie { list, ok, reason } : reason = 'doublon' | 'plein' | 'inconnu' (liste inchangée).
  function add(list, id, known) {
    const l = normalize(list, known);
    if (typeof id !== 'string' || !ID.test(id) || !isKnown(id, known)) return { list: l, ok: false, reason: 'inconnu' };
    if (l.includes(id)) return { list: l, ok: false, reason: 'doublon' };
    if (l.length >= MAX) return { list: l, ok: false, reason: 'plein' };
    return { list: l.concat(id), ok: true, reason: null };
  }

  const remove = (list, id) => normalize(list).filter((x) => x !== id);

  // Déplacement d'un cran (delta = −1 à gauche, +1 à droite) ; borné aux extrémités (liste inchangée).
  function move(list, id, delta) {
    const l = normalize(list);
    const i = l.indexOf(id), j = i + (delta < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= l.length) return l;
    [l[i], l[j]] = [l[j], l[i]];
    return l;
  }
  const canMove = (list, id, delta) => { const l = normalize(list), i = l.indexOf(id), j = i + (delta < 0 ? -1 : 1); return i >= 0 && j >= 0 && j < l.length; };

  return { MAX, normalize, parse, serialize, has, add, remove, move, canMove };
});
