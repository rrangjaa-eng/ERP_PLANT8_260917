// 04.5-09(D-38 · 03-03 선례): 액션 레지스트리 등록을 actions.ts("use server", server-only
// 의존 체인)와 분리한다.
import { registerAction } from "@/lib/actions/registry";

// 액션은 값을 돌려주지 않는다 — 관리 DTO(FieldDefinitionAdminDto)는 누수 스캔의 메뉴 게이트 DTO 축이 따로 검사한다.
registerAction({
  name: "createFieldDefinitionAction",
  menu: "admin.field-definitions",
  action: "write",
  dtoName: null,
});
registerAction({
  name: "updateFieldDefinitionAction",
  menu: "admin.field-definitions",
  action: "write",
  dtoName: null,
});
// 04.5-04: 칸 보관은 보관함 쓰기 메뉴로 등록한다(거래처 보관 선례) — 칸 관리 쓰기는 domain/archive의 항목 조건이 더 본다.
registerAction({
  name: "archiveFieldDefinitionAction",
  menu: "admin.archive",
  action: "write",
  dtoName: null,
});
