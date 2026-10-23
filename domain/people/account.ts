// 06.5 D-6505(D10 · D29, 권한 카드 10/13 20:14 KST): 직원 지급 계좌 — 거래처 계좌와 같은 암호화 · 끝 4자리 · 노출 규칙.
// 게이트는 `expenses.payments` 쓰기 · `admin.people` 보기 · `person.value` 노출 셋 다(새 권한 키 0). 직원 본인은 게이트가 거짓이면 자기 것도
// 못 본다(옛도 본인 예외 없음 O: server/src/people.ts:559-561).
import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import type { DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { loadActionLogGate, recordActionInTx, type TxLogDeps } from "@/domain/approvals/tx-log";
import { withTransaction } from "@/lib/db-transaction";
import { decrypt } from "@/lib/crypto";
import { ForbiddenError, UserNotFoundError } from "@/domain/people";
import { planAccountNumberUpdate } from "@/domain/vendors";
import { AccountFieldsError, assertAccountFields } from "@/domain/vendors/account-fields";
import { ACCOUNT_PROBLEMS, accountProblemText } from "@/domain/bank-transfer";
import { isCheckViolation } from "@/lib/pg-errors";
import { assertCanGrantRoles, RoleGrantForbiddenError } from "@/domain/permissions/grant-ceiling";
import { lockSeatKeys } from "@/repositories/seats";
import {
  findUserById as repoFindUserById,
  findUserPayoutAccount as repoFindUserPayoutAccount,
  updateUserPayoutAccount as repoUpdateUserPayoutAccount,
} from "@/repositories/users";

export type PersonPayoutAccountDto = {
  bank: string | null;
  holder: string | null;
  last4: string | null;
  hasNumber: boolean;
};

const PERSON_PAYOUT_ACCOUNT_DTO_SPEC: DtoSpec<PersonPayoutAccountDto, PersonPayoutAccountDto> = {
  fields: [
    { key: "bank", from: "bank", infoItem: "person.value" },
    { key: "holder", from: "holder", infoItem: "person.value" },
    { key: "last4", from: "last4", infoItem: "person.value" },
    { key: "hasNumber", from: "hasNumber", infoItem: "person.value" },
  ],
};

registerDto({
  name: "PersonPayoutAccountDto",
  fields: PERSON_PAYOUT_ACCOUNT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

export type PayoutAccountDeps = {
  can: typeof defaultCan;
  visible: typeof defaultVisible;
  recordAction: typeof defaultRecordAction;
  updateUserPayoutAccount: typeof repoUpdateUserPayoutAccount;
  appendActionLog: NonNullable<TxLogDeps["appendActionLog"]>;
};

// 0033 마이그레이션의 CHECK — 판정과 쓰기 사이 경합으로 DB가 먼저 거절하면 같은 칸 오류로 바꾼다(EP3-B15 원시 SQL 노출 방지).
const HOLDER_REQUIRED_CHECK = "users_account_holder_required_check";

// 평문 보기는 거래처 계좌와 같은 정보 항목(새 항목 0 — D-6505 권한 카드, T-06.5-35).
export const PAYOUT_ACCOUNT_REVEAL_ITEM = "vendor.account_number_unmasked";

// 리뷰 P2-1: `person.value`(계급별로 끌 수 있는 사람 정보)도 AND — 꺼진 계정에 빈 섹션을 그리면 패널 저장이 은행 · 예금주를
// 조용히 지우고, 끝 4자리를 숨긴 사람이 전체 번호를 해제하게 된다. 읽기 · 저장 · 해제가 이 한 게이트를 쓴다.
export async function canManagePayoutAccount(
  viewer: Viewer,
  deps?: Partial<Pick<PayoutAccountDeps, "can" | "visible">>,
): Promise<boolean> {
  const canFn = deps?.can ?? defaultCan;
  const visibleFn = deps?.visible ?? defaultVisible;
  const [payments, people, value] = await Promise.all([
    canFn(viewer, "expenses.payments", "write"),
    canFn(viewer, "admin.people", "view"),
    visibleFn(viewer, "person.value"),
  ]);
  return payments && people && value;
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

// 게이트가 거짓이면 null — 오류가 아니다(페이지가 섹션을 그리지 않는다, 권한이 없다는 사실도 알리지 않는다).
export async function getPersonPayoutAccount(
  viewer: Viewer,
  userId: string,
  deps?: Partial<Pick<PayoutAccountDeps, "can" | "visible">>,
): Promise<PersonPayoutAccountDto | null> {
  if (!(await canManagePayoutAccount(viewer, deps))) return null;
  const row = await repoFindUserPayoutAccount(viewer, userId);
  if (!row) return null;
  // 칸이 모두 `person.value`이고 게이트가 그것을 이미 요구하므로 투영 없이 전체 DTO다(투영의 Partial을 단언으로 덮지 않는다).
  return {
    bank: row.accountBank,
    holder: row.accountHolder,
    last4: row.accountNumberLast4,
    hasNumber: row.accountNumberEncrypted !== null,
  };
}

export type PersonPayoutAccountInput = {
  accountBank?: string;
  accountHolder?: string;
  /** 거래처 `VendorInput.accountNumber`와 같은 규칙 — undefined · "" = 안 바꿈 · null = 지움 · 문자열 = 새 값. */
  accountNumber?: string | null;
};

// 판정(게이트 · 예금주 필요)은 첫 쓰기 전. 기록 detail에는 값을 싣지 않는다.
// 계좌 값과 document_update 기록은 같은 tx(리뷰 P2-2 — `setEmploymentDate`와 같은 규칙, 지급처 변경의 감사 누락 창 없음).
export async function updatePersonPayoutAccount(
  viewer: Viewer,
  userId: string,
  input: PersonPayoutAccountInput,
  deps?: Partial<PayoutAccountDeps>,
): Promise<void> {
  if (!(await canManagePayoutAccount(viewer, deps))) throw new ForbiddenError("지급 계좌 권한 없음");

  const stored = await repoFindUserPayoutAccount(viewer, userId);
  if (!stored) throw new UserNotFoundError("사람 찾을 수 없음");

  const plan = planAccountNumberUpdate(input.accountNumber);
  const accountBank = emptyToNull(input.accountBank);
  const accountHolder = emptyToNull(input.accountHolder);
  assertAccountFields({
    stored: { bank: stored.accountBank, holder: stored.accountHolder, hasNumber: stored.accountNumberEncrypted !== null },
    next: { bank: accountBank, holder: accountHolder, number: plan.kind },
  });

  const updateRow = deps?.updateUserPayoutAccount ?? repoUpdateUserPayoutAccount;
  const gate = await loadActionLogGate();
  try {
    await withTransaction(async (tx) => {
      // 사용자 결정(2026-10-23): 지급처 변경도 대상 계급 상한 — 사람 키 잠금 → 재조회 → assertCanGrantRoles(07-17 상한 커밋들과 같은 꼴).
      await lockSeatKeys(viewer, { personIds: [userId] }, tx);
      const target = await repoFindUserById(viewer, userId, tx);
      if (!target) throw new UserNotFoundError("사람 찾을 수 없음");
      try {
        await assertCanGrantRoles(viewer, [target.roleId], tx);
      } catch (ceiling) {
        // 계급 지정 문구(GRANT_FORBIDDEN_MESSAGE)는 이 맥락에 맞지 않는다 — 지급 패널은 계좌 낱말로 말한다.
        if (ceiling instanceof RoleGrantForbiddenError) throw new RoleGrantForbiddenError("이 사람 계좌 바꾸기 권한 없음");
        throw ceiling;
      }
      await updateRow(
        viewer,
        userId,
        {
          accountBank,
          accountHolder,
          ...(plan.kind === "set"
            ? { accountNumberEncrypted: plan.accountNumberEncrypted, accountNumberLast4: plan.accountNumberLast4 }
            : plan.kind === "clear"
              ? { accountNumberEncrypted: null, accountNumberLast4: null }
              : {}),
        },
        tx,
      );
      await recordActionInTx(
        viewer,
        { actionType: "document_update", entity: "user", entityId: userId, detail: { field: "payout_account" } },
        tx,
        gate,
        { appendActionLog: deps?.appendActionLog },
      );
    });
  } catch (error) {
    if (isCheckViolation(error, HOLDER_REQUIRED_CHECK)) {
      throw new AccountFieldsError({ accountHolder: accountProblemText(ACCOUNT_PROBLEMS.holderRequired) });
    }
    throw error;
  }
}

// 마스킹 해제 — 거래처 `revealAccountNumber`와 같은 순서: 게이트 → 해제 항목 → 행 → 번호 없으면 "" → 기록 → 복호화.
// 기록이 실패하면 평문을 돌려주지 않는다(순서가 바뀌면 기록 없이 열람되는 창이 생긴다). 번호가 없으면 열 것이 없어 기록도 없다.
export async function revealPersonAccountNumber(viewer: Viewer, userId: string, deps?: Partial<PayoutAccountDeps>): Promise<string> {
  const visibleFn = deps?.visible ?? defaultVisible;
  if (!(await canManagePayoutAccount(viewer, deps)) || !(await visibleFn(viewer, PAYOUT_ACCOUNT_REVEAL_ITEM))) {
    throw new ForbiddenError("계좌번호 마스킹 해제 권한 없음");
  }

  const row = await repoFindUserPayoutAccount(viewer, userId);
  if (!row?.accountNumberEncrypted) return "";

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "mask_reveal", entity: "user", entityId: userId });

  return decrypt(row.accountNumberEncrypted);
}
