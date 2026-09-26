import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Viewer } from "@/domain/viewer";
import type { RoleRow } from "@/repositories/roles";
import type { TeamMembershipRow } from "@/repositories/team-memberships";
import type { CodeItemRow } from "@/repositories/code-tables";
import {
  coversProjectTeam,
  evaluateTransition,
  lastStatusChangeOn,
  listProjectStatusCatalog,
  loadActorTeamScope,
  statusChangedMessage,
  statusDestinations,
  type ActorTeamScope,
} from "@/domain/projects/status";
import type { ProjectStatus } from "@/domain/projects/status-transitions";

// 04-20 — 사람의 전환 결정표. 주체 여섯을 열로 두고(권한 메뉴 + 업무 범위 사실),
// DB 없이 전환 판정·갈 곳 목록을 단언한다. 실제 DB 전환은 통합 테스트가 맡는다.
const TEAM_A = "team-a";
const TEAM_B = "team-b";

type Actor = { menus: { status: boolean; complete: boolean }; teamScope: ActorTeamScope };

const ACTORS = {
  pm: { menus: { status: false, complete: false }, teamScope: { workScope: "team", teamId: TEAM_A } },
  ownLead: { menus: { status: true, complete: false }, teamScope: { workScope: "team", teamId: TEAM_A } },
  otherLead: { menus: { status: true, complete: false }, teamScope: { workScope: "team", teamId: TEAM_B } },
  divisionHead: { menus: { status: true, complete: false }, teamScope: { workScope: "company", teamId: null } },
  ceo: { menus: { status: true, complete: true }, teamScope: { workScope: "company", teamId: null } },
  sysadmin: { menus: { status: true, complete: true }, teamScope: { workScope: "company", teamId: null } },
} satisfies Record<string, Actor>;

type ActorName = keyof typeof ACTORS;
const ACTOR_NAMES = Object.keys(ACTORS) as ActorName[];

const DENIED_PAIR = "갈 수 없는 상태 · 새로 고침";
const NO_MENU = "상태 바꾸기 권한 없음";
const OTHER_TEAM = "다른 팀 프로젝트 · 상태 바꾸기 권한 없음";
const NO_START = "시작일 없음 · 기간 적기";

function projectOf(status: ProjectStatus, startDate: string | null = "2026-10-01") {
  return { status, teamId: TEAM_A, startDate };
}

type Expected = string; // "ok" 또는 거부 이유 문자열

// 전환 × 주체 결정표 — 시작일이 있는 팀 A 프로젝트.
const TRANSITION_TABLE: { from: ProjectStatus; to: ProjectStatus; expect: Record<ActorName, Expected> }[] = [
  {
    from: "bidding",
    to: "in_progress",
    expect: { pm: NO_MENU, ownLead: "ok", otherLead: OTHER_TEAM, divisionHead: "ok", ceo: "ok", sysadmin: "ok" },
  },
  {
    from: "bidding",
    to: "lost",
    expect: { pm: NO_MENU, ownLead: "ok", otherLead: OTHER_TEAM, divisionHead: "ok", ceo: "ok", sysadmin: "ok" },
  },
  {
    from: "lost",
    to: "in_progress",
    expect: { pm: NO_MENU, ownLead: "ok", otherLead: OTHER_TEAM, divisionHead: "ok", ceo: "ok", sysadmin: "ok" },
  },
  {
    from: "settling",
    to: "completed",
    expect: { pm: NO_MENU, ownLead: NO_MENU, otherLead: NO_MENU, divisionHead: NO_MENU, ceo: "ok", sysadmin: "ok" },
  },
];

// 목록 밖 쌍 — 누구든 「갈 수 없는 상태」.
const OUT_OF_TABLE: [ProjectStatus, ProjectStatus][] = [
  ["in_progress", "lost"],
  ["in_progress", "bidding"],
  ["in_progress", "settling"],
  ["settling", "lost"],
  ["settling", "in_progress"],
  ["completed", "in_progress"],
  ["completed", "lost"],
];

