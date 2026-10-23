import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";
import { findUserResignationForShare } from "@/repositories/users";
import { UserFacingError } from "@/lib/actions/user-facing-error";

// 07-17 R11 · D-728: 「퇴직」 술어 하나 — 07-09 D-743과 같은 경계(퇴직일 당일까지 재직, 다음 날부터 퇴직).
// `unlockPerson` 거부 · 목록 `잠금 풀기` 표지 · person-status.ts `퇴직` 낱말이 함께 부른다.
export function isRetiredOn(resignationDate: string | null, today: string): boolean {
  return resignationDate !== null && resignationDate < today;
}

// 사용자 결정 F24(카드 2026-10-23 10:02 KST): 퇴직한 사람은 지급 계좌까지 어떤 정보도 고치지 못한다 — 260907
// `server/src/people.ts:792-797`(left_date가 있으면 409 「퇴사한 사원은 고칠 수 없습니다」)와 같은 판정.
// 퇴직일 자체는 재입사 경로라 막지 않는다(260907 `/api/people/:id/rejoin` `people.ts:1155`).
// domain/org도 부르므로 domain/people(index)를 import하지 않는다(순환 방지) — 오류 클래스도 여기 둔다.
export const RETIRED_EDIT_MESSAGE = "퇴직한 사람 · 정보 변경 없음";

export class RetiredPersonEditError extends UserFacingError {}

// 쓰기 tx 안에서 사람 행을 FOR SHARE로 다시 읽는다 — 판정과 쓰기 사이에 퇴직일이 바뀌지 않는다. 없는 사람은 호출자의
// 기존 판정(없음 오류 · 외래키)에 맡긴다.
export async function assertNotRetiredInTx(viewer: Viewer, userId: string, today: string, tx: DbOrTx): Promise<void> {
  const row = await findUserResignationForShare(viewer, userId, tx);
  if (row !== null && isRetiredOn(row.resignationDate, today)) throw new RetiredPersonEditError(RETIRED_EDIT_MESSAGE);
}

// 퇴직일이 든 해 — 퇴직자에게 연차 조정을 받는 유일한 회계연도.
export function retirementYearOf(resignationDate: string): number {
  return Number(resignationDate.slice(0, 4));
}

// 사용자 결정(카드 2026-10-23 11:14 KST) 「퇴직한 해 연차 조정만 허용」: 퇴직자에게는 퇴직한 해의 연차 조정만 받는다 —
// 다른 해 · 월차(연도 없음)는 assertNotRetiredInTx와 같은 거부. 같은 FOR SHARE 재조회로 tx 안에서 판정한다.
export async function assertLeaveAdjustableInTx(
  viewer: Viewer,
  userId: string,
  fiscalYear: number | null,
  today: string,
  tx: DbOrTx,
): Promise<void> {
  const row = await findUserResignationForShare(viewer, userId, tx);
  if (row === null || row.resignationDate === null || !isRetiredOn(row.resignationDate, today)) return;
  if (fiscalYear !== null && fiscalYear === retirementYearOf(row.resignationDate)) return;
  throw new RetiredPersonEditError(RETIRED_EDIT_MESSAGE);
}
