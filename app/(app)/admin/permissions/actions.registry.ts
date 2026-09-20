// D-38(Rule 3 — 03-01/03-03 선례): 액션 레지스트리 등록을 actions.ts와
// 분리한다 — actions.ts는 "use server" → lib/actions/client.ts →
// lib/viewer.ts → "server-only"/"next/headers" 의존 체인이라 Vitest(node
// 환경)에서 import할 수 없다. 누수 스캔(test/integration/leak-scan.test.ts)
// 이 이 파일을 import해 등록을 트리거한다.
import { registerAction } from "@/lib/actions/registry";

registerAction({
  name: "setPermissionCellAction",
  menu: "admin.permissions",
  action: "write",
  dtoName: null,
});
