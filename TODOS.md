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

**What:** `ui/button/Button.module.css:52-81`의 3차 버튼이 `border-bottom` 밑줄이라 폰 44px 상자에서 글자와 떨어진다. FINDING-005(`ListEmpty`, 고침 `2342b01`)와 같은 수정(`text-decoration: underline` + `--underline-offset`)을 관리자·Phase 4 화면을 잰 뒤 적용한다.

**Why:** §4-4 3차 버튼 밑줄 규칙과 다르고 화면마다 밑줄 방식이 갈린다.

**Context:** Phase 2 화면에는 렌더되지 않아 이번 리뷰 범위 밖이었다.

**Effort:** S
**Priority:** P3
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
