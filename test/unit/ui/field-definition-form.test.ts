import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 04.5-02 R9 · D9: 새 선택지 입력의 Enter는 한글 조합 중이면 아무것도 하지 않는다 — 조합을 확정하는 Enter가
// 조합 전 글자를 더하거나 두 번 더하지 않게. IME 조합은 Playwright로 안정적으로 재현되지 않아
// 소스 검사로 지킨다(이 저장소에 React 렌더 테스트 러너가 없다 — next-turn-action.test.ts 관례).
const FORM = readFileSync(resolve(process.cwd(), "app/(app)/admin/field-definitions/field-definition-form.tsx"), "utf8");
const CODE = FORM.split("\n")
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join("\n");

describe("화면 항목 폼 — 한글 조합 중 Enter (R9 · D9)", () => {
  it("새 선택지 Enter 처리가 nativeEvent.isComposing을 본다", () => {
    expect(CODE).toContain("nativeEvent.isComposing");
  });
});
