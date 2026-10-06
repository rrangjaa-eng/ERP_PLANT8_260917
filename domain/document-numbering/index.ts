import type { Viewer } from "@/domain/viewer";
import {
  allocateNumber as repoAllocateNumber,
  lockDocumentCounter,
  lockDocumentCountersByKey,
  shareLockDocumentCounter,
  ALL_PERIODS,
  type DbOrTx,
} from "@/repositories/document-counters";
import { findSimpleValue, upsertSimpleValue } from "@/repositories/settings";
import { getSettingValue, setSettingValue, type SettingDef } from "@/domain/settings/registry";
import { recordAction } from "@/domain/action-log/record";
import { can } from "@/domain/permissions/can";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { kstYear } from "@/lib/kst-date";
import {
  DOCUMENT_NUMBER_PROJECT_PREFIX,
  DOCUMENT_NUMBER_PROJECT_YEAR_DIGITS,
  DOCUMENT_NUMBER_PROJECT_SEQ_DIGITS,
  DOCUMENT_NUMBER_PROJECT_SEPARATOR,
  DOCUMENT_NUMBER_PROJECT_SEQ_START,
  DOCUMENT_NUMBER_CERT_PREFIX,
  DOCUMENT_NUMBER_CERT_YEAR_DIGITS,
  DOCUMENT_NUMBER_CERT_SEQ_DIGITS,
  DOCUMENT_NUMBER_CERT_SEPARATOR,
  DOCUMENT_NUMBER_CERT_SEQ_START,
  DOCUMENT_NUMBER_LEAVE_PREFIX,
  DOCUMENT_NUMBER_LEAVE_YEAR_DIGITS,
  DOCUMENT_NUMBER_LEAVE_SEQ_DIGITS,
  DOCUMENT_NUMBER_LEAVE_SEPARATOR,
  DOCUMENT_NUMBER_LEAVE_SEQ_START,
  DOCUMENT_NUMBER_EXPENSE_TEAM_PREFIX,
  DOCUMENT_NUMBER_EXPENSE_TEAM_YEAR_DIGITS,
  DOCUMENT_NUMBER_EXPENSE_TEAM_SEQ_DIGITS,
  DOCUMENT_NUMBER_EXPENSE_TEAM_SEPARATOR,
  DOCUMENT_NUMBER_EXPENSE_TEAM_SEQ_START,
  DOCUMENT_NUMBER_PURCHASE_REQUEST_TEAM_PREFIX,
  DOCUMENT_NUMBER_PURCHASE_REQUEST_TEAM_YEAR_DIGITS,
  DOCUMENT_NUMBER_PURCHASE_REQUEST_TEAM_SEQ_DIGITS,
  DOCUMENT_NUMBER_PURCHASE_REQUEST_TEAM_SEPARATOR,
  DOCUMENT_NUMBER_PURCHASE_REQUEST_TEAM_SEQ_START,
  DOCUMENT_NUMBER_PURCHASE_REQUEST_PREFIX,
  DOCUMENT_NUMBER_PURCHASE_REQUEST_SEPARATOR,
  DOCUMENT_NUMBER_PURCHASE_REQUEST_SEQ_DIGITS,
  DOCUMENT_NUMBER_PURCHASE_REQUEST_SEQ_START,
} from "@/domain/settings/keys";
import { getSimpleSettingValues } from "@/domain/settings/registry";
import { DOCUMENT_NUMBER_EXPENSE_SEPARATOR, DOCUMENT_NUMBER_EXPENSE_SEQ_DIGITS, DOCUMENT_NUMBER_EXPENSE_SEQ_START } from "@/domain/settings/keys";

// Phase 4 Task 1 ②·Task 2 ⑦ — 문서 번호 부여: 트랜잭션 안 카운터 증가 +
// 서식 조립. `counter_key = "project"`, `period` = 서기 연도 네 자리 문자열
// (예: "2026") — 04-RESEARCH.md Open Question 1이 지적한 `period`의 뜻을
// 여기서 고정한다. 지출결의 번호(Phase 5)는 같은 표의 다른 counterKey를
// 쓴다. 연도가 바뀌면 period가 바뀌어 순번이 1부터 다시 시작한다.

