---
phase: 05-expense-approval-leave
plan: 11
subsystem: settlement-approval
tags: [settlement, approvals, projects, status, migration, permissions, db-lock, risk-money]

requires:
  - phase: 05-01
    provides: 종류 등록 필드(prepareFinalApproval · onFinalApprovalInTx · approveBlockedReason · canResubmit(viewer, documentId) · resubmitFrom) · 종류 중립 결재함 · 최종 승인 토스트 꼬리
  - phase: 05-10
    provides: 「내 차례」 공급(nextTurnText · measure) · 결재함 막힌 승인 셀(rowApprovalActions)
provides:
  - 정산 결재 종류(`settlement`) — 문서 id = 프로젝트 id, 담당 PM 기안, 최종 승인 = 같은 tx에서 프로젝트 settling → completed
  - changeProjectStatus trigger "approval" + 브랜드 권한 값 SettlementApprovalAuthority(정산 모듈만 생성) · 직접 완료 차단(via approval)
  - 프로젝트 상세 머리 줄 `정산 결재 올리기`(확인 없음 · 토스트 되돌리기) / `정산 결재 {중|반려|회수|승인}` 링크
  - 문서 화면 `/projects/[id]/settlement`(KvList · 두 합 · 04.1 행동 줄 · 승인 막힘 · 다시 올리기 1차 · 진행 복귀 한 줄)
  - DocumentActions 선택 prop approveBlockedReason
  - 설정 키 17개 `approval_route.settlement.*`(정산 결재선)
affects: [05-13, 06-PNL]

actuals:
  tokens: 83700
  tasks: 3
  commits: 8
plan_head_before: 984abe16a38b5b17b7c5771267fb6f30c7808dcc

migration_manifest:
  - tag: 0027_spicy_loners
    sql: db/migrations/0027_spicy_loners.sql
    snapshot: db/migrations/meta/0027_snapshot.json
    journal: "db/migrations/meta/_journal.json idx 27 (추가 한 항목)"

tech-stack:
  added: []
  patterns:
    - "결재 경로 권한 = 훅이 tx 안에서 읽은 「지금 차수 마지막 처리 기록 = viewer 승인」 + 문서 project_id → 브랜드 값 → changeProjectStatus가 projectId 결속만 본다"
    - "사람이 고를 수 없는 전환은 전이 표 데이터 한 칸(via: approval)으로 — 갈 곳 목록과 직접 호출이 같은 칸을 본다"

key-files:
  created: [db/schema/settlement-approvals.ts, db/migrations/0027_spicy_loners.sql, db/migrations/meta/0027_snapshot.json, repositories/settlement-approvals.ts, domain/settlements/index.ts, domain/settlements/dto.ts, "app/(app)/projects/[id]/settlement-button.tsx", "app/(app)/projects/[id]/settlement/page.tsx", "app/(app)/projects/[id]/settlement/settlement-actions.tsx", "app/(app)/projects/[id]/settlement/loading.tsx", "app/(app)/projects/[id]/settlement/error.tsx", "app/(app)/projects/[id]/settlement/layout.tsx", "app/(app)/projects/[id]/settlement/settlement.module.css", test/integration/settlement-approval.test.ts, test/integration/fixtures/settlements.ts, test/support/settlement-authority.ts, test/unit/app/approvals-inbox-measure-header.test.ts, test/e2e/settlement-approval.spec.ts, test/e2e/settlement-fixture.ts, docs/design/checks/2026-10-05-05-11-settlement.md]
  modified: [domain/projects/status.ts, domain/projects/status-transitions.ts, domain/settings/keys.ts, db/schema/index.ts, db/migrations/meta/_journal.json, "app/(app)/document-kinds.ts", "app/(app)/projects/actions.ts", "app/(app)/projects/actions.registry.ts", "app/(app)/projects/[id]/page.tsx", "app/(app)/projects/[id]/quote-table.tsx", "app/(app)/projects/[id]/project-detail.module.css", "app/(app)/leave/[id]/document-actions.tsx", "app/(app)/leave/[id]/document-actions.module.css", test/e2e/screen-routes.ts, test/e2e/a11y.spec.ts, test/e2e/project-lifecycle.spec.ts, test/integration/project-status.test.ts, test/integration/next-turn.test.ts, test/integration/tx-safety.test.ts, test/integration/leak-scan.test.ts, test/integration/quote-lines.test.ts, test/integration/project-auto-settlement.test.ts, test/integration/expense-create-idempotency.test.ts, test/unit/domain/project-status.test.ts]

