/* Fechas del backend: vienen en UTC sin zona ("2026-09-25T10:00:00") */
import { LOCALE_TAG } from '../../i18n';
import type { Locale } from '../../preferences';

export function parseUtc(s: string | null | undefined): Date | null {
  if (!s) return null;
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
}

export function fmtDate(s: string | null | undefined, locale: Locale): string {
  const d = parseUtc(s);
  return d ? d.toLocaleDateString(LOCALE_TAG[locale], { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

export function fmtDateTime(s: string | null | undefined, locale: Locale): string {
  const d = parseUtc(s);
  return d ? d.toLocaleString(LOCALE_TAG[locale], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
}

/** «hace 3 días», «hace 2 horas»… */
export function fmtAgo(s: string | null | undefined, locale: Locale): string {
  const d = parseUtc(s);
  if (!d) return '—';
  const rtf = new Intl.RelativeTimeFormat(LOCALE_TAG[locale], { numeric: 'auto' });
  const sec = (d.getTime() - Date.now()) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of steps) {
    if (Math.abs(sec) >= size) return rtf.format(Math.round(sec / size), unit);
  }
  return rtf.format(0, 'minute');
}

export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
