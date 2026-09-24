---
phase: 04-project-quote-ledger
plan: 04
subsystem: ui
tags: [react, grid-keyboard, clipboard-paste, optimistic-concurrency, drizzle, postgres, playwright]

# Dependency graph
requires:
  - phase: 04-project-quote-ledger
    provides: "04-01(ui/table 트레이서 — 한 칸 편집·일괄 저장 기초, ui/select)·04-02(domain/money·환율·매출 섹션)"
provides:
  - "ui/table 훅 넷(useGridKeyboard·useClipboardPaste·useDirtyStorage) + RowSheet — SYSTEM.md §7-3 (가)~(아) 계약 전체"
  - "domain/quotes/lines.ts 배치 저장의 셀 단위 버전 충돌 감지 + 전부 거부(트랜잭션)"
  - "요청 본문 크기 한도(lib/actions/payload-size.ts, 256KB, authedActionClient 미들웨어 한 자리)"
  - "실제 Windows Excel 인용 규칙을 아는 parseTsv 상태 기계(사람 확인으로 검증)"
affects: [05-expense-vouchers, 07-admin-forms-migration]

# Actuals (#2632)
actuals:
  tokens: 34171
  tasks: 3
  commits: 10
  plan_head_before: 5317775
  note: "commits=10은 이 플랜(04-04) 소유 커밋만 센 것 — 53f7d01·f8a7d45·cb3c658·63f040b·2c25a6c·5a8ca41·302eb84·2d01155·eba9223·0af4a8b. `git rev-list --count 5317775..HEAD`는 15를 반환하지만 그중 5개(a2474d1·af742ec 등)는 다른 세션이 같은 브랜치(비-worktree)에 동시에 커밋한 04-UI-SPEC.md 디자인 리뷰 작업 — 이 플랜의 산출물이 아니다."

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "인용 규칙을 아는 클립보드 TSV 상태 기계 파서 — 여는 따옴표만으로 인용 모드에 들어가지 않고, 닫는 따옴표 바로 다음이 탭·줄바꿈·텍스트 끝일 때만 인용된 칸으로 인정한다(실제 Excel 관찰)"
    - "배치 저장: 트랜잭션 안에서 판정→비교→쓰기, 충돌·오류가 하나라도 있으면 쓰기를 아예 실행하지 않는다(부분 저장 경로 없음)"
    - "그리드 훅은 opt-in(enableGridKeyboard 기본 false)으로 붙여 이 플랜이 건드리지 않는 기존 Table 소비자의 회귀를 막는다"

key-files:
  created:
    - ui/table/use-grid-keyboard.ts
    - ui/table/use-clipboard-paste.ts
    - ui/table/use-dirty-storage.ts
    - ui/table/RowSheet.tsx
    - lib/actions/payload-size.ts
    - test/unit/ui/dirty-storage.test.ts
    - test/integration/quote-lines-conflict.test.ts
  modified:
    - ui/table/parse-tsv.ts
    - ui/table/Table.tsx
    - domain/quotes/lines.ts
    - repositories/quote-lines.ts
    - app/(app)/projects/[id]/quote-table.tsx
    - lib/actions/client.ts
    - test/unit/ui/parse-tsv.test.ts
    - test/e2e/quote-table.spec.ts
    - test/e2e/project-register.spec.ts
    - .planning/phases/04-project-quote-ledger/04-OPEN-ITEMS.md
    - .planning/phases/04-project-quote-ledger/04-UI-SPEC.md (Task 2 ⑤⑧만 — 본문 문구 0줄, U-6 Copywriting 추가 + 요약 숫자 정정)

key-decisions:
  - "A-M3는 (ㄱ)로 매듭 — 이미 별도 커밋(7cd3b13 등)이 관리자 표 6종 캡션을 완료해 04-04는 admin/ 파일 diff 0줄로 확인만 함"
  - "U-6 문구: 표 밖 칸 오류로 전부 거부될 때 오류 0칸인 표에는 「전부 거부 · 다른 칸 오류 N칸」을 쓴다(오류 0으로 적지 않는다)"
  - "요청 본문 한도는 lib/actions/client.ts의 authedActionClient 미들웨어 한 자리(checkPayloadSize, 256KB=262144바이트)에만 둔다 — next.config.ts 서버 액션 본문 한도는 쓰지 않는다(어느 쪽이 먼저 걸리는지 모호해지는 것을 피함)"
  - "실제 Windows Excel(2026-09-23 캡처) clipboard 원문 확인 결과 — Excel은 줄바꿈이 있는 칸만 큰따옴표로 감싸고, 따옴표만 있는 칸은 감싸지 않는다. parseTsv를 이 규칙에 맞춰 고쳤다(사람 재확인은 실제 원문 재생으로 대체 — 아래 참고)"

