import type { Viewer } from "@/domain/viewer";

export type ExpenseListStatus = "open" | "approved" | "all";

export type ExpenseListRow = {
  id: string;
  number: string | null;
  title: string;
  unlinkedText: string | null;
  vendorName: string | null;
  drafterName: string;
  statusWord: string;
  statusDate: string | null;
  scheduledPaymentDate: string | null;
};

export type ExpenseListGroup = { label: string; tone?: "warning"; rows: Partial<ExpenseListRow>[] };

export type ExpenseList = {
  groups: ExpenseListGroup[];
  total: { count: number; sumKrw: number } | null;
  drafterColumn: boolean;
  amountColumn: boolean;
  hasAny: boolean;
  page: { page: number; pageCount: number; total: number };
};

export function listExpenses(viewer: Viewer, input: { status: ExpenseListStatus; page?: string | number }, deps?: { today?: string; pageSize?: number }): Promise<ExpenseList> {
  void viewer;
  void input;
  void deps;
  return Promise.resolve({ groups: [], total: null, drafterColumn: false, amountColumn: false, hasAny: false, page: { page: 1, pageCount: 0, total: 0 } });
}
