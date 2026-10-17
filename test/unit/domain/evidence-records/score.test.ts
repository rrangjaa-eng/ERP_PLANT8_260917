import { describe, expect, it } from "vitest";
import { rankCandidates, scoreCandidate, type CandidateDocFacts, type CandidateRecordFacts } from "@/domain/evidence-records/score";

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
