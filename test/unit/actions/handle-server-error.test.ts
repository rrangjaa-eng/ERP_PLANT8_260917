import { z, ZodError } from "zod";
import { describe, expect, it, vi } from "vitest";
import { handleServerError } from "@/lib/actions/handle-server-error";
import { UserFacingError } from "@/lib/actions/user-facing-error";

// 재현(defect 1): 법인카드 중복 등록 시 drizzle의 DrizzleQueryError.message가
// "Failed query: insert into \"corp_cards\" (...) values (default, $1, $2, ...)
// returning ...\nparams: 카드사-..., 8191, ..., <내부 user id>, ..."를 그대로
// 담고 있고, 예전 handleServerError(e instanceof Error ? e.message : ...)는
// 이걸 그대로 client의 result.serverError로 내보냈다 — 클래스가 아니라 이
// 한 사례만 막으면(ZodError 분기 추가) 나머지 모든 미분류 Error는 여전히
// 새는 구조(denylist)였다. 이 스위트는 그 구조 자체(허용목록)를 검증한다:
// UserFacingError(또는 그 하위 클래스)가 아닌 한 어떤 Error message도 화면에
// 원문 그대로 나가지 않는지를 "클래스" 단위로 단언한다(구체적 SQL 문자열
//하나를 통과시키는 땜질 수정이 아님을 보장).
describe("handleServerError (defect 1 — 화이트리스트)", () => {
  it("UserFacingError가 아닌 임의의 내부 Error는 message가 그대로 새지 않는다", () => {
    const sqlLeak = new Error(
      'Failed query: insert into "corp_cards" ("id", "issuer", "number_last4", "label", "kind", "holder_user_id") values (default, $1, $2, $3, $4, $5) returning "id", "issuer"\nparams: E2E웨이브5카드사-abc, 8191, 중복카드웨이브5, personal, 9f2c1e40-91aa-4b21-9c4d-000000000001',
    );

    const message = handleServerError(sqlLeak);

    expect(message).not.toContain("insert into");
    expect(message).not.toContain("$1");
    expect(message).not.toContain("params:");
    expect(message).not.toContain("9f2c1e40-91aa-4b21-9c4d-000000000001");
    expect(message).not.toBe(sqlLeak.message);
  });

  it("메시지에 SQL이 없는 임의의 내부 Error도 클래스 기준으로 걸러진다(문자열 블록리스트가 아니다)", () => {
    // 문자열 매칭(예: "insert into" 포함 여부)으로 판단했다면 이런 무해해
    // 보이는 내부 오류는 통과했을 것이다 — 클래스(UserFacingError 상속 여부)로만
        // 판단해야 한다는 것을 이 케이스가 보장한다.
    const internal = new Error("경리팀 예산 시트 커넥터 타임아웃(internal id: srv-7781)");

    const message = handleServerError(internal);

    expect(message).not.toBe(internal.message);
    expect(message).not.toContain("srv-7781");
  });

  it("UserFacingError는 메시지가 그대로 화면에 나간다", () => {
    const message = handleServerError(new UserFacingError("로그인 필요 · 다시 로그인"));
    expect(message).toBe("로그인 필요 · 다시 로그인");
  });

  it("UserFacingError를 상속한 도메인 클래스도 화이트리스트를 통과한다", () => {
    class DuplicateCorpCardError extends UserFacingError {}
    const message = handleServerError(
      new DuplicateCorpCardError("이미 등록된 카드 · 발급사와 뒤 4자리 확인"),
    );
    expect(message).toBe("이미 등록된 카드 · 발급사와 뒤 4자리 확인");
  });

  it("ZodError는 기존처럼 한국어 한 줄로 가공된다(회귀 방지)", () => {
    const schema = z.coerce.number().int().min(0);
    const result = schema.safeParse(-5);
    if (result.success) throw new Error("test setup 오류: 실패해야 할 파싱이 성공했다");

    const message = handleServerError(result.error);

    expect(message).toBe("0 이상만 가능 · 값 확인");
    expect(result.error).toBeInstanceOf(ZodError);
  });

  it("Error가 아닌 값이 던져져도 일반 문구를 반환한다", () => {
    const message = handleServerError("문자열로 던져진 무언가" as unknown as Error);
    expect(message).not.toBe("문자열로 던져진 무언가");
    expect(message.length).toBeGreaterThan(0);
  });

  it("일반 문구는 SYSTEM.md §8 규칙(원인 · 다음 행동, 사과·느낌표 없음)을 따른다", () => {
    const message = handleServerError(new Error("Failed query: drop table users"));
    expect(message).toContain("·");
    expect(message).not.toContain("죄송");
    expect(message).not.toContain("!");
  });

  it("원본 오류를 서버 로그에 남긴다(디버깅 가능성 유지)", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      handleServerError(new Error("Failed query: insert into corp_cards ..."));
      expect(logSpy).toHaveBeenCalled();
      const loggedPayload = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
      expect(loggedPayload).toContain("Failed query");
    } finally {
      logSpy.mockRestore();
    }
  });
});
