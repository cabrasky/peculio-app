import { normText, refKeyOf } from './i18n';

// Color estable por categoría (propósito) para chips y etiquetas. Las clases
// cat-c0…cat-c7 están en App.css con variante de modo oscuro. Se asocia a la
// clave i18n de la categoría, así "Comida", "Food" y "comida" comparten color.
const FIXED: Record<string, number> = {
  'ref.categories.ai': 0,
  'ref.categories.drink': 1,
  'ref.categories.subscriptions': 2, 'ref.categories.savings': 2, 'ref.categories.pharmacy': 2,
  'ref.categories.leisure': 3,
  'ref.categories.food': 4, 'ref.categories.sport': 4,
  'ref.categories.charity': 5, 'ref.categories.products': 5,
  'ref.categories.stay': 6,
  'ref.categories.transport': 7,
};

function catIndex(name: string): number {
  const key = refKeyOf('categories', name);
  if (key && key in FIXED) return FIXED[key];
  let h = 0;
  for (const ch of key || normText(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 8;
}

export function catColor(name: string): string {
  return `cat-c${catIndex(name)}`;
}

// Color del punto de la categoría (mismo que --cat-dot en claro) para gráficos
const DOTS = ['#6E7CF2', '#2F9C8F', '#B45C9A', '#FF5A36', '#7FA836', '#D94F7C', '#D9A13B', '#5B87B8'];
export function catDot(name: string): string {
  return DOTS[catIndex(name)];
}