export type DocumentNumberFormat = {
  prefix: string;
  yearDigits: number;
  seqDigits: number;
  separator: string;
  seqStart: number;
};

export type DocumentNumberParts = { year: number; seq: number };

// 04-05(ADMN-09) Task 2 ③ — 서식 조립을 순수 함수로 뺀다(설정 조회 없이
// 단위 테스트가 된다, test/unit/domain/document-number-format.test.ts).
// `seq`는 document_counters의 원자 증가값(항상 1부터) 그대로다 — 순번
// 시작값(`seqStart`)은 카운터 자체가 아니라 **표시값에 더하는 오프셋**
// 이라 카운터 규약(04-01, 항상 1부터 증가)을 건드리지 않는다. 순번이
// 자릿수를 넘치면 **자르지 않는다** — 잘리면 번호 유일성이 깨진다
// (`padStart`는 목표 길이보다 긴 문자열을 그대로 둔다).
export function documentNumberFormat(parts: DocumentNumberParts, format: DocumentNumberFormat): string {
  const displaySeq = parts.seq + format.seqStart - 1;
  const yearStr = String(parts.year).slice(-format.yearDigits).padStart(format.yearDigits, "0");
  const seqStr = String(displaySeq).padStart(format.seqDigits, "0");
  return `${format.prefix}${yearStr}${format.separator}${seqStr}`;
}

// counterKey별 서식 설정 키 묶음 조회 표(Task 2 ① 판단 — 문서 종류별 키
// 묶음). 이 플랜은 "project" 한 줄만 등록한다 — 지출결의·연차·카드·구매
// 요청 서식 키는 그 문서가 생기는 페이즈가 `domain/settings/keys.ts`에
// 같은 형태(`document_number.<종류>.*`)로 더하고 이 표에 줄을 하나
// 추가한다.
const DOCUMENT_NUMBER_FORMAT_DEFS: Record<
  string,
  {
    prefix: SettingDef<string>;
    yearDigits: SettingDef<number>;
    seqDigits: SettingDef<number>;
    separator: SettingDef<string>;
    seqStart: SettingDef<number>;
  }
> = {
  project: {
    prefix: DOCUMENT_NUMBER_PROJECT_PREFIX,
    yearDigits: DOCUMENT_NUMBER_PROJECT_YEAR_DIGITS,
    seqDigits: DOCUMENT_NUMBER_PROJECT_SEQ_DIGITS,
    separator: DOCUMENT_NUMBER_PROJECT_SEPARATOR,
    seqStart: DOCUMENT_NUMBER_PROJECT_SEQ_START,
  },
  // 04.3-02 — 확인증 번호(counterKey "cert"). 기본 CERT-2026-0001.
  cert: {
    prefix: DOCUMENT_NUMBER_CERT_PREFIX,
    yearDigits: DOCUMENT_NUMBER_CERT_YEAR_DIGITS,
    seqDigits: DOCUMENT_NUMBER_CERT_SEQ_DIGITS,
    separator: DOCUMENT_NUMBER_CERT_SEPARATOR,
    seqStart: DOCUMENT_NUMBER_CERT_SEQ_START,
  },
  leave: {
    prefix: DOCUMENT_NUMBER_LEAVE_PREFIX,
    yearDigits: DOCUMENT_NUMBER_LEAVE_YEAR_DIGITS,
    seqDigits: DOCUMENT_NUMBER_LEAVE_SEQ_DIGITS,
    separator: DOCUMENT_NUMBER_LEAVE_SEPARATOR,
    seqStart: DOCUMENT_NUMBER_LEAVE_SEQ_START,
  },
  // 05-07 — 팀 비용 지출결의 번호(counterKey "expense_team", period = 제출일 서울 연도). 기본 T26-0001.
  expense_team: {
    prefix: DOCUMENT_NUMBER_EXPENSE_TEAM_PREFIX,
    yearDigits: DOCUMENT_NUMBER_EXPENSE_TEAM_YEAR_DIGITS,
    seqDigits: DOCUMENT_NUMBER_EXPENSE_TEAM_SEQ_DIGITS,
    separator: DOCUMENT_NUMBER_EXPENSE_TEAM_SEPARATOR,
    seqStart: DOCUMENT_NUMBER_EXPENSE_TEAM_SEQ_START,
  },
  // 06-02 — 팀 비용 구매 요청 번호(counterKey "purchase_request_team", period = 연도). 기본 TC26-0001.
  purchase_request_team: {
    prefix: DOCUMENT_NUMBER_PURCHASE_REQUEST_TEAM_PREFIX,
    yearDigits: DOCUMENT_NUMBER_PURCHASE_REQUEST_TEAM_YEAR_DIGITS,
    seqDigits: DOCUMENT_NUMBER_PURCHASE_REQUEST_TEAM_SEQ_DIGITS,
    separator: DOCUMENT_NUMBER_PURCHASE_REQUEST_TEAM_SEPARATOR,
    seqStart: DOCUMENT_NUMBER_PURCHASE_REQUEST_TEAM_SEQ_START,
  },
};

