import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { expenseDateChangeRequests, expenses, notificationLog, notificationRules } from "@/db/schema";
import { approveDateChange, rejectDateChange, requestDateChange, undoDateChangeApproval, withdrawDateChange } from "@/domain/expenses/date-change";
import { isBusinessDay } from "@/domain/holidays/business-day";
import { loadHolidayLookup } from "@/domain/holidays/calendar";
import { CONDITION_KINDS, type ConditionKind } from "@/domain/notify/condition-kinds";
import { dateChangeRequestedKind } from "@/domain/notify/kinds/date-change-requested";
import { dateChangeResultKind } from "@/domain/notify/kinds/date-change-result";
import { runTick } from "@/domain/notify/tick";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { seoulToday } from "@/lib/dates";
import { setupExpenseProject, type ExpenseFixture } from "../fixtures/expenses";
import { approvedExpenseWithEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "../fixtures/payments";

// 07.2-18 Task 3(D-7296 · D-7301) — 희망 지급일 변경 요청 도착(경영관리) · 결과(기안자). 즉시 경로 없음 → 다음 영업일 tick 묶음.
// 두 종류 모두 기본 켬 · 이메일 켬(플래너 가정) — 규칙 행이 없어도 tick이 평가한다.

const KINDS: readonly ConditionKind[] = [dateChangeRequestedKind, dateChangeResultKind];

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

async function businessDayFrom(date: string): Promise<string> {
  const year = Number(date.slice(0, 4));
  const lookup = await loadHolidayLookup([year, year + 1]);
  let day = date;
  while (!isBusinessDay(day, lookup)) day = addDays(day, 1);
  return day;
}

// 사건은 실제 시각(오늘)에 생기므로 tick은 다음 영업일 9시 — 고정 되돌아보기 창(14일) 안이다.
async function tick(): Promise<void> {
  const day = await businessDayFrom(addDays(seoulToday(), 1));
  await runTick({ conditionKinds: KINDS, now: () => new Date(`${day}T09:00:00+09:00`), emailSender: null });
}

async function rowsOf(user: Viewer, kind: string) {
  const rows = await db.select().from(notificationLog).where(eq(notificationLog.recipientId, user.id)).orderBy(notificationLog.id);
  return rows.filter((row) => row.conditionKind === kind);
}

async function numberOf(expenseId: string): Promise<string> {
  const [row] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row?.number) throw new Error("문서 번호 없음");
  return row.number;
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

beforeEach(async () => {
  await setEvidenceRequired(false);
});

describe("등록부 (D-7296 · D-7301)", () => {
  it("두 종류는 등록부 끝 · 기본 켬 · 이메일 켬 · 받는 사람 글자 경영관리 / 기안자", () => {
    expect(CONDITION_KINDS.slice(-2)).toEqual([dateChangeRequestedKind, dateChangeResultKind]);
    expect(dateChangeRequestedKind).toMatchObject({
      kind: "date-change-requested",
      label: "희망 지급일 변경 요청",
      dateUnit: "calendar",
      defaults: { enabled: true, emailEnabled: true },
      defaultRecipientLabel: "경영관리",
    });
    expect(dateChangeResultKind).toMatchObject({
      kind: "date-change-result",
      label: "희망 지급일 변경 결과",
      dateUnit: "calendar",
      defaults: { enabled: true, emailEnabled: true },
      defaultRecipientLabel: "기안자",
    });
  });
});

describe("요청 도착 · 결과 알림 (tick)", () => {
  let fx: ExpenseFixture;
  let doc: ApprovedExpense;
  let payer: Viewer;
  let newDate: string;

  beforeEach(async () => {
    fx = await setupExpenseProject();
    doc = await approvedExpenseWithEvidence(fx);
    payer = await makePaymentManager();
    if (!payer.roleId) throw new Error("계급 없음");
    await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem: "expense.value", visible: true });
    newDate = await businessDayFrom(addDays(seoulToday(), 3));
  });

  it("요청 1건 → 경영관리에게 `희망 지급일 변경 요청 도착 · {번호}` 한 행(문서 링크 entity expense) · 같은 tick 다시 → 중복 0", async () => {
    const { requestId } = await requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate, reason: "행사 일정 연기" });
    await tick();
    const rows = await rowsOf(payer, "date-change-requested");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: "expense", entityId: `${doc.expenseId}:${requestId}`, message: `희망 지급일 변경 요청 도착 · ${await numberOf(doc.expenseId)}` });
    await tick();
    expect(await rowsOf(payer, "date-change-requested")).toHaveLength(1);
    // 요청자 본인(기안자)에게는 도착 알림이 없다.
    expect(await rowsOf(fx.pm, "date-change-requested")).toHaveLength(0);
  });

  it("철회된 요청 → 도착 알림 0", async () => {
    const { requestId } = await requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate, reason: "행사 일정 연기" });
    await withdrawDateChange(fx.pm, { requestId });
    await tick();
    expect(await rowsOf(payer, "date-change-requested")).toHaveLength(0);
  });

  it("승인 → 기안자 `변경 요청 승인됨 · MM-DD` 한 행 · 다시 tick → 중복 0", async () => {
    const { requestId } = await requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate, reason: "행사 일정 연기" });
    await approveDateChange(payer, { requestId, version: await versionOf(doc.expenseId) });
    await tick();
    const rows = await rowsOf(fx.pm, "date-change-result");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: "expense", message: `변경 요청 승인됨 · ${newDate.slice(5)}` });
    expect(rows[0]?.entityId.startsWith(`${doc.expenseId}:${requestId}`)).toBe(true);
    await tick();
    expect(await rowsOf(fx.pm, "date-change-result")).toHaveLength(1);
  });

  it("승인 뒤 되돌림(디자인 D-F4) → 결과 알림 0", async () => {
    const { requestId } = await requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate, reason: "행사 일정 연기" });
    const approved = await approveDateChange(payer, { requestId, version: await versionOf(doc.expenseId) });
    await undoDateChangeApproval(payer, { requestId, before: approved.before, version: approved.version });
    await tick();
    expect(await rowsOf(fx.pm, "date-change-result")).toHaveLength(0);
  });

  it("거절 → 기안자 `변경 요청 거절됨 · {메모}` 한 행", async () => {
    const { requestId } = await requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate, reason: "행사 일정 연기" });
    await rejectDateChange(payer, { requestId, memo: "이번 주 지급 확정" });
    await tick();
    const rows = await rowsOf(fx.pm, "date-change-result");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toBe("변경 요청 거절됨 · 이번 주 지급 확정");
  });

  it("받는 사람 계급이 expense.value를 못 보면 두 종류 모두 0 — 번호 · 새 희망일 · 메모가 알림 본문으로 새지 않는다 (Codex P2 · 문서 DTO와 같은 칸 보기)", async () => {
    if (!payer.roleId || !fx.pm.roleId) throw new Error("계급 없음");
    await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem: "expense.value", visible: false });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: fx.pm.roleId, infoItem: "expense.value", visible: false });
    const { requestId } = await requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate, reason: "행사 일정 연기" });
    await tick();
    expect(await rowsOf(payer, "date-change-requested")).toHaveLength(0);
    await rejectDateChange(payer, { requestId, memo: "이번 주 지급 확정" });
    await tick();
    expect(await rowsOf(fx.pm, "date-change-result")).toHaveLength(0);
  });

  it("규칙을 끄면 두 종류 모두 0", async () => {
    await db.insert(notificationRules).values([
      { kind: "date-change-requested", enabled: false },
      { kind: "date-change-result", enabled: false },
    ]);
    try {
      const { requestId } = await requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate, reason: "행사 일정 연기" });
      await tick();
      expect(await rowsOf(payer, "date-change-requested")).toHaveLength(0);
      await rejectDateChange(payer, { requestId, memo: "이번 주 지급 확정" });
      await tick();
      expect(await rowsOf(fx.pm, "date-change-result")).toHaveLength(0);
    } finally {
      await db.delete(notificationRules).where(eq(notificationRules.kind, "date-change-requested"));
      await db.delete(notificationRules).where(eq(notificationRules.kind, "date-change-result"));
    }
  });
});

describe("처리자 = 요청자 (본인 처리 제외)", () => {
  it("지급 처리 권한을 가진 기안자가 자기 요청을 처리하면 결과 알림 0", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithEvidence(fx);
    const payer = await makePaymentManager();
    const newDate = await businessDayFrom(addDays(seoulToday(), 3));
    const { requestId } = await requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate, reason: "행사 일정 연기" });
    // 처리 권한자 ≠ 기안자 사례는 위에서 본다 — 여기서는 요청 행의 요청자를 처리자로 바꿔 「같으면 0」 갈래만 본다.
    await db.update(expenseDateChangeRequests).set({ requestedBy: payer.id }).where(eq(expenseDateChangeRequests.id, requestId));
    await rejectDateChange(payer, { requestId, memo: "본인 처리" });
    await tick();
    expect(await rowsOf(payer, "date-change-result")).toHaveLength(0);
  });
});
