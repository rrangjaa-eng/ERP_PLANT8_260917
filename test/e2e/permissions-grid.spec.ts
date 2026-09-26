import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// ADMN-01, D-40, 성공 기준 2: 권한표 셀을 켜면 저장 버튼 없이 즉시 저장되고
// 다른 계급의 실제 접근이 바뀐다는 end-to-end 증명.
test.describe("권한표 격자 (ADMN-01, D-40, 성공 기준 2)", () => {
  test("셀을 켜면 저장 버튼 없이 즉시 저장되고, 그 계급이 실제로 코드표 화면에 들어갈 수 있게 된다", async ({
    page,
    browser,
  }) => {
    // E2E는 전역 setup에서 한 번만 시드되고 스펙 파일 사이에 DB 상태를
    // 초기화하지 않는다(통합 테스트와 다름) — 다른 스펙 파일과 병렬 워커로
    // 같은 DB를 공유하므로, 기존 계급(role-pm)의 권한을 여기서 바꾸면
    // code-tables.spec.ts의 "기획 PM은 404" 가정이 실행 순서·타이밍에 따라
    // 깨진다. 이 테스트 전용 임시 계급을 만들어 완전히 격리한다.
    //
    // 03-04: 이름을 매 실행 고유(UUID 접미사)로 만들고 finally에서 보관
    // 처리한다 — 원래 정적 이름("E2E 임시 계급")을 보관하지 않으면
    // roles_name_unique가 다음 로컬 실행에서 충돌한다(멱등하지 않은 사전
    // 존재 결함, 03-03 산출 — 공유 계급은 건드리지 않고 이 스펙만 고친다).
    const tempRoleId = `role-e2e-perm-${randomUUID()}`;
    const tempRoleName = `E2E 임시 계급 ${tempRoleId.slice(-12)}`;
    await insertRole(SYSTEM_VIEWER, { id: tempRoleId, name: tempRoleName, sortOrder: 99 });

    try {
      const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

      await page.goto("/login");
      await page.getByLabel("이메일").fill(admin.email);
      await page.getByLabel("비밀번호").fill(admin.password);
      await page.getByRole("button", { name: "로그인" }).click();
      await expect(page).toHaveURL(/\/account$/);

      const response = await page.goto("/admin/permissions");
      expect(response?.status()).toBe(200);

      const cell = page.getByRole("checkbox", { name: `${tempRoleName} · 코드표 · 보기` });
      await expect(cell).not.toBeChecked();

      // 「일괄 저장」 버튼이 없다 — 셀 하나가 곧 저장이다(성공 기준 2).
      await expect(page.getByRole("button", { name: /일괄 저장/ })).toHaveCount(0);

      await cell.check();
      // 저장 버튼을 누르지 않고 상태가 켜진 것을 확인한다 — 클릭 자체가 저장이다.
      await expect(cell).toBeChecked();

      // 같은 브라우저 컨텍스트를 버리고 방금 켠 계급의 픽스처로 로그인한다.
      const tempUser = await createFixtureUser({ roleId: tempRoleId });
      const tempContext = await browser.newContext();
      const tempPage = await tempContext.newPage();
      await tempPage.goto("/login");
      await tempPage.getByLabel("이메일").fill(tempUser.email);
      await tempPage.getByLabel("비밀번호").fill(tempUser.password);
      await tempPage.getByRole("button", { name: "로그인" }).click();
      await expect(tempPage).toHaveURL(/\/account$/);

      const tempResponse = await tempPage.goto("/admin/code-tables");
      expect(tempResponse?.status()).toBe(200);

      await tempContext.close();
    } finally {
      // 하드 DELETE 금지 — 보관 처리해 다음 로컬 실행에서 이름 UNIQUE
      // 충돌을 만들지 않는다. listRoles()는 기본적으로 보관된 계급을
      // 제외하므로 다른 스펙에 영향을 주지 않는다.
      await setRoleArchived(SYSTEM_VIEWER, tempRoleId, true);
    }
  });

  test("권한 없는 계급은 권한표 화면 자체에서 404를 받는다", async ({ page }) => {
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/permissions");
    expect(response?.status()).toBe(404);
  });

  test("셀 체크박스의 접근성 라벨이 좌표 세 조각(계급·메뉴·동작)을 담는다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/permissions");

    await expect(page.getByRole("checkbox", { name: "시스템 관리자 · 코드표 · 보기" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "시스템 관리자 · 코드표 · 쓰기" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "시스템 관리자 · 코드표 · 승인" })).toBeVisible();
  });

  // 회귀: PermissionGrid.module.css의 .wrap이 overflow-x: auto만 갖고 높이
  // 제약이 없어 세로로 넘칠 수 없었다(scrollHeight === clientHeight 항상) —
  // 그런데 overflow-x: auto는 overflow-y도 auto로 계산시켜 .wrap이 자손의
  // sticky 컨테이닝 블록이 된다. 결과: .colHeader/.corner의
  // `position: sticky; top: 0`이 절대 스크롤하지 않는 컨테이너를 기준으로
  // 계산돼 아무 효과가 없고, 대신 문서가 스크롤되며 머리글이 그대로 함께
  // 밀려난다. 시드 계급이 5종뿐이라 평소엔 세로로 넘치지 않아 발견되지
  // 않았다 — 이 테스트는 임시 계급을 다수 만들어 강제로 재현한다.
  test("세로 스크롤 시 2단 열 머리글이 화면 위에 고정된다 (§7-13 sticky 계약, 회귀)", async ({ page }) => {
    const prefix = `role-e2e-vscroll-${randomUUID()}`;
    const tempRoleIds: string[] = [];
    // 시드 5종 + 이 25종 = 30행 — 스크린샷 에이전트가 재현에 쓴 20종보다
    // 여유를 두어, 어떤 max-height 값을 고르든 확실히 넘치게 한다.
    for (let i = 0; i < 25; i += 1) {
      const id = `${prefix}-${i}`;
      await insertRole(SYSTEM_VIEWER, { id, name: `E2E 세로스크롤 ${prefix.slice(-12)}-${i}`, sortOrder: 200 + i });
      tempRoleIds.push(id);
    }

    try {
      const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
      await page.goto("/login");
      await page.getByLabel("이메일").fill(admin.email);
      await page.getByLabel("비밀번호").fill(admin.password);
      await page.getByRole("button", { name: "로그인" }).click();
      await expect(page).toHaveURL(/\/account$/);

      await page.goto("/admin/permissions");

      // 좌상단 모서리 셀 — 두 sticky(top·left)가 겹치는 자리이자 §7-13이
      // 「배경이 끊기지 않게」 계약한 지점. 접근성 이름이 "계급"인 것은
      // aria-hidden이 아닌 실제 열 머리글 행의 corner뿐이다(그룹 머리글 행의
      // corner는 aria-hidden="true"라 접근성 트리에서 제외된다).
      const cornerHeader = page.getByRole("columnheader", { name: "계급", exact: true });
      await expect(cornerHeader).toBeVisible();

      // 표의 바로 위 부모 div가 §7-13의 스크롤 컨테이너(.wrap)다 — 해시된
      // CSS 모듈 클래스 이름에 의존하지 않고 구조로 찾는다.
      const wrap = page.locator("table").first().locator("xpath=..");

      const beforeBox = await cornerHeader.boundingBox();
      if (!beforeBox) throw new Error("스크롤 전 열 머리글 bounding box를 가져오지 못했다");
      const beforeWindowScroll = await page.evaluate(() => window.scrollY);
      const beforeWrapScroll = await wrap.evaluate((el) => el.scrollTop);

      // 휠 좌표는 표가 아니라 .wrap의 화면상 박스 안에서 고른다 — 표는
      // 메뉴(열)가 늘면 .wrap보다 훨씬 넓어져(04-20: 2,515px vs 1,240px)
      // 표 중앙이 .wrap 오른쪽 바깥(스크롤할 것이 없는 문서 여백)에 떨어지고,
      // 그러면 휠이 아무것도 스크롤하지 못해 sticky와 무관하게 실패한다.
      const wrapBox = await wrap.boundingBox();
      if (!wrapBox) throw new Error(".wrap bounding box를 가져오지 못했다");
      // .wrap이 실제로 흡수할 수 있는 세로 스크롤량을 먼저 재서, 그 범위
      // 안에서만 휠을 굴린다 — 범위를 넘겨 굴리면 브라우저가 남는 양을
      // 문서로 체이닝해(정상 동작) 머리글이 아주 조금(수십 px) 같이
      // 움직이는데, 이건 결함이 아니라 스크롤 체이닝의 정상 부작용이라
      // 오탐을 만든다. .wrap이 세로로 전혀 넘치지 않는 결함 상태(수정
      // 전)에서는 이 값이 0에 가까워 아래에서 900px로 폴백한다 — 그래야
      // 결함이 재현했던 전량 문서 체이닝을 그대로 다시 만든다.
      const wrapMaxScroll = await wrap.evaluate((el) => el.scrollHeight - el.clientHeight);
      const deltaY = wrapMaxScroll > 150 ? Math.min(wrapMaxScroll - 50, 900) : 900;
      // 실제 사용자 스크롤과 같은 경로(스크롤 체이닝) — .wrap이 자기 축을
      // 갖든 문서가 스크롤되든 구현을 가정하지 않는다.
      await page.mouse.move(wrapBox.x + wrapBox.width / 2, wrapBox.y + 200);
      await page.mouse.wheel(0, deltaY);

      // sanity: 무언가 실제로 스크롤됐는지 먼저 확인한다(문서 스크롤 +
      // .wrap 내부 스크롤 합산) — 안 그러면 아래 위치 불변 단언이
      // "스크롤이 아예 안 일어나서" 우연히 통과할 수 있다.
      await expect
        .poll(async () => {
          const windowScroll = await page.evaluate(() => window.scrollY);
          const wrapScroll = await wrap.evaluate((el) => el.scrollTop);
          return windowScroll - beforeWindowScroll + (wrapScroll - beforeWrapScroll);
        })
        .toBeGreaterThan(100);

      const afterBox = await cornerHeader.boundingBox();
      if (!afterBox) throw new Error("세로 스크롤 후 열 머리글이 화면에서 사라졌다(DOM 이탈)");

      // 결함(실측): 스크롤한 만큼 머리글이 화면 밖(y<0)으로 밀려난다.
      // 고정이 실제로 동작하면 화면상 y좌표가 스크롤 전후로 거의 그대로여야
      // 하고, 화면 밖으로 나가면 안 된다. CSS 속성이 아니라 기하로 판정한다
      // — position: sticky가 "있기만" 해도 이 값은 바뀌지 않는다.
      expect(afterBox.y).toBeGreaterThanOrEqual(-1);
      expect(Math.abs(afterBox.y - beforeBox.y)).toBeLessThanOrEqual(2);

      // 가로 스크롤(이미 정상 동작하던 축)이 이 수정으로 회귀하지 않았는지
      // 같은 자리에서 이어서 확인한다. 세로와 같은 이유로 .wrap이 흡수할 수
      // 있는 범위 안에서만 굴려 문서 체이닝을 만들지 않는다.
      const beforeScrollLeft = await wrap.evaluate((el) => el.scrollLeft);
      const wrapMaxScrollLeft = await wrap.evaluate((el) => el.scrollWidth - el.clientWidth);
      const deltaX = wrapMaxScrollLeft > 150 ? Math.min(wrapMaxScrollLeft - 50, 900) : 900;
      await page.mouse.wheel(deltaX, 0);
      await expect.poll(async () => wrap.evaluate((el) => el.scrollLeft)).toBeGreaterThan(beforeScrollLeft + 50);

      const afterXBox = await cornerHeader.boundingBox();
      if (!afterXBox) throw new Error("가로 스크롤 후 열 머리글이 화면에서 사라졌다(DOM 이탈)");
      expect(Math.abs(afterXBox.x - afterBox.x)).toBeLessThanOrEqual(2);
    } finally {
      // 하드 DELETE 금지 — 임시 계급은 전부 보관 처리한다. listRoles()는
      // 기본적으로 보관된 계급을 제외하므로 다른 스펙에 영향을 주지 않는다.
      for (const id of tempRoleIds) {
        await setRoleArchived(SYSTEM_VIEWER, id, true);
      }
    }
  });
});
