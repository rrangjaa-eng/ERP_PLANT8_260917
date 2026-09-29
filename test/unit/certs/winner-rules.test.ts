import { describe, expect, it } from "vitest";
import { validateWinnerRows, type WinnerRowInput } from "@/domain/certs/winner-rules";
import { renderQrSvg } from "@/domain/certs/qr";

let seq = 0;
function row(overrides: Partial<WinnerRowInput> = {}): WinnerRowInput {
  seq += 1;
  return {
    key: `r${seq}`,
    name: "김하늘",
    phone: "010-4821-7730",
    prizeName: "갤럭시 탭 S10",
    quantity: "1",
    delivery: "현장",
    distinguishLabel: "",
    ...overrides,
  };
}

function codesOf(rows: WinnerRowInput[], context?: Parameters<typeof validateWinnerRows>[1]) {
  const result = validateWinnerRows(rows, context);
  if (result.ok) return [];
  return result.cellErrors.map((e) => `${e.rowKey}:${e.column}:${e.code}`);
}

describe("domain/certs/winner-rules validateWinnerRows", () => {
  it("정상 한 줄 → 오류 없음 · 정규화된 줄(전화 숫자만 · 수량 1 · 전달 onsite)", () => {
    const r = row();
    const result = validateWinnerRows([r]);
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          key: r.key,
          name: "김하늘",
          phone: "01048217730",
          prizeName: "갤럭시 탭 S10",
          quantity: 1,
          delivery: "onsite",
          distinguishLabel: null,
        },
      ],
    });
  });

  it("택배 → parcel, 이미 코드로 온 onsite/parcel · 숫자 수량도 받는다(04.3-02 헬퍼 호출)", () => {
    const a = row({ delivery: "택배" });
    const b = row({ name: "이도윤", phone: "010-1111-2222", delivery: "parcel", quantity: 2 });
    const result = validateWinnerRows([a, b]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows.map((x) => x.delivery)).toEqual(["parcel", "parcel"]);
      expect(result.rows[1]!.quantity).toBe(2);
    }
  });

  it("전화 02-123-4567 → 그 셀 phoneFormat", () => {
    const r = row({ phone: "02-123-4567" });
    expect(codesOf([r])).toEqual([`${r.key}:phone:phoneFormat`]);
  });

  it.each(["0", "-1", "1.5", "abc"])("수량 %s → 그 셀 quantity", (quantity) => {
    const r = row({ quantity });
    expect(codesOf([r])).toEqual([`${r.key}:quantity:quantity`]);
  });

  it("수량 빈 값 → 그 셀 required · 수량 1은 통과", () => {
    const empty = row({ quantity: "" });
    expect(codesOf([empty])).toEqual([`${empty.key}:quantity:required`]);
    expect(validateWinnerRows([row({ quantity: "1" })]).ok).toBe(true);
  });

  it("전달 퀵 → 그 셀 delivery", () => {
    const r = row({ delivery: "퀵" });
    expect(codesOf([r])).toEqual([`${r.key}:delivery:delivery`]);
  });

  it("이름 빈 값 → 그 셀 required", () => {
    const r = row({ name: "  " });
    expect(codesOf([r])).toEqual([`${r.key}:name:required`]);
  });

  it("같은 이름·전화번호 두 줄 → 두 줄의 이름 셀 duplicatePerson", () => {
    const a = row();
    const b = row({ phone: "01048217730", prizeName: "다른 경품" });
    expect(codesOf([a, b])).toEqual([`${a.key}:name:duplicatePerson`, `${b.key}:name:duplicatePerson`]);
  });

  describe("구별 표시 필요(모양 중복)", () => {
    const starbucks = { prizeName: "스타벅스 기프티콘", quantity: "2" };

    it("김민수·김문수 같은 경품·수량, 구별 표시 없음 → 두 줄 구별 표시 셀 shapeDuplicate(모양 · 줄 수)", () => {
      const a = row({ name: "김민수", phone: "010-1111-2222", ...starbucks });
      const b = row({ name: "김문수", phone: "010-3333-4444", ...starbucks });
      const result = validateWinnerRows([a, b]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.cellErrors).toEqual([
        { rowKey: a.key, column: "distinguishLabel", code: "shapeDuplicate", shape: "김*수 · 스타벅스 기프티콘 2개", count: 2 },
        { rowKey: b.key, column: "distinguishLabel", code: "shapeDuplicate", shape: "김*수 · 스타벅스 기프티콘 2개", count: 2 },
      ]);
    });

    it("한 줄만 오전 조 → 통과", () => {
      const a = row({ name: "김민수", phone: "010-1111-2222", ...starbucks, distinguishLabel: "오전 조" });
      const b = row({ name: "김문수", phone: "010-3333-4444", ...starbucks });
      expect(validateWinnerRows([a, b]).ok).toBe(true);
    });

    it("둘 다 오전 조 → 두 줄 오류", () => {
      const a = row({ name: "김민수", phone: "010-1111-2222", ...starbucks, distinguishLabel: "오전 조" });
      const b = row({ name: "김문수", phone: "010-3333-4444", ...starbucks, distinguishLabel: "오전 조" });
      expect(codesOf([a, b])).toEqual([
        `${a.key}:distinguishLabel:shapeDuplicate`,
        `${b.key}:distinguishLabel:shapeDuplicate`,
      ]);
    });

    it("저장된 줄(context)과 모양이 같으면 이번 표의 줄만 오류", () => {
      const b = row({ name: "김문수", phone: "010-3333-4444", ...starbucks });
      const result = validateWinnerRows([b], {
        savedRows: [{ id: "saved-1", name: "김민수", prizeName: "스타벅스 기프티콘", quantity: 2, distinguishLabel: null }],
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.cellErrors).toEqual([
        { rowKey: b.key, column: "distinguishLabel", code: "shapeDuplicate", shape: "김*수 · 스타벅스 기프티콘 2개", count: 2 },
      ]);
    });
  });

  describe("구별 표시 내용 규칙", () => {
    it.each([
      ["3시 추첨", true],
      ["12시 조", true],
      ["1-2 조", true],
      ["3시 1조", true],
      ["열자까지되는구별표시", true],
    ])("%s → 통과", (label) => {
      expect(validateWinnerRows([row({ distinguishLabel: label })]).ok).toBe(true);
    });

    it("11자 → labelTooLong", () => {
      const r = row({ distinguishLabel: "열한자가되는구별표시다" });
      expect(codesOf([r])).toEqual([`${r.key}:distinguishLabel:labelTooLong`]);
    });

    it.each(["123조", "7-7-3-0", "7 7 3", "7.7.3"])("%s → labelDigits(우회 입력 정규화)", (label) => {
      const r = row({ name: "이도윤", distinguishLabel: label });
      expect(codesOf([r])).toEqual([`${r.key}:distinguishLabel:labelDigits`]);
    });

    it.each(["１２３조", "１-２-３", "７　７　３"])("전각 숫자 %s → labelDigits(NFKC 뒤 판정)", (label) => {
      const r = row({ name: "이도윤", distinguishLabel: label });
      expect(codesOf([r])).toEqual([`${r.key}:distinguishLabel:labelDigits`]);
    });

    it("다른 줄 당첨자 이름 김하늘 포함 → labelName(행사 전체 이름)", () => {
      const a = row({ name: "김하늘" });
      const b = row({ name: "이도윤", phone: "010-2231-0045", distinguishLabel: "김하늘 친구" });
      expect(codesOf([a, b])).toEqual([`${b.key}:distinguishLabel:labelName`]);
    });

    it.each(["김 하늘", "김하 늘"])("당첨자 김하늘이 있을 때 %s → labelName", (label) => {
      const a = row({ name: "김하늘" });
      const b = row({ name: "이도윤", phone: "010-2231-0045", distinguishLabel: label });
      expect(codesOf([a, b])).toEqual([`${b.key}:distinguishLabel:labelName`]);
    });

    it("당첨자 이름이 공백 포함(김 하늘)으로 등록돼도 구별 표시 김하늘 → labelName", () => {
      const b = row({ name: "이도윤", phone: "010-2231-0045", distinguishLabel: "김하늘" });
      const result = validateWinnerRows([b], {
        savedRows: [{ id: "s1", name: "김 하늘", prizeName: "갤럭시 탭 S10", quantity: 1, distinguishLabel: null }],
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.cellErrors.map((e) => e.code)).toEqual(["labelName"]);
    });

    it("NFD로 적은 김하늘 → labelName(NFC 비교)", () => {
      const a = row({ name: "김하늘" });
      const b = row({ name: "이도윤", phone: "010-2231-0045", distinguishLabel: "김하늘".normalize("NFD") });
      expect(codesOf([a, b])).toEqual([`${b.key}:distinguishLabel:labelName`]);
    });
  });

  describe("길이(E3-21 — 앞뒤 공백을 뗀 길이)", () => {
    it("이름 40자 통과 · 41자 nameTooLong · 공백 붙인 40자 통과", () => {
      expect(validateWinnerRows([row({ name: "가".repeat(40) })]).ok).toBe(true);
      const long = row({ name: "가".repeat(41) });
      expect(codesOf([long])).toEqual([`${long.key}:name:nameTooLong`]);
      expect(validateWinnerRows([row({ name: ` ${"가".repeat(40)} ` })]).ok).toBe(true);
    });

    it("경품명 80자 통과 · 81자 prizeTooLong", () => {
      expect(validateWinnerRows([row({ prizeName: "나".repeat(80) })]).ok).toBe(true);
      const long = row({ prizeName: "나".repeat(81) });
      expect(codesOf([long])).toEqual([`${long.key}:prizeName:prizeTooLong`]);
    });
  });

  describe("NFD 입력(macOS 붙여넣기) — NFC로 세고 NFC로 저장", () => {
    it("NFD 경품명 80자 통과 · 저장값은 NFC · 81자 prizeTooLong", () => {
      const ok = validateWinnerRows([row({ prizeName: "각".repeat(80).normalize("NFD") })]);
      expect(ok.ok).toBe(true);
      if (ok.ok) expect(ok.rows[0]!.prizeName).toBe("각".repeat(80));
      const long = row({ prizeName: "각".repeat(81).normalize("NFD") });
      expect(codesOf([long])).toEqual([`${long.key}:prizeName:prizeTooLong`]);
    });

    it("NFD 구별 표시 10자 통과 · 저장값은 NFC · 11자 labelTooLong", () => {
      const ok = validateWinnerRows([row({ distinguishLabel: "열자까지되는구별표시".normalize("NFD") })]);
      expect(ok.ok).toBe(true);
      if (ok.ok) expect(ok.rows[0]!.distinguishLabel).toBe("열자까지되는구별표시");
      const long = row({ distinguishLabel: "열한자가되는구별표시다".normalize("NFD") });
      expect(codesOf([long])).toEqual([`${long.key}:distinguishLabel:labelTooLong`]);
    });

    it("NFD 이름 40자 통과 · 41자 nameTooLong", () => {
      expect(validateWinnerRows([row({ name: "각".repeat(40).normalize("NFD") })]).ok).toBe(true);
      const long = row({ name: "각".repeat(41).normalize("NFD") });
      expect(codesOf([long])).toEqual([`${long.key}:name:nameTooLong`]);
    });
  });

  it("줄 0개 → 당첨자 없음", () => {
    expect(validateWinnerRows([])).toEqual({ ok: false, noWinners: true, cellErrors: [] });
  });
});

describe("domain/certs/qr renderQrSvg", () => {
  it("await 결과가 <svg로 시작하고 currentColor를 쓰며 # 색 리터럴이 없다", async () => {
    const svg = await renderQrSvg("https://erp.example.test/c/abc123");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("currentColor");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
