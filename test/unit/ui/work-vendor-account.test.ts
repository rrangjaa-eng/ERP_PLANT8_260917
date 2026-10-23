import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 07-23 R-1(/cso C-1) · 사용자 결정(10/23 15:44): 지급처 고르기에서 연 거래처 등록 패널은 `vendors.account` 쓰기가 없으면 계좌 세 칸을 그리지 않는다.
// 이 저장소에 React 렌더 테스트 러너가 없다(vendor-form-reason.test.ts 머리 주석) — 권한이 화면까지 이어지는지 소스로 보고, 실제 DOM은
// test/e2e/vendor-work-register.spec.ts가 본다. VendorForm은 새 등록에서 canEditAccount=false면 계좌 세 칸을 숨긴다(accountHidden).
function code(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\{?\/\*|\*)/.test(line))
    .join("\n");
}

describe("일하는 자리 거래처 등록 — 계좌 칸 권한 (07-23 R-1)", () => {
  it("VendorForm은 새 등록에서 canEditAccount가 없으면 계좌 세 칸을 숨긴다", () => {
    const form = code("app/(app)/admin/vendors/vendor-form.tsx");
    expect(form).toMatch(/const accountHidden = !isEditing && !canEditAccount;/);
    expect(form).toMatch(/\{accountHidden \? null :/);
  });

  it("WorkVendorPanel은 받은 계좌 권한을 VendorForm canEditAccount로 넘긴다(기본값 true에 기대지 않는다)", () => {
    const panel = code("app/(app)/expenses/[id]/pick-vendor.tsx");
    expect(panel).toMatch(/canEditAccount: boolean;/);
    expect(panel).toMatch(/<VendorForm[^>]*canEditAccount=\{canEditAccount\}[^>]*workplace=/);
  });

  it("ExpenseForm은 canEditVendorAccount를 받아(기본 false) WorkVendorPanel에 넘긴다", () => {
    const form = code("app/(app)/expenses/[id]/expense-form.tsx");
    expect(form).toMatch(/canEditVendorAccount\?: boolean;/);
    expect(form).toMatch(/canEditVendorAccount = false/);
    expect(form).toMatch(/<WorkVendorPanel[^>]*canEditAccount=\{canEditVendorAccount\}/);
  });

  it.each(["app/(app)/expenses/new/page.tsx", "app/(app)/expenses/[id]/page.tsx"])("%s는 서버에서 vendors.account 쓰기를 재어 넘긴다", (path) => {
    const page = code(path);
    expect(page).toMatch(/can\(viewer, "vendors\.account", "write"\)/);
    expect(page).toMatch(/canEditVendorAccount=\{canEditVendorAccount\}/);
  });
});
