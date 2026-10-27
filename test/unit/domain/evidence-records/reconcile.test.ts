import { describe, expect, it } from "vitest";
import { fileWinsPatch, overwriteBlockReason, planReconcile, relaxedCandidatesOf, USED_ON_GAP_MAX_DAYS, usedOnGapReason, type ReconcileCandidate, type ReconcileLine, type RelaxedCandidateInput } from "@/domain/evidence-records/reconcile";

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
    expect(fileWinsPatch(stored, { totalKrw: 204_100, corpCardId: CARD_A, cardLast4: "2222", approvalNo: "44403241" })).toEqual({ approvalNo: "44403241", total: null, card: null, usedOn: null });
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

  // 07.1-04 D-7104 · PE3: 승인번호 같음 붙임은 사용일도 명세 날짜로 덮는다 — 두 쪽 사용일을 다 받았고 다를 때만.
  it("(D-7104) 사용일 다름 → usedOn 전 · 후 + 합계 전 · 후", () => {
    const patch = fileWinsPatch({ ...stored, totalKrw: 50_000, usedOn: "2026-10-01" }, { totalKrw: 52_000, corpCardId: CARD_A, cardLast4: "2222", approvalNo: "A1", usedOn: "2026-10-03" });
    expect(patch.usedOn).toEqual({ before: "2026-10-01", after: "2026-10-03" });
    expect(patch.total).toEqual({ before: 50_000, after: 52_000 });
  });

  it("(D-7104) 사용일이 같거나 어느 한쪽이 사용일을 넘기지 않으면 usedOn null(작성자 갈래 호출부 그대로)", () => {
    expect(fileWinsPatch({ ...stored, usedOn: "2026-10-01" }, { totalKrw: 204_100, corpCardId: CARD_A, cardLast4: "2222", approvalNo: "A1", usedOn: "2026-10-01" }).usedOn).toBeNull();
    expect(fileWinsPatch(stored, { totalKrw: 204_100, corpCardId: CARD_A, cardLast4: "2222", approvalNo: "A1", usedOn: "2026-10-03" }).usedOn).toBeNull();
    expect(fileWinsPatch({ ...stored, usedOn: "2026-10-01" }, { totalKrw: 204_100, corpCardId: CARD_A, cardLast4: "2222", approvalNo: "A1" }).usedOn).toBeNull();
  });

  it("(PE2) 승인번호가 이미 있는 카드 사용에 다른 승인번호 줄 → approvalNo 덮기 대상 아님 · 비었으면 줄 승인번호 · 넘기지 않으면 지금 뜻", () => {
    const line = { totalKrw: 204_100, corpCardId: CARD_A, cardLast4: "2222", approvalNo: "B2" };
    expect(fileWinsPatch({ ...stored, approvalNo: "A1" }, line).approvalNo).toBeNull();
    expect(fileWinsPatch({ ...stored, approvalNo: null }, line).approvalNo).toBe("B2");
    expect(fileWinsPatch(stored, line).approvalNo).toBe("B2");
  });
});

describe("usedOnGapReason — 사용일 차 31일 한도(07.1-04 D-E1)", () => {
  const patchOf = (before: string, after: string) => ({ approvalNo: null, total: null, card: null, usedOn: { before, after } });

  it("한도는 31일", () => {
    expect(USED_ON_GAP_MAX_DAYS).toBe(31);
  });

  it("31일까지는 null · 32일이면 `날짜 다름 · 32일` · 해 넘김은 달력 일 수 차 · 거꾸로도 같다", () => {
    expect(usedOnGapReason(patchOf("2026-10-01", "2026-11-01"))).toBeNull();
    expect(usedOnGapReason(patchOf("2026-10-01", "2026-11-02"))).toBe("날짜 다름 · 32일");
    expect(usedOnGapReason(patchOf("2026-12-20", "2027-01-25"))).toBe("날짜 다름 · 36일");
    expect(usedOnGapReason(patchOf("2026-11-02", "2026-10-01"))).toBe("날짜 다름 · 32일");
  });

  it("사용일이 안 바뀌면 null", () => {
    expect(usedOnGapReason({ approvalNo: null, total: { before: 1, after: 2 }, card: null, usedOn: null })).toBeNull();
  });
});

describe("overwriteBlockReason — 덮기 막힘 글자(카드 R3 · P2-C4)", () => {
  const totalPatch = { approvalNo: "1", total: { before: 204_100, after: 1_238_000 }, card: null, usedOn: null };
  const cardPatch = { approvalNo: "1", total: null, card: { before: { id: CARD_A, last4: "1234" }, after: { id: CARD_B, last4: "5678" } }, usedOn: null };
  const datePatch = { approvalNo: "1", total: null, card: null, usedOn: { before: "2026-10-01", after: "2026-10-03" } };

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
    expect(overwriteBlockReason({ approvalNo: "1", total: null, card: null, usedOn: null }, "cap")).toBeNull();
  });

  // 07.1-04 E-P2-17: 날짜만 바뀌는 덮기도 완료 · 고정 막힘 사유를 낸다(null 사유로 떨어지지 않는다).
  it("(E-P2-17) 날짜만 바뀜 + completed → `사용일 {MM-DD} → {MM-DD} · 완료 프로젝트` · fixed → `… · 연결 고정`", () => {
    expect(overwriteBlockReason(datePatch, "completed")).toBe("사용일 10-01 → 10-03 · 완료 프로젝트");
    expect(overwriteBlockReason(datePatch, "fixed")).toBe("사용일 10-01 → 10-03 · 연결 고정");
  });

  it("(E-P2-17) 합계도 바뀌면 합계 조각이 먼저 · holder는 카드 조각이 먼저", () => {
    expect(overwriteBlockReason({ ...datePatch, total: { before: 50_000, after: 52_000 } }, "completed")).toBe("합계 50,000 → 52,000 · 완료 프로젝트");
    expect(overwriteBlockReason({ ...datePatch, card: cardPatch.card }, "holder")).toBe("카드 1234 → 5678 · 보유자 다름");
  });
});

