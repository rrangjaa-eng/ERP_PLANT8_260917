// 04.3-04 — 액션 레지스트리 등록(03-03 선례: actions.ts는 server-only 사슬이라
// 누수 스캔이 이 파일만 import한다). 만들기 반환은 {eventId, link}뿐이라 행
// DTO를 내보내지 않는다(dtoName: null).
import { registerAction } from "@/lib/actions/registry";

registerAction({
  name: "createCertEventAction",
  menu: "certs.events",
  action: "write",
  dtoName: null,
});
