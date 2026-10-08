import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 06.2-04(SC-7 · D-6208 · 검토 반영 R1: eng I3 · N5 · I9 · R2: R2-R1): 「범위는 입구가 아니라 프리미티브에 있다」(Pitfall 1)와
// 「호출부가 빠뜨린다」(260907 `O: server/src/scope.ts:36-41` — settlement.ts:453 · card-uses.ts:553 · home.ts:1082)를 소스 스캔 하나로 잡는다.
// 열거의 출발점은 등록부가 아니라 소스다(04.1 교훈 · test/unit/action-registry-completeness.test.ts 꼴) — 새 입구가 생기면 처분표가 붉어진다.
//  ⓐ `@/domain/permissions/scope-for`의 값 `scopeFor` import(이름 · `as` 별칭 · `* as` 이름공간 · 동적 import)는 마스터 허용 목록 밖에 0 — `import type`은 허용
//  ⓑ `scopeFor(…, "project" | "quote_line" | PROJECT_ENTITY)` 글자 0(별칭 `xScopeFor(` 포함)
//  ⓒ 도메인의 원시 프리미티브 호출 (파일, 둘러싼 최상위 선언, 프리미티브) 집합 = ROW_SCOPE_DISPOSITION — 호출 수 · 줄 번호는 보지 않는다
//  ⓓ repositories에서 projects를 읽는 최상위 선언(`.from(projects)` · `Join(projects`)은 rowScopeCondition( · projectFilterConditions(를 담거나 PROJECT_READ_DISPOSITION에 있다
//  ⓔ `project_members` DELETE 0(A9 — 떼기 = 보관). 예외: scripts/demo-data.ts(데모 프로젝트 줄만 지우는 정리 — /cso CSO-7)
//  ⓕ domain/permissions/ 안에서 scope-for.ts 밖의 `scopeFor` 재수출 0(ⓐ가 permissions를 스캔에서 빼는 자리를 메운다 — 260907도 `O: server/src/scope.ts:58` 한 곳)
// 처분표는 이 파일 안 상수다 — domain/permissions/에 두면 위험 경로가 는다(RESEARCH Q6).

const ROOT = process.cwd();

type Kind = "scoped" | "post-gate" | "exempt";
export type DomainDisposition = { file: string; fn: string; primitive: string; kind: Kind; reason: string };
export type ProjectReadDisposition = { file: string; fn: string; reason: string };

// ⓐ 마스터 허용 목록 — 프로젝트 행 범위가 아닌 엔티티(거래처 · 조직 · 법인카드 · 코드표 · 사람)의 옛 `scopeFor`.
export const SCOPE_FOR_IMPORT_ALLOW: readonly string[] = [
  "domain/vendors/index.ts",
  "domain/org/index.ts",
  "domain/corp-cards/index.ts",
  "domain/code-tables/index.ts",
  "domain/people/index.ts",
];

// ⓔ 예외 — 파일 → 이유.
const MEMBER_DELETE_EXEMPT: Record<string, string> = {
  "scripts/demo-data.ts": "데모 데이터 정리 — 데모 프로젝트(projectIds)의 참여자 줄만 지운다(/cso CSO-7). 운영 경로가 아니다",
};

// 06.2-08: 기안자 본인 문서(작성 · 제출 · 미리보기 · 증빙 상태)와 문서 화면은 문서 게이트(기안자 · canSeeExpense — 보는 범위 · 결재 관련자)가 경계다.
const EXPENSE_DOC_GATE = "지출결의 문서 게이트 — 기안자 본인 문서 · canSeeExpense(보는 범위 ∪ 결재 관련자, 06.2-08)";
// 줄 → 차수는 프로젝트 id만 꺼낸다 — 값은 같은 함수의 loadProjectFacts(findProjectInScope) 판정 뒤에만 나간다(범위 밖 = 없는 줄 · 없는 문서).
const LINE_THEN_PROJECT = "줄 → 차수는 프로젝트 id만 — 같은 함수의 loadProjectFacts(findProjectInScope) 판정 뒤에만 값이 나간다(범위 밖 = 없는 줄 · 없는 문서, 06.2-08 M10)";
const PAYMENT_DOC_GATE = "지급 화면 — 지출결의 문서 게이트(canSeeExpense) 뒤 · 06.2-08 확인(검토 M-4 — domain/payments/index.ts의 견적 줄 · 계보 import)";

