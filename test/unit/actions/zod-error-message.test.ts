import { z, ZodError } from "zod";
import { describe, expect, it } from "vitest";
import { koreanZodErrorMessage } from "@/lib/actions/zod-error-message";

// 재현: /admin/settings에서 tax.rounding.min_withholding(스키마 최소값 0)에
// -5를 넣으면 화면에 원본 Zod issue 배열이 그대로 노출된다(회귀 재현 —
// registry.ts의 z.coerce.number().int().min(0) 스키마와 동일한 제약).
// 원인: ZodError.message가 JSON.stringify된 issue 배열이고,
// lib/actions/client.ts의 handleServerError가 Error.message를 그대로
// serverError로 내보낸다. 이 테스트는 그 값을 화면에 보여주기 전에 가공하는
// 함수가 원본 구조를 전혀 새지 않는지, 동시에 사람이 쓸 수 있는 한국어
// 메시지를 만드는지 검증한다(SYSTEM.md §8 카피 규칙 3: 원인 · 다음 행동).
function issuesFor(input: unknown): ZodError {
  const schema = z.coerce.number().int().min(0);
  const result = schema.safeParse(input);
  if (result.success) throw new Error("test setup 오류: 실패해야 할 파싱이 성공했다");
  return result.error;
}

describe("koreanZodErrorMessage", () => {
  it("원본 zod issue 구조(JSON 중괄호·code·origin 키)를 전혀 새지 않는다", () => {
    const message = koreanZodErrorMessage(issuesFor(-5));

    expect(message).not.toMatch(/[{}]/);
    expect(message).not.toContain('"code"');
    expect(message).not.toContain('"origin"');
    expect(message).not.toContain("too_small");
  });

  it("범위 제약(최소값)은 사람이 읽을 수 있는 원인 · 다음 행동 한 줄로 나온다", () => {
    const message = koreanZodErrorMessage(issuesFor(-5));

    // §8 카피 규칙 3: 원인 · 다음 행동을 가운뎃점으로 나눈 한 줄. 제약(0
    // 이상)은 운영자에게 의미가 있으므로 완전히 버리지 않는다.
    expect(message).toBe("0 이상이어야 합니다 · 값을 확인해 주세요");
    expect(message.split("\n")).toHaveLength(1);
  });

  it("타입 불일치(숫자 아님)도 JSON을 새지 않고 한국어 메시지를 만든다", () => {
    const schema = z.number();
    const result = schema.safeParse("abc");
    if (result.success) throw new Error("test setup 오류");

    const message = koreanZodErrorMessage(result.error);

    expect(message).not.toMatch(/[{}]/);
    expect(message).toContain("·");
  });

  // Rule 2(04.3-02) — CERT_CONTACT_PHONE 등 커스텀 refine 메시지가 default
  // 케이스의 일반 문구로 뭉개지지 않고 그대로 나와야 한다(그 설정 키의
  // acceptance criteria가 이 정확한 문장을 요구한다).
  it("커스텀 refine 메시지는 그대로 나온다(default로 뭉개지지 않는다)", () => {
    const schema = z.string().refine(() => false, { message: "전화번호 형식이 아닙니다 · 02-1234-5678처럼 적어 주세요" });
    const result = schema.safeParse("abc");
    if (result.success) throw new Error("test setup 오류");

    const message = koreanZodErrorMessage(result.error);

    expect(message).toBe("전화번호 형식이 아닙니다 · 02-1234-5678처럼 적어 주세요");
  });
});
