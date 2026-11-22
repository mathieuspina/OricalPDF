// Dossier des données de l'utilisateur (réglages, récents, bibliothèque, échelles de mesure, état de la fenêtre). Pur (UMD).
// Depuis 1.3.0, le produit s'appelle « Orical PDF », mais le dossier garde son nom HISTORIQUE « %APPDATA%\Spin A Doc » : une mise à jour
// depuis 1.2.1 ou une version portable retrouve tout, quel que soit productName (Electron dériverait sinon le dossier du nom de l'application).
// main.js l'impose par app.setPath('userData', …) AVANT « ready ». SPINADOC_USER_DATA (tests automatisés) remplace ce dossier.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UserData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const LEGACY_DIR = 'Spin A Doc'; // NE JAMAIS CHANGER : nom du dossier de données des versions 0.x à 1.2.1

  // env : variables d'environnement ; appData : app.getPath('appData') ; join : path.join
  function resolve(env, appData, join) {
    const forced = env && env.SPINADOC_USER_DATA;
    return forced ? forced : join(appData, LEGACY_DIR);
  }

  return { LEGACY_DIR, resolve };
});
