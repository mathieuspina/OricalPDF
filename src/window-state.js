// État de la fenêtre principale (taille, position, agrandie, plein écran), mémorisé à la fermeture et restauré au démarrage. Pur (UMD).
//  - capture(info) : ce qu'on enregistre (bornes NORMALES : une fenêtre agrandie ou en plein écran retrouve aussi sa taille de restauration).
//  - sanitize(raw) : état relu validé, ou null (absent, corrompu, valeurs absurdes).
//  - restore(raw, displays) : options de création { bounds: {width, height, x?, y?}, maximize, fullScreen }. La position n'est gardée que
//    si la barre de titre (48 px du haut) est assez visible dans la zone de travail d'un écran EXISTANT ; sinon la fenêtre est centrée par
//    Windows (pas de x / y) et sa taille est ramenée à la zone de travail de l'écran principal.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WindowState = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULT = { width: 1280, height: 860 };
  const MIN = { width: 900, height: 560 };
  const TITLE_H = 48;      // hauteur de la barre de titre de l'application
  const VISIBLE_W = 160;   // largeur minimale de barre de titre visible pour pouvoir saisir et déplacer la fenêtre
  const MAX_DIM = 100000;

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const rectOk = (r) => r && ['x', 'y', 'width', 'height'].every((k) => isNum(r[k])) && r.width > 0 && r.height > 0;

  function capture(info) {
    const b = info && (info.normalBounds || info.bounds);
    if (!rectOk(b)) return null;
    const minimized = !!info.isMinimized;
    return {
      x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height),
      // Fenêtre réduite dans la barre des tâches au moment de la fermeture : on garde l'état connu juste avant la réduction.
      maximized: !!(minimized ? info.wasMaximized : info.isMaximized),
      fullScreen: !!(minimized ? info.wasFullScreen : info.isFullScreen),
    };
  }

  function sanitize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (!isNum(raw.width) || !isNum(raw.height) || raw.width <= 0 || raw.height <= 0 || raw.width > MAX_DIM || raw.height > MAX_DIM) return null;
    const out = { width: Math.round(raw.width), height: Math.round(raw.height), maximized: raw.maximized === true, fullScreen: raw.fullScreen === true };
    if (isNum(raw.x) && isNum(raw.y) && Math.abs(raw.x) < MAX_DIM && Math.abs(raw.y) < MAX_DIM) { out.x = Math.round(raw.x); out.y = Math.round(raw.y); }
    return out;
  }

  const overlap = (a, b) => ({ w: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)), h: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)) });

  // Écran qui contient assez de la barre de titre de la fenêtre (null si aucun).
  function displayFor(rect, displays) {
    const bar = { x: rect.x, y: rect.y, width: rect.width, height: Math.min(TITLE_H, rect.height) };
    let best = null, bestArea = 0;
    for (const d of displays || []) {
      const wa = d && (d.workArea || d.bounds);
      if (!rectOk(wa)) continue;
      const o = overlap(bar, wa);
      if (o.w >= Math.min(VISIBLE_W, rect.width) && o.h >= Math.min(TITLE_H / 2, bar.height) && o.w * o.h > bestArea) { best = wa; bestArea = o.w * o.h; }
    }
    return best;
  }

  function fit(size, area) {
    const w = Math.max(MIN.width, Math.min(size.width, area ? area.width : size.width));
    const h = Math.max(MIN.height, Math.min(size.height, area ? area.height : size.height));
    return { width: w, height: h };
  }

  function restore(raw, displays) {
    const s = sanitize(raw);
    const valid = (displays || []).map((d) => d && (d.workArea || d.bounds)).filter(rectOk);
    const primary = valid[0] || null;
    if (!s) return { bounds: fit(DEFAULT, primary), maximize: false, fullScreen: false, reason: 'défaut' };
    const size = { width: s.width, height: s.height };
    if (isNum(s.x) && isNum(s.y)) {
      const area = displayFor({ x: s.x, y: s.y, width: s.width, height: s.height }, displays);
      if (area) {
        const b = fit(size, area);
        // Fenêtre plus grande que l'écran (résolution réduite depuis) : ramenée dans la zone de travail.
        const x = Math.min(Math.max(s.x, area.x - b.width + VISIBLE_W), area.x + area.width - VISIBLE_W);
        const y = Math.min(Math.max(s.y, area.y), area.y + area.height - TITLE_H);
        return { bounds: { x, y, width: b.width, height: b.height }, maximize: s.maximized, fullScreen: s.fullScreen, reason: 'position' };
      }
    }
    // Écran disparu (ou position absente) : taille gardée mais limitée à l'écran principal, fenêtre centrée par Windows.
    return { bounds: fit(size, primary), maximize: s.maximized, fullScreen: s.fullScreen, reason: 'écran absent' };
  }

  // État relu depuis le texte de settings.json (clé `window`) : null si le fichier est absent (texte null) ou illisible.
  function fromJsonText(text) {
    if (typeof text !== 'string') return null;
    try { const j = JSON.parse(text); return j && typeof j === 'object' ? j.window || null : null; } catch { return null; }
  }

  return { DEFAULT, MIN, TITLE_H, VISIBLE_W, capture, sanitize, restore, displayFor, fromJsonText };
});
