import type { Viewer } from "@/domain/viewer";
import { allocateNumber as repoAllocateNumber, type DbOrTx } from "@/repositories/document-counters";

// Phase 4 Task 1 ②·Task 2 ⑦ — 문서 번호 부여: 트랜잭션 안 카운터 증가 +
// 서식 조립. `counter_key = "project"`, `period` = 서기 연도 네 자리 문자열
// (예: "2026") — 04-RESEARCH.md Open Question 1이 지적한 `period`의 뜻을
// 여기서 고정한다. 지출결의 번호(Phase 5)는 같은 표의 다른 counterKey를
// 쓴다. 연도가 바뀌면 period가 바뀌어 순번이 1부터 다시 시작한다.

// 프로젝트 번호 = 연도 뒤 두 자리 + 세 자리 순번(`26001`). 서식 값은 이
// 플랜에서 상수이고, 설정 키로 옮기는 것은 04-05(ADMN-09).
export function formatDocumentNumber(counterKey: string, year: number, seq: number): string {
  void counterKey;
  const yearSuffix = String(year % 100).padStart(2, "0");
  const seqSuffix = String(seq).padStart(3, "0");
  return `${yearSuffix}${seqSuffix}`;
}

// **반드시 문서 INSERT와 같은 트랜잭션 안에서 불린다** — 별도 트랜잭션으로
// 번호만 먼저 커밋하지 않는다(04-RESEARCH.md Anti-Patterns). 호출자가
// `db.transaction(async (tx) => { ... allocateDocumentNumber(viewer, {...}, tx) ... })`
// 안에서 부른다.
export async function allocateDocumentNumber(
  viewer: Viewer,
  input: { counterKey: string; year: number },
  tx?: DbOrTx,
): Promise<{ number: string; seq: number }> {
  const period = String(input.year);
  const seq = tx
    ? await repoAllocateNumber(viewer, input.counterKey, period, tx)
    : await repoAllocateNumber(viewer, input.counterKey, period);
  return { number: formatDocumentNumber(input.counterKey, input.year, seq), seq };
}
