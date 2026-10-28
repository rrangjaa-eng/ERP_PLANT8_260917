import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { db } from "@/db/client";
import { purchaseRequests } from "@/db/schema";
import { createOrgUnit, createTeam } from "@/domain/org";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { NextTurnItem } from "@/ui/next-turn/build-next-turn-view";
import { buildNextTurnView } from "@/ui/next-turn/build-next-turn-view";
import { loginPage, makePerson } from "./leave-org";
import { archiveTempRoles, insertTempRole } from "./expense-fixture";

// 02-VERIFICATION 사람 판정 5 해소: 「내 차례」 폰 두 줄 배치(§7-4)는 D-24로 홈이 항상
// buildNextTurnView([])를 넘겨 실데이터가 생기는 Phase 4까지 한 번도 렌더된 적이 없었다.
// 시연 데이터를 홈에 넣지 않는다는 D-24를 지키면서 실제 컴포넌트·실제 CSS를 375px
// 실브라우저에서 재려면, 컴포넌트를 Node에서 정적 마크업으로 그리고 그 CSS 모듈 원문과
// 토큰을 그대로 얹은 문서를 setContent로 연다. 클래스 이름은 CSS 모듈 해시 대신 원문
// 이름을 쓴다(아래 esbuild 스텁) — 선택자와 마크업이 같은 원문을 보므로 배치 계산은
// 앱과 같다. 파일명 접두어 mobile-*로 mobile-375 프로젝트(375×800)에서만 돈다.

const HERE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(HERE), "../..");

async function renderNextTurn(items: NextTurnItem[], actionSlots?: Record<string, React.ReactNode>): Promise<string> {
  // Playwright의 TS 변환은 .css import를 통째로 지운다(styles가 undefined가 된다).
  // 그래서 esbuild로 컴포넌트를 한 번 묶되, CSS 모듈만 "원문 클래스 이름 그대로"를
  // 돌려주는 스텁으로 바꿔 끼운다. 패키지(react 등)는 외부로 둬 이 프로세스의 것을 쓴다.
  const { build } = (await import("esbuild")) as typeof import("esbuild");
  const outfile = path.join(ROOT, "test-results", "next-turn-ssr.mjs");
  await build({
    entryPoints: [path.join(ROOT, "ui/next-turn/NextTurn.tsx")],
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
    outfile,
    logLevel: "silent",
    plugins: [
      {
        name: "css-module-identity",
        setup(pluginBuild) {
          pluginBuild.onLoad({ filter: /\.module\.css$/ }, () => ({
            contents: "export default new Proxy({}, { get: (_t, name) => String(name) });",
            loader: "js",
          }));
        },
      },
    ],
  });
  const { NextTurn } = (await import(`${outfile}?t=${Date.now()}`)) as {
    NextTurn: (props: { view: ReturnType<typeof buildNextTurnView>; actionSlots?: Record<string, React.ReactNode> }) => React.ReactElement;
  };
  return renderToStaticMarkup(createElement(NextTurn, { view: buildNextTurnView(items), actionSlots }));
}

function css(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

// 앱과 같은 서체(Pretendard)로 재는 문서 — setContent는 about:blank라 /fonts를 못 받아 대체 서체로 그려지고, 대체 서체는 글자가 넓어
// 잘림 크기가 실제 앱과 어긋난다(#321 재검토: 25px로 낸 것이 실제 앱에서는 4px). 숫자 모듈(Num — tabular-nums)도 얹는다: 빼면 금액 칸이 7~8px 좁아져
// 이유 칸이 그만큼 넓게 재진다. 서체 조각이 실제로 받아졌는지까지 확인한다. 실제 앱 홈과의 대조는 next-turn-phase6.spec.ts의 폰 홈 시험이 한다.
async function openPhoneDocument(page: Page, items: NextTurnItem[], actionSlots?: Record<string, React.ReactNode>): Promise<void> {
  const html = `<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width">
<link rel="stylesheet" href="/fonts/pretendard/pretendard-dynamic-subset.css">
<style>${css("docs/design/tokens.css")}</style>
<style>${css("app/globals.css")}</style>
<style>${css("ui/status-tag/StatusTag.module.css")}</style>
<style>${css("ui/num/Num.module.css")}</style>
<style>${css("ui/next-turn/NextTurn.module.css")}</style>
<style>${css("app/(app)/home-approval-actions.module.css")}</style>
</head><body><main style="padding: 0 var(--pad-page)">${await renderNextTurn(items, actionSlots)}</main></body></html>`;
  await page.route("http://harness.local/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/fonts/")) await route.fulfill({ path: path.join(ROOT, "public", decodeURIComponent(url.pathname)) });
    else await route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
  });
  await page.goto("http://harness.local/index.html");
  await page.waitForFunction(() => document.fonts.status === "loaded" && Array.from(document.fonts).some((face) => face.status === "loaded"));
}

