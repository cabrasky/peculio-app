import type { RecordKind } from '../../adminApi';

// Color por entidad (mismo orden siempre); valores validados en claro/oscuro en App.css (--chart-*)
export const KIND_COLOR: Record<RecordKind, string> = {
  expenses: 'var(--chart-expenses)',
  incomes: 'var(--chart-incomes)',
  goals: 'var(--chart-goals)',
  subscriptions: 'var(--chart-subs)',
  projects: 'var(--chart-projects)',
};

export const KIND_LABEL: Record<RecordKind, string> = {
  expenses: 'admin.kExpenses',
  incomes: 'admin.kIncomes',
  goals: 'admin.kGoals',
  subscriptions: 'admin.kSubs',
  projects: 'admin.kProjects',
};
