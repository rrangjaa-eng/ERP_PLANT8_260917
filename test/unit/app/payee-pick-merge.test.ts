import { describe, expect, it } from "vitest";
import { mergePayeePickRows, PAYEE_PICK_LIMIT } from "@/app/(app)/expenses/[id]/payee-pick-merge";
import { PICK_LIMIT } from "@/domain/expenses/pick";

// 06.5 V12 R-1: 거래처 후보와 직원 후보를 합친 뒤 이름순(같은 이름이면 거래처 먼저 → id) 한 목록 · 모두 합쳐 50행 · 넘침 한 줄.

const vendor = (id: string, name: string) => ({ id, name });
const user = (id: string, name: string) => ({ id, name });
const names = ["가", "나", "다", "라", "마", "바", "사", "아", "자", "차"];

describe("mergePayeePickRows", () => {
  it("거래처 30 + 직원 30 → 50행 · 이름순 · truncated", () => {
    const vendors = Array.from({ length: 30 }, (_, i) => vendor(`v${i}`, `${names[i % 10]}${String(i).padStart(2, "0")}거래처`));
    const users = Array.from({ length: 30 }, (_, i) => user(`u${i}`, `${names[(i + 5) % 10]}${String(i).padStart(2, "0")}직원`));
    const merged = mergePayeePickRows({ vendors, users, vendorsTruncated: false, usersTruncated: false });
    expect(merged.rows).toHaveLength(50);
    expect(merged.truncated).toBe(true);
    const shown = merged.rows.map((entry) => entry.row.name);
    expect(shown).toEqual([...shown].sort((a, b) => a.localeCompare(b, "ko")));
    expect(merged.rows.some((entry) => entry.kind === "user")).toBe(true);
    expect(merged.rows.some((entry) => entry.kind === "vendor")).toBe(true);
  });

  it("같은 이름이면 거래처가 먼저, 그다음 id 순", () => {
    const merged = mergePayeePickRows({
      vendors: [vendor("v2", "김하나"), vendor("v1", "김하나")],
      users: [user("u1", "김하나"), user("u0", "가나다")],
      vendorsTruncated: false,
      usersTruncated: false,
    });
    expect(merged.rows.map((entry) => `${entry.kind}:${entry.row.id}`)).toEqual(["user:u0", "vendor:v1", "vendor:v2", "user:u1"]);
  });

  it("거래처 3 + 직원 2 → 5행 · truncated 거짓", () => {
    const merged = mergePayeePickRows({
      vendors: [vendor("v1", "다"), vendor("v2", "가"), vendor("v3", "마")],
      users: [user("u1", "나"), user("u2", "라")],
      vendorsTruncated: false,
      usersTruncated: false,
    });
    expect(merged.rows.map((entry) => entry.row.name)).toEqual(["가", "나", "다", "라", "마"]);
    expect(merged.truncated).toBe(false);
  });

  it("한쪽만 서버에서 잘렸으면(합 ≤ 50) truncated 참", () => {
    expect(mergePayeePickRows({ vendors: [vendor("v1", "가")], users: [], vendorsTruncated: true, usersTruncated: false }).truncated).toBe(true);
    expect(mergePayeePickRows({ vendors: [], users: [user("u1", "가")], vendorsTruncated: false, usersTruncated: true }).truncated).toBe(true);
  });

  it("둘 다 0 → 0행", () => {
    expect(mergePayeePickRows({ vendors: [], users: [], vendorsTruncated: false, usersTruncated: false })).toEqual({ rows: [], truncated: false });
  });

  it("상한은 서버 골라내기 상한과 같다", () => {
    expect(PAYEE_PICK_LIMIT).toBe(PICK_LIMIT);
  });
});