patterns-established:
  - "클립보드 파서: '여는 따옴표 발견 → 곧장 인용 모드' 대신 '닫는 따옴표 뒤 문맥을 먼저 내다보고 유효성 판정' — 향후 다른 TSV/CSV 소비 지점에서도 이 판정 순서를 따른다"

requirements-completed: [UX-04, UX-05, PROJ-02]

coverage:
  - id: D1
    description: "표 전체가 탭 정지 하나, 방향키로 셀 이동, Esc(값 되돌리기/범위 해제), Delete(줄 삭제 모달), 줄 이동·새 줄·줄 복제 단축키 — 키보드만으로 입력·저장까지 도달한다"
    requirement: "UX-05"
    verification:
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#(a) 마우스 클릭 없이 키보드만으로 줄 하나를 끝까지 입력하고 저장한다"
        status: pass
    human_judgment: false
  - id: D2
    description: "클립보드 여러 칸 붙여넣기가 활성 셀부터 오른쪽·아래로 채워지고, 인용된 칸의 줄바꿈이 한 칸으로 들어간다"
    requirement: "UX-04"
    verification:
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#(b) 클립보드 여러 칸 붙여넣기가 활성 셀부터 오른쪽·아래로 채운다"
        status: pass
      - kind: unit
        ref: "test/unit/ui/parse-tsv.test.ts#parseTsv (16 cases incl. 실제 Excel 원문 회귀)"
        status: pass
    human_judgment: false
  - id: D3
    description: "숫자 아닌 값·읽기전용 셀에 떨어진 값이 오류 셀로 고정되고, 오류가 하나라도 있으면 저장이 전부 거부되며 다른 셀 편집값은 남는다(부분 저장 없음)"
    requirement: "UX-04"
    verification:
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#(c)(d)(e) 숫자 아닌 값을 숫자 열에 붙여넣으면 오류로 고정되고 저장이 전부 거부되며, 다른 셀 편집값은 남는다"
        status: pass
    human_judgment: false
  - id: D4
    description: "배치 저장이 트랜잭션 안에서 버전 비교→실제로 값이 달라진 셀만 충돌로 판정→충돌·오류가 하나라도 있으면 쓰기 0건, 거부 뒤 DB 재조회로 무변경 확인, 거부 시 행동 로그 0행"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "test/integration/quote-lines-conflict.test.ts (6 cases: 동시 저장 성공·부분 버전 충돌 시 전부 거부+DB 재조회 무변경·값 동일 셀 비충돌·형식 오류 전부 거부·본문 한도 초과 거부·행동 로그 성공1/거부0)"
        status: pass
    human_judgment: false
  - id: D5
    description: "폰에서 줄을 탭하면 보기 전용 시트가 열리고 행동 줄이 없다 — 시트를 열 때 새 요청이 나가지 않는다"
    requirement: "UX-05"
    verification:
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#(f) 폰 뷰포트에서 줄을 탭하면 행 시트가 열리고 행동 줄이 없다"
        status: pass
    human_judgment: false
  - id: D6
    description: "실제 Windows Excel에서 복사한 clipboard 원문(따옴표만 있는 칸·줄바꿈 있는 칸·쉼표/통화기호 섞인 금액 포함)이 parseTsv를 거쳐 화면에 원본과 같게 들어가고, 저장 후 새로고침해도 같다"
    verification:
      - kind: unit
        ref: "test/unit/ui/parse-tsv.test.ts#실제 엑셀(Windows, 2026-09-23 캡처) 원문"
        status: pass
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#(g) 실제 엑셀(Windows, 2026-09-23 캡처) 인코딩을 붙여넣고 저장·새로고침해도 원본이 보존된다"
        status: pass
    human_judgment: false
    rationale: "사용자 결정(2026-09-23)으로 사람 재확인이 실제 엑셀 원문 재생(단위·E2E)으로 대체됨 — 아래 '사람 확인' 절 참고. verification은 pass이지만 대체 경위를 감사 흔적으로 남기기 위해 human_judgment 서술을 유지한다."

