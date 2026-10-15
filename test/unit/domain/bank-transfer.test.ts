import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PROBLEMS,
  BANK_TRANSFER_MAX_BYTES,
  accountProblemText,
  bankNameProblem,
  cp949ByteLength,
  cp949Unsupported,
  holderTextProblem,
  resolveBankCode,
} from "@/domain/bank-transfer";

// 06.5-04(D-6506 · REVIEWS DH-3): 신한 대량이체 양식의 판정 몫 — 옛 app/src/domain/bankTransfer.ts 이식. 06.5-06이 행 빌더 시험을 더한다.
describe("resolveBankCode — 옛 코드표 · 별칭 그대로", () => {
  it("코드는 글자다 — 앞자리 0을 지킨다", () => {
    expect(resolveBankCode("신한은행")).toBe("088");
    expect(resolveBankCode("신한")).toBe("088");
  });

  it("「중국은행」은 코드표에 그 이름 그대로 있다 — 「은행」을 떼기 전에 찾는다", () => {
    expect(resolveBankCode("중국은행")).toBe("063");
  });

  it("별칭 · 빈칸 · 이미 코드인 값", () => {
    expect(resolveBankCode("NH농협은행")).toBe("011");
    expect(resolveBankCode(" 국민 은행 ")).toBe("004");
    expect(resolveBankCode("004")).toBe("004");
    expect(resolveBankCode("999")).toBeNull();
  });

  it("알 수 없는 이름 · 빈 값은 null(짐작하지 않는다)", () => {
    expect(resolveBankCode("없는은행")).toBeNull();
    expect(resolveBankCode("  ")).toBeNull();
  });
});

describe("CP949 바이트 자", () => {
  it("ASCII 1 · 그 밖 2바이트", () => {
    expect(cp949ByteLength("홍길동")).toBe(6);
    expect(cp949ByteLength("ABC홍")).toBe(5);
  });

  it("BMP 밖 글자(이모지)는 담을 수 없는 글자로 고른다", () => {
    expect(cp949Unsupported("김😀")).toEqual(["😀"]);
    expect(cp949Unsupported("김철수")).toEqual([]);
  });

  it("예금주 한도는 20바이트", () => {
    expect(BANK_TRANSFER_MAX_BYTES.holder).toBe(20);
  });
});

describe("이유 쌍 · 칸 판정", () => {
  it("이유 문구 = 원인 · 고칠 일", () => {
    expect(accountProblemText(ACCOUNT_PROBLEMS.holderRequired)).toBe("예금주 없음 · 예금주 적기");
  });

  it("holderTextProblem — 한글 10자 통과, 11자 길이 초과, 이모지는 길이보다 먼저 형식 오류", () => {
    expect(holderTextProblem("가나다라마바사아자차")).toBeNull();
    expect(holderTextProblem("가나다라마바사아자차카")).toBe(ACCOUNT_PROBLEMS.holderTooLong);
    expect(accountProblemText(ACCOUNT_PROBLEMS.holderTooLong)).toBe("예금주 길이 초과 · 예금주 줄이기");
    expect(holderTextProblem("가나다라마바사아자차카😀")).toBe(ACCOUNT_PROBLEMS.holderUnsupported);
    expect(accountProblemText(ACCOUNT_PROBLEMS.holderUnsupported)).toBe("예금주 형식 오류 · 예금주 고치기");
  });

  it("bankNameProblem — 코드로 안 풀리면 은행 코드 없음", () => {
    expect(bankNameProblem("없는은행")).toBe(ACCOUNT_PROBLEMS.bankCodeUnknown);
    expect(accountProblemText(ACCOUNT_PROBLEMS.bankCodeUnknown)).toBe("은행 코드 없음 · 은행 이름 고치기");
    expect(bankNameProblem("신한은행")).toBeNull();
  });
});
