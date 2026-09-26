import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attributionLabel,
  bucketTotal,
  exclusionText,
  formatListPeriod,
  isUserFiltered,
  listEmptyKind,
  normalizeListParams,
  parseListPeriod,
  periodOverlapsYear,
  profitBasisFor,
  reconcileListYear,
  resolveListRange,
  totalsTitle,
  yearOptions,
} from "@/domain/projects/list-view";
import { loadProjectList } from "@/domain/projects";
import { PROJECT_STATUSES } from "@/domain/projects/status-transitions";
import { log } from "@/lib/log";
import { LIST_PAGE_SIZE, pageCountFrom } from "@/lib/paging";
import type { ProjectAggregateBucket } from "@/repositories/projects";

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
          scope: () => Promise.resolve({ rows: "all", includeArchived: false }),
          settle: () => Promise.resolve(),
          repo: {
            aggregate: () => Promise.reject(failure),
            listPage: () => Promise.resolve([]),
          },
        },
      ),
    ).rejects.toBe(failure);

    const listFailed = errorSpy.mock.calls.filter(([event]) => event === "project.list_failed");
    expect(listFailed).toEqual([["project.list_failed", { code: "57014" }]]);
  });
});

describe("bucketTotal — 귀속 구간 건수 합(C-01)", () => {
  it("구간 건수를 숫자로 더한다 — 문자열 이어 붙이기가 아니다", () => {
    const total = bucketTotal([{ count: 30 }, { count: 25 }, { count: 1 }]);
    expect(total).toBe(56);
    expect(pageCountFrom(total, LIST_PAGE_SIZE)).toBe(2);
  });
});

describe("loadProjectList — 번호 페이지 읽기 순서(C-23 · A-07)", () => {
  const bucket = (name: string, count: number): ProjectAggregateBucket => ({
    bucket: name,
    count,
    revenueKrw: 0,
    quoteAmountKrw: 0,
    executionAmountKrw: 0,
    profitKrw: 0,
    basisAmountKrw: 0,
    profitRate: null,
  });

  function stubDeps(buckets: ProjectAggregateBucket[]) {
    const calls: string[] = [];
    const pages: { offset: number; limit: number }[] = [];
    const deps = {
      now: () => new Date("2026-09-26T00:00:00Z"),
      settle: () => {
        calls.push("settle");
        return Promise.resolve();
      },
      scope: () => {
        calls.push("scope");
        return Promise.resolve({ rows: "all" as const, includeArchived: false });
      },
      repo: {
        aggregate: () => {
          calls.push("aggregate");
          return Promise.resolve(buckets);
        },
        listPage: (_viewer: unknown, options: { offset: number; limit: number }) => {
          calls.push("listPage");
          pages.push({ offset: options.offset, limit: options.limit });
          return Promise.resolve([]);
        },
      },
    };
    return { calls, pages, deps };
  }

  // 계급 없는 viewer — 투영이 노출표를 조회하지 않는다(DB 없이 순서만 본다).
  const viewer = { id: "u1", roleId: "" };

  it("판정 → 집계 → 쪽 보정 → 목록 순으로 읽고, 범위 밖 번호는 마지막 쪽의 OFFSET으로 읽는다", async () => {
    const { calls, pages, deps } = stubDeps([bucket("in", 30), bucket("2027", 25), bucket("undetermined", 1)]);

    const result = await loadProjectList(viewer, { page: "99" }, deps);

    expect(calls).toEqual(["settle", "scope", "aggregate", "listPage"]);
    expect(pages).toEqual([{ offset: 50, limit: LIST_PAGE_SIZE }]);
    expect(result.total).toBe(56);
    expect(result.page).toBe(2);
    expect(result.pageCount).toBe(2);
  });

  it("숫자가 아닌 쪽 번호는 1쪽이다", async () => {
    const { pages, deps } = stubDeps([bucket("in", 120)]);

    const result = await loadProjectList(viewer, { page: "abc" }, deps);

    expect(pages).toEqual([{ offset: 0, limit: LIST_PAGE_SIZE }]);
    expect(result.page).toBe(1);
    expect(result.pageCount).toBe(3);
  });

  it("0건이면 목록 행을 읽지 않는다", async () => {
    const { calls, deps } = stubDeps([]);

    const result = await loadProjectList(viewer, {}, deps);

    // 04-48 — 0건일 때만 필터 없는 건수 조회(집계 한 번 더)로 빈 갈래를 가린다. 목록 행은 읽지 않는다.
    expect(calls).toEqual(["settle", "scope", "aggregate", "aggregate"]);
    expect(result.emptyKind).toBe("none");
    expect(result.rows).toEqual([]);
    expect(result.page).toBe(1);
    expect(result.pageCount).toBe(0);
  });
});

