import type { Viewer } from "@/domain/viewer";
import type { RecordActionEntry, RecordActionDeps } from "@/domain/action-log/record";
import type { DbOrTx } from "@/repositories/document-counters";

export type SettledProject = { id: string; endDate: string; lastChangeAt: Date | null };

export type AutoSettlementDeps = {
  now: () => Date;
  transaction: <T>(fn: (tx: DbOrTx) => Promise<T>) => Promise<T>;
  settle: (
    viewer: Viewer,
    input: { todayKst: string; projectIds?: string[]; from: string; to: string },
    tx: DbOrTx,
  ) => Promise<SettledProject[]>;
  recordAction: (viewer: Viewer, entry: RecordActionEntry, deps?: Partial<RecordActionDeps>) => Promise<void>;
  logger: { info: (event: string, fields?: Record<string, unknown>) => void; error: (event: string, fields?: Record<string, unknown>) => void };
};

export function effectiveOnFor(input: { endDate: string; lastChangeOn: string | null }): string {
  void input;
  return "";
}

export async function applyAutoSettlement(
  opts: { projectIds?: string[] },
  deps?: Partial<AutoSettlementDeps>,
): Promise<string[]> {
  void opts;
  void deps;
  return [];
}
