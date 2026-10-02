import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 04.5-06: 거래처 폼 이유 자리 · noValidate · 폼 상단 상자 부재 — 소스 검사.
// 이 저장소에 React 렌더 테스트 러너가 없다(@testing-library/react 미설치 — next-turn-action.test.ts 머리 주석).
// 같은 세 속성의 실제 DOM 단언은 test/e2e/vendor-custom-fields.spec.ts가 한다(편차-06a · 디자인 리뷰 R5).
const SOURCE = readFileSync(resolve(process.cwd(), "app/(app)/admin/vendors/vendor-form.tsx"), "utf8");
const CODE = SOURCE.split("\n")
  .filter((line) => !/^\s*(\/\/|\{?\/\*|\*)/.test(line))
  .join("\n");

describe("거래처 폼 이유 자리 (04.5-06)", () => {
  it("폼 상단 오류 상자 컴포넌트가 코드에 없다", () => {
    expect(CODE.match(/FormAlert/g) ?? []).toHaveLength(0);
  });

  it("이유 자리 id가 한 번 있다", () => {
    expect(CODE.match(/id="vendor-form-reason"/g) ?? []).toHaveLength(1);
  });

  it("1차 버튼의 aria-describedby가 이유 자리를 가리킨다", () => {
    expect(CODE).toMatch(/<Button[^>]*aria-describedby="vendor-form-reason"/);
  });

  it("이유 자리는 role=\"alert\"가 아니다", () => {
    expect(CODE).not.toContain('role="alert"');
  });

  it("<form>에 noValidate가 있다", () => {
    expect(CODE).toMatch(/<form[^>]*\bnoValidate\b/);
  });

  it("커스텀 칸에 required 속성을 넘기지 않는다(기본 칸 「이름」만 required)", () => {
    expect(CODE).not.toContain("required={def.required}");
    expect(CODE.match(/\brequired=/g) ?? []).toHaveLength(0);
    expect(CODE).toMatch(/<TextField id="name"[^>]*\brequired\b/);
  });

  it("칸별 오류를 서버 validationErrors에서 읽는다", () => {
    expect(CODE).toMatch(/validationErrors\?\.customFields/);
  });
});
