import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { approvalRoutes, approvalSteps, evidenceRecords, notificationLog, notificationRules, projects } from "@/db/schema";
import { rejectDocument } from "@/domain/approvals";
import { listAllEvidenceRecords } from "@/domain/evidence-records";
import { createExpenseFromLines } from "@/domain/expenses";
import { CONDITION_KINDS, type ConditionKind } from "@/domain/notify/condition-kinds";
import { orphanEvidenceKind } from "@/domain/notify/kinds/orphan-evidence";
import { quoteNudgeKind } from "@/domain/notify/kinds/quote-nudge";
import { rejectedIdleKind } from "@/domain/notify/kinds/rejected-idle";
import { settleNudgeKind } from "@/domain/notify/kinds/settle-nudge";
import { runTick } from "@/domain/notify/tick";
import { createProject } from "@/domain/projects";
import { submitSettlement } from "@/domain/settlements";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { insertVendor } from "@/repositories/vendors";
import { teamIdByName } from "../approvals-fixtures";
import { createIntakeViewer, insertLinkFixture, insertRecordFixture, setRecordVisibilityFixture } from "../fixtures/evidence";
import { setupExpenseProject, submitReadyDraft, testVendorAccount, type ExpenseFixture } from "../fixtures/expenses";
import { setupSettlementProject } from "../fixtures/settlements";

// 07-14 Task 3: 꺼 둔 재촉 셋(N13) · 임자 없는 증빙(N21 · D-721) · 등록부 순서(SC-07) · 구매 처리 결과 부재(D-718).

function at(date: string): () => Date {
  return () => new Date(`${date}T09:00:00+09:00`);
}

async function tick(kinds: readonly ConditionKind[], date: string) {
  await runTick({ conditionKinds: kinds, now: at(date), emailSender: null });
}

async function rowsOf(user: Viewer, kind: string) {
  const rows = await db.select().from(notificationLog).where(eq(notificationLog.recipientId, user.id)).orderBy(notificationLog.id);
  return rows.filter((row) => row.conditionKind === kind);
}

async function enable(kind: string, days?: number) {
  await db.insert(notificationRules).values({ kind, enabled: true, enabledAt: new Date("2026-09-01T00:00:00+09:00"), ...(days === undefined ? {} : { days }) });
}

describe("등록부 (SC-07 순서 · D-718 · D-744)", () => {
  it("07-10 여섯 뒤에 07-14 여섯이 SC-07 표 순서로 — 구매 처리 결과 종류 없음, 지급 별도 종류 없음", () => {
    const names = CONDITION_KINDS.map((kind) => kind.kind);
    expect(names).toEqual([
      "project-end-no-expense",
      "pay-week-alert",
      "approval-waiting",
      "paid-no-evidence",
      "prepaid-evidence",
      "proxy-registered",
      "expense-result",
      "pre-cutoff-unapproved",
      "settle-nudge",
      "rejected-idle",
      "quote-nudge",
      // 07-23 계좌 바뀜은 여기(견적 재촉과 임자 없는 증빙 사이)에 끼운다.
      "orphan-evidence",
    ]);
    // D-718: 구매 처리 결과 알림은 없다.
    expect(names.filter((name) => /purchase/i.test(name))).toEqual([]);
    expect(CONDITION_KINDS.map((kind) => kind.label)).not.toContain("구매 처리 결과");
    // D-744: 지급 · 취소는 결재 결과의 갈래.
    expect(names.filter((name) => /pay(ment)?-(done|cancel)|paid-result/i.test(name))).toEqual([]);
  });

  it("07-14 여섯은 모두 기본 끔 · 받는 사람 글자가 있다", () => {
    const added = CONDITION_KINDS.slice(6);
    for (const kind of added) {
      expect(kind.defaults.enabled).toBe(false);
      expect(kind.defaultRecipientLabel.length).toBeGreaterThan(0);
    }
    expect(Object.fromEntries(added.map((kind) => [kind.kind, kind.defaultRecipientLabel]))).toMatchObject({ "orphan-evidence": "증빙 담당" });
    expect(settleNudgeKind).toMatchObject({ label: "정산 상신 재촉", dateUnit: "calendar", defaults: { days: 14 }, daysRange: { min: 1, max: 60 }, ladder: true, defaultRecipientLabel: "담당 PM" });
    expect(rejectedIdleKind).toMatchObject({ label: "반려 방치 재촉", dateUnit: "calendar", defaults: { days: 7 }, daysRange: { min: 1, max: 30 }, ladder: true, defaultRecipientLabel: "기안자" });
    expect(quoteNudgeKind).toMatchObject({ label: "견적 재촉", dateUnit: "calendar", defaults: { days: 7 }, daysRange: { min: 1, max: 30 }, ladder: true, defaultRecipientLabel: "담당 PM" });
    expect(orphanEvidenceKind).toMatchObject({ label: "임자 없는 증빙", dateUnit: "calendar", defaults: { days: 7 }, daysRange: { min: 1, max: 60 } });
    expect(orphanEvidenceKind.ladder).toBeFalsy();
  });

  it("07 종류 파일은 04.3-10의 즉시 행 넣기(insertEventNotifications)를 부르지 않는다(D-716)", () => {
    for (const file of readdirSync("domain/notify/kinds")) {
      expect(readFileSync(`domain/notify/kinds/${file}`, "utf8")).not.toContain("insertEventNotifications");
    }
  });
});

