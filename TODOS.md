# TODOS

## Infrastructure

### Google Workspace SMTP 릴레이 설정 확인

**What:** 회사 Google 계정으로 알림 메일을 보내기 위한 Workspace SMTP 릴레이(또는 앱 비밀번호 + smtp.gmail.com)의 발송 한도·인증 방식·발신자 주소 정책을 관리자 콘솔에서 확인한다.

**Why:** D5는 "회사 Google SMTP"로 확정했지만 STACK.md:131은 Gmail SMTP의 한도·스팸 정책 변동을 경고한다. 설정이 막히면 알림 페이즈가 멈춘다.

**Context:** 환경 변수 4개(host·user·password·from)는 Phase 1에서 정의하고 발송은 알림 페이즈(Phase 6 분할 후 알림 페이즈)에서 활성화한다. 회사 GCP를 다음 주 확보하므로 같은 때 Workspace 관리자에게 확인한다. 확인 결과는 `docs/OPERATIONS.md`의 알림 절에 적는다.

**Effort:** S
**Priority:** P2
**Depends on:** 회사 Google Workspace 관리자 권한

### exceljs 유지보수 상태 6개월 재점검

**What:** Excel 내보내기에 쓰는 exceljs(4.4.0, 3년째 릴리스 없음)의 보안·호환 상태를 6개월마다 점검하고 대안(포크 등, SheetJS 무료판 제외)을 검토한다.

**Why:** STACK.md:73이 "버전 고정 + 6개월마다 재점검"을 조건으로 채택했다. 점검 없이 쓰면 취약점을 모른 채 방치한다.

**Context:** Excel 내보내기는 Phase 8(손익 목록)부터 쓴다. 포맷·병합 셀이 필요해 CSV로는 대체할 수 없다. 첫 점검 시점은 Phase 8 계획 시, 이후 6개월 주기.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Phase 4 이연(2026-09-23 CEO 리뷰)

### 목록 상단 2px 로딩 막대

**What:** 프로젝트 목록(S1)·페이지 이동(S12)의 상단 2px 진행 막대를 만든다.

**Why:** UI-SPEC rev 4는 막대를 그렸지만 SYSTEM.md가 막대 색을 `--accent`로 정하면서 §1-3은 `--accent` 사용처를 다섯 곳으로 제한해 서로 충돌한다(CEO 리뷰 C-10, 사용자 D17 「만들지 않고 기록」). 지금은 표 자리 표시(스켈레톤)만으로 로딩을 보인다.

**Context:** Phase 4 뒤 디자인 잔여 퀵 태스크(F-01·F-03·F-05·F-06·F-07)와 함께 처리한다. 먼저 `docs/design/DECISIONS.md`에 §1-3 사용처를 여섯 곳으로 늘릴지(또는 다른 토큰) 정하고 SYSTEM.md를 고친 뒤 앱 공통 셸에 한 번만 만든다. 리뷰 원문: `docs/designs/plant8-erp-phase4-ceo-review-260923.md`.

**Effort:** S (human) / S (CC)
**Priority:** P3
**Depends on:** Phase 4 완료, 디자인 잔여 퀵 태스크

### 자동 정산(진행→정산)을 예약 작업으로 옮기기

**What:** 종료일이 지난 진행 프로젝트를 KST 00:00에 정산으로 바꾸는 판정을 Cloud Scheduler 작업에서도 실행한다.

**Why:** Phase 4는 화면을 열거나 저장할 때 판정한다(사용자 D19-8). 아무도 열지 않은 프로젝트는 다음 조회 때까지 이력의 전환 시각이 늦게 찍힌다.

**Context:** Phase 7의 알림 예약 작업(notify-tick)과 같은 Scheduler 기반을 쓴다. 판정 함수(04-11, 주입 가능한 now, 멱등 UPDATE, actor=system)를 그대로 호출하면 된다. 읽을 때 판정은 안전망으로 남긴다.

**Effort:** S (human) / S (CC)
**Priority:** P2
**Depends on:** Phase 7 Scheduler 기반

## Phase 04.4 CEO 리뷰 이연(2026-09-26, Phase 8 전)

리뷰 원문: `docs/designs/plant8-erp-phase04.4-ceo-review-260926.md`. 여섯 항목 모두 Phase 8(전환) 전에 처리한다.

### 프로덕션 리허설 전 실입력 표를 확인 목록에 더하기 (CEO-3)

**What:** `domain/ops/restore-check-tables.ts` `RESTORE_CHECK_TABLES`에 그때 main에 있는 직원 입력 표(프로젝트·견적 줄 등)를 「비어 있지 않음」으로 더한다.

**Why:** 04.4의 목록은 시드가 채우는 표뿐이다. 그래서 프로덕션 리허설 성공이 「직원 입력이 복원된다」를 증명하지 못한다.

**Effort:** S / S · **Priority:** P1 · **Depends on:** Phase 4 머지, 04.4 완료

### GCP 예산 경보 등록 (CEO-4)

**What:** D-06 상한($30)에 맞춘 GCP 예산 경보를 등록한다(부트스트랩 스크립트 또는 OPERATIONS §2 수동 절차).

**Why:** 러너를 잃어 남은 리허설 임시 인스턴스(db-f1-micro)는 다음 수동 실행 때만 잡힌다. 한 달 남으면 상한의 약 1/3이 조용히 샌다. 지금 비용 확인은 매월 초 수동뿐이다.

**Effort:** S / S · **Priority:** P2 · **Depends on:** 없음

### 리허설 전용 최소 권한 SA·WIF ref 조건 (CEO-5)

