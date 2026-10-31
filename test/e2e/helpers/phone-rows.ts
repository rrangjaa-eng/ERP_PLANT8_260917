import { expect, type Locator, type Page } from "@playwright/test";

// 07.1-18 — 폰 표 행 실측 도우미(mobile-table-two-line · design-capture-07.1-18이 함께 쓴다). 스펙 파일끼리 import하지 않는다.

export type PhoneRowShape = {
  rows: number;
  maxMainCellLines: number;
  worstCell: string;
  maxFoldedLines: number;
  minRowHeight: number;
  visibleSecondary: number;
  hiddenSecondary: number;
  ellipsisBoxes: Array<{ text: string; fullText: string }>;
  foldedTexts: string[];
  overflow: number;
  tableRight: number;
  containerRight: number;
  /** 주 행 글자 칸(`[data-cell-text]`) 안쪽 폭의 최솟값 — 바닥 값이 없으니 실측으로 남긴다. */
  minTextBox: number;
  /** 주 행(접힌 줄 제외) 높이의 중앙값. */
  medianMainRowHeight: number;
};

/** 표의 데이터 행(그룹 머리글 · 합계 · 안내 줄 제외)을 브라우저 안에서 잰다. 바깥 변수를 쓰지 않는다. */
export async function measurePhoneRows(table: Locator): Promise<PhoneRowShape> {
  return table.evaluate((node): PhoneRowShape => {
    const visible = (el: Element) => getComputedStyle(el).display !== "none";
    // 글자 줄 수 — 글자 노드의 줄 상자만 센다(요소 상자는 inline-block 같은 것이 윗선이 1px 달라 줄 수를 부풀린다). 숨은 요소 안 글자는 상자가 없어 빠진다.
    const lines = (el: Element): number => {
      const tops: number[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!(text.textContent ?? "").trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        // 한 줄 말줄임 감싸개(`-webkit-line-clamp`) 밖으로 잘려 나간 줄은 보이지 않는 줄이다 — 세지 않는다.
        const clip = text.parentElement?.closest("[data-cell-text]")?.getBoundingClientRect() ?? null;
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width <= 1 || rect.height <= 1) continue;
          if (clip && rect.top >= clip.bottom - 1) continue;
          tops.push(rect.top);
        }
      }
      tops.sort((a, b) => a - b);
      let count = 0;
      let last = -Infinity;
      for (const top of tops) {
        if (top - last > 4) count += 1;
        last = top;
      }
      return count;
    };
    const cls = (el: Element, name: string) => String(el.className).includes(name);
    const result: PhoneRowShape = {
      rows: 0,
      maxMainCellLines: 0,
      worstCell: "",
      maxFoldedLines: 0,
      minRowHeight: Infinity,
      visibleSecondary: 0,
      hiddenSecondary: 0,
      ellipsisBoxes: [],
      foldedTexts: [],
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      tableRight: node.getBoundingClientRect().right,
      containerRight: (node.parentElement ?? node).getBoundingClientRect().right,
      minTextBox: Infinity,
      medianMainRowHeight: 0,
    };
    const mainHeights: number[] = [];
    for (const tbody of Array.from(node.querySelectorAll("tbody"))) {
      const trs = Array.from(tbody.querySelectorAll(":scope > tr"));
      for (let i = 0; i < trs.length; i++) {
        const tr = trs[i]!;
        if (cls(tr, "groupRow") || cls(tr, "reasonRow") || cls(tr, "collapsedRow")) continue;
        const cells = Array.from(tr.querySelectorAll<HTMLTableCellElement>(":scope > td, :scope > th"));
        if (cells.length === 0 || cells.some((cell) => cell.colSpan > 1 || cls(cell, "emptyCell"))) continue;
        result.rows += 1;
        mainHeights.push(tr.getBoundingClientRect().height);
        for (const box of Array.from(tr.querySelectorAll<HTMLElement>("[data-cell-text]"))) if (box.offsetParent !== null && box.clientWidth > 0) result.minTextBox = Math.min(result.minTextBox, box.clientWidth);
        let height = tr.getBoundingClientRect().height;
        const folded = trs[i + 1] && cls(trs[i + 1] as Element, "collapsedRow") && visible(trs[i + 1] as Element) ? (trs[i + 1] as HTMLElement) : null;
        if (folded) {
          height += folded.getBoundingClientRect().height;
          result.maxFoldedLines = Math.max(result.maxFoldedLines, lines(folded));
          result.foldedTexts.push((folded.textContent ?? "").trim());
        }
        result.minRowHeight = Math.min(result.minRowHeight, height);
        for (const cell of cells.filter(visible)) {
          const cellLines = lines(cell);
          if (cellLines > result.maxMainCellLines) result.worstCell = `${Math.round(cell.getBoundingClientRect().width)}px ${(cell.textContent ?? "").trim().slice(0, 60)} | ${cell.innerHTML.slice(0, 500)} | ws=${(() => { const w = cell.querySelector("[data-cell-text]"); return w ? getComputedStyle(w).whiteSpace + "/" + getComputedStyle(w).width : "none"; })()}`;
          result.maxMainCellLines = Math.max(result.maxMainCellLines, cellLines);
          for (const secondary of Array.from(cell.querySelectorAll("[class*='cellSecondary']"))) {
            if (secondary.getClientRects().length > 0) result.visibleSecondary += 1;
            else result.hiddenSecondary += 1;
          }
          for (const box of [cell, ...Array.from(cell.querySelectorAll("*"))] as HTMLElement[]) {
            const style = getComputedStyle(box);
            if (style.textOverflow === "ellipsis" && (box.scrollWidth > box.clientWidth || box.scrollHeight > box.clientHeight)) {
              result.ellipsisBoxes.push({ text: (box.textContent ?? "").trim(), fullText: (cell.textContent ?? "").trim() });
              break;
            }
          }
        }
      }
    }
    mainHeights.sort((a, b) => a - b);
    result.medianMainRowHeight = mainHeights[Math.floor(mainHeights.length / 2)] ?? 0;
    return result;
  });
}

