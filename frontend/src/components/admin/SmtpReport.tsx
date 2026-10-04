/* ── Resultado de probar el SMTP: pasos hechos y, si falla, por qué y qué hacer ── */
import type { SmtpTestResult } from '../../api';
import { useLocale, fill } from '../../i18n';
import { IconCheckCircle, IconXCircle } from '../Icons';

export default function SmtpReport({ result }: { result: SmtpTestResult }) {
  const { t } = useLocale();
  const [host, port = ''] = result.server.split(/:(?=\d*$)/);
  const vars = { server: result.server, host, port, user: result.user, from: result.from_email, to: result.sent_to || '' };
  const { error } = result;

  const label = (step: SmtpTestResult['steps'][number]['step']) =>
    fill(t(step === 'connect' && result.mode === 'tls' ? 'admin.smtpStep.connectTls' : `admin.smtpStep.${step}`), vars);

  const title = error
    ? fill(t(`admin.smtpErr.${error.code}`, t('admin.smtpErr.unknown')), vars)
    : fill(t(result.sent_to ? 'admin.smtpSentOk' : 'admin.smtpOk'), vars);

  return (
    <div className={`smtp-report ${result.ok ? 'ok' : 'err'}`} role="status">
      <p className="smtp-report-title">
        {result.ok ? <IconCheckCircle size={16} /> : <IconXCircle size={16} />}
        <span>{title}</span>
      </p>
      {result.steps.length > 0 && (
        <ol className="smtp-steps">
          {result.steps.map(s => (
            <li key={s.step} className={s.ok ? 'ok' : 'err'}>
              {s.ok ? <IconCheckCircle size={14} /> : <IconXCircle size={14} />}
              <span>{label(s.step)}</span>
              {s.ok && s.ms != null && <span className="hint">{s.ms} ms</span>}
            </li>
          ))}
        </ol>
      )}
      {error?.detail && (
        <p className="smtp-detail hint">{t('admin.smtpServerSaid')}: <code>{error.detail}</code></p>
      )}
    </div>
  );
}
