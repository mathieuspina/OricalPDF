// Réglages mémorisés (dossier userData, via main.js) : lus une fois au démarrage, écrits à chaque changement.
import { api } from './ui.js';

const values = {
  keepTool: true, snap: true, panMiddle: true, print: null, printPrinters: {}, pinSidebar: false, pinProps: false, propsAuto: false, propsWidth: null,
  userName: '', stampDate: false, stampUser: false, stampTilt: false, sigDate: false,
  favorites: [], // favoris du ruban (identifiants de commandes, voir favorites.js)
  saveMode: 'ask', // annotations à l'enregistrement : ask | editable | flat (editable-ui.js)
  // 1.5.0 (clés absentes des anciens settings.json = valeurs ci-dessous)
  numberingBg: false, // numérotation : fond blanc des nouvelles règles (dernier choix)
  sidebarOpen: false, // panneau latéral ouvert au démarrage (dernier état)
  sidebarTab: null, // onglet du panneau latéral (identifiant sbtab-*, dernier affiché)
  annotAngle: 0, // angle (degrés, sens anti-horaire, par rapport à l'affichage) des nouveaux textes, notes et légendes
};

export async function loadSettings() {
  const s = await api.getSettings();
  for (const k of Object.keys(values)) if (s[k] !== undefined) values[k] = s[k];
  return values;
}
export const get = (k) => values[k];
export function set(k, v) { values[k] = v; api.setSettings({ [k]: v }); }
