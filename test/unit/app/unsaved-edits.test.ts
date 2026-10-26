import { describe, expect, it } from "vitest";
import { lineCellDirty, unsavedEditsReason } from "@/app/(app)/projects/[id]/unsaved-edits";

// 04-21(DR-6 · B-03 · ENG-D9) — 미저장 편집 막힘 문구 한 함수. 상태 전환 트리거와 그룹 B의
// 새 차수·고객 승인 모달이 같은 글자를 쓴다(UI-SPEC rev 5 Copywriting 「막힘 — 미저장 편집」).
describe("unsavedEditsReason", () => {
  it("편집이 없으면 null", () => {
    expect(unsavedEditsReason(0)).toBeNull();
  });

  it.each([
    [1, "저장 안 한 편집 1칸 · 먼저 일괄 저장"],
    [3, "저장 안 한 편집 3칸 · 먼저 일괄 저장"],
  ])("%i칸이면 %s", (count, expected) => {
    expect(unsavedEditsReason(count)).toBe(expected);
  });
});

// 저장 안 한 칸 표시 — 줄 전체가 아니라 저장된 값(baseline)과 다른 칸만 표시한다. 새 줄도 같은 규칙(baseline = 만들 때의 기본값).
describe("lineCellDirty", () => {
  const base = { subcategory: "A", itemName: "", vendorId: null, quantity: 1, unitPriceAmountKrw: 0, executionAmountKrw: 0, lineStatus: "not_started", note: null };
  const line = (patch: Partial<Parameters<typeof lineCellDirty>[0]>) => ({
    dirty: true,
    baseline: base,
    subcategory: "A",
    itemName: "",
    vendorId: null,
    quantity: 1,
    unitPriceAmountKrw: 0,
    executionAmount: 0,
    lineStatus: "not_started",
    note: null,
    ...patch,
  });

  it("고친 칸만 true", () => {
    const edited = line({ itemName: "무대", quantity: 3 });
    expect(lineCellDirty(edited, "itemName")).toBe(true);
    expect(lineCellDirty(edited, "quantity")).toBe(true);
    expect(lineCellDirty(edited, "subcategory")).toBe(false);
    expect(lineCellDirty(edited, "unitPrice")).toBe(false);
    expect(lineCellDirty(edited, "note")).toBe(false);
  });

  it("dirty 아닌 줄 · 계산 열 · 모르는 열은 false", () => {
    expect(lineCellDirty(line({ dirty: false, itemName: "무대" }), "itemName")).toBe(false);
    expect(lineCellDirty(line({ itemName: "무대" }), "quoteAmount")).toBe(false);
  });

  it("고쳤다 되돌린 칸은 false", () => {
    expect(lineCellDirty(line({ dirty: true, quantity: 1 }), "quantity")).toBe(false);
  });

  // 고친 칸이 없는 저장 안 한 줄(Ctrl+Enter 새 줄 · Ctrl+D 복제 · Alt+↑↓ 이동만)은 번호 칸에만 삼각형.
  it("새 줄 · 이동만 한 줄은 번호 칸(sort)에 삼각형, 칸은 그대로", () => {
    expect(lineCellDirty(line({ isNew: true }), "sort")).toBe(true);
    expect(lineCellDirty(line({ moved: true }), "sort")).toBe(true);
    expect(lineCellDirty(line({ isNew: true }), "itemName")).toBe(false);
  });

  it("복제 줄처럼 새 줄에 고친 칸이 있어도 번호 칸 삼각형", () => {
    expect(lineCellDirty(line({ isNew: true, itemName: "무대" }), "sort")).toBe(true);
  });

  it("고친 칸이 있는 저장된 줄은 번호 칸 삼각형 없음 · dirty 아니면 없음", () => {
    expect(lineCellDirty(line({ itemName: "무대" }), "sort")).toBe(false);
    expect(lineCellDirty(line({ dirty: false, isNew: true }), "sort")).toBe(false);
  });
});
