# Phase 7: 공휴일·지급일·마감·알림 + 전 메뉴 권한 검수 - Context

**Gathered:** 2026-09-24
**Status:** Ready for planning

<domain>
## Phase Boundary

경영관리가 지급 예정일·결재 마감을 공휴일 표 기준의 자동 계산으로 받고, 직원은 마감·기한 알림을 앱 알림함과 이메일로 받으며, 인트라넷 패리티가 끝난 이 시점에서 권한·정보 노출·행동 로그를 전 메뉴 기준으로 검수한다. 요구사항: EXP-11, EXP-12, ADMN-11, NOTI-01, NOTI-02, NOTI-03, NOTI-04 (`.planning/ROADMAP.md` Phase 7 성공 기준 1~5).

범위 밖: 지급 처리·지급 목록 화면 자체·증빙 기한 14일 설정값(Phase 6), 전환(Phase 8), 손익(Phase 9), 카카오톡 알림(NOTI-05, v2).

</domain>

<decisions>
## Implementation Decisions

> 결정 번호는 페이즈 논의가 여러 스레드에서 동시에 진행되어 번호가 겹치지 않도록 D-701부터 쓴다.

### 이미 확정된 입력 (다시 묻지 않음 — 출처가 정본)
- 공휴일 표: 관공서의 공휴일에 관한 규정 제2·3조(음력 변환·대체공휴일)로 후보를 규칙 생성 → 관리자가 검토·확정, 임시공휴일·선거일만 수동 추가. 대상 2026·2027, 이후 매년 자동 생성. 영업일 = 월~금 중 공휴일 아닌 날 — `docs/inputs/phase-07-schedule-notify.md` §1
- 지급일·결재 마감·알림은 **같은 공휴일 표와 같은 파생 날짜**를 읽는다(260907의 「알림만 목요일 고정」 버그 재발 방지) — 입력 §1
- 지급 예정일 = 작성일(세금계산서·영수증에 적힌 날) + 60일을 넘기기 전 마지막 금요일, 거래처별 조정 가능, 비워 두면 자동 계산되어 보인다 — 입력 §2, EXP-11
- 결재 마감 = 지급일 전 영업일 14시(설정), 넘기면 그 주 지급 대상에서 빠진다, 판정은 `domain/rules.gate` 경유, 지급일이 당겨지면 마감·알림도 함께 당겨진다 — 입력 §3, EXP-12
- 알림 발송: 하루 1번 오전 9시, Cloud Scheduler → `/internal/notify-tick` 단일 엔드포인트, 채널 = 알림함 + 이메일, `notification_log` 유니크 제약(INSERT … ON CONFLICT DO NOTHING), advisory lock, OIDC 검증, 건수 상한 배치 + `{sent, skipped, remaining}` — 입력 §4, ROADMAP 기준 4
- 독촉 올림 사다리: 1회차 본인 → 2회차 팀장 → 3회차 이후 더 올리지 않음, 총 3회, 대표까지 올리지 않음 — 입력 §5
- 기본 규칙 시드: ① 프로젝트 종료 +7일·지출결의 0건 → 담당 PM ③ 결재 대기 그 단계 3일 경과 → 그 단계 결재자 ④ 지급 완료 +7일·증빙 0건 → 기안자. Phase 6에서 미룬 둘(선결제 14일 증빙 독촉, 경영관리 대리 등록 시 담당 PM 알림)도 규칙으로 붙는다 — 입력 §6
- 규칙 구조: 조건 종류는 코드 등록, 규칙 = 조건 종류 × 파라미터(대상 문서·조건·N일·받는 사람·채널), 관리자는 등록된 종류로 새 규칙만 만든다 — 입력 §7, NOTI-03
- 이메일: 회사 Google 계정 SMTP, 환경 변수 4개(`SMTP_HOST`·`SMTP_USER`·`SMTP_PASSWORD`·`SMTP_FROM`, `lib/env.ts`에 정의만 있음), 발송 실패는 알림함 + 관리자 배너 — 입력 §8, NOTI-02
- 전 메뉴 검수: 누수 스캔 생성기가 Phase 3~7 전 액션·DTO·Excel 내보내기를 덮고 미매핑 DTO 0, 계급별 기본값 표·핵심 행동 종류 목록 확정, Playwright 계급별 노출 스모크 CI, 관리자 폼 8개를 `ui/form`·`ui/select`로 이관(§6-3·§7-2) — ROADMAP 기준 5, `03-OPEN-ITEMS.md` A-H2·A-H3

