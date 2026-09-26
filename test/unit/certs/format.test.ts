import { describe, expect, it } from "vitest";
import {
  formatContactPhone,
  formatPhone,
  maskName,
  maskRrn,
  normalizeContactPhone,
  normalizeName,
  normalizePhone,
} from "@/domain/certs/format";

describe("domain/certs/format", () => {
  describe("normalizeName", () => {
    it("NFD 입력을 NFC로 정규화하고 앞뒤 공백을 없앤다", () => {
      const nfd = "검는".normalize("NFD"); // 자모 분리 흉내는 아래 직접 비교로 검증
      void nfd;
      expect(normalizeName("  김하늘  ".normalize("NFD"))).toBe("김하늘");
    });
  });

  describe("maskName", () => {
    it.each([
      ["김하늘", "김*늘"],
      ["남궁민수", "남**수"],
      ["김 하늘", "김 *늘"],
      ["김", "*"],
      ["김하", "김*"],
      ["Joseph", "J****h"],
    ])("%s → %s", (input, expected) => {
      expect(maskName(input)).toBe(expected);
    });

    it("NFD로 들어온 이름도 김*늘로 가린다", () => {
      const nfd = "김하늘".normalize("NFD");
      expect(maskName(nfd)).toBe("김*늘");
    });
  });

  describe("normalizePhone · formatPhone (당첨자 전화 전용)", () => {
    it("휴대전화 형식은 숫자만 남긴다", () => {
      expect(normalizePhone("010-4821-7730")).toBe("01048217730");
    });

    it("지역번호는 거부한다(뒤 4자리 확인 대상은 휴대전화뿐)", () => {
      expect(normalizePhone("02-123-4567")).toBeNull();
    });

    it("formatPhone은 숫자만 저장된 값을 하이픈 표기로 되돌린다", () => {
      expect(formatPhone("01048217730")).toBe("010-4821-7730");
    });
  });

  describe("normalizeContactPhone · formatContactPhone (문의 전화 전용)", () => {
    it.each([
      ["02-123-4567", "021234567"],
      ["02-1234-5678", "0212345678"],
      ["031-123-4567", "0311234567"],
      ["070-1234-5678", "07012345678"],
      ["1588-1234", "15881234"],
      ["010-4821-7730", "01048217730"],
    ])("%s → %s", (input, expected) => {
      expect(normalizeContactPhone(input)).toBe(expected);
    });

    it.each([["123"], ["02-12"]])("%s는 거부한다", (input) => {
      expect(normalizeContactPhone(input)).toBeNull();
    });

    it("같은 02-123-4567이 당첨자 전화로는 거부되고 문의 전화로는 저장된다", () => {
      expect(normalizePhone("02-123-4567")).toBeNull();
      expect(normalizeContactPhone("02-123-4567")).toBe("021234567");
    });

    it.each([
      ["021234567", "02-123-4567"],
      ["0212345678", "02-1234-5678"],
      ["0311234567", "031-123-4567"],
      ["07012345678", "070-1234-5678"],
      ["15881234", "1588-1234"],
      ["01048217730", "010-4821-7730"],
    ])("formatContactPhone(%s) → %s", (input, expected) => {
      expect(formatContactPhone(input)).toBe(expected);
    });
  });

  describe("maskRrn", () => {
    it("앞 6 + 성별 코드 + 별 6개", () => {
      expect(maskRrn("9304122123458")).toBe("930412-2******");
    });
  });
});
