import { appendFileSync } from "node:fs";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { STATUS_KIND } from "@/ui/status-tag/status-map";

// 06.1-03 Task 4 ② — 독립 DOM 감사(별도 에이전트 · 실행자 아님). 스크린샷 육안 판정 없이 DOM 수치(getComputedStyle ·
// getBoundingClientRect · scrollWidth/clientWidth · aria 속성 · 요소 수)로만 판정한다. 기준 값은 tokens.css를 그 화면에서
// 해석한 값(probe 요소의 computed 값)이고 SYSTEM §6-1 · §7-3 · §7-5 · §7-8 · §7-10 · §7-17-1 글자를 따른다.
//
// 감사 목록 원본(06.1-03-PLAN Task 4 ②):
//  - 폭 1280 · 1024 · 768 · 700 · 375 · 320마다 경로 여섯(/dev/components · ?pick=document · ?pick=evidence · ?panel=evidence ·
//    ?confirm=detach · ?sheet=two-actions)의 문서 scrollWidth <= clientWidth
//  - 낱말 여섯(미공개 · 팀 공개 · 본부 공개 · 붙음 · 확인 필요 · 카드 미등록)의 computed color = --status-{kind}
//  - (G-1) 일괄 등록 변형: 영역 dashed · 높이 96(PC ≥700)/72(폰) · 거절 행 배경 --status-danger-weak · 거절 행 button 0 ·
//    실패 행 「다시 올리기」 1 · aria-live="polite" 슬롯 · accept .xls .xlsx .csv · 영역 글자 · 조각 숫자 색 = DA-20 ·
//    링크 조각 글자 색 = --text-link · 「상쇄 2쌍」이 「이미 등록」 뒤 · 0인 조각 없음 · 80자 파일 이름 행 넘침 없음 ·
//    폰 「파일 고르기」 ≥ 44×44
//  - (G-4) 첫 포커스 = 검색 칸 · ≥700 폭 --dialog-w · <700 아래 시트 · 행동 줄 2차 → 1차 · 폰 버튼 · 행 크기(§7-17-1) ·
//    미리 고른 행 700 + 왼쪽 --accent 선 · 증빙 미리 고름 + 「고른 1건」 · 상한 줄 · 막힌 행 aria-disabled + 2행 이유 ·
//    네이티브 disabled 0 · checkbox · radio · combobox 0 · 단일 거부 줄 + 꼬리 「새로 고침」 + 열린 채 · 상한 때 1차 막히지 않음 ·
//    limit 줄
//  - (G5) ?panel=evidence 폭 480(PC) · 폰 시트 · ?confirm=detach 1차 aria-disabled + aria-describedby 글자
//  - (G1) ?sheet=two-actions 폰 3차 둘 높이 ≥ 44 · 사이 간격 --s-2 · 시트 넘침 없음
//
// AUDIT_OUT 환경 변수가 있으면 측정 줄마다(항목 · 폭 · 실측 · 기대 · 판정) 그 파일에 JSON 한 줄을 덧붙인다(감사 표의 원본).
// 판정은 expect.soft라 한 항목이 빨개도 같은 테스트의 나머지 항목을 끝까지 잰다(직렬 모드 없음 — 실패 뒤 다음 테스트도 돈다).

const WIDTHS = [1280, 1024, 768, 700, 375, 320] as const;
const PHONE = 700; // §7-17-1 · §7-8 — 700 미만이 폰
const WORDS = ["미공개", "팀 공개", "본부 공개", "붙음", "확인 필요", "카드 미등록"] as const;

// DA-20(SYSTEM §7-10 일괄 등록 변형) — 조각 낱말 → 숫자 색 kind.
const DA20: Record<string, string> = {
  등록: "success",
  "카드 사용에 붙음": "success",
  "확인 필요": "warning",
  "짝 없음": "warning",
  "카드 미등록": "danger",
  "이미 등록": "muted",
  상쇄: "muted",
  "거래처 생성": "muted",
  되살림: "muted",
  "이름 다름": "warning",
};


function check(item: string, route: string, width: number, measured: unknown, expected: string, pass: boolean): void {
  const m = typeof measured === "string" ? measured : JSON.stringify(measured);
  if (process.env.AUDIT_OUT) appendFileSync(process.env.AUDIT_OUT, `${JSON.stringify({ item, route, width, measured: m, expected, pass })}\n`);
  test.info().annotations.push({ type: "실측", description: `${route} ${width} ${item} = ${m} (기대 ${expected})` });
  expect.soft(pass, `${route} @${width} — ${item}: 실측 ${m} · 기대 ${expected}`).toBe(true);
}