# Metrics
duration: 계획 전체(Task 1~3, 여러 세션에 걸침) — 이 SUMMARY는 Task 3(RED→GREEN→E2E) 세션만 측정 가능, 약 35min
completed: 2026-09-23
status: complete
---

# Phase 4 Plan 4: 견적 줄 표 — 키보드·붙여넣기·전부 거부·미저장 복원·폰 시트 Summary

**04-01이 깐 `ui/table` 트레이서를 SYSTEM.md §7-3 계약 전체로 확장 — 로빙 탭인덱스 키보드 그리드, 인용 규칙을 아는 클립보드 TSV 파서, 셀 단위 버전 충돌+전부 거부 배치 저장, 미저장 편집의 브라우저 임시 보관, 폰 행 시트를 붙였고, 실제 Windows Excel 원문 재생으로 붙여넣기 정확성을 증명했다.**

## Performance

- **Tasks:** 3/3 완료 (Task 1 그리드 계약, Task 2 배치 저장 충돌, Task 3 사람 확인+E2E)
- **Files modified:** 21 (코드) + `.planning/phases/04-project-quote-ledger/` 문서 2

## Accomplishments

- `ui/table`에 `useGridKeyboard`(로빙 탭인덱스·방향키·Esc·Delete·줄 이동·새 줄·줄 복제) · `useClipboardPaste`(활성 셀부터 채우기·숫자 정규화·목록 대조·오류 셀 고정·아래 넘침 자동 새 줄·오른쪽 넘침 경고) · `useDirtyStorage`(프로젝트+차수 키의 브라우저 임시 보관·이탈 경고·복원/버림) 세 훅과 `RowSheet`(폰 보기 전용 시트, 행동 줄 없음)을 추가했다
- `parseTsv`를 실제 엑셀 인용 규칙(줄바꿈이 있는 칸만 인용, 따옴표만 있는 칸은 원문 그대로)에 맞춘 상태 기계로 재작성 — 처음 구현은 따옴표만 있는 칸도 인용된 칸으로 오인해 따옴표를 지웠다(Task 3에서 실제 Excel 원문 확인으로 발견·수정)
- `domain/quotes/lines.ts` 배치 저장이 한 트랜잭션 안에서 판정→버전 비교(실제로 값이 달라진 셀만 충돌)→형식 오류 수집→충돌·오류가 하나라도 있으면 쓰기 0건, 없으면 전부 쓰기+행동 로그 1행을 수행한다
- 요청 본문 크기 한도(256KB)를 `lib/actions/client.ts`의 `authedActionClient` 미들웨어 한 자리에 뒀다(`lib/actions/payload-size.ts`의 `checkPayloadSize`) — `next.config.ts` 서버 액션 한도는 쓰지 않는다
- A-M3(관리자 표 6종 캡션, Phase 3 이월)를 (ㄱ)로 매듭지었다 — 이미 다른 커밋이 구현을 완료한 것을 확인만 함(admin/ diff 0줄)
- U-6(표 밖 칸 오류로 전부 거부될 때 오류 0칸 표의 문구)을 `전부 거부 · 다른 칸 오류 N칸`으로 Copywriting Contract에 추가
- E2E 7건(a~g)이 키보드 전용 입력·저장, 붙여넣기, 오류 고정+전부 거부+편집값 보존, 폰 시트, 실제 엑셀 인코딩 재생을 증명

## Task Commits

이 플랜은 세 태스크에 걸쳐 커밋됐다(Task 1·2는 이전 세션, Task 3는 이번 세션):

**Task 1: 표의 키보드 계약 · 범위 선택 · 붙여넣기 · 미저장 복원 · 폰 행 시트**
1. `53f7d01` test(04-04): add failing tests for parse-tsv and dirty-storage (RED)
2. `f8a7d45` feat(04-04): quote table keyboard grid, clipboard paste, dirty storage, phone row sheet (GREEN)

**Task 2: 배치 저장의 버전 충돌과 전부 거부 + 본문 한도 + A-M3 매듭 + 요약 숫자 정정**
3. `cb3c658` feat(04-04): batch quote-line conflict detection, cell-level diff, body size limit
4. `63f040b` feat(04-04): wire keyboard grid, paste, dirty restore, row sheet into quote table
5. `2c25a6c` fix(04-04): update E2E for click-to-edit grid + close U-4/U-5/U-6/A-M3 + correct summary counts
6. `5a8ca41` test(04-04): E2E for keyboard-only entry, paste, full-rejection + fix stale KRW display
7. `302eb84` docs(04-04): record full-suite E2E flakiness and scope-boundary stubs

