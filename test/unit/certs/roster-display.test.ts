import { describe, expect, it } from "vitest";
import { buildPublicRows, findIndistinguishable, type WinnerForDisplay } from "@/domain/certs/roster-display";

function winner(overrides: Partial<WinnerForDisplay> & { id: string; name: string | null }): WinnerForDisplay {
  return {
    prizeName: "갤럭시 탭 S10",
    quantity: 1,
    distinguishLabel: null,
    sortOrder: 0,
    ...overrides,
  };
}

describe("domain/certs/roster-display", () => {
  describe("buildPublicRows", () => {
    it("가림이 겹치지 않으면(다른 경품이어도) 2행이 없다", () => {
      const rows = buildPublicRows([
        winner({ id: "1", name: "김하늘", prizeName: "A상품" }),
        winner({ id: "2", name: "김하윤", prizeName: "B상품" }),
      ]);
      expect(rows).toEqual([
        { rowId: "1", maskedName: "김*늘" },
        { rowId: "2", maskedName: "김*윤" },
      ]);
    });

    it("가림이 겹치면(경품이 달라도) 각자 2행이 붙는다", () => {
      // 가나다순: "문" < "민"이라 김문수가 먼저 온다(실제 이름 정렬).
      const rows = buildPublicRows([
        winner({ id: "1", name: "김민수", prizeName: "A상품", quantity: 1 }),
        winner({ id: "2", name: "김문수", prizeName: "B상품", quantity: 2 }),
      ]);
      expect(rows).toEqual([
        { rowId: "2", maskedName: "김*수", prizeLine: "B상품 2개" },
        { rowId: "1", maskedName: "김*수", prizeLine: "A상품 1개" },
      ]);
    });

    it("가림이 겹치고 구별 표시가 있으면 2행 + label", () => {
      const rows = buildPublicRows([
        winner({ id: "1", name: "김민수", distinguishLabel: "오전 조" }),
        winner({ id: "2", name: "김문수", distinguishLabel: "오후 조" }),
      ]);
      expect(rows).toEqual([
        { rowId: "2", maskedName: "김*수", prizeLine: "갤럭시 탭 S10 1개", label: "오후 조" },
        { rowId: "1", maskedName: "김*수", prizeLine: "갤럭시 탭 S10 1개", label: "오전 조" },
      ]);
    });

    it("가림이 겹치지 않아도 구별 표시가 있으면 2행이 붙는다(구별 표시는 늘 보인다)", () => {
      const rows = buildPublicRows([winner({ id: "1", name: "이도윤", distinguishLabel: "오전 조" })]);
      expect(rows).toEqual([
        { rowId: "1", maskedName: "이*윤", prizeLine: "갤럭시 탭 S10 1개", label: "오전 조" },
      ]);
    });

    it("결과 행 수는 당첨자 수와 같다(묶음 없음) 및 실제 이름 가나다순 정렬", () => {
      const rows = buildPublicRows([
        winner({ id: "1", name: "나상현" }),
        winner({ id: "2", name: "가나다" }),
      ]);
      expect(rows.map((r) => r.rowId)).toEqual(["2", "1"]);
    });

    it("파기된 자리(이름 null)는 결과에서 빠진다", () => {
      const rows = buildPublicRows([winner({ id: "1", name: "김하늘" }), winner({ id: "2", name: null })]);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.rowId).toBe("1");
    });
  });

  describe("findIndistinguishable", () => {
    it("같은 경품·구별 표시 없이 이름이 겹치면 묶음 하나", () => {
      const groups = findIndistinguishable([
        winner({ id: "1", name: "김민수" }),
        winner({ id: "2", name: "김문수" }),
      ]);
      expect(groups).toEqual([["1", "2"]]);
    });

    it("한쪽만 구별 표시가 있으면 2행 문자열이 달라 빈 배열", () => {
      const groups = findIndistinguishable([
        winner({ id: "1", name: "김민수", distinguishLabel: "오전 조" }),
        winner({ id: "2", name: "김문수" }),
      ]);
      expect(groups).toEqual([]);
    });

    it("둘 다 같은 구별 표시면 묶음 하나", () => {
      const groups = findIndistinguishable([
        winner({ id: "1", name: "김민수", distinguishLabel: "오전 조" }),
        winner({ id: "2", name: "김문수", distinguishLabel: "오전 조" }),
      ]);
      expect(groups).toEqual([["1", "2"]]);
    });

    it("파기된 자리는 세지 않는다", () => {
      const groups = findIndistinguishable([
        winner({ id: "1", name: "김민수" }),
        winner({ id: "2", name: "김문수" }),
        winner({ id: "3", name: null }),
      ]);
      expect(groups).toEqual([["1", "2"]]);
    });
  });
});
