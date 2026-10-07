import { setSettingValue } from "@/domain/settings/registry";
import { PURCHASE_ONLINE_VENDOR_NAME } from "@/domain/settings/keys";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// 설정 `purchase.online_vendor_name`은 전역 한 칸이라, 스펙마다 다른 값을 쓰고 되돌리면 워커가 둘일 때 서로의 값을 덮어쓴다
// (구매 요청 · 견적 줄 상태 · 설정 키 스펙이 함께 돌 때 문 판정이 뒤바뀐 실측). 그래서 모든 스펙이 이 한 이름만 쓴다.
// 값은 늘 같은 값으로만 쓰고(멱등) 어느 스펙도 지우거나 되돌리지 않는다 — 거래처 이름은 유일하지 않아 스펙마다 이 이름의 거래처를 따로 만들어도 된다.
export const E2E_ONLINE_VENDOR_NAME = "E2E온라인구매협력사";

export async function enableOnlineVendorSetting(): Promise<void> {
  await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, E2E_ONLINE_VENDOR_NAME);
}
