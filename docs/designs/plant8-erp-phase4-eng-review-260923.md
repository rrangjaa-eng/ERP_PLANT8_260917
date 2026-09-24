# Phase 4 엔지니어링 리뷰 (plan-eng-review) — 2026-09-23

대상: `.planning/phases/04-project-quote-ledger/`의 미실행 플랜 29개(04-06~04-31, 04-40~04-42) @ `ebcc051`
분석: 묶음 A(상태·정산·견적 편집 핵심) · B(차수·승인·매출·리저브·계약 삭제) · C(목록·페이지·그리드 키보드·문서·코드표). Opus 분석 에이전트 3개를 병렬로 돌렸고, 모든 지적에 근거 파일:줄을 인용했다. 원문은 부록 A·B·C.
외부 의견: Codex(외부 모델, 완료). 원문은 부록 D.
보고서 위치 메모: gstack 기본 위치(`~/.gstack/projects/…`)는 클라우드 컨테이너가 재시작되면 사라진다. 그래서 CEO 리뷰와 같은 `docs/designs/`에 둔다.

## 요약

- 범위: CEO 리뷰의 HOLD SCOPE를 유지한다. 플랜 구조(34개·25 웨이브)도 유지하고, 멈춤 규칙만 완화한다.
- 지적 개수: 묶음 A 27(P1 4) · B 21(P1 0, 치명 공백 3) · C 20(P1 3) · Codex 7(P1 4).
- 사용자 결정: 12건(D1~D12). D8은 사용자 지적으로 뒤집었다.
- 나머지 지적은 사실 정정이나 플랜 수정이다. 결정 없이 해당 플랜에 반영한다. 반영은 계획 에이전트 2개가 병렬로 한다.

## Decision ledger

### R0: 플랜 구조(복잡도 게이트)
Finding: 29개 플랜의 수정 파일이 8개를 넘어 게이트가 발동했다. CEO 리뷰는 HOLD SCOPE로 승인됐다.
Plan baseline: 34개 플랜·25 웨이브
Question D1: 현재 구조 유지 / 더 작게 합치기
State: approved
Actual answer: 현재 구조 유지 (D1)
Accepted scope: 34개 플랜·25 웨이브를 그대로 둔다. 기능과 계약은 바꾸지 않는다.
History: Codex #4(과분할) 지적으로 D11에서 다시 확인했다. 구조는 유지하고 멈춤 규칙만 완화하기로 했다.

### R1: 팀장·본부 책임자·대표의 기본 정보 노출
Finding: [P1] conf 9, 묶음 A. `domain/seed/index.ts:165-178`은 시스템관리자와 기본 역할에만 노출 행을 넣는다. `visible.ts:21-22`는 행이 없으면 숨긴다. 그래서 팀장 권한 판정(`teamAtDate`→`project()`)이 항상 거짓이 되고 상세 화면은 비어 보인다. 테스트는 노출을 손으로 켜 두어서(`revenue-section.spec.ts:18`) 이 문제가 드러나지 않았다.
Question D2: 세 역할의 기본 노출값
State: approved
Actual answer: PM 기본값 + 대표는 매출도 (D2)
Accepted scope:
- 04-20: 권한 판정은 소속 리포지토리로 읽는다. 노출 설정과 분리한다.
- 시드는 없을 때만 넣는다. 팀장·본부 책임자는 PM `staffDefault`와 같고, 대표는 여기에 `revenue.*`를 더한다.
- 04-21·04-22 E2E는 시드 밖에서 권한을 켜지 않는다.

### R2: 기반 수정 3가지
Finding: [P2] 묶음 A·B·C 공통.
- ① 연결 풀 5개에 타임아웃이 없다. 잠금 트랜잭션 안에서 전역 db를 호출하면 동시 저장 때 멈춘다.
- ② `project()`가 필드×행마다 노출 여부를 조회한다(N+1). 목록 50행은 약 850회, 견적 300줄은 약 5,400회다.
- ③ 배포 때마다 시드가 관리자가 바꾼 노출값을 덮어쓴다.
Question D3: Phase 4에 넣는가
State: approved
Actual answer: 셋 다 Phase 4에 넣기 (D3)
Accepted scope:
- 04-20: `SET LOCAL lock_timeout='5s'`와 풀 `connectionTimeoutMillis`를 넣고, "잠금 안에서는 전역 db 호출 금지" 규칙을 둔다. 풀 2개로 동시 저장 3건 테스트를 추가한다.
- `project()`는 정보 항목별로 한 번만 조회한다. all-of 정보 항목을 지원한다.
- 시드는 없을 때만 넣고, A-05와 같은 방식의 테스트를 붙인다.

### R3: 빈 차수 고객 승인
Finding: [P2] conf 7, B. 줄이 0개인 1차를 승인하면 금액 줄 추가와 새 차수 생성이 모두 막힌다.
State: approved
Actual answer: 승인을 막는다 (D4)
Accepted scope: `quote.approval-toggle`에서 줄이 0개면 `승인할 견적 줄이 없음 · 첫 줄 만들기`로 거절한다. 테스트를 붙인다.

### R4: 엑셀 붙여넣기 계산 열
Finding: [P1] conf 7, C. 04-19는 계산 열에 떨어진 값을 조용히 버린다. 6열 엑셀을 붙이면 실행가가 견적가 자리에 떨어져 사라진다.
State: approved
Actual answer: 앱 복사일 때만 무시 (D5)
Accepted scope:
- 클립보드에 `application/x-plant8-quote-lines+json`이 있을 때만 무시한다.
- 그 밖에는 04-04의 오류 칸을 유지한다.
- 04-19와 04-31(a)에 6열 엑셀 사례를 추가한다.

### R5: 기간과 견적 줄을 함께 저장할 때의 판정 순서
Finding: [P2] conf 7, A. 04-22는 순서를 정하지 않았다.
State: approved
Actual answer: 저장 후 상태로 판정 (D6)
Accepted scope: 기간 쓰기 → 다시 판정 → 새로 읽은 행으로 줄과 매출을 판정한다. 통합 테스트 한 줄을 붙인다.

### R6: 승인 차수의 소분류 잠금
Finding: [P3] conf 8, B. CEO B-07(A) 목록에는 소분류가 있는데 04-40에는 빠졌다.
State: approved
Actual answer: 소분류도 잠근다 (D7)
Accepted scope: 04-40 잠금 목록에 소분류를 추가한다.

### R7: 리저브 금액이 활동 기록 상세에 남는 문제
Finding: [P2] conf 6, B. `action_log.detail`에 금액 전후값이 남는다.
State: approved
Actual answer: 처음에는 "리저브 금액 노출로 가린다"(D8)를 골랐다. 사용자가 "활동 기록을 보는 건 관리자밖에 없잖아?"라고 지적해 뒤집었다.
Accepted scope: 가리지 않는다. 기본값에서 활동 기록 메뉴(`admin.action-log`)와 상세(`action_log.detail`, `staffDefault:false`)는 시스템관리자만 본다. 리저브 기록은 지금 방식인 `document_update`(관리자가 끌 수 있음)를 유지한다. 이는 B-16 결정과 같다.
History: D8의 A(가리기)는 폐기했다.

### R8: 승인이 PM이 본 내용을 가리키지 않는 문제 (Codex #2)
Finding: [P1] Codex. 승인 요청에 본 내용의 식별값이 없다. 다른 사람이 저장한 금액이 그대로 승인될 수 있다.
State: approved
Actual answer: 본 합계와 다르면 거절 (D9)
Accepted scope:
- 04-14: 승인 요청이 PM이 본 합계와 내용 버전을 싣고, 서버 값과 다르면 `견적이 바뀌었습니다 · 새로 고쳐 주세요`로 거절한다.
- 04-24: 저장하지 않은 수정이 있으면 승인 버튼을 막는다.
- 경합 테스트를 붙인다.

### R9: 재시도로 생기는 중복 (Codex #3)
Finding: [P1] Codex. 커밋은 성공했는데 응답을 잃으면, 다시 저장할 때 새 줄이 한 번 더 들어간다.
State: approved
Actual answer: 새 줄에 화면이 만든 ID 사용 (D10)
Accepted scope:
- 견적 줄·발행·입금·리저브의 새 행에 클라이언트가 만든 UUID를 쓴다.
- 서버는 같은 id가 있으면 넣지 않는다(ON CONFLICT DO NOTHING).
- 응답이 끊긴 뒤 재전송해도 1행만 남는지 테스트한다.

### R10: 플랜 구조 재확인 (Codex #4)
State: approved
Actual answer: 구조 유지 + 멈춤 규칙만 완화 (D11)
Accepted scope:
- Phase 4 안에서는 뒤 플랜이 앞 플랜 파일의 결함을 고칠 수 있다.
- 고칠 때는 회귀 테스트를 붙이고 SUMMARY에 편차로 기록한다.
- 범위를 늘리지 않는다는 규칙은 유지한다.

### R11: 한 PR 배포 규칙 강제 (Codex #6)
State: approved
Actual answer: 배포를 main 기준으로만 허용 (D12)
Accepted scope: `.github/workflows/deploy.yml`은 main이 아닌 ref의 배포를 거부한다(workflow_dispatch 포함). 이를 확인하는 검사를 04-31 또는 파일 한도 안의 다른 플랜에 넣는다.

Approval readiness: PASS. 확인한 항목과 근거는 R0(D1·D11), R1(D2), R2(D3), R3(D4), R4(D5), R5(D6), R6(D7), R7(D8을 사용자 지적으로 수정), R8(D9), R9(D10), R10(D11), R11(D12)이다. 결정 없이 반영하는 수정은 모두 사실 정정이거나, 이미 승인된 계약을 증명하는 작업이다.

## 결정 없이 반영하는 플랜 수정 (근거는 부록)

**묶음 A**
- **P1 기간 저장의 낙관적 검사:** `projects.version` 대신 화면이 읽은 {시작일, 종료일}을 기준값으로 쓴다. 저장 결과에 {상태, 기간}을 돌려준다. 새로 고치지 않고 두 번 저장하는 테스트를 붙인다.
- **P1 정산 새 줄의 "견적 칸 0" 정의:** 기존 수량>0 검증과 모순되므로, 정의를 "단가 0원, 수량은 기본 1로 잠금"으로 바꾼다.
- **P2 유령 로그 방지:** 트랜잭션이 있으면 `recordAction`에 tx를 넘긴다.
- **P2 줄 순서 정리:**
  - 맨 끝에 추가하는 새 줄은 sortOrder를 보내지 않는다(서버가 max+1).
  - 줄을 옮기거나 중간에 넣으면 전체 순서 `order[]`를 보낸다.
  - 정렬에 id를 보조 키로 추가한다.
  - 저장 결과는 차수의 활성 줄 전체를 돌려준다.
- **P2 담당자 조회:** `teamLeadCandidatesAtDate` 리포지토리 쿼리를 추가한다.
- **P3:**
  - 기간 수정 권한에 쓰기 권한 확인을 추가한다.
  - `QUOTE_LINE_STATUSES` 상수를 만든다.
  - 자동 정산은 요청당 한 번, scopeFor 이후에 부른다.
  - 붙여넣기 파서가 `stripNumberInput`을 가져다 쓴다.
  - 낡은 주석을 고친다.
  - ARCHITECTURE에 잠금 규약 문단을 추가한다.
  - `denyWrite` 헬퍼 하나로 거부 로그를 모은다.

**묶음 B**
- **P2 부가세 기준일:** KST 경계에서 하루 틀리지 않도록 `kstDateOf`를 쓴다.
- **P2 리저브 쓰기 권한:** `pnl` 쓰기와 리저브 금액 노출 둘 다 있어야 한다.
- **P2 승인 차수 경합 테스트:** 23505 테스트는 주입한 오류로 만든다. 잠금 때문에 교착이 생기기 때문이다.
- **P2 금액 입력 정규화:** `normalizeMoneyInput`을 금액 모듈 한 곳에 둔다. 원화 환율은 1로 고정하고 범위를 검사한다.
- **P3:**
  - 04-42의 외화 선례 참조와 04-15의 줄 범위를 정정한다.
  - 리저브 `sort_key`를 삭제한다.
  - 04-13 zod에서 소분류는 견적 줄일 때만 필수로 한다.
  - 거래처 잠금을 `FOR NO KEY UPDATE`로 바꾼다.
  - 낡은 주석을 고친다.
  - 테스트 공백 1~6을 채운다.

**묶음 C**
- **P1 목록 투영:** `loadProjectList`의 행도 `project()` 투영을 거친다. 키 집합 테스트를 새 경로로 옮긴다.
- **P1 Ctrl+S 이중 저장 방지:** 실행 중 가드를 두고, repeat·IME 조합 입력은 무시한다. 공용 `lib/shortcut.ts`를 쓴다.
- **P2:**
  - 그리드 포커스를 행 id로 저장한다.
  - 쪽 번호를 렌더할 때마다 범위 안으로 맞춘다.
  - 등록 폼에 `submittedRef` 래치를 둔다.
  - 기간 필터는 두 칸을 묶어 포커스가 그룹을 벗어날 때 제출한다.
  - 창 밖 연도를 옵션에 포함한다.
  - `lib/paging.ts`를 공용으로 쓴다.
  - 현재 차수만 합산한다.
- **P3:**
  - 폰 페이지 줄은 6쪽 이상이면 간격 창을 쓴다.
  - 04-03 재개 메모를 남긴다(상태 매핑, 줄 종류, 300줄 초과 보고).
  - 의존성 검사는 package.json 원문이 아니라 의존성 객체와 lockfile로 비교한다.

**Codex**
- **#1 [P1] 매출 행 수정 조건:** `id+version+project_id+kind`로 제한한다. 코드에서 확인했다(`repositories/revenue-entries.ts:91`은 id와 version만 본다).
- **#5 [P1] 04-31 최종 확인:** 모든 필수 검사가 통과해야 한다. "후속 작업" 예외를 없앤다.
- **#7 [P2] 리저브 저장 오류:** 다른 쪽에 있는 행의 잔액 오류를 일괄 오류로 보여 주고, 그 쪽으로 이동할 수 있게 한다.