**Task 3: 실제 엑셀에서 복사한 값이 그대로 들어가는지 사람 확인 + E2E 증명 (이번 세션)**
8. `2d01155` test(04-04): real Excel clipboard fixture (RED)
9. `eba9223` fix(04-04): parseTsv keeps unquoted leading-quote cells, normalizes CRLF in quoted cells (GREEN)
10. `0af4a8b` test(04-04): E2E paste→save→reload with real Excel encoding

_Task 1·2는 TDD RED→GREEN이 각 태스크 안에서 여러 커밋에 걸쳐 있다(그리드 배선과 저장 로직을 나눠 커밋)._

## 사람 확인(Task 3) — 결과와 처리

**사용자 승인(2026-09-23):** 수정 후 사람 재확인을 실제 엑셀 원문 재생(단위·E2E)으로 대체함. 아래는 이 대체를 적용한 최종 처리 기록이다.

사용자가 실제 Windows Excel(2026-09-23 캡처)에서 3×3 영역을 복사한 clipboard `text/plain` 원문(헤더 행 + 번호 열 포함, 따옴표만 있는 칸 1개 · 줄바꿈 있는 칸 1개 · 쉼표/통화기호 섞인 금액 3개 포함)을 제공했다. 오리지널 → 화면 대조 결과:

| # | 항목 | 원본 | 최초 구현(수정 전) | 어긋남 |
|---|---|---|---|---|
| 1 | 항목1 형태 | `무대 설치` (트레일링 줄바꿈 없음) | `무대 설치` | 같다 |
| 2 | (해당 없음 — 항목 순서 유지, 별도 확인 없음) | — | — | — |
| 3-a | 따옴표만 있는 칸 | `"대형" 현수막` | `대형 현수막`(따옴표 지워짐) | **어긋남** — 파서가 따옴표만 있고 줄바꿈 없는 칸도 인용된 칸으로 오인 |
| 3-b | 줄바꿈 있는 칸 | `비고 첫 줄`⏎`둘째 줄` (Excel은 셀 안에 CRLF로 씀) | `비고 첫 줄\r\n둘째 줄`(CRLF가 값에 남음) | **어긋남** — 인용된 칸 내부 CRLF가 정규화되지 않음 |
| 5 | 쉼표/통화기호 섞인 금액 | `1,200,000` / `35,000` / `₩450,000` | 1200000 / 35000 / 450000로 정확히 파싱 | 같다 |

**Claude가 고친 것:** `ui/table/parse-tsv.ts` — 필드가 `"`로 시작하기만 하면 곧장 인용 모드로 들어가던 것을, **닫는 따옴표 바로 다음이 탭·줄바꿈·텍스트 끝일 때만** 유효한 인용된 칸으로 인정하도록(`tryParseQuotedField`의 전방 탐색) 고쳤다. 아니면 따옴표를 리터럴로 남긴다. 인용된 칸 내부의 CRLF도 LF 하나로 정규화한다.

**재확인 방법(사용자 승인으로 대체):**
1. **단위(정확히 캡처된 바이트 재생)** — `test/unit/ui/parse-tsv.test.ts`에 사용자가 준 원문 그대로를 상수로 고정하고 파싱 결과를 단언(`실제 엑셀(Windows, 2026-09-23 캡처) 원문` 케이스). 통과.
2. **E2E(파생 3×3을 실제 붙여넣기→저장→새로고침 경로로 재생)** — `test/e2e/quote-table.spec.ts`의 `(g)` 케이스. 그리드의 실제 열 순서(소분류·항목·거래처·수량·단가)상 텍스트 열(항목)과 숫자 열 둘(수량·단가)이 인접하지 않아(거래처 select가 사이에 있다) 두 번에 나눠 실제 열에만 주입했다: 항목 열에 3행(따옴표만 있는 칸·줄바꿈 있는 칸 포함), 수량+단가 2열에 금액 3행. 저장 후 새로고침까지 원본과 같음을 단언. 통과.

이로써 항목 3-a·3-b가 재확인 후 「같다」로 닫혔고, 나머지(1·5)는 최초부터 「같다」였다. 다섯 항목 전부 어긋남 없음으로 종결.

## Files Created/Modified

