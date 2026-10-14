// 06.5 D-6505(D10 · D29, 권한 카드 10/13 20:14 KST): 직원 지급 계좌 — 거래처 계좌와 같은 암호화 · 끝 4자리 · 노출 규칙.
// 게이트는 `expenses.payments` 쓰기와 `admin.people` 보기 둘 다(새 권한 키 0). 직원 본인은 게이트가 거짓이면 자기 것도
// 못 본다(옛도 본인 예외 없음 O: server/src/people.ts:559-561).
import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { ForbiddenError, UserNotFoundError } from "@/domain/people";
import { planAccountNumberUpdate } from "@/domain/vendors";
import { assertAccountFields } from "@/domain/vendors/account-fields";
import {
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
  recordAction: typeof defaultRecordAction;
};

export async function canManagePayoutAccount(viewer: Viewer, deps?: Partial<Pick<PayoutAccountDeps, "can">>): Promise<boolean> {
  const canFn = deps?.can ?? defaultCan;
  const [payments, people] = await Promise.all([canFn(viewer, "expenses.payments", "write"), canFn(viewer, "admin.people", "view")]);
  return payments && people;
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

// 게이트가 거짓이면 null — 오류가 아니다(페이지가 섹션을 그리지 않는다, 권한이 없다는 사실도 알리지 않는다).
export async function getPersonPayoutAccount(
  viewer: Viewer,
  userId: string,
  deps?: Partial<Pick<PayoutAccountDeps, "can">>,
): Promise<PersonPayoutAccountDto | null> {
  if (!(await canManagePayoutAccount(viewer, deps))) return null;
  const row = await repoFindUserPayoutAccount(viewer, userId);
  if (!row) return null;
  const source: PersonPayoutAccountDto = {
    bank: row.accountBank,
    holder: row.accountHolder,
    last4: row.accountNumberLast4,
    hasNumber: row.accountNumberEncrypted !== null,
  };
  return (await project(viewer, source, PERSON_PAYOUT_ACCOUNT_DTO_SPEC)) as PersonPayoutAccountDto;
}

export type PersonPayoutAccountInput = {
  accountBank?: string;
  accountHolder?: string;
  /** 거래처 `VendorInput.accountNumber`와 같은 규칙 — undefined · "" = 안 바꿈 · null = 지움 · 문자열 = 새 값. */
  accountNumber?: string | null;
};

// 판정(게이트 · 예금주 필요)은 첫 쓰기 전. 기록 detail에는 값을 싣지 않는다.
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

  await repoUpdateUserPayoutAccount(viewer, userId, {
    accountBank,
    accountHolder,
    ...(plan.kind === "set"
      ? { accountNumberEncrypted: plan.accountNumberEncrypted, accountNumberLast4: plan.accountNumberLast4 }
      : plan.kind === "clear"
        ? { accountNumberEncrypted: null, accountNumberLast4: null }
        : {}),
  });

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_update", entity: "user", entityId: userId, detail: { field: "payout_account" } });
}