const ITEM: NextTurnItem = {
  tag: "막힘",
  label: "아이오닉9 쇼케이스 — 무대설치 지출결의",
  reason: "증빙 없음",
  amount: 1_200_000,
  action: { label: "증빙 올리기", href: "/expenses/1" },
};

test.describe("폰 375 「내 차례」 두 줄 배치 (§7-4 · 02-VERIFICATION 사람 판정 5)", () => {
  test.beforeEach(async ({ page }) => {
    const html = `<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width">
<style>${css("docs/design/tokens.css")}</style>
<style>${css("app/globals.css")}</style>
<style>${css("ui/status-tag/StatusTag.module.css")}</style>
<style>${css("ui/next-turn/NextTurn.module.css")}</style>
</head><body><main style="padding: 0 var(--pad-page)">${await renderNextTurn([ITEM])}</main></body></html>`;
    await page.setContent(html);
  });

  test("1행에 태그·대상·행동이 나란히 있고 금액·이유는 그 아래 줄에 있다", async ({ page }) => {
    const row = page.locator(".item").first();
    await expect(row).toBeVisible();
    const box = async (selector: string) => {
      const b = await row.locator(selector).first().boundingBox();
      expect(b, selector).not.toBeNull();
      return b!;
    };
    const tag = await box(".tagSlot");
    const label = await box(".label");
    const action = await box(".action");
    const amount = await box(".amt");
    const reason = await box(".why");

    // 1행: 태그·대상·행동의 윗변이 같은 줄(±8px)에 있고 왼쪽에서 오른쪽 순서다.
    expect(Math.abs(tag.y - label.y)).toBeLessThanOrEqual(8);
    expect(Math.abs(action.y - label.y)).toBeLessThanOrEqual(8);
    expect(tag.x).toBeLessThan(label.x);
    expect(label.x + 1).toBeLessThan(action.x);

    // 2행: 금액·이유가 같은 줄에 나란히(금액이 왼쪽), 1행 아래에 있다.
    const firstLineBottom = Math.max(tag.y + tag.height, label.y + label.height, action.y + action.height);
    expect(amount.y).toBeGreaterThanOrEqual(firstLineBottom - 4);
    expect(Math.abs(reason.y - amount.y)).toBeLessThanOrEqual(8);
    expect(amount.x + amount.width).toBeLessThanOrEqual(reason.x + 1);
    // 2행은 대상과 같은 칸(태그 오른쪽)에서 시작한다 — 폰에서 우측 정렬을 풀었다.
    expect(Math.abs(amount.x - label.x)).toBeLessThanOrEqual(1);
  });

  test("가로 스크롤이 없고 행동 링크의 누르는 영역이 위아래로 44 이상이다 (§10)", async ({ page }) => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    const link = page.locator(".action a").first();
    await expect(link).toHaveAttribute("href", "/expenses/1");
    // 링크 상자는 글자 높이만큼이다 — 밑줄(border-bottom)이 글자 바로 아래에 그려지려면 padding이 없어야 한다(#321 재검토: padding 12가 밑줄을 이유 글자 쪽으로 15px 내려 보냈다).
    // 누르는 영역은 ::after가 늘리므로 상자 높이 대신 링크 가운데 세로선에서 elementFromPoint가 링크를 가리키는 구간의 길이로 잰다.
    const reach = await link.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      let top = Number.POSITIVE_INFINITY;
      let bottom = Number.NEGATIVE_INFINITY;
      for (let y = Math.max(0, Math.floor(rect.top) - 30); y <= Math.ceil(rect.bottom) + 30; y += 1) {
        if (document.elementFromPoint(x, y + 0.5)?.closest("a") === el) {
          top = Math.min(top, y);
          bottom = Math.max(bottom, y + 1);
        }
      }
      return { span: bottom - top, boxHeight: rect.height };
    });
    expect(reach.span, `누르는 영역 ${reach.span}px`).toBeGreaterThanOrEqual(44);
  });
});