export class UnknownDocumentNumberCounterError extends Error {}

export async function loadDocumentNumberFormat(counterKey: string): Promise<DocumentNumberFormat> {
  const defs = DOCUMENT_NUMBER_FORMAT_DEFS[counterKey];
  if (!defs) {
    throw new UnknownDocumentNumberCounterError(
      `document-numbering: counterKey '${counterKey}'의 서식 설정이 등록되지 않았습니다.`,
    );
  }
  const [prefix, yearDigits, seqDigits, separator, seqStart] = await Promise.all([
    getSettingValue(defs.prefix),
    getSettingValue(defs.yearDigits),
    getSettingValue(defs.seqDigits),
    getSettingValue(defs.separator),
    getSettingValue(defs.seqStart),
  ]);
  return { prefix, yearDigits, seqDigits, separator, seqStart };
}

// **반드시 문서 INSERT와 같은 트랜잭션 안에서 불린다** — 별도 트랜잭션으로
// 번호만 먼저 커밋하지 않는다(04-RESEARCH.md Anti-Patterns). 호출자가
// `db.transaction(async (tx) => { ... allocateDocumentNumber(viewer, {...}, tx) ... })`
// 안에서 부른다.
// `format`은 호출자가 **트랜잭션을 열기 전에** loadDocumentNumberFormat으로
// 미리 읽어 넘긴다 — 카운터 행 잠금을 잡은 트랜잭션 안에서 전역 풀로 설정을
// 읽으면 풀이 그 트랜잭션들로 가득 찼을 때 커넥션을 못 빌려 애플리케이션
// 레벨 교착에 빠진다(풀 소진 교착, test/integration/projects-create-concurrency.test.ts).
// 단 순번 시작값(seqStart)은 받지 않는다 — 잠금 뒤 같은 tx로 다시 읽는다(아래 04-51 리뷰 S1).
// 전제: `counterKey`는 DOCUMENT_NUMBER_FORMAT_DEFS에 등록된 키여야 한다 — 아니면
// 카운터를 올린 뒤 UnknownDocumentNumberCounterError를 던진다(tx를 넘긴 호출자는 함께 되돌린다).
export async function allocateDocumentNumber(
  viewer: Viewer,
  input: { counterKey: string; year: number; format: Omit<DocumentNumberFormat, "seqStart"> },
  tx?: DbOrTx,
): Promise<{ number: string; seq: number }> {
  const period = String(input.year);
  const seq = tx
    ? await repoAllocateNumber(viewer, input.counterKey, period, tx)
    : await repoAllocateNumber(viewer, input.counterKey, period);
  // 04-51 리뷰 S1 — 순번 시작값만은 카운터 행 잠금 뒤 같은 tx로 다시 읽는다(전역 풀이 아니라 tx라
  // 풀 소진 교착과 무관). 트랜잭션 전에 읽은 값은 그 사이 저장된 시작값보다 낡았을 수 있다 —
  // 시작값 저장(setSimpleSettingValue)이 같은 행 잠금 안에서 검증하므로 이 값과 카운터가 맞물린다.
  const seqStartDef = DOCUMENT_NUMBER_FORMAT_DEFS[input.counterKey]?.seqStart;
  if (!seqStartDef) {
    throw new UnknownDocumentNumberCounterError(
      `document-numbering: counterKey '${input.counterKey}'의 서식 설정이 등록되지 않았습니다.`,
    );
  }
  const seqStart = await getSettingValue(seqStartDef, undefined, {
    findSimpleValue: (v, k) => findSimpleValue(v, k, tx),
  });
  return { number: documentNumberFormat({ year: input.year, seq }, { ...input.format, seqStart }), seq };
}

