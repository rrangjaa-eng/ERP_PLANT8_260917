import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TextField, type TextFieldProps } from "../../../ui/input/TextField";

// ISSUE-001(PR #104 /qa) — TextField의 선택 prop hintId는 칸 밖에 그린 힌트 요소의 id를 aria-describedby에 오류 id 뒤로 더한다.
// hintId를 주지 않는 다른 화면은 전과 같다(오류 때 `{id}-error` 하나, 없으면 속성 없음). jsdom 없이 renderToStaticMarkup 문자열로 단언한다.
// hintId는 구현 전에 타입에 없으므로 props를 단언으로 넘겨 RED 커밋에서도 typecheck가 통과한다.

function renderField(props: Record<string, unknown>) {
  return renderToStaticMarkup(createElement(TextField, { id: "t", label: "칸", ...props } as TextFieldProps));
}

const VARIANTS = [
  { name: "일반 칸", extra: {} },
  { name: "쉼표 숫자 칸(numberKind)", extra: { numberKind: "krw" } },
] as const;

for (const { name, extra } of VARIANTS) {
  describe(`TextField hintId — ${name}`, () => {
    it("hintId만 → aria-describedby가 hintId 하나이고 aria-invalid가 없다", () => {
      const html = renderField({ ...extra, hintId: "t-hint" });
      expect(html).toContain('aria-describedby="t-hint"');
      expect(html).not.toContain("aria-invalid");
      expect(html).not.toContain('id="t-error"');
    });

    it("hintId + error → 오류 id 먼저 힌트 id 뒤, aria-invalid true, 오류 <p> id가 있다", () => {
      const html = renderField({ ...extra, hintId: "t-hint", error: "필수 항목" });
      expect(html).toContain('aria-describedby="t-error t-hint"');
      expect(html).toContain('aria-invalid="true"');
      expect(html).toContain('id="t-error"');
    });

    it("error만(hintId 없음) → aria-describedby가 오류 id 하나(기존과 같음)", () => {
      const html = renderField({ ...extra, error: "필수 항목" });
      expect(html).toContain('aria-describedby="t-error"');
      expect(html).toContain('aria-invalid="true"');
    });

    it("둘 다 없음 → aria-describedby 속성이 없다(기존과 같음)", () => {
      const html = renderField({ ...extra });
      expect(html).not.toContain("aria-describedby");
    });
  });
}
