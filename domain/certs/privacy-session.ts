import type { Viewer } from "@/domain/viewer";
import { can } from "@/domain/permissions/can";
import { isCertPrivacyBarredRole } from "@/domain/certs/review";
import { getSettingValue } from "@/domain/settings/registry";
import { CERT_PRIVACY_IDLE_MINUTES } from "@/domain/settings/keys";
import {
  deleteSessionById,
  findPrivacySessionClock,
  upsertPrivacyLastSeen,
} from "@/repositories/privacy-session-activity";

// 04.3-07 결정 ① — 개인정보취급자 비활동 판정. 확인증 개인정보 경로(I4 · 전체 보기 · 정정 · 인쇄)를 부르는 모든 곳이 이
// 함수 하나를 지난다. 한도를 넘기면 세션 전체를 끊는다(끊는 범위는 설계 /cso 확정 — T-04.3-17 · 04.3-14 G4 a).
// 04.3-14 사용자 결정 ④ — 기준 시각은 그 세션의 마지막 개인정보 활동이고, 활동이 아직 없으면 로그인 시각(첫 접근 판정)이다.
// 「계속 활동 중」은 개인정보 경로의 활동만 센다(D-A1 a — ERP 전체 활동은 기록하지 않는다). 경계는 `>` — 정확히 한도는 통과.
export type TouchPrivacySessionResult = { kind: "ok"; idleMinutes: number } | { kind: "expired" } | { kind: "notAllowed" };

const MINUTE_MS = 60_000;

export async function touchPrivacySession(
  viewer: Viewer,
  sessionId: string,
  now: Date = new Date(),
): Promise<TouchPrivacySessionResult> {
  // /review RB-5 — 개인정보를 볼 수 없는 사람은 설정 · 활동 행을 건드리기 전에 끝낸다.
  if (isCertPrivacyBarredRole(viewer) || !(await can(viewer, "certs.submissions", "view"))) {
    return { kind: "notAllowed" };
  }

  const idleMinutes = await getSettingValue(CERT_PRIVACY_IDLE_MINUTES);
  const clock = await findPrivacySessionClock(viewer, sessionId);
  // 세션 행이 이미 없으면(다른 요청의 만료 · 로그아웃) 만료와 같다(검토 R-L3).
  if (clock === null) return { kind: "expired" };

  const since = clock.lastSeenAt ?? clock.loginAt;
  if (now.getTime() - since.getTime() > idleMinutes * MINUTE_MS) {
    await deleteSessionById(viewer, sessionId);
    return { kind: "expired" };
  }

  if (!(await upsertPrivacyLastSeen(viewer, sessionId, now))) return { kind: "expired" };
  return { kind: "ok", idleMinutes };
}