### 지급 예정일 임박 알림 (입력 §10 미정 7-A 해소)
- **D-701:** **결재 마감 전 영업일 오전 9시에 보낸다**(= 지급일 2영업일 전 9시). 마감(지급일 전 영업일 14시)까지 하루 반의 여유가 생긴다. 공휴일로 지급일이 당겨지면 이 날짜도 같은 파생 날짜에서 함께 당겨진다
- **D-702:** **받는 사람은 경영관리만이다.** 그 주 지급 대상 목록을 받는다. 기안자에게는 이 규칙으로 보내지 않는다(결재가 늦는 건은 기본 규칙 ③ 결재 대기 초과가 잡는다)

### 결재 마감·지급일
- **D-703:** **결재 마감까지 대표 최종 승인이 끝나야 그 주 지급 대상이다.** 경영관리 단계 통과만으로는 부족하다. 판정은 결재 인스턴스의 최종 승인 시각 ≤ 마감 시각이다 — **Reversibility:** costly — 마감 판정 gate 규칙과 지급 대상 목록 쿼리, 임박 알림 대상 산출이 모두 이 기준을 쓴다
- **D-704:** **마감을 넘긴 건, 그리고 늦게 올라와 60일 기한 안에 금요일이 없는 건은 다음 지급 가능한 금요일로 자동으로 민다**(60일 기한을 넘기더라도). 화면에 「마감 지나 밀림」 표시를 붙인다. 지급 예정일을 빈 칸으로 남기지 않는다
- **D-705:** **다음 해 공휴일이 아직 확정 전이면 규칙으로 만든 후보 표로 계산하고, 관리자에게 확정 요청 배너를 띄운다.** 확정 시 달라진 날이 있으면 그 해 자동 계산 날짜는 다시 파생된다(사람이 직접 적은 지급 예정일은 건드리지 않는다)

### 발송 방식
- **D-706:** **이메일은 사람마다 하루 한 통으로 묶는다.** 그날 tick에서 그 사람에게 생긴 알림을 한 통에 모아 보낸다. 알림함에는 건별로 남는다. 중복 방지(`notification_log`)는 건 단위 그대로다 — **Reversibility:** costly — 발송 단위(사람 × 날짜)가 발송 실패 기록·재시도·일 한도 계산의 단위가 된다
- **D-707:** **독촉은 3영업일마다 다시 보낸다.** 총 3회이므로 1회차부터 3회차까지 약 2주에 걸친다
- **D-708:** **2회차부터는 본인과 팀장이 함께 받는다**(본인에게도 계속 간다). 3회차도 본인 + 팀장이다
- **D-709:** **「N일」 셈법은 규칙 종류마다 다르다.** 결재 대기 초과·지급 예정일 임박은 영업일로 세고, 나머지(프로젝트 종료 +7일, 지급 완료 +7일, 선결제 14일)는 달력일로 센다. 주말·공휴일에는 발송하지 않고 다음 영업일 9시 tick에서 보낸다(tick 자체가 비영업일이면 아무것도 보내지 않고 끝난다). 조건 종류가 자기 단위를 가진다 — 관리자가 규칙마다 단위를 고르는 칸은 만들지 않는다
- **D-710:** **경영관리 대리 등록 시 담당 PM 알림은 다음 영업일 9시 묶음에 들어간다.** 등록 즉시 보내는 별도 경로를 만들지 않는다(큐 없음 원칙, NOTI-04). 「새 대리 등록 건」을 찾는 조건 종류로 등록한다

