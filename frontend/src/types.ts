export function getMonth(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getMonth() + 1;
}

export interface Expense {
  id: string;
  date: string;
  desc: string;
  amount: number;
  proposito: string;
  metodo: string;
  motivo: string;
  tipo: string;
  ajeno: number;
  invitacion?: number;
  deudores?: string;
  personas?: string;
  ref_cc?: string;
  deudaMetodo: string;
  devuelto: 'yes' | 'no';
  meCorresponde: number;
  viaje: string;
  proyectoId: string;
  hasPhoto?: boolean;
  createdAt: string;
}

/** Coste que corresponde al usuario para balances y presupuestos. */
export function expenseCost(e: Expense): number {
  const shared = !!e.ajeno || !!e.invitacion || !!e.deudores?.trim() || !!e.personas?.trim();
  return shared && Number.isFinite(e.meCorresponde) ? e.meCorresponde : e.amount;
}

export interface Project {
  id: string;
  name: string;
  budget?: number; // presupuesto; sin él (o 0) el proyecto no tiene
  createdAt: string;
}

export interface Income {
  id: string;
  date: string;
  desc: string;
  amount: number;
  category: string;
  notes: string;
  createdAt: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  category: string;
  notes: string;
  createdAt: string;
}

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  billingCycle: 'monthly' | 'yearly' | 'weekly' | 'quarterly';
  nextBilling: string;
  category: string;
  metodo: string;
  active: boolean;
  autoCharge?: boolean; // se apunta sola como gasto al llegar nextBilling (lo hace el servidor)
  notes: string;
  createdAt: string;
}

export interface AppData {
  expenses: Expense[];
  incomes: Income[];
  goals: Goal[];
  subscriptions: Subscription[];
  projects: Project[];
}

export const PROPOSITOS = ['Ocio', 'Comida', 'Bebida', 'Transporte', 'Estancia', 'Ahorro/Inversion', 'Productos', 'Deporte/Ejercicio', 'Farmacia'];
export const MOTIVOS = ['Salir', 'Planes en casa', 'Viajes', 'Trabajo', 'Estudios', 'Evento', 'Caprichos', 'Mi cumple', 'Regalos'];
export const TIPOS = ['Recurrente', 'Viajes', 'Puntual'];
export const METODOS = ['Tarjeta', 'Bizum', 'Split App', 'Efectivo', 'Deposito', 'Online', 'Transferencia'];
export const REFUND_METHODS = ['Bizum', 'Efectivo', 'Tricount', 'Transferencia', 'Otro'];

export const REF = {
  // Modelo de la plantilla "Gastos": Propósito = categoría real (Datos!M2:M10),
  // Motivo = evento social (Datos!P2:P10), Tipo = patrón (Datos!G2:G4).
  propositos: PROPOSITOS,
  categorias: PROPOSITOS,
  motivos: MOTIVOS,
  tipos: TIPOS,
  metodos: METODOS,
  refundMethods: REFUND_METHODS,
  meses: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  billingCycles: ['weekly', 'monthly', 'quarterly', 'yearly'] as const,
  incomeCategories: ['Salario', 'Freelance', 'Inversion', 'Regalo', 'Venta', 'Devolucion', 'Otro'],
  goalCategories: ['Viaje', 'Compra', 'Emergencia', 'Inversion', 'Educacion', 'Salud', 'Otro'],
};

/** ¿Es ahorro/inversión? (en la plantilla, el bucket Inversion sale del Propósito) */
export function isAhorro(e: Expense): boolean {
  return e.proposito === 'Ahorro/Inversion';
}

/** Bucket estilo plantilla: Fijo/Puntual/Viajes/Inversion derivados de Tipo + Propósito. */
export type ExpenseBucket = 'fijo' | 'puntual' | 'viajes' | 'inversion';

export function bucketOf(e: Expense): ExpenseBucket | null {
  if (isAhorro(e)) return 'inversion';
  if (e.tipo === 'Recurrente') return 'fijo';
  if (e.tipo === 'Puntual') return 'puntual';
  if (e.tipo === 'Viajes') return 'viajes';
  return null;
}