**Task 1(그리드 계약):**
- `ui/table/use-grid-keyboard.ts` - 로빙 탭인덱스·방향키·Esc·Delete·줄 이동·새 줄·줄 복제, 그룹 머리글 건너뛰기
- `ui/table/use-clipboard-paste.ts` - `applyPaste` — 활성 셀부터 채우기, 숫자/목록 정규화 실패·읽기전용 셀은 오류 셀 고정, 아래/오른쪽 넘침 처리
- `ui/table/use-dirty-storage.ts` - 미저장 편집 임시 보관(프로젝트+차수 키), 이탈 경고, 복원/버림
- `ui/table/RowSheet.tsx`, `RowSheet.module.css` - 폰 보기 전용 시트(행동 줄 없음)
- `ui/table/parse-tsv.ts` - 클립보드 TSV 상태 기계 파서(Task 3에서 실제 Excel 규칙으로 재수정)
- `ui/table/Table.tsx`, `Table.module.css`, `types.ts` - 위 훅 opt-in 배선, 오류·충돌 셀 렌더, 힌트 줄

**Task 2(배치 저장 충돌):**
- `domain/quotes/lines.ts` - 배치 저장: 트랜잭션 내 판정→버전 비교(셀 단위)→오류 수집→전부 쓰기 또는 전부 거부
- `repositories/quote-lines.ts` - 배치 잠금 읽기 + 버전 올리며 갱신
- `lib/actions/payload-size.ts` - `checkPayloadSize`(256KB) 순수 판정 로직
- `lib/actions/client.ts` - `authedActionClient` 미들웨어에서 `checkPayloadSize` 호출(한도를 두는 유일한 자리)
- `app/(app)/projects/[id]/quote-table.tsx`, `project-detail.module.css`, `app/(app)/projects/actions.ts` - 화면 배선, baseline 스냅샷 전송
- `test/integration/quote-lines-conflict.test.ts` - 배치 충돌 6경우

**Task 3(사람 확인 + E2E, 이번 세션):**
- `ui/table/parse-tsv.ts` - `tryParseQuotedField` 전방 탐색으로 인용 판정 수정, CRLF 정규화
- `test/unit/ui/parse-tsv.test.ts` - 실제 Excel 원문 회귀 + 3개 경계 케이스 추가(16건)
- `test/e2e/quote-table.spec.ts` - `(g)` 실제 엑셀 인코딩 붙여넣기→저장→새로고침 케이스 추가

## Decisions Made

- A-M3 (ㄱ) 채택 — 관리자 표 6종 캡션은 이미 완료돼 있어 확인만 하고 코드 변경 0줄
- U-6 문구를 `전부 거부 · 다른 칸 오류 N칸`으로 정함(오류 0을 「오류 0칸」으로 적지 않는다)
- 요청 본문 한도는 `lib/actions/client.ts` 미들웨어 한 자리에만(next.config.ts 자리는 안 씀)
- 실제 Excel 인용 규칙: 줄바꿈이 있는 칸만 인용, 따옴표만 있는 칸은 원문 그대로 — 이 확인이 04-RESEARCH.md 가정 A3(미확인)를 대체함
- 사람 재확인을 실제 원문 재생(단위·E2E)으로 대체(사용자 승인, 2026-09-23) — 위 "사람 확인" 절 참고

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] parseTsv가 따옴표만 있는 칸의 따옴표를 지우고 CRLF를 정규화하지 않음**
- **Found during:** Task 3 사람 확인(실제 Excel 원문 대조)
- **Issue:** 필드가 `"`로 시작하기만 하면 곧장 인용 모드로 들어가 `"대형" 현수막` 같은 칸의 따옴표를 지웠고, 인용된 칸 내부 CRLF가 값에 남았다
- **Fix:** 닫는 따옴표 바로 다음이 탭·줄바꿈·텍스트 끝일 때만 인용된 칸으로 인정하는 전방 탐색(`tryParseQuotedField`) 추가, CRLF→LF 정규화
- **Files modified:** `ui/table/parse-tsv.ts`, `test/unit/ui/parse-tsv.test.ts`
- **Verification:** 단위 16건 전부 통과(실제 원문 회귀 포함), `pnpm test` 세 계층 전부 통과
- **Committed in:** `2d01155`(RED) → `eba9223`(GREEN)

