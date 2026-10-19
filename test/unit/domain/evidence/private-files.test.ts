import { describe, expect, it } from "vitest";
import { PRIVATE_EVIDENCE_SHEET_NOTICE, privateEvidenceLine, privateFileVisible } from "@/domain/evidence/private-files";

// 06.1-14(G15 · RP-15 ⑵ · T-061-142): 「올린 사람 · 경영관리만 보기」 증빙 종류의 05 파일 보임 판정 — 순수 함수.
// 260907 server/src/receipts.ts:280-285(created_by = me or not 올린이만) · :356-360(전사 범위는 그래도 본다).

const me = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

describe("privateFileVisible", () => {
  it("속성이 꺼진 종류는 누구나 본다", () => {
    expect(privateFileVisible({ privateType: false, uploadedBy: other, viewerId: me, scopeAll: false })).toBe(true);
  });

  it("켜진 종류 · 올린 사람 본인은 본다", () => {
    expect(privateFileVisible({ privateType: true, uploadedBy: me, viewerId: me, scopeAll: false })).toBe(true);
  });

  it("켜진 종류 · 남의 파일 · 전사 보는 범위는 본다", () => {
    expect(privateFileVisible({ privateType: true, uploadedBy: other, viewerId: me, scopeAll: true })).toBe(true);
  });

  it("켜진 종류 · 남의 파일 · 전사 범위가 아니면 못 본다(결재자 · 팀장)", () => {
    expect(privateFileVisible({ privateType: true, uploadedBy: other, viewerId: me, scopeAll: false })).toBe(false);
  });

  it("올린 사람이 없는 행(붙은 기록 — PA-G15-LINKED)은 전사 범위만 본다", () => {
    expect(privateFileVisible({ privateType: true, uploadedBy: null, viewerId: me, scopeAll: false })).toBe(false);
    expect(privateFileVisible({ privateType: true, uploadedBy: null, viewerId: me, scopeAll: true })).toBe(true);
  });
});

describe("문서 · 결재 시트 글자", () => {
  it("문서 화면 잠김 줄은 `{종류 이름} · 경영관리만`(PA-G15-NOTICE)", () => {
    expect(privateEvidenceLine("개인카드 전표")).toBe("개인카드 전표 · 경영관리만");
  });

  it("결재 시트 잠김 행은 건수 · 파일 이름 없는 한 줄이다(카드 G-N2)", () => {
    expect(PRIVATE_EVIDENCE_SHEET_NOTICE).toBe("비공개 증빙 · 경영관리만");
  });
});
