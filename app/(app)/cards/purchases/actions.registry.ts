// D-38(03-03 선례): 액션 레지스트리 등록을 actions.ts("use server", server-only 의존 체인)와 분리한다.
// 06-08: 구매 요청 신청의 문은 메뉴 권한이 아니라 프로젝트 보기(domain `precheckPurchaseRequest`)이다 — 레지스트리는 실제 문과 같은 메뉴를 가리킨다(06-07 I-6).
import { registerAction } from "@/lib/actions/registry";

registerAction({
  name: "createPurchaseRequestAction",
  menu: "projects",
  action: "view",
  dtoName: null,
});

registerAction({
  name: "searchLinesForPurchaseLinkAction",
  menu: "projects",
  action: "view",
  dtoName: "CardLinkLineDto",
});

registerAction({
  name: "previewPurchaseSupplyAction",
  menu: "projects",
  action: "view",
  dtoName: null,
});

// 06-12 구매 완료 — 문은 `cards.purchases` write(domain `precheckPurchaseCompletion` · `previewPurchaseCompletion`이 다시 본다).
registerAction({
  name: "completePurchaseRequestAction",
  menu: "cards.purchases",
  action: "write",
  dtoName: null,
});

registerAction({
  name: "previewPurchaseCompletionAction",
  menu: "cards.purchases",
  action: "write",
  dtoName: null,
});