describe("evaluateTransition — 전환 × 주체 결정표 (04-20, D-46·D-79·D11)", () => {
  for (const row of TRANSITION_TABLE) {
    for (const actor of ACTOR_NAMES) {
      const expected = row.expect[actor];
      it(`${row.from} → ${row.to} · ${actor} → ${expected}`, async () => {
        const decision = await evaluateTransition(projectOf(row.from), row.to, ACTORS[actor]);
        if (expected === "ok") expect(decision.allowed).toBe(true);
        else expect(decision).toMatchObject({ allowed: false, reason: expected });
      });
    }
  }

  for (const [from, to] of OUT_OF_TABLE) {
    for (const actor of ACTOR_NAMES) {
      it(`목록 밖 ${from} → ${to} · ${actor} → 갈 수 없는 상태`, async () => {
        const decision = await evaluateTransition(projectOf(from), to, ACTORS[actor]);
        expect(decision).toMatchObject({ allowed: false, reason: DENIED_PAIR, rule: "project.transition" });
      });
    }
  }

  it("수주중 → 진행은 시작일이 없으면 「시작일 없음 · 기간 적기」로 막힌다", async () => {
    const decision = await evaluateTransition(projectOf("bidding", null), "in_progress", ACTORS.ownLead);
    expect(decision).toEqual({ allowed: false, rule: "project.start-date-required", reason: NO_START });
  });

  it("미수주 → 진행도 시작일이 없으면 같은 문구로 막힌다", async () => {
    const decision = await evaluateTransition(projectOf("lost", null), "in_progress", ACTORS.divisionHead);
    expect(decision).toEqual({ allowed: false, rule: "project.start-date-required", reason: NO_START });
  });

  it("수주중 → 미수주는 기간 없이 통과하고 종료일을 채우지 않는다", async () => {
    const decision = await evaluateTransition(projectOf("bidding", null), "lost", ACTORS.ownLead);
    expect(decision).toEqual({ allowed: true, fillEndDateFromStart: false });
  });

  it("진행으로 가는 전환은 빈 종료일을 시작일로 채운다", async () => {
    await expect(evaluateTransition(projectOf("bidding"), "in_progress", ACTORS.ownLead)).resolves.toEqual({
      allowed: true,
      fillEndDateFromStart: true,
    });
    await expect(evaluateTransition(projectOf("lost"), "in_progress", ACTORS.ownLead)).resolves.toEqual({
      allowed: true,
      fillEndDateFromStart: true,
    });
  });
});

describe("coversProjectTeam — 업무 범위 (D11·D20)", () => {
  it("전사면 어느 팀이든 참이다", () => {
    expect(coversProjectTeam({ workScope: "company", teamId: null }, TEAM_A)).toBe(true);
    expect(coversProjectTeam({ workScope: "company", teamId: null }, TEAM_B)).toBe(true);
  });

  it("자기 팀이면 같은 팀만 참이다", () => {
    expect(coversProjectTeam({ workScope: "team", teamId: TEAM_A }, TEAM_A)).toBe(true);
    expect(coversProjectTeam({ workScope: "team", teamId: TEAM_A }, TEAM_B)).toBe(false);
  });

  it("자기 팀인데 발령 이력이 없으면 거짓이다", () => {
    expect(coversProjectTeam({ workScope: "team", teamId: null }, TEAM_A)).toBe(false);
  });
});