## 이미 있는 것 (재사용)
- **그대로 재사용:** `gate()`, `registerGateRule`, `withTransaction`, `DbOrTx`, `findMembershipAtDate`, `projectFilterConditions`, `lineSumsSubquery`, `currentRevisionsSubquery`, `project()`와 `registerDto`와 누출 검사, `moneyToColumns`, `computeVat`, `isUniqueViolation`, `ARCHIVABLE_TABLES`, `SaveRejectedError`, `CellFormatError`, `recentFxRate`, `toTsv`, `normalizeNumericPaste`, `ListEmpty`.
- **같은 기능을 여러 번 만들던 것을 하나로 합침:** 금액 입력 검증, 거부 로그, 쪽 번호 맞춤, Ctrl 단축키 판정, 숫자 정규화, 자동 정산 호출.

## 범위 밖 (NOT in scope)
- `DOMAIN_RESTORERS`를 등록 방식으로 바꾸는 일: 세 번째 엔터티가 생길 때 한다.
- `listReserves` 윈도 함수: 2만 행을 넘으면 한다.
- `listRevenue` 설정 메모이즈: 지금 규모에서는 괜찮다.
- 상태 변경 로그 부분 인덱스: 5만 행을 넘으면 만든다.
- 기간 겹침 인덱스: 5만 행을 넘으면 만든다.
- `q` 검색의 ILIKE 와일드카드 이스케이프: 원래 있던 문제이고 위험이 낮다.
- 목록 링크를 `next/link`로 바꾸는 일.
- 자동 정산 실패 로그 알림: Phase 7 운영에서 한다.

## 실패 모드 (치명 공백: 테스트·처리·알림이 모두 없음)
- 목록 투영 누락으로 PM에게 매출값이 새는 문제: 04-17에서 수정.
- 그리드 이중 저장: 04-28에서 수정.
- 엑셀 계산 열 유실: D5로 수정.
- 원장이 롤백될 때 남는 유령 로그: 04-12에서 수정.
- sortOrder 충돌: 04-12·04-30에서 수정.
- 승인 차수에서 USD 환율만 바꾸는 편집: "재계산 ≠ 저장값이면 거절" 불변식으로 수정.
- `pnl` 쓰기만 있는 역할에게 잔액이 새는 문제: 04-07에서 수정.
- 승인일 부가세가 하루 틀리는 문제: 04-16에서 수정.
- 재시도 중복: D10으로 수정.

모두 플랜 반영 대상이다. 반영 뒤 남는 치명 공백은 0건이다.

## 테스트 계획 (QA용)
- **/projects:**
  - 기본값이 올해인지, 기간 필터 두 칸이 동작하는지, 50건 페이지와 상단 합계가 맞는지 본다.
  - 매출 노출이 없는 PM에게 응답 payload에도 매출값이 없어야 한다.
- **/projects/[id] 견적 표:**
  - 30줄 페이지, 300줄 상한을 확인한다.
  - Ctrl+S를 두 번 눌러도 한 번만 저장돼야 한다.
  - 엑셀 6열을 붙이면 오류 칸이 보여야 한다.
  - Alt+↓로 페이지 경계를 넘으면 포커스가 행을 따라가야 한다.
  - 정산 단계에서 단가 0 새 줄을 추가할 수 있어야 한다.
  - 승인 차수는 잠겨야 한다(소분류 포함).
  - 빈 차수는 승인이 거절돼야 한다.
  - 다른 사람이 저장한 뒤 승인하면 거절돼야 한다.
- **상태 전환:**
  - 시드만 있는 DB에서 팀장이 같은 팀 프로젝트의 상태를 바꿀 수 있어야 한다.
  - 기간과 단가를 함께 저장하면 저장 후 상태로 판정돼야 한다.
- **/pnl 리저브:** 쪽을 넘어간 잔액 오류를 안내해야 하고, 재전송해도 1행만 생겨야 한다.
- **배포:** main이 아닌 ref로 배포하면 거부돼야 한다.

## 병렬화
웨이브 계획대로 진행한다(04-10 ∥ 04-28 ∥ 04-29, 04-06 ∥ 04-25, 04-09 ∥ 04-27, 04-17 ∥ 04-19, 04-07 ∥ 04-31). `quote-table.tsx`를 고치는 플랜은 순차로 둔다.

## 완료 요약
- Step 0 범위: 그대로 수용
- Architecture: 24건(A 8 · B 8 · C 8)
- Code Quality: 22건(A 7 · B 8 · C 7)
- Tests: 도표 작성, 공백 23건(A 7 · B 6 · C 10)
- Performance: 15건(A 5 · B 5 · C 5)
- NOT in scope: 작성
- 이미 있는 것: 작성
- TODOS.md: 범위 밖 항목은 플랜의 deferred에 기록. TODOS.md 제안은 0건
- 실패 모드: 치명 공백 9건 표시, 모두 플랜 반영 대상
- 미결정: 0
- Outside voice: codex, completed (7건)
- 병렬화: 웨이브 기준
- Lake Score: 8/8(적용 범위 선택 8건 모두 완전한 쪽을 골랐다)

## 부록
부록 A·B·C는 분석 에이전트 원문, 부록 D는 Codex 원문이다(아래에 이어 붙임).


## 부록 A — 묶음 A 분석 원문
### Eng Review: Group A (state, settlement and quote-edit core)

Plans: 04-06, 04-09, 04-11, 04-12, 04-20, 04-21, 04-22, 04-25, 04-26, 04-27, 04-30 @ ebcc051
Code baseline: working tree @ ebcc051. Read: 04-01/02/05 SUMMARY; domain/quotes/lines.ts, repositories/{quote-lines,projects,action-log,permissions,archive,team-memberships}.ts, domain/{projects/index,projects/ledger,archive/index,action-log/record,org/index,seed/index,permissions/{project,visible,scope-for,roles}}.ts, db/client.ts, lib/{log,db-transaction,env}.ts, app/(app)/projects/{actions.ts,[id]/page.tsx,[id]/quote-table.tsx}, playwright/vitest configs.
Excluded from re-raising: every CEO decision and finding (D1–D21, OV-1..7, A-01..A-45, B-*, C-*). The findings below are either new, or places where the approved remedy **as planned** conflicts with existing code.

Counts: Architecture 8 · Code quality 7 · Tests 7 gaps (+ diagram) · Performance 5 · Failure-mode rows 12 · TODO candidates 6
Severity: P1 = 4 · P2 = 12 · P3 = 9

---

### 1. Architecture

**[P1] (confidence 9/10) 04-20 T1③ `actorCoversProjectTeam` / 04-20 T1① seed / 04-21 / 04-22: team-lead, division-head and CEO roles have no visibility rows, so authorization and the whole team-lead UI break on a seed-only DB**
Evidence:
- `domain/seed/index.ts:165-178`: visibility is seeded **only** for `SYSADMIN_ROLE_ID` and `DEFAULT_ROLE_ID` (`upsertVisibility(... roleId: SYSADMIN_ROLE_ID ...)`, `roleId: DEFAULT_ROLE_ID`).
- `domain/permissions/visible.ts:21-22`: `// 행이 없으면 false — 새 기능 정보는 기본 숨김이다.` / `return row?.visible === true;`
- `domain/org/index.ts:68`: `{ key: "id", from: "id", infoItem: "team.value" }`. `teamAtDate` projects through `project(viewer, team, TEAM_DTO_SPEC)` (`org/index.ts:203`).
- `domain/permissions/project.ts`: `if (!ok) continue;` means a hidden field is dropped.
- Tests hide the gap: `test/e2e/revenue-section.spec.ts:18`: `await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "project.value", visible: true });`

Consequences:
- (a) The plan implements `actorCoversProjectTeam` as `teamAtDate(viewer, viewer.id, todayKst)` with viewer = team lead. The returned DTO has no `id`, so the check is always false. A same-team team lead is refused every transition (`다른 팀 프로젝트의 상태는 바꿀 수 없습니다`), gets no 「상태 바꾸기」 and gets `periodEditRights` = none.
- (b) Even when that is fixed, `findProject` (`project.value`) and `listQuoteLines` (`quote.amount`) return `{}` for team-lead and CEO viewers. The detail page they are now meant to use renders empty.
- (c) The design couples an **authorization** fact to the actor's **information-exposure** setting. An admin who hides 「팀 정보」 from team leads silently removes their transition rights.

Remedy:
- (1) Plan fix: `actorCoversProjectTeam` reads membership through `repositories/team-memberships.findMembershipAtDate` (or `teamAtDate(SYSTEM_VIEWER, …)`). Authorization facts never pass through `project()`.
- (2) 04-20 seed adds insert-if-absent visibility rows for `role-team-lead`, `role-division-head` and `role-ceo`.
- (3) E2E for 04-21 and 04-22 must **not** grant visibility by hand, so the seed is what the test proves.
- Needs a **user decision**: which info items the three roles see by default (e.g. `staffDefault` like PM, or also `revenue.*` for CEO).

**[P1] (confidence 8/10) 04-22 T1③(e) and integration (j)/(g): the period optimistic lock on `projects.version` fights auto-settle and status changes, including inside its own transaction**
Evidence:
- 04-22 plan: `updateProjectPeriodIfVersion(viewer, id, { startDate, endDate, version }, tx)(버전이 다르면 0행 → 다른 사람이 먼저 기간을 바꿨습니다 …)`.
- 04-11 plan: `settleOverdueProjects … SET status = $to, version = version + 1`. 04-20: `updateProjectStatusIfCurrent … SET status, version + 1`. 04-22 step (a) runs `loadProjectForGate` **before** step (e) in the same tx.

Contradiction:
- In (j), order 1, A's auto-settle commits (v+1). B (team lead) then locks and resolves the revert. `updateProjectPeriodIfVersion(version = v)` returns 0 rows, so B gets a conflict error. The plan asserts 「최종 상태 진행 … 사람 되돌리기 1줄」.
- In (j), order 2, B's own `loadProjectForGate` settles (v+1), then B's period update uses v. Same failure.
- Real-life version: a user opens the page, a colleague changes status or midnight passes, then the period save reports 「다른 사람이 먼저 **기간을** 바꿨습니다」, which is false.
- Also `SaveProjectLedgerResult` returns only `{quoteLines, revenue}` (`domain/projects/ledger.ts:17-20`). After a first successful period save the client keeps the stale version, so a second period save without reload always conflicts.

Remedy (plan fix, no policy): compare the client-observed `{startDate, endDate}` against the locked row (field-level optimistic check, like the D-65 baseline for lines) instead of `projects.version`. Return `{status, startDate, endDate}` in `SaveProjectLedgerResult`, or `router.refresh()` after a period/status save. Tests: (j) both orders as written; new (m): save the period twice without reload.

**[P2] (confidence 8/10) 04-12 T2③ / 04-22 T1③: action-log rows written on the pool inside the ledger tx become phantom logs when a later step rolls back**
Evidence:
- `domain/quotes/lines.ts:541-547`: `await recordAction(viewer, { actionType: "document_update", entity: QUOTE_LINE_ENTITY, … detail: { lineIds … } });` with no tx, called after `runSave(tx)`.
- `domain/revenue/index.ts:337-343`: `if (tx) { … await runSave(tx); await recordAction(viewer, { actionType: "document_update", …` with no tx.
- `domain/projects/ledger.ts:28-31`: lines are saved first, then revenue, in one tx.
- 04-12 adds archived line ids to that same detail. Group B adds revenue/reserve rejections after lines in the same tx.

Result: a rejected batch leaves a `document_update` row claiming lines were saved and archived. This violates 04-04's 「성공 한 줄 · 거부 0줄」 and makes the archive audit trail false. CEO A-01 fixed this only for status changes.

Remedy (plan fix): once 04-20 adds `tx` to `recordAction`, pass `tx` in `saveQuoteLines` and `saveRevenue` whenever a tx is given. Add this to 04-12 files/actions. Test (04-12, `quote-lines.test.ts`): ledger batch with valid lines plus a revenue row that fails its gate → 0 `document_update` rows for that revision and lines unchanged.

**[P2] (confidence 6/10) All locking plans (04-11/12/20/22/26): `FOR UPDATE` plus pool calls inside the transaction, with pool max 5 and no timeouts, allows an app-level deadlock**
Evidence:
- `lib/env.ts:54`: `DB_POOL_MAX: numberWithDefault(5)`. `db/client.ts:32-35`: `new Pool({ connectionString, max })`, with no `connectionTimeoutMillis`, `lock_timeout` or `statement_timeout`.
- Inside the ledger tx, `saveQuoteLines` still calls pool functions: `can()` (`lines.ts:362`), `repoFindQuoteRevisionById` (366), `quoteLineCustomFieldsSchema` (377), `rememberFxRate` (485), and `recordAction`'s `getSettingValue` (`record.ts:104-108`).
- The plans add more pool calls inside locked sections: `teamAtDate`, `can()` ×2 and `projectResponsibles` in 04-20/04-22.

Failure: five concurrent ledger saves each hold one tx connection and each need a second pool connection. pg-pool waits forever, so all five hang until the Cloud Run request timeout. PG cannot detect this. Same-project waiters make it worse because each holds a connection while blocked on `FOR UPDATE`.

Remedy (plan fix, 04-20 as first locker): `withTransaction` runs `SET LOCAL lock_timeout = '5s'` (needs `execute` on the tx, since `DbOrTx` only picks insert/update/select, `db/client.ts:48`). Pool gets `connectionTimeoutMillis`. Reads inside locked sections take `tx`. Test: integration with `DB_POOL_MAX=2`, three concurrent ledger saves all resolve (success or UserFacing timeout) within 10s.

