import { beforeEach, describe, expect, it } from "vitest";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID, TEAM_LEAD_ROLE_ID, createRole } from "@/domain/permissions/roles";
import { approveDocument } from "@/domain/approvals";
import { submitLeave } from "@/domain/leave";
import {
  addLeaveAdjustment,
  getLeaveBalanceForRequest,
  getLeaveBalanceForUser,
  getMyLeaveBalance,
  listLeaveAdjustmentsForUser,
  previewLeaveBalance,
} from "@/domain/leave/balance-service";
import {
  allocateLeave,
  balanceFiscalYears,
  buildLeaveGrants,
  formatBalanceLines,
  formatBalanceRow,
  requestBalanceOf,
  summarizeLeaveBalance,
} from "@/domain/leave/balance";
import {
  LEAVE_BALANCE_DTO_SPEC,
  LEAVE_REQUEST_BALANCE_DTO_SPEC,
  type LeaveBalanceDto,
  type LeaveRequestBalanceDto,
} from "@/domain/leave/dto";
import { LEAVE_ANNUAL_DAYS } from "@/domain/settings/keys";
import { ForbiddenError, ValidationError, archivePerson, setHireDate, setResignationDate } from "@/domain/people";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { insertHistorizedValue } from "@/repositories/settings";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import type { appendActionLog } from "@/repositories/action-log";
import { countRows, makePerson } from "./approvals-fixtures";

// 04.1-03: 잔고는 저장하지 않고 부여 목록 · 신청 · 조정에서 매번 계산한다(LEAV-01).

type Org = { drafter: Viewer; lead: Viewer; ceo: Viewer };

async function leaveOrg(): Promise<Org> {
  const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
  const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
  const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
  return { drafter, lead, ceo };
}

// 팀장 → (2·3단 빈 자리) → 대표 승인으로 최종 승인한다.
async function approveFully(org: Org, instanceId: string, now: Date): Promise<void> {
  await approveDocument(org.lead, { instanceId, expectedVersion: 1 }, { now });
  const done = await approveDocument(org.ceo, { instanceId, expectedVersion: 2 }, { now });
  expect(done.status).toBe("approved");
}

// 2026-09-24 12:00 서울.
const NOW_0924 = new Date("2026-09-24T03:00:00Z");

describe("트레이서 — 월차 적립 → 연차 최종 승인 → 월차부터 차감 → 잔고 조회", () => {
  let org: Org;
  beforeEach(async () => {
    org = await leaveOrg();
  });

  it("입사 2026-03-10 직원 — 월차 6일 적립, 2일 승인 뒤 월차 사용 2 · 남음 4, 연차 그대로 · 반복 조회와 재승인 시도에도 같다", async () => {
    await setHireDate(SYSTEM_VIEWER, org.drafter.id, "2026-03-10");

    const before = await getMyLeaveBalance(org.drafter, { fiscalYear: 2026 }, { now: NOW_0924 });
    expect(before.monthly).toEqual({
      status: "active",
      accruedQuarters: 24,
      usedQuarters: 0,
      pendingQuarters: 0,
      remainingQuarters: 24,
      expiresOn: "2027-12-31",
    });
    expect(before.annual?.grantQuarters).toBe(0);

    const submitted = await submitLeave(
      org.drafter,
      { kind: "full_day", startDate: "2026-09-28", endDate: "2026-09-29", half: "" },
      { now: NOW_0924 },
    );
    await approveFully(org, submitted.instanceId, NOW_0924);

    const after = await getMyLeaveBalance(org.drafter, {}, { now: NOW_0924 });
    expect(after.monthly).toMatchObject({ accruedQuarters: 24, usedQuarters: 8, pendingQuarters: 0, remainingQuarters: 16 });
    expect(after.annual).toEqual(before.annual);

    // 같은 문서를 몇 번 조회하든 · 최종 승인을 한 번 더 시도(거부)해도 이중 차감이 없다.
    await expect(
      approveDocument(org.ceo, { instanceId: submitted.instanceId, expectedVersion: 3 }, { now: NOW_0924 }),
    ).rejects.toThrow();
    for (let i = 0; i < 3; i++) {
      expect(await getMyLeaveBalance(org.drafter, { fiscalYear: 2026 }, { now: NOW_0924 })).toEqual(after);
    }
  });

  it("입사일이 없는 직원 — 2026 연차 = 기본값 15일, 월차는 입사일 없음", async () => {
    const balance = await getMyLeaveBalance(org.drafter, { fiscalYear: 2026 }, { now: NOW_0924 });
    expect(balance.annual).toEqual({
      grantQuarters: 60,
      adjustmentQuarters: 0,
      usedQuarters: 0,
      pendingQuarters: 0,
      remainingQuarters: 60,
    });
    expect(balance.monthly).toEqual({ status: "no_hire_date" });
  });

  it("퇴직일 2026-09-20인 팀장은 2026-09-24 결재선 후보가 아니고, 퇴직일 2026-09-24이면 후보다", async () => {
    await setResignationDate(SYSTEM_VIEWER, org.lead.id, "2026-09-20");
    expect((await listOrgSnapshot(SYSTEM_VIEWER, "2026-09-24")).map((row) => row.id)).not.toContain(org.lead.id);

    await setResignationDate(SYSTEM_VIEWER, org.lead.id, "2026-09-24");
    expect((await listOrgSnapshot(SYSTEM_VIEWER, "2026-09-24")).map((row) => row.id)).toContain(org.lead.id);
  });

  it("입사 2026-03-10 · 퇴직 2026-06-15 직원은 2026-09-24 기준 월차 적립 3일(07-10 이후 없음)", async () => {
    await setHireDate(SYSTEM_VIEWER, org.drafter.id, "2026-03-10");
    await setResignationDate(SYSTEM_VIEWER, org.drafter.id, "2026-06-15");
    const balance = await getMyLeaveBalance(org.drafter, { fiscalYear: 2026 }, { now: NOW_0924 });
    expect(balance.monthly).toMatchObject({ status: "active", accruedQuarters: 12 });
  });
});

