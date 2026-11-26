import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { todayLocalISO, advanceBillingDate } from '../src/localDate.ts';

function inZone(zone, expression) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', `import { todayLocalISO, advanceBillingDate } from './src/localDate.ts'; console.log(${expression});`], { cwd: new URL('..', import.meta.url), env: { ...process.env, TZ: zone }, encoding: 'utf8' }).trim();
}

test('Madrid: después de medianoche local no propone ayer UTC', () => {
  assert.equal(inZone('Europe/Madrid', `todayLocalISO(new Date('2026-11-25T23:30:00Z'))`), '2026-11-26');
});
test('Los Ángeles: antes de medianoche local no propone mañana UTC', () => {
  assert.equal(inZone('America/Los_Angeles', `todayLocalISO(new Date('2026-11-26T02:30:00Z'))`), '2026-11-25');
});
test('ciclo mensual usa fecha local incluso en zona negativa y cruza el año', () => {
  assert.equal(inZone('America/Los_Angeles', `advanceBillingDate('2026-12-15', 'monthly')`), '2027-01-15');
});
test('año bisiesto no desplaza el cobro semanal', () => {
  assert.equal(advanceBillingDate('2028-02-28', 'weekly'), '2028-03-06');
});
test('formato local conserva el día de la fecha escogida', () => {
  assert.equal(todayLocalISO(new Date(2026, 10, 26, 12)), '2026-11-26');
});
