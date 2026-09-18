---
gsd_state_version: "1.0"
current_phase: 1
current_phase_name: 배포 스켈레톤·로그인
status: planning
stopped_at: Phase 1 context gathered
last_updated: "2026-09-18T00:57:26.432Z"
last_activity: 2026-09-17
last_activity_desc: "로드맵 수정: 엔지니어링 리뷰 결정 15건 + 외부 목소리 8건 반영, Phase 6 분할로 11페이즈, 회사 GCP Phase 1부터. v1 요구사항 89/89, MVP 모드"
state_head: ee5c07252ad7cd0a30c0c9acfe6e7590fe5f42e9
progress:
  total_phases: 11
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-17)

**Core value:** 기획본부와 경영관리본부가 프로젝트마다 같은 숫자(견적·예상 비용·확정 비용·손익)를 본다. 기획본부는 계산식·근거 없이 결과 숫자로 납득하고, 경영관리·대표는 근거 줄까지 본다.
**Current focus:** Phase 1 — 배포 스켈레톤·로그인

## Current Position

Phase: 1 of 11 (배포 스켈레톤·로그인)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-09-17 — 로드맵 수정: 엔지니어링 리뷰 결정 15건 + 외부 목소리 8건 반영, Phase 6 분할로 11페이즈, 회사 GCP Phase 1부터. v1 요구사항 89/89, MVP 모드

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 배포 스켈레톤(Phase 1)을 디자인 시스템(Phase 2)보다 앞에 둔다. Phase 1 화면은 임시 로그인·내 계정뿐이고 업무 화면은 없다. Phase 2가 임시 화면을 SYSTEM.md 기준으로 교체한다
- [Roadmap]: 권한 핵심(can/visible/scopeFor)·설정 레지스트리·보관함·행동 로그·`custom_fields` JSONB 규약은 Phase 3에서 세운다. 돈을 보여주는 첫 화면(Phase 4)보다 앞
- [Roadmap]: 지출결의 흐름을 세 슬라이스로 나눈다 — Phase 5(PM 작성·결재자 승인·연차), Phase 6(경영관리 지급·증빙·법인카드·구매 요청·미결 점검), Phase 7(공휴일·지급일·마감·알림·SMTP·tick + 전 메뉴 권한 검수). 결재 모듈은 지출결의·연차·정산 결재 세 문서로 범용성을 검증
- [Roadmap]: 데이터 이전(Phase 8)은 인트라넷 패리티(Phase 7) 직후, 손익(Phase 9) 이전. 리허설 2회 이상 뒤 전환
- [Roadmap]: 호스팅은 Cloud Run + Cloud SQL(둘 다 서울) 확정 — 리서치의 Neon(싱가포르) 권고 대신 국내 보관 선택(PROJECT.md)
- [Roadmap]: 통화·환율·원화 환산 금액 모델(FX-01)과 클라이언트별 리저브 대장(RSV-01)은 Phase 4에서 세운다 — Phase 5·6이 지출결의·증빙·법인카드 금액을 넣기 전. 리저브 충당 → 매출 반영(RSV-02)은 매출 기준(PNL-03)이 생기는 Phase 9. 손익·목표·내보내기는 원화 환산액 기준이고 원래 통화를 병기한다
- [CEO 리뷰 D3]: 완료(정산) = 정산 결재 문서(경영관리 기안 → 대표 승인). 결재 모듈은 지출결의·연차·정산 결재 세 문서(Phase 5), 대표 승인 순간 손익 스냅샷(Phase 9). 손익 페이즈의 "정산 시점" 연구 플래그는 이것으로 닫힘
- [CEO 리뷰 D4]: 금액 = 원화 정수 원, 외화 소수 2, 환율 소수 4, 반올림은 서버 단일 함수, 분할 시 마지막 회차 보정(Phase 4 금액 모델 = `domain/money`)
- [CEO 리뷰 D5=A]: 이메일 = 회사 Google 계정 SMTP. 환경 변수 4개(host·user·password·from)는 Phase 1에서 정의만, 발송 활성은 Phase 7. 실패는 알림함·관리자 배너. "개인 GCP 단계는 개인 Gmail" 단계는 Eng OV-3로 삭제됨
- [CEO 리뷰 OV-1]: 인트라넷 추출·변환(extract/transform) 스크립트는 Phase 4부터 시작해 실제 데이터를 픽스처로 쓴다. Phase 8은 적재·검증·델타 이전·전환. 손익 착수 조건 "Phase 4~6 실사용 지표"는 Eng OV-1(전환 후 N주 실입력)로 교체됨
- [CEO 리뷰 OV-5]: Phase 3은 메커니즘(can/visible/scopeFor, 리포지토리 행 필터 + DTO 투영, 설정 레지스트리, 누수 스캔 테스트 생성기, 암호화 헬퍼, 보관함, 행동 로그) + 마스터로 좁힌다. ADMN-01/02/03/10의 전 메뉴 검수는 Phase 7 끝 성공 기준(요구사항 매핑은 Phase 3 유지)
- [CEO 리뷰 OV-6]: 이전 페이즈 착수 게이트 = 회사 GCP에서 `scripts/deploy.sh` 1회 성공 — Eng OV-3(Phase 1부터 회사 GCP)로 Phase 1에서 충족되어 Phase 8에는 별도 게이트 없음
- [CEO 리뷰 범위]: HOLD SCOPE — 새 기능 없음. OPS-06(관리자 시스템 상태 화면·JSON 로그)·OPS-07(ARCHITECTURE.md·OPERATIONS.md 각 300줄 상한)만 Phase 1에 추가(85→87). 이후 사용자 OV-3 재정의로 EXP-15 추가(→88), 비용 누수 규칙으로 EXP-16 추가(→89)
- [OV-3 재정의(사용자, 리뷰 후)]: 사람은 공급가액만 적는다. 증빙 종류(코드표: 세금계산서·계산서·카드 전표·현금영수증·기타소득·사업소득·해외 인보이스 등)별 세금 규칙(없음 / 부가세 가산율 / 원천징수율+면제 기준, 이력형 설정)으로 부가세·원천징수액·지급 총액을 서버가 계산하고 종류를 바꾸면 즉시 재계산, 손익 비용은 공급가 기준 그대로 — EXP-15 → Phase 5; 코드표 세금 규칙·설정 키·거래처 기본 종류는 Phase 3(MAST-01/04), 매출 칸은 Phase 4(PROJ-03), 지급 완료액·증빙은 Phase 6(EXP-09/EVID-03), 이전 행 종류 매핑은 Phase 8, 원천징수 제안은 Phase 11(CERT-04). 세부 (a) 통장에 실제 오간 돈 칸(입금액·지급 완료액)만 합계(부가세 포함·원천징수 차감 후)로 적고 시스템이 공급가로 역산, 계산값과 다르면 차이 표시 (b) 거래처 마스터의 기본 증빙 종류를 지출결의·카드 사용 등록 때 자동 채움 (c) 기타소득 면제 기준 기본값 = 기타소득금액 5만원 이하(= 지급액 125,000원 이하), 이력형 설정
- [CERT-01 QR(사용자)]: 수령자가 직원 화면·인쇄물의 QR(1회성 링크)을 폰으로 찍고 들어와 본인 정보(이름·주민등록번호·주소·연락처·계좌)를 직접 입력하고 터치 서명을 제출한다(로그인 없음). 지급 금액·소득 종류·원천징수액은 지출결의에서 미리 채워져 수령자는 고칠 수 없고, 링크는 1회 제출 후 만료(Phase 11)
- [비용이 새는 곳 셋(사용자)]: ① 경품 등 회사 대납 세금 — EXP-15 4번째 규칙 '원천징수 회사 대납'(세율·계산 방식 단순 비율/gross-up, 이력형 설정), 대납 세금은 그 줄의 프로젝트(또는 팀) 비용에 더해진다(PNL-02; Phase 3 코드표·설정 키, Phase 5 계산, Phase 9 손익) ② 자동 결제·정기 결제 — 경영관리가 PM이 모르는 법인카드 사용을 대리 등록해 견적 줄 / 견적가 0인 '견적 외 비용' 줄 / 카드 소지자 팀 비용에 연결, 담당 PM 알림(Phase 7) + '경영관리 등록' 표시, 결재 없음(EXP-16 → Phase 6; '견적 외 비용' 줄은 Phase 4 원장의 한 종류; EXP-07 연결 대상은 셋 중 하나, 팀 비용은 소속 팀 자동) ③ 직원 개인 비용 — 프로젝트 미연결이면 사용일 시점 소속 팀 비용, 팀장 화면 '프로젝트 미연결' 표시(EXP-08 Phase 5; MAST-02 팀 소속 발령일 이력 Phase 3; PNL-07 팀 직접 관리비 = 팀 이름 지출 + 미연결 개인 비용, Phase 10)
- [Eng 리뷰 Issue 1·3·8·14]: 앱 = Next.js 단일 앱 + Drizzle 4계층 `app/ → domain/ → repositories/(viewer 필수) → db/`(research/ARCHITECTURE.md의 Hono·REST·raw pg는 참고용; `docs/ARCHITECTURE.md`가 기록). 읽기 2계층 — repositories는 `scopeFor(viewer)`로 행만 거르고 전체 컬럼 반환(domain 안에서만, 린트), domain 출구는 `project(viewer, dto)` DTO만(행 객체 금지, 타입 강제, React taint 2차 방어), 누수 스캔은 액션 레지스트리·DTO 목록·Excel 함수 × 계급(Phase 3). 금액 산술은 `domain/money` 단일 모듈(Money·round·toKrw·splitWithRemainder·grossFromTotal·applyTaxRule 4종, 모듈 밖 산술 린트; Phase 4), 게이트는 `domain/rules.gate` 단일 진입점(Phase 4), Server Action은 next-safe-action `authedActionClient`만(Phase 1). 테스트 3계층 — 단위(Vitest, domain/*), 통합(Vitest + Postgres 서비스 컨테이너), E2E(Playwright 역할 4종 + 계급별 노출 스모크); 페이즈 완료 조건 = 새 도메인 모듈 단위, 새 액션·DTO 통합+누수 생성, 새 화면 흐름 E2E 1개. 나머지 결정(Issue 2·4~7·9~13·15)은 ROADMAP 각 페이즈 기준에 접혀 있음
- [Eng 리뷰 OV-1]: 전환 전 새 시스템 입력은 source='demo'뿐(실제 업무 입력 없음, Phase 4부터), demo 행은 전환일 삭제. Phase 9(프로젝트 손익) 착수 조건 = 전환 후 N주(설정, 기본 2주) 실입력. 델타 이전 시 유사 프로젝트(클라이언트·이름·기간)는 중복 후보 표시(MIG-01). CEO OV-1의 "Phase 4~6 실사용 지표" 게이트를 교체
- [Eng 리뷰 OV-2]: 본부 엔티티(팀 ⊂ 본부, 발령일 이력; Phase 3). 결재 단계 = 계급 × 조직 범위(기안자 팀/본부/전사/특정 부서), 자기 승인 = 건너뛰고 다음 단계(설정)(Phase 5; MAST-02·EXP-03/04)
- [Eng 리뷰 OV-3(회사 GCP 다음 주 확보)]: Phase 1부터 회사 GCP 프로젝트에서 운영, 개인 GCP 단계 삭제(개인 환경은 로컬 개발만). 회사 GCP 조직 정책(비인증 ingress·외부 링크 허용)은 Phase 1 기준 1에서 확인. CEO OV-6 게이트는 Phase 1에서 충족, D5 개인 Gmail 단계 삭제. deploy.sh는 프로젝트 ID·리전 인자로 다른 프로젝트(재해 복구·스테이징)에도 재현
- [Eng 리뷰 OV-4 기각]: 손익 비용의 쓰기 시점 파생 컬럼은 갱신 누락 비정규화라 두지 않는다. 읽기 시점 계산 유지하되 effectiveCost SQL 식 하나(우선순위 CASE + 근거 id)를 목록·합계·상세(trace)가 공유, 저장은 정산 스냅샷만(Phase 9; PNL-02)
- [Eng 리뷰 OV-6 분할]: 옛 Phase 6(17개)을 Phase 6 지급·증빙·법인카드·구매 요청·미결 점검(EXP-06/07/09/10/13/16, EVID-02/03/04, PROJ-06 = 10개)과 Phase 7 공휴일·지급일·마감·알림·SMTP·tick + 전 메뉴 권한 검수(EXP-11/12, ADMN-11, NOTI-01~04 = 7개)로 나눔. 옛 7~10 → 8~11. 11페이즈, decimal 없음

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: 회사 GCP 프로젝트는 2026-09 넷째 주 확보 예정 — Phase 1 착수 조건(deploy.sh 대상 프로젝트, 조직 정책 확인). 확보 전에는 로컬 개발(Auth Proxy + 로컬 Postgres)만 진행하고 deploy.sh 첫 성공이 Phase 1 완료 조건
- [Phase 1]: CLAUDE.md의 스택·명령 자리(`[ ]`)가 비어 있다. Phase 1이 스택(Next.js + Drizzle + Postgres, next-safe-action, 패키지 매니저, dev/test/lint/build 명령)을 확정하면 세션 끝에 CLAUDE.md에 한 번에 반영한다(세션 중 수정 금지 규칙)
- [Phase 2]: 디자인 절차 문서 `docs/DESIGN.md`(§1→§4)는 리포에 있다(CLAUDE.md 경로와 일치, 52f695a). `docs/design/`(BRIEF.md·EXPLORE.md·SYSTEM.md·tokens.css·DECISIONS.md)은 아직 없으며 Phase 2의 산출물이다 — SYSTEM.md 전에는 업무 화면을 만들지 않는 규칙은 그대로
- [Phase 4]: 11개 요구사항(금액 모델·리저브 대장·문서 카운터·게이트·추출/변환 포함)으로 5플랜 상한에 닿을 수 있다 — 계획 단계에서 넘기면 리저브 대장(RSV-01)을 별도 페이즈로 뗀다
- [Phase 7]: 회사 Google Workspace SMTP 릴레이(앱 비밀번호·발송 한도)는 계획 단계에서 확인(TODOS P2)
- [Phase 9]: 정산(완료) 시점은 D3(정산 결재 대표 승인)로 확정. 매출 기준·연도 귀속을 기획본부·경영관리가 합의하는 절차는 여전히 PROJECT.md에 없다 — 계획 단계에서 사용자와 확정. 착수 조건은 전환 후 N주(설정, 기본 2주) 실입력(Eng OV-1)
- [Phase 11]: CERT 활성화 조건은 `/cso` 보안 감사 통과. 개인정보보호법 적용 범위·보존 기간은 감사에서 재확인(리서치 Gap). 감사 뒤 KMS 봉투 승격(Issue 7)
- [All]: 과잉 설계 재발 방지 — 페이즈마다 "인트라넷보다 못한가"로 검증하고, 실제 사용자 로그인·입력이 있어야 완료로 본다

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-09-18T00:57:26.386Z
Stopped at: Phase 1 context gathered
Resume file: .planning/phases/01-deploy-skeleton-login/01-CONTEXT.md
