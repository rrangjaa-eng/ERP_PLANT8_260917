// D-38(Rule 3 — blocking): 액션 레지스트리 등록을 actions.ts("use server",
// server-only 의존 체인)와 분리한다. actions.ts → lib/actions/client.ts →
// lib/viewer.ts → "server-only"/"next/headers"라 실제 액션 파일은 Next.js
// 런타임 밖(Vitest node 환경)에서 import할 수 없다 — 누수 스캔
// (test/integration/leak-scan.test.ts)이 이 등록을 트리거하려면 서버 전용
// 의존성이 없는 별도 파일이 필요하다. 등록 선언은 이 파일 하나뿐이고
// (정본 하나), actions.ts는 이 파일을 side-effect import해 프로덕션에서도
// 같은 등록이 일어나게 한다.
import { registerAction } from "@/lib/actions/registry";

registerAction({
  name: "createCodeItemAction",
  menu: "admin.code-tables",
  action: "write",
  dtoName: "CodeItemDto",
});

registerAction({
  name: "setCodeItemActiveAction",
  menu: "admin.code-tables",
  action: "write",
  dtoName: "CodeItemDto",
});

registerAction({
  name: "setEvidenceTypeTaxRuleAction",
  menu: "admin.code-tables",
  action: "write",
  dtoName: "CodeItemDto",
});

// 03-07: 「삭제」(보관) — 보관함 자체는 domain/archive/index.ts의 정본
// 경로다(03-01). 이 항목은 그 경로를 부르는 액션의 등록일 뿐이다.
registerAction({
  name: "archiveCodeItemAction",
  menu: "admin.archive",
  action: "write",
  dtoName: "CodeItemDto",
});