function roleRow(workScope: string): RoleRow {
  return {
    id: "role-x",
    name: "계급",
    isSeed: true,
    sortOrder: 0,
    workScope,
    customFields: null,
    archivedAt: null,
    archivedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function membershipRow(teamId: string): TeamMembershipRow {
  return {
    id: "m-1",
    userId: "u-1",
    teamId,
    effectiveFrom: "2026-01-01",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    createdBy: null,
  };
}

describe("loadActorTeamScope — 리포지토리 직접 읽기 (ENG-D2)", () => {
  const viewer: Viewer = { id: "u-1", roleId: "role-x" };

  it("전사 계급은 발령 이력을 읽지 않고 company다", async () => {
    let membershipReads = 0;
    const scope = await loadActorTeamScope(viewer, { todayKst: "2026-09-25" }, {
      findRoleById: () => Promise.resolve(roleRow("company")),
      findMembershipAtDate: () => {
        membershipReads++;
        return Promise.resolve(membershipRow(TEAM_A));
      },
    });
    expect(scope).toEqual({ workScope: "company", teamId: null });
    expect(membershipReads).toBe(0);
  });

  it("자기 팀 계급은 오늘 발령 이력의 팀을 돌려준다(그 날짜로 조회)", async () => {
    const asked: string[] = [];
    const scope = await loadActorTeamScope(viewer, { todayKst: "2026-09-25" }, {
      findRoleById: () => Promise.resolve(roleRow("team")),
      findMembershipAtDate: (_v, userId, date) => {
        asked.push(`${userId}@${date}`);
        return Promise.resolve(membershipRow(TEAM_B));
      },
    });
    expect(scope).toEqual({ workScope: "team", teamId: TEAM_B });
    expect(asked).toEqual(["u-1@2026-09-25"]);
  });

  it("자기 팀 계급인데 발령 이력이 없으면 teamId null — 기본 팀으로 떨어지지 않는다", async () => {
    const scope = await loadActorTeamScope(viewer, { todayKst: "2026-09-25" }, {
      findRoleById: () => Promise.resolve(roleRow("team")),
      findMembershipAtDate: () => Promise.resolve(null),
    });
    expect(scope).toEqual({ workScope: "team", teamId: null });
  });
});

describe("statusDestinations — 갈 곳 목록과 막힘 이유 (S3·S7, A-09)", () => {
  const viewer: Viewer = { id: "u-1", roleId: "role-x" };
  const destinations = (status: ProjectStatus, actor: ActorName, startDate: string | null = "2026-10-01") =>
    statusDestinations(viewer, projectOf(status, startDate), { facts: ACTORS[actor] });

  it("수주중 + 자기 팀 팀장 + 시작일 → 진행·미수주, 막힘 없음", async () => {
    await expect(destinations("bidding", "ownLead")).resolves.toEqual([
      { to: "in_progress", blockedReason: null },
      { to: "lost", blockedReason: null },
    ]);
  });

  it("수주중 + 시작일 없음 → 진행의 막힘 이유가 게이트 문자열 그대로다", async () => {
    await expect(destinations("bidding", "ownLead", null)).resolves.toEqual([
      { to: "in_progress", blockedReason: NO_START },
      { to: "lost", blockedReason: null },
    ]);
  });

  it("미수주 + 자기 팀 팀장 → 진행", async () => {
    await expect(destinations("lost", "ownLead")).resolves.toEqual([{ to: "in_progress", blockedReason: null }]);
  });

  it("정산 + 대표·시스템 관리자 → 완료, 팀장·본부 책임자 → 빈 목록", async () => {
    await expect(destinations("settling", "ceo")).resolves.toEqual([{ to: "completed", blockedReason: null }]);
    await expect(destinations("settling", "sysadmin")).resolves.toEqual([{ to: "completed", blockedReason: null }]);
    await expect(destinations("settling", "ownLead")).resolves.toEqual([]);
    await expect(destinations("settling", "divisionHead")).resolves.toEqual([]);
  });

  it("진행·완료는 누구에게도 빈 목록이다 — 정산은 사람이 고르는 목적지가 아니다", async () => {
    for (const actor of ACTOR_NAMES) {
      await expect(destinations("in_progress", actor)).resolves.toEqual([]);
      await expect(destinations("completed", actor)).resolves.toEqual([]);
    }
  });

  it("다른 팀 팀장과 담당 PM은 어느 상태든 빈 목록이다", async () => {
    const statuses: ProjectStatus[] = ["bidding", "in_progress", "settling", "completed", "lost"];
    for (const status of statuses) {
      await expect(destinations(status, "otherLead")).resolves.toEqual([]);
      await expect(destinations(status, "pm")).resolves.toEqual([]);
    }
  });

  it("어떤 입력에서도 정산을 돌려주지 않는다", async () => {
    const statuses: ProjectStatus[] = ["bidding", "in_progress", "settling", "completed", "lost"];
    for (const status of statuses) {
      for (const actor of ACTOR_NAMES) {
        const list = await destinations(status, actor);
        expect(list.map((entry) => entry.to)).not.toContain("settling");
      }
    }
  });
});

describe("statusChangedMessage — 조사 결정표 (DR-6 · rev 5)", () => {
  it.each([
    ["정산", "새로 고침", "상태가 정산으로 바뀜 · 새로 고침"],
    ["완료", "전부 거부", "상태가 완료로 바뀜 · 전부 거부"],
    ["미수주", "새로 고침", "상태가 미수주로 바뀜 · 새로 고침"],
    ["진행", "새로 고침", "상태가 진행으로 바뀜 · 새로 고침"],
    ["수주중", "새로 고침", "상태가 수주중으로 바뀜 · 새로 고침"],
    ["보류 결", "새로 고침", "상태가 보류 결로 바뀜 · 새로 고침"],
  ] as const)("(%s, %s) → %s", (label, tail, expected) => {
    expect(statusChangedMessage(label, tail)).toBe(expected);
  });
});

function codeRow(value: string, label: string, sortOrder: number, extra?: Partial<CodeItemRow>): CodeItemRow {
  return {
    id: `id-${value}`,
    tableKey: "project_status",
    value,
    label,
    description: null,
    sortOrder,
    active: true,
    customFields: {},
    taxRule: null,
    archivedAt: null,
    archivedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...extra,
  };
}

describe("listProjectStatusCatalog — 상태 코드표 목록 (D-93, A-10)", () => {
  const viewer: Viewer = { id: "u-1", roleId: "role-team-lead" };
  const rows = [
    codeRow("bidding", "수주중", 0, { description: "제안 단계" }),
    codeRow("in_progress", "진행", 1),
    codeRow("settling", "정산", 2, { active: false }),
    codeRow("completed", "완료", 3),
    codeRow("lost", "미수주", 4),
    codeRow("on_hold", "보류", 5),
  ];

  it("projects 보기가 있으면 다섯 값만 정렬 순으로, 비활성 값 포함, 설명이 없으면 null", async () => {
    const asked: { includeInactive: boolean }[] = [];
    const catalog = await listProjectStatusCatalog(viewer, {
      can: (_v, menu, action) => Promise.resolve(menu === "projects" && action === "view"),
      listCodeItems: (_v, opts) => {
        asked.push({ includeInactive: opts.includeInactive });
        return Promise.resolve(rows);
      },
    });
    expect(catalog).toEqual([
      { value: "bidding", label: "수주중", description: "제안 단계" },
      { value: "in_progress", label: "진행", description: null },
      { value: "settling", label: "정산", description: null },
      { value: "completed", label: "완료", description: null },
      { value: "lost", label: "미수주", description: null },
    ]);
    expect(asked).toEqual([{ includeInactive: true }]);
  });

  it("projects 보기가 없으면 거부한다", async () => {
    await expect(
      listProjectStatusCatalog(viewer, {
        can: () => Promise.resolve(false),
        listCodeItems: () => Promise.resolve(rows),
      }),
    ).rejects.toThrow();
  });
});

describe("lastStatusChangeOn — 부제의 마지막 변경일 (04-21, D-50)", () => {
  const viewer: Viewer = { id: "u-1", roleId: "role-team-lead" };
  const project = { id: "p-1", createdAt: new Date("2026-09-01T16:00:00Z") };

  it("최신 status_change 로그의 KST 날짜 — 2026-09-17T15:30Z는 2026-09-18이다", async () => {
    const asked: unknown[] = [];
    const on = await lastStatusChangeOn(viewer, project, {
      findLatestActionFor: (_v, query) => {
        asked.push(query);
        return Promise.resolve({ occurredAt: new Date("2026-09-17T15:30:00Z") });
      },
    });
    expect(on).toBe("2026-09-18");
    expect(asked).toEqual([{ entity: "project", entityId: "p-1", actionType: "status_change" }]);
  });

  it("로그가 없으면 등록일(created_at)의 KST 날짜", async () => {
    const on = await lastStatusChangeOn(viewer, project, { findLatestActionFor: () => Promise.resolve(null) });
    expect(on).toBe("2026-09-02");
  });
});

// CEO A-35 — 옛 네 상태 모델의 잠금 값이 코드에 문자열 리터럴로 남지 않는다(D-75).
// 따옴표 세 종류로 감싼 값만 잡는다 — 식별자(settledAt)·주석 속 낱말은 걸리지 않는다.
// 마이그레이션 파일(db/)은 스캔 대상이 아니다.
const OLD_LOCK_LITERAL = /['"`]settled['"`]/;
const SCAN_ROOTS = ["app", "domain", "repositories"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("옛 잠금 상태 값 리터럴 스캔 (04-21, D-75 · A-35)", () => {
  it("정규식은 따옴표로 감싼 값만 잡는다", () => {
    expect(OLD_LOCK_LITERAL.test(`status: "settled"`)).toBe(true);
    expect(OLD_LOCK_LITERAL.test("value: 'settled'")).toBe(true);
    expect(OLD_LOCK_LITERAL.test("`settled`")).toBe(true);
    expect(OLD_LOCK_LITERAL.test("row.settledAt")).toBe(false);
    expect(OLD_LOCK_LITERAL.test("// settled 모델은 지웠다")).toBe(false);
  });

  it("app·domain·repositories의 .ts·.tsx에 옛 잠금 값 리터럴이 없다", () => {
    const offenders = SCAN_ROOTS.flatMap((root) => sourceFiles(join(process.cwd(), root)))
      .filter((file) => OLD_LOCK_LITERAL.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(process.cwd().length + 1));
    expect(offenders).toEqual([]);
  });
});
