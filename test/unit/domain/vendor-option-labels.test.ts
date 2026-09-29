import { describe, expect, it } from "vitest";
import { vendorOptionLabels } from "@/domain/vendors";

// QA ISSUE-005 (a) — 이름이 같은 거래처가 둘 이상일 때만 옵션 라벨 뒤에 사업자번호 끝 4자리를 붙인다. 사업자번호가 없으면 이름만.
describe("vendorOptionLabels — 동명 거래처만 끝 4자리 병기", () => {
  it("동명이 아닌 거래처는 이름 그대로다", () => {
    const labels = vendorOptionLabels([
      { id: "a", name: "가나상사", businessNo: "123-45-67890" },
      { id: "b", name: "다라상사", businessNo: null },
    ]);
    expect(labels.get("a")).toBe("가나상사");
    expect(labels.get("b")).toBe("다라상사");
  });

  it("동명 거래처는 `이름 · 끝4자리`(숫자만 센다), 사업자번호가 없는 동명은 이름만", () => {
    const labels = vendorOptionLabels([
      { id: "a", name: "마바동명", businessNo: "123-45-61234" },
      { id: "b", name: "마바동명", businessNo: "9876543210" },
      { id: "c", name: "마바동명", businessNo: null },
      { id: "d", name: "마바동명", businessNo: "  " },
    ]);
    expect(labels.get("a")).toBe("마바동명 · 1234");
    expect(labels.get("b")).toBe("마바동명 · 3210");
    expect(labels.get("c")).toBe("마바동명");
    expect(labels.get("d")).toBe("마바동명");
  });
});
