import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectsFilterBar } from "@/app/(app)/projects/filter-bar";

// 04-48 Opus 검토 SF-2 — iOS numeric 키패드에는 `-`가 없어 `2026-09-18`을 칠 수 없다. 목록 기간 두 칸은 기본 텍스트 키보드다.
describe("ProjectsFilterBar — 기간 두 칸 키보드", () => {
  const html = renderToStaticMarkup(
    createElement(ProjectsFilterBar, {
      teams: [],
      statusOptions: [],
      yearOptions: [2026],
      defaultValues: { year: "2026" },
      hasFilter: false,
    }),
  );

  it("기간 시작 · 끝 칸에 inputmode가 없다", () => {
    const from = /<input[^>]*id="from"[^>]*>/.exec(html)?.[0];
    const to = /<input[^>]*id="to"[^>]*>/.exec(html)?.[0];
    expect(from).toBeDefined();
    expect(to).toBeDefined();
    expect(from).not.toMatch(/inputmode/i);
    expect(to).not.toMatch(/inputmode/i);
  });
});

// 07.5-04(D-7510 · UI-SPEC S5) — 추가 칸 선택 거르개: 「기간」 뒤 기존 select 꼴 · 라벨 = 칸 이름 · 첫 옵션 「전체 {칸 이름}」 · 활성 선택지 순서 · 폰 요약 조각.
describe("ProjectsFilterBar — 추가 칸 거르개", () => {
  const render = (props: Partial<Parameters<typeof ProjectsFilterBar>[0]>) =>
    renderToStaticMarkup(
      createElement(ProjectsFilterBar, { teams: [], statusOptions: [], yearOptions: [2026], defaultValues: { year: "2026" }, hasFilter: false, ...props }),
    );
  // CSS 모듈 클래스는 해시가 붙는다(`_filterSummaryPart_xxxx`).
  const summaryParts = (html: string) => [...html.matchAll(/<span class="[^"]*filterSummaryPart[^"]*">([^<]*)<\/span>/g)].map((match) => match[1]);
  const filters = [
    { key: "cf_kind", label: "행사 구분", options: ["행사", "전시", "프로모션"] },
    { key: "cf_area", label: "지역", options: ["서울", "부산"] },
  ];

  it("정의 2개 → select 2개가 「기간」 뒤에 이름 cf_<key> · 라벨 = 칸 이름 · 첫 옵션 「전체 {칸 이름}」 · 활성 선택지 순서", () => {
    const html = render({ customFilters: filters });
    const selects = [...html.matchAll(/<select[^>]*name="(cf_[^"]+)"[^>]*>(.*?)<\/select>/g)];
    expect(selects.map((match) => match[1])).toEqual(["cf_cf_kind", "cf_cf_area"]);
    expect(html.indexOf('name="cf_cf_kind"')).toBeGreaterThan(html.indexOf('id="from"'));
    const kindOptions = [...(selects[0]?.[2] ?? "").matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((match) => [match[1], match[2]]);
    expect(kindOptions).toEqual([
      ["", "전체 행사 구분"],
      ["행사", "행사"],
      ["전시", "전시"],
      ["프로모션", "프로모션"],
    ]);
    const id = /<select[^>]*id="([^"]+)"[^>]*name="cf_cf_kind"/.exec(html)?.[1];
    expect(id).toBeDefined();
    expect(html).toContain(`<label for="${id}">행사 구분</label>`);
  });

  it("고른 값은 select의 값이고 폰 요약 조각 `{칸 이름} {값}`이다", () => {
    const html = render({ customFilters: filters, defaultValues: { year: "2026", custom: { cf_kind: "행사" } } });
    expect(html).toMatch(/<option value="행사" selected="">행사<\/option>/);
    expect(summaryParts(html)).toEqual(["2026", "전체 상태", "전체 팀", "행사 구분 행사"]);
    expect(html).not.toContain("지역 ");
  });

  it("정의 0개 → 추가 칸 select 0 · 요약 무변경", () => {
    const html = render({});
    expect(html).not.toMatch(/name="cf_/);
    expect(summaryParts(html)).toEqual(["2026", "전체 상태", "전체 팀"]);
  });
});
