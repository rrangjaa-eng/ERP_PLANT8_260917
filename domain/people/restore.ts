import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { listOccupiedTeams, lockSeatKeys } from "@/repositories/seats";
import { assertCanGrantRoles, RoleGrantForbiddenError } from "@/domain/permissions/grant-ceiling";
import { assertSeatsFree, COMPANY_SEAT_ROLE_IDS, newSeats, SeatTakenError } from "@/domain/people/seat-rules";
import { findUserById, setUserArchived } from "@/repositories/users";
import { findRoleForShare } from "@/repositories/roles";
import { seatedTeamsOf } from "@/repositories/team-memberships";
import type { DbOrTx } from "@/repositories/document-counters";
import { withTransaction } from "@/lib/db-transaction";
import { kstToday } from "@/lib/kst-date";
import { UserFacingError } from "@/lib/actions/user-facing-error";

// 06.4(D-6406 · G36): 사람 복원 — 복원은 계급을 바꾸지 않으므로 지금 계급 하나로 권한 상한을 다시 보고, 되살아나며 생기는
// 자리를 본다. 위반이면 거부(자동 강등 없음). 260907 `rejoinSeatWhy`(`O: server/src/people-rules.ts:68-78`, 문구 :75)가 닫은
// 같은 뒷문. 관리자 수를 늘리기만 하므로 관리자 키는 잡지 않는다. 보관함 도메인이 이 파일을 import한다 — 사람 index ·
// 보관함 도메인은 import하지 않는다(순환).

export class PersonRestoreForbiddenError extends UserFacingError {}
export class PersonNotRestorableError extends UserFacingError {}

// 06.4(N1 · D3): 보관함 토스트는 사유를 마지막 「 · 」 앞까지 자른다(`app/(app)/admin/archive/archive-table.tsx:79-81`).
// 복원 거부는 기존 꼴(`domain/archive/index.ts` `vendorRestoreBlock`)처럼 ` · 복원 불가`로 끝나야 이름 · 담당이 남는다.
// 문구 정본 06.4-02 「문구 표(D3)」 복원 열. 같은 클래스로 다시 던져 액션 매핑은 그대로다.
const RESTORE_BLOCKED_TAIL = " · 복원 불가";

function withRestoreTail(error: unknown): unknown {
  if (error instanceof RoleGrantForbiddenError) return new RoleGrantForbiddenError(error.message + RESTORE_BLOCKED_TAIL);
  if (error instanceof SeatTakenError) return new SeatTakenError(error.message + RESTORE_BLOCKED_TAIL);
  return error;
}

// 07-21 게이트 사용자 결정(2026-10-23 15:44 KST 「막기」): 복원 · 퇴직일 지우기로 활성이 되는 사람의 팀 · 본부 · 계급이 보관됐으면
// 거부한다 — 보관 막기(소속 사람 남은 팀 · 본부 · 계급은 보관 안 됨, `domain/archive`)의 짝. 호출자가 사람 자리 키를 먼저 잡아
// 팀 · 본부 보관(같은 키)과 줄 서고, 계급은 행을 FOR SHARE로 다시 읽어 계급 보관(FOR UPDATE 뒤 소속 세기)과 줄 선다.
// 260907 재개(`server/src/people.ts:1213-1218`)는 직책 보관만 봤다. 거부 이유를 돌려주고 없으면 null.
export async function archivedSeatReason(
  viewer: Viewer,
  input: { userId: string; roleId: string | null; today: string },
  tx: DbOrTx,
): Promise<string | null> {
  const seated = await seatedTeamsOf(viewer, input.userId, input.today, tx);
  if (seated.some((row) => row.teamArchived)) return "보관된 팀 · 먼저 옮기기";
  if (seated.some((row) => row.orgUnitArchived)) return "보관된 본부 · 먼저 옮기기";
  if (input.roleId !== null) {
    const role = await findRoleForShare(viewer, input.roleId, tx);
    if (role?.archivedAt) return "보관된 계급 · 먼저 바꾸기";
  }
  return null;
}

export type RestoreUserDeps = {
  can: typeof defaultCan;
  recordAction: typeof defaultRecordAction;
  now: () => Date;
  visible: typeof defaultVisible;
};

export async function restoreUser(viewer: Viewer, id: string, deps?: Partial<RestoreUserDeps>): Promise<{ restored: boolean }> {
  // D-6406 사용자 확정(2026-10-12 카드): 보관함 쓰기에 더해 사람 쓰기.
  if (!(await (deps?.can ?? defaultCan)(viewer, "admin.people", "write"))) {
    throw new PersonRestoreForbiddenError("사람 복원 권한 없음 · 시스템 관리자 · 복원 불가");
  }
  // 잠금 중 풀에서 따로 빌리지 않게 날짜 · 이름 노출은 tx 전에 정한다(06.4-02와 같은 규칙).
  const today = kstToday((deps?.now ?? (() => new Date()))());
  const showNames = await (deps?.visible ?? defaultVisible)(viewer, "person.value");
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  return withTransaction(async (tx) => {
    // 07.1(D-7128): 계급은 잠금 뒤 재조회에서야 알므로 회사 키 둘을 첫 잠금에서 함께.
    await lockSeatKeys(viewer, { personIds: [id], companyRoleIds: COMPANY_SEAT_ROLE_IDS }, tx);
    const row = await findUserById(viewer, id, tx);
    if (!row) throw new PersonNotRestorableError("없는 사람 · 복원 불가");
    if (row.archivedAt === null) return { restored: false };
    // 복원 뒤에도 퇴직(퇴직일 지남)이면 소속으로 세지 않으므로 보지 않는다.
    if (!(row.resignationDate !== null && row.resignationDate < today)) {
      const reason = await archivedSeatReason(viewer, { userId: id, roleId: row.roleId, today }, tx);
      if (reason) throw new PersonNotRestorableError(reason + RESTORE_BLOCKED_TAIL);
    }
    try {
      // R = C — 복원은 계급을 바꾸지 않는다.
      await assertCanGrantRoles(viewer, [row.roleId], tx);
      if (row.roleId !== null) {
        const occupied = await listOccupiedTeams(viewer, id, today, tx);
        // 앞 = 보관이라 자리 없음 · 뒤 = 보관 해제(퇴직일에서 잘린 구간).
        const seats = newSeats({
          roleBefore: row.roleId,
          roleAfter: row.roleId,
          employedBefore: null,
          employedAfter: { archivedAt: null, resignationDate: row.resignationDate, hireDate: row.hireDate },
          occupiedBefore: [],
          occupiedAfter: occupied,
        });
        await assertSeatsFree(viewer, { userId: id, roleId: row.roleId, seats, today, showNames }, tx);
      }
    } catch (error) {
      throw withRestoreTail(error);
    }
    if (!(await setUserArchived(viewer, id, false, tx))) return { restored: false };
    await recordAction(viewer, { actionType: "restore", entity: "user", entityId: id }, { tx });
    return { restored: true };
  });
}