key-decisions:
  - "정산 결재 문서 id = 프로젝트 id — 종류 href(documentId)가 동기라 조회 없이 /projects/{id}/settlement를 만든다"
  - "최종 단계 기록 = 지금 차수에서 처리 기록(action)이 있는 행 중 step_index 최댓값(대표 폴백 행 포함)"
  - "정산 → 완료는 전이 표 via: approval 한 칸으로 닫는다 — 긴급 탈출구 설정 없음"

requirements-completed: [UX-03, UX-06, OPS-08]

duration: ~1h35m(이어받은 세션 포함, 플랜 첫 커밋 2026-10-05T04:31Z → 06:06Z)
completed: 2026-10-05
status: complete
---

# Phase 05 Plan 11: 정산 결재 — 올리기 · 승인 = 완료(같은 tx) · 직접 완료 차단 Summary

**정산 프로젝트의 담당 PM이 머리 줄 `정산 결재 올리기`로 확인 없이 기안하고, 결재선 마지막 담당(기본 대표)이 승인하는 순간 같은 트랜잭션에서 프로젝트가 완료된다. 「상태 바꾸기 → 완료」 직접 경로는 누구에게도 없다.**

## 실행자 추천안 적용(분기) — 사용자 지시(10/5 00:55)에 따라 추천안 적용
1. **최종 단계 기록 판정**: `findFinalStepActorInTx`는 지금 차수에서 처리 기록이 있는 행 중 step_index 최댓값을 마지막 기록으로 본다. 그 값이 문자 그대로의 최대 행은 아니다. 뒤에 자기 승인 건너뜀 · 담당 없음 행이 남아도 교착이 생기지 않고, 폴백 행도 포함된다.
2. **approveBlockedReason**: `진행으로 바뀜 · 반려` 갈래만 구현했다. 엔진이 viewer가 지금 후보인 문서만 넘기므로 `지금 담당이 아님` 갈래는 늘 같은 답이 된다. 그 문구는 훅의 GateBlockedError가 쓴다.
3. **D-80 ② 승인 먼저 경합**: 엔진 → 훅 → changeProjectStatus 사슬에 주입 지점이 없다. 그래서 `settlement-approval.test.ts`만 `vi.mock("@/domain/projects/status")`로 changeProjectStatus를 감싸 afterLock을 넣는다(sleep 없음).
4. **문서 id = 프로젝트 id**: 종류 `href(documentId)`가 동기라서 이렇게 정했다.
5. **`settlement/layout.tsx` 추가(플랜 files 밖)**: 응답 전에 404를 판정한다. 연차 · 지출결의의 소프트 404 선례를 따랐다.
6. **테스트 픽스처 `test/integration/fixtures/settlements.ts` 추가(플랜 files 밖)**: 진행 복귀(D-80)는 리포지토리 상태 갱신이 아니라 실제 경로(`saveProjectLedger`, 종료일 2099)로 만든다. 지난 종료일이면 다음 잠금 읽기가 다시 정산으로 되돌리기 때문이다.
7. **직접 완료에 기대던 기존 통합 테스트**(quote-lines (p)(q)(r) · project-auto-settlement (h)(j) · expense-create-idempotency 완료 사례): 테스트 전용 권한 값(`test/support/settlement-authority.ts` — 캐스트는 test/ 안)으로 결재 경로를 부른다. 이 테스트들은 잠금 · 자동 정산 선판정 · 견적 줄 잠금 규칙을 재는 것이라 단언은 그대로다. auto-settlement (h)의 로그 trigger만 `manual` → `approval`.
8. **문서 화면 다시 올리기**는 폼이 아니라 이 화면의 1차(`정산 결재 다시 올리기 Ctrl+Enter`, 확인 없음, 성공 토스트)다. 되돌리기 토스트는 첫 올리기(머리 줄)에만 있다. 진행 복귀 한 줄은 서버 판정 `isSettlementResubmitWaiting`(내 반려 · 회수 문서 ∧ 프로젝트 in_progress)으로 그린다.
9. **폰 행동 줄**: 막힘 이유가 꽉 찬 1차 옆에서 두 줄로 접히지 않게, 1차 아래 한 줄로 내리고 두 버튼의 윗줄을 맞췄다(`document-actions.module.css` 폰 규칙 두 줄). 이유가 없으면 높이가 같아 연차 · 지출결의 화면은 그대로다(`mobile-leave-approval` 9 통과).

