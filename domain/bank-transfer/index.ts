import { sumKrw } from "@/domain/money";
import { TRANSFER_NOT_NUMBER } from "@/domain/payments/action-row";

// 06.5 D-6504 · D-6506 · REVIEWS DH-3: 신한 대량이체 양식의 판정 몫 — 옛 `app/src/domain/bankTransfer.ts` 이식(O:).
// 거래처 · 직원 계좌 저장(06.5-04)과 이체 파일 막힌 건(06.5-06 — 행 빌더는 그 플랜이 이 파일에 더한다)이 같은 함수 · 같은
// 이유 쌍을 쓴다 — 저장 때와 파일 때의 판정이 갈라지지 않게. CP949 길이는 ASCII 1 · 그 외 2바이트(파일은 xlsx 유니코드라
// 변환표가 필요 없다).
// 06.5-06: 행 빌더 몫 — 칸 규칙(머리글 9칸 · 시트 · CP949 바이트)은 옛 이식(O:), 출금통장표시내용은 넘으면 자른다(옛은 막음 —
// 사람이 고칠 수 없는 칸). 막힌 줄은 전부-아니면-전무가 아니라 빼고 나머지를 담는다. DB · 설정 · 암호화는 부르지 않는다 — 복호화는
// domain/payments/bank-transfer.ts가 하고 평문을 여기로 넘긴다.

/** 양식 머리글 9칸(O: bankTransfer.ts:59-69) — 마지막 칸만 소문자 `key`다(우리가 채우는 시트 쪽이 정본). */
export const BANK_TRANSFER_HEADER = [
  "*입금은행",
  "*입금계좌",
  "고객관리성명",
  "*입금액",
  "출금통장표시내용",
  "입금통장표시내용",
  "입금인코드",
  "비고",
  "업체사용key",
] as const;

/** 우리가 채우는 시트 이름(O: bankTransfer.ts:72) — 양식과 같아야 한다. */
export const BANK_TRANSFER_SHEET = "입력정보";

/** 양식 칸별 바이트 한도(O: bankTransfer.ts:91-101). */
export const BANK_TRANSFER_MAX_BYTES = {
  bankCode: 3,
  accountNo: 16,
  holder: 20,
  amount: 15,
  ourNote: 14,
  theirNote: 14,
  payerCode: 32,
  memo: 20,
  key: 20,
} as const;

/**
 * 은행 이름 → 3자리 코드(O: bankTransfer.ts:122 — 견본 `코드표` 시트 65줄, 은행 34 + 증권사 31).
 * 코드는 글자다 — `088`의 앞 0이 살아 있어야 한다.
 */
export const BANK_CODES: Readonly<Record<string, string>> = {
  신한: "088",
  경남: "039",
  광주: "034",
  국민: "004",
  기업: "003",
  "지역농·축협": "012",
  도이치: "055",
  부산: "032",
  KDB산업: "002",
  저축: "050",
  새마을금고: "045",
  수협: "007",
  회원수협: "030",
  신협: "048",
  한국씨티: "027",
  아이엠뱅크: "031",
  우리: "020",
  우체국: "071",
  전북: "037",
  제주: "035",
  하나: "081",
  케이뱅크: "089",
  카카오뱅크: "090",
  중국공상: "062",
  비엔피파리바: "061",
  "BOA(BANKOFAMERICA)": "060",
  HSBC: "054",
  JP모건체이스: "057",
  SC제일: "023",
  산림조합: "064",
  중국건설: "067",
  IBK투자증권: "225",
  농협: "011",
  유안타증권: "209",
  KB증권: "218",
  미래에셋증권: "238",
  삼성증권: "240",
  한국투자증권: "243",
  NH투자증권: "247",
  아이엠증권: "262",
  현대차증권: "263",
  한화투자증권: "269",
  하나증권: "270",
  신한투자증권: "278",
  메리츠증권: "287",
  유진투자증권: "280",
  신영증권: "291",
  대신증권: "267",
  DB금융투자: "279",
  부국증권: "290",
  엘에스증권주식회사: "265",
  메리츠종합금융증권: "268",
  케이프투자증권: "292",
  키움증권: "264",
  우리투자증권: "294",
  다올투자증권: "227",
  BNK투자증권: "224",
  카카오페이증권: "288",
  상상인증권: "221",
  토스증권: "271",
  중국은행: "063",
  토스뱅크: "092",
  교보증권: "261",
  에스케이증권: "266",
  NH농협증권: "289",
};

