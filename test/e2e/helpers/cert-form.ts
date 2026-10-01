import type { Locator, Page } from "@playwright/test";

// 04.3-15 Task 1 ①(eng-review newflow E14) — E′4 폼 채우기 · 서명 공용 도우미. 04.3-13 · 04.3-14 · 04.3-16 감사
// 스펙도 이것을 import한다. 수집 안내 확인 체크의 라벨은 이 파일 한 곳에만 둔다(04.3-14가 여기서만 바꾼다).
// 규약 C4 — @playwright/test는 `import type`만.

const CONSENT_CHECKBOX_LABEL = "개인정보 수집·이용에 동의합니다";

/** 서명 캔버스에 마우스로 획 하나(잉크 판정을 넉넉히 넘는 지그재그)를 긋는다. */
export async function drawSignature(page: Page): Promise<void> {
  const canvas = page.getByRole("application", { name: /^서명/ });
  // 폰 폭에서는 sticky 제출 줄이 캔버스 아래쪽과 겹칠 수 있다 — 맨 아래로 스크롤한 뒤 그린다.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const box = await canvas.boundingBox();
  if (!box) throw new Error("서명 캔버스를 찾지 못했다");
  const startX = box.x + box.width * 0.2;
  const startY = box.y + box.height * 0.5;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + box.width * 0.2, startY - box.height * 0.2, { steps: 5 });
  await page.mouse.move(startX + box.width * 0.4, startY + box.height * 0.2, { steps: 5 });
  await page.mouse.move(startX + box.width * 0.6, startY, { steps: 5 });
  await page.mouse.up();
}

/** E′4 칸 채우기 + 수집 안내 확인 체크. 주소는 택배 경품일 때만 넘긴다. */
export async function fillIntakeForm(
  page: Page,
  opts: { name?: string; rrnFront?: string; rrnBack?: string; phone: string; address?: string },
): Promise<void> {
  await page.locator("#name").fill(opts.name ?? "김하늘");
  await page.getByLabel("주민등록번호 앞 6자리").fill(opts.rrnFront ?? "930412");
  await page.getByLabel("주민등록번호 뒤 7자리").fill(opts.rrnBack ?? "2123458");
  if (opts.address !== undefined) await page.locator("#address").fill(opts.address);
  await page.locator("#phone").fill(opts.phone);
  await page.getByRole("checkbox", { name: CONSENT_CHECKBOX_LABEL }).check();
}

/** 외부 1차 「확인증 제출」. */
export function submitButton(page: Page): Locator {
  return page.getByRole("button", { name: "확인증 제출" });
}
