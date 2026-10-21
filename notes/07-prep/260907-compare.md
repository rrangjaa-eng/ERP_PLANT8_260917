# 07 준비 — 260907 옛 저장소 대조 (페이즈 07 범위)

작성 2026-10-20 · 옛 `/home/user/erp_plant8_260907`(60f86da, 읽기만) ↔ 새 `/home/user/ERP_PLANT8_260917`(main 9122c31, 읽기만). 옛·새 코드를 직접 열어 확인했고, 직접 못 연 것은 「(확인 못 함)」으로 적었다.

읽은 입력: `.planning/research/ERP260907-CONTEXT.md` · `260907-audit-full/REPORT.md`(§9 D1~D33, §12 결정 기록) · `260907-full-inventory/`(gap-verdicts.md · decisions.md · new-gaps-summary.md · already-captured.md) · `260907-screen-compare/REPORT.md` · `06.1-review/verify/prep-260907.md`(재사용) · `prep-07-carryover.md` · `07-CONTEXT.md` · `docs/inputs/phase-07-schedule-notify.md`.

표기: `옛` 경로는 `/home/user/erp_plant8_260907/` 기준, `새` 경로는 `/home/user/ERP_PLANT8_260917/` 기준. 판정 = 가져옴 / 안 가져옴 / 이미 있음 / 결정됨(출처). 「결정됨」은 사용자 결정이 이미 있어 다시 묻지 않는 것이다.

## 0. 한눈에

- 07의 뼈대(공휴일 표·영업일 함수·알림함·이메일·notify-tick·계정 잠금 로그)는 04.2가 이미 만들었다. 07이 얹을 것은 **지급 예정일 계산 · 마감 판정 · 조건 종류 채우기 · 규칙 관리자 폼 · 전 메뉴 검수 · 잠금 풀기 단추**다.
- `domain/notify/condition-kinds.ts:23` `CONDITION_KINDS = []` — 조건 종류가 0개다. 지급 예정일 자동 계산·마감 판정·거래처 지급 기한 칸도 새 코드에 **없다**(`db/schema/vendors.ts` 칸 없음, `db/schema/expenses.ts:42`는 사람이 적는 칸뿐).
- 「목요일 고정 알림」 버그 원인: 옛 `server/src/notices.ts` 주간 마감 알림이 `isodow = 4`를 박아 늘 목요일에만 났다. 아래 §1에 file:line. 새 코드에는 요일 하드코딩이 아직 없다(grep 0건). 재발 방지 설계 메모는 §1.
- 새로 사용자 판단이 필요한 것은 §8에 5건(각 추천안 1개).

## 1. 「목요일 고정 알림」 버그 (꼭 찾으라고 한 것)

| 항목 | 위치 | 내용 |
|---|---|---|
| 원인(고친 뒤라 줄은 없고 설명만 남음) | 옛 `server/src/notices.ts:2896-2905` | 주간 마감 알림 함수의 옛 이름이 「목요일마감」이었고 `isodow = 4`(ISO 요일 4=목)를 박아 두어 **늘 목요일**에만 알림이 났다. 마감 날짜는 2026-08-22(판 100)부터 「그 주 실제 지급일(공휴일 반영)의 전 영업일」이라는 파생값인데 알림만 요일로 셌다 |
| 실제 어긋남 사례 | 옛 `notices.ts:2903-2906` | 추석 주(2026): 지급 9/23 수 → 마감 9/22 화, 알림은 마감 이틀 뒤인 9/24 목에 났다 |
| 수리(2026-09-02 수리 회차 지-3) | 옛 `notices.ts:2918`(`주간마감`), `:2924`(`마감일인가(오늘)` 호출), `:110`(import) | 알림도 달력과 같은 판정 조각을 읽도록 바꿈 |
| 정본 판정 | 옛 `server/src/cutoff.ts:36-38`(`마감일인가`) → 옛 `db/schema/020_functions.sql:96-130`(`approval_cutoff_at`) | 지급 요일 날짜 → 공휴일이면 설정 따라 당김/미룸 → `previous_business_day(지급일-1)` + 마감 시각(`payment.cutoff_time`). 달력(`server/src/calendar.ts:314`, `:570`)도 같은 조각 |
| 설명 문서 | 옛 `docs/05_기본-정책.md:259-267`, `docs/06_업무/07_매출-수금-지급.md:455-460` | 「앞서는 알림을 내는 자리만 요일(목)로 세고 있었다」 |
| 같은 부류로 남은 옛 요일 셈 | 옛 `server/src/payments.ts:116`, `:196` | 지급 화면 주 구간이 `isodow`/`date_trunc(week)` 기준 — 지급 요일 설정과 같은 잣대인지 늘 신경 써야 했던 자리 |

**새 코드 현황.** 요일 하드코딩 없음(`금요일|목요일|getUTCDay()===5` grep 0건, `domain/` `lib/` `repositories/` `app/`). 다만 `domain/expenses/list.ts:66-75` `paymentBand`는 「이번 주 지급」을 **달력 월~일 주**로 가르고 지급일·마감과 별개 계산이다.

**07 계획에 줄 메모(재발 방지).**
1. 지급 예정일·마감 시각·지급 주·알림 기준일을 만드는 순수 함수를 **한 파일 한 벌**로 두고(`domain/payments/` 아래, 이름은 계획이 정함) 지급 대상 목록·`paymentBand`·gate 규칙·조건 종류가 모두 그 함수만 부른다. 알림 조건 종류에서 요일·「N일 전」을 따로 셈하지 않는다.
2. 지급일 = 설정 요일 날짜를 기한 안에서 거꾸로 찾고 → `isBusinessDay`가 아니면 `addBusinessDays(…, -1)`(`domain/holidays/business-day.ts:54`) → 마감 = `addBusinessDays(지급일, -1)` 14:00(KST). 옛 `approval_cutoff_at`과 같은 순서다.
3. D-701 「지급 예정일 임박」은 마감 전 영업일 9시 = **마감일의 전 영업일**로 같은 함수에서 파생. 시험: 금요일이 공휴일인 주, 월요일 휴일 직후, 추석 주에서 지급일·마감·알림일이 함께 앞당겨지는 단위 시험.

## 2. 지급 예정일 · 결재 마감 · 그 주 지급 대상

