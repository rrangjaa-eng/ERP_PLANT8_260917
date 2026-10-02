import { readFileSync } from "node:fs";
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
  return renderToStaticMarkup(
    createElement(Button, { ...props, children: label } as ButtonProps),
  );
}

describe("Button — reasonTone · aria-disabled(⑦, DR-10 · DR-11)", () => {
  it("disabled + disabledReason + reasonTone info → aria-disabled·aria-describedby가 있고 disabled 속성이 없다 · 이유 요소가 info 클래스다", () => {
    const html = renderButton({
      disabled: true,
      disabledReason: "바뀐 칸 없음",
      reasonTone: "info",
    });

    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled(?=[\s/>])/);
    expect(html).toContain(styles.reasonInfo);
    expect(html).not.toContain(styles.reason);

    const describedBy = html.match(/aria-describedby="([^"]+)"/);
    expect(describedBy).not.toBeNull();
    expect(html).toContain(`id="${describedBy![1]!}"`);
  });

  it("reasonTone을 빼면 이유 요소가 block(기본) 클래스다", () => {
    const html = renderButton({
      disabled: true,
      disabledReason: "바뀐 칸 없음",
    });

    expect(html).toContain(styles.reason);
    expect(html).not.toContain(styles.reasonInfo);
  });

  it("pending → aria-disabled·「…」가 있고 이유 요소가 없으며 disabled 속성이 없다", () => {
    const html = renderButton({
      pending: true,
      disabledReason: "이 값은 안 보여야 한다",
    });

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
    const html = renderButton({
      disabled: true,
      disabledReason: "이유",
      "aria-describedby": "external-hint",
    });

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
    const html = renderButton({
      disabled: true,
      disabledReason: "300줄 상한",
      reasonId: "cap-reason",
    });

    expect(html).toContain('id="cap-reason"');
    expect(html).toContain('aria-describedby="cap-reason"');
  });

  it("disabledReason 없이 다른 요소의 이유를 aria-describedby로 가리키는 비활성 버튼은 경고하지 않는다(이유 글자는 한 번만)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const html = renderButton({
        disabled: true,
        "aria-describedby": "cap-reason",
      });
      expect(html).toContain('aria-disabled="true"');
      expect(html).toContain('aria-describedby="cap-reason"');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

// 04.3-02 UI-SPEC 개정 ⑦(a) — 외부 수령자 화면 전용 크기 변형.
describe("Button — size external(04.3-02 ⑦(a))", () => {
  it("size를 주지 않으면 기존 모양 그대로다(external 클래스 없음)", () => {
    const html = renderButton({});
    expect(html).not.toContain(styles.external);
  });

  it("size='external'이면 wrapExternal · external 클래스가 붙는다", () => {
    const html = renderButton({ size: "external" });
    expect(html).toContain(styles.wrapExternal);
    expect(html).toContain(styles.external);
  });
});

describe("Button — 이유 + 다음 한 수(nextStep, §7-1)", () => {
  const nextStep = createElement("a", { href: "#next" }, "새로 고침");

  it("이유가 보이면 이유와 다음 한 수가 한 덩어리(.reasonLine)이고 바깥 줄은 줄바꿈된다", () => {
    const html = renderButton({
      disabled: true,
      disabledReason: "상태가 진행으로 바뀜",
      nextStep,
    });

    expect(html).toContain(styles.wrapWithNext);
    expect(html).toMatch(
      new RegExp(
        `class="${styles.reasonLine}"><span id="[^"]+" class="${styles.reason}">상태가 진행으로 바뀜</span><a href="#next">새로 고침</a></span>`,
      ),
    );
  });

  it("이유가 없으면(활성 · 진행 중) 다음 한 수도 없다", () => {
    for (const props of [
      {},
      { disabled: true, pending: true, disabledReason: "숨김" },
    ] as Partial<ButtonProps>[]) {
      const html = renderButton({ nextStep, ...props });
      expect(html).not.toContain("새로 고침");
      expect(html).not.toContain(styles.reasonLine);
      expect(html).not.toContain(styles.wrapWithNext);
    }
  });

  it("다음 한 수가 없으면 이유는 예전처럼 버튼 바로 옆 요소다", () => {
    const html = renderButton({
      disabled: true,
      disabledReason: "바뀐 칸 없음",
    });

    expect(html).not.toContain(styles.reasonLine);
    expect(html).not.toContain(styles.wrapWithNext);
    expect(html).toMatch(
      new RegExp(
        `</button><span id="[^"]+" class="${styles.reason}">바뀐 칸 없음</span></span>$`,
      ),
    );
  });
});

