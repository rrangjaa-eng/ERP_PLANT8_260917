import type { Viewer } from "@/domain/viewer";
import { can } from "@/domain/permissions/can";
import { isCertPrivacyBarredRole } from "@/domain/certs/review";
import { getSettingValue } from "@/domain/settings/registry";
import { CERT_PRIVACY_IDLE_MINUTES } from "@/domain/settings/keys";
import {
  deleteSessionById,
  findPrivacyLastSeen,
  upsertPrivacyLastSeen,
} from "@/repositories/privacy-session-activity";

// 04.3-07 결정 ① — 개인정보취급자 비활동 판정. 확인증 개인정보 경로(I4 · 전체 보기 · 정정 ·
// 인쇄)의 마지막 활동을 기준으로, 한도를 넘기면 세션 전체를 끊는다(끊는 범위는 설계 /cso
// 확정 — T-04.3-17). 활동 기록이 없으면 첫 방문 시각이 시작점이다(E3-10 — 로그인 시각을
// 읽지 않는다).
export type TouchPrivacySessionResult = { kind: "ok" } | { kind: "expired" } | { kind: "notAllowed" };

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
  const lastSeen = await findPrivacyLastSeen(viewer, sessionId);
  if (lastSeen !== null && now.getTime() - lastSeen.getTime() > idleMinutes * MINUTE_MS) {
    await deleteSessionById(viewer, sessionId);
    return { kind: "expired" };
  }

  await upsertPrivacyLastSeen(viewer, sessionId, now);
  return { kind: "ok" };
}
