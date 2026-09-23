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
