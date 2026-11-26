import { describe, expect, it } from 'vitest';
import { investmentTotals } from '../src/investmentTotals';

const sale = (amount: number, fee: number, cost_basis: number | null) => ({ kind: 'sale' as const, amount, fee, cost_basis });
describe('investment totals', () => {
  it('keeps contributions, withdrawals and sales distinct', () => {
    expect(investmentTotals([
      { kind: 'contribution', amount: 750, fee: 0, cost_basis: null },
      { kind: 'withdrawal', amount: 20, fee: 0, cost_basis: null },
      sale(300, 2, 280), sale(300, 2, 320), sale(749.04, 1, null),
    ])).toEqual({ contributed: 750, withdrawn: 20, netSales: 1344.04, realizedGain: -4, unpricedSales: 1 });
  });
  it('does not infer profit without the cost basis of each partial sale', () => {
    expect(investmentTotals([sale(500, 3, null), sale(250, 1, 200)]).realizedGain).toBe(49);
  });
});
