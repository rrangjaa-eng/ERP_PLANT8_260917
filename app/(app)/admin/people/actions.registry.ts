// D-38(03-03 선례): 액션 레지스트리 등록을 actions.ts("use server", server-only
// 의존 체인)와 분리한다 — 누수 스캔(test/integration/leak-scan.test.ts)이
// server-only 의존 없는 이 파일만 안전하게 import할 수 있다.
import { registerAction } from "@/lib/actions/registry";

registerAction({
  name: "registerPersonAction",
  menu: "admin.people",
  action: "write",
  dtoName: "PersonDto",
});

registerAction({
  name: "changePersonRoleAction",
  menu: "admin.people",
  action: "write",
  dtoName: "PersonDto",
});

registerAction({
  name: "assignTeamAction",
  menu: "admin.people",
  action: "write",
  dtoName: "TeamAssignmentDto",
});

registerAction({
  name: "cancelAssignmentAction",
  menu: "admin.people",
  action: "write",
  dtoName: "TeamAssignmentDto",
});

registerAction({
  name: "createRoleAction",
  menu: "admin.people",
  action: "write",
  dtoName: "RoleDto",
});

registerAction({
  name: "renameRoleAction",
  menu: "admin.people",
  action: "write",
  dtoName: "RoleDto",
});

registerAction({
  name: "setRoleWorkScopeAction",
  menu: "admin.people",
  action: "write",
  dtoName: "RoleDto",
});

// 계급 관리 화면(§4)에서 비시드 계급을 보관하는 데 쓴다 — 보관함 자체는
// domain/archive/index.ts의 정본 경로다(03-01). "계급 보관"이라는 별도
// action.registry 항목이 필요해 이 플랜이 추가한다.
registerAction({
  name: "archiveRoleAction",
  menu: "admin.archive",
  action: "write",
  dtoName: "RoleDto",
});

registerAction({
  name: "createOrgUnitAction",
  menu: "admin.people",
  action: "write",
  dtoName: "OrgUnitDto",
});

registerAction({
  name: "renameOrgUnitAction",
  menu: "admin.people",
  action: "write",
  dtoName: "OrgUnitDto",
});

registerAction({
  name: "createTeamAction",
  menu: "admin.people",
  action: "write",
  dtoName: "TeamDto",
});

registerAction({
  name: "renameTeamAction",
  menu: "admin.people",
  action: "write",
  dtoName: "TeamDto",
});

// 03-07: 「삭제」(보관) 셋 — 사람·본부·팀. 계급은 위 archiveRoleAction이
// 이미 담당한다.
registerAction({
  name: "archivePersonAction",
  menu: "admin.archive",
  action: "write",
  dtoName: "PersonDto",
});

registerAction({
  name: "archiveOrgUnitAction",
  menu: "admin.archive",
  action: "write",
  dtoName: "OrgUnitDto",
});

registerAction({
  name: "archiveTeamAction",
  menu: "admin.archive",
  action: "write",
  dtoName: "TeamDto",
});
