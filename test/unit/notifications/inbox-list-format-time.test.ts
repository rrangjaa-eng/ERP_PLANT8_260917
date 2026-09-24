import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/notifications/actions", () => ({
  openInboxAction: vi.fn(),
}));
vi.mock("@/ui/shell/unread-count", () => ({
  useUnreadCount: () => ({ refresh: vi.fn() }),
}));

const { formatTime } = await import("@/app/(app)/notifications/inbox-list");

describe("formatTime", () => {
  it("formats an ISO instant as KST HH:MM", () => {
    expect(formatTime("2026-09-24T00:00:00.000Z")).toBe("09:00");
  });
});
