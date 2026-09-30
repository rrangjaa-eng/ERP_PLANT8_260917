import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCUMENT_NUMBER_PROJECT_SEPARATOR } from "@/domain/settings/keys";
import { describeSettingField, getSettingValue, getSimpleSettingValues } from "@/domain/settings/registry";
import { log } from "@/lib/log";
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

describe("저장된 구분자가 허용 목록 밖일 때 읽기 (PR #104 /review 2차 A(2))", () => {
  afterEach(() => vi.restoreAllMocks());

  const storedRow = (value: unknown) => ({
    key: DOCUMENT_NUMBER_PROJECT_SEPARATOR.key,
    value,
    updatedAt: new Date(),
    updatedBy: null,
  });

  it("getSettingValue — 허용 밖 저장값은 기본값(빈 값)으로 읽고 log.error에 키만 남긴다", async () => {
    const spy = vi.spyOn(log, "error").mockImplementation(() => {});
    const findSimpleValue = vi.fn().mockResolvedValue(storedRow("##"));

    const result = await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEPARATOR, undefined, { findSimpleValue });

    expect(result).toBe("");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      "settings.invalid_stored_value",
      expect.objectContaining({ key: DOCUMENT_NUMBER_PROJECT_SEPARATOR.key }),
    );
    expect(JSON.stringify(spy.mock.calls)).not.toContain("##");
  });

  it("getSimpleSettingValues — 허용 밖 저장값도 기본값(빈 값)으로 읽고 log.error를 남긴다", async () => {
    const spy = vi.spyOn(log, "error").mockImplementation(() => {});
    const findSimpleValues = vi.fn().mockResolvedValue([{ key: DOCUMENT_NUMBER_PROJECT_SEPARATOR.key, value: "--" }]);

    const result = await getSimpleSettingValues([DOCUMENT_NUMBER_PROJECT_SEPARATOR] as const, { findSimpleValues });

    expect(result).toEqual([""]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("허용 목록 안 저장값(-)은 그대로 읽고 log.error를 남기지 않는다", async () => {
    const spy = vi.spyOn(log, "error").mockImplementation(() => {});
    const findSimpleValue = vi.fn().mockResolvedValue(storedRow("-"));

    const result = await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEPARATOR, undefined, { findSimpleValue });

    expect(result).toBe("-");
    expect(spy).not.toHaveBeenCalled();
  });
});
