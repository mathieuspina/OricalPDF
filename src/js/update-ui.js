// Recherche de mise à jour : interface (bandeau #update-banner, rubrique « Mises à jour » des Réglages, ligne de l'À propos).
// Aucune requête ici : tout passe par le processus principal (update-main.js, IPC update:*). Les notes du fichier latest.json sont
// affichées en TEXTE (textContent), jamais en HTML ; « Télécharger » demande au processus principal d'ouvrir l'adresse qu'il a validée.
import { $, api } from './ui.js';

let shown = null; // version affichée dans le bandeau

const fmtDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const fmtTime = (t) => (t ? new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'jamais');

export function showBanner(info) {
  if (!info || !info.version) return;
  shown = info.version;
  $('update-title').textContent = `Orical PDF ${info.version} est disponible`;
  $('update-date').textContent = info.date ? `publiée le ${fmtDate(info.date)}` : '';
  const ul = $('update-notes');
  ul.replaceChildren(...(info.notes || []).map((n) => { const li = document.createElement('li'); li.textContent = n; return li; }));
  $('update-sha').textContent = info.sha256 || '';
  $('update-more').hidden = true;
  $('update-more-btn').setAttribute('aria-expanded', 'false');
  $('update-banner').hidden = false;
}
const hideBanner = () => { $('update-banner').hidden = true; };

async function refreshSettings() {
  const s = await api.updateState().catch(() => null);
  if (!s) return;
  $('opt-update').checked = !s.policy && s.auto;
  $('opt-update').disabled = s.policy;
  $('update-now').disabled = s.policy;
  $('opt-update-policy').hidden = !s.policy;
}

export async function aboutText() {
  const s = await api.updateState().catch(() => null);
  if (!s) return '';
  if (s.policy) return 'Recherche de mise à jour désactivée par votre administrateur.';
  return `Dernière recherche de mise à jour : ${fmtTime(s.lastCheck)}.`;
}

async function checkNow() {
  const out = $('update-result');
  $('update-now').disabled = true;
  out.textContent = 'Recherche…';
  let r = null;
  try { r = await api.updateCheck(); } catch { r = null; }
  $('update-now').disabled = false;
  if (!r || r.status === 'error') out.textContent = 'Impossible de joindre le serveur.';
  else if (r.status === 'disabled') { out.textContent = 'Désactivée par votre administrateur.'; refreshSettings(); }
  else if (r.status === 'latest') out.textContent = 'Vous avez la dernière version.';
  else if (r.status === 'available') { out.textContent = `Version ${r.info.version} disponible.`; showBanner(r.info); }
}

export function initUpdate() {
  $('opt-update').addEventListener('change', (e) => api.updateSet({ auto: e.target.checked }));
  $('update-now').addEventListener('click', checkNow);
  $('btn-settings') && $('btn-settings').addEventListener('click', () => { $('update-result').textContent = ''; refreshSettings(); });
  $('update-more-btn').addEventListener('click', () => {
    const open = $('update-more').hidden;
    $('update-more').hidden = !open;
    $('update-more-btn').setAttribute('aria-expanded', String(open));
  });
  $('update-download').addEventListener('click', () => { api.updateOpen(); });
  $('update-later').addEventListener('click', hideBanner); // jusqu'au prochain lancement
  $('update-ignore').addEventListener('click', () => { if (shown) api.updateSet({ ignored: shown }); hideBanner(); });
  api.onUpdateAvailable((info) => showBanner(info));
  refreshSettings();
  // recherche faite avant que l'interface soit prête : le résultat est redemandé
  api.updateState().then((s) => { if (s && s.available) showBanner(s.available); }).catch(() => {});
}