async function loggedIn(browser: Browser, width: number): Promise<Page> {
  const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

// 토큰을 그 화면에서 해석한 값 — 색은 probe 요소의 computed 값(rgb 꼴), 길이는 computed 길이.
async function tokenColor(page: Page, token: string, prop: "color" | "backgroundColor" = "color"): Promise<string> {
  return page.evaluate(
    ([name, p]) => {
      const probe = document.createElement("div");
      probe.style[p] = `var(${name})`;
      document.body.append(probe);
      const value = getComputedStyle(probe)[p];
      probe.remove();
      return value;
    },
    [token, prop] as const,
  );
}

async function tokenLength(page: Page, token: string): Promise<number> {
  return page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.style.width = `var(${name})`;
    probe.style.position = "absolute";
    document.body.append(probe);
    const value = parseFloat(getComputedStyle(probe).width);
    probe.remove();
    return value;
  }, token);
}

async function docFits(page: Page, route: string, width: number): Promise<void> {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check("문서 가로 넘침 없음", route, width, m, `sw <= cw(${width})`, m.sw <= m.cw);
}

async function fits(locator: Locator, item: string, route: string, width: number): Promise<void> {
  const m = await locator.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  check(item, route, width, m, "sw <= cw", m.sw <= m.cw);
}

async function box(locator: Locator): Promise<{ x: number; y: number; w: number; h: number }> {
  const b = await locator.boundingBox();
  if (!b) throw new Error("상자를 잴 수 없다");
  return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 };
}

const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

async function open(page: Page, path: string): Promise<Locator> {
  await page.goto(path);
  const dialog = page.locator("dialog:modal");
  await expect(dialog).toBeVisible();
  // 여는 움직임(panelIn · sheetIn) 중간에 재면 transform 만큼 어긋난다 — 끝난 뒤 잰다.
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
  return dialog;
}

// 폰 아래 시트(§7-8) 또는 PC 폭 판정 — 대화 상자 · 패널 공통.
async function sheetOrWidth(page: Page, dialog: Locator, route: string, width: number, pcToken: string, label: string): Promise<void> {
  const b = await box(dialog);
  if (width >= PHONE) {
    const w = await tokenLength(page, pcToken);
    check(`${label} 폭 = ${pcToken}`, route, width, b.w, `${w}`, near(b.w, w));
  } else {
    const bottom = Math.round((b.y + b.h) * 10) / 10;
    check(`${label} 아래 시트(아래 가장자리 = 뷰포트 아래 · 전폭)`, route, width, { bottom, w: b.w }, `bottom 900 · w ${width}`, near(bottom, 900) && near(b.w, width));
  }
}

