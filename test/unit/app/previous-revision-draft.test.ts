import { describe, expect, it, vi } from "vitest";
// 표 모듈이 서버 액션을 거쳐 server-only를 import한다 — 순수 함수만 보므로 그 표식은 비운다.
vi.mock("server-only", () => ({}));

import { draftCopyRows } from "@/app/(app)/projects/[id]/previous-revision";

// /review(PR #128) — 다른 차수 보관본의 새 줄(보관 거래처 줄의 복제)은 거래처 id만 남아 복사 글자가 「—」였다.
// 그 차수의 줄이 서버에서 받은 같은 거래처 이름을 잇는다.
type Row = Parameters<typeof draftCopyRows>[0][number];

describe("다른 차수 보관본 복사 줄 — 보관 거래처 이름", () => {
  it("같은 거래처를 가진 줄이 받은 이름을 새 줄에 잇는다", () => {
    const archived = { id: "vendor-archived", name: "보관 거래처" };
    const saved: Row = {
      id: "line-1",
      lineKind: "quote",
      subcategory: "print",
      itemName: "배너",
      vendorId: archived.id,
      savedVendor: archived,
      quantity: 1,
      unitPriceAmount: 1000,
      unitPriceCurrency: "KRW",
      unitPriceFxRate: 1,
      unitPriceAmountKrw: 1000,
      quoteAmountKrw: 1000,
      executionAmount: 0,
      profitKrw: 1000,
      lineStatus: "not_started",
      note: null,
    };

    const rows = draftCopyRows([saved], { "new-1:new": { lineKind: "quote", vendorId: archived.id } });

    expect(rows.at(-1)).toMatchObject({ vendorId: archived.id, savedVendor: archived });
  });
});
