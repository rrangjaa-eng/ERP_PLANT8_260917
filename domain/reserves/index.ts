import type { Viewer } from "@/domain/viewer";
import type { Currency } from "@/domain/money";

export type ReserveDirection = "deposit" | "withdrawal";

export type ReserveWriteRow = {
  /** 새 줄은 화면이 만든 uuid(ENG-D10), 기존 줄은 저장된 id. */
  id: string;
  isNew?: true;
  version?: number;
  clientId: string;
  entryDate: string;
  direction: ReserveDirection;
  amount: { currency: Currency; amount: number; fxRate: number };
  fxRateTouched?: boolean;
  projectId?: string | null;
  evidenceType?: string | null;
  taxInvoiceNumber?: string | null;
  note?: string | null;
};

export type SaveReservesInput = { rows: ReserveWriteRow[]; archivedIds?: string[] };

export function saveReserves(viewer: Viewer, input: SaveReservesInput): Promise<void> {
  void viewer;
  void input;
  return Promise.reject(new Error("not implemented"));
}

export type ReserveListResult = {
  rows: { id: string; clientId: string; balanceKrw: number }[];
  clientBalances?: { clientId: string; balanceKrw: number }[];
};

export function listReserves(viewer: Viewer, opts: { page?: number | string }): Promise<ReserveListResult> {
  void viewer;
  void opts;
  return Promise.reject(new Error("not implemented"));
}
