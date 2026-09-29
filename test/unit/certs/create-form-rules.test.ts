import { describe, expect, it } from "vitest";
import {
  countChangedCells,
  createBlockReason,
  createSubmitOutcome,
  pinCellErrors,
  pinFieldErrors,
  cellErrorSummary,
  type CreateFormSnapshot,
  type DraftWinnerRow,
} from "@/app/(app)/certs/events/create-form-rules";

// 04.3-04 Task 3 ⓪ — I2 만들기 화면의 순수 판정(입력 버리기 N · 1차 막힘 이유 · 제출 응답 가르기).
// 셀 오류 문장(pinCellErrors)은 사용자 결정 A(2026-09-29 PR #88) — 명사형 「원인 · 다음 행동」.

const TODAY = "2026-09-29";
const INITIAL: CreateFormSnapshot = { name: "", wonOn: TODAY, rows: [] };

let seq = 0;
function draft(overrides: Partial<DraftWinnerRow> = {}): DraftWinnerRow {
  seq += 1;
  return { key: `d${seq}`, name: "", phone: "", prizeName: "", quantity: "1", delivery: "현장", distinguishLabel: "", ...overrides };
}

describe("countChangedCells", () => {
  it("아무것도 안 바꿈 → 0 · 당첨일 처음 값(오늘) 그대로 → 0", () => {
    expect(countChangedCells(INITIAL, { ...INITIAL })).toBe(0);
  });

  it("행사 이름만 적음 → 1 · 당첨일을 다른 날로 → 1", () => {
    expect(countChangedCells(INITIAL, { ...INITIAL, name: "쇼케이스" })).toBe(1);
    expect(countChangedCells(INITIAL, { ...INITIAL, wonOn: "2026-09-13" })).toBe(1);
  });

  it("두 칸 + 새 줄에 이름 · 전화 → 4", () => {
    const current = { name: "쇼케이스", wonOn: "2026-09-13", rows: [draft({ name: "김하늘", phone: "010-4821-7730" })] };
    expect(countChangedCells(INITIAL, current)).toBe(4);
  });

  it("기본값(수량 1 · 전달 현장)만 든 새 줄 → 0 · 새 줄 수량 2 → 1", () => {
    expect(countChangedCells(INITIAL, { ...INITIAL, rows: [draft()] })).toBe(0);
    expect(countChangedCells(INITIAL, { ...INITIAL, rows: [draft({ quantity: "2" })] })).toBe(1);
  });

  it("E2E 붙여넣기 3줄 → 13(첫 줄의 1 · 현장은 기본값이라 뺀다)", () => {
    const rows = [
      draft({ name: "김하늘", phone: "010-4821-7730", prizeName: "갤럭시 탭 S10", quantity: "1", delivery: "현장" }),
      draft({ name: "김민수", phone: "010-1111-2222", prizeName: "스타벅스 기프티콘", quantity: "2", delivery: "택배" }),
      draft({ name: "김문수", phone: "010-3333-4444", prizeName: "스타벅스 기프티콘", quantity: "2", delivery: "택배" }),
    ];
    expect(countChangedCells(INITIAL, { ...INITIAL, rows })).toBe(13);
  });

  it("적었다가 처음 값으로 되돌린 칸 → 0", () => {
    expect(countChangedCells(INITIAL, { ...INITIAL, name: "", rows: [draft({ name: "" })] })).toBe(0);
  });
});

