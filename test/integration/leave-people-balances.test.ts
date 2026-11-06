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
import { insertMembership } from "@/repositories/team-memberships";
import { makePerson, NOW_2026, teamIdByName } from "./approvals-fixtures";
import { makeDelegatedRole } from "./admin-cap-fixtures";

// 07.2-08(PU12 · D-7260 · D-7261 · 07.2 D-7308): 사람별 연차 잔여 — 범위 판정은 서버. `admin.people` 보기 = 전사, 그 밖은
// seat-rules 팀장 자리(TEAM_LEAD_ROLE_ID 계급 + 오늘 발령 팀)의 그 팀만, 둘 다 아니면 null(→ ForbiddenError · 화면 404).
// 숫자는 getLeaveBalanceForUser와 같은 computeBalance 사슬 · 두 잔고를 더한 필드는 없다.

const deps = { now: NOW_2026 };

// 경영관리 fixture 계급 — 사원 권한 · 정보 노출을 복사하고 admin.people 보기만 더한다(새 계급은 노출표 행이 없어 이름 · 숫자가 숨는다).
async function peopleAdmin(name: string): Promise<Viewer> {
  const roleId = await makeDelegatedRole({ name: "경영관리", menus: [{ menu: "admin.people", action: "view" }] });
  return makePerson(name, roleId, "경영관리팀");
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

// PR #368 리뷰 P2-1 ①~⑤: 범위 판정의 갈림길을 고정한다. 오늘 = 2026-09-18(서울).
describe("peopleLeaveScopeOf — 자리 구간 · 메뉴 보기 권한", () => {
  it("예정 발령(내일 시작)만 있는 팀장 계급은 null — 아직 자리가 아니다", async () => {
    const lead = await makePerson("내일팀장", TEAM_LEAD_ROLE_ID, null);
    await insertMembership(SYSTEM_VIEWER, { userId: lead.id, teamId: await teamIdByName("기획1팀"), effectiveFrom: "2026-09-19" });
    expect(await peopleLeaveScopeOf(lead, deps)).toBeNull();
  });

  it("자리가 끝난 팀장(어제 퇴직)은 null", async () => {
    const lead = await makePerson("어제퇴직팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await setDates(lead.id, { resignationDate: "2026-09-17" });
    expect(await peopleLeaveScopeOf(lead, deps)).toBeNull();
  });

  it("오늘 팀을 옮긴 팀장은 새 팀만", async () => {
    const lead = await makePerson("이동팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await insertMembership(SYSTEM_VIEWER, { userId: lead.id, teamId: await teamIdByName("경영관리팀"), effectiveFrom: "2026-09-18" });
    expect(await peopleLeaveScopeOf(lead, deps)).toEqual({ kind: "teams", teamIds: [await teamIdByName("경영관리팀")] });
  });

  // D-7261: 「전체」는 `/leave` 안 탭 — 연차 메뉴 보기 권한자만. admin.people 보기만으로는 열리지 않는다(도메인도 막는다).
  it("admin.people 보기는 있고 leave 보기가 꺼진 계급은 null · listPeopleLeaveBalances는 ForbiddenError", async () => {
    const admin = await peopleAdmin("연차끔경영");
    if (!admin.roleId) throw new Error("계급 없음");
    await setPermissionCell(SYSTEM_VIEWER, { roleId: admin.roleId, menu: "leave", action: "view", allowed: false });
    expect(await peopleLeaveScopeOf(admin, deps)).toBeNull();
    await expect(listPeopleLeaveBalances(admin, 2026, deps)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("listPeopleLeaveBalances — 팀장 범위의 퇴직 · 보관 · 지난 연도", () => {
  // D-7260: 보관된 사람은 빼되 그해 퇴직자는 (보관돼도) 넣는다 — 팀은 마지막 발령 팀. 팀장은 자기 팀 퇴직자만 본다.
  it("팀장: 자기 팀 올해 퇴직자(보관돼도)는 퇴직 표시로 보이고, 다른 팀 퇴직자 · 퇴직 아닌 보관자는 없다", async () => {
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const ownRetiree = await makePerson("가우리퇴직", DEFAULT_ROLE_ID, "기획1팀");
    await setDates(ownRetiree.id, { resignationDate: "2026-05-31", archived: true });
    const otherRetiree = await makePerson("나남퇴직", DEFAULT_ROLE_ID, "경영관리팀");
    await setDates(otherRetiree.id, { resignationDate: "2026-05-31" });
    const archived = await makePerson("다보관", DEFAULT_ROLE_ID, "기획1팀");
    await setDates(archived.id, { archived: true });

    const { rows } = await listPeopleLeaveBalances(lead, 2026, deps);
    const names = rows.map((row) => row.name);
    expect(rows.find((row) => row.name === "가우리퇴직")?.resigned).toBe(true);
    expect(names).not.toContain("나남퇴직");
    expect(names).not.toContain("다보관");
  });

  // 지난 연도를 골라도 팀 판정은 오늘 소속(repositories/leave-requests.ts listLeaveBalancePeople의 asOf = 오늘) — 지금 동작을 고정한다.
  it("팀장이 year = 작년을 보면 팀은 오늘 소속 기준 — 작년에 다른 팀이던 지금 팀원은 있고, 작년 팀원이던 지금 다른 팀 사람은 없다", async () => {
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const plan = await teamIdByName("기획1팀");
    const office = await teamIdByName("경영관리팀");
    const joined = await makePerson("가전입", DEFAULT_ROLE_ID, null);
    await insertMembership(SYSTEM_VIEWER, { userId: joined.id, teamId: office, effectiveFrom: "2025-01-01" });
    await insertMembership(SYSTEM_VIEWER, { userId: joined.id, teamId: plan, effectiveFrom: "2026-03-01" });
    const left = await makePerson("나전출", DEFAULT_ROLE_ID, null);
    await insertMembership(SYSTEM_VIEWER, { userId: left.id, teamId: plan, effectiveFrom: "2025-01-01" });
    await insertMembership(SYSTEM_VIEWER, { userId: left.id, teamId: office, effectiveFrom: "2026-03-01" });
    for (const person of [joined, left]) await setDates(person.id, { hireDate: "2024-01-02" });

    const { rows } = await listPeopleLeaveBalances(lead, 2025, deps);
    const names = rows.map((row) => row.name);
    expect(names).toContain("가전입");
    expect(names).not.toContain("나전출");
    expect(rows.every((row) => row.teamName === "기획1팀")).toBe(true);
  });
});
