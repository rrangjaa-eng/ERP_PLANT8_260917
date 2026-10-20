import { describe, expect, it } from "vitest";
import { fileWinsPatch, overwriteBlockReason, planReconcile, relaxedCandidatesOf, type ReconcileCandidate, type ReconcileLine, type RelaxedCandidateInput } from "@/domain/evidence-records/reconcile";

// 06.1-09(EVID-10 · E28 · PA-1TO1 · PA-STEP1 · D-6111 · 카드 R3 · P2-C4): 카드 대사 계획 — 순수 함수(DB 없음).
// 1단계 = 같은 카드사 · 같은 승인번호 · 같은 사용일(카드 무관) · 카드 명세 안 붙음 · 합계 음수 아님, 2단계 = 같은 카드 · 사용일 · 합계 · 증빙 없음.

const CARD_A = "00000000-0000-4000-8000-00000000000a";
const CARD_B = "00000000-0000-4000-8000-00000000000b";

function line(patch: Partial<ReconcileLine> = {}): ReconcileLine {
  return { recordId: "r1", corpCardId: CARD_A, approvalNo: "44403241", usedOn: "2026-04-30", totalKrw: 204_100, needsCheck: null, ...patch };
}

function usage(patch: Partial<ReconcileCandidate> = {}): ReconcileCandidate {
  return {
    id: "u1",
    version: 3,
    corpCardId: CARD_A,
    sameIssuer: true,
    approvalNo: null,
    usedOn: "2026-04-30",
    totalKrw: 204_100,
    hasEvidence: false,
    cardStatementAttached: false,
    ...patch,
  };
}

describe("planReconcile — 1단계(카드사 · 승인번호 · 사용일)", () => {
  it("같은 카드사 · 같은 승인번호 카드 사용 하나 → 1단계 짝(카드가 달라도 — E28)", () => {
    const plan = planReconcile([line()], [usage({ approvalNo: "44403241", corpCardId: CARD_B, totalKrw: 200_000 })]);
    expect(plan.matches).toEqual([{ recordId: "r1", usageId: "u1", step: 1, version: 3 }]);
    expect(plan.unmatched).toEqual([]);
  });

  it("승인번호 같고 카드사 다름 → 1단계 아님(합계 · 카드가 같으면 2단계는 될 수 있다 — 여기는 카드 다름이라 짝 없음)", () => {
    const plan = planReconcile([line()], [usage({ approvalNo: "44403241", sameIssuer: false, corpCardId: CARD_B })]);
    expect(plan.matches).toEqual([]);
    expect(plan.unmatched).toEqual(["r1"]);
  });

  it("(P1-5 · N-6) 카드 서식 기록이 붙은 후보 → 승인번호가 같아도 1단계 아님", () => {
    const plan = planReconcile([line()], [usage({ approvalNo: "44403241", cardStatementAttached: true, hasEvidence: true })]);
    expect(plan.matches).toEqual([]);
  });

  it("(N-6) 영수증 기록만 붙은 후보 · 05 전표 파일만 있는 후보 → 1단계 짝(2단계는 아님 — 증빙 있음)", () => {
    const withApproval = planReconcile([line()], [usage({ approvalNo: "44403241", hasEvidence: true })]);
    expect(withApproval.matches).toEqual([{ recordId: "r1", usageId: "u1", step: 1, version: 3 }]);
    const withoutApproval = planReconcile([line()], [usage({ hasEvidence: true })]);
    expect(withoutApproval.matches).toEqual([]);
  });

  it("(N-7) 카드사 · 승인번호 같고 사용일 다름(다른 달) → 1단계 아님 · 2단계도 아님", () => {
    const plan = planReconcile([line()], [usage({ approvalNo: "44403241", usedOn: "2026-03-30" })]);
    expect(plan.matches).toEqual([]);
    expect(plan.unmatched).toEqual(["r1"]);
  });

  it("합계 음수 후보 → 1단계 아님", () => {
    const plan = planReconcile([line()], [usage({ approvalNo: "44403241", totalKrw: -204_100, corpCardId: CARD_B })]);
    expect(plan.matches).toEqual([]);
  });

  it("한 카드 사용이 두 줄의 짝 후보가 되면 1단계 쪽만", () => {
    const plan = planReconcile(
      [line({ recordId: "r1", approvalNo: "44403241" }), line({ recordId: "r2", approvalNo: "55500001" })],
      [usage({ approvalNo: "44403241" })],
    );
    expect(plan.matches).toEqual([{ recordId: "r1", usageId: "u1", step: 1, version: 3 }]);
    expect(plan.unmatched).toEqual(["r2"]);
  });
});