// ── Task 3 ────────────────────────────────────────────────────────────────

function at(iso: string): Date {
  return new Date(iso);
}

async function submit(
  drafter: Viewer,
  input: { kind: string; startDate: string; endDate?: string; half?: string },
  now: Date,
) {
  return submitLeave(
    drafter,
    { kind: input.kind, startDate: input.startDate, endDate: input.endDate ?? "", half: input.half ?? "" },
    { now },
  );
}

// 중첩 객체까지 숫자 값을 모은다(합계 값 부재 단언용).
function numbersIn(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(numbersIn);
  return [];
}

describe("잔고 서비스 — 동시 승인 · 결재자 잔고 행 · 주입 시계 · DTO 명세", () => {
  let org: Org;
  beforeEach(async () => {
    org = await leaveOrg();
  });

  it("같은 사람의 두 신청을 동시에 최종 승인하면 사용이 두 일수의 합이다(LEAV-01 concurrency)", async () => {
    const one = await submit(org.drafter, { kind: "full_day", startDate: "2026-09-28" }, NOW_0924);
    const two = await submit(org.drafter, { kind: "full_day", startDate: "2026-09-30" }, NOW_0924);
    await approveDocument(org.lead, { instanceId: one.instanceId, expectedVersion: 1 }, { now: NOW_0924 });
    await approveDocument(org.lead, { instanceId: two.instanceId, expectedVersion: 1 }, { now: NOW_0924 });
    await Promise.all([
      approveDocument(org.ceo, { instanceId: one.instanceId, expectedVersion: 2 }, { now: NOW_0924 }),
      approveDocument(org.ceo, { instanceId: two.instanceId, expectedVersion: 2 }, { now: NOW_0924 }),
    ]);
    const balance = await getMyLeaveBalance(org.drafter, { fiscalYear: 2026 }, { now: NOW_0924 });
    expect(balance.annual).toMatchObject({ usedQuarters: 8, pendingQuarters: 0, remainingQuarters: 52 });
  });

  it("문서의 결재자는 기안자의 잔고 행을 받고, 무관한 사람은 null을 받는다", async () => {
    const stranger = await makePerson("남남", DEFAULT_ROLE_ID, "기획1팀");
    const submitted = await submit(org.drafter, { kind: "full_day", startDate: "2026-09-28" }, NOW_0924);
    const forLead = await getLeaveBalanceForRequest(org.lead, submitted.leaveId, { now: NOW_0924 });
    expect(forLead).toMatchObject({ annualRemaining: 60, monthlyRemaining: null, pending: 0, thisRequest: 4, over: 0 });
    expect(await getLeaveBalanceForRequest(stranger, submitted.leaveId, { now: NOW_0924 })).toBeNull();
  });

  it("CEO-9 — 결재자 결과에 입사일·퇴직일 키가 없고, 관리자 결과에는 퇴직 줄 재료가 있다", async () => {
    await setHireDate(SYSTEM_VIEWER, org.drafter.id, "2025-01-01");
    await setResignationDate(SYSTEM_VIEWER, org.drafter.id, "2026-12-31");
    const submitted = await submit(org.drafter, { kind: "full_day", startDate: "2026-09-28" }, NOW_0924);
    const forLead = await getLeaveBalanceForRequest(org.lead, submitted.leaveId, { now: NOW_0924 });
    expect(Object.keys(forLead ?? {})).toEqual(LEAVE_REQUEST_BALANCE_DTO_SPEC.fields.map((f) => f.key));
    expect(Object.keys(forLead ?? {})).not.toContain("hireDate");
    expect(Object.keys(forLead ?? {})).not.toContain("resignationDate");

    const forAdmin = await getLeaveBalanceForUser(SYSTEM_VIEWER, org.drafter.id, { fiscalYear: 2026 }, { now: NOW_0924 });
    expect(forAdmin.resignation).toMatchObject({ resignationDate: "2026-12-31" });
  });

  it("CX-B2 — 결재자 잔고는 주입한 날짜 기준이고 같은 재료의 순수 함수 값과 같다", async () => {
    await setHireDate(SYSTEM_VIEWER, org.drafter.id, "2026-10-01");
    const submitted = await submit(org.drafter, { kind: "full_day", startDate: "2027-03-16" }, at("2027-03-10T03:00:00Z"));

    const pure = (asOf: string): LeaveRequestBalanceDto => {
      const fiscalYears = balanceFiscalYears("2026-10-01", 2027);
      const grants = buildLeaveGrants({
        hireDate: "2026-10-01",
        resignationDate: null,
        fiscalYears,
        annualDaysByYear: { 2026: 15, 2027: 15 },
        adjustments: [],
        asOf,
      });
      const allocations = allocateLeave(grants, [
        { id: submitted.leaveId, startDate: "2027-03-16", quarters: 4, status: "pending" },
      ]);
      const summary = summarizeLeaveBalance({ fiscalYear: 2027, asOf, hireDate: "2026-10-01", grants, allocations });
      return requestBalanceOf(summary, allocations, submitted.leaveId);
    };

    const march = await getLeaveBalanceForRequest(org.lead, submitted.leaveId, { now: at("2027-03-15T03:00:00Z") });
    expect(march).toMatchObject({ monthlyRemaining: 20, annualRemaining: 16 });
    expect(march).toEqual(pure("2027-03-15"));

    const january = await getLeaveBalanceForRequest(org.lead, submitted.leaveId, { now: at("2027-01-15T03:00:00Z") });
    expect(january).toMatchObject({ monthlyRemaining: 12, annualRemaining: 16 });
    expect(january).toEqual(pure("2027-01-15"));
  });

  it("11:43 · R1 — 10월 입사자(2027-03-15)의 연차 남음 4 · 월차 남음 5가 다른 필드이고 합계 필드·값(9일)이 없다", async () => {
    await setHireDate(SYSTEM_VIEWER, org.drafter.id, "2026-10-01");
    const now = at("2027-03-15T03:00:00Z");
    const mine = await getMyLeaveBalance(org.drafter, { fiscalYear: 2027 }, { now });
    expect(Object.keys(mine)).toEqual(LEAVE_BALANCE_DTO_SPEC.fields.map((f) => f.key));
    expect(mine.annual?.remainingQuarters).toBe(16);
    expect(mine.monthly).toMatchObject({ remainingQuarters: 20 });
    expect(numbersIn(mine)).not.toContain(36);

    const preview = await previewLeaveBalance(
      org.drafter,
      { kind: "full_day", startDate: "2027-03-15", endDate: "2027-03-22", half: "" },
      { now },
    );
    expect(Object.keys(preview ?? {})).toEqual(LEAVE_REQUEST_BALANCE_DTO_SPEC.fields.map((f) => f.key));
    expect(preview).toMatchObject({ annualRemaining: 16, monthlyRemaining: 20, thisRequest: 24, plannedDeduction: { monthly: 20, annual: 4 } });
    expect(numbersIn(preview)).not.toContain(36);
  });

  it("ENG-12 · D3 — 실제 신청 · 승인으로 만든 픽스처의 DTO와 문자열", async () => {
    await setHireDate(SYSTEM_VIEWER, org.drafter.id, "2026-10-01");
    const feb = at("2027-02-01T03:00:00Z");
    const now = at("2027-03-15T03:00:00Z");
    const a = await submit(org.drafter, { kind: "full_day", startDate: "2027-02-08", endDate: "2027-02-12" }, feb);
    await approveFully(org, a.instanceId, feb);
    await submit(org.drafter, { kind: "full_day", startDate: "2027-03-16" }, now);
    const c = await submit(org.drafter, { kind: "half_day", startDate: "2027-03-17", half: "am" }, now);

    const mine = await getMyLeaveBalance(org.drafter, { fiscalYear: 2027 }, { now });
    expect(mine.annual).toEqual({ grantQuarters: 16, adjustmentQuarters: 0, usedQuarters: 4, pendingQuarters: 2, remainingQuarters: 10 });
    expect(mine.monthly).toMatchObject({ accruedQuarters: 20, usedQuarters: 16, pendingQuarters: 4, remainingQuarters: 0 });
    expect(formatBalanceLines(mine as LeaveBalanceDto).map((l) => l.text)).toEqual([
      "연차 4일 · 사용 1일 · 결재 중 0.5일 · 남음 2.5일",
      "월차 적립 5일 · 사용 4일 · 결재 중 1일 · 남음 0일 · 2027-12-31 소멸",
    ]);

    const row = await getLeaveBalanceForRequest(org.lead, c.leaveId, { now });
    expect(row).toEqual({
      annualRemaining: 12,
      monthlyRemaining: 0,
      pending: 4,
      thisRequest: 2,
      plannedDeduction: { monthly: 0, annual: 2 },
      over: 0,
    });
    expect(formatBalanceRow(row as LeaveRequestBalanceDto, "half_day")?.map((l) => l.text)).toEqual([
      "연차 남음 3일 · 월차 남음 0일 · 결재 중 1일 · 이번 신청 0.5일",
      "차감 예정 월차 0일 · 연차 0.5일",
    ]);
  });

  it("A2-01 — 1월 입사자의 2026 사용이 2027 월차 줄에 들어간다(서비스 배분 범위)", async () => {
    await setHireDate(SYSTEM_VIEWER, org.drafter.id, "2026-01-01");
    const may = at("2026-05-20T03:00:00Z");
    const now = at("2027-03-15T03:00:00Z");
    const june = await submit(org.drafter, { kind: "full_day", startDate: "2026-06-01", endDate: "2026-06-03" }, may);
    await approveFully(org, june.instanceId, may);

    const mine = await getMyLeaveBalance(org.drafter, { fiscalYear: 2027 }, { now });
    expect(mine.monthly).toMatchObject({ accruedQuarters: 44, usedQuarters: 12, pendingQuarters: 0, remainingQuarters: 32 });
    const preview = await previewLeaveBalance(
      org.drafter,
      { kind: "full_day", startDate: "2027-03-16", endDate: "2027-03-17", half: "" },
      { now },
    );
    expect(preview).toMatchObject({ monthlyRemaining: 32, plannedDeduction: { monthly: 8, annual: 0 } });
  });

  it("이력형 연도 분리 — 2027-01-01부터 16일이어도 2026 부여는 15", async () => {
    await insertHistorizedValue(SYSTEM_VIEWER, { key: LEAVE_ANNUAL_DAYS.key, effectiveFrom: "2027-01-01", value: 16, by: null });
    const now = at("2027-03-15T03:00:00Z");
    expect((await getMyLeaveBalance(org.drafter, { fiscalYear: 2026 }, { now })).annual?.grantQuarters).toBe(60);
    expect((await getMyLeaveBalance(org.drafter, { fiscalYear: 2027 }, { now })).annual?.grantQuarters).toBe(64);
  });

  it("ENG-4 · CXF2 · C-N01 — 퇴직자를 2025 · 2026 · 2027로 읽기(보관 뒤에도 같다)", async () => {
    await setResignationDate(SYSTEM_VIEWER, org.drafter.id, "2026-10-31");
    const three = await submit(org.drafter, { kind: "full_day", startDate: "2026-09-28", endDate: "2026-09-30" }, NOW_0924);
    await approveFully(org, three.instanceId, NOW_0924);

    const now = at("2027-03-01T03:00:00Z");
    const readAll = async () => ({
      y2025: await getLeaveBalanceForUser(SYSTEM_VIEWER, org.drafter.id, { fiscalYear: 2025 }, { now }),
      y2026: await getLeaveBalanceForUser(SYSTEM_VIEWER, org.drafter.id, { fiscalYear: 2026 }, { now }),
      y2027: await getLeaveBalanceForUser(SYSTEM_VIEWER, org.drafter.id, { fiscalYear: 2027 }, { now }),
    });
    const before = await readAll();
    expect(formatBalanceLines(before.y2026 as LeaveBalanceDto).map((l) => l.text)).toEqual([
      "퇴직 2026-10-31 · 남은 연차 12일 · 월차 0일",
    ]);
    expect(before.y2027.resignation).toBeNull();
    expect(before.y2027.annual).toEqual({ grantQuarters: 0, adjustmentQuarters: 0, usedQuarters: 0, pendingQuarters: 0, remainingQuarters: 0 });
    expect(before.y2025.resignation).toBeNull();
    expect(before.y2025.annual?.grantQuarters).toBe(60);
    for (const balance of [before.y2025, before.y2026, before.y2027]) {
      expect(balance.resignationDate).toBe("2026-10-31");
      expect(balance.hireDate).toBeNull();
    }

    await archivePerson(SYSTEM_VIEWER, org.drafter.id);
    expect(await readAll()).toEqual(before);
  });
});

