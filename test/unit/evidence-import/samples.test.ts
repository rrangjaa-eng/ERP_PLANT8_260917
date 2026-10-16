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
  const name = readdirSync(DIR).find((file) => file.startsWith(prefix) && file.endsWith(".xls"));
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
  it("신한 168 · 빈 승인번호 4 · 음수 1", () => {
    const result = parsedSample("card-shinhan", "card-shinhan");
    expect(result.lines.length + 2 * result.offsetPairs).toBe(168);
    expect(result.lines.filter((line) => line.approvalNo === null).length).toBe(4);
    expect(result.lines.filter((line) => line.totalKrw < 0).length + result.offsetPairs).toBe(1);
  });

  it("비씨 8 · 00000000 1", () => {
    const result = parsedSample("card-bc", "card-bc");
    expect(result.lines.length + 2 * result.offsetPairs).toBe(8);
    expect(result.lines.filter((line) => line.approvalNo === null).length).toBe(1);
  });

  it("롯데 85 · 음수 1", () => {
    const result = parsedSample("card-lotte", "card-lotte");
    expect(result.lines.length + 2 * result.offsetPairs).toBe(85);
    expect(result.lines.filter((line) => line.totalKrw < 0).length + result.offsetPairs).toBe(1);
  });

  it("홈택스 매입 세금계산서 25 · 승인번호 26자", () => {
    const result = parsedSample("hometax-tax-invoice-purchase", "hometax-tax-invoice");
    expect(result.lines.length).toBe(25);
    expect(result.lines.every((line) => line.approvalNo?.length === 26)).toBe(true);
  });

  it("실물 계산서 꼴 → 모르는 서식 · 세금계산서로 읽히지 않음", () => {
    const file = sampleOf("hometax-invoice-purchase");
    expect(file, "견본 없음 — 서식 hometax-invoice(계산서 꼴)").toBeDefined();
    const result = parseWorkbook(new Uint8Array(readFileSync(file ?? "")));
    expect(result.ok ? result.format : result.kind).toBe("unknown-format");
  });
});