// 06-23 DOM 감사 D-1 — 긴 대상 글자가 무제한으로 꺾이지 않는다(폰은 최대 2줄 말줄임) · 전체 글자는 title로 남는다.
const LONG_ITEM: NextTurnItem = {
  tag: "막힘",
  label:
    "아주 긴 프로젝트 이름이 들어가는 정산 프로젝트 쇼케이스 행사 운영 · 무대 철거 및 원상복구 정산 항목 — 증빙 없음 · 지급 대기",
  reason: "",
  amount: 12_400_000,
  action: { label: "증빙 올리기", href: "/expenses/2#evidence" },
};

test.describe("폰 375 「내 차례」 긴 대상 글자 (06-23 D-1)", () => {
  test.beforeEach(async ({ page }) => {
    const html = `<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width">
<style>${css("docs/design/tokens.css")}</style>
<style>${css("app/globals.css")}</style>
<style>${css("ui/status-tag/StatusTag.module.css")}</style>
<style>${css("ui/next-turn/NextTurn.module.css")}</style>
</head><body><main style="padding: 0 var(--pad-page)">${await renderNextTurn([LONG_ITEM])}</main></body></html>`;
    await page.setContent(html);
  });

  test("대상은 최대 2줄에서 잘리고 전체 글자를 title로 가진다", async ({ page }) => {
    const label = page.locator(".label").first();
    await expect(label).toHaveAttribute("title", LONG_ITEM.label);
    const { height, lineHeight, clipped } = await label.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        height: el.getBoundingClientRect().height,
        lineHeight: parseFloat(style.lineHeight),
        clipped: el.scrollHeight > el.clientHeight,
      };
    });
    expect(height).toBeLessThanOrEqual(lineHeight * 2 + 1);
    expect(clipped).toBe(true);

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});

// 07.1-17(PA2 · C-31 · W4): Phase 6 묶음 줄은 상황을 이유 칸에 둔다 — 폰 375 · 320에서 줄마다 2줄 이하(1줄 label + 2줄 금액 · 이유).
// 픽스처 글자는 `domain/next-turn/phase6-items.ts` 빌더 출력과 같다(단위 시험 `next-turn-phase6.test.ts`가 고정). 금액은 실제 최악에 가까운 아홉 자리.
const PHASE6_ITEMS: NextTurnItem[] = [
  { tag: "오늘", label: "지급 12건", reason: "예정일 지남·오늘 · 확인 전 12건", amount: 0, measureText: "123,456,789", action: { label: "지급 대상 보기", href: "/expenses?status=지급 대상" } },
  { tag: "대기", label: "지급 3건", reason: "이번 주", amount: 0, measureText: "123,456,789", action: { label: "지급 대상 보기", href: "/expenses?status=지급 대상" } },
  { tag: "대기", label: "구매 요청 51건", reason: "신청 · 가장 오래된 09-18", amount: 0, measureText: "57,000,000", action: { label: "구매 요청 보기", href: "/cards/purchases" } },
  { tag: "대기", label: "전표 대기 2건", reason: "결제 완료 · 가장 오래된 10-03", amount: 0, measureText: "", action: { label: "구매 요청 보기", href: "/cards/purchases" } },
  { tag: "오늘", label: "매출 발행 요청 12건", reason: "희망 09-30", amount: 0, measureText: "123,456,789", action: { label: "발행 요청 보기", href: "/projects/issue-requests" } },
  { tag: "막힘", label: "정산 팝업", reason: "완료 전 점검 3건", amount: 0, measureText: "—", action: { label: "점검 보기", href: "/projects/p1#pre-settle-check" } },
];

