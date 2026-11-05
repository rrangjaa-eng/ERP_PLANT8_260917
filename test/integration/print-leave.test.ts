import { describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes } from "@/db/schema";
import { approveDocument, rejectDocument, withdrawDocument } from "@/domain/approvals";
import { formatRequestBalanceRow, getLeave, submitLeave } from "@/domain/leave";
import { LEAVE_REQUEST_BALANCE_DTO_SPEC } from "@/domain/leave/dto";
import { getLeaveBalanceForRequest } from "@/domain/leave/balance-service";
import { resubmitLeave } from "@/domain/leave/resubmit";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { setHireDate, setPersonDivision } from "@/domain/people";
import { getLeavePrint } from "@/domain/print/leave";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { findRoleById } from "@/repositories/roles";
import { insertMembership } from "@/repositories/team-memberships";
import { makePerson, MEMBERSHIP_FROM, orgUnitIdByName } from "./approvals-fixtures";

// 07.4-02 D-7408 · D-7413 — 연차 신청서 인쇄 재료. 보임 판정은 getLeave와 같고(결재자 아닌 사람은 null), 잔고는 연차 상세 화면과 같은 함수의 값이며
// 진행 중 문서에만 있다(카드 E1 · E2). 소속 두 조각과 상신일은 지금 차수 결재선이 출처다.

const NOW = new Date("2026-09-24T03:00:00Z");
const FULL_DAY = { kind: "full_day", startDate: "2026-09-28", endDate: "2026-09-29", half: "" };

type Org = { drafter: Viewer; lead: Viewer; ceo: Viewer; stranger: Viewer };

async function leaveOrg(): Promise<Org> {
  return {
    drafter: await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀"),
    lead: await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀"),
    ceo: await makePerson("최대표", CEO_ROLE_ID, null),
    stranger: await makePerson("남남", DEFAULT_ROLE_ID, "기획1팀"),
  };
}

async function routesOf(documentId: string) {
  return db
    .select({ round: approvalRoutes.round, submittedAt: approvalRoutes.submittedAt })
    .from(approvalRoutes)
    .innerJoin(approvalInstances, eq(approvalInstances.id, approvalRoutes.instanceId))
    .where(eq(approvalInstances.documentId, documentId))
    .orderBy(asc(approvalRoutes.round));
}

// 객체 깊이 전체의 키를 모은다(입사일 · 퇴직일 · 월차 소멸일 키 부재 단언용).
function keysDeep(value: unknown): string[] {
  if (value instanceof Date || value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, inner]) => [key, ...keysDeep(inner)]);
}