export class SeqStartOverlapError extends UserFacingError {}

type SeqStartGuard = { seqStart: SettingDef<number>; lockIssued: (viewer: Viewer, now: Date, tx: DbOrTx) => Promise<number> };

// 시작값 키 → 그 키의 정의와 채번이 잡는 카운터 행 잠금(잠근 카운터의 발급 수). 연도 period 서식(DOCUMENT_NUMBER_FORMAT_DEFS)은
// 올해 행 하나, 지출결의 번호(PR #162 리뷰 P1 — period = 프로젝트 번호)는 `expense` 행 전부, 구매 요청 번호(06-02)는 `purchase_request` 행 전부.
function seqStartGuardFor(key: string): SeqStartGuard | undefined {
  if (key === DOCUMENT_NUMBER_EXPENSE_SEQ_START.key) {
    return {
      seqStart: DOCUMENT_NUMBER_EXPENSE_SEQ_START,
      // 잠금판(ALL_PERIODS)을 먼저 — 커밋 전 채번(행이 아직 없던 프로젝트 포함)이 끝날 때까지 기다린 뒤 모든 period 행을 잠근다.
      lockIssued: async (viewer, _now, tx) => {
        await lockDocumentCounter(viewer, "expense", ALL_PERIODS, tx);
        return lockDocumentCountersByKey(viewer, "expense", tx);
      },
    };
  }
  if (key === DOCUMENT_NUMBER_PURCHASE_REQUEST_SEQ_START.key) {
    return {
      seqStart: DOCUMENT_NUMBER_PURCHASE_REQUEST_SEQ_START,
      // 지출결의 갈래와 같은 순서 — 잠금판을 먼저, 그다음 모든 period(프로젝트 번호) 행.
      lockIssued: async (viewer, _now, tx) => {
        await lockDocumentCounter(viewer, "purchase_request", ALL_PERIODS, tx);
        return lockDocumentCountersByKey(viewer, "purchase_request", tx);
      },
    };
  }
  const entry = Object.entries(DOCUMENT_NUMBER_FORMAT_DEFS).find(([, defs]) => defs.seqStart.key === key);
  if (!entry) return undefined;
  const [counterKey, defs] = entry;
  return { seqStart: defs.seqStart, lockIssued: (viewer, now, tx) => lockDocumentCounter(viewer, counterKey, String(kstYear(now)), tx) };
}

// 묶음 ④ /review R7 — 순번 시작값 낮추기 가드 한 곳. 설정 화면 저장(setSimpleSettingValue)과 설정 가져오기
// (domain/settings/export의 importSettings)가 **값을 쓰는 트랜잭션 안에서** 부른다. 시작값 키가 아니면 아무것도
// 하지 않는다. 시작값 키면 채번과 같은 올해 카운터 행을 잠그고(직렬화) 같은 tx로 현재 시작값을 읽어, 올해 발급이
// 1건 이상이고 새 값이 현재 값보다 작을 때만 SeqStartOverlapError를 던진다. `value`는 그 키의 스키마로 읽는다.
export async function assertSeqStartNotLowered(viewer: Viewer, key: string, value: unknown, now: Date, tx: DbOrTx): Promise<void> {
  const guard = seqStartGuardFor(key);
  if (!guard) return;
  const next = guard.seqStart.schema.parse(value);
  const counterValue = await guard.lockIssued(viewer, now, tx);
  const currentStart = await getSettingValue(guard.seqStart, undefined, {
    findSimpleValue: (v, k) => findSimpleValue(v, k, tx),
  });
  // 04-51 리뷰 B1 — 바꾸지 않은 값의 재저장(설정 화면 blur)은 낮추기가 아니므로 통과한다.
  if (counterValue >= 1 && next < currentStart) {
    throw new SeqStartOverlapError(`순번 시작값은 현재 값(${currentStart})보다 낮출 수 없음`);
  }
}

