import { test, expect, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { recordRestoreRehearsal } from "@/domain/ops/restore-rehearsal";
import { SYSTEM_VIEWER } from "@/domain/viewer";

test.describe("관리자 시스템 상태 화면 (OPS-06, D-17, D-18)", () => {
  test("권한표에 시스템 상태 보기 권한이 없는 계급이 접근하면 404를 받는다", async ({ page }) => {
    const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/system-status");
    expect(response?.status()).toBe(404);
  });

  test("시스템 관리자는 배포 버전·DB 커넥션·마지막 백업을 보고 배너는 없다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/system-status");
    expect(response?.status()).toBe(200);

    await expect(page.getByText("배포 버전")).toBeVisible();
    await expect(page.getByText("DB 커넥션")).toBeVisible();
    await expect(page.getByText("마지막 백업")).toBeVisible();
    // 로컬 개발 환경은 GCP_PROJECT_ID/CLOUD_SQL_INSTANCE_ID가 없어 "확인 불가"다.
    await expect(page.getByText("확인 불가")).toBeVisible();
    // 04.2-13 (18A · D-711): 알림 발송·이메일 두 줄. E2E 환경에는 SMTP 값이 없다.
    // 이메일 값은 「미설정」으로 시작만 단언한다 — 같은 DB를 쓰는 holidays.spec.ts의
    // B2 준비가 결과 꼬리를 붙일 수 있다(꼬리 정확 일치는 holidays.spec.ts).
    const notifyValue = page.locator("dt", { hasText: /^알림 발송$/ }).locator("xpath=following-sibling::dd[1]");
    await expect(notifyValue).toHaveText(
      /^(기록 없음 — 첫 알림 발송 전|\d{4}-\d{2}-\d{2} \d{2}:\d{2} · (알림 \d+건 · 중복 건너뜀 \d+건 · 남음 \d+건|비영업일 · 보내지 않음))$/,
    );
    const emailValue = page.locator("dt", { hasText: /^이메일$/ }).locator("xpath=following-sibling::dd[1]");
    await expect(emailValue).toHaveText(/^미설정/);
    // Next.js dev 모드는 라우트 변경 안내용 숨은 role=alert 리전을 자체로 렌더한다
    // (접근성 announcer) — 배너 유무는 main 안에서만 확인한다. 04.2-13: 다른 파일의
    // B2 준비와 겹쳐도 깨지지 않게 DB 커넥션 배너 문구만 없다고 단언한다.
    await expect(page.getByText(/DB 커넥션이 한도의/)).toHaveCount(0);
  });
});

// 04.4-05 Task 1(D8-08 · UI-SPEC 「복원 리허설 값 행」 · Color · Responsive 2): 04.4-01이 만든 문구가
// 브라우저에서 그대로 보이고, 「실행 기록」 링크가 사람 목록 「상세」(.detailLink)와 같은 모양이다.
// 행은 테스트 프로세스에서 도메인 함수로 넣는다 — 종료 시각은 모두 같고 최신 1건은 마지막에 넣은 행이다.
const FINISHED_AT = new Date("2026-09-23T18:14:00Z");
const RUN_URL_FAILED = "https://github.com/plant8/erp/actions/runs/123456";

async function insertRehearsal(input: {
  runKey: string;
  failedStage: "restore" | "verify" | "cleanup" | null;
  minutes: number;
  runUrl: string;
}): Promise<void> {
  const result = await recordRestoreRehearsal(SYSTEM_VIEWER, {
    runKey: input.runKey,
    source: "staging",
    succeeded: input.failedStage === null,
    failedStage: input.failedStage,
    backupId: "1758684000000",
    startedAt: new Date(FINISHED_AT.getTime() - input.minutes * 60_000),
    finishedAt: FINISHED_AT,
    runUrl: input.runUrl,
  });
  expect(result.inserted).toBe(true);
}

async function openStatusAsAdmin(page: Page): Promise<Locator> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/admin/system-status");
  return page.locator("dt", { hasText: "복원 리허설" }).locator("xpath=following-sibling::dd[1]");
}

