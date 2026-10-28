import { describe, expect, it } from "vitest";
import { rankCandidates, rankRecordsForDocument, scoreCandidate, type CandidateDocFacts, type CandidateRecordFacts, type PoolRecordFacts } from "@/domain/evidence-records/score";

// 06.1-06(E34 · RP-5): 붙일 문서 후보 점수 — 순수 함수(DB 없음). 화면 경로는 SQL `ORDER BY`가 순위를 매기고, 이 함수는 그 순서의 단위 기준이다.
// 종류 같음 4 · 사업자번호 숫자 같음 2(빈 값끼리 0) · 금액 같음 1(지출결의 = 기록 공급가 ↔ 문서 공급가액, 구매 요청 = 기록 합계 ↔ 견적 원화 — D-6520).

const RECORD: CandidateRecordFacts = { evidenceType: "tax_invoice", businessNoDigits: "1234567890", supplyKrw: 1_000_000, totalKrw: 1_100_000, issuedOn: "2026-09-20" };

function expense(patch: Partial<CandidateDocFacts> = {}): CandidateDocFacts {
  return {
    kind: "expense",
    id: "00000000-0000-4000-8000-000000000001",
    evidenceType: "tax_invoice",
    businessNo: "123-45-67890",
    amountKrw: 1_000_000,
    date: "2026-09-20",
    pairOk: true,
    ...patch,
  };
}

describe("scoreCandidate (06.1-06 E34)", () => {
  it("종류 같음 + 사업자번호 숫자 같음(하이픈 무시) + 금액 같음 → 7", () => {
    expect(scoreCandidate(RECORD, expense())).toBe(7);
  });

  it("사업자번호가 둘 다 빈 값이면 그 몫 0", () => {
    expect(scoreCandidate({ ...RECORD, businessNoDigits: null }, expense({ businessNo: null }))).toBe(5);
    expect(scoreCandidate({ ...RECORD, businessNoDigits: null }, expense({ businessNo: "" }))).toBe(5);
  });

  it("금액만 다르면 6", () => {
    expect(scoreCandidate(RECORD, expense({ amountKrw: 999_999 }))).toBe(6);
  });

  it("구매 요청은 기록 합계 ↔ 견적 원화로 잰다(종류 · 사업자번호 칸 없음)", () => {
    const request = expense({ kind: "purchase_request", evidenceType: null, businessNo: null, amountKrw: 1_100_000 });
    expect(scoreCandidate(RECORD, request)).toBe(1);
    expect(scoreCandidate(RECORD, { ...request, amountKrw: 1_000_000 })).toBe(0);
  });
});

describe("rankCandidates (06.1-06 E34 · G3)", () => {
  it("점수가 같으면 날짜 차이 작은 순 → id 순 · 날짜 없음은 맨 뒤", () => {
    const far = expense({ id: "00000000-0000-4000-8000-00000000000a", date: "2026-09-01" });
    const near = expense({ id: "00000000-0000-4000-8000-00000000000b", date: "2026-09-21" });
    const nearSameGapLowerId = expense({ id: "00000000-0000-4000-8000-000000000002", date: "2026-09-19" });
    const noDate = expense({ id: "00000000-0000-4000-8000-000000000003", date: null });
    expect(rankCandidates(RECORD, [noDate, far, near, nearSameGapLowerId]).map((row) => row.id)).toEqual([nearSameGapLowerId.id, near.id, far.id, noDate.id]);
  });

  it("짝 맞음이 첫 키 — 점수가 높아도 짝 아닌 문서는 뒤로", () => {
    const blocked = expense({ id: "00000000-0000-4000-8000-000000000004", pairOk: false });
    const pairedLow = expense({ id: "00000000-0000-4000-8000-000000000005", evidenceType: "card", amountKrw: 1 });
    expect(rankCandidates(RECORD, [blocked, pairedLow]).map((row) => row.id)).toEqual([pairedLow.id, blocked.id]);
  });

  it("점수 높은 순이 날짜보다 먼저", () => {
    const exact = expense({ id: "00000000-0000-4000-8000-000000000006", date: "2026-08-01" });
    const looser = expense({ id: "00000000-0000-4000-8000-000000000007", amountKrw: 5, date: "2026-09-20" });
    const ranked = rankCandidates(RECORD, [looser, exact]);
    expect(ranked.map((row) => row.id)).toEqual([exact.id, looser.id]);
    expect(ranked.map((row) => row.score)).toEqual([7, 6]);
  });
});