for (const width of WIDTHS) {
  test.describe(`폭 ${width}`, () => {
    let page: Page;
    test.beforeAll(async ({ browser }) => {
      page = await loggedIn(browser, width);
    });
    test.afterAll(async () => {
      await page.context().close();
    });

    test(`/dev/components @${width} — 낱말 여섯 색 · 일괄 등록 변형 · 문서 넘침`, async () => {
      const route = "/dev/components";
      await page.goto(route);
      await expect(page.locator('h1[data-ui="screen-title"]')).toHaveText("컴포넌트 모음");
      await docFits(page, route, width);

      // 낱말 여섯 — tag · text 둘 다 computed color = --status-{kind}
      const badges = page.locator('[data-gallery="status-badges"]');
      for (const word of WORDS) {
        const kind = STATUS_KIND[word];
        const expected = await tokenColor(page, `--status-${kind}`);
        const colors = await badges.getByText(word, { exact: true }).evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
        check(`낱말 「${word}」 색 = --status-${kind}`, route, width, colors, `${expected} ×2`, colors.length === 2 && colors.every((c) => c === expected));
      }

      // G-1 일괄 등록 변형
      const bulk = page.locator('[data-gallery="bulk-import"]');
      const root = bulk.locator('[data-variant="bulk-import"]');
      const drop = root.locator(":scope > div:not([aria-live])").first();
      const dropStyle = await drop.evaluate((el) => {
        const s = getComputedStyle(el);
        return { style: s.borderTopStyle, h: el.getBoundingClientRect().height };
      });
      check("일괄 영역 테두리 dashed", route, width, dropStyle.style, "dashed", dropStyle.style === "dashed");
      const dropH = width >= PHONE ? 96 : 72;
      check("일괄 영역 높이", route, width, dropStyle.h, `${dropH}`, near(dropStyle.h, dropH));

      const danger = await tokenColor(page, "--status-danger-weak", "backgroundColor");
      for (const key of ["size", "format", "lines"]) {
        const row = bulk.locator(`li[data-row="${key}"]`);
        const bg = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
        check(`거절 행(${key}) 배경 = --status-danger-weak`, route, width, bg, danger, bg === danger);
        const buttons = await row.locator("button").count();
        check(`거절 행(${key}) 안 button 수`, route, width, buttons, "0", buttons === 0);
      }
      const retryAll = await bulk.getByRole("button", { name: "다시 올리기" }).count();
      const retryFailed = await bulk.locator('li[data-row="failed"]').getByRole("button", { name: "다시 올리기" }).count();
      check("「다시 올리기」 수(전체 · 실패 행)", route, width, { all: retryAll, failed: retryFailed }, "1 · 1", retryAll === 1 && retryFailed === 1);
      const live = await root.locator('[aria-live="polite"]').count();
      check('결과 슬롯 aria-live="polite"', route, width, live, "1", live === 1);
      const accept = (await root.locator('input[type="file"]').getAttribute("accept")) ?? "";
      check("파일 입력 accept", route, width, accept, ".xls · .xlsx · .csv 포함", [".xls", ".xlsx", ".csv"].every((ext) => accept.split(",").includes(ext)));
      const hint = "파일을 끌어 놓거나 Ctrl+U · 홈택스·카드사 엑셀·CSV 1MB";
      const hintCount = await drop.getByText(hint, { exact: true }).count();
      check("영역 글자", route, width, hintCount, `「${hint}」 1`, hintCount === 1);

      // 조각 숫자 색(DA-20) · 링크 조각 글자 색
      const chips = await bulk.locator("[data-kind]").evaluateAll((els) =>
        els.map((el) => {
          let prev = el.previousSibling;
          while (prev && prev.nodeType === Node.TEXT_NODE && (prev.textContent ?? "").trim().replace(/^·\s*/, "") === "") prev = prev.previousSibling;
          const label = (prev?.textContent ?? "").replace(/^\s*·\s*/, "").trim();
          const link = el.closest("a");
          return { label, value: el.textContent, kind: el.getAttribute("data-kind"), color: getComputedStyle(el).color, linkColor: link ? getComputedStyle(link).color : null };
        }),
      );
      const kindColor: Record<string, string> = {};
      for (const k of ["success", "warning", "danger", "muted", "accent"]) kindColor[k] = await tokenColor(page, `--status-${k}`);
      const linkToken = await tokenColor(page, "--text-link");
      for (const chip of chips) {
        const want = DA20[chip.label];
        const expected = want ? kindColor[want] : "(DA-20 표에 없음)";
        check(`조각 「${chip.label} ${chip.value}」 숫자 색 = ${want ?? "?"}`, route, width, chip.color, `${expected}`, want !== undefined && chip.color === expected);
        if (chip.linkColor !== null) check(`링크 조각 「${chip.label}」 글자 색 = --text-link`, route, width, chip.linkColor, linkToken, chip.linkColor === linkToken);
      }
      const cardText = (await bulk.locator('li[data-row="card"]').textContent()) ?? "";
      const iDone = cardText.indexOf("이미 등록");
      const iOffset = cardText.indexOf("상쇄 2쌍");
      check("「상쇄 2쌍」이 「이미 등록」 뒤", route, width, { 이미등록: iDone, 상쇄: iOffset }, "0 <= 이미등록 < 상쇄", iDone >= 0 && iOffset > iDone);
      const zero = await bulk.getByText(/상쇄 없음|상쇄 0쌍/).count();
      check("0인 조각 글자 수", route, width, zero, "0", zero === 0);
      await fits(bulk.locator('li[data-row="long"]'), "80자+ 파일 이름 행 넘침 없음", route, width);
      if (width < PHONE) {
        const picker = await box(bulk.getByRole("button", { name: /^파일 고르기/ }));
        check("폰 「파일 고르기」 상자 ≥ 44×44", route, width, picker, "w ≥ 44 · h ≥ 44", picker.w >= 44 && picker.h >= 44);
      }
    });

    test(`?pick=document @${width} — 첫 포커스 · 폭/시트 · 미리 고름 · 막힌 행 · 행동 줄 · 단일 거부`, async () => {
      const route = "?pick=document";
      const dialog = await open(page, "/dev/components?pick=document");
      await expect(page.locator('[data-pick-id="d1"]')).toBeVisible();
      await docFits(page, route, width);
      await fits(dialog, "대화 상자 넘침 없음", route, width);
      const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? null);
      check("첫 포커스 = 검색 칸", route, width, focused, "문서 검색", focused === "문서 검색");
      await sheetOrWidth(page, dialog, route, width, "--dialog-w", "대화 상자");

      const accent = await tokenColor(page, "--accent");
      const focusW = await tokenLength(page, "--focus-w");
      const d1 = dialog.locator('[data-pick-id="d1"]');
      const paint = await d1.evaluate((el) => {
        const s = getComputedStyle(el);
        return { weight: s.fontWeight, bw: parseFloat(s.borderLeftWidth), bc: s.borderLeftColor, selected: el.getAttribute("aria-selected") };
      });
      check("미리 고른 행 d1 — 700 · 왼쪽 선 --focus-w --accent · aria-selected", route, width, paint, `700 · ${focusW}px · ${accent} · true`, paint.weight === "700" && near(paint.bw, focusW, 0.1) && paint.bc === accent && paint.selected === "true");

      const d3 = dialog.locator('[data-pick-id="d3"]');
      const blocked = await d3.evaluate((el) => {
        const id = el.getAttribute("aria-describedby");
        const reason = id ? document.getElementById(id) : null;
        return { disabled: el.getAttribute("aria-disabled"), reason: reason?.textContent ?? null, inRow: reason ? el.contains(reason) : false, reasonTop: reason ? reason.getBoundingClientRect().top : 0, titleTop: el.getBoundingClientRect().top };
      });
      check("막힌 행 d3 aria-disabled + 2행 이유", route, width, blocked, "true · 「결재 중 문서 · 결재 끝까지 떼기 없음」 · 행 안 · 제목 아래", blocked.disabled === "true" && blocked.reason === "결재 중 문서 · 결재 끝까지 떼기 없음" && blocked.inRow && blocked.reasonTop > blocked.titleTop + 4);

      const counts = await dialog.evaluate((el) => ({
        nativeDisabled: el.querySelectorAll("[disabled]").length,
        checkbox: el.querySelectorAll('input[type="checkbox"]').length,
        radio: el.querySelectorAll('input[type="radio"]').length,
        combobox: el.querySelectorAll('[role="combobox"]').length,
      }));
      check("네이티브 disabled 수", route, width, counts.nativeDisabled, "0", counts.nativeDisabled === 0);
      check("checkbox · radio · combobox 수", route, width, counts, "0 · 0 · 0", counts.checkbox + counts.radio + counts.combobox === 0);

      await actionRow(page, dialog, route, width, /^이 문서에 붙이기/);
      await rowSize(dialog, route, width, "d2");

      // 단일 거부(Round 2 G4): d5 → 1차 → 거부 줄 · 꼬리 새로 고침 · 열린 채 · 1차 aria-disabled
      await dialog.locator('[data-pick-id="d5"]').click();
      await dialog.getByRole("button", { name: /^이 문서에 붙이기/ }).click();
      await expect(dialog.getByText("이미 다른 문서에 붙음", { exact: true })).toBeVisible();
      const reject = {
        open: await dialog.isVisible(),
        line: await dialog.getByText("이미 다른 문서에 붙음", { exact: true }).count(),
        tail: await dialog.getByRole("button", { name: "새로 고침", exact: true }).count(),
        primary: await dialog.getByRole("button", { name: /^이 문서에 붙이기/ }).getAttribute("aria-disabled"),
      };
      check("단일 거부 — 열린 채 · 거부 줄 · 꼬리 「새로 고침」 · 1차 aria-disabled", route, width, reject, "true · 1 · 1 · true", reject.open && reject.line === 1 && reject.tail === 1 && reject.primary === "true");
      if (width < PHONE) {
        const tail = await box(dialog.getByRole("button", { name: "새로 고침", exact: true }));
        check("폰 꼬리 「새로 고침」 높이 ≥ 44", route, width, tail.h, "≥ 44", tail.h >= 44);
      }
      await docFits(page, `${route}(거부 뒤)`, width);
    });

    test(`?pick=evidence @${width} — 미리 고름 · 고른 1건 · 상한 줄 · 1차 · limit 줄`, async () => {
      const route = "?pick=evidence";
      const dialog = await open(page, "/dev/components?pick=evidence");
      await expect(page.locator('[data-pick-id="e1"]')).toBeVisible();
      await docFits(page, route, width);
      await fits(dialog, "대화 상자 넘침 없음", route, width);
      const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? null);
      check("첫 포커스 = 검색 칸", route, width, focused, "증빙 검색", focused === "증빙 검색");
      await sheetOrWidth(page, dialog, route, width, "--dialog-w", "대화 상자");

      const pre = await dialog.locator("[data-pick-id]").evaluateAll((els) => els.filter((el) => el.getAttribute("aria-selected") === "true").map((el) => el.getAttribute("data-pick-id")));
      const one = await dialog.getByText("고른 1건", { exact: true }).count();
      check("미리 고른 하나 + 결과 줄 「고른 1건」", route, width, { pre, one }, "[e1] · 1", pre.length === 1 && pre[0] === "e1" && one === 1);
      const counts = await dialog.evaluate((el) => ({
        nativeDisabled: el.querySelectorAll("[disabled]").length,
        checkbox: el.querySelectorAll('input[type="checkbox"]').length,
        radio: el.querySelectorAll('input[type="radio"]').length,
        combobox: el.querySelectorAll('[role="combobox"]').length,
      }));
      check("네이티브 disabled 수", route, width, counts.nativeDisabled, "0", counts.nativeDisabled === 0);
      check("checkbox · radio · combobox 수", route, width, counts, "0 · 0 · 0", counts.checkbox + counts.radio + counts.combobox === 0);
      await actionRow(page, dialog, route, width, /^증빙 붙이기/);
      await rowSize(dialog, route, width, "e2");

      // 상한 줄(P2-C2): e2 · e3 → 바닥 줄 상한 글자 · 1차 aria-disabled 없음
      await dialog.locator('[data-pick-id="e2"]').click();
      await dialog.locator('[data-pick-id="e3"]').click();
      await expect(dialog.getByText("3건 상한 · 나눠 붙이기", { exact: true })).toBeVisible();
      const capColor = await dialog.getByText("3건 상한 · 나눠 붙이기", { exact: true }).evaluate((el) => getComputedStyle(el).color);
      const danger = await tokenColor(page, "--status-danger");
      const primaryDisabled = await dialog.getByRole("button", { name: /^증빙 붙이기 3/ }).getAttribute("aria-disabled");
      check("상한 줄 「3건 상한 · 나눠 붙이기」 막힘 톤 · 1차 aria-disabled 없음", route, width, { capColor, primaryDisabled }, `${danger} · null`, capColor === danger && primaryDisabled === null);

      // limit 줄
      await dialog.getByRole("textbox", { name: "증빙 검색" }).fill("넘침");
      await expect(dialog.getByText("20건 넘음 · 검색으로 좁히기", { exact: true })).toBeVisible();
      const limit = { twenty: await dialog.getByText("20건 넘음 · 검색으로 좁히기", { exact: true }).count(), fifty: await dialog.getByText("50건 넘음").count() };
      check("limit 줄 「20건 넘음 · 검색으로 좁히기」 · 50 글자 없음", route, width, limit, "1 · 0", limit.twenty === 1 && limit.fifty === 0);
      await docFits(page, `${route}(상한 · limit 뒤)`, width);
    });

    test(`?panel=evidence @${width} — 패널 폭 480 · 폰 시트`, async () => {
      const route = "?panel=evidence";
      const panel = await open(page, "/dev/components?panel=evidence");
      await expect(panel).toHaveAttribute("data-ui", "side-panel");
      await docFits(page, route, width);
      await fits(panel, "패널 넘침 없음", route, width);
      await sheetOrWidth(page, panel, route, width, "--panel-w", "패널");
      const word = await panel.locator("dd").getByText("확인 필요", { exact: true }).evaluate((el) => getComputedStyle(el).color);
      const warning = await tokenColor(page, "--status-warning");
      check("패널 「확인 필요」 색 = --status-warning", route, width, word, warning, word === warning);
    });

    test(`?confirm=detach @${width} — 사유 빈 동안 1차 aria-disabled + aria-describedby 글자`, async () => {
      const route = "?confirm=detach";
      const dialog = await open(page, "/dev/components?confirm=detach");
      await docFits(page, route, width);
      await fits(dialog, "대화 상자 넘침 없음", route, width);
      const primary = dialog.getByRole("button", { name: /^증빙 떼기/ });
      const m = await primary.evaluate((el) => {
        const ids = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
        return { disabled: el.getAttribute("aria-disabled"), described: ids.map((id) => document.getElementById(id)?.textContent ?? null) };
      });
      check("1차 aria-disabled + aria-describedby 「사유 없음 · 사유 적기」", route, width, m, "true · [사유 없음 · 사유 적기]", m.disabled === "true" && m.described.includes("사유 없음 · 사유 적기"));
      const nativeDisabled = await dialog.locator("[disabled]").count();
      check("네이티브 disabled 수", route, width, nativeDisabled, "0", nativeDisabled === 0);
    });

    test(`?sheet=two-actions @${width} — 3차 둘 높이 · 간격 --s-2 · 시트 넘침`, async () => {
      const route = "?sheet=two-actions";
      const sheet = await open(page, "/dev/components?sheet=two-actions");
      await expect(sheet.getByText("무대 설치 자재", { exact: true })).toBeVisible();
      await docFits(page, route, width);
      await fits(sheet, "시트 넘침 없음", route, width);
      const a = await box(sheet.getByRole("button", { name: "요청 취소", exact: true }));
      const b = await box(sheet.getByRole("button", { name: "증빙 고르기 3", exact: true }));
      const s2 = await tokenLength(page, "--s-2");
      const gap = Math.round((b.y - (a.y + a.h)) * 10) / 10;
      check("3차 둘 세로 쌓기(같은 x · 둘째가 아래)", route, width, { ax: a.x, bx: b.x, ay: a.y, by: b.y }, "ax = bx · by > ay", near(a.x, b.x) && b.y > a.y);
      check("3차 둘 사이 세로 간격 = --s-2", route, width, gap, `${s2}`, near(gap, s2));
      if (width < PHONE) check("폰 3차 둘 높이 ≥ 44", route, width, { a: a.h, b: b.h }, "≥ 44 · ≥ 44", a.h >= 44 && b.h >= 44);
    });
  });
}