// 점검표에 옮길 실측 — 통과한 시험은 첨부가 남지 않아 test-results(gitignore)에 한 줄씩 적는다.
function record(kind: string, width: number, rows: LineProbe[]): void {
  mkdirSync(path.join(ROOT, "test-results"), { recursive: true });
  appendFileSync(path.join(ROOT, "test-results", "next-turn-probe.jsonl"), `${JSON.stringify({ kind, width, rows })}\n`);
}

type Box = { x: number; y: number; w: number; h: number };
type LineProbe = { whyScrollWidth: number; rowHeight: number; amt: Box; action: Box; whyBox: Box | null; labelLines: number; whyLines: number; whyClipped: boolean; whyTitle: string | null; whyText: string | null; labelClipped: boolean; labelText: string; overflowX: boolean };

// 이유 칸을 `3 / -1`로 넓힌 뒤에도 안 들어가는 줄 — 폰 320의 지급(오늘) `예정일 지남·오늘 · 확인 전 12건`(건수가 두 자리 이상)에 금액이 아홉 자리면 글자가 이유 칸보다 넓다.
// 그리드 한 줄 수정으로는 못 닫는 갈래라 title(전체 이유)과 잘림 크기 상한(px)만 단언하고 /design-review 항목으로 남긴다. 상한은 실제 서체(Pretendard)로 잰 값이다 —
// 상한을 넘으면(= 더 나빠지면) 실패하고, 0이 되면(= 닫히면) 이 목록에서 뺀다. 잘림 크기 = 이유 span의 scrollWidth − clientWidth.
const KNOWN_CLIPPED_MAX_PX: Record<number, Record<string, number>> = { 320: { "지급 12건": 4 } };
// 같은 줄에 금액이 열 자리(`1,234,567,890`)일 때의 상한 — 실제로는 억 단위 지급이 한 줄에 몰리는 최악이다.
const TEN_DIGIT_CLIPPED_MAX_PX: Record<number, number> = { 375: 0, 320: 15 };

// 이유 칸을 넓히기 전(`grid-column: 3`, 링크 padding 12) 실측 — [x, y, w, h], 줄 위 기준 y. 실제 서체(Pretendard) + 숫자 모듈(Num)로 쟀다.
const LAYOUT_BASELINE: Record<number, Record<string, { rowHeight: number; amt: readonly number[]; action: readonly number[] }>> = {
  375: {
    "정산 팝업": { rowHeight: 67, amt: [57, 37, 12, 21], action: [305, 8, 54, 25] },
    "지급 12건": { rowHeight: 67, amt: [57, 37, 78, 21], action: [276, 8, 83, 25] },
    "매출 발행 요청 12건": { rowHeight: 67, amt: [57, 37, 78, 21], action: [276, 8, 83, 25] },
    "지급 3건": { rowHeight: 67, amt: [57, 37, 78, 21], action: [276, 8, 83, 25] },
    "구매 요청 51건": { rowHeight: 67, amt: [57, 37, 70, 21], action: [276, 8, 83, 25] },
    "전표 대기 2건": { rowHeight: 66, amt: [57, 51, 0, 0], action: [276, 8, 83, 25] },
  },
  320: {
    "정산 팝업": { rowHeight: 67, amt: [57, 37, 12, 21], action: [250, 8, 54, 25] },
    "지급 12건": { rowHeight: 67, amt: [57, 37, 78, 21], action: [221, 8, 83, 25] },
    "매출 발행 요청 12건": { rowHeight: 67, amt: [57, 37, 78, 21], action: [221, 8, 83, 25] },
    "지급 3건": { rowHeight: 67, amt: [57, 37, 78, 21], action: [221, 8, 83, 25] },
    "구매 요청 51건": { rowHeight: 67, amt: [57, 37, 70, 21], action: [221, 8, 83, 25] },
    "전표 대기 2건": { rowHeight: 66, amt: [57, 51, 0, 0], action: [221, 8, 83, 25] },
  },
};

