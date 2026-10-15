// 06.5-06(D-6504): SheetJS 쓰기를 부르는 유일한 모듈 — 문자열 서식 셀만으로 시트 하나짜리 통합 문서를 만들어 바이트를 돌려준다.
// 셀은 손으로 짓는다(`{ t: "s", v, z: "@" }` — 옛 O: app/src/domain/bankTransfer.ts:610). 값을 보고 형을 정하는 aoa_to_sheet는
// `088` 같은 숫자만 든 글자를 숫자 셀로 돌려 앞자리 0을 날린다.
// `server-only`를 import하지 않는다 — domain/*가 부르고 테스트(Vitest node)가 그 domain을 읽는다(lib/auth.ts 머리주석 규약).
// 대신 `xlsx` import는 이 파일(과 시험)만 하도록 eslint.config.mjs의 no-restricted-imports가 지킨다(EP2-C1).
import * as XLSX from "xlsx";
import { cptable } from "xlsx/dist/cpexcel.full.mjs";

// CP949 표(SheetJS codepage — xlsx 패키지에 함께 든 것, 새 의존성 아님). 파일은 유니코드 xlsx지만 신한이 CP949로 받으므로
// 표에 없는 글자는 그 줄을 깬다. Node TextDecoder("euc-kr")는 확장 완성형(똠 등)을 못 풀어 쓰지 않는다.
const CP949_ENCODE = cptable[949]?.enc ?? {};

export function isCp949Encodable(char: string): boolean {
  return Object.hasOwn(CP949_ENCODE, char);
}

export function buildTextSheetXlsx(sheetName: string, rows: readonly (readonly string[])[]): Uint8Array {
  const sheet: XLSX.WorkSheet = {};
  let lastCol = 0;
  rows.forEach((row, r) => {
    row.forEach((value, c) => {
      sheet[XLSX.utils.encode_cell({ r, c })] = { t: "s", v: value, z: "@" };
      lastCol = Math.max(lastCol, c);
    });
  });
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length - 1, 0), c: lastCol } });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  return new Uint8Array(XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer);
}
