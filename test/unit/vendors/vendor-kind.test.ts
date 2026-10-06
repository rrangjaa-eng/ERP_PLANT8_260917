import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEW_VENDOR_KIND,
  VENDOR_KIND_LABELS,
  VENDOR_KINDS,
  isVendorKind,
  parseVendorSide,
  servesSide,
  vendorKindsFor,
} from "@/domain/vendors/kind";

// 261006-biv — 거래처 갈래(클라이언트 · 협력사 · 둘 다). 「둘 다 포함」 규칙은 vendorKindsFor · servesSide 두 곳에만 있다.
describe("거래처 갈래 규칙 (261006-biv, 단위)", () => {
  it("한쪽 갈래의 선택 목록은 그 갈래와 「둘 다」다", () => {
    expect(vendorKindsFor("client")).toEqual(["client", "both"]);
    expect(vendorKindsFor("supplier")).toEqual(["supplier", "both"]);
  });

  it("servesSide — 클라이언트는 클라이언트 쪽만, 협력사는 협력사 쪽만, 둘 다는 양쪽", () => {
    expect(servesSide("client", "client")).toBe(true);
    expect(servesSide("client", "supplier")).toBe(false);
    expect(servesSide("supplier", "client")).toBe(false);
    expect(servesSide("supplier", "supplier")).toBe(true);
    expect(servesSide("both", "client")).toBe(true);
    expect(servesSide("both", "supplier")).toBe(true);
  });

  it("parseVendorSide는 client · supplier만 받고 나머지는 null(전체)이다", () => {
    expect(parseVendorSide("client")).toBe("client");
    expect(parseVendorSide("supplier")).toBe("supplier");
    expect(parseVendorSide("both")).toBeNull();
    expect(parseVendorSide("")).toBeNull();
    expect(parseVendorSide("x")).toBeNull();
    expect(parseVendorSide(undefined)).toBeNull();
  });

  it("isVendorKind는 세 값만 참이다", () => {
    expect(VENDOR_KINDS.every((kind) => isVendorKind(kind))).toBe(true);
    expect(isVendorKind("other")).toBe(false);
    expect(isVendorKind("")).toBe(false);
  });

  it("화면 글자는 클라이언트 · 협력사 · 둘 다, 표시 순서도 같다", () => {
    expect(VENDOR_KINDS).toEqual(["client", "supplier", "both"]);
    expect(VENDOR_KINDS.map((kind) => VENDOR_KIND_LABELS[kind])).toEqual(["클라이언트", "협력사", "둘 다"]);
  });

  it("새 거래처 기본 갈래는 협력사다(D-3)", () => {
    expect(DEFAULT_NEW_VENDOR_KIND).toBe("supplier");
  });
});
