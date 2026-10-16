import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RowSheet, type RowSheetProps } from "../../../ui/table/RowSheet";

// 04.3-17 — SYSTEM §7-3 (바) ⑫ · ⑳: 폰 행 시트 본문 아래 3차 한 자리(`action`). 확인증 제출 섹션의 「제출 내용」이 첫 적용.
// 주지 않은 시트(견적 원장 · 지출결의 등)의 마크업은 그대로다. jsdom 없이 정적 렌더로 본다(table-group-aside 선례).

const base: RowSheetProps = {
  open: false,
  onClose: () => {},
  title: "김하늘",
  subtitle: "갤럭시 탭 S10 · 10-12 15:02",
  items: [{ label: "연락처", value: "010-****-7730" }],
};

function render(extra: Partial<RowSheetProps> = {}): string {
  return renderToStaticMarkup(createElement(RowSheet, { ...base, ...extra }));
}

describe("RowSheet action 자리", () => {
  it("action을 주면 본문(KvList) 뒤에 그 요소 하나를 그린다", () => {
    const markup = render({ action: createElement("a", { href: "/certs/submissions/x" }, "제출 내용") });
    const body = markup.indexOf("010-****-7730");
    const action = markup.indexOf('<a href="/certs/submissions/x">제출 내용</a>');
    expect(body).toBeGreaterThan(-1);
    expect(action).toBeGreaterThan(body);
    expect(markup.match(/제출 내용/g)).toHaveLength(1);
  });

  it("주지 않으면 지금 모양 그대로다(행동 자리 요소 없음)", () => {
    const without = render();
    const withUndefined = render({ action: undefined });
    expect(withUndefined).toBe(without);
    expect(without).not.toMatch(/class="[^"]*action[^"]*"/);
  });

  // 06.1 SP-6107 — 줄 행동이 둘인 행(구매 요청 `신청됨`)은 같은 `action` 자리에 3차 두 줄. prop은 그대로 하나다.
  it("3차 둘(fragment)을 주면 두 요소가 같은 action 자리 안에 순서대로 선다", () => {
    const markup = render({
      action: createElement(
        "span",
        null,
        createElement("button", { type: "button" }, "요청 취소"),
        createElement("button", { type: "button" }, "증빙 고르기 3"),
      ),
    });
    const wrapStart = markup.search(/<div class="[^"]*action[^"]*">/);
    expect(wrapStart).toBeGreaterThan(-1);
    expect((markup.match(/class="[^"]*action[^"]*"/g) ?? []).length).toBe(1);
    const first = markup.indexOf("요청 취소");
    const second = markup.indexOf("증빙 고르기 3");
    expect(first).toBeGreaterThan(wrapStart);
    expect(second).toBeGreaterThan(first);
  });
});