### 이메일 설정 (입력 §10 미정 7-B)
- **D-711:** **계획·실행 시점에 회사 SMTP 확인이 안 끝났어도 진행한다.** 알림함부터 만들고, 이메일 채널은 SMTP 환경 변수 4개가 채워지면 켜지는 구조로 둔다. SMTP 값이 없으면 이메일 채널은 「미설정」으로 관리자 시스템 상태에 보이고, 알림은 알림함으로만 간다. 발송 주소·인증 방식(앱 비밀번호 vs Workspace 릴레이)·일 한도는 사용자가 Workspace 관리자에게 확인할 미정 항목으로 남는다 — 이 결정은 그 값을 정하지 않는다

### 행동 로그 — 계정 잠금·해제 (Phase 1~3 재검증에서 넘어옴)
- **D-712:** **계정 잠금과 잠금 해제를 행동 로그에 남긴다**(사용자 결정 2026-09-24, 스레드 「Phase 1~3 재검증」). Phase 1 성공 기준 2가 약속했지만 지금은 서버 JSON 로그에만 남는다(`domain/auth/hooks.ts` 116행 `auth.lockout`, `domain/auth/accounts.ts` 105행 `auth.unlock`), `domain/action-log/record.ts`의 `CORE_ACTION_TYPES`에 잠금·해제 종류가 없다. 기준 5의 「핵심 행동 종류 목록 전 메뉴 기준 확정」과 같은 작업으로 붙인다. 설계 주의: 잠금은 로그인 전에 일어나 `recordAction`에 넘길 로그인한 행위자가 없다. 행위자 표현(시스템 행위자 + 대상 이메일 등)은 계획이 정한다. 해제는 관리자 행위자가 있다. 상세는 `.planning/phases/01-deploy-skeleton-login/01-VERIFICATION.md`(초안 PR #44, 브랜치 `claude/project-thread-pajnzt`)

### Claude's Discretion
- 독촉 받는 사람이 팀장 본인이거나 팀장 자리가 비었으면 올리지 않고 본인에게만 반복한다(대표까지 올리지 않는다는 입력 §5를 지키는 쪽). 계획이 다르게 판단하면 근거를 남긴다
- 음력 변환 데이터는 외부 API 키 없이 쓸 수 있는 방식(코드 내장 표 등)을 연구 단계가 고른다
- 사람이 직접 적는 지급 예정일은 영업일만 허용하고, 금요일이 아니면 경고만 한다
- 알림함 읽음 처리·보관 기간, 묶음 메일의 모양(제목·본문 구성), 발송 실패 재시도 횟수는 계획이 정한다
- 거래처별 지급 기한 조정 칸(현재 스키마에 없음)을 어디에 두는지는 계획이 `domain/vendors`에서 정한다

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 범위·요구사항
- `.planning/ROADMAP.md` Phase 7 (기준 1~5) — 범위 정본
- `.planning/REQUIREMENTS.md` — EXP-11, EXP-12, ADMN-11, NOTI-01~04 (NOTI-05 카카오톡은 v2)
- `docs/inputs/phase-07-schedule-notify.md` — 사용자 문답 입력(§10 미정 7-A는 D-701·D-702, 7-B 진행 방식은 D-711로 해소; 7-B의 SMTP 값 자체는 미정)
- `docs/inputs/phase-06-payment.md` §5·§6 — 선결제 14일 증빙 독촉, 경영관리 대리 등록 표시
- `docs/inputs/phase-03-masters.md` §5 — 거래처 지급 기한 기본 작성일 + 60일

### 선행 결정
- `.planning/phases/03-permissions-settings-masters/03-CONTEXT.md` — D-35(can/visible 독립), D-38(누수 스캔 레지스트리), 계급 5종, 설정 레지스트리
- `.planning/phases/03-permissions-settings-masters/03-OPEN-ITEMS.md` — A-H2·A-H3(관리자 폼 8개 이관), 폰 375px 관리자 표 칸 접기
- `.planning/phases/04-project-quote-ledger/04-CONTEXT.md` — `rules.gate` 규칙 등록 방식(마감 규칙은 이 페이즈가 등록), `ui/form`·`ui/select`, 관리자 폼·`/account` 이관은 Phase 7 (진행 중 브랜치 `claude/gsd-progress-e1nzgu` 최신본 기준)
- `.planning/phases/05-expense-approval-leave/05-CONTEXT.md` — 결재선 4단(팀장 → 본부 책임자 → 경영관리 → 대표), 결재 모듈 (PR #41)

### 구조·운영
- `docs/ARCHITECTURE.md` — 환경 변수 표(SMTP 4개), Phase 7 항목(이메일 활성화, 알림 tick)
- `docs/OPERATIONS.md` — 배포·스케줄러
- `scripts/deploy.sh` — 스케줄러 잡·서비스 계정 생성, OIDC 끄는 환경 변수 거부를 여기 더한다

### 화면
- `docs/design/SYSTEM.md` §6-3(폼 템플릿) · §7-2(검증 오류 표시) · §7-3(표 칸 접기) — 알림함·공휴일 관리 화면은 정본이 없으므로 `/gsd-ui-phase 7`에서 UI 계약을 먼저 세운다

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `domain/rules/gate.ts`·`register.ts`: 마감 판정 규칙을 여기 등록
- `domain/settings/registry.ts`·`keys.ts`: 마감 시각 14시, tick 건수 상한, 독촉 간격 같은 설정값
- `domain/system-status/`: 마지막 tick 시각·결과, 이메일 채널 설정 여부를 더할 자리
- `domain/permissions/`(`can`·`visible`·`scopeFor`·DTO 투영) + 누수 스캔 레지스트리: 전 메뉴 검수 대상
- `domain/org`(`teamAtDate()`)·`domain/permissions/roles.ts`: 팀장·경영관리 받는 사람 해석
- `lib/env.ts` 72~75행: SMTP 4개 변수(선택값으로 정의만)
- `ui/form`·`ui/select`(Phase 4): 관리자 폼 8개 이관 대상

### Established Patterns
- 4계층 `app/ → domain/ → repositories/(viewer 필수) → db/`, 도메인 출구는 DTO만
- 모든 Server Action은 `lib/actions/client.ts` `authedActionClient` 경유 + 누수 스캔 레지스트리 등록
- 헬스 체크 경로는 `/api/health`(Cloud Run 엣지가 `/healthz`를 먹는다) — `/internal/notify-tick` 경로가 엣지에서 살아남는지 계획 단계에서 확인

### Integration Points
- 새 엔드포인트 `/internal/notify-tick`(아직 없음, `app/api/`에는 auth·health만)
- 거래처 지급 기한: 현재 스키마에 칸 없음
- Phase 5 결재 모듈(최종 승인 시각), Phase 6 지급·증빙·대리 등록 데이터가 알림 조건의 입력

</code_context>

<specifics>
## Specific Ideas

- 260907 인트라넷의 「목요일 고정 알림」이 지급일과 어긋났던 버그가 이 페이즈의 핵심 반례다 — 지급일·마감·알림이 한 파생 날짜에서 나와야 한다
- 메일이 하루에 여러 번 오면 직원이 안 본다(입력 §4) — D-706 묶음 발송도 같은 이유

</specifics>

<deferred>
## Deferred Ideas

- 사람별 이메일 수신 끄기 — 요청 없음, 필요하면 별도 논의
- 결재 요청 도착 즉시 알림 — 시드에 없음. 관리자가 결재 대기 조건 N=0으로 규칙을 만들 수 있다
- 카카오톡 알림 — NOTI-05, v2

</deferred>

---

*Phase: 07-schedule-notify-audit*
*Context gathered: 2026-09-24*
