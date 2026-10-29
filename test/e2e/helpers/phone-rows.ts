import type { Locator } from "@playwright/test";

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
        for (const rect of Array.from(range.getClientRects())) if (rect.width > 1 && rect.height > 1) tops.push(rect.top);
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
    };
    for (const tbody of Array.from(node.querySelectorAll("tbody"))) {
      const trs = Array.from(tbody.querySelectorAll(":scope > tr"));
      for (let i = 0; i < trs.length; i++) {
        const tr = trs[i]!;
        if (cls(tr, "groupRow") || cls(tr, "reasonRow") || cls(tr, "collapsedRow")) continue;
        const cells = Array.from(tr.querySelectorAll<HTMLTableCellElement>(":scope > td, :scope > th"));
        if (cells.length === 0 || cells.some((cell) => cell.colSpan > 1 || cls(cell, "emptyCell"))) continue;
        result.rows += 1;
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
            if (style.textOverflow === "ellipsis" && box.scrollWidth > box.clientWidth) {
              result.ellipsisBoxes.push({ text: (box.textContent ?? "").trim(), fullText: (cell.textContent ?? "").trim() });
              break;
            }
          }
        }
      }
    }
    return result;
  });
}
