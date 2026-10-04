import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import styles from "../../../app/(app)/approvals/inbox-table.module.css";

// Opus 독립 검토 M1(사용자 결정 2026-09-29 A · PR #90 5891993737): 결재 정보(approval.value)를 끈 계급의 결재자는
// 결재함 항목에 구조 값(id · version · 링크 · 동작)만 받는다(상세 · 결재선 · 이름 없음 → 결재 시트 없음). 그래도
// 결재가 멈추지 않아야 한다 — PC 행에 승인 · 반려가 있고, 폰에서도 문서 링크(주 행 · 접힌 줄)로 문서 화면에 간다.
vi.mock("@/lib/viewer", () => ({ requireSession: () => Promise.resolve({ viewer: { id: "viewer" } }) }));
vi.mock("@/app/(app)/document-kinds", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
vi.mock("next-safe-action/hooks", () => ({ useAction: () => ({ execute: () => undefined, isExecuting: false, result: {} }) }));
vi.mock("@/app/(app)/approvals/actions", () => ({ approveAction: () => undefined, rejectAction: () => undefined }));
vi.mock("@/app/(app)/leave/actions", () => ({ withdrawLeaveAction: () => undefined }));
vi.mock("@/domain/approvals", () => ({
  REJECT_REASON_EMPTY_MESSAGE: "사유 없음 · 사유 적기",
  REJECT_REASON_TOO_LONG_MESSAGE: "사유 500자 넘음 · 줄여 적기",
  REJECT_REASON_MAX: 500,
  listMyInbox: () =>
    Promise.resolve({
      mine: [
        {
          instanceId: "inst-1",
          kind: "leave",
          kindLabel: "연차",
          documentId: "doc-1",
          href: "/leave/doc-1",
          status: "in_review",
          version: 2,
          actions: ["approve", "reject"],
        },
      ],
      processed: [],
    }),
}));

const { default: ApprovalsPage } = await import("@/app/(app)/approvals/page");

describe("결재함 — 구조 값만 받은 `내 결재` 행(결재 정보 꺼짐)", () => {
  it("PC 행에 승인 · 반려가 있고, 문서 링크는 폰에서도 보이는 행 링크다", async () => {
    const html = renderToStaticMarkup(await ApprovalsPage());
    expect(html).toMatch(/<button[^>]*>(<span[^>]*>)*승인/);
    expect(html).toMatch(/<button[^>]*>(<span[^>]*>)*반려/);
    const link = html.match(/<a [^>]*href="\/leave\/doc-1"[^>]*>/)?.[0] ?? "";
    expect(link).toContain(styles.rowLink);
    expect(link).not.toContain(styles.rowTap);
  });
});