/** 코드표에 없는 흔한 표기 → 코드표 이름(O: bankTransfer.ts:201 — 양식이 아니라 옛 시스템이 더한 것). 뒤 「은행」은 resolveBankCode가 뗀다. */
const BANK_ALIASES: Readonly<Record<string, string>> = {
  NH농협: "농협",
  농협중앙회: "농협",
  단위농협: "지역농·축협",
  축협: "지역농·축협",
  KB국민: "국민",
  IBK기업: "기업",
  KEB하나: "하나",
  하나은행: "하나",
  SC: "SC제일",
  제일: "SC제일",
  스탠다드차타드: "SC제일",
  씨티: "한국씨티",
  시티: "한국씨티",
  산업: "KDB산업",
  KDB: "KDB산업",
  대구: "아이엠뱅크",
  IM뱅크: "아이엠뱅크",
  아이엠: "아이엠뱅크",
  카카오: "카카오뱅크",
  케이: "케이뱅크",
  K뱅크: "케이뱅크",
  토스: "토스뱅크",
  새마을: "새마을금고",
  MG새마을금고: "새마을금고",
  신용협동조합: "신협",
  수협은행: "수협",
  우정사업본부: "우체국",
  우체국예금보험: "우체국",
  BOA: "BOA(BANKOFAMERICA)",
  뱅크오브아메리카: "BOA(BANKOFAMERICA)",
  SK증권: "에스케이증권",
  IBK증권: "IBK투자증권",
};

/** 이름을 견주기 좋게 다듬는다 — 빈칸 · 괄호의 흔들림을 없앤다. */
function normalizeBankName(name: string): string {
  return name.replaceAll(/[\s()]/gu, "").toUpperCase();
}

const NORMALIZED_CODES: ReadonlyMap<string, string> = new Map(
  Object.entries(BANK_CODES).map(([name, code]) => [normalizeBankName(name), code]),
);
const NORMALIZED_ALIASES: ReadonlyMap<string, string> = new Map(
  Object.entries(BANK_ALIASES).map(([alias, name]) => [normalizeBankName(alias), normalizeBankName(name)]),
);
const KNOWN_CODES: ReadonlySet<string> = new Set(Object.values(BANK_CODES));

/**
 * 은행 표기 → 3자리 코드(O: bankTransfer.ts:259). 받는 것: 코드표 이름(`신한`) · 「은행」이 붙은 이름(`신한은행`) · 이미 코드(`088`).
 * 못 찾으면 null — 짐작해서 아무 코드나 고르지 않는다(은행이 틀리면 돈이 안 나가거나 남의 계좌로 간다).
 */
export function resolveBankCode(bank: string): string | null {
  const value = bank.trim();
  if (value === "") return null;

  // 이미 코드인가 — 코드표에 있는 코드만 받는다.
  if (/^\d{3}$/u.test(value)) return KNOWN_CODES.has(value) ? value : null;

  const key = normalizeBankName(value);

  // 코드표 이름 그대로 — 「중국은행」이 여기서 걸린다(「은행」을 떼기 전에).
  const exact = NORMALIZED_CODES.get(key);
  if (exact !== undefined) return exact;

  const alias = NORMALIZED_ALIASES.get(key);
  if (alias !== undefined) return NORMALIZED_CODES.get(alias) ?? null;

  // 뒤에 붙은 「은행」을 떼고 다시 — `신한은행` → `신한`.
  if (key.endsWith("은행")) {
    const short = key.slice(0, -2);
    const stripped = NORMALIZED_CODES.get(short);
    if (stripped !== undefined) return stripped;
    const strippedAlias = NORMALIZED_ALIASES.get(short);
    if (strippedAlias !== undefined) return NORMALIZED_CODES.get(strippedAlias) ?? null;
  }
  return null;
}

/** CP949(EUC-KR) 바이트 수(O: bankTransfer.ts:306) — ASCII 1, 나머지 2. 담을 수 없는 글자는 cp949Unsupported가 따로 거른다. */
export function cp949ByteLength(text: string): number {
  let total = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    total += code < 0x80 ? 1 : 2;
  }
  return total;
}

/** CP949로 담을 수 없는 글자(BMP 밖 — 이모지 · 희귀 한자) — 없으면 빈 배열(O: bankTransfer.ts:322). */
export function cp949Unsupported(text: string): string[] {
  const unsupported: string[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 0xffff && !unsupported.includes(char)) unsupported.push(char);
  }
  return unsupported;
}

