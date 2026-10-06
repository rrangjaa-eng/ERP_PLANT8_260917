import { createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CardUsageFormOptions, CardUsageList } from "@/domain/corp-card-usages";

// 06-05 카드 사용 목록 페이지(S8) — 서버 렌더 갈래를 도메인 스텁으로 고정한다.

vi.mock("next/link", () => ({
  default: ({ href, scroll, prefetch, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; scroll?: boolean; prefetch?: boolean; children?: ReactNode }) => {
    void scroll;
    void prefetch;
    return createElement("a", { href, ...rest }, children);
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/cards",
}));
vi.mock("@/ui/link-pending/LinkPending", () => ({ LinkPending: () => null }));
vi.mock("@/lib/viewer", () => ({
  requireSession: () => Promise.resolve({ viewer: { id: "u1", roleId: "r1" }, user: { name: "카드직원" } }),
}));

const formOptions = vi.fn<() => Promise<CardUsageFormOptions>>();
const list = vi.fn<() => Promise<CardUsageList>>();
vi.mock("@/domain/corp-card-usages", () => ({
  cardUsageFormOptions: () => formOptions(),
  listCardUsages: () => list(),
  cardUsageFormDefaults: () => Promise.resolve({ usedOn: "2026-10-06", corpCardId: null, linkKind: null }),
}));
// 패널 본문(클라이언트 폼)은 이 테스트 밖 — 닫기 href만 본다.
vi.mock("@/app/(app)/cards/card-usage-form", () => ({ CardUsageForm: () => null }));
vi.mock("@/ui/side-panel/SidePanel", () => ({
  SidePanel: ({ closeHref, children }: { closeHref: string; children?: ReactNode }) => createElement("div", { "data-close-href": closeHref }, children),
}));

const { default: CardsPage } = await import("@/app/(app)/cards/page");

const CARD = { id: "11111111-1111-4111-8111-111111111111", label: "카드A · 신한 1111" };

function options(cards: { id: string; label: string }[]): CardUsageFormOptions {
  return { cards, evidenceTypes: [{ value: "card_receipt", label: "카드 전표" }], teamName: "팀", teamAssigned: true, usdFxRate: null };
}

function emptyList(): CardUsageList {
  return { rows: [], totals: null, page: { page: 1, pageCount: 1, pageSize: 50, total: 0 }, cardChoices: [], registrationFilter: false };
}

async function render(params: Record<string, string>): Promise<string> {
  const element = await CardsPage({ searchParams: Promise.resolve(params) });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  formOptions.mockReset();
  list.mockReset();
});

describe("지금 필터를 지키는 1차 · 패널 닫기(P3-3)", () => {
  it("필터가 있으면 1차 href = 같은 쿼리 + new=1, 패널 닫기 = 같은 쿼리의 /cards", async () => {
    formOptions.mockResolvedValue(options([CARD]));
    list.mockResolvedValue({ ...emptyList(), cardChoices: [CARD] });
    const html = await render({ month: "2026-09", card: CARD.id, new: "1" });
    const query = `month=2026-09&amp;card=${CARD.id}`;
    expect(html).toContain(`href="/cards?${query}&amp;new=1"`);
    expect(html).toContain(`data-close-href="/cards?${query}"`);
  });

  it("필터가 없으면 1차 `/cards?new=1` · 닫기 `/cards`", async () => {
    formOptions.mockResolvedValue(options([CARD]));
    list.mockResolvedValue(emptyList());
    const html = await render({ new: "1" });
    expect(html).toContain('href="/cards?new=1"');
    expect(html).toContain('data-close-href="/cards"');
  });
});
