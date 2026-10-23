import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Attachments, type AttachmentsProps, type BulkImportRow, type DoneRow, visibleFiles, withUploaded } from "../../../ui/attachments/Attachments";

// 06.1-03 Task 2 (SP-6103 · G-1 · D-6115) — 첨부 영역 「엑셀 일괄 등록」 변형. 컴포넌트는 서버 DTO를 그리기만 한다(판정 · 계산 · 크기 검사 없음).
// jsdom 없이(environment: "node") 정적 렌더로 마크업을 단언한다 — 포커스 · 끌어 놓기 · 키는 E2E(dev-components) 몫이다.

const NOP = () => {};

const CARD: BulkImportRow = {
  key: "r1",
  state: "result",
  fileName: "신한카드_이용내역.xls",
  formatLabel: "신한 이용내역",
  counts: [
    { label: "등록", value: 162, kind: "success", href: "?state=all&batch=b1" },
    { label: "이미 등록", value: 6, kind: "muted" },
    { label: "상쇄", value: 2, unit: "쌍", kind: "muted" },
    { label: "카드 사용에 붙음", value: 12, kind: "success", href: "?state=attached&batch=b1" },
    { label: "확인 필요", value: 1, kind: "warning", href: "?state=needs-check&batch=b1" },
    { label: "짝 없음", value: 0, kind: "warning", href: "?state=unmatched&batch=b1" },
    { label: "카드 미등록", value: 1, kind: "danger", href: "?state=card-unknown&batch=b1" },
  ],
  lines: [],
  restCount: 0,
};

function render(rows: BulkImportRow[]): string {
  return renderToStaticMarkup(createElement(Attachments, { variant: "bulk-import", rows, onFiles: NOP }));
}

describe("Attachments variant=bulk-import — 영역", () => {
  it("파일 입력 accept는 엑셀 · CSV이고 여러 파일을 받는다(이미지 · PDF 아님)", () => {
    const markup = render([]);
    expect(markup).toContain('accept=".xls,.xlsx,.csv"');
    expect(markup).not.toContain("image/*");
    expect(markup).toMatch(/<input[^>]*multiple/);
  });

  it("영역 한 줄과 2차 `파일 고르기` + kbd `Ctrl+U`가 있다", () => {
    const markup = render([]);
    // 디자인 검토 G(사용자 카드 2026-10-17 「짧게 줄임」) — PC 짧은 글 + 폰 더 짧은 글, 기본 변형과 같은 pcText/phoneText 자리.
    expect(markup).toMatch(/<span class="[^"]*pcText[^"]*">끌어 놓거나 Ctrl\+U · 엑셀·CSV 1MB<\/span>/);
    expect(markup).toMatch(/<span class="[^"]*phoneText[^"]*">엑셀·CSV 1MB<\/span>/);
    expect(markup).not.toContain("홈택스·카드사 엑셀·CSV 1MB");
    expect(markup).toContain("파일 고르기");
    expect(markup).toMatch(/<kbd[^>]*>Ctrl\+U<\/kbd>/);
  });

  it("기존 갈래(variant 없음)는 이미지 · PDF accept 그대로다", () => {
    const props: AttachmentsProps = {
      mode: "edit",
      files: [],
      maxMb: 10,
      uploadFailedText: "올리지 못함 · 다시 올리기",
      actions: {
        request: () => Promise.resolve({ ok: false, message: "표본" }),
        complete: () => Promise.resolve({ ok: false, message: "표본", retry: "restart" }),
        remove: () => Promise.resolve(false),
        viewUrl: () => Promise.resolve(null),
      },
    };
    const markup = renderToStaticMarkup(createElement(Attachments, props));
    expect(markup).toContain('accept="image/*,application/pdf"');
    expect(markup).not.toContain(".xlsx");
  });
});