// §7-17-1 행동 줄: 결과 줄 · 2차 「취소」(왼쪽) · 1차(오른쪽). 폰은 --touch-min 높이 · 1차가 2차의 두 배 폭.
async function actionRow(page: Page, dialog: Locator, route: string, width: number, primaryName: RegExp): Promise<void> {
  const secondary = await box(dialog.getByRole("button", { name: /^취소/ }));
  const primary = await box(dialog.getByRole("button", { name: primaryName }));
  check("행동 줄 2차 왼쪽 → 1차 오른쪽", route, width, { s: secondary.x, p: primary.x }, "s.x < p.x", secondary.x < primary.x);
  if (width < PHONE) {
    const touch = await tokenLength(page, "--touch-min");
    const ratio = Math.round((primary.w / secondary.w) * 100) / 100;
    check("폰 행동 줄 버튼 높이 = --touch-min", route, width, { s: secondary.h, p: primary.h }, `${touch} · ${touch}`, near(secondary.h, touch) && near(primary.h, touch));
    check("폰 1차 폭 = 2차 두 배", route, width, { s: secondary.w, p: primary.w, ratio }, "ratio 2 (±0.05)", Math.abs(ratio - 2) <= 0.05);
  }
}

// §7-17-1 폰: 행 최소 높이 --touch-min. PC는 기록만(기준 글자 없음 — 항목명 「행 크기(기록)」).
async function rowSize(dialog: Locator, route: string, width: number, id: string): Promise<void> {
  const r = await box(dialog.locator(`[data-pick-id="${id}"]`));
  if (width < PHONE) check(`폰 행 ${id} 높이 ≥ 44`, route, width, r.h, "≥ 44", r.h >= 44);
  else check(`행 ${id} 크기(기록 · PC 기준 글자 없음)`, route, width, { w: r.w, h: r.h }, "기록", true);
}
