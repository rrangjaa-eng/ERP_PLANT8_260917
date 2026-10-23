import { expect, type Locator, type Page } from "@playwright/test";

// 07-18 — 프로젝트 상세 정보 면(`#project-info`)을 여는 공용 도우미. 기존 스펙이 머리 3차 버튼
// (`기간 바꾸기` · `총 매출 예상가 바꾸기`) 대신 이 길로 면을 열고 고친다. 이름은 면 안에서 찾는다(D-P3-1).
export function projectInfo(page: Page): Locator {
  return page.locator("#project-info");
}

// 접혀 있으면 `펼치기`를 눌러 펼친다. 이미 펼쳐 있으면 아무것도 하지 않는다.
export async function expandProjectInfo(page: Page): Promise<void> {
  const panel = projectInfo(page);
  const toggle = panel.getByRole("button", { name: "펼치기", exact: true });
  const collapse = panel.getByRole("button", { name: "접기", exact: true });
  // 서버 렌더 버튼을 수화 전에 누르면 무동작이다 — 펼쳐질 때까지 접힌 버튼만 다시 누른다.
  await expect(async () => {
    if ((await toggle.count()) > 0) await toggle.click();
    await expect(collapse).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
}

// 펼친 뒤 `고치기`를 눌러 기간 · PO 금액 · PO 번호 칸 묶음을 연다.
export async function openProjectInfoEdit(page: Page): Promise<void> {
  await expandProjectInfo(page);
  const panel = projectInfo(page);
  await panel.getByRole("button", { name: "고치기", exact: true }).click();
  await expect(panel.getByRole("button", { name: "고치기 취소", exact: true })).toBeVisible();
  // 묶음을 열면 화면이 시작일로 포커스를 옮긴다(칸 마운트 효과 + 다음 프레임 rAF). 그 포커스가 끝나기 전에 다른 칸을
  // fill하면 바쁜 CI에서 rAF가 fill의 focus와 입력 사이에 끼어 글자가 시작일(date)로 샌다 — 둘 다 끝난 뒤 돌려준다.
  // 앞서 걸린 rAF가 먼저 불리므로 한 프레임을 기다리면 화면의 rAF도 지난 것이다.
  await expect(panel.getByLabel("시작일", { exact: true })).toBeFocused();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

// `고치기 취소` — 묶음 전체 원복 + 닫기 + 포커스 `고치기`.
export async function cancelProjectInfoEdit(page: Page): Promise<void> {
  const panel = projectInfo(page);
  await panel.getByRole("button", { name: "고치기 취소", exact: true }).click();
  await expect(panel.getByRole("button", { name: "고치기", exact: true })).toBeFocused();
}

// 고객 승인 섹션의 `승인 표시` 옆 패널(07-18 W6). 면을 펼친 뒤 섹션의 `승인 표시`를 눌러 연다.
export function approvalSheet(page: Page): Locator {
  return page.getByRole("dialog", { name: "고객 승인 표시", exact: true });
}

export async function openApprovalSheet(page: Page): Promise<Locator> {
  await expandProjectInfo(page);
  await projectInfo(page).getByRole("button", { name: "승인 표시", exact: true }).click();
  const sheet = approvalSheet(page);
  await expect(sheet).toBeVisible();
  return sheet;
}

export async function chooseApprovalBasis(sheet: Locator, basis: "purchase_order" | "email" | "verbal"): Promise<void> {
  await sheet.getByLabel("근거").selectOption(basis);
}

// 승인 · 승인 취소 요청만 기다린다 — 개발 서버에서는 담당자 목록 서버 액션이 같은 시간에 오가서 아무 서버 액션이나 기다리면 엇갈린다.
export async function submitApproval(page: Page, primary: Locator): Promise<void> {
  const answered = page.waitForResponse((response) => response.request().method() === "POST" && (response.request().postData() ?? "").includes('"approval"'));
  await primary.click();
  await answered;
}