**2. [Rule 1 - Bug, Task 3 발견] E2E 행 인덱스가 폰 전용 접힌 요약 행을 세지 않아 3행 이상 붙여넣기 시나리오에서 잘못된 셀을 가리킴**
- **Found during:** Task 3 E2E 작성 중(`(g)` 케이스 최초 실행이 30초/60초 타임아웃)
- **Issue:** 각 데이터 행 뒤에 폰 전용 접힌 요약 행이 데스크톱에서도 DOM에 숨어(display:none) 있어 `tbody tr`가 데이터 행과 번갈아 나온다 — 기존 테스트(a)~(f)는 항상 1개 데이터 행만 다뤄 드러나지 않았던 인덱싱 버그
- **Fix:** `gridcell` 헬퍼의 행 인덱스를 `1 + rowIndex * 2`로 수정(짝수 오프셋)
- **Files modified:** `test/e2e/quote-table.spec.ts`(테스트 코드만 — 프로덕션 코드 버그 아님)
- **Verification:** `(g)` 케이스 및 전체 quote-table.spec.ts 통과
- **Committed in:** `0af4a8b`

---

**Total deviations:** 2 auto-fixed (Rule 1 버그 수정 둘 — 하나는 프로덕션 파서, 하나는 테스트 헬퍼)
**Impact on plan:** 둘 다 Task 3의 목적(실제 엑셀 붙여넣기 정확성 증명)을 달성하는 데 직접 필요했다. 스코프 확장 없음.

## Issues Encountered

- `pnpm test`(전체) 실행 중 반복 관찰된 기존 인프라 문제(`[WebServer] ⨯ Error: The destination stream closed early.`, 전체 스위트 동시 실행 시 무관 스펙의 간헐적 실패)가 이번에도 로그에 나타났으나, 이번 실행에서는 **실제로 실패한 스펙 없이** 전부 통과했다(아래 검증 결과). 04-01·04-04(Task 2) `deferred-items.md`에 이미 기록된 것과 같은 계열 — 이 플랜 범위 밖(재확인만, 추가 기록 없음)
- Task 3 실행 중 다른 세션이 같은 브랜치(비-worktree)에서 동시에 `04-UI-SPEC.md`를 디자인 리뷰 목적으로 커밋(`a2474d1`·`af742ec`) — 지시에 따라 이 파일을 읽거나 스테이징하지 않았다. `.planning/phases/04-project-quote-ledger/.continue-here.md`·`.planning/HANDOFF.json`도 페이즈 일시정지 핸드오프 소유물이라 손대지 않았다

## User Setup Required

None - 외부 서비스 설정 불필요.

## Verification Results

- `pnpm lint && pnpm typecheck && pnpm build` 계열: lint·typecheck 통과(이 세션에서 재확인). `docs/design/tokens.css`·`package.json`·`pnpm-lock.yaml` diff 없음(새 의존성 0)
- `pnpm vitest run --project unit`: **740 passed**
- `pnpm vitest run --project integration`: **1013 passed**(`quote-lines-conflict.test.ts` 포함)
- `CI=true pnpm playwright test test/e2e/quote-table.spec.ts test/e2e/project-register.spec.ts test/e2e/revenue-section.spec.ts`: **8 passed**
- `CI=true pnpm test`(세 계층 순차): **exit 0**, E2E 전체 **162 passed**(2.5m) — unit·integration은 위 수치로 선행 통과했어야 e2e 단계에 도달하므로(& & 체인) 셋 다 초록
- `03-OPEN-ITEMS.md` diff: 없음(확인함)
- `04-OPEN-ITEMS.md`의 A-M3·U-6 두 행: 매듭지어짐(위 Decisions 참고)

## Next Phase Readiness

- 견적 줄 표가 키보드·붙여넣기·전부 거부·미저장 복원·폰 시트까지 완결돼 ROADMAP 기준 2를 만족한다
- `04-UI-SPEC.md` unresolved 항목은 U-1·U-2·U-3만 남고(U-4~U-6은 이 플랜에서 닫힘) 이후 계획 단계에서 처리
- Post-build 게이트(`/review` → `/qa` → `/cso`(인증·외부 입력 다뤘으므로 필수) → `/ship`)가 아직 실행되지 않았다 — CLAUDE.md 워크플로상 이 플랜의 페이즈 마무리 전 필수

## Self-Check: PASSED

모든 created/modified 파일 존재 확인(11개 대표 파일), 모든 커밋 해시 10개 `git log --oneline --all`에서 확인됨. 누락 없음.

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-23*
