---
phase: 07-schedule-notify-audit
plan: 04
type: execute
status: complete
requirements: [NOTI-03, EXP-11]
branch: claude/07-04-action-log
merge_owner: session
files_modified:
  - domain/action-log/record.ts
  - domain/action-log/changes.ts
  - domain/settings/registry.ts
  - domain/settings/export.ts
  - domain/approvals/route-step-settings.ts
  - domain/people/index.ts
  - repositories/settings.ts
  - test/unit/action-log/record.test.ts
  - test/unit/action-log/changes.test.ts
  - test/unit/settings/registry.test.ts
  - test/unit/settings/effective-from-rule.test.ts
  - test/integration/action-log-changes.test.ts
  - test/integration/settings.test.ts
---

# 07-04 SUMMARY — 행동 로그 전후 값 (설정 · 사람 계급)

## 만든 것

- `domain/action-log/changes.ts` 신규: `buildChanges(before, after, sensitive?)`(바뀐 칸 전부 `[이전, 이후]`, JSON 동치 비교, 민감 칸 `last4`/`changed` 마스킹) · `maskLast4` · `SensitiveMode`.
- `domain/action-log/record.ts`: 새 유형 5(`payment_schedule_change` · `password_reset` · `vendor_account_change` · `vendor_confirm` · `notification_rule_change`)를 `CORE_ACTION_TYPES` · `ACTION_TYPE_LABELS` · `ALWAYS_ON_ACTION_TYPES` 세 곳에 함께 등록, `settings_change`를 끌 수 없는 목록으로 이동.
- 설정 다섯 경로가 `detail.changes`를 싣고 저장과 기록이 한 트랜잭션:
  - `setSettingValue`(`{value:[이전,이후]}`, 이전 없으면 null)
  - `addHistorizedValue`(`{value:[그 날짜 직전 유효값, 새 값]}` + 기존 `effectiveFrom`)
  - `cancelHistorizedValue`(`{value:[취소한 행 값, 취소 뒤 그 날짜 유효값]}`)
  - `saveRouteStepSettings`(칸마다 한 줄, `{value:[이전,이후]}`, 안 바뀐 칸은 빈 changes)
  - `importSettings`(로그 한 행 `changes={키:[이전,이후]}` 바뀐 키만, 이력형은 `키@적용시작일`, 기록을 withTransaction 안으로 이동)
- `changePersonRole`: `permission_change`의 `detail.changes = {roleId:[이전,이후]}`.

## 커밋

1. `780fb1c` feat: 07-04 settings_change before/after changes (Task 1 + 이력형 두 경로)
2. `be263fa` feat: 07-04 route step and import change details (Task 2)
3. `efa55cd` feat: 07-04 person role change details (Task 3)
4. docs: 07-04 SUMMARY (이 파일)

## 검증 (실제 돌린 명령과 결과)

- `pnpm exec vitest run --project unit test/unit/action-log/record.test.ts test/unit/action-log/changes.test.ts` — 42 passed.
- `pnpm exec vitest run --project unit test/unit/people/change-person-role.test.ts test/unit/action-log test/unit/settings test/unit/app/settings-step-key-guard.test.ts` — 21 files / 237 passed.
- 통합(로컬 Postgres 16, `flock /tmp/plant8-erp-test.lock`): 아래 「통합 결과」 참고.
- `pnpm typecheck` 통과 · 바뀐 파일 `eslint` 통과.
- RED 확인: Task 2~3 구현을 되돌린 채 `action-log-changes.test.ts`를 돌려 5건 실패(가져오기 changes · 가져오기 기록 실패 롤백 · 결재선 changes · 사람 계급 changes 2)를 본 뒤 구현을 복원했다. 결재선 · 사람 계급의 「기록 실패 → 값 그대로」 사례는 기존 tx 덕에 처음부터 통과(회귀 가드).
- 위험 경로: `git diff --name-only origin/main...HEAD -- db/ domain/auth/ domain/permissions/` 빈 출력.
- `git diff --name-only origin/main...HEAD -- 'app/(app)/admin/action-log/'` 빈 출력.
- `route-step-settings.ts` diff는 기록 detail · 이전 값 읽기(상위로 끌어올림)뿐, 결재선 판정 로직 변경 없음(줄 수는 PR diff 참고).

