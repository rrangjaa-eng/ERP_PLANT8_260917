import { describe, expect, it } from "vitest";
import { gate } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { buildExpenseSubmitContext, nextActionTarget, type ExpenseSubmitFacts } from "@/domain/expenses/gate";

// 05-06 Task 2(UI-SPEC S6 · Copywriting 「막힘 — 제출」) — 규칙 `expense.submit`은 ①~⑨를 순서대로 보고 첫 막힘 하나만 돌려준다.
// 다음 한 수 대상(`nextActionTarget`)은 같은 순서 표를 읽는다. ① · ⑤ 글자는 기존 규칙(quote.customer-approval · quote.vendor-required) 결과다.

const PASSING: ExpenseSubmitFacts = {
  customerApproval: { status: "in_progress", revisionSeq: 2, revisionApproved: true, gateEnabled: true, actorIsAssignedPm: true, pmName: "박서연" },
  projectCompleted: false,
  line: { inCurrentRevision: true, closedBy: null },
  vendorId: "vendor-1",
  teamCost: null,
  supplyAmountKrw: 12_400_000,
  evidenceType: "tax_invoice",
  paymentMethod: "bank_transfer",
  evidenceCount: 1,
  taxUnavailable: false,
};

const UNAPPROVED = { ...PASSING.customerApproval!, revisionApproved: false };

const BLOCKS = {
  1: { customerApproval: UNAPPROVED },
  2: { projectCompleted: true },
  3: { line: { inCurrentRevision: false, closedBy: null } },
  4: { line: { inCurrentRevision: true, closedBy: { id: "expense-4", number: "26001-0004" } } },
  5: { vendorId: null },
  6: { evidenceType: null },
  7: { supplyAmountKrw: 0 },
  8: { evidenceCount: 0 },
  9: { taxUnavailable: true },
} satisfies Record<number, Partial<ExpenseSubmitFacts>>;

function facts(...overrides: Partial<ExpenseSubmitFacts>[]): ExpenseSubmitFacts {
  return Object.assign({}, PASSING, ...overrides) as ExpenseSubmitFacts;
}

async function reasonOf(input: ExpenseSubmitFacts): Promise<string | null> {
  const decision = await gate(null, "expense.submit", buildExpenseSubmitContext(input));
  return decision.allowed ? null : decision.reason;
}

const REASONS = {
  1: "2차 고객 승인 전 · 고객 승인 표시",
  2: "완료 프로젝트 · 새 지출결의 없음",
  3: "견적 줄이 현재 차수에 없음 · 견적 줄 바꾸기",
  4: "이 줄에 지출결의 26001-0004 있음 · 지출결의 열기",
  5: "거래처 없음 · 거래처 고르기",
  6: "증빙 종류 비어 있음 · 증빙 종류 고르기",
  7: "공급가액이 0 · 0보다 크게",
  8: "증빙 없음 · 증빙 올리기 Ctrl+U",
  9: "세금 계산 불가 · 세율은 경영관리",
} as const;

describe("expense.submit — 첫 이유 하나 · 순서 고정", () => {
  it("막힘이 없으면 통과다", async () => {
    expect(await reasonOf(PASSING)).toBeNull();
  });

  it.each(Object.entries(REASONS))("%s번 하나만 켜면 그 글자다", async (step, reason) => {
    expect(await reasonOf(facts(BLOCKS[Number(step) as keyof typeof BLOCKS]))).toBe(reason);
  });

  it.each([
    [[1, 8], 1],
    [[3, 5, 7], 3],
    [[6, 7], 6],
    [[7, 8], 7],
    [[8, 9], 8],
  ] as const)("%j를 함께 켜면 첫 이유는 %s번이다", async (steps, first) => {
    const input = facts(...steps.map((step) => BLOCKS[step]));
    expect(await reasonOf(input)).toBe(REASONS[first]);
  });

  it("③과 ⑤를 함께 켜도 ③ — 막힘 칸 ⑥ · ⑦도 줄 막힘 뒤다", async () => {
    expect(await reasonOf(facts(BLOCKS[3], BLOCKS[5], { supplyAmountKrw: null, evidenceType: null }))).toBe(REASONS[3]);
  });
});

describe("① 고객 승인 — quote.customer-approval 결과 그대로", () => {
  it("보는 사람이 담당 PM이 아니면 담당 PM 이름", async () => {
    const input = facts({ customerApproval: { ...UNAPPROVED, actorIsAssignedPm: false } });
    expect(await reasonOf(input)).toBe("2차 고객 승인 전 · 담당 PM 박서연");
    const rule = await gate(null, "quote.customer-approval", { ...UNAPPROVED, actorIsAssignedPm: false });
    expect(rule).toEqual({ allowed: false, reason: await reasonOf(input) });
  });

  it.each([
    ["설정 끔", { ...UNAPPROVED, gateEnabled: false }],
    ["수주중", { ...UNAPPROVED, status: "bidding" }],
    ["미수주", { ...UNAPPROVED, status: "lost" }],
  ])("%s → ① 없음", async (_name, customerApproval) => {
    expect(await reasonOf(facts({ customerApproval }))).toBeNull();
  });
});

describe("⑥ 빈 칸 묶음", () => {
  it("공급가액 · 증빙 종류 둘 다 비면 「, 」로 잇고 칸 수와 첫 칸의 다음 한 수", async () => {
    expect(await reasonOf(facts({ supplyAmountKrw: null, evidenceType: null }))).toBe("공급가액, 증빙 종류 2칸 비어 있음 · 공급가액 적기");
  });

  it("증빙 종류만 비면 한 칸", async () => {
    expect(await reasonOf(facts({ evidenceType: null }))).toBe("증빙 종류 비어 있음 · 증빙 종류 고르기");
  });

  it("팀 비용 문서는 종류 · 내용이 묶음에 들고 ①~④를 보지 않는다", async () => {
    const team = facts({
      customerApproval: null,
      line: null,
      teamCost: { kind: null, content: null },
      supplyAmountKrw: null,
    });
    expect(await reasonOf(team)).toBe("종류, 내용, 공급가액 3칸 비어 있음 · 종류 고르기");
    expect(await nextActionTarget(team)).toBe("teamExpenseKind");
    expect(await reasonOf(facts(team, { teamCost: { kind: "team_overhead", content: null } }))).toBe("내용, 공급가액 2칸 비어 있음 · 내용 적기");
  });
});

describe("nextActionTarget — 이유와 같은 순서", () => {
  it.each([
    [1, "customerApproval"],
    [2, null],
    [3, "quoteLine"],
    [4, "openLatest"],
    [5, "vendor"],
    [6, "evidenceType"],
    [7, "supplyAmount"],
    [8, "evidence"],
    [9, null],
  ] as const)("%s번 → %s", async (step, target) => {
    expect(await nextActionTarget(facts(BLOCKS[step]))).toBe(target);
  });

  it("빈 칸이 여럿이면 첫 빈 칸", async () => {
    expect(await nextActionTarget(facts({ supplyAmountKrw: null, paymentMethod: null }))).toBe("supplyAmount");
  });

  it("여러 막힘이면 첫 이유의 대상(①+⑧ → customerApproval)", async () => {
    expect(await nextActionTarget(facts(BLOCKS[1], BLOCKS[8]))).toBe("customerApproval");
  });

  it("통과면 대상 없음", async () => {
    expect(await nextActionTarget(PASSING)).toBeNull();
  });
});
