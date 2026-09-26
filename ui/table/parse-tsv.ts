import { stripNumberInput } from "@/lib/format-number";

// SYSTEM.md §7-3 보강 (다) — 클립보드 TSV 붙여넣기 정규화(D-67).
// 04-RESEARCH.md Pattern 4의 상태 기계 파서. 단순 `text.split("\t").split("\n")`은
// 비고(자유 텍스트) 열의 실제 줄바꿈에서 행을 잘못 가른다 — 이 표에 그런 값이
// 실제로 들어온다(§7-3 "조용히 버리지 않는다"). Excel/Google Sheets는 셀 안에
// 탭·줄바꿈이 있을 때만 그 셀을 큰따옴표로 감싸고 내부 따옴표를 두 개로
// 이스케이프한다 — 따옴표만 있고 줄바꿈이 없는 칸(예: `"대형" 현수막`)은
// 감싸지 않고 원문 그대로 쓴다(실제 Windows Excel 원문으로 확인, 04-04
// Task 3 인간 확인 · 2026-09-23. 04-RESEARCH.md Pattern 4 가정 A3가 미확인
// 상태였던 것을 이 확인이 대체한다). 그래서 이 파서는 여는 따옴표를 보면
// 곧장 인용 모드로 들어가지 않는다 — **닫는 따옴표 바로 다음이 탭·줄바꿈·
// 텍스트 끝일 때만** 그 칸을 인용된 칸으로 인정하고, 아니면 따옴표를 포함한
// 전체를 리터럴로 남긴다(RFC 4180과 유사한 관례, 공식 표준은 없음).

/**
 * 현재 위치가 여는 따옴표라고 가정하고 유효한 인용된 칸인지 앞을 내다본다.
 * 닫는 따옴표(이스케이프되지 않은 `"`) 바로 다음이 탭·줄바꿈·텍스트 끝이면
 * 유효한 인용된 칸이다 — 그 안의 `""`는 `"` 하나로, CRLF는 LF 하나로
 * 정규화한다. 유효하지 않으면(닫는 따옴표 뒤에 다른 문자가 오거나 끝까지
 * 닫히지 않으면) `null`을 돌려주고 호출부가 따옴표를 리터럴로 다룬다.
 */
function tryParseQuotedField(text: string, openQuoteIndex: number): { value: string; nextIndex: number } | null {
  let value = "";
  let j = openQuoteIndex + 1;

  while (j < text.length) {
    const ch = text[j];

    if (ch === '"') {
      if (text[j + 1] === '"') {
        value += '"';
        j += 2;
        continue;
      }
      const after = text[j + 1];
      const isValidClose = after === undefined || after === "\t" || after === "\n" || after === "\r";
      if (!isValidClose) return null;
      return { value, nextIndex: j + 1 };
    }

    if (ch === "\r" && text[j + 1] === "\n") {
      value += "\n";
      j += 2;
      continue;
    }

    value += ch;
    j++;
  }

  return null; // 텍스트 끝까지 닫는 따옴표를 못 찾았다 — 인용된 칸이 아니다.
}

/**
 * 탭 구분(칸) · 줄바꿈 구분(행) 텍스트를 2차원 배열로 읽는다. **닫는 따옴표
 * 바로 다음이 탭·줄바꿈·텍스트 끝인** 칸만 인용된 칸으로 인정하고, 그 안의
 * 탭·줄바꿈·이스케이프된 따옴표(`""` → `"`)·CRLF(→ LF)는 리터럴/정규화해
 * 다룬다. 따옴표만 있고 줄바꿈이 없는 칸은 인용된 칸이 아니므로 따옴표를
 * 포함한 원문 그대로 리터럴로 남는다.
 */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '"' && field === "") {
      const quoted = tryParseQuotedField(text, i);
      if (quoted) {
        field = quoted.value;
        i = quoted.nextIndex;
        continue;
      }
      // 유효한 인용된 칸이 아니다 — 따옴표를 리터럴 문자로 다룬다.
      field += ch;
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
 * 2차원 배열을 TSV 텍스트로 되돌린다(Ctrl+C 범위 복사가 클립보드에 쓰는 형식
 * — D-70·PROJ-05: 다른 프로젝트의 표에 그대로 붙는다).
 */
export function toTsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeField).join("\t")).join("\n");
}

// SYSTEM.md §7-3 보강 (다) — 숫자 열 붙여넣기: 쉼표·공백·통화 기호를 지운
// 뒤 숫자로 읽는다. 그래도 숫자가 아니면 null(호출부가 오류 셀로 고정한다
// — 조용히 버리지 않는다). 제거 규칙은 `stripNumberInput`(lib/format-number.ts)
// 하나다 — 04-09 엔지 리뷰 A P3, 입력 쉼표 도우미와 같은 구현을 쓴다.
const NUMERIC_PATTERN = /^-?\d+(\.\d+)?$/;

export function normalizeNumericPaste(raw: string): number | null {
  const stripped = stripNumberInput(raw);
  if (stripped === "" || !NUMERIC_PATTERN.test(stripped)) return null;
  const value = Number(stripped);
  return Number.isFinite(value) ? value : null;
}