// ── 정산 상신 재촉 ── 종료일 09-30 → 정산 가능 10-01 → 14일 = 10-15(목) · 3영업일 뒤 10-20(화).
describe("정산 상신 재촉 (N13)", () => {
  async function settlingSince(endDate: string) {
    const fx = await setupSettlementProject();
    await db.update(projects).set({ endDate }).where(eq(projects.id, fx.projectId));
    return fx;
  }

  it("규칙 없으면(끔) 0", async () => {
    const fx = await settlingSince("2026-09-30");
    await tick([settleNudgeKind], "2026-10-15");
    expect(await rowsOf(fx.pm, "settle-nudge")).toHaveLength(0);
  });

  it("켬 — 정산 가능 14일 뒤 담당 PM 1회차, 3영업일 뒤 2회차(본인 + 팀장 · 최고 회차 한 행)", async () => {
    const fx = await settlingSince("2026-09-30");
    await enable("settle-nudge");
    await tick([settleNudgeKind], "2026-10-14");
    expect(await rowsOf(fx.pm, "settle-nudge")).toHaveLength(0);
    await tick([settleNudgeKind], "2026-10-15");
    const first = await rowsOf(fx.pm, "settle-nudge");
    expect(first.map((row) => [row.round, row.message, row.entity, row.entityId])).toEqual([[1, "정산 상신 대기 · 가을 팝업 · 14일", "project", fx.projectId]]);
    expect(first[0]?.referenceDate).toBe("2026-10-15");
    await tick([settleNudgeKind], "2026-10-20");
    expect((await rowsOf(fx.pm, "settle-nudge")).map((row) => row.round)).toEqual([1, 2]);
    expect((await rowsOf(fx.lead, "settle-nudge")).map((row) => [row.round, row.message])).toEqual([[2, "정산 상신 대기 · 가을 팝업 · 14일 · 2회차"]]);
  });

  it("상신하면 다음 회차 없음", async () => {
    const fx = await settlingSince("2026-09-30");
    await enable("settle-nudge");
    await tick([settleNudgeKind], "2026-10-15");
    await submitSettlement(fx.pm, { projectId: fx.projectId });
    await tick([settleNudgeKind], "2026-10-20");
    expect((await rowsOf(fx.pm, "settle-nudge")).map((row) => row.round)).toEqual([1]);
  });
});

// ── 반려 방치 ── 반려 10-05 → 7일 = 10-12(월).
describe("반려 방치 재촉 (N13)", () => {
  async function rejected(fx: ExpenseFixture, line = fx.lines.withVendor) {
    const created = await createExpenseFromLines(fx.pm, { lineIds: [line] });
    const expenseId = created.created[0]?.expenseId;
    if (!expenseId) throw new Error("지출결의 없음");
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    await rejectDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version, reason: "견적 다시" });
    const [route] = await db.select({ id: approvalRoutes.id }).from(approvalRoutes).where(eq(approvalRoutes.instanceId, submitted.instanceId));
    if (!route) throw new Error("차수 없음");
    await db
      .update(approvalSteps)
      .set({ actedAt: new Date("2026-10-05T10:00:00+09:00") })
      .where(and(eq(approvalSteps.routeId, route.id), eq(approvalSteps.action, "rejected")));
    return expenseId;
  }

  it("규칙 없으면 0 · 켬 — 반려 7일 뒤 기안자 `반려 방치 · {문서 제목} · 7일` · 다시 제출하면 없음", async () => {
    const fx = await setupExpenseProject();
    const idle = await rejected(fx);
    await tick([rejectedIdleKind], "2026-10-12");
    expect(await rowsOf(fx.pm, "rejected-idle")).toHaveLength(0);

    await enable("rejected-idle");
    const again = await rejected(fx, fx.lines.split);
    await submitReadyDraft(fx.pm, again);
    await tick([rejectedIdleKind], "2026-10-12");
    const rows = await rowsOf(fx.pm, "rejected-idle");
    expect(rows.map((row) => row.message)).toEqual(["반려 방치 · 가을 팝업 · 무대 제작 · 7일"]);
    expect(rows[0]?.entityId.startsWith(`${idle}:`)).toBe(true);
    expect(rows[0]?.referenceDate).toBe("2026-10-12");
    expect(await rowsOf(fx.lead, "rejected-idle")).toHaveLength(0);
  });
});

