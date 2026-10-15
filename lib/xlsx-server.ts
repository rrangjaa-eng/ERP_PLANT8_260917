// 06.5-06(D-6504): SheetJS 쓰기를 부르는 유일한 모듈 — 문자열 서식 셀만으로 시트 하나짜리 통합 문서를 만들어 바이트를 돌려준다.
// 셀은 손으로 짓는다(`{ t: "s", v, z: "@" }` — 옛 O: app/src/domain/bankTransfer.ts:610). 값을 보고 형을 정하는 aoa_to_sheet는
// `088` 같은 숫자만 든 글자를 숫자 셀로 돌려 앞자리 0을 날린다.
// `server-only`를 import하지 않는다 — domain/*가 부르고 테스트(Vitest node)가 그 domain을 읽는다(lib/auth.ts 머리주석 규약).
// 대신 `xlsx` import는 이 파일과 domain/evidence-import/workbook.ts(읽기)만 하도록 import 허용 목록 grep 게이트가 지킨다(EP2-C1).
import * as XLSX from "xlsx";

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