describe("relaxedCandidatesOf — 3단계 사람 고르기 후보(PA-RELAX · DB-9 · N-6 · 카드 R3)", () => {
  const card = { id: CARD_A, last4: "1111" };
  const relaxLine = { corpCardId: CARD_A, cardLast4: "1111", approvalNo: "44403241", usedOn: "2026-04-30", totalKrw: 204_100, dateIsUsage: true };
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

  it("합계가 다르면 patch.total(같은 카드 · 같은 승인번호) · 카드가 다르면 patch.card(같은 사용일 · 합계 · 같은 카드사) — 고를 수 있는 행", () => {
    const [byApproval] = relaxedCandidatesOf(relaxLine, [cand({ approvalNo: "44403241", totalKrw: 200_000 })]);
    expect(byApproval?.blockedReason).toBeNull();
    expect(byApproval?.patch.total).toEqual({ before: 200_000, after: 204_100 });
    const [byDay] = relaxedCandidatesOf(relaxLine, [cand({ corpCardId: CARD_B, cardLast4: "2222" })]);
    expect(byDay?.blockedReason).toBeNull();
    expect(byDay?.patch.card?.before.last4).toBe("2222");
  });

  // 07.1-04 검토 P2(F2): 승인번호는 카드사 안에서 되풀이된다 — 다른 카드의 같은 승인번호는 후보가 아니다(같은 사용일 · 합계 갈래는 그대로 카드 무관).
  it("(검토 F2) 다른 카드 · 같은 승인번호 · 사용일 · 합계 다름 → 후보 아님", () => {
    expect(relaxedCandidatesOf(relaxLine, [cand({ approvalNo: "44403241", usedOn: "2026-04-28", totalKrw: 200_000, corpCardId: CARD_B, cardLast4: "2222" })])).toEqual([]);
  });

  // 07.1-04 검토 P1: 날짜 칸이 사용(승인)일이 아닌 서식(롯데 매입일자)은 사용일을 덮지 않는다 — 날짜 차 한도(D-E1)는 그대로 잰다.
  it("(검토 P1) dateIsUsage 거짓 → patch.usedOn 없음(합계 덮기는 그대로) · 32일 차는 여전히 `날짜 다름 · 32일`", () => {
    const posting = { ...relaxLine, dateIsUsage: false };
    const [near] = relaxedCandidatesOf(posting, [cand({ approvalNo: "44403241", usedOn: "2026-04-28", totalKrw: 200_000 })]);
    expect(near?.patch.usedOn).toBeNull();
    expect(near?.patch.total).toEqual({ before: 200_000, after: 204_100 });
    expect(near?.blockedReason).toBeNull();
    const [far] = relaxedCandidatesOf(posting, [cand({ approvalNo: "44403241", usedOn: "2026-03-29" })]);
    expect(far?.patch.usedOn).toBeNull();
    expect(far?.blockedReason).toBe("날짜 다름 · 32일");
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

  // 07.1-04 D-E1: 승인번호가 같아도 사용일 차가 31일을 넘으면 막힌 후보(후보에서 사라지지 않는다).
  it("(D-E1) 승인번호 같음 · 날짜 차 31일 → 고를 수 있음 · 32일 → `날짜 다름 · 32일` 막힌 행(맨 뒤) · 사용일 덮기 patch", () => {
    const result = relaxedCandidatesOf(relaxLine, [
      cand({ id: "far", approvalNo: "44403241", usedOn: "2026-03-29" }),
      cand({ id: "near", approvalNo: "44403241", usedOn: "2026-03-30" }),
    ]);
    expect(result.map((item) => [item.id, item.blockedReason])).toEqual([
      ["near", null],
      ["far", "날짜 다름 · 32일"],
    ]);
    expect(result[0]?.patch.usedOn).toEqual({ before: "2026-03-30", after: "2026-04-30" });
    expect(result[0]?.patch.approvalNo).toBeNull();
  });

  it("(D-E1) 막힘 차례 — 증빙 있음 → 카드 다름 → 날짜 다름 → 덮기 막힘", () => {
    const far = { approvalNo: "44403241", usedOn: "2026-03-01" };
    const [attached] = relaxedCandidatesOf(relaxLine, [cand({ ...far, cardStatementAttached: true })]);
    expect(attached?.blockedReason).toBe("증빙 있음 · K-26-0001");
    const [otherIssuer] = relaxedCandidatesOf(relaxLine, [cand({ ...far, sameIssuer: false, cardLast4: "9999" })]);
    expect(otherIssuer?.blockedReason).toBe("카드 다름 · 9999");
    const [gap] = relaxedCandidatesOf(relaxLine, [cand({ ...far, overwriteBlock: "completed" })]);
    expect(gap?.blockedReason).toBe("날짜 다름 · 60일");
    const [completed] = relaxedCandidatesOf(relaxLine, [cand({ approvalNo: "44403241", usedOn: "2026-04-28", overwriteBlock: "completed" })]);
    expect(completed?.blockedReason).toBe("사용일 04-28 → 04-30 · 완료 프로젝트");
  });

  it("(N-6) 영수증 · 05 전표 파일만 있는 카드 사용(카드 명세 아님)은 고를 수 있다 — 덮을 값 없는 막힘 종류는 막지 않는다", () => {
    const [item] = relaxedCandidatesOf(relaxLine, [cand({ overwriteBlock: "completed" })]);
    expect(item?.blockedReason).toBeNull();
  });
});
