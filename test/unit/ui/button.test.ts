import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Button, type ButtonProps } from "../../../ui/button/Button";
import styles from "../../../ui/button/Button.module.css";

// SYSTEM.md §7-1 · §10 개정 ⑦(DR-10 · DR-11, 교차 그룹 계약 1) — 비활성·진행
// 중 버튼은 네이티브 disabled 대신 aria-disabled + aria-describedby다.
// jsdom 없이(이 저장소는 environment: "node") react-dom/server의
// renderToStaticMarkup으로 정적 HTML을 만들어 문자열로 단언한다.

function renderButton(props: Partial<ButtonProps> = {}, label = "저장") {
  return renderToStaticMarkup(createElement(Button, { ...props, children: label } as ButtonProps));
}

describe("Button — reasonTone · aria-disabled(⑦, DR-10 · DR-11)", () => {
  it("disabled + disabledReason + reasonTone info → aria-disabled·aria-describedby가 있고 disabled 속성이 없다 · 이유 요소가 info 클래스다", () => {
    const html = renderButton({ disabled: true, disabledReason: "바뀐 칸 없음", reasonTone: "info" });

    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled(?=[\s/>])/);
    expect(html).toContain(styles.reasonInfo);
    expect(html).not.toContain(styles.reason);

    const describedBy = html.match(/aria-describedby="([^"]+)"/);
    expect(describedBy).not.toBeNull();
    expect(html).toContain(`id="${describedBy![1]!}"`);
  });

  it("reasonTone을 빼면 이유 요소가 block(기본) 클래스다", () => {
    const html = renderButton({ disabled: true, disabledReason: "바뀐 칸 없음" });

    expect(html).toContain(styles.reason);
    expect(html).not.toContain(styles.reasonInfo);
  });

  it("pending → aria-disabled·「…」가 있고 이유 요소가 없으며 disabled 속성이 없다", () => {
    const html = renderButton({ pending: true, disabledReason: "이 값은 안 보여야 한다" });

    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled(?=[\s/>])/);
    expect(html).not.toContain(styles.reason);
    expect(html).not.toContain(styles.reasonInfo);
  });

  it("활성 버튼 → aria-disabled·aria-describedby가 없다", () => {
    const html = renderButton({});

    expect(html).not.toContain("aria-disabled");
    expect(html).not.toContain("aria-describedby");
  });

  it("호출자가 준 aria-describedby가 있으면 이유 id와 함께 남는다", () => {
    const html = renderButton({ disabled: true, disabledReason: "이유", "aria-describedby": "external-hint" });

    const describedBy = html.match(/aria-describedby="([^"]+)"/);
    expect(describedBy).not.toBeNull();
    const tokens = describedBy![1]!.split(" ");
    expect(tokens).toContain("external-hint");
    // 이유 id도 같은 aria-describedby 안에 함께 있고, 그 id가 실제 이유 요소를 가리킨다.
    const reasonId = tokens.find((t) => t !== "external-hint");
    expect(reasonId).toBeDefined();
    expect(html).toContain(`id="${reasonId}"`);
  });

  it("reasonId를 주면 이유 요소의 id와 aria-describedby가 그 값이다 — 다른 버튼이 같은 이유를 가리킬 수 있다(04-23 검토 S-3)", () => {
    const html = renderButton({ disabled: true, disabledReason: "300줄 상한", reasonId: "cap-reason" });

    expect(html).toContain('id="cap-reason"');
    expect(html).toContain('aria-describedby="cap-reason"');
  });

  it("disabledReason 없이 다른 요소의 이유를 aria-describedby로 가리키는 비활성 버튼은 경고하지 않는다(이유 글자는 한 번만)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const html = renderButton({ disabled: true, "aria-describedby": "cap-reason" });
      expect(html).toContain('aria-disabled="true"');
      expect(html).toContain('aria-describedby="cap-reason"');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
