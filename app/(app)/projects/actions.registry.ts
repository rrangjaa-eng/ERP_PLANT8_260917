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

// 05-11: 정산 결재 올리기 — 차수 · 지금 담당 이름(ApprovalActionResultDto 투영을 지난 값)만 돌려준다. 판정(담당 PM · 정산 상태)은 domain.
registerAction({
  name: "submitSettlementAction",
  menu: "projects",
  action: "write",
  dtoName: "ApprovalActionResultDto",
});

// 05-11: 토스트 되돌리기 — 결재 상태 낱말만 돌려준다(DTO 없음).

registerAction({
  name: "withdrawSettlementAction",
  menu: "projects",
  action: "write",
  dtoName: null,
});

// 06.2-12(S2): 참여자 섹션 읽기 — 카드 사용 섹션 액션과 같은 보기 등록. 행은 ProjectMemberDto 투영.
registerAction({
  name: "listProjectMembersAction",
  menu: "projects",
  action: "view",
  dtoName: "ProjectMemberDto",
});

// 06.2-05(D-6211): 참여자 후보 — 후보를 보는 것도 더하기 권리 자리라 쓰기로 적는다. 행은 ProjectMemberCandidateDto 투영.
registerAction({
  name: "listMemberCandidatesAction",
  menu: "projects.member",
  action: "write",
  dtoName: "ProjectMemberCandidateDto",
});

// 06.2-05(D-6210): 참여자 더하기 — 붙인 수만 돌려준다(DTO 없음). 판정(키 ∧ 담당 PM ∨ 업무 범위 ∧ 보임 · 후보 재계산)은 domain.
registerAction({
  name: "addProjectMembersAction",
  menu: "projects.member",
  action: "write",
  dtoName: null,
});

// 06.2-05(D-6209): 참여자 떼기 · 되돌리기(보관 해제) — 불린만 돌려준다(DTO 없음). 판정은 더하기와 같은 domain 순서.
registerAction({
  name: "removeProjectMemberAction",
  menu: "projects.member",
  action: "write",
  dtoName: null,
});

registerAction({
  name: "restoreProjectMemberAction",
  menu: "projects.member",
  action: "write",
  dtoName: null,
});
