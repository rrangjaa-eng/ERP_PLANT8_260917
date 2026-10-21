# Phase 7: 공휴일·지급일·마감·알림 + 전 메뉴 권한 검수 - Research

**Researched:** 2026-10-20 (main 9122c31 + docs 775ff29 기준)
**Domain:** 지급 예정일·결재 마감 순수 함수(EXP-11·12) / 알림 규칙 표·조건 종류(NOTI-03) / 전 메뉴 권한·로그 검수 + 거래처·PO·예산·프로젝트 카드 이월
**Confidence:** MEDIUM-HIGH (코드 위치·값은 이번 세션에 연 파일로 확인, 260907 줄은 열어 확인한 것만 인용. 확인 못 한 곳은 아래 「확인 못 함」으로 표시)

> 표기: `[VERIFIED: 경로:줄]` = 이번 세션에 그 파일을 열어 확인(값은 옆에 원문 인용). `[CITED: …]` = 문서 인용. `[ASSUMED]` = 확인 못 함 — Assumptions Log 참조. 옛 저장소는 `ERP_PLANT8_260907 경로:줄`(읽기 전용, 열어 확인한 줄만).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

> 결정 번호는 D-701부터. D-701~D-712는 2026-09-24 논의, D-713부터 2026-10-21 재논의.

#### 이미 확정된 입력 (다시 묻지 않음 — 출처가 정본)
- 공휴일 표·영업일 함수·알림함·이메일 묶음·notify-tick·잠금 로그는 04.2가 만들었다. 07은 그 위에 얹기만 한다 — `domain/holidays/business-day.ts`(`isBusinessDay`·`addBusinessDays`·`toKstDate`), `domain/notify/*`
- 지급일·결재 마감·알림은 **같은 공휴일 표와 같은 파생 날짜**를 읽는다(260907 「목요일 고정 알림」 버그 — 옛 `server/src/notices.ts:2896-2918` `isodow = 4` 고정, 실제 마감은 `db/schema/020_functions.sql:96-130`. 재발 방지 = D-715) — 입력 §1
- 지급 예정일 = 작성일(세금계산서·영수증에 적힌 날) + 60일을 넘기기 전 마지막 금요일(금요일이 공휴일이면 앞 영업일), 거래처별 조정 — 입력 §2, EXP-11, 옛 `020_functions.sql:3415-3460`
- 작성일 원천 = 가장 이른 붙은 증빙 `issued_on` → 없으면 제출일 → 없으면 오늘(옛 `020_functions.sql:3985-4002`, 06.1 인계 D-6520 「붙임이 문서 값을 안 바꿈」)
- 결재 마감 = 지급일 전 영업일 14시(설정), 넘기면 그 주 지급 대상에서 빠짐, 판정은 `domain/rules.gate` 경유 — 입력 §3, EXP-12
- 알림: 하루 1번 오전 9시 tick, 채널 = 알림함 + 이메일(사람마다 하루 한 통, D-706), 독촉 1회 본인 → 2회부터 본인+팀장, 총 3회, 대표까지 안 올림 — 입력 §4·§5, D-706~D-708
- 기본 규칙 시드: ① 프로젝트 종료 +7일·지출결의 0건 → 담당 PM ② 지급 예정일 임박 → 경영관리(D-701·702) ③ 결재 대기 그 단계 3영업일 → 그 단계 결재자 ④ 지급 완료 +7일·증빙 0건 → 기안자, + 선결제 14일 증빙 독촉(`evidence.prepaid_due_days` 이미 있음, `domain/settings/keys.ts:1263-1270`) + 대리 등록 → 담당 PM(D-710) — 입력 §6
- 규칙 구조: 조건 종류는 코드 등록(`domain/notify/condition-kinds.ts`의 `ConditionKind{kind,label,dateUnit,evaluate}` — 지금 `CONDITION_KINDS=[]` :23), 규칙 = 조건 종류 × 파라미터, 관리자는 등록된 종류로 규칙을 만든다 — 입력 §7, NOTI-03
- 260907 대조 결정(2026-10-06 카드, `/mnt/project-files/notes/260907-audit-full/REPORT.md` §9): **D7** 설정·권한 변경 기록은 끌 수 없게 + 전후 값 + 행동 로그 불변 트리거 · **D11** 거래처 사업자번호 검증합·중복 막기·갈래 필수·갈래 검사는 바뀔 때만 · **D17** 알림 조건 6종(결재 끝남·거래처 계좌 바뀜·마감 전 미승인 기안자·정산 상신 재촉·반려 방치·견적 재촉)은 **더하되 시드는 꺼 둠** · **D18** 긴급·앞당김 대신 「희망 지급일 + 사유」 · **D19** 마감 넘긴 건 자동 밀림 유지 + 경영관리 「이번 주로」 · **D33** 수금 지연 = 규칙 하나 + 배지
- 260907 재대조 결정(2026-10-07, `/mnt/project-files/notes/260907-full-inventory/gap-verdicts.md`·`decisions.md`): G5 고객 승인 근거 갈래(발주서/이메일/구두)+메모(PO와 같은 PR) · G6 거래처 목록 내려받기 · G7 거래처 검색칸(정렬·쪽 나눔 없음) · G9 거래처 동시 수정 충돌 검사 · G13 일하는 자리에서 누구나 거래처(계좌까지) 등록, 경영관리가 뒤에 확인 · G22 매출 발행 줄 계산서 파일 · G31 공휴일 바뀌면 지급 전 예정일 다시 셈 · G33 결재 처리하면 그 결재 알림 자동 읽음 · G38 사람 화면 잠금 풀기·비번 초기화 단추
- 예산(2026-10-07 사용자, `/mnt/project-files/notes/fund-forecast/design.md` 맨 위): 사전견적 칸을 「PO 금액」으로(선택 입력), 예산 = PO 금액 × 원가율(없으면 승인 견적 합계 × 원가율, 둘 다 없으면 0), 증액은 차이 × 원가율 자동 더함, 초과는 표시만, 원가율은 경영관리 설정값, 경영관리 「예산 현황」만. 07 = PO 번호·발주서 파일·예산 이력·거래처 서류·담당자 여러 명, 09 = 「나갈 돈」 화면
- 프로젝트 상세(2026-10-07 17:00 사용자 카드 「07에 넣기」): 카드 개편(기본·고객 승인·손익 한 장, 고치기 버튼 하나) 때 기간·PO 금액 인라인 칸에 마우스·폰용 「취소」 동작, 견적 줄 「지출결의 올리기」가 숨는 이유 표시(`quote-table.tsx:2094` 부근)
- ADMN-10 갭: 새 배포 직후 대표가 행동 로그 화면에서 404(2026-10-01 사용자 결정 — 고친다). 원인: 대표 계급 `admin.action-log` 시드 없음(`domain/seed/index.ts:204-228`, `app/(app)/admin/action-log/page.tsx:34`)

#### 2026-09-24 결정 (유지 — 이 페이즈 몫)
- **D-701:** 지급 예정일 임박 알림은 결재 마감 전 영업일 오전 9시(= 지급일 2영업일 전 9시)
- **D-702:** 그 알림의 받는 사람은 경영관리만, 내용은 그 주 지급 대상 목록
- **D-703:** 결재 마감까지 **대표 최종 승인**이 끝나야 그 주 지급 대상. 판정 = 결재 마지막 단계 승인 시각 ≤ 마감 시각(인스턴스에 승인 시각 칸이 없으면 `approval_steps.acted_at` — `db/schema/approvals.ts:76`, 계획이 확인) — **Reversibility:** costly
- **D-704:** 마감 넘긴 건·60일 안에 금요일이 없는 건은 다음 지급 가능 금요일로 자동으로 민다(60일을 넘겨도). 「마감 지나 밀림」 배지. 빈 칸으로 남기지 않는다
- **D-705(후반):** 공휴일 확정·추가·삭제로 날이 바뀌면 지급 전 문서의 자동 계산 날짜가 다시 파생된다. 사람이 바꾼 날(D-714)은 건드리지 않는다
- **D-707·D-708:** 독촉 3영업일마다, 2·3회차는 본인 + 팀장
- **D-709(종류별 단위):** 결재 대기 초과·지급 예정일 임박은 영업일, 나머지는 달력일. 조건 종류가 자기 단위를 가진다(`dateUnit` 이미 타입에 있음). 관리자가 단위를 고르는 칸은 없다
- **D-710:** 대리 등록 → 담당 PM 알림은 다음 영업일 9시 묶음(즉시 경로 없음)
- 04.2 몫이던 D-705 전반·D-706·D-709 비영업일 미발송·D-711·D-712는 끝났다

#### 범위 (2026-10-21)
- **D-713:** 사용자 카드 「07 핵심+관련만, 나머지 07.1」(2026-10-21 01:39 KST). 항목 정본 `07-SCOPE-ITEMS.md`. 계획은 그 표의 모든 행을 플랜에 넣거나 이 CONTEXT 결정으로 뺀 이유를 남긴다. 뺀 것: N23 고객 수금 기한·N24 다 받으면 알림 → Phase 9(D-720), U5 서명 PUT 재사용(C-64) → 06.1 실행 스레드가 이미 위험 경로 PR로 맡음, N18 즉시 경로 → D-716, N20 → D-718. 더한 것: 거래처 계좌번호 자릿수 서식(C-35, 같은 거래처 폼)

