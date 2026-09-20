// D-38: actions.ts와 분리된 등록 파일(app/(app)/admin/permissions/actions.registry.ts
// 와 같은 이유 — server-only 의존 체인 때문에 누수 스캔이 actions.ts를
// 직접 import할 수 없다).
import { registerAction } from "@/lib/actions/registry";

registerAction({
  name: "setVisibilityCellAction",
  menu: "admin.visibility",
  action: "write",
  dtoName: null,
});
