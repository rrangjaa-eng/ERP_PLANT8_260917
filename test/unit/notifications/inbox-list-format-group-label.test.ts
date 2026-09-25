import { describe, expect, it, vi } from "vitest";

// 04.2-09 Task 3 사후 수정(Opus 편차 판정 (b)) — 삭제된
// inbox-list-format-time.test.ts와 같은 틀. formatGroupLabel의 다른 해 분기는
// 보관 기간이 90일이라 E2E로는 1~3월에만 재현할 수 있어 단위 테스트로 뺀다.
vi.mock("@/app/(app)/notifications/actions", () => ({
  openInboxAction: vi.fn(),
  loadMoreInboxAction: vi.fn(),
}));
vi.mock("@/ui/shell/unread-count", () => ({
  useUnreadCount: () => ({ refresh: vi.fn() }),
}));

const { formatGroupLabel } = await import("@/app/(app)/notifications/inbox-list");

describe("formatGroupLabel", () => {
  it("올해 날짜는 MM-DD만 남긴다", () => {
    expect(formatGroupLabel("2026-09-24", "2026")).toBe("09-24");
  });

  it("다른 해 날짜는 YYYY-MM-DD 그대로 남긴다", () => {
    expect(formatGroupLabel("2025-12-30", "2026")).toBe("2025-12-30");
  });
});
