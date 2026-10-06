// D-38(03-03 선례): 액션 레지스트리 등록을 actions.ts("use server", server-only 의존 체인)와 분리한다.
// 06-05: 카드 사용 등록의 문은 메뉴 권한이 아니라 카드 자격(domain `precheckCardUsage`)이다 — 메뉴 값은 레지스트리 메타데이터.
import { registerAction } from "@/lib/actions/registry";

registerAction({
  name: "createCardUsageAction",
  menu: "cards",
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
  menu: "cards",
  action: "write",
  dtoName: "CardLinkProjectDto",
});

registerAction({
  name: "searchLinesForCardLinkAction",
  menu: "cards",
  action: "write",
  dtoName: "CardLinkLineDto",
});
