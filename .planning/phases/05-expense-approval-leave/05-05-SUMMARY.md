---
phase: 05-expense-approval-leave
plan: 05
subsystem: ui
tags: [expenses, evidence-upload, phone-sheet, approval-sheet, e2e, design-gate]

requires:
  - phase: 05-02
    provides: 상태 낱말 · SYSTEM 개정(결재 시트 상세 계약)
  - phase: 05-03
    provides: expenseLineDoor · createExpenseFromLines · submitExpense 도메인
  - phase: 05-04
    provides: 증빙 업로드 의도 · 완료 통보 · 로컬 서명 저장소
provides:
  - 견적 줄 `지출결의 올리기` → 폼(자동 채움) → 사진 한 장 → 제출 → 문서 화면 → 팀장 폰 결재 시트 → 대표까지 실제 화면 트레이서(CI=true E2E 녹색)
  - /expenses/[id] 폼(S3) · 문서(S7) · 로딩 · 오류 · 서버 액션 일곱 · ui/attachments
  - 견적 줄 표 행 행동 열 · 폰 행 시트 3차 하나(U2) · 폰 고정 제출 줄 순서
affects: [05-06, 05-07, 05-08, 05-09, 05-15]

plan_head_before: 1ec676ab9f5c43e9ba45ac43d5751eb8904b2ceb
visual_baseline_expected: [dev-components, project-detail]

actuals:
  tokens: 41164
  tasks: 2
  commits: 9

tech-stack:
  added: []
  patterns:
    - "열 머리글을 스크린리더용으로만 남기는 TableColumn.headerHidden"
    - "RowSheet 기존 action 자리에 호출부가 만든 ReactNode(실패 한 줄 + 3차 하나)"
    - "폰 제출 줄 = CSS order(수화 전) + usePhoneWidth DOM 순서(수화 뒤)"

key-files:
  created:
    - app/(app)/expenses/[id]/{layout,page,loading,error,expense-form,expense-document,evidence-attachments}.tsx
    - app/(app)/expenses/{actions.ts,actions.registry.ts,status-display.ts}
    - ui/attachments/{Attachments.tsx,Attachments.module.css,prepare-file.ts}
    - test/e2e/{expense-submit-mobile-approval,mobile-expense-form}.spec.ts
    - test/e2e/{expense-fixture.ts,assets/receipt-3000x2000.jpg}
    - docs/design/checks/2026-10-04-05-05-expense-screens.md
  modified:
    - app/(app)/projects/[id]/{quote-table.tsx,page.tsx,project-detail.module.css}
    - domain/expenses/{index.ts,dto.ts,tax.ts,detail.ts} · repositories/expenses.ts
    - ui/table/{Table.tsx,types.ts} · ui/row-actions/RowActions.tsx · ui/status-tag/status-map.ts
    - test/e2e/{screen-routes,leave-org,a11y.spec,quote-table.spec,excel-paste-final.spec}.ts · playwright.config.ts

key-decisions:
  - "행 행동 열은 Table에 선택 속성 headerHidden만 더해 쓴다(새 컴포넌트 없음)"
  - "거래처 없음 판정은 서버 expenseLineDoor의 line.vendorId 유무 — 화면은 vendorName을 읽지 않는다"
  - "폰 시트 만들기 실패는 호출부 상태(doorFailedLine) 한 줄 + 살아 있는 3차(두 번째 버튼 없음)"

requirements-completed: [EXP-02, UX-03, EVID-01, EXP-01]

coverage:
  - id: D1
    description: "견적 줄 지출결의 올리기 → 폼 자동 채움 → 사진 한 장 → 제출 → 팀장 폰 시트 승인 → 본부장 · 경영 · 대표 승인(ROADMAP 05 기준 3)"
    requirement: EXP-02
    verification:
      - kind: e2e
        ref: "test/e2e/expense-submit-mobile-approval.spec.ts#PM이 견적 줄에서 폼을 열어 사진 한 장을 붙여 제출하고 …"
        status: pass
    human_judgment: false
  - id: D2
    description: "올리는 중 제출 막기 · beforeunload · 첫 PUT 실패 → 다시 올리기"
    requirement: EVID-01
    verification:
      - kind: e2e
        ref: "test/e2e/expense-submit-mobile-approval.spec.ts#올리는 중 제출 · 다시 올리기"
        status: pass
    human_judgment: false
  - id: D3
    description: "폰 행 시트 3차 하나 · 폼 고정 제출 줄 순서 · 사진 축소(JPEG 긴 변 2000 이하) · 375×667/320×568 DOM 감사"
    requirement: UX-03
    verification:
      - kind: e2e
        ref: "test/e2e/mobile-expense-form.spec.ts (10건)"
        status: pass
    human_judgment: false
  - id: D4
    description: "U2(시트 문서 행동 3차 자리) 최종 판정 — 사용자 확정 2026-10-04 이후 스크롤 전 보임 실측만 남김"
    verification: []
    human_judgment: true
    rationale: "결정은 사용자 몫(UI-SPEC Assumptions #20). 실측은 아래 U2 표"

