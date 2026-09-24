// D-38(03-03 선례): 액션 레지스트리 등록을 actions.ts("use server", server-only
// 의존 체인)와 분리한다.
import { registerAction } from "@/lib/actions/registry";

registerAction({
  name: "createProjectAction",
  menu: "projects",
  action: "write",
  dtoName: "ProjectDto",
});

registerAction({
  name: "saveProjectLedgerAction",
  menu: "projects",
  action: "write",
  dtoName: "QuoteLineDto",
});
