// D-38(03-03 선례): 액션 레지스트리 등록을 actions.ts("use server", server-only
// 의존 체인)와 분리한다. 확정은 사람 단위 정보를 돌려주지 않는다(dtoName null).
import { registerAction } from "@/lib/actions/registry";

registerAction({
  name: "confirmHolidayYearAction",
  menu: "admin.holidays",
  action: "write",
  dtoName: null,
});