describe("Attachments variant=bulk-import — 결과 행", () => {
  it("1행은 `{파일 이름} · {서식 이름}`, 2행 조각은 label 숫자 순서로 이어진다", () => {
    const markup = render([CARD]);
    expect(markup).toContain("신한카드_이용내역.xls · 신한 이용내역");
    expect(markup).toContain("이미 등록");
    expect(markup).toContain("카드 사용에 붙음");
  });

  it("조각 `상쇄`(value 2, muted, href 없음)는 `상쇄 2쌍`이고 링크가 아니다, `이미 등록` 뒤에 선다", () => {
    const markup = render([CARD]);
    const text = markup.replace(/<[^>]+>/g, "");
    expect(text).toContain("상쇄 2쌍");
    expect(text.indexOf("이미 등록")).toBeLessThan(text.indexOf("상쇄 2쌍"));
    expect(markup).not.toMatch(/<a [^>]*>[^<]*상쇄/);
  });

  it("value 0인 조각은 DOM에 없다(`짝 없음 0` · `상쇄 0쌍` 글자 없음)", () => {
    const text = render([CARD, { ...CARD, key: "r2", counts: [{ label: "상쇄", value: 0, unit: "쌍", kind: "muted" }] }]).replace(/<[^>]+>/g, "");
    expect(text).not.toContain("짝 없음");
    expect(text).not.toContain("상쇄 0쌍");
  });

  it("href가 있는 조각은 3차 링크이고 숫자에만 상태 색(data-kind)이 붙는다", () => {
    const markup = render([CARD]);
    expect(markup).toMatch(/<a [^>]*href="\?state=needs-check&amp;batch=b1"[^>]*>/);
    expect(markup).toMatch(/<a [^>]*href="\?state=all&amp;batch=b1"[^>]*>/);
    expect(markup).toMatch(/data-kind="warning"[^>]*>1</);
    expect(markup).toMatch(/data-kind="danger"[^>]*>1</);
    expect(markup).toMatch(/data-kind="success"[^>]*>162</);
  });

  it("`확인 필요`는 `카드 사용에 붙음` 뒤에 선다(넘겨 준 순서 그대로)", () => {
    const text = render([CARD]).replace(/<[^>]+>/g, "");
    expect(text.indexOf("카드 사용에 붙음")).toBeLessThan(text.indexOf("확인 필요"));
  });

  it("목록은 최대 5줄 + `외 n`이다", () => {
    const lines = ["1줄", "2줄", "3줄", "4줄", "5줄", "6줄", "7줄"];
    const text = render([{ ...CARD, key: "r3", lines, restCount: 3 }]).replace(/<[^>]+>/g, "");
    expect(text).toContain("5줄");
    expect(text).not.toContain("6줄");
    expect(text).toContain("외 3");
  });

  it("결과 슬롯은 aria-live=polite 영역이다", () => {
    expect(render([CARD])).toMatch(/aria-live="polite"/);
  });

  it("`<b>`가 든 파일 이름은 태그가 아니라 글자로 나온다(T-061-20)", () => {
    const markup = render([{ ...CARD, key: "r4", fileName: "<b>x</b>.xls" }]);
    expect(markup).toContain("&lt;b&gt;x&lt;/b&gt;.xls");
    expect(markup).not.toContain("<b>x</b>");
  });
});

