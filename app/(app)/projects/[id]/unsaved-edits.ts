// 04-21(DR-6 · B-03 · ENG-D9) — UI-SPEC rev 5 Copywriting 「막힘 — 미저장 편집」. 상태 전환 트리거와
// 그룹 B의 새 차수·고객 승인 모달(04-24)이 같은 함수 · 같은 글자를 쓴다.
export function unsavedEditsReason(count: number): string | null {
  return count >= 1 ? `저장 안 한 편집 ${count}칸 · 먼저 일괄 저장` : null;
}

type LineCellValues = {
  dirty: boolean;
  isNew?: true;
  moved?: true;
  baseline: {
    subcategory: string;
    itemName: string;
    vendorId: string | null;
    quantity: number;
    unitPriceAmountKrw: number;
    executionAmountKrw: number;
    lineStatus: string;
    note: string | null;
  };
  subcategory: string;
  itemName: string;
  vendorId: string | null;
  quantity: number;
  unitPriceAmountKrw: number;
  executionAmount: number;
  lineStatus: string;
  note: string | null;
};

const LINE_FIELD_KEYS = ["subcategory", "itemName", "vendor", "quantity", "unitPrice", "execution", "status", "note"];

// 저장 안 한 칸 표시 — 저장된 값(baseline)과 다른 칸만 true. 새 줄의 baseline은 만들 때의 기본값이라 같은 규칙이 선다.
export function lineCellDirty(line: LineCellValues, columnKey: string): boolean {
  if (!line.dirty) return false;
  const base = line.baseline;
  // 번호 칸 — 고친 칸이 없는 줄(새 줄 · 복제 · 이동만)은 칸 대신 번호 칸에 삼각형. 칸 표시는 칸별 규칙 그대로.
  if (columnKey === "sort") {
    return line.isNew === true || line.moved === true || !LINE_FIELD_KEYS.some((key) => lineCellDirty(line, key));
  }
  switch (columnKey) {
    case "subcategory":
      return line.subcategory !== base.subcategory;
    case "itemName":
      return line.itemName !== base.itemName;
    case "vendor":
      return line.vendorId !== base.vendorId;
    case "quantity":
      return line.quantity !== base.quantity;
    case "unitPrice":
      return line.unitPriceAmountKrw !== base.unitPriceAmountKrw;
    case "execution":
      return line.executionAmount !== base.executionAmountKrw;
    case "status":
      return line.lineStatus !== base.lineStatus;
    case "note":
      return line.note !== base.note;
    default:
      return false;
  }
}