| # | 기능 | 260907 file:line | 260917 현재 file:line | 판정 | 07 계획에 줄 메모 |
|---|---|---|---|---|---|
| A1 | 지급 예정일 자동 계산(작성일 + 기한을 넘기기 전 마지막 금요일, 금요일이 공휴일이면 앞 영업일) | `db/schema/020_functions.sql:3415-3460` `payment_due_date` | 없음. 칸만 있고 사람이 적음(`db/schema/expenses.ts:42`, `domain/expenses/draft-fields.ts:26`) | 결정됨(EXP-11 · `docs/inputs/phase-07-schedule-notify.md` §2 · 07-CONTEXT D-704) | 순수 함수로 신설. 작성일은 「세금계산서·영수증에 적힌 날」이지 ERP 등록일이 아님(입력 §2). 시험 필수: 작성일 + 60일이 정확히 금요일인 날, 공휴일 금요일 |
| A2 | 작성일 원천 순서(가장 이른 붙은 증빙 작성일 → 제출일 → 오늘) | 옛 `020_functions.sql:3968-4033`(순서 `:3985-4002`), `server/src/receipts.ts:1352-1423` | 없음. 06.1은 붙임이 문서 값을 안 바꿈(D-6520) → 「Phase 7 EXP-11 입력」(`prep-260907.md` #29, `06.1-12-SUMMARY.md:213-215`) | 가져옴(감사 보고 `design-C.md:463-465` ⓐ 추천 + 06.1 인계) | 증빙 기록 `issued_on` 최솟값 → 없으면 제출일. 증빙 붙임·떼기가 문서 값을 안 바꾸므로 **읽을 때 계산**(권장)인지 붙임 훅에서 재저장인지 계획이 정함. 07-CONTEXT D-705 「다시 파생」과 맞추려면 읽을 때 계산이 단순 |
| A3 | 거래처별 지급 기한 칸(1~180일, 협력사만) | `db/schema/010_tables.sql:5428`(칸), `:5448-5449`(협력사만·1~180 CHECK), `server/src/vendors.ts:124`, `:298`, `:391` | 없음(`db/schema/vendors.ts` 칸 없음, 07-CONTEXT 「현재 스키마에 칸 없음」) | 결정됨(EXP-11 「거래처별 조정」 · 입력 §2 · `already-captured.md` 07 「지급 기한 칸 협력사만」) | 마이그레이션 = 위험 경로 → **별도 PR, 사용자 머지**. 같은 마이그레이션에 `version` 칸을 같이 넣으면 G9(동시 수정 충돌 검사, 결정 G9 가져옴·07)가 한 번에 끝남 |
| A4 | 회사 기본 설정(기한 일수·지급 요일·마감 시각) | `db/schema/050_seed_settings.sql:218-221`(`payment.term_days`/`weekday`/`date_rule`/`cutoff_time`) | `domain/settings/keys.ts`에 `payment.*`는 `method_evidence_pairs`(`:1284`)뿐 | 결정됨(EXP-11 「규칙은 설정」 · EXP-12 「14시(설정)」). `date_rule=after_limit`은 안 가져옴 | 키 3개(기한 60·요일 fri·마감 14:00)만. `after_limit`(기한 뒤로 미루기)은 감사 보고 추천으로 버림(`design-C.md:466-470` ⓔ, 사용자 결정은 아님) — D-704가 「늦은 건만 뒤로 민다」를 이미 정함 |
| A5 | 긴급 건은 예정일을 비우고 요청일 사용 | 옛 `020_functions.sql:4000`(`urgency_code='urgent' → null`) | 없음 | 안 가져옴 → 대체(「희망 지급일 + 사유」, 결정 D18 · REPORT.md §9, §12 21:00) | 긴급 딱지 안 만듦 |
| A6 | 희망 지급일 + 사유 한 쌍(긴급·앞당김 대신) | 옛 `db/새판/151_early_pay_request.sql`(머리말), `server/src/early-pay.test.ts:5`, 옛 `020_functions.sql:3992-3999` | 없음(grep 0건) | 결정됨(D18 · REPORT.md §9, §12 21:00) | 설계는 `design-B.md:196-226`(칸 둘 `requested_payment_date`·`_reason` + CHECK, 결재 경로·마감 판정은 안 바꿈, 조건 종류 `expense.payment_requested`). 마이그레이션 → 위험 경로 PR. 해석 충돌은 §8 판단 1 |
| A7 | 사람이 당겨 적은 예정일은 자동 재계산이 덮지 않음(얼림) | 옛 `020_functions.sql:3992-3999` | 없음 | 결정됨(07-CONTEXT D-705 「사람이 직접 적은 지급 예정일은 건드리지 않는다」) | 칸 하나(`scheduled_payment_date`)로는 자동값과 수동값을 구분 못 함 → 「수동 지정」 표시가 필요(칸 추가 또는 읽을 때 계산 + 수동 칸 분리). 마이그레이션 판단 |
| A8 | 결재 마감 = 지급일 전 영업일 14시, 공휴일이면 함께 이동 | 옛 `020_functions.sql:96-130` `approval_cutoff_at` | 없음 | 결정됨(EXP-12 · 입력 §3 · D-701) | §1 메모. 마감 시각은 KST 벽시계 → 실제 순간으로 바꿔 비교(옛 `:128`), `toKstDate`(`domain/holidays/business-day.ts`) 사용 |
| A9 | 마감 판정을 gate로(그 주 지급 대상에서 빠짐) | 옛은 막지 않음 — 「경영관리 책임자가 판단해 그 주에 넣을 수 있다」(`docs/06_업무/07_매출-수금-지급.md:449-451`, `04_기본-권한.md:424-459`) | 없음. 등록 자리는 `domain/rules/register.ts:352-436`(`payment.approval-required` 등), gate 정의 `domain/rules/gate.ts` | 결정됨(EXP-12 · 입력 §3 「`domain/rules.gate` 경유」 · D-703 「대표 최종 승인까지」) | 최종 승인 시각 = 결재 단계표 마지막 단계 `acted_at`(`db/schema/approvals.ts:76`) — 인스턴스·문서에 승인 시각 칸 없음(확인 못 함: 결재 인스턴스 칸). D-703은 Reversibility costly라 gate·목록·임박 알림이 같은 쿼리 조각 사용 |
| A10 | 마감 넘긴 건 → 다음 지급 가능 금요일로 자동 밀림 + 「마감 지나 밀림」 표시 | 옛은 안 밂(위 A9) | 없음 | 결정됨(D-704 + D19 「더함」 · REPORT.md §9, §12 21:00) | 60일 기한을 넘겨도 민다(D-704). 표시는 상태 배지 하나(§7: 문구 최소) |
| A11 | 경영관리 「이번 주로」(마감 넘긴 건을 그 주에 넣는 동작) | 옛은 별도 단추 없이 재량(`07_매출-수금-지급.md:449-451`, 단추 유무는 확인 못 함) | 없음 | 결정됨(D19 · REPORT.md §12 21:00; 설계 `design-E.md` B6/E-6) | 확인 창 대신 되돌리기 토스트 + 행동 로그. 돈 경로 → `/cso`(CLAUDE.md §4) |
| A12 | 그 주 지급 목록에 결재 중인 건을 따로 보이되 합계에서 뺌 | 옛 `server/src/payments.ts:157`(`WEEK_SQL`), `:488-500`, `:539-541` | `domain/payments/targets.ts:250-258`(승인 건만), 구간 `domain/expenses/list.ts:66-75` | 가져옴(감사 보고 추천 `design-C.md:472`; 사용자 결정 아님. 화면 시안은 추천대로 `screen-compare REPORT §2-9, §4` 「합계 줄 결재 마감 보임(07 뒤)」) | D-703과 같은 화면. 구간(이번 주/다음 주)을 지급일 파생과 같은 함수로 |
| A13 | 공휴일이 바뀌면 지급 전 예정일 다시 셈(G31) | `db/schema/080_triggers.sql:406-411` `holidays_reschedule`, `020_functions.sql:4116-4141` | 없음 — `domain/holidays/admin.ts:229`(addHoliday)·`:286`(delete)·`:326`(restore)·`:169`(confirmYear) 모두 지출결의를 안 건드림. 대체공휴일 재배치만 `domain/holidays/candidates.ts:107` | 결정됨(gap-verdicts.md G31 「가져옴 · 07 (지급일 자동 계산과 같은 플랜에 반드시)」) | 07-CONTEXT D-705 후반과 같은 일. 사람이 적은 날은 제외(A7). 읽을 때 계산(A2)이면 자동 해결 |
| A14 | 실제 지급일은 오늘까지만 | 옛 `server/src/payments.ts:861-866` | 06 보정으로 처리됨(`design-C.md:444-460` T6, 반영 여부는 이 대조에서 확인 안 함) | (07 범위 밖) | 참고만 |
| A15 | 업무 달력(홈 달력의 지급일·마감 눈금, 날짜 칸 휴일 표시) | 옛 `server/src/calendar.ts:96-108`, `:314`, `:570` | 없음 | 안 가져옴(D23 「범위 밖」 · REPORT.md §9, §12 21:02; `screen-compare §2-1` 달력 버림) | 사람이 적는 지급 예정일이 남는다면 서버에서 영업일만 허용·금요일 아니면 경고(07-CONTEXT 「Claude's Discretion」) |

## 3. 공휴일 · 영업일

| # | 기능 | 260907 file:line | 260917 현재 file:line | 판정 | 07 계획에 줄 메모 |
|---|---|---|---|---|---|
| B1 | 법정 공휴일 규칙으로 후보 생성 → 관리자 확정, 임시공휴일·선거일 수동 | `server/src/holiday-rules.ts:287` `generateHolidays`(1949~2050, `:276`), `server/src/settings-routes.ts:2062`(수동 등록) | `domain/holidays/rules.ts:108`, `candidates.ts:78-100`, `admin.ts:169`(확정) `:229`(추가), `lunar-table.ts:5-6` | 이미 있음(ADMN-11 Complete, 04.2) | **음력 표가 2025~2035까지**(`lunar-table.ts:5-6`) — 옛은 2050까지. 2035 이전에 표 확장 필요(07이 아니어도 `docs/OPERATIONS.md`에 한 줄) |
| B2 | 영업일 정의 · 판정 함수 | 옛 `020_functions.sql:2512-2524` `is_business_day`, `:3075` `next_business_day`, 설정 `company.business_days` | `domain/holidays/business-day.ts:44`(월~금 고정) `:54` `addBusinessDays`, `calendar.ts`(DB 진입점) | 이미 있음(고정 월~금: 입력 §1 「영업일 = 월~금 중 공휴일 아닌 날」). 영업일 요일 설정은 안 가져옴 | 07 함수는 이것만 사용 |
| B3 | 해가 바뀔 때 다음 해 후보 자동 + 미확정 배너 | (옛은 수동 「채우기」 `settings-routes.ts:346-351`, `:559-564`) | `domain/notify/tick.ts`(다음 해 `ensureHolidayCandidates`), `domain/holidays/admin.ts:67` 배너 | 이미 있음(D-705 전반, 04.2) | 확정 시 날짜 재파생은 A13 |
| B4 | 공휴일 이름 고치기(G32) | `server/src/settings-routes.ts:2119`(확인 못 함) | 없음 | 안 가져옴(gap-verdicts.md G32) | 삭제 후 다시 추가로 대체 |

## 4. 알림 규칙 · 알림함 · 이메일

| # | 기능 | 260907 file:line | 260917 현재 file:line | 판정 | 07 계획에 줄 메모 |
|---|---|---|---|---|---|
| C1 | 발송 틀(하루 1번 9시 tick, advisory lock, 중복 방지 유니크, 건수 상한 배치) | 옛은 10분 타이머 + 화면 열 때 따라잡기(`server/src/scheduler.ts:1-60`, `:140-280`; `notices.ts:1104-1180` `catchUp`; 중복 방지 판 060 `notices_once`) | `domain/notify/tick.ts`, `app/internal/notify-tick/handle.ts`, `repositories/notifications.ts`, `db/schema/notifications.ts:22-56` | 이미 있음 · 옛 방식(이중 경로)은 안 가져옴 — 결정됨(입력 §4 「하루 1번 9시」 · NOTI-04 · D-709) | 옛은 「늦은 알림은 알림이 아니다」(`scheduler.ts:20`)로 이중 경로를 만들었음. 새는 모든 알림이 **전 영업일 9시**에 파생되므로(D-701) 마감 14시 전에 도착. 비영업일 tick은 아무것도 안 보냄(D-709) |
| C2 | 조건 종류 등록부 | 옛은 고정 갈래 18~19개(`notices.ts` 함수들) + 설정 키 `notify.*` 약 50개(`050_seed_settings.sql`) | `domain/notify/condition-kinds.ts:16-23` — `dateUnit`(영업일/달력일)·`evaluate({today})`, **종류 0개** | 결정됨(NOTI-03 · 입력 §7) | 종류별 파일 + 시드. `evaluate`는 「today까지 기한이 된 발생을 안정된 키로 모두」(`condition-kinds.ts:21-22`) |
| C3 | 규칙 = 조건 종류 × 파라미터(관리자 폼) | 없음(옛은 종류 고정, 켬/끔·일수·팀장 추가 등은 설정 키) | 없음(`db/schema/notifications.ts`에 규칙 표 없음, 관리자 화면 없음) | 결정됨(NOTI-03 · ROADMAP 기준 3). 규칙 켬/끔이 옛 「끄는 열쇠」를 대신(`design-E.md` 표 마지막 줄) | 옛 `notify.*` 키가 파라미터 사전: 시작 N일·주기·팀장 추가·대표 추가·예상 수령일까지 멈춤·회차 상한(`050_seed_settings.sql` `notify.receipt_remind_*` 등). 새 표 + 관리자 화면 = 마이그레이션(위험 경로 PR 분리) + `ui/form` 폼 + 누수 스캔 등록 + 행동 로그(규칙 변경은 `settings_change` 급) |
| C4 | 종료 후 지출결의 없음(+7일 → 담당 PM) | 가장 가까운 것: 완료 신청 재촉 `notices.ts:2254-2330`(`FINISH_REMIND_SQL`) · 견적 재촉 `:2352-2430` — 의미가 다름 | 없음 | 결정됨(입력 §6-① 시드 1 · 07-CONTEXT) | 달력일 단위(D-709). 보관·수주 실패·이미 완료 프로젝트 제외 조건을 계획이 정함. PM = 프로젝트 담당 칸 |
| C5 | 지급 예정일 임박 → 경영관리, 마감 전 영업일 9시 | 옛은 전 직원에게 마감일 아침 `notices.ts:2884-2931`(`주간마감`) + 지급 대기 알림 | 없음 | 결정됨(D-701 · D-702 「경영관리만」) | 내용 = 그 주 지급 대상 목록(최종 승인 전 건 구분). 중복 키 예: entity=지급 주, entityId=지급일 |
| C6 | 마감 전 「아직 최종 승인 안 된 내 지출결의가 있는 기안자」 알림 | 옛 마감 알림의 절충판(`design-E.md` 주제④ #21) | 없음 | 결정됨(D17 「6종 더하되 꺼 둠」 · REPORT.md §9, §12 21:02) | 기본 꺼짐 시드. 전 직원 대신 할 일 있는 사람만 |
| C7 | 결재 대기 초과(그 단계 3영업일 경과 → 그 단계 결재자) | `notices.ts:2827-2883`(`결재기한`), 설정 `notify.approval_step_days`/`approval_due_soon_days`/`approval_overdue_cycle_days` | 없음 | 결정됨(입력 §6-③ · D-707 · D-708 · D-709) | 옛은 단계 기한 7일·독촉 2일마다·**위로 안 올림**(`docs/05_기본-정책.md:258`). 새는 3영업일·총 3회·2회차부터 팀장 추가 — 사용자 결정이라 따름. 결재자 = 팀장 본인이면 본인에게만(07-CONTEXT Claude's Discretion). N=0 허용(「결재 도착 즉시」 대체, 07-CONTEXT Deferred) |
| C8 | 증빙 미첨부(지급 완료 +7일, 증빙 0 → 기안자) | `notices.ts:1475-1614`(`RECEIPT_REMIND_SQL`), `:1615-1711`(구매), 설정 `notify.receipt_remind_*`(3회차 대표 추가·예상 수령일까지 멈춤) | 없음. 「증빙 있음」 판정은 `domain/evidence/has-evidence.ts:10` | 결정됨(입력 §6-④) | 옛은 기준일 「올린 뒤」, 새는 「지급 완료 +7일」·대표 안 올림·예상 수령일 칸 없음(`design-B.md:136`). 알림 대상 판정과 목록 거르개가 같은 조각을 쓰게(`design-B.md` T9: 「알림은 왔는데 목록에서 못 찾는 자리」 방지) |
| C9 | 선결제 14일 증빙 독촉 | 같은 `notices.ts:1527-1614`(선결제 기한 `expense.prepay_receipt_days`, 예상 수령일) | 기한 설정 `domain/settings/keys.ts:1262` `evidence.prepaid_due_days`(지급일 + 14), 목록 둘째 줄 `증빙 N일 경과` `domain/expenses/list.ts:111`. 알림은 없음 | 결정됨(07-CONTEXT 「Phase 6에서 미룬 둘」 · 입력 §6 · `design-B.md:136-138`) | 기준점이 옛 「제출일+14」→ 새 「지급일+14」로 바뀐 것이 06-10 결정 |
| C10 | 경영관리 대리 등록 시 담당 PM 알림 | 옛 대응 없음 | 데이터는 있음: `db/schema/corp-card-usages.ts:65` `registered_via IN ('self','proxy','purchase')` | 결정됨(D-710 「다음 영업일 9시 묶음, 즉시 경로 없음」) | 「새 대리 등록 건」 = `proxy` 사용 중 아직 알리지 않은 것 |
| C11 | 독촉 올림 사다리 · 상한 | `notices.ts:626-743`(`insertRemind`/`nextRound`), `:547` `remindRoundCap`(`notify.remind_max_rounds` 기본 3, 상한 넘겨도 회차 계속 올림), 1회 본인→2회 팀장→3회 대표 | `notification_log.round`(`db/schema/notifications.ts:33`) | 결정됨(입력 §5 · D-707 3영업일마다 · D-708 2회차부터 본인+팀장 · 대표 안 올림) | 회차 카운트는 계속 올리되 발송만 3회 상한(옛 방식 유용: 상한을 올려도 회차 중복 없음) |
| C12 | 결재 끝남(승인·반려·금액 바뀜·지급됨) → 기안자 | `notices.ts:883`(`approvalArrivedNotice`), `:1011`, 지급 알림 `payments.ts:938-985` | 없음(홈 「내 차례」 `domain/next-turn/index.ts:42-46`이 대체) | 결정됨(D17 6종 중 · 기본 꺼짐) | 최종 승인·반려 사건을 한 번만(`notification_log` 키) |
| C13 | 거래처 계좌 바뀜 → 지급 담당 | `server/src/vendors.ts:1128`, 설정 `notify.vendor_account_changed`(`notices.ts:39`) | 없음(`domain/vendors`) | 결정됨(D17 6종 중 · 기본 꺼짐; gap-verdicts G13 「계좌 변경 알림과 연결」) | 이체 사기 방어. 거래처마다 하루 1번. G13(누구나 등록 + 경영관리 뒤 확인)과 같은 PR 묶음 |
| C14 | 정산 상신 재촉 · 반려 방치 재촉 · 견적 재촉 | `notices.ts:2254-2330` / `:2536-2660` / `:2352-2430` (`FINISH_REMIND_SQL`·`REJECT_REMIND_SQL`·`QUOTE_REMIND_SQL`) | 없음 | 결정됨(D17 6종 중 · 기본 꺼짐) | 옛 「견적 답 재촉」 `:2437-2535`은 대응 개념 없음 → 안 가져옴 |
| C15 | 임자 없는 증빙 독촉(공개됐는데 붙임 0, 등록 N일) | `notices.ts:1747-1900`(`ORPHAN_RECEIPT_REMIND_SQL`·`임자없는증빙독촉`), 설정 `notify.orphan_receipt_*`(`050_seed_settings.sql:195`) | 없음 | 판단 필요 → §8 판단 2 | 06.1 `prep-260907.md` #37 「Y(Phase 7)」 · 설계 `design-B.md:325-329` |
| C16 | 알림함 + 안 읽은 수 + 90일 보관 | `notify.inbox_keep_days`, `notices.ts:1402`(삭제) | `domain/notify/inbox.ts:10`(`INBOX_RETENTION_DAYS=90`, 행은 안 지움), `app/(app)/notifications/` | 이미 있음(NOTI-01) | 표시 창만 90일 |
| C17 | 알림 클릭 시 해당 문서로 이동(착지 경로) | `notices.ts:493-514` `insertNotice` `path`(`:322`), 착지 함수 `:1446`·`:1541`·`:2119` | 없음 — `notification_log`에 링크 칸 없음(`db/schema/notifications.ts:22-36`), `app/(app)/notifications/inbox-list.tsx`에 href 없음 | 가져옴(§7 「화면이 다음 행동으로 이끈다」; 사용자 결정 아님·화면 원칙 근거) | 새 칸 없이 `entity`/`entityId`에서 URL 파생 가능. 조건 종류가 문서 종류를 이미 줌 |
| C18 | 결재 처리하면 해당 알림 자동 읽음(G33) | `notices.ts:1053-1102` `markHandledNoticesRead` | 없음(`domain/notify/inbox.ts`는 열 때 읽음 처리뿐) | 결정됨(gap-verdicts.md G33 「가져옴 · 07」) | 새 구조에서 「결재 도착」 즉시 알림이 없으므로 대상은 **결재 대기 초과(C7) 알림**. 결재자가 처리하면 그 문서의 C7 줄을 읽음으로 |
| C19 | 알림함 거르개·검색(G30) | `notices.ts:3044-3109` | 없음 | 안 가져옴(gap-verdicts.md G30) | 양이 많아지면 그때 |
| C20 | 이메일 알림 | 옛은 **없음**(`docs/05_기본-정책.md:200-202` 「1차는 앱 안 알림함만」) | 있음: `lib/email/smtp-sender.ts`, `domain/notify/email-phase.ts`, `digest.ts`(사람×날 한 통, D-706) | 결정됨(NOTI-02 · CEO 리뷰 D5 · D-711). `ERP260907-CONTEXT.md` §8-3의 「알림 채널 충돌」은 NOTI-02 확정으로 닫힘 | SMTP 값(발신 주소·인증 방식·일 한도, 입력 §10 7-B)은 여전히 미정 — D-711이 「알림함부터, 값 없으면 미설정」으로 진행하게 함 |
| C21 | 한 갈래가 알림함을 덮는 사고 대응(수금 연체 digest, 실측 977줄) | `notices.ts:1978-2050`, 설정 `notify.collect_overdue_digest` | 이메일만 사람×날 묶음(`digest.ts`). 알림함은 건별(D-706) | 이미 있음(수금은 범위 밖 `REQUIREMENTS.md:176`) | 건수 많은 종류(증빙 미첨부·임자 없는 증빙)는 한 사람에게 한 번에 수십 줄이 생길 수 있음 → `evaluate` 상한·배치 상한(`NOTIFY_TICK_BATCH_MAX`)이 안전판. 알림함 묶음 표시는 계획이 판단 |

## 5. 권한 · 정보 노출 · 행동 로그 (전 메뉴 검수)

| # | 기능 | 260907 file:line | 260917 현재 file:line | 판정 | 07 계획에 줄 메모 |
|---|---|---|---|---|---|
| D1 | 누수 스캔 생성기(전 액션·DTO·Excel 내보내기 × 계급) | 없음(옛은 정보 노출표 개념 자체가 없고 권한 87기능 × 직책: `server/src/menu-action-count.test.ts`, `menu-requires-chain.test.ts`) | `test/integration/leak-scan.test.ts`, `domain/permissions/dto-registry.ts`, `lib/actions/registry` | 결정됨(ROADMAP 기준 5 · ADMN-03) | 레지스트리 모듈 목록이 `leak-scan.test.ts` 상단 import로 **수동**이다(`:1-60`). `registerDto`/`registerAction`을 부르는 모듈 중 직접 import 안 된 것이 12개(`app/(app)/expenses/[id]/actions.registry`, `domain/expenses/dto`, `domain/approvals/dto`, `domain/leave/dto`, `domain/settlements/dto`, `domain/evidence/dto` 등; 간접 import 여부는 확인 못 함). 「등록 모듈이 전부 로드됐는지」 자동 검사 필요 |
| D2 | 계급별 기본값 표(시드) | `db/schema/040_seed_roles_permissions.sql`(기본 권한 전부 시드) | 시드는 **시스템 관리자에게만** 전부 허용(`domain/seed/index.ts:205-232`). 대표·본부 책임자·팀장·PM 기본값 없음. `db/migrations/0003_permissions_masters_spine.sql:41`은 계급 5개만 | 결정됨(ROADMAP 기준 5 「계급별 기본값 표 확정」 · REQ ADMN-10 갭: 새 배포 직후 대표 계정이 행동 로그 화면에서 404, 2026-10-01 사용자 결정) | 이것이 `app/(app)/admin/action-log/page.tsx:35` 404의 원인(대표 계급에 `admin.action-log` view 시드 없음). 시드 확정 = 사용자가 정할 업무 표 — 기본값 표 초안을 계획이 만들어 한 번에 확인 |
| D3 | 핵심 행동 로그 목록 · 끌 수 없는 종류 | 옛은 모든 표를 DB 트리거로 기록 `020_functions.sql:5000-5120` `write_audit`(바뀐 칸만, 비밀번호·주민번호 별표) + `:4801` `tables_without_audit` | `domain/action-log/record.ts:15-60`(CORE_ACTION_TYPES), `:112-160`(ALWAYS_ON). `permission_change`는 06.2-09로 끌 수 없음(`record.ts` ALWAYS_ON), **`settings_change`는 끌 수 있음**(ALWAYS_ON에 없음) | 결정됨(D7 「설정·권한 변경 기록 끌 수 없게 + 불변 트리거 = 예」 · REPORT.md §9, §12 20:58; OPS-05가 「핵심만」 정의) | 옛 전량 트리거는 OPS-05 요구와 결이 달라 유지(`design-E.md` 주제⑤). 남은 일: `settings_change` ALWAYS_ON 추가 |
| D4 | 전후 값 기록(이전 → 이후) | 옛 트리거가 바뀐 칸만 자동 기록 | 없음. `domain/settings/registry.ts:233-239`는 `{key}`만, `domain/permissions/matrix.ts:123-126`은 새 값만 | 결정됨(D7 포함, `already-captured.md` 07 「전후 값 기록·설정 변경 기록(D7)」) | `detail.changes = {칸:[이전,이후]}` 한 모양 + 마스킹(`design-E.md:230-258` 설계). 계좌·주민번호·비밀번호는 「바뀜」 또는 뒤 4자리(`lib/mask-tail4.ts`) |
| D5 | 행동 로그 표 불변 장치 | 옛 `020_functions.sql:192-209` `audit_log_immutable` | 없음(`db/migrations`에 TRIGGER 0건) | 결정됨(D7 포함) | `action_log`에 DELETE·TRUNCATE 거부, UPDATE는 `pruned_at`·`pruned_by` NULL→값만 허용(OPS-05 정리와 충돌 없게). 마이그레이션 → 위험 경로 **별도 PR, 사용자 머지** |
| D6 | 계정 잠금·해제 행동 로그 | 옛은 판 트리거 | `domain/action-log/record.ts:35-36,116-117`(account_lock/unlock), `domain/auth/lockout.ts`, `domain/auth/accounts.ts:104` 해제 + 로그 같은 tx | 이미 있음(D-712, 04.2-08) | — |
| D7 | 딸린 권한 자동 켬/끔(결재만 켜고 보기 안 켬 사고) | 옛 `020_functions.sql:1626-1645` `grant_required_permission`, `:4233-4247` `revoke_dependent_permissions` | 없음. `domain/permissions/matrix.ts`는 칸 하나씩 | 결정됨(`already-captured.md` 07 「딸린 권한 자동 켬끔」; 설계 `design-E.md` A7) | 보기를 끄면 쓰기·승인 끔, 쓰기·승인을 켜면 보기 켬 — 같은 tx, 로그, 토스트 되돌리기. 위험 경로(`domain/permissions/`) → 사용자 머지 |
| D8 | 퇴직일 지나면 로그인 막기 | 옛 `020_functions.sql:247-285` `block_inactive_login` | 없음. `domain/auth/hooks.ts:61`은 보관만 거부, `db/schema/auth.ts:40` 퇴직일은 결재 후보에서만 제외 | 결정됨(`already-captured.md` 07 「퇴직일 지나면 로그인 막기」) | 로그인 전 훅 + 세션 확인 둘 다. 위험 경로(`domain/auth/`) → 사용자 머지 |
| D9 | 사람 남은 팀·본부 보관 막기 | 옛 `server/src/org.ts:290-302` | 없음(`repositories/archive.ts:104-137` 확인 없음) | 결정됨(`already-captured.md` 07 「사람 남은 팀 보관 막기」) | 비동기 `blockReason`(`design-E.md` C2) |
| D10 | 보관함 복원으로 관리자 상한 우회(G36) | 옛 `server/src/people-rules.ts:68-80` | 06.4에서 처리됨: `domain/archive/index.ts:112`(`assertCanGrantRoles`), 복원 `domain/people/restore.ts`(내부는 확인 못 함) | 이미 있음(06.4 D-6416) | 07 검수에서 복원 경로 시험 한 줄 확인만 |
| D11 | 설정·권한 변경 사유 입력(G35) · 감사 IP·브라우저 굳힘(G43) | 옛 `settings-routes.ts:663`, `010_tables.sql:648` | 없음 | 안 가져옴(gap-verdicts.md G35, G43) | D7(전후 값)이 대신 |
| D12 | 계급별 노출 스모크(E2E) | 옛 `e2e/` (직접 대조 안 함) | `test/e2e/roles.spec.ts`, `mobile-roles.spec.ts` | 이미 있음 — 범위가 07 신규 화면까지 덮는지는 07 끝에서 확인 | 새 화면(알림 규칙 관리, 사람 잠금 단추, 지급 목록)을 스모크에 추가 |
| D13 | 개인카드 전표 숨김이 문서 칸 `expenses.evidence_type`에 매임 | 옛 `receipts.ts:230,280-285,356-360`, `db/legacy/073_private_receipt_kinds.sql` | `domain/evidence/private-files.ts:44` | 07 입력(06.1 인계) — `prep-260907.md` #31, `prep-07-carryover.md` A 「14 P3-3」, `06.1-14-SUMMARY.md:184-186` | 기안자가 종류를 바꾸면 결재 중 숨김 파일이 보임 → `files` 칸 추가(마이그레이션). 정보 노출 검수의 확정 항목으로 |
| D14 | 관리자 폼 8개 + `/account`를 `ui/form`·`ui/select`로 이관(A-H2·A-H3) | 해당 없음(옛 화면 틀 다름) | 부분 진행됨: 옆 패널 껍데기 `PanelForm`(04.6-04: `app/(app)/admin/code-tables/code-item-form.tsx:29`, `corp-cards/card-form.tsx:34`), `/account`는 `Form` 사용(`app/(app)/account/change-password-form.tsx:6`). **안쪽 네이티브 `<select>`/`<input>`가 남음**: `admin/vendors/vendor-form.tsx:295,322,425`, `admin/corp-cards/card-form.tsx:113,134,158,238`, `admin/settings/settings-form-client.tsx:125,147,177,438,457` | 결정됨(ROADMAP 기준 5 · `04.6-01-SUMMARY.md:15`) | 07 시작 시 DOM 실측으로 남은 폼을 다시 세어 범위를 정함(04.6이 얼마나 덮었는지 전수 확인은 못 함) |
| D15 | 파일 받기(Excel/CSV) 줄 수 상한 | 옛은 화면이 가진 줄 | `domain/evidence-records/export.ts:39`(상한 없음, T-061-135 accept → 07 이월 `prep-07-carryover.md` A) | 07 입력 | 내보내기 전수 점검 때 상한 또는 스트리밍 결정(기술 판단) |

## 6. 로그인 · 계정 잠금

| # | 기능 | 260907 file:line | 260917 현재 file:line | 판정 | 07 계획에 줄 메모 |
|---|---|---|---|---|---|
| E1 | 사람 화면 「잠금 풀기」 단추(+ 잠김 배지·거르개) | 옛 `app/src/pages/Org.tsx:3488`(단추), `:330`(문구), 서버 `server/src/people.ts:1011` `/api/people/:id/unlock`(권한 `people.edit`) | 함수는 있음: `domain/auth/accounts.ts:104` `unlockAccount`(권한 `admin.people` write, `account_unlock` 로그 같은 tx). **호출처는 `scripts/account-cli.ts:120`뿐, `app/` 호출 0건** | 결정됨(decisions.md 「G38 비밀번호 초기화·잠금 풀기 = 관리자 사람 화면 단추 → 07」, 10/7 11:47) | 위험 경로(`domain/auth/`) → **사용자가 GitHub에서 직접 머지**(CLAUDE.md §4). 사람 목록에 「잠김」 배지·건수 링크·검색(`screen-compare §2-18`). 폰: 행 「더보기」(`§2-18` 폰 항목) |
| E2 | 사람 화면 「비밀번호 초기화」 단추 | 옛 `Org.tsx:3244`(`:334`), `server/src/people.ts:935` `/api/people/:id/password`(관리자가 새 비밀번호를 **직접 입력**, 세션 끊기 + 실패 잠금 풀기 + 횟수 0 함께) | `domain/auth/accounts.ts:72` `resetPassword`(임시 비밀번호 **자동 생성**, 다른 세션 만료, `password_is_temporary`)—`unlockAccount`는 안 부름. 호출처 `scripts/account-cli.ts:114`뿐 | 결정됨(G38 · 위와 같음). 「초기화가 잠금도 같이 푼다」는 화면 선택 12건 중 하나(`screen-compare REPORT §4` 「잠금도 같이 풂」 — 사용자 말씀 없으면 추천대로) | 자동 생성 임시 비밀번호는 발급 직후 **한 번만** 화면에 보이고 전달은 관리자가 함(입력 칸 없음 = §7 결정 최소). 같이 풀려면 `resetPassword`에 `resolveOpenFailures` 호출을 더해야 함(`accounts.ts:72-99`에 없음) |
| E3 | 로그인 실패 잠금 한도 | 옛 `db/schema/050_seed_settings.sql:363-364`(5회 / 잠금 10분, 범위 3~10회·1~60분 잠금 `is_locked=false`), `server/src/login.ts:193-256`(저절로 풀림 + 풀리면 실패 횟수도 0, S-03) | `domain/settings/keys.ts:15-35`(`auth.lockout.threshold` 기본 5, `window_minutes` 기본 15), `lib/env.ts:64-65`, `domain/auth/lockout.ts`(창 안 열린 실패 N회), IP 속도 제한은 환경 변수(`keys.ts:37-41`) | 이미 있음(AUTH-01) | 차이: 옛은 설정 범위가 있었는데 새 스키마는 `min(1)`뿐이라 임계값을 1로 두면 한 번 틀려도 잠김. 범위 제안은 §8 판단 5 |
| E4 | 비밀번호 최소 길이·세션 만료 정책 | 옛 `login.ts:105`(`passwordMinLength`), 설정 `session_*` | 확인 안 함(이 대조 범위: 「로그인 한도」) | (대조 안 함) | — |

## 7. 옛 증빙 화면 항목 (Receipts.tsx)

| # | 기능 | 260907 file:line | 260917 현재 file:line | 판정 | 07 계획에 줄 메모 |
|---|---|---|---|---|---|
| F1 | 「며칠째」 열(단마다 시작점 다름: 들어옴=등록일, 공개됨=공개일) + 문턱 넘은 줄 「N일 지남」 배지 | `app/src/pages/Receipts.tsx:735-740`(열), `:1653-1690` `며칠째`, `:1631-1650` `remindStartDays`(서버가 준 문턱 `orphanStart` · 알림 장치가 꺼져 있으면 문턱 없음 → 딱지 안 그림), 설정 `notify.orphan_receipt_start_days`(`050_seed_settings.sql:195`, 기본 7일) | 없음. 증빙 표 열은 발행일·거래처·금액·공개·상태(`app/(app)/expenses/evidence/evidence-table.tsx:694-784`) | 판단 필요 → §8 판단 2(독촉 C15와 한 쌍) | 문턱은 규칙에서 서버가 주고 화면이 숫자를 박지 않음(옛 `Receipts.tsx:1631` 주석). 상태는 색·배지(§7) |
| F2 | 명세 분리(한 명세를 2~50줄로 나눠 행사별 배분, 합 어긋나면 막음) | `Receipts.tsx:2016`(단추 `onSplit`), 서버 `server/src/receipts.ts:4933-5300`(`나누기입력` `:4975-4990`) | 없음(한 기록 = 한 문서, 06.1-01 부분 유니크; `domain/evidence-records/attach.ts`) | 안 가져옴(감사 보고 「유지」: `design-B.md:321-323`, `:433` — 카드사 내역은 줄마다 증빙 기록이라 쪼갤 일이 없음, 종이 명세는 조정 줄) 하지만 06.1에서 사용자 확인 요청이 남음(`06.1-CONTEXT.md:129`, `prep-260907.md` #35) → §8 판단 3 | 07 구현 대상 아님. 사용자가 「있다」고 하면 별도 쿼터 |
| F3 | 증빙 「잠금 풀기」(봉인 풀기: 승인·지급 끝난 건에 잘못 붙은 증빙을 잠깐 열어 떼거나 금액 수정, 까닭 필수, 30분 뒤 자동 재잠금) | `Receipts.tsx:2300-2345`(까닭 칸 + `T.unlockHand` + `다시 잠금`), `app/src/pages/ReceiptsText.ts:286-290`, 서버 `server/src/receipts.ts:986-1112`, `:5297-5360`, 권한 `receipt.unlock`(`040_seed_roles_permissions.sql:318`), 설정 `receipt.unlock_minutes`(`050_seed_settings.sql:233`) | 다른 방식으로 대체됨: 승인 뒤 떼기 = 「무효 처리」 `expenses.evidence_void`(`domain/evidence-records/attach.ts:137`, `:616` `detachEvidenceRecord`), 지급 뒤 붙이기는 카드 R1이 막음, 결재 중 아무도 못 뗌(D-6110) | 결정됨(다름: `prep-260907.md` #15 · `06-SUMMARY.md:128`; 사용자 카드 R1) | 새로 만들지 않음. 옛 「프로젝트 완료 잠금 풀기/재잠금」(`projects.ts:5435`, `:5533`)도 `REPORT.md` §8 「버림」 — 새 「완료 되돌리기」는 D13(대표·관리자·사유 필수)로 별도 |

## 8. 판단 필요 (새로 사용자 판단이 필요한 차이)

각 항목 추천안 1개와 근거. 사용자가 이미 정한 것(§2~7의 「결정됨」)은 다시 묻지 않는다.

1. **지급 예정일 칸은 누가 직접 적나** — 07-CONTEXT(2026-09-24)는 「사람이 직접 적는 지급 예정일은 영업일만 허용·금요일 아니면 경고」로 사람이 예정일을 적는 전제인데, 이후 D18(2026-10-06 21:00 「희망 지급일 + 사유」)은 폼의 날짜 칸을 **희망 지급일**로 바꾸고 예정일은 자동 계산으로 두는 설계(`design-B.md:196-226`)다. 두 결정이 폼에서 겹친다.
   - 추천: **기안자는 희망 지급일(+사유)만 적고, 지급 예정일은 자동값. 지급 권한자(경영관리)만 예정일을 직접 바꾸며 바꾸면 얼림(A7).**
   - 근거: D18이 더 늦은 사용자 결정이고, 예정일을 PM이 적게 두면 자동 계산(EXP-11)의 뜻이 사라진다(`design-B.md:201`). 입력 칸이 하나 줄어 §7 원칙에도 맞는다. 이 해석이면 07-CONTEXT의 「직접 적는 예정일 영업일 검사」는 경영관리 수정 칸에만 적용.
2. **임자 없는 증빙 독촉(C15) + 「며칠째」 딱지(F1)를 07에 넣을지, 구매 처리 결과 알림은 넣을지** — D17의 6종에는 둘 다 없다. 옛에는 둘 다 있었다(`notices.ts:1747-1900`, `Receipts.tsx:1653-1690`; 구매 처리 결과 알림 `notify.purchase_handled`). `design-E.md` 주제④는 「06 데이터가 준비되면 구매 처리 결과·임자 없는 증빙을 더한다」를 추천으로만 적었다.
   - 추천: **임자 없는 증빙 독촉 + 며칠째 딱지는 넣는다(규칙은 6종과 같이 기본 꺼짐, 딱지는 규칙이 켜져 있을 때만). 구매 처리 결과 알림은 안 넣는다.**
   - 근거: 임자 없는 증빙은 「그 달 비용이 어느 행사에도 안 잡힌 채 넘어간다」(옛 `notices.ts:1722` 사유)는 돈 누락 방지이고, 06.1이 증빙 기록·공개를 새로 만들어 같은 체류가 생긴다(`prep-260907.md` #37). 판정 조각은 06.1-05 목록 거르개와 공유한다. 구매 처리 결과는 요청자가 구매 요청 목록의 상태 배지로 알 수 있고, 메일 피로 방지(입력 §4)와 맞지 않는다.
3. **명세 분리(F2) 업무가 실제로 있나** — 06.1에서 사용자 확인으로 넘긴 질문이 07로 이월됐다(`06.1-CONTEXT.md:129`). 사례: 한 카드 결제를 여러 문서에 나눠 붙이기 / 월 합산 세금계산서 한 장을 여러 지출결의에 나눠 붙이기.
   - 추천: **만들지 않는다(안 가져옴 유지).** 월 합산 세금계산서 사례가 실제로 있다고 말씀하시면 그것만 별도 항목으로 받는다.
   - 근거: 카드사 내역은 줄마다 증빙 기록이라 쪼갤 일이 없고(`design-B.md:323`), 종이 명세는 조정 줄로 처리된다. 옛 기능은 50줄까지 쪼개는 큰 기능(`receipts.ts:4933-5300`)이다.
4. **알림 규칙 관리자 폼이 열어 주는 범위** — NOTI-03은 「관리자가 등록된 조건 종류로 새 규칙을 만든다」인데, 받는 사람 선택지(계급·담당자·팀장)와 채널(알림함·이메일)을 어디까지 자유롭게 할지는 정해진 바 없다. 옛은 종류별로 받는 사람이 고정이었다(예: 증빙 독촉은 작성자+팀장+대표).
   - 추천: **받는 사람은 조건 종류가 기본값을 갖고, 관리자는 「계급 추가」와 켬/끔만 바꾼다. 일수(N)는 조건 종류가 허용하는 범위 안에서만 바꾼다. 이메일 채널은 규칙마다 켬/끔.**
   - 근거: 조건 종류가 사람 해석(예: 「그 단계 결재자」)을 코드에 가지므로 자유 선택은 의미 없는 규칙(예: 결재 대기 초과를 신입에게)을 만든다. 옛 설정 키가 바로 이 범위(시작·주기·팀장 추가·대표 추가)였다. 입력 §7은 대상 문서·N일·받는 사람(계급·담당자·팀장)·채널을 말했으므로 그 안에서 종류별로 좁히는 해석.
5. **로그인 잠금 설정에 범위를 둘지** — 옛은 실패 횟수 3~10, 잠금 1~60분으로 범위를 잠갔는데(`050_seed_settings.sql:363-364`) 새 스키마는 `min(1)`뿐이다(`domain/settings/keys.ts:19-20, 29-30`). 임계값을 1로 두면 한 번 틀려도 잠기고 관리자 풀기 단추(E1)로 풀어야 한다. 옛 범위가 사고에서 나왔다는 기록은 못 찾음(확인 못 함).
   - 추천: **옛 범위를 따른다(횟수 3~10, 창 1~60분).**
   - 근거: 설정 화면에서 한 칸 실수로 전 직원이 잠기는 사고를 막고 비용은 스키마 한 줄이다. 사용자가 범위 없이도 괜찮다고 하면 건너뛴다(07 필수 아님).

## 9. 같은 출처가 07로 지정했지만 이 대조 범위 밖인 항목 (계획이 놓치지 않게 이름만)

모두 「결정됨」(출처 `gap-verdicts.md`·`decisions.md`·`already-captured.md`), 파일 줄은 이번에 대조하지 않음. G1 고객사·담당팀 변경 범위(매출·리저브·지출결의 붙기 전까지만, decisions.md 10/7 12:10) · G5 고객 승인 근거 갈래/메모 · G7 거래처 검색칸 · G9 거래처 동시 수정 충돌 검사 · G11 견적 줄 일수·고객 비고 · G13 일하는 자리에서 거래처 등록 · G14 사후 상신 딱지 · G22 매출 계산서 파일 · G28 반반차 시작 시각 필수 · G29 연차 사람별 잔여 표 · G6 거래처 목록 내려받기 · 퇴직 때 모자란 연차 · 3년 근속 연차(D24) · 연차 종류별 결재선(D25) · 승인 뒤 연차 취소(D26) · 결재 일괄 승인·반려(D14, PC·태블릿만) · 프로젝트 삭제·되살리기(D12) · 완료 되돌리기(D13) · 고객 견적서 PDF(D15·D16) · 예산 기록·이력·권한(decisions.md 10/7 13:00).

## 10. 확인 못 한 것

- 결재 인스턴스에 「최종 승인 시각」 전용 칸이 있는지(`approval_steps.acted_at`만 확인, A9).
- `domain/people/restore.ts` 내부가 상한 검사를 부르는지(D10; `archive/index.ts:112`는 보관 쪽만 확인).
- 누수 스캔의 12개 미직접-import 모듈이 간접으로 로드되는지(D1).
- 옛 「경영관리 이번 주로」 전용 단추 유무(A11), 옛 `payments.ts` 주 구간이 지급 요일 설정과 완전히 같은 잣대인지(§1 마지막 줄).
- 옛 e2e(`e2e/`)의 계급별 노출 스모크 대조(D12).
- 로그인 정책 중 비밀번호 최소 길이·세션 만료는 이 대조에서 제외(E4).
- 알림 건수가 많은 종류의 알림함 묶음 표시 필요성은 실데이터 없이 추정(C21).