**[P2] (confidence 7/10) 04-22 T1③(e)/(f) and 04-12: a mixed batch (period + lines) is judged against an unspecified state**
Evidence:
- 04-22: 「견적 줄·매출 저장이 이 잠근 행을 쓰도록 `saveQuoteLines`·`saveRevenue` 호출은 그대로 같은 `tx`를 받는다」. That is the pre-period `lockedRow`.
- 04-12 makes `saveQuoteLines` call `loadProjectForGate` again, which re-reads the **post-period** row.
- 04-22 (f) settles in the same tx after the period write.
- The order of the period write relative to `saveQuoteLines` is not stated. So a lead who extends 정산 and edits a unit price in one save is either allowed (judged as 진행) or rejected (judged as 정산), depending on code order.
Remedy: state the order explicitly (recommended: period write → (f) re-judge → lines/revenue judged on the fresh `loadProjectForGate` row) and add an integration row for it. **User decision (small)**: should the batch be judged on the state it produces (recommended) or on the state before the save?

**[P2] (confidence 7/10) 04-11 T3② `projectResponsibles`: no repository query exists for it, and the naive version is an N+1 on every detail render**
Evidence: `repositories/team-memberships.ts` exports only `findMembershipAtDate(viewer, userId, date)` (line 11), `listMemberships(userId)`, insert and delete. Nothing lists the members of a team at a date. 04-11 `files_modified` does not include `repositories/team-memberships.ts`, `repositories/users.ts` or `repositories/permissions.ts`. A straightforward implementation loops users × `findMembershipAtDate` × role work scope × `findPermission`, and runs on every detail page (04-22 error copy, 04-30 EMPTY).
Remedy (plan fix): one repository query, `teamLeadCandidatesAtDate(teamId, date)`: `DISTINCT ON (user_id) … ORDER BY effective_from DESC` joined to `users` (exclude archived/retired), `roles.work_scope='team'`, and `permission_matrix` (`projects.status`, write, allowed). Add the file to 04-11. Compute only when `isEndDatePassed` is true or the table is empty. Test: `project-auto-settlement` or `responsibles` integration with an archived former lead, expecting a null or other name.

**[P2] (confidence 7/10) 04-20 T1①: the seed's visibility loop re-upserts every deploy, which is the same bug class as the approved A-05, left open**
Evidence: `domain/seed/index.ts:172-177`: `await upsertVisibility(viewer, { roleId: DEFAULT_ROLE_ID, infoItem: item.key, visible: item.staffDefault, … })`. `repositories/permissions.ts:92-95` uses `.onConflictDoUpdate({ … set: { visible: input.visible …`, and `deploy.sh` runs the seed on every deploy. An admin who hides e.g. `quote.amount` from PMs gets it re-exposed on the next deploy. That is an info-exposure regression, and the A-05 principle 「관리자가 끈 값을 다음 배포의 시드가 되살리지 않는다」 is already approved.
Remedy: `insertVisibilityIfAbsent` for non-sysadmin roles in the same 04-20 task, plus a test mirroring A-05. It is outside Phase 4's stated scope, so the alternative is to log it as a TODO; **ask the user which** (scope call, not policy).

**[P3] (confidence 6/10) 04-22 T1① `periodEditRights`: PM rights ignore `projects` write**
Evidence: the plan signature is `periodEditRights({ status, isAssignedPm, canChangeStatus, actorCoversTeam })`. An assigned PM whose `projects` write was revoked still gets `pm` rights and can move dates. `saveQuoteLines` gates on `can(viewer, "projects", "write")` (`lines.ts:362`).
Remedy: add `canWrite` to the input, so `pm` requires `isAssignedPm && canWrite`. Add a unit row.

---

### 2. Code quality

**[P1] (confidence 9/10) 04-12 T2② `quoteCellsZero`, 04-30 `<probe_fallback>` 「수량 0 · 단가 원화 0 기본값」: this contradicts existing quantity validation, so the D10/D12 settling insert can never pass**
Evidence:
- `domain/quotes/lines.ts:395-403`: `if (input.quantity !== undefined && input.quantity <= 0) { formatErrors.push({ … reason: "숫자가 아닙니다 · 0보다 큰 수를 적어 주세요" })`.
- `lines.ts:480`: `const quantityValue = input.quantity && input.quantity > 0 ? input.quantity : 1;`
- `quote-table.tsx:101`: new drafts use `quantity: 1`. `quote_lines.quantity` defaults to `"1.00"`.
- The plan: 「서버는 새 줄의 수량 = 0 **그리고** 단가 = 0(원화)일 때만 받는다」.

Result: sending qty 0 gives a format error. Omitting qty stores 1, so the gate sees qty ≠ 0 and rejects. Integration (g) goes red, and the easy "fix" (relaxing `quantity <= 0` globally) would regress 진행 validation.
Remedy (plan fix): define the settling 「견적 칸 0」 as **unit price 0 (so quote amount 0)**. Quantity stays at the default 1 and locked. `quoteCellsZero = unitPrice.amount === 0 && currency KRW`. The 04-30 new-line default becomes `quantity 1 · 단가 0`. Confirm with the user only if showing 「수량 1」 on a cost-only line is a problem (optional).

**[P2] (confidence 8/10) 04-30 T2③ and 04-12 T1③(d): sending "full-list position only for new and moved lines" collides with the stored `sortOrder` of unmoved lines, and `ORDER BY` has no tiebreak**
Evidence:
- `repositories/quote-lines.ts:17`: `.orderBy(quoteLines.sortOrder)` with no tiebreak.
- `quote-table.tsx:430`: `duplicateLine` inserts mid-list, `[...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)]`.
- 04-12 archiving creates gaps.
- 04-12: 「새 줄의 `sortOrder`는 입력값, 없으면 차수 끝 다음 번호」.

Cases: A0 B1 C2; duplicating A sends A′=1, which ties with B (B is not re-sent), so the order flips between loads. Archiving B (A0 C2) and then adding a line sends position 2, which ties with C. With gaps (A0 C5), a new line at position 2 lands **between** rows after reload. Demo data also already has duplicated `sortOrder` values from the `?? index` bug (`lines.ts:489`).
Remedy (plan fix):
- New lines appended at the end omit `sortOrder`; the server assigns `max+1` in batch order.
- Any move or mid-list insert sends one explicit `order: string[]` (full active id list). The server rewrites `sort_order = index` for all active lines. In 정산, it accepts only if `order` equals the current order plus appended new ids.
- Add `, quoteLines.id` as a tiebreak.
- Tests: 04-12 integration (duplicate mid-list → reload order stable); 04-30 E2E (archive middle line, add line → it stays last after reload).

**[P2] (confidence 8/10, pre-existing, 04-04 area; verify against 04-04 final) after a save the client replaces all lines with only the saved subset**
Evidence: `quote-table.tsx:364`: `if (data?.quoteLines?.lines) setLines(data.quoteLines.lines.map(fromDto));`. `lines.ts:549` returns only `savedRows`. Editing 1 of 3 lines therefore shows one row until reload.
It interacts with 04-30: archive ids, `canSave`, dirty counts and hint rows are computed from `lines` state. 04-30 E2E (f) and 04-12 tests use reload or DB reads, which masks it.
Remedy: `saveQuoteLines` returns the full active line list of the revision (read in the same tx after writes), or the client merges by id. Test: `quote-edit-scope.spec` (or 04-04 spec): edit line 2 of 3, save, assert 3 rows **without** reload.

**[P3] (confidence 8/10) 04-12 T2④: 「줄 상태 목록은 도메인 상수에서 가져온다(새 목록을 만들지 않는다)」, but no domain constant exists**
Evidence: the only list is `app/(app)/projects/[id]/quote-table.tsx:52-54`, `LINE_STATUS_LABELS = { not_started: "미착수", cancelled: "취소", … }`. `domain/` has only the literal default `"not_started"` (`lines.ts:504`).
Remedy: create `QUOTE_LINE_STATUSES` in `domain/quotes/edit-scope.ts` (or `lines.ts`). The action `z.enum`, `computeQuoteLineAmounts` and the app label map import it. Add a short plan text fix.

**[P3] (confidence 7/10) 04-11 T2② vs 04-17: `applyAutoSettlement` runs three times per list request, and parallel calls defeat A-07 until 04-17 lands**
Evidence: 04-11 puts the call inside both `listProjects` and `aggregateProjects`. `app/(app)/projects/page.tsx:86-87` runs them in `Promise.all`. With `SKIP LOCKED`, the second call skips rows the first is still updating, so the aggregate reads the pre-commit status. 04-17 then adds a third call up front (`loadProjectList`).
Remedy (DRY): 04-11 adds a single entry call. Either change `page.tsx` to `await applyAutoSettlement({})` before the `Promise.all` now, or have 04-17 remove the inner calls. Keep `findProject`'s per-id call.

**[P3] (confidence 6/10) 04-09 T3①: two number-normalisation implementations are pinned together by a test instead of shared**
Evidence: the plan says 「`use-clipboard-paste.ts`의 숫자 정규화가 `stripNumberInput`과 같은 결과를 내는지 단위 테스트 한 줄로 고정 … `use-clipboard-paste.ts`는 고치지 않는다」.
Remedy: `use-clipboard-paste.ts` imports `stripNumberInput`, keeping one implementation. Coordinate with 04-19 (group C), which edits the parser.

**[P3] (confidence 7/10) Stale comments in touched files**
- `repositories/projects.ts:24-26`: `// 상태(미착수/취소)와 무관하게 전 줄을 더한다`. This becomes false once 04-12 excludes archived lines and gives cancelled lines a quote amount of 0.
- `domain/rules/register.ts:3-4`: `// 이 플랜이 등록하는 게이트 규칙은 하나뿐이다(project.completed-lock)`. It must be rewritten in 04-06.
- `domain/quotes/lines.ts:348-353` describes the old step order (gate → recompute → UPSERT), which 04-12 changes.
- `docs/ARCHITECTURE.md` has no contract for the new cross-plan lock protocol (`loadProjectForGate` first in every project write tx, `afterLock` test seam, `write.denied`). Add a §4-x paragraph in 04-12 or 04-20; that is a doc, not a diagram.

---

### 3. Tests

### Coverage diagram (planned tests only)

```
PATH / FLOW                                              UNIT  INTEG  E2E   RATING
04-06 migration remap + guard (fresh + upgrade DB)        ·     ★★★    ·     ★★★
04-06 project.line-edit completed lock / lost open        ★★    ★★★    [→E2E 04-21 d]  ★★★
04-20 4 transitions × 6 actors × start-date gate          ★★★   ★★★    ★★    ★★★
04-20 same-team lead w/ SEED-ONLY visibility              ·     [GAP]  [GAP] (tests grant rights by hand)
04-20 atomic log / stale from / 2-conn race / reseed       ·     ★★★    ·     ★★★
04-21 status UI (modals, blockedReason, dblclick, 375)    ·     ★      ★★★   ★★★
04-21 lastStatusChangeOn same-tx tie (seq order)          ·     [GAP]  ·     ★
04-11 auto-settle KST boundary / idempotent / SKIP LOCKED ★★★   ★★★    ★     ★★★
04-11 read fail-open / write fail-closed                  ★★    ★★★    ·     ★★★
04-11 list+aggregate parallel (Promise.all) consistency   ·     [GAP] (f2 is sequential)  ★
04-11 projectResponsibles (archived lead, N+1)            ★     [GAP]  ★     ★
04-22 period rights/validate/preview (resolved values)    ★★★   ★★★    ★★    ★★★
04-22 period save × version after auto-settle (j,g)       ·     ★★ (asserted but contradicts design → P1)
04-22 second period save without reload                   ·     ·      [GAP] ★
04-22 mixed batch: period + lines ordering                ·     [GAP]  ·     ·
04-12 settling cell matrix / normalization / ownership    ★★★   ★★★    [→E2E 04-30]  ★★★
04-12 settling insert (D12) vs quantity>0 validation      ★     ★★ (g, will go red → P1)
04-12 archive + totals exclusion + restore delegation     ★     ★★★    ★★    ★★★
04-12 phantom document_update on later rollback           ·     [GAP]  ·     ·
04-12/30 sortOrder: duplicate mid-list, add after archive ·     [GAP]  [GAP] ★
04-30 post-save state keeps unsaved rows (no reload)      ·     ·      [GAP] ·
04-26 cap: add/restore/race/lowered cap                   ·     ★★★    ★★    ★★★
04-26 300-line detail render time                         ·     ·      [GAP] (perf) ★
04-27 work_scope seed/migrate/admin/reseed                ·     ★★★    ★★    ★★★
04-27 E2E isolation vs parallel specs using role-team-lead·     ·      [GAP] (flake) ★
04-09 format/parse tables, caret, reject-not-truncate     ★★★   ★      ★★★   ★★★
04-25 Select hint / phone P2                              ·     ·      ★★★   ★★
pool starvation / lock_timeout                            ·     [GAP]  ·     ·
```

### Gaps: test file and assertion to add
1. `test/e2e/project-lifecycle.spec.ts` (04-21) and `project-period.spec.ts` (04-22): delete every `upsertVisibility`/`upsertPermission` for team-lead and CEO beyond what the seed provides, then assert that a same-team lead sees 「상태 바꾸기」 and the project number/name in the header. This catches P1-visibility.
2. `test/integration/project-period.test.ts` (04-22): new case (m), two sequential period saves using the `version`/values returned by the first save, where both succeed. Keep (j) as written; it must pass after the P1-version fix.
3. `test/integration/quote-lines.test.ts` (04-12): (t) ledger batch with valid lines plus a failing revenue row gives `count(action_log where entity='quote_line' and entity_id=revisionId)` unchanged. (u) Duplicate a line mid-list and archive another, then `listQuoteLines` order equals the client order on two consecutive reads.
4. `test/e2e/quote-edit-scope.spec.ts` (04-30): edit line 2 of 3, press Ctrl+S, assert `tbody tr` count is 3 **before** reload.
5. `test/integration/project-auto-settlement.test.ts` (04-11): (f3) with an overdue fixture, run `Promise.all([listProjects(v,{filter:{status:"settling"}}), aggregateProjects(v,{status:"settling"})])` and assert list length == aggregate count (fails until the single-entry call).
6. `test/integration/project-status.test.ts` (04-21 (i)): two `status_change` rows in one tx (system settle + human) give `lastStatusChangeOn` from the row with the higher `seq`.
7. `test/e2e/roles.spec.ts` (04-27): create a scratch role in `beforeAll` and toggle **that** role's scope. Do not mutate `role-team-lead` while `project-lifecycle`/`project-period` specs run in parallel (`playwright.config.ts:50` `fullyParallel: false` still runs files across workers; `deferred-items.md` documents parallel flakiness).

