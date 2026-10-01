import { describe, expect, it, vi } from "vitest";
// 표 모듈이 서버 액션을 거쳐 server-only를 import한다 — 순수 병합 함수만 보므로 그 표식은 비운다.
vi.mock("server-only", () => ({}));

import { editsSnapshot, mergeRestoredEdits } from "@/app/(app)/projects/[id]/quote-table";

// 검토 8(UI-SPEC S18 · §7-3 (나)) — 「복원」은 보관할 때의 줄 version·기준값과 기간 기준값을 되살려,
// 그 사이 동료가 저장했으면 저장 때 충돌로 간다. 옛 보관본(기준값 없음)의 칸은 버린다.
type Line = Parameters<typeof mergeRestoredEdits>[0][number];
type KindCells = Parameters<typeof mergeRestoredEdits>[3];

function savedLine(version: number, unitPriceKrw: number): Line {
  const baseline = {
    subcategory: "print",
    itemName: "배너",
    vendorId: null,
    quantity: 1,
    unitPriceAmountKrw: unitPriceKrw,
    executionAmountKrw: 0,
    lineStatus: "not_started",
    note: null,
  };
  return {
    clientKey: "line-1",
    id: "line-1",
    lineKind: "quote",
    version,
    subcategory: "print",
    itemName: "배너",
    vendorId: null,
    quantity: 1,
    unitPriceAmount: unitPriceKrw,
    unitPriceCurrency: "KRW",
    unitPriceFxRate: 1,
    unitPriceFxRateTouched: false,
    unitPriceAmountKrw: unitPriceKrw,
    executionAmount: 0,
    quoteAmountKrw: unitPriceKrw,
    profitKrw: unitPriceKrw,
    lineStatus: "not_started",
    note: null,
    dirty: false,
    baseline,
    cellErrors: {},
    cellConflicts: {},
    cells: {} as Line["cells"],
    hasLinkedDocuments: false,
    readonlyReason: null,
  };
}

const KIND_CELLS = {} as KindCells;
const PERIOD_V1 = { startDate: "2026-10-01", endDate: "2026-10-31" };

describe("복원 — 보관할 때의 기준값으로 충돌 판정(검토 8)", () => {
  it("줄 칸: 동료가 그 사이 저장한 줄에 복원하면 보관할 때의 version·baseline을 싣는다", () => {
    const edited = { ...savedLine(1, 1000), unitPriceAmount: 5000, unitPriceAmountKrw: 5000, dirty: true };
    const stash = editsSnapshot([edited], null, PERIOD_V1, null, null);

    const fresh = savedLine(2, 3000); // 동료가 단가를 3,000으로 저장해 version 2
    const [restored] = mergeRestoredEdits([fresh], stash, "print", KIND_CELLS).lines;

    expect(restored).toMatchObject({ unitPriceAmountKrw: 5000, dirty: true, version: 1, baseline: { unitPriceAmountKrw: 1000 } });
  });

  it("줄 칸: 기준값이 없는 옛 보관본은 칸을 들이지 않는다(조용히 덮지 않는다)", () => {
    const fresh = savedLine(2, 3000);
    const [restored] = mergeRestoredEdits([fresh], { "line-1:unitPrice": { amount: 5000, currency: "KRW", fxRate: 1 } }, "print", KIND_CELLS).lines;

    expect(restored).toMatchObject({ unitPriceAmountKrw: 3000, dirty: false });
  });

  it("기간: 보관할 때의 기간 기준값을 돌려준다", () => {
    const stash = editsSnapshot([], { start: "2026-10-01", end: "2026-11-15" }, PERIOD_V1, null, null);
    const restored = mergeRestoredEdits([], stash, "print", KIND_CELLS);

    expect(restored.period).toEqual({ end: "2026-11-15", base: PERIOD_V1 });
  });

  it("기간: 기준값이 없는 옛 보관본은 기간 칸을 들이지 않는다", () => {
    const restored = mergeRestoredEdits([], { "period:end": "2026-11-15" }, "print", KIND_CELLS);

    expect(restored.period).toEqual({});
  });

  // Codex 리뷰 P1(PR #125) — 복제한 새 줄은 복원 뒤에도 원본 id를 싣는다(거래처가 가려진 계급의 거래처를 서버가 원본에서 넘긴다).
  it("새 줄: 복제한 줄의 원본 id를 되살린다", () => {
    const newId = "6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d";
    const sourceId = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    const copy: Line = { ...savedLine(1, 1000), clientKey: newId, id: newId, isNew: true, version: undefined, duplicatedFrom: sourceId, dirty: true };
    const stash = JSON.parse(JSON.stringify(editsSnapshot([copy], null, PERIOD_V1, null, null))) as Record<string, unknown>;

    const [restored] = mergeRestoredEdits([], stash, "print", { quote: {} } as KindCells).lines;

    expect(restored).toMatchObject({ id: newId, isNew: true, duplicatedFrom: sourceId });
  });
});