/** 계좌 칸 이유 쌍 — 원인 · 고칠 일. 저장 때 칸 오류는 둘 다, 이체 파일 막힌 건은 원인 + 끝 링크로 쓴다(UI-SPEC Copywriting). */
export const ACCOUNT_PROBLEMS = {
  holderRequired: { cause: "예금주 없음", fix: "예금주 적기" },
  bankCodeUnknown: { cause: "은행 코드 없음", fix: "은행 이름 고치기" },
  holderTooLong: { cause: "예금주 길이 초과", fix: "예금주 줄이기" },
  holderUnsupported: { cause: "예금주 형식 오류", fix: "예금주 고치기" },
} as const;

export type AccountProblem = (typeof ACCOUNT_PROBLEMS)[keyof typeof ACCOUNT_PROBLEMS];

export function accountProblemText(problem: AccountProblem): string {
  return `${problem.cause} · ${problem.fix}`;
}

/** 은행 이름이 코드로 풀리지 않으면 은행 코드 없음. */
export function bankNameProblem(bank: string): AccountProblem | null {
  return resolveBankCode(bank) === null ? ACCOUNT_PROBLEMS.bankCodeUnknown : null;
}

/** 예금주 — 담을 수 없는 글자를 길이보다 먼저 본다(O: bankTransfer.ts:421 → :425 순서). */
export function holderTextProblem(holder: string): AccountProblem | null {
  if (cp949Unsupported(holder).length > 0) return ACCOUNT_PROBLEMS.holderUnsupported;
  if (cp949ByteLength(holder) > BANK_TRANSFER_MAX_BYTES.holder) return ACCOUNT_PROBLEMS.holderTooLong;
  return null;
}

/** 계좌번호 글자 · 길이 · 복호화 실패(UI-SPEC V5 14번) — 저장 때 칸 오류에는 없는 파일 몫 이유다. */
export const ACCOUNT_NUMBER_MALFORMED = { cause: "계좌번호 형식 오류", fix: "계좌 고치기" } as const;

/**
 * 입금액 글자가 양식 자릿수(15)를 넘음 — 옛 「지급액 자릿수가 15자를 넘습니다」(O: app/src/domain/bankTransfer.ts:496-499). 새 문구 없이 이체액 형식 오류
 * 문구(TRANSFER_NOT_NUMBER — 지급 판정이 큰 수에 쓰는 것)를 그대로 쓴다. 계좌 칸 문제가 아니라 끝 링크가 없다(이체액 칸이 같은 행에 있다).
 */
export const TRANSFER_AMOUNT_TOO_LONG = { text: TRANSFER_NOT_NUMBER } as const;

export type BankTransferProblem = AccountProblem | typeof ACCOUNT_NUMBER_MALFORMED | typeof TRANSFER_AMOUNT_TOO_LONG;

/**
 * CP949 바이트 한도 이하로 문자 경계에서 자른다(EP2-C8) — 반쪽 글자를 남기지 않는다. 옛은 넘으면 막았다(O: bankTransfer.ts:349-352 ·
 * :496-499); 출금통장표시내용 · 비고는 사람이 고칠 수 없는 칸이라 자른다.
 */
export function truncateCp949(text: string, maxBytes: number): string {
  let total = 0;
  let cut = "";
  for (const char of text) {
    const size = cp949ByteLength(char);
    if (total + size > maxBytes) break;
    total += size;
    cut += char;
  }
  return cut;
}

/** 파일 한 줄의 재료 — 계좌번호는 복호화한 평문(복호화가 실패했으면 null). key는 막힌 건을 돌려 찾는 열쇠(지급처 키). */
export type BankTransferSource = { key: string; bank: string; holder: string; accountNumber: string | null; transferKrw: number; memo: string };

/** 양식 9칸 — 전부 글자다(O: bankTransfer.ts:383-403). */
export type BankTransferRow = {
  bankCode: string;
  accountNo: string;
  holder: string;
  amount: string;
  ourNote: string;
  theirNote: string;
  payerCode: string;
  memo: string;
  key: string;
};

export type BankTransferBuild = {
  rows: { key: string; row: BankTransferRow }[];
  blocked: { key: string; problem: BankTransferProblem }[];
};

