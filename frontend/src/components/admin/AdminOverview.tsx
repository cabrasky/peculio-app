/* ── Admin · Resumen: uso de la app con los datos que ya existen ────────────
   Altas (users.created_at), último acceso (users.last_login) y registros
   creados por día (created_at de cada tabla). La cuenta demo no cuenta. */
import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { adminStats, RECORD_KINDS, type AdminStats, type RecordKind } from '../../adminApi';
import { useLocale, localizeError, fill, LOCALE_TAG } from '../../i18n';
import { IconLifeBuoy } from '../Icons';
import { KIND_COLOR, KIND_LABEL } from './labels';

const RANGES = [30, 90, 365];

const BUCKET_LABEL = {
  today: 'admin.llToday', week: 'admin.llWeek', month: 'admin.llMonth', quarter: 'admin.llQuarter', older: 'admin.llOlder',
} as const;

type Row = { key: string; label: string; signups: number; users: number } & Record<RecordKind, number>;

/** Por días hasta 90; por semanas (lunes) a partir de ahí, para que las barras no sean hilos */
function bucketize(series: AdminStats['series'], weekly: boolean, tag: string): Row[] {
  const out: Row[] = [];
  const fmt = (d: Date) => d.toLocaleDateString(tag, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  for (const p of series) {
    const d = new Date(`${p.day}T00:00:00Z`);
    if (weekly) d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const key = d.toISOString().slice(0, 10);
    let row = out[out.length - 1];
    if (!row || row.key !== key) {
      row = { key, label: fmt(d), signups: 0, users: 0, expenses: 0, incomes: 0, goals: 0, subscriptions: 0, projects: 0 };
      out.push(row);
    }
    row.signups += p.signups;
    row.users = p.users;
    for (const k of RECORD_KINDS) row[k] += p[k];
  }
  return out;
}

const AXIS = { fontSize: 11, fill: 'var(--text-muted)' };

export default function AdminOverview({ onOpenSupport }: { onOpenSupport: () => void }) {
  const { t, locale } = useLocale();
  const [days, setDays] = useState(90);
  const [data, setData] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setError('');
    adminStats(days)
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setError(localizeError(e, t)); });
    return () => { alive = false; };
  }, [days, t]);

  const weekly = days > 90;
  const rows = useMemo(() => (data ? bucketize(data.series, weekly, LOCALE_TAG[locale]) : []), [data, weekly, locale]);

  if (error) return <p className="msg-line error">{error}</p>;
  if (!data) return <div className="loading">{t('common.loading')}</div>;

  const k = data.kpis;
  const records = RECORD_KINDS.reduce((s, x) => s + k.records[x], 0);
  const signupsInRange = data.series.reduce((s, p) => s + p.signups, 0);
  const createdInRange = rows.reduce((s, r) => s + RECORD_KINDS.reduce((a, x) => a + r[x], 0), 0);
  const lastLogin = data.last_login.map(b => ({ name: t(BUCKET_LABEL[b.bucket]), users: b.users }));
  const facts: [string, number][] = [
    ['admin.fGoogle', k.google], ['admin.fMobile', k.mobile], ['admin.fDevelopers', k.developers],
    ['admin.fApiKeys', k.api_keys_30d], ['admin.fPhotos', k.photos], ['admin.fSuspended', k.suspended], ['admin.fAdmins', k.admins],
  ];

  return (
    <div className="adm-stack">
      <div className="adm-toolbar">
        <p className="hint" style={{ margin: 0 }}>{t('admin.overviewHint')}</p>
        <div className="adm-seg" role="group" aria-label={t('admin.range')}>
          {RANGES.map(r => (
            <button key={r} type="button" className={days === r ? 'active' : undefined} aria-pressed={days === r} onClick={() => setDays(r)}>
              {fill(t('admin.rangeDays'), { n: r })}
            </button>
          ))}
        </div>
      </div>

      <div className="xg-tiles adm-kpis">
        <div className="xg-tile">
          <span className="xg-tile-label">{t('admin.kUsers')}</span>
          <span className="xg-tile-value num">{k.users}</span>
          <span className="xg-tile-sub">{fill(t('admin.kUsersSub'), { n: k.new_30d })}</span>
        </div>
        <div className="xg-tile">
          <span className="xg-tile-label">{t('admin.kActive')}</span>
          <span className="xg-tile-value num">{k.active_7d}</span>
          <span className="xg-tile-sub">{fill(t('admin.kActiveSub'), { d: k.active_1d, m: k.active_30d })}</span>
        </div>
        <div className="xg-tile">
          <span className="xg-tile-label">{t('admin.kRecords')}</span>
          <span className="xg-tile-value num">{records.toLocaleString(LOCALE_TAG[locale])}</span>
          <span className="xg-tile-sub">{fill(t('admin.kRecordsSub'), { n: k.records.expenses.toLocaleString(LOCALE_TAG[locale]) })}</span>
        </div>
        <button type="button" className={`xg-tile clickable${k.tickets_open ? ' warn' : ''}`} onClick={onOpenSupport}>
          <span className="xg-tile-label">{t('admin.kTickets')}</span>
          <span className="xg-tile-value num">{k.tickets_open}</span>
          <span className="xg-tile-sub"><IconLifeBuoy size={13} /> {fill(t('admin.kTicketsSub'), { n: k.tickets_answered })}</span>
        </button>
      </div>

      <div className="adm-facts">
        {facts.map(([label, n]) => (
          <div key={label} className="adm-fact"><b className="num">{n}</b><span>{t(label)}</span></div>
        ))}
      </div>

      <div className="adm-charts">
        <section className="card adm-chart">
          <div className="adm-chart-head">
            <h3>{t('admin.cUsers')}</h3>
            <span className="hint">{fill(t('admin.cUsersSub'), { n: signupsInRange })}</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip cursor={{ stroke: 'var(--border-strong)' }} content={({ active, payload, label }) => active && payload?.length ? (
                <div className="adm-tip">
                  <div className="adm-tip-title">{label}</div>
                  <div className="adm-tip-row"><span>{t('admin.kUsers')}</span><b>{payload[0].payload.users}</b></div>
                  <div className="adm-tip-row"><span>{t('admin.signups')}</span><b>{payload[0].payload.signups}</b></div>
                </div>
              ) : null} />
              <Area type="monotone" dataKey="users" stroke="var(--primary)" strokeWidth={2} fill="var(--primary)" fillOpacity={0.12}
                activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </section>

        <section className="card adm-chart">
          <div className="adm-chart-head">
            <h3>{t('admin.cLastLogin')}</h3>
            <span className="hint">{t('admin.cLastLoginSub')}</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={lastLogin} margin={{ top: 20, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'var(--row-hover)' }} content={({ active, payload, label }) => active && payload?.length ? (
                <div className="adm-tip">
                  <div className="adm-tip-title">{label}</div>
                  <div className="adm-tip-row"><span>{t('admin.kUsers')}</span><b>{payload[0].payload.users}</b></div>
                </div>
              ) : null} />
              <Bar dataKey="users" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={48}>
                <LabelList dataKey="users" position="top" style={{ fontSize: 12, fontWeight: 700, fill: 'var(--text)' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
        <section className="card adm-chart wide">
          <div className="adm-chart-head">
            <h3>{t('admin.cRecords')}</h3>
            <span className="hint">{fill(t(weekly ? 'admin.cRecordsSubWeek' : 'admin.cRecordsSubDay'), { n: createdInRange.toLocaleString(LOCALE_TAG[locale]) })}</span>
          </div>
          <div className="adm-legend">
            {RECORD_KINDS.map(x => <span key={x}><i style={{ background: KIND_COLOR[x] }} />{t(KIND_LABEL[x])}</span>)}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="18%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'var(--row-hover)' }} content={({ active, payload, label }) => active && payload?.length ? (
                <div className="adm-tip">
                  <div className="adm-tip-title">{label}</div>
                  {RECORD_KINDS.slice().reverse().map(x => (
                    <div key={x} className="adm-tip-row"><span><i style={{ background: KIND_COLOR[x] }} />{t(KIND_LABEL[x])}</span><b>{payload[0].payload[x]}</b></div>
                  ))}
                  <div className="adm-tip-row total"><span>{t('common.total')}</span><b>{RECORD_KINDS.reduce((s, x) => s + payload[0].payload[x], 0)}</b></div>
                </div>
              ) : null} />
              {RECORD_KINDS.map((x, i) => (
                <Bar key={x} dataKey={x} stackId="r" fill={KIND_COLOR[x]} stroke="var(--surface)" strokeWidth={1}
                  maxBarSize={22} radius={i === RECORD_KINDS.length - 1 ? [4, 4, 0, 0] : 0} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </section>

      </div>

      <details className="card adm-table-details">
        <summary>{t('admin.viewTable')}</summary>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t(weekly ? 'admin.week' : 'admin.day')}</th>
                <th className="num">{t('admin.signups')}</th>
                <th className="num">{t('admin.kUsers')}</th>
                {RECORD_KINDS.map(x => <th key={x} className="num">{t(KIND_LABEL[x])}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.slice().reverse().map(r => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td className="num">{r.signups}</td>
                  <td className="num">{r.users}</td>
                  {RECORD_KINDS.map(x => <td key={x} className="num">{r[x]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
