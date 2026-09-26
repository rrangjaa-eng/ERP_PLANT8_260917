import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, type ButtonProps } from "../../../ui/button/Button";

// 04.3-03 Task 2a ① — Phase 4 Button 위에 더하는 두 조각(04.3-⑦(b)(c)).
// 이유 id 연결 · aria-disabled는 Phase 4 test/unit/ui/button.test.ts가 정본이라
// 여기서 다시 쓰지 않는다.

function render(props: Partial<ButtonProps> = {}, label = "전화번호 확인") {
  return renderToStaticMarkup(createElement(Button, { ...props, children: label } as ButtonProps));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Button — 04.3-⑦(c) 진행 중 「처리 중」", () => {
  it("pending이면 .sr-only 「처리 중」이 있고 「…」는 aria-hidden 그대로다", () => {
    const html = render({ pending: true });
    expect(html).toContain('<span class="sr-only">처리 중</span>');
    expect(html).toContain('<span aria-hidden="true">…</span>');
  });

  it("pending이 아니면 「처리 중」이 없다", () => {
    expect(render()).not.toContain("처리 중");
  });
});

describe("Button — 04.3-⑦(b) 개발 경고 조건", () => {
  it("disabledReason 없이 호출부 aria-describedby만 주면 경고가 없고 버튼 aria-describedby가 그 id다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const html = render({ disabled: true, "aria-describedby": "lock-box" });
    expect(warn).not.toHaveBeenCalled();
    expect(html).toContain('aria-describedby="lock-box"');
  });

  it("둘 다 없으면 경고가 한 번 난다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render({ disabled: true });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
