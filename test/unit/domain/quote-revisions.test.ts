import { describe, expect, it } from "vitest";
import {
  approvedOnOf,
  customerApprovalColumns,
  quoteDisplayNumber,
  resolveLinkedDocumentsByLineage,
  revisionStatusWord,
} from "@/domain/quotes/revisions";

// 04-14(CEO 리뷰 B-25) — 승인일은 KST 달력 날짜로 받아 그날 KST 00:00 순간으로 저장하고, 읽을 때 같은 날짜로
// 돌아온다(04-29 kstDayStart ↔ kstDateOf 한 쌍 — 도우미 자체의 왕복 표는 test/unit/lib/kst-date.test.ts).
describe("승인일 KST 왕복 (B-25)", () => {
  it("2026-09-19로 켜면 저장 순간은 2026-09-18T15:00:00.000Z이고 승인자가 함께 실린다", () => {
    const columns = customerApprovalColumns("u-pm", "2026-09-19");
    expect(columns.customerApprovedAt?.toISOString()).toBe("2026-09-18T15:00:00.000Z");
    expect(columns.customerApprovedBy).toBe("u-pm");
  });

  it("저장 순간을 읽으면 같은 날짜 2026-09-19로 돌아온다", () => {
    expect(approvedOnOf(customerApprovalColumns("u-pm", "2026-09-19").customerApprovedAt)).toBe("2026-09-19");
  });

  it("끄기는 승인일·승인자를 둘 다 비우고, 빈 승인일은 null로 읽힌다", () => {
    expect(customerApprovalColumns("u-pm", null)).toEqual({ customerApprovedAt: null, customerApprovedBy: null });
    expect(approvedOnOf(null)).toBeNull();
  });
});

// 04-14(D-56) — 견적 표시 번호는 저장 컬럼·카운터 없이 프로젝트 번호와 순번에서 만든다.
describe("quoteDisplayNumber (D-56)", () => {
  it("26001 · 2 → 26001-2차", () => {
    expect(quoteDisplayNumber("26001", 2)).toBe("26001-2차");
  });
});

// 04-14(D-55 · CEO 리뷰 B-33) — 이전 차수 줄의 연결 문서를 계보 사슬로 현재 차수 줄에 잇는다. 끊긴 계보의 문서는 따로.
describe("resolveLinkedDocumentsByLineage (D-55)", () => {
  const lines = [
    { id: "A", revisionSeq: 1, copiedFromLineId: null },
    { id: "B", revisionSeq: 2, copiedFromLineId: "A" },
    { id: "C", revisionSeq: 3, copiedFromLineId: "B" },
    { id: "D", revisionSeq: 1, copiedFromLineId: null },
    { id: "E", revisionSeq: 2, copiedFromLineId: "D" },
  ];

  it("1차 줄 A의 문서 X는 사슬 A → B → C를 따라 현재 차수 줄 C에 이어진다", () => {
    const result = resolveLinkedDocumentsByLineage(lines, new Map([["A", [{ number: "X" }]]]));
    expect(result.byCurrentLine).toEqual(new Map([["C", [{ number: "X" }]]]));
    expect(result.detached).toEqual([]);
  });

  it("새 차수에서 빠진 줄(D → E에서 끊김)의 문서는 어느 현재 줄에도 붙지 않고 detached로 돌아온다", () => {
    const result = resolveLinkedDocumentsByLineage(
      lines,
      new Map([
        ["E", [{ number: "Y" }]],
        ["C", [{ number: "Z" }]],
      ]),
    );
    expect(result.byCurrentLine).toEqual(new Map([["C", [{ number: "Z" }]]]));
    expect(result.detached).toEqual([{ number: "Y" }]);
  });

  it("줄·문서가 없으면 빈 결과", () => {
    const result = resolveLinkedDocumentsByLineage([], new Map());
    expect(result.byCurrentLine.size).toBe(0);
    expect(result.detached).toEqual([]);
  });
});

// 04-14(S5 · U-2 사용자 확정) — 차수 상태 낱말: 최신 미승인 `현재` · 승인 `승인`(최신이어도 `승인`만) · 승인 없이 지나간 이전 차수 빈 값.
describe("revisionStatusWord (U-2)", () => {
  it.each([
    [{ seq: 3, latestSeq: 3, approved: false }, "현재"],
    [{ seq: 3, latestSeq: 3, approved: true }, "승인"],
    [{ seq: 1, latestSeq: 3, approved: true }, "승인"],
    [{ seq: 2, latestSeq: 3, approved: false }, ""],
  ])("%o → %s", (input, word) => {
    expect(revisionStatusWord(input)).toBe(word);
  });
});