## 결정 · 예외
- **P3-5**: UI 확정 #3(행 · 시트 `승인` 즉시, 확인 창 없음)이 되돌릴 수 없는 정산 결재 최종 승인(프로젝트 완료 잠금)에도 적용된다. 이는 CLAUDE.md §7 「확인은 되돌릴 수 없는 일에만」의 의식적 예외다. 사용자 결정이라 유지한다(근거: UI-SPEC 확정 #3 · 최종 단계 기본값은 대표).
- **F1 판정 위치**: 결재 경로 권한은 두 곳에서 판정한다.
  - `onSettlementFinalApprovalInTx`가 같은 tx에서 `findFinalStepActorInTx`를 부른다(마지막 처리 기록 = viewer 승인 · 문서 project_id). 통과해야 비공개 생성 함수가 브랜드 값을 만든다.
  - `changeProjectStatus`는 `approvalAuthority.projectId === projectId` 결속만 본다. 메뉴 · 팀 범위 · rowScope는 보지 않는다.
  - 운영 코드의 브랜드 캐스트는 `domain/settlements` 안 1건뿐이다(grep).
- 정산 → 완료 직접 경로는 전이 표 `via: "approval"` 한 칸으로 닫았다(권한 판정 전 `GateBlockedError` `정산 결재로만 완료 · 정산 결재 올리기`). `statusDestinations`도 내보내지 않는다. 긴급 탈출구 설정은 없다.
- 사용자 결정 유지: 지출결의의 남은 실행가 검사는 그대로이고 고정 상한은 없다(이 플랜은 코드 변경 없음). 승인 뒤 포커스는 다음 줄 열기(05-16)다.

## 잠금 · 트랜잭션 순서
| 경로 | 순서 |
|------|------|
| 승인(최종) | 결재 인스턴스 UPDATE(엔진) → 단계 기록 · 폴백 행 → 훅: 문서 · 인스턴스 · 단계 읽기 → `loadProjectForGate` 프로젝트 FOR UPDATE(+자동 정산 선판정) → 상태 UPDATE → status_change 로그 → 문서 로그(엔진) |
| 올리기 · 다시 올리기 | (tx 전 권한 · 상태 · prepareSubmission) → tx: 프로젝트 읽기만(잠금 없음 — 승인과 반대 순서 교착 방지) → 문서 INSERT ON CONFLICT DO NOTHING + 재조회 → submit / resubmit(인스턴스) |
| D-80 진행 복귀(기간 저장) | 프로젝트 FOR UPDATE(`saveProjectLedger`) — 승인이 먼저 잡으면 기다렸다가 seenStatus 불일치로 거부되고, 먼저 잡으면 승인 훅이 StatusChangedError로 전부 롤백된다(두 순서 통합 사례) |
| 풀 2 동시 최종 승인 셋 | tx-safety (j) 10초 안 전부 통과 |

