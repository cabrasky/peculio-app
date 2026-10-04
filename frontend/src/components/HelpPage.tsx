/* ── Cómo se usa ─────────────────────────────────────────────────────────── */
import { useLocale } from '../i18n';
import RichText from './RichText';

const B = { border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 22px', background: 'var(--surface)', marginBottom: 16 };
const H = { margin: '0 0 10px', fontSize: 16, fontWeight: 800 } as const;
const LI = { lineHeight: 1.75, fontSize: 13.5, color: 'var(--text)' } as const;

// Cada sección: clave del título + claves de sus puntos (textos en src/locales)
const SECTIONS: { title: string; items: string[] }[] = [
  { title: 'help.startTitle', items: ['help.start1', 'help.start2', 'help.start3', 'help.start4'] },
  { title: 'help.moneyTitle', items: ['help.money1', 'help.money2', 'help.money3'] },
  { title: 'help.statsTitle', items: ['help.stats1', 'help.stats2'] },
  { title: 'help.excelTitle', items: ['help.excel1', 'help.excel2'] },
  { title: 'help.privacyTitle', items: ['help.privacy1', 'help.privacy2'] },
];

export default function HelpPage() {
  const { t } = useLocale();
  return (
    <div style={{ maxWidth: 720 }}>
      {SECTIONS.map(sec => (
        <section key={sec.title} style={B}>
          <h2 style={H}>{t(sec.title)}</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {sec.items.map(k => <li key={k} style={LI}><RichText text={t(k)} /></li>)}
          </ul>
        </section>
      ))}
      <section style={B}>
        <h2 style={H}>{t('support.title')}</h2>
        <p style={{ margin: 0 }}><RichText text={t('support.helpLink')} /></p>
      </section>
    </div>
  );
}
