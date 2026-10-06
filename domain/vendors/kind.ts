// 261006-biv — 거래처 갈래(클라이언트 · 협력사 · 둘 다). import 없는 순수 모듈 — 클라이언트 컴포넌트(vendor-form.tsx)도 쓴다.
// 「둘 다 포함」 규칙은 vendorKindsFor · servesSide 두 곳에만 둔다(D-5 · D-6).

export const VENDOR_KINDS = ["client", "supplier", "both"] as const;
export type VendorKind = (typeof VENDOR_KINDS)[number];
export type VendorSide = "client" | "supplier";

export const VENDOR_KIND_LABELS: Record<VendorKind, string> = {
  client: "클라이언트",
  supplier: "협력사",
  both: "둘 다",
};

// D-3 — 옛 인트라넷 거래처 278곳 중 클라이언트 22곳이라 등록 기본은 협력사.
export const DEFAULT_NEW_VENDOR_KIND: VendorKind = "supplier";

export function vendorKindsFor(side: VendorSide): VendorKind[] {
  return [side, "both"];
}

export function servesSide(kind: VendorKind, side: VendorSide): boolean {
  return kind === side || kind === "both";
}

export function parseVendorSide(raw: string | undefined): VendorSide | null {
  return raw === "client" || raw === "supplier" ? raw : null;
}

export function isVendorKind(value: string): value is VendorKind {
  return (VENDOR_KINDS as readonly string[]).includes(value);
}