### CRITICAL regression risks (existing behavior)
- **04-12 `computeQuoteLineAmounts` signature (+`lineStatus`)**: callers are `saveQuoteLines`, `test/unit/domain/quote-lines.test.ts`, and later 04-15 copy (group B). Stored `quote_amount_krw` of existing `cancelled` rows stays non-zero until re-saved. Demo-only, so no backfill is needed, but note it in the SUMMARY.
- **04-12 removing `sortOrder ?? index`**: existing demo rows keep duplicated sort orders, and with no tiebreak the order is unstable. The P2 above fixes this.
- **04-20 seed switch to insert-if-absent for `role-pm projects`**: E2E `page-chrome`, `mobile-page-chrome`, `a11y` and `mobile-list-empty` rely on the row (`seed/index.ts:145-153` comment). This is safe on existing DBs, but the fresh-DB path must still insert. Covered by A-05 test "빈 DB의 첫 시드는 켠다".
- **04-09 TextField hidden `name` input**: `settings-form-client.tsx` number kinds and `settings.spec.ts` submit via FormData. Any code reading `form.elements[name]` from the visible input breaks. Grep `elements\[` / `getAll(` before merging.
- **04-22 1차 render condition → `canSave`**: `revenue-section.spec.ts` (경영관리 `canWriteEntries`) and `quote-table.spec.ts` (PM) must stay green. Both are already in 04-22 verify.

---

### 4. Performance

**[P2] (confidence 8/10, pre-existing, amplified by 04-26/04-12) `project()` runs one visibility query per field per row, and the 300-line cap makes detail loads issue thousands of queries**
Evidence:
- `domain/permissions/project.ts`: `for (const field of spec.fields) { … const ok = await visibleFn(viewer, field.infoItem);`
- `repositories/permissions.ts:65-76`: `findVisibility` issues one `SELECT … LIMIT 1` per call, with no cache.
- `lines.ts:172-177`: `listQuoteLines` projects every row. 16 fields (18 after 04-12) × 300 lines is about 5,400 queries per detail render on a 5-connection pool. 04-26's E2E seeds exactly 300 lines, and `saveQuoteLines` projects saved rows the same way.
Remedy: resolve each distinct `infoItem` once per call (`projectMany(viewer, rows, spec)` or a per-call memo map inside `project`). This touches `domain/permissions/project.ts`, a Phase 3 contract file, so it can be a TODO or folded into 04-12 (**scope call for the user**). Test: unit test with a counting `visible` stub, 300 rows → `visible` calls equal the unique infoItems.

**[P2] (confidence 7/10) `projectResponsibles` N+1**: see Architecture.