#### 지급 예정일·마감
- **D-714 (사용자 카드 2026-10-21 01:53 KST 「희망일만 적고 예정일은 자동」):** 기안자는 **희망 지급일 + 사유**만 적고(D18, 둘 다 선택, 한쪽만 적으면 막음), 지급 예정일은 자동값이다. **지급 권한자(경영관리)만** 예정일을 직접 바꾸며, 바꾼 값은 「수동 지정」으로 남아 자동 재계산이 덮지 않는다. 수동 지정은 영업일만 허용, 금요일이 아니면 경고만(07-CONTEXT 9/24 Claude's Discretion을 경영관리 칸에만 적용). 희망 지급일은 결재 경로·마감 판정을 바꾸지 않고 경영관리 판단 재료다. — **Reversibility:** costly(칸·마이그레이션)
- **D-715:** 지급 예정일·결재 마감 시각·지급 주(이번 주/다음 주)·임박 알림 기준일은 **순수 함수 한 벌**에서만 나온다. 지급 목록·마감 gate·조건 종류·화면 배지가 모두 이 함수를 부른다(옛 목요일 고정 버그의 구조적 차단). 자동값은 **읽을 때 계산**하고 저장하지 않는다(사람이 바꾼 값만 저장) — 그래서 공휴일 변경 재파생(G31·D-705)이 별도 트리거 없이 성립한다. 지급 목록 쿼리가 SQL로 범위를 걸러야 하면 계획이 같은 규칙의 SQL 조각을 함수와 동치 시험으로 묶는다
- **D-716 (사용자 카드 2026-10-21 01:52 KST 「다음 영업일 9시 묶음」):** 결재 도착·결과·지급 완료·거래처 계좌 바뀜 같은 「사건」 알림도 **다음 영업일 9시 tick 묶음**으로 나간다(알림함·메일 모두). 「어제 tick 뒤 생긴 사건」을 사건 id 유니크 키로 한 번만 만든다(D-710 선례). 즉시 경로는 만들지 않는다
- 회사 기본 설정 3키(지급 기한 일수 60 · 지급 요일 금 · 마감 시각 14:00)를 설정 레지스트리에 더한다. 260907 `date_rule=after_limit`은 안 가져온다(D-704가 대신)
- 「이번 주로」(D19): 마감 넘긴 건을 경영관리가 그 주에 넣는 동작. 확인 창 대신 되돌리기 + 행동 로그. 돈 경로 → `/cso`
- 지급 목록: 그 주 결재 중인 건을 따로 보이되 합계에서 뺀다(260907 `server/src/payments.ts:157`). 구간은 D-715 함수
- 거래처 지급 기한 칸: 1~180일, 협력사 갈래만, 비우면 회사 기본값. 같은 마이그레이션에 거래처 `version`(G9 동시 수정 검사)을 넣는다

#### 알림 규칙
- **D-717 (사용자 카드 2026-10-21 01:52 KST 「켬·끔·N일·받는 계급 추가만」):** 규칙 화면에서 관리자가 바꾸는 것은 **켬/끔 · N일(조건 종류가 허용하는 범위 안) · 받는 사람 계급 추가 · 이메일 채널 켬/끔**뿐이다. 기본 받는 사람(그 단계 결재자·담당 PM·기안자·경영관리)은 조건 종류가 코드로 해석한다(`domain/org` 기존 함수). 규칙 변경은 행동 로그(D7, 끌 수 없음)
- **D-718 (사용자 카드 2026-10-21 01:52 KST 「넣지 않음」):** 구매 처리 결과 알림은 넣지 않는다(요청자는 구매 요청 목록 상태 배지로 안다).
- **D-719:** 「알림 끄기」는 규칙 켬/끔이다. 사람별 수신 끄기는 만들지 않는다(9/24 Deferred 유지)
- **D-720:** 수금: D33의 「수금 지연 규칙 하나 + 배지」만 07. 고객별 수금 기한 칸·「다 받으면」 알림은 수금 데이터가 생기는 Phase 9 몫(260907-audit-full design-E 주제 ④ 대응표 #15·#22·#23)
- **D-721:** 임자 없는 증빙 독촉(공개됐는데 붙임 0, 등록 N일)은 07 조건 종류로 넣고 **시드는 꺼 둔다**(D17과 같은 취급). 판정 조각은 06.1 증빙 목록 거르개와 공유. 「며칠째」 딱지는 07.1
- 시드 켜짐 여부: 기본 규칙 4개 + 선결제 독촉 + 대리 등록은 **켬**(9/24 입력 §6), D17 6종·임자 없는 증빙·수금 지연은 **꺼 둠**
- 결재 대기 초과(③)는 N=0을 허용해 「결재 도착」 알림을 대신한다(9/24 Deferred). 결재를 처리하면 그 사람의 해당 결재 알림은 자동 읽음(G33)
- 알림 클릭 착지: 새 칸 없이 기존 `entity`/`entityId`로 문서 URL을 만든다

#### 권한·검수
- **D-722:** 계급별 기본값 표(계급 × 메뉴 × 동작, 계급 × 정보 항목)는 **첫 검수 플랜이 초안을 만들고 사용자 확인 카드 한 장으로 확정**한다. C-88(시스템 관리자가 증빙 전부 봄·관리자 계급 증빙 등록 권한·대표/본부장 404 정책)과 대표 행동 로그 404도 그 표에서 함께 정한다. 시드는 insert-if-absent(운영 값 덮지 않음)
- 미매핑 DTO 0: `*Dto` 타입 열거와 `domain/permissions/dto-registry.ts` 대조 단위 시험을 새로 만든다. 누수 스캔은 등록 모듈 자동 로드 검사를 더한다(수동 import 12개 누락, `test/integration/leak-scan.test.ts`)
- 행동 로그: 핵심 행동 목록을 전 메뉴 기준 표로 확정, `settings_change`도 끌 수 없게, 전후 값 `detail.changes`(계좌·주민번호·비밀번호는 「바뀜」 또는 뒤 4자리), 불변 트리거(DELETE·TRUNCATE 거부, 정리 표시 UPDATE만) — D7
- 관리자 폼: 7개는 이미 `PanelForm`(core-state). 남은 일 = 설정 페이지 폼(`settings-form-client.tsx`)과 `/account`를 `ui/form` 페이지 배치(§6-3)·§7-2 오류 표시로, 남은 네이티브 select/input 정리. 코드표 인라인 blur 칸(`code-item-form.tsx:137`)은 「표 안 입력」으로 보고 폼 이관 대상에서 뺀다(Claude 판단, 실행 첫 DOM 실측에서 남은 폼을 다시 센다)
- 06.4 이월(P-H): 계급 화면 위임자 범위 칸, 상한 밖 사람 상세 버튼 숨김, 계급 이름 바꾸기·보관 서버 가드, 소속 사람 남은 계급 보관 막기, `evidence.intake`·설정 본부 권한 판정 어긋남, 딸린 권한 자동 켬/끔, 거래처 권한 잘게, 사람 남은 팀·본부 보관 막기
- 개인카드 전표 숨김을 `files` 칸에도(C-65, 06.1 인계) — 정보 노출 검수 확정 항목

#### 인증·사람
- **D-723 (Claude 판단, 근거 남김):** 로그인 IP 한도는 같은 사무실 30명이 9시에 몰려도 막히지 않게 **기본값을 올린다**(IP당 분당 10 → 60, `RATE_LIMIT_LOGIN_MAX`, `lib/auth.ts:69-71`·`lib/env.ts:66`). 비밀번호 추측은 기존 계정별 잠금(5회/15분, `auth.lockout.*`)이 막는다. 잠금 설정에 범위를 둔다(횟수 3~10, 창 1~60분 — 옛 `050_seed_settings.sql:363-364`). 운영 값은 배포 환경 변수로 — 사용자가 다른 숫자를 원하면 그 PR 리뷰에서 바꾼다
- 잠금 풀기·비번 초기화 단추(G38): `unlockAccount`·`resetPassword`(`domain/auth/accounts.ts:72,104`)를 사람 화면에 연결. 초기화는 임시 비밀번호를 한 번만 보이고 잠금도 같이 푼다(screen-compare 추천안). 잠김 배지·건수 링크
- 퇴직일 지나면 로그인 막기(로그인 전 훅 + 세션 확인)
- 사람 목록 페이지 나눔(C-03, 잠금 배지와 같은 화면)

#### 거래처·PO·프로젝트
- 거래처 묶음: 내려받기·검색칸·동시 수정 검사·일하는 자리 등록(「확인 전/확인 됨」 표시, 06.1 자동 등록 거래처도 같은 표시)·사업자번호 검증합+중복 막기(이미 중복된 행 먼저 처리)·갈래 필수·계좌 변경 기록 + 지급 목록 배지 + 계좌 바뀜 알림(D17)·담당자 여러 명·서류(사업자등록증·통장 사본)·계좌번호 자릿수 서식
- PO·예산: PO 금액 칸(이름 변경, DB 변경 없음)·PO 번호·프로젝트 서류(발주서 여러 장)·고객 승인 근거 갈래+메모(G5)·매출 발행 줄 계산서 파일(G22)·예산 이력 표·원가율 설정·경영관리 「예산 현황」
- 프로젝트 상세 카드 개편 + 인라인 칸 취소 + 지출결의 버튼 숨는 이유 + 폰 폭 견적 표 구매 요청 문(C-10, 행에서 바로 누를 문이 필요한지는 UI-SPEC이 정함)

#### 순서·PR 분리
- **D-724:** 위험 경로는 별도 PR(사용자가 GitHub에서 머지, CLAUDE.md §4 머지): 마이그레이션·스키마(거래처 지급 기한+version·사업자번호 유일 색인, 지출결의 희망 지급일+사유·수동 지정, 알림 규칙 표, PO 번호·프로젝트 서류·거래처 서류·담당자·예산 이력, 행동 로그 불변 트리거, `files` 노출 칸), `domain/auth/`(잠금 풀기·초기화·퇴직 로그인·로그인 한도), `domain/permissions/`(P-H 서버 가드·딸린 권한). 나머지는 세션 머지 가능
- **D-725:** 06.1 갭 실행(06.1-15·16, 브랜치 `claude/project-thread-qvy9gl`)과 겹치는 파일 — `app/(app)/expenses/[id]/page.tsx`·`expense-form.tsx`(희망 지급일 칸), `docs/design/SYSTEM.md`·`DECISIONS.md` — 를 건드리는 플랜은 그 변경이 main에 들어간 뒤로 둔다. 07은 `evidence-table.tsx`를 건드리지 않는다
- 07.1(공용 표 폰 2줄 등)과 같은 파일(`quote-table.tsx`·SYSTEM.md §7-3)을 건드릴 때는 07 플랜이 먼저 main에 들어가고 07.1이 뒤따른다(07이 전환 길)

### Claude's Discretion
- 독촉 받는 사람이 팀장 본인이거나 팀장 자리가 비면 올리지 않고 본인에게만 반복
- 조건 종류 6종의 「N일」 기본값과 허용 범위, 제외 조건(보관·수주 실패·이미 완료)
- 알림함 건수 많은 종류 묶음 표시·상한(실데이터 없음 — 계획이 판단)
- 알림 규칙 표 스키마, 수동 지정 예정일을 별도 칸으로 둘지 표시 칸으로 둘지
- 지급 목록·홈 지급 묶음 행 수 상한(todo N-6은 측정 방아쇠 유지)
- 04.2 /review 이월 P3 6건과 /qa ISSUE-002(잠금 N번째 시도 문구)·/cso F1(잠금 확인-후-실행 경쟁) 중 07 플랜이 같은 파일을 만질 때 함께 고칠 것(todo `2026-09-26-04-2-review-deferred-p3.md`)

### Deferred Ideas (OUT OF SCOPE)
- 07.1: `/mnt/project-files/07-prep/07-vs-07.1.md` ② 92행 전부(별도 계획 스레드)
- Phase 9: 고객별 수금 기한 칸·「다 받으면」 알림(D-720), 「나갈 돈」 화면
- 사람별 이메일 수신 끄기(D-719), 즉시 알림 경로(D-716), 구매 처리 결과 알림(D-718)
- 카카오톡 알림 — NOTI-05, v2. 캘린더 — D23 범위 밖. 명세 분리 — 안 가져옴
- 팀장·본부 책임자 1명 제한 — 07 목록에 없음, 필요하면 별도 논의
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXP-11 | 지급 예정일 = 작성일 + 기한(60일) 넘기기 전 마지막 금요일(공휴일이면 앞 영업일), 거래처별 조정, 규칙은 설정 | §2 순수 함수 `pay-schedule.ts`(읽을 때 계산) · 설정 3키 · 거래처 지급 기한 칸(마이그레이션 S1) · 수동 지정은 기존 `scheduled_payment_date`를 「수동값 전용」으로 재사용 · 소비처 교체 목록(§2.4) |
| EXP-12 | 결재 마감 = 지급일 전 영업일 14시, 최종 승인이 마감 전이어야 그 주 지급 대상, 판정은 `rules.gate` | §2.3 `payment.cutoff` gate 규칙(주 자격 판정) · 승인 시각 = 현재 차수 `max(approval_steps.acted_at)` · 밀림(D-704)·「이번 주로」(D19) |
| NOTI-03 | 관리자가 알림 규칙(조건 종류 × 파라미터)을 켬/끔·일수·받는 계급·이메일로 설정, 기본 규칙 시드 | §3 `notification_rules` 덮어쓰기 표 + 코드 기본값 · 조건 종류 등록부 · tick 평가 확장 · D-716 사건 종류 · 메뉴·권한·누수 스캔 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

플래너가 플랜 검사에 쓸 지시(`/home/user/ERP_PLANT8_260917/CLAUDE.md`, `.claude/rules/*.md`):

- 패키지 매니저 **pnpm만**. 새 의존성은 이유 한 줄 + 승인 후(§5). 이 페이즈는 **새 패키지 0개**를 전제한다(아래 Package Legitimacy Audit).
- TDD(실패 테스트 → 최소 구현 → 리팩터), `any` 금지, 시크릿 코드·커밋 금지, 요청받지 않은 리팩터·주석·파일 이동 금지, 기존 컨벤션 우선(§3.3·§5).
- `.planning/` 수동 편집·`git push --force`·프로덕션 DB 직접 명령 금지(§2). 마이그레이션은 `pnpm db:generate`로만, 번호는 main 마지막 다음, **한 웨이브에 스키마 바꾸는 플랜 하나**(`.claude/rules/db.md`). 금액 `bigint`. DROP은 코드가 읽지 않는 배포 뒤. `pnpm lint:sql`(Squawk).
- 위험 경로 PR은 세션이 머지하지 않는다 — 정규식 `db/migrations/`·`db/schema/`·`domain/auth/`·`domain/permissions/`·`lib/crypto*`·`scripts/(deploy|rollback|bootstrap-gcp|promote-guard).sh`·`.github/workflows/`·`infra/`·`.claude/`·`CLAUDE.md` [VERIFIED: `.claude/hooks/plant8-skill-gate.sh:311`]. **`domain/seed/`·`lib/auth.ts`·`lib/env.ts`는 이 정규식에 없다** — 그러나 권한 시드·로그인 한도는 성격상 권한·인증이라 사용자 머지를 권한다(판단, §7 PR 분리).
- Post-build 게이트(묶음 = PR마다 한 번): 코드 `/review` · 화면(`app/`의 `.tsx`·`.css`, `ui/`) `/review` + `/design-review` → `/qa` · 돈·결재(`domain/`의 `money`·`corp-cards`·`reserves`·`revenue`·`approvals`, `repositories/`의 `corp-cards`·`approvals`·`reserve-entries`·`revenue-entries`) `/review` + `/cso`. 인증·권한·암호화·외부 입력은 판단해서 `/cso`.
- 화면: `docs/design/SYSTEM.md` 기준, 새 색·서체·radius 금지(토큰은 `tokens.css`), 시스템 이탈은 `DECISIONS.md` 기록 뒤 SYSTEM.md 수정. UI 파일을 만지기 전 `design-gate` 스킬 호출(훅 강제). 독립 DOM 감사는 실행자가 아닌 별도 에이전트가 `CI=true`로 실측, 스크린샷 육안 금지. Codex는 `/design-review`·`/plan-design-review`에서만. `mcp__claude-in-chrome__*` 금지.
- 완료 판정은 `CI=true`(로컬 dev 통과는 완료 신호가 아님). 작업 중에는 lint·typecheck + 관련 단위·통합 + 건드린 화면 E2E만, 전체는 PR ready 뒤 CI가 한 번(§5).
- 플랜은 `granularity: coarse`. `risk:` 태그(돈·권한·DB 잠금·마이그레이션) 플랜만 Opus 실행자 + Opus 독립 검토 1명, 나머지 Sonnet. 절차를 건너뛰어야 하면 먼저 말하고 승인(§4 공통).
- 테스트 DB(`erp_test`)는 공유라 DB·Playwright 작업은 한 번에 하나, `ui/` 경로 테스트는 `domain/`을 import하지 못함, 인증 테스트는 `x-client-ip` 헤더 필요(`.claude/rules/tests.md`).
- 이 파일·@import·`.claude/`는 세션 중 수정 금지(위험 경로).

## Summary

이 페이즈의 뼈대는 세 덩이다. (1) **날짜 순수 함수 한 벌**: 지급 예정일·마감 시각·지급 주·임박 알림 기준일을 `domain/payments/pay-schedule.ts` 같은 순수 모듈 하나가 만들고, 지급 목록·gate·조건 종류·배지가 모두 그것만 부른다. 자동값은 저장하지 않고 읽을 때 계산한다(D-715) — 그러면 공휴일 변경 재파생(G31·D-705)이 공짜다. 사람(경영관리)이 바꾼 날만 저장하는데, **기존 `expenses.scheduled_payment_date`(db/schema/expenses.ts:42, 지금은 기안자 입력)를 「수동값 전용」으로 재사용**하면 「수동 지정」 플래그 칸이 필요 없다(null = 자동). 새 칸은 희망 지급일 + 사유 둘뿐이다. (2) **알림 규칙**: `CONDITION_KINDS`가 비어 있고 tick 뼈대(잠금·dedup·상한·이메일 단계)는 04.2가 끝냈다. 07은 종류를 채우고, 규칙 표는 **코드 기본값 + 덮어쓰기 표**로 두면 시드 마이그레이션이 필요 없다. 사건 알림은 즉시 경로 없이 `evaluate`가 「지난 tick 이후 사건」을 사건 id 키로 만든다(D-716) — 이것은 04.3-10이 만든 `insertEventNotifications`(행동 즉시 행 생성) 관례와 다르므로 SYSTEM.md §7-12 주석이 필요하다. (3) **검수**: `*Dto` 열거 단위 시험·등록 모듈 자동 로드 검사·계급 스모크 E2E를 새로 만들고, 행동 로그 R4~R6와 시드 R2·R3를 고친다.

발견한 가장 큰 사실 두 가지. **첫째**, 거래처 V5·V6은 이미 main에 있다(`vendors.kind` CHECK, `vendors_business_no_live_key` 유일 색인, `businessNoProblem()`, `DuplicateBusinessNoError`, `addVendorKind`, 마이그레이션 0027·0030). 07-CONTEXT/SCOPE의 「유일 색인 마이그레이션」은 낡은 기술이고 V5·V6은 화면 문구·열기 링크 정도만 남는다. 거래처에 없는 것은 지급 기한·`version`·담당자·서류·계좌 변경 기록이다. **둘째**, 결재 승인 시각 칸이 없고(`approval_steps.acted_at`뿐), 승인 목록 정렬은 이미 SQL이 `max(acted_at)`을 쓴다 — 마감 판정은 같은 식을 재사용하되, **승인 목록(`listExpensePage`)의 SQL 정렬 키가 `scheduled_payment_date`라 자동값으로 바꾸면 SQL로 정렬할 수 없다**. 권장은 승인 묶음만 「최소 칸 읽기 → 도메인에서 계산·정렬 → id로 본문 읽기」다(D-715가 허용한 SQL 조각 + 동치 시험은 차선).

**Primary recommendation:** 스키마 변경 4개 플랜(S1 지급 칸+거래처 기한/version · S2 알림 규칙+이메일 상태 · S3 거래처/PO/서류/예산 묶음 · S4 행동 로그 트리거)을 각각 한 웨이브·한 위험 경로 PR로 직렬화하고, 코드는 그 사이 웨이브에 `pay-schedule.ts` 순수 함수(설정 3키 + 거래처 기한 읽기) → gate·지급 목록·승인 목록·세금 기준일 교체 → 조건 종류 → 알림 규칙 화면 → 검수 순으로 쌓는다. 순수 함수와 시험을 가장 먼저(스키마 PR 이전, 거래처 기한은 `null` 파라미터로) 세울 수 있어 병렬성이 좋다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 지급 예정일·마감·주·알림 기준일 계산 | `domain/payments`(순수 함수) | — | D-715 한 벌. DB·설정·시계 import 없는 순수 모듈(결재 `route.ts`와 같은 관례, `domain/approvals/route.ts` 머리 주석). 설정·공휴일·승인 시각은 호출자(domain 서비스)가 읽어 넘김 |
| 수동 지정 예정일 저장·되돌리기 | API/Backend(Server Action → `domain/payments`) | Database(`expenses.scheduled_payment_date`) | 지급 권한(`expenses.payments` write)만. 기존 `saveScheduledPayDate`(`domain/payments/index.ts:633-667`) 확장 |
| 마감 gate(주 자격) | `domain/rules`(`registerGateRule`) | `domain/payments` | EXP-12 「`rules.gate` 경유」. 몸통은 순수 함수를 부름(기존 `payment.*` 규칙 관례) |
| 지급 목록 정렬·주 구간 | `domain/payments/targets.ts`(도메인에서 판정·정렬·쪽 나눔) | Database(기본 정렬만) | 이미 도메인이 모든 행을 읽어 판정·거르고 쪽 나눔 — 자동값 정렬도 거기서 |
| 승인 목록 정렬(`listExpensePage`) | API/Backend(도메인 사전 정렬) | Database | SQL로 자동값을 못 만듦 → §2.4 |
| 알림 조건 평가·dedup·상한 | `domain/notify`(tick, 조건 종류) | Database(`notification_log` 유일 키) | 04.2 뼈대 위에 얹음. Cloud Scheduler가 `0 9 * * *` Asia/Seoul로 호출(`scripts/deploy.sh:641-644`) |
| 알림 규칙 저장(켬/끔·일수·계급·이메일) | Database(`notification_rules` 덮어쓰기 표) | `domain/notify`(코드 기본값 병합) | 시드 없이 기본값은 코드, 변경분만 행 |
| 알림 규칙 화면 | Frontend Server(RSC 페이지) + Server Action | Browser(`ui/form` 클라이언트) | 새 메뉴 `admin.notification-rules`, `authedActionClient` + 누수 스캔 등록 |
| 알림함 착지 URL | `domain/notify/inbox.ts` | Frontend | `entity`/`entityId` → 경로 + 보임 판정(D-722 계열 정보 노출) |
| 권한·정보 노출 검수 | 테스트(단위 + 통합 누수 스캔 + E2E 스모크) | `domain/permissions` 시드 | 생성기가 DTO·ACTION·EXPORT 레지스트리 × 시드 계급으로 케이스를 만든다 |
| 행동 로그 불변·전후 값 | Database(트리거) + `domain/action-log` | `domain/settings/registry.ts` | R5 `detail.changes`는 `registry.ts`(위험 경로 아님)와 `domain/permissions/matrix.ts`(위험 경로) 양쪽 |
| 로그인 한도·퇴직 로그인 막기·잠금 풀기 | `domain/auth`·`lib/auth.ts` | `lib/viewer.ts` | 위험 경로 → 사용자 머지 |

## Standard Stack

### Core (모두 이미 repo에 있음 — 추가 없음)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16 App Router (RSC + Server Actions) | 화면·액션 | 프로젝트 스택 [CITED: CLAUDE.md §1]. 코드를 쓰기 전 `node_modules/next/dist/docs/`의 해당 가이드를 읽을 것(CLAUDE.md 하단 Next.js 블록) |
| next-safe-action (`authedActionClient`) | repo 설치본 | 모든 Server Action | 4계층 규약, 누수 스캔 등록 필수 |
| Drizzle ORM + drizzle-kit | repo 설치본 | 스키마·마이그레이션(`pnpm db:generate`) | `.claude/rules/db.md` |
| zod | repo 설치본 | 설정 스키마(`z.coerce.number()`) | `SettingDef` 관례 [VERIFIED: `domain/settings/keys.ts:1262-1270`] |
| vitest (2 projects) / Playwright | repo 설치본 | 단위·통합·E2E | §Validation Architecture |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ui/form`(`Form`, `FormAlert`, `TextField`, `PanelForm`, `ui/select`) | repo 내부 | 관리자 폼·새 규칙 화면 | R13·N2·거래처/프로젝트 칸 |
| `domain/holidays/business-day.ts` | repo 내부 | `isBusinessDay`·`addBusinessDays`·`toKstDate` | 순수 함수 안에서 `HolidayLookup`을 주입받아 사용 |
| `domain/holidays/calendar.ts` `loadHolidayLookup(years)` | repo 내부 | DB에서 연도별 공휴일 읽기 | 호출자가 연도 범위를 넉넉히 미리 읽음(§Pitfalls P3) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 승인 묶음 도메인 사전 정렬 | SQL 조각 + 동치 시험 | D-715가 허용. 공휴일 보행·밀림 반복을 SQL 재귀로 옮겨야 해 유지비가 큼 — 승인 건수가 작은 규모(30명)라 도메인이 낫다 |
| 알림 규칙 = 덮어쓰기 표 + 코드 기본값 | 시드 행 마이그레이션 | 시드 행은 코드 기본값과 어긋날 위험, 종류 추가마다 데이터 마이그레이션. 덮어쓰기 표는 행이 없으면 기본값 |
| `scheduled_payment_date` 재사용(수동값 전용) | 별도 `manual_flag` 칸 또는 `manual_payment_date` 새 칸 | 새 칸은 마이그레이션이 하나 늘고 기존 읽기 코드 17곳이 어느 칸을 읽는지 갈린다. 재사용은 레거시 값 처리만 결정하면 됨(§Open Questions Q2) |

**Installation:** 없음. `pnpm add` 하지 않는다.

**Version verification:** 새 패키지를 추천하지 않으므로 `npm view` 대상 없음. 로컬 도구: node v22.22.0, pnpm 10.33.0 [VERIFIED: 이번 세션 `node --version`·`pnpm --version`].

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (없음) | — | — | — | — | — | 이 페이즈는 외부 패키지를 설치하지 않는다 |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

실행 중 거래처 파일 업로드·엑셀 내보내기 등은 기존 `files`·`excel_export` 경로를 재사용한다 — 새 의존성이 필요해 보이면 CLAUDE.md §5(이유 한 줄 + 승인) 절차로 멈춘다. `package-legitimacy check` seam은 대상이 없어 호출하지 않았다.

## Architecture Patterns

### System Architecture Diagram

```
 [Cloud Scheduler 0 9 * * * Asia/Seoul] --OIDC POST--> /internal/notify-tick
        │  (scripts/deploy.sh:641-644)          app/internal/notify-tick/handle.ts
        ▼
   runTick ── 비영업일이면 종료(D-709) ── withNotifyTickLock(420_401)
        │
        │ for kind of CONDITION_KINDS(개정: 덮어쓰기 표와 병합한 "켜진 규칙")
        ▼
   kind.evaluate({today, params:{days}, since})          ┌──────────────────────────┐
        │                                                │ domain/payments/         │
        │  임박·마감·밀림 종류 ───────────────────────────▶│ pay-schedule.ts (순수)   │◀── 공휴일 lookup, 설정 3키,
        │                                                │ resolvePaySchedule()     │    거래처 기한, 승인 시각
        │  사건 종류(승인결과·계좌바뀜·지급완료)           └───────────▲──────────────┘
        │   = 지난 tick 이후 사건을 사건 id 키로(D-716)               │
        ▼                                                            │
   NotificationCandidate[] ──(받는 계급 추가 확장, 사다리 N10)        │
        ▼                                                            │
   findExistingDedupKeys → oldestFirst → batchMax 자르기              │
        ▼                                                            │
   INSERT notification_log … ON CONFLICT DO NOTHING + notify_tick_runs │
        ▼ (커밋 뒤, 영업일만)                                         │
   email-phase: 사람마다 한 통(digest.ts) → SMTP / skipped_no_smtp     │
                                                                     │
 [지급 목록 listAllPaymentTargets] ── judgeTargets ── gate("payment.cutoff") ┘
 [승인 목록 listExpensePage]  ── 승인 묶음: 최소 칸 → 도메인 계산·정렬 → id로 본문
 [지출결의 상세/폼/문서/목록 DTO] ── effectivePayDate = manual ?? 자동값
 [세금 pickTaxDates] ── 기준일에 effectivePayDate를 넘김(조용히 바뀌지 않게)
```

### Recommended Project Structure

```
domain/payments/pay-schedule.ts        # 순수 함수 한 벌 (+ test/unit/payments/pay-schedule.test.ts)
domain/payments/pay-schedule-load.ts   # 설정·공휴일·승인 시각·거래처 기한을 읽어 순수 함수에 넣는 어댑터
domain/rules/register.ts               # payment.cutoff 규칙 한 건 추가
domain/notify/condition-kinds.ts       # ConditionKind에 defaults·허용 범위 추가, CONDITION_KINDS 채우기
domain/notify/kinds/*.ts               # 종류별 파일(임박·결재대기·증빙재촉·…) — 각자 evaluate
domain/notify/rules.ts                 # 덮어쓰기 표 읽기/쓰기 + 코드 기본값 병합
db/schema/notification-rules.ts        # (S2) 덮어쓰기 표
app/(app)/admin/notification-rules/    # page.tsx · form · actions.ts · actions.registry.ts
test/unit/dto-registry-coverage.test.ts# "*Dto 타입 열거 ↔ DTO_REGISTRY" 새 시험
test/e2e/role-smoke.spec.ts            # 계급별 노출 스모크(desktop 프로젝트에 자동 포함)
```

### Pattern 1: 날짜 순수 함수 (D-715 · J1·J6·J8·J12)

**What:** 입력(기준일·기한 일수·수동값·승인 시각·지금·공휴일 lookup·설정)을 받아 `{autoPayDate, payDate, cutoffAt, alertDate, pushed, pushReason, manual}`을 돌려준다. 한 주 단위 「자격 판정」 `eligibleForWeek(approvedAt|now, cutoffAt)`가 gate와 같은 몸통이다.

**260907 원형 (열어 확인):**
- 지급일: `limit = base + term` → 지급 요일까지 **뒤로** 걸음(`limit` 당일이 지급 요일이면 그대로), 그 뒤 `previous_business_day(d)` [VERIFIED: `ERP_PLANT8_260907 db/schema/020_functions.sql:3438-3452`, 인용 `d := v_limit;` … `d := d - 1; n := n + 1;` … `d := previous_business_day(d);`]. 거래처 기한이 비면 회사 기본 [VERIFIED: `020_functions.sql:3431` `v_term  := coalesce(p_term_days, setting_int('payment.term_days'));`].
- 마감: 그 주 지급 요일(anchor) → `pay := previous_business_day(anchor)` → `d := previous_business_day(pay - 1)` → `(d + setting_time('payment.cutoff_time')) at time zone 'Asia/Seoul'` [VERIFIED: `020_functions.sql:96-130`].
- `previous_business_day`는 「d 이하 가장 가까운 영업일」 의미(30일 보호) [VERIFIED: `020_functions.sql:3578` 근처, 앞선 세션에서 확인].

**우리 쪽 번역 시 함정:** `addBusinessDays(d, n)`은 n≠0이면 **반드시 한 칸 이상 걷는다** [VERIFIED: `domain/holidays/business-day.ts:59`, 앞선 세션 확인]. 그래서 「d 이하 가장 가까운 영업일」은 `isBusinessDay(d, lookup) ? d : addBusinessDays(d, -1, lookup)`로 써야 한다(`addBusinessDays(d, 0)`은 **앞으로** 구른다).

**Example (설계 스케치 — 값 이름은 제안, 실행 시 시험으로 고정):**
```ts
// domain/payments/pay-schedule.ts — DB·설정·시계 import 금지(결재 route.ts와 같은 순수 모듈 관례)
import { addBusinessDays, isBusinessDay, type HolidayLookup } from "@/domain/holidays/business-day";

export type PayScheduleConfig = { termDays: number; payWeekday: number; cutoffHHmm: string }; // 금 = 5, "14:00"

const prevBusinessOnOrBefore = (d: string, lookup: HolidayLookup) =>
  isBusinessDay(d, lookup) ? d : addBusinessDays(d, -1, lookup);

export function resolvePaySchedule(input: {
  baseDate: string;            // 가장 이른 붙은 증빙 issued_on → 제출일(KST) → 오늘
  termDays: number;            // 거래처 기한 ?? 회사 기본
  manualDate: string | null;   // expenses.scheduled_payment_date (경영관리가 정한 값만)
  approvedAt: Date | null;     // 현재 차수 max(approval_steps.acted_at), 승인 전이면 null
  now: Date;
  lookup: HolidayLookup;
  cfg: PayScheduleConfig;
}): { payDate: string; autoPayDate: string; cutoffAt: Date; alertDate: string; manual: boolean; pushReason: "cutoff" | "no-slot" | null } {
  /* 1) limit = base + termDays  2) anchor0 = limit 이하 마지막 payWeekday(당일 포함)
     3) autoPayDate = prevBusinessOnOrBefore(anchor0)
     4) 기준 시각 ref = approvedAt ?? now. anchor를 base 이후 첫 지급 요일 이상에서 시작해
        week마다 pay = prevBusinessOnOrBefore(anchor), cutoffAt = kst(prevBusinessOnOrBefore(pay-1), cfg.cutoffHHmm)
        ref <= cutoffAt 인 첫 주를 고른다(없으면 +7일 반복, 상한 가드).
     5) manualDate가 있으면 payDate = manualDate, 같은 식으로 cutoffAt만 계산(밀지 않음)
     6) alertDate = cutoff 날짜의 전 영업일(D-701) */
  throw new Error("sketch");
}
```
`[ASSUMED]` 「60일 안에 금요일이 없는 건」(거래처 기한이 6일 이하라 base~limit 사이에 지급 요일이 없는 경우)은 「base 이후 첫 지급 요일부터 밀기 시작」으로 해석했다 — D-704 문구는 「다음 지급 가능 금요일」이다. 시험으로 고정하고 사용자 확인 카드에 한 줄로 올린다(Assumptions A2).

### Pattern 2: gate는 「주 자격」 한 가지 (EXP-12 · J7)

**What:** `registerGateRule({name:"payment.cutoff", check})`. ctx = 순수 함수가 만든 `{manual, approvedAt, cutoffAt}`. 수동 지정이면 통과(경영관리가 이미 판단 — D19 「이번 주로」가 곧 수동 지정), 승인 전이면 `{allowed:false, reason:"결재 중"}`(J11의 「따로 보임」 구분용), 승인 시각이 마감 뒤면 `{allowed:false, reason:"마감 지나 밀림"}`. **지급 처리 동작 자체를 막지는 않는다** — D-703은 「그 주 지급 대상 소속」 판정이다.
**Where:** `domain/rules/register.ts`의 `payment.*` 묶음 옆 [VERIFIED: `domain/rules/register.ts:353-368` 앞 확인 — 인용 `name: "payment.approval-required"`, `name: "payment.evidence-required"`, `name: "payment.method-evidence-mismatch"`]. `gate(doc, name, ctx)`는 미등록 이름에 `UnknownGateRuleError`를 던진다 [VERIFIED: `domain/rules/gate.ts`, 앞선 세션 확인].
**호출자:** `domain/payments/targets.ts`의 `judgeTargets`(기존에 `gate(row,"payment.evidence-required", …)`를 부름), 임박 알림 종류(N5), 지급 목록 「결재 중」 묶음(J11).

### Pattern 3: 알림 규칙 = 코드 기본값 + 덮어쓰기 표 (NOTI-03 · N1~N3)

**What:** `ConditionKind`에 `defaults:{enabled, days?, emailEnabled}`와 `daysRange?:{min,max}`를 더한다. tick은 `kind별 규칙 = defaults ⊕ notification_rules 행`으로 평가한다. 관리자 화면은 등록된 종류 전부를 보여 주고 바꾼 칸만 행으로 저장한다. 규칙 변경은 `settings_change` 행동 로그(+전후 값, R4·R5).
**현재 뼈대 (원문 인용):**
```ts
export type ConditionKind = {
  kind: string;
  label: string;
  // D-709: 기한을 영업일로 세는지 달력일로 세는지(Phase 7이 쓴다).
  dateUnit: "business" | "calendar";
  evaluate(ctx: { today: string }): Promise<NotificationCandidate[]>;
};
export const CONDITION_KINDS: readonly ConditionKind[] = [];
```
[VERIFIED: `domain/notify/condition-kinds.ts:12-23`]. `evaluate`의 ctx는 지금 `today` 하나 — 일수 파라미터와 사건 창(`since`)을 더해야 한다. `test/support/notify-tick.ts`의 `createTestConditionKind`가 `evaluate({today})` 모양에 의존하므로 새 필드는 **선택 필드**로 더해 기존 시험을 깨지 않는다.

### Pattern 4: 사건 알림 = 「지난 tick 이후」 창 + 사건 id 키 (D-716)

즉시 경로 없이 `evaluate`가 사건 원천(결재 처리 `approval_steps.acted_at`, 지급 기록 생성 시각, 거래처 계좌 변경 기록)에서 `since` 이후 발생분을 후보로 만든다. 창이 넉넉해도 안전한 이유는 `notification_log_dedup_key` 유일 색인이 `(condition_kind, entity, entity_id, recipient_id, round)`로 한 번만 받기 때문이다 [VERIFIED: `db/schema/notifications.ts` 유일 색인, 앞선 세션 확인]. `since`는 `notify_tick_runs`의 마지막 성공 행(`kst_date`·`finished_at`)에서 얻고, 없으면 최근 7일로 후퇴한다 [VERIFIED 칸 이름: `db/schema/notifications.ts:59-76` 인용 `kstDate: date("kst_date").notNull(),` `businessDay: boolean("business_day").notNull(),`]. 사건 id를 `entityId`에 넣어 키가 사건별 유일이 되게 한다(결재 단계 id·지급 id·계좌 변경 id).

**충돌 주의:** 04.3-10 `insertEventNotifications`는 행동 트랜잭션 안에서 **행을 즉시 만들고 이메일만 다음 영업일로 미룬다**(SYSTEM.md §7-12 「사건 알림」, 앞선 세션 확인). D-716은 알림함 행도 다음 영업일 9시에 나가게 하라고 한다. 07의 새 사건 종류는 D-716을 따르고, 04.3-10 경로는 건드리지 않으며(07.1/후속), SYSTEM.md §7-12에 「07 사건 종류는 tick 평가로」 한 줄을 남긴다 — SYSTEM.md 수정은 06.1-16 이후(D-725).

### Anti-Patterns to Avoid
- **금요일을 `isodow = 4`처럼 상수로 박는 코드**(260907 버그의 재발): 지급 요일은 설정값, 마감은 반드시 pay-schedule에서. `rg "getDay\(\) === 5|isodow"`로 plan 검사.
- **자동 예정일을 DB에 저장**: 공휴일이 바뀌어도 안 바뀐다(D-715 위반). 저장은 수동값만.
- **gate·목록·알림이 각자 마감 시각을 계산**: 같은 함수 한 곳만.
- **알림 규칙 시드를 데이터 마이그레이션으로 넣기**: 코드 기본값과 어긋난다.
- **`settings_change`를 `ALWAYS_ON`에 넣고 `CORE_ACTION_TYPES`/`ACTION_TYPE_LABELS`는 그대로 두기**: 세 곳을 같이 고친다(§Pitfalls P8).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 영업일 계산 | 새 날짜 루프 | `isBusinessDay`·`addBusinessDays`·`toKstDate`(+ `loadHolidayLookup`) | 04.2가 연도 미확정(후보 공휴일)·`HolidayYearNotLoadedError`까지 다뤘다 |
| 중복 알림 방지 | 앱 메모리 집합 | `notification_log_dedup_key` 유일 색인 + `ON CONFLICT DO NOTHING` | tick 잠금·재실행·창 겹침을 모두 흡수 |
| 이메일 묶음·상한·보류 | 새 발송 루프 | `email-phase` + `digest.ts`(문구만 SC-07 형식으로 고침) | 04.2-10 선점·불완전 수신자·`evaluationFailed` 보류를 이미 처리 |
| 마감 시각 비교 | 문자열/타임존 수작업 | KST 날짜 + `HH:mm` → `new Date(\`${d}T${hhmm}:00+09:00\`)` 한 곳 | KST는 DST가 없어 고정 오프셋이 안전 |
| 행동 로그 기록 | 직접 INSERT | `recordAction(viewer, entry, {tx})` | 미등록 유형은 `UnknownActionTypeError` — 유형은 `CORE_ACTION_TYPES`·`ACTION_TYPE_LABELS`·`ALWAYS_ON_ACTION_TYPES`에 함께 |
| 사업자번호 검증·중복 | 새 검사 | `businessNoProblem()`·`DuplicateBusinessNoError`·`assertBusinessNoFree`(이미 있음) | V5는 화면 문구만 남음 |
| 파일 업로드·보임 | 새 업로드 경로 | `files`(+ `owner_kind` 값 추가)·`upload_intents` 기존 흐름 | 거래처 서류·발주서·계산서 파일(V8·W3·W7) |
| 폼 | 자체 `<input>`/오류 표시 | `ui/form`·`ui/input/TextField`·`FormAlert`·`PanelForm` | R13 이관 대상이 바로 이런 자체 구현 |

**Key insight:** 이 페이즈에서 새로 짓는 것은 「날짜 함수」와 「규칙 표」뿐이고, 나머지는 04.2·06·06.1이 만든 틀에 값을 채우는 일이다. 손으로 짠 날짜·알림 로직이 곧 260907의 목요일 버그를 부른다.

## Runtime State Inventory

이 페이즈는 이름 바꾸기·마이그레이션 전용은 아니나, **「사전견적 → PO 금액」 이름 변경(W1)**과 **`scheduled_payment_date` 의미 변경**이 있어 해당 부분만 점검했다.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `projects.pre_estimate_*`(`moneyColumns("preEstimate")`, `db/schema/projects.ts:33`) — W1은 DB 변경 없이 화면 이름만(fund-forecast design.md 「새 칸을 두지 않고 사전견적 칸을 바꿔 쓴다」). `expenses.scheduled_payment_date`의 기존 값은 기안자가 입력한 것 | 사전견적: 화면·문구만(코드 편집). 예정일: 기존 값의 처리 결정 필요(Open Q2) — 데모/스테이징 행뿐이라면 NULL로 두는 것이 가장 단순 |
| Live service config | Cloud Scheduler 작업 `0 9 * * *` Asia/Seoul → `/internal/notify-tick` [VERIFIED: `scripts/deploy.sh:641-644`] — 07은 호출 시각·경로를 바꾸지 않는다 | 없음 — 확인함 |
| OS-registered state | 없음 (Cloud Run/Scheduler만) | 없음 — 확인함 |
| Secrets/env vars | `RATE_LIMIT_LOGIN_MAX`(기본 10 → 60, D-723), 운영 값은 배포 환경 변수 | 코드 기본값 변경 + 운영 환경 변수는 사용자가 확인(없으면 기본값을 따름) |
| Build artifacts | `pnpm build:cli`(CLI 번들)는 CI가 안 돌린다 — `scripts/account-cli.ts`가 `unlockAccount`·`resetPassword`를 부르므로 `domain/auth/accounts.ts`를 고치면 번들 실행 확인 [CITED: `.claude/rules/deploy.md`] | `domain/auth/accounts.ts` 변경 플랜에 `pnpm build:cli` + 실제 실행 확인 단계 |

## Common Pitfalls

### P1: 세금 기준일이 조용히 바뀐다
**What goes wrong:** `pickTaxDates`는 `doc.scheduledPaymentDate ?? opts.todayKst`를 지급 예정일·지급일 기준일로 쓴다 [VERIFIED: `domain/expenses/tax.ts:45-61` 앞선 세션 확인]. 자동값을 저장하지 않으면 `scheduledPaymentDate`는 대부분 null → 세율 기준일이 전부 「오늘」로 떨어져 **지금과 다른 세율이 적용될 수 있다**(원천세·부가세).
**How to avoid:** 호출자(`targets.ts:80`, `payments/index.ts:280/308` 등)가 `pickTaxDates`에 **유효 예정일(수동 ?? 자동)**을 넘기게 한다. 돈 경로 → `risk:` 태그 + `/cso`. 시험: 같은 문서가 공휴일 변경 전후로 세율 기준일을 어떻게 갖는지 고정.
**Warning signs:** 지급 예정일 기준 세금 규칙(`domain/code-tables/tax-rule.ts:20`)을 쓰는 코드표 항목의 세액이 시드 데이터에서 달라짐.

### P2: 승인 목록 정렬을 SQL로 못 한다
**What goes wrong:** `listExpensePage`의 승인 묶음(`group_rank = 4`)은 `pay_key = scheduled_payment_date`로 SQL 정렬·쪽 나눔한다 [VERIFIED: `repositories/expenses.ts:631-696` 앞선 세션 확인, 주석 「승인 = 지급 예정일 ↑(없음은 끝)」]. 자동값은 DB에 없다.
**How to avoid:** 승인 묶음만 별도 길 — (1) 보임 범위를 적용한 id·기준일 입력 칸만 읽고 (2) 도메인에서 유효 예정일을 계산해 정렬·쪽 자르기 (3) 그 id로 본문 읽기. D-715의 SQL 조각 + 동치 시험은 차선. **승인 건수가 작은 규모**라는 전제는 Assumptions A5.

### P3: 공휴일 lookup이 읽지 않은 해에 닿는다
**What goes wrong:** `loadHolidayLookup(years)`가 돌려주는 lookup은 읽지 않은 해에서 `HolidayYearNotLoadedError`를 던진다 [VERIFIED: `domain/holidays/calendar.ts:7-30`]. 밀림 반복(+7일씩)이 해 경계를 넘으면 터진다.
**How to avoid:** 호출자가 `[올해-1 … 올해+2]`를 미리 읽거나 오류를 잡아 그 해를 더 읽고 다시 계산(calendar.ts가 이미 같은 패턴). 또 `loadHolidayLookup`은 `ensureHolidayCandidates(year)`를 부른다 — **읽기 경로가 후보 공휴일을 쓸 수 있는지** 확인(Open Q8). RSC 렌더에서 쓰기가 불가하면 읽기 전용 로더를 따로 만든다.

### P4: 인스턴스 `updated_at`을 승인 시각으로 쓰면 틀린다
**What goes wrong:** 승인 뒤 증빙을 바꿔도 `approval_instances.updated_at`이 오른다. 05-09 주석이 이미 경고 [VERIFIED: `repositories/expenses.ts:618-623` 인용 「승인 뒤 증빙 추가가 인스턴스 updated_at을 올리므로 승인 날짜는 지금 차수 단계의 마지막 처리 시각에서 읽는다」].
**How to avoid:** D-703 판정은 `max(approval_steps.acted_at)`(현재 차수, `approval_routes.round = approval_instances.current_round`) — `statusChangedAtExpr` 식을 공용화하거나 같은 쿼리 조각을 재사용 [VERIFIED 식: `repositories/expenses.ts:625-629`].

### P5: 시각과 영업일의 경계
**What goes wrong:** 승인이 마감일 14:00 정각, 또는 마감일이 휴일로 앞당겨진 경우. `<=` vs `<`.
**How to avoid:** 경계 시험 — 정각 포함(D-703 「≤」), 마감 직후 1분, 금요일 공휴일 주(목요일 지급·수요일 마감), 월요일 휴일 직후, 추석 연휴 주(J12 비고).

### P6: 알림 규칙 일수 0
**What goes wrong:** N6 「결재 대기 초과」는 N=0을 허용해 「결재 도착」을 대신한다. `addBusinessDays(d, 0)`은 **앞으로** 구른다(영업일 아니면 다음 영업일).
**How to avoid:** N=0 분기를 명시 처리하고 시험(비영업일에 도착한 결재 → 다음 영업일 9시 tick).

### P7: 이메일 끔 규칙의 상태 값
**What goes wrong:** `notification_log.email_status`는 CHECK로 `('pending', 'sending', 'sent', 'failed', 'unknown', 'skipped_no_smtp')`만 허용 [VERIFIED: `db/schema/notifications.ts:48-53`]. 규칙별 이메일 끔을 표현할 값이 없다.
**How to avoid:** S2 마이그레이션에 새 값(예: `skipped_rule_off`)을 더하는 CHECK 교체(NOT VALID + VALIDATE, Squawk). `email-phase`/`inbox` 쿼리는 `pending`만 집으므로 그대로 건너뜀. 읽는 쪽(`inbox.ts` 배지)이 새 값을 알도록.

### P8: 새 행동 유형은 세 곳에 함께
`recordAction`은 코어 목록에 없는 유형에 `UnknownActionTypeError`를 던진다 [VERIFIED: `domain/action-log/record.ts`, 앞선 세션 확인]. 추가할 유형(후보: `password_reset`, `vendor_account_change`, `payment_schedule_change`, `notification_rule_change`)은 `CORE_ACTION_TYPES`·`ACTION_TYPE_LABELS`·(끌 수 없으면) `ALWAYS_ON_ACTION_TYPES` 세 곳 + 정리 불가 목록(`UNPRUNABLE_ACTION_TYPES`)을 검토. 현재 `settings_change`는 코어(:23)이나 ALWAYS_ON(:108-147)에는 없다 [VERIFIED: `domain/action-log/record.ts:23,80,108-147`].

### P9: 거래처 계좌 변경 기록을 `action_log`에서 파생하지 않는다
`document_update`는 설정으로 끌 수 있는 유형이라 이력의 근거가 될 수 없다. `updateVendor`는 전후 값 없이 `document_update`를 남긴다(앞선 세션 확인). V9·N14는 **전용 표**(예: `vendor_account_changes`) + 끌 수 없는 유형이 맞다.

### P10: 위험 경로 PR이 서로 걸린다
- `domain/permissions/menus.ts`에 `admin.notification-rules`를 더하는 변경은 위험 경로 → 사용자 머지. 알림 규칙 화면 PR을 둘로 나눠(① 메뉴 키 + `role-menu.ts` + SYSTEM §6-10 + 시험 ② 화면) 나머지를 무인 머지 가능하게 하거나, 메뉴를 `admin.settings` 아래 붙여 위험 경로를 피할지 결정(Open Q6).
- `db.md`: 스키마 바꾸는 플랜은 웨이브당 하나.

### P11: 마이그레이션 번호
HEAD main의 마지막은 `0038_phase61_evidence.sql` [VERIFIED: `ls db/migrations | tail`]. 06.1-15·16은 코드가 main에 아직 없고(문서만, `origin/claude/project-thread-qvy9gl`) 스키마 변경 여부는 확인하지 못했다. 웨이브 시작·푸시 전 `origin/main` 머지 후 번호 충돌 시 재생성(`.claude/rules/db.md`).

## Code Examples

### 계급 스모크 / 누수 스캔의 등록 모듈 자동 로드 검사 (R1)
```ts
// test/unit/leak-scan-autoload.test.ts — 설계 스케치
// 1) glob("app/**/actions.registry.ts") 전부가 test/integration/leak-scan.test.ts import에 있는지 → 이미 leak-scan-coverage.test.ts가 함.
// 2) 새로 필요한 것: domain/**의 registerDto() 호출 파일이 누수 스캔 실행 시 실제로 DTO_REGISTRY에 올라왔는지.
//    → 통합 시험 첫머리에서 domain/**/dto*.ts 패턴을 동적 import(glob)로 모아 로드한 뒤 DTO_REGISTRY.size를 단언.
```
[VERIFIED: `test/unit/leak-scan-coverage.test.ts`가 `actions.registry.ts` 전부의 import를 강제, `test/integration/leak-scan.test.ts`는 상단에 수동 부수효과 import ~53개 — 앞선 세션 확인]. 「`*Dto` 타입 열거 ↔ `DTO_REGISTRY`」는 아직 없음(R1 새 시험).

### 설정 레지스트리에 키 더하기 (J2)
```ts
// domain/settings/keys.ts — 기존 선결제 기한 정의의 모양을 그대로 따른다
export const EVIDENCE_PREPAID_DUE_DAYS: SettingDef<number> = {
  key: "evidence.prepaid_due_days",
  kind: "simple",
  schema: z.coerce.number().int().min(1),
  label: "선결제 증빙 기한",
  hint: "지급일부터 센 날수",
  namespace: "증빙",
  unitLabel: "일",
  default: 14,
```
[VERIFIED: `domain/settings/keys.ts:1262-1270`]. 새 키(`payment.term_days` 60 / `payment.weekday` 금 / `payment.cutoff_time` 14:00)는 기존 네임스페이스 `"지급"` [VERIFIED: `domain/settings/keys.ts:1290` `namespace: "지급",`]에 `SETTING_DEFS.push(...)`로 더한다. 키 이름은 260907 설정 키와 같게 제안한다 [VERIFIED: `ERP_PLANT8_260907 db/schema/020_functions.sql:98,3431-3433` `setting_text('payment.weekday')`, `setting_int('payment.term_days')`, `setting_time('payment.cutoff_time')`] — 우리 repo의 키 이름은 플래너 결정.

### 로그인 한도·잠금 범위 (U3·U4)
```ts
// lib/env.ts:66
  RATE_LIMIT_LOGIN_MAX: numberWithDefault(10),
// lib/auth.ts:69-71
    customRules: {
      "/sign-in/email": { window: 60, max: env.RATE_LIMIT_LOGIN_MAX },
    },
```
[VERIFIED 둘 다 이번 세션]. 기본 10 → 60 변경은 이 두 곳(env 기본값만 바꾸면 됨). 잠금 범위는 `AUTH_LOCKOUT_THRESHOLD`(`z.coerce.number().int().min(1)`)·창 키의 zod에 `.max()`를 더함(위험 경로 아님). 옛 범위 [VERIFIED: `ERP_PLANT8_260907 db/schema/050_seed_settings.sql:363-364` `'login_fail_lock_count', '로그인 실패 잠금 횟수', 5, 3, 10`, `'login_lock_minutes', '로그인 잠금 시간', 10, 1, 60`]. CONTEXT는 「창 1~60분, 기본 15분」(우리 값)이라 기본은 우리 쪽 값 유지.

## 질문별 답 (플래너 요청 10항)

### 1. EXP-11 + D-714/D-715 — 순수 함수를 어디에 꽂나

**꽂을 곳(모두 열어 확인한 위치):**

| 소비처 | 지금 읽는 것 | 바꿀 것 |
|---|---|---|
| `db/schema/expenses.ts:42` | `scheduledPaymentDate: date("scheduled_payment_date"),` | **칸 유지, 의미만 「수동값」으로 변경**. 새 칸: `requested_payment_date`, `requested_payment_reason` + 둘 다 있거나 둘 다 없는 CHECK(S1) |
| 지출결의 폼 `app/(app)/expenses/expense-form.tsx` (:55,152,195,402,414,457,470,505,701,963-974), `new/page.tsx:54`, `actions.ts:63` | 기안자가 예정일 입력 | 칸을 「희망 지급일 + 사유」로 교체(SC-02). **06.1-15와 겹침 → D-725로 뒤로** |
| 문서 상세 `[id]/payment-section.tsx:305-328`, `expense-document.tsx:173,244`, `[id]/page.tsx:277`, `[id]/actions.ts:19` | 저장된 값 표시·편집 | 유효값 표시 + 「수동 지정」 배지 + 「자동으로 되돌리기」(SC-03) |
| `domain/payments/targets.ts`(`toDto` :208, 비교자 ~:602-605, `groupExpenses(..., {status:"approved", todayKst})` :250-255, `payableOf`→`pickTaxDates` :80) | `row.scheduledPaymentDate` | 유효 예정일·마감·「밀림」을 DTO에 실음, 비교자는 유효값 |
| `domain/payments/index.ts`(`basisOf` :273-284, :308, `saveScheduledPayDate` :633-667) | 저장값 | 유효값 / 수동 저장은 영업일만 허용 + 금요일 아니면 경고만 |
| `domain/expenses/list.ts:66-75` `paymentBand`(+ :163, :197), `dto.ts`(:16,31,167,196,248,266,285,310 `infoItem: "expense.value"`), `detail.ts:72`, `index.ts`(:343,477,806,830), `draft-fields.ts:26`, `domain/next-turn/phase6-items.ts`(:20,33,40,91) | 저장값 | 유효 예정일. `paymentBand`는 「예정일 없음」 구간이 사라짐 |
| `repositories/expenses.ts:642,678`(`pay_key`), `repositories/payment-targets.ts`(ORDER BY `scheduled_payment_date asc nulls last`, `number`, `id`), `repositories/expense-payments.ts:50-62`(`updateScheduledPaymentDate`) | SQL 정렬 | §2.4 · 승인 묶음은 도메인 정렬. `updateScheduledPaymentDate`는 수동 지정/해제 전용으로 |
| `scripts/demo-data.ts:213-220` | 데모 값 | 수동값처럼 보이지 않게 정리 |
| `domain/code-tables/tax-rule.ts:20`, `evidence-type-fields.tsx:13,38` | 세금 기준일 「지급 예정일」 선택지 | 의미는 「유효 예정일」 — P1 |

(위 줄 번호는 앞선 세션의 grep 결과로, 개별 파일 안쪽까지 모두 다시 열지는 않았다. 소비처 목록은 완전성 확인이 필요하면 `rg -n "scheduledPaymentDate|scheduled_payment_date" app domain repositories scripts` 한 번으로 재생성한다.)

**D-714 수동값 저장 방식(제안):** 기존 칸 재사용. 읽기 규칙 `effective = scheduled_payment_date ?? auto`. 되돌리기 = NULL로 되돌림(`document_update` 로그에 `{field, before, after}` 이미 있음 [VERIFIED: `domain/payments/index.ts:633-667` 앞선 세션 확인 — `detail:{field:"scheduledPaymentDate", before, after}`]). 별도 「수동 플래그」 칸이 없으니 **기존 행 값의 해석**이 유일한 위험(Open Q2).

**D-705 재파생이 공짜인 이유:** 자동값을 어디에도 저장하지 않으므로 공휴일 확정·추가·삭제(`domain/holidays/admin.ts:169,229,286,326`)가 지출결의를 건드릴 필요가 없다. 확인 사항: 지급 목록·승인 목록·홈 지급 묶음이 결과를 **캐시하지 않는지**(`unstable_cache`/`revalidate` 사용 여부는 확인하지 못함 — Open Q9).

**마이그레이션(위험 경로, S1):** `expenses`에 `requested_payment_date date`, `requested_payment_reason text` + CHECK(both-or-neither, NOT VALID → 다음 마이그레이션에서 VALIDATE 패턴이 `.claude/rules/db.md`/Squawk에 맞는지 계획이 확인) · `vendors`에 `payment_term_days integer`(1~180, 협력사만) + `version integer not null default 1`. 260907 대응 [VERIFIED: `ERP_PLANT8_260907 db/schema/010_tables.sql:5428,5448-5449` `payment_due_days integer,` `CONSTRAINT vendors_payment_days_only_supplier CHECK (((payment_due_days IS NULL) OR is_supplier))`, `… CHECK (((payment_due_days IS NULL) OR ((payment_due_days >= 1) AND (payment_due_days <= 180))))`]. 우리 `vendors.kind`는 `client|supplier|both` CHECK이므로 「협력사만」 = `kind in ('supplier','both')`(조건식은 플래너가 `db/schema/vendors.ts`를 열어 확정).

**작성일(기준일) 원천:** 가장 이른 「살아 있는 붙임」의 `evidence_records.issued_on`. 붙임은 `evidence_record_links(owner_kind='expense', owner_id, detached_at IS NULL)` [VERIFIED: `db/schema/evidence-records.ts` 인용 `ownerKind IN ('expense','purchase_request','corp_card_usage')`, `uniqueIndex("evidence_record_links_live_uniq")… where detachedAt IS NULL`, `issuedOn: date("issued_on").notNull(),`] → 없으면 `expenses.submitted_at`의 KST 날짜 [VERIFIED: `db/schema/expenses.ts` `submittedAt: timestamp("submitted_at"),`] → 없으면 오늘. 260907 원형 [VERIFIED: `ERP_PLANT8_260907 db/schema/020_functions.sql:3968-4033`, 앞선 세션 확인]. `expenses.evidence_date`(06-06 C6 「증빙일」)가 이 기준과 무관한 칸임을 계획이 확인해야 한다(Open Q3; 이름이 비슷하다).

### 2. EXP-12 — 마감 gate와 제외

**2.3 gate:** Pattern 2. 승인 시각 = 현재 차수 `max(acted_at)` [VERIFIED: `db/schema/approvals.ts:76` 인용 `actedAt: timestamp("acted_at"),`; 식은 `repositories/expenses.ts:625-629`]. `approval_instances.status in draft|submitted|in_review|approved|rejected|withdrawn`. 설정 3키는 `지급` 네임스페이스.
**지급 대상 제외:** 마감을 넘긴 승인 건은 **제외가 아니라 다음 주로 밀림**(D-704) — 그래서 「이번 주 지급」 합계 = 유효 지급일이 이번 주인 건, 「결재 중」 건은 따로 보이되 합계에서 뺀다(J11 = 260907 `payments.ts:157`: 열어 확인한 `server/src/payments.ts:150-165`의 `WEEK_SQL` 주석 구역). D-703의 「승인 전 건 구분」은 `approvedAt == null`.
**「이번 주로」(J9):** 경영관리가 마감 넘긴 건의 수동 예정일을 이번 주 지급일로 지정하는 동작 — 구현은 `saveScheduledPayDate`와 같은 수동 저장 + 되돌리기(토스트). 새 행동 유형 후보 `payment_schedule_change`는 **돈 기록이라 끌 수 없게**(P8). `domain/payments/`는 위 정규식 밖이지만 CLAUDE.md §4 표의 「돈·결재」에 해당하므로 `/review` + `/cso`.

### 3. NOTI-03 — 규칙 표·종류·dedup·묶음·메뉴

**규칙 표(S2):**
```
notification_rules(
  kind text primary key,            -- ConditionKind.kind (FK 없음 — 코드 등록)
  enabled boolean not null,
  days integer,                     -- 종류가 허용하는 범위(코드)에서만; null = 종류 기본
  extra_role_ids text[] not null default '{}',  -- 받는 계급 추가(D-717)
  email_enabled boolean not null default true,
  version integer not null default 1,
  updated_by text references users(id), updated_at timestamp not null default now()
)
```
(컬럼 구성은 제안 — 「알림 규칙 표 스키마」는 Claude's Discretion.) 계급 id 배열은 FK가 없다 → 보관된 계급은 해석 시 건너뜀. 행이 없으면 코드 기본값. **시드 마이그레이션 없음.**

**조건 종류 등록(N1~N16, §5의 표 참조):** 종류마다 파일 하나, `evaluate`가 후보를 만든다. `dateUnit`은 D-709: 결재 대기 초과·지급 예정일 임박은 `business`, 나머지는 `calendar`.

**tick 평가:** `runTick`은 종류마다 `kind.evaluate({today})`를 부르고, 실패하면 `evaluationFailed`로 이메일 단계가 전원 보류, `findExistingDedupKeys`로 기존 키 제외, `oldestFirst` 정렬, `batchMax`(설정 `NOTIFY_TICK_BATCH_MAX` [VERIFIED 위치: `domain/settings/keys.ts:454-462`])로 자르고 `ON CONFLICT DO NOTHING` 삽입 + `notify_tick_runs` 기록 [VERIFIED: `domain/notify/tick.ts`, 앞선 세션 확인]. 07이 바꿀 것: ① 평가 대상을 「켜진 규칙」으로 ② `evaluate`에 규칙 파라미터·`since` ③ 받는 계급 추가 확장 ④ 규칙 이메일 끔 → 행의 `email_status`를 새 값으로 삽입.

**dedup 키:** `(condition_kind, entity, entity_id, recipient_id, round)`. 사다리(N10): 같은 건의 독촉은 `round` 1·2·3, 2회차부터 받는 사람에 팀장 추가, 3회 상한(발송 상한 — 회차 번호는 계속 올리되 3 넘으면 후보를 만들지 않는 편이 단순; 「회차는 계속 올리되 발송만 상한」(SCOPE N10 비고)을 따르려면 후보 생성 단계에서 `round <= 3` 필터). 팀장 해석은 Open Q4.

**D-716 묶음:** Pattern 4. **다음 영업일 9시**는 새로 만들 필요가 없다 — tick이 영업일에만 돈다(D-709, 앞선 세션 확인)는 사실 자체가 「비영업일 사건은 다음 영업일 묶음」이다.

**이메일 형식:** 현재 `composeDigest`는 제목 `PLANT8 알림 ${total}건`, 본문 `- message` 줄 + 푸터 링크, 최대 20건 [VERIFIED: `domain/notify/digest.ts`, 앞선 세션 확인]. UI-SPEC SC-07은 제목 `알림 N건 · MM-DD`와 줄마다 `열기` 링크를 요구 → `digest.ts`와 `email-phase.ts`(지금 메시지 문자열만 넘김)를 고쳐야 한다. 줄별 링크에 N25 착지 함수를 쓴다.

**`/admin/notification-rules` 권한·메뉴·누수:** `MENUS`에 `admin.notification-rules`("알림 규칙") 추가 [VERIFIED: 기존 위치 `domain/permissions/menus.ts:57-58` 인용 `{ key: "admin.settings", label: "설정" }`, `{ key: "admin.action-log", label: "행동 로그" }`]. href 규칙 `/admin/${key minus "admin."}`, 그룹 「설정·권한」 시스템 설정 뒤(`ui/shell/role-menu.ts` `adminIndexGroups`). 같이 고칠 것: `test/unit/admin-menu-registry.test.ts`(MENUS ↔ adminIndexGroups), `role-menu.test.ts`(SYSTEM.md §6-10 표 대조), SYSTEM.md §6-10 — **SYSTEM.md는 D-725로 06.1-16 뒤**. 액션은 `app/(app)/admin/notification-rules/actions.registry.ts`에 `registerAction`(메뉴 `admin.notification-rules`) + 반환 DTO `registerDto`, 그리고 `test/integration/leak-scan.test.ts`에 import 한 줄(없으면 `leak-scan-coverage.test.ts`가 빨강). 설정 변경은 `settings_change` 유형 — **전후 값이 아직 없다**(`setSettingValue`가 `detail: { key: def.key }`만 남기고 upsert 트랜잭션 밖에서 기록 [VERIFIED: `domain/settings/registry.ts:214-240`, 앞선 세션 확인]) → R5와 한 플랜에서.

### 4. 권한 검수 (기준 5)

- **누수 스캔 생성기:** `DTO_REGISTRY × fields × infoItems × SEED_ROLES`, `ACTION_REGISTRY × SEED_ROLES`, `EXPORT_REGISTRY × SEED_ROLES`로 케이스를 만들고 `NULL_DTO_EXEMPT_EXPORTS = ["settings.export"]` 예외 하나 [VERIFIED: `test/integration/leak-scan.test.ts` 앞선 세션 확인].
- **「미매핑 *Dto 0」:** 아직 없는 시험. `domain/**`에서 `export type \w+Dto` 열거(정규식 또는 TS 컴파일러 API 불필요 — 단순 grep 규칙) ↔ `DTO_REGISTRY` 이름. 면제 목록(내부용 Dto)은 이유와 함께 상수로 [VERIFIED: `domain/permissions/dto-registry.ts`의 `registerDto`는 중복·빈 `infoItem`만 거부].
- **알림함 액션 3개:** `ACTIONS_WITHOUT_REGISTRY`에 계정·알림·확인증 공개 세 파일이 있고 시험이 「예외 목록은 세 항목뿐」을 고정 [VERIFIED: `test/unit/action-registry-completeness.test.ts:16-24,125-130`]. 접힌 todo는 「SC5b 알림함 액션 3개·행 DTO 누수 스캔 등록」 — 권장: 알림함 액션은 본인 범위(D-4208)라 **등록하지 않고**, 대신 「알림함 행 DTO(`InboxNotification`)가 타인 행을 돌려주지 않는다」는 전용 통합 시험을 둔다(Open Q7 — 사용자 확인).
- **`CORE_ACTION_TYPES`:** 34종 [VERIFIED: `domain/action-log/record.ts:14-63` 앞선 세션에서 센 수]. 07이 더할 후보: `password_reset`(`resetPassword`는 지금 로그를 안 남김), `vendor_account_change`, `payment_schedule_change`, `notification_rule_change`(= `settings_change` 재사용 가능), 거래처 확인 상태 변경.
- **계급 기본값 표(D-722):** 시드 계급 5종 [VERIFIED: `domain/permissions/roles.ts`, 앞선 세션 확인 — role-ceo, role-division-head, role-team-lead, role-pm, role-sysadmin]. 「경영관리」는 시드 계급이 아니다(권한 격자로 관리자가 구성) — 표 초안은 실제 운영 계급 이름이 아니라 시드 5종 기준임을 사용자 확인 카드에 명시. `seedMasterData`는 sysadmin만 upsert하고 나머지는 `insertPermissionIfAbsent`/`insertVisibilityIfAbsent`(운영 값 안 덮음) [VERIFIED: `domain/seed/index.ts:191-348` 앞선 세션 확인]. **R3:** 대표의 `admin.action-log` view 행이 시드에 없다 → `app/(app)/admin/action-log/page.tsx:34`의 `can(...,"admin.action-log","view")`가 거짓 → `notFound()`.
- **계급 스모크 E2E:** `.github/workflows/ci.yml`이 `pnpm test:e2e --project=desktop --shard=N/2`로 돌리고 새 데스크톱 스펙은 `mobile-*`·`*cert*`·`DESKTOP_SETTINGS_SPECS`·`EVIDENCE_WIPE_SPECS` 목록에 안 걸리면 자동 포함 [VERIFIED: `playwright.config.ts`·`.github/workflows/ci.yml`, 앞선 세션 확인] → **`.github/workflows` 변경 불필요** (위험 경로 회피). 단 `test/unit/ci-guard.test.ts`가 ci.yml 구조를 고정하므로 ci.yml을 건드리지 않는 것이 맞다.
- **ADMN-10 갭:** `domain/seed/index.ts`에 대표 `admin.action-log` view 추가(insert-if-absent). 이미 배포된 환경은 시드가 `insertPermissionIfAbsent`로 채우는지 확인(운영 값 존중 — 이미 행이 있으면 안 건드림).

### 5. 관리자 폼

- `settings-form-client.tsx`(889줄): `TextField`·`Button`·`DetailScreen`·`ConfirmDialog`·`HistoryList`·`Toast`·`PermissionGrid`는 `ui/`에서 쓰지만 **`ui/form`의 `Form`은 미사용**, 자체 `<input>`(:125,177,438), `<select>`(:147,457), 자체 `role="alert"` 오류 `<p>`(:489) [VERIFIED: grep 결과 이번 세션]. 이관 대상 = :125-183 칸 렌더러, :438-461 행 입력, :483-489 오류 표시. 889줄·다수 칸 종류라 **화면 플랜 하나(Opus 실행자 아님, 화면 플랜 규칙: 독립 DOM 감사)**.
- `/account` `change-password-form.tsx`(62줄): 이미 `Form`·`TextField`·`FormAlert`·`Button`을 import [VERIFIED: 이번 세션 grep] — 07-CONTEXT/core-state의 `:30` 지적은 낡았을 수 있다(`aria-*`/`role=` grep 0건). 남은 일은 §6-3 페이지 배치·§7-2 오류 표시 DOM 실측으로 판정(실행 첫 감사).
- `code-item-form.tsx`: 라벨 blur 저장 칸(`CodeItemLabelInput`) `onBlur`로 `execute`, 오류 `role="alert"` + `aria-invalid`/`aria-describedby` 관례 [VERIFIED: 이번 세션 :120-150]. 「표 안 입력」으로 이관에서 뺀다는 CONTEXT 판단과 일치 — 코드는 이미 접근성 관례를 지킴.

### 6. 로그인 IP 한도(D-723)·잠금 범위 — 위험 경로 지도

| 변경 | 파일 | 위험 경로? | 머지 |
|---|---|---|---|
| IP 한도 기본 10→60 | `lib/env.ts:66` (+ 필요 시 `lib/auth.ts:69-71`) | 정규식 밖 | 인증이라 사용자 머지 권장(판단) |
| 잠금 설정 범위 | `domain/settings/keys.ts`(zod `.max()`) | 아님 | 세션 머지 가능 |
| 잠금 풀기·초기화 단추 연결 | `domain/auth/accounts.ts`(`resetPassword`에 `resolveOpenFailures` + 로그 추가), `app/(app)/admin/people/*` | `domain/auth/` **위험** | 사용자 |
| 퇴직일 로그인 막기 | `domain/auth/hooks.ts`(before 훅), `lib/viewer.ts:45` `getSession()` | `domain/auth/` 위험 / `lib/viewer.ts`는 아님 | 사용자 |
| 잠금 경쟁(/cso F1)·N번째 시도 문구 | `domain/auth/lockout.ts` | 위험 | 사용자 |

현재 상태(앞선 세션 확인): `resetPassword(viewer, email)`(`domain/auth/accounts.ts:72`)는 임시 비밀번호 생성·세션 삭제·`passwordIsTemporary` 설정만 하고 **잠금도 안 풀고 행동 로그도 안 남긴다**; `unlockAccount`(:104)는 실패 해소 + `account_unlock` 로그를 한 트랜잭션으로; 둘 다 `scripts/account-cli.ts`만 호출. `domain/auth/hooks.ts` before 훅은 `x-client-ip`·보관 사용자·잠금 횟수를 보나 **퇴직일을 안 본다**; `getSession()`은 보관 사용자에게 null. 260907 대응 [VERIFIED: `ERP_PLANT8_260907 db/schema/020_functions.sql:247-290` `block_inactive_login`: 보관·`left_date` 있음·잠금 계정 차단; `server/src/people.ts:1011` `peopleRoutes.post('/api/people/:id/unlock', requirePermission('people.edit'), …)`]. 퇴직일 의미: `users.resignationDate`는 `date`(앞선 세션 확인) — 「지나면」 = `resignationDate <= 오늘(KST)`인지 `<`인지 사용자 확인 필요(Assumption A7). 사람 목록: `listPeople(viewer)`는 전체 읽기 [VERIFIED: `domain/people/index.ts:128`], `app/(app)/admin/people/page.tsx`가 `Promise.all`로 한 번에 읽음 [VERIFIED: 이번 세션 :32-48] → U6 쪽 나눔은 `listPeople`에 limit/offset 또는 키셋을 더해야 한다.

### 7. 거래처 지급 기한 칸·패널·인라인 생성, PO·발주서·예산 이력, 프로젝트 카드

**이미 main에 있음(앞선 세션 확인):** `vendors.kind` CHECK, 유일 색인 `vendors_business_no_live_key`, `businessNoProblem()`(`domain/vendors/index.ts:72-79`), `DuplicateBusinessNoError`(:55), `InvalidBusinessNoError`(:81), `addVendorKind`(:545), `assertBusinessNoFree`, 번호가 바뀔 때만 검사(:479), 마이그레이션 `0027_vendor_kind.sql`·`0030_vendor_business_no_unique.sql`. 액션 스키마가 이미 갈래를 필수로 요구(「구분 필요 · 구분 고르기」). → **V5·V6에 마이그레이션 없음.** 남은 것은 UI 문구(구분→갈래, 오류 `이미 등록됨 · {이름}` + 열기)·「이미 중복된 행 먼저 처리」 확인(운영 데이터가 없으므로 데모 데이터만 — 계획이 `0030`이 중복을 어떻게 처리했는지 확인).
**없음(S3 마이그레이션 + 새 코드):** `vendors`의 지급 기한·`version`(S1), 담당자 표(260907 `vendor_contacts` [VERIFIED: `010_tables.sql:5259` 「vendor_contacts — 담당자는 여럿이다」]), 서류 표(`vendor_documents` [VERIFIED: `010_tables.sql:5314` 「vendor_documents — 사업자등록증 · 통장사본」]) — 파일 바이트는 기존 `files` 재사용(`owner_kind` 값 추가 → `files_owner_kind_check` 교체: 현재 `IN ('expense','quote_revision','reserve_entry','corp_card_usage')` [VERIFIED: `db/schema/files.ts:35`]), 계좌 변경 기록 전용 표, 확인 전/확인 됨 상태(V4).
**`updateVendor`:** 버전 검사 없음(G9)·`document_update`를 전후 값 없이 기록. `VendorDto`(`registerDto`, `infoItem: "vendor.value"`), 거래처 액션은 `app/(app)/admin/vendors/actions.registry.ts`(메뉴 `admin.vendors`).
**통장 사본 노출:** 계좌 정보라 보기 권한을 마스킹 해제 권한(03-06)과 같이(fund-forecast design.md 「통장 사본은 계좌 정보라 … 같이 맞출 것」) — `mask_reveal`은 ALWAYS_ON 유형.
**PO·예산 규칙(fund-forecast/design.md 열어 확인):** 사전견적 칸 → 「PO 금액」(`projects.pre_estimate_*`, `app/(app)/projects/project-form.tsx:289`·`[id]/pre-estimate-field.tsx`·`actions.ts:58-69`). 사용액 = **등록된 실행가 합**, 예산 = PO 금액 × 원가율(없으면 승인 견적 합계 × 원가율, 둘 다 없으면 0), 증액은 늘어난 금액 × 원가율만 더함(이력), **초과는 경영관리 화면 표시만 — 차단 없음**, 원가율은 경영관리 설정값이며 **예산을 잡을 때의 값을 같이 저장**, 예산·사용액·남은 예산은 **경영관리만** 보고(팝업·옆 패널 포함 기획본부 화면에는 안 보임) 서버 권한으로 막는다 [VERIFIED: `/mnt/project-files/notes/fund-forecast/design.md` 상단 「결정 요약」·§2·§3]. 260907 근거 [VERIFIED: `ERP_PLANT8_260907 db/schema/010_tables.sql:2673` `po_number text,`, `:3729-3777` `project_documents`(「발주서. 알맹이는 저장 공간에 있고 … 한 행사에 여러 장이 나란히 살고」), `:4214,4224` `quotes.approval_evidence`(`purchase_order`·`email`·`verbal`), `ERP_PLANT8_260907 server/src/projects.ts:585-590` PO 번호 검색 주석]. 우리 쪽에는 셋 다 없음(design.md 「우리 코드엔 셋 다 없음」).
**프로젝트 상세:** `[id]/` 폴더에 `period-field.tsx`·`pre-estimate-field.tsx`가 있고 둘 다 `Escape`로만 되돌린다(:71-73, :165-167) [VERIFIED: 이번 세션 grep] → S2 「취소」 동작은 두 컴포넌트에 단추 추가. `quote-table.tsx`는 ~2,600줄(2577-2585에 PO 칸 표시 언급, design.md) — 500줄 이상이라 범위 Read 필수. 견적 표는 07.1(공용 표 폰 2줄)과 같은 파일이라 07이 먼저(CONTEXT 마지막 줄).

### 8. 06.1-15·16과의 파일 겹침 (D-725)

06.1-15·16은 문서(PLAN)만 `origin/claude/project-thread-qvy9gl`에 있고 코드는 main에 없음 [VERIFIED: 앞선 세션 `git` 확인]. 해당 플랜이 수정한다고 적은 파일:

| 06.1 플랜 | 수정 파일 | 07 겹침 | 07 대응 |
|---|---|---|---|
| 06.1-15 | `app/(app)/expenses/[id]/page.tsx`, `expense-form.tsx`, `test/e2e/evidence-pick.spec.ts`, `evidence-pick-audit.spec.ts` | SC-02(희망 지급일·사유 칸), SC-18(지출결의 폼 거래처 링크), `[id]/page.tsx` | 해당 07 플랜은 06.1-15 main 병합 뒤로 |
| 06.1-16 | `lib/evidence-return.ts`, `app/(app)/cards/page.tsx`, `evidence-table.tsx`, `evidence/page.tsx`, `docs/design/DECISIONS.md`, `docs/design/SYSTEM.md`, `test/e2e/evidence-reconcile*.spec.ts` | SYSTEM.md·DECISIONS.md 개정 묶음(UI-SPEC 개정 9건, 상태 단어 #1), 새 메뉴 §6-10 | SYSTEM/DECISIONS를 만지는 플랜은 06.1-16 뒤. `evidence-table.tsx`는 07이 안 만짐 |
| (무겹침) | SC-01 `payment-targets-table.tsx`·`(list)/page.tsx`, SC-03 `payment-section.tsx` | 파일은 안 겹치나 SYSTEM 개정 #1에 의존 | SYSTEM 개정 뒤 |

**순서 제안:** 겹치지 않는 코어(순수 함수·gate·조건 종류·규칙 표·검수 시험·행동 로그·인증)를 먼저 — 06.1-15·16 병합을 기다리지 않는다. SYSTEM.md/DECISIONS.md 개정과 expense-form/`[id]/page.tsx` 변경은 마지막 웨이브에 몰아 한 번에.

### 9. Validation Architecture → 아래 별도 섹션

### 10. 84행 구현 노트 → 아래 §SCOPE 84행 표

## SCOPE 84행 구현 노트

범례: **PR** = 위험 경로 포함 여부(⚠ = 사용자 머지) · 스키마 플랜 S1~S4(§PR 분리) · 260907 열은 **열어 확인한 줄만** 인용하고, 나머지는 「CMP-xx(260907-compare.md 인용, 원본 미확인)」 또는 「260907 없음」으로 정직하게 구분.

### 1. 지급일·마감 (J1~J12)

| # | 구현 노트 | 건드릴 파일 | 260907 대조 | PR |
|---|---|---|---|---|
| J1 | `pay-schedule.ts`의 자동 지급일 + 기준일 원천 3단 | `domain/payments/pay-schedule.ts`(신규), `pay-schedule-load.ts`, `repositories/evidence-record-links.ts`(이른 `issued_on`) | `ERP_PLANT8_260907 020_functions.sql:3415-3462`, `:3968-4033` | 코드 |
| J2 | 설정 3키 `payment.term_days`·`payment.weekday`·`payment.cutoff_time` | `domain/settings/keys.ts`(`"지급"` 네임스페이스) | `020_functions.sql:98,3431-3433` 키 이름 | 코드 |
| J3 | 수동값 = `scheduled_payment_date`(null=자동), 기안자 입력 제거 | `domain/payments/index.ts:633-667`, `repositories/expense-payments.ts:50-62`, 폼 | `020_functions.sql:3968-4033`(사람이 옮긴 날을 `early_pay_resolution='moved'`로 얼림) | 코드(+S1 레거시 값 결정) |
| J4 | 읽을 때 계산이라 추가 코드 없음 + 캐시 없음 확인 시험(공휴일 확정 전후 같은 문서 날짜 변화) | 시험만 | 260907 없음(G31) | 코드 |
| J5 | 거래처 `payment_term_days` 칸(1~180, 협력사만) | `db/schema/vendors.ts`, `domain/vendors/index.ts`, 거래처 폼 | `010_tables.sql:5428,5448-5449` | ⚠ S1 |
| J6 | 마감 = `prevBusinessOnOrBefore(payDate-1)` + 14:00 KST | `pay-schedule.ts` | `020_functions.sql:96-130` | 코드 |
| J7 | gate `payment.cutoff` | `domain/rules/register.ts`, `domain/payments/targets.ts` | `020_functions.sql:96-130`(앵커 → pay → 마감) | 코드(돈 경로 `/cso`) |
| J8 | `pushReason`·배지 「마감 지나 밀림」 | `pay-schedule.ts`, `payment-targets-table.tsx`(SC-01) | 260907은 `after_limit` 설정(우리는 D-704로 대체) — 밀림 자동은 CMP-A10(원본 미확인) | 코드(화면) |
| J9 | 「이번 주로」 = 수동 지정 + 되돌리기 + `payment_schedule_change` 로그 | `domain/payments/index.ts`, `app/(app)/expenses/payments/…`, `record.ts` | CMP-A11(원본 미확인) | 코드(돈 `/cso`) + 화면 |
| J10 | 희망 지급일 + 사유 한 쌍, 한쪽만이면 거부(액션 zod + DB CHECK) | `db/schema/expenses.ts`, 폼, `domain/expenses/draft-fields.ts` | 260907 긴급·앞당김 대체(D18) | ⚠ S1 + D-725 뒤 |
| J11 | 목록 「결재 중」 묶음 따로, 합계 제외 | `domain/payments/targets.ts`, `payment-targets-table.tsx` | `ERP_PLANT8_260907 server/src/payments.ts:150-165`(`WEEK_SQL`) | 코드(화면) |
| J12 | 순수 함수 한 벌 + 시험(금요일 공휴일 주·월요일 휴일 직후·추석 주·60일 정확 금요일) | `pay-schedule.ts`, `test/unit/payments/pay-schedule.test.ts` | `ERP_PLANT8_260907 server/src/notices.ts:2890-2935`(목요일 고정 버그와 수리) | 코드 |

### 2. 알림 규칙 (N1~N26)

| # | 구현 노트 | 건드릴 파일 | 260907 대조 | PR |
|---|---|---|---|---|
| N1 | `CONDITION_KINDS` 채움(종류 파일별) | `domain/notify/condition-kinds.ts`, `domain/notify/kinds/*` | `notices.ts` 종류 함수들(원본 미확인) | 코드 |
| N2 | `notification_rules` 덮어쓰기 표 + 규칙 화면 + 변경 로그 | `db/schema/notification-rules.ts`, `app/(app)/admin/notification-rules/*` | 260907 없음 | ⚠ S2 + ⚠ 메뉴 키 |
| N3 | 폼이 열어 주는 범위 = 켬/끔·일수(종류 허용 범위)·계급 추가·이메일(D-717로 확정) | 위와 동일 | — | 위와 동일 |
| N4 | 종료 +7일·지출결의 0건 → 담당 PM(`calendar`), 제외 조건 보관/수주 실패/이미 완료 | `kinds/project-end-no-expense.ts` | `notices.ts` ①(원본 미확인) | 코드 |
| N5 | 임박 알림: `alertDate == today` 인 주의 지급 대상 목록 → 경영관리(`business`) | `kinds/pay-week-alert.ts` + `pay-schedule` | 목요일 고정 버그 반례(`notices.ts:2890-2935`) | 코드 |
| N6 | 결재 대기 초과: 현재 차수 단계가 열린 지 N영업일(N=0 허용) → 그 단계 결재자(`business`) | `kinds/approval-waiting.ts`(+ 후보 해석은 `domain/approvals`) | 원본 미확인 | 코드(`domain/approvals` 읽기만 — 돈·결재 `/cso` 해당 여부는 읽기 전용이라 `/review`) |
| N7 | 지급 완료 +N일·증빙 0건 → 기안자 | `kinds/paid-no-evidence.ts`, 증빙 거르개 공유 | 원본 미확인 | 코드 |
| N8 | 선결제: 지급일 + `evidence.prepaid_due_days`(14) | `kinds/prepaid-evidence.ts` | — | 코드 |
| N9 | 대리 등록(`proxy`) 건 → 담당 PM | `kinds/proxy-registered.ts` | — | 코드 |
| N10 | 사다리: `round` 1~3, 2회부터 +팀장 | `condition-kinds.ts` 공용 도우미 | 원본 미확인 | 코드 |
| N11 | 결재 끝남(승인·반려·지급/취소 포함) 사건 종류, 시드 꺼짐 | `kinds/expense-result.ts` | 원본 미확인 | 코드 |
| N12 | 마감 전 미승인 기안자(전 직원 아닌 할 일 있는 사람만), 꺼짐 | `kinds/pre-cutoff-unapproved.ts` | 원본 미확인 | 코드 |
| N13 | 정산 상신 재촉·반려 방치·견적 재촉 3종, 꺼짐 | `kinds/settle-nudge.ts`·`rejected-idle.ts`·`quote-nudge.ts` | 원본 미확인 | 코드 |
| N14 | 계좌 바뀜 사건(거래처마다 하루 1번 — `entityId`=거래처 id+KST일자), 꺼짐 | `kinds/vendor-account-changed.ts` | — | 코드(거래처 PR과 같은 묶음) |
| N15 | 결재 도착 = N6 N=0 (별도 즉시 경로 없음) | N6 | — | 코드 |
| N16 | 결재 처리 시 해당 결재 알림 자동 읽음 | `domain/approvals/index.ts` 처리 tx 안에서 `markRead` | 260907 없음(G33) | `domain/approvals` ⇒ 돈·결재 게이트 `/cso` |
| N17 | 규칙 켬/끔으로 충족(D-719) | N2 | — | — |
| N18 | **뺌**: 즉시 경로 → D-716 | — | — | — |
| N19 | N11에 합침 (지급/취소를 결과 종류의 하위 사건으로) — **[ASSUMED]** 시드 꺼짐 여부 확인 | `kinds/expense-result.ts` | `ERP_PLANT8_260907 server/src/payments.ts:938-945`(「돈이 나갔다는 것을 올린 사람에게 알린다」) | 코드 |
| N20 | **뺌**: D-718 | — | — | — |
| N21 | 임자 없는 증빙 독촉(공개됐는데 붙임 0, 등록 N일), 꺼짐 | `kinds/orphan-evidence.ts` + 06.1 목록 거르개 공유 | — | 코드 |
| N22 | 수금 지연 = 발행 `entry_date` + 60일 지나도 입금 줄 없음(`revenue_entries.kind issue/payment`), 꺼짐 + 배지 | `kinds/revenue-overdue.ts`, `db/schema/revenue-entries.ts` 읽기 | 원본 미확인 | 코드(`revenue` 돈 경로 `/cso`) |
| N23·N24 | **뺌**: Phase 9(D-720) | — | — | — |
| N25 | 착지 URL = `entity`/`entityId` → 경로 매핑 + 보임 판정, 이메일 줄 `열기` 링크도 같은 함수 | `domain/notify/inbox.ts`, `digest.ts` | — | 코드 |
| N26 | 알림함 한 종류 묶음 접기·상한(계획이 임계 정함, 예: 같은 종류 5건 초과 시 요약) | `inbox.ts`, 알림함 화면 | — | 코드(화면) |

### 3. 권한·검수 (R1~R20)

| # | 구현 노트 | 건드릴 파일 | 260907 대조 | PR |
|---|---|---|---|---|
| R1 | `*Dto` 열거 ↔ `DTO_REGISTRY` 단위 시험 + 등록 모듈 자동 로드 검사 | `test/unit/dto-registry-coverage.test.ts`(신규), `test/integration/leak-scan.test.ts` | — | 코드(시험) |
| R2 | 계급 기본값 표 초안 + 사용자 확인 카드 → 시드 | `domain/seed/index.ts` | 260907 계급 표 별개 | 코드 — 정규식 밖이나 권한 시드라 **사용자 머지 권장** |
| R3 | 대표 `admin.action-log` view 시드 + C-88 정책 | 위와 동일 | — | 위와 동일 |
| R4 | `settings_change`를 ALWAYS_ON에 | `domain/action-log/record.ts` | CMP-D3 | 코드 |
| R5 | `detail.changes`·마스킹 | `domain/settings/registry.ts:214-240`, `domain/permissions/matrix.ts` | — | `matrix.ts`가 위험 경로 ⇒ ⚠ 별도 PR |
| R6 | 행동 로그 불변 트리거: DELETE·TRUNCATE 거부, `pruned_at`/`pruned_by` UPDATE만 | 마이그레이션(S4) | 현재 코드에 DELETE 없음·트리거 0건 [VERIFIED: `repositories/action-log.ts:171-187`, `db/migrations` 트리거 grep] | ⚠ S4 |
| R7 | 딸린 권한 자동 켬/끔 | `domain/permissions/*` | — | ⚠ |
| R8 | 거래처 권한 3줄(UI-SPEC 확정) | `domain/permissions/menus.ts`(+ 시드) | — | ⚠ |
| R9 | 퇴직일 로그인 막기 | `domain/auth/hooks.ts`, `lib/viewer.ts:45` | `020_functions.sql:247-290` | ⚠ |
| R10 | 소속 사람 남은 팀·본부 보관 막기(`blockReason`) | `domain/org`, `domain/people` | — | 코드 |
| R11 | 보관함 복원이 관리자 상한을 거치는지 시험 한 줄 | 시험 | — | 코드 |
| R12 | 계급 스모크 E2E에 알림 규칙·잠금 단추·지급 목록 | `test/e2e/role-smoke.spec.ts` | — | 코드(시험) |
| R13 | 설정 폼·`/account` 이관 | `settings-form-client.tsx`, `change-password-form.tsx` | — | 코드(화면) |
| R14 | 계급 화면 위임자 범위 칸 | `app/(app)/admin/people/roles/*`, `domain/permissions` | — | ⚠ + 화면 |
| R15 | 상한 밖 사람 상세 「연차 조정 추가」「새 이력 추가」 숨김 | `app/(app)/admin/people/[id]/*` | — | 코드(화면) |
| R16 | 계급 이름 바꾸기·보관 서버 가드 | `domain/permissions/roles.ts` | — | ⚠ |
| R17 | 소속 사람 남은 계급 보관 막기 | 위와 동일 | — | ⚠ |
| R18 | `evidence.intake` 쓰기만 있고 `evidence` 보기 없어도 all — 메뉴 판정 정리 | `domain/permissions/*` | — | ⚠ |
| R19 | 설정 본부 판정·팀 없는 사람 본부 갈래 0건 | `domain/permissions/scope-for.ts` | — | ⚠ |
| R20 | 개인카드 전표 숨김을 `files` 칸에 | `db/schema/files.ts` + 06.1 PR-D 숨김 코드(`domain/evidence-records/attach.ts`, `corp-card-usages/index.ts:344` 주변) | — | ⚠ S3 (설계 [ASSUMED]: 정확한 칸은 06.1 PR-D 코드를 읽고 결정 — A8) |

### 4. 인증·사람 (U1~U6)

| # | 구현 노트 | 건드릴 파일 | 260907 대조 | PR |
|---|---|---|---|---|
| U1 | 사람 화면 「잠금 풀기」 + 잠김 배지·건수 링크 | `app/(app)/admin/people/*`, `domain/auth/accounts.ts` | `ERP_PLANT8_260907 server/src/people.ts:1011` unlock 라우트 | ⚠ |
| U2 | 「비밀번호 초기화」(임시 비밀번호 한 번 표시, 잠금도 풂) + 로그 | `domain/auth/accounts.ts:72`(`resolveOpenFailures` 추가 + `password_reset` 유형) | 260907 reset 라우트는 못 찾음(확인 못 함) | ⚠ + `pnpm build:cli` 확인 |
| U3 | 기본 60 | `lib/env.ts:66` | — | 사용자 머지 권장 |
| U4 | 잠금 범위 | `domain/settings/keys.ts` | `050_seed_settings.sql:363-364` | 코드 |
| U5 | **뺌**(06.1 실행 스레드) | — | — | — |
| U6 | 사람 목록 쪽 나눔(+e2e 계정 정리) | `domain/people/index.ts:128`, `admin/people/page.tsx` | — | 코드(화면) |

### 5. 거래처 (V1~V9)

| # | 구현 노트 | 건드릴 파일 | 260907 대조 | PR |
|---|---|---|---|---|
| V1 | 거래처 내려받기(`excel_export` 유형, `EXPORT_REGISTRY`, 상한은 UI-SPEC 확정 5,000곳) | `app/(app)/admin/vendors/*`, `domain/vendors` | — | 코드 |
| V2 | 검색칸(정렬·쪽 없음, 278곳 규모) | 거래처 목록 | — | 코드(화면) |
| V3 | `version` 칸 + 갱신 시 `version` 조건 | `db/schema/vendors.ts`, `domain/vendors/index.ts updateVendor` | — | ⚠ S1 |
| V4 | 일하는 자리 등록 + 「확인 전/확인 됨」(상태 칸은 S3, 06.1 자동 등록도 같은 표시) | `domain/vendors`, `domain/evidence-records` | — | ⚠ S3 |
| V5 | **이미 있음** — 문구·열기 링크만 | `app/(app)/admin/vendors/*` | CMP D11 | 코드(화면) |
| V6 | **이미 있음** — 문구만(구분→갈래) | 위와 동일 | — | 코드(화면) |
| V7 | 담당자 표(이름 필수, 연락처·이메일 선택, 빼면 보관) | `db/schema/vendor-contacts.ts` | `010_tables.sql:5259` | ⚠ S3 |
| V8 | 서류(`vendor_documents` 대응; 통장 사본은 마스킹 해제 권한과 같이) | S3 + `files.owner_kind` 값 | `010_tables.sql:5314` | ⚠ S3 |
| V9 | 계좌 변경 기록 전용 표 + 지급 목록 배지 | S3, `payment-targets-table.tsx` | — | ⚠ S3 |

### 6. PO·예산·프로젝트 서류 (W1~W7)

| # | 구현 노트 | 건드릴 파일 | 260907 대조 | PR |
|---|---|---|---|---|
| W1 | 화면 문구 「총 매출 예상가」→「PO 금액」(DB 불변) | `project-form.tsx:43-44,289`, `[id]/pre-estimate-field.tsx`, `actions.ts` 주석 | 260907은 PO 금액 칸 없음, 번호·파일만(design.md) | 코드(화면) |
| W2 | `projects.po_number` | `db/schema/projects.ts` | `010_tables.sql:2673` | ⚠ S3 |
| W3 | 프로젝트 서류(여러 장·보관) | `project_documents` + `files.owner_kind` | `010_tables.sql:3729-3777` | ⚠ S3 |
| W4 | 예산 이력 표(기록·이력·권한, 서버에서 경영관리만) | S3 | — | ⚠ S3 + 돈 경로 `/cso` |
| W5 | 원가율 설정 + 「예산 현황」 경영관리 화면 | `domain/settings/keys.ts`, 새 메뉴 | — | ⚠(메뉴 키) |
| W6 | 고객 승인 근거 갈래 + 메모 | `quote_revisions` 또는 프로젝트(위치 [ASSUMED]) | `010_tables.sql:4214,4224` | ⚠ S3 |
| W7 | 매출 발행 줄 계산서 파일 | `files.owner_kind`에 매출 줄 추가 | 260907 없음 | ⚠ S3 |

### 7. 프로젝트 상세 (S1~S4)

| # | 구현 노트 | 건드릴 파일 | 260907 대조 | PR |
|---|---|---|---|---|
| S1 | 카드 개편(기본·고객 승인·손익 한 장) | `app/(app)/projects/[id]/page.tsx`, `project-detail.module.css` | — | 코드(화면 — design-gate, DOM 감사) |
| S2 | 기간·PO 금액 인라인 칸 「취소」 단추(마우스·폰) | `period-field.tsx`, `pre-estimate-field.tsx` | — | 코드(화면) |
| S3 | 폰 폭 견적 표 구매 요청 문(UI-SPEC 확정: 현행 유지) | — | — | UI-SPEC이 「현행 유지」로 확정 → 변경 없음 |
| S4 | 견적 줄 「지출결의 올리기」 숨는 이유 표시 | `quote-table.tsx`(~2,094 근처) | — | 코드(화면) |

## PR 분리 · 웨이브 · 위험 경로 제안

스키마를 바꾸는 플랜은 **웨이브마다 하나**(`.claude/rules/db.md`)이므로 4개 스키마 플랜은 웨이브가 겹치지 않는다.

| 스키마 플랜 | 내용 | 비고 |
|---|---|---|
| **S1** | `expenses.requested_payment_date/_reason`(+CHECK), `vendors.payment_term_days`(+CHECK), `vendors.version` | EXP-11 핵심. 가장 먼저(순수 함수는 이 PR 없이도 작성 가능) |
| **S2** | `notification_rules`, `notification_log.email_status` CHECK 값 추가 | NOTI-03 |
| **S3** | `vendor_contacts`, `vendor_documents`, `vendor_account_changes`, 거래처 확인 상태, `projects.po_number`, `project_documents`, 예산 이력, 원가율 저장, 고객 승인 근거, `files.owner_kind` 값 추가, R20 숨김 칸 | 가장 큼 — 두 PR로 쪼갤지 계획 판단(거래처 / PO·예산). 쪼개면 웨이브가 하나 늘어난다 |
| **S4** | 행동 로그 불변 트리거 | R6 |

코드 PR(세션 머지 가능): 순수 함수·gate·설정 키·조건 종류·알림 규칙 화면(메뉴 키 제외)·검수 시험·거래처 UI·프로젝트 카드. **사용자 머지:** S1~S4, `domain/auth/`, `domain/permissions/`(메뉴 키 포함), 권한 시드 PR, `lib/env.ts` 한도(판단). 세션 머지 불가 PR이 많으면 「의존이 되는 위험 PR」을 앞 웨이브에 두어 뒤 코드가 기다리지 않게 한다.

**권장 웨이브(제안, 계획이 확정):**
1. W-A: 순수 함수 + 설정 3키 + 시험 (코드, 병렬 가능) / R1 DTO 열거 시험 / 행동 로그 R4 / 잠금 범위 U4
2. W-B: S1 (스키마) — 위험 경로 PR 별도
3. W-C: 유효 예정일 소비처 교체 + gate + 지급 목록·승인 목록·세금 기준일(`risk:` Opus) / 알림 종류의 순수 부분
4. W-D: S2 → 알림 규칙 화면 + 종류 전부 + 이메일 형식
5. W-E: S3(거래처 / PO·예산) → 거래처 화면·프로젝트 카드(06.1-15·16 병합 뒤)
6. W-F: S4 + 권한 검수(R2·R3·R7·R14~R19) + 인증 묶음 + 폼 이관 + 계급 스모크 + SYSTEM.md 개정 마무리

`risk:` 태그 후보 플랜(Opus 실행자 + Opus 독립 검토 1): 순수 함수 소비처 교체(P1 세금 기준일), 「이번 주로」, 마감 gate, S1~S4, 권한 시드/가드, 인증.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 260907: 알림이 `isodow = 4`(목요일) 고정, 마감은 DB 함수 | 한 순수 함수에서 지급·마감·알림 파생 | 이 페이즈(D-715) | 목요일 고정 버그 구조적 차단 |
| 260907: `date_rule = after_limit` 설정 | 마감 넘기면 자동 밀림(D-704) | 2026-10-21 | 설정 분기 제거 |
| 기안자가 지급 예정일 입력 | 희망 지급일 + 사유, 예정일은 자동(경영관리만 수동) | D-714 | 폼·권한 이동 |

**낡은/바뀐 기술(CONTEXT·SCOPE 대비 현재 코드):**
- V5 「유일 색인 마이그레이션」 → **이미 main**(`0030_vendor_business_no_unique.sql`). V6 갈래 필수·더하기·바뀔 때만 검사도 이미 구현.
- CONTEXT 「수동 import 12개 누락」 — `leak-scan.test.ts` 상단 import는 ~53개이고 `leak-scan-coverage.test.ts`가 `actions.registry.ts` 누락을 이미 잡는다. 남은 것은 **`registerDto`만 있고 `actions.registry.ts`가 없는 모듈** 쪽 로드 보장(R1 범위 재정의 필요).
- `/account` `change-password-form.tsx`는 이미 `ui/form`을 import — CORE-STATE의 :30 지적을 DOM 실측으로 재확인.
- `notifications` 사건 관례(04.3-10 즉시 행 생성)와 D-716(다음 영업일 9시) 충돌 — SYSTEM.md §7-12 주석 필요.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 승인 묶음 정렬은 도메인 사전 정렬(최소 칸 → 계산 → id 본문)이 SQL 조각보다 낫다 | Pitfall P2 | 승인 건수가 크면 느림 — 측정 후 SQL 조각으로 전환 |
| A2 | 「60일 안에 금요일이 없는 건」(짧은 거래처 기한) = base 이후 첫 지급 요일부터 밀기 | Pattern 1 | 사용자 의도와 다르면 날짜가 틀림 — 확인 카드 한 줄 |
| A3 | 수동 지정 예정일은 마감을 면제한다(수동 = 이미 경영관리 판단) | Pattern 2 | 마감 지난 수동값을 경고해야 한다면 gate 규칙 변경 |
| A4 | N19(지급/취소 알림)는 N11 결과 종류에 합치고 시드 꺼짐 | SCOPE N19 | CONTEXT 시드 켜짐 목록(4+2)에 없음 — 사용자 확인 |
| A5 | 승인(미지급) 건수가 수천 건 이하 | Pitfall P2 | 도메인 정렬 비용 |
| A6 | 알림 규칙의 받는 계급 추가는 회사 전체 해당 계급 활성 사용자 | NOTI-03 | 범위(팀/본부) 제한이 필요하면 칸 추가 |
| A7 | 퇴직일 「지나면」 = `resignationDate < 오늘(KST)`(퇴직일 당일까지 로그인 가능) | §6 | 당일 차단 기대면 `<=` |
| A8 | R20 숨김 칸 정확한 형태(예: `files.hidden_reason`/가시성 칸)는 06.1 PR-D 구현을 읽고 결정 | R20 | 설계 변경 시 S3 범위 변동 |
| A9 | 시드 변경(`domain/seed/`)은 위험 경로 정규식 밖이나 사용자 머지를 권함 | Project Constraints | 세션 머지 가능한 경로로 취급되면 권한 변경이 무인 머지됨 |
| A10 | 260907 알림 종류 구현·기타 `CMP-xx` 줄(원본 미개방)은 260907-compare.md의 설명이 정확하다 | SCOPE 표 | 이식 시 규칙 오해 |

## Open Questions

1. **승인 묶음 정렬 방식(A1)**: 도메인 사전 정렬 vs SQL 조각 + 동치 시험. 권장 = 도메인(규모 작음). 플랜 첫 장에서 승인 건수 상한을 측정/추정해 확정.
2. **기존 `scheduled_payment_date` 값의 처리**: 수동값 전용으로 재해석하면 데모/스테이징 행의 기안자 입력이 「수동 지정」으로 얼어붙는다. Phase 8 전환 전이라 운영 행이 없다면 S1에서 NULL로 정리(데이터 UPDATE 한 줄)하는 것이 가장 단순. 사용자 확인 필요 — [ASSUMED] 운영 행 없음.
3. **`expenses.evidence_date`(06-06 C6 「증빙일」)와 기준일의 관계**: 이름이 비슷한 이미 있는 칸. 기준일은 `evidence_records.issued_on`(CONTEXT)로 가정 — 계획이 `evidence_date` 의미를 열어 확인.
4. **「팀장」 해석(N10)**: 단일 해석 함수가 없다. 있는 것은 `teamLeadCandidatesAtDate`(팀 범위 계급 + `projects.status` 쓰기, 후보 목록) [VERIFIED: `repositories/team-memberships.ts:91-125`]와 결재 경로 단계(역할 + 범위). 권장: 지출결의 결재 경로의 팀장 단계 보유자를 재사용. PM 계급도 팀 범위라 `teamLeadCandidatesAtDate`가 PM을 포함할 수 있음 — 확인 필요. 팀장이 본인이거나 자리가 비면 올리지 않음(Claude's Discretion).
5. **N19 시드 켜짐 여부(A4)**.
6. **알림 규칙 메뉴 키**: 새 `admin.notification-rules`(위험 경로 PR 하나 추가, 권한 격자에서 따로 부여 가능) vs `admin.settings` 재사용(권한 구분 못 함, 위험 PR 회피). 권장: 새 키(권한 분리가 UI-SPEC의 「설정·권한」 그룹 배치와 일치), 메뉴 키 PR을 앞 웨이브에서 먼저 머지.
7. **알림함 액션 3개 등록 vs 전용 시험(접힌 todo)**: 권장 = 등록 대신 전용 통합 시험(D-4208 본인 범위 유지). 사용자 확인.
8. **`loadHolidayLookup`이 읽기 경로에서 `ensureHolidayCandidates(year)`로 쓰기를 하는가**: RSC 렌더·목록 읽기에서 호출해도 되는지 확인(P3).
9. **지급·승인 목록 캐시 여부**(`unstable_cache`·`revalidate`) — 확인하지 못함. J4 시험으로 고정.
10. **희망 지급일의 상한/하한**(과거 날짜 허용?) — 입력 검증 규칙 미정. 기본: 영업일 아님도 허용(희망일이므로), 과거는 거부.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | 모든 빌드·시험 | ✓ | v22.22.0 | — |
| pnpm | 패키지·스크립트 | ✓ | 10.33.0 | — |
| psql / pg_isready | 로컬 DB 확인 | ✓ | 16.15 | — |
| docker | `pnpm db:dev`(로컬 DB), 통합·E2E | ✓ | 29.9.1 | — |
| node_modules | 시험·typecheck | ✓ | 설치됨 | — |
| 로컬 PostgreSQL 인스턴스 | 통합·E2E | 확인 안 함 (이 조사는 DB를 건드리지 않음 — 지시) | — | `pnpm db:dev`로 기동 |
| SMTP | 이메일 발송 | 개발에서는 없음 → `skipped_no_smtp` | — | 04.2 설계상 정상 경로 |
| gh / 네트워크 | PR | 이 조사 범위 밖 | — | — |

**Missing dependencies with no fallback:** 없음.
**Missing dependencies with fallback:** 로컬 DB 기동은 실행 세션에서 `pnpm db:dev`.

## Validation Architecture

> `workflow.nyquist_validation`은 `.planning/config.json`에서 명시적으로 false가 아닌 한 켜짐 — 이 조사에서 config.json 값을 직접 열어 보지는 않았으므로 켜진 것으로 간주(확인 못 함).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest(두 프로젝트 `unit`·`integration`) + Playwright |
| Config file | `vitest.config.ts`(unit: `test/unit/**/*.test.ts`; integration: `test/integration/**/*.test.ts`, `globalSetup test/integration/global-setup.ts`, `setupFiles test/integration/setup.ts`, `fileParallelism:false`), `playwright.config.ts`(projects desktop·visual·mobile-375·cert·desktop-settings·desktop-evidence) |
| Quick run command | `pnpm test:unit -- <경로>` (= `vitest run --project unit`) |
| Full suite command | `pnpm lint && pnpm typecheck && pnpm lint:sql && pnpm test:unit && pnpm test:integration && pnpm test:e2e:ci` (마지막 = `pnpm db:reset:test && CI=true pnpm test:e2e`) — 전체는 CI가 PR ready 뒤 한 번 [VERIFIED: `package.json` scripts 이번 세션] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXP-11 | 지급 예정일: 60일이 정확히 금요일·금요일 공휴일(목요일로)·월요일 휴일 직후·추석 주·거래처 기한 3일·기준일 3단 | unit | `pnpm test:unit -- test/unit/payments/pay-schedule.test.ts` | ❌ Wave 0 |
| EXP-11 | 수동 지정은 영업일만·금요일 아니면 경고·되돌리면 자동 | integration | `pnpm test:integration -- test/integration/payments/schedule-manual.test.ts` | ❌ |
| EXP-11/G31 | 공휴일 확정·삭제 전후 같은 문서 날짜 변화, 캐시 없음 | integration | `pnpm test:integration -- test/integration/payments/holiday-rederive.test.ts` | ❌ |
| EXP-11 | 세금 기준일이 유효 예정일로 계산(P1) | unit/integration | `pnpm test:unit -- test/unit/expenses/tax-basis-effective-date.test.ts` | ❌ |
| EXP-12 | 마감 경계(정각 포함·1분 뒤)·마감일 휴일 앞당김·승인 전 건 제외·밀림 사유 | unit | `pnpm test:unit -- test/unit/payments/pay-cutoff.test.ts` | ❌ |
| EXP-12 | `payment.cutoff` 게이트 미등록 이름 예외·결과 | unit | `pnpm test:unit -- test/unit/rules/payment-cutoff.test.ts` | ❌ |
| EXP-12 | 승인 시각 = 현재 차수 `max(acted_at)`, 승인 뒤 증빙 변경이 시각을 안 바꿈 | integration | `pnpm test:integration -- test/integration/payments/approved-at.test.ts` | ❌ |
| EXP-12 | 승인 묶음 도메인 정렬 = 유효 예정일 순서 | integration | `pnpm test:integration -- test/integration/expenses/list-approved-order.test.ts` | ❌ |
| NOTI-03 | 규칙 병합(기본값 ⊕ 덮어쓰기), 일수 범위 거부, 계급 추가 확장, 이메일 끔 → 새 상태 | unit/integration | `pnpm test:unit -- test/unit/notify/rules.test.ts` · `pnpm test:integration -- test/integration/notify/rules-tick.test.ts` | ❌ |
| NOTI-03 | 종류별 `evaluate`(임박·결재대기 N=0·증빙 재촉·선결제·대리 등록·사다리 3회) + `createTestConditionKind` 호환 | integration | `pnpm test:integration -- test/integration/notify/kinds-*.test.ts` | ❌ |
| NOTI-03 | 사건 종류: 비영업일 사건이 다음 영업일 tick에 한 번만 | integration | `pnpm test:integration -- test/integration/notify/events-window.test.ts` | ❌ |
| NOTI-03 | `/admin/notification-rules` 누수 스캔(`ACTION_REGISTRY` × 시드 계급)·메뉴 레지스트리·SYSTEM §6-10 | unit + integration | `pnpm test:unit -- test/unit/admin-menu-registry.test.ts test/unit/role-menu.test.ts` · `pnpm test:integration -- test/integration/leak-scan.test.ts` | ✅ 기존(수정) |
| 기준 5 | `*Dto` 열거 ↔ `DTO_REGISTRY` 미매핑 0 | unit | `pnpm test:unit -- test/unit/dto-registry-coverage.test.ts` | ❌ |
| 기준 5 | 행동 로그: `settings_change` 끌 수 없음·전후 값·마스킹·불변 트리거(DELETE/TRUNCATE 거부, pruned UPDATE 허용) | unit + integration | `pnpm test:unit -- test/unit/action-log/*` · `pnpm test:integration -- test/integration/action-log-immutable.test.ts` | 부분 ✅ / 신규 ❌ |
| 기준 5 | 계급 스모크(시드 5계급 × 메뉴 노출/404, 대표 행동 로그 열림) | e2e | `CI=true pnpm test:e2e --project=desktop test/e2e/role-smoke.spec.ts` | ❌ |
| R9/U1/U2 | 퇴직 로그인 막기·잠금 풀기·초기화(잠금 해소 + 로그) | integration | `pnpm test:integration -- test/integration/auth/*.test.ts` (`x-client-ip` 헤더 필수) | 부분 ✅ |
| R13 | 설정 폼·`/account` DOM 실측(§6-3, §7-2) | e2e(독립 DOM 감사) | `CI=true pnpm test:e2e --project=desktop-settings` | 부분 ✅ |

### Sampling Rate
- **Per task commit:** `pnpm lint && pnpm typecheck` + 바뀐 파일 관련 `pnpm test:unit -- <경로>`(+ 바뀐 DB 코드는 해당 통합 파일 하나) — 전체 통합은 로컬에서 돌리지 않음(CLAUDE.md §5).
- **Per wave merge:** 위 + 해당 웨이브 통합 시험 + 건드린 화면 E2E 스펙, 스키마 플랜은 `pnpm lint:sql`·`pnpm db:generate` 재생성 확인.
- **Phase gate:** PR ready 뒤 CI(전체 단위·통합·E2E 샤드 2개, `CI=true` 프로덕션 빌드) 초록 → `/gsd-verify-work`. 테스트 DB는 공유라 DB·Playwright 작업은 한 번에 하나.

### Wave 0 Gaps
- [ ] `test/unit/payments/pay-schedule.test.ts` · `pay-cutoff.test.ts` — EXP-11·12 순수 함수 (공휴일 lookup은 고정 Set 주입, DB 불필요)
- [ ] `test/unit/dto-registry-coverage.test.ts` — 미매핑 `*Dto` 0
- [ ] `test/e2e/role-smoke.spec.ts` — 계급 스모크
- [ ] `test/unit/notify/rules.test.ts` — 규칙 병합(+ `test/support/notify-tick.ts`가 새 `evaluate` ctx 필드를 안 깨는지)
- [ ] 프레임워크 설치: 없음(모두 기존)

## Security Domain

> `security_enforcement` 설정은 직접 열어 확인하지 못함 — 켜진 것으로 간주(absent = enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | 퇴직일 로그인 막기, 잠금 풀기·초기화 단추의 권한 판정과 임시 비밀번호 한 번 표시(재표시 불가), 로그인 IP 한도·계정별 잠금(`domain/auth/lockout.ts`) — 직접 짜지 말고 기존 `unlockAccount`/`resetPassword` 확장 |
| V3 Session Management | yes | 초기화 시 기존 세션 삭제(이미 함), 퇴직 판정은 `getSession()`에서도 |
| V4 Access Control | yes | 서버 `can()`/`visible()`/`scopeFor()`, 새 액션은 `authedActionClient` + 누수 스캔 등록, 예산·사용액은 서버 권한으로 경영관리만(화면 숨김만으로 끝내지 않음), 계급 가드(P-H) 서버 측 |
| V5 Input Validation | yes | zod(액션 스키마), 희망 지급일/사유 both-or-neither(액션 + DB CHECK), 알림 규칙 일수는 종류 허용 범위 안, 업로드 형식·크기(기존 `upload_intents`) |
| V6 Cryptography | yes | 계좌번호는 앱단 암호화(`lib/crypto*`, 위험 경로) — 새 암호화 로직 금지, 자릿수 서식(C-35)은 표시층만. 변경 기록은 「바뀜」 또는 뒤 4자리만 저장(R5) |
| V7 Error/Logging | yes | 행동 로그 불변(트리거), 민감값 마스킹, 로그에 비밀번호·토큰·알림 내용 안 싣기(`handle.ts` 관례) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 행동 로그 위조·삭제 | Tampering/Repudiation | 불변 트리거(S4), 정리는 `pruned_at` 표시 UPDATE만 |
| 권한 없는 사람이 예정일·「이번 주로」 변경 | Elevation | `can(viewer,"expenses.payments","write")` 서버 판정(기존 `saveScheduledPayDate` 패턴) |
| 알림 내용·링크로 타인 문서 노출 | Information Disclosure | N25 착지는 보임 판정 후 URL, 이메일 줄도 같은 함수, 메시지는 DTO 투영된 값만 |
| 거래처 통장 사본·계좌 노출 | Information Disclosure | 마스킹 해제 권한(`mask_reveal` ALWAYS_ON)과 같은 권한, 파일 보임 판정 |
| 임시 비밀번호 재사용·노출 | Information Disclosure | 한 번만 표시, 응답 외 어디에도 저장·로그 금지, 즉시 변경 강제(`passwordIsTemporary`) |
| 로그인 무차별 대입(IP 한도 상향의 대가) | DoS/Spoofing | 계정별 잠금이 방어(3~10회, 1~60분 범위), 한도 상향은 운영 환경 변수로 조정 가능 |
| 예산 정보 누출 | Information Disclosure | 서버 권한 + 누수 스캔 정보 항목(`infoItem`) 등록 |
| 알림 후보 폭주 | DoS | 종류별 평가량 상한 + `NOTIFY_TICK_BATCH_MAX`, `oldestFirst` 정렬 |

## Sources

### Primary (HIGH confidence — 이번 세션 repo 파일을 열어 확인)
- `/home/user/ERP_PLANT8_260917/.planning/phases/07-schedule-notify-audit/07-CONTEXT.md`, `07-SCOPE-ITEMS.md`, `07-UI-SPEC.md`(앞선 세션 전체 읽음)
- `db/schema/{expenses,approvals,notifications,files,projects,revenue-entries,evidence-records}.ts`, `domain/{notify,holidays,settings,action-log,rules,payments,expenses,vendors,auth,permissions,seed,people}/…`, `repositories/{expenses,team-memberships,notifications,...}.ts`, `lib/{auth,env,viewer}.ts`, `app/internal/notify-tick/handle.ts`, `scripts/deploy.sh:629-650`, `playwright.config.ts`, `vitest.config.ts`, `.github/workflows/ci.yml`, `package.json`, `.claude/hooks/plant8-skill-gate.sh:311`, `.claude/rules/{db,deploy,tests}.md`, `docs/ARCHITECTURE.md` §4-2·§4-9·§10
- `/mnt/project-files/07-prep/{core-state,rules,260907-compare,carryover}.md`, `/mnt/project-files/notes/fund-forecast/design.md`
- 옛 저장소(읽기 전용): `ERP_PLANT8_260907 db/schema/020_functions.sql:96-132,247-290,3415-3462,3578,3968-4033`, `010_tables.sql:2673,2813,3729-3777,4214,4224,5259,5314,5428,5448-5449`, `050_seed_settings.sql:363-364`, `server/src/notices.ts:2890-2935`, `server/src/payments.ts:150-165,938-945`, `server/src/people.ts:1011`, `server/src/projects.ts:585-590`

### Secondary (MEDIUM confidence)
- 앞선 세션에서 읽고 요약으로 이어받은 코드(개별 줄은 위 본문에 「앞선 세션 확인」으로 표시)

### Tertiary (LOW / 확인 못 함)
- 260907 `Receipts.tsx` :735/:2016/:2300 — 열어 보니 증빙 분할·잠금 풀기 단추 문구 자리로 07(지급일·알림·권한)과 직접 관련 없음 → 인용하지 않음. `notices.ts`의 개별 알림 종류 함수, `server/src/people.ts`의 비밀번호 초기화 라우트(grep 미검출) — 확인 못 함
- `.planning/config.json`의 `nyquist_validation`·`security_enforcement` 값, 06.1-15·16 스키마 변경 여부, `unstable_cache` 사용 여부 — 확인 못 함

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 패키지 없음, 기존 틀 재사용 확인
- Architecture(순수 함수·gate·규칙 표·tick 확장): MEDIUM-HIGH — 코드 위치·모양은 확인했으나 Pattern 1의 「밀림」 해석(A2/A3)과 승인 목록 정렬(A1)은 사용자·측정 확인 필요
- Pitfalls: HIGH — 대부분 현재 코드의 실제 제약(CHECK, lookup 예외, `addBusinessDays(n=0)`, 인스턴스 `updated_at`)에서 도출
- 84행 노트: MEDIUM — 파일 후보는 확인했지만 일부 화면·권한 줄(R14~R19, S1, W5/W6 위치)은 실행 첫 DOM/코드 실측에서 다시 센다

**Research date:** 2026-10-20
**Valid until:** 2026-11-03 (06.1-15·16 병합과 SYSTEM.md 개정 전까지. 병합되면 expense-form·`[id]/page.tsx` 소비처 줄 번호를 다시 확인)
