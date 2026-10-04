import { LOCALE_TAG, loadLocale } from './i18n';

// Formato común de importes (mismo criterio que la app móvil: "1.042,12 €").
// Se fuerza la agrupación de miles: es-ES no agrupa por defecto los números de 4 cifras.
export const eurFmt = (tag: string, digits = 2) => (n: number) =>
  `${n.toLocaleString(tag, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: 'always' } as Intl.NumberFormatOptions)} €`;

// Importe con el idioma activo (el proveedor de idioma lo guarda antes de volver a pintar)
export const eur = (n: number, digits = 2) => eurFmt(LOCALE_TAG[loadLocale()], digits)(n);

export const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
