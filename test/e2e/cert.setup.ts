import { test } from "@playwright/test";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { findUserByEmail } from "@/repositories/users";
import { setSettingValue } from "@/domain/settings/registry";
import { CERT_CONTACT_PHONE, CERT_ENABLED } from "@/domain/settings/keys";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { CERT_E2E_CONTACT_PHONE } from "./helpers/cert";

// 규약 C4(04.3-02) — `desktop` · `mobile-375`가 끝난 뒤에만 도는 전용
// 준비(Playwright 프로젝트 cert-setup, dependencies: ["desktop",
// "mobile-375"]). 여기서 기능을 켜면 그 뒤(certs 프로젝트)에서만 켜진
// 상태가 보이고, 앞선 두 프로젝트는 기본 꺼짐인 채로 돈다.
const CERT_MANAGER_EMAIL = "cert-manager-e2e@example.test";

test("확인증 E2E 준비 — 기능 켜기 · 문의 전화 · 담당자 계정 · 권한", async () => {
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
  await setSettingValue(SYSTEM_VIEWER, CERT_CONTACT_PHONE, CERT_E2E_CONTACT_PHONE);

  const existing = await findUserByEmail(SYSTEM_VIEWER, CERT_MANAGER_EMAIL);
  if (!existing) {
    await createAccount(SYSTEM_VIEWER, { email: CERT_MANAGER_EMAIL, name: "박서연", roleId: SYSADMIN_ROLE_ID });
  }

  // 전제: 이 권한은 시드 기본값이 아니라 cert.setup이 켠 것이다(E3-13) —
  // 04.3-09가 시드를 insert-if-absent로 바꾸면 이 세 값은 배포마다
  // 자동으로 켜지지 않는다. role-sysadmin은 공유 계급이라 이 켜기는
  // 영구히 남지만, 이 세 값은 04.3-02 이전 시드가 이미 늘 켜 두던
  // 값을 되돌리는 것뿐이고 `test/` 전체에 이 세 값을 참조해 「꺼짐」을
  // 전제하는 기존 스펙이 없다(grep 0건 확인 — permissions-grid.spec.ts:
  // 15-19 · 04.3-04:419의 공유 계급 격리 규칙의 예외로 Round 3 ledger에
  // 남긴다).
  await upsertPermission(SYSTEM_VIEWER, {
    roleId: SYSADMIN_ROLE_ID,
    menu: "certs.submissions",
    action: "view",
    allowed: true,
  });
  await upsertPermission(SYSTEM_VIEWER, {
    roleId: SYSADMIN_ROLE_ID,
    menu: "certs.submissions",
    action: "write",
    allowed: true,
  });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: "cert.rrn_unmasked", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, {
    roleId: SYSADMIN_ROLE_ID,
    infoItem: "cert_submission.value",
    visible: true,
  });
});