for (const width of [375, 320]) {
  test.describe(`폰 ${width} 「내 차례」 Phase 6 줄 (07.1-17 PA2)`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openPhoneDocument(page, PHASE6_ITEMS);
    });

    async function probe(page: import("@playwright/test").Page): Promise<LineProbe[]> {
      return page.locator(".item").evaluateAll((rows) =>
        rows.map((row) => {
          const lines = (el: Element) => new Set(Array.from((() => { const r = document.createRange(); r.selectNodeContents(el); return r.getClientRects(); })()).map((rect) => Math.round(rect.top))).size;
          const label = row.querySelector<HTMLElement>(".label");
          if (!label) throw new Error("label 없음");
          const why = row.querySelector<HTMLElement>(".why");
          const box = (el: Element): Box => {
            const b = el.getBoundingClientRect();
            return { x: Math.round(b.x), y: Math.round(b.y - row.getBoundingClientRect().y), w: Math.round(b.width), h: Math.round(b.height) };
          };
          const amt = row.querySelector(".amt");
          const action = row.querySelector(".action");
          if (!amt || !action) throw new Error("금액 · 행동 칸 없음");
          return {
            rowHeight: Math.round(row.getBoundingClientRect().height),
            amt: box(amt),
            action: box(action),
            whyBox: why ? box(why) : null,
            whyScrollWidth: why ? why.scrollWidth : 0,
            labelLines: lines(label),
            whyLines: why ? lines(why) : 0,
            whyClipped: why ? why.scrollWidth > why.clientWidth || why.scrollHeight > why.clientHeight : false,
            whyTitle: why ? why.getAttribute("title") : null,
            whyText: why ? (why.textContent ?? "").replace(/^ · /, "") : null,
            labelClipped: label.scrollHeight > label.clientHeight,
            labelText: label.textContent ?? "",
            overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          };
        }),
      );
    }

    test("Phase 6 줄마다 label 1줄 · 이유 1줄(전체 2줄 이하) · 건수 숫자가 보이고 · 말줄임이면 title이 전체 이유", async ({ page }, testInfo) => {
      const rows = await probe(page);
      await testInfo.attach(`probe-${width}`, { body: JSON.stringify(rows, null, 2), contentType: "application/json" });
      record("phase6", width, rows);
      // 줄은 태그 순(막힘 → 오늘 → 결재 → 대기)으로 놓이므로 label로 찾는다. 완료 전 점검 줄(label=프로젝트 이름 · 이유=`완료 전 점검 {n}건` — 사용자 결정 10/28)도 같은 단언을 받는다.
      const phase6 = rows.filter((row) => PHASE6_ITEMS.some((item) => item.label === row.labelText && item.reason !== ""));
      expect(phase6).toHaveLength(PHASE6_ITEMS.filter((item) => item.reason !== "").length);
      for (const row of phase6) {
        expect(row.labelLines, row.labelText).toBe(1);
        expect(row.labelClipped, row.labelText).toBe(false);
        expect(row.whyLines, `${row.labelText} 이유`).toBeLessThanOrEqual(1);
        expect(row.overflowX).toBe(false);
        if (row.whyClipped) expect(row.whyTitle, row.labelText).toBe(row.whyText);
      }
    });

    // #321 화면 게이트: 폰 그리드 2행의 4번째 칸이 비어 이유 칸이 좁아진다 — 이유가 4번째 칸까지 쓰면 잘림 0이어야 하고, 줄 높이와 금액 · 행동 칸 자리는 그대로여야 한다.
    // 기준값은 이유 칸을 넓히기 전(`grid-column: 3`)의 같은 픽스처 실측이다(x · y(줄 위 기준) · w · h).
    test("이유 잘림 0(scrollWidth ≤ clientWidth) · 줄 높이와 금액 · 행동 칸 자리는 그대로", async ({ page }) => {
      const rows = await probe(page);
      record("phase6-layout", width, rows);
      const phase6 = rows.filter((row) => PHASE6_ITEMS.some((item) => item.label === row.labelText && item.reason !== ""));
      expect(phase6).toHaveLength(PHASE6_ITEMS.length);
      for (const row of phase6) {
        const base = LAYOUT_BASELINE[width]?.[row.labelText];
        expect(base, `${width} ${row.labelText} 기준값`).toBeDefined();
        const cap = KNOWN_CLIPPED_MAX_PX[width]?.[row.labelText];
        if (cap !== undefined) {
          const over = row.whyScrollWidth - (row.whyBox?.w ?? 0);
          expect(row.whyTitle, `${width} ${row.labelText} 알려진 잘림 — title은 전체 이유`).toBe(row.whyText);
          expect(over, `${width} ${row.labelText} 잘림 ${over}px — 상한 ${cap}px`).toBeLessThanOrEqual(cap);
        } else expect(row.whyClipped, `${width} ${row.labelText} 이유 잘림`).toBe(false);
        expect(Math.abs(row.rowHeight - (base?.rowHeight ?? -99)), `${row.labelText} 줄 높이`).toBeLessThanOrEqual(1);
        const near = (box: Box, want: readonly number[] | undefined) => [box.x, box.y, box.w, box.h].every((value, i) => Math.abs(value - (want?.[i] ?? -99)) <= 1);
        expect(near(row.amt, base?.amt), `${width} ${row.labelText} 금액 칸 ${JSON.stringify(row.amt)}`).toBe(true);
        expect(near(row.action, base?.action), `${width} ${row.labelText} 행동 칸 ${JSON.stringify(row.action)}`).toBe(true);
      }
    });

    // #321 재검토: 행동 링크의 padding 12가 밑줄(border-bottom)을 글자 아래 15px로 내려, 이유 칸이 4번째 칸까지 넓어진 뒤 밑줄이 이유 글자를 가로지른다(320에서는 취소선처럼 보인다).
    // 밑줄의 y 범위(링크 상자 아래 border 두께)와 이유 글자 상자(칸 안에 보이는 부분)가 겹치지 않아야 한다.
    test("행동 링크 밑줄이 이유 글자를 가로지르지 않는다", async ({ page }) => {
      const crossings = await page.locator(".item").evaluateAll((rows) =>
        rows.flatMap((row) => {
          const link = row.querySelector<HTMLElement>(".action a");
          const why = row.querySelector<HTMLElement>(".why");
          const label = row.querySelector(".label")?.textContent ?? "";
          if (!link || !why) return [];
          const linkRect = link.getBoundingClientRect();
          const border = parseFloat(getComputedStyle(link).borderBottomWidth);
          const underline = { left: linkRect.left, right: linkRect.right, top: linkRect.bottom - border, bottom: linkRect.bottom };
          const whyRect = why.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(why);
          return Array.from(range.getClientRects())
            .map((text) => ({ left: Math.max(text.left, whyRect.left), right: Math.min(text.right, whyRect.right), top: Math.max(text.top, whyRect.top), bottom: Math.min(text.bottom, whyRect.bottom) }))
            .filter((text) => text.right > underline.left && text.left < underline.right && text.bottom > underline.top && text.top < underline.bottom)
            .map((text) => `${label}: 밑줄 y ${underline.top.toFixed(1)}~${underline.bottom.toFixed(1)} x ${underline.left.toFixed(0)}~${underline.right.toFixed(0)} / 이유 글자 y ${text.top.toFixed(1)}~${text.bottom.toFixed(1)}`);
        }),
      );
      expect(crossings, `${width} 밑줄이 이유 글자와 겹친 줄`).toEqual([]);
    });

    // #321 재검토 2: 결재 줄의 열기 단추(.phoneTap)는 ::after로 자기 줄(li) 전체를 덮는다. 다음 줄 링크의 ::after가 위로 너무 늘어나면 그 위에 그려져
    // 결재 줄 아래쪽을 눌러도 시트가 안 열리고 다음 줄로 이동한다. 줄 경계 위아래 5px를 1px씩 눌러, 닿은 행동(링크 · 단추)이 그 점이 속한 줄의 것이어야 한다.
    test("줄 경계 위아래 5px를 누르면 그 줄의 행동이 잡힌다 (결재 줄 단추를 다음 줄 링크가 뺏지 않는다)", async ({ page }, testInfo) => {
      const approval = { ...ITEM, key: "ap1", tag: "결재", label: "지출결의 · 아이오닉9 · 무대설치", reason: "", action: { label: "열기", href: "/approvals" } } as NextTurnItem;
      const slots = { ap1: createElement("button", { type: "button", className: "tertiary phoneTap", "data-home-open": "" }, "열기") };
      await openPhoneDocument(page, [...PHASE6_ITEMS.slice(1, 3), approval, { ...approval, key: "ap2" }], { ...slots, ap2: slots.ap1 });
      const result = await page.locator(".item").evaluateAll((rows) => {
        const stolen: string[] = [];
        const table: string[] = [];
        rows.forEach((row, index) => {
          const next = rows[index + 1];
          if (!next) return;
          const boundary = row.getBoundingClientRect().bottom;
          // 줄 사이 점선(border-bottom 1px)은 어느 줄의 닿는 영역도 아니다 — 소수 좌표에서 픽셀 맞춤으로 이웃 단추에 붙을 수 있어 재지 않는다.
          const divider = parseFloat(getComputedStyle(row).borderBottomWidth);
          const linkRect = (next.querySelector("a") ?? next).getBoundingClientRect();
          // 아랫줄 링크 가운데 세로선(뺏김이 가장 잘 나는 곳)과 줄 가운데 두 곳을 잰다.
          for (const x of [linkRect.left + linkRect.width / 2, window.innerWidth / 2]) {
            for (let delta = -5; delta <= 5; delta += 1) {
              const y = boundary + delta + 0.5;
              if (delta < 0 && y > boundary - divider) continue;
              const owner = delta < 0 ? row : next;
              const action = document.elementFromPoint(x, y)?.closest("a, button");
              const hitRow = action?.closest("li") ?? null;
              table.push(`${index}->${index + 1} x${Math.round(x)} ${delta >= 0 ? "+" : ""}${delta}: ${action ? (hitRow === owner ? "그 줄" : "다른 줄") : "없음"}`);
              if (action && hitRow !== owner) stolen.push(`줄 ${index}/${index + 1} x${Math.round(x)} 경계 ${delta >= 0 ? "+" : ""}${delta}px: ${action.tagName.toLowerCase()} "${(action.textContent ?? "").trim()}"가 ${hitRow === row ? "윗" : "아랫"}줄 행동을 잡음`);
            }
          }
        });
        return { stolen, table };
      });
      await testInfo.attach(`boundary-${width}`, { body: result.table.join("\n"), contentType: "text/plain" });
      expect(result.stolen, `${width} 줄 경계에서 다른 줄 행동이 잡힌 점`).toEqual([]);
    });

    // 금액이 열 자리인 최악 — 잘림이 상한을 넘지 않는다(서체 Pretendard 실측).
    test("지급(오늘) 금액 열 자리 — 이유 잘림 크기가 상한 안이다", async ({ page }) => {
      await openPhoneDocument(page, [{ ...PHASE6_ITEMS[0], measureText: "1,234,567,890" } as NextTurnItem]);
      const rows = await probe(page);
      record("phase6-ten-digit", width, rows);
      const row = rows[0];
      const over = (row?.whyScrollWidth ?? 0) - (row?.whyBox?.w ?? 0);
      expect(over, `${width} 열 자리 잘림 ${over}px — 상한 ${TEN_DIGIT_CLIPPED_MAX_PX[width]}px`).toBeLessThanOrEqual(TEN_DIGIT_CLIPPED_MAX_PX[width] ?? -1);
      if (over > 0) expect(row?.whyTitle).toBe(row?.whyText);
    });

    // 사용자 결정(10/28): 완료 전 점검 줄의 label은 프로젝트 이름만 — 이름이 길면 06-23 D-1 clamp(2줄)가 받는다. 줄 수를 기록하고 2줄 이하만 단언한다(그 이상은 D-1 결정 몫).
    test("완료 전 점검 줄 — 긴 프로젝트 이름은 label 2줄 이내 · 이유 1줄 · 넘침 0 (기록)", async ({ page }, testInfo) => {
      const longName = { ...PHASE6_ITEMS[5], label: "아이오닉9 쇼케이스 행사 운영 정산" } as NextTurnItem;
      await openPhoneDocument(page, [longName]);
      const rows = await probe(page);
      await testInfo.attach(`probe-presettle-long-${width}`, { body: JSON.stringify(rows, null, 2), contentType: "application/json" });
      record("presettle-long", width, rows);
      expect(rows[0]?.labelLines).toBeLessThanOrEqual(2);
      expect(rows[0]?.whyLines).toBe(1);
      expect(rows[0]?.overflowX).toBe(false);
    });

    // P3 notes-C 07.1-17 #3: `.why` 말줄임은 공용 줄이라 결재 · 막힘 줄 이유(픽스처 ITEM `증빙 없음`)도 같은 값을 받는다 — 잘리는지 잰다.
    // 도메인이 만드는 결재 · 막힘 줄은 reason이 빈 글자라 `.why` span이 0개다(`domain/next-turn/index.ts`).
    test("결재 · 막힘 줄(ITEM) 이유 `증빙 없음`은 잘리지 않는다 · 이유가 빈 도메인 줄은 .why가 없다", async ({ page }, testInfo) => {
      await openPhoneDocument(page, [ITEM, { ...ITEM, reason: "", label: "도메인 줄" }]);
      const rows = await probe(page);
      await testInfo.attach(`probe-item-${width}`, { body: JSON.stringify(rows, null, 2), contentType: "application/json" });
      expect(rows[0]?.whyText).toBe("증빙 없음");
      expect(rows[0]?.whyClipped).toBe(false);
      await expect(page.locator(".item").nth(1).locator(".why")).toHaveCount(0);
    });
  });
}

