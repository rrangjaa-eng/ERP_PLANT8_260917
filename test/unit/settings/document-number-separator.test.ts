import { describe, expect, it } from "vitest";
import { DOCUMENT_NUMBER_PROJECT_SEPARATOR } from "@/domain/settings/keys";
import { describeSettingField } from "@/domain/settings/registry";
import { koreanZodErrorMessage } from "@/lib/actions/zod-error-message";

// T-04-31 · PR #104 사용자 결정 — 프로젝트 번호 구분자는 빈 문자열 또는 - _ . / 한 글자만 허용한다.
// 그 밖의 문자·두 글자 이상·공백·끝 줄바꿈은 저장·가져오기 전에 스키마가 거부한다.
const ALLOWED = ["", "-", "_", ".", "/"];
const REJECTED = ["#", "--", "a", " ", "-_", "가", "-\n"];

describe("프로젝트 번호 구분자 허용 목록 (T-04-31)", () => {
  for (const value of ALLOWED) {
    it(`허용: ${JSON.stringify(value)}`, () => {
      const result = DOCUMENT_NUMBER_PROJECT_SEPARATOR.schema.safeParse(value);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error("test setup 오류: 허용 값이 거부됐다");
      expect(result.data).toBe(value);
    });
  }

  for (const value of REJECTED) {
    it(`거부: ${JSON.stringify(value)}`, () => {
      const result = DOCUMENT_NUMBER_PROJECT_SEPARATOR.schema.safeParse(value);
      expect(result.success).toBe(false);
    });
  }

  it("거부 문구는 「형식 오류 · 값 확인」이다", () => {
    const result = DOCUMENT_NUMBER_PROJECT_SEPARATOR.schema.safeParse("#");
    if (result.success) throw new Error("test setup 오류: 실패해야 할 파싱이 성공했다");
    expect(koreanZodErrorMessage(result.error)).toBe("형식 오류 · 값 확인");
  });

  it("설정 화면 입력 칸은 문자열 입력 그대로다", () => {
    expect(describeSettingField(DOCUMENT_NUMBER_PROJECT_SEPARATOR)).toEqual({ kind: "string" });
  });
});