**What:** 리허설 워크플로가 `roles/cloudsql.admin` 배포 SA 대신 임시 인스턴스만 다루는 전용 SA를 쓰게 하고, WIF에 main ref 조건을 건다.

**Why:** 04.4는 이 분리를 「Phase 8 후속」으로 미뤘는데(04.4-03 T-04.4-14), 플랜 본문 말고는 추적되는 곳이 없었다.

**Effort:** M / S · **Priority:** P2 · **Depends on:** 04.4 완료

### 프로덕션 리허설은 전환 최소 1주 전 (CEO-6)

**What:** Phase 8 전환일 체크리스트에 「프로덕션 원본 리허설은 전환일이 아니라 최소 1주 전에 돌린다」를 넣는다.

**Why:** 프로덕션 경로(`plant8-prod-restore`, 운영 IAM DB 사용자, 확인 입력)는 04.4에서 한 번도 실제로 돌지 않는다. 첫 실패를 고칠 시간이 필요하다.

**Effort:** S / S · **Priority:** P1 · **Depends on:** Phase 8 계획

### 체크리스트의 리허설 확인은 일시까지 본다 (CEO-7)

**What:** Phase 8 체크리스트의 「복원 리허설 결과 확인」은 상태 화면 행의 결과뿐 아니라 일시가 그 리허설 날짜인지까지 본다.

**Why:** 기록 전에 일찍 실패하면(WIF 인증 등) 화면에 이전 성공이 최신처럼 남는다(04.4 UI-SPEC 139행).

**Effort:** S / S · **Priority:** P2 · **Depends on:** Phase 8 계획

### PITR 켜기 사용자 결정 (CEO-8)

**What:** 전환 전에 Cloud SQL PITR(바이너리 로그)을 켤지 사용자 결정 카드로 묻는다.

**Why:** 지금 복원 단위는 하루 1회 자동 백업이라 RPO가 24시간이다. 돈 데이터로 전환한 뒤에는 하루치 지출결의를 잃을 수 있다. 작은 DB에서는 월 몇 달러 수준이다(D-06 상한 안에서 따져 본다).

**Effort:** S / S · **Priority:** P1 · **Depends on:** 없음

## 04.4 후속 이연(2026-09-30 quick 260930-f3l · PR #108)

### 관리 표 행 행동 간격 `--s-4` — 거래처 · 법인카드 · 코드표

