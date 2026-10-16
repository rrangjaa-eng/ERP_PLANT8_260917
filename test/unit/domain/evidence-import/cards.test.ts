import { describe, expect, it } from "vitest";
import { planAmbiguousGroups, resolveCardForLine, SAME_CONTENT_CHECK, type CardCandidate } from "@/domain/evidence-import/cards";
import { cardBc } from "@/domain/evidence-import/formats/card-bc";
import { cardShinhan } from "@/domain/evidence-import/formats/card-shinhan";

// 06.1-04 Task 2: 카드 줄의 카드는 파일이 정한다(끝 4자리 + 발급사 글자에 서식 별칭) · 겹치는 내보내기의 같은 내용 줄 무리(GH-P1).

function card(id: string, issuer: string, numberLast4: string, active = true): CardCandidate {
  return { id, issuer, numberLast4, active };
}

describe("resolveCardForLine — 끝 4자리 + 발급사 별칭 → 카드 하나 (B-F15 · E1)", () => {
  it("신한 줄 1278 + 발급사 「신한카드」 끝 4자리 1278 카드 하나 → 그 카드", () => {
    expect(resolveCardForLine({ cardLast4: "1278" }, cardShinhan, [card("c1", "신한카드", "1278")])).toBe("c1");
  });

  it("비씨 줄 + 발급사 「IBK기업」 카드 → 카드 미등록(null)", () => {
    expect(resolveCardForLine({ cardLast4: "2942" }, cardBc, [card("c1", "IBK기업", "2942")])).toBeNull();
  });

  it("비씨 줄 + 발급사 「BC카드」 · 「bc카드」 → 연결(대소문자 · 공백 무관)", () => {
    expect(resolveCardForLine({ cardLast4: "2942" }, cardBc, [card("c1", "BC카드", "2942")])).toBe("c1");
    expect(resolveCardForLine({ cardLast4: "2942" }, cardBc, [card("c2", " bc 카드", "2942")])).toBe("c2");
  });

  it("같은 끝 4자리에 「신한」 · 「비씨」 카드 둘 + 신한 줄 → 신한 카드", () => {
    expect(resolveCardForLine({ cardLast4: "1278" }, cardShinhan, [card("bc", "비씨", "1278"), card("sh", "신한", "1278")])).toBe("sh");
  });

  it("별칭이 맞는 활성 카드 둘 → 카드 미등록(null)", () => {
    expect(resolveCardForLine({ cardLast4: "1278" }, cardShinhan, [card("a", "신한", "1278"), card("b", "신한카드", "1278")])).toBeNull();
  });

  it("별칭이 맞는 카드 둘 중 활성이 하나(재발급 — 「신한」 비활성 · 「신한카드」 활성) → 활성 카드", () => {
    expect(resolveCardForLine({ cardLast4: "1278" }, cardShinhan, [card("old", "신한", "1278", false), card("new", "신한카드", "1278")])).toBe("new");
  });

  it("줄의 끝 4자리가 없으면(끝까지 가린 번호) → 카드 미등록(null)", () => {
    expect(resolveCardForLine({ cardLast4: null }, cardShinhan, [card("c1", "신한카드", "1278")])).toBeNull();
  });

  it("끝 4자리가 다른 카드는 후보가 아니다", () => {
    expect(resolveCardForLine({ cardLast4: "1278" }, cardShinhan, [card("c1", "신한카드", "9999")])).toBeNull();
  });
});

type Line = { lineNo: number; dedupeKey: string; baseKey: string; sameKeyCount: number; needsCheck: string | null };

function line(lineNo: number, baseKey: string, nth: number, sameKeyCount: number, needsCheck: string | null = null): Line {
  return { lineNo, dedupeKey: nth > 1 ? `${baseKey}#${nth}` : baseKey, baseKey, sameKeyCount, needsCheck };
}

const SHA = "0123456789abcdef";
const BASE = "card-shinhan|1278|2026-05-28 18:43:28|가맹점나|113400";

describe("planAmbiguousGroups — 앞 파일과 겹친 같은 내용 줄 무리 → @ 열쇠 · 확인 필요 (GH-P1)", () => {
  it("무리 2줄 · 기존 열쇠 0 → 그대로", () => {
    const lines = [line(2, BASE, 1, 2), line(3, BASE, 2, 2)];
    expect(planAmbiguousGroups(lines, new Set(), SHA)).toEqual(lines);
  });

  it("무리 2줄 · 하나가 기존 → 기존 열쇠 줄만 @ 열쇠, 두 줄 다 사유", () => {
    const planned = planAmbiguousGroups([line(2, BASE, 1, 2), line(3, BASE, 2, 2)], new Set([BASE]), SHA);
    expect(planned.map((one) => one.dedupeKey)).toEqual([`${BASE}@${SHA}`, `${BASE}#2`]);
    expect(planned.map((one) => one.needsCheck)).toEqual([SAME_CONTENT_CHECK, SAME_CONTENT_CHECK]);
  });

  it("홑 줄 · 기존 · 기존 #2 없음 → 그대로(이미 등록 — 같은 거래)", () => {
    const lines = [line(2, BASE, 1, 1)];
    expect(planAmbiguousGroups(lines, new Set([BASE]), SHA)).toEqual(lines);
  });

  it("홑 줄 · 기존 · 기존 {baseKey}#2 있음 → @ 열쇠 · 사유", () => {
    const [planned] = planAmbiguousGroups([line(2, BASE, 1, 1)], new Set([BASE, `${BASE}#2`]), SHA);
    expect(planned).toMatchObject({ dedupeKey: `${BASE}@${SHA}`, needsCheck: SAME_CONTENT_CHECK });
  });

  it("이미 사유가 있는 줄(취소 표시 · 같은 승인번호 다른 금액)은 사유를 덮지 않는다", () => {
    const planned = planAmbiguousGroups([line(2, BASE, 1, 2, "취소 표시 줄 · 원거래 확인"), line(3, BASE, 2, 2)], new Set([BASE]), SHA);
    expect(planned.map((one) => one.needsCheck)).toEqual(["취소 표시 줄 · 원거래 확인", SAME_CONTENT_CHECK]);
  });

  it("다른 무리 줄은 건드리지 않는다", () => {
    const other = line(4, "card-shinhan|1278|2026-05-29 09:00:00|가맹점라|5000", 1, 1);
    const planned = planAmbiguousGroups([line(2, BASE, 1, 2), line(3, BASE, 2, 2), other], new Set([BASE]), SHA);
    expect(planned[2]).toEqual(other);
  });
});