describe("조정 — 원자성 · 계약 · 기록 조회 · 권한(ENG-13 · CX-R2 · A-04)", () => {
  let org: Org;
  let admin: Viewer;
  beforeEach(async () => {
    org = await leaveOrg();
    admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
  });

  it("연차 -1 · 월차 +1 · 2027 연차 +1 뒤 연도별 조정 기록 · 보기 전용 계급 · PM 거부 · 노출 끄면 빈 항목", async () => {
    await setHireDate(SYSTEM_VIEWER, org.drafter.id, "2026-10-01");
    const userId = org.drafter.id;
    await addLeaveAdjustment(
      admin,
      { userId, bucket: "annual", fiscalYear: 2026, amountDays: -1, reason: "무단 결근" },
      { now: at("2026-11-02T01:00:00Z") },
    );
    await addLeaveAdjustment(
      admin,
      { userId, bucket: "monthly", fiscalYear: null, amountDays: 1, reason: "보상" },
      { now: at("2026-11-03T01:00:00Z") },
    );
    await addLeaveAdjustment(
      admin,
      { userId, bucket: "annual", fiscalYear: 2027, amountDays: 1, reason: "정정" },
      { now: at("2027-02-01T01:00:00Z") },
    );

    const y2026 = await listLeaveAdjustmentsForUser(admin, { userId, fiscalYear: 2026 });
    expect(y2026.map((item) => [item.kind, item.quarters])).toEqual([
      ["monthly", 4],
      ["annual", -4],
    ]);
    for (const item of y2026) {
      expect(Object.keys(item)).toEqual(["id", "kind", "quarters", "reason", "createdAt", "createdByName"]);
      expect(item.createdByName).toBe("관리자");
    }
    expect(y2026.map((item) => item.createdAt)).toEqual([at("2026-11-03T01:00:00Z"), at("2026-11-02T01:00:00Z")]);
    expect((await listLeaveAdjustmentsForUser(admin, { userId, fiscalYear: 2027 })).map((i) => [i.kind, i.quarters])).toEqual([
      ["annual", 4],
      ["monthly", 4],
    ]);
    expect(await listLeaveAdjustmentsForUser(admin, { userId, fiscalYear: 2028 })).toEqual([]);

    // 보기만 있는 계급 — 같은 목록 · 같은 값.
    const role = await createRole(SYSTEM_VIEWER, { name: `보기전용-${Date.now()}` });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.people", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "leave.value", visible: true });
    const viewOnly = await makePerson("보기만", role.id, null);
    const seen = await listLeaveAdjustmentsForUser(viewOnly, { userId, fiscalYear: 2026 });
    expect(seen).toEqual(y2026);
    expect(seen.map((i) => [i.kind, i.quarters, i.reason, i.createdByName])).toEqual([
      ["monthly", 4, "보상", "관리자"],
      ["annual", -4, "무단 결근", "관리자"],
    ]);

    // 사람 보기 권한 없는 기획 PM은 거부.
    await expect(listLeaveAdjustmentsForUser(org.drafter, { userId, fiscalYear: 2026 })).rejects.toBeInstanceOf(ForbiddenError);

    // 보기 권한은 둔 채 leave.value만 끄면 — 같은 개수 · 항목마다 키 없음 · 사유·이름이 새지 않는다.
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "leave.value", visible: false });
    const hidden = await listLeaveAdjustmentsForUser(viewOnly, { userId, fiscalYear: 2026 });
    expect(hidden).toHaveLength(2);
    for (const item of hidden) expect(Object.keys(item)).toEqual([]);
    const serialized = JSON.stringify(hidden);
    for (const secret of ["무단 결근", "보상", "관리자"]) expect(serialized).not.toContain(secret);
  });

  it("조정이 잔고에 반영된다 — 연차 줄 `조정 -1일` · 월차 적립 합산", async () => {
    await setHireDate(SYSTEM_VIEWER, org.drafter.id, "2026-10-01");
    const userId = org.drafter.id;
    await addLeaveAdjustment(admin, { userId, bucket: "annual", fiscalYear: 2027, amountDays: -1, reason: "무단 결근" }, { now: at("2027-02-01T01:00:00Z") });
    await addLeaveAdjustment(admin, { userId, bucket: "monthly", fiscalYear: null, amountDays: 1, reason: "보상" }, { now: at("2027-02-01T01:00:00Z") });
    const balance = await getLeaveBalanceForUser(admin, userId, { fiscalYear: 2027 }, { now: at("2027-03-15T03:00:00Z") });
    expect(formatBalanceLines(balance as LeaveBalanceDto).map((l) => l.text)).toEqual([
      "연차 4일 · 조정 -1일 · 사용 0일 · 결재 중 0일 · 남음 3일",
      "월차 적립 6일 · 사용 0일 · 결재 중 0일 · 남음 6일 · 2027-12-31 소멸",
    ]);
  });

  it("행동 로그 쓰기가 실패하면 조정 행과 잔고가 그대로다(Codex HIGH 원자성)", async () => {
    const failingAppend: typeof appendActionLog = () => Promise.reject(new Error("action_log 쓰기 실패(주입)"));
    const now = at("2026-11-02T01:00:00Z");
    const before = await getLeaveBalanceForUser(admin, org.drafter.id, { fiscalYear: 2026 }, { now });
    const rows = await countRows("leave_adjustments");
    await expect(
      addLeaveAdjustment(
        admin,
        { userId: org.drafter.id, bucket: "annual", fiscalYear: 2026, amountDays: -1, reason: "무단 결근" },
        { now, appendActionLog: failingAppend },
      ),
    ).rejects.toThrow();
    expect(await countRows("leave_adjustments")).toBe(rows);
    expect(await getLeaveBalanceForUser(admin, org.drafter.id, { fiscalYear: 2026 }, { now })).toEqual(before);
  });

  it("ENG-13 · T3 — 입사일 없는 월차 · 소멸 뒤 월차 · 빈 버킷 · 목록 밖 버킷은 ValidationError이고 행이 그대로다", async () => {
    const rows = await countRows("leave_adjustments");
    const base = { userId: org.drafter.id, fiscalYear: null, amountDays: 1, reason: "보상" };
    await expect(addLeaveAdjustment(admin, { ...base, bucket: "monthly" }, { now: NOW_0924 })).rejects.toThrow(
      "입사일 없음 · 먼저 입사일 넣기",
    );

    await setHireDate(SYSTEM_VIEWER, org.drafter.id, "2026-10-01");
    await expect(
      addLeaveAdjustment(admin, { ...base, bucket: "monthly" }, { now: at("2028-01-02T03:00:00Z") }),
    ).rejects.toBeInstanceOf(ValidationError);

    for (const bucket of ["", "x"]) {
      const error = await addLeaveAdjustment(admin, { ...base, bucket }, { now: NOW_0924 }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as Error).message).toBe("잔고 비어 있음 · 잔고 고르기");
      expect((error as { field?: string }).field).toBe("bucket");
    }
    expect(await countRows("leave_adjustments")).toBe(rows);
  });

  it("A-04 — 기획 PM의 남의 조정은 ForbiddenError(조정 · 로그 행 수 불변), 관리자 잔고 조회도 ForbiddenError", async () => {
    const rows = await countRows("leave_adjustments");
    const logs = await countRows("action_log");
    const pm: Viewer = { id: org.drafter.id, roleId: DEFAULT_ROLE_ID };
    await expect(
      addLeaveAdjustment(pm, { userId: org.lead.id, bucket: "annual", fiscalYear: 2026, amountDays: -1, reason: "무단 결근" }, { now: NOW_0924 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await countRows("leave_adjustments")).toBe(rows);
    expect(await countRows("action_log")).toBe(logs);
    await expect(getLeaveBalanceForUser(pm, org.lead.id, { fiscalYear: 2026 }, { now: NOW_0924 })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
