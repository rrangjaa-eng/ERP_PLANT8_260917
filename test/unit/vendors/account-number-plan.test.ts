import { describe, expect, it } from "vitest";
import { planAccountNumberUpdate } from "@/domain/vendors";

// 03-REVIEW M-5: updateVendor의 계좌번호 계약이 accountNumber: z.string().optional()라
// ""가 그대로 통과했고, domain은 `input.accountNumber !== undefined`만 보고 분기해
// ""를 "지움"으로 해석 — 암호문·뒤 4자리 두 컬럼을 모두 null로 만들었다. 편집 폼에서
// "안 바꿈"을 표현하는 가장 자연스러운 방법(칸을 비워 둠)이 그대로 저장된 계좌번호를
// 지워버리는 landmine이었다. planAccountNumberUpdate로 그 분기를 순수 함수 하나로
// 뽑아 undefined(안 바꿈) · null(지움) · 문자열(새 값)을 구분해 고정한다(cardOwnerKind와
// 같은 결 — DB 없이 단위 테스트로 계약을 굳힌다).
describe("planAccountNumberUpdate (MAST-01 M-5, 단위)", () => {
  it("입력이 undefined면 안 바꿈이다 — 기존 암호문·뒤 4자리를 건드리지 않는다", () => {
    expect(planAccountNumberUpdate(undefined)).toEqual({ kind: "keep" });
  });

  it("입력이 null이면 지움이다 — 암호문·뒤 4자리를 모두 지운다", () => {
    expect(planAccountNumberUpdate(null)).toEqual({ kind: "clear" });
  });

  it("빈 문자열은 지움이 아니라 안 바꿈으로 처리한다 — M-5가 고친 landmine", () => {
    expect(planAccountNumberUpdate("")).toEqual({ kind: "keep" });
  });

  it("공백만 있는 문자열도 안 바꿈으로 처리한다", () => {
    expect(planAccountNumberUpdate("   ")).toEqual({ kind: "keep" });
  });

  it("실제 값이 있으면 주입받은 암호화 함수로 암호화하고 뒤 4자리를 만든다", () => {
    const fakeEncrypt = (plaintext: string) => `ENC(${plaintext})`;
    expect(planAccountNumberUpdate("110-222-333444", fakeEncrypt)).toEqual({
      kind: "set",
      accountNumberEncrypted: "ENC(110-222-333444)",
      accountNumberLast4: "3444",
    });
  });

  it("앞뒤 공백은 잘라내고 암호화·뒤 4자리를 계산한다", () => {
    const fakeEncrypt = (plaintext: string) => `ENC(${plaintext})`;
    expect(planAccountNumberUpdate("  999-000-111222  ", fakeEncrypt)).toEqual({
      kind: "set",
      accountNumberEncrypted: "ENC(999-000-111222)",
      accountNumberLast4: "1222",
    });
  });
});
