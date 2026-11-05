import type { ExpenseDocumentDto } from "@/domain/expenses/dto";

// 07.4-01 eng 재검토 R1 · 디자인 검토 F10 · B3: 지출결의서 명세 표의 세금 행 · 합계 행. 셈이 없다 — 값은 getExpense가 싣는 taxResult(상세 화면 taxLine과
// 같은 result)이고 이 함수는 낱말 · 부호 · 어느 줄에 놓을지만 정한다. 낱말은 상세 화면 계산 한 줄(domain/expenses/tax.ts taxLineText)과 같다.
// 합계 행 라벨은 「합계」가 아니다 — 원천징수 · 회사 대납 문서의 지급액은 위 줄들의 합이 아니다.
type TaxResult = ExpenseDocumentDto["taxResult"];

export type ExpenseTaxRows =
  | {
      kind: "rows";
      tax: { name: "부가세" | "원천징수"; rate: number | null; exempt: boolean; amountKrw: number } | null;
      payable: { label: "지급 총액" | "실지급액"; amountKrw: number; borne: { rate: number | null; exempt: boolean; amountKrw: number } | null };
    }
  | { kind: "unavailable"; text: "계산 불가 · 세율 없음" };

export function expenseTaxRows(taxResult: TaxResult | undefined): ExpenseTaxRows | null {
  if (!taxResult) return null;
  if ("unavailable" in taxResult) return { kind: "unavailable", text: "계산 불가 · 세율 없음" };
  switch (taxResult.ruleKind) {
    case "vat_surcharge":
      return {
        kind: "rows",
        tax: { name: "부가세", rate: taxResult.rate, exempt: false, amountKrw: taxResult.vatKrw },
        payable: { label: "지급 총액", amountKrw: taxResult.payableKrw, borne: null },
      };
    case "withholding":
      // 표시 금액은 음수(SYSTEM.md §2-4 하이픈 마이너스) — 공급가 − 원천징수 = 실지급액이 종이 열에서 그대로 읽힌다.
      return {
        kind: "rows",
        tax: { name: "원천징수", rate: taxResult.rate, exempt: taxResult.withholdingKrw === 0, amountKrw: taxResult.withholdingKrw === 0 ? 0 : -taxResult.withholdingKrw },
        payable: { label: "실지급액", amountKrw: taxResult.payableKrw, borne: null },
      };
    case "company_borne":
      // 회사 대납 세금은 지급액에 들지 않아 본문 행에 두면 열 합이 어긋난다 — 합계 행 아래 보조줄로 간다.
      return {
        kind: "rows",
        tax: null,
        payable: {
          label: "지급 총액",
          amountKrw: taxResult.payableKrw,
          borne: { rate: taxResult.rate, exempt: taxResult.companyBorneKrw === 0, amountKrw: taxResult.companyBorneKrw },
        },
      };
    default:
      return { kind: "rows", tax: null, payable: { label: "지급 총액", amountKrw: taxResult.payableKrw, borne: null } };
  }
}