describe("Attachments variant=bulk-import — 거절 · 업로드 중 · 실패 행", () => {
  const SIZE: BulkImportRow = { key: "x1", state: "refused", fileName: "롯데_10월.xls", headline: "1.4MB · 1MB 초과 · 기간을 나눠 다시 내려받기", lines: [], restCount: 0 };
  const FORMAT: BulkImportRow = { key: "x2", state: "refused", fileName: "메모.txt", headline: "엑셀·CSV 파일 아님 · 내려받은 파일 그대로", lines: [], restCount: 0 };

  function rowOf(markup: string, key: string): string {
    const match = new RegExp(`<li[^>]*data-row="${key}"[^>]*>[\\s\\S]*?</li>`).exec(markup);
    if (!match) throw new Error(`행 ${key}를 찾을 수 없다`);
    return match[0];
  }

  it("거절 행은 headline 글자 그대로이고 오류 셀 모양(data-state=refused)이며 버튼이 없다(크기 · 형식 둘 다)", () => {
    const markup = render([SIZE, FORMAT]);
    for (const [key, headline] of [
      ["x1", SIZE.state === "refused" ? SIZE.headline : ""],
      ["x2", FORMAT.state === "refused" ? FORMAT.headline : ""],
    ]) {
      const row = rowOf(markup, key!);
      expect(row).toContain('data-state="refused"');
      expect(row).toContain(headline);
      expect(row).not.toContain("<button");
      expect(row).not.toContain("다시 올리기");
      expect(row).not.toContain('role="progressbar"');
    }
  });

  it("줄 오류 거절 행은 줄 최대 5개 + `외 7줄`", () => {
    const row: BulkImportRow = {
      key: "x3",
      state: "refused",
      fileName: "비씨_10월.xls",
      headline: "거절 · 오류 12줄",
      lines: ["14줄 · 승인일 읽지 못함", "15줄 · 승인일 읽지 못함", "16줄 · 승인일 읽지 못함", "17줄 · 승인일 읽지 못함", "18줄 · 승인일 읽지 못함", "19줄 · 숨어야 함"],
      restCount: 7,
      restUnit: "줄",
    };
    const text = rowOf(render([row]), "x3").replace(/<[^>]+>/g, "");
    expect(text).toContain("18줄 · 승인일 읽지 못함");
    expect(text).not.toContain("19줄");
    expect(text).toContain("외 7줄");
  });

  it("업로드 중 행은 진행 바 요소 하나이고 다른 행에는 없다", () => {
    const markup = render([CARD, { key: "u1", state: "uploading", fileName: "올리는중.xls" }]);
    expect((markup.match(/data-ui="bulk-progress"/g) ?? []).length).toBe(1);
    expect(rowOf(markup, "u1")).toContain('data-ui="bulk-progress"');
    expect(rowOf(markup, "r1")).not.toContain("bulk-progress");
  });

  it("실패 행은 `올리지 못함` + 2차 `다시 올리기` 하나 — 2차는 실패 행에만 있다", () => {
    const markup = render([SIZE, CARD, { key: "f1", state: "failed", fileName: "신한.xls", onRetry: NOP }]);
    const failed = rowOf(markup, "f1");
    expect(failed).toContain("올리지 못함");
    expect((failed.match(/다시 올리기/g) ?? []).length).toBe(1);
    expect(failed).toContain('data-state="failed"');
    expect((markup.match(/다시 올리기/g) ?? []).length).toBe(1);
  });

  it("80자 파일 이름도 글자 그대로 한 곳에 나온다(줄바꿈은 CSS 몫)", () => {
    const name = `${"가".repeat(76)}.xls`;
    const markup = render([{ ...CARD, key: "r5", fileName: name }]);
    expect(markup).toContain(name);
  });
});

// 07-23 E2E 불안정(vendors `서류` 교체): 한 자리에서 A를 올리고 교체로 B를 올린 뒤 부모가 서버 값을 다시 읽으면(files=[B])
// 이번 업로드 목록에 남은 A가 서버 값 뒤에 붙어 `slice(-1)`이 옛 파일 A를 골랐다 — 새로 고침이 끝난 뒤 자리에 `등록증1`이 다시 섰다.
describe("Attachments single — 교체 뒤 그릴 파일", () => {
  const file = (id: string, name: string): DoneRow => ({ id, name, sizeBytes: 1024, createdAt: "2026-10-23T00:00:00.000Z", previewUrl: null });
  const A = file("a", "등록증1.pdf");
  const B = file("b", "등록증2.pdf");
  const names = (rows: DoneRow[]) => rows.map((row) => row.name);

  it("A 업로드 · 새로 고침 → B 교체 업로드 · 새로 고침(서버 값 [B])이면 B 하나만 그린다", () => {
    let done = withUploaded([], A, true);
    expect(names(visibleFiles([A], done, [], true))).toEqual(["등록증1.pdf"]);
    done = withUploaded(done, B, true);
    // 새로 고침 전(서버 값 아직 [A]) — 이번 업로드 B.
    expect(names(visibleFiles([A], done, [], true))).toEqual(["등록증2.pdf"]);
    // 새로 고침 뒤(서버가 A를 떼고 [B]).
    expect(names(visibleFiles([B], done, [], true))).toEqual(["등록증2.pdf"]);
  });

  it("교체한 B를 지우면(서버 값 [] · 지운 것 [b]) 옛 A가 되살아나지 않는다", () => {
    const done = withUploaded(withUploaded([], A, true), B, true);
    expect(visibleFiles([B], done, ["b"], true)).toEqual([]);
    expect(visibleFiles([], done, ["b"], true)).toEqual([]);
  });

  it("여러 파일 갈래는 이번 업로드를 쌓는다(서버 값에 없는 것만 뒤에)", () => {
    const done = withUploaded(withUploaded([], A, false), B, false);
    expect(names(visibleFiles([A], done, [], false))).toEqual(["등록증1.pdf", "등록증2.pdf"]);
  });
});