해결: `89f19f8` (quick 260930-nto, PR #111)

**What:** /admin/vendors(「수정 · 숨기기 · 삭제」) · /admin/corp-cards(「비활성화 · 삭제」) · /admin/code-tables 행 행동 사이가 1280에서 0px라 한 단어처럼 읽히고 「삭제」가 옆 행동에 붙는다. 사람 목록 `.rowActions`(inline-flex · gap `var(--s-4)` · 700 미만만 줄바꿈 · 「상세」 같은 짧은 링크는 자체 `white-space: nowrap`)와 같은 규칙으로 맞춘다. 「공유 Button `.tertiary` 밑줄을 글자 밑줄로」와 한 quick으로.

**Why:** SYSTEM §6-1 행 안 두 행동 `--s-4` 이상 · 「위험한 동작은 떨어뜨려 둔다」. PR #108이 사람 목록만 맞춰 「화면 하나만 예외 금지」에 걸린다(`/design-review` FINDING-001, high).

**Context:** 출처 `vendors/page.tsx:161-174` · `corp-cards/page.tsx:188-194` · `code-tables/page.tsx:173-174`. 함정: 칸 전체에 `white-space: nowrap`을 두면 삭제 확인 줄이 표를 넘친다(768에서 14.66px 실측) — 짧은 링크에만 둔다. 사용자 결정(2026-09-30): 별도 quick.

**Effort:** S · **Priority:** P2 · **Depends on:** None

### 디자인 다듬기 3건(/design-review polish)

**What:** ① /admin/system-status 「DB 커넥션 8 / 100」 · 배포 버전 · 마지막 백업 일시에 tabular-nums(`system-status/page.tsx:95-121`, §2-4) ② 삭제 확인 문구가 행 이름을 되풀이하고 「-습니다」 두 문장(`archive/delete-to-archive.tsx:50`, §8 규칙 3·5·6) — 44자 이름에서 행이 1280 55→97px · 375 124.5→236.5px ③ /admin/action-log 「사람」 select가 가장 긴 이름만큼(1280에서 502px) 늘어 필터 줄이 두 줄(§6-1 한 줄) — `.select`에 `ch` 기준 max-width.

**Why:** SYSTEM 규칙과 어긋나지만 기능 영향 없음(polish).

**Effort:** S · **Priority:** P3 · **Depends on:** None

### 행동 로그 · 사람 DTO 기존 결함 3건(/review 범위 밖)

**What:** ① 「사람」 칸이 숨겨진 계급(person.value 꺼짐)도 URL `actorId`가 조회 · 엑셀 내보내기 · 정리(prune) 범위를 좁힌다 — 보이지 않는 조건. 서버에서 무시하거나 보이는 칩으로 ② action_log.detail 노출이 꺼진 계급은 /admin/action-log가 500(`domain/action-log/index.ts:265`) ③ `domain/people/index.ts:104`가 `Partial<PersonDto>`를 `PersonDto`로 단언해 「키가 없을 수 있음」이 타입에 안 보인다 — 다른 화면에서 같은 id 누락 버그가 다시 난다.

**Why:** 권한이 좁은 계급의 화면이 깨지거나 보이지 않는 조건으로 동작한다. ②는 오류 화면.

**Context:** `domain/` 변경이라 PR #108 범위 밖. ①은 정리(prune) 범위라 되돌릴 수 없는 동작과 이어진다 — 우선.

**Effort:** M · **Priority:** P1(① · ②) / P2(③) · **Depends on:** None

### NextTurn `.tertiary` · Table `.emptyAction` 밑줄도 글자 밑줄로(quick 260930-nto eng review R3)

**What:** `ui/next-turn/NextTurn.module.css:124-137`(`.tertiary` border-bottom · hover `border-bottom-width`)와 `ui/table/Table.module.css:216-225`(`.emptyAction` border-bottom)의 3차 밑줄을 공유 Button `.tertiary`(`ff64212`)와 같은 글자 밑줄(`text-decoration: underline` · `--underline-offset` · hover 두께 `--line-w-strong`)로 바꾸고, `test/unit/app/tertiary-underline-css.test.ts` 점검 범위에 넣는다.

**Why:** §4-4 3차 밑줄 규칙과 다르고, 같은 결함(폰 44px 상자 바닥 밑줄 · hover 때 상자 높이 변화)이 컴포넌트마다 남는다. PR #111은 사용자 범위(공유 Button)만 고쳤다.

**Context:** 원천 소스만 읽었고 실측 전. 셀 입력 밑줄(`project-detail.module.css:110` · `reserves.module.css:25`)은 3차가 아니라 대상 아님.

**Effort:** S · **Priority:** P2 · **Depends on:** PR #111

### 코드표 보관 행 높이 35.39px < `--row-min`(quick 260930-nto 독립 DOM 감사)

**What:** `app/(app)/admin/code-tables/code-tables.module.css`의 `.table td { min-height: var(--row-min) }`는 표 칸에 적용되지 않는다. 입력 칸이 없는 보관 행(시스템 관리자에게 보임)이 1280에서 35.39px로 36px 아래다. 거래처 · 법인카드 · 보관함처럼 `height: var(--row-min)`으로 바꾸고, `test/e2e/table-row-min.spec.ts`에 보관 항목을 심어 매번 잡히게 한다.

**Why:** `table-row-min.spec.ts`가 전체 E2E에서 실행 순서에 따라 실패한다 — 다른 스펙이 erp_test에 보관 항목을 남기면 걸린다(260930-nto 전체 실행 1회 실패, 감사가 소수점까지 재현). ready 전환 뒤 CI 전체 E2E를 빨갛게 할 수 있다.

**Context:** base `3774333`(PR #108)에도 같은 규칙 — PR #111 변경 아님. 감사 보고서 `.planning/quick/260930-nto-row-actions-gap-and-tertiary-underline/260930-nto-DOM-AUDIT.md`.

**Effort:** S · **Priority:** P2 · **Depends on:** None

### 대기 중 3차 버튼 밑줄 두 토막(PR #111 /review · /qa)

**What:** 공유 Button `.tertiary` 밑줄이 `<button>`(flex)에 걸려 대기 중에는 라벨 `<span>`과 「…」 `<span>`에 따로 그어지고 사이 8px(`--s-2`)는 비어 보인다(/qa 실측: 라벨 29.38px + 간격 8px + 「…」 9.8px, 밑줄 색 `--line`). 밑줄을 라벨 span에만 걸지(`.tertiary > span:first-child`) 정한다.

**Why:** 예전 border-bottom은 한 줄이었다. 요청 중 잠깐만 보이지만 3차 버튼 약 35곳 전부 해당.

**Context:** D5(대기 「…」 그대로) 결정과 같은 쪽으로 PR #111에서 고치지 않았다. 고치면 D4 계산 스타일 일치 단언 · hover 규칙 구조가 바뀐다.

**Effort:** S · **Priority:** P3 · **Depends on:** PR #111

### 폰 법인카드 「삭제」 확인 문구가 66~89px 폭에 10~11줄(PR #111 /qa)

**What:** 폰 375/320에서 법인카드 행 「삭제」 확인 문구(`<이름> 삭제 · 보관함으로 이동합니다 · 관리자가 복원할 수 있습니다`)가 동작 칸 폭 105/82px 안에서 89/66px로 눌려 10/11줄이 된다(거래처는 151/124px, 5/7줄). 표가 내용 폭이라 긴 다른 열이 동작 칸을 누른다. 넘침은 0.

**Why:** 되돌릴 수 없는 일의 확인 문구가 세로로 길게 쪼개져 읽기 어렵다(§7 사용성).

**Context:** base `3774333`에서도 차이 2px 이내·줄 수 같음 — PR #111 변경 아님(/qa가 base 빌드와 비교 실측).

**Effort:** S · **Priority:** P3 · **Depends on:** None

### 폰 코드표에서 비활성화 · 삭제를 할 수 없다(PR #111 /design-review FINDING-002)

**What:** `code-tables.module.css:157-181`이 동작 열(6열)을 700 미만에서 `display: none`으로 숨겨 699/375/320에서 「비활성화」「삭제」가 0×0이다. 거래처 · 법인카드 · 사람은 폰에서도 행동이 보인다. P2로 접거나 P1에 두어 같은 방식으로 맞춘다.

**Why:** SYSTEM §7-3 「상세 화면이 없는 목록은 P3로 숨기지 않고 P2로 접는다(숨기면 폰에서 볼 길이 없다)」 위반. 관리 마스터 화면끼리도 다르다(§6-1).

**Context:** PR #111 이전부터(이 PR의 `.rowActions` 폰 줄바꿈 규칙은 코드표에서 적용될 일이 없다). DOM 실측은 PR #111 /design-review.

**Effort:** S · **Priority:** P2 · **Depends on:** None

### 관리 표 행 행동 주변 작은 불일치(PR #111 /design-review 폴리시)

**What:** ① 거래처 · 법인카드 · 코드표 표 칸 line-height가 본문 값 19.2px(1.6)이라 행동 상자가 19.19px, 사람 목록은 `--lh-table` 18px(§2-3 「표 셀 line-height 1.5」) — 세 모듈 `.table td`에 `line-height: var(--lh-table)`. ② 폰 375에서 거래처 · 법인카드 행이 44px 목표 3개가 세로로 쌓여 184.5/213px(§7-3 폰 P1 「행동 1개 · 두 줄」과 긴장) — 폰 P1에 행동을 하나만 둘지 결정. ③ 짧은 행 링크 한 줄 유지 방식이 세 가지(사람 `.detailLink` 복사 · 거래처/법인카드 `.toggle`+`.rowLink` · Button `.tertiary` 내장)이고, `.rowLink` 이름은 결재함 · 연차의 「행 전체 탭 링크」와 뜻이 다르다. ④ 폰에서 `.toggle` · `.tertiary`는 좌우 padding `--s-2`가 있고 사람 `.detailLink`는 없어, 가로로 놓일 때 보이는 글자 간격이 24px/32px로 다를 수 있다(미실측).

**Why:** 같은 패턴이 화면마다 조금씩 갈라진다(「화면 하나만 예외 금지」).

**Context:** 모두 PR #111 이전부터 있던 것. ③ ④는 소스 검토, ① ②는 DOM 실측.

**Effort:** S · **Priority:** P3 · **Depends on:** PR #111

## 운영 배포 준비: 보안 스캐너 CI(2026-09-30, Phase 8 전)

### 보안 스캐너 5종을 CI에 넣기 (#109)

**What:** GitHub Actions에 gitleaks · semgrep · zizmor · osv-scanner · trivy를 넣고, main 전체로 첫 결과를 확인한다. 결함은 별도 PR로 고친다.

**Why:** 04.4 `/cso`는 클라우드 컨테이너에 Docker가 없어 스캐너를 돌리지 못하고 정적 검토로만 통과했다(`.claude/gates/phase-04.4.log`). `ci.yml`에는 비밀 유출 · 의존성 취약점 · 워크플로 보안 검사가 없다. 사용자 결정(2026-09-30): 로컬 Docker 대신 CI(선택 A), 운영 배포 준비 때.

**Effort:** S / S · **Priority:** P1 · **Depends on:** Phase 8 계획 · `.github/workflows/` 변경이라 사용자가 머지

## Completed

### FINDING-001 PC에서 「내 차례」(`/`)로 돌아가는 길이 없다

상단 바 워드마크를 `/` 링크(aria-label 「PLANT8 내 차례」)로 만들었다. Tab 순서는 스킵 링크 → 워드마크 → 프로젝트.

**Completed:** 2026-09-24 (`257c2ab`, 회귀 테스트 `test/e2e/wordmark-home.spec.ts`·`mobile-wordmark-home.spec.ts`)

## Design review 이연(2026-09-24 /design-review, Phase 2 화면)

리포트: `~/.gstack/projects/rrangjaa-eng-ERP_PLANT8_260917/designs/design-audit-20260924/design-audit-127.0.0.1.md`

### FINDING-006 `/projects` 로딩 뼈대의 300ms 지연 표시

**What:** `app/(app)/projects/loading.tsx` 뼈대가 지연 없이 약 90ms 번쩍이고, 모양(표 머리글 + 3행 + 합계)이 실제 EMPTY 화면(필터 + 한 줄)과 달라 한 번 튄다. §7-7 「300ms 안에 끝나면 아무것도 보이지 않게」를 지킬 공용 수단을 §5에 정하고 모든 `loading.tsx`에 적용한다.

**Why:** 계약 위반이 실측됐다(Medium).

**Context:** 지연 수단(`animation-delay` 등)이 §5 모션 허용 목록에 없어 시스템 결정이 먼저다.

**Effort:** S
**Priority:** P2
**Depends on:** SYSTEM.md §5·§7-7 결정

### FINDING-007 `/account` 서버 오류를 칸에 묶기

**What:** 「현재 비밀번호가 올바르지 않습니다.」가 칸 아래 12px가 아니라 폼 아래 14px 전역 줄이고 `#currentPassword`에 `aria-invalid`가 없다(§7-2). 이월 M-2·A-H3과 함께 폼 이관 때 처리한다.

**Why:** 어느 칸이 틀렸는지 칸이 말하지 않는다(Medium).

**Context:** 서버 문구는 `test/e2e/change-password.spec.ts` 계약이다. `03-OPEN-ITEMS.md`의 A-H3·M-1·M-2 일정(제작 Phase 4 · 이관 Phase 7)을 따른다.

**Effort:** S
**Priority:** P2
**Depends on:** Phase 4 `ui/form`

### 공유 Button `.tertiary` 밑줄을 글자 밑줄로

해결: `ff64212` (quick 260930-nto, PR #111)

**What:** `ui/button/Button.module.css:52-81`의 3차 버튼이 `border-bottom` 밑줄이라 폰 44px 상자에서 글자와 떨어진다. FINDING-005(`ListEmpty`, 고침 `2342b01`)와 같은 수정(`text-decoration: underline` + `--underline-offset`)을 관리자·Phase 4 화면을 잰 뒤 적용한다.

**Why:** §4-4 3차 버튼 밑줄 규칙과 다르고 화면마다 밑줄 방식이 갈린다.

**Context:** Phase 2 화면에는 렌더되지 않아 이번 리뷰 범위 밖이었다. 2026-09-30 quick 260930-f3l `/design-review` FINDING-002가 다시 확인했다 — 폰 375에서 「삭제」 밑줄이 글자 아래 13.5px(보관함 「복원」 12.9px), hover 때 상자 19→20px · 글자 0.5px 이동. 같은 칸의 「상세」(글자 밑줄)와 모양이 다르다. 「관리 표 행 행동 간격」(아래 04.4 후속 이연)과 한 quick으로 묶는다(사용자 결정 2026-09-30).

**Effort:** S
**Priority:** P2
**Depends on:** None

## QA 이연(2026-09-24 /qa, Phase 2 화면)

`/qa`가 찾았지만 기존 테스트 수정·시스템 결정이 먼저라 고치지 않은 결함이다. 고친 것: ISSUE-001(`/projects` 필터 칸이 URL과 어긋남, `01c3b6c`).

### ISSUE-002 `/projects?new=1`에서 `id="teamId"`가 두 개

**What:** 등록 폼(`project-form.tsx:88-89`)과 필터(`filter-bar.tsx`)가 둘 다 `id="teamId"`를 쓴다. 폼이 열리면 필터 「팀」 select는 접근 이름이 비고, 폼 select는 「팀 팀」으로 읽히며, 필터 라벨을 눌러도 폼 칸으로 간다.

**Why:** 스크린 리더 사용자가 필터 칸을 식별할 수 없다(Accessibility, Medium).

**Context:** id를 고치면 필터 칸도 「팀」 라벨을 얻어 `test/e2e/project-register.spec.ts:30·102`의 `getByLabel("팀")`이 두 요소에 걸려 strict 모드로 실패한다 — 기존 테스트 수정이 필요해 이번 QA에서 미뤘다. 그 스펙을 폼 범위 로케이터로 바꾸는 것과 함께 고친다.

**Effort:** S
**Priority:** P2
**Depends on:** `project-register.spec.ts` 로케이터 수정 승인

### ISSUE-003 폰에서 시트로 가는 화면은 현재 위치 표시가 없다

**What:** 375에서 하단 탭에 없는 화면(PM의 `/cards`·`/approvals`·`/pnl`·`/account`·`/settings`, 시스템 관리자의 `/projects` 등)에 있으면 하단 탭·「더보기」 시트 어디에도 `aria-current`가 없다.

**Why:** §2 포인트 색 ⑤ 「현재 위치」가 폰에서 절반 화면에만 있다(UX, Low).

**Context:** 「더보기」 탭에 표시할지, 시트 행에 표시할지 §6-0·§7-8 결정이 먼저다.

**Effort:** S
**Priority:** P3
**Depends on:** SYSTEM.md §6-0 결정

### ISSUE-004 PC에서 `/settings`로 가는 길이 없다

**What:** 폰 「더보기」 시트에는 「설정」이 있는데 PC 사용자 메뉴는 §6-0 (a)대로 관리 · 내 정보 · 로그아웃뿐이다.

**Why:** PC 사용자는 URL을 직접 쳐야 설정 화면에 닿는다(UX, Low). FINDING-001(해결: `257c2ab`)과 같은 결.

**Context:** §6-0 (a) 사용자 메뉴 구성 결정이 먼저다.

**Effort:** S
**Priority:** P3
**Depends on:** SYSTEM.md §6-0 (a) 결정

### ISSUE-005 잠금 문구의 「15분」이 설정값과 따로 논다

**What:** `domain/auth/locked-message.ts`의 문구가 「15분 뒤」로 고정인데 잠금 창은 설정 레지스트리 `auth.lockout.window_minutes`에서 바뀐다.

**Why:** 관리자가 창을 바꾸면 잠긴 사용자가 틀린 대기 시간을 본다(Content, Low).

**Context:** 문구는 클라이언트 번들 제약으로 import 없는 잎 모듈이고 `login-error.ts`가 정확 대조한다. 문구를 동적으로 하려면 대조 방식부터 바꿔야 하고 인증 영역이라 `/cso` 대상이다.

**Effort:** S
**Priority:** P3
**Depends on:** 문구 정책 결정

### ISSUE-006 로그인한 채 `/login`을 열면 로그인 폼이 그대로 보인다

**What:** 세션이 있는 사용자가 `/login`에 가면 리디렉션 없이 폼이 뜬다.

**Why:** 이미 로그인한 사람에게 필요 없는 화면이다(UX, Low).

**Context:** §6-7 로그인 화면 규정에 이 경우가 없다.

**Effort:** S
**Priority:** P3
**Depends on:** SYSTEM.md §6-7 결정

### `/admin/action-log` 필터도 ISSUE-001과 같은 뿌리

**What:** `app/(app)/admin/action-log/filter-bar.tsx`가 같은 네이티브 GET + `defaultValue` 패턴이라 「필터 지우기」·뒤로 가기 뒤 칸이 URL과 어긋날 수 있다(Phase 3 관리자 화면이라 이번 QA 범위 밖, 실측 안 함).

**Why:** 목록은 필터 없이 그려지는데 칸은 이전 값을 보인다.

**Context:** ISSUE-001 수정(`01c3b6c`: `key` + `autoComplete="off"`)을 그대로 적용하면 된다. 실측 뒤 적용할 것.

**Effort:** S
**Priority:** P2
**Depends on:** None

### 상단 바 포커스 링이 위아래로 잘린다

**What:** 워드마크·사용자 트리거·메뉴 링크가 바 높이(PC 38px)를 거의 다 채우고 링은 `outline-offset: var(--focus-offset)`(2px, 바깥)이라, 링 윗변은 화면 밖(바가 sticky top:0)이고 아랫변은 흰 본문 위의 --bar-fg라 거의 안 보인다. 좌우 변만 보인다.

**Why:** 포커스 위치는 알 수 있지만 링이 온전하지 않다(/review 2026-09-24, 신뢰도 중간 — 실측 필요).

**Context:** 바 안쪽 링(`outline-offset: calc(-1 * var(--focus-w))`)으로 바꾸면 풀리지만 SYSTEM.md가 링 offset을 2px로 정하고 안쪽 링은 전폭 목록 행에만 둔다 — DECISIONS.md 기록과 SYSTEM.md 수정이 먼저다. `.navLink`는 이번 PR 전부터 같은 모양이다.

**Effort:** S
**Priority:** P2
**Depends on:** SYSTEM.md 포커스 링 규정 결정

## Design review 이연(2026-09-26 /design-review, 320px 가로 넘침 PR)

### 폰 접힌 줄이 다음 행에 붙어 보이는 선 배치

> Fixed by /review on claude/lucid-volta-qkmgs7, 2026-09-26 — 폰에서 선을 접힌 줄 아래로 옮겼다(ui/table + 관리자 세 표, 회귀: test/e2e/mobile-320-no-overflow.spec.ts `expectFoldAttached`).

**What:** 폰(<700)에서 주 행 아래에 1px 선이 있고 접힌 줄 아래에는 선이 없다. 그래서 접힌 줄(P2)이 자기 행이 아니라 다음 행에 붙어 보일 수 있다. 주 행 아래 선을 0으로, 접힌 줄 아래를 1px로 옮긴다.

**Why:** SYSTEM.md §7-3은 「행은 두 줄이 된다」, 곧 한 행으로 읽혀야 한다. 지금 선 배치는 그 묶음을 끊는다(DOM 실측: 접힌 줄 border-bottom 0, 주 행 td 1px).

**Context:** `ui/table/Table.module.css`(.cell·.collapsedCell)에서 온 모양이다. 관리자 행동 로그·거래처·보관함 표(`app/(app)/admin/{action-log,vendors,archive}/*.module.css`)는 일관성을 위해 같게 맞췄다. 한 곳만 고치면 표마다 모양이 달라지므로 넷을 함께 고친다.

**Effort:** S
**Priority:** P3
**Depends on:** None

### 폰 프로젝트 목록의 프로젝트명 링크 누르는 영역 18px

**What:** 폰에서 프로젝트 목록(ui/table) 프로젝트명 링크의 높이가 18px이다. 행 높이는 44px 이상이지만 링크 자체의 누르는 영역은 작다.

**Why:** SYSTEM.md §3 「폰에서 모든 행동 요소 최소 44×44」.

**Context:** `app/(app)/projects/projects-table.tsx`의 이름 칸. 행 탭으로 이동을 넓히거나 링크에 min-height를 준다.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Review 이연(2026-09-26 /review, 320px 가로 넘침 PR)

### 접힌 줄 값에 스크린리더 라벨이 없다

**What:** 폰(<700)에서 접힌 줄(P2)은 첫 열부터 colSpan으로 걸친 한 칸이다. 스크린리더가 그 값을 첫 열 머리글(예: 「발생 시각」) 아래 값으로 읽는다. 값 앞에 라벨이 없고, 빈 값은 빠지므로 위치만으로는 무슨 값인지 알 수 없다.

**Why:** SYSTEM.md §10 접근성 계약 — 표의 칸은 머리글과 바르게 이어져야 한다.

**Context:** `ui/table/Table.tsx`(접힌 줄이 onRowTap 없으면 aria-hidden — 이쪽은 아예 읽히지 않는다)와 관리자 행동 로그·거래처·보관함 표. 값마다 시각적으로 숨긴 라벨(`sr-only`)을 붙이거나 접힌 칸에 머리글 연결을 준다. 넷을 함께 고친다.

**Effort:** S
**Priority:** P2
**Depends on:** None

### 행동 로그 목록에 페이지 나눔이 없다

**What:** `queryActionLog`는 한도 없이 전부 읽고, 폰 접힌 줄 때문에 행위자·대상·문서·상세 JSON이 HTML에 두 번 실린다(PC에서는 접힌 줄이 숨지만 SSR·RSC 페이로드에는 있다).

**Why:** 로그는 계속 쌓인다 — 응답 크기가 로그 수에 비례해 커진다.

**Context:** `app/(app)/admin/action-log/page.tsx`, `domain/action-log`. 페이지 나눔(또는 최근 N건 + 기간 필터 기본값)을 넣으면 중복 문제도 함께 작아진다.

**Effort:** M
**Priority:** P3
**Depends on:** None

### 행동 로그 발생 시각이 UTC로 보인다

**What:** 「발생 시각」은 `toISOString()`을 잘라 쓴다 — 한국 시간보다 9시간 이르게, 시간대 표시 없이 보인다.

**Why:** 사용자는 모두 한국 시간으로 읽는다(기존 문제, 이번 PR은 줄 위치만 옮겼다).

**Context:** `app/(app)/admin/action-log/page.tsx`(보관함 `archive/page.tsx`의 보관 시각도 같은 방식). 서버에서 Asia/Seoul로 포맷한다.

**Effort:** S
**Priority:** P2
**Depends on:** None

### 폰 접힌 줄의 상태가 배지가 아니라 글자다 · 직접 만든 표의 접힌 줄 코드 중복

**What:** 거래처 접힌 줄의 「숨김·보관됨」은 `StatusTag`가 아니라 글자다(PC 칸은 태그). 관리자 세 표는 접힌 줄 CSS·마크업을 각자 가진다(`ui/table`과 같은 모양을 복사).

**Why:** CLAUDE.md §7 「상태는 색·배지로」. 중복은 선 규칙처럼 한 번에 바꿔야 할 때 네 곳을 고치게 만든다.

**Context:** 관리자 목록을 `ui/table` 읽기 전용으로 옮기면(서버 페이지는 작은 클라이언트 래퍼 필요) 둘 다 풀린다 — Phase 7 관리 콘솔 재검수(ROADMAP 성공 기준 5)와 함께 한다.

**Effort:** M
**Priority:** P3
**Depends on:** Phase 7

## Phase 04.1 알려진 한계(2026-09-24 CEO 리뷰)

### 새 계급을 만들면 정보 노출표에서 결재·연차 정보를 켠다

**What:** 관리자가 새 계급을 만들면 정보 노출표에서 결재 정보·연차 정보를 켠다. 안 켜도 결재는 된다(구조 값은 투영 밖 — 사용자 결정 2026-09-29 A). 다만 그 계급 결재자는 기안자 이름 · 기간 · 잔고 · 결재선 이름 없이 결재하게 된다.

**Why:** `createRole`은 노출 행을 만들지 않고 노출은 기본 숨김이다.

**Context:** 테스트 `test/integration/approvals-inbox-projection.test.ts` 「새 계급 · 결재 정보 꺼짐」. `domain/permissions/roles.ts`는 04.1의 금지 파일이라 이 페이즈가 고치지 않았다.

**Effort:** S
**Priority:** P3
**Depends on:** 새 계급의 노출 기본값 결정(사용자)

## Design review 이연(2026-09-29 /design-review, PR #91 Phase 04.4)

### 관리자 목록 동작 칸의 두 동작이 간격 없이 붙는다

**What:** PC 관리자 목록의 마지막 칸에서 두 동작 사이 간격이 0px이다 — 사람 목록 「상세」+「삭제」, 코드표 「비활성화」+「삭제」가 붙어 「상세삭제」처럼 한 낱말로 읽힌다(DOM 실측: 두 요소 bounding box 간격 0).

**Why:** CLAUDE.md §7 「행동은 동작·컴포넌트·디자인으로」 — 되돌리기 어려운 동작(보관)이 옆 동작과 한 덩어리로 보이면 잘못 누르기 쉽다. SYSTEM.md:693은 붉은 버튼 대신 확인으로 구분하므로 색으로는 떨어뜨리지 않는다 — 간격이 유일한 분리 수단이다.

**Context:** 04.4가 바꾸지 않은 마크업(main과 같음)이고 공유 삭제 컴포넌트(DeleteToArchive 계열)가 여러 관리자 화면에 쓰여 이 PR 범위 밖이다. 동작 칸을 `display: flex; gap: var(--s-3)`(기존 토큰)로 묶고 폰(<700)의 44×44 배치와 겹치지 않게 한 번에 맞춘다.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Phase 04.1 /review 이월(2026-09-29, PR #90)

`/review`(전문 검토 7 + 적대적 1, 전부 Claude)에서 이 PR이 고치지 않고 넘긴 것. 고친 것은 PR #90 커밋 b4ed02f~6ea5b6e.

### 결재 엔진의 연차 결합을 Phase 5 전에 걷어 낸다

**What:** 범용 결재 엔진이 연차 개념을 직접 안다 — 최종 승인 토스트의 차감 일수(`describeDeduction`이 요약의 `daysQuarters`/`days` 키를 추측, `deductedDays`가 `leave.value` 뒤), `/approvals` 페이지가 요약을 `LeaveSummary`로 캐스트해 연차 서식으로 그림, 회수 액션이 `withdrawLeaveAction`(leave 메뉴 등록)에 있음, 제출(`submitDocument` = 행)과 다시 신청(`resubmitDocument` = 다음 담당 포함)의 반환 모양이 다름, 액션 봉투가 네 가지(`{result}` · `{rejected}` · `{documentId}` · `{added}`), ARCHITECTURE §4-9에 종류가 불러야 할 진입점(submit · resubmit · withdraw · getApprovalView · canSeeApprovalDocument)과 `describeDocuments` 반환 계약이 없음.

**Why:** 지출결의 종류를 더하면 이 자리들이 타입 오류 없이 빈 칸 · 틀린 서식 · 잘못된 메뉴 판정이 된다.

**Context:** /review api-contract · maintainability. 제안: 종류 정의에 `describeFinalApproval` 같은 훅, 요약 대신 종류가 표시 문자열을 준다, `withdrawAction`을 approvals로, 봉투 하나로 통일, §4-9 보강.

**Effort:** M
**Priority:** P2
**Depends on:** Phase 5 지출결의 계획

### 결재선 설정은 한 단계를 한 번에 저장한다

**What:** 결재선 17키를 칸마다 따로 저장해, 여러 칸을 바꾸는 중간 상태(예: 3단 범위를 `전사`로 먼저 바꾸고 계급은 아직 `계급 무관`)가 그 사이 제출된 문서의 결재선으로 굳는다(단계 행은 제출 때 고정). `계급 무관 + 전사` 조합(회사 누구나 결재자)도 경고가 없다. 보관한 본부는 설정 경고가 「빈 자리로 건너뜀」이라 하지만 조직 스냅숏은 보관된 팀 · 본부를 거르지 않아 그 소속 사람에게 계속 간다.

**Why:** 관리자가 보는 설정과 실제 결재 경로가 잠깐 또는 계속 어긋난다.

**Context:** /review red-team(INVESTIGATE). 한 단계의 사용 · 계급 · 범위 · 부서를 한 액션 · 한 트랜잭션으로, `계급 무관 + 전사` 경고 또는 거부, 스냅숏과 경고가 보관 판정을 같게.

**Status (2026-09-30):** 한 단계 원자 저장은 반영(사용자 결정 A — 설정 화면 `N단 저장`, `domain/approvals/route-step-settings.ts`). 보관 팀 · 본부 판정은 PR #90에서 스냅숏이 보관 행을 거르게 맞춤. 남은 것: `계급 무관 + 전사` 경고 또는 거부.

**Effort:** M
**Priority:** P2
**Depends on:** 보관 본부 처리 방식(사용자 결정)

### 결재 · 연차 읽기 경로의 중복 · 순차 조회

**What:** `/leave/[id]` layout과 page가 같은 문서를 따로 읽고(보기 판정 · 결재 그래프 · 조직 스냅숏 약 4회), 신청 폼 미리보기가 잔고와 결재선을 순차로(칸을 바꿀 때마다 왕복 8회 안팎), 결재함 상세의 잔고가 기안자마다 순차 계산, 설정 경고가 단계마다 조회 한 번.

**Why:** 10~30명에서는 체감이 작지만 결재함 · 폼 반응이 조회 수에 비례해 느려진다.

**Context:** /review performance. React `cache()`로 요청 안 공유, `Promise.all`, `inArray` 일괄 조회, 설정 키 한 번에 읽기.

**Effort:** S
**Priority:** P3
**Depends on:** None

### 결재 · 연차 E2E 단언 보강

**What:** 두 번 누름 테스트(신청 Ctrl+Enter · 더블클릭 · 폰 승인 두 번)가 행 수만 세서 클라이언트 중복 방지를 빼도 통과할 수 있다(POST 수를 세야 한다). 잔고 E2E 기대값을 앱과 같은 도메인 함수로 만들어 계산 오류를 못 잡는다(한 사례는 글자 그대로의 기대값). 결재함 행을 날짜 라벨로만 찾아 남은 문서와 겹치면 strict mode로 깨질 수 있다.

**Why:** 회귀를 잡아야 할 테스트가 조용히 통과한다.

**Context:** /review testing(LOW-4 이월 포함).

**Effort:** S
**Priority:** P3
**Depends on:** None

### 기타 정리(선택)

**What:** ① `users_resignation_on_or_after_hire_check`가 NOT VALID로 남음(기존 행은 두 열이 모두 null이라 기능 문제 없음 — 원하면 VALIDATE 마이그레이션 한 줄). ② 결재 표의 `status` · `self_approval` · `scope_kind` · `action`이 text라 도메인에 캐스트 약 20개 — `text({ enum })`(db/schema — 위험 경로, 사용자 머지). ③ 결재 시트가 `ui/kv-list`를 손으로 복제(84px · 7px · 6px 리터럴), 반려 라벨 `padding-top: 7px`. ④ 설정 화면 비활성 결재선 칸에 이유 글자 없음(§7-1 이유 규칙은 버튼 대상 — /design-review 판정). ⑤ 단순화 제안(선택, 이번에 적용 안 함): 달력 날짜 검사 네 벌을 `lib/dates` 하나로, 승인 · 반려 단계 기록 중복, 테스트 전용 `withDetails` 플래그, 쓰지 않는 deps 타입.

**Why:** 동작 결함은 아니지만 다음 사람이 헷갈리거나 같은 값을 두 곳에서 고치게 된다.

**Context:** /review data-migration · maintainability · design · simplification.

**Effort:** S
**Priority:** P3
**Depends on:** None

### 04.1 화면 /design-review 이연(2026-09-29)

**What:** ① `/leave` 목록 상태 칸이 그룹 머리글을 되풀이한다 — UI-SPEC 236줄 `팀장 결재 중` · `승인 09-18`(04.1-06 「listMyLeave DTO 단계 이름 · 결정일」 후속 후보와 같은 건, 목록 DTO에 지금 단계 이름 · 결정일이 필요). 처리함 상태 날짜도 같은 원천(최종 결정일)이 필요하다(지금 DTO의 actedAt은 「내가 처리한 날」이라 쓰지 않았다). ② 동시 처리 줄이 화면마다 다르다 — 문서 화면은 버튼 위 줄(UI-SPEC S3은 1차 왼쪽 막힘 자리), 확인 창은 1차를 막고, 결재함 행 · 시트 · 문서 줄은 1차가 살아 있다. 한 규칙으로. ③ 폰 고정 행동 줄이 두 방식(문서 화면 `.bar` 윗선 · 실측 여백 / 신청 폼 `.formBar` 선 없음 · 고정 여백). ④ 관리자 연차 조정 폼은 Enter로 제출되고 Ctrl+Enter · kbd가 없다(신청 폼과 다름). ⑤ 관리자 연차 섹션 입사일이 날 `<input>`에 /leave 경로 CSS를 빌려 쓰고, 조정 기록 표 날짜가 ISO 전체(`/leave`는 formatTableDate). ⑥ 문서 화면 `기안` 행에 시각이 없다(UI-SPEC `2026-09-15 11:20`), 번호 · 상태 태그가 제목 옆이 아니라 다음 줄.

**Why:** UI-SPEC · 「같은 행동은 같은 모양」 원칙과 어긋나지만 동작 결함은 아니고, ①은 목록 조회 · 투영 변경이 필요하다.

**Context:** /design-review 2026-09-29(독립 DOM 감사는 통과 — blocker · major 0). 폰 주 버튼 오른쪽 규칙 확장은 PR #90 「[사용자 결정 요청]」.

**Effort:** M
**Priority:** P2
**Depends on:** ① 없음 · ② 사용자 결정 여부 판단
