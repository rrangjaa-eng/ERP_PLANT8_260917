import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 05-11(plan-checker Round 4 I3 · C2): 정산 결재는 숫자(measure)가 없는 첫 종류다. 결재함 숫자 열 머리글(measureHeader)이 null이면 열을 통째로
// 뺀다 — 빈 머리글 `th`(axe empty-table-header)도 숫자 칸 `td`도 없다. 금액 종류와 섞이면 머리글 `금액`이 서고 정산 결재 칸은 `—`다(05-01 Task 4 ③ⓐ).
// 04.1 `approvals-inbox-structure-only.test.ts`와 같은 목 모양 — `listMyInbox`만 사례마다 바꾼다.
const inbox = vi.hoisted((): { current: unknown } => ({ current: null }));

vi.mock("@/lib/viewer", () => ({ requireSession: () => Promise.resolve({ viewer: { id: "viewer" } }) }));
vi.mock("@/app/(app)/document-kinds", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
vi.mock("next-safe-action/hooks", () => ({ useAction: () => ({ execute: () => undefined, isExecuting: false, result: {} }) }));
vi.mock("@/app/(app)/approvals/actions", () => ({ approveAction: () => undefined, rejectAction: () => undefined, withdrawAction: () => undefined }));
vi.mock("@/app/(app)/leave/actions", () => ({ withdrawLeaveAction: () => undefined }));
vi.mock("@/app/(app)/expenses/actions", () => ({ createEvidenceViewUrlAction: () => undefined }));
vi.mock("@/domain/approvals", () => ({
  REJECT_REASON_EMPTY_MESSAGE: "사유 없음 · 사유 적기",
  REJECT_REASON_TOO_LONG_MESSAGE: "사유 500자 넘음 · 줄여 적기",
  REJECT_REASON_MAX: 500,
  listMyInbox: () => Promise.resolve(inbox.current),
}));

const { default: ApprovalsPage } = await import("@/app/(app)/approvals/page");

const SETTLEMENT_ITEM = {
  instanceId: "inst-settlement",
  kind: "settlement",
  kindLabel: "정산 결재",
  documentId: "11111111-1111-4111-8111-111111111111",
  href: "/projects/11111111-1111-4111-8111-111111111111/settlement",
  status: "submitted",
  version: 1,
  actions: ["approve", "reject"],
  summary: { documentText: "가을 팝업", measure: null },
};

const EXPENSE_ITEM = {
  instanceId: "inst-expense",
  kind: "expense",
  kindLabel: "지출결의",
  documentId: "22222222-2222-4222-8222-222222222222",
  href: "/expenses/22222222-2222-4222-8222-222222222222",
  status: "submitted",
  version: 1,
  actions: ["approve", "reject"],
  summary: { documentText: "가을 팝업 · 무대 제작", measure: { kind: "money", money: { currency: "KRW", amount: 12_400_000, fxRate: 1, amountKrw: 12_400_000 } } },
};

async function render(value: unknown): Promise<string> {
  inbox.current = value;
  return renderToStaticMarkup(await ApprovalsPage());
}

const headers = (html: string) => [...html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((match) => (match[1] ?? "").replace(/<[^>]*>/g, "").trim());
const rowOf = (html: string, text: string) => [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)].map((match) => match[0]).find((row) => row.includes(text)) ?? "";

describe("결재함 숫자 열 — 숫자 없는 종류(정산 결재)", () => {
  it("정산 결재만 있으면(measureHeader: null) 숫자 열이 통째로 없다 — `th`가 금액 결재함보다 하나 적고 빈 `th` 0 · 그 행에 `—` 칸 없음", async () => {
    const without = await render({ mine: [SETTLEMENT_ITEM], processed: [], measureHeader: null });
    const withAmount = await render({ mine: [SETTLEMENT_ITEM, EXPENSE_ITEM], processed: [], measureHeader: "금액" });

    expect(headers(without).length).toBeGreaterThan(0);
    expect(headers(without)).toHaveLength(headers(withAmount).length - 1);
    expect(headers(without).filter((text) => text === "")).toEqual([]);
    expect(headers(without)).not.toContain("금액");
    const row = rowOf(without, "가을 팝업");
    expect(row).not.toBe("");
    expect(row).not.toContain("—");
  });

  it("금액 종류와 섞이면(measureHeader: \"금액\") 머리글 `금액`이 있고 정산 결재 행의 숫자 칸은 `—`다", async () => {
    const html = await render({ mine: [SETTLEMENT_ITEM, EXPENSE_ITEM], processed: [], measureHeader: "금액" });

    expect(headers(html)).toContain("금액");
    expect(headers(html).filter((text) => text === "")).toEqual([]);
    expect(rowOf(html, "정산 결재 · 가을 팝업")).toContain("—");
    expect(rowOf(html, "무대 제작")).toContain("12,400,000");
  });
});
