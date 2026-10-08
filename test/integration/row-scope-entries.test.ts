import { beforeAll, describe, expect, it } from "vitest";
import type { Viewer } from "@/domain/viewer";
import { loadProjectList } from "@/domain/projects";
import { resetDatabase, skipDbReset } from "./setup";
import {
  buildViewScopeWorld,
  VIEW_SCOPE_PEOPLE,
  VIEW_SCOPE_PROJECTS,
  type ViewScopePerson,
  type ViewScopeProject,
  type ViewScopeWorld,
} from "./fixtures/view-scope";

// 06.2-03(SC-1 · SC-2 · D-6205 ① · ③ · D-6206 · D-6207 · D-6208): 사람 × 입구 × 보임/숨김 매트릭스.
// 케이스는 ENTRIES × VIEW_SCOPE_PEOPLE를 flatMap으로만 만든다(정렬 · 셔플 없음) — 입구가 빠지면 하한 단언이 붉어진다.
// 세계는 한 번만 만든다(케이스마다 TRUNCATE + 시드는 느리다) — 매트릭스 입구는 세계를 바꾸지 않는다.
// K1(사용자 답 「쓰기 범위 복사」): 화면팀(work_scope team · projects 보기)은 view_scope team → {P1}(플랜 원문의 {P1, P2, P3}가 아니다).

skipDbReset();
let w: ViewScopeWorld;
beforeAll(async () => {
  await resetDatabase();
  w = await buildViewScopeWorld();
}, 120_000);

// 정의상 보이는 프로젝트(오늘 KST 발령 기준). 팀PM: 자기 팀 · 본부장: 기획본부 팀 둘 · 대표: 전부 · 본인범위: PM · 참여 없음
// · 참여자: 자기 팀 + 참여 P3 · X: PM P2 + 자기 팀 P3 · 무소속: 팀 없음(PM · 참여 없음) · 메뉴없음: 보기 권한 없음 · 화면팀: 자기 팀(K1).
const VISIBLE: Record<ViewScopePerson, readonly ViewScopeProject[]> = {
  팀PM: ["P1"],
  본부장: ["P1", "P2"],
  대표: ["P1", "P2", "P3"],
  본인범위: [],
  참여자: ["P1", "P3"],
  X: ["P2", "P3"],
  무소속: [],
  메뉴없음: [],
  화면팀: ["P1"],
};

type Entry = {
  name: string;
  probe: (viewer: Viewer, world: ViewScopeWorld) => Promise<unknown>;
  expected: (visible: readonly ViewScopeProject[], world: ViewScopeWorld, person: ViewScopePerson) => unknown;
};

function idsOf(world: ViewScopeWorld, keys: readonly ViewScopeProject[]): string[] {
  return keys.map((key) => world.projects[key].id).sort();
}

const ENTRIES: Entry[] = [
  {
    name: "프로젝트 목록",
    probe: async (viewer) => (await loadProjectList(viewer, {})).rows.map((row) => row.id).sort(),
    expected: (visible, world) => idsOf(world, visible),
  },
  {
    name: "프로젝트 검색(q = P3 이름)",
    probe: async (viewer, world) => (await loadProjectList(viewer, { search: world.projects.P3.name })).rows.map((row) => row.id).sort(),
    expected: (visible, world) => idsOf(world, visible.filter((key) => key === "P3")),
  },
  {
    name: "프로젝트 합계(건수 = 목록 건수)",
    probe: async (viewer) => {
      const list = await loadProjectList(viewer, {});
      return { total: list.total, count: list.totals.count, rows: list.rows.length };
    },
    expected: (visible) => ({ total: visible.length, count: visible.length, rows: visible.length }),
  },
];

const cases = ENTRIES.flatMap((entry) => VIEW_SCOPE_PEOPLE.map((person) => ({ entry, person, label: `${entry.name} × ${person}` })));

describe("행 범위 매트릭스 (06.2-03)", () => {
  it("케이스 하한 — 입구 × 사람 아홉", () => {
    expect(VIEW_SCOPE_PEOPLE).toHaveLength(9);
    expect(VIEW_SCOPE_PROJECTS).toHaveLength(3);
    expect(cases.length).toBeGreaterThanOrEqual(3 * 9);
  });

  it.each(cases)("$label", async ({ entry, person }) => {
    const actual = await entry.probe(w.people[person], w);
    expect(actual).toEqual(entry.expected(VISIBLE[person], w, person));
  });
});