// 04-48 Task 1(UX-04 · CEO C-08) — 목록 기간 필터 두 칸의 서버 판정. 오류가 하나라도 있으면 기간 전체를 적용하지 않는다.
describe("parseListPeriod — 목록 기간 필터 판정", () => {
  const FORMAT = "날짜 형식이 아닙니다 · 2026-09-18처럼 적어 주세요";
  const REVERSED = "기간이 거꾸로입니다 · 앞 날짜를 먼저 적어 주세요";

  it("올바른 두 날짜는 기간 둘이고 오류가 없다", () => {
    expect(parseListPeriod("2026-09-01", "2026-10-31")).toEqual({
      period: { from: "2026-09-01", to: "2026-10-31" },
      errors: {},
    });
  });

  it("한쪽만 적으면 그쪽만 있는 열린 기간이다", () => {
    expect(parseListPeriod("", "2026-10-31")).toEqual({ period: { to: "2026-10-31" }, errors: {} });
  });

  it("자릿수가 틀린 날짜는 그 칸의 형식 오류이고 기간이 없다", () => {
    expect(parseListPeriod("2026-9-1", "")).toEqual({ period: null, errors: { from: FORMAT } });
  });

  it("달력에 없는 날은 형식 오류다", () => {
    expect(parseListPeriod("2026-02-30", "")).toEqual({ period: null, errors: { from: FORMAT } });
  });

  it("2000–2100 밖의 연도는 형식 오류다(C-08 — PG 날짜 오류로 가지 않는다)", () => {
    expect(parseListPeriod("0000-01-01", "")).toEqual({ period: null, errors: { from: FORMAT } });
    expect(parseListPeriod("", "2101-01-01")).toEqual({ period: null, errors: { to: FORMAT } });
  });

  it("거꾸로면 종료 칸의 거꾸로 오류이고 기간이 없다", () => {
    expect(parseListPeriod("2026-10-31", "2026-09-01")).toEqual({ period: null, errors: { to: REVERSED } });
  });

  it("둘 다 비면 기간도 오류도 없다", () => {
    expect(parseListPeriod("", "")).toEqual({ period: null, errors: {} });
    expect(parseListPeriod(undefined, undefined)).toEqual({ period: null, errors: {} });
  });
});

