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

// 07.5-05 S1: 대상은 입력 칸이 아니다 — 등록 제출 객체에 현재 대상을 싣고(숨은 input은 이 폼에서 서버로 가지 않는다, eng C-3),
// 수정 패널 「새 화면 항목 추가」는 같은 대상을 싣는다(eng C-4). 패널 제목 · 대상 링크 줄은 page.tsx(eng C-6 · design B4).
const PAGE = readFileSync(resolve(process.cwd(), "app/(app)/admin/field-definitions/page.tsx"), "utf8");

describe("화면 항목 폼 · 화면 — 대상 (07.5-05)", () => {
  it("등록 제출의 createState.execute 객체에 target을 싣는다", () => {
    const call = CODE.slice(CODE.indexOf("createState.execute("));
    expect(call.slice(0, call.indexOf("});"))).toMatch(/\btarget\b/);
  });

  it("「새 화면 항목 추가」 링크는 newHref(target)로 대상을 싣는다", () => {
    expect(CODE).toMatch(/function newHref\(target: FieldDefinitionTarget\)/);
    expect(CODE).toContain("target=");
    expect(CODE).toMatch(/href=\{newHref\(target\)\}/);
    expect(CODE).not.toContain("NEW_HREF");
  });

  it("대상 입력 칸이 없고 제출 버튼 글자는 그대로다", () => {
    expect(CODE).not.toMatch(/name="target"/);
    expect(CODE).toContain("const submitLabel = `화면 항목 ${verb}`;");
  });

  it("page.tsx — 패널 제목이 TARGET_LABELS를 읽고 대상 링크 줄이 nav · aria-current다", () => {
    expect(PAGE).toMatch(/title=\{`\$\{TARGET_LABELS\[target\]\} 화면 항목/);
    expect(PAGE).toContain('aria-label="대상"');
    expect(PAGE).toContain('aria-current={entry === target ? "page" : undefined}');
  });
});
