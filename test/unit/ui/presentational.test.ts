import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Num } from "../../../ui/num/Num";
import { RowAction, RowActions, rowActionClickHandler, type RowActionProps } from "../../../ui/row-actions/RowActions";
import { StaticTable } from "../../../ui/table/StaticTable";
import { Table } from "../../../ui/table/Table";
import { TableSkeleton } from "../../../ui/table/TableSkeleton";
import type { ColumnPriority, TableColumn } from "../../../ui/table/types";

// 04.6-05 — 공용 표현 컴포넌트(Num · RowActions · TableSkeleton · StaticTable). jsdom 없이 정적 렌더와 소스 계약으로 본다
// (table-header-sort.test.ts 선례). 동작(클릭·포커스)은 순수 도우미 단위 + 화면 플랜 E2E가 잰다.

const ROOT = process.cwd();
const source = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const html = (node: ReactNode): string => renderToStaticMarkup(node);

describe("Num — 숫자 표기(SC 8)", () => {
  it("원화는 쉼표 · 음수 기호 위치가 lib/format-number와 같다", () => {
    expect(html(createElement(Num, { value: 1234567 }))).toContain(">1,234,567<");
    expect(html(createElement(Num, { value: -1234567 }))).toContain(">-1,234,567<");
  });

  it("unit이 서식을 고른다 — 수량 · 건수 · 비율", () => {
    expect(html(createElement(Num, { value: 1.5, unit: "quantity" }))).toContain(">1.5<");
    expect(html(createElement(Num, { value: 12345, unit: "count" }))).toContain(">12,345<");
    expect(html(createElement(Num, { value: 12.34, unit: "percent" }))).toContain(">12.3%<");
  });

  it("값이 없으면 —", () => {
    expect(html(createElement(Num, { value: null }))).toContain(">—<");
  });

  it("글자 값은 서식 없이 그대로 두고 숫자 칸 모양만 입힌다 — 일시 · 번호 문자열(04.6-20)", () => {
    const out = html(createElement(Num, { value: "2026-09-24 03:14", fx: { currency: "USD", amount: 1, rate: 1300 } }));
    expect(out).toContain(">2026-09-24 03:14<");
    expect(out).not.toContain("USD");
  });

  it("외화 금액은 통화 코드 + 소수 2자리", () => {
    expect(html(createElement(Num, { value: 4400, currency: "USD" }))).toContain(">USD 4,400.00<");
  });

  it("fx는 원화 1행 + 외화 2행 — 2행은 `통화 금액`과 `@환율` 두 묶음", () => {
    const markup = html(createElement(Num, { value: 5800000, fx: { currency: "USD", amount: 4400, rate: 1318.18 } }));
    expect(markup).toContain(">5,800,000<");
    expect(markup).toContain(">USD 4,400.00<");
    expect(markup).toContain(">@1,318.18<");
    expect(markup.indexOf("5,800,000")).toBeLessThan(markup.indexOf("USD 4,400.00"));
    expect(markup.indexOf("USD 4,400.00")).toBeLessThan(markup.indexOf("@1,318.18"));
  });

  it("KRW fx는 2행이 없다(formatForeignLine과 같은 규칙)", () => {
    const markup = html(createElement(Num, { value: 5800000, fx: { currency: "KRW", amount: 5800000, rate: 1 } }));
    expect(markup).not.toContain("@");
  });

  it("서버 컴포넌트에서 쓸 수 있다 — 지시문 · 훅 없음", () => {
    const code = source("ui/num/Num.tsx");
    expect(code).not.toMatch(/["']use client["']/);
    expect(code).not.toMatch(/\buse[A-Z][A-Za-z]*\(/);
  });

  it("tabular-nums · 자간 0 · 줄바꿈 없음은 Num.module.css에만 있다", () => {
    const css = source("ui/num/Num.module.css");
    expect(css).toContain("font-variant-numeric: tabular-nums");
    expect(css).toMatch(/letter-spacing:\s*0\s*;/);
    expect(css).toMatch(/white-space:\s*nowrap/);
  });
});

type NumberRow = { id: string; amount: number; label: string };

describe("Table — 숫자 열이 Num으로 그려진다", () => {
  const columns: TableColumn<NumberRow>[] = [
    { key: "label", header: "이름", priority: "p1", cell: (row) => row.label },
    { key: "amount", header: "금액", priority: "p1", align: "right", cell: (row) => row.amount },
  ];
  const render = (): string =>
    html(createElement(Table<NumberRow>, { caption: "표", columns, rows: [{ id: "r1", amount: 1234567, label: "가" }], getRowId: (row) => row.id }));

  it("오른쪽 정렬 열의 숫자 값은 Num 마크업이다", () => {
    expect(render()).toContain(html(createElement(Num, { value: 1234567 })));
  });

  it("문자열을 돌려주는 열은 그대로다(견적 줄 표 등 호출부가 이미 서식을 정한 칸)", () => {
    const stringColumns: TableColumn<NumberRow>[] = [
      { key: "amount", header: "금액", priority: "p1", align: "right", cell: (row) => String(row.amount) },
    ];
    const markup = html(
      createElement(Table<NumberRow>, { caption: "표", columns: stringColumns, rows: [{ id: "r1", amount: 1234567, label: "가" }], getRowId: (row) => row.id }),
    );
    expect(markup).toContain(">1234567<");
    expect(markup).not.toContain(html(createElement(Num, { value: 1234567 })));
  });
});

const act = (props: RowActionProps): ReactNode => createElement(RowAction, props);

describe("RowActions — 행동 링크 묶음", () => {
  const order = (markup: string): string[] => [...markup.matchAll(/(?:<a [^>]*>|<button [^>]*><span>)([가-힣]+)</g)].map((match) => match[1] ?? "");

  it("data-ui 훅을 달고 href 항목은 next/link 앵커다", () => {
    const markup = html(
      createElement(RowActions, null, act({ href: "/admin/vendors?editId=1", children: "수정" })),
    );
    expect(markup).toContain('data-ui="row-actions"');
    expect(markup).toMatch(/<a [^>]*href="\/admin\/vendors\?editId=1"[^>]*>수정<\/a>/);
  });

  it("danger는 가운데 넣어도 DOM 맨 끝이다", () => {
    const markup = html(
      createElement(
        RowActions,
        null,
        act({ href: "/a", children: "수정" }),
        act({ danger: true, onClick: () => undefined, children: "삭제" }),
        act({ onClick: () => undefined, children: "숨기기" }),
      ),
    );
    expect(order(markup)).toEqual(["수정", "숨기기", "삭제"]);
  });

  it("개수와 무관하게 같은 구조 — 하나 · 둘 · 셋", () => {
    for (const count of [1, 2, 3]) {
      const items = Array.from({ length: count }, (_, index) => createElement(Fragment, { key: index }, act({ href: `/x${index}`, children: `행동${"가나다"[index]}` })));
      const markup = html(createElement(RowActions, null, ...items));
      expect(markup.match(/<a /g)).toHaveLength(count);
      expect(markup.match(/data-ui="row-actions"/g)).toHaveLength(1);
    }
  });

  it("href 형 링크와 button 형이 같은 클래스를 쓴다(같은 모양)", () => {
    const markup = html(
      createElement(
        RowActions,
        null,
        act({ href: "/a", children: "수정" }),
        act({ onClick: () => undefined, children: "숨기기" }),
      ),
    );
    const classes = [...markup.matchAll(/<(?:a|button) [^>]*class="([^"]*)"/g)].map((match) => match[1] ?? "");
    expect(classes).toHaveLength(2);
    expect(classes[0]).toBe(classes[1]);
  });
});

describe("RowAction button 형 — pending · autoFocus · disabled + disabledReason(M8)", () => {
  const button = (props: Record<string, unknown>, label = "삭제"): string =>
    html(act({ onClick: () => undefined, ...props, children: label }));

  it("pending이면 aria-disabled · 네이티브 disabled 없음 · 라벨 뒤 aria-hidden … · sr-only 처리 중", () => {
    const markup = button({ pending: true });
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).not.toMatch(/<button[^>]*\sdisabled[\s=>]/);
    expect(markup).toContain('<span aria-hidden="true">…</span>');
    expect(markup).toContain('<span class="sr-only">처리 중</span>');
  });

  it("pending이 아니면 … 가 없다", () => {
    expect(button({})).not.toContain("…");
  });

  it("disabled + disabledReason이면 이유 글자 요소가 렌더되고 버튼 aria-describedby가 그 id를 가리킨다", () => {
    const markup = button({ disabled: true, disabledReason: "사용 중인 날짜" });
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).not.toMatch(/<button[^>]*\sdisabled[\s=>]/);
    const describedBy = markup.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeTruthy();
    expect(markup).toMatch(new RegExp(`<span id="${describedBy}"[^>]*>사용 중인 날짜</span>`));
  });

  it("이유 글자는 행동 바로 뒤 요소다", () => {
    const markup = button({ disabled: true, disabledReason: "이유" });
    expect(markup.indexOf("삭제")).toBeLessThan(markup.indexOf("이유"));
  });

  it("autoFocus가 버튼에 전달된다", () => {
    expect(button({ autoFocus: true })).toContain("autofocus");
    expect(button({})).not.toContain("autofocus");
  });

  it("danger와 함께 써도 DOM 맨 끝이다", () => {
    const markup = html(
      createElement(
        RowActions,
        null,
        act({ danger: true, onClick: () => undefined, disabled: true, disabledReason: "이유", children: "삭제" }),
        act({ href: "/a", children: "수정" }),
      ),
    );
    expect(markup.indexOf("수정")).toBeLessThan(markup.indexOf("삭제"));
  });

  it("클릭 처리기: 활성이면 onClick을 부르고 비활성 · 대기 중이면 부르지 않고 기본 동작을 막는다", () => {
    const calls: string[] = [];
    const event = { preventDefault: () => calls.push("prevented") };
    rowActionClickHandler({ inactive: false, onClick: () => calls.push("clicked") })(event as never);
    expect(calls).toEqual(["clicked"]);
    calls.length = 0;
    rowActionClickHandler({ inactive: true, onClick: () => calls.push("clicked") })(event as never);
    expect(calls).toEqual(["prevented"]);
  });

  it("disabled인데 disabledReason이 없으면 타입 오류다(Button UX-06과 같은 규약)", () => {
    // @ts-expect-error — disabled는 disabledReason과 함께만 쓴다
    void act({ onClick: () => undefined, disabled: true, children: "삭제" });
    // @ts-expect-error — href 형에는 pending이 없다(링크 대기 표시는 04.6-10)
    void act({ href: "/a", pending: true, children: "수정" });
    void act({ onClick: () => undefined, disabled: true, disabledReason: "이유", children: "삭제" });
  });
});

describe("TableSkeleton — 불러오는 중 뼈대", () => {
  const columns = [
    { key: "name", label: "이름" },
    { key: "amount", label: "금액", align: "right" as const },
  ];

  it("받은 열 이름을 th로, 뼈대 행 3개를 그린다 · data-ui 훅", () => {
    const markup = html(createElement(TableSkeleton, { columns }));
    expect(markup).toContain('data-ui="table-skeleton"');
    expect(markup.match(/<th /g)).toHaveLength(2);
    expect(markup).toContain(">이름<");
    expect(markup).toContain(">금액<");
    expect(markup.match(/<tr [^>]*class="[^"]*skeletonRow/g)).toHaveLength(3);
    expect(markup).not.toContain("<tfoot");
  });

  it("withFooter면 합계 줄 뼈대가 하나 더 있다", () => {
    expect(html(createElement(TableSkeleton, { columns, withFooter: true }))).toContain("<tfoot");
  });

  it("애니메이션 없이 300ms 지연으로 보인다", () => {
    const css = source("ui/table/TableSkeleton.module.css");
    expect(css).toMatch(/animation-delay:\s*300ms/);
    expect(css).not.toMatch(/infinite/);
    expect(css).toContain("var(--surface-muted)");
  });
});

