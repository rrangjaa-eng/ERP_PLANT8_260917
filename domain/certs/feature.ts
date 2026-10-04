import { env } from "@/lib/env";
import { getSettingValue as defaultGetSettingValue } from "@/domain/settings/registry";
import { CERT_ENABLED } from "@/domain/settings/keys";

// 규약 C1 — 확인증 기능은 두 겹 게이트다: 환경 변수 CERT_FEATURE_ALLOWED가
// 정확히 "true"이고 그리고 설정 cert.enabled가 켜져 있을 때만 켜진다.
// 환경 게이트가 꺼져 있으면 DB를 읽지 않는다(false 즉시 반환).
export type IsCertFeatureEnabledDeps = {
  envAllowed?: boolean;
  getSettingValue?: typeof defaultGetSettingValue;
};

export async function isCertFeatureEnabled(deps?: IsCertFeatureEnabledDeps): Promise<boolean> {
  const envAllowed = deps?.envAllowed ?? env.CERT_FEATURE_ALLOWED === "true";
  if (!envAllowed) return false;

  const getSettingValue = deps?.getSettingValue ?? defaultGetSettingValue;
  return getSettingValue(CERT_ENABLED);
}

// 04.3-09 — 셸 메뉴·「관리」 인덱스가 allowedMenus를 만든 뒤 기능이 꺼져 있으면
// 확인증 메뉴(certs.* 키)를 걷는다. ui는 domain을 import할 수 없어(D-26) 판정은
// 호출부(app/(app)/layout.tsx · admin/page.tsx)가 여기서 하고 결과만 넘긴다.
export async function withCertMenusGated(
  allowedMenus: string[],
  deps?: IsCertFeatureEnabledDeps,
): Promise<string[]> {
  if (await isCertFeatureEnabled(deps)) return [...allowedMenus];
  return allowedMenus.filter((key) => !key.startsWith("certs."));
}
