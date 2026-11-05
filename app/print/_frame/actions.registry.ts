import { registerAction } from "@/lib/actions/registry";

// 누수 스캔 분류일 뿐 — 열람은 domain/print/record.ts가 서류 읽기 함수로 매번 판정한다(RESEARCH A3). 투영할 DTO가 없다.
registerAction({
  name: "recordDocumentPrintAction",
  menu: "approvals",
  action: "view",
  dtoName: null,
});
