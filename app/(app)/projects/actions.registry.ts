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

// 04-20: 전환 쌍마다 메뉴가 갈린다(projects.status · 정산 → 완료는 projects.complete) —
// 판정은 domain 게이트가 하고 여기에는 대표 메뉴를 적는다. DTO를 돌려주지 않는다.
registerAction({
  name: "changeProjectStatusAction",
  menu: "projects.status",
  action: "write",
  dtoName: null,
});

// 04-14: 새 차수 — 차수 id·순번만 돌려준다(DTO 없음).
registerAction({
  name: "createRevisionAction",
  menu: "projects",
  action: "write",
  dtoName: null,
});

// 04-14: 고객 승인 표시 — 차수 id·순번·승인일만 돌려준다(DTO 없음). 담당 PM 판정은 domain 게이트.
registerAction({
  name: "setCustomerApprovalAction",
  menu: "projects",
  action: "write",
  dtoName: null,
});

// 04-14(DR-13 · DR-4): 이전 차수 잠김 조회 — 보기 액션, 현재 차수 조회와 같은 QuoteLineDto 투영.
registerAction({
  name: "listRevisionLinesAction",
  menu: "projects",
  action: "view",
  dtoName: "QuoteLineDto",
});
