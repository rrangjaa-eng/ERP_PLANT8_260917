import { expect, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 관리 표 행 동작(수정 · 숨기기/비활성화 · 삭제) 간격 측정 — 거래처 · 법인카드 · 코드표 스펙이 함께 쓴다.
// 측정 정의는 people.spec.ts의 「상세」↔「삭제」 간격 · 확인 줄 넘침과 같다(PR #108).

export type ActionGap = { gap: number; horizontal: boolean };

export async function loginAsSysadmin(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

export function tokenNumber(page: Page, name: string): Promise<number> {
  return page.evaluate(
    (token) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(token)),
    name,
  );
}

// 인접한 두 동작 사이 간격. 두 상자가 한 줄(세로로 겹침)이면 가로 간격, 아니면 세로 간격이다.
export async function adjacentActionGaps(actions: Locator[]): Promise<ActionGap[]> {
  const boxes: { x: number; y: number; width: number; height: number }[] = [];
  for (const action of actions) {
    const box = await action.boundingBox();
    if (!box) throw new Error("행 동작 상자를 잴 수 없다");
    boxes.push(box);
  }
  return boxes.slice(1).map((next, index) => {
    const prev = boxes[index]!;
    const sameLine = next.y < prev.y + prev.height && prev.y < next.y + next.height;
    return sameLine
      ? { gap: next.x - (prev.x + prev.width), horizontal: true }
      : { gap: next.y - (prev.y + prev.height), horizontal: false };
  });
}

// 글자가 몇 줄로 그려지나(Range 줄 상자의 서로 다른 top 수).
export function textLineCount(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
  });
}

// 문서 가로 넘침(px)과, 조상이 넘침을 가려도 잡히게 표 오른쪽 끝이 부모 안쪽 끝을 넘은 양(px).
export async function horizontalOverflow(page: Page, row: Locator): Promise<{ doc: number; table: number }> {
  const doc = await page.evaluate(() => {
    const scroller = document.scrollingElement ?? document.documentElement;
    return scroller.scrollWidth - scroller.clientWidth;
  });
  const table = await row.evaluate((element) => {
    const tableElement = element.closest("table");
    const parent = tableElement?.parentElement;
    if (!tableElement || !parent) return Number.POSITIVE_INFINITY;
    const parentRect = parent.getBoundingClientRect();
    return tableElement.getBoundingClientRect().right - (parentRect.right - parseFloat(getComputedStyle(parent).paddingRight));
  });
  return { doc, table };
}

export async function expectNoRowOverflow(page: Page, row: Locator, label: string): Promise<void> {
  const overflow = await horizontalOverflow(page, row);
  expect(overflow.doc, `${label} 페이지 가로 넘침 ${overflow.doc}px`).toBeLessThanOrEqual(0);
  expect(overflow.table, `${label} 표가 부모 밖으로 ${overflow.table}px`).toBeLessThanOrEqual(0.5);
}

export async function expectGapsAtLeastToken(page: Page, actions: Locator[], label: string): Promise<ActionGap[]> {
  const token = await tokenNumber(page, "--s-4");
  const gaps = await adjacentActionGaps(actions);
  for (const [index, item] of gaps.entries()) {
    expect(item.gap, `${label} 동작 ${index + 1}↔${index + 2} ${item.horizontal ? "가로" : "세로"} 간격 ${item.gap}px`).toBeGreaterThanOrEqual(
      token - 0.5,
    );
  }
  return gaps;
}