// 07.1-17(PF1 · C-32): 레이아웃의 폰 탭 `내 차례 N`은 결재 시트 재료 없이 센다 — 홈 밖 화면의 N이 홈 목록의 건수(6줄 절단 전 전체)와 같다.
test.describe("폰 탭 `내 차례 N` — 홈 밖과 홈의 건수 (07.1-17 PF1)", () => {
  test.afterAll(async () => {
    await archiveTempRoles();
  });

  test("구매 권한자 — /cards/purchases의 탭 N = 홈 「내 차례」 N", async ({ browser, baseURL }) => {
    const suffix = randomUUID().slice(0, 8);
    const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E폰건수-${suffix}`, workScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.purchases", action: "write", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    for (const infoItem of ["purchase_request.value", "purchase_request.amount", "project.value", "team.value", "vendor.value"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E폰건수본부-${suffix}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E폰건수팀-${suffix}` });
    const person = await makePerson("폰건수", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);
    await db.insert(purchaseRequests).values({ number: `E2E${suffix}`, linkKind: "team_cost", requestedBy: person.viewer.id, itemName: "폰 건수 물건", estimateAmountKrw: 10_000, status: "requested" });

    const page = await loginPage(browser, baseURL, person, { width: 375, height: 800 });
    const tab = page.getByRole("navigation", { name: "하단 탭" }).getByRole("link", { name: /^내 차례 \d+$/ });
    await page.goto("/cards/purchases");
    await expect(tab).toBeVisible();
    const outside = Number(/(\d+)$/.exec((await tab.textContent()) ?? "")?.[1]);

    await page.goto("/");
    const heading = page.getByRole("heading", { level: 2, name: /^내 차례 \d+$/ });
    await expect(heading).toBeVisible();
    const home = Number(/(\d+)$/.exec((await heading.textContent()) ?? "")?.[1]);
    expect(outside).toBeGreaterThanOrEqual(1);
    expect(outside).toBe(home);
    await expect(tab).toHaveText(`내 차례 ${home}`);
    await page.context().close();
  });
});