function tokenValue(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim(), name);
}

// 토큰 값(#hex 등)을 브라우저 계산 색 문자열(rgb(...))로 바꿔 비교한다.
function tokenAsColor(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${token})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, name);
}

async function expectNoStatusColors(page: Page, value: Locator): Promise<void> {
  const danger = await tokenAsColor(page, "--danger");
  const success = await tokenAsColor(page, "--success");
  const colors = await value.evaluate((dd) =>
    [dd, ...Array.from(dd.querySelectorAll("*"))].map((el) => getComputedStyle(el).color),
  );
  expect(colors).not.toContain(danger);
  expect(colors).not.toContain(success);
}

test.describe.serial("상태 화면 「복원 리허설」 행 (04.4-05, D8-08)", () => {
  test("기록이 없으면 「마지막 백업」 바로 다음 줄에 빈 문구가 보인다", async ({ page }) => {
    const value = await openStatusAsAdmin(page);
    const labels = await page.locator("dt").allTextContents();
    expect(labels.indexOf("복원 리허설")).toBe(labels.indexOf("마지막 백업") + 1);
    await expect(value).toHaveText("리허설 기록 없음 — 첫 리허설 전");
  });

  test("성공 행은 URL이 있어도 「실행 기록」과 그 앞 구분자가 없다", async ({ page }) => {
    await insertRehearsal({
      runKey: "9001-1",
      failedStage: null,
      minutes: 12,
      runUrl: "https://github.com/plant8/erp/actions/runs/123455",
    });
    const value = await openStatusAsAdmin(page);
    await expect(value).toHaveText("성공 · 스테이징 · 2026-09-24 03:14 · 백업 1758684000000 · 12분");
    await expect(value.locator("a")).toHaveCount(0);

    const backupId = value.locator("span", { hasText: /^1758684000000$/ });
    const style = await backupId.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { whiteSpace: cs.whiteSpace, numeric: cs.fontVariantNumeric };
    });
    expect(style.whiteSpace).toBe("nowrap");
    expect(style.numeric).toContain("tabular-nums");
    await expectNoStatusColors(page, value);
  });

  test("검증 실패 행은 단계와 같은 탭 「실행 기록」 링크를 보인다", async ({ page }) => {
    await insertRehearsal({ runKey: "9002-1", failedStage: "verify", minutes: 4, runUrl: RUN_URL_FAILED });
    const value = await openStatusAsAdmin(page);
    await expect(value).toHaveText(
      "실패 · 검증 · 스테이징 · 2026-09-24 03:14 · 백업 1758684000000 · 4분 · 실행 기록",
    );
    const link = value.getByRole("link", { name: "실행 기록" });
    await expect(link).toHaveAttribute("href", RUN_URL_FAILED);
    expect(await link.getAttribute("target")).toBeNull();

    // .detailLink와 같은 다섯 속성 — 크기 · 굵기 · 색 · 밑줄 · 밑줄 간격.
    const tokens = {
      fontSize: await tokenValue(page, "--fs-sm"),
      fontWeight: await tokenValue(page, "--fw-medium"),
      color: await tokenAsColor(page, "--accent"),
      offset: await tokenValue(page, "--underline-offset"),
    };
    const style = await link.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        color: cs.color,
        decoration: cs.textDecorationLine,
        offset: cs.textUnderlineOffset,
      };
    });
    expect(style.fontSize).toBe(tokens.fontSize);
    expect(style.fontWeight).toBe(tokens.fontWeight);
    expect(style.color).toBe(tokens.color);
    expect(style.decoration).toBe("underline");
    expect(style.offset).toBe(tokens.offset);
    await expectNoStatusColors(page, value);
  });

  test("정리 단계에서 겹친 실패는 저장된 단계 낱말 하나로 보인다", async ({ page }) => {
    await insertRehearsal({ runKey: "9003-1", failedStage: "cleanup", minutes: 9, runUrl: RUN_URL_FAILED });
    const value = await openStatusAsAdmin(page);
    await expect(value).toHaveText(
      "실패 · 정리 · 스테이징 · 2026-09-24 03:14 · 백업 1758684000000 · 9분 · 실행 기록",
    );
    await expectNoStatusColors(page, value);
  });

  // 앞 테스트가 넣은 「정리」 실패 행(URL 있음)을 쓴다 — 이 블록은 순서대로 돈다(retries를 켜면 「기록 없음」과 runKey가 겹친다).
  test.describe("폰 375", () => {
    test.use({ viewport: { width: 375, height: 800 } });

    test("「실행 기록」 링크가 44×44 이상이고 화면 안이며 가로 넘침이 없다", async ({ page }) => {
      const value = await openStatusAsAdmin(page);
      const link = value.getByRole("link", { name: "실행 기록" });
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      );
      expect(overflow).toBe(true);
    });
  });

  // 04.4 UI-REVIEW W3: 폰에서 「실행 기록」 링크(44 상자)가 문장 속 dd 줄 상자를 부풀리지 않는다. 앞 「정리」 테스트가 넣은 행을 쓴다.
  // 폭마다 test를 나누면 앞 실패가 serial로 뒤를 건너뛰므로 한 테스트 안에서 폭을 바꿔 가며 잰다.
  test("폰 360 · 640 — 링크가 dd 줄 상자와 글자 위치를 밀어내지 않고 44×44 화면 안이다", async ({ page }) => {
    const value = await openStatusAsAdmin(page);
    const link = value.getByRole("link", { name: "실행 기록" });
    const measure = () =>
      value.evaluate((dd) => {
        const a = dd.querySelector("a") as HTMLAnchorElement;
        const range = document.createRange();
        range.selectNodeContents(a);
        const rects = Array.from(range.getClientRects());
        const cs = getComputedStyle(dd);
        return {
          ddHeight: dd.getBoundingClientRect().height,
          lineHeight: cs.lineHeight,
          fontSize: cs.fontSize,
          linkTextBottomInDd: (rects[rects.length - 1] as DOMRect).bottom - dd.getBoundingClientRect().top,
        };
      });

    for (const width of [360, 640]) {
      await page.setViewportSize({ width, height: 800 });
      const asIs = await measure();
      await link.evaluate((el) => el.style.setProperty("display", "inline", "important"));
      const reference = await measure();
      await link.evaluate((el) => el.style.removeProperty("display"));
      const detail = JSON.stringify({ width, asIs, reference });

      expect.soft(Math.abs(asIs.ddHeight - reference.ddHeight), detail).toBeLessThanOrEqual(1);
      expect.soft(Math.abs(asIs.linkTextBottomInDd - reference.linkTextBottomInDd), detail).toBeLessThanOrEqual(1);

      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect.soft(box!.width, detail).toBeGreaterThanOrEqual(44);
      expect.soft(box!.height, detail).toBeGreaterThanOrEqual(44);
      expect.soft(box!.x, detail).toBeGreaterThanOrEqual(0);
      expect.soft(box!.x + box!.width, detail).toBeLessThanOrEqual(width);

      // 04.4 DOM 감사 W-A: 44×44 상자 전체가 실제로 링크로 탭된다(다음 항목 dt/dd가 아래쪽을 가리지 않는다).
      const misses = await link.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const missed: string[] = [];
        for (const fx of [0, 0.25, 0.5, 0.75, 1]) {
          for (const fy of [0, 0.25, 0.5, 0.75, 1]) {
            const x = rect.left + 1 + fx * (rect.width - 2);
            const y = rect.top + 1 + fy * (rect.height - 2);
            const hit = document.elementFromPoint(x, y);
            if (!hit || !(hit === el || el.contains(hit))) missed.push(`${x.toFixed(1)},${y.toFixed(1)}`);
          }
        }
        return missed;
      });
      expect.soft(misses, `${detail} 링크가 아닌 적중점`).toEqual([]);
    }
  });
});
