import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptsCsv, reviewReceipts, normalizeMerchant, importPlan } from '../src/importReview.ts';

const current = [{ id: 'existing', date: '2026-11-25', desc: 'Steam Store', amount: 41.77 }];

test('parsea CSV con comillas, importe decimal y referencia', () => {
  const rows = parseReceiptsCsv('fecha,comercio,importe,referencia\n2026-11-25,"Steam, Store","41,77",PAY-123\n');
  assert.deepEqual(rows, [{ date: '2026-11-25', merchant: 'Steam, Store', amount: 41.77, reference: 'PAY-123' }]);
});

test('rechaza fechas e importes inválidos y filas incompletas sin efectos', () => {
  assert.throws(() => parseReceiptsCsv('fecha,comercio,importe\n2026-02-30,Steam,41.77'), /fecha/i);
  assert.throws(() => parseReceiptsCsv('fecha,comercio,importe\n2026-11-25,Steam,abc'), /importe/i);
  assert.throws(() => parseReceiptsCsv('fecha,comercio,importe\n2026-11-25,,41.77'), /comercio/i);
});

test('marca un gasto existente aunque varíe el nombre del comercio', () => {
  assert.equal(normalizeMerchant('STEAM* STORE'), normalizeMerchant('Steam Store'));
  const [row] = reviewReceipts([{ date: '2026-11-25', merchant: 'STEAM* STORE', amount: 41.77, reference: '' }], current);
  assert.deepEqual(row.existingIds, ['existing']);
});

test('dos recibos con igual referencia e importe proponen una operación', () => {
  const rows = reviewReceipts([
    { date: '2026-11-25', merchant: 'Steam', amount: 41.77, reference: 'PAY-123' },
    { date: '2026-11-25', merchant: 'PayPal', amount: 41.77, reference: 'pay-123' },
  ], []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].receipts.length, 2);
  assert.equal(rows[0].merchant, 'Steam');
});

test('mismo importe sin referencia no fusiona automáticamente compras distintas', () => {
  const rows = reviewReceipts([
    { date: '2026-11-25', merchant: 'Steam', amount: 41.77, reference: '' },
    { date: '2026-11-25', merchant: 'PayPal', amount: 41.77, reference: '' },
  ], []);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.possibleDuplicate));
});

test('reimportar detecta el movimiento ya guardado antes de crear otro', () => {
  const rows = reviewReceipts([{ date: '2026-11-25', merchant: 'Steam', amount: 41.77, reference: '' }], current);
  assert.equal(rows[0].existingIds.length, 1);
});

test('plan no crea nada sin confirmación y excluye coincidencias existentes', () => {
  const rows = reviewReceipts([
    { date: '2026-11-25', merchant: 'Steam Store', amount: 41.77, reference: '' },
    { date: '2026-11-26', merchant: 'Panadería', amount: 6.50, reference: '' },
  ], current);
  assert.deepEqual(importPlan(rows, new Set()), []);
  assert.deepEqual(importPlan(rows, new Set([0, 1])), [{ date: '2026-11-26', desc: 'Panadería', amount: 6.50, motivo: 'Importado de CSV' }]);
});
