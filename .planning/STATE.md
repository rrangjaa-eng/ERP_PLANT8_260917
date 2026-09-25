---
gsd_state_version: "1.0"
current_phase: 4
current_phase_name: project-quote-ledger
current_plan: 4
status: executing
stopped_at: Completed 04-26-PLAN.md
last_updated: "2026-09-25T16:17:40.091Z"
last_activity: 2026-09-25
last_activity_desc: Phase 4 execution started
state_head: 203f61e184a15827a8525c4dbc7be3f9c16149ac
progress:
  total_phases: 16
  completed_phases: 1
  total_plans: 115
  completed_plans: 48
  percent: 6
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-17)

**Core value:** 기획본부와 경영관리본부가 프로젝트마다 같은 숫자(견적·예상 비용·확정 비용·손익)를 본다. 기획본부는 계산식·근거 없이 결과 숫자로 납득하고, 경영관리·대표는 근거 줄까지 본다.
**Current focus:** Phase 4 — project-quote-ledger

## Current Position

Phase: 4 (project-quote-ledger) — EXECUTING
Current Plan: 4
Total Plans in Phase: 42
Status: Ready to execute
Last activity: 2026-09-25 — Phase 4 execution started

Progress: [█░░░░░░░░░] 6%

## Performance Metrics

**Velocity:**