// 계좌 칸 판정(UI-SPEC V5 10~14 차례) — 예금주 없음 → 은행 코드 → 예금주 글자 · 길이(못 담는 글자 먼저, EP2-C7) → 계좌번호 → 입금액 자릿수(옛 차례).
function sourceProblem(source: BankTransferSource): BankTransferProblem | null {
  if (source.holder.trim() === "") return ACCOUNT_PROBLEMS.holderRequired;
  const bank = bankNameProblem(source.bank);
  if (bank) return bank;
  const holder = holderTextProblem(source.holder.trim());
  if (holder) return holder;
  // 하이픈 · 빈칸은 사람이 보기 좋으라고 넣는 것이라 뗀다(O: bankTransfer.ts:461).
  const accountNo = source.accountNumber?.replaceAll(/[\s-]/gu, "") ?? "";
  if (!/^\d+$/u.test(accountNo) || accountNo.length > BANK_TRANSFER_MAX_BYTES.accountNo) return ACCOUNT_NUMBER_MALFORMED;
  if (String(source.transferKrw).length > BANK_TRANSFER_MAX_BYTES.amount) return TRANSFER_AMOUNT_TOO_LONG;
  return null;
}

/** 줄들을 양식 9칸으로 편다(O: bankTransfer.ts:442) — 막힌 줄은 blocked로 모으고 통과분만 rows에 담는다. */
export function buildBankTransferRows(sources: readonly BankTransferSource[]): BankTransferBuild {
  const built: BankTransferBuild = { rows: [], blocked: [] };
  for (const source of sources) {
    const problem = sourceProblem(source);
    if (problem) {
      built.blocked.push({ key: source.key, problem });
      continue;
    }
    const holder = source.holder.trim();
    const memo = truncateCp949(source.memo, BANK_TRANSFER_MAX_BYTES.memo);
    built.rows.push({
      key: source.key,
      row: {
        bankCode: resolveBankCode(source.bank) ?? "",
        accountNo: (source.accountNumber ?? "").replaceAll(/[\s-]/gu, ""),
        holder,
        amount: String(source.transferKrw),
        // 우리 통장에 남을 적요 = 예금주(O: bankTransfer.ts:489) — 14바이트로 자른다(EP2-C8, 옛은 막음).
        ourNote: truncateCp949(holder, BANK_TRANSFER_MAX_BYTES.ourNote),
        theirNote: "",
        // 입금인코드는 CMS 칸이라 늘 비운다(O: bankTransfer.ts:519).
        payerCode: "",
        memo,
        key: truncateCp949(source.memo, BANK_TRANSFER_MAX_BYTES.key),
      },
    });
  }
  return built;
}

/** 9칸을 양식 차례대로 편다(O: bankTransfer.ts:542) — 머리글과 짝이 맞아야 한다. */
export function bankTransferCells(row: BankTransferRow): string[] {
  return [row.bankCode, row.accountNo, row.holder, row.amount, row.ourNote, row.theirNote, row.payerCode, row.memo, row.key];
}

// 06.5-06(D-6519 · ND-6): 지급처마다 한 줄. 키는 옛 그대로(O: server/src/payments.ts:352-361) — 거래처 `v:` · 직원 `p:` · 지급처 없음 `x:{문서}`
// (지급처 없는 문서는 합치지 않는다). 키는 id라 평문 계좌가 아니다 — 기록 detail의 줄 열쇠로도 쓴다.
export type TransferLineInput = { expenseId: string; vendorId: string | null; payeeUserId: string | null; number: string; transferKrw: number };

export function payeeKeyOf(row: { expenseId: string; vendorId: string | null; payeeUserId: string | null }): string {
  if (row.vendorId) return `v:${row.vendorId}`;
  if (row.payeeUserId) return `p:${row.payeeUserId}`;
  return `x:${row.expenseId}`;
}

export type MergedTransferLine = { payeeKey: string; expenseIds: string[]; totalKrw: number; memo: string };

/** 같은 키 행은 이체액을 합치고 비고는 첫 문서 번호 + ` 외 {n-1}건`(20바이트 — 옛은 번호를 전부 이어 붙였다, ND-6). 줄 차례 = 키가 처음 나온 차례. */
export function mergeTransferLines(rows: readonly TransferLineInput[]): MergedTransferLine[] {
  const groups = new Map<string, { expenseIds: string[]; amounts: number[]; firstNumber: string }>();
  for (const row of rows) {
    const key = payeeKeyOf(row);
    const group = groups.get(key) ?? { expenseIds: [], amounts: [], firstNumber: row.number };
    group.expenseIds.push(row.expenseId);
    group.amounts.push(row.transferKrw);
    groups.set(key, group);
  }
  return [...groups].map(([payeeKey, group]) => ({
    payeeKey,
    expenseIds: group.expenseIds,
    totalKrw: sumKrw(group.amounts),
    memo: truncateCp949(group.expenseIds.length > 1 ? `${group.firstNumber} 외 ${group.expenseIds.length - 1}건` : group.firstNumber, BANK_TRANSFER_MAX_BYTES.memo),
  }));
}
