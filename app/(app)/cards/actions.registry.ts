// D-38(03-03 선례): 액션 레지스트리 등록을 actions.ts("use server", server-only 의존 체인)와 분리한다.
// 06-05: 카드 사용 등록의 문은 메뉴 권한이 아니라 카드 자격(domain `precheckCardUsage`)이다 — 메뉴 값은 레지스트리 메타데이터.
import { registerAction } from "@/lib/actions/registry";

registerAction({
  name: "createCardUsageAction",
  menu: "cards",
  action: "write",
  dtoName: null,
});

// 06-09: 수정의 문은 그 건의 권리(domain `cardUsageRights` — O-11)다 — 메뉴 값은 레지스트리 메타데이터.
registerAction({
  name: "updateCardUsageAction",
  menu: "cards",
  action: "write",
  dtoName: null,
});

// 06-09: 사용한 사람 후보 — 대리 등록 권한자만(domain `usedByCandidates`가 cards.proxy write를 본다).
registerAction({
  name: "usedByCandidatesAction",
  menu: "cards.proxy",
  action: "write",
  dtoName: null,
});

registerAction({
  name: "previewCardAmountsAction",
  menu: "cards",
  action: "write",
  dtoName: null,
});

registerAction({
  name: "searchMerchantsAction",
  menu: "cards",
  action: "write",
  dtoName: "PickVendorOptionDto",
});

registerAction({
  name: "searchProjectsForCardLinkAction",
  menu: "projects",
  action: "view",
  dtoName: "CardLinkProjectDto",
});

registerAction({
  name: "searchLinesForCardLinkAction",
  menu: "projects",
  action: "view",
  dtoName: "CardLinkLineDto",
});

registerAction({
  name: "listProjectCardUsagesAction",
  menu: "projects",
  action: "view",
  dtoName: "ProjectCardUsageDto",
});
