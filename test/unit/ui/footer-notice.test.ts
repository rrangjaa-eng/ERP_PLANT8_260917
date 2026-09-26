import { describe, expect, it } from "vitest";
import { composeFooterNotice, withIssueCount, type FooterNoticeItem } from "@/ui/table/footer-notice";

// 04-47(DR-16) — 합계 행 오른쪽은 한 줄이다. danger → warning → muted 순서로 잇고 각 조각은 제 톤이다. 붙여넣기 묶음은
// `붙여넣기 N줄`로 시작해 warning → muted, `N쪽까지`가 맨 끝. 저장 성공은 혼자 선다.

const pieces = (items: FooterNoticeItem[], opts?: Parameters<typeof composeFooterNotice>[1]) => composeFooterNotice(items, opts);

describe("composeFooterNotice — 합계 행 오른쪽 한 줄(DR-16)", () => {
  it("섞여 들어온 항목을 danger → 붙여넣기 머리 → warning → muted → 쪽까지 순서로, 각 조각은 제 톤", () => {
    expect(
      pieces([
        { tone: "muted", text: "2쪽까지", paste: "reach" },
        { tone: "warning", text: "오른쪽 2칸 버림", paste: "piece" },
        { tone: "danger", text: "오류 1칸 · 전부 거부" },
        { tone: "muted", text: "계산 열 12칸 무시", paste: "piece" },
        { tone: "warning", text: "외화 1줄 원화로", paste: "piece" },
        { tone: "muted", text: "붙여넣기 45줄", paste: "head" },
      ]),
    ).toEqual([
      { tone: "danger", text: "오류 1칸 · 전부 거부" },
      { tone: "muted", text: "붙여넣기 45줄" },
      { tone: "warning", text: "오른쪽 2칸 버림" },
      { tone: "warning", text: "외화 1줄 원화로" },
      { tone: "muted", text: "계산 열 12칸 무시" },
      { tone: "muted", text: "2쪽까지" },
    ]);
  });

  it("같은 톤 안에서는 들어온 순서다(danger 둘)", () => {
    expect(
      pieces([
        { tone: "danger", text: "오류 2칸" },
        { tone: "danger", text: "300줄 상한 · 상한은 관리자 설정" },
      ]).map((piece) => piece.text),
    ).toEqual(["오류 2칸", "300줄 상한 · 상한은 관리자 설정"]);
  });

  it("저장 성공이 있으면 그 하나만(--success) — 나머지를 지운다", () => {
    expect(
      pieces([{ tone: "danger", text: "오류 1칸" }, { tone: "muted", text: "붙여넣기 3줄", paste: "head" }], { successText: "저장됨 6줄 14:02" }),
    ).toEqual([{ tone: "success", text: "저장됨 6줄 14:02" }]);
  });

  it("붙여넣기 조각이 없으면 머리 `붙여넣기 N줄`도 없다(그냥 붙여넣기는 조용하다)", () => {
    expect(pieces([{ tone: "muted", text: "붙여넣기 1줄", paste: "head" }])).toEqual([]);
  });

  it("쪽까지만 있어도 머리와 함께 선다 — `붙여넣기 45줄 · 3쪽까지`", () => {
    expect(
      pieces([
        { tone: "muted", text: "붙여넣기 45줄", paste: "head" },
        { tone: "muted", text: "3쪽까지", paste: "reach" },
      ]).map((piece) => piece.text),
    ).toEqual(["붙여넣기 45줄", "3쪽까지"]);
  });

  it("빈 목록은 조각 0개", () => {
    expect(pieces([])).toEqual([]);
  });
});

// 04-47(DR-16) — 표가 센 오류·충돌 조각. 서버 거부 요약(replacesIssueCount)은 그 칸 수가 지금 표가 센 수와 같을 때만 표의 조각을
// 대신한다 — 거부 뒤 다른 칸에 오류가 더 생기거나 고쳐져 수가 달라지면 요약은 낡았으므로 표가 센 수를 쓴다.
describe("withIssueCount — 표가 센 오류 수와 서버 거부 요약", () => {
  const rejected: FooterNoticeItem = { tone: "danger", text: "오류 1칸 · 전부 거부", replacesIssueCount: { errorCells: 1, conflictRows: 0 } };

  it("요약의 칸 수가 표가 센 수와 같으면 요약만 선다", () => {
    expect(withIssueCount([rejected], { errorCells: 1, conflictRows: 0 }).map((item) => item.text)).toEqual(["오류 1칸 · 전부 거부"]);
  });

  it("거부 뒤 다른 두 칸이 오류가 돼 표가 3칸을 세면 요약 대신 `오류 3칸`", () => {
    expect(withIssueCount([rejected], { errorCells: 3, conflictRows: 0 })).toEqual([{ tone: "danger", text: "오류 3칸" }]);
  });

  it("요약이 없으면 표가 센 조각이 앞에 서고 호출부 항목이 뒤따른다", () => {
    const paste: FooterNoticeItem = { tone: "muted", text: "붙여넣기 2줄", paste: "head" };
    expect(withIssueCount([paste], { errorCells: 2, conflictRows: 1 })).toEqual([
      { tone: "danger", text: "오류 2칸" },
      { tone: "danger", text: "충돌 1줄" },
      paste,
    ]);
  });

  it("제 칸이 0인 요약(`전부 거부 · 다른 칸 오류 1칸`)은 표가 0칸을 세는 동안 그대로 선다", () => {
    const other: FooterNoticeItem = { tone: "danger", text: "전부 거부 · 다른 칸 오류 1칸", replacesIssueCount: { errorCells: 0, conflictRows: 0 } };
    expect(withIssueCount([other], { errorCells: 0, conflictRows: 0 })).toEqual([other]);
  });
});