// 04-48 Task 2(CEO C-08) — URL 파라미터 정규화: 배열이면 첫 값, teamId는 uuid 모양 + 고를 수 있는 팀, 연도는 all 또는 2000–2100.
describe("normalizeListParams — 틀린 URL 파라미터는 기본 보기로", () => {
  const teamIds = ["11111111-1111-4111-8111-111111111111"];

  it("uuid가 아닌 팀 · 범위 밖 연도 · 배열 상태를 정규화하고 쪽 번호는 그대로 둔다", () => {
    expect(
      normalizeListParams({ teamId: "abc", year: "0000", status: ["in_progress", "settling"], page: "2" }, { teamIds, thisYear: 2026 }),
    ).toEqual({ teamId: undefined, year: 2026, status: "in_progress", page: "2" });
  });

  it("목록에 없는 uuid 팀은 전체 팀이고 목록에 있는 팀은 그대로다", () => {
    expect(normalizeListParams({ teamId: "22222222-2222-4222-8222-222222222222" }, { teamIds, thisYear: 2026 }).teamId).toBeUndefined();
    expect(normalizeListParams({ teamId: teamIds[0] }, { teamIds, thisYear: 2026 }).teamId).toBe(teamIds[0]);
  });

  it("연도는 all · 2000–2100 정수만, 그 밖은 올해다", () => {
    const year = (raw: string | number | undefined) => normalizeListParams({ year: raw }, { teamIds, thisYear: 2026 }).year;
    expect(year("all")).toBe("all");
    expect(year("2031")).toBe(2031);
    expect(year(2025)).toBe(2025);
    expect(year("99999")).toBe(2026);
    expect(year("1999")).toBe(2026);
    expect(year("20a6")).toBe(2026);
    expect(year(undefined)).toBe(2026);
  });

  it("검색어 · 기간 · 빈 값은 첫 값이고 빈 문자열은 없는 값이다", () => {
    expect(normalizeListParams({ q: ["가", "나"], from: "", to: ["2026-10-31"] }, { teamIds, thisYear: 2026 })).toEqual({
      year: 2026,
      q: "가",
      to: "2026-10-31",
    });
  });
});

describe("isUserFiltered — 기본 보기(올해 · 전체 상태 · 전체 팀)와 다른 값", () => {
  it("올해 연도 값은 필터로 세지 않는다", () => {
    expect(isUserFiltered({ year: 2026 }, 2026)).toBe(false);
  });

  it("전체 연도 · 다른 해 · 상태 · 팀 · 검색어 · 기간 값(형식 오류여도)은 필터다", () => {
    expect(isUserFiltered({ year: "all" }, 2026)).toBe(true);
    expect(isUserFiltered({ year: 2025 }, 2026)).toBe(true);
    expect(isUserFiltered({ year: 2026, status: "bidding" }, 2026)).toBe(true);
    expect(isUserFiltered({ year: 2026, teamId: "t" }, 2026)).toBe(true);
    expect(isUserFiltered({ year: 2026, q: "x" }, 2026)).toBe(true);
    expect(isUserFiltered({ year: 2026, from: "2026-9-1" }, 2026)).toBe(true);
  });
});

describe("listEmptyKind — 빈 목록 세 갈래", () => {
  it("행이 있으면 빈 갈래가 없다", () => {
    expect(listEmptyKind({ total: 3, userFiltered: false, visibleCount: 3 })).toBeNull();
  });

  it("볼 수 있는 프로젝트가 하나도 없으면 none이다", () => {
    expect(listEmptyKind({ total: 0, userFiltered: false, visibleCount: 0 })).toBe("none");
  });

  it("사용자 필터 없이 다른 해에만 프로젝트가 있으면 default-view다", () => {
    expect(listEmptyKind({ total: 0, userFiltered: false, visibleCount: 4 })).toBe("default-view");
  });

  it("사용자 필터가 있으면 filtered다", () => {
    expect(listEmptyKind({ total: 0, userFiltered: true, visibleCount: 4 })).toBe("filtered");
  });
});

// 엔지 리뷰 C 공백 10 — 창 밖이지만 유효한 요청 연도는 선택지에 더해 선택된 채 보인다.
describe("yearOptions — 연도 선택지", () => {
  it("창 밖 요청 연도를 더해 내림차순이다", () => {
    expect(yearOptions(2026, 2031)).toEqual([2031, 2027, 2026, 2025, 2024, 2023]);
  });

  it("창 안 연도 · 전체 연도는 기본 창 그대로다", () => {
    expect(yearOptions(2026, 2025)).toEqual([2027, 2026, 2025, 2024, 2023]);
    expect(yearOptions(2026, "all")).toEqual([2027, 2026, 2025, 2024, 2023]);
  });
});

