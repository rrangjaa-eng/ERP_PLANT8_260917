// SYSTEM.md §7-3 보강 (다) — 클립보드 TSV 붙여넣기 정규화(D-67).
// 04-RESEARCH.md Pattern 4의 상태 기계 파서. 단순 `text.split("\t").split("\n")`은
// 비고(자유 텍스트) 열의 실제 줄바꿈에서 행을 잘못 가른다 — 이 표에 그런 값이
// 실제로 들어온다(§7-3 "조용히 버리지 않는다"). Excel/Google Sheets는 셀 안에
// 탭·줄바꿈·큰따옴표가 있으면 그 셀을 큰따옴표로 감싸고 내부 따옴표를 두 개로
// 이스케이프한다(RFC 4180과 유사한 관례, 공식 표준은 없음 — 04-RESEARCH.md
// Pattern 4 인용 참고). 이 파일이 그 인용 규칙을 아는 유일한 지점이다.

/**
 * 탭 구분(칸) · 줄바꿈 구분(행) 텍스트를 2차원 배열로 읽는다. 큰따옴표로
 * 감싼 칸 안의 탭·줄바꿈·이스케이프된 따옴표(`""` → `"`)는 리터럴로 다룬다.
 */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"' && field === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === "\t") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += ch === "\r" ? 2 : 1;
      continue;
    }
    field += ch;
    i++;
  }

  row.push(field);
  rows.push(row);
  return rows;
}

// 필드 하나를 TSV로 직렬화할 때 인용이 필요한지 판정한다 — 탭·줄바꿈·
// 캐리지 리턴·큰따옴표가 있으면 감싸고 내부 따옴표를 두 배로 이스케이프한다.
function escapeField(field: string): string {
  if (/[\t\n\r"]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * 2차원 배열을 TSV 텍스트로 되돌린다(⌘C 범위 복사가 클립보드에 쓰는 형식
 * — D-70·PROJ-05: 다른 프로젝트의 표에 그대로 붙는다).
 */
export function toTsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeField).join("\t")).join("\n");
}

// SYSTEM.md §7-3 보강 (다) — 숫자 열 붙여넣기: 쉼표·공백·통화 기호를 지운
// 뒤 숫자로 읽는다. 그래도 숫자가 아니면 null(호출부가 오류 셀로 고정한다
// — 조용히 버리지 않는다).
const CURRENCY_OR_SEPARATOR = /[,\s₩$¥￦]/g;
const NUMERIC_PATTERN = /^-?\d+(\.\d+)?$/;

export function normalizeNumericPaste(raw: string): number | null {
  const stripped = raw.replace(CURRENCY_OR_SEPARATOR, "");
  if (stripped === "" || !NUMERIC_PATTERN.test(stripped)) return null;
  const value = Number(stripped);
  return Number.isFinite(value) ? value : null;
}