duration: 79min
completed: 2026-10-04
status: complete
---

# Phase 05 Plan 05: 지출결의 화면 트레이서 Summary

**견적 줄 `지출결의 올리기` → 자동 채운 폼 → 브라우저 축소(2000px JPEG · SHA-256) 사진 한 장 → 제출 → 문서 화면 → 팀장 폰 결재 시트 승인 → 대표 최종 승인이 `CI=true` E2E로 서는 화면 트레이서, 이어 폰 행 시트 3차 하나(U2)와 폰 고정 제출 줄.**

## Performance

- **Duration:** 79min (2026-10-04T10:44Z ~ 12:03Z) · **Tasks:** 2 · **Commits:** 9(측정, 아래) · **Files:** 45(+3,289/-19)

## Accomplishments

- 서버: 결재 시트 상세(`loadDetails` · `detailDto` · `buildDetailRows` — 금액은 `expense.amount`/`approval.value` 투영 뒤에만), `taxLineText`(05-06에서 당겨옴 · 같은 시그니처), `listLineDoors`, 폼 사실(`defaultEvidenceName` · `executionLines` · 분할 안내), 액션 일곱(`registerAction` 7 + 증빙 보기 1).
- 화면: `/expenses/[id]` 폼 · 문서(`DocumentActions` 재사용) · 로딩 · 오류 · 404 사전 검사(layout), `ui/attachments`(실패 · 다시 올리기 · `aria-live` · 진행률 없음), 견적 줄 표 맨 오른쪽 행동 열, 폰 시트 `action` 자리.
- 검증: lint · typecheck · lint:sql · build 통과, 단위 3파일 86건, 통합 3파일 2,507건, Task 1 E2E 5개 묶음(데스크톱 162 통과), Task 2 E2E(mobile-375 50 통과), `mark-legacy --audit` 위반 0.

## Task Commits

1. **Task 1 (tracer)** — RED `7cc01b1f` → GREEN `6a486369`(선행 서버 `09cc7632` · `9d0b14c6` · `190ca6d6` · `6ef3bcef` · `a2f6815c`)
2. **Task 2 (폰, tdd)** — RED `24650943` → GREEN `671d0119`

`commits: 9`는 `git rev-list --count 1ec676ab..HEAD`(SUMMARY 작성 시점)로 측정했다.

## 기록 항목(요청 사항)

- **테스트 이미지 생성**: `test/e2e/assets/receipt-3000x2000.jpg`는 Playwright Chromium의 `<canvas>` 3000×2000(그라디언트 + 글자)을 `toBlob("image/jpeg", 0.8)`로 만든 153KB 파일(트레이서 전용). 증빙 중복 검사가 해시 전역이라 나머지 스펙은 `uniqueReceipt(page)`(`test/e2e/expense-fixture.ts` — 호출마다 글자가 다른 같은 크기 캔버스 JPEG)를 쓴다.
- **Attachments 실패 문구 출처**: `ui/`는 `domain/`을 import할 수 없어 `app/(app)/expenses/[id]/evidence-attachments.tsx`가 `EVIDENCE_UPLOAD_FAILED`(`domain/evidence/upload-checks.ts`)를 `uploadFailedText` prop으로 넘긴다. 완료 통보 거부는 서버 `{failed, message, retry}`의 `message`를 그대로 쓴다. `ui/attachments`에 새 실패 문구는 없다.
- **거래처 없음 판정 자리**: 서버 `domain/expenses/line-door.ts`의 `expenseLineDoor`(`!line.vendorId` → `no_vendor`), 입력은 `domain/expenses/index.ts`의 `doorFor`(`vendorId: line.vendorId` — 줄의 vendorId이며 `vendorName`이 아니다). `listLineDoors`는 상태만 내려보내고 화면(`quote-table.tsx`)은 `vendorName`을 읽지 않는다.
- **`taxLineText`**: 05-06에서 당겨와 같은 시그니처로 `domain/expenses/tax.ts`에 두었고 문서 DTO(`taxLine` · `expense.amount`)로만 화면에 나간다.
- **다룬 경로 · 화면 · 상태**: `/expenses/[id]`(폼 작성 중 · 올리는 중 · 제출 실패 · 문서 결재 중/승인 · 로딩 · 오류 · 404) · `/projects/[id]`(행 행동 열: 열림 · 닫힘 · 빈 셀 / 폰 시트: 열림 · 열기 링크 · 거래처 없음 글자 · 표 게이트 글자 · 자리째 없음 · 만들기 실패 한 줄) · `/approvals`(폰 결재 시트 상세 · 문서 링크) · `screen-routes.ts`의 `expense-doc` 행(작성 중 문서 기준).

### U2 — 시트 3차 자리 「스크롤 전 3차 보임」(2 크기 × 2 줄, `test.info().annotations`)

