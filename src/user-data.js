// Dossier des données de l'utilisateur (réglages, récents, bibliothèque, échelles de mesure, état de la fenêtre). Pur (UMD).
// « %APPDATA%\Orical PDF », fixé ici (et non déduit par Electron du nom de l'application) : un changement de productName ou la version
// portable ne le déplacent pas. main.js l'impose par app.setPath('userData', …) AVANT « ready ». ORICALPDF_USER_DATA (tests automatisés)
// remplace ce dossier.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UserData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DIR = 'Orical PDF';

  // env : variables d'environnement ; appData : app.getPath('appData') ; join : path.join
  function resolve(env, appData, join) {
    const forced = env && env.ORICALPDF_USER_DATA;
    return forced ? forced : join(appData, DIR);
  }

  return { DIR, resolve };
});
