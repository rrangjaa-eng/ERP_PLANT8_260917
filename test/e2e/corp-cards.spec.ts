import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { expectGapsAtLeastToken, expectNoRowOverflow, loginAsSysadmin, textLineCount } from "./row-actions-helpers";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { findUserByEmail } from "@/repositories/users";
import { insertCorpCard, setCorpCardActive } from "@/repositories/corp-cards";

// MAST-03: 법인카드를 개인/팀 구분과 함께 등록·비활성화할 수 있고, 소지자와
// 팀이 동시에 채워진 카드를 만들 수 없다는 것을 화면·액션·domain 세 곳에서
// 막는다.
test.describe("법인카드 관리 화면 (MAST-03)", () => {
  test("개인 카드·팀 카드 등록, 중복 거부, 비활성 토글, 기본 계급 404", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // 이 카드 화면이 참조할 소지자·팀이 존재해야 하므로 먼저 사람 한 명을 등록한다.
    // 2026-09-21 스테이징 QA 수정: 등록 폼이 기본 진입에는 없다(§6-1) —
    // 목록 머리글의 「사람 등록」이 그 폼을 연다.
    await page.goto("/admin/people");
    await page.getByRole("link", { name: "사람 등록" }).click();
    const holderEmail = `e2e-card-holder-${Date.now()}@example.test`;
    await page.getByLabel("이름").fill("카드소지자");
    await page.getByLabel("이메일").fill(holderEmail);
    await page.getByLabel("계급").selectOption(DEFAULT_ROLE_ID);
    await page.getByLabel("입사일").fill("2026-01-01");
    await page.getByRole("button", { name: "사람 등록" }).click();
    await expect(page.getByText(`초기 비밀번호 — ${holderEmail}`)).toBeVisible();

    const response = await page.goto("/admin/corp-cards");
    expect(response?.status()).toBe(200);

    // 등록 폼은 기본 진입에는 없고(§6-1) 목록 머리글의 「법인카드 등록」이 옆 패널로 연다. 04.6-15(UQ-8 B): 등록에 성공하면 패널이 열린 채
    // 칸이 비고 첫 칸에 포커스가 가므로 아래 세 번 등록에 한 번만 열면 된다.
    await expect(page.getByLabel("발급사")).toHaveCount(0);
    await page.getByRole("link", { name: "법인카드 등록" }).click();
    const dialog = page.locator('dialog[data-ui="side-panel"]');
    await expect(dialog).toBeVisible();

    const issuer = `E2E카드사-${Date.now()}`;
    const last4 = String(Math.floor(1000 + Math.random() * 9000));

    // 개인 카드 등록
    await dialog.getByLabel("발급사").fill(issuer);
    await dialog.getByLabel("뒤 4자리").fill(last4);
    await dialog.getByLabel("별칭").fill("개인카드1");
    await dialog.getByLabel("종류").selectOption("personal");
    await dialog.getByLabel("소지자").selectOption({ label: "카드소지자" });
    await dialog.getByRole("button", { name: "법인카드 등록" }).click();
    // UQ-8 B + R9 D: 패널은 열린 채 칸이 비고 첫 칸에 포커스, 행동 줄 위에 결과 한 줄(상세 화면이 없는 대상).
    await expect(dialog.getByRole("status")).toHaveText("법인카드 등록됨");
    await expect(dialog.getByLabel("발급사")).toHaveValue("");
    await expect(dialog.getByLabel("발급사")).toBeFocused();

    // 같은 발급사·뒤 4자리로 다시 등록하면 거부
    await dialog.getByLabel("발급사").fill(issuer);
    await dialog.getByLabel("뒤 4자리").fill(last4);
    await dialog.getByLabel("별칭").fill("중복카드");
    await dialog.getByLabel("종류").selectOption("personal");
    await dialog.getByLabel("소지자").selectOption({ label: "카드소지자" });
    await dialog.getByRole("button", { name: "법인카드 등록" }).click();
    // defect 1 회귀 방지: 예전에는 이 자리에 drizzle의 원시 SQL·바인딩 값(내부 user id 포함)이 그대로 떴다. 이제 운영자가 읽을 수 있는
    // 문장만 나가야 한다. 서버 오류는 패널 행동 줄 위 한 줄(PanelForm `reason`)로 그려진다.
    const alert = dialog.locator("p").filter({ hasText: "이미 등록된 카드" });
    await expect(alert).toBeVisible();
    await expect(alert).toHaveText("이미 등록된 카드 · 발급사와 뒤 4자리 확인");
    await expect(alert).not.toContainText("insert into");
    await expect(alert).not.toContainText("params:");

    // 팀 카드 등록
    const teamIssuer = `E2E팀카드사-${Date.now()}`;
    const teamLast4 = String(Math.floor(1000 + Math.random() * 9000));
    await dialog.getByLabel("발급사").fill(teamIssuer);
    await dialog.getByLabel("뒤 4자리").fill(teamLast4);
    await dialog.getByLabel("별칭").fill("팀카드1");
    await dialog.getByLabel("종류").selectOption("team");
    await dialog.getByLabel("팀").selectOption({ label: "기획본부 · 기획1팀" });
    await dialog.getByRole("button", { name: "법인카드 등록" }).click();
    await expect(dialog.getByRole("status")).toHaveText("법인카드 등록됨");

    // 목록 단언은 패널을 닫은 뒤 — 칸을 비운 채라 Esc는 확인 없이 닫힌다(DR1 A).
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // 발급사는 폰 접힌 줄에도 한 번 더 있어 칸 이름이 정확히 같은 셀로 잡는다.
    await expect(page.getByRole("cell", { name: issuer, exact: true })).toBeVisible();
    await expect(page.getByText("개인카드1")).toBeVisible();
    await expect(page.getByText("팀카드1")).toBeVisible();

    // 개인카드1을 비활성화하면 기본 목록에서 사라지고 "숨김 포함"으로 다시 보인다
    const row = page.locator("tr", { hasText: "개인카드1" });
    await row.getByRole("button", { name: "비활성화" }).click();
    await expect(page.getByText("개인카드1")).toHaveCount(0);

    await page.getByRole("link", { name: "숨김 포함" }).click();
    await expect(page.getByText("개인카드1")).toBeVisible();
  });

  // 소지자를 고른 뒤 종류를 팀으로 바꾸면 팀 칸이 첫 팀으로 저절로 골라지던
  // 결함의 회귀 — 팀 칸은 빈 값으로 남아 제출이 막혀야 한다.
  test("소지자를 고른 뒤 종류를 팀으로 바꾸면 팀 칸은 비어 있다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/corp-cards?new=1");
    await page.getByLabel("소지자").selectOption({ index: 1 });
    await page.getByLabel("종류").selectOption("team");

    const state = await page.getByLabel("팀").evaluate((el) => {
      const select = el as HTMLSelectElement;
      return { value: select.value, valid: select.checkValidity() };
    });
    expect(state.value).toBe("");
    expect(state.valid).toBe(false);
  });

  test("기본 계급(기획 PM)으로는 법인카드 화면이 404다", async ({ page }) => {
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/corp-cards");
    expect(response?.status()).toBe(404);
  });
});