## 통합 결과

`flock /tmp/plant8-erp-test.lock`으로 `pnpm db:dev` → `pnpm db:migrate` → `pnpm db:reset:test` 뒤 한 번에 실행:
`action-log-changes` · `settings-export` · `settings-approval-route` · `settings` · `people` · `admin-cap-last-admin` — 6 files / 110 tests passed.

**돌리지 못한 것(정직하게):**
- 전체 단위(`pnpm test:unit`)는 이 컨테이너에서 끝까지 돌지 못했다(다른 세션과 CPU를 나누며 멈춰 직접 종료, exit 143). 관련 단위만 돌렸다(위 237 passed). 전체는 draft PR의 CI가 돈다.
- 그 밖의 통합 파일(`action-log` · `tx-safety` · `document-numbering` · `roles` 등 `setSettingValue`를 준비용으로 쓰는 파일)은 다른 세션이 `erp_test` 락을 오래 쥐어 돌리지 못했다. 동작 변화는 설정 저장이 트랜잭션 안으로 들어가고 detail이 늘어난 것뿐이다. CI(ready 전환 시 전체 통합)가 확인한다.
- 통합은 Docker 없이 apt Postgres 16(`scripts/dev-db.sh`)으로 로컬에서 실제로 돌렸다.

## 편차 (Deviations)

- **[Rule 3] `repositories/settings.ts`** — `insertHistorizedValue`에 선택 `tx` 인자 추가(기본 `db`, 호출부 호환). files_modified 밖이지만 이력형 추가의 「기록 실패 → 행도 없음」(plan behavior)에 필요했다.
- **[Rule 3] `test/unit/settings/registry.test.ts` · `effective-from-rule.test.ts`** — files_modified 밖. `setSettingValue`/`addHistorizedValue`가 이제 `withTransaction`+`listHistory`/`findSimpleValue`를 쓰므로 deps 스텁을 더하고 새 호출 꼴(tx 인자 · changes)을 단언으로 갱신했다. 안 고치면 단위가 실제 DB를 건드려 실패했다.
- Task 1 커밋에 `addHistorizedValue` · `cancelHistorizedValue` 변경(Task 2 몫)이 같은 파일(`registry.ts`)이라 함께 들어갔다. 파일 단위로만 쪼갤 수 있어 커밋 경계를 그대로 두었다.
- `saveRouteStepSettings`는 기대값이 없을 때도 네 칸을 `lockSimpleValues`로 읽는다(전후 값용). 이미 `lockRouteStep` 어드바이저리 락 안이라 대기 모델은 같다.
- 커밋 트레일러의 모델 표기는 실행 환경 지시(`Claude Sonnet 5.5`)를 따랐다(프롬프트 파일에는 Opus 5.5로 적혀 있었으나 실제 실행 모델이 아니다).
- Superpowers 스킬(`test-driven-development` · `systematic-debugging` · `verification-before-completion`): 이 세션 스킬 목록에 없어 **skill unavailable** — 같은 규율(RED 확인 → 구현 → 전체 재실행)을 수동으로 따랐다.
- 통합 DB가 같은 컨테이너의 다른 세션(E2E)과 `erp_test`를 공유해 중간에 DB가 사라지는 실패가 한 번 났다(테스트 코드 결함 아님). 이후 `flock /tmp/plant8-erp-test.lock`으로 직렬화해 다시 돌렸다.

## FA-1 — 메뉴 → 쓰기 행동 → 행동 유형 (`rg 'actionType: "'` 정적 대조)

