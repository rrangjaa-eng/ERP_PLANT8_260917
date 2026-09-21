import { describe, expect, it } from "vitest";
import { serializeActionLogExportAsCsv, type ActionLogExportRow } from "@/domain/action-log/export";

// RFC4180과 같은 결의 최소 파서 — 이 테스트 전용. 이스케이프된 값을 원래
// 값으로 되돌려 왕복(직렬화 → 파싱)이 안전한지 확인한다.
function parseCsv(text: string): string[][] {
  const withoutBom = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  while (i < withoutBom.length) {
    const char = withoutBom[i];
    if (inQuotes) {
      if (char === '"') {
        if (withoutBom[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r" && withoutBom[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
      i += 2;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function baseRow(overrides: Partial<ActionLogExportRow> = {}): ActionLogExportRow {
  return {
    occurredAt: new Date("2026-09-20T14:00:00.000Z"),
    actorName: "홍길동",
    actorRoleName: "시스템 관리자",
    actionTypeLabel: "문서 생성",
    entity: "vendor",
    entityId: "abc-123",
    documentId: null,
    detail: {},
    ...overrides,
  };
}

describe("serializeActionLogExportAsCsv (Task 1 결정 A — UTF-8 BOM CSV)", () => {
  it("맨 앞에 UTF-8 BOM(U+FEFF)을 붙인다", () => {
    const file = serializeActionLogExportAsCsv([baseRow()]);
    expect(file.body.charCodeAt(0)).toBe(0xfeff);
  });

  it("같은 입력으로 두 번 직렬화하면 같은 문자열이 나온다(결정적)", () => {
    const rows = [baseRow(), baseRow({ actorName: "김철수" })];
    const first = serializeActionLogExportAsCsv(rows);
    const second = serializeActionLogExportAsCsv(rows);
    expect(first.body).toBe(second.body);
  });

  it("0건 입력에서도 헤더가 있는 유효한 파일이 나온다", () => {
    const file = serializeActionLogExportAsCsv([]);
    const parsed = parseCsv(file.body);
    expect(parsed.length).toBe(1);
    expect(parsed[0]).toEqual(["발생 시각", "행위자", "행위자 계급", "행동 종류", "대상", "문서", "상세"]);
  });

  it("값에 쉼표·줄바꿈·따옴표가 있어도 다시 파싱하면 원래 값과 같다(열이 밀리지 않는다)", () => {
    const trickyDetail = { note: 'a,b\nc"d' };
    const row = baseRow({
      actorName: '김,철수\n"별명"',
      documentId: "doc,with,commas",
      detail: trickyDetail,
    });
    const file = serializeActionLogExportAsCsv([row]);
    const parsed = parseCsv(file.body);
    expect(parsed.length).toBe(2);
    const dataRow = parsed[1];
    if (!dataRow) throw new Error("데이터 행이 없습니다.");
    expect(dataRow[1]).toBe('김,철수\n"별명"');
    expect(dataRow[4]).toContain("vendor");
    expect(dataRow[5]).toBe("doc,with,commas");
    expect(JSON.parse(dataRow[6]!)).toEqual(trickyDetail);
  });

  it("반환 형태가 { filename, contentType, body } 세 조각이다(체크포인트 계약)", () => {
    const file = serializeActionLogExportAsCsv([baseRow()]);
    expect(typeof file.filename).toBe("string");
    expect(file.contentType).toContain("text/csv");
    expect(typeof file.body).toBe("string");
  });
});