/** 폰 표의 공통 판정 — 행은 두 줄(주 행 셀 ≤ maxMain줄 · 접힌 줄 ≤ 1줄), 행 높이 ≥ 44, 문서 넘침 0, 표 오른쪽 끝 ≤ 담는 상자. 잰 값을 돌려준다. */
export async function expectPhoneRows(page: Page, table: Locator, label: string, options: { minRows?: number; maxMain?: number } = {}): Promise<PhoneRowShape> {
  const shape = await measurePhoneRows(table);
  expect(shape.rows, `${label} 데이터 행`).toBeGreaterThanOrEqual(options.minRows ?? 1);
  expect(shape.maxMainCellLines, `${label} 주 행 셀 줄 수 ${shape.worstCell}`).toBeLessThanOrEqual(options.maxMain ?? 1);
  expect(shape.maxFoldedLines, `${label} 접힌 줄 줄 수 ${JSON.stringify(shape.foldedTexts)}`).toBeLessThanOrEqual(1);
  expect(shape.minRowHeight, `${label} 데이터 행 높이`).toBeGreaterThanOrEqual(44);
  expect(shape.visibleSecondary, `${label} 폰 주 행에 보이는 셀 아래 줄`).toBe(0);
  expect(shape.overflow, `${label} 문서 가로 넘침`).toBeLessThanOrEqual(0);
  expect(shape.tableRight, `${label} 표 오른쪽 ${shape.tableRight} > 담는 상자 ${shape.containerRight}`).toBeLessThanOrEqual(shape.containerRight);
  void page;
  console.log(`SHAPE ${label} ${JSON.stringify({ rows: shape.rows, minTextBox: shape.minTextBox, medianMainRowHeight: shape.medianMainRowHeight, minRowHeight: shape.minRowHeight, tableRight: shape.tableRight, containerRight: shape.containerRight, overflow: shape.overflow })}`);
  return shape;
}
