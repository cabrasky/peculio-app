import type { InvestmentMovement } from './api';

/** Transfer totals are independent of consumption, wages, and bank balances. */
export function investmentTotals(rows: Pick<InvestmentMovement, 'kind' | 'amount' | 'fee' | 'cost_basis'>[]) {
  const total = { contributed: 0, withdrawn: 0, netSales: 0, realizedGain: 0, unpricedSales: 0 };
  for (const row of rows) {
    if (row.kind === 'contribution') total.contributed += row.amount;
    if (row.kind === 'withdrawal') total.withdrawn += row.amount;
    if (row.kind === 'sale') {
      const net = row.amount - row.fee;
      total.netSales += net;
      if (row.cost_basis === null) total.unpricedSales++;
      else total.realizedGain += net - row.cost_basis;
    }
  }
  return total;
}