// ⓒ 도메인 처분표 — (파일, 둘러싼 최상위 선언, 프리미티브). scoped = 같은 함수 안에서 projectRowScope/findProjectInScope로 판정,
// post-gate = 호출 전 판정 위치를 reason에, exempt = 행 노출 없음 사유를 reason에.
export const ROW_SCOPE_DISPOSITION: readonly DomainDisposition[] = [
  { file: "domain/corp-card-usages/index.ts", fn: "lineNumbers", primitive: "listQuoteLinesByRevisions", kind: "post-gate", reason: "카드 사용 목록 · 카드 섹션의 줄 번호 — 받은 행(listAccess 자기 거름 · listProjectCardUsages findProjectInScope)의 차수만" },
  { file: "domain/corp-card-usages/index.ts", fn: "precheckLink", primitive: "findQuoteLineById", kind: "post-gate", reason: "줄 → 차수는 프로젝트 id만 꺼낸다 — 같은 함수의 findProjectInScope 판정 전에는 값이 나가지 않는다(범위 밖 → LINK_MISSING)" },
  { file: "domain/corp-card-usages/index.ts", fn: "precheckLink", primitive: "findQuoteRevisionById", kind: "post-gate", reason: "줄 → 차수는 프로젝트 id만 꺼낸다 — 같은 함수의 findProjectInScope 판정 전에는 값이 나가지 않는다(범위 밖 → LINK_MISSING)" },
  { file: "domain/corp-card-usages/index.ts", fn: "precheckLink", primitive: "findLatestQuoteRevision", kind: "post-gate", reason: "같은 함수의 findProjectInScope 판정 뒤 현재 차수 id" },
  { file: "domain/corp-card-usages/index.ts", fn: "precheckPurchaseLink", primitive: "findQuoteLineById", kind: "post-gate", reason: "cards.purchases write 판정 뒤 — 구매 처리 권한자 privileged(D-6220 · 목록도 전부), 줄은 요청 행이 고정(작성 때 loadQuoteLineBasis가 범위 판정)" },
  { file: "domain/corp-card-usages/index.ts", fn: "precheckPurchaseLink", primitive: "findQuoteRevisionById", kind: "post-gate", reason: "cards.purchases write 판정 뒤 — 구매 처리 권한자 privileged(D-6220 · 목록도 전부), 줄은 요청 행이 고정(작성 때 loadQuoteLineBasis가 범위 판정)" },
  { file: "domain/corp-card-usages/index.ts", fn: "precheckPurchaseLink", primitive: "findProjectById", kind: "post-gate", reason: "cards.purchases write 판정 뒤 — 구매 처리 권한자 privileged(D-6220 · 목록도 전부), 줄은 요청 행이 고정(작성 때 loadQuoteLineBasis가 범위 판정)" },
  { file: "domain/corp-card-usages/index.ts", fn: "precheckPurchaseLink", primitive: "findLatestQuoteRevision", kind: "post-gate", reason: "cards.purchases write 판정 뒤 — 구매 처리 권한자 privileged(D-6220 · 목록도 전부), 줄은 요청 행이 고정(작성 때 loadQuoteLineBasis가 범위 판정)" },
  { file: "domain/corp-card-usages/index.ts", fn: "previewPurchaseCard", primitive: "findProjectById", kind: "post-gate", reason: "cards.purchases write 판정 뒤 — 구매 처리 권한자 privileged(D-6220 · 목록도 전부), 줄은 요청 행이 고정(작성 때 loadQuoteLineBasis가 범위 판정)" },
  { file: "domain/corp-card-usages/link-targets.ts", fn: "cardLinkLineChoice", primitive: "findQuoteLineById", kind: "post-gate", reason: "줄 → 차수는 프로젝트 id만 꺼낸다 — 값은 cardLinkProjectChoice(findProjectInScope) 판정 뒤에만 나간다" },
  { file: "domain/corp-card-usages/link-targets.ts", fn: "cardLinkLineChoice", primitive: "findQuoteRevisionById", kind: "post-gate", reason: "줄 → 차수는 프로젝트 id만 꺼낸다 — 값은 cardLinkProjectChoice(findProjectInScope) 판정 뒤에만 나간다" },
  { file: "domain/corp-card-usages/link-targets.ts", fn: "currentLineForFixedLink", primitive: "findLatestQuoteRevision", kind: "post-gate", reason: "트랜잭션 안 잠금(lockProjectForLinkWrite 다음) — 트랜잭션 전 precheckLink · precheckPurchaseLink 판정" },
  { file: "domain/corp-card-usages/link-targets.ts", fn: "currentLineForFixedLink", primitive: "listLineageLinesByProjects", kind: "post-gate", reason: "트랜잭션 안 잠금(lockProjectForLinkWrite 다음) — 트랜잭션 전 precheckLink · precheckPurchaseLink 판정" },
  { file: "domain/corp-card-usages/link-targets.ts", fn: "lockProjectForLinkWrite", primitive: "findLatestQuoteRevision", kind: "post-gate", reason: "트랜잭션 안 잠금 — 트랜잭션 전 precheckLink 판정(04-32)" },
  { file: "domain/corp-card-usages/link-targets.ts", fn: "lineCardSideFacts", primitive: "listQuoteLinesByRevision", kind: "post-gate", reason: "차수 id로 카드 쪽 사실 — 호출자 상세 페이지(findProject 뒤) · saveProjectLedger(findProjectInScope 뒤)" },
  { file: "domain/corp-card-usages/link-targets.ts", fn: "searchLinesForCardLink", primitive: "findLatestQuoteRevision", kind: "post-gate", reason: "같은 함수의 findProjectInScope 판정 뒤 현재 차수 줄" },
  { file: "domain/corp-card-usages/link-targets.ts", fn: "searchLinesForCardLink", primitive: "listQuoteLinesByRevisions", kind: "post-gate", reason: "같은 함수의 findProjectInScope 판정 뒤 현재 차수 줄" },
  { file: "domain/evidence/index.ts", fn: "expenseState", primitive: "findProjectById", kind: "post-gate", reason: EXPENSE_DOC_GATE },
  { file: "domain/expenses/index.ts", fn: "changeExpenseLine", primitive: "findQuoteLineById", kind: "post-gate", reason: LINE_THEN_PROJECT },
  { file: "domain/expenses/index.ts", fn: "changeExpenseLine", primitive: "findQuoteRevisionById", kind: "post-gate", reason: LINE_THEN_PROJECT },
  { file: "domain/expenses/index.ts", fn: "createExpenseFromLines", primitive: "findQuoteLineById", kind: "post-gate", reason: LINE_THEN_PROJECT },
  { file: "domain/expenses/index.ts", fn: "createExpenseFromLines", primitive: "findQuoteRevisionById", kind: "post-gate", reason: LINE_THEN_PROJECT },
  { file: "domain/expenses/index.ts", fn: "lineFactsFor", primitive: "findQuoteLineById", kind: "post-gate", reason: `getExpense — ${EXPENSE_DOC_GATE}` },
  { file: "domain/expenses/index.ts", fn: "listLineDoors", primitive: "listQuoteLinesByRevision", kind: "post-gate", reason: "같은 함수의 loadProjectFacts(findProjectInScope) 판정 뒤 현재 차수 줄 — 범위 밖은 열 숨김(06.2-08 M10)" },
  { file: "domain/expenses/index.ts", fn: "listNumberedByLineChain", primitive: "listLineageLinesByProjects", kind: "post-gate", reason: `제출 · 미리보기(loadSubmitFacts) · 문서(lineFactsFor) — ${EXPENSE_DOC_GATE}` },
  { file: "domain/expenses/index.ts", fn: "listNumberedByLineageMany", primitive: "listLineageLinesByProjects", kind: "post-gate", reason: "호출자 판정 뒤 프로젝트 id만 — 줄 고르기(listPickProjects · findProjectInScope) · 만들기 · 줄 바꾸기 · 줄 문(loadProjectFacts) · 지급 화면(canSeeExpense)" },
  { file: "domain/expenses/index.ts", fn: "loadProjectFactsMany", primitive: "listLatestQuoteRevisionsByProjects", kind: "post-gate", reason: "받은 행만 — 호출자 searchLinesForPick이 listPickProjects(rowScopeCondition) · findProjectInScope로 읽은 프로젝트(06.2-08 M10)" },
  { file: "domain/expenses/index.ts", fn: "loadProjectFacts", primitive: "findLatestQuoteRevision", kind: "scoped", reason: "같은 함수의 findProjectInScope 판정 뒤 — 범위 밖은 없는 프로젝트(null, 06.2-08 M10)" },
  { file: "domain/expenses/index.ts", fn: "loadSubmitFacts", primitive: "findLatestQuoteRevision", kind: "post-gate", reason: `제출 · 미리보기 — ${EXPENSE_DOC_GATE}` },
  { file: "domain/expenses/index.ts", fn: "loadSubmitFacts", primitive: "findQuoteLineById", kind: "post-gate", reason: `제출 · 미리보기 — ${EXPENSE_DOC_GATE}` },
  { file: "domain/expenses/index.ts", fn: "previewExpense", primitive: "findProjectById", kind: "post-gate", reason: EXPENSE_DOC_GATE },
  { file: "domain/expenses/index.ts", fn: "submitExpense", primitive: "findProjectById", kind: "post-gate", reason: EXPENSE_DOC_GATE },
  { file: "domain/expenses/pick.ts", fn: "listClosedInstallmentsByLineageMany", primitive: "listLineageLinesByProjects", kind: "post-gate", reason: "호출자 searchLinesForPick의 범위 판정(listPickProjects · findProjectInScope) 뒤 프로젝트 id만" },
  { file: "domain/expenses/pick.ts", fn: "searchLinesForPick", primitive: "listQuoteLinesByRevisions", kind: "scoped", reason: "같은 함수의 listPickProjects(rowScopeCondition) · findProjectInScope 판정 뒤 현재 차수 줄(06.2-08 M10)" },
  { file: "domain/issue-requests/index.ts", fn: "listProjectIssueRequests", primitive: "listIssueRequestRowsByProject", kind: "scoped", reason: "같은 함수의 projectRowScope + findProjectInScope 판정 뒤(06.2-04)" },
  { file: "domain/payments/index.ts", fn: "cardSuppliesOnChain", primitive: "listAliveCardUsageSuppliesByProject", kind: "post-gate", reason: PAYMENT_DOC_GATE },
  { file: "domain/payments/index.ts", fn: "cardSuppliesOnChain", primitive: "listLineageLinesByProjects", kind: "post-gate", reason: PAYMENT_DOC_GATE },
  { file: "domain/payments/index.ts", fn: "lineRemainingFor", primitive: "findQuoteLineById", kind: "post-gate", reason: PAYMENT_DOC_GATE },
  { file: "domain/projects/index.ts", fn: "createProject", primitive: "findLatestQuoteRevision", kind: "post-gate", reason: "새로 만든 프로젝트(또는 findCopySourceRow 범위 판정을 지난 복사 출처)의 차수" },
  { file: "domain/projects/index.ts", fn: "getProjectCopySource", primitive: "findLatestQuoteRevision", kind: "post-gate", reason: "findCopySourceRow(findProjectInScope) 판정 뒤(06.2-03)" },
  { file: "domain/projects/ledger.ts", fn: "saveProjectLedger", primitive: "findProjectById", kind: "post-gate", reason: "트랜잭션 전 findProjectInScope 판정 뒤 차수 소속 · 팀장 이름(06.2-03)" },
  { file: "domain/projects/ledger.ts", fn: "saveProjectLedger", primitive: "findQuoteRevisionById", kind: "post-gate", reason: "트랜잭션 전 findProjectInScope 판정 뒤 차수 소속 · 팀장 이름(06.2-03)" },
  { file: "domain/projects/visibility.ts", fn: "canOpenRevision", primitive: "findQuoteRevisionById", kind: "scoped", reason: "관문 자신 — 차수 → 프로젝트 id를 꺼내 canOpenProject(findProjectInScope)로 판정, 행을 돌려주지 않는다" },
  { file: "domain/purchase-requests/index.ts", fn: "lineNumbers", primitive: "listQuoteLinesByRevisions", kind: "post-gate", reason: "구매 요청 목록의 줄 번호 — 받은 행(listAccess 자기 거름 · privileged)의 차수만" },
  { file: "domain/purchase-requests/index.ts", fn: "loadPurchaseCompletion", primitive: "findProjectById", kind: "post-gate", reason: "cards.purchases write 판정 뒤 — 구매 처리 권한자 privileged(D-6220 · 목록도 전부), 줄은 요청 행이 고정(작성 때 loadQuoteLineBasis가 범위 판정)" },
  { file: "domain/purchase-requests/index.ts", fn: "loadPurchaseCompletion", primitive: "findQuoteLineById", kind: "post-gate", reason: "cards.purchases write 판정 뒤 — 구매 처리 권한자 privileged(D-6220 · 목록도 전부), 줄은 요청 행이 고정(작성 때 loadQuoteLineBasis가 범위 판정)" },
  { file: "domain/purchase-requests/index.ts", fn: "loadQuoteLineBasis", primitive: "findQuoteLineById", kind: "post-gate", reason: "줄 → 차수는 프로젝트 id만 꺼낸다 — 같은 함수의 findProjectInScope 판정 전에는 값이 나가지 않는다(범위 밖 → LINK_MISSING)" },
  { file: "domain/purchase-requests/index.ts", fn: "loadQuoteLineBasis", primitive: "findQuoteRevisionById", kind: "post-gate", reason: "줄 → 차수는 프로젝트 id만 꺼낸다 — 같은 함수의 findProjectInScope 판정 전에는 값이 나가지 않는다(범위 밖 → LINK_MISSING)" },
  { file: "domain/purchase-requests/index.ts", fn: "loadQuoteLineBasis", primitive: "findLatestQuoteRevision", kind: "post-gate", reason: "같은 함수의 findProjectInScope 판정 뒤 현재 차수 id" },
  { file: "domain/purchase-requests/index.ts", fn: "purchaseRequestEntry", primitive: "findQuoteLineById", kind: "post-gate", reason: "줄 → 차수는 프로젝트 id만 꺼낸다 — 값은 cardLinkProjectChoice · searchLinesForPurchaseLink(findProjectInScope) 판정 뒤" },
  { file: "domain/purchase-requests/index.ts", fn: "purchaseRequestEntry", primitive: "findQuoteRevisionById", kind: "post-gate", reason: "줄 → 차수는 프로젝트 id만 꺼낸다 — 값은 cardLinkProjectChoice · searchLinesForPurchaseLink(findProjectInScope) 판정 뒤" },
  { file: "domain/purchase-requests/index.ts", fn: "searchLinesForPurchaseLink", primitive: "findLatestQuoteRevision", kind: "post-gate", reason: "같은 함수의 findProjectInScope 판정 뒤 현재 차수 줄" },
  { file: "domain/purchase-requests/index.ts", fn: "searchLinesForPurchaseLink", primitive: "listQuoteLinesByRevisions", kind: "post-gate", reason: "같은 함수의 findProjectInScope 판정 뒤 현재 차수 줄" },
  { file: "domain/quotes/lines.ts", fn: "createOutOfQuoteLine", primitive: "listQuoteLinesByRevision", kind: "post-gate", reason: "카드 사용 트랜잭션 안 — 트랜잭션 전 precheckLink(findProjectInScope) 판정(06.2-03 주석)" },
  { file: "domain/quotes/lines.ts", fn: "getCurrentQuoteRevision", primitive: "findLatestQuoteRevision", kind: "post-gate", reason: "차수 요약(id · 순번 · 승인)만 — 호출자가 관문 뒤(상세 페이지 findProject · 픽스처), 견적 줄 값은 listQuoteLines가 canOpenRevision으로 막는다" },
  { file: "domain/quotes/lines.ts", fn: "listQuoteLines", primitive: "findQuoteRevisionById", kind: "scoped", reason: "같은 함수의 canOpenRevision 판정 뒤(06.2-03)" },
  { file: "domain/quotes/lines.ts", fn: "listQuoteLines", primitive: "listQuoteLinesByRevision", kind: "scoped", reason: "같은 함수의 canOpenRevision 판정 뒤(06.2-03)" },
  { file: "domain/quotes/lines.ts", fn: "loadLinkedDocumentsByLine", primitive: "findQuoteRevisionById", kind: "post-gate", reason: "줄 목록 · 저장 내부 — 호출자 listQuoteLines · prepareQuoteLineSave(canOpenRevision) · writeQuoteLinesInTx 뒤" },
  { file: "domain/quotes/lines.ts", fn: "loadLinkedDocumentsByLine", primitive: "listNumberedByProject", kind: "post-gate", reason: "줄 목록 · 저장 내부 — 호출자 listQuoteLines · prepareQuoteLineSave(canOpenRevision) · writeQuoteLinesInTx 뒤" },
  { file: "domain/quotes/lines.ts", fn: "loadLinkedDocumentsByLine", primitive: "listQuoteLinesByRevision", kind: "post-gate", reason: "줄 목록 · 저장 내부 — 호출자 listQuoteLines · prepareQuoteLineSave(canOpenRevision) · writeQuoteLinesInTx 뒤" },
  { file: "domain/quotes/lines.ts", fn: "prepareQuoteLineSave", primitive: "findQuoteRevisionById", kind: "scoped", reason: "같은 함수의 canOpenRevision 판정 뒤(06.2-03)" },
  { file: "domain/quotes/lines.ts", fn: "restoreQuoteLine", primitive: "findQuoteLineById", kind: "scoped", reason: "같은 함수의 canOpenRevision 판정(줄 → 차수) — 줄 id로 차수를 꺼낸 뒤 판정, 값은 판정 뒤(06.2-03)" },
  { file: "domain/quotes/lines.ts", fn: "restoreQuoteLine", primitive: "findQuoteRevisionById", kind: "scoped", reason: "같은 함수의 canOpenRevision 판정(줄 → 차수) — 줄 id로 차수를 꺼낸 뒤 판정, 값은 판정 뒤(06.2-03)" },
  { file: "domain/quotes/lines.ts", fn: "restoreQuoteLine", primitive: "findLatestQuoteRevision", kind: "scoped", reason: "같은 함수의 canOpenRevision 판정(줄 → 차수) — 줄 id로 차수를 꺼낸 뒤 판정, 값은 판정 뒤(06.2-03)" },
  { file: "domain/quotes/lines.ts", fn: "writeQuoteLinesInTx", primitive: "findLatestQuoteRevision", kind: "post-gate", reason: "저장 트랜잭션 안 — 트랜잭션 전 prepareQuoteLineSave(canOpenRevision) · saveProjectLedger(findProjectInScope) 판정(06.2-03 주석)" },
  { file: "domain/quotes/lines.ts", fn: "writeQuoteLinesInTx", primitive: "findQuoteLineById", kind: "post-gate", reason: "저장 트랜잭션 안 — 트랜잭션 전 prepareQuoteLineSave(canOpenRevision) · saveProjectLedger(findProjectInScope) 판정(06.2-03 주석)" },
  { file: "domain/quotes/lines.ts", fn: "writeQuoteLinesInTx", primitive: "listQuoteLinesByRevision", kind: "post-gate", reason: "저장 트랜잭션 안 — 트랜잭션 전 prepareQuoteLineSave(canOpenRevision) · saveProjectLedger(findProjectInScope) 판정(06.2-03 주석)" },
  { file: "domain/quotes/revisions.ts", fn: "createRevisionFromCurrent", primitive: "findLatestQuoteRevision", kind: "post-gate", reason: "같은 함수의 findProjectInScope 판정 뒤(06.2-03)" },
  { file: "domain/quotes/revisions.ts", fn: "listRevisionLines", primitive: "findLatestQuoteRevision", kind: "post-gate", reason: "같은 함수 첫 줄 findProject(범위) 판정 뒤" },
  { file: "domain/quotes/revisions.ts", fn: "listRevisionLines", primitive: "findQuoteRevisionByProjectAndSeq", kind: "post-gate", reason: "같은 함수 첫 줄 findProject(범위) 판정 뒤" },
  { file: "domain/quotes/revisions.ts", fn: "setCustomerApproval", primitive: "findLatestQuoteRevision", kind: "post-gate", reason: "차수 → 프로젝트 id를 꺼낸 뒤 findProjectInScope 판정(06.2-03), 값은 판정 뒤" },
  { file: "domain/quotes/revisions.ts", fn: "setCustomerApproval", primitive: "findQuoteRevisionById", kind: "post-gate", reason: "차수 → 프로젝트 id를 꺼낸 뒤 findProjectInScope 판정(06.2-03), 값은 판정 뒤" },
  { file: "domain/revenue/index.ts", fn: "deriveContract", primitive: "findLatestQuoteRevision", kind: "post-gate", reason: "호출자 listRevenue의 projectRowScope + findProjectInScope 판정 뒤" },
  { file: "domain/revenue/index.ts", fn: "listRevenue", primitive: "listRevenueEntriesByProject", kind: "scoped", reason: "같은 함수의 projectRowScope + findProjectInScope 판정 뒤(06.2-04)" },
  { file: "domain/settlements/index.ts", fn: "canResubmitSettlement", primitive: "listSettlementSummaries", kind: "post-gate", reason: "결재 엔진 훅 — 결재 관련자(지금 단계 후보 · 처리자) 판정 뒤, 결재함은 범위로 거르지 않는다(D-6205 ②) · 담당 PM 쓰기 권리만 돌려준다" },
  { file: "domain/settlements/index.ts", fn: "canSeeSettlementDocument", primitive: "listSettlementSummaries", kind: "post-gate", reason: "문서 화면 404 판정 — 바로 canSeeSettlement(기안자 · 결재 관련자 · findProject)로 거른다, 불리언만" },
  { file: "domain/settlements/index.ts", fn: "describeSettlementDocuments", primitive: "listSettlementSummaries", kind: "post-gate", reason: "결재 엔진 훅 — 결재 관련자(지금 단계 후보 · 처리자) 판정 뒤, 결재함은 범위로 거르지 않는다(D-6205 ②)" },
  { file: "domain/settlements/index.ts", fn: "getSettlementHeader", primitive: "listSettlementSummaries", kind: "post-gate", reason: "문서가 있으면 canSeeSettlement, 없으면 findProjectInScope 판정 — 낱말 · 불리언만" },
  { file: "domain/settlements/index.ts", fn: "getSettlement", primitive: "listSettlementSummaries", kind: "post-gate", reason: "canSeeSettlement(기안자 · 결재 관련자 · findProject) 판정 뒤" },
  { file: "domain/settlements/index.ts", fn: "isSettlementResubmitWaiting", primitive: "listSettlementSummaries", kind: "post-gate", reason: "기안자 본인(drafterId = viewer) 판정 — 불리언만" },
  { file: "domain/settlements/index.ts", fn: "loadSettlementDetails", primitive: "listSettlementSummaries", kind: "post-gate", reason: "결재 엔진 훅 — 결재 관련자(지금 단계 후보 · 처리자) 판정 뒤, 결재함은 범위로 거르지 않는다(D-6205 ②)" },
  { file: "domain/settlements/index.ts", fn: "onSettlementFinalApprovalInTx", primitive: "countInReviewByProjects", kind: "post-gate", reason: "최종 승인 트랜잭션 안 — 결재 엔진이 지금 담당(findFinalStepActorInTx) 판정" },
  { file: "domain/settlements/index.ts", fn: "prepareSettlementFinalApproval", primitive: "listSettlementSummaries", kind: "post-gate", reason: "결재 엔진 훅 — 결재 관련자(지금 단계 후보 · 처리자) 판정 뒤, 결재함은 범위로 거르지 않는다(D-6205 ②) · 프로젝트 id만" },
  { file: "domain/settlements/index.ts", fn: "settlementApproveBlockedReason", primitive: "countInReviewByProjects", kind: "post-gate", reason: "결재 엔진 훅 — 결재 관련자(지금 단계 후보 · 처리자) 판정 뒤, 결재함은 범위로 거르지 않는다(D-6205 ②) · 막힘 문구만" },
  { file: "domain/settlements/index.ts", fn: "settlementApproveBlockedReason", primitive: "listSettlementSummaries", kind: "post-gate", reason: "결재 엔진 훅 — 결재 관련자(지금 단계 후보 · 처리자) 판정 뒤, 결재함은 범위로 거르지 않는다(D-6205 ②) · 막힘 문구만" },
  { file: "domain/settlements/index.ts", fn: "submitSettlement", primitive: "findProjectById", kind: "post-gate", reason: "트랜잭션 전 findProject · findProjectInScope 판정 뒤 tx 읽기(06.2-04)" },
  { file: "domain/settlements/index.ts", fn: "submitSettlement", primitive: "findSettlementByProjectId", kind: "post-gate", reason: "트랜잭션 전 findProject · findProjectInScope 판정 뒤" },
  { file: "domain/settlements/index.ts", fn: "totalsOf", primitive: "findLatestQuoteRevision", kind: "post-gate", reason: "문서 보임(canSeeSettlement · 결재 엔진의 결재 관련자) 뒤 두 합 — 범위 밖 결재자 · 기안자도 오류 없이(D-6205 ② · 검토 I-1), 금액은 quote.amount 투영" },
  { file: "domain/settlements/index.ts", fn: "totalsOf", primitive: "listQuoteLinesByRevision", kind: "post-gate", reason: "문서 보임(canSeeSettlement · 결재 엔진의 결재 관련자) 뒤 두 합 — 범위 밖 결재자 · 기안자도 오류 없이(D-6205 ② · 검토 I-1), 금액은 quote.amount 투영" },
  { file: "domain/settlements/index.ts", fn: "withdrawSettlement", primitive: "findSettlementByProjectId", kind: "post-gate", reason: "기안자 본인(drafterId = viewer) 판정 뒤" },
];