- Total plans completed: 8
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 8 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01-deploy-skeleton-login P02 | 65min | 2 tasks | 22 files |
| Phase 01-deploy-skeleton-login P03 | 18min | 2 tasks | 17 files |
| Phase 01-deploy-skeleton-login P04 | 40min | 3 tasks | 32 files |
| Phase 01-deploy-skeleton-login P05 | 14min | 2 tasks | 11 files |
| Phase 01-deploy-skeleton-login P06 | 38min | 2 tasks | 17 files |
| Phase 02 P02 | 11min | 3 tasks | 11 files |
| Phase 02 P01 | unknown | 3 tasks | 4 files |
| Phase 02 P03 | 19min | 3 tasks | 13 files |
| Phase 02 P04 | 28min | 3 tasks | 14 files |
| Phase 02-design-system-app-shell P05 | 20min | 3 tasks | 15 files |
| Phase 02 P06 | 20min | 3 tasks | 12 files |
| Phase 02 P07 | 55min | 3 tasks | 10 files |
| Phase 02 P08 | 16min | 3 tasks | 30 files |
| Phase 04 P01 | 1h36m | 3 tasks | 54 files |
| Phase 04 P02 | 1h10m | 3 tasks | 36 files |
| Phase 04 P05 | 1h2m | 2 tasks | 16 files |
| Phase 04 P04 | 35min | 3 tasks | 21 files |
| Phase 04 P50 | 15min | 2 tasks | 6 files |
| Phase 04 P08 | 41min | 2 tasks | 10 files |
| Phase 04 P32 | 55min | 3 tasks | 13 files |
| Phase 04 P43 | 10min | 1 tasks | 2 files |
| Phase 04 P10 | 105min | 2 tasks | 14 files |
| Phase 04 P46 | 58min | 2 tasks | 15 files |
| Phase 04 P25 | 17 min | 2 tasks | 8 files |
| Phase 04 P28 | 44 min | 3 tasks | 11 files |
| Phase 04 P29 | 55min | 3 tasks | 11 files |
| Phase 04 P06 | 27min | 2 tasks | 13 files |
| Phase 04 P09 | 85min | 3 tasks | 20 files |
| Phase 04 P27 | 15 min | 2 tasks | 15 files |
| Phase 04 P20 | 38min | 3 tasks | 18 files |
| Phase 04 P21 | 66min | 3 tasks | 20 files |
| Phase 04 P11 | 32 min | 3 tasks | 14 files |
| Phase 04 P44 | 39min | 3 tasks | 14 files |
| Phase 04 P12 | 78min | 3 tasks | 30 files |
| Phase 04 P30 | 39min | 2 tasks | 11 files |
| Phase 04 P49 | 159min | 2 tasks | 17 files |
| Phase 04 P26 | 93min | 2 tasks | 10 files |

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
- [Phase 1]: Phase 1은 8플랜/7웨이브 그대로 진행(1a/1b 분할 안 함, 사용자 결정 2026-09-18). 실행은 웨이브 5(01-06)까지 한 세션에서 끝내고 /gsd-pause-work로 끊은 뒤 01-07~08(GCP·사람 체크포인트)은 새 세션
- [Phase 1]: 회사 GCP 프로젝트 생성·결제 연결 완료(2026-09-18, billingEnabled true). 프로젝트 ID는 리포·문서에 적지 않고 실행 단계에서 GitHub 변수 GCP_PROJECT_ID와 deploy.sh 인자로만 넣는다(D-03)
- [Phase 1]: GitHub 저장소는 개인 계정 rrangjaa-eng 비공개로 유지 + GitHub Pro 구독(사용자 결정 B, 2026-09-18) — Environment production의 required reviewers(D-05)를 쓰기 위함. 회사 조직 이전은 이월(이전 시 WIF 부트스트랩 재실행)
- [Phase 1]: D-05 변경(사용자 결정 C, 2026-09-18, 같은 날 B 대체): GitHub 저장소는 개인 무료 비공개 유지. Environments·required reviewers 없이 프로덕션은 workflow_dispatch 수동 실행(같은 SHA 이미지 재사용, 스테이징 배포 확인 가드). 변수·시크릿은 저장소 수준
- [Phase 1]: better-auth 1.7.5 rate_limits 스키마 검사가 id 컬럼을 요구해 text id 추가(0002 마이그레이션) — drizzle-adapter의 schema-diff.mjs가 모든 모델에 id 존재를 강제하고 실제로 문자열 id를 insert함(실측)
- [Phase 1]: advanced.ipAddress.ipAddressHeaders를 x-forwarded-for에서 x-client-ip로 교체, proxy.ts가 단일 헤더로 고정 — better-auth가 헤더 값 2개 이상이면 IP를 null로 보고 공용 rateLimit 버킷에 묶어, 클라이언트가 XFF 위조 시 전 직원이 같은 버킷을 나눠 쓰는 DoS가 됨(Eng Issue 1)
- [Phase 1]: [Phase 1] revokeAllSessions는 auth.$context.internalAdapter.deleteUserSessions(userId)를 쓴다(계획 문서의 deleteSessions는 세션 토큰 배열을 받는 다른 메서드 — 실측으로 정정, 01-02 선례와 일치)
- [Phase 1]: [Phase 1] AUTH-04 Google 로그인 버튼의 클릭 핸들러는 서버 컴포넌트(login/page.tsx)가 아니라 기존 클라이언트 컴포넌트(login-form.tsx)에 showGoogle prop으로 위임 — 서버 컴포넌트는 authClient.signIn.social을 직접 호출할 수 없다
- [Phase 1]: [Phase 1] AUTH-03·AUTH-04는 REQUIREMENTS.md에서 Complete로 반영됨. OPS-06은 01-07이 같은 요구사항을 공유(shared-ID gate)해 01-07 완료 시 Complete로 바뀐다(의도된 동작)
- [Phase 1]: 01-07 Task 1 GCP 리소스 이름 결정(사용자, 2026-09-18): 옵션 A/B 대신 순수 접두어 `plant8-` 커스텀 선택 — 서비스 plant8-staging/plant8-prod, Cloud SQL 인스턴스 plant8-staging-db/plant8-prod-db, DB 이름 plant8, SA plant8-{env}-runtime, Artifact Registry plant8. infra/names.sh(웨이브 5/01-06) 생성 시 이 값으로 반영하고, 01-07 Task 1 체크포인트에서 재확인 없이 바로 적용한다
- [Phase 1]: 01-07 사전 준비 완료(사용자, 2026-09-18): 조직 정책 iam.allowedPolicyMemberDomains를 allUsers 등 전체 허용으로 변경해 run.invoker 부여(비인증 ingress) 차단 블로커 해소. 프로젝트 소유자 역할·경보 알림 그룹도 준비 완료 — 웨이브 6(01-07) 시작 전 재확인 항목 3개(조직 정책·프로젝트 소유자·경보 그룹) 모두 충족
- [Phase 01-deploy-skeleton-login]: 01-04: .squawk.toml 키는 최상위(섹션 없음)여야 적용된다 — assume_in_transaction/pg_version/excluded_rules 실측 확인
- [Phase 01-deploy-skeleton-login]: 01-04: db→lib, test→eslint boundaries 경계 예외 추가(기존 db/client.ts의 lib/env.ts import, eslint-rules 테스트의 규칙 모듈 import 요구에 맞춤)
- [Phase 01-deploy-skeleton-login]: 01-04: recommendedTypeChecked 적용으로 드러난 실제 타입 버그 4곳(File-vs-string, misused-promises, ctx.body any, 테스트 mock 타입) 수정
- [Phase 01-deploy-skeleton-login]: 01-04: CI ci-guard.test.ts는 두 잡(quality/integration-e2e) 각각의 내부 순서를 검증한다 — 전체 파일 단일 순서 대신(두 잡 분리 유지가 CEO 9A Actions 예산에 더 부합)
- [Phase 01-deploy-skeleton-login]: 01-04: .squawk.toml excluded_rules 4개(prefer-timestamp-tz, prefer-bigint-over-int, adding-required-field, require-concurrent-index-creation) — 스키마 전체 변경 필요해 범위 밖, WINDOWS.md에 lint-warning 4건 등록
- [Phase 1]: [Phase 1] 01-05: esbuild build-cli.mjs external을 ['pg-native']에서 packages:'external'로 정정 — google-gax 계열 대형 gRPC 코드베이스를 단일 ESM 파일로 인라인하면 Node 22/24가 런타임에 'both require() and top-level await' 에러로 크래시함을 실측. 이 패키지들은 이미 Next 앱이 써서 .next/standalone/node_modules에 포함되므로 external로 둬도 같은 이미지 안에서 정상 resolve된다
- [Phase 1]: [Phase 1] 01-05: db-bootstrap.ts의 CREATE DATABASE는 buildBootstrapSql 순수 함수 밖 main()의 별도 단계로 분리 — 존재 확인 뒤에만 실행, buildBootstrapSql은 항상 멱등한 ALTER DATABASE...OWNER TO만 반환
- [Phase 1]: [Phase 01-deploy-skeleton-login] 01-06: infra/names.sh 리소스 접두어를 plant8-로 통일(서비스·SQL·SA·AR은 사용자 결정 명시, Job 이름도 같은 계열이라 확장) — WIF_POOL/WIF_PROVIDER/DEPLOYER_SA는 identity 식별자라 플랜 원문 값 유지
- [Phase 1]: [Phase 01-deploy-skeleton-login] 01-06: bash ERR 트랩은 기본적으로 함수 안에서 발동하지 않는다 — set -o errtrace(set -E) 없이는 deploy.sh의 STAGE 트랩 메시지가 안 나옴을 실측(scripts/deploy.sh)
- [Phase 1]: [Phase 01-deploy-skeleton-login] 01-06: deploy.yml/account.yml에 pnpm build:cli 스텝 불필요 — Dockerfile의 build 스테이지가 컨테이너 안에서 이미 pnpm build && pnpm build:cli를 실행함을 확인(01-05 Dockerfile 직접 확인)
- [Phase Phase 1]: SC6 재정의(사용자 결정 2026-09-19): 카나리를 복원하지 않고 안전 속성을 계약으로 삼는다 — 스모크에 실패한 리비전이 트래픽을 계속 받는 상태로 끝나지 않는다 — 카나리(0%→스모크→100%)는 태그 전용 리비전 URL에 의존하는데 이 프로젝트에서 4회 연속 라우팅되지 않았고 원인이 통제 밖이다(01-07). 같은 것을 다시 지으면 같은 데서 막힌다. 구현 둘: (1) 기존 서비스는 배포 전에 status.url을 확정해 배포당 리비전 하나 — 틀린 BETTER_AUTH_URL로 100%를 받던 창이 사라지고 롤백 대상도 깔끔해진다. (2) 스모크 실패 시 이전 배포로 1회 자동 롤백 후 실패 종료 — 재시도는 금지(반복은 진짜 원인을 가린다). 프로덕션은 승격 가드가 스테이징이 서빙 중인 이미지만 올리므로 스테이징이 카나리 역할을 한다. 남는 노출 창은 스모크 소요 시간(수십 초)이며 사용자 10~30명 사내 시스템에 적정하다고 판단. ROADMAP 기준 6과 REQUIREMENTS OPS-01 본문을 이 속성으로 고쳤다
- [Phase 02]: 02-02: 간격(margin/padding/gap) 리터럴은 stylelint 금지 대상에서 제외 — D-20 비준대로 색·서체·radius 셋만 — 실물 HTML 간격 리터럴 283건 중 175건이 tokens.css 4px 스케일에 대응하지 않아 금지하면 이관할 마크업이 거부됨
- [Phase 02]: 02-02: .dockerignore의 docs 라인을 부분 예외 대신 통째 제거 — COPY . .가 컨텍스트 전체를 한 레이어에 담아 캐시 보존 이점이 없고, 부정 패턴 의미론을 Docker 데몬 없는 환경에서 확인할 수 없음
- [Phase 02]: 02-02: CI/배포 트리거를 paths-ignore에서 paths + ! 4패턴으로 교체 — GitHub 문서가 부정 패턴 지원을 명시하는 필터는 paths뿐 — 실제 트리거 동작은 사람 체크로 남김
- [Phase 02]: [Phase 02] 02-01: 체크포인트 24개 항목(A~I) 전부 사용자 확정 — F-1①·F-2①·I②(--on-accent-weak 신설)·G①·H① 채택, A⑤·E⑤는 다섯 상태를 하나도 비우지 않고 "해당 없음 — 이유"로 명시하는 규칙으로 변경. 재계획 방아쇠 미선택
- [Phase 02]: [Phase 02] 02-03: AuthFrame 최대 폭은 새 값을 만들지 않고 tokens.css의 기존 --modal-w(480) 토큰을 재사용했다 — §6-7의 「최대 폭 360」은 ASCII 목업 근사치이고 로그인 폼은 --form-max(720, 다항목 업무 폼)보다 단일 목적 좁은 컨테이너에 더 가깝다
- [Phase 02]: [Phase 02] 02-03: §6-7 다이어그램에 없는 기존 h1 「로그인」 타이틀을 제거했다 — 워드마크(PLANT8)가 그 자리를 대신하고 어떤 E2E도 그 텍스트에 의존하지 않는다
- [Phase 02]: 02-04: 역할→메뉴 매핑을 role-menu.ts 순수 함수 하나로 고정, 셸 컴포넌트에는 isAdmin 조건문을 두지 않는다(D-23)
- [Phase 02]: 02-04: MoreSheet 포커스 트랩은 네이티브 <dialog>.showModal()로 구현 — 새 런타임 의존성 없음
- [Phase 02]: 02-04: PC 사용자 메뉴는 accountGroup에서 href==='/settings' 항목만 걸러 렌더 — SYSTEM.md가 PC 메뉴와 폰 시트의 계정 항목 구성을 다르게 규정
- [Phase 02]: 02-05: §7-4 원문(결재·대기 둘 다 --accent)을 §7-5 일반 규칙보다 우선 적용 — 「내 차례」 전용 정본이 더 구체적
- [Phase 02]: 02-05: ListEmpty의 다음 한 수는 ui/button/Button이 아니라 자체 <a> + 로컬 CSS로 구현 — 이 페이즈부터 실제 화면 이동 링크여야 하고 Button은 <button>만 렌더한다(§10)
- [Phase 02]: 02-06: §6-7 A④=「내 계정 화면 상단」, F-1=①(status 승격), §6-9 C②=「셸 안」 — SYSTEM.md 원문 대조로 확정, app/(app)/layout.tsx·login/page.tsx는 건드리지 않았다
- [Phase 02]: 02-06: ListEmpty.action을 href/onClick 유니언으로 확장(Rule 2) — 오류 경계의 다시 시도는 페이지 이동이 아니라 retry() 호출이라 §10(3차 버튼은 button, 이동이면 a)을 지키려면 button 갈래가 필요했다
- [Phase 02]: 02-07: 체크포인트 승인 — @axe-core/playwright@4.13.0 devDependency 추가(정확히 버전 고정), SYSTEM.md §10을 규칙 엔진으로 판정. 남은 페이즈가 같은 검사를 물려받는다는 근거로 채택
- [Phase 02]: 02-07: 키보드 비밀번호 변경 동선은 §6-0 (a) G①(작은 메뉴가 열린다) 형태 하나에만 대응 — 메뉴 열기 대기·Esc/포커스 복귀 단언 포함, ②·③ 분기 없음
- [Phase 02]: 02-07: 로그인 화면 axe page-has-heading-one 위반을 규칙 비활성 대신 화면 수정으로 해소 — app/globals.css에 .sr-only 유틸리티 추가, 스크린 리더 전용 h1 복원(시각 디자인 불변)
- [Phase 02]: 화면 제목·부제는 전역 h1 규칙이 아니라 ui/page-header/PageHeader 컴포넌트다(구조 우연 회피)
- [Phase 02]: font:inherit 축약은 D-20 stylelint 허용 목록과 충돌해 롱핸드(font-family/font-size/line-height:inherit/letter-spacing:inherit/color:inherit)로 편다
- [Phase 04]: 마이그레이션 번호를 계획의 0004에서 실제 다음 번호 0009로 정정(Rule 1)
- [Phase 04]: domain이 db를 직접 import하지 않도록 lib/db-transaction.ts(withTransaction) 래퍼 신설 — boundaries 규칙 준수(Rule 2)
- [Phase 04]: role-pm 기본 권한에 projects 메뉴 view+write 추가, admin.vendors/admin.people은 열지 않고 domain/projects/references.ts로 참조 데이터만 좁게 노출
- [Phase 04]: 04-02: applyTaxRule은 세율·절사 단위·최소 징수액을 settings registry에서 기준일과 함께 읽고, 절사 방식만 코드표 rule에서 읽는다(Task 1 action 원문 + readBy 표시 11개 소비 강제 기준)
- [Phase 04]: 04-02: 새 메뉴 projects.revenue(write)로 발행·입금 쓰기를 게이트 — 경영관리는 SEED_ROLES 5종에 없어 코드에 역할명을 박지 않고 관리자가 권한표에서 배정한다(D-57). 계약 금액은 기존 projects write(PM)
- [Phase 04]: 04-02: saveQuoteLines·saveRevenue에 옵션 tx 파라미터를 더해 domain/projects/ledger.ts가 견적 줄+매출을 한 트랜잭션·한 저장 버튼으로 묶는다(§7-3 전부 저장/전부 거부)
- [Phase 04]: [Phase 04]: 04-05: 서식 키 형태 = 문서 종류별 키 묶음(document_number.project.*), JSON 한 개가 아니다 — 설정 화면의 필드 단위 렌더·검증, Phase 5·6·11의 확장 용이성 근거 셋
- [Phase 04]: [Phase 04]: 04-05: 리포지토리 공유 필터 함수(projectFilterConditions)로 목록/집계 쿼리가 같은 행만 세게 강제 — 집계는 pool.query 스파이로 SQL 왕복 한 번임을 실측. 정렬은 종료일 월 그룹 안에서만 순서를 바꾼다(그룹 macro 구조 유지)
- [Phase 04]: [Phase 04]: 04-05: 열 머리글 클릭 정렬·aria-sort는 ui/table/Table.tsx(04-04 소유, 같은 웨이브)를 건드리지 않고 서버 정렬만 구현·검증(WINDOWS.md stub #27) — 클릭 UI는 04-04 이후 후속 작업
- [Phase 4]: A-M3 (ㄱ) 채택 — 관리자 표 6종 캡션은 이미 완료돼 있어 확인만 함(admin/ diff 0줄)
- [Phase 4]: U-6 문구: 전부 거부 · 다른 칸 오류 N칸(오류 0을 0칸으로 적지 않는다)
- [Phase 4]: 요청 본문 한도는 lib/actions/client.ts 미들웨어 한 자리(256KB)에만 둔다
- [Phase 4]: 실제 Windows Excel은 줄바꿈 있는 칸만 인용하고 따옴표만 있는 칸은 원문 그대로 쓴다 — parseTsv를 이 규칙에 맞춤(04-RESEARCH.md 가정 A3 대체)
- [Phase 4]: 데이터 이전 없음(사용자 결정 2026-09-23) — 인트라넷 데이터는 이전하지 않고 마스터(거래처·클라이언트·직원·법인카드·분류) 포함 전부 새 시스템에 손으로 입력한다. 시스템이 완성되는 대로 연중에 전환하고(연도 경계 아님) 인트라넷은 과거 조회 전용. REQUIREMENTS MIG-01~03 → Out of Scope(v1 89 → 86), MIG-04·05 재정의, OPS-06 '이전 실행' → '복원 리허설'. ROADMAP Phase 8 = 전환(마스터 수기 입력·계정 발급·demo 삭제·전환일 체크리스트·백업/복원 리허설). 04-03 철회(플랜 삭제, 추출 스크립트는 6b7519f로 되돌림), Phase 4 성공 기준 7 철회. 손익(Phase 9·10)은 전환 데이터부터이며 2026년 숫자는 두 시스템에 나뉜다(사용자 수용). 앞의 [CEO 리뷰 OV-1]·[Roadmap] 데이터 이전·[Eng 리뷰 OV-1]의 델타 이전 부분을 대체 — 옛 구조(상태 컬럼 없이 Y/N 승인 표시 4개, 견적 줄 = 단가×수량×일수, 프로젝트 번호 9개를 22개 프로젝트가 공유, 금액이 공급가인지 합계인지 불명)가 새 구조와 달라 단계마다 변환 규칙과 사람 확인이 필요했다
- [Phase 4]: 04 plan-phase 13a 결정 커버리지 override: D-72·D-73·D-74(인트라넷 데이터 추출·변환)는 플랜 미인용으로 통과 — 2026-09-23 사용자 결정(데이터 이관 없음, 04-03 철회)으로 CONTEXT에 이미 대체 표시된 결정 — 사용자 선택 2026-09-24(AskUserQuestion: 그대로 진행). verify-phase에서 다시 보이도록 기록
- [Phase 4]: [Phase 4] 04-50: 스키마 하한 = 체크아웃의 가장 최신 `-- rollback-floor:` 마이그레이션을 더한 커밋. rollback.sh가 그 커밋을 조상으로 갖지 않는 배포로는 트래픽을 옮기지 않는다(fail-closed, 우회 옵션 없음)
- [Phase 4]: [Phase 4] 04-50: ENG-D12 deploy.yml main 전용 ref-guard를 04-31 Task 2에서 이 플랜(묶음 ② 첫 웨이브)으로 옮겼다 — 하한 판정이 main 이력을 전제한다
- [Phase 4]: 04 열린 질문 사용자 답: ① 줄당 원화 > 2,147,483,647 → (b) bigint 전환(04-07 Task 0 = b: 0016에서 KRW 금액 컬럼 bigint + rollback-floor 마커) ② 채번 순번 시작값 하향 충돌 → (a) 설정 검증(현재 발급 최대 이하 값 거부, 04-51 Task 1 = a) — 사용자 결정 2026-09-24(세션 C 채팅). 04-07·04-51 checkpoint:decision은 실행 때 이 답을 적용한다
- [Phase 4]: 04-08: 단축키 표기·동작은 Windows Ctrl(D-94) — metaKey를 읽지 않는다
- [Phase 4]: 04-08: 등록 폼 제출 이중 방지는 submittedRef 래치로 — isExecuting 가드만으로는 성공 뒤 이동 지연 중 재입력을 못 막는다(엔지 리뷰 C §1 P2)
- [Phase 4]: 04-08: SYSTEM.md §7-3 (가) 잠김 정의는 D-78 개정(CEO-D10·D12) — 정산 프로젝트의 줄 추가는 렌더한다
- [Phase 4]: 04-08: SYSTEM.md §7-4 대기 태그 색을 §7-5 의미 목록에 맞춰 accent→muted로 정정
- [Phase 4]: 04-08: 플랜의 baseline 커밋 d6b41cf가 저장소에 없어(환경 불일치) 실제 04-08 시작 시점 HEAD인 b0fc281을 tokens.css/package.json/pnpm-lock.yaml 불변 검증 기준으로 대신 썼다
- [Phase 4]: 04-32: withTimeoutConversion을 lib/db-transaction.ts에서 분리 — withTransaction 안의 db.transaction()뿐 아니라 saveProjectLedger 전체(04-02)에도 씌워 트랜잭션 밖 풀 읽기의 원시 pg-pool 시간 초과 누수를 막았다(ENG-D11, tx-safety.test.ts (c) 실측)
- [Phase 4]: 04-32: project()/projectMany의 infoItem 배열 판별은 Array.isArray가 아니라 typeof ref === "string" — Array.isArray는 string | readonly string[] 유니언을 any[]로 좁혀 lint 오류를 낸다(실측)
- [Phase 4]: [Phase 04]: 04-43: D16 승인 세 곳(PROJ-04·PROJ-03·ROADMAP 기준 4)만 D-75~D-84 모델로 갱신, ROADMAP Goal·기준 1·5·트레일링·PROJ-06의 낡은 문구는 SUMMARY 표로 남겨 사용자가 /gsd-phase 편집 여부를 정한다
- [Phase 4]: 04-10: 마이그레이션 번호 0011이 계획 번호와 일치(생성기가 직전 최고 idx+1을 그대로 줬다)
- [Phase 4]: 04-10: CODE_ITEM_DESCRIPTION_MAX는 .length(UTF-16 단위)로 센다 — 한글은 글자당 1
- [Phase 4]: 04-10: server-only 의존 체인이 있는 domain 모듈의 클라이언트 소비 상수는 잎(leaf) 모듈로 분리한다(domain/code-tables/description-max.ts)
- [Phase 4]: 배포 창(T-04-372/T-04-86): 묶음 ②·③ 모두 업무 시간 밖에 프로덕션 승격, migrate 뒤 몇 분 오류는 수용(코드 변경 없음) — 사용자 결정 2026-09-24 세션 H(AskUserQuestion)
- [Phase 4]: A-12 수용: 묶음 ② 배포 동안 완료 프로젝트 계약 금액 편집 가능 상태 유지, 묶음 ③ 끝(04-41)에서 해소 — 사용자 결정 2026-09-24 세션 H
- [Phase 4]: 플래너 판단 인정: ②/③ 경계 04-23 뒤 · ENG-D12 04-50 이동 · QA 날짜 순서→04-15 · 폰 편집→04-49 — 사용자 결정 2026-09-24 세션 H
- [Phase 4]: 04-43 남은 낡은 문구 5자리는 Phase 4 /gsd-verify-work 직전에 /gsd-phase 편집으로 고침 — 사용자 결정 2026-09-24 세션 H
- [Phase 4]: QA 16건 유실 인정 — 묶음 ② /qa가 다시 훑고 키보드 포커스(탭 순서·포커스 표시·복귀)를 점검 항목으로 둠 — 사용자 결정 2026-09-24 세션 H
- [Phase 4]: Button pending 상태도 aria-disabled(rev 5) — 계약 1 요약과 다름, 소비 API는 동일
- [Phase 4]: ConfirmDialog primary에 reasonTone·nextStep 선택 확장, options 행 모양 {label, description?, onSelect} 확정
- [Phase 4]: confirmDeleteLine 기존 로직 재사용(서버 삭제 신호 없음) — 견적 줄 삭제 서버 반영은 후속 플랜
- [Phase 4]: 등록 폼 Escape 핸들러에 preventDefault 추가 — 같은 키 입력이 방금 연 ConfirmDialog를 즉시 닫는 버그 수정
- [Phase 04]: 04-25: Select가 SelectHint를 내보내 관리자 폼의 네이티브 select도 같은 설명 힌트 줄을 쓴다(A-H2 이관 전) — vendors.module.css .hint는 PC 라벨 열 들여쓰기가 걸려 라벨 위 select 아래에 맞지 않는다
- [Phase 04]: 04-25: 폰 칸 접기(§7-3) 첫 CSS 선례 — tr 2열 격자, P2 칸 grid-row 2 전체 폭, P3 nth-child 숨김, 상태 열 폭 고정 — 칸을 두 번 렌더하지 않고 자리만 옮긴다(S14 overflow 사용자 확정)
- [Phase 04]: 04-28: 견적 표 힌트 줄은 지금 되는 키 여섯 항목(Tab·Ctrl+C·저장 제외) — 04-04가 둘을 배선하지 않았다(toTsv 호출처 0)
- [Phase 04]: 04-28: 거부 봉투는 SaveRejectedError만 잡아 { rejected: { summary, cells } } — 뒤 플랜은 도메인 항목만 더하고 열 대응은 quote-table FIELD_TO_COLUMN
- [Phase 04]: 04-28: 격자 DOM 포커스 따라가기는 좌표가 실제로 바뀔 때만(첫 렌더 제외) — 하이드레이션 전 포커스를 빼앗지 않는다
- [Phase 04]: 04-29: pageWindow의 넓은 창(threshold 7)·폰 창(threshold 5, compact)을 하나의 파라미터화 알고리즘으로 구현해 C-27(한 쪽 틈은 번호) 로직을 중복 없이 공유
- [Phase 04]: 04-29: ENG-D11 — 04-08이 §7-16에 적기로 했던 생략 규칙 기본 문장(PC 7쪽/8쪽)이 실제 SYSTEM.md에 없어 04-29가 기본 문장까지 함께 추가하고 회귀 테스트로 고정
- [Phase 04]: 04-06: 프로젝트 상태 다섯 값(bidding·in_progress·settling·completed·lost), 옛 settled는 0012가 completed로 재매핑 — 0012 전진 전용·rollback-floor 표시
- [Phase 04]: 04-06: 완료 잠금 게이트는 project.line-edit(완료 → 「완료 · 견적 줄 잠김」, 미수주 포함 나머지 통과) — project.completed-lock 삭제
- [Phase 04]: 04-09: lib/format-number.ts is the single source of truth for numeric display + comma-input formatting; only FX_RECENT_RATE_USD gets numberKind in settings
- [Phase 04]: 04-09: useCommaInput pre-formats initial value through the typed path so reload/reopen never shows uncomma'd text
- [Phase 04]: 04-27: roles.work_scope(team/company, 기본 team) — 업무 범위는 순위도 보기 권한도 아닌 게이트 입력. 비시드 계급(경영관리 등)은 관리자가 계급 화면에서 전사로 바꿔야 한다
- [Phase 04]: 04-20: 전환 판정은 evaluateTransition 하나(게이트 두 규칙) — changeProjectStatus와 statusDestinations가 공유, 종료일 채움도 규칙에 물어 정함
- [Phase 04]: 04-20: 시드는 시스템 관리자만 upsert, 나머지 계급의 권한·노출은 없을 때만(insertPermissionIfAbsent·insertVisibilityIfAbsent)
- [Phase 04]: 04-20: Phase 5 결재 호출자는 loadStatusChangeFacts로 사실을 트랜잭션 전에 읽어 deps.facts·deps.tx로 changeProjectStatus를 부른다
- [Phase 04]: 04-11: 잘못된 id 상세는 soft 404(HTTP 200 + noindex) — projects/loading.tsx 스트리밍 탓, 진짜 404는 loading 재배치·proxy 사용자 결정 필요
- [Phase 04]: 04-11: 쓰기 경로는 lockProjectForWrite 대신 loadProjectForGate(잠금 안 자동 정산 판정, fail-closed), 목록은 settleForProjectList 요청당 한 번
- [Phase 4]: 04-22 팀장 기간 권리: 팀장(팀장 이상)은 프로젝트 시작일·종료일만 고칠 수 있는 별도 권한을 받는다. projects 쓰기 전체는 주지 않으며 견적 줄 등 나머지 수정은 지금처럼 막힌다 — 사용자 결정 2026-09-25 15:29 KST(04-21 스레드 카드 「기간만 수정」) — 04-20 시드가 팀장에게 projects.view·projects.status 쓰기만 줘서 04-22 종료일 흐름(CEO-D13)이 막혔고, 가장 좁은 권한을 택함. 기각: projects 쓰기 전체 부여 / 현행 유지
- [Phase 4]: 04-44: 총 매출 예상가 권리 = periodEditRights≠none 그리고 quote.amount 노출, 기간과 모은 거부(U-6), 나중 저장이 이김·0=미입력, USD 환율 기억은 커밋 뒤
- [Phase 4]: 04-44: 모달 3차가 모달 밖 칸으로 포커스를 옮길 때는 ConfirmDialog onClose 다음 마이크로태스크에서 연다
- [Phase 4]: 04-12: 정산 새 줄의 견적 칸 0 = 원화 단가 0 · 수량 없음 또는 1(수량 > 0 검증 유지)
- [Phase 4]: 04-12: 순서 불일치·보관된 줄 수정은 quote.line-membership으로 denyWrite
- [Phase 4]: 04-12: 보관함 복원은 restore()의 보관함 권한 뒤 DOMAIN_RESTORERS → restoreQuoteLine(projects 쓰기 재확인, 이미 복원된 줄은 멱등)
- [Phase 4]: 04-30: 정산 새 줄 셀 단계(newLineCells)는 page.tsx(서버)가 계산해 넘긴다 — 클라이언트는 lineCellEditability를 부르지 않는다
- [Phase 4]: 04-30: 잠긴 셀 이유는 CellIssue kind reason — aria-invalid·오류 칸 수에서 제외
- [Phase 4]: 04-30: 줄 이동은 자리를 바꾼 두 줄 모두 dirty(A-03), order는 이동·가운데 삽입일 때만 한 번
- [Phase 4]: 04-30: Ctrl+S는 열린 편집기를 blur 커밋 후 useEffectEvent로 저장

### Pending Todos

- [2026-09-20] [planning] Phase 3 실행 전 결정 4건의 확정 답 (전부 A) — [todo file](.planning/todos/pending/2026-09-20-phase-3-checkpoint-answers.md) — Needs `/gsd-execute-phase 3` 실행 중 각 체크포인트에서 **`A`** 라고 답한다.
- [2026-09-22] [planning] 새 세션 인수인계 — 코덱스 전체 통합 디자인 리뷰 → Phase 4 실행 — [todo file](.planning/todos/pending/2026-09-22-handoff-codex-design-review-then-phase-4.md) — Needs 이 순서로 한다.
- [2026-09-22] [planning] Phase 4 U-2·U-4 UI 결정 확정 답 (U-5는 귀결) — [todo file](.planning/todos/pending/2026-09-22-phase-4-u-2-u-4-ui.md) — Needs ### U-2ⓐ — 최신이면서 고객 승인까지 된 차수의 S5 상태 열 = `승인`만 (`success`).
- [2026-09-22] [docs] 한 칸짜리 목록·폼의 최대 폭이 전역으로 규정돼 있지 않다 — [todo file](.planning/todos/pending/2026-09-22-single-column-max-width.md) — Needs `/admin` 하나만 좁히는 것은 CLAUDE.md의 「화면 하나만 예외 금지」에 정면으로.

### Blockers/Concerns

- [Phase 4]: 11개 요구사항(금액 모델·리저브 대장·문서 카운터·게이트·추출/변환 포함)으로 5플랜 상한에 닿을 수 있다 — 계획 단계에서 넘기면 리저브 대장(RSV-01)을 별도 페이즈로 뗀다
- [Phase 7]: 회사 Google Workspace SMTP 릴레이(앱 비밀번호·발송 한도)는 계획 단계에서 확인(TODOS P2)
- [Phase 9]: 정산(완료) 시점은 D3(정산 결재 대표 승인)로 확정. 매출 기준·연도 귀속을 기획본부·경영관리가 합의하는 절차는 여전히 PROJECT.md에 없다 — 계획 단계에서 사용자와 확정. 착수 조건은 전환 후 N주(설정, 기본 2주) 실입력(Eng OV-1)
- [Phase 11]: CERT 활성화 조건은 `/cso` 보안 감사 통과. 개인정보보호법 적용 범위·보존 기간은 감사에서 재확인(리서치 Gap). 감사 뒤 KMS 봉투 승격(Issue 7)
- [All]: 과잉 설계 재발 방지 — 페이즈마다 "인트라넷보다 못한가"로 검증하고, 실제 사용자 로그인·입력이 있어야 완료로 본다
- [Phase 2]: `docs/design/`(SYSTEM.md 725줄·tokens.css·DECISIONS.md·BRIEF.md·EXPLORE.md)은 **이미 있다**(2026-09-18 확인). Phase 2는 이 시스템을 앱 셸·임시 화면에 적용하는 일이며, 새 화면은 SYSTEM.md 기준을 따르고 시스템을 벗어나면 DECISIONS.md에 이유를 남긴 뒤 SYSTEM.md를 고친다
- [Phase 2] 02-02: ci.yml/deploy.yml paths+! 트리거 실제 동작 미검증 — tokens.css 단독 PR이 CI를 타는지, 일반 소스 PR도 여전히 타는지 GitHub에서 사람이 확인해야 한다. (2)가 실패하면 즉시 paths-ignore로 되돌린다
- 04-09 S15 backstop DOM audit (coverage D4) was self-performed by the executor, not a separate sub-agent as the plan's Task 3 ⑥ requires — orchestrator should confirm or dispatch an independent check before /gsd-verify-work

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260922-c04 | Codex CLI SessionStart 훅 설치 + CODEX_AUTH_JSON_B64 자격 주입 | 2026-09-22 | 4b5f8ea | [260922-c04-codex-cli-sessionstart-codex-auth-json-b](./quick/260922-c04-codex-cli-sessionstart-codex-auth-json-b/) |
| 260922-i3k | 관리자 메뉴 정리(옵션 B: 「관리」 한 줄 + /admin 인덱스 3그룹) + A-M3 표 캡션 | 2026-09-22 | 811243e | [260922-i3k-b-admin-3-a-m3](./quick/260922-i3k-b-admin-3-a-m3/) |
| 260922-o2b | 코덱스 통합 디자인 리뷰 반영(결정 불필요분 F-02·04·05·07·08·09·10) | 2026-09-22 | c8b42b9 | [260922-o2b-codex-design-review-fixes](./quick/260922-o2b-codex-design-review-fixes/) |
| 260923-odg | hook 보강: 게이트 리뷰 종료·quick 완료 = 세션 경계, 문서 커밋도 검증 스킬, 세션당 executor 1회 | 2026-09-23 | 542cafd | [260923-odg-hook](./quick/260923-odg-hook/) |
| 260924-hgx | 이슈 #56 사람 목록 N+1 조회 제거 | 2026-09-24 | a637516 | [260924-hgx-admin-people-list-n-1-query-fix-issue-56](./quick/260924-hgx-admin-people-list-n-1-query-fix-issue-56/) |

### Roadmap Evolution

- Phase 7 edited: 성공 기준 5에 관리자 화면 7개의 ui/form·ui/select 이관(design-review A-H2·A-H3 이월) 추가
- Phase 3 edited: 성공 기준 2의 2차 방어를 React taint API에서 컴파일 타임 커스텀 린트(plant8/no-row-type-escape)로 갱신 — react 안정 채널에 experimental_taint 부재
- Phase 4 edited: edited fields: goal, success_criteria (D-41: 수주중·미수주 상태 추가)
- Phase 04.1 inserted after Phase 4: 결재 모듈·연차 — Phase 5에서 Phase 4 미완성 코드에 기대지 않는 부분을 떼어 Phase 4와 병렬 진행(사용자 결정 2026-09-24)
- Phase 04.2 inserted after Phase 4: 알림·공휴일 기반 — Phase 7에서 Phase 4~6 미완성 데이터에 기대지 않는 공휴일 표·알림함·이메일·notify-tick·잠금 행동 로그를 떼어 Phase 4와 병렬 진행(사용자 결정 2026-09-24)
- Phase 7 edited: edited fields: depends_on, requirements, success_criteria (ADMN-11·NOTI-01·NOTI-02·NOTI-04와 기준 2·4를 Phase 04.2로 옮김)
- Phase 04.3 inserted after Phase 4: QR 확인증 접수 — Phase 11에서 경품 지출결의·세금 제안에 기대지 않는 행사 QR·당첨자 등록·수령자 제출·주민등록번호 암호화·열람·파기·경영관리 정정·인쇄물·/cso 두 번을 떼어 Phase 4와 병렬 진행(사용자 결정 2026-09-24)
- Phase 11 edited: edited fields: goal, depends_on, requirements, success_criteria (CERT-01·CERT-02와 기준 2·3을 Phase 04.3으로 옮김)
- Phase 04.4 inserted after Phase 4: 복원 리허설·로그인 상태 — Phase 8에서 Phase 4 원장에 기대지 않는 복원 리허설 워크플로·복원 절차 문서·상태 화면 항목·사람 목록 로그인 상태 표시를 떼어 Phase 4와 병렬 진행(사용자 결정 2026-09-24)
- Phase 8 edited: edited fields: goal, depends_on, requirements, success_criteria (OPS-03과 기준 5·기준 2의 표시를 Phase 04.4로 옮김)
- Phase 04.5 inserted after Phase 4: 화면 항목 관리 — Phase 10에서 Phase 4 폼 코드·Phase 9 손익에 기대지 않는 커스텀 필드 관리 화면·칸 정의 저장 구조·보관(D10-12)·정보 노출표 자동 등록(D10-13)을 떼어 Phase 4와 병렬 진행(사용자 결정 2026-09-24)
- Phase 10 edited: edited fields: depends_on, success_criteria (기준 4의 관리 화면·보관·노출표 등록을 Phase 04.5로 옮김, ADMN-07은 Phase 10에 남김)
- Phase 04.5 edited: edited fields: goal, depends_on, requirements, success_criteria (/review 반영: 거래처 대상만 켜고 프로젝트·견적 줄 대상은 Phase 10, 보관 선택지·보이지 않는 칸 값 보존, 노출표 행 기본값 방식, Phase 4 겹침 파일 추가)
- Phase 10 edited: edited fields: success_criteria (/review 반영: 프로젝트·견적 줄 대상 켜기와 칸별 판정·값 보존 적용을 Phase 10 기준 4에 명시)

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-09-25T16:17:39.892Z
Stopped at: Completed 04-26-PLAN.md
Resume file: None