// 04-51 결정 ②(b) — 사용자 2026-09-28(PR #85 댓글 5861849715). 설정 화면의 비이력형 저장 한 곳 —
// 순번 시작값 키는 올해 카운터 발급이 1건 이상이고 새 시작값이 현재 시작값보다 작을 때만 거부한다.
// 같은 값·올리는 값은 통과한다(올려서 비는 번호는 수용). 표시 순번 = 카운터 + 시작값 − 1이라 낮춘
// 시작값만 이미 매긴 번호와 겹쳐 UNIQUE(format_key, number)로 등록이 실패한다. 거부 문구의 숫자는
// 현재 시작값(바꾸기 전 값)이다 — 사용자 2026-09-28(PR #85 댓글 5864259502 항목 1). 카운터 + 현재
// 시작값 − 1은 발급 뒤 시작값을 올린 적이 있으면 매긴 적 없는 번호라 문구에 쓰지 않는다.
// 리뷰 S1: 검증과 저장은 한 트랜잭션에서 채번과 같은 카운터 행 잠금을 잡고 한다(직렬화). 권한은 잠금
// 전에 판정한다 — 잠금 안에서 전역 풀을 쓰지 않고(04-32 규칙), 권한 없는 호출에는 현재 값을
// 알리지 않고 setSettingValue의 권한 거부로 끝낸다. 시작값 키가 아니면 setSettingValue 그대로다.
export async function setSimpleSettingValue(
  viewer: Viewer,
  def: SettingDef<unknown>,
  value: unknown,
  now: Date,
): Promise<void> {
  const guard = seqStartGuardFor(def.key);
  if (!guard || !(await can(viewer, "admin.settings", "write"))) return setSettingValue(viewer, def, value);
  const parsed = guard.seqStart.schema.safeParse(value);
  if (!parsed.success) return setSettingValue(viewer, def, value);

  await withTransaction(async (tx) => {
    await assertSeqStartNotLowered(viewer, def.key, parsed.data, now, tx);
    await setSettingValue(viewer, def, value, {
      can: () => Promise.resolve(true),
      upsertSimpleValue: (v, key, val, by) => upsertSimpleValue(v, key, val, by, tx),
      recordAction: (v, logEntry) => recordAction(v, logEntry, { tx }),
    });
  });
}

// 05-03 — 지출결의 번호 `{프로젝트 번호}{구분자}{순번}`(예 `26001-0004`, 사용자 결정 2026-09-26 #6). 카운터
// `expense`의 period가 연도가 아니라 프로젝트 번호다(docs/EXPENSES.md 「번호」). 순번 시작값은 documentNumberFormat과
// 같은 표시 오프셋이고, 자릿수를 넘친 순번은 자르지 않는다.
export type ExpenseNumberFormat = { separator: string; seqDigits: number; seqStart: number };

export function expenseNumberFormat(projectNumber: string, seq: number, format: ExpenseNumberFormat): string {
  const displaySeq = seq + format.seqStart - 1;
  return `${projectNumber}${format.separator}${String(displaySeq).padStart(format.seqDigits, "0")}`;
}

const EXPENSE_NUMBER_DEFS = [DOCUMENT_NUMBER_EXPENSE_SEPARATOR, DOCUMENT_NUMBER_EXPENSE_SEQ_DIGITS, DOCUMENT_NUMBER_EXPENSE_SEQ_START] as const;

// 세 키를 SELECT 한 번으로 — 트랜잭션 전에 부른다(잠근 tx 안 전역 풀 읽기 금지, 풀 소진 교착).
export async function loadExpenseNumberFormat(deps?: Parameters<typeof getSimpleSettingValues>[1]): Promise<ExpenseNumberFormat> {
  const [separator, seqDigits, seqStart] = await getSimpleSettingValues(EXPENSE_NUMBER_DEFS, deps);
  return {
    separator: separator ?? "-",
    seqDigits: seqDigits ?? 4,
    seqStart: seqStart ?? 1,
  };
}