// 260930-f3l /design-review FINDING-001: 법인카드 표 행 동작 「수정 · 비활성화 · 삭제」 사이 가로 간격이 0px라 한 낱말처럼 읽혔다.
// 사람 목록(PR #108)의 .rowActions 규칙(--s-4)을 같은 이름으로 적용한다(SYSTEM §6-1). 700은 .rowActions가 nowrap을 지키는 가장 좁은 폭(D3).
test.describe("법인카드 행 동작 간격 --s-4 (260930-f3l FINDING-001)", () => {
  async function seed(): Promise<{ target: string; cleanup: () => Promise<void> }> {
    const stamp = randomUUID().slice(0, 8);
    const holder = await findUserByEmail(SYSTEM_VIEWER, (await createFixtureUser({ roleId: DEFAULT_ROLE_ID })).email);
    const issuer = `간격카드사-${stamp}`;
    // 다른 열이 긴 행이 있어야 동작 칸이 눌린다 — 앞 테스트가 남긴 데이터에 기대지 않는다.
    const long = await insertCorpCard(SYSTEM_VIEWER, {
      issuer,
      numberLast4: "1111",
      label: `${"가".repeat(60)}${stamp}`,
      kind: "personal",
      holderUserId: holder!.id,
    });
    const target = await insertCorpCard(SYSTEM_VIEWER, {
      issuer,
      numberLast4: "2222",
      label: `간격대상-${stamp}`,
      kind: "personal",
      holderUserId: holder!.id,
    });
    return {
      target: target.label,
      cleanup: async () => {
        await setCorpCardActive(SYSTEM_VIEWER, long.id, false);
        await setCorpCardActive(SYSTEM_VIEWER, target.id, false);
      },
    };
  }

  for (const width of [1280, 768, 700]) {
    test(`${width}: 수정 · 비활성화 · 삭제 사이가 한 줄에서 --s-4 이상이고 표가 넘치지 않는다`, async ({ page }) => {
      const { target, cleanup } = await seed();
      try {
        await page.setViewportSize({ width, height: 800 });
        await loginAsSysadmin(page);
        await page.goto("/admin/corp-cards");
        const row = page.locator("tr", { hasText: target });
        const edit = row.getByRole("link", { name: "수정" });
        const deactivate = row.getByRole("button", { name: "비활성화" });
        const remove = row.getByRole("button", { name: "삭제" });
        await expectNoRowOverflow(page, row, `${width}px 일반 상태`);
        const gaps = await expectGapsAtLeastToken(page, [edit, deactivate, remove], `${width}px`);
        expect(gaps.every((item) => item.horizontal), `${width}px 한 줄`).toBe(true);
        expect(await textLineCount(edit), "「수정」 글자 줄 수").toBe(1);
      } finally {
        await cleanup();
      }
    });
  }

  // TODOS 173 · M15: 폰에서 열 우선순위(별칭 · 뒤 4자리 · 동작 = P1, 나머지 P2)로 동작 칸 폭을 늘려 삭제 확인 문구가 거래처 수준 줄 수다.
  // 375 ≤ 5줄 · 320 ≤ 7줄(거래처 실측 5/7). 옛 판은 375/320에서 10/11줄이었다.
  const confirmLineCaps: Record<number, number> = { 375: 5, 320: 7 };
  for (const width of [320, 375, 700, 768, 1024, 1280]) {
    test(`${width}: 「삭제」를 누른 뒤에도 페이지와 표가 가로로 넘치지 않는다`, async ({ page }) => {
      const { target, cleanup } = await seed();
      try {
        await page.setViewportSize({ width, height: 800 });
        await loginAsSysadmin(page);
        await page.goto("/admin/corp-cards");
        const row = page.locator("tr", { hasText: target });
        await row.getByRole("button", { name: "삭제" }).click();
        await expect(row.getByRole("button", { name: "취소" })).toBeVisible();
        await expectNoRowOverflow(page, row, `${width}px 확인 상태`);
        const cap = confirmLineCaps[width];
        if (cap !== undefined) {
          const lines = await textLineCount(row.getByText(/보관함으로 이동합니다/));
          test.info().annotations.push({ type: "삭제 확인 줄 수", description: `${width}px ${lines}줄(상한 ${cap})` });
          expect(lines, `${width}px 삭제 확인 문구 ${lines}줄(상한 ${cap})`).toBeLessThanOrEqual(cap);
        }
      } finally {
        await cleanup();
      }
    });
  }
});