| 크기 | 일반 줄 | 최악 줄(두 줄 항목명 · 두 줄 비고 · 실패 줄) |
|------|---------|----------------------------------------------|
| 375×667 | 보임(true) | 보임(true) |
| 320×568 | 보임(true) | 안 보임(false — 스크롤 뒤 높이 ≥ `--touch-min` · 가로 넘침 0은 단언 통과) |

**U2 재검토 신호: 없음**(일반 줄이 두 크기 모두 참). 최악 줄 320×568만 스크롤이 필요하다 — 참고용으로 코디네이터에 전달.

## Deviations from Plan

1. **[Rule 2 - 접근성]** `ui/row-actions/RowActions`에 선택 prop `describedBy`(버튼형 — 실패 파일 행의 이름을 `aria-describedby`로 잇기). 기존 호출부 영향 없음. 커밋 `6a486369`.
2. **[Rule 3 - 블로킹]** 숨긴 머리글 열 API가 없어 `TableColumn.headerHidden?`(+ `Table.tsx` 렌더 3줄)을 더했다. 기본값은 기존 동작. 커밋 `6a486369`.
3. **[Rule 1 - E2E 가정]** RED 스펙이 팀장 → 대표 두 단계로 가정했으나 결재선은 넷(팀장 → 본부장 → 경영 → 대표)이라 대표가 문서를 보지 못했다(404). 픽스처가 `divisionHead` · `mgmt`를 돌려주고 스펙이 둘도 문서 화면에서 승인한다.
4. **[Rule 1 - E2E 격리]** 증빙 중복 검사가 파일 해시 전역이라 같은 그림을 두 번 올리면 `이미 첨부된 파일`로 거부된다 → 트레이서만 고정 그림, 나머지는 `uniqueReceipt`.
5. **[기존 스펙 조정]** `a11y.spec.ts` 화면 표 개수 37→38, 붙여넣기 요약 `계산 열 180칸`→`225칸`(행 행동 열이 계산 열로 세어짐: `quote-table.spec.ts` · `excel-paste-final.spec.ts`). 올리는 중 스펙의 PUT 대기 기준 · 20초 대기 상수 추가.
6. **[범위 이동]** `taxLineText` 05-06에서 당김 · 폼 제출 성공 뒤 문서 화면 이동 시 인라인 일시 문구(`결재 요청됨 → …`)는 문서 화면 토스트(`?submitted=1`)가 맡는다 · `leak-scan` import 한 줄 · `screen-routes`의 `expense-doc`은 증빙 파일 없이 만들 수 있는 작성 중 문서를 잰다(제출 문서는 E2E 스펙이 증명) · `createFixtures`의 기안자가 `setupExpenseE2E`의 PM으로 바뀜(연차 문서도 같은 사람이 신청).
7. **[플랜이 뒤로 넘긴 것 — 변경 없음]** 막힘 이유 ①~⑨ 표시 · 즉시 재계산 · 첫 포커스(05-06) · 무효 증빙 표시(05-09) · 폰 머리 줄 오른쪽 버튼(05-09의 `지출결의 삭제` 자리 — 지금은 그 버튼이 없어 숨길 대상 없음) · 표 전체 게이트/거래처 없음 PC 셀(05-15).

**Total deviations:** 6 자동 처리(Rule 1 ×2, Rule 2 ×1, Rule 3 ×1, 조정 2) · 요구된 「남은 실행가 … 넘음」 검사는 그대로 구현(코디네이터 결정).

## Issues Encountered

- 첫 E2E 실패 셋 — 원인은 결재선 4단(대표 404) · PUT 대기 전에 센 액션 POST · 전역 해시 중복(스펙 간 같은 그림). 각각 스펙 쪽에서 해결, 앱 코드 변경 없음.
- `font-variant-numeric`은 `ui/num` · `ui/input` 밖 금지라 폼 숫자 칸 CSS에서 제거(정렬만 유지).

## Known Stubs

없음. `submitBlockReason({server: null, …})`의 서버 이유 자리는 05-06이 채우는 계획된 확장점이다.

## Threat Flags

없음(새 네트워크 표면은 05-04의 서명 PUT/보기 URL을 쓸 뿐이고 액션은 도메인 함수가 권한을 다시 판정한다).

## Next Phase Readiness

- 05-06: 막힘 이유 표시 · 즉시 재계산이 `submit-block.ts` · `expense-form.tsx`의 `block`/`TaxLine` 자리에 들어간다.
- 05-15: 행 행동 열 나머지 갈래는 `quote-table.tsx`의 `door` 열 `cell`에, 시트는 `sheetDoorAction`에 같은 자리로 더한다.
- 시각 기준 사진: `visual_baseline_expected: [dev-components, project-detail]` — 사진 갱신은 visual-baseline 워크플로가 맡는다.

---
*Phase: 05-expense-approval-leave*
*Completed: 2026-10-04*

## Self-Check: PASSED