// ⓓ 리포지토리 projects 읽기 처분표 — (파일, 최상위 선언, 이유).
export const PROJECT_READ_DISPOSITION: readonly ProjectReadDisposition[] = [
  { file: "repositories/corp-card-usages.ts", fn: "listCardUsageRows", reason: "카드 사용 목록(#9) — listAccess(자기 거름 · privileged · 지름길 K2)가 행을 거른다, 프로젝트는 상태 · 이름 조인만" },
  { file: "repositories/corp-card-usages.ts", fn: "findCardUsageForWrite", reason: "카드 사용 한 건 수정 · 삭제 — 권리(cardUsageRights) 판정이 행을 거른다, 프로젝트는 상태 · id 조인만" },
  { file: "repositories/expenses.ts", fn: "listExpenseSummaries", reason: "id로 받은 문서만 — 호출자 getExpense(canSeeExpense) · 결재함 문서 요약(결재 관련자, 범위로 거르지 않음 D-6205 ②)" },
  { file: "repositories/expenses.ts", fn: "listExpensePage", reason: "지출결의 목록 — scopeCondition(기안자 ∪ 결재 관련자 ∪ rowScopeCondition)이 행을 거른다(06.2-08)" },
  { file: "repositories/expenses.ts", fn: "summarizeExpenseList", reason: "지출결의 합계 — 목록과 같은 scopeCondition(06.2-08)" },
  { file: "repositories/expenses.ts", fn: "isExpenseInScope", reason: "지출결의 문서 하나(canSeeExpense) — 목록과 같은 scopeCondition(06.2-08)" },
  { file: "repositories/expenses.ts", fn: "listExpenseIdsInScope", reason: "지급 대상 id 묶음 — 문서 하나와 같은 scopeCondition을 한 질의로(06.2-08 검토 I-1)" },
  { file: "repositories/payment-targets.ts", fn: "selectRows", reason: "지급 대상 — 도메인 visibleRows(rowScope all 단축 · 아니면 listExpenseIdsInScope — scopeCondition 한 질의)가 거른다(06.2-08 검토 I-1)" },
  { file: "repositories/projects.ts", fn: "findProjectById", reason: "원시 프리미티브 — 도메인 호출 자리는 ⓒ 처분표가 고정한다" },
  { file: "repositories/projects.ts", fn: "findProjectByNumber", reason: "도메인 · 화면 호출자 없음 — 부르면 ⓒ 프리미티브 목록에 이름을 더한다" },
  { file: "repositories/projects.ts", fn: "lockProjectForWrite", reason: "트랜잭션 안 잠금 — 호출자가 트랜잭션 전 범위 판정(findProjectInScope · precheckLink · 지출결의 게이트, 04-32)" },
  { file: "repositories/projects.ts", fn: "lockAutoSettleCandidates", reason: "시스템 자동 정산(D-76) — 행 노출 없음, 상태 전환만(검토 M-5 수용)" },
  { file: "repositories/purchase-requests.ts", fn: "readLockedLineFacts", reason: "구매 요청 트랜잭션 안 잠긴 줄 사실 — 트랜잭션 전 loadQuoteLineBasis(findProjectInScope) · 구매 처리 privileged" },
  { file: "repositories/purchase-requests.ts", fn: "listPurchaseRequestRows", reason: "구매 요청 목록(#10) — listAccess(자기 거름 · privileged · 지름길 K2)가 행을 거른다" },
  { file: "repositories/purchase-requests.ts", fn: "listPurchaseRequestEstimates", reason: "구매 요청 합계 — 목록과 같은 listAccess 범위" },
  { file: "repositories/reserve-entries.ts", fn: "findProjectClientIds", reason: "리저브 저장 트랜잭션 안 클라이언트 대조 — 트랜잭션 전 listProjectIdsInScope 판정 뒤, 이름 노출 없음" },
  { file: "repositories/settlement-approvals.ts", fn: "listSettlementSummaries", reason: "정산 결재 문서(M9) — 도메인 canSeeSettlement · 결재 엔진이 거른다(ⓒ 처분표 줄)" },
];

