import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PROBLEMS,
  BANK_TRANSFER_HEADER,
  BANK_TRANSFER_MAX_BYTES,
  BANK_TRANSFER_SHEET,
  accountProblemText,
  bankTransferCells,
  buildBankTransferRows,
  mergeTransferLines,
  payeeKeyOf,
  truncateCp949,
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

// 06.5-06(D-6504): 행 빌더 몫 — 칸 규칙은 옛 app/src/domain/bankTransfer.ts:59-69 · :72 · :442 · :542 이식.
describe("행 빌더(06.5 D-6504)", () => {
  const source = { key: "v:1", bank: "신한은행", holder: "테스트 예금주", accountNumber: "110-123-456789", transferKrw: 13_640_000, memo: "26001-0004" };

  it("머리글 9칸 · 시트 이름은 옛 양식 그대로(마지막 칸만 소문자 key)", () => {
    expect(BANK_TRANSFER_HEADER).toEqual(["*입금은행", "*입금계좌", "고객관리성명", "*입금액", "출금통장표시내용", "입금통장표시내용", "입금인코드", "비고", "업체사용key"]);
    expect(BANK_TRANSFER_SHEET).toBe("입력정보");
  });

  it("truncateCp949 — 문자 경계에서 바이트 한도 이하로 자르고, 한도 안이면 그대로", () => {
    const cut = truncateCp949("ABC홍길동가나다라", 14);
    expect(cut).toBe("ABC홍길동가나");
    expect(cp949ByteLength(cut)).toBeLessThanOrEqual(14);
    expect(truncateCp949("홍길동", 14)).toBe("홍길동");
    expect(truncateCp949("가나다라마바사아", 14)).toBe("가나다라마바사");
  });

  it("buildBankTransferRows — 은행 코드 088 · 하이픈 뗀 계좌 · 금액 글자 · 출금통장표시내용 = 예금주 14바이트 · 비고 · key = 문서 번호", () => {
    const built = buildBankTransferRows([{ ...source, holder: "가나다라마바사아자차" }]);
    expect(built.blocked).toEqual([]);
    expect(built.rows).toEqual([
      {
        key: "v:1",
        row: {
          bankCode: "088",
          accountNo: "110123456789",
          holder: "가나다라마바사아자차",
          amount: "13640000",
          ourNote: "가나다라마바사",
          theirNote: "",
          payerCode: "",
          memo: "26001-0004",
          key: "26001-0004",
        },
      },
    ]);
  });

  it("bankTransferCells — 9칸이 머리글 차례이고 모두 문자열", () => {
    const [line] = buildBankTransferRows([source]).rows;
    if (!line) throw new Error("줄 없음");
    const cells = bankTransferCells(line.row);
    expect(cells).toHaveLength(BANK_TRANSFER_HEADER.length);
    for (const cell of cells) expect(typeof cell).toBe("string");
    expect(cells).toEqual(["088", "110123456789", "테스트 예금주", "13640000", "테스트 예금주", "", "", "26001-0004", "26001-0004"]);
  });
});

// 06.5-06(D-6519 · ND-6): 지급처마다 한 줄 — 키는 옛 O: server/src/payments.ts:352-361 그대로(v: · p: · x:).
describe("지급처 합치기(06.5 D-6519)", () => {
  const row = (expenseId: string, extra: { vendorId?: string | null; payeeUserId?: string | null; number?: string; transferKrw?: number }) => ({
    expenseId,
    vendorId: extra.vendorId ?? null,
    payeeUserId: extra.payeeUserId ?? null,
    number: extra.number ?? `26001-${expenseId}`,
    transferKrw: extra.transferKrw ?? 10_000,
  });

  it("payeeKeyOf — 거래처 v: · 직원 p: · 지급처 없음 x:{문서}", () => {
    expect(payeeKeyOf(row("e1", { vendorId: "a" }))).toBe("v:a");
    expect(payeeKeyOf(row("e2", { payeeUserId: "a" }))).toBe("p:a");
    expect(payeeKeyOf(row("e3", {}))).toBe("x:e3");
  });

  it("같은 거래처 둘 + 다른 거래처 하나 → 줄 둘 · 첫 줄 합 50000 · 비고는 첫 번호 + 외 1건 · 같은 id 글자의 거래처 · 직원은 섞이지 않고 x: 는 합치지 않는다", () => {
    const lines = mergeTransferLines([
      row("e1", { vendorId: "a", number: "26001-0004", transferKrw: 30_000 }),
      row("e2", { vendorId: "b", number: "26001-0005", transferKrw: 7_000 }),
      row("e3", { vendorId: "a", number: "26001-0006", transferKrw: 20_000 }),
    ]);
    expect(lines).toEqual([
      { payeeKey: "v:a", expenseIds: ["e1", "e3"], totalKrw: 50_000, memo: "26001-0004 외 1건" },
      { payeeKey: "v:b", expenseIds: ["e2"], totalKrw: 7_000, memo: "26001-0005" },
    ]);
    expect(cp949ByteLength(lines[0]?.memo ?? "")).toBeLessThanOrEqual(20);
    const mixed = mergeTransferLines([row("e1", { vendorId: "a" }), row("e2", { payeeUserId: "a" }), row("e3", {}), row("e4", {})]);
    expect(mixed.map((line) => line.payeeKey)).toEqual(["v:a", "p:a", "x:e3", "x:e4"]);
  });

  it("비고가 20바이트를 넘으면 문자 경계에서 자른다", () => {
    const many = Array.from({ length: 12 }, (_, index) => row(`e${index}`, { vendorId: "a", number: "PRJ-2026-000123-0001" }));
    const [line] = mergeTransferLines(many);
    expect(cp949ByteLength(line?.memo ?? "")).toBeLessThanOrEqual(20);
    expect(line?.memo.startsWith("PRJ-2026-000123-0001")).toBe(true);
  });

  it("합친 직원 지급처 줄의 계좌(예금주)가 없으면 그 키 하나로 막혀 두 문서 모두 같은 이유가 된다", () => {
    const [line] = mergeTransferLines([row("e1", { payeeUserId: "u" }), row("e2", { payeeUserId: "u" })]);
    if (!line) throw new Error("줄 없음");
    const built = buildBankTransferRows([{ key: line.payeeKey, bank: "신한은행", holder: "", accountNumber: "110-123-456789", transferKrw: line.totalKrw, memo: line.memo }]);
    expect(built.rows).toEqual([]);
    expect(built.blocked).toEqual([{ key: "p:u", problem: ACCOUNT_PROBLEMS.holderRequired }]);
    expect(line.expenseIds).toEqual(["e1", "e2"]);
  });
});
