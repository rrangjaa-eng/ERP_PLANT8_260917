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
    entityName: "abc-123",
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

  // 결함 2: 대상(4번째 열)이 raw entityId가 아니라 해석된 entityName을 써야
  // 한다 — "vendor 302c0549-..." 같은 내부 UUID가 그대로 새면 안 된다.
  it("대상 열이 entityId가 아니라 entityName을 쓴다(결함 2)", () => {
    const row = baseRow({
      entityId: "302c0549-e17f-4dff-b64a-64d6daa50f51",
      entityName: "테스트거래처",
    });
    const file = serializeActionLogExportAsCsv([row]);
    const parsed = parseCsv(file.body);
    const dataRow = parsed[1];
    if (!dataRow) throw new Error("데이터 행이 없습니다.");
    expect(dataRow[4]).toBe("vendor 테스트거래처");
    expect(dataRow[4]).not.toContain("302c0549");
  });

  it("반환 형태가 { filename, contentType, body } 세 조각이다(체크포인트 계약)", () => {
    const file = serializeActionLogExportAsCsv([baseRow()]);
    expect(typeof file.filename).toBe("string");
    expect(file.contentType).toContain("text/csv");
    expect(typeof file.body).toBe("string");
  });

  // /cso F3 — CSV 수식 인젝션. csvEscape가 RFC4180 인용만 하고 앞머리 수식
  // 문자를 중화하지 않았다. 이 파일은 BOM을 붙여 Excel 더블클릭 열기를
  // 노리므로(위 BOM 테스트), 사용자가 정하는 이름이 대표·경영관리의 Excel에서
  // 수식으로 평가된다. 쓰기 권한만 있으면 거래처 이름으로 심을 수 있다.
  it.each(["=", "+", "-", "@"])("%s로 시작하는 값은 Excel이 수식으로 읽지 않게 중화된다", (lead) => {
    const payload = `${lead}HYPERLINK("http://evil.example","승인")`;
    const file = serializeActionLogExportAsCsv([baseRow({ actorName: payload })]);
    const parsed = parseCsv(file.body);
    const actorCell = parsed[1]?.[1];
    if (actorCell === undefined) throw new Error("행위자 칸이 없습니다.");

    // 셀이 수식 문자로 시작하면 안 된다 — 그게 Excel의 평가 조건이다.
    expect(actorCell.startsWith(lead)).toBe(false);
    // 그러면서 원래 이름은 사람이 읽을 수 있게 남아 있어야 한다(감사 기록이다).
    expect(actorCell).toContain(payload);
  });

  it("수식 문자로 시작하지 않는 값은 그대로 둔다", () => {
    const file = serializeActionLogExportAsCsv([baseRow({ actorName: "홍길동" })]);
    const parsed = parseCsv(file.body);
    expect(parsed[1]?.[1]).toBe("홍길동");
  });
});
