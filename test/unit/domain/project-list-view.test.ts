import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attributionLabel,
  exclusionText,
  profitBasisFor,
  resolveListRange,
  totalsTitle,
} from "@/domain/projects/list-view";
import { loadProjectList } from "@/domain/projects";
import { PROJECT_STATUSES } from "@/domain/projects/status-transitions";
import { log } from "@/lib/log";

// 04-17(D-88 · D-89 · D-90 · 계약 7) — 목록 보기 범위 · 귀속 · 합계 제목 · 제외 문구 · 수익금 기준의 순수 함수.
// 실제 SQL(겹침 · 귀속 구간 · 기준 식)은 test/integration/projects-list.test.ts가 본다.

describe("resolveListRange — 보기 범위 R", () => {
  it("연도 보기는 그 해 1월 1일 ~ 12월 31일이다", () => {
    expect(resolveListRange({ year: 2026 })).toEqual({ start: "2026-01-01", end: "2026-12-31", kind: "year", year: 2026 });
  });

  it("전체 연도는 범위가 없다", () => {
    expect(resolveListRange({ year: "all" })).toBeNull();
  });

  it("연도와 기간이 함께면 둘의 교집합이고 기간 보기다", () => {
    expect(resolveListRange({ year: 2026, period: { from: "2026-09-01" } })).toEqual({
      start: "2026-09-01",
      end: "2026-12-31",
      kind: "period",
    });
  });
});

describe("attributionLabel — 기간 칸 2행 귀속 라벨", () => {
  const year2026 = resolveListRange({ year: 2026 });
  const period = { start: "2026-09-01", end: "2026-10-31", kind: "period" as const };

  it("연도 보기에서 다음 해에 끝나면 그 해 귀속이다", () => {
    expect(attributionLabel({ endDate: "2027-02-10", range: year2026 })).toBe("2027 귀속");
  });

  it("기간 보기에서 범위 밖에 끝나면 종료 연월 귀속이다", () => {
    expect(attributionLabel({ endDate: "2026-11-20", range: period })).toBe("2026-11 귀속");
  });

  it("종료일이 범위 안이면 라벨이 없다", () => {
    expect(attributionLabel({ endDate: "2026-12-31", range: year2026 })).toBeNull();
  });

  it("종료일이 없으면 라벨이 없다", () => {
    expect(attributionLabel({ endDate: null, range: year2026 })).toBeNull();
  });

  it("범위가 없으면(전체 연도) 라벨이 없다", () => {
    expect(attributionLabel({ endDate: "2027-02-10", range: null })).toBeNull();
  });
});

describe("exclusionText — 합계 줄 오른쪽 제외 문구", () => {
  it("연도 보기는 해 오름차순 뒤 기간 미정이다", () => {
    expect(exclusionText({ kind: "year", byYear: { 2027: 3, 2025: 1 }, undetermined: 5 })).toBe(
      "2025 귀속 1건 제외 · 2027 귀속 3건 제외 · 기간 미정 5건 제외",
    );
  });

  it("기간 보기는 기간 밖 귀속 건수 하나로 적는다", () => {
    expect(exclusionText({ kind: "period", outside: 2 })).toBe("기간 밖 귀속 2건 제외");
  });

  it("0건인 제외 표시는 쓰지 않는다", () => {
    expect(exclusionText({ kind: "year", byYear: { 2027: 0 }, undetermined: 0 })).toBeNull();
    expect(exclusionText({ kind: "year", byYear: { 2027: 2 }, undetermined: 0 })).toBe("2027 귀속 2건 제외");
  });

  it("건수에 쉼표가 붙고 연도에는 붙지 않는다", () => {
    expect(exclusionText({ kind: "year", byYear: { 2027: 1250 } })).toBe("2027 귀속 1,250건 제외");
  });
});

describe("totalsTitle — 합계 줄 괄호 라벨", () => {
  it("상태 필터 · 연도 귀속 · 건수", () => {
    expect(totalsTitle({ statusLabel: "진행", range: resolveListRange({ year: 2026 }), count: 12 })).toBe(
      "합계 (진행 · 2026 귀속 · 12건)",
    );
  });

  it("전체 상태는 상태를 생략한다 · 전체 연도", () => {
    expect(totalsTitle({ range: null, count: 125 })).toBe("합계 (전체 연도 · 125건)");
  });

  it("기간 보기는 기간을 적고 열린 쪽은 —다", () => {
    expect(totalsTitle({ range: { start: "2026-09-01", end: "2026-10-31", kind: "period" }, count: 12 })).toBe(
      "합계 (2026-09-01 ~ 2026-10-31 귀속 · 12건)",
    );
    expect(totalsTitle({ range: { start: "2026-09-01", kind: "period" }, count: 3 })).toBe("합계 (2026-09-01 ~ — 귀속 · 3건)");
  });

  it("건수에 쉼표가 붙는다", () => {
    expect(totalsTitle({ range: null, count: 1250 })).toBe("합계 (전체 연도 · 1,250건)");
  });
});

describe("profitBasisFor — 수익금 기준(교차 그룹 계약 7 · DR-8 · DR-38)", () => {
  it("수주중 · 진행 · 미수주는 발행 줄이 있어도 견적 기준이다(부분 발행이 기준을 바꾸지 않는다)", () => {
    expect(profitBasisFor("bidding", 2)).toBe("quote");
    expect(profitBasisFor("in_progress", 2)).toBe("quote");
    expect(profitBasisFor("lost", 1)).toBe("quote");
  });

  it("정산 · 완료이고 발행 줄이 1개 이상이면 발행 기준이다", () => {
    expect(profitBasisFor("settling", 1)).toBe("issued");
    expect(profitBasisFor("completed", 3)).toBe("issued");
  });

  it("정산 · 완료라도 발행 줄이 0개면 견적 기준이다", () => {
    expect(profitBasisFor("settling", 0)).toBe("quote");
    expect(profitBasisFor("completed", 0)).toBe("quote");
  });

  it("발행 줄이 0이면 어떤 상태든 견적 기준이다", () => {
    for (const status of PROJECT_STATUSES) expect(profitBasisFor(status, 0)).toBe("quote");
  });
});

describe("loadProjectList — 목록 읽기 실패의 운영 로그(엔지 리뷰 C 공백 7)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("집계가 던지면 project.list_failed를 PG 코드만 담아 한 번 남기고 같은 오류를 다시 던진다", async () => {
    const failure = new Error("Failed query", { cause: Object.assign(new Error("canceling statement"), { code: "57014" }) });
    const errorSpy = vi.spyOn(log, "error").mockImplementation(() => {});

    await expect(
      loadProjectList(
        { id: "u1", roleId: "role-pm" },
        { search: "비밀 검색어" },
        {
          now: () => new Date("2026-09-26T00:00:00Z"),
          scope: async () => ({ rows: "all", includeArchived: false }),
          settle: async () => {},
          repo: {
            aggregate: async () => {
              throw failure;
            },
            listPage: async () => [],
          },
        },
      ),
    ).rejects.toBe(failure);

    const listFailed = errorSpy.mock.calls.filter(([event]) => event === "project.list_failed");
    expect(listFailed).toEqual([["project.list_failed", { code: "57014" }]]);
  });
});