// 04.6-08 스킨 A — 버튼 3위계 · 원칙 점검 훅(04.6-06 도구 · 04.6-29가 `data-ui="primary-button"`을 읽는다).
describe("Button — 1차 data-ui 훅(04.6-08)", () => {
  it("1차 버튼만 data-ui=\"primary-button\"을 단다", () => {
    expect(renderButton({ variant: "primary" })).toContain('data-ui="primary-button"');
    expect(renderButton({ variant: "secondary" })).not.toContain("data-ui");
    expect(renderButton({ variant: "tertiary" })).not.toContain("data-ui");
  });

  it("비활성·진행 중 1차도 훅을 단다(원칙 점검이 한 화면의 1차 수를 센다)", () => {
    expect(renderButton({ variant: "primary", disabled: true, disabledReason: "이유" })).toContain('data-ui="primary-button"');
    expect(renderButton({ variant: "primary", pending: true })).toContain('data-ui="primary-button"');
  });
});

describe("Button.module.css — 스킨 A 역할 토큰(04.6-08)", () => {
  const css = readFileSync("ui/button/Button.module.css", "utf8");
  const rule = (selector: string): string => {
    const start = css.indexOf(`${selector} {`);
    expect(start, `${selector} 규칙`).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf("}", start));
  };

  it(".btn은 옆 패널 행동 줄이 정하는 --field-h를 읽고(없으면 --control-h) 모서리는 --radius-control이다", () => {
    const btn = rule(".btn");
    expect(btn).toContain("height: var(--field-h, var(--control-h));");
    expect(btn).toContain("border-radius: var(--radius-control);");
    expect(btn).toContain("font-size: var(--text-body);");
    expect(btn).toContain("font-weight: var(--fw-medium);");
  });

  it("1차는 --accent 면 · --text-on-accent 글자, 2차는 --border-button 테두리다", () => {
    expect(rule(".primary")).toContain("background: var(--accent);");
    expect(rule(".primary")).toContain("color: var(--text-on-accent);");
    expect(rule(".primary:hover:not([aria-disabled=\"true\"])")).toContain("var(--accent-hover)");
    expect(rule(".secondary")).toContain("var(--border-button)");
  });

  it("3차 hover 밑줄은 --underline-w-hover이고 비활성에는 걸리지 않는다 · gap 0과 비활성 밑줄 색 --border-strong", () => {
    expect(rule(".tertiary:hover:not([aria-disabled=\"true\"])")).toContain("text-decoration-thickness: var(--underline-w-hover);");
    expect(rule(".tertiary")).toContain("gap: 0;");
    expect(rule(".tertiary[aria-disabled=\"true\"]")).toContain("text-decoration-color: var(--border-strong);");
  });

  it("외부 수령자 변형은 두 클래스 .btn.external · --s-12 · --text-prose(15 고정)다", () => {
    expect(rule(".btn.external")).toContain("height: var(--s-12);");
    expect(rule(".btn.external")).toContain("font-size: var(--text-prose);");
    expect(rule(".wrapExternal .reason,\n.wrapExternal .reasonInfo")).toContain("font-size: var(--text-prose);");
  });

  it("옛 이름(--line · --line-w-strong · --fs-md)이 없다", () => {
    expect(css).not.toMatch(/var\(--line\)|--line-w-strong|--fs-md/);
  });
});
