// 06.1-06(E34 · RP-5): 붙일 문서 후보 점수 · 순위 — 순수 함수. 화면 경로의 순위는 리포지토리 SQL(`listExpenseAttachCandidates` ·
// `listPurchaseRequestAttachCandidates`)의 `ORDER BY`가 매기고, 이 파일은 그 순서의 단위 기준(통합 테스트가 같은 행으로 대조)과
// 두 질의 결과를 합칠 때의 비교 열쇠다. 금액은 같음 판정만 한다 — 산술 없음(D-6520).

export type CandidateRecordFacts = {
  evidenceType: string;
  businessNoDigits: string | null;
  supplyKrw: number;
  totalKrw: number;
  /** 서울 날짜 `YYYY-MM-DD`. */
  issuedOn: string;
};

export type CandidateDocFacts = {
  kind: "expense" | "purchase_request";
  id: string;
  /** 지출결의 증빙 종류 칸(구매 요청은 칸이 없어 null). */
  evidenceType: string | null;
  /** 거래처 사업자번호(어떤 꼴이든 — 숫자만 견준다). */
  businessNo: string | null;
  /** 지출결의 = 공급가액(`supply_amount_krw`), 구매 요청 = 견적 원화. */
  amountKrw: number | null;
  /** 지출결의 사용일 · 구매 요청 요청일(서울 날짜). 없으면 맨 뒤. */
  date: string | null;
  /** 지급 방식 ↔ 기록 종류 짝(G3 — 첫 정렬 키). 구매 요청은 늘 참. */
  pairOk: boolean;
};

export type RankedCandidate<T extends CandidateDocFacts = CandidateDocFacts> = T & { score: number; dayGap: number | null };

const digitsOf = (value: string | null): string => (value ?? "").replace(/[^0-9]/g, "");

export function scoreCandidate(record: CandidateRecordFacts, doc: CandidateDocFacts): number {
  const recordDigits = digitsOf(record.businessNoDigits);
  const kind = doc.evidenceType !== null && doc.evidenceType === record.evidenceType ? 4 : 0;
  const business = recordDigits !== "" && recordDigits === digitsOf(doc.businessNo) ? 2 : 0;
  const recordAmount = doc.kind === "expense" ? record.supplyKrw : record.totalKrw;
  const amount = doc.amountKrw !== null && doc.amountKrw === recordAmount ? 1 : 0;
  return kind + business + amount;
}

// 달력 날짜끼리의 일 수 차이(시각 · 시간대 없음 — 둘 다 서울 날짜 글자다).
function dayNumber(ymd: string): number {
  const [year, month, day] = ymd.split("-").map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

export function dayGapOf(record: CandidateRecordFacts, doc: CandidateDocFacts): number | null {
  return doc.date === null ? null : Math.abs(dayNumber(doc.date) - dayNumber(record.issuedOn));
}

// 짝 맞음 먼저 → 점수 내림 → 날짜 차 오름(없음 맨 뒤) → id. SQL `ORDER BY`와 같은 열쇠다.
export function compareCandidates(left: RankedCandidate, right: RankedCandidate): number {
  if (left.pairOk !== right.pairOk) return left.pairOk ? -1 : 1;
  if (left.score !== right.score) return right.score - left.score;
  if (left.dayGap !== right.dayGap) {
    if (left.dayGap === null) return 1;
    if (right.dayGap === null) return -1;
    return left.dayGap - right.dayGap;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function rankCandidates<T extends CandidateDocFacts>(record: CandidateRecordFacts, docs: readonly T[]): RankedCandidate<T>[] {
  return docs.map((doc) => ({ ...doc, score: scoreCandidate(record, doc), dayGap: dayGapOf(record, doc) })).sort(compareCandidates);
}

// 06.1-08(E34): 문서 하나에 붙일 증빙 목록의 순위 — 위 점수 · 열쇠를 방향만 바꿔 그대로 쓴다(새 가중치 없음). 화면 경로의 순위는
// repositories/evidence-pool.ts SQL `ORDER BY`가 매기고, 이 함수는 그 순서의 단위 기준(통합 테스트가 같은 행으로 대조)이다.
export type PoolRecordFacts = CandidateRecordFacts & { id: string; pairOk: boolean };

export type PoolDocFacts = Pick<CandidateDocFacts, "kind" | "evidenceType" | "businessNo" | "amountKrw" | "date">;

export function rankRecordsForDocument<T extends PoolRecordFacts>(doc: PoolDocFacts, records: readonly T[]): (T & { score: number; dayGap: number | null })[] {
  const ranked = records.map((record) => {
    const asDoc: CandidateDocFacts = { ...doc, id: record.id, pairOk: record.pairOk };
    return { record, key: { ...asDoc, score: scoreCandidate(record, asDoc), dayGap: dayGapOf(record, asDoc) } };
  });
  ranked.sort((left, right) => compareCandidates(left.key, right.key));
  return ranked.map(({ record, key }) => ({ ...record, score: key.score, dayGap: key.dayGap }));
}
