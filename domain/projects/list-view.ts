import type { ProjectStatus } from "@/domain/projects/status-transitions";

export type ListRange = { start?: string; end?: string; kind: "year" | "period"; year?: number };
export type ProfitBasis = "quote" | "issued";

export function resolveListRange(input: { year: number | "all"; period?: { from?: string; to?: string } }): ListRange | null {
  void input;
  return null;
}

export function attributionLabel(input: { endDate: string | null; range: ListRange | null }): string | null {
  void input;
  return null;
}

export function exclusionText(input: {
  kind: "year" | "period";
  byYear?: Record<number, number>;
  outside?: number;
  undetermined?: number;
}): string | null {
  void input;
  return null;
}

export function totalsTitle(input: { statusLabel?: string; range: ListRange | null; count: number }): string {
  void input;
  return "";
}

export function profitBasisFor(status: ProjectStatus | string, issuedCount: number): ProfitBasis {
  void status;
  void issuedCount;
  return "quote";
}
