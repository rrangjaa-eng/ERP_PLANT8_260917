import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 사용자 결정(10/24 「지금처럼 받기」): 지급처 고르기에서 연 거래처 등록 패널은 `vendors.account` 쓰기와 상관없이 계좌 세 칸을 그린다
// (10/23 R-1의 막음을 이 경로에서만 되돌림 — 대신 끌 수 없는 로그로 남긴다). 관리자 화면의 VendorForm 규칙(accountHidden)은 그대로다.
// 이 저장소에 React 렌더 테스트 러너가 없다(vendor-form-reason.test.ts 머리 주석) — 소스로 보고, 실제 DOM은
// test/e2e/vendor-work-register.spec.ts가 본다.
function code(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\{?\/\*|\*)/.test(line))
    .join("\n");
}

describe("일하는 자리 거래처 등록 — 계좌 칸 (사용자 결정 10/24)", () => {
  it("VendorForm은 관리자 화면 새 등록에서 canEditAccount가 없으면 계좌 세 칸을 숨긴다(관리자 규칙 그대로)", () => {
    const form = code("app/(app)/admin/vendors/vendor-form.tsx");
    expect(form).toMatch(/const accountHidden = !isEditing && !canEditAccount;/);
    expect(form).toMatch(/\{accountHidden \? null :/);
  });

  it("WorkVendorPanel은 계좌 권한을 받지 않고 VendorForm에 계좌 칸을 연다(canEditAccount 고정)", () => {
    const panel = code("app/(app)/expenses/[id]/pick-vendor.tsx");
    expect(panel).not.toMatch(/canEditAccount: boolean;/);
    expect(panel).toMatch(/<VendorForm[^>]*\scanEditAccount\s[^>]*workplace=/);
  });

  it("ExpenseForm은 계좌 권한을 넘기지 않는다", () => {
    const form = code("app/(app)/expenses/[id]/expense-form.tsx");
    expect(form).not.toMatch(/canEditVendorAccount/);
  });

  it.each(["app/(app)/expenses/new/page.tsx", "app/(app)/expenses/[id]/page.tsx"])("%s는 거래처 등록 패널 때문에 vendors.account를 재지 않는다", (path) => {
    const page = code(path);
    expect(page).not.toMatch(/can\(viewer, "vendors\.account", "write"\)/);
    expect(page).not.toMatch(/canEditVendorAccount/);
  });
});