| 메뉴(MENUS 키) | 쓰기 행동(도메인) | 행동 유형 |
|---|---|---|
| projects / projects.* | 생성 · 원장 저장 · 상태 변경 · 자동 전환 · 견적 줄/개정 | document_create, document_update, status_change, restore |
| projects.revenue | 매출 · 발행 요청 | document_update, document_create, status_change |
| expenses / expenses.payments | 지출결의 · 지급 처리/취소/이체 파일 | document_update, document_delete, status_change, payment_process, payment_cancel, excel_export |
| expenses.evidence_* / evidence / evidence.intake | 증빙 확인 · 면제 · 기록 · 가져오기 · 거래처 자동 생성 | evidence_amount_change, evidence_waive, evidence_record_amount_change, evidence_vendor_create/restore/kind_change, document_update, archive |
| cards / cards.purchases | 구매 요청 · 구매 처리 · 카드 사용 | document_create, purchase_process, status_change, document_update/delete, restore |
| approvals | 제출 · 승인 · 반려 · 철회 | document_submit/approve/reject/withdraw |
| leave | 연차 제출 · 잔고 조정 | document_submit(approvals 경유), document_create(balance-service) |
| admin.people | 등록 · 계정 · 계급 · 복원 | document_create, document_update, permission_change(전후 값 추가), mask_reveal, restore, account_lock/unlock |
| admin.permissions / admin.visibility | 권한표 · 계급 | permission_change (전후 값은 07-26) |
| admin.settings | 설정 저장 · 가져오기 · 결재선 단계 · 내보내기 | settings_change(전후 값 추가, 끌 수 없음), excel_export |
| admin.code-tables / admin.field-definitions / admin.vendors / admin.corp-cards | 코드표 · 화면 항목 · 거래처 · 법인카드 | document_create, document_update, mask_reveal |
| admin.holidays | 공휴일 | holiday_change |
| admin.archive | 보관 · 복원 | archive, restore |
| admin.action-log | 정리 · 내보내기 | action_log_prune, excel_export |
| certs.* | 행사 · 제출 · 정정 · 파기 · 조회 | cert_prize_value, cert_correct, cert_purge, cert_view, document_*, status_change, mask_reveal |
| 로그인(공통) | 로그인 · 잠금 | login, account_lock, account_unlock |

로그 없는 쓰기 경로(이 플랜에서 고치지 않음, 07 플랜 입력):

- `domain/ops/restore-rehearsal.ts` — 복원 리허설 결과 행 삽입, 행동 로그 없음(시스템 점검 작업이라 대상인지 판단 필요).
- `domain/notify/tick.ts` · `email-phase.ts` — 알림 발송 로그(`notification_log` · `notify_tick_runs`)는 자체 표가 기록, 행동 로그 없음(시스템 자동 작업).
- `domain/notify/inbox.ts` `openMyInbox` — 본인 알림 읽음 표시, 행동 로그 없음(개인 상태라 대상 아님으로 보임).
- 정적 대조라 `recordAction`을 다른 이름으로 감싼 경로(approvals `tx-log` 등)는 같은 도메인의 유형 줄로 묶었다. 쓰기인데 로그가 없는 사용자 행동 경로는 찾지 못했다 — 완전성은 `/review`가 한 번 더 본다.

## 다음 플랜 · 오케스트레이터 몫

- 07-06 · 07-09 · 07-19 · 07-20/23: 등록된 새 유형 5개를 `recordAction`으로 쓴다(`UnknownActionTypeError` 없음).
- 07-26(PR-PERM): 권한표 · 노출표 · 계급 경로의 전후 값에 `buildChanges`를 쓰고 `roles.test.ts:152·245` · `admin-cap-permissions.test.ts:94` 정확 일치를 갱신한다.
- 07-25: `detail.changes` 읽는 쪽(`detail-lines.ts`) — 쓰는 쪽은 자르지 않고 전부 싣는다.
- 07-13: 불변 트리거(T-07-04-04 transfer).
- 게이트(`/review` + `/cso`)는 오케스트레이터가 돌린다.