// 06.1-08(E34 · G3): 문서 하나에 붙일 증빙 순위 — 방향만 반대(기록 목록 ↔ 문서 사실 하나), 점수 · 열쇠는 06.1-06 그대로.
describe("rankRecordsForDocument (06.1-08 E34 · G3)", () => {
  const doc = { kind: "expense" as const, evidenceType: "tax_invoice", businessNo: "123-45-67890", amountKrw: 1_000_000, date: "2026-09-20" };
  function record(patch: Partial<PoolRecordFacts> = {}): PoolRecordFacts {
    return { id: "00000000-0000-4000-8000-000000000001", evidenceType: "tax_invoice", businessNoDigits: "1234567890", supplyKrw: 1_000_000, totalKrw: 1_100_000, issuedOn: "2026-09-20", pairOk: true, ...patch };
  }

  it("짝 맞음 먼저 — 점수가 낮아도 짝 아닌 행(점수 높음)보다 앞이다", () => {
    const mismatched = record({ id: "00000000-0000-4000-8000-00000000000a", pairOk: false });
    const paired = record({ id: "00000000-0000-4000-8000-00000000000b", pairOk: true, evidenceType: "cash_receipt", businessNoDigits: null, supplyKrw: 5 });
    expect(rankRecordsForDocument(doc, [mismatched, paired]).map((row) => row.id)).toEqual([paired.id, mismatched.id]);
  });

  it("점수 내림 → 날짜 차 오름(없음 맨 뒤 아님 — 기록 날짜는 늘 있다) → id", () => {
    const high = record({ id: "00000000-0000-4000-8000-00000000000c" });
    const low = record({ id: "00000000-0000-4000-8000-00000000000d", supplyKrw: 1, issuedOn: "2026-09-10" });
    const nearer = record({ id: "00000000-0000-4000-8000-00000000000e", supplyKrw: 1, issuedOn: "2026-09-19" });
    const ranked = rankRecordsForDocument(doc, [low, nearer, high]);
    expect(ranked.map((row) => row.id)).toEqual([high.id, nearer.id, low.id]);
    expect(ranked[0]?.score).toBe(7);
  });

  it("구매 요청 문서는 기록 합계 ↔ 견적 원화로 잰다(종류 · 사업자번호 칸 없음)", () => {
    const request = { kind: "purchase_request" as const, evidenceType: null, businessNo: null, amountKrw: 1_100_000, date: "2026-09-20" };
    const match = record({ id: "00000000-0000-4000-8000-00000000000f" });
    const other = record({ id: "00000000-0000-4000-8000-000000000010", totalKrw: 1 });
    expect(rankRecordsForDocument(request, [other, match]).map((row) => [row.id, row.score])).toEqual([[match.id, 1], [other.id, 0]]);
  });

  // 07.1-09(D-7124): 같은 종류 거름은 저장소 WHERE(후보 집합)가 하고 점수는 검색 결과 순서만 정한다 — 검색에서 같은 종류가 위, 거른 뒤 순서는 그대로.
  it("검색 결과 정렬 — 같은 종류가 다른 종류 위 · 같은 종류만 남겨도 상대 순서는 같다", () => {
    const same = record({ id: "00000000-0000-4000-8000-000000000011", businessNoDigits: null, supplyKrw: 1 });
    const other = record({ id: "00000000-0000-4000-8000-000000000012", evidenceType: "card_receipt", businessNoDigits: "1234567890", supplyKrw: 1_000_000 });
    const sameLater = record({ id: "00000000-0000-4000-8000-000000000013", businessNoDigits: null, supplyKrw: 1, issuedOn: "2026-09-01" });
    const all = rankRecordsForDocument(doc, [other, sameLater, same]);
    expect(all.map((row) => row.id)).toEqual([same.id, sameLater.id, other.id]);
    const filtered = rankRecordsForDocument(doc, [sameLater, same]);
    expect(filtered.map((row) => row.id)).toEqual(all.filter((row) => row.id !== other.id).map((row) => row.id));
  });
});