// 04.6-15 — 법인카드 등록 · 소유자 변경이 목록을 밀지 않는 옆 패널로 열린다(SC 3 · 공통 §6). UQ-8 B · R9 D · DR1 A.
// 카드는 고정 접두 별칭으로 만들고 끝에 비활성화한다(다른 스펙의 목록·폭 단언을 건드리지 않는다).
const PANEL = 'dialog[data-ui="side-panel"]';

async function seedOwnedCard(tag: string): Promise<{ id: string; label: string; cleanup: () => Promise<void> }> {
  const stamp = randomUUID().slice(0, 8);
  const holder = await findUserByEmail(SYSTEM_VIEWER, (await createFixtureUser({ roleId: DEFAULT_ROLE_ID })).email);
  const card = await insertCorpCard(SYSTEM_VIEWER, {
    issuer: `패널카드사-${stamp}`,
    numberLast4: String(Math.floor(1000 + Math.random() * 9000)),
    label: `패널${tag}-${stamp}`,
    kind: "personal",
    holderUserId: holder!.id,
  });
  return { id: card.id, label: card.label, cleanup: () => setCorpCardActive(SYSTEM_VIEWER, card.id, false).then(() => undefined) };
}

test.describe("법인카드 옆 패널 (04.6-15)", () => {
  test("「법인카드 등록」이 패널로 열리고 바뀐 칸 없이 닫으면 여는 링크로 포커스가 돌아온다", async ({ page }) => {
    const card = await seedOwnedCard("열기");
    try {
      await loginAsSysadmin(page);
      const response = await page.goto("/admin/corp-cards");
      expect(response?.status(), "목록 응답(R1)").toBe(200);
      const open = page.getByRole("link", { name: "법인카드 등록" });
      await open.click();
      await expect(page.locator(PANEL)).toBeVisible();
      await expect(page).toHaveURL(/\?new=1$/);
      // 여는 요소는 패널이 열려도 목록에 남는다(R4) — 숨김 조건이 없다.
      await expect(open).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(page.locator(PANEL)).toHaveCount(0);
      await expect(open).toBeFocused();
    } finally {
      await card.cleanup();
    }
  });

  test("행 「수정」이 소유자 변경 패널을 열고 성공하면 닫히며 그 행의 「수정」으로 포커스가 간다(UQ-8 B · R9 D)", async ({ page }) => {
    const card = await seedOwnedCard("소유");
    try {
      await loginAsSysadmin(page);
      await page.goto("/admin/corp-cards");
      const row = page.locator("tr", { hasText: card.label });
      await row.getByRole("link", { name: "수정" }).click();
      const dialog = page.locator(PANEL);
      await expect(dialog).toBeVisible();
      await expect(page).toHaveURL(/[?&]editId=/);
      await expect(dialog.getByRole("button", { name: "소유자 변경" })).toBeVisible();
      // 소유자를 팀으로 바꾸고 저장한다 — 패널이 닫히고 포커스가 그 행의 「수정」이다.
      await dialog.getByLabel("종류").selectOption("team");
      await dialog.getByLabel("팀").selectOption({ index: 1 });
      await dialog.getByRole("button", { name: "소유자 변경" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator("tr", { hasText: card.label }).getByRole("link", { name: "수정" })).toBeFocused();
    } finally {
      await card.cleanup();
    }
  });

  test("칸을 바꾼 채 Esc는 「입력 버리기」 확인 창이고 칸을 비운 채면 바로 닫힌다(DR1 A)", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/corp-cards?new=1");
    const dialog = page.locator(PANEL);
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("별칭").fill("버릴 입력");
    await page.keyboard.press("Escape");
    const confirm = page.getByRole("dialog", { name: "입력 버리기" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "입력 버리기" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("패널 select는 PC 1280에서도 라벨 아래 · 칸 전폭이다(M2 ③)", async ({ page }) => {
    const card = await seedOwnedCard("배치");
    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      await loginAsSysadmin(page);
      for (const url of ["/admin/corp-cards?new=1", `/admin/corp-cards?editId=${card.id}`]) {
        await page.goto(url);
        const dialog = page.locator(PANEL);
        await expect(dialog).toBeVisible();
        // 칸 묶음(PanelForm 본문) — select 폭이 이 폭과 같다.
        const body = dialog.locator("form > div").first();
        // 모션이 끝난 뒤 잰다.
        await expect.poll(() => dialog.evaluate((el) => el.getAnimations().length)).toBe(0);
        // 칸 묶음의 안쪽 폭(좌우 패딩 뺀 폭) — select 폭이 이 폭과 같다.
        const bodyInner = await body.evaluate((el) => {
          const style = getComputedStyle(el);
          return el.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        });
        for (const name of ["종류", "소지자"]) {
          const select = dialog.getByLabel(name);
          const label = dialog.locator(`label[for="${await select.getAttribute("id")}"]`);
          const selectBox = (await select.boundingBox())!;
          const labelBox = (await label.boundingBox())!;
          expect(labelBox.y + labelBox.height, `${url} ${name} 라벨이 select 위`).toBeLessThanOrEqual(selectBox.y + 0.5);
          expect(Math.abs(selectBox.width - bodyInner), `${url} ${name} select 폭 ${selectBox.width} ≠ 패널 본문 폭 ${bodyInner}`).toBeLessThanOrEqual(1);
        }
      }
    } finally {
      await card.cleanup();
    }
  });
});
