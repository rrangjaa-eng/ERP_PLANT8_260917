import { createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 07.3-01 /review: D-7314로 지급자가 전사 지급 대상을 보게 되어, 회사 전체에 지급 대상이 없을 때만 서는 빈 화면(hasAny=false)을
// 공유 E2E DB에서 더는 닿지 못한다(07.3-01-SUMMARY 「닿지 못한 빈 화면 글자」). 화면 컴포넌트를 목 props로 그려 글자 · 이동 곳을 지킨다.
vi.mock("next/link", () => ({
  default: ({ href, scroll, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; scroll?: boolean; children?: ReactNode }) =>
    createElement("a", { href, "data-scroll": String(scroll), ...rest }, children),
}));
vi.mock("@/ui/link-pending/LinkPending", () => ({ LinkPending: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/expenses",
}));
vi.mock("next-safe-action/hooks", () => ({ useAction: () => ({ execute: () => undefined, executeAsync: () => Promise.resolve(undefined), isExecuting: false, result: {} }) }));
vi.mock("@/app/(app)/expenses/actions", () => ({
  completePaymentsBatchAction: () => undefined,
  exportBankTransferFileAction: () => undefined,
  moveToThisWeekAction: () => undefined,
  previewTransferPayeesAction: () => undefined,
  revertScheduledPayDatesAction: () => undefined,
  sumSelectedTransfersAction: () => undefined,
  createEvidenceViewUrlAction: () => undefined,
  getEvidenceConfirmViewAction: () => undefined,
}));
vi.mock("@/app/(app)/expenses/[id]/actions", () => ({ confirmEvidenceAction: () => undefined }));
vi.mock("@/app/(app)/admin/vendors/actions", () => ({ revealVendorAccountNumberAction: () => undefined }));
vi.mock("@/app/(app)/admin/people/[id]/actions", () => ({ revealPersonAccountNumberAction: () => undefined }));

const { PaymentTargetsScreen } = await import("@/app/(app)/expenses/payment-targets-table");
type Props = Parameters<typeof PaymentTargetsScreen>[0];

const PAID_HREF = "/expenses?status=%EC%A7%80%EA%B8%89+%EC%99%84%EB%A3%8C";

function render(overrides: Partial<Props>): string {
  const props: Props = {
    views: [],
    selects: [],
    searchValue: "",
    query: {},
    rows: [],
    total: null,
    hasAny: false,
    page: { page: 1, pageCount: 1, total: 0, pageSize: 50 },
    prepaidDueDays: 7,
    today: "2026-11-02",
    paidHref: PAID_HREF,
    dateError: "날짜 형식",
    canExportTransferFile: false,
    thisWeekMove: null,
    approvingByWeek: [],
    ...overrides,
  };
  return renderToStaticMarkup(createElement(PaymentTargetsScreen, props));
}

const paidLink = new RegExp(`<a [^>]*href="${PAID_HREF.replaceAll("+", "\\+").replaceAll("?", "\\?")}"[^>]*>지급 완료 보기</a>`);

describe("지급 대상 — 회사 전체 0건 빈 화면(07.3-01 /review)", () => {
  it("지급 대상도 결재 중도 없으면 `지급할 건이 없습니다` · `지급 완료 보기`(paidHref)다", () => {
    const html = render({});
    expect(html).toContain("지급할 건이 없습니다");
    expect(html).toMatch(paidLink);
    expect(html).not.toContain("이번 주 지급 대상 없음");
  });

  it("지급 대상 없이 결재 중만 있으면 `이번 주 지급 대상 없음` · `지급 완료 보기`(paidHref)와 결재 중 표가 선다", () => {
    const html = render({
      approvingByWeek: [{ label: "이번 주", count: 1, sumKrw: 1_000, page: 1, rows: [{ id: "a1", number: "EX-1", title: "결재 중 건", status: "결재 중" }] }],
    });
    expect(html).toContain("이번 주 지급 대상 없음");
    expect(html).toMatch(paidLink);
    expect(html).toContain("결재 중 건");
    expect(html).not.toContain("지급할 건이 없습니다");
  });
});