## 지운 · 옮긴 단언
| 원래 자리 | 지운 단언 | 옮긴 자리 · 바뀐 단언 |
|-----------|-----------|----------------------|
| `project-status.test.ts` (a)(b) | 대표 settling → completed 직접 전환 성공 · 로그 trigger manual | 「사람의 세 전환」으로 줄임. 완료 성공은 `settlement-approval.test.ts` 「대표 승인 → completed · trigger approval」 |
| `project-status.test.ts` (c) · (d) | 팀장 · 담당 PM 완료 거부 문구 `상태 바꾸기 권한 없음` | 같은 사례, 문구 `정산 결재로만 완료 · 정산 결재 올리기` |
| `project-status.test.ts` (h) | 대표 · 시스템 관리자 직접 완료 성공 | 넷 모두 거부 + 정산 그대로 + 로그 0 + `statusDestinations` 빈 목록 |
| `unit/domain/project-status.test.ts` | 대표 · 시스템 관리자 갈 곳 `[completed]` | 빈 목록 |
| `e2e/project-lifecycle.spec.ts` (c) | 대표 「상태 바꾸기」 → 「완료로 바꾸기」 모달 · 토스트 · 완료 태그 | 팀장 · PM · 대표 모두 「상태 바꾸기」 0. 완료 흐름은 `settlement-approval.spec.ts`. (d) 완료 뒤 견적 줄 잠금은 완료 상태로 만든 프로젝트로 유지 |
| `project-auto-settlement.test.ts` (h) | 사람 줄 trigger `manual` | `approval`(결재 경로) |

## 마이그레이션 · 권한 · 시드
- `0027_spicy_loners.sql`: 새 빈 표 `settlement_approvals`를 만든다.
  - 열: id uuid PK · project_id UNIQUE FK projects · drafter_id FK users · created/updated_at.
  - 손 편집은 앞머리 `SET LOCAL lock_timeout 1s · statement_timeout 5s` 블록뿐이다(0026 선례). 백필 · 재작성은 없다.
  - 재생성 차이 0, 빈 DB 적용, squawk 0, journal 가드 녹색(idx 27 한 항목 추가).
- 시드 변경은 없다. 설정 키 17개 `approval_route.settlement.*`를 추가했다(1~3단 꺼짐, 4단 대표 × 전사, 자기 승인).
- 액션 `submitSettlementAction` · `withdrawSettlementAction`은 projects/write로 등록했다. 액션 입력 스키마에 `trigger` · `approvalAuthority`가 없다.

## 화면(독립 DOM 감사 대상 — `CI=true`)
- `/projects/[id]`, 정산 상태:
  - 담당 PM: 머리 줄 2차 `정산 결재 올리기`. 미저장 편집이 있으면 비활성 + DR-6, 실패하면 버튼 옆 한 줄. 누르면 토스트 `정산 결재 올리기 · 결재 요청됨 → {담당}` + `되돌리기`. 늦으면 오류 토스트 `{대표}이/가 HH:MM에 승인함` + `새로 고침`.
  - 문서가 있으면 3차 링크 `정산 결재 {중|반려|회수|승인}`.
  - 누구에게도 `상태 바꾸기`가 없다.
- `/projects/[id]/settlement`:
  - 제목 `정산 결재 — {이름}` · 상태 태그 · 메타 번호.
  - KvList: 프로젝트 · 기간 · 담당 PM · 견적가 합 · 실행가 합(quote.amount 못 보면 행 없음) · 기안 · 결재선. 손익 행은 없다.
  - 대표: `승인` 1차 Ctrl+Enter · `반려` 2차. 진행 복귀면 `승인` aria-disabled + `진행으로 바뀜 · 반려`이고, 폰에서는 1차 아래 한 줄이다.
  - 반려된 PM: 1차 `정산 결재 다시 올리기 Ctrl+Enter`. 진행이면 1차 없이 `진행 중 · 정산 뒤 다시 올리기`.
  - loading 뼈대, error `정산 결재 불러오기 실패` + `다시 시도`, 볼 수 없으면 404.
- `/approvals` · `/` PC 행에서 진행 복귀 문서는 `승인` 대신 이유 글자(--status-danger)와 `반려`(→ `정산 결재 반려` 확인)다.
- 점검표: `docs/design/checks/2026-10-05-05-11-settlement.md`. 실측 수치: 폰 44 · 넘침 0 · 폰 kbd 0. 스크린샷은 스크래치패드 `shots11/` · `shots11b/`.

