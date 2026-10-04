/* ── Texto traducido con **negrita** y [enlaces](/ruta | mailto:… | https://…) ── */
import { Fragment } from 'react';
import { Link } from 'react-router-dom';

const TOKEN = /\*\*(.+?)\*\*|\[(.+?)\]\(((?:\/|mailto:|https?:\/\/)[^)]*)\)/g;

export default function RichText({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<b>{m[1]}</b>);
    else if (m[3].startsWith('/')) out.push(<Link to={m[3]}>{m[2]}</Link>);
    else if (m[3].startsWith('mailto:')) out.push(<a href={m[3]}>{m[2]}</a>);
    else out.push(<a href={m[3]} target="_blank" rel="noopener noreferrer">{m[2]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out.map((n, i) => <Fragment key={i}>{n}</Fragment>)}</>;
}
