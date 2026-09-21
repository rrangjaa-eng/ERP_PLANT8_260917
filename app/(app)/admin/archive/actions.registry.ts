// D-38(03-03 선례): 액션 레지스트리 등록을 actions.ts("use server", server-only
// 의존 체인)와 분리한다 — 누수 스캔이 이 파일만 안전하게 import할 수 있다.
import { registerAction } from "@/lib/actions/registry";

registerAction({
  name: "restoreArchivedAction",
  menu: "admin.archive",
  action: "write",
  dtoName: "ArchiveEntryDto",
});
