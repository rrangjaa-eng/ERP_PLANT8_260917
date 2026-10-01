import { test, expect, type Page } from "@playwright/test";
import { createCertEvent } from "./helpers/cert";
import { drawSignature, fillIntakeForm, submitButton } from "./helpers/cert-form";
import { collectCertResponses, leakPatternsFor, scanForLeaks, scannerSelfTest } from "./helpers/cert-leak";

test.use({ viewport: { width: 375, height: 800 } });
test.describe.configure({ mode: "serial" });

// 04.3-15 Task 1 — 수령자 흐름 응답 본문 · 마지막 문서의 가액 누수 검사(사용자 5905714131). 빈 수집으로 통과하지
// 못한다: 양성 대조군(문서 응답 ≥ 1 · next-action POST ≥ 1 · 오른 경품 이름 있음 · 걸러진 경품 이름 없음 · 검출기
// 자체 시험)과 차등 대조군(다른 가액 행사의 말뭉치에 같은 패턴 0건). 칸 오류 응답은 테스트가 만든 본문이 아니라
// 서버가 실제로 돌려준 응답을 스캔한다(eng-review newflow E16).

const A = { name: "누수대조-A", unitValueKrw: 73_519, delivery: "onsite" as const };
const B = { name: "누수대조-B", unitValueKrw: 581_247, delivery: "parcel" as const };
const C = { name: "누수대조-C", unitValueKrw: 49_731, delivery: "onsite" as const };
const PATTERNS = leakPatternsFor([A.unitValueKrw, B.unitValueKrw, C.unitValueKrw]);

async function pickFirstAndSubmit(page: Page, link: string, prizeName: string) {
  await page.goto(link);
  await page.getByRole("listitem").getByRole("button", { name: new RegExp(`^${prizeName}`) }).click();
  await fillIntakeForm(page, { phone: "010-4821-7730" });
  await drawSignature(page);
  await submitButton(page).click();
  await expect(page.getByText("제출되었습니다", { exact: true })).toBeVisible();
}

test("세 경품 행사 — E′2 → A 고르기 → 제출까지 응답 본문 · 문서에 가액 패턴 0건(양성 대조군)", async ({ page }) => {
  expect(scannerSelfTest()).toBe(true);
  const { link } = await createCertEvent({ name: "누수E2E", prizes: [A, B, C] });
  if (!link) throw new Error("링크 없음");

  const collector = await collectCertResponses(page);
  await pickFirstAndSubmit(page, link, A.name);
  const { corpus, documentCount, actionPostCount } = await collector.finish();

  expect(documentCount).toBeGreaterThanOrEqual(1);
  expect(actionPostCount).toBeGreaterThanOrEqual(1);
  expect(corpus).toContain(A.name);
  expect(corpus).toContain(B.name);
  expect(corpus).not.toContain(C.name);
  expect(scanForLeaks(corpus, PATTERNS)).toEqual([]);
});

test("차등 대조군 — 다른 가액(88,888 · 612,345)만 둔 행사의 같은 수집에도 같은 패턴 0건", async ({ page }) => {
  const { link } = await createCertEvent({
    name: "누수E2E차등",
    prizes: [
      { name: "차등-가", unitValueKrw: 88_888, delivery: "onsite" },
      { name: "차등-나", unitValueKrw: 612_345, delivery: "parcel" },
    ],
  });
  if (!link) throw new Error("링크 없음");

  const collector = await collectCertResponses(page);
  await pickFirstAndSubmit(page, link, "차등-가");
  const { corpus, documentCount, actionPostCount } = await collector.finish();

  expect(documentCount).toBeGreaterThanOrEqual(1);
  expect(actionPostCount).toBeGreaterThanOrEqual(1);
  expect(corpus).toContain("차등-가");
  expect(scanForLeaks(corpus, PATTERNS)).toEqual([]);
});

test("서버가 실제로 돌려준 칸 오류 응답(이름 201자로 바꾼 본문)에도 가액 패턴 0건", async ({ page }) => {
  const { link } = await createCertEvent({ name: "누수E2E칸오류", prizes: [A, B, C] });
  if (!link) throw new Error("링크 없음");

  const collector = await collectCertResponses(page);
  await page.goto(link);
  await page.getByRole("listitem").getByRole("button", { name: new RegExp(`^${A.name}`) }).click();
  await fillIntakeForm(page, { phone: "010-4821-7730" });
  await drawSignature(page);

  let rewritten = false;
  await page.route(link, async (route) => {
    const request = route.request();
    const body = request.postData() ?? "";
    if (request.method() === "POST" && body.includes('"name":"김하늘"')) {
      rewritten = true;
      await route.fallback({ postData: body.replace('"name":"김하늘"', `"name":"${"가".repeat(201)}"`) });
      return;
    }
    await route.fallback();
  });
  await submitButton(page).click();
  await expect(page.getByText(/^이름을 고쳐 주세요/)).toBeVisible();
  await page.unroute(link);

  expect(rewritten).toBe(true);
  const { corpus, actionPostCount, actionBodies } = await collector.finish();
  expect(actionPostCount).toBeGreaterThanOrEqual(1);
  // 서버가 실제로 칸 오류를 돌려줬다(테스트가 만든 본문이 아니다) — 그 응답이 말뭉치에 있다.
  expect(actionBodies.some((body) => /validationErrors|"invalid"/.test(body))).toBe(true);
  expect(scanForLeaks(corpus, PATTERNS)).toEqual([]);
});
