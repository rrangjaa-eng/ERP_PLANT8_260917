// D-38(03-03 선례): 액션 레지스트리 등록을 actions.ts("use server", server-only
// 의존 체인)와 분리한다. 확정은 사람 단위 정보를 돌려주지 않는다(dtoName null).
import { registerAction } from "@/lib/actions/registry";

registerAction({
  name: "confirmHolidayYearAction",
  menu: "admin.holidays",
  action: "write",
  dtoName: null,
});

// 04.2-12: 수동 추가. 돌려주는 값은 날짜·연도뿐이다.
registerAction({
  name: "addHolidayAction",
  menu: "admin.holidays",
  action: "write",
  dtoName: null,
});

// 04.2-12: 수동 미래 행 삭제(= 보관). 지운 행의 id·날짜·이름·구분만 돌려준다.
registerAction({
  name: "deleteHolidayAction",
  menu: "admin.holidays",
  action: "write",
  dtoName: null,
});

// quick 261001-hfi: 결과 줄 `되돌리기` = 보관된 행 복원. 복원 여부만 돌려준다.
registerAction({
  name: "restoreHolidayAction",
  menu: "admin.holidays",
  action: "write",
  dtoName: null,
});
