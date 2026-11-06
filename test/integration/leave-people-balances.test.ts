import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID, createRole } from "@/domain/permissions/roles";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { ForbiddenError } from "@/domain/people";
import { submitLeave } from "@/domain/leave";
import { peopleLeaveScopeOf } from "@/domain/leave/access";
import { getLeaveBalanceForUser, listPeopleLeaveBalances } from "@/domain/leave/balance-service";
import { makePerson, NOW_2026, teamIdByName } from "./approvals-fixtures";

// 07.2-08(PU12 · D-7260 · D-7261 · 07.2 D-7308): 사람별 연차 잔여 — 범위 판정은 서버. `admin.people` 보기 = 전사, 그 밖은
// seat-rules 팀장 자리(TEAM_LEAD_ROLE_ID 계급 + 오늘 발령 팀)의 그 팀만, 둘 다 아니면 null(→ ForbiddenError · 화면 404).
// 숫자는 getLeaveBalanceForUser와 같은 computeBalance 사슬 · 두 잔고를 더한 필드는 없다.

const deps = { now: NOW_2026 };

async function peopleAdmin(name: string): Promise<Viewer> {
  const role = await createRole(SYSTEM_VIEWER, { name: `경영관리-${name}` });
  await setPermissionCell(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.people", action: "view", allowed: true });
  return makePerson(name, role.id, "경영관리팀");
}

async function setDates(userId: string, input: { hireDate?: string | null; resignationDate?: string | null; archived?: boolean }) {
  await db
    .update(users)
    .set({
      ...(input.hireDate !== undefined ? { hireDate: input.hireDate } : {}),
      ...(input.resignationDate !== undefined ? { resignationDate: input.resignationDate } : {}),
      ...(input.archived ? { archivedAt: new Date("2026-06-01T00:00:00Z") } : {}),
    })
    .where(eq(users.id, userId));
}

describe("peopleLeaveScopeOf — 계급별 실사용자", () => {
  it("admin.people 보기 계정은 전사", async () => {
    const admin = await peopleAdmin("정경영");
    expect(await peopleLeaveScopeOf(admin, deps)).toEqual({ kind: "company" });
  });

  it("오늘 팀장 자리(팀장 계급 + 오늘 발령 팀)는 그 팀만", async () => {
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    expect(await peopleLeaveScopeOf(lead, deps)).toEqual({ kind: "teams", teamIds: [await teamIdByName("기획1팀")] });
  });

  it("팀장 계급이어도 발령 팀이 없으면 null", async () => {
    const lead = await makePerson("무소속팀장", TEAM_LEAD_ROLE_ID, null);
    expect(await peopleLeaveScopeOf(lead, deps)).toBeNull();
  });

  it("사원(role-pm) · 기본 시드 대표 · 본부 책임자는 null", async () => {
    const pm = await makePerson("박사원", DEFAULT_ROLE_ID, "기획1팀");
    const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
    const head = await makePerson("이본부", DIVISION_HEAD_ROLE_ID, "기획1팀");
    for (const viewer of [pm, ceo, head]) expect(await peopleLeaveScopeOf(viewer, deps)).toBeNull();
  });

  it("projects.status 쓰기만 켠 커스텀 계급(팀장 자리 아님)은 null(07.2 D-7308)", async () => {
    const role = await createRole(SYSTEM_VIEWER, { name: "부팀장" });
    await setPermissionCell(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.status", action: "write", allowed: true });
    const vice = await makePerson("한부팀장", role.id, "기획1팀");
    expect(await peopleLeaveScopeOf(vice, deps)).toBeNull();
  });
});

describe("listPeopleLeaveBalances — 행 · 숫자 · 범위", () => {
  it("경영관리: 활성 + 올해 퇴직자(보관돼도) · 지난해 퇴직자 · 퇴직 아닌 보관자 · 연말 뒤 입사자는 없다 · 합산 필드 0 · 팀 → 이름 정렬", async () => {
    const admin = await peopleAdmin("정경영");
    const active = await makePerson("가활성", DEFAULT_ROLE_ID, "기획1팀");
    await setDates(active.id, { hireDate: "2024-03-01" });
    const resigned = await makePerson("나퇴직", DEFAULT_ROLE_ID, "기획1팀");
    await setDates(resigned.id, { hireDate: "2023-01-02", resignationDate: "2026-05-31", archived: true });
    const lastYear = await makePerson("다작년퇴직", DEFAULT_ROLE_ID, "기획1팀");
    await setDates(lastYear.id, { hireDate: "2022-01-03", resignationDate: "2025-12-31", archived: true });
    const archived = await makePerson("라보관", DEFAULT_ROLE_ID, "기획1팀");
    await setDates(archived.id, { hireDate: "2024-01-02", archived: true });
    const future = await makePerson("마내년입사", DEFAULT_ROLE_ID, "기획1팀");
    await setDates(future.id, { hireDate: "2027-01-02" });

    const result = await listPeopleLeaveBalances(admin, 2026, deps);
    const names = result.rows.map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining(["가활성", "나퇴직", "정경영"]));
    for (const excluded of ["다작년퇴직", "라보관", "마내년입사"]) expect(names).not.toContain(excluded);
    expect(result.count).toBe(result.rows.length);

    const resignedRow = result.rows.find((row) => row.name === "나퇴직");
    expect(resignedRow?.resigned).toBe(true);
    expect(result.rows.find((row) => row.name === "가활성")?.resigned).toBe(false);
    expect(resignedRow?.teamName).toBe("기획1팀");
    for (const row of result.rows) {
      expect(Object.keys(row).sort()).toEqual(
        ["grantedQuarters", "monthlyRemainingQuarters", "name", "pendingQuarters", "remainingQuarters", "resigned", "teamName", "usedQuarters", "userId"].sort(),
      );
    }
    const sortKeys = result.rows.map((row) => `${row.teamName ?? ""}|${row.name ?? ""}`);
    const planIndex = sortKeys.indexOf("기획1팀|가활성");
    expect(sortKeys.indexOf("기획1팀|나퇴직")).toBe(planIndex + 1);
  });

  it("사람마다 숫자 = getLeaveBalanceForUser(같은 사람 · 같은 연도) — 사용 · 결재 중 · 월차 포함", async () => {
    const admin = await peopleAdmin("정경영");
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    await setDates(drafter.id, { hireDate: "2026-03-02" });
    await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    await submitLeave(drafter, { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-22", half: "" }, deps);
    const veteran = await makePerson("오고참", DEFAULT_ROLE_ID, "기획1팀");
    await setDates(veteran.id, { hireDate: "2019-01-02" });
    await submitLeave(veteran, { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-22", half: "" }, deps);

    const { rows } = await listPeopleLeaveBalances(admin, 2026, deps);
    for (const person of [drafter, veteran]) {
      const row = rows.find((candidate) => candidate.userId === person.id);
      const balance = await getLeaveBalanceForUser(admin, person.id, { fiscalYear: 2026 }, deps);
      const annual = balance.annual;
      if (!annual) throw new Error("잔고 없음");
      expect(row?.grantedQuarters).toBe(annual.grantQuarters + annual.adjustmentQuarters);
      expect(row?.usedQuarters).toBe(annual.usedQuarters);
      expect(row?.pendingQuarters).toBe(annual.pendingQuarters);
      expect(row?.remainingQuarters).toBe(annual.remainingQuarters);
      expect(row?.monthlyRemainingQuarters).toBe(balance.monthly?.status === "active" ? balance.monthly.remainingQuarters : null);
    }
    expect(rows.find((row) => row.userId === veteran.id)?.pendingQuarters).toBe(8);
    expect(rows.find((row) => row.userId === veteran.id)?.monthlyRemainingQuarters).toBeNull();
  });

  it("팀장은 자기 팀 사람만 — 다른 팀 사람 0", async () => {
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("가같은팀", DEFAULT_ROLE_ID, "기획1팀");
    await makePerson("나다른팀", DEFAULT_ROLE_ID, "경영관리팀");
    const { rows } = await listPeopleLeaveBalances(lead, 2026, deps);
    expect(rows.map((row) => row.name)).toEqual(expect.arrayContaining(["가같은팀", "김팀장"]));
    expect(rows.every((row) => row.teamName === "기획1팀")).toBe(true);
    expect(rows.map((row) => row.name)).not.toContain("나다른팀");
  });

  it("범위가 null인 계정(사원)은 ForbiddenError", async () => {
    const pm = await makePerson("박사원", DEFAULT_ROLE_ID, "기획1팀");
    await expect(listPeopleLeaveBalances(pm, 2026, deps)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
