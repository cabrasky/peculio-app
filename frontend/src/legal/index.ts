/* ── Textos legales (privacidad, cookies, aviso legal, términos, baja) ──────
   Contenido estructurado por idioma. Los párrafos admiten el formato de
   RichText: **negrita** y [enlaces](/ruta | mailto:… | https://…).
   Un elemento que es un array se muestra como lista. */
import type { Locale } from '../preferences';
import es from './es';
import en from './en';
import pt from './pt';

export type LegalSlug = 'privacidad' | 'cookies' | 'aviso-legal' | 'terminos' | 'eliminar-cuenta';
export const LEGAL_SLUGS: LegalSlug[] = ['privacidad', 'cookies', 'aviso-legal', 'terminos', 'eliminar-cuenta'];

/** Fecha de la última revisión de los textos (cámbiala al editarlos) */
export const LEGAL_UPDATED = '2026-09-25';

export interface LegalSection { h: string; p: (string | string[])[] }
export interface LegalDoc { title: string; intro: string; sections: LegalSection[] }
export type LegalDocs = Record<LegalSlug, LegalDoc>;

const DOCS: Record<Locale, LegalDocs> = { es, en, pt };

export function legalDocs(locale: Locale): LegalDocs {
  return DOCS[locale] || es;
}

export function isLegalSlug(s: string | undefined): s is LegalSlug {
  return !!s && (LEGAL_SLUGS as string[]).includes(s);
}
