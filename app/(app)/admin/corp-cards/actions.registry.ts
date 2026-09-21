// D-38(03-03 선례): 액션 레지스트리 등록을 actions.ts("use server", server-only
// 의존 체인)와 분리한다.
import { registerAction } from "@/lib/actions/registry";

registerAction({
  name: "createCorpCardAction",
  menu: "admin.corp-cards",
  action: "write",
  dtoName: "CorpCardDto",
});

registerAction({
  name: "updateCorpCardOwnerAction",
  menu: "admin.corp-cards",
  action: "write",
  dtoName: "CorpCardDto",
});

registerAction({
  name: "setCorpCardActiveAction",
  menu: "admin.corp-cards",
  action: "write",
  dtoName: "CorpCardDto",
});

// 03-07: 「삭제」(보관) — 보관함 정본 경로를 부르는 액션의 등록.
registerAction({
  name: "archiveCorpCardAction",
  menu: "admin.archive",
  action: "write",
  dtoName: "CorpCardDto",
});