**[P3] (confidence 6/10) The `action_log` index does not fit the new lookups**
Evidence: indexes are `(actor_id, occurred_at)`, `(action_type, occurred_at)`, `(document_id)` and `(pruned_at, occurred_at)` (`db/schema/action-log.ts:32-35`). The new lookups (`findLatestActionFor(entity, entityId, 'status_change')` per detail render, and 04-11's RETURNING scalar subquery per settled row) filter by `entity_id` and walk the `status_change` range of the type index. That is fine at 10–30 users because `status_change` rows are few, but it grows linearly.
TODO: partial index `(entity, entity_id, occurred_at DESC) WHERE action_type='status_change'` when `status_change` exceeds ~50k rows.

**[P3] (confidence 6/10) The project-row lock is held for the whole per-row write loop**
Evidence: `lines.ts:476-534` awaits one UPDATE/INSERT per row sequentially inside the tx. After 04-12, that tx holds `FOR UPDATE` on the project, so a 300-row paste blocks transitions, period saves and reads-for-write for its duration (≈ 300 × RTT). Acceptable at this scale. Note it, and if it hurts, batch inserts with a multi-row `INSERT … RETURNING`.

**[P3] (confidence 5/10) A write transaction on every GET**
`applyAutoSettlement` opens BEGIN/UPDATE/COMMIT per `findProject`, `listProjects` and `aggregateProjects` call, which is 3 RTT even when 0 rows. It uses `projects_status_idx`. Acceptable; tied to the DRY item (one call per request). Also move the call **after** the `scopeFor` check (`domain/projects/index.ts:214-216`), so viewers without `projects` view don't trigger writes and a bad URL id doesn't log `project.auto_settle_failed` on every hit.

---

### Failure modes (new codepaths)

| Path | Realistic production failure | Planned test? | Error handling? | Silent? | Verdict |
|---|---|---|---|---|---|
| 04-11 read-path auto-settle | code bug (TypeError) inside settle → swallowed, `[]` returned everywhere | unit (deps throw) | log.error | **yes: only a log line, no alert** | gap → TODO: log-based alert on `project.auto_settle_failed` |
| 04-11 loadProjectForGate (write) | log insert fails → whole write fails | (j) | throws | no | OK |
| 04-20 transition as team lead | seed-only visibility → always "다른 팀" | **no** | UserFacing message is wrong | misleading | **CRITICAL (P1)** |
| 04-22 period save after status change / auto-settle | false 「먼저 기간을 바꿨습니다」 | (j) contradicts | UserFacing | misleading | **P1** |
| 04-22 second period save w/o reload | stale version conflict | **no** | UserFacing | misleading | P1 (same root) |
| 04-12 settling new line (D12) | always rejected (qty>0 rule) | (g) will fail | format error | no | P1 (plan contradiction) |
| 04-12 ledger batch rolled back after lines | phantom `document_update` log | **no** | none | **yes** | **P2, all three bad → critical gap for audit** |
| 04-12/30 duplicate/add after archive | order flips on reload | **no** | none | **yes** | P2 |
| 04-30 save one of N lines | other rows vanish until reload | **no** | none | **yes** | P2 (pre-existing) |
| Any locked write under ≥5 concurrent saves | pool starvation hang | **no** | none (no timeouts) | request hangs | P2 |
| 04-27 work scope flip | E2E flake in parallel specs | no | n/a | flaky CI | P2 test |
| 04-26 restore/add at cap | covered | yes | GateBlocked | no | OK |

Critical gaps (no test, no handling, silent): **phantom action-log on ledger rollback** and **sortOrder collisions**. The visibility/authorization P1 is not silent but is masked by test fixtures.

---

### What already exists (reused vs rebuilt)
- Reused correctly: `gate()`/`registerGateRule` single entry; `withTransaction`; `DbOrTx` repository pattern; `teamAtDate` (but see P1: must not be used through `project()` for authorization); `findMembershipAtDate`; `listCodeItems(includeInactive)`; the `references.ts` pattern; the `SaveRejectedError`/`CellFormatError` shape; `ARCHIVABLE_TABLES`; `lib/log`; the `markActionLogRowsPruned` semantics; the migration numbering checker; `scripts/reset-test-db.sh` for the scratch DB.
- Rebuilt, or at risk of it:
  - `stripNumberInput` duplicates the paste normalizer (04-09).
  - Line-status list: no domain constant exists, so 04-12 must create one rather than "reuse".
  - `projects.version` is reused as a period-conflict token although it already means "any status change". Wrong reuse; use a field baseline like D-65.
  - Three `applyAutoSettlement` call sites per list request.
- Already exists and planned correctly: `recordAction` always-on list (`status_change` always on). Note that `document_update` (used for A-16's period log) is admin-switchable (`record.ts:65-72`), so 「누가 정산을 일으켰나」 can be turned off by settings. P3; **user decision**: accept, or make period edits log as an always-on type.

### TODO candidates
1. Visibility: add `projectMany`/memoised `visible` in `project()` (P2 perf).
2. Visibility seed re-upsert: `insertVisibilityIfAbsent` (if not folded into 04-20).
3. Log-based alert on `project.auto_settle_failed` and `write.denied` spikes (Phase 7 ops).
4. `action_log` partial index for `status_change` by entity (when volume warrants).
5. `withTransaction` `lock_timeout`, pool `connectionTimeoutMillis` and `statement_timeout` (if not folded into 04-20).
6. Archive list shows only `item_name` for `quote_line` (`repositories/archive.ts` entry). Add the project number to the display name so admins can tell which project a restore touches (P3 UX).

### Items needing user decisions
- U1 (P1 visibility): default info-item visibility for 팀장 / 본부 책임자 / 대표 (e.g. = PM `staffDefault`; CEO also `revenue.*`?).
- U2 (P2): mixed batch judged on the post-save state (recommended) or the pre-save state.
- U3 (scope): fold the visibility re-upsert fix, the `project()` memoisation and the lock/pool timeouts into Phase 4 plans (04-20/04-12), or record them as TODOs.
- U4 (P3): the period-change log type is `document_update` (switchable); accept, or make it always-on.
- U5 (optional, P1 D12 fix): new settling line shows 수량 1 · 단가 0 (locked) instead of 수량 0.
All other findings are pure plan fixes or fact corrections.

## 부록 B — 묶음 B 분석 원문
### /plan-eng-review — Group B (quote revisions · approval · revenue/contract · reserves · contract-column removal)

Scope: 04-07, 04-13, 04-14, 04-15, 04-16, 04-23, 04-24, 04-40, 04-41, 04-42 at `ebcc051`, checked against the code as it stands (04-01, 04-02 and 04-05 executed) and against the group-A interfaces these plans consume (04-11 `loadProjectForGate`, 04-12 `restoreQuoteLine`/`DOMAIN_RESTORERS`/`QUOTE_FIELDS_LOCKED_IN_SETTLING_INSERT`, 04-20 `lockProjectForWrite` = `FOR UPDATE`). None of these exist in code yet, but all of them are named in 04-12, 04-11 and 04-20.

I did not re-raise anything the CEO ledger settled: D5/B-05 (lock plus server check), D6, D7/B-07(A), D9, D10, D12, D19-x, B-33, B-35, and the other decided items. Where a finding refines a settled item, it says so.

Legend: P1 = fix before execution · P2 = fix in the plan now (cheap), or execution will produce a defect or rework · P3 = note or TODO.
"Decision" = needs a user or policy choice · "Fix" = pure fact-correction or plan edit.

---

### 1. Architecture (8)

**[P2] (conf 8) 04-16:122 / 04-16:150 — The B-27 "VAT as of the approval date" fix is off by one day at the KST boundary. Fix.**
- Plan: "승인일(KST 00:00 순간, 04-14)을 `asOf`로 넘긴다". 04-14 stores `customer_approved_at = kstDayStart(ymd)`, which is `2026-09-18T15:00:00Z` for 9/19.
- Code: `domain/settings/registry.ts:46-48` `function dateOnly(date: Date) { return date.toISOString().slice(0, 10); }`, and `:75` `const asOf = dateOnly(opts?.asOf ?? new Date());`. So the VAT rate and rounding unit are looked up for **the day before** the approval.
- The existing revenue rows avoid this by passing `new Date(row.entryDate)` (`domain/revenue/index.ts:191`, UTC midnight of the ymd).
- Remedy: pass `new Date(kstDateOf(approvedAt))` (the ymd at UTC midnight), not the stored instant.
- Test: add an approval exactly on a new rate's `effective_from` day. The planned case (approved 2026-01-10, new rate from 2026-06-01) cannot catch the bug.

**[P2] (conf 7) 04-07:39 / 04-07:264 — Reserve writes are gated by `pnl` write only, but the rejection messages carry balances. Fix.**
- Truth 39: "리저브 쓰기(저장 · 보관 · 복원)는 권한표 `pnl` 쓰기로 판정". Rejections return `이 줄 뒤 잔액이 {잔액}이 됩니다` and `복원하면 {날짜} 잔액이 {잔액}이 됩니다`.
- So a role with `pnl` write but `reserve.amount` hidden can probe balances by posting to `saveReservesAction` (a server action is a public endpoint; the page 404 does not protect it). That same role can also restore through the archive with `admin.archive`.
- This contradicts the plan's own prohibition 「금액만 빼고 건수는 보여주자 같은 부분 노출도 같은 실패」.
- Remedy: `saveReserves` and `restoreReserve` require `can(pnl, write) && visible(reserve.amount)`. Add one integration case: `pnl` write with exposure off → `ForbiddenError`, and no amount in the message.

**[P2] (conf 6) 04-07:205 (B-16 detail) — Reserve amounts land in `action_log.detail`, which only `action_log.detail` gates. Decision.**
- `domain/action-log/index.ts:139` is `{ key: "detail", from: "detail", infoItem: DETAIL_INFO_ITEM }`. Anyone who can read action-log detail sees `changed.amount: [300000, 250000]` even when `reserve.amount` is off. Export goes through `domain/action-log/export.ts` and carries the same data.
- The precedent for per-entity gating already exists: `ENTITY_NAME_RESOLVERS` (`index.ts:187-195`, e.g. `vendor: { infoItem: "vendor.value" … }`).
- Options:
  - (A) Mask `detail.changed.amount` for entity `reserve_entry` unless `visible(reserve.amount)` (small: one resolver-like map).
  - (B) Log only `changed: ["amount"]` field names, with no values.
- This goes with the still-open B-16 "always-on?" question.

**[P2] (conf 6) 04-07:266, 04-14:212, existing `domain/quotes/lines.ts:484-486` — New locked transactions acquire a second pool connection while holding a row lock, a pool-starvation hang. Fix.**
- `DB_POOL_MAX` defaults to 5 (`lib/env.ts:54`) and the pool has no acquire timeout.
- Inside `withTransaction` + `FOR UPDATE`, the plans call helpers that use the global `db`:
  - `restoreReserve` calls `can(viewer,"pnl","write")` after the lock ("withTransaction → 줄 → `pnl` 쓰기").
  - `setCustomerApproval` does "담당 PM 여부 + `can(viewer, "projects", "write")`" after `loadProjectForGate`.
  - `rememberFxRate` → `upsertSimpleValue(SYSTEM_VIEWER,…)` (`domain/money/currency.ts:40-44`) is called from inside `runSave` today, and 04-07 copies the pattern.
- Failure: 5 requests on one project or client (a double-click burst plus retry) means 4 connections sit waiting on the row lock while the lock holder waits for a 5th connection that never frees. The instance hangs and Postgres cannot detect it.
- Remedy (one rule in 04-07 and 04-14, and a note to 04-12/04-20):
  - Evaluate `can`/`visible`/settings **before** `withTransaction`, or pass `tx`.
  - Call `rememberFxRate` **after commit**. This also fixes a second bug: a rejected batch currently still mutates `fx.recent_rate.USD`, because it runs before a later row throws.
  - Optionally `SET LOCAL lock_timeout = '5s'` in locked transactions so waits surface as errors.

**[P2] (conf 7) 04-14:152 — The unique-violation test cannot be built as described. It deadlocks against the plan's own lock. Fix.**
- Behavior: 「순번 유일 제약 위반(테스트가 `deps`로 삽입 직전에 같은 순번 행을 먼저 넣어 흉내)」. But `deps` is only `{ now?; afterLock? }` (04-14:159), and `afterLock` takes no `tx`.
- A row inserted from another connection needs `FOR KEY SHARE` on `projects` (FK `quote_revisions.project_id`). The function under test holds `FOR UPDATE` on that row (04-20 `lockProjectForWrite`), so the hook blocks on its own caller and the test hangs until timeout.
- Remedy: inject `deps.insertRevision` that throws a synthetic `23505` with constraint `quote_revisions_project_seq_key`. This is a unit-level test of the error mapping via `isUniqueViolation`. The real serialization proof is already 04-40's race test.

**[P2] (conf 7) 04-14:201/212 — An empty revision can be approved, then no priced line can be added and no new revision can be created. Decision.**
- `quote.approval-toggle` has no line-count condition. 1차 is created empty at registration (`db/schema/quote-revisions.ts` comment: "프로젝트를 등록하면 1차가 함께 생긴다").
- After approval of the empty 1차:
  - 04-40 rejects any new `quote` line with non-zero quote cells.
  - 04-14 rejects a new revision because 「복사할 견적 줄이 0개면 새 차수를 만들 수 없다」.
  - The contract shows 0 as 「1차 고객 승인 합계」, and the Phase-5 customer-approval gate passes.
- The only exit is un-approve, and D-56 forbids that once linked documents exist.
- Options:
  - (A) `quote.approval-toggle` rejects when the revision has 0 `quote`/`out_of_quote` lines (e.g. `승인할 견적 줄이 없음 · 첫 줄 만들기`).
  - (B) Allow it and accept un-approve as the exit.

**[P3] (conf 7) 04-07:163 — `FOR UPDATE` on `vendors` also blocks unrelated FK traffic. Fix (refines settled B-05; not re-raising the decision).**
- Plan: `SELECT id FROM vendors WHERE id = ANY($1) ORDER BY id FOR UPDATE`. `FOR UPDATE` conflicts with the `FOR KEY SHARE` that every insert or update of `quote_lines.vendor_id`, `projects.client_id` and `reserve_entries.client_id` takes on that vendor. The reverse also holds: a quote save that references vendor X blocks reserve saves for X until it commits.
- `FOR NO KEY UPDATE` still serializes reserve writers (it conflicts with itself) but not FK checks. Same one-token change for the reserve race test expectations.

**[P3] (conf 6) 04-07:266 · `domain/archive/index.ts:69-86` — `DOMAIN_RESTORERS` inside `domain/archive` makes archive import every domain module (quotes, reserves, and later Phase 5–10). Fix, optional.**
- With two entries this is fine. Note it as a TODO: switch to a registration call (`registerRestorer("reserve_entry", restoreReserve)` from the owning module) when a third entry appears. That avoids an archive → reserves → … import cycle.

Realistic production failure per new codepath (condensed):

| Path | Realistic failure | Plan handles? |
|---|---|---|
| saveReserves | lock-holder waits for a pool connection (above), or FK lock contention on vendors | No — P2 above |
| restoreReserve | same, plus balance message leaks to a `pnl`-write/no-exposure role | No — P2 above |
| createRevisionFromCurrent | double-click/stale tab | Yes (`fromRevisionId`, lock, 23505 mapping); test injection broken (P2) |
| setCustomerApproval | empty-revision approval dead end | No — Decision |
| listRevenue contract | VAT day-before at KST boundary | No — P2 |
| 0015 DROP | business contract values present | Yes (RAISE guard, whole batch one tx — confirmed `.squawk.toml` `assume_in_transaction`) |
| 0016 CREATE + FKs | `SHARE ROW EXCLUSIVE` on vendors/projects under `lock_timeout 1s` fails the whole batch while traffic is present | Acceptable: deploy-time, retryable; Phase 3 revision doesn't read projects |
| saveQuoteLines (approved) | USD fx-rate-only edit changes the approved total | Unverified — see §3 |

---

### 2. Code quality (8)

**[P2] (conf 8) 04-07:213, 04-15:170 vs `domain/money/index.ts:79-92` — The B-17 "KRW fx pinned to 1" check is re-implemented per feature, and the existing paths keep the hole. Fix.**
- `moneyToColumns` computes `amountKrw: toKrw(input)` = `amount * fxRate` and stores `fxRate.toFixed(4)` regardless of currency.
- `moneyInputSchema` is `fxRate: z.coerce.number()` (`app/(app)/projects/actions.ts:14-18`). Quote-line unit price/execution and revenue entries (`saveEntries`, `domain/revenue/index.ts:255`) still accept KRW with fx 1350.
- 04-07 and 04-15 each add their own "KRW면 요청 환율을 버리고 1" plus range checks.
- Remedy: one `normalizeMoneyInput`/`moneyToColumns` rule inside `domain/money` (KRW → fx 1; USD fx > 0; int32 range → typed error), used by all four writers. This deletes two per-plan validators and closes the quote-line and revenue path.

**[P2] (conf 7) `write.denied` — 04-07:217, 04-14:159/212, 04-15, while 04-13 and 04-40 insist on "one call site". Fix.**
- 04-14 says 「거부 직전마다 `log.warn("write.denied", …)`」 (several sites across two functions), and 04-07 and 04-15 add their own.
- The "no amount keys" guarantee then rests on every hand-written field list.
- Remedy: one helper (made in 04-12, where the first site is) `denyWrite(viewer, rule, ids, err)` with an allowlisted field shape (`viewerId, rule, projectId?, revisionId?, clientIds?, entryIds?, lineIds?, sourceProjectId?`). Every plan calls it, and the "no amount" test becomes a type guarantee.

**[P2] (conf 8) 04-42:167/185 — The FX-cell precedent it points to will be gone by then. Fix.**
- 04-42 says 「통화·환율은 04-02 매출 표의 금액 셀 형태 그대로」 and reads 「`revenue-section.tsx`의 환율 칸 기본값·touched 처리(04-02)」.
- The only FX UI in `revenue-section.tsx` is the **contract** field (`:211-253`, `id="contract-amount"`, `contract-currency`), which 04-16 (an earlier wave) deletes. 04-02 SUMMARY Known Stubs: 「발행·입금 줄의 외화 입력 UI 없음」.
- Remedy: point at `quote-table.tsx` `UnitPriceCellEditor` (`:228-260`, currency + fx + touched) or 04-15's `preEstimate` field.
- Also 04-15 read_first cites `revenue-section.tsx 90–120행` for the FX field. It is actually `210–253`.

**[P3] (conf 8) 04-40:32/204 — The approved-revision lock omits 소분류, which CEO B-07(A) listed. Fix or confirm.**
- B-07(A) (ceo-review:1163): "locks the 견적가 inputs (수량, 단가, **소분류**, and add/archive of `quote` lines)". 04-40 locks 「수량·단가·상태」 and leaves 소분류 editable (adding 상태 is correct: cancel zeroes the amount).
- 소분류 does not move the total, so the deviation may be intended. Record it in the SUMMARY, or add 소분류 to the lock set.

**[P3] (conf 7) 04-07:159 — `sort_key` is unneeded complexity with no assignment rule.**
- 「`sort_key` integer NOT NULL(같은 날짜·같은 구분 안의 결정적 순서)」. No plan says who assigns it (client? max+1 under lock? after a date edit?).
- The decision is by **date closing balance**, so intra-day order among same-direction rows never changes accept/reject. It only affects the displayed per-row balance.
- Remedy: drop the column and order by `(entry_date, direction, created_at, id)`. That is one less column, one less input, and no tie ambiguity. If it is kept, specify the server assignment and add `id` as the final tiebreak.

**[P3] (conf 6) 04-13:155 — The zod schema still requires a 소분류 that the server overwrites for adjustment and out-of-quote rows. Fix.**
- The action schema says `subcategory: z.string().min(1, "소분류를 고르세요.")` (`actions.ts:71`). 04-13 says 「소분류 칸에는 종류 값을 적는다」 on the server, and 04-23 renders it read-only.
- If the client sends "" for a new adjustment or out-of-quote row, zod rejects it before the domain code runs.
- Remedy: add a `superRefine` to 04-13 Task 2 ②: 소분류 is required only for `lineKind` `quote`/undefined. Also state that an existing row's kind is read from the DB row (`currentRowsById`), not from the input. The plan's `lineKind?` is "새 줄에서만", yet it also rejects "기존 줄의 종류 변경 요청".

**[P3] (conf 6) 04-41:123 — The `node:fs` reference-scan test is largely redundant with `tsc`.**
- Once `...moneyColumns("contract")` is removed from `db/schema/projects.ts`, every `contractAmountKrw` property access fails typecheck. The scan adds value only for raw SQL strings.
- Keep it (cheap) or reduce it to the snake_case names only. Simplicity note, not blocking.

**[P3] (conf 7) Stale comments in touched files (update in the plan that changes the behavior):**
- `domain/revenue/index.ts:287-290`: 「계약 금액은 기존 "projects" write(PM)…」 → 04-41
- `domain/revenue/index.ts:169`: 「계약 금액 + 발행·입금 두 표」 → 04-16
- `domain/projects/ledger.ts:6-8`: 「매출 섹션(계약 금액·발행 줄·입금 줄)」 → 04-41
- `domain/quotes/lines.ts:348`: 「게이트 판정(완료 잠금)」 → 04-13 (B-36 removes it)
- `domain/rules/register.ts:4` → 04-13/04-14
- `repositories/projects.ts:24-26`: 「상태와 무관하게 전 줄을 더한다」 → 04-12/04-13 (archived/kind)
- 04-07:148/213 cite 「`domain/revenue` 220–320행 `saveEntries` … 검증 오류를 셀 오류로 모으는 형태」. `saveEntries` (`:246`) has no validation. The cell-error shape lives in `domain/quotes/lines.ts:279-309`.
- 04-07 also says 「(`plant8/money-boundary` 위반이면 잔액을 금액 모듈 밖에서 더했다)」. That lint only flags `Money`-typed operands (`eslint/rules/money-boundary.mjs:3,6`), not `number` KRW sums, so the claim is not enforced.

---

### 3. Tests

### Coverage diagram (planned tests only)

```
04-13 line kinds (server)
 ├─ 0014 migration inline CHECK / numbering ........ ★★★ lint:sql + migrate + node check
 ├─ adjust insert @완료 by projects.adjustment ..... ★★★ quote-line-kinds.test (DB re-read)
 ├─ PM edits/archives adjustment row → reject+log .. ★★★
 ├─ adjust-only edits quote-kind row → reject ...... ★★
 ├─ adjust-only INSERTS quote/out_of_quote row ..... [GAP]
 ├─ adjust-only ARCHIVES a quote-kind row .......... [GAP]
 ├─ kind-change reject / quote negative exec ....... ★★ unit
 ├─ out_of_quote @정산 new row OK, archive reject .. ★★★
 ├─ cap counts adjustments ......................... ★★★
 ├─ restore adjustment by perm (OV-2) .............. ★★★
 ├─ zod subcategory for adjustment rows ............ [GAP] (§2)
 └─ kinds invariant detail = list .................. ★★★ projects-list.test (Number())
04-14 revisions/approval (server)
 ├─ copy+lineage+version1+move adj (incl archived) . ★★★
 ├─ copy preserves note/vendor/sort/custom_fields .. [GAP]
 ├─ stale fromRevisionId / 정산·완료 / 0 lines ...... ★★★
 ├─ 23505 mapping .................................. ★ (injection hangs — §1)
 ├─ gates customer-approval/toggle/vendor-required . ★★★ unit
 ├─ approval KST round-trip / perms / 완료 / docs ... ★★★
 ├─ approve EMPTY revision ......................... [GAP] (Decision §1)
 ├─ summaries GROUP BY, number, key set ............ ★★★
 └─ previous-revision locked view (revisionSeq) .... ★ (behavior listed, no file/assertion named) [GAP]
04-40 concurrency + approved lock
 ├─ races A/B/C/D with waitForLockWaiter ........... ★★★
 ├─ multi-revision membership / mismatch / 1 log ... ★★★
 ├─ approved: qty/unit/status/insert/archive/restore ★★★ + DB SUM invariant
 ├─ approved: USD unit-price FX-only / currency edit [GAP]  ← OV-1 hole
 └─ un-approve re-enables edit ..................... ★★★
04-15 project copy / preEstimate ................... ★★★ integ, ★★ E2E
 └─ copied line with archived vendor ............... [GAP] (P3)
04-16 contract derived / issued-paid exposure
 ├─ derived, null when unapproved, 30억 number ..... ★★★
 ├─ VAT asOf approval day — boundary day ........... [GAP] (only mid-period case)
 ├─ invariant (a)–(g) ............................... ★★★ contract-invariant.test
 └─ PM key set / seed re-run ....................... ★★★ / ★★
04-41 contract removal
 ├─ schema strips old fields / scan ................ ★★★ / ★★
 └─ 0015 on 0010-state data (c) and guard (d) ...... ★★★ migration-upgrade.test
04-07 reserves (server)
 ├─ runningBalance table (mid-date, same-day, FX) .. ★★★ unit
 ├─ save/edit/archive/restore negative → no write .. ★★★
 ├─ client-lock race / perms / exposure / paging ... ★★★
 ├─ write with pnl-write but reserve.amount OFF .... [GAP] (§1 leak)
 ├─ edit/archive an ALREADY-ARCHIVED row in batch .. [GAP]
 ├─ project_id of another client / unknown clientId  [GAP] (23503 → generic)
 ├─ evidence_type not in code table ................ [GAP]
 └─ rejected USD save does not touch fx.recent_rate  [GAP]
04-42 / 04-23 / 04-24 screens ...................... [→E2E] reserves / quote-line-kinds / quote-revisions specs
```

### GAPs with concrete test and assertion

1. `test/integration/quote-approved-lock.test.ts`: approved 2차, USD line. Send the same `unitPrice.amount` with `fxRate` 1350 → 1400 → expect rejection `{n}차 고객 승인됨 · 고치려면 새 차수`, and `SUM(quote_amount_krw)` unchanged. Same for a currency switch.
   - Prefer the implementation invariant "for approved current revision, recomputed `quoteAmountKrw` ≠ stored → reject" over a per-field list.
   - Add the same case to `contract-invariant.test.ts` (h).
2. `test/integration/quote-line-kinds.test.ts`: `projects.adjustment`-only viewer sends a new `quote` row, and separately `archivedLineIds:[quoteLineId]` → both `ForbiddenError`/gate reject, DB unchanged. This guards the widened entry permission in 04-13 Task 1 ④.
3. `test/integration/reserve-entries.test.ts`:
   - (a) A role with `pnl` write and `reserve.amount` off gets `saveReserves` → Forbidden, with no digits in the message.
   - (b) A batch that edits a row already archived → reject.
   - (c) `projectId` whose `client_id` ≠ row `clientId` → cell reason.
   - (d) Unknown `clientId` → cell reason, not a PG 23503 error.
   - (e) A rejected USD batch with `fxRateTouched` → `fx.recent_rate.USD` unchanged.
4. `test/integration/revenue-entries.test.ts`: a new VAT rate `effective_from = 2026-09-19`, approval `2026-09-19` → the contract VAT uses the new rate.
5. `test/integration/quote-revisions.test.ts`:
   - (a) Approving an empty 1차 → per the decision.
   - (b) Copy preserves `note`/`vendor_id`/`sort_order`/`custom_fields`/`line_status`.
   - (c) `listQuoteLines(…, { revisionSeq: 1 })` → every cell `locked`, no adjustment rows, and `quote.amount`-hidden role key set.
6. 04-13 action schema: `test/unit/…` or integration. A new adjustment row with `subcategory: ""` passes zod and is stored as `adjustment`.

### CRITICAL regression risks to existing behavior

- **04-13 widens the `saveQuoteLines` entry gate** from `can(projects, write)` (`domain/quotes/lines.ts:361-364`) to "`projects` OR `projects.adjustment`".
  - Every path inside the function that assumed `projects` write is now reachable by adjustment-only users: new quote rows, `archivedLineIds`, sort-order renumbering (`sortOrder: input.sortOrder ?? index`, `:489`, silently renumbers rows sent without `sortOrder`).
  - Caller: `saveProjectLedger` → `saveProjectLedgerAction`. GAP 2 is needed.
- **04-16 changes the `ContractInfo` shape and the gating of `contract` (`project.value` → `quote.amount`) and `issuedTotalKrw`.**
  - Callers: `revenue-section.tsx:36-63, 210-253`; `quote-table.tsx` contract draft; `test/e2e/revenue-section.spec.ts`; `revenue-entries.test.ts` (d). The plan updates them.
  - The seed upsert of the 기획 PM exposure row overwrites admin customizations (acknowledged).
- **04-41 drops `projects.contract_*`.** Callers: `repositories/projects.ts:236-298`, `domain/projects/index.ts:274-277`, `domain/revenue/index.ts:24,176-183,302-330`, `actions.ts:100-101`. No other `.ts` references (`grep` confirmed). Covered by typecheck and the scan.
- **04-40 current-revision recheck** rejects any save aimed at a non-latest revision. Before 04-14 there is only one revision per project, so there is no existing caller at risk. Fixtures that build revision 2 by raw SQL would be.

---

### 4. Performance (5)

**[P3] (conf 7) 04-07:268 — `listReserves` loads every active reserve row of every client, sorts in JS and slices 50, on every page view.**
- Fine at 10–30 users (hundreds to low thousands of rows). The `(client_id, entry_date, sort_key)` index is not used by this query, which is ordered by vendor name.
- TODO: window-function `SUM() OVER (PARTITION BY client_id ORDER BY …)` in the repository when rows exceed ~20k. The plan already records this escape hatch.

**[P3] (conf 6) 04-14 × `repositories/projects.ts:27-38` — Every new revision duplicates all lines, and `lineSumsSubquery` groups the entire `quote_lines` table on every list/aggregate call.**
- It is unfiltered by current revision; the join to `current_revisions` happens after.
- The cost grows with revision history, not with the live data. TODO for 04-17 (group C owns the file): join `current_revisions` first, or add `WHERE revision_id IN (current revisions)`.

**[P3] (conf 6) 04-16 — `listRevenue` stays N+1 on settings.**
- Each issued/paid row calls `computeVat`/`computeGrossFromPayment`, and `applyTaxRule` reads about 4 settings per row (`domain/money/tax.ts`: basis-date ×2 + rate + unit).
- 04-16 adds one more `computeVat` plus 2 queries (latest revision, SUM). Acceptable now. TODO: memoize settings per `asOf` date within one call.

**[P3] (conf 7) Lock hold time.**
- `saveReserves`/`restoreReserve` read the whole client ledger inside the `FOR UPDATE` window, which is fine at hundreds of rows.
- The long pole is out-of-transaction calls inside the window (see §1 pool starvation). Keep `can()`, settings reads and `rememberFxRate` outside.

**[P3] (conf 5) 04-14 `copyQuoteLines` INSERT…SELECT and `moveAdjustmentLines` run under the project `FOR UPDATE`.** This is O(lines), a single statement, fine. There is no index gap: `quote_lines_revision_sort_idx (revision_id, sort_order)` serves both.

---

### Failure modes (no test + no handling + silent = critical)

| New path | Test? | Handling? | Silent? | Verdict |
|---|---|---|---|---|
| Approved revision, USD fx-only edit | No | Depends on 04-12 change detection | Yes (contract total drifts, label still "승인 합계") | **Critical gap** if change detection is per-cell amount only — fix via GAP 1 |
| Reserve write by `pnl`-write/no-exposure role | No | No | Yes (balance in message) | Critical gap (prohibition breach) — §1 |
| Contract VAT on approval-day boundary | No | No | Yes (wrong VAT) | Critical gap in principle; low real-world frequency |
| Locked tx acquiring a 2nd pool conn | No | No | No (hang, visible as timeouts) | Major |
| Empty-revision approval | No | No | No (user sees blocks) | Decision |
| Rejected batch mutating `fx.recent_rate` | No | No | Yes | Minor (existing pattern, reproduced in 04-07) |
| 0015 guard | Yes | Yes | No | OK |
| Stale-tab save to old revision | Yes | Yes | No | OK |

### What already exists (reused vs rebuilt)

- **Reused correctly:**
  - `moneyToColumns`/`toKrw`/`computeVat`/`applyTaxRule`
  - `isUniqueViolation` (`lib/pg-errors.ts`)
  - `withTransaction`
  - `ARCHIVABLE_TABLES` (`isProtected`, `listArchived`)
  - `registerDto` + leak-scan side-effect imports
  - `SaveRejectedError`/`CellFormatError` (`domain/quotes/lines.ts:279-309`)
  - `recentFxRate`/`rememberFxRate`
  - `quote_revisions_project_seq_key` (exists in `db/schema/quote-revisions.ts`)
  - `copied_from_line_id` (exists in `db/schema/quote-lines.ts`)
  - From group A: 04-20 `lock-race.ts`, 04-11 `loadProjectForGate`, 04-12 `restoreQuoteLine`/`DOMAIN_RESTORERS`/`QUOTE_FIELDS_LOCKED_IN_SETTLING_INSERT`/`quoteCellsZero`/`quoteAmountZero` (all present in 04-12-PLAN)
  - Archived-line exclusion in `lineSumsSubquery` is 04-12's
- **Rebuilt, should be shared:**
  - KRW/USD/int32 money-input validation (04-07, 04-15 → belongs in `domain/money`)
  - `write.denied` call sites (04-07, 04-14, 04-15 → one helper)
- **Per-entity info-item gating** already exists in action log (`ENTITY_NAME_RESOLVERS`). Reuse it for reserve detail masking.

### Candidate TODOs

1. `domain/money`: pin KRW fx = 1 and range-check in one place, and backfill quote-line/revenue paths (§2).
2. `denyWrite()` helper with allowlisted fields (§2).
3. Rule: no global-`db` calls inside a locked transaction, plus `SET LOCAL lock_timeout` for app write transactions (§1).
4. `lineSumsSubquery` restricted to current revisions (04-17 owner) (§4).
5. `listReserves` window-function rewrite when rows exceed ~20k (§4).
6. Settings memoization per `asOf` in `listRevenue` (§4).
7. `DOMAIN_RESTORERS` → registration pattern when a third entity joins (§1).
8. Decide B-16 "always-on reserve logging" together with amount masking in action-log detail.

### Items needing a user decision

- **D-B1:** approving an empty revision — reject (A) or allow and rely on un-approve (B). (04-14)
- **D-B2:** reserve amounts in action-log detail — mask by `reserve.amount` (A) or log field names only (B). Bundle this with the open B-16 always-on question. (04-07)
- **D-B3 (confirm):** 04-40 locks 상태 but not 소분류, versus B-07(A)'s list. Keep the plan's set or add 소분류. (04-40)

Everything else is a plan-fix or fact-correction.

## 부록 C — 묶음 C 분석 원문
### /plan-eng-review — Group C (list · filters · pagination · grid keyboard · docs · code table)

Scope: 04-08, 04-10, 04-17, 04-18, 04-19, 04-28, 04-29, 04-31, 04-03 (light) at `ebcc051`, checked against the current code they change
(`repositories/projects.ts`, `domain/projects/index.ts`, `app/(app)/projects/*`, `ui/table/*`, `app/(app)/admin/code-tables/*`,
`domain/permissions/{project,visible}.ts`). The CEO decision ledger is not re-raised. Next 16 check: the plans use only
`searchParams: Promise<{[k]: string | string[] | undefined}>` (matches `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md:14`),
`loading.tsx`, `useRouter().push`, and `requestSubmit`. Nothing deprecated.

Legend: P1 = fix before execution · P2 = fix in plan (cheap) · P3 = note/TODO. "Decision" = needs a user behaviour/policy call; "Fix" = fact correction / plan edit.

---

### 1. Architecture (8)

**[P1] (confidence 7/10) 04-17 Task 1 ③ / Task 2 ① — the new page path `loadProjectList` calls the repository directly, but no step or acceptance line requires it to project rows through `project()`. The existing leak and key-set tests still exercise the old `listProjects`, so they would miss a leak on the real page path.**
Evidence:
- `docs/ARCHITECTURE.md:73`: "`project(viewer, row, dto)`… 행 객체를 DTO로 투영해 domain 밖으로 내보내는 유일한 출구다"
- 04-17 ③: "리포지토리 `aggregateProjects`를 직접" and Task 2 ①: "목록(리포지토리 `listProjectsPage` 직접)"
- 04-17 Task 1 ① (d): `ProjectListRow` now carries `revenueKrw`·`issuedCount`·`profitBasis`·`profitRate` — "DTO 투영은 04-18이 한다"
- `app/(app)/projects/projects-table.tsx:1` `"use client"`. Every prop is serialized into the RSC payload.
- `test/integration/projects-list.test.ts:147` `listProjects(noAmountViewer, …)`. The existing row-key tests target the old entry, not `loadProjectList`.

Risk: if the executor passes repository rows straight to `ProjectsTable`, a viewer without `revenue.issued_amount` receives `revenueKrw`/`profitRate` in the payload even though the column is never drawn. This can ship between 04-17 and 04-18 (one PR, C-26) or stay afterwards.
Remedy (Fix):
- Add to 04-17: "`loadProjectList` rows pass through `project(viewer, row, PROJECT_LIST_DTO_SPEC)`".
- Move the no-amount key-set integration case (today `projects-list.test.ts:147-160`) onto `loadProjectList`.
- Say what happens to domain `listProjects`/`aggregateProjects`: delete them, or make them thin wrappers of `loadProjectList`. Today they become test-only orphans with different semantics (no range, no paging, and 04-11 put `applyAutoSettlement` in them).

**[P1] (confidence 7/10) 04-28 (touches this path) — keyboard Ctrl+S in the executed 04-04 grid can send the same batch twice. New lines have no `id`, so they are inserted twice.**
Evidence:
- `app/(app)/projects/[id]/quote-table.tsx:487-496`: `function handleSave() { if (errorCellCount > 0) return; … execute({` — there is no `isExecuting` guard. Only the button has `pending={isExecuting}` (`:847`).
- `quote-table.tsx:503`: `id: line.id,` is undefined for new lines. The server inserts them (`domain/quotes/lines.ts:531` `repoInsertQuoteLine`).
- `ui/table/use-grid-keyboard.ts:110-113`: Ctrl+S calls `handlers.onSave?.()` with no `event.repeat` check.

Holding Ctrl+S (auto-repeat about every 30 ms) or pressing it twice produces duplicate lines or self-conflicts. 04-28 rewrites exactly these branches and its E2E presses `Control+s`, but it adds none of the C-06 guards that 04-08 adds to the register form.
Remedy (Fix): in 04-28 Task 1 ①:
- Add `if (isExecuting) return` at the top of `handleSave`.
- In the hook, ignore Ctrl+S/Ctrl+Enter/Ctrl+D when `event.repeat` is set, and ignore Ctrl combos when `event.nativeEvent.isComposing` is set. The same IME concern as C-06 applies: Ctrl+Enter while a Korean item name is still composing.
- Add an E2E: new line + `Control+s` twice → the line count after reload is +1.

**[P1] (confidence 7/10) 04-19 Task 3 ② — positional "computed column = consumed and ignored" turns 04-04's visible error into silent column loss for Excel pastes that do not include the computed columns.**
Evidence:
- Column order in `quote-table.tsx:559-710`: 번호 · 소분류 · 항목 · 거래처 · 수량 · 단가 · **견적가** · 실행가 · **차익 · 상태** · 비고.
- `ui/table/use-clipboard-paste.ts:71` today: `"읽기 전용·잠김 셀에 값이 떨어졌습니다"`, an error the user sees.
- 04-19 ②: "`computed` 열 칸은 소비만 하고(값을 넣지 않고 오류로 만들지 않는다)".

A typical Excel sheet (소분류|항목|거래처|수량|단가|실행가) pasted at 소분류 puts 실행가 into the 견적가 slot. The value is dropped, the only trace is "계산 열 N칸 무시", and there is no error cell. The line saves with an empty or zero execution cost. D15 was framed around app-to-app copies (C-03), and 04-31's Excel item 1 uses a 3×3 region, so it would not catch this.
Remedy (Decision; recommended option): ignore computed cells only when the clipboard carries `application/x-plant8-quote-lines+json`, i.e. the copy came from this app. Otherwise keep 04-04's error. Add a 6-column Excel-shape case to 04-19 and 04-31 (a).

**[P2] (confidence 7/10) 04-19 Task 2 — the grid hook keeps focus and selection as page-local indexes. Page changes, C-04 mid-array inserts and row moves make them point at the wrong row.**
Evidence:
- `ui/table/use-grid-keyboard.ts:58`: `useState<GridPosition>({ row: 0, col: 0 })`
- `:59`: `selectionAnchor … GridPosition`
- `Table.tsx:100-104`: `flatRows` becomes the current page only.

04-19 decides targets by id (`crossPageTarget`), but after `setPage` the hook still holds the old `row` index. C-04 inserts new lines at the group end (mid-array), which shifts later indexes. Alt+↓ on a page's last row moves that row onto the next page while focus stays at index 29, on a different row. The plan does not cover Alt+↑↓ across a page boundary.
Remedy (Fix): store the hook's focus and anchor as `{rowId, colKey}` and derive the index per render, or reset focus by id after every rows or page change. Add E2E: Alt+↓ on row 30 → the row lands on page 2 and focus follows it. (Pin it or follow it; pick one — Decision-lite.)

**[P2] (confidence 6/10) 04-08 Task 1 ③ — the `isExecuting` guard does not cover the gap between success and navigation, so C-06's "exactly one project" can still fail and E2E (b) can flake.**
Evidence:
- `project-form.tsx:37-40`: `onSuccess: ({ data }) => { if (data?.project) router.push(...) }`. Once the action resolves, `isExecuting` is false again, but the form stays mounted until the detail RSC loads.
- The plan's guard: "(c) 제출이 진행 중이면(`isExecuting`)".

A second Ctrl+Enter (or click) in that 100–300 ms window creates a second project and consumes a document number.
Remedy (Fix): use a `submittedRef` latch. Set it in `handleSubmit`, clear it only in `onError` or on a validation/server error result, and check it in both keydown and `handleSubmit`. Keep the three planned guards.

**[P2] (confidence 7/10) 04-17 / 04-18 — row-field visibility is checked with one DB query per row per field. The plans raise it from 12 to about 17 fields.**
Evidence:
- `domain/permissions/project.ts:29-31`: `for (const field of spec.fields) { … const ok = await visibleFn(viewer, field.infoItem);`
- `repositories/permissions.ts:71-75`: one `select … from visibility_matrix … limit(1)` per call.
- `domain/projects/index.ts:182`: `rows.map((row) => project(viewer, row, PROJECT_LIST_DTO_SPEC))`

That is 50 × 17 ≈ 850 queries per list page. They are also sequential per row and contend for `DB_POOL_MAX` with other requests. 04-17 ⑥(f) only records a reference response time.
Remedy (Fix): resolve visibility once per request. Either wrap `visible` in React `cache()` keyed by `(roleId, infoItem)`, or have `project()` batch-resolve the spec's distinct info items once and reuse them per row. Add an integration check: `pool.query` calls for one `loadProjectList` ≤ a small constant. (Pre-existing since 04-05; it grows here.)

**[P2] (confidence 6/10) 04-18 prohibition 1 / 04-17 T-04-88 — "requires both info items" is a manual strip before `project()`. The DTO registry and leak scan can only express one item per field, so they cannot see this rule.**
Evidence:
- `domain/permissions/project.ts:11`: `fields: … { key; from; infoItem: string }`
- 04-18 probe_fallback: "없으면 … 세 키를 **투영 전에** 빼고, 명세의 정보 항목은 `revenue.issued_amount`로 둔다"

If a later refactor drops the manual strip, the leak scan stays green. Only the one key-set integration case would catch it.
Remedy (Fix): make it unconditional (not "if 04-16 made one"). Allow `infoItem: string | readonly string[]` (all-of) in `DtoSpec`, `project()` and `registerDto`, and have the leak scan iterate the array. Use it for `profitBasis`/`profitKrw`/`profitRate` and for the totals DTO.

**[P3] (confidence 6/10) 04-17 ② / 04-07 T-04-100 — generic paging helpers sit in a project-specific domain module.**
Evidence: 04-07 read_first: "`domain/projects/list-view.ts`(04-17 — `clampPage`)". The reserve domain would then import the projects list module, and 04-19 `ui/table/paging.ts` writes its own page clamp.
Remedy (Fix): put `clampPage`/`pageCountFrom` in `lib/paging.ts`, importable by domain and ui. Projects, reserve and `ui/table` all use it.

Realistic production failure per new path (does the plan handle it?):
- `loadProjectList` DB error → handled: `project.list_failed` log, rethrow, `error.tsx`.
- Auto-settle failure → handled: fail-open (04-11).
- Page count and rows are read in two statements → accepted (T-04-92).
- Deleting the last row on page 2 of the quote table → **not handled**: the page is re-split only on resetKey or a user page move, so page 2 renders empty. See §3 GAPs.
- Code-table description save on an archived item → handled.
- Register form second submit after success → **not handled** (above).
- Keyboard double save in the grid → **not handled** (above).

### 2. Code quality (7)

**[P2] (confidence 7/10) 04-08 ③ vs 04-28 ① — two separate "Ctrl-only shortcut" implementations. The IME and repeat guards exist only in the form.**
Evidence: `use-grid-keyboard.ts:92` `const meta = event.metaKey || event.ctrlKey;` versus 04-08's form keydown with `repeat`/`isComposing`/`isExecuting` guards.
Remedy (Fix): add `lib/shortcut.ts`: `isCtrlCombo(e, key)`, which requires `ctrlKey` and returns false on `repeat` or `isComposing`. Use it in both. It also makes 04-28's "메타 키 참조 0" scan trivially true.

**[P2] (confidence 7/10) 04-17 ③ — date-range entry reloads the whole page between the two date boxes.**
Evidence:
- 04-17 Task 3 ③: "blur에서 값이 처음과 달라졌을 때만 `requestSubmit`"
- The filter form is a native GET: `filter-bar.tsx:38` `<form ref={formRef} method="get"`

Typing `from` then Tab to `to` submits, reloads, and loses focus before `to` is typed. Every blur also runs the auto-settle UPDATE.
Remedy (Fix): submit on `focusout` of the period group only when `relatedTarget` is outside both inputs, plus Enter. The UI-SPEC "blur" still holds at group level.

**[P2] (confidence 7/10) 04-17 Task 3 ① — the year normalizer accepts 2000–2100, but the dropdown offers only 5 years. A native `<select>` whose value matches no option shows its first option (`전체 연도`), so the next filter change silently submits `year=all`.**
Evidence:
- `page.tsx:38-41`: `return [currentYear + 1, currentYear, currentYear - 1, currentYear - 2, currentYear - 3];`
- 04-17 behavior: "`year: "2031"` → 2031"

Remedy (Fix): add the requested year to the options when it falls outside the window, or clamp to the window. Add a unit case.

**[P2] (confidence 6/10) 04-19 Task 1 ② / Task 3 — the current page is clamped only on resetKey or a user page move. Deleting rows (Delete/Backspace deletes a row: `use-grid-keyboard.ts:158-161`) or unpinning can leave the current page past the last page, rendering an empty body.**
Remedy (Fix): clamp `page` to `pageCount` every render. Unit: 31 rows, page 2, delete row 31 → page 1.

**[P3] (confidence 7/10) Stale comments and orphans the list plans do not name.**
- `repositories/projects.ts:124-127`: "`limit`이 곧 화면의 "더 보기" 누적 개수"
- `:180-182`: the `limit` note on the aggregate
- `ProjectListFilter.year` doc `:43-44`
- `page.tsx:24-25`: "더 보기"
- `filter-bar.tsx:11`: "필터를 바꾸면 정렬·더 보기 누적도" — C-24 now keeps the sort, so this is wrong
- `projects.module.css:109-113`: `.loadMore`
- `ui/table/types.ts:19`: `sortable` doc

Remedy (Fix): add these to 04-17 Task 2's "remove" list and 04-18 ①.

**[P3] (confidence 6/10) 04-29 — at 375 px, 7 page numbers plus 이전 and 다음 are 9 × 44 = 396 px, more than the 347 px content width. The number row itself wraps; only the range text is planned to wrap.**
Evidence: 04-29 "7쪽 이하면 전부" and "폰(<700)에서 번호·이전·다음은 `--touch-min` 44×44". Container padding is 14 px on the phone (SYSTEM.md:182).
Remedy (Decision-lite): on the phone, use the gap window from 6+ pages, or accept a two-line number row and state it in §7-16.

**[P3] (confidence 5/10) 04-10 — `CODE_ITEM_DESCRIPTION_MAX = 40` counts UTF-16 units via `.length` (fine for Hangul). The seed/migration comparison regex `description:\s*"([^"]+)"` would also match any future non-code `description:` key in `domain/seed/index.ts`.** There are none today (grep = 0). Fine; just note it in the SUMMARY.

### 3. Tests

### Coverage diagram (planned tests)

```
LIST (04-17/04-18)                                   planned tests
 loadProjectList ─ normalizeListParams ............ ★★★ unit + integ table (C-08) + E2E teamId=abc
   ├─ applyAutoSettlement once (fail-open) ........ ★★  integ project-auto-settlement (04-11) · order only by Grep
   ├─ resolveListRange / parseListPeriod .......... ★★★ unit
   ├─ repo aggregate (GROUP BY bucket, bigint) .... ★★★ integ: overlap, 2-year no double count, 3e9, payment excl, archived
   ├─ pageCountFrom → clampPage ................... ★★★ unit + integ page=99 + concat==all
   ├─ repo listProjectsPage (offset, sort) ........ ★★  integ; sort-within-group ★★ (04-18)
   ├─ row DTO projection via project() ............ [GAP] tests hit old listProjects, not loadProjectList
   ├─ totals DTO key sets (4 roles) ............... ★★★ integ + leak-scan
   ├─ row key sets (4 roles) ...................... ★★  04-18 integ ("project() 투영 결과") — confirm through loadProjectList
   ├─ hidden-column sort → default ................ ★★  integ (revenue off only) · [GAP] quote.amount-off + sort=quoteAmountKrw
   ├─ emptyKind none/default-view/filtered ........ ★★  unit + E2E default-view · [GAP] none-branch integ
   ├─ KST created_at boundary ..................... ★★★ integ
   └─ error → project.list_failed + rethrow ....... ★   Grep only [GAP → unit with stub repo]
 filter-bar period blur/Enter, sort/dir hidden ...... [→E2E] ★★
 Pagination (04-29) pageWindow / render ............. ★★★ unit; phone wrap [→DOM audit]
 13 cols / collapse / collapseEarly ................. [→E2E] ★★ header counts at 1280/1100/800
GRID (04-19/04-28)
 splitPages / pageOfRow / crossPageTarget ........... ★★★ unit
 Table pagination render, footer = all rows ......... [→E2E] ★★★
 keyboard edge exit ↓↑, Tab, Shift-range stop ....... [→E2E] ★★
 Alt+↑↓ across page boundary ........................ [GAP]
 delete last row on last page → clamp ............... [GAP]
 Ctrl+A / native copy ............................... [→E2E] ★★ (synthetic capture)
 paste computed-ignore / FX warning ................. [→E2E] ★★ (synthetic event) · Excel shape w/o computed cols [GAP]
 parseTsv trailing newline .......................... ★★★ unit
 Ctrl-only + preventDefault + scan .................. ★★★ unit scan + E2E Meta+s/Control+s
 Ctrl+S double/auto-repeat → one save ............... [GAP]
FORM/DOCS/CODE TABLE (04-08/04-10)
 register Ctrl+Enter once / Esc ..................... [→E2E] ★★ · post-success window [GAP]
 SYSTEM.md revisions / glyph 0 / DECISIONS 12 ....... ★★★ unit docs test
 code-item description save/clear/40/perm/archived .. ★★★ integ + E2E
 seed == migration text (≥14) ....................... ★★★ node check
```

### GAPs (test file + assertion)
1. `test/integration/projects-list.test.ts`: `loadProjectList(noAmountViewer)` rows have no `quoteAmountKrw`/`revenueKrw`/`profitKrw`/`profitRate`/`profitBasis` keys (§1 P1).
2. `test/e2e/quote-table.spec.ts`: add a new line → `Control+s` twice rapidly → reload → line count +1 exactly (§1 P1).
3. `test/unit/ui/use-clipboard-paste.test.ts` (or E2E): paste `소분류\t항목\t거래처\t수량\t단가\t실행가` at 소분류 without the app MIME → the 견적가 slot is an error (or, per the decision, the 실행가 value is not silently dropped).
4. `test/e2e/quote-table.spec.ts`: 45 rows, Alt+↓ on row 30 → the moved row's id is focused and visible.
5. `test/unit/ui/table-paging.test.ts`: `clampPage` after the row count shrinks (31 → 30 rows while on page 2) → page 1.
6. `test/integration/projects-list.test.ts`: `sort=quoteAmountKrw&dir=desc` for a viewer with `quote.amount` off → default sort order (04-18 tests only `revenue.issued_amount` off).
7. `test/unit/domain/project-list.test.ts`: stub repo throws → `log.error("project.list_failed", {code})` called once and the error is rethrown (replaces "Grep").
8. `test/integration/projects-list.test.ts`: the `emptyKind === "none"` branch (viewer sees 0 projects at all).
9. `test/e2e/project-register.spec.ts` (b): make it deterministic. Route-delay the detail navigation (`page.route` on the RSC request) and press `Control+Enter` again after success → still 1 row.
10. `test/unit/ui/pagination.test.ts`: `year` outside the option window stays selected (the 04-17 page's `yearOptions` includes it).

### CRITICAL regression risks to existing behaviour
- **04-04 grid (executed):**
  - 04-19 swaps `flatRows` to page rows under an index-based hook. Existing users of the index-based `handlers.onMoveRow(pos.row)` (`use-grid-keyboard.ts:96`) and `onDeleteRow(pos.row)` (`:160`) now map through page rows. Verify `Table.tsx`'s index→row mapping uses page `flatRows` consistently, or Alt+↑↓/Delete will act on the wrong row on page 2+.
  - The 04-04 E2E for "읽기 전용·잠김 셀에 값이 떨어졌습니다" on the 견적가 column changes meaning under `pasteRole: computed`. 04-19 must update or keep that case explicitly; it is not listed.
- **04-05 list (executed):**
  - `test/integration/projects-list.test.ts:111` calls `listProjects(viewer, { filter, limit: 1 })`, and `:147-171` hold the no-amount key tests. All of them target the old domain entry, whose repository signature 04-17 changes (`limit` → `{offset, limit}`, `year` → `range`). They will either stop compiling or keep passing against dead code.
  - `test/e2e/page-chrome.spec.ts:105-111` and `a11y.spec.ts:60` ("빈 목록(프로젝트)") depend on what `/projects` renders with no params. The default changes from all years to this year, and the 1차 link rule changes. Re-verify: `getByRole("link", { name: "프로젝트 등록" })` must resolve to exactly one link in every empty branch.
- **Code tables:** 04-10 changes the table to 6 columns. `mobile-code-tables.spec.ts` (04-25 extends it) may assert a column count in between — check it in 04-10's `CI=true pnpm test`.

### 4. Performance (5)

**[P2] (confidence 8/10)** The per-row, per-field visibility N+1 (see §1). It is the dominant cost of the list page.

**[P2] (confidence 7/10) `repositories/projects.ts:27-38` — `lineSumsSubquery` groups the entire `quote_lines` table (every revision, every project). `currentRevisionsSubquery` (`:13-22`) does `DISTINCT ON` over all revisions. 04-17 adds `issuedSumsSubquery` over all of `revenue_entries`. Each runs twice per request: aggregate plus list.**
Postgres does not push the outer project filter into a grouped derived table on a LEFT JOIN. With 300-line revisions and several revisions per project, this is a full aggregation per request.
Remedy (Fix, can defer to a TODO): drive the sums from the current revisions only (`quote_lines.revision_id IN (select revision_id from current_revisions)`), or use a `LEFT JOIN LATERAL` keyed by `projects.id` so the filter applies first. `quote_lines_revision_sort_idx` and `revenue_entries_project_kind_date_idx` already support both. Record an `EXPLAIN` in 04-17's DOM-audit item (f).

**[P3] (confidence 6/10) Queries per list request after 04-17:**
- auto-settle UPDATE transaction, plus log inserts
- 2 `can()` calls for scope, plus 1 `can(write)`
- `listProjectFormReferences` (3 selects; only teams are needed for normalization)
- aggregate + list
- an optional count for `none`
- visibility N+1

It is acceptable at 10–30 users once the N+1 is fixed. Reuse the one `references` call for both the form and normalization (the plan says "재사용" — keep it to one call per request).

**[P3] (confidence 5/10) Period-overlap index.** `end_date >= R.start` can use `projects_end_date_idx` (`db/schema/projects.ts:50`). `coalesce(start_date,end_date) <= R.end` and the null-end OR branch (status, or created_at in KST) are not sargable. At the expected row counts a sequential scan is fine. Add no index now; TODO if `projects` exceeds ~50k rows.

**[P3] (confidence 6/10) Client grid.** With 300 lines, `Table` computes `hasEditableCell` over all rows × columns and `groupRows` with `groups.find` (O(n·g)) on every render (`Table.tsx:95-104`), plus `splitPages`. That is trivial at n = 300. The DOM is cut to 30 rows. Memory is dominated by `lines` state and dirty-storage JSON, which is small. No action.

### Failure modes (new paths)

| Path | Test? | Error handling? | Silent? | Verdict |
|---|---|---|---|---|
| loadProjectList row projection skipped | no (tests hit the old entry) | n/a | yes (payload only) | **critical gap** |
| Grid Ctrl+S double save | no | no guard | duplicate lines show only after reload | **critical gap** |
| Excel paste without computed columns → value dropped | no | counted in a summary only | nearly silent | **critical gap** (decision) |
| Register form second submit after success | E2E may pass by timing | partial | duplicate row | gap |
| Alt+↓ across page / focus index drift | no | no | wrong-row edits | gap |
| Deleting the last page's rows | no | no | empty page | minor gap |
| Period filter invalid | yes | yes (server line) | no | ok |
| Wrong URL params | yes | yes | no | ok |
| DB error on list | Grep only | yes (log + rethrow) | no | ok (add unit) |
| Auto-settle failure | yes (04-11) | yes (fail-open) | logged | ok |
| Description > 40 / archived / no permission | yes | yes | no | ok |

### What already exists (reuse, don't rebuild)
- `projectFilterConditions`: the single row filter shared by list and aggregate (`repositories/projects.ts:86`). The plans reuse it.
- `lineSumsSubquery`/`currentRevisionsSubquery`: reused. See the perf note.
- `project()` + `registerDto` + leak scan (`test/integration/leak-scan.test.ts:117-168`): reused. It needs the all-of extension.
- `ListEmpty` href/onClick union (`ui/list-empty/ListEmpty.tsx:38`): the Pagination union copies the pattern. Good.
- `toTsv` (`ui/table/parse-tsv.ts:80`) exists with zero callers. 04-19 wires it. Good.
- `normalizeNumericPaste` (`parse-tsv.ts:90`): the copy→paste round trip relies on it. Hyphen minus per SYSTEM.md:162. OK.
- `CodeItemLabelInput` pattern (`code-item-form.tsx:70-110`): 04-10 copies it but deliberately does not copy its blur guard (C-13). Good.
- KST in the app layer (`domain/quotes/lines.ts` `toLocaleTimeString(…Asia/Seoul)`): 04-29 centralizes it in `lib/kst-date`. The remaining `getFullYear` uses: `page.tsx:39` is covered by 04-17, `domain/projects/index.ts:255` by 04-11.
- Rebuilt instead of reused: page clamping, three times (04-17 domain, 04-07 via projects list-view, 04-19 ui/table). Consolidate in `lib/paging.ts`.

### 04-03 (on hold): light pass
- **[P2] (confidence 6/10)** The 04-03 truth that the output is "대응 … 새 표(프로젝트·견적 줄)의 컬럼 이름" was written before 04-06 (five statuses, `settled` removed), 04-13 (line kinds / adjustment lines), 04-24 (revisions), 04-26 (300-line cap) and 04-02 (revenue entries). The plan has no old→new status mapping and no rule for legacy projects over 300 lines. Remedy (Fix at resume): add a re-plan step when it resumes — status map, line-kind default, a >300-line report row.
- **[P3] (confidence 7/10)** 29 plans verify "no new packages" as `git diff --stat d6b41cf -- package.json pnpm-lock.yaml` is empty. 04-03 adds `migrate:*` scripts to `package.json`. If it resumes mid-phase, every later plan's T-04-SC check fails for a non-dependency change. Remedy (Fix): compare the `dependencies`/`devDependencies` objects plus the lockfile diff, not raw `package.json`.

### Candidate TODOs
1. Per-request memoization of `visible()` / batch `project()` (if not fixed in 04-17).
2. Current-revision-only line sums (LATERAL) + recorded `EXPLAIN` baseline for `/projects`.
3. ILIKE wildcard escaping for `q` (`repositories/projects.ts:95`: `%${filter.search}%`, where `%` and `_` in user input act as wildcards). Pre-existing; low risk.
4. `lib/shortcut.ts` shared Ctrl-combo predicate (repeat/IME guard) for any future screen.
5. Phone pagination window rule (§7-16) once reserve and list both ship.
6. Consider `next/link` for pagination and sort links: every page or sort change is currently a full document load (`<a>`), which consistently re-runs auto-settle and the whole page. Acceptable now.

## 부록 D — Codex 원문 (outside voice)
```
1. **[P1] Revenue rows escape the project transaction boundary.** 04-22 checks quote ownership, but revenue updates still match only `id + version`. A save targeting project A can modify project B’s invoice—or submit a payment ID through `issuedEntries`—while locking A and logging A. Require project and entry-kind predicates on every revenue update. [Current update](/home/user/ERP_PLANT8_260917/repositories/revenue-entries.ts:91), [planned boundary](/home/user/ERP_PLANT8_260917/.planning/phases/04-project-quote-ledger/04-22-PLAN.md:154).

2. **[P1] Approval does not identify the content being approved.** The request carries a revision ID and date, without an expected content version. PM sees ₩10M; another editor saves ₩12M; PM approves; ₩12M becomes the approved contract. Project locking merely serializes this mistake. Approval also lacks the unsaved-edit guard provided for creating revisions. Bind approval to the reviewed content and reject stale or dirty submissions. [Approval contract](/home/user/ERP_PLANT8_260917/.planning/phases/04-project-quote-ledger/04-14-PLAN.md:212).

3. **[P1] Successful saves can be retried into duplicate money.** New rows have no persisted retry identity. Commit succeeds, response disappears, user retries a new-only batch: another invoice, payment, quote line, or reserve entry is inserted. This is especially concrete because ledger saving performs another fallible read **after commit**. Disabled buttons and row versions do not solve it. Add transactionally persisted mutation identities and test commit-success/response-failure retries. [Post-commit read](/home/user/ERP_PLANT8_260917/domain/projects/ledger.ts:37), [reserve request](/home/user/ERP_PLANT8_260917/.planning/phases/04-project-quote-ledger/04-42-PLAN.md:130).

4. **[P2] Yes—the execution structure is overbuilt.** The 34 plans contain 10,940 lines; 15 touch `quote-table.tsx`. Several splits explicitly serve file-count limits rather than independent outcomes. Worse, downstream plans must stop when defects belong to another plan’s files. This manufactures handoffs inside one inseparable release. Consolidate around complete invariants and workflows, retaining the approved scope and single deployment. [File-count split](/home/user/ERP_PLANT8_260917/.planning/phases/04-project-quote-ledger/04-16-PLAN.md:91), [mandatory stop](/home/user/ERP_PLANT8_260917/.planning/phases/04-project-quote-ledger/04-40-PLAN.md:167).

5. **[P1] The final acceptance gate permits known failures.** 04-31 allows copy/IME failures to become follow-up work because their files are outside its scope, then declares those capabilities verified. This defeats D21’s final recheck. Every required check must pass before release; file ownership cannot waive acceptance. [Contradictory acceptance](/home/user/ERP_PLANT8_260917/.planning/phases/04-project-quote-ledger/04-31-PLAN.md:128).

6. **[P2] The single-release safety assumption is only prose.** 04-41 documents “never deploy intermediate commits,” but adds no deployment enforcement. Staging still supports manually dispatched deployments. The DROP guard excludes demo values, so it cannot establish that an intermediate application was never deployed. Preserve D9, but enforce the permitted release artifact and database baseline rather than relying on a decision-document sentence. [Release assumption](/home/user/ERP_PLANT8_260917/.planning/phases/04-project-quote-ledger/04-41-PLAN.md:201), [deployment workflow](/home/user/ERP_PLANT8_260917/.github/workflows/deploy.yml:22).

7. **[P2] Reserve validation can target a row the client never loaded.** Reducing an early deposit on page 1 can cause a negative balance at a withdrawal on page 3. The server attaches the error to that later row; the UI loads only 50 rows and merely reuses cell-error handling. Specify a visible batch error and navigation that preserves rejected edits. [Whole-ledger validation](/home/user/ERP_PLANT8_260917/.planning/phases/04-project-quote-ledger/04-07-PLAN.md:165), [paged error handling](/home/user/ERP_PLANT8_260917/.planning/phases/04-project-quote-ledger/04-42-PLAN.md:181).

Recommendation: consolidate and revise before execution because the plan’s fragmentation obscures unresolved ownership, approval, retry, and release guarantees.
```

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | ISSUES OPEN (반영 완료) | mode: HOLD_SCOPE, 19 critical gaps |
| Outside Review | codex (`/plan-eng-review` outside voice) | Independent 2nd opinion | 2 | completed | 7 findings (4 P1) — 결정 D9~D12 + 플랜 수정 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN (결정 완료, 플랜 반영 중) | 75 issues, 9 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex · plan-review · completed · 7 findings (승인 내용 식별, 재시도 중복, 매출 행 경계, 04-31 합격 조건, 배포 강제, 리저브 쪽 밖 오류, 과분할).
- **CROSS-MODEL:** 풀 고갈·잠금 안 전역 호출은 Claude 분석 A·B가 함께 지적. Codex의 과분할 지적은 D1과 긴장 → D11에서 구조 유지 + 멈춤 규칙 완화로 해소.
- **VERDICT:** CEO 리뷰 반영 완료. Eng 리뷰는 결정 12건이 확정됐고 플랜 반영 뒤 계획 검사를 거친다 — eng review required(플랜 반영 확인 후 CLEAR). 다음 게이트: `/plan-design-review`.

NO UNRESOLVED DECISIONS
