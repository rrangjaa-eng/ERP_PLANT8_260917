import { describe, expect, it, vi } from "vitest";
// 표 모듈이 서버 액션을 거쳐 server-only를 import한다 — 순수 함수만 보므로 그 표식은 비운다.
vi.mock("server-only", () => ({}));

import { quoteLineVendorPasteOptions } from "@/app/(app)/projects/[id]/previous-revision";
import { reserveClientPasteOptions } from "@/app/(app)/pnl/reserves/reserves-table";

// 261006-biv /review 4 — 고르는 목록은 갈래로 걸러지지만, 표에 이미 저장된 다른 갈래 거래처 · 클라이언트를 복사해 다시 붙이면
// 「목록에 없는 값」이 되면 안 된다. 붙여넣기 선택지에는 지금 줄들의 저장값을 더한다(id로 겹침 없음).

describe("견적 줄 거래처 붙여넣기 선택지", () => {
  const vendors = [
    { id: "v-supplier", name: "스테이지원" },
    { id: "v-both", name: "둘다상사" },
  ];

  it("걸러진 목록 + 지금 줄의 저장된 거래처(목록에 없는 것만, 한 번씩)", () => {
    const options = quoteLineVendorPasteOptions(vendors, [
      { savedVendor: { id: "v-client", name: "클라이언트사" } },
      { savedVendor: { id: "v-client", name: "클라이언트사" } },
      { savedVendor: { id: "v-supplier", name: "스테이지원" } },
      { savedVendor: null },
      {},
    ]);
    expect(options).toEqual([
      { value: "", label: "—" },
      { value: "v-supplier", label: "스테이지원" },
      { value: "v-both", label: "둘다상사" },
      { value: "v-client", label: "클라이언트사" },
    ]);
  });
});

describe("리저브 클라이언트 붙여넣기 선택지", () => {
  const clients = [
    { id: "c-client", name: "가나", label: "가나" },
    { id: "c-dup", name: "다라", label: "다라 · 1234" },
  ];

  it("이름 · 라벨 선택지 + 지금 줄의 저장된 클라이언트(목록에 없는 것만, 한 번씩, 빈 줄 제외)", () => {
    const options = reserveClientPasteOptions(clients, [
      { clientId: "c-supplier", clientName: "협력사로바뀜" },
      { clientId: "c-supplier", clientName: "협력사로바뀜" },
      { clientId: "c-client", clientName: "가나" },
      { clientId: "", clientName: "" },
    ]);
    expect(options).toEqual([
      { value: "c-client", label: "가나" },
      { value: "c-dup", label: "다라" },
      { value: "c-dup", label: "다라 · 1234" },
      { value: "c-supplier", label: "협력사로바뀜" },
    ]);
  });
});
