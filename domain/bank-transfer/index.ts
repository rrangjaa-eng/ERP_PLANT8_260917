// 06.5 D-6504 · D-6506 · REVIEWS DH-3: 신한 대량이체 양식의 판정 몫 — 옛 `app/src/domain/bankTransfer.ts` 이식(O:).
// 거래처 · 직원 계좌 저장(06.5-04)과 이체 파일 막힌 건(06.5-06 — 행 빌더는 그 플랜이 이 파일에 더한다)이 같은 함수 · 같은
// 이유 쌍을 쓴다 — 저장 때와 파일 때의 판정이 갈라지지 않게. CP949 길이는 ASCII 1 · 그 외 2바이트(파일은 xlsx 유니코드라
// 변환표가 필요 없다).

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

/** 예금주 — 담을 수 없는 글자를 길이보다 먼저 본다(O: bankTransfer.ts:402-405 순서). */
export function holderTextProblem(holder: string): AccountProblem | null {
  if (cp949Unsupported(holder).length > 0) return ACCOUNT_PROBLEMS.holderUnsupported;
  if (cp949ByteLength(holder) > BANK_TRANSFER_MAX_BYTES.holder) return ACCOUNT_PROBLEMS.holderTooLong;
  return null;
}
