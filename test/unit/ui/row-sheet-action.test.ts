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
});
