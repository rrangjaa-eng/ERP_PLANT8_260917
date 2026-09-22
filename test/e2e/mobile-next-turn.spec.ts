import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { NextTurnItem } from "@/ui/next-turn/build-next-turn-view";
import { buildNextTurnView } from "@/ui/next-turn/build-next-turn-view";

// 02-VERIFICATION 사람 판정 5 해소: 「내 차례」 폰 두 줄 배치(§7-4)는 D-24로 홈이 항상
// buildNextTurnView([])를 넘겨 실데이터가 생기는 Phase 4까지 한 번도 렌더된 적이 없었다.
// 시연 데이터를 홈에 넣지 않는다는 D-24를 지키면서 실제 컴포넌트·실제 CSS를 375px
// 실브라우저에서 재려면, 컴포넌트를 Node에서 정적 마크업으로 그리고 그 CSS 모듈 원문과
// 토큰을 그대로 얹은 문서를 setContent로 연다. 클래스 이름은 CSS 모듈 해시 대신 원문
// 이름을 쓴다(아래 esbuild 스텁) — 선택자와 마크업이 같은 원문을 보므로 배치 계산은
// 앱과 같다. 파일명 접두어 mobile-*로 mobile-375 프로젝트(375×800)에서만 돈다.

const HERE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(HERE), "../..");

async function renderNextTurn(items: NextTurnItem[]): Promise<string> {
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
    NextTurn: (props: { view: ReturnType<typeof buildNextTurnView> }) => React.ReactElement;
  };
  return renderToStaticMarkup(createElement(NextTurn, { view: buildNextTurnView(items) }));
}

function css(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
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

  test("가로 스크롤이 없고 행동 링크의 터치 목표가 44 이상이다 (§10)", async ({ page }) => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    const link = page.locator(".action a").first();
    await expect(link).toHaveAttribute("href", "/expenses/1");
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
