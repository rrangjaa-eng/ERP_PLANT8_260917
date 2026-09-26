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
