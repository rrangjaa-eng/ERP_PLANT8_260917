// D-38: 액션 레지스트리 등록을 actions.ts("use server", server-only 의존 체인)와 분리한다(holidays 선례).
// 규칙 화면의 액션은 사람 단위 정보를 돌려주지 않는다(dtoName null) — 쓰기는 도메인이 `admin.notification-rules` 쓰기로 다시 판정한다.
import { registerAction } from "@/lib/actions/registry";

// N4: 켬 체크박스 즉시 저장. 돌려주는 값은 바뀌었는지 여부뿐이다.
registerAction({
  name: "setRuleEnabledAction",
  menu: "admin.notification-rules",
  action: "write",
  dtoName: null,
});
