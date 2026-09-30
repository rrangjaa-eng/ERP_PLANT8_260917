// D-38(03-03 선례): 액션 레지스트리 등록을 actions.ts("use server", server-only 의존 체인)와 분리한다.
import { registerAction } from "@/lib/actions/registry";

// 04-42 — 리저브 일괄 저장(줄 + 보관 id). 성공하면 지금 쪽의 대장(ReserveEntryDto)을 돌려준다.
registerAction({
  name: "saveReservesAction",
  menu: "pnl",
  action: "write",
  dtoName: "ReserveEntryDto",
});