type StaticColumn = { key: string; header: string; priority: ColumnPriority; align?: "left" | "right"; rowHeader?: boolean };
type StaticRow = { key: string; headerId?: string; cells: ReactNode[] };

function staticTable(columns: StaticColumn[], rows: StaticRow[]): string {
  return html(createElement(StaticTable, { caption: "거래처", columns, rows }));
}

describe("StaticTable — 서버 렌더 읽기 전용 표(R1)", () => {
  const columns: StaticColumn[] = [
    { key: "name", header: "이름", priority: "p1" },
    { key: "no", header: "사업자 번호", priority: "p2" },
    { key: "amount", header: "금액", priority: "p1", align: "right" },
    { key: "memo", header: "메모", priority: "p3" },
  ];
  const rows: StaticRow[] = [
    {
      key: "r1",
      cells: ["가나", "123-45", createElement(Num, { value: 1234567 }), "메모1"],
    },
  ];

  it("caption · 머리글 · 칸 노드가 열 순서대로 나온다(Num 포함)", () => {
    const markup = staticTable(columns, rows);
    expect(markup).toMatch(/<caption class="sr-only">거래처<\/caption>/);
    const headers = [...markup.matchAll(/<th [^>]*scope="col"[^>]*>([^<]*)<\/th>/g)].map((match) => match[1]);
    expect(headers).toEqual(["이름", "사업자 번호", "금액", "메모"]);
    expect(markup).toContain(html(createElement(Num, { value: 1234567 })));
    expect(markup.indexOf("가나")).toBeLessThan(markup.indexOf("123-45"));
    expect(markup.indexOf("123-45")).toBeLessThan(markup.indexOf("1,234,567"));
    expect(markup.indexOf("1,234,567")).toBeLessThan(markup.indexOf("메모1"));
  });

  it("표 면 · 머리글 · 칸 · prio 클래스가 같은 열 정의의 Table 렌더와 같다", () => {
    type Row = { id: string; values: string[] };
    const tableColumns: TableColumn<Row>[] = columns.map((column, index) => ({
      key: column.key,
      header: column.header,
      priority: column.priority,
      ...(column.align ? { align: column.align } : {}),
      cell: (row: Row) => row.values[index] ?? "",
    }));
    const tableMarkup = html(
      createElement(Table<Row>, {
        caption: "거래처",
        columns: tableColumns,
        rows: [{ id: "r1", values: ["가나", "123-45", "1,234,567", "메모1"] }],
        getRowId: (row) => row.id,
      }),
    );
    const classSets = (markup: string, tag: string): string[][] =>
      [...markup.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "g"))].map((match) =>
        (/class="([^"]*)"/.exec(match[1] ?? "")?.[1] ?? "").split(/\s+/).filter(Boolean).sort(),
      );
    const staticMarkup = staticTable(columns, rows);
    expect(classSets(staticMarkup, "th")).toHaveLength(4);
    expect(classSets(staticMarkup, "th").every((set) => set.length >= 2)).toBe(true);
    expect(classSets(staticMarkup, "th")).toEqual(classSets(tableMarkup, "th"));
    expect(classSets(staticMarkup, "td").slice(0, 4)).toEqual(classSets(tableMarkup, "td").slice(0, 4));
    // 표 면 클래스(`.table`)와 접힌 줄(`collapsedRow` · `collapsedCell`)이 Table.module.css 이름이다.
    expect(staticMarkup).toMatch(/<table class="[^"]*_table_/);
    expect(staticMarkup).toMatch(/<tr class="[^"]*_collapsedRow_/);
    expect(staticMarkup).toMatch(/<td colSpan="4" class="[^"]*_collapsedCell_/i);
  });

  it("P3는 같은 prio 클래스로 숨는 칸이고 오른쪽 정렬은 align이 정한다", () => {
    const markup = staticTable(columns, rows);
    expect(markup).toMatch(/<th [^>]*class="[^"]*_prio-p3_[^"]*"[^>]*>메모<\/th>/);
    expect(markup).toMatch(/<th [^>]*class="[^"]*_alignRight_[^"]*"[^>]*>금액<\/th>/);
  });

  it("P2 열이 있으면 행 아래 접힌 줄에 머리글 라벨 + 값이 있다", () => {
    const markup = staticTable(columns, rows);
    const collapsed = markup.match(/<tr class="[^"]*_collapsedRow_[^"]*">([\s\S]*?)<\/tr>/)?.[1] ?? "";
    expect(collapsed).toContain('<span class="sr-only">사업자 번호 </span>');
    expect(collapsed).toContain("123-45");
  });

  it("P2 열이 없으면 접힌 줄이 없다", () => {
    const markup = staticTable([{ key: "name", header: "이름", priority: "p1" }], [{ key: "r1", cells: ["가나"] }]);
    expect(markup).not.toMatch(/_collapsedRow_/);
  });

  it("rowHeader가 없는 표는 th scope=row가 없다", () => {
    const markup = staticTable(columns, rows);
    expect(markup).not.toContain('scope="row"');
    expect(markup).not.toContain("headers=");
  });

  it("서버 컴포넌트다 — 지시문 · 훅 호출 · 함수 prop 타입이 없다", () => {
    const code = source("ui/table/StaticTable.tsx");
    expect(code.split("\n").slice(0, 3).join("\n")).not.toMatch(/["']use client["']/);
    expect(code).not.toMatch(/["']use client["']/);
    expect(code).not.toMatch(/\buse[A-Z][A-Za-z]*\(/);
    const propsRegion = code.slice(0, code.indexOf("export function StaticTable"));
    expect(propsRegion).not.toContain("=>");
    expect(propsRegion).not.toMatch(/\bFunction\b/);
    expect(code).toContain("ColumnPriority");
    expect(code).toContain("Table.module.css");
  });
});

describe("StaticTable — 행 머리글 · 접힌 칸 headers(M4 · 사람 목록 DR-4)", () => {
  const columns: StaticColumn[] = [
    { key: "name", header: "이름", priority: "p1", rowHeader: true },
    { key: "email", header: "이메일", priority: "p2" },
    { key: "role", header: "계급", priority: "p2" },
    { key: "action", header: "동작", priority: "p1" },
  ];
  const rows: StaticRow[] = [{ key: "r1", headerId: "people-row-0-name", cells: ["가나", "a@x.kr", "기획 PM", "상세"] }];
  const collapsed = (markup: string): string => markup.match(/<tr class="[^"]*_collapsedRow_[^"]*">([\s\S]*?)<\/tr>/)?.[1] ?? "";

  it("rowHeader 열의 칸은 th scope=row id=headerId다", () => {
    expect(staticTable(columns, rows)).toMatch(/<th scope="row" id="people-row-0-name"[^>]*>가나<\/th>/);
  });

  it("접힌 칸이 headers=headerId이고 aria-hidden이 없다", () => {
    const markup = staticTable(columns, rows);
    expect(collapsed(markup)).toMatch(/<td colSpan="4" headers="people-row-0-name"/i);
    expect(markup).not.toContain("aria-hidden");
  });

  it("값 둘이면 구분자 「 · 」가 정확히 하나(사이에만) · 값마다 sr-only 머리글 라벨", () => {
    const cell = collapsed(staticTable(columns, rows));
    expect(cell.match(/ · /g)).toHaveLength(1);
    expect(cell).toContain('<span class="sr-only">이메일 </span>a@x.kr');
    expect(cell).toContain('<span class="sr-only">계급 </span>기획 PM');
  });

  it("가린 열을 columns에서 빼면 접힌 줄에 그 라벨도 구분자도 없다", () => {
    const hiddenColumns = columns.filter((column) => column.key !== "role");
    const hiddenRows: StaticRow[] = [{ key: "r1", headerId: "people-row-0-name", cells: ["가나", "a@x.kr", "상세"] }];
    const cell = collapsed(staticTable(hiddenColumns, hiddenRows));
    expect(cell).not.toContain("계급");
    expect(cell).not.toContain(" · ");
    expect(cell).toContain("a@x.kr");
  });

  it("보이는 P2 값이 하나도 없으면 접힌 줄을 그리지 않는다", () => {
    const noP2 = [columns[0], columns[3]] as StaticColumn[];
    expect(staticTable(noP2, [{ key: "r1", headerId: "people-row-0-name", cells: ["가나", "상세"] }])).not.toMatch(/_collapsedRow_/);
  });

  it("빈 값(null · 빈 문자열)은 접힌 줄에서 빠지고 구분자가 남지 않는다", () => {
    const cell = collapsed(staticTable(columns, [{ key: "r1", headerId: "h", cells: ["가나", "", "기획 PM", "상세"] }]));
    expect(cell).not.toContain(" · ");
    expect(cell).not.toContain("이메일");
    expect(cell).toContain("기획 PM");
  });
});