describe("getLeavePrint — 보임 판정 · 소속 · 상신일 · 잔고", () => {
  it("결재 중 문서: 지금 단계 결재자는 소속 세 조각 · 상신일 · 화면과 같은 잔고를 받는다", async () => {
    const org = await leaveOrg();
    await setHireDate(SYSTEM_VIEWER, org.drafter.id, "2025-01-01");
    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW });
    const [round1] = await routesOf(submitted.leaveId);
    const roleName = (await findRoleById(SYSTEM_VIEWER, DEFAULT_ROLE_ID))?.name;

    const print = await getLeavePrint(org.lead, submitted.leaveId, { now: NOW });
    expect(print).not.toBeNull();
    expect(print).toMatchObject({ divisionName: "기획본부", teamName: "기획1팀", roleName });
    expect(print?.submittedAt).toEqual(round1?.submittedAt);
    // 화면이 부르는 함수와 같은 viewer · 같은 now의 값이다(카드 E2 — 화면처럼 남음만 찍기).
    const screen = await getLeaveBalanceForRequest(org.lead, submitted.leaveId, { now: NOW });
    expect(screen).not.toBeNull();
    expect(print?.balance).toEqual(screen);
    expect(Object.keys(print?.balance ?? {})).toEqual(LEAVE_REQUEST_BALANCE_DTO_SPEC.fields.map((field) => field.key));
    // 입사일 · 퇴직일 · 월차 소멸일(입사 연도가 드러난다)은 어디에도 없다.
    const keys = keysDeep(print);
    for (const forbidden of ["hireDate", "resignationDate", "expiresOn", "grantQuarters", "adjustmentQuarters", "accruedQuarters", "usedQuarters"]) {
      expect(keys, forbidden).not.toContain(forbidden);
    }
  });

  it("기안자 본인도 같은 재료를 받는다", async () => {
    const org = await leaveOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW });
    const print = await getLeavePrint(org.drafter, submitted.leaveId, { now: NOW });
    expect(print).toMatchObject({ divisionName: "기획본부", teamName: "기획1팀" });
    expect(print?.balance).toEqual(await getLeaveBalanceForRequest(org.drafter, submitted.leaveId, { now: NOW }));
  });

  it("결재선 밖 사람 · 없는 문서는 null이다", async () => {
    const org = await leaveOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW });
    expect(await getLeavePrint(org.stranger, submitted.leaveId, { now: NOW })).toBeNull();
    expect(await getLeavePrint(org.lead, randomUUID(), { now: NOW })).toBeNull();
  });

  it("승인 · 반려 · 회수 문서는 balance가 null이다(진행 중 문서에만 잔고)", async () => {
    const org = await leaveOrg();
    const approved = await submitLeave(org.drafter, FULL_DAY, { now: NOW });
    await approveDocument(org.lead, { instanceId: approved.instanceId, expectedVersion: 1 }, { now: NOW });
    const done = await approveDocument(org.ceo, { instanceId: approved.instanceId, expectedVersion: 2 }, { now: NOW });
    expect(done.status).toBe("approved");
    expect((await getLeavePrint(org.lead, approved.leaveId, { now: NOW }))?.balance).toBeNull();

    const other = { kind: "full_day", startDate: "2026-10-05", endDate: "2026-10-06", half: "" };
    const rejected = await submitLeave(org.drafter, other, { now: NOW });
    await rejectDocument(org.lead, { instanceId: rejected.instanceId, expectedVersion: 1, reason: "일정 겹침" }, { now: NOW });
    expect((await getLeavePrint(org.lead, rejected.leaveId, { now: NOW }))?.balance).toBeNull();

    const third = { kind: "full_day", startDate: "2026-10-12", endDate: "2026-10-13", half: "" };
    const withdrawn = await submitLeave(org.drafter, third, { now: NOW });
    await withdrawDocument(org.drafter, { instanceId: withdrawn.instanceId, expectedVersion: 1 }, { now: NOW });
    expect((await getLeavePrint(org.drafter, withdrawn.leaveId, { now: NOW }))?.balance).toBeNull();
  });

  it("leave.value를 못 보는 계급: getLeave는 {}이고 getLeavePrint에는 balance · submittedAt 키가 없다", async () => {
    const org = await leaveOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "leave.value", visible: false });
    expect(await getLeave(org.lead, submitted.leaveId, { now: NOW })).toEqual({});
    const print = await getLeavePrint(org.lead, submitted.leaveId, { now: NOW });
    expect(print).not.toBeNull();
    expect(print).not.toHaveProperty("balance");
    expect(print).not.toHaveProperty("submittedAt");
    expect(print).toMatchObject({ teamName: "기획1팀" });
  });

  it("team.value · role.value · org_unit.value를 끄면 그 조각의 키가 없다", async () => {
    const org = await leaveOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "team.value", visible: false });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "role.value", visible: false });
    const print = await getLeavePrint(org.lead, submitted.leaveId, { now: NOW });
    expect(print).not.toHaveProperty("teamName");
    expect(print).not.toHaveProperty("roleName");
    expect(print).toMatchObject({ divisionName: "기획본부" });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "org_unit.value", visible: false });
    expect(await getLeavePrint(org.lead, submitted.leaveId, { now: NOW })).not.toHaveProperty("divisionName");
  });

  it("팀 없는 기안자는 사람의 본부 칸 이름이고 팀 이름은 null이다", async () => {
    const org = await leaveOrg();
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: `${randomUUID()}@example.test`, name: "무팀", roleId: DEFAULT_ROLE_ID });
    await setPersonDivision(SYSTEM_VIEWER, userId, await orgUnitIdByName("경영관리본부"));
    const drafter: Viewer = { id: userId, roleId: DEFAULT_ROLE_ID };
    const submitted = await submitLeave(drafter, FULL_DAY, { now: NOW });
    const print = await getLeavePrint(drafter, submitted.leaveId, { now: NOW });
    expect(print).toMatchObject({ divisionName: "경영관리본부", teamName: null });
    expect(org.ceo.id).toBeTruthy();
  });

  it("반려 뒤 팀을 옮겨 다시 신청하면 상신일 · 팀 이름은 둘째 차수 결재선의 값이다", async () => {
    const org = await leaveOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW });
    const rejected = await rejectDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1, reason: "일정 겹침" }, { now: NOW });

    const unit = await createOrgUnit(SYSTEM_VIEWER, { name: `이동본부-${randomUUID().slice(0, 8)}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: unit.id, name: `이동팀-${randomUUID().slice(0, 8)}` });
    const newLead = await createAccount(SYSTEM_VIEWER, { email: `${randomUUID()}@example.test`, name: "새팀장", roleId: TEAM_LEAD_ROLE_ID });
    await insertMembership(SYSTEM_VIEWER, { userId: newLead.userId, teamId: team.id, effectiveFrom: MEMBERSHIP_FROM });
    await assignTeam(SYSTEM_VIEWER, { userId: org.drafter.id, teamId: team.id, effectiveFrom: "2026-09-20" });

    await resubmitLeave(org.drafter, { leaveId: submitted.leaveId, expectedVersion: rejected.version, input: FULL_DAY }, { now: NOW });
    const [round1, round2] = await routesOf(submitted.leaveId);
    expect(round2?.round).toBe(2);

    const print = await getLeavePrint(org.drafter, submitted.leaveId, { now: NOW });
    expect(print?.submittedAt).toEqual(round2?.submittedAt);
    expect(print?.submittedAt).not.toEqual(round1?.submittedAt);
    expect(print).toMatchObject({ teamName: team.name, divisionName: unit.name });
  });

  it("입사 다음 해 기안자: 월차 남음이 숫자이고 화면 잔고 첫 줄에 연차 남음 · 월차 남음이 함께 있다", async () => {
    const org = await leaveOrg();
    await setHireDate(SYSTEM_VIEWER, org.drafter.id, "2026-10-01");
    const now = new Date("2027-03-15T03:00:00Z");
    const submitted = await submitLeave(org.drafter, { kind: "full_day", startDate: "2027-03-16", endDate: "", half: "" }, { now });
    const print = await getLeavePrint(org.lead, submitted.leaveId, { now });
    expect(print?.balance?.monthlyRemaining).toBe(20);
    const lines = formatRequestBalanceRow(print?.balance, "full_day");
    expect(lines?.[0]?.text).toContain(" · 월차 남음 ");
    expect(lines?.[0]?.text).toContain("연차 남음 ");
  });
});