## Deviations from Plan
1. **[Rule 3] a11y 화면 표 길이 38 → 40**(`a11y.spec.ts`): 이미 39였다(05-07이 행을 더하고 숫자를 안 바꿈). 여기에 이 플랜의 `settlement-doc` 행을 더했다.
2. **[Rule 3] 기존 통합 테스트 3개 파일의 직접 완료 호출 → 결재 경로**(분기 7): 플랜 Task 3 ③은 project-status · project-lifecycle만 적었다.
3. **[Rule 1] 테스트 픽스처 기간**: 진행 복귀를 리포지토리 상태 갱신으로 만들면 자동 정산이 되돌렸다. 실제 경로(D-80 기간 저장)로 바꿨다(systematic-debugging).
4. **E2E 문구 정정**: 늦은 되돌리기 문구는 이름 받침에 따라 `이/가`를 고른다. 시험 정규식은 `(이|가)`이다. 문서 제목은 스트리밍 중 loading 제목과 겹치지 않게 heading 이름으로 찾는다.
5. **TDD 증거 한계**: Task 3의 D-80 · 다시 올리기 · 늦은 되돌리기 · 「내 차례」 통합 사례와 null 머리글 단위 사례는 Task 1 구현 · 05-01 규칙을 고정하는 것이라 처음부터 초록이었다. RED는 직접 완료 거부(단위 1 · 통합 3)와 E2E 3(aria-disabled · 다시 올리기 · 「상태 바꾸기」)이다.
6. **남은 죽은 갈래(지우지 않음)**: `app/(app)/projects/[id]/status-change.tsx`의 「완료로 바꾸기」 모달 갈래는 이제 렌더되지 않는다(갈 곳 목록에 완료 없음). 정리는 다음 플랜이나 리뷰가 판단한다.

## Verification
- 단위 `pnpm test:unit` 전체: 254 files · 3880 tests 통과.
- 통합 한 번에(만진 파일 + `git diff --name-only 55647a0b..HEAD -- test/integration`의 `.test.ts` 25개): 25 files · 3214 tests 통과.
- Task 3 통합 6 files · 153 tests, 단위 5 files · 153 tests 통과.
- E2E `CI=true` 프로덕션 빌드:
  - desktop: settlement-approval 4 · project-lifecycle · project-period · leave-document · design-principles · a11y · type-hierarchy = 164 통과 · 7 건너뜀.
  - mobile-375: mobile-leave-approval 9 통과.
  - desktop-settings: settings-approval-route 22 통과.
- `pnpm lint` · `pnpm typecheck` · `pnpm lint:sql` 0, `mark-legacy --audit`(projects/[id] · leave/[id]) 0, `pnpm build` 0, `pnpm db:generate` No schema changes.
- acceptance grep:
  - `via: "approval"` 1, status-transitions diff 추가 2줄.
  - `afterLock` 6, sleep 0, `document_reject|document_withdraw` 2.
  - `measureHeader: null` · `"금액"` 각 1+.
  - `approvalAuthority` 파일 = status.ts · settlements/index.ts. settlements 밖 운영 코드 캐스트 0.
  - settlements의 `projects.complete` 0, `최종 승인 담당 아님` 0.

## Known Stubs
없음.

## Next Phase Readiness
- 위험 경로(마이그레이션 · 스키마)가 있어 사용자가 머지한다. 돈 · 결재 게이트 `/review` + `/cso`, Opus 독립 검토 1명, 독립 DOM 감사가 필요하다.
- 05-13 전체 게이트가 브랜드 캐스트 grep을 다시 돈다. 테스트 전용 위조는 `test/support/settlement-authority.ts` · `settlement-approval.test.ts` 두 곳이다.

## Self-Check: PASSED
- 파일 5종(domain/settlements/index.ts · 0027 SQL · 문서 화면 page.tsx · test/support/settlement-authority.ts · 점검표) 존재, 커밋 8개(27b903d5 · 359c7b92 · 97ceec8b · 2601b4ac · 1d4c2b2b · 94312c01 · 2136043e · cb97cdb5) 존재. REQUIREMENTS.md는 gsd-tools `requirements.mark-complete UX-03 UX-06 OPS-08`로만 바꿈(OPS-08 체크).
