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

  // 적대 검토(PR #135) — 거래처를 가린 채 그린 줄이라는 표시는 보관 · 복원을 지나도 남는다(서버가 거래처를 원본 · 기존 값으로 둔다).
  it("새 줄: 거래처를 가린 채 복제한 줄의 표시를 되살린다", () => {
    const newId = "6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d";
    const sourceId = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    const copy: Line = { ...savedLine(1, 1000), clientKey: newId, id: newId, isNew: true, version: undefined, duplicatedFrom: sourceId, vendorHidden: true, dirty: true };
    const stash = JSON.parse(JSON.stringify(editsSnapshot([copy], null, PERIOD_V1, null, null))) as Record<string, unknown>;

    const [restored] = mergeRestoredEdits([], stash, "print", { quote: {} } as KindCells).lines;

    expect(restored).toMatchObject({ duplicatedFrom: sourceId, vendorHidden: true });
  });

  it("줄 칸: 거래처를 가린 채 고친 편집을 거래처가 보이는 줄에 복원하면 거래처 기준값은 지금 값이다(본 적 없는 칸의 충돌 없음)", () => {
    const vendorId = "vendor-1";
    const edited: Line = { ...savedLine(1, 1000), vendorHidden: true, itemName: "배너 고침", dirty: true };
    const stash = JSON.parse(JSON.stringify(editsSnapshot([edited], null, PERIOD_V1, null, null))) as Record<string, unknown>;

    const fresh = { ...savedLine(2, 1000), vendorId, baseline: { ...savedLine(2, 1000).baseline, vendorId } };
    const [restored] = mergeRestoredEdits([fresh], stash, "print", KIND_CELLS).lines;

    expect(restored).toMatchObject({ itemName: "배너 고침", version: 1, vendorId, baseline: { itemName: "배너", vendorId } });
    expect(restored).not.toHaveProperty("vendorHidden");
  });

  it("새 줄: 모양이 틀린 원본 id는 버린다(서버 uuid 검증에 저장 전체가 막히지 않게)", () => {
    const newId = "6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d";
    for (const duplicatedFrom of ["not-a-uuid", 123]) {
      const stash = { [`${newId}:new`]: { lineKind: "quote", duplicatedFrom, subcategory: "print", itemName: "배너" } };
      const [restored] = mergeRestoredEdits([], stash, "print", { quote: {} } as KindCells).lines;
      expect(restored).not.toHaveProperty("duplicatedFrom");
    }
  });
});

// /review(PR #128) — 보관본에서 되살린 새 줄(보관 거래처 줄의 복제)은 거래처 id만 남아 칸이 「—」였다.
// 표의 다른 줄이 서버에서 받은 같은 거래처 이름을 잇는다.
describe("복원 — 새 줄의 보관 거래처 이름", () => {
  it("같은 거래처를 가진 줄이 받은 이름을 새 줄에 잇는다", () => {
    const archived = { id: "vendor-archived", name: "보관 거래처" };
    const saved = { ...savedLine(1, 1000), vendorId: archived.id, savedVendor: archived };
    const added = { ...saved, clientKey: "new-1", id: "", isNew: true as const, dirty: true };
    const stash = editsSnapshot([added], null, PERIOD_V1, null, null);
    const cells = { quote: { vendorId: "edit" } } as unknown as KindCells;

    const restored = mergeRestoredEdits([saved], stash, "print", cells).lines.at(-1);

    expect(restored).toMatchObject({ vendorId: archived.id, savedVendor: archived });
  });
});
