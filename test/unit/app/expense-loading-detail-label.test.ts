import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ExpenseLoading from "@/app/(app)/expenses/[id]/loading";

// 07-28(N8): 지출결의 로딩 뼈대의 읽기 칸 라벨도 `상세`다(실제 상세 화면과 같은 이름 — 뼈대가 `비고`로 남으면 로딩 → 본문에서 라벨이 바뀐다).
describe("지출결의 로딩 뼈대 라벨", () => {
  it("`상세`가 있고 `비고`는 없다", () => {
    const html = renderToStaticMarkup(ExpenseLoading());
    expect(html).toContain("상세");
    expect(html).not.toContain("비고");
  });
});