// ── 소스 읽기 ────────────────────────────────────────────────────────────

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

export type SourceFile = { file: string; src: string };

function sourcesUnder(...dirs: string[]): SourceFile[] {
  return dirs.flatMap((dir) => walk(resolve(ROOT, dir))).map((full) => ({ file: relative(ROOT, full), src: readFileSync(full, "utf8") }));
}

// 주석 줄(`//` · 블록 주석 안 줄 · JSDoc)을 빈 줄로 — 줄 번호 자리는 유지한다.
function codeLines(src: string): string[] {
  let inBlock = false;
  return src.split("\n").map((line) => {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes("*/")) inBlock = false;
      return "";
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlock = true;
      return "";
    }
    return trimmed.startsWith("//") ? "" : line;
  });
}

const TOP_DECL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?\s+(\w+)|(?:const|let|class)\s+(\w+))/;

// 줄마다 둘러싼 최상위 선언 이름(가장 가까운 앞쪽 `function 이름` · `const 이름 =`). 없으면 `<module>`.
function enclosingNames(lines: string[]): string[] {
  let current = "<module>";
  return lines.map((line) => {
    const match = TOP_DECL.exec(line);
    if (match) current = match[1] ?? match[2] ?? current;
    return current;
  });
}

type ImportStatement = { typeOnly: boolean; clause: string; from: string; text: string };

