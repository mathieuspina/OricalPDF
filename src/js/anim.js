// Réglage des animations (Complètes / Réduites / Aucune) et animation de démarrage « Spin ».
import { $, api } from './ui.js';

let mode = 'full';

function apply() { document.body.dataset.anim = mode; }

export async function initAnim() {
  const s = await api.getSettings();
  mode = s.anim || (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full');
  apply();
}

export const getAnim = () => mode;

export function setAnim(m) {
  mode = m;
  apply();
  api.setSettings({ anim: m });
}

// Démarrage (~900 ms, non bloquant) : le halo rouge sort de derrière le disque sombre (glisse vers la droite et s'allume), puis le
// disque se pose (léger rebond).
export function startupSpin() {
  if (mode !== 'full') return;
  const mark = $('brand-mark');
  mark.querySelectorAll('.halo').forEach((g) => {
    g.animate(
      [{ transform: 'translate(-9px, 0) scale(.7)', opacity: 0 }, { transform: 'translate(0, 0) scale(1)', opacity: 1 }],
      { duration: 650, delay: 120, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards' }
    );
  });
  mark.querySelector('.top').animate(
    [{ transform: 'scale(.8)' }, { transform: 'scale(1.08)', offset: 0.5 }, { transform: 'scale(1)' }],
    { duration: 900, easing: 'ease-out' }
  );
}
