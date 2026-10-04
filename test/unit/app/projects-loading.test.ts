import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// next/link는 라우터 문맥이 필요하다 — 앵커로 바꾼다(ListScreen의 1차 링크가 쓰지만 이 뼈대는 1차를 그리지 않는다).
vi.mock("next/link", () => ({
  default: ({ href, scroll, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; scroll?: boolean; children?: ReactNode }) =>
    createElement("a", { href, "data-scroll": String(scroll), ...rest }, children),
}));
vi.mock("@/ui/link-pending/LinkPending", () => ({ LinkPending: () => null }));

const { default: ProjectsLoading } = await import("@/app/(app)/projects/loading");
const { PROJECT_COLUMN_LABELS, PROJECT_SKELETON_COLUMNS } = await import("@/app/(app)/projects/list-columns");

const source = (file: string) => readFileSync(resolve(__dirname, "../../../app/(app)/projects", file), "utf8");

// 04.6-10(UI-SPEC loading · D10 · SC 10) — 목록 로딩 뼈대: `ListScreen` 제목 + `TableSkeleton`(진짜 열 이름 — 목록 표와 같은 낱말)만,
// 동작하지 않는 1차 행동은 그리지 않는다. 04-48 Task 3의 「합계 줄 자리 라벨」 단언은 새 틀이 합계 면을 뼈대에 그리지 않아 없앴다(UI-SPEC loading).
describe("ProjectsLoading — 목록 로딩 뼈대", () => {
  const html = renderToStaticMarkup(createElement(ProjectsLoading));

  it("제목 「프로젝트」가 틀의 제목이다", () => {
    expect(html).toMatch(/<h1[^>]*data-ui="screen-title"[^>]*>프로젝트<\/h1>/);
  });

  it("표 아래 합계 행(tfoot) 뼈대가 없다", () => {
    expect(html).not.toContain("<tfoot");
  });

  it("머리글 + 행 3개이고 진행 막대가 없다", () => {
    expect(html.match(/<tbody>.*<\/tbody>/)?.[0].match(/<tr/g)).toHaveLength(3);
    expect(html).toContain("<thead>");
    expect(html).not.toMatch(/progressbar|<progress/);
  });

  it("머리글은 진짜 열 이름이다 — 목록 표가 쓰는 같은 낱말(PROJECT_COLUMN_LABELS)", () => {
    const headers = Array.from(html.matchAll(/<th\s[^>]*>(.*?)<\/th>/g), (match) => match[1]);
    expect(headers).toEqual(PROJECT_SKELETON_COLUMNS.map(({ key }) => PROJECT_COLUMN_LABELS[key]));
    const table = source("projects-table.tsx");
    for (const { key } of PROJECT_SKELETON_COLUMNS) {
      expect(table, `표가 ${key} 머리글을 공유 낱말로 쓴다`).toContain(`header: PROJECT_COLUMN_LABELS.${key}`);
    }
    expect(table).not.toMatch(/header: "/);
  });

  it("동작하지 않는 1차를 그리지 않는다(D10) — primaryAction도 1차 버튼도 없다", () => {
    expect(source("loading.tsx")).not.toContain("primaryAction");
    expect(html).not.toContain('data-ui="primary-button"');
  });
});
