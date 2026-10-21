# 07 핵심 범위 — 지금 코드 상태 (main 9122c31, 2026-10-21 KST 조사, 읽기만)

| 항목 | 상태 | 근거 | 남은 일 |
|---|---|---|---|
| EXP-11 지급 예정일 자동 계산 | 없음 | db/schema/expenses.ts:42 `scheduledPaymentDate`(사람 입력, nullable), 입력 expense-form.tsx:152,963, 표시 expense-document.tsx:173·payment-section.tsx:305-328. 60일·마지막 금요일 코드 없음 | 계산 함수(공휴일 표), 빈 칸 계산값 표시, D-704 「마감 지나 밀림」, D-705 재파생. 코드표 기준일에 「지급 예정일」 선택지 이미 있음(evidence-type-fields.tsx:13,38) |
| 실제 지급일 | 있음 | db/schema/expense-payments.ts:15 `payDate`, :43 live uniq, domain/payments/targets.ts·batch.ts | — |
| 거래처 지급 기한 칸 | 없음 | db/schema/vendors.ts:22-45 | 칸+마이그레이션+거래처 PanelForm+DTO·노출표+누수 스캔 |
| EXP-12 결재 마감 gate | 없음 | domain/rules/register.ts 20개 규칙(85~430)에 없음, 설정 키 없음 | gate 규칙·설정 키 14시·지급 대상 제외(targets.ts)·D-703 |
| 공휴일·영업일(04.2) | 있음 | domain/holidays/*, business-day.ts:55 isBusinessDay, :59 addBusinessDays, :30 toKstDate, admin.ts:67 배너, :169 confirmHolidayYear | D-705 재파생 연결 |
| 조건 종류 틀 | 일부 | domain/notify/condition-kinds.ts:12-18 `{kind,label,dateUnit,evaluate({today})}`, :23 `CONDITION_KINDS=[]` | 실제 종류 4+2 |
| 테스트 조건 종류 | 있음 | test/support/notify-tick.ts createTestConditionKind | — |
| notify-tick | 있음 | app/internal/notify-tick/{route,handle}.ts, domain/notify/{tick,email-phase,digest}.ts, notify_tick_runs(db/schema/notifications.ts:61-78), 설정 notify.tick.batch_max(registry.ts:455), deploy.sh:629-641 | — |
| 알림함 | 있음 | domain/notify/inbox.ts, app/(app)/notifications/, notification_log(notifications.ts:23-52, dedup key) | — |
| 이메일 | 있음 | lib/email/smtp-sender.ts, lib/env.ts:77-80, system-status/index.ts:20,45-46 | SMTP 실제 값(사용자) |
| NOTI-03 규칙 테이블·관리 화면 | 없음 | notifications.ts에 규칙 테이블 없음 | 규칙 테이블·시드·관리자 화면·권한 메뉴·누수 스캔 |
| 기본 규칙 ①~④, 선결제 독촉, 대리 등록 PM 알림 | 없음 | 선결제 기한 설정만 keys.ts:1263-1270 `evidence.prepaid_due_days`=14 | 전부 구현 |
| 누수 스캔 | 있음 | test/integration/leak-scan.test.ts(776줄), test/unit/leak-scan-coverage.test.ts, action-registry-completeness.test.ts, registerExport 6건 | 06·06.1 신규 전수 확인 |
| 미매핑 DTO 0 검사 | 일부 | domain/permissions/dto-registry.ts:20-29(중복만), leak-scan.test.ts:139(비어 있지 않음만) | `*Dto` 열거 대조 테스트 |
| CORE_ACTION_TYPES | 일부 | domain/action-log/record.ts:14-63(34종) | 전 메뉴 기준 확정 표·테스트 |
| 계급 기본값 표 | 일부 | roles.ts:49-60, domain/seed/index.ts:204-345 흩어짐 | 한 표 + 시드 대조 테스트 |
| 계급별 노출 스모크 E2E | 없음 | permissions-grid.spec.ts·roles.spec.ts는 관리 화면 테스트 | 신규 + CI |
| 관리자 폼 8개 | 7 이관 | person-form.tsx:103, roles-client.tsx:245, org-client.tsx:243,282, vendor-form.tsx:281, card-form.tsx:83,224, code-item-form.tsx:62(인라인 칸 :137 판정 필요) | 설정 settings-form-client.tsx(ui/form 미사용, 자체 오류 :173,442,461,483) 이관 |
| /account 폼 | 일부 | change-password-form.tsx:30 Form layout=page | TextField aria-invalid 확인 |
| 대표 행동 로그 404(ADMN-10) | 안 고침 | action-log/page.tsx:34 notFound, seed/index.ts:204-228 관리자만 | 대표 기본 view 시드 + 시드 테스트 |
| D-712 잠금·해제 로그 | 끝남 | record.ts:35-36, lockout.ts:66, accounts.ts:104-131 | — |

07-CONTEXT 낡은 곳: CORE_ACTION_TYPES 잠금 없음(해소), notify-tick 없음(해소), env.ts 72~75→77~80.
한계: .github/·ui/input 내부 미열람, 자동 계산 부재는 grep 기준.