describe("createBlockReason", () => {
  const base = { contactMissing: false, canOpenSettings: true, emptyFields: [] as string[], rowCount: 1 };

  it("문의 전화 없음 — 설정을 열 수 있으면 설정 확인증 탭, 못 열면 등록은 경영관리(block)", () => {
    expect(createBlockReason({ ...base, contactMissing: true })).toEqual({ text: "수령자 문의 전화 없음 · 설정 확인증 탭에서 채움", tone: "block" });
    expect(createBlockReason({ ...base, contactMissing: true, canOpenSettings: false })).toEqual({
      text: "수령자 문의 전화 없음 · 등록은 경영관리",
      tone: "block",
    });
  });

  it("빈 폼 칸 — 둘 · 행사 이름만 · 당첨일만", () => {
    expect(createBlockReason({ ...base, emptyFields: ["행사 이름", "당첨일"] })).toEqual({ text: "행사 이름 · 당첨일 2칸 비어 있음 · 행사 이름 적기", tone: "block" });
    expect(createBlockReason({ ...base, emptyFields: ["행사 이름"] })).toEqual({ text: "행사 이름 비어 있음 · 행사 이름 적기", tone: "block" });
    expect(createBlockReason({ ...base, emptyFields: ["당첨일"] })).toEqual({ text: "당첨일 비어 있음 · 당첨일 적기", tone: "block" });
  });

  it("줄 0 → 당첨자 없음 · 줄 501 → 500명까지 줄이기 · 줄 500 → null", () => {
    expect(createBlockReason({ ...base, rowCount: 0 })).toEqual({ text: "당첨자 없음 · 첫 줄 만들기", tone: "block" });
    expect(createBlockReason({ ...base, rowCount: 501 })).toEqual({ text: "당첨자 501명 · 500명까지 줄이기", tone: "block" });
    expect(createBlockReason({ ...base, rowCount: 500 })).toBeNull();
  });

  it("한 번에 하나, 이 순서 — 문의 전화 → 빈 칸 → 줄 수", () => {
    expect(createBlockReason({ contactMissing: true, canOpenSettings: true, emptyFields: ["행사 이름"], rowCount: 0 })?.text).toBe(
      "수령자 문의 전화 없음 · 설정 확인증 탭에서 채움",
    );
    expect(createBlockReason({ ...base, emptyFields: ["행사 이름"], rowCount: 0 })?.text).toBe("행사 이름 비어 있음 · 행사 이름 적기");
  });

  it("어느 결과에도 info가 없고 수 없음 접두가 없다", () => {
    const inputs = [
      { ...base, contactMissing: true },
      { ...base, contactMissing: true, canOpenSettings: false },
      { ...base, emptyFields: ["행사 이름", "당첨일"] },
      { ...base, rowCount: 0 },
      { ...base, rowCount: 501 },
    ];
    for (const input of inputs) {
      const reason = createBlockReason(input);
      expect(reason?.tone).toBe("block");
      expect(reason?.text).not.toContain("수 없음");
    }
  });
});

describe("createSubmitOutcome", () => {
  it("성공 응답 → success(eventId)", () => {
    expect(createSubmitOutcome({ data: { kind: "ok", eventId: "e1", link: "https://x/c/t" } })).toEqual({ kind: "success", eventId: "e1" });
    expect(createSubmitOutcome({ data: { eventId: "e1", link: "https://x/c/t" } })).toEqual({ kind: "success", eventId: "e1" });
  });

  it("invalid → 셀 오류 · 칸 오류 그대로", () => {
    const cellErrors = [{ rowKey: "0", column: "phone", code: "phoneFormat" }];
    expect(createSubmitOutcome({ data: { kind: "invalid", cellErrors, fieldErrors: { name: "required" } } })).toEqual({
      kind: "invalid",
      cellErrors,
      fieldErrors: { name: "required" },
    });
  });

  it("contactMissing → contactMissing", () => {
    expect(createSubmitOutcome({ data: { kind: "contactMissing" } })).toEqual({ kind: "contactMissing" });
  });

  it.each([
    ["serverError", { serverError: "요청 크기 초과" }],
    ["validationErrors", { validationErrors: { name: { _errors: ["x"] } } }],
    ["연결 실패", "unreachable"],
    ["해석 불가", { data: { kind: "뭔지 모름" } }],
    ["undefined", undefined],
  ])("%s → failed", (_label, response) => {
    expect(createSubmitOutcome(response)).toEqual({ kind: "failed" });
  });
});

