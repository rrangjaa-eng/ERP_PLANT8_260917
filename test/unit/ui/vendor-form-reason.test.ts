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

  // 04.6-04: 이유 자리(행동 줄 위 한 줄)와 1차 버튼은 `PanelForm`이 그린다 — 호출부는 `reasonId`로 id를 주고,
  // PanelForm이 그 줄에 id를 달고 1차 aria-describedby가 가리키게 한다(ui/side-panel/PanelForm.tsx).
  it("이유 자리 id를 한 번 넘긴다(PanelForm reasonId)", () => {
    expect(CODE.match(/reasonId="vendor-form-reason"/g) ?? []).toHaveLength(1);
  });

  it("PanelForm이 이유 자리 id를 그 줄에 달고 1차 버튼의 aria-describedby가 가리킨다", () => {
    const panelForm = readFileSync(resolve(process.cwd(), "ui/side-panel/PanelForm.tsx"), "utf8");
    expect(panelForm).toMatch(/<p id=\{lineId\}/);
    expect(panelForm).toMatch(/aria-describedby=\{reasonContent \? lineId : undefined\}/);
  });

  it("이유 자리는 role=\"alert\"가 아니다", () => {
    expect(CODE).not.toContain('role="alert"');
  });

  it("폼은 noValidate를 가진 공용 Form(PanelForm)으로 그려진다", () => {
    expect(CODE).toMatch(/<PanelForm[^>]*id="vendor-form"/);
    const form = readFileSync(resolve(process.cwd(), "ui/form/Form.tsx"), "utf8");
    expect(form).toMatch(/<form[^>]*\bnoValidate\b/);
  });

  it("커스텀 칸에 required 속성을 넘기지 않는다(기본 칸 「이름」만 required)", () => {
    expect(CODE).not.toContain("required={def.required}");
    expect(CODE.match(/\brequired=/g) ?? []).toHaveLength(0);
    expect(CODE).toMatch(/<TextField id="name"[^>]*\brequired\b/);
  });

  it("칸별 오류를 서버 validationErrors에서 읽는다", () => {
    expect(CODE).toMatch(/validationErrors\?\.customFields/);
  });

  // 04.5-06 Task 2: 보관된 선택지가 현재 값 — 활성화된 옵션(disabled는 FormData에서 빠져 「안 바꿈」과 「지움」을 구분할 수 없다)
  it("저장값이 활성 선택지에 없을 때 더하는 옵션은 disabled가 아니고 글자가 「{값} (보관됨)」이다", () => {
    expect(CODE).toMatch(/<option value=\{archivedValue\}>\{archivedValue\} \(보관됨\)<\/option>/);
    expect(CODE).not.toMatch(/<option[^>]*\bdisabled\b/);
  });

  it("폼에 없는 칸의 서버 오류는 staleFieldsReason으로 막힘 이유 · 새로 불러오기가 된다(칸 정의 키와 비교)", () => {
    expect(CODE).toMatch(/staleFieldsReason\(\s*verb,[^;]*fieldDefs\.map\(\(def\) => def\.key\)/);
    expect(CODE).toMatch(/const serverReason = staleReason \?\?/);
  });
});
