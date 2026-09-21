// D-38(03-03 선례): 액션 레지스트리 등록을 actions.ts("use server", server-only
// 의존 체인)와 분리한다.
import { registerAction } from "@/lib/actions/registry";

registerAction({
  name: "createVendorAction",
  menu: "admin.vendors",
  action: "write",
  dtoName: "VendorDto",
});

registerAction({
  name: "updateVendorAction",
  menu: "admin.vendors",
  action: "write",
  dtoName: "VendorDto",
});

registerAction({
  name: "setVendorHiddenAction",
  menu: "admin.vendors",
  action: "write",
  dtoName: "VendorDto",
});

// 마스킹 해제는 값을 반환하지만 DTO 행이 아니다(정보 노출표 항목이 이미
// 게이트다) — corp-cards 등 기존 패턴과 달리 dtoName은 null이다(action
// 축은 dtoName: null을 항상 허용한다, EXPORT_REGISTRY의 NULL_DTO_EXEMPT
// 목록과는 다른 축).
registerAction({
  name: "revealVendorAccountNumberAction",
  menu: "admin.vendors",
  action: "view",
  dtoName: null,
});

// 03-07: 「삭제」(보관) — 보관함 정본 경로(domain/archive/index.ts)를 부르는
// 액션의 등록.
registerAction({
  name: "archiveVendorAction",
  menu: "admin.archive",
  action: "write",
  dtoName: "VendorDto",
});
