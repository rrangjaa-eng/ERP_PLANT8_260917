// 06.5 D-6506(G8, 사용자 10/7 12:04 KST) · REVIEWS DH-3: 계좌 칸 저장 판정 — 거래처와 직원 계좌가 같은 함수를 쓴다.
// 예금주 필요 조건은 옛 CHECK `vendors_account_holder_required`(O: db/schema/010_tables.sql:5440)와 같다. 세 칸 중 어느 것도
// 손대지 않은 저장은 옛 값이 어긋나도 막지 않는다(옛 데이터는 이체 파일 막힌 건 + 끝 링크가 잡는다). 예금주만 지운 저장도
// 판정한다 — D-6506 조건을 어기는 행을 새로 만들지 않는다. 은행 코드(②) · 예금주 글자(③)는 이체 파일과 같은 함수로,
// 그 칸을 바꾼 저장에서만 본다(옛 은행 · 옛 긴 예금주를 그대로 둔 저장은 막지 않는다).

import { ACCOUNT_PROBLEMS, accountProblemText, bankNameProblem, holderTextProblem } from "@/domain/bank-transfer";

export type AccountFieldErrors = { accountBank?: string; accountHolder?: string };

export class AccountFieldsError extends Error {
  readonly fieldErrors: AccountFieldErrors;

  constructor(fieldErrors: AccountFieldErrors) {
    super(Object.values(fieldErrors).join(" / "));
    this.name = "AccountFieldsError";
    this.fieldErrors = fieldErrors;
  }
}

export type AccountFieldsInput = {
  stored: { bank: string | null; holder: string | null; hasNumber: boolean };
  next: { bank: string | null | undefined; holder: string | null | undefined; number: "keep" | "clear" | "set" };
};

function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function judgeAccountFields(input: AccountFieldsInput): AccountFieldErrors {
  const { stored, next } = input;
  const bank = present(next.bank);
  const holder = present(next.holder);
  const bankChanged = bank !== present(stored.bank);
  const holderChanged = holder !== present(stored.holder);
  const numberChanged = next.number !== "keep";
  if (!bankChanged && !holderChanged && !numberChanged) return {};

  const hasNumber = next.number === "set" ? true : next.number === "clear" ? false : stored.hasNumber;
  const errors: AccountFieldErrors = {};
  if (bank !== null && hasNumber && holder === null) errors.accountHolder = accountProblemText(ACCOUNT_PROBLEMS.holderRequired);
  if (bankChanged && bank !== null) {
    const problem = bankNameProblem(bank);
    if (problem) errors.accountBank = accountProblemText(problem);
  }
  if (holderChanged && holder !== null) {
    const problem = holderTextProblem(holder);
    if (problem) errors.accountHolder = accountProblemText(problem);
  }
  return errors;
}

export function assertAccountFields(input: AccountFieldsInput): void {
  const errors = judgeAccountFields(input);
  if (Object.keys(errors).length > 0) throw new AccountFieldsError(errors);
}