describe("pinCellErrors — 셀 오류 12종 명사형 문장(사용자 결정 A)", () => {
  it.each([
    ["phone", "phoneFormat", "전화번호 형식 아님 · 010-0000-0000처럼 입력"],
    ["quantity", "quantity", "1 이상 정수 아님 · 1처럼 입력"],
    ["delivery", "delivery", "현장 또는 택배 아님 · 둘 중 하나로 입력"],
    ["name", "duplicatePerson", "같은 이름·전화번호 이미 있음 · 한 줄 수정"],
    ["name", "nameTooLong", "40자 초과 · 40자 안으로"],
    ["prizeName", "prizeTooLong", "80자 초과 · 80자 안으로"],
    ["distinguishLabel", "labelTooLong", "10자 초과 · 10자 안으로"],
    ["distinguishLabel", "labelDigits", "숫자 3개 이상 이어짐 · 전화번호 말고 오전 조처럼 입력"],
    ["distinguishLabel", "labelName", "당첨자 이름 들어 있음 · 이름 말고 오전 조처럼 입력"],
  ])("%s %s → %s", (column, code, text) => {
    expect(pinCellErrors([{ rowKey: "d1", column, code }])).toEqual({ [`d1:${column}`]: text });
  });

  it.each([
    ["name", "이름 비어 있음 · 입력"],
    ["phone", "전화번호 비어 있음 · 입력"],
    ["prizeName", "경품명 비어 있음 · 입력"],
    ["quantity", "수량 비어 있음 · 입력"],
    ["delivery", "전달 비어 있음 · 입력"],
  ])("required — 칸 이름만 바뀐다(%s)", (column, text) => {
    expect(pinCellErrors([{ rowKey: "d1", column, code: "required" }])).toEqual({ [`d1:${column}`]: text });
  });

  it("shapeDuplicate — 모양 · 줄 수를 넣는다", () => {
    expect(
      pinCellErrors([
        { rowKey: "a", column: "distinguishLabel", code: "shapeDuplicate", shape: "김*수 · 스타벅스 기프티콘 2개", count: 2 },
        { rowKey: "b", column: "distinguishLabel", code: "shapeDuplicate", shape: "김*수 · 스타벅스 기프티콘 2개", count: 2 },
      ]),
    ).toEqual({
      "a:distinguishLabel": "수령자 목록에 김*수 · 스타벅스 기프티콘 2개 2줄 · 구별 표시를 서로 다르게 입력(예: 오전 조)",
      "b:distinguishLabel": "수령자 목록에 김*수 · 스타벅스 기프티콘 2개 2줄 · 구별 표시를 서로 다르게 입력(예: 오전 조)",
    });
  });

  it("tooManyWinners(04.3-10 몫) — 총원을 넣고 tone 키가 없다", () => {
    expect(pinCellErrors([{ rowKey: "w9", column: "name", code: "tooManyWinners", total: 501 }])).toEqual({
      "w9:name": "당첨자 501명 · 500명까지 줄이기",
    });
  });

  it("어느 문장에도 높임말 종결 · 마침표가 없다", () => {
    const codes = ["required", "phoneFormat", "quantity", "delivery", "duplicatePerson", "nameTooLong", "prizeTooLong", "labelTooLong", "labelDigits", "labelName"];
    const texts = Object.values(pinCellErrors(codes.map((code, i) => ({ rowKey: `r${i}`, column: "name", code }))));
    expect(texts).toHaveLength(codes.length);
    for (const text of texts) expect(text).not.toMatch(/(?:습니다|세요|니다)|\.$/);
  });

  it("합계 문장 — 오류 N칸 · 전부 거부", () => {
    expect(cellErrorSummary(2)).toBe("오류 2칸 · 전부 거부");
  });
});

describe("pinFieldErrors — 폼 두 칸", () => {
  it("빈 칸 · 행사 이름 80자 초과", () => {
    expect(pinFieldErrors({ name: "required", wonOn: "required" })).toEqual({ name: "행사 이름 비어 있음 · 입력", wonOn: "당첨일 비어 있음 · 입력" });
    expect(pinFieldErrors({ name: "tooLong" })).toEqual({ name: "80자 초과 · 80자 안으로" });
    expect(pinFieldErrors({})).toEqual({});
  });
});