describe("planReconcile — 2단계(카드 · 사용일 · 합계 · 증빙 없음 · 일대일)", () => {
  it("승인번호 없음 + 카드 · 날짜 · 합계 같은 후보 하나 → 2단계 짝", () => {
    const plan = planReconcile([line({ approvalNo: null })], [usage()]);
    expect(plan.matches).toEqual([{ recordId: "r1", usageId: "u1", step: 2, version: 3 }]);
  });

  it("후보 둘 → 짝 없음(3단계 사람이 고름)", () => {
    const plan = planReconcile([line({ approvalNo: null })], [usage({ id: "u1" }), usage({ id: "u2" })]);
    expect(plan.matches).toEqual([]);
    expect(plan.unmatched).toEqual(["r1"]);
  });

  it("같은 파일 같은 카드 · 날짜 · 합계 줄 둘 → 둘 다 짝 없음", () => {
    const plan = planReconcile([line({ recordId: "r1", approvalNo: null }), line({ recordId: "r2", approvalNo: "66600001" })], [usage()]);
    expect(plan.matches).toEqual([]);
    expect(plan.unmatched.sort()).toEqual(["r1", "r2"]);
  });

  it("증빙 있음 후보 → 2단계 아님", () => {
    const plan = planReconcile([line({ approvalNo: null })], [usage({ hasEvidence: true })]);
    expect(plan.matches).toEqual([]);
  });

  it("음수 · 카드 미등록 줄 → 대상 아님", () => {
    const plan = planReconcile([line({ recordId: "neg", totalKrw: -204_100 }), line({ recordId: "unknown", corpCardId: null })], [usage({ totalKrw: -204_100 }), usage({ id: "u2" })]);
    expect(plan.matches).toEqual([]);
    expect(plan.unmatched.sort()).toEqual(["neg", "unknown"]);
  });

  it("needsCheck 줄 → 후보가 하나여도 1 · 2단계 아님", () => {
    const step1 = planReconcile([line({ needsCheck: "취소 표시 · 원거래 확인" })], [usage({ approvalNo: "44403241" })]);
    const step2 = planReconcile([line({ approvalNo: null, needsCheck: "해외 이용 · 원화 확인" })], [usage()]);
    expect(step1.matches).toEqual([]);
    expect(step2.matches).toEqual([]);
  });

  it("후보에 다른 승인번호가 이미 차 있으면 2단계 아님", () => {
    const plan = planReconcile([line({ approvalNo: "44403241" })], [usage({ approvalNo: "77700001", sameIssuer: true })]);
    expect(plan.matches).toEqual([]);
  });
});

describe("fileWinsPatch — 파일이 카드 사용 합계 · 카드를 정한다(D-6111)", () => {
  const stored = { totalKrw: 204_100, corpCardId: CARD_A, cardLast4: "2222" };

  it("합계 · 카드가 같으면 승인번호만", () => {
    expect(fileWinsPatch(stored, { totalKrw: 204_100, corpCardId: CARD_A, cardLast4: "2222", approvalNo: "44403241" })).toEqual({ approvalNo: "44403241", total: null, card: null });
  });

  it("합계 다름 → 새 합계 + 전 · 후", () => {
    expect(fileWinsPatch(stored, { totalKrw: 200_000, corpCardId: CARD_A, cardLast4: "2222", approvalNo: "1" }).total).toEqual({ before: 204_100, after: 200_000 });
  });

  it("카드 다름 → 새 카드 + 카드 끝 4자리 전 · 후", () => {
    expect(fileWinsPatch(stored, { totalKrw: 204_100, corpCardId: CARD_B, cardLast4: "5678", approvalNo: "1" }).card).toEqual({
      before: { id: CARD_A, last4: "2222" },
      after: { id: CARD_B, last4: "5678" },
    });
  });
});