function importsIn(code: string): ImportStatement[] {
  return [...code.matchAll(/import\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g)].map((match) => ({
    typeOnly: Boolean(match[1]),
    clause: match[2] ?? "",
    from: match[3] ?? "",
    text: match[0],
  }));
}

// `{ a, b as c, type d }` → [{ imported, local, typeOnly }]
function namedSpecs(clause: string): { imported: string; local: string; typeOnly: boolean }[] {
  const braces = /\{([\s\S]*)\}/.exec(clause)?.[1];
  if (!braces) return [];
  return braces
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const typeOnly = part.startsWith("type ");
      const [imported = "", local] = part.replace(/^type\s+/, "").split(/\s+as\s+/);
      return { imported: imported.trim(), local: (local ?? imported).trim(), typeOnly };
    });
}

const SCOPE_FOR_SOURCE = /(^@\/domain\/permissions\/scope-for$|(^|\/)scope-for$)/;

// ⓐ 한 파일의 값 `scopeFor` import — 위반 후보 설명 목록.
export function scopeForImportsIn(file: string, src: string): string[] {
  const code = codeLines(src).join("\n");
  const found: string[] = [];
  for (const statement of importsIn(code)) {
    if (!SCOPE_FOR_SOURCE.test(statement.from) || statement.typeOnly) continue;
    if (/\*\s+as\s+\w+/.test(statement.clause)) found.push(`${file}: 이름공간 import(${statement.text.replace(/\s+/g, " ")})`);
    for (const spec of namedSpecs(statement.clause)) {
      if (!spec.typeOnly && spec.imported === "scopeFor") found.push(`${file}: scopeFor import${spec.local === "scopeFor" ? "" : ` as ${spec.local}`}`);
    }
  }
  for (const match of code.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
    if (SCOPE_FOR_SOURCE.test(match[1] ?? "")) found.push(`${file}: 동적 import(${match[1]})`);
  }
  return found;
}

