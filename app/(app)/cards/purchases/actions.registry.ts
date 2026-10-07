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

// 06-14 요청 취소 · 되돌리기 — 문은 메뉴 권한이 아니라 요청자 본인 또는 구매 권한자(domain `precheckPurchaseCancel` · `precheckPurchaseCancelUndo`가 다시 본다).
// 신청과 같은 입구(프로젝트 보기)로 등록한다 — 요청자는 구매 요청 메뉴 권한 없이 자기 요청을 지운다.
registerAction({
  name: "cancelPurchaseRequestAction",
  menu: "projects",
  action: "view",
  dtoName: null,
});

registerAction({
  name: "undoCancelPurchaseRequestAction",
  menu: "projects",
  action: "view",
  dtoName: null,
});
