/* ── Cuenta demo pública: solo lectura ────────────────────────────────────────
   El backend rechaza cualquier cambio hecho con la cuenta demo. Aquí se evita
   aplicarlo en local y se avisa: DemoBanner escucha el evento y muestra el aviso. */

export const DEMO_BLOCKED_EVENT = 'mb:demo-blocked';

let readOnly = false;

export function setDemoMode(on: boolean) { readOnly = on; }

/** true (y avisa) si la sesión es la demo: la acción no se debe aplicar. */
export function blockedInDemo(): boolean {
  if (!readOnly) return false;
  window.dispatchEvent(new Event(DEMO_BLOCKED_EVENT));
  return true;
}
