import { createElement, type AnchorHTMLAttributes, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// next/link는 라우터 문맥이 필요하다 — 앵커로 바꾸고, `LinkPending`은 자리를 알 수 있는 표식으로 바꿔 「링크 안에 있다」를 단언한다.
vi.mock("next/link", () => ({
  default: ({ href, scroll, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; scroll?: boolean; children?: ReactNode }) =>
    createElement("a", { href, "data-scroll": String(scroll), ...rest }, children),
}));
vi.mock("@/ui/link-pending/LinkPending", () => ({ LinkPending: () => createElement("i", { "data-link-pending": "" }) }));

const { RowAction: TypedRowAction, RowActions } = await import("../../../ui/row-actions/RowActions");
// `children`을 인자로 넘기려고 props 유니온을 느슨한 컴포넌트 형태로 본다(react/no-children-prop) — 단언은 렌더 결과로 한다.
const RowAction = TypedRowAction as unknown as ComponentType<Record<string, unknown>>;

// 04.6-10 D6 — 패널을 여는 `RowAction href`는 누른 직후 패널이 뜨기 전까지 링크 안에 「진행 중」 표시(`LinkPending`)를 둔다.
// `ListScreen.primaryAction`과 같은 표기(새 모양 없음). 페이지를 여는 게 아닌 button 형(onClick)은 해당 없다.
describe("RowAction — 여는 중(D6)", () => {
  it("href 항목은 `next/link` 안에 LinkPending이 있다", () => {
    const html = renderToStaticMarkup(createElement(RowAction, { href: "/admin/vendors?editId=a" }, "수정"));
    expect(html).toContain('수정<i data-link-pending=""></i></a>');
    expect(html).toContain('data-scroll="false"');
  });

  it("onClick 항목(button)에는 LinkPending이 없다", () => {
    const html = renderToStaticMarkup(createElement(RowAction, { onClick: () => undefined }, "숨기기"));
    expect(html).not.toContain("data-link-pending");
  });

  it("RowActions 묶음에서 href 항목에만 있고 개수와 무관하게 순서(danger 맨 끝)는 그대로다", () => {
    const html = renderToStaticMarkup(
      createElement(
        RowActions,
        null,
        createElement(RowAction, { danger: true, onClick: () => undefined }, "삭제"),
        createElement(RowAction, { href: "/x" }, "수정"),
        createElement(RowAction, { onClick: () => undefined }, "숨기기"),
      ),
    );
    expect(html.match(/data-link-pending/g)).toHaveLength(1);
    expect(html.indexOf("수정")).toBeLessThan(html.indexOf("숨기기"));
    expect(html.indexOf("숨기기")).toBeLessThan(html.indexOf("삭제"));
  });
});
