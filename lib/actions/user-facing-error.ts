// lib/actions/client.ts의 handleServerError 화이트리스트가 참조하는 표식
// 클래스다(defect 1 — 원시 SQL·내부 id 유출 재발 방지). domain·repositories가
// 사용자에게 그대로 보여줄 의도로 던지는 오류는 이 클래스(또는 이를 상속한
// 클래스, 예: domain/permissions/matrix.ts의 ForbiddenError)여야 한다.
// UserFacingError가 아닌 Error는 handleServerError가 message를 화면에
// 내보내지 않는다 — 서버 로그에만 남고 화면에는 일반 문구만 간다.
export class UserFacingError extends Error {}
