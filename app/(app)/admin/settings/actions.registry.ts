// D-38(03-01/03-03 선례): 액션·내보내기 레지스트리 등록을 actions.ts와
// 분리한다 — actions.ts는 "use server" → lib/actions/client.ts →
// lib/viewer.ts → "server-only"/"next/headers" 의존 체인이라 Vitest(node
// 환경)에서 import할 수 없다. 누수 스캔(test/integration/leak-scan.test.ts)
// 이 이 파일을 import해 등록을 트리거한다.
import { registerAction, registerExport } from "@/lib/actions/registry";

registerAction({
  name: "setSimpleSettingAction",
  menu: "admin.settings",
  action: "write",
  dtoName: null,
});

registerAction({
  name: "addHistorizedSettingAction",
  menu: "admin.settings",
  action: "write",
  dtoName: null,
});

registerAction({
  name: "cancelHistorizedSettingAction",
  menu: "admin.settings",
  action: "write",
  dtoName: null,
});

registerAction({
  name: "exportSettingsAction",
  menu: "admin.settings",
  action: "view",
  dtoName: null,
});

// 03-04: 설정 JSON 내보내기 — dtoName이 null인 이유는 이 내보내기가 행
// Dto가 아니라 설정 키-값 스냅샷이라 사람 단위 정보 항목이 없고, 게이트가
// 노출표가 아니라 설정 메뉴 보기 권한이기 때문이다(03-03 T2 ⑤가 이 경우를
// 위해 null을 허용했다). test/integration/leak-scan.test.ts의
// NULL_DTO_EXEMPT_EXPORTS에 이 이름이 등록돼 있어야 한다.
registerExport({
  name: "settings.export",
  menu: "admin.settings",
  dtoName: null,
});
