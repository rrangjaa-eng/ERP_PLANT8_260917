import { readdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseWorkbook } from "@/domain/evidence-import/registry";

// 06.1-02(E14) — 실물 견본(실명 · 카드 번호)은 저장소 밖 폴더 하나(`EVIDENCE_SAMPLES_DIR`)에서만 읽는다. 값 · 이름 · 번호를
// 출력하지 않고 건수만 단언한다. 폴더가 없는 환경(CI)에서만 파일째 건너뛰고, 폴더가 주어졌는데 서식 파일이 없으면 실패다 —
// 건너뜀은 녹색이 아니다. 견본이 오면 열 이름 보정 PR이 같은 테스트로 잰다.

const DIR = process.env.EVIDENCE_SAMPLES_DIR;

function sampleOf(prefix: string): string | undefined {
  if (!DIR) return undefined;
  const name = readdirSync(DIR).find((file) => file.startsWith(prefix) && (file.endsWith(".xls") || file.endsWith(".xlsx")));
  return name === undefined ? undefined : path.join(DIR, name);
}

function parsedSample(prefix: string, key: string) {
  const file = sampleOf(prefix);
  expect(file, `견본 없음 — 서식 ${key}`).toBeDefined();
  const result = parseWorkbook(new Uint8Array(readFileSync(file ?? "")));
  // 거절 문구(총계 금액 등)를 출력하지 않도록 종류만 비교한다.
  expect(result.ok ? "ok" : result.kind).toBe("ok");
  if (!result.ok) throw new Error(`거절 — 서식 ${key}`);
  expect(result.format).toBe(key);
  return result;
}

describe.skipIf(!DIR)("실물 견본 — 건수만", () => {
  // 시각 없음 원자료 8줄 중 2줄은 취소 줄(상쇄 쌍으로 빠진다) — 읽힌 줄에는 6줄이 남는다.
  it("신한 회계양식 162 · 빈 승인번호 4 · 음수 2 · 해외 2 · 시각 없음 6", () => {
    const result = parsedSample("card-shinhan", "card-shinhan-accounting");
    expect(result.lines.length + 2 * result.offsetPairs).toBe(162);
    expect(result.lines.filter((line) => line.approvalNo === null).length).toBe(4);
    expect(result.lines.filter((line) => line.totalKrw < 0).length + result.offsetPairs).toBe(2);
    expect(result.lines.filter((line) => line.needsCheck !== null).length).toBe(2);
    expect(result.lines.filter((line) => line.usedAt === null).length).toBe(6);
  });

  it("비씨 9 · 부가세 0 6 · 해외 0 · 빈 승인번호 0", () => {
    const result = parsedSample("card-bc", "card-bc");
    expect(result.lines.length + 2 * result.offsetPairs).toBe(9);
    expect(result.lines.filter((line) => line.vatKrw === 0).length).toBe(6);
    expect(result.lines.filter((line) => line.needsCheck !== null).length).toBe(0);
    expect(result.lines.filter((line) => line.approvalNo === null).length).toBe(0);
  });

  it("롯데 115 · 음수 7", () => {
    const result = parsedSample("card-lotte", "card-lotte");
    expect(result.lines.length + 2 * result.offsetPairs).toBe(115);
    expect(result.lines.filter((line) => line.totalKrw < 0).length + result.offsetPairs).toBe(7);
  });

  it("홈택스 매입 세금계산서 254 · 승인번호 26자 · 열쇠 중복 0", () => {
    const result = parsedSample("hometax-tax-invoice-purchase", "hometax-tax-invoice");
    expect(result.lines.length).toBe(254);
    expect(result.lines.every((line) => line.approvalNo?.length === 26)).toBe(true);
    expect(new Set(result.lines.map((line) => line.dedupeKey)).size).toBe(result.lines.length);
  });

  // 06.1-11: 견본 매입 현금영수증 목록은 승인 1줄이다(samples/hometax-cash-receipt-purchase.md).
  describe("hometax-cash-receipt 실물", () => {
    it("서식 키 · 거절 아님 · 줄 1", () => {
      const result = parsedSample("hometax-cash-receipt-purchase", "hometax-cash-receipt");
      expect(result.lines.length).toBe(1);
    });
  });

  // 06.1-11: 견본 매입 계산서(면세) 목록은 3장, 그중 1장이 음수(수정 계산서 · 비고에 당초 승인번호)다(samples/hometax-invoice-purchase.md).
  // 세금계산서 서식으로 읽히면 parsedSample의 서식 키 단언이 빨갛다.
  describe("hometax-invoice 실물", () => {
    it("서식 키(세금계산서 아님) · 줄 3 · 음수 1(원 승인번호 26자) · 승인번호 26자", () => {
      const result = parsedSample("hometax-invoice-purchase", "hometax-invoice");
      expect(result.lines.length).toBe(3);
      expect(result.lines.filter((line) => line.totalKrw < 0).length).toBe(1);
      expect(result.lines.filter((line) => line.totalKrw < 0 && line.originalApprovalNo?.length === 26).length).toBe(1);
      expect(result.lines.every((line) => line.approvalNo?.length === 26)).toBe(true);
    });
  });
});
