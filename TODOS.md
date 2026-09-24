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

## Design review 이연(2026-09-24 /design-review, Phase 2 화면)

리포트: `~/.gstack/projects/rrangjaa-eng-ERP_PLANT8_260917/designs/design-audit-20260924/design-audit-127.0.0.1.md`

### FINDING-001 PC에서 「내 차례」(`/`)로 돌아가는 길이 없다

**What:** PC 상단 바 워드마크가 링크가 아니고 1차 메뉴 5개·사용자 메뉴에 「내 차례」가 없다. 로그인은 `/account`로 착지한다. 워드마크를 `/` 링크로 할지, 메뉴 앞에 「내 차례」를 둘지 SYSTEM.md §6-0에서 정한다.

**Why:** PC 사용자가 URL을 치지 않으면 첫 화면에 닿지 못한다(High, 1440·768 실측). 폰은 하단 탭 1번이 있어 문제없다.

**Context:** `test/e2e/keyboard-nav.spec.ts:135-153`이 Tab 순서 「스킵 링크 → 프로젝트」를 고정하므로 결정과 함께 그 테스트를 고친다.

**Effort:** S
**Priority:** P1
**Depends on:** SYSTEM.md §6-0 결정

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
