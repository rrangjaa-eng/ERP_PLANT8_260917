import { describe, expect, it } from "vitest";
import { buildChanges, maskLast4, moneyChangeText } from "@/domain/action-log/changes";
import { formatForeignLine } from "@/lib/format-number";

describe("buildChanges (07-04 R5)", () => {
  it("바뀐 칸만 [이전, 이후]로 돌려준다", () => {
    expect(buildChanges({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({ b: [2, 3] });
  });

  it("같은 값이면 빈 객체", () => {
    expect(buildChanges({ a: 1, b: [1, 2], c: { x: 1 } }, { a: 1, b: [1, 2], c: { x: 1 } })).toEqual({});
  });

  it("배열 · 객체 값은 JSON 동치로 비교한다(키 순서 무관)", () => {
    expect(buildChanges({ a: [1, 2] }, { a: [1, 3] })).toEqual({ a: [[1, 2], [1, 3]] });
    expect(buildChanges({ o: { x: 1, y: 2 } }, { o: { y: 2, x: 1 } })).toEqual({});
  });

  it("한쪽에만 있는 칸은 없는 쪽을 null로 싣는다", () => {
    expect(buildChanges({ a: 1 }, { b: 2 })).toEqual({ a: [1, null], b: [null, 2] });
  });

  it("다섯 칸이 바뀌면 다섯 칸 전부를 돌려준다(자르지 않는다)", () => {
    const before = { a: 1, b: 1, c: 1, d: 1, e: 1 };
    const after = { a: 2, b: 2, c: 2, d: 2, e: 2 };
    expect(Object.keys(buildChanges(before, after))).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("계좌번호(last4)는 뒤 네 자리만, 원값이 어디에도 없다", () => {
    const changes = buildChanges({ bankAccountNo: "110-123-456789" }, { bankAccountNo: "110-999-000123" }, { bankAccountNo: "last4" });
    expect(changes).toEqual({ bankAccountNo: ["····6789", "····0123"] });
    expect(JSON.stringify(changes)).not.toMatch(/110|123-456|999/);
  });

  it("주민번호 · 비밀번호(changed)는 양쪽 모두 「바뀜」 한 낱말", () => {
    const changes = buildChanges(
      { rrn: "900101-1234567", password: "old-secret" },
      { rrn: "900101-7654321", password: "new-secret" },
      { rrn: "changed", password: "changed" },
    );
    expect(changes).toEqual({ rrn: ["바뀜", "바뀜"], password: ["바뀜", "바뀜"] });
    expect(JSON.stringify(changes)).not.toMatch(/1234567|7654321|secret/);
  });

  it("민감 칸이 같은 값이면 싣지 않는다", () => {
    expect(buildChanges({ rrn: "x" }, { rrn: "x" }, { rrn: "changed" })).toEqual({});
  });
});

describe("maskLast4", () => {
  it("숫자만 남겨 뒤 네 자리 앞에 ····", () => {
    expect(maskLast4("110-123-456789")).toBe("····6789");
  });

  it("네 자리 미만이면 바뀜", () => {
    expect(maskLast4("12-3")).toBe("바뀜");
    expect(maskLast4("")).toBe("바뀜");
  });
});

// 07.1-13 S8(E-P2-40): 단가 · 실행가 · 매출 금액 · 사전 견적의 로그 값은 Money 한 줄 글자다.
describe("moneyChangeText (07.1-13 S8)", () => {
  it("원화는 쉼표 + 원", () => {
    expect(moneyChangeText({ currency: "KRW", foreignAmount: null, fxRate: 1, amountKrw: 1000000 })).toBe("1,000,000원");
  });

  it("외화는 견적 줄 2행 글자 + · 원화", () => {
    const foreign = formatForeignLine({ currency: "USD", amount: 1000, fxRate: 1350 });
    expect(moneyChangeText({ currency: "USD", foreignAmount: "1000.00", fxRate: "1350.0000", amountKrw: 1350000 })).toBe(`${foreign} · 1,350,000원`);
    expect(moneyChangeText({ currency: "USD", foreignAmount: 1000, fxRate: 1350, amountKrw: 1350000 })).toBe(`${foreign} · 1,350,000원`);
  });

  it("외화인데 외화 금액이 비면 원화만", () => {
    expect(moneyChangeText({ currency: "USD", foreignAmount: null, fxRate: "1350", amountKrw: 0 })).toBe("0원");
  });
});
