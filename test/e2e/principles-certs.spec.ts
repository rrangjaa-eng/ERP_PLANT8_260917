import { test, expect, type Page } from "@playwright/test";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createFixtureUser } from "./fixtures";
import { seedSubmittedCert } from "./helpers/cert";
import { isStrict } from "./design-principles";
import { checkPrinciples } from "./principles-check";

// 04.6-24 Task 3 — 화면 사용성 원칙 막는 모드(R11 · 공통 §10). 확인증 화면은 `certs` 프로젝트에서만 열리고(`*cert*` 스펙 — 기능 스위치 켜짐)
// 자기 데스크톱 스펙이 없어 이 새 파일이 맡는다: 상세 둘 · 로그아웃 `/c/[token]` · 04.6-23이 넘긴 목록 라우트 둘(`/certs/events` ·
// `/certs/events?new=1` 「QR 생성 신청」 패널 — Q2). 라우트마다 `checkPrinciples`를 한 번씩 부르고 바로 뒤 최종 URL이 대상 경로인지 본다 —
// `checkPrinciples`는 응답 ≥400만 실패로 세어 로그인 화면으로 리다이렉트된 200은 통과시킨다(Q17).
// axe · 글자 위계 · 320/768 넘침은 이 스펙이 아니라 04.6-29의 cert 스펙이 잰다(Q5).

type Account = { email: string; password: string };

async function login(page: Page, account: Account): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// 경로 + 쿼리 — 리다이렉트 되었는지 판정에 쓴다.
function locationOf(page: Page): string {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}`;
}

test("화면 사용성 원칙(막는 모드) — 확인증 상세·외부 수령자", async ({ browser }) => {
  const strict = isStrict(process.env.DESIGN_PRINCIPLES_STRICT);
  // 행사 · 제출 · 수령 토큰은 #88 픽스처로 만든다(주민번호 등은 픽스처의 테스트 값뿐).
  const seeded = await seedSubmittedCert();
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

  const loggedRoutes = [
    "/certs/events",
    "/certs/events?new=1",
    `/certs/events/${seeded.eventId}`,
    `/certs/submissions/${seeded.submissionId}`,
  ];
  const measured: string[] = [];

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, admin);
  for (const route of loggedRoutes) {
    await checkPrinciples(adminPage, [route], { strict });
    // Q17 — 로그인 화면(`/login`)으로 리다이렉트된 채 재고 통과하지 않는다.
    expect.soft(locationOf(adminPage), `${route} 최종 주소`).toBe(route);
    measured.push(route);
  }
  await adminContext.close();

  // 로그아웃 컨텍스트 — 셸 없는 외부 수령자 화면.
  const recipientContext = await browser.newContext();
  const recipientPage = await recipientContext.newPage();
  const recipientRoute = `/c/${seeded.token}`;
  // 외부 수령자 화면은 CSS만 바꾸는 플랜이라(T-04.6-61 — 문구·로직 diff 0) 문의 안내 한 문장(`intake-flow.tsx`)을 지울 수 없다.
  // 그 한 문장만 허용하고 다른 경고는 그대로 막는다 — 새 경고가 생기면 이 단언이 깨진다(사용자 질문 후보로 SUMMARY에 적었다).
  const recipientReport = await checkPrinciples(recipientPage, [recipientRoute], { strict: false });
  const unexpected = recipientReport
    .flatMap((r) => r.warnings)
    .filter((w) => !(w.rule === "안내 문구 최소" && w.detail.startsWith("긴 설명 「받은 경품이 목록에 없으면")));
  if (strict) expect.soft(unexpected, `${recipientRoute} 허용 밖 경고`).toEqual([]);
  expect.soft(locationOf(recipientPage), `${recipientRoute} 최종 주소`).toBe(recipientRoute);
  measured.push(recipientRoute);
  await recipientContext.close();

  // 공허 통과 방지 — 상세 둘 · 외부 하나 · 04.6-23 목록 라우트 둘을 모두 훑었다.
  expect(measured).toHaveLength(5);
});