// ⓑ 프로젝트 · 견적 줄 키로 옛 scopeFor를 부르는 글자(별칭 포함). 새 서술자 `rowScopeFor`는 제외.
export function projectScopeForCallsIn(file: string, src: string): string[] {
  return codeLines(src).flatMap((line, index) =>
    /\b(?!rowScopeFor\b)\w*[sS]copeFor\(\s*[^,()]+,\s*(?:"project"|"quote_line"|PROJECT_ENTITY\b)/.test(line) ? [`${file}:${index + 1}`] : [],
  );
}

// 리포지토리 export 함수 이름.
function exportedNamesIn(src: string): string[] {
  return [...codeLines(src).join("\n").matchAll(/export\s+(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=)/g)].map((match) => match[1] ?? match[2] ?? "");
}

const NAMED_PRIMITIVES = [
  "findProjectById",
  "findQuoteRevisionById",
  "findQuoteLineById",
  "findLatestQuoteRevision",
  "listQuoteLinesByRevision",
  "listQuoteLinesByRevisions",
  "listRevenueEntriesByProject",
  "listIssueRequestRowsByProject",
  "listSettlementSummaries",
] as const;

// ⓒ 프리미티브 = 이름 목록 + repositories export 중 이름에 `ByProject`가 든 함수 전부(소스에서 뽑는다).
export function primitiveNames(repositories: SourceFile[]): string[] {
  const byProject = repositories.flatMap(({ src }) => exportedNamesIn(src).filter((name) => name.includes("ByProject")));
  return [...new Set([...NAMED_PRIMITIVES, ...byProject])].sort();
}

const REPOSITORY_SOURCE = /^(@\/repositories\/|(\.\.\/)+repositories\/)/;

// ⓒ 한 도메인 파일의 원시 프리미티브 참조 → `file|fn|primitive` 열쇠(호출 · 주입 기본값 모두 — 수는 세지 않는다).
export function primitiveKeysIn(file: string, src: string, primitives: readonly string[]): string[] {
  const lines = codeLines(src);
  const code = lines.join("\n");
  const names = enclosingNames(lines);
  const wanted = new Set(primitives);
  const locals = new Map<string, string>();
  const namespaces: string[] = [];
  const importLines = new Set<number>();
  for (const statement of importsIn(code)) {
    if (!REPOSITORY_SOURCE.test(statement.from) || statement.typeOnly) continue;
    const start = code.slice(0, code.indexOf(statement.text)).split("\n").length - 1;
    for (let i = 0; i < statement.text.split("\n").length; i++) importLines.add(start + i);
    const namespace = /\*\s+as\s+(\w+)/.exec(statement.clause)?.[1];
    if (namespace) namespaces.push(namespace);
    for (const spec of namedSpecs(statement.clause)) if (!spec.typeOnly && wanted.has(spec.imported)) locals.set(spec.local, spec.imported);
  }
  const keys = new Set<string>();
  lines.forEach((line, index) => {
    if (importLines.has(index)) return;
    for (const [local, primitive] of locals) {
      if (new RegExp(`(?<![.\\w])${local}\\b`).test(line)) keys.add(`${file}|${names[index]}|${primitive}`);
    }
    for (const namespace of namespaces) {
      for (const match of line.matchAll(new RegExp(`\\b${namespace}\\.(\\w+)`, "g"))) {
        const primitive = match[1] ?? "";
        if (wanted.has(primitive)) keys.add(`${file}|${names[index]}|${primitive}`);
      }
    }
  });
  return [...keys];
}

export type ProjectRead = { file: string; fn: string; scoped: boolean };

// ⓓ 한 리포지토리 파일의 projects 읽기 — 최상위 선언 단위.
export function projectReadsIn(file: string, src: string): ProjectRead[] {
  const lines = codeLines(src);
  const names = enclosingNames(lines);
  const bodies = new Map<string, string>();
  lines.forEach((line, index) => {
    const name = names[index] ?? "<module>";
    bodies.set(name, `${bodies.get(name) ?? ""}\n${line}`);
  });
  return [...bodies].flatMap(([fn, body]) =>
    /\.from\(\s*projects\s*\)|[jJ]oin\(\s*projects\b/.test(body) ? [{ file, fn, scoped: /rowScopeCondition\(|projectFilterConditions\(/.test(body) }] : [],
  );
}

// ⓔ project_members DELETE.
export function memberDeletesIn(file: string, src: string): string[] {
  return codeLines(src).flatMap((line, index) => (/delete\(\s*projectMembers\b|DELETE\s+FROM\s+"?project_members"?/i.test(line) ? [`${file}:${index + 1}`] : []));
}

// ⓕ domain/permissions 안 scope-for.ts 밖의 scopeFor 재수출.
export function scopeForReexportsIn(file: string, src: string): string[] {
  const code = codeLines(src).join("\n");
  const found: string[] = [];
  for (const match of code.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}(?:\s*from\s*["'][^"']+["'];?)?/g)) {
    if (/(^|[\s,])scopeFor(\s+as\s+\w+)?\s*(,|$)/.test(match[1] ?? "")) found.push(`${file}: ${match[0].replace(/\s+/g, " ")}`);
  }
  for (const match of code.matchAll(/export\s*\*\s*(?:as\s+\w+\s+)?from\s*["']([^"']+)["']/g)) {
    if (SCOPE_FOR_SOURCE.test(match[1] ?? "")) found.push(`${file}: export * from ${match[1]}`);
  }
  return found;
}

// ── 위반 판정(순수) ───────────────────────────────────────────────────────

export type RowScopeFound = {
  scopeForImports: { file: string; detail: string }[];
  projectScopeForCalls: string[];
  primitiveKeys: string[];
  projectReads: ProjectRead[];
  memberDeletes: { file: string; at: string }[];
  scopeForReexports: string[];
};

export type RowScopeTables = {
  importAllow: readonly string[];
  domain: readonly DomainDisposition[];
  projectReads: readonly ProjectReadDisposition[];
  memberDeleteExempt: Record<string, string>;
};

export function dispositionKey(entry: Pick<DomainDisposition, "file" | "fn" | "primitive">): string {
  return `${entry.file}|${entry.fn}|${entry.primitive}`;
}

export function rowScopeViolations(found: RowScopeFound, tables: RowScopeTables): string[] {
  const violations: string[] = [];
  for (const { file, detail } of found.scopeForImports) if (!tables.importAllow.includes(file)) violations.push(`ⓐ 허용 목록 밖 scopeFor import — ${detail}`);
  for (const at of found.projectScopeForCalls) violations.push(`ⓑ 프로젝트 · 견적 줄 scopeFor 호출 — ${at}`);

  const table = new Map(tables.domain.map((entry) => [dispositionKey(entry), entry]));
  const seen = new Set(found.primitiveKeys);
  for (const key of seen) if (!table.has(key)) violations.push(`ⓒ 처분표에 없는 새 입구 — ${key}`);
  for (const key of table.keys()) if (!seen.has(key)) violations.push(`ⓒ 표에만 남은 낡은 열쇠 — ${key}`);
  for (const entry of tables.domain) if (entry.reason.trim() === "") violations.push(`ⓒ 이유 없는 ${entry.kind} — ${dispositionKey(entry)}`);

  const readTable = new Map(tables.projectReads.map((entry) => [`${entry.file}|${entry.fn}`, entry]));
  for (const read of found.projectReads) {
    if (!read.scoped && !readTable.has(`${read.file}|${read.fn}`)) violations.push(`ⓓ 범위 없는 projects 읽기 — ${read.file} ${read.fn}`);
  }
  const reads = new Set(found.projectReads.map((read) => `${read.file}|${read.fn}`));
  for (const [key, entry] of readTable) {
    if (!reads.has(key)) violations.push(`ⓓ 표에만 남은 함수(없어졌거나 projects를 더 읽지 않음) — ${key}`);
    if (entry.reason.trim() === "") violations.push(`ⓓ 이유 없음 — ${key}`);
  }

  for (const { file, at } of found.memberDeletes) if (!tables.memberDeleteExempt[file]) violations.push(`ⓔ project_members DELETE — ${at}`);
  for (const detail of found.scopeForReexports) violations.push(`ⓕ domain/permissions 안 scopeFor 재수출 — ${detail}`);
  return violations;
}

// ── 실제 소스 ────────────────────────────────────────────────────────────

function realFound(): RowScopeFound {
  const repositories = sourcesUnder("repositories");
  const domain = sourcesUnder("domain");
  const outsidePermissions = domain.filter(({ file }) => !file.startsWith("domain/permissions/"));
  const importScan = [...outsidePermissions, ...sourcesUnder("app", "lib")];
  const primitives = primitiveNames(repositories);
  return {
    scopeForImports: importScan.flatMap(({ file, src }) => scopeForImportsIn(file, src).map((detail) => ({ file, detail }))),
    projectScopeForCalls: importScan.flatMap(({ file, src }) => projectScopeForCallsIn(file, src)),
    primitiveKeys: domain.flatMap(({ file, src }) => primitiveKeysIn(file, src, primitives)),
    projectReads: repositories.flatMap(({ file, src }) => projectReadsIn(file, src)),
    memberDeletes: [...domain, ...repositories, ...sourcesUnder("app", "lib", "scripts")].flatMap(({ file, src }) => memberDeletesIn(file, src).map((at) => ({ file, at }))),
    scopeForReexports: domain
      .filter(({ file }) => file.startsWith("domain/permissions/") && file !== "domain/permissions/scope-for.ts")
      .flatMap(({ file, src }) => scopeForReexportsIn(file, src)),
  };
}

const REAL_TABLES: RowScopeTables = {
  importAllow: SCOPE_FOR_IMPORT_ALLOW,
  domain: ROW_SCOPE_DISPOSITION,
  projectReads: PROJECT_READ_DISPOSITION,
  memberDeleteExempt: MEMBER_DELETE_EXEMPT,
};

const EMPTY_FOUND: RowScopeFound = {
  scopeForImports: [],
  projectScopeForCalls: [],
  primitiveKeys: [],
  projectReads: [],
  memberDeletes: [],
  scopeForReexports: [],
};

const SELF_TABLES: RowScopeTables = {
  importAllow: ["domain/vendors/index.ts"],
  domain: [{ file: "domain/a/index.ts", fn: "loadA", primitive: "findProjectById", kind: "post-gate", reason: "트랜잭션 전 findProjectInScope" }],
  projectReads: [{ file: "repositories/a.ts", fn: "listA", reason: "문서 게이트가 거른다" }],
  memberDeleteExempt: { "scripts/demo-data.ts": "데모 정리" },
};

// 자기 검사의 기준 — 표와 꼭 맞는 발견.
function matchingFound(): RowScopeFound {
  return { ...EMPTY_FOUND, primitiveKeys: ["domain/a/index.ts|loadA|findProjectById"], projectReads: [{ file: "repositories/a.ts", fn: "listA", scoped: false }] };
}

describe("행 범위 처분표 — 소스 = 표 (06.2-04 SC-7)", () => {
  it("실제 소스의 ⓐ~ⓕ 위반이 0이다", () => {
    expect(rowScopeViolations(realFound(), REAL_TABLES)).toEqual([]);
  });

  it("처분표 · 허용 목록이 비어 있지 않고 exempt · post-gate 줄마다 이유가 있다", () => {
    expect(ROW_SCOPE_DISPOSITION.length).toBeGreaterThan(0);
    expect(PROJECT_READ_DISPOSITION.length).toBeGreaterThan(0);
    expect(SCOPE_FOR_IMPORT_ALLOW).toHaveLength(5);
    for (const entry of ROW_SCOPE_DISPOSITION) expect(entry.reason.trim(), dispositionKey(entry)).not.toBe("");
    for (const entry of PROJECT_READ_DISPOSITION) expect(entry.reason.trim(), `${entry.file}|${entry.fn}`).not.toBe("");
    for (const reason of Object.values(MEMBER_DELETE_EXEMPT)) expect(reason.trim()).not.toBe("");
  });

  it("이름 목록의 프리미티브가 모두 repositories에 export로 있다(이름이 바뀌면 스캔이 헛돈다)", () => {
    const names = sourcesUnder("repositories").flatMap(({ src }) => exportedNamesIn(src));
    for (const primitive of NAMED_PRIMITIVES) expect(names, primitive).toContain(primitive);
  });

  it("실제 스캔이 무언가를 찾는다(경로 · 정규식이 깨져 0이 되면 붉다)", () => {
    const found = realFound();
    expect(found.primitiveKeys.length).toBeGreaterThan(0);
    expect(found.projectReads.length).toBeGreaterThan(0);
    expect(found.scopeForImports.map(({ file }) => file)).toEqual(expect.arrayContaining(["domain/vendors/index.ts"]));
  });
});

describe("rowScopeViolations 자기 검사", () => {
  it("표와 꼭 맞으면 위반 0", () => {
    expect(rowScopeViolations(matchingFound(), SELF_TABLES)).toEqual([]);
  });

  it("ⓒ 표에 없는 새 열쇠 하나를 위반으로 낸다", () => {
    const found = matchingFound();
    found.primitiveKeys.push("domain/b/index.ts|loadB|listQuoteLinesByRevision");
    expect(rowScopeViolations(found, SELF_TABLES)).toEqual(["ⓒ 처분표에 없는 새 입구 — domain/b/index.ts|loadB|listQuoteLinesByRevision"]);
  });

  it("ⓒ 표에만 남은 낡은 열쇠 하나를 위반으로 낸다", () => {
    expect(rowScopeViolations({ ...matchingFound(), primitiveKeys: [] }, SELF_TABLES)).toEqual(["ⓒ 표에만 남은 낡은 열쇠 — domain/a/index.ts|loadA|findProjectById"]);
  });

  it("ⓒ 이유 없는 줄을 위반으로 낸다", () => {
    const tables: RowScopeTables = { ...SELF_TABLES, domain: [{ ...SELF_TABLES.domain[0]!, kind: "exempt", reason: " " }] };
    expect(rowScopeViolations(matchingFound(), tables)).toEqual(["ⓒ 이유 없는 exempt — domain/a/index.ts|loadA|findProjectById"]);
  });

  it("ⓒ 별칭 · 이름공간 import로 부른 프리미티브도 열쇠가 된다", () => {
    const src = [
      'import { findProjectById as rawFind } from "@/repositories/projects";',
      'import * as lines from "@/repositories/quote-lines";',
      "export async function loadB() {",
      "  await rawFind(viewer, id);",
      "  await lines.listQuoteLinesByRevision(viewer, revisionId);",
      "}",
    ].join("\n");
    expect(primitiveKeysIn("domain/b/index.ts", src, ["findProjectById", "listQuoteLinesByRevision"]).sort()).toEqual([
      "domain/b/index.ts|loadB|findProjectById",
      "domain/b/index.ts|loadB|listQuoteLinesByRevision",
    ]);
  });

  it("ⓐ 허용 목록 밖 `scopeFor as X` import 하나를 위반으로 낸다", () => {
    const src = 'import { scopeFor as rowScopeOld } from "@/domain/permissions/scope-for";\n';
    const detail = scopeForImportsIn("domain/b/index.ts", src);
    expect(detail).toEqual(["domain/b/index.ts: scopeFor import as rowScopeOld"]);
    const found = { ...matchingFound(), scopeForImports: detail.map((d) => ({ file: "domain/b/index.ts", detail: d })) };
    expect(rowScopeViolations(found, SELF_TABLES)).toEqual(["ⓐ 허용 목록 밖 scopeFor import — domain/b/index.ts: scopeFor import as rowScopeOld"]);
  });

  it("ⓐ 여러 줄 · 이름공간 · 동적 import를 잡고 `import type`과 주석은 통과시킨다", () => {
    expect(scopeForImportsIn("a.ts", 'import {\n  type Scope,\n  scopeFor,\n} from "../permissions/scope-for";')).toEqual(["a.ts: scopeFor import"]);
    expect(scopeForImportsIn("a.ts", 'import * as scope from "@/domain/permissions/scope-for";')).toHaveLength(1);
    expect(scopeForImportsIn("a.ts", 'const m = await import("@/domain/permissions/scope-for");')).toHaveLength(1);
    expect(scopeForImportsIn("a.ts", 'import type { Scope } from "@/domain/permissions/scope-for";')).toEqual([]);
    expect(scopeForImportsIn("a.ts", '// import { scopeFor } from "@/domain/permissions/scope-for";')).toEqual([]);
  });

  it("ⓑ 별칭까지 project · quote_line 키 호출을 잡는다", () => {
    expect(projectScopeForCallsIn("a.ts", 'const s = await defaultScopeFor(viewer, "project", deps);')).toEqual(["a.ts:1"]);
    expect(projectScopeForCallsIn("a.ts", "const s = await scopeFor(viewer, PROJECT_ENTITY);")).toEqual(["a.ts:1"]);
    expect(projectScopeForCallsIn("a.ts", 'const s = await scopeFor(viewer, "vendor");')).toEqual([]);
    expect(projectScopeForCallsIn("a.ts", 'return rowScopeFor(viewer, "project", deps);')).toEqual([]);
  });

  it("ⓓ 표에 없는 리포지토리 projects 읽기 하나를 위반으로 낸다", () => {
    const src = "export async function listB(viewer: Viewer) {\n  return db(viewer).select().from(projects);\n}\n";
    const found = { ...matchingFound(), projectReads: [...matchingFound().projectReads, ...projectReadsIn("repositories/b.ts", src)] };
    expect(rowScopeViolations(found, SELF_TABLES)).toEqual(["ⓓ 범위 없는 projects 읽기 — repositories/b.ts listB"]);
  });

  it("ⓓ 표의 리포지토리 함수가 rowScopeCondition(을 담게 바뀐 것은 위반이 아니다", () => {
    const src = "export async function listA(viewer: Viewer, scope: RowScope) {\n  return db(viewer).select().from(projects).where(rowScopeCondition(viewer, scope, cols));\n}\n";
    const reads = projectReadsIn("repositories/a.ts", src);
    expect(reads).toEqual([{ file: "repositories/a.ts", fn: "listA", scoped: true }]);
    expect(rowScopeViolations({ ...matchingFound(), projectReads: reads }, SELF_TABLES)).toEqual([]);
  });

  it("ⓓ 표의 함수가 사라지면 위반으로 낸다", () => {
    expect(rowScopeViolations({ ...matchingFound(), projectReads: [] }, SELF_TABLES)).toEqual([
      "ⓓ 표에만 남은 함수(없어졌거나 projects를 더 읽지 않음) — repositories/a.ts|listA",
    ]);
  });

  it("ⓔ project_members DELETE는 예외 파일 밖에서만 위반이다", () => {
    const at = memberDeletesIn("repositories/b.ts", "  await tx.delete(projectMembers).where(eq(projectMembers.id, id));");
    expect(at).toEqual(["repositories/b.ts:1"]);
    const found = { ...matchingFound(), memberDeletes: [{ file: "repositories/b.ts", at: at[0]! }, { file: "scripts/demo-data.ts", at: "scripts/demo-data.ts:9" }] };
    expect(rowScopeViolations(found, SELF_TABLES)).toEqual(["ⓔ project_members DELETE — repositories/b.ts:1"]);
  });

  it("ⓕ domain/permissions 안 scopeFor 재수출 한 줄을 위반으로 낸다", () => {
    const detail = scopeForReexportsIn("domain/permissions/index.ts", 'export { scopeFor as rowScopeOld } from "./scope-for";');
    expect(detail).toHaveLength(1);
    expect(scopeForReexportsIn("domain/permissions/index.ts", 'export * from "./scope-for";')).toHaveLength(1);
    expect(scopeForReexportsIn("domain/permissions/index.ts", 'export { can } from "./can";')).toEqual([]);
    expect(rowScopeViolations({ ...matchingFound(), scopeForReexports: detail }, SELF_TABLES)).toEqual([
      'ⓕ domain/permissions 안 scopeFor 재수출 — domain/permissions/index.ts: export { scopeFor as rowScopeOld } from "./scope-for";',
    ]);
  });
});
