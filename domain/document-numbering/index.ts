import type { Viewer } from "@/domain/viewer";
import { allocateNumber as repoAllocateNumber, type DbOrTx } from "@/repositories/document-counters";
import { getSettingValue, type SettingDef } from "@/domain/settings/registry";
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
  return { number: documentNumberFormat({ year: input.year, seq }, input.format), seq };
}