// 제출 트랜잭션의 마지막 쓰기 — 카운터 `expense` · period = 프로젝트 번호. 순번 시작값은 allocateDocumentNumber처럼 카운터 행
// 잠금 뒤 같은 tx로 다시 읽는다(PR #162 리뷰 P1 — 시작값 저장이 같은 행 잠금 안에서 검증하므로 이 값과 카운터가 맞물린다).
export async function allocateExpenseNumber(
  viewer: Viewer,
  input: { projectNumber: string; format: Omit<ExpenseNumberFormat, "seqStart"> },
  tx: DbOrTx,
): Promise<{ number: string; seq: number }> {
  await shareLockDocumentCounter(viewer, "expense", ALL_PERIODS, tx);
  const seq = await repoAllocateNumber(viewer, "expense", input.projectNumber, tx);
  const seqStart = await getSettingValue(DOCUMENT_NUMBER_EXPENSE_SEQ_START, undefined, {
    findSimpleValue: (v, k) => findSimpleValue(v, k, tx),
  });
  return { number: expenseNumberFormat(input.projectNumber, seq, { ...input.format, seqStart }), seq };
}

// 06-02 — 구매 요청 번호(프로젝트 요청) `{프로젝트 번호}{구분자}{접두어}{순번}`(예 `26001-C0001`). 카운터 `purchase_request`의
// period가 프로젝트 번호다(지출결의 번호와 같은 꼴). 순번 시작값은 표시 오프셋이고, 자릿수를 넘친 순번은 자르지 않는다.
export type PurchaseRequestNumberFormat = { prefix: string; separator: string; seqDigits: number; seqStart: number };

export function purchaseRequestNumberFormat(projectNumber: string, seq: number, format: PurchaseRequestNumberFormat): string {
  const displaySeq = seq + format.seqStart - 1;
  return `${projectNumber}${format.separator}${format.prefix}${String(displaySeq).padStart(format.seqDigits, "0")}`;
}

const PURCHASE_REQUEST_NUMBER_DEFS = [
  DOCUMENT_NUMBER_PURCHASE_REQUEST_PREFIX,
  DOCUMENT_NUMBER_PURCHASE_REQUEST_SEPARATOR,
  DOCUMENT_NUMBER_PURCHASE_REQUEST_SEQ_DIGITS,
  DOCUMENT_NUMBER_PURCHASE_REQUEST_SEQ_START,
] as const;

// 네 키를 SELECT 한 번으로 — 트랜잭션 전에 부른다(잠근 tx 안 전역 풀 읽기 금지, 풀 소진 교착).
export async function loadPurchaseRequestNumberFormat(deps?: Parameters<typeof getSimpleSettingValues>[1]): Promise<PurchaseRequestNumberFormat> {
  const [prefix, separator, seqDigits, seqStart] = await getSimpleSettingValues(PURCHASE_REQUEST_NUMBER_DEFS, deps);
  return {
    prefix: prefix ?? "C",
    separator: separator ?? "-",
    seqDigits: seqDigits ?? 4,
    seqStart: seqStart ?? 1,
  };
}

// 구매 요청 문서 INSERT와 같은 트랜잭션 안에서 부른다 — `allocateExpenseNumber`와 같은 세 단계(공유 잠금판 → 카운터 증가 → 시작값만 같은
// tx로 다시 읽기, PR #162 리뷰 P1). 접두어 · 구분자 · 자릿수는 호출자가 트랜잭션 전에 읽어 넘긴 `format`만 쓴다(전역 풀로 읽지 않는다).
export async function allocatePurchaseRequestNumber(
  viewer: Viewer,
  input: { projectNumber: string; format: Omit<PurchaseRequestNumberFormat, "seqStart"> },
  tx: DbOrTx,
): Promise<{ number: string; seq: number }> {
  await shareLockDocumentCounter(viewer, "purchase_request", ALL_PERIODS, tx);
  const seq = await repoAllocateNumber(viewer, "purchase_request", input.projectNumber, tx);
  const seqStart = await getSettingValue(DOCUMENT_NUMBER_PURCHASE_REQUEST_SEQ_START, undefined, {
    findSimpleValue: (v, k) => findSimpleValue(v, k, tx),
  });
  return { number: purchaseRequestNumberFormat(input.projectNumber, seq, { ...input.format, seqStart }), seq };
}
