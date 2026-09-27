import type { Viewer } from "@/domain/viewer";
import {
  allocateNumber as repoAllocateNumber,
  lockDocumentCounter,
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
} from "@/domain/settings/keys";

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
export async function allocateDocumentNumber(
  viewer: Viewer,
  input: { counterKey: string; year: number; format: DocumentNumberFormat },
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

// 04-51 결정 ②(a) — 사용자 답 2026-09-24(설정 검증). 설정 화면의 비이력형 저장 한 곳 — 순번 시작값
// 키는 올해 이미 매긴 최대 표시 순번 이하이면 거부한다. 표시 순번 = 카운터 + 시작값 − 1이라 낮춘
// 시작값은 언젠가 이미 매긴 번호와 겹쳐 UNIQUE(format_key, number)로 등록이 실패한다. 최대는 카운터
// 행과 현재 시작값으로 계산한다 — 시작값이 이 검증을 거쳐 바뀌어 왔다면 실제 최대와 같거나 크다.
// 리뷰 S1: 검증과 저장은 한 트랜잭션에서 채번과 같은 카운터 행 잠금을 잡고 한다(직렬화). 권한은 잠금
// 전에 판정한다 — 잠금 안에서 전역 풀을 쓰지 않고(04-32 규칙), 권한 없는 호출에는 최대 번호를
// 알리지 않고 setSettingValue의 권한 거부로 끝낸다. 시작값 키가 아니면 setSettingValue 그대로다.
export async function setSimpleSettingValue(
  viewer: Viewer,
  def: SettingDef<unknown>,
  value: unknown,
  now: Date,
): Promise<void> {
  const entry = Object.entries(DOCUMENT_NUMBER_FORMAT_DEFS).find(([, defs]) => defs.seqStart.key === def.key);
  if (!entry || !(await can(viewer, "admin.settings", "write"))) return setSettingValue(viewer, def, value);
  const [counterKey, defs] = entry;
  const parsed = defs.seqStart.schema.safeParse(value);
  if (!parsed.success) return setSettingValue(viewer, def, value);

  await withTransaction(async (tx) => {
    const counterValue = await lockDocumentCounter(viewer, counterKey, String(kstYear(now)), tx);
    const currentStart = await getSettingValue(defs.seqStart, undefined, {
      findSimpleValue: (v, k) => findSimpleValue(v, k, tx),
    });
    // 04-51 리뷰 B1 — 바꾸지 않은 값의 재저장(설정 화면 blur)은 검증하지 않는다.
    if (counterValue >= 1 && parsed.data !== currentStart) {
      const maxIssued = counterValue + currentStart - 1;
      if (parsed.data <= maxIssued) {
        throw new SeqStartOverlapError(`순번 시작값이 이미 매긴 번호(${maxIssued})와 겹침 · ${maxIssued + 1} 이상 입력`);
      }
    }
    await setSettingValue(viewer, def, value, {
      can: () => Promise.resolve(true),
      upsertSimpleValue: (v, key, val, by) => upsertSimpleValue(v, key, val, by, tx),
      recordAction: (v, logEntry) => recordAction(v, logEntry, { tx }),
    });
  });
}
