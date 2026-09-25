import type { Currency } from "@/domain/money";

export type PreEstimateFieldError = { field: "amount" | "fxRate"; reason: string };

export function validatePreEstimateChange(input: {
  currency: Currency;
  amount: number;
  fxRate: number | null;
}): PreEstimateFieldError[] {
  void input;
  return [];
}