describe("formatListPeriod — 목록 기간 칸 서식(D-89)", () => {
  it("같은 해이고 보기 연도면 월-일만", () => {
    expect(formatListPeriod("2026-09-12", "2026-09-16", 2026)).toBe("09-12 ~ 09-16");
  });

  it("같은 해지만 보기 연도가 다르거나 없으면 시작만 연도를 적는다", () => {
    expect(formatListPeriod("2025-03-01", "2025-03-05", 2026)).toBe("2025-03-01 ~ 03-05");
    expect(formatListPeriod("2025-03-01", "2025-03-05", null)).toBe("2025-03-01 ~ 03-05");
  });

  it("해를 걸치면 연월만", () => {
    expect(formatListPeriod("2026-11-10", "2027-02-05", 2026)).toBe("2026-11 ~ 2027-02");
  });

  it("한쪽만 있으면 없는 쪽이 —이고 둘 다 없으면 —다", () => {
    expect(formatListPeriod("2026-09-12", null, 2026)).toBe("09-12 ~ —");
    expect(formatListPeriod(null, "2025-09-16", 2026)).toBe("— ~ 2025-09-16");
    expect(formatListPeriod(null, null, 2026)).toBe("—");
  });
});

// DR-30 — 연도와 기간의 겹침 · 연도 자동 전환.
describe("periodOverlapsYear — 기간과 연도 겹침", () => {
  it("다른 해 기간은 겹치지 않고 그 해와는 겹친다", () => {
    expect(periodOverlapsYear({ from: "2025-01-01", to: "2025-03-01" }, 2026)).toBe(false);
    expect(periodOverlapsYear({ from: "2025-01-01", to: "2025-03-01" }, 2025)).toBe(true);
  });

  it("해를 걸친 기간은 걸친 해와 겹친다", () => {
    expect(periodOverlapsYear({ from: "2025-11-01", to: "2026-02-01" }, 2026)).toBe(true);
  });

  it("열린 기간은 열린 쪽을 끝없이 본다", () => {
    expect(periodOverlapsYear({ from: "2027-03-01" }, 2026)).toBe(false);
    expect(periodOverlapsYear({ to: "2026-01-01" }, 2026)).toBe(true);
  });

  it("기간이 없거나 전체 연도면 늘 겹친다", () => {
    expect(periodOverlapsYear(null, 2026)).toBe(true);
    expect(periodOverlapsYear({ from: "2025-01-01", to: "2025-03-01" }, "all")).toBe(true);
  });
});

describe("reconcileListYear — 연도 자동 전환(DR-30)", () => {
  it("같은 해 기간이 선택 연도 밖이면 그 해로 바꾼다", () => {
    expect(reconcileListYear({ year: "2026", from: "2025-01-01", to: "2025-03-01" })).toBe("2025");
  });

  it("해를 걸치거나 한쪽이 열린 기간이 겹치지 않으면 전체 연도다", () => {
    expect(reconcileListYear({ year: "2024", from: "2025-11-01", to: "2026-02-01" })).toBe("all");
    expect(reconcileListYear({ year: "2026", from: "2027-03-01", to: "" })).toBe("all");
  });

  it("겹치거나 · 전체 연도거나 · 형식 오류거나 · 기간이 없으면 바꾸지 않는다", () => {
    expect(reconcileListYear({ year: "2026", from: "2026-09-01", to: "2026-10-31" })).toBeNull();
    expect(reconcileListYear({ year: "all", from: "2025-01-01", to: "2025-03-01" })).toBeNull();
    expect(reconcileListYear({ year: "2026", from: "2025-1-1", to: "2025-03-01" })).toBeNull();
    expect(reconcileListYear({ year: "2026", from: "", to: "" })).toBeNull();
  });

  it("멱등 — 돌려준 연도를 다시 넣으면 바꿀 것이 없다", () => {
    const cases = [
      { year: "2026", from: "2025-01-01", to: "2025-03-01" },
      { year: "2024", from: "2025-11-01", to: "2026-02-01" },
      { year: "2026", from: "2027-03-01", to: "" },
    ];
    for (const input of cases) {
      const next = reconcileListYear(input);
      expect(next).not.toBeNull();
      expect(reconcileListYear({ ...input, year: next ?? "" })).toBeNull();
    }
  });
});