describe("overwriteBlockReason — 덮기 막힘 글자(카드 R3 · P2-C4)", () => {
  const totalPatch = { approvalNo: "1", total: { before: 204_100, after: 1_238_000 }, card: null };
  const cardPatch = { approvalNo: "1", total: null, card: { before: { id: CARD_A, last4: "1234" }, after: { id: CARD_B, last4: "5678" } } };

  it("합계 바뀜 + cap → `합계 {a} → {b} · 실행가 초과`", () => {
    expect(overwriteBlockReason(totalPatch, "cap")).toBe("합계 204,100 → 1,238,000 · 실행가 초과");
  });

  it("카드만 바뀜 + completed → `카드 {a} → {b} · 완료 프로젝트`", () => {
    expect(overwriteBlockReason(cardPatch, "completed")).toBe("카드 1234 → 5678 · 완료 프로젝트");
  });

  it("fixed → `… · 연결 고정`", () => {
    expect(overwriteBlockReason(totalPatch, "fixed")).toBe("합계 204,100 → 1,238,000 · 연결 고정");
  });

  it("holder → `카드 {a} → {b} · 보유자 다름`", () => {
    expect(overwriteBlockReason({ ...cardPatch, total: totalPatch.total }, "holder")).toBe("카드 1234 → 5678 · 보유자 다름");
  });

  it("승인번호만인 패치 → null", () => {
    expect(overwriteBlockReason({ approvalNo: "1", total: null, card: null }, "cap")).toBeNull();
  });
});

describe("relaxedCandidatesOf — 3단계 사람 고르기 후보(PA-RELAX · DB-9 · N-6 · 카드 R3)", () => {
  const card = { id: CARD_A, last4: "1111" };
  const relaxLine = { corpCardId: CARD_A, cardLast4: "1111", approvalNo: "44403241", usedOn: "2026-04-30", totalKrw: 204_100 };
  function cand(patch: Partial<RelaxedCandidateInput> = {}): RelaxedCandidateInput {
    return { id: "u1", number: "K-26-0001", corpCardId: card.id, cardLast4: card.last4, sameIssuer: true, approvalNo: null, usedOn: "2026-04-30", totalKrw: 204_100, cardStatementAttached: false, overwriteBlock: null, ...patch };
  }

  it("같은 카드사 · 같은 승인번호면 사용일이 달라도 후보(N-7) · 같은 사용일 · 합계면 승인번호 없어도 후보 · 둘 다 아니면 빠진다", () => {
    const result = relaxedCandidatesOf(relaxLine, [
      cand({ id: "a", approvalNo: "44403241", usedOn: "2026-04-01", totalKrw: 1 }),
      cand({ id: "b" }),
      cand({ id: "c", usedOn: "2026-04-29" }),
    ]);
    expect(result.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("합계가 다르면 patch.total · 카드가 다르면 patch.card(같은 카드사) — 고를 수 있는 행", () => {
    const [item] = relaxedCandidatesOf(relaxLine, [cand({ approvalNo: "44403241", totalKrw: 200_000, corpCardId: CARD_B, cardLast4: "2222" })]);
    expect(item?.blockedReason).toBeNull();
    expect(item?.patch.total).toEqual({ before: 200_000, after: 204_100 });
    expect(item?.patch.card?.before.last4).toBe("2222");
  });

  it("막힌 이유 — 카드 명세 붙음 `증빙 있음 · {번호}` · 다른 카드사 `카드 다름 · {끝 4자리}` · 덮기 막힘 글자, 막힌 행은 맨 뒤", () => {
    const result = relaxedCandidatesOf(relaxLine, [
      cand({ id: "x", cardStatementAttached: true }),
      cand({ id: "y", sameIssuer: false, cardLast4: "9999" }),
      cand({ id: "z", approvalNo: "44403241", totalKrw: 200_000, overwriteBlock: "cap" }),
      cand({ id: "ok" }),
    ]);
    expect(result.map((item) => [item.id, item.blockedReason])).toEqual([
      ["ok", null],
      ["x", "증빙 있음 · K-26-0001"],
      ["y", "카드 다름 · 9999"],
      ["z", "합계 200,000 → 204,100 · 실행가 초과"],
    ]);
  });

  it("(N-6) 영수증 · 05 전표 파일만 있는 카드 사용(카드 명세 아님)은 고를 수 있다 — 덮을 값 없는 막힘 종류는 막지 않는다", () => {
    const [item] = relaxedCandidatesOf(relaxLine, [cand({ overwriteBlock: "completed" })]);
    expect(item?.blockedReason).toBeNull();
  });
});