// ── 견적 재촉 ── 행사 시작 10-19 → 7일 전 = 10-12(사용자 결정 2026-10-23 · 260907 db/schema/090_views.sql:302와 같은 기준).
describe("견적 재촉 (N13)", () => {
  async function project(pm: Viewer, name: string, startDate = "2026-10-19") {
    const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}`, ...testVendorAccount() });
    const created = await createProject(pm, { clientId: client.id, teamId: await teamIdByName("기획1팀"), pmUserId: pm.id, name, startDate, endDate: "2026-12-31" });
    await db.update(projects).set({ createdAt: new Date("2026-09-01T10:00:00+09:00") }).where(eq(projects.id, created.id));
    return created.id;
  }

  it("켬 — 견적 줄 0개로 행사 시작 7일 전이 된 프로젝트 → 담당 PM `견적 작성 대기 · {프로젝트} · 시작 7일 전` · 보관 · 미수주 · 완료 · 견적 있는 프로젝트 제외 · 끔이면 0", async () => {
    const fx = await setupExpenseProject();
    const empty = await project(fx.pm, "빈 견적");
    const archived = await project(fx.pm, "보관 견적");
    const lost = await project(fx.pm, "미수주 견적");
    const done = await project(fx.pm, "완료 견적");
    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, archived));
    await db.update(projects).set({ status: "lost" }).where(eq(projects.id, lost));
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, done));
    await db.update(projects).set({ startDate: "2026-10-19" }).where(eq(projects.id, fx.projectId));

    await tick([quoteNudgeKind], "2026-10-12");
    expect(await rowsOf(fx.pm, "quote-nudge")).toHaveLength(0);

    await enable("quote-nudge");
    await tick([quoteNudgeKind], "2026-10-12");
    const rows = await rowsOf(fx.pm, "quote-nudge");
    expect(rows.map((row) => [row.entityId, row.message])).toEqual([[empty, "견적 작성 대기 · 빈 견적 · 시작 7일 전"]]);
    expect(rows[0]?.referenceDate).toBe("2026-10-12");
  });

  it("만든 날이 아니라 행사 시작일로 센다 — 시작 8일 전 tick은 0행, 만든 지 오래돼도 시작이 멀면 0행", async () => {
    const fx = await setupExpenseProject();
    await project(fx.pm, "다음 주 행사");
    await project(fx.pm, "먼 행사", "2026-11-30");
    await enable("quote-nudge");

    await tick([quoteNudgeKind], "2026-10-08");
    expect(await rowsOf(fx.pm, "quote-nudge")).toHaveLength(0);
    await tick([quoteNudgeKind], "2026-10-12");
    expect((await rowsOf(fx.pm, "quote-nudge")).map((row) => row.message)).toEqual(["견적 작성 대기 · 다음 주 행사 · 시작 7일 전"]);
  });

  // 리뷰 F1: 늦게 등록된 프로젝트는 첫 기한(시작 - 7일)이 이미 지났다 — 260907(server/src/notices.ts:2393-2397)처럼 실제 거리로 적고 첫 알림은 1회차 담당 PM만.
  it("행사가 내일인 프로젝트 — 첫 알림은 1회차 담당 PM만 `시작 1일 전` · 2회차는 첫 알림부터 3영업일 뒤 본인 + 팀장", async () => {
    const fx = await setupExpenseProject();
    const late = await project(fx.pm, "내일 행사", "2026-10-13");
    await enable("quote-nudge");

    await tick([quoteNudgeKind], "2026-10-12");
    const first = await rowsOf(fx.pm, "quote-nudge");
    expect(first.map((row) => [row.entityId, row.round, row.message])).toEqual([[late, 1, "견적 작성 대기 · 내일 행사 · 시작 1일 전"]]);
    expect(await rowsOf(fx.lead, "quote-nudge")).toHaveLength(0);

    await tick([quoteNudgeKind], "2026-10-14");
    expect((await rowsOf(fx.pm, "quote-nudge")).map((row) => row.round)).toEqual([1]);
    await tick([quoteNudgeKind], "2026-10-15");
    expect((await rowsOf(fx.pm, "quote-nudge")).map((row) => [row.round, row.message])).toEqual([
      [1, "견적 작성 대기 · 내일 행사 · 시작 1일 전"],
      [2, "견적 작성 대기 · 내일 행사 · 시작한 지 2일 · 2회차"],
    ]);
    expect((await rowsOf(fx.lead, "quote-nudge")).map((row) => [row.round, row.message])).toEqual([[2, "견적 작성 대기 · 내일 행사 · 시작한 지 2일 · 2회차"]]);
  });

  it("오늘 시작 · 이미 시작한 프로젝트 — 첫 알림은 1회차 담당 PM만 `오늘 시작` · `시작한 지 N일`", async () => {
    const fx = await setupExpenseProject();
    await project(fx.pm, "오늘 행사", "2026-10-12");
    await project(fx.pm, "지난 행사", "2026-10-02");
    await enable("quote-nudge");

    await tick([quoteNudgeKind], "2026-10-12");
    expect((await rowsOf(fx.pm, "quote-nudge")).map((row) => [row.round, row.message]).sort()).toEqual([
      [1, "견적 작성 대기 · 오늘 행사 · 오늘 시작"],
      [1, "견적 작성 대기 · 지난 행사 · 시작한 지 10일"],
    ]);
    expect(await rowsOf(fx.lead, "quote-nudge")).toHaveLength(0);
  });
});

// ── 임자 없는 증빙 ── 등록 7일 넘은 「공개 · 붙임 0」.
describe("임자 없는 증빙 (N21 · D-721 · AQ-25)", () => {
  async function record(by: Viewer, teamId: string, createdAt: string, opts: { publish?: boolean; attach?: boolean } = {}) {
    const id = await insertRecordFixture(by);
    if (opts.publish !== false) await setRecordVisibilityFixture(id, { visibility: "team", teamId });
    if (opts.attach) await insertLinkFixture({ recordId: id, ownerId: randomUUID(), attachedBy: by.id });
    await db.update(evidenceRecords).set({ createdAt: new Date(createdAt) }).where(eq(evidenceRecords.id, id));
    return id;
  }

  it("켬 — 공개 · 붙임 0 · 등록 7일 넘은 3건 → 증빙 담당(evidence.intake 쓰기)에게 한 행 · 목록 「공개」 거르개와 같은 집합 · 끔이면 0", async () => {
    const intake = await createIntakeViewer();
    const other = await setupExpenseProject();
    const teamId = await teamIdByName("기획1팀");
    const old = [
      await record(intake, teamId, "2026-10-01T10:00:00+09:00"),
      await record(intake, teamId, "2026-10-02T10:00:00+09:00"),
      await record(intake, teamId, "2026-10-05T10:00:00+09:00"),
    ];
    const recent = await record(intake, teamId, "2026-10-08T10:00:00+09:00");
    await record(intake, teamId, "2026-10-01T10:00:00+09:00", { publish: false });
    await record(intake, teamId, "2026-10-01T10:00:00+09:00", { attach: true });

    await tick([orphanEvidenceKind], "2026-10-12");
    expect(await rowsOf(intake, "orphan-evidence")).toHaveLength(0);

    await enable("orphan-evidence");
    await tick([orphanEvidenceKind], "2026-10-12");
    await tick([orphanEvidenceKind], "2026-10-12");
    const rows = await rowsOf(intake, "orphan-evidence");
    expect(rows.map((row) => [row.entity, row.entityId, row.message])).toEqual([["evidence-orphans", "2026-10-12", "임자 없는 증빙 · 등록 7일 · 3건"]]);
    expect(await rowsOf(other.pm, "orphan-evidence")).toHaveLength(0);

    // 같은 판정 — 06.1 목록 「공개」 거르개의 결과 중 등록 7일 넘은 것이 위 세 건이다.
    const listed = await listAllEvidenceRecords(intake, { state: "published" });
    const ids = listed.rows.map((row) => row.id);
    expect(ids).toContain(recent);
    expect(ids.filter((id) => id !== recent).sort()).toEqual([...old].sort());
  });
});
