# Phase 5: 지출결의 · 정산 결재 — Research

**Researched:** 2026-09-26
**Domain:** 04.1 결재 엔진 위에 문서 종류 둘(지출결의 · 정산 결재) 등록 + 견적 줄 연결 지출결의(1줄 1문서 · 회차 · idempotency) + 서버 세금 계산 스냅숏 + 증빙 업로드 경로(브라우저 축소 · SHA-256 · GCS 서명 URL), Next.js 16 App Router + Drizzle 4계층 기존 스택
**Confidence:** MEDIUM — main 코드(금액 · 세금 · 설정 · 번호 · 게이트 · 프로젝트 전환 · 견적 줄 연결 자리)는 이 세션에서 직접 읽어 HIGH. 결재 엔진은 04.1 **계획 문서에만** 있고 main에 코드가 없어(`git ls-files domain/approvals` 0건) MEDIUM. GCS 서명 URL 세부는 공식 문서 도메인이 이 세션 프록시에서 막혀 LOW~MEDIUM.

## Summary

Phase 5는 **새 결재 엔진을 만들지 않는다.** 04.1이 계획한 `domain/approvals`(표 3개 · `nextStep` · `walkRoute` · `registerDocumentKind` · `submitDocument`/`approveDocument`/`rejectDocument`/`withdrawDocument`/`resubmitDocument`)에 문서 종류 `expense`(지출결의)와 `settlement`(정산 결재)를 등록하고, 지출결의 문서 · 증빙 파일 · 정산 결재 문서 표를 더한다. 그러나 04.1 계획 그대로는 이 페이즈의 확정 결정 셋을 받을 수 없다 — ① **회수 뒤 같은 번호로 다시 제출**(UI-SPEC 확정 #2): 04.1은 `withdrawn`을 모든 사건에 종결로 정했다, ② **정산 결재 최종 승인 = 프로젝트 완료**(D-98 · D-79): 04.1 종류 등록부에 「최종 승인 때 같은 트랜잭션에서 부르는 훅」이 없다, ③ **제출 뒤 증빙을 더하거나 떼면 결재자의 승인이 동시 처리로 막힘**(UI-SPEC S4): 04.1의 낙관적 잠금 토큰은 결재 인스턴스 `version` 하나다. 이 셋은 엔진에 **선택 필드 · 선택 인자로 덧붙이는 변경**(04.1 기본 동작 불변 · 04.1 테스트 그대로 통과)으로 첫 웨이브에 넣는다.

돈 계산은 새로 쓰지 않는다. `domain/money/tax.ts`의 `applyTaxRule()`이 네 규칙(없음 · 부가세 · 원천징수 · 회사 대납 flat/gross-up)을 이미 다 계산한다. 그러나 **적용 세율과 「세율 버전 id」를 돌려주지 않고**, 기준일 선택(지급일 → 지급 예정일 → 오늘 / 증빙일 → 작성일)은 호출자 책임이라고 주석이 못 박았다. 그래서 이 페이즈가 만드는 것은 호출자 한 겹 — 기준일 고르기 · `incomeType` 고르기 · 적용 세율 행(`settings_historized.id`) 조회 · 스냅숏 저장 · 다시 계산해 차이 표시 — 이다. 문서 번호는 `allocateDocumentNumber`가 이미 트랜잭션 · 행 잠금 · 미리 읽은 서식을 받는다. 견적 줄 쪽에는 Phase 4가 **이 페이즈가 채우라고 비워 둔 함수** `linkedDocumentsByLine`(D-66 읽기 전용 · 계보 해석)이 있다.

증빙 업로드는 새 인프라다: 버킷 · CORS · 런타임 SA 권한(객체 쓰기 · 읽기 + 자기 자신 `signBlob`)이 `scripts/bootstrap-gcp.sh`/`deploy.sh`/`infra/names.sh`에 아직 없다. 서명은 **이미 의존성에 있는 `google-auth-library` 11.1.0의 `GoogleAuth.sign()`**(개인 키가 없으면 IAM `signBlob`을 부른다 — node_modules에서 확인)으로 V4 서명 URL을 만드는 방식을 권한다. `@google-cloud/storage`는 패키지 검사에서 SUS(최신판 9일 전 · 내려받기 수 미확인)이고 8.x가 `google-auth-library ^9.6.3`을 끌어와 11.1.0과 두 벌이 된다. 로컬 · 테스트는 Docker 데몬이 없는 세션이 있어(이 세션 실측) GCS 에뮬레이터 대신 **같은 인터페이스의 로컬 드라이버**(개발 · E2E용 라우트 핸들러 + 통합 테스트용 메모리 가짜)를 쓴다.

**Primary recommendation:** 실행 착수 게이트를 「04.1 머지 + Phase 4 잔여 플랜 머지」로 걸고, Wave 1에서 04.1 엔진 덧붙임 셋(회수 뒤 다시 제출 옵션 · 최종 승인 훅 · 증빙 변경의 인스턴스 version 올림)과 문서 문구 정렬(D-98)을 먼저 끝낸 뒤, 「견적 줄 → 작성 중 문서 → 제출(번호 · 세금 스냅숏) → 결재자 승인」 한 줄 트레이서로 스키마와 잠금 순서를 굳혀라.

<user_constraints>
## User Constraints (from 05-CONTEXT.md — 원문 그대로)

> **범위 주의(2026-09-24 사용자 결정):** 결재 모듈과 연차(EXP-03/04/05, LEAV-01, ADMN-04, D-96 · D-97)는 Phase 04.1로 옮겨졌다. 아래는 CONTEXT 원문을 그대로 옮긴 것이며, 이 페이즈가 계획할 것은 지출결의 · 정산 결재 · 증빙 · 세율 부분이다. 연차 줄은 04.1이 이미 계획했다.

### Locked Decisions

#### 이미 확정된 입력 (다시 묻지 않음 — 출처가 정본)
- 결재선 기본 4단(팀장 → 본부 책임자 → 경영관리 → 대표), 단계 = 계급 × 조직 범위, 제출 시 고정, 사람은 표시 시점 현재 담당으로 해석 — `docs/inputs/phase-05-approval.md` §1, ROADMAP 기준 2
- 빈 자리는 건너뛰고, 전부 비면 대표가 받는다. 결재 없이 통과하는 문서는 없다 — 입력 §2
- 자기 승인 기본값은 문서 종류별 설정: 지출결의·정산 결재 = 본인이 직접 눌러 통과(「본인 승인」 표시), 연차 = 건너뜀 — 입력 §3
- 반려 사유는 자유 입력 필수, 사유 코드표 없음 — 입력 §4
- 연차: 종일 1 · 반차 0.5 · 반반차 0.25 · 재택 0(기록만, 횟수 제한 없음), 회계연도(1월 시작) 부여, 이월 없음, 일수는 관리자 연 1회 설정, 잔여 초과는 막지 않고 경고(신청 창·결재 옆판에 남은/결재 중/이번 신청 일수) — 입력 §5
- 지출결의: 견적 줄 1개 = 문서 1개, 분할 지급은 회차별 문서(회차 합계 ≤ 실행가), idempotency key, 금액 > 0, 공급가액만 입력, 번호는 제출 시 부여(`26001-0001`, 프로젝트 번호와 같은 `document_counters`) — 입력 §6, Phase 4 D-42
- 팀 이름 지출 종류 = 미수주 비용 / 팀 관리비. 미연결 개인 비용은 사용일 기준 소속 팀(`teamAtDate()`) — 입력 §7
- 수주중 프로젝트는 고객 승인 게이트 없이 지출결의 가능(Phase 4 D-43). 연결 문서가 있는 줄의 금액 셀은 읽기 전용(D-66). 폰 시트의 「지출결의 올리기」를 이 페이즈에서 켠다(D-69). 현재 차수 = 최신 차수(D-54)
- 세금 계산은 `domain/money.applyTaxRule()` 호출 하나, 이 페이즈는 계산을 새로 쓰지 않는다 — ROADMAP 기준 7

#### 연차 — 입사 첫해 (입력 §9 미정 5-A 해소)
- **D-96:** **입사한 해에는 법정 월차를 자동으로 준다.** 입사일부터 1개월을 채울 때마다 1일, 그해 최대 11일이며, 입사 다음 회계연도 말에 소멸한다(260907의 근로기준법 검토 결과와 같음). 회계연도 연차(관리자 연 1회 설정)와는 별도 잔고로 보인다. — **Reversibility:** costly — 잔고가 두 종류가 되어 신청·결재 옆판·차감 로직이 함께 바뀐다
- **D-97:** **퇴직 시에는 잔여 일수만 보여 주고 금액 정산은 하지 않는다.** 연차 수당 계산은 이 시스템 범위 밖이다.

#### 정산 → 완료 결재
- **D-98:** **정산 결재는 PM이 올리고 대표가 승인한다**(Phase 4 D-79 유지). `docs/inputs/phase-05-approval.md` §8과 ROADMAP Phase 5 기준 6의 「경영관리 기안」 문구는 D-79 이전 기록이라 이 결정으로 대체한다 — 계획 단계에서 ROADMAP·REQUIREMENTS 문구를 `gsd_run`으로 맞춘다. Phase 4의 「대표·시스템 관리자 직접 완료」 전환 함수는 그대로 두고 호출자만 결재 승인으로 바꾼다

#### Phase 5·6 경계 (Phase 4 Deferred 해소)
- **D-99:** **PM의 매출 세금계산서 발행 요청(D-77)은 Phase 6 경영관리 증빙 화면에서 받는다.** 결재 모듈의 문서 종류는 지출결의·연차·정산 결재 3종 그대로다
- **D-100:** **정산 단계의 지출결의·증빙 마감 점검(D-77)은 Phase 6 미결 점검(PROJ-06)과 함께 한다.** Phase 5의 정산 결재 제출은 이 점검으로 막지 않는다

#### 세율 적용 기준일
- **D-101:** **ROADMAP 기준 7의 초안을 설정 기본값으로 둔다** — 원천징수·회사 대납 = 지급일(미지급이면 지급 예정일), 부가세 = 증빙일(없으면 작성일). 경영관리가 나중에 설정 화면에서 바꾼다. 계획 전 경영관리 확인은 받지 않는다

### Claude's Discretion
- 월차 「1개월 채움」 판정은 입사일 기준 매월 같은 날 적립으로 하고 결근 차감은 관리자 수동 조정으로 둔다(시스템에 근태 기록이 없다). 신청 시 차감 순서는 소멸이 빠른 월차부터를 기본으로 계획이 정한다
- 결재 모듈 3표(routes/steps/instances) 스키마 세부, `nextStep()` 시그니처, 문서 종류별 자기 승인 설정 키 모양
- 증빙 업로드 경로(브라우저 축소 + SHA-256 + GCS 서명 URL)는 ROADMAP Phase 5 비고대로 이 페이즈가 만들고, Phase 6은 한도·중복·선결제 규칙만 얹는다
- 연차 신청·승인 화면은 SYSTEM.md에 정본이 없으므로 `/gsd-ui-phase 5`에서 UI 계약을 먼저 세운다

### Deferred Ideas (OUT OF SCOPE)
- 매출 세금계산서 발행 요청 흐름 → Phase 6 (D-99)
- 정산 단계 마감 점검 → Phase 6 PROJ-06 (D-100)
- 연차 수당 금액 정산 → 범위 밖 (D-97)
- 계획 때 맞출 것(뒤 페이즈 논의에서 생김): 회사 대납 세금 기본값이 코드 쪽 단순 비율 8.8%와 Phase 11 D-1105(22%·역산)로 갈린다, Phase 6 D-607로 카드 사용은 EXP-15 「공급가액만 입력」의 예외다 — `.planning/phases/11-other-income-certificate/11-CONTEXT.md`, `.planning/phases/06-payment-evidence-cards/06-CONTEXT.md`

### UI-SPEC 확정 결정 (05-UI-SPEC.md 「확정된 결정」 — 사용자 2026-09-26, 계획이 바꾸지 않는다)
1. 분할 지급 = 폼 체크박스 `분할 지급`(기본 꺼짐). 앞 회차가 있는 줄의 문서는 체크박스 없이 회차 자동
2. 제출 토스트 `되돌리기` = 확인 없는 즉시 회수 → 회수된 지출결의는 기안자의 고칠 수 있는 폼으로 돌아와 **같은 번호로 `지출결의 다시 제출`**. 문서 화면의 `회수`는 04.1 S6 확인
3. 결재함 PC 행 · 「내 차례」 `승인`은 지출결의 · 정산 결재에도 확인 없이 즉시
4. `정산 결재 올리기` = 프로젝트 상세 머리 줄 2차 버튼, 확인 창 없이 즉시 기안 + 토스트 `되돌리기`(= 회수)
5. 여러 줄 `Ctrl+E` = 줄마다 작성 중 문서 생성 → 지출결의 목록 `작성 중` 그룹으로 이동 + 토스트
- 인쇄(S12)는 이 페이즈에서 뺐다(사용자 2026-09-26)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXP-01 | 견적 줄 「지출결의 올리기」 → 거래처 · 금액 · 프로젝트 자동 채움, 1줄 1문서, 분할 회차 합계 ≤ 실행가, idempotency | Pattern 3(문서 모델 · 부분 UNIQUE · 잠금 순서), Pattern 4(번호), `linkedDocumentsByLine` 채우기(Pattern 6) |
| EXP-02 | 작성 · 증빙 첨부 · 제출을 화면 하나에서 | Pattern 5(업로드 경로 — 견적 줄 입구는 문서를 먼저 만든다), S3 폼 |
| EXP-08 | 팀 이름 지출(미수주 비용 · 팀 관리비), 미연결 개인 비용 → 사용일 소속 팀, 팀장 화면 `프로젝트 미연결` | Pattern 3 팀 비용 칸 · `teamAtDate()` 재사용, 목록 가시성(Open Question 2) |
| EXP-14 | 제출 시 금액 > 0, 음수 입력 불가 | 서버 검증 + DB CHECK(`number IS NULL OR supply_amount_krw > 0`), 게이트 ⑦ |
| EXP-15 | 공급가액만 입력, 증빙 종류별 규칙으로 서버 계산, 종류 바꾸면 즉시 재계산, 기준일, 세율 버전 저장 · 재계산 차이 | Pattern 2(세금 호출자 한 겹 — `applyTaxRule` 한 번 + 기준일 · incomeType · 세율 행 id), Deferred 두 건 권고 |
| EVID-01 | 첨부(폰 사진 포함), 크기 한도(기본 10MB, 설정) · 형식(이미지 · PDF) · SHA-256 중복, 폰 사진 축소 | Pattern 5 전체, 설정 키 `evidence.max_size_mb`(Phase 6 06-02와 같은 이름) |
| UX-03 | 폰에서 결재 · 조회 · 지출결의 작성 | UI-SPEC S2 · S3 폰 · S9, E2E 폭 375 · 320 |
| UX-06 | 안내 문구 없음, 선행 단계 전 비활성 + 이유, 다음 할 일 한 곳 | `domain/rules.gate` 새 규칙 `expense.submit`(순서 ①~⑨ 첫 이유), 「내 차례」 공급(S11) |

ROADMAP Phase 5 성공 기준 매핑: 기준 1 = EXP-01 · 14 · 번호 · 금액 모델 / 기준 2 · 3 = 04.1 엔진을 지출결의로 다시 증명(고정 결재선 · 낙관적 잠금 두 순서 · E2E 1개) / 기준 4 = EXP-08 / 기준 5 = 04.1 소관(연차) / 기준 6 = 문서 종류 셋 + 정산 결재(D-98) / 기준 7 = EXP-15.
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- 패키지 매니저 pnpm만. **새 의존성은 이유 한 줄 + 사용자 승인 후**(§5) — 이 연구는 새 의존성 0개를 권한다.
- 4계층 `app/ → domain/ → repositories/(viewer 첫 인자) → db/`, 도메인 출구는 DTO만, `any` 금지, 시크릿을 코드 · 커밋에 금지.
- TDD(실패 테스트 → 최소 구현), 실제 실행 확인 없이 「완료」 금지. 로컬 dev 통과는 완료가 아니다 — **완료 판정은 `CI=true`**(프로덕션 빌드 E2E).
- 화면: `docs/design/SYSTEM.md` 기준, 새 색 · 서체 · radius 0개, 토큰은 `docs/design/tokens.css`만. 시스템 밖이면 `DECISIONS.md` → `SYSTEM.md` → 코드(UI-SPEC B1~B7이 이 순서를 이미 정했다). 화면 검증 = 싼 게이트 → 독립 DOM 감사(별도 에이전트 · `CI=true`) → 수정 → 전체 게이트 한 번. 스크린샷 육안 판정 금지.
- §7 사용성: 알 수 있는 값은 미리 채움, 계산은 묻지 않음, 확인 창 대신 되돌리기(되돌릴 수 없는 일에만 확인), 주 버튼 하나.
- `.planning/` 수동 편집 금지 — ROADMAP · REQUIREMENTS 문구 정렬(D-98)은 `gsd_run` 도구로.
- Post-build 넷(`/review` → `/qa` → `/cso` → `/ship`) 필수 — 이 페이즈는 **외부 입력(파일 업로드) · 권한 · 결재**를 건드리므로 `/cso`는 선택이 아니다.
- 커밋: 제목 영어 접두어 + 요약, 본문 한국어, 한 커밋 한 의도. 웹 브라우징은 `/browse`만.
- 서브에이전트 위임 때 Superpowers 스킬(`test-driven-development` · `systematic-debugging` · `verification-before-completion`)을 프롬프트에 명시.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 결재 상태 전이 · 결재선 고정/해석 · 낙관적 잠금 | API/Backend (`domain/approvals`, 04.1) | Database(`approval_*` 3표 CHECK · UNIQUE) | 04.1 엔진 그대로. Phase 5는 종류 등록 + 선택 필드 셋만 |
| 지출결의 생성 · 제출 · 1줄 1문서 · 회차 상한 | API/Backend (`domain/expenses`) | Database(부분 UNIQUE · CHECK · 행 잠금) | 동시성 규칙은 DB 제약 + 프로젝트 행 잠금이 최종 판정 |
| 문서 번호 | API/Backend (`domain/document-numbering`) | Database(`document_counters` 행 잠금) | 기존 `allocateDocumentNumber` 재사용 |
| 세금 계산 · 기준일 · 세율 버전 스냅숏 | API/Backend (`domain/money.applyTaxRule` + `domain/expenses/tax.ts` 호출자) | — | 브라우저는 `domain/money`를 import하지 않는다(린트 · UI-SPEC S5) |
| 제출 막힘 이유 | API/Backend (`domain/rules.gate`) | Frontend Server(RSC가 문자열 그대로 렌더) | UX-06 — 판정 하나, 화면은 표시만 |
| 이미지 축소 · SHA-256 | Browser(`canvas` · `crypto.subtle`) | — | ROADMAP Phase 6 기준 2 「서버 이미지 라이브러리 없음」 |
| 크기 · 형식 · 중복 검사, 서명 URL 발급, 완료 재확인 | API/Backend (`domain/evidence` + `lib/gcp/storage.ts`) | CDN/Static(GCS 버킷) | 서명 · 권한 판단은 서버만. 바이트는 브라우저 → GCS 직접 |
| 증빙 원본 보기 | CDN/Static(GCS 서명 GET, 짧은 만료) | API(권한 판정 뒤 URL 생성) | 볼 수 있는 사람에게만 URL을 만든다 |
| 정산 결재 → 프로젝트 완료 | API/Backend (결재 최종 승인 훅 → `changeProjectStatus(deps.tx)`) | Database(프로젝트 행 잠금) | D-79 「전환 함수 그대로, 호출자만 결재 승인」 |
| 견적 줄 D-66 잠금 · 파생 상태 | API/Backend (`domain/quotes/lines.linkedDocumentsByLine`) | — | Phase 4가 비워 둔 한 함수만 채운다 |
| 폼 · 목록 · 결재함 화면 | Frontend Server(RSC + Server Actions) | Browser(폼 상호작용 · 업로드) | 기존 패턴 |

## Standard Stack

### Core (전부 기존 — 새로 설치하지 않음)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.5 | App Router · RSC · Server Actions · Route Handler(로컬 저장소 드라이버) | [VERIFIED: package.json] 기존 스택. Route Handler는 `PUT` 지원 [VERIFIED: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md:24] |
| next-safe-action | 8.7.3 | 모든 액션은 `authedActionClient` | [VERIFIED: lib/actions/client.ts] 린트 `require-action-client`가 강제 |
| drizzle-orm / drizzle-kit | 0.45.2 / 0.31.10 | 새 표 · `pnpm db:generate`(손 편집 금지) | [VERIFIED: package.json] |
| zod | 4.6.5 | 액션 입력 · 설정 키 스키마 | [VERIFIED: package.json] |
| google-auth-library | 11.1.0 | GCS V4 서명(`GoogleAuth.sign()` — 개인 키 없으면 IAM `signBlob`) · GCS JSON API 메타데이터 조회(`auth.request`) | [VERIFIED: package.json · node_modules/google-auth-library/build/src/auth/googleauth.js:883-919] 이미 의존성(Cloud SQL Admin 조회가 씀) |
| 브라우저 플랫폼 API | — | `createImageBitmap` → `canvas.toBlob('image/jpeg')` 축소, `crypto.subtle.digest('SHA-256')` | [CITED: 05-UI-SPEC.md Design System 절] 새 npm 0 |

### Supporting (기존 도메인 모듈 — 재사용)

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `domain/money` (`applyTaxRule` · `moneyToColumns` · `moneyFromRow` · `normalizeMoneyInput` · `toKrw`) | 금액 모델 · 세금 | 모든 금액 입력 · 저장 · 표시 |
| `domain/document-numbering` (`loadDocumentNumberFormat` · `allocateDocumentNumber`) | 제출 시 번호 | 제출 트랜잭션의 마지막 쓰기 |
| `domain/rules/gate` (`registerGateRule` · `gate`) + 기존 규칙 `quote.customer-approval` · `quote.vendor-required` | 막힘 이유 | 새 규칙 `expense.submit`이 앞 둘의 문자열을 그대로 쓴다 |
| `domain/org.teamAtDate` | 사용일 소속 팀 | 팀 비용 · 미연결 비용 귀속 |
| `domain/projects/status.changeProjectStatus` (`deps.tx` · `deps.facts`) | 정산 → 완료 | 정산 결재 최종 승인 훅 |
| `domain/quotes/lines.linkedDocumentsByLine` · `domain/quotes/lineage.resolveLinkedDocumentsByLineage` | D-66 · 계보 | 이 페이즈가 출처 쿼리를 채운다 |
| `lib/db-transaction.withTransaction` | 트랜잭션(`lock_timeout 5s`) | 모든 쓰기 트랜잭션 |
| `domain/permissions` (`can` · `visible` · `project` · `registerDto`) · `lib/actions/registry.registerAction` | 권한 · 투영 · 누수 스캔 | 새 DTO · 액션마다 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `google-auth-library` `sign()` + V4 서명 약 60~80줄(`lib/gcp/storage.ts`) | `@google-cloud/storage` 8.2.0 `getSignedUrl({version:'v4', action:'write', extensionHeaders})` | 공식 SDK라 서명 코드를 안 쓴다. 그러나 ① 새 의존성(CLAUDE.md 승인 필요) ② 패키지 검사 **SUS**(최신판 2026-09-17 게시 · 내려받기 수 미확인) ③ 8.x가 `google-auth-library ^9.6.3`에 의존 [VERIFIED: npm view @google-cloud/storage@8 dependencies] → 기존 11.1.0과 두 벌 설치. 사용자가 SDK를 원하면 승인 checkpoint 뒤 이 줄로 바꾼다 — 인터페이스(`ObjectStorage`)가 같아 호출자는 바뀌지 않는다 |
| 로컬 저장소 드라이버(라우트 핸들러 + 메모리 가짜) | `fake-gcs-server` Docker 에뮬레이터 | 이 세션은 Docker 데몬이 없다(`docker info` 실패 — 실측). CI(`ci.yml`)도 Postgres 서비스만 있다. 에뮬레이터는 CI 서비스 추가 · 로컬 설치를 요구 |
| 업로드 의도 표(`upload_intents`) | HMAC 서명 토큰(무상태) | 표가 있으면 「의도만 있고 완료 없음」을 쿼리로 찾을 수 있다 — Phase 6 기준 5 통합 테스트 · F8 고아 청소가 이것을 전제한다. 새 비밀 키도 필요 없다 |
| 결재 상태를 결재 인스턴스에서 파생 | `expenses.status` 복사 열 | 복사 열은 두 정본이 되어 어긋난다. 06-03 계획은 「상태 칸」을 가칭으로 적었고 M-9 게이트에서 다시 본다 |

**Installation:** 없음(새 패키지 0).

**Version verification:** `npm view google-auth-library version` → 11.1.0(이 세션). `package.json`이 같은 11.1.0을 고정.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@google-cloud/storage` (대안 · 권장 아님) | npm | 최신판 8.2.0 = 2026-09-17(9일), 계열 자체는 오래됨 | 미확인(검사 도구가 null) | github.com/googleapis/google-cloud-node | [SUS] | Flagged — 쓰려면 `checkpoint:human-verify` + 사용자 승인. 기본 권고에서는 설치하지 않는다 |
| `google-auth-library` | npm | 기존 의존성 | — | github.com/googleapis/google-auth-library-nodejs [ASSUMED] | 기존(검사 대상 아님) | Approved(이미 lockfile) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `@google-cloud/storage` — 기본 권고에서 빠져 있다. 대안을 택하면 설치 전 `checkpoint:human-verify`. `npm view @google-cloud/storage scripts.postinstall` = 없음(이 세션).

## Architecture Patterns

### System Architecture Diagram

```
[PM 브라우저]
  │ ① 견적 줄 「지출결의 올리기」/Ctrl+E ─────────────▶ createExpenseFromLines(action)
  │                                                     │ 게이트(행 판정) → 부분 UNIQUE(줄·기안자·작성 중) ON CONFLICT
  │                                                     ▼
  │                                             expenses(작성 중, 번호 없음) ──▶ /expenses/[id] 폼
  │ ② 폼 칸 변경 ─▶ previewExpense(action) ─▶ domain/expenses: 기준일·incomeType 고르기
  │                                            → applyTaxRule() 1회 + 세율 행 id 조회 → 계산 한 줄
  │                                            → gate('expense.submit') 첫 이유 ──▶ 폼(막힘 이유 · 1차 비활성)
  │ ③ 파일 고름 ─▶ [브라우저] 축소(최대 변 2000 JPEG, PDF 원본) + SHA-256
  │             ─▶ requestEvidenceUpload(action): 권한·크기·형식·중복 → upload_intents 행
  │                                             → ObjectStorage.createSignedPut(key, 크기 범위·형식·sha 메타)
  │             ─▶ PUT 바이트 ──────────────▶ [GCS 버킷 | 로컬 드라이버]
  │             ─▶ completeEvidenceUpload(action): 의도 소유·만료 확인 → getMetadata 재확인
  │                                             → files 행 + 의도 완료 (한 트랜잭션)
  │ ④ 제출 Ctrl+Enter ─▶ submitExpense(action)
  │      트랜잭션 전: 설정·번호 서식·결재선 준비(prepareSubmission)·세금 계산·조직 스냅숏
  │      withTransaction: 프로젝트 행 잠금 → 지출결의 행 잠금(version) → 게이트 재판정(tx 읽기)
  │                       → 스냅숏 저장 → submitDocument/resubmitDocument → 번호(마지막 쓰기)
  ▼
[approval_instances/routes/steps] ──▶ 결재함 listMyInbox ──▶ [결재자 폰] 결재 시트 「승인」
                                          │ approveDocument(instanceId, expectedVersion)
                                          ├─ 지출결의: 최종이면 끝(지급은 Phase 6)
                                          └─ 정산 결재: 최종이면 종류 훅 onFinalApprovalInTx
                                                 → changeProjectStatus(settling→completed, deps.tx)
                                                 (프로젝트가 정산이 아니면 거부 → 전체 롤백)
[견적 줄 표] ◀── linkedDocumentsByLine(번호 있는 문서, 계보) ── D-66 잠금 · 파생 상태 `지출결의 중`/`반려`
```

### Recommended Project Structure

```
db/schema/
├── expenses.ts            # 지출결의 문서(견적 줄 · 팀 비용 한 표)
├── files.ts               # 증빙 파일(owner_kind · owner_id) + upload_intents
└── settlement-approvals.ts# 정산 결재 문서(프로젝트당 1)
domain/
├── approvals/             # 04.1 — 이 페이즈는 선택 필드 셋만 덧붙인다(Pattern 1)
├── expenses/
│   ├── index.ts           # 종류 등록(registerDocumentKind) · create · save · submit · delete · 목록 · 조회
│   ├── tax.ts             # 기준일 · incomeType · 세율 행 id · 계산 한 줄 문자열 · 차이(계산 없음)
│   ├── gate.ts            # expense.submit 규칙 ctx 조립(규칙 등록은 domain/rules/register.ts)
│   ├── line-door.ts       # 줄마다 문 열림/닫힘/거래처 없음 판정(S1 · S2 · S14 공용)
│   ├── access.ts          # 보임 판정(기안자 · 결재 관련자 · 범위) — 404
│   └── dto.ts             # registerDto(누수 스캔)
├── evidence/
│   ├── index.ts           # requestEvidenceUpload · completeEvidenceUpload · remove · 서명 GET
│   └── upload-checks.ts   # 크기 · 형식 · 중복(06-11이 선결제 규칙을 여기에 더한다)
├── settlements/index.ts   # 정산 결재 종류 등록 · 기안 · 최종 승인 훅
└── money/index.ts         # sumKrw · diffKrw 추가(06-02와 같은 이름 — Pattern 3)
lib/gcp/storage.ts         # ObjectStorage 인터페이스 + gcs 드라이버(V4 서명) + local 드라이버
app/(app)/expenses/        # page.tsx(목록 S8) · new/ · [id]/(폼 S3 · 문서 S7) · actions.ts · actions.registry.ts
app/(app)/projects/[id]/settlement/  # 정산 결재 문서 화면 S10(나)
app/api/storage-local/[...key]/route.ts  # 로컬 드라이버 PUT/GET — STORAGE_DRIVER=local일 때만
ui/attachments/ · ui/pick-dialog/ · ui/approval-sheet/(04.1에서 이동)
```

### Pattern 1: 04.1 엔진과의 통합 계약 — 「가정할 것」과 「더할 것」

**가정할 것(04.1 계획에 있음 — 머지 뒤 실제 이름을 SUMMARY로 재확인):**

| 항목 | 04.1 계획 원문 | 출처 |
|---|---|---|
| 인스턴스 상태 | `approval_instances.status` ∈ {draft, submitted, in_review, approved, rejected, withdrawn}, `current_round` · `version` int 기본 1, UNIQUE(document_kind, document_id) | [CITED: 04.1-01-PLAN.md:299] |
| 차수 · 단계 | `approval_routes`(instance_id · round · `self_approval` ∈ {skip, self_approve} · 기안자 팀/본부 id · UNIQUE(instance_id, round)), `approval_steps`(step_index · label · role_id · scope_kind ∈ {team, org_unit, company} · acted_by · action ∈ {approved, rejected} · reason · `self_approved`) | [CITED: 04.1-01-PLAN.md:299] |
| 전이 | `nextStep(status, event)` — 사건 `submit`·`approve`·`approve_final`·`reject`·`withdraw`·`resubmit`, 표 밖이면 `InvalidTransitionError` | [CITED: 04.1-01-PLAN.md:303] |
| 종결 판정 | 「`approved`·`withdrawn`은 모든 사건에 종결, `rejected`는 기안자의 `resubmit`을 뺀 모든 사건에 종결」 | [CITED: 04.1-01-PLAN.md:305] |
| 종류 등록 | `registerDocumentKind({kind, label, loadRouteConfig, href, describeDocuments, routeSettings?, canResubmit?})` + 04.1-05의 `loadDetails` · `detailDto` · `buildDetailRows`(투영 뒤 문자열 행 — ENG-17) | [CITED: 04.1-01-PLAN.md:305, 04.1-05-PLAN.md:64] |
| 서비스 | `prepareSubmission`(트랜잭션 전 읽기) → `submitDocument(viewer, prepared, {documentId}, tx)`, `approveDocument(viewer, {instanceId, expectedVersion}, deps?)`, `rejectDocument(…, reason 1~500자)`, `withdrawDocument`, `resubmitDocument(viewer, prepared, {instanceId, expectedVersion}, tx)`(기안자만 · `rejected`에서만 · 차수 +1), `listMyInbox(viewer, {withDetails})`, `getApprovalView` | [CITED: 04.1-01-PLAN.md:305, 04.1-02-PLAN.md:307] |
| 보임 | 「결재 문서가 보이는 사람 = 기안자 · 지금 단계 후보 · 이 문서에서 한 번이라도 처리한 사람. 그 밖은 없는 문서(404)」 | [CITED: 04.1-01-PLAN.md:240] |
| 결재선 설정 | 종류마다 17키 `approval_route.<kind>.self_approval` + `approval_route.<kind>.step{1..4}.{enabled,role_id,scope,org_unit_id}`, scope enum `drafter_team`·`drafter_org_unit`·`company`·`org_unit` | [CITED: 04.1-01-PLAN.md:84, :309] |
| 종류 등록 한 곳 | `app/(app)/document-kinds.ts` — 「Phase 5는 여기에 줄을 더한다」 | [CITED: 04.1-02-PLAN.md:247] |
| 오류 | `ApprovalConflictError`(문구 `{이름}이/가 HH:MM에 …함 · 새로 고침`) · `NotCurrentHolderError`(`지금 담당이 아님 · 새로 고침`) | [CITED: 04.1-02-PLAN.md:368, :373] |
| 트랜잭션 규약 | 「`withTransaction` 콜백 안에서 전역 풀을 쓰는 읽기(`getSettingValue`·`listOrgSnapshot`·`can()`·`loadRouteConfig`·`project()`)를 불러서는 안 된다」 | [CITED: 04.1-01-PLAN.md:100] |

**더할 것(Phase 5 Wave 1 — 전부 선택 필드/선택 인자, 04.1 기본 동작 불변):**

| # | 필요 | 이유 | 권하는 모양 |
|---|---|---|---|
| E1 | 회수 뒤 다시 제출 | UI 확정 #2(같은 번호 `지출결의 다시 제출`) · S10 `정산 결재 다시 올리기`. 04.1은 `withdrawn`이 종결 | 종류 정의 선택 필드 `resubmitFrom?: readonly ("rejected" \| "withdrawn")[]`(기본 `["rejected"]`). 공용 전이 (2)의 종결 판정과 `resubmitDocument`의 상태 판정이 이 목록을 본다. `nextStep`은 선택 셋째 인자 `{ allowResubmitFromWithdrawn?: boolean }`(기본 false)로 표 한 줄을 연다 — 04.1 단위 테스트 「withdrawn 뒤 모든 사건 거부」는 그대로 초록 |
| E2 | 최종 승인 = 프로젝트 완료(같은 트랜잭션) | D-98 · D-79. 04.1에는 훅이 없다 | 선택 필드 `prepareFinalApproval?(viewer, documentId) → P`(트랜잭션 **전** 읽기 — `loadStatusChangeFacts`)와 `onFinalApprovalInTx?(viewer, documentId, tx, prepared: P)`. `approveDocument`는 계산 결과가 `approve_final`일 때만 (6) 단계 기록 뒤 · (7) 로그 전에 부른다. 훅이 던지면 전체 롤백 |
| E3 | 승인 가능 여부 종류 판정(보기) | S10: 프로젝트가 정산이 아니면 대표 `승인` `aria-disabled` + `진행으로 바뀜 · 반려` | 선택 필드 `approveBlockedReason?(viewer, documentIds) → Map<id, string>`; `getApprovalView` · `listMyInbox` 상세가 실어 준다. 서버 최종 판정은 E2 훅(상태 불일치 → 롤백) |
| E4 | 증빙 변경이 결재자 승인을 막음 | UI S4 · S9 「`박서연이 14:01에 증빙을 더함 · 새로 고침`」 | 리포지토리 `bumpInstanceVersion(viewer, {instanceId, expectedVersion?, updatedBy, reason: "evidence"}, tx)` — 증빙 추가 · 삭제 트랜잭션이 인스턴스 행을 `version + 1`로 올린다(상태 불변). `buildConflictMessage`에 「상태가 같고 `updated_by` = 기안자」 갈래 한 줄. 결재자는 인스턴스 `version` 하나로 막힌다(두 번째 토큰을 엔진에 넣지 않는다) |
| E5 | 결재함 숫자 열 · 문서 칸 | UI S9 — 금액/일수 머리글을 서버가 표에 있는 종류로 정함 | `describeDocuments` 요약 DTO에 선택 `measure?: { kind: "money", krw, currency, foreignAmount, fxRate } \| { kind: "days", … } \| null` |
| E6 | `본인 승인` 낱말 | UI B2 · UA-607 | 04.1 결재 상태 표시 파일에 `self_approved` 단계 → `본인 승인 {시각}`(`success`) 한 줄. 엔진은 이미 `self_approved` 열을 쓴다 |
| E7 | 결재 시트 `ui/` 이동 | UI S9 · S11 두 번째 사용처 | `app/(app)/approvals/approval-sheet.tsx` → `ui/approval-sheet/ApprovalSheet.tsx`(04.1 인벤토리가 예고한 조건) |

`canResubmit`(04.1에 이미 선택 필드): 지출결의 = `can(viewer, "expenses", "write")`, 정산 결재 = 그 프로젝트 쓰기 권리 **그리고 프로젝트 상태 `settling`**(S10 `진행 중 · 정산 뒤 다시 올리기`).

**문서 상태 파생:** 작성 중 지출결의에는 인스턴스가 없다(04.1 연차도 제출 때 인스턴스를 만든다 — [CITED: 04.1-01-PLAN.md:307]). 화면 상태 = 인스턴스 없음 → `작성 중`, 있으면 인스턴스 상태. `expenses`에 상태 복사 열을 두지 않는다.

### Pattern 2: 세금 — `applyTaxRule()` 한 번 + 호출자 한 겹(계산 없음)

`applyTaxRule`의 계약 [VERIFIED: domain/money/tax.ts:30-42]:

```typescript
export type ApplyTaxRuleOpts = {
  paymentDate: Date;
  evidenceDate: Date;
  /** 원천징수(withholding) 규칙에서만 쓴다. 기본 "other"(기타소득). */
  incomeType?: TaxIncomeType;
};

export type TaxRuleResult = {
  vatKrw: number;
  withholdingKrw: number;
  companyBorneKrw: number;
  payableKrw: number;
};
```

- 세율 · 적용 행은 **돌려주지 않는다**. 규칙 종류는 `TAX_RULE_KIND_VALUES = ["none", "vat_surcharge", "withholding", "company_borne"]` [VERIFIED: domain/code-tables/tax-rule.ts:10].
- 회사 대납은 이미 두 방식을 계산한다: `if (method === "flat") { companyBorneKrw = round(supplyKrw * rate, …) } else { const gross = supplyKrw / (1 - rate); … }` [VERIFIED: domain/money/tax.ts:119-125]. 설정 기본값 `tax.company_borne.rate` `default: 0.088`, `tax.company_borne.method` `default: "flat"`, 값 목록 `["flat", "gross_up"]` [VERIFIED: domain/settings/keys.ts:98-121].
- 기준일 설정 키 [VERIFIED: domain/settings/keys.ts:124-145]: `TAX_BASIS_DATE_VALUES = ["payment_date", "evidence_date", "issue_date", "document_date"]`, `tax.basis_date.withholding` `default: "payment_date"`, `tax.basis_date.vat` `default: "evidence_date"` — 둘 다 `kind: "simple"`. 주석: 「미지급 시 지급 예정일로 넘어가는 등의 대체 규칙은 Phase 4의 금액 모듈이 구현한다」 — 실제로는 아무도 구현하지 않았다(`applyTaxRule`은 두 키를 읽기만 하고 호출자가 넘긴 날짜를 쓴다, tax.ts:67-73).
- 원천징수는 `incomeType`으로 세율 키가 갈린다(`"business"` → `tax.withholding.business_income.rate` 0.033, 기본 `"other"` → 0.088) [VERIFIED: tax.ts:88-91 · keys.ts:68-86]. 시드 증빙 종류 값은 `tax_invoice`·`invoice`·`card_receipt`·`cash_receipt`·`other_income`·`business_income`·`overseas_invoice` [VERIFIED: domain/seed/index.ts:74-118] — **`business_income`을 `"business"`로 넘기지 않으면 사업소득이 8.8%로 계산된다.** 06-UI-SPEC UA-620이 같은 규칙(`business_income` → `"business"`, 그 밖 → `"other"`)을 06-03의 `incomeTypeFor`로 계획했다 — Phase 5가 먼저 쓰므로 **Phase 5가 만들고 06-03이 가져다 쓴다**.
- 시드에 `company_borne` 증빙 종류는 **없다**(위 일곱 값) — 경품 회사 대납은 경영관리가 코드표에서 종류를 추가해야 나타난다.
- 이력형 세율 행은 **시드되지 않았다**(`domain/seed` · `scripts` · 마이그레이션에 `company_borne`/`addHistorizedValue` 0건 — grep) → 지금 모든 세율은 키의 `default`로 나온다. `settings_historized.id`가 없는 상태가 기본이다.

**Phase 5가 만드는 호출자(`domain/expenses/tax.ts`) — 계산을 쓰지 않는다:**

1. `pickTaxDates(doc, {basisWithholding, basisVat, todayKst})` — D-101 대체 사슬: 원천징수 · 회사 대납 = 지급일(Phase 6 전에는 없음) → 지급 예정일 → 오늘 / 부가세 = 증빙일(Phase 5에 칸 없음, UI Assumptions #7) → **작성일**(문서 생성일). 06-03 계획의 `pickTaxDates`(「증빙일 또는 결재 통과일 · 지급일 > 지급 예정일 > 오늘 KST」)와 같은 이름 · 같은 파일로 두어 06-03이 확장한다. (06-03은 부가세 대체를 「결재 통과일」로 적었다 — D-101은 「작성일」이다. 06 M-9 게이트에서 06을 맞춘다.)
2. `incomeTypeFor(evidenceTypeCode)` — `business_income` → `"business"`, 그 밖 `"other"`.
3. `resolveAppliedRate(rule, dates)` — 규칙이 읽는 **세율 키 하나**를 같은 기준일로 조회해 `{ key, rate, historizedId: string | null, effectiveFrom: string | null }`를 돌려준다. 레지스트리에 덧붙이는 읽기 함수 `getSettingEntry(def, {asOf})`(기존 `findEffectiveValue`가 행 전체를 돌려준다 — [VERIFIED: repositories/settings.ts:41-54] `select()` 전체 열) — 행이 없으면 `historizedId: null` + 기본값. 회사 대납은 `method`도 함께 담는다.
4. `computeExpenseTax(doc, deps)` = 1 · 2 · 3 + `applyTaxRule()` **한 번** → `{ ruleKind, rate, historizedId, method?, basisDate, vatKrw, withholdingKrw, companyBorneKrw, payableKrw }`.
5. `taxLineText(result, money)` — UI S5 문자열(`부가세 10% 1,240,000 · 지급 총액 13,640,000 · 세금계산서 규칙`). 같은 함수가 폼 · 문서 · 결재 시트 · 06 S4 문자열을 만든다.
6. `taxDriftText(stored, recomputed)` — 저장값 ≠ 지금 기준 재계산이면 `세율 바뀜 · 부가세 10% → 12% · 지급 총액 13,640,000 → 13,888,000`, 같으면 null.

**제출 때 저장**(UI S5): 규칙 종류 · 세율(numeric) · 세율 행 id(null 허용) · 회사 대납 방식 · 기준일 · 세액 셋 · 지급 총액 · 원화 환산액. 제출 뒤 화면은 저장값을 보인다. 세금 계산은 **트랜잭션 전**(준비 단계)에 한다 — 트랜잭션 안에서 설정 풀 읽기 금지(ARCHITECTURE §4-8 (3)).

**Deferred 두 건 — 권고:**

- **회사 대납 기본값(8.8% flat vs D-1105 22% gross-up):** `applyTaxRule`은 둘 다 계산하므로 새 계산 없이 **설정 기본값 두 개만** 바꾸면 D-1105와 맞는다. 권고 = Phase 5 한 플랜의 한 작업으로 `TAX_COMPANY_BORNE_RATE.default` 0.088 → 0.22, `TAX_COMPANY_BORNE_METHOD.default` `"flat"` → `"gross_up"`(D-1105 「사용자 확정 — 회사가 이미 경품에 22% 역산을 적용」). **D-1105의 「시가 5만원 이하 면제」는 `company_borne` 갈래에 없는 새 계산이라 Phase 11(CERT-04)에 남긴다** — Phase 5 플랜과 Phase 11 CONTEXT에 한 줄씩 남긴다. [ASSUMED — 계획 확인 checkpoint 한 번: 기본값 변경을 Phase 5에서 할지, Phase 11까지 8.8%로 둘지. 어느 쪽이든 화면은 서버 값을 쓴다(UI Assumptions #14)]
- **D-607(카드 사용은 합계 입력 → 역산):** Phase 5에는 카드 사용이 없다. 문구 정렬은 06-01 플랜이 이미 맡았다(ROADMAP 06-01 「D-607/R-9 요구사항·ROADMAP 문구 정렬」). Phase 5는 **`computeExpenseTax`의 입력을 공급가액(KRW)으로 고정**해 Phase 6 카드 경로가 `grossFromTotal()`로 공급가를 역산한 뒤 같은 함수를 부르게만 하면 된다. Phase 5에서 EXP-15 문구를 고치지 않는다.

### Pattern 3: 지출결의 문서 모델 · 1줄 1문서 · 회차 · idempotency · 잠금 순서

**권하는 표 `expenses`**(열 이름은 계획이 정하되 모양은 이것 — 기존 관례: snake_case, 무 tz `timestamp`, `moneyColumns()` [VERIFIED: db/schema/money-columns.ts:53-60], 문자열 상태 열에 `check()` [VERIFIED: db/schema/quote-lines.ts:49 선례]):

| 열 | 뜻 |
|---|---|
| `id` uuid · `drafter_id` text FK users | |
| `number` text null UNIQUE | 제출 때 부여, 반려 · 회수 뒤에도 유지(다시 제출 = 같은 번호) |
| `project_id` uuid null · `quote_line_id` uuid null FK | 견적 줄 문서 |
| `team_expense_kind` text null CHECK ∈ 두 값 · `usage_date` date null · `content` text null · `attributed_team_id` uuid null | 팀 비용 문서(값 문자열은 계획 — `미수주 비용`·`팀 관리비`, [ASSUMED] `lost_bid`·`team_overhead`) |
| `vendor_id` uuid null · `evidence_type` text null(코드 값, FK 없음 — `vendors.default_evidence_type`과 같은 관례 [VERIFIED: db/schema/vendors.ts:17-19]) · `payment_method` text null(코드 값) | |
| `...moneyColumns("supply")` | 공급가액 — 통화 · 외화 · 환율 · 원화 |
| `installment` boolean · `installment_seq` int null | 분할 지급 · 회차 |
| `scheduled_payment_date` date null · `note` text null | UA-617 |
| 세금 스냅숏 열(Pattern 2 목록) | 제출 때만 채움 |
| `idempotency_key` text UNIQUE | `/expenses/new` 첫 저장의 클라이언트 키 |
| `submitted_at` · `version` int 기본 1 · `deleted_at` · `deleted_by` · `created_at` · `updated_at` | 작성 중 삭제는 소프트(토스트 `되돌리기`) |

- **DB 제약:** CHECK `number IS NULL OR supply_amount_krw > 0`(EXP-14 — 작성 중은 빈 금액 허용). **부분 UNIQUE `(quote_line_id, drafter_id) WHERE number IS NULL AND deleted_at IS NULL`** — 「같은 줄에서 두 번 눌러도 작성 중 문서 하나」(UI Assumptions #1)를 DB가 최종 판정한다. 생성은 `INSERT … ON CONFLICT DO NOTHING RETURNING` → 비면 기존 행 SELECT. 여러 줄 `Ctrl+E`도 줄마다 같은 경로.
- **줄의 문(open/closed) 판정 `line-door.ts`**(S1 · S2 · S14 · 게이트 ④가 같은 함수): `line_kind = 'quote'` · 취소 아님 · 거래처 있음 · 그리고 (번호 있는 문서 0개 또는 모두 `installment` · 남은 실행가 > 0). 「번호 있는 문서」 = 제출된 적이 있는 문서(결재 중 · 승인 · 반려 · 회수 — UI Assumptions #3). 06-02의 `resolveLineDoor`(구매 요청/지출결의 문 — 온라인구매 협력사)는 다른 축이다 — 이름이 겹치지 않게 Phase 5 함수는 `expenseLineDoor`로.
- **회차 상한:** 줄의 번호 있는 문서 공급가액 합(자기 자신 제외) + 이번 ≤ 실행가(UI Assumptions #2 — 분할이든 아니든). 합 · 차이는 `domain/money`의 `sumKrw` · `diffKrw`로 — **06-02가 계획한 이름 그대로**(「`sumKrw(values)` · `diffKrw(a, b)`가 `domain/money`에 있고(원 정수, 부호 유지, 빈 배열 합 0)」 [CITED: 06-02-PLAN.md:32]) Phase 5가 먼저 만들고 06-02는 그 작업을 건너뛴다. 외화 줄 비교 통화는 Open Question 4.
- **잠금 순서(제출):** ARCHITECTURE §4-8 (2) 「프로젝트를 바꾸는 쓰기 트랜잭션은 첫 단계에서 프로젝트 행을 잠근다」에 따라 견적 줄 문서 제출은 **프로젝트 행 → 지출결의 행(`FOR UPDATE` + version) → (다시 제출이면) 결재 인스턴스 → `document_counters`(마지막 쓰기)**. 같은 프로젝트의 동시 제출 · 견적 저장(D-66 판정)이 프로젝트 행에서 줄을 서므로 「두 사람이 같은 비분할 줄을 동시에 제출」도 한 쪽만 통과한다. 팀 비용 문서는 프로젝트 잠금 없음.
- **작성 중 문서는 D-66 잠금 · 파생 상태 · 06 이중 연결에 들지 않는다**(UI Assumptions #3).
- **팀 비용:** `attributed_team_id = teamAtDate(drafter, usage_date)` [VERIFIED: domain/org/index.ts:190-205 — `teamAtDate(viewer, userId, date, deps?) → TeamDto | null`]. null이면 칸 오류 `사용일에 소속 팀 없음 · 사용일 고치기`. 저장 시점에 계산해 열로 고정(조직 개편이 과거 귀속을 바꾸지 않는다 — 입력 §7).

### Pattern 4: 문서 번호

현재 코드 [VERIFIED: domain/document-numbering/index.ts, repositories/document-counters.ts:47-67]: `allocateDocumentNumber(viewer, { counterKey, year, format }, tx?)`(format 필수 — 트랜잭션 전에 `loadDocumentNumberFormat(counterKey)`로 읽어 넘김, 풀 소진 교착 방지 주석), `allocateNumber`는 `INSERT … ON CONFLICT DO NOTHING` + `UPDATE … SET value = value + 1 RETURNING`. 서식 함수 `documentNumberFormat`은 `{prefix}{연도}{구분자}{순번}` 한 꼴뿐이다.

- 지출결의 번호 `26001-0004`는 **연도가 아니라 프로젝트 번호 + 프로젝트별 순번**이라 기존 서식 함수와 꼴이 다르다. 권고: `counterKey = "expense"`, **`period = 프로젝트 번호`**(ARCHITECTURE §4-6 「period는 서기 연도」 규약의 첫 예외 — §4-6에 한 줄 기록), 순수 함수 `expenseNumberFormat(projectNumber, seq, {separator, seqDigits, seqStart})`, 키 `document_number.expense.{separator,seq_digits,seq_start}`(기본 `-` · 4 · 1). [ASSUMED]
- 팀 비용 번호: 기존 서식 함수 그대로 `counterKey = "expense_team"`, `period = 연도`, 키 `document_number.expense_team.*` 다섯(예 기본 접두어 `TE` → `TE26-0001`). [ASSUMED — UI-SPEC은 「계획이 `document_number.*`로 정한다」]
- 정산 결재: 프로젝트당 하나라 **새 카운터 없이 프로젝트 번호를 식별자로** 쓰는 것이 가장 단순하다(머리 줄 `{번호}` = `26001`). [ASSUMED]
- 04.1-01은 `loadDocumentNumberFormat`에 `export`를 붙이고 `format`을 선택 인자로 만든다고 계획했지만 main은 **이미** export · 필수다 — 04.1-07 병합 때 정리될 문제이고 Phase 5는 main 모양(필수 `format`)을 가정한다.
- 동시 제출 테스트: 기존 `test/integration/document-counters-concurrency.test.ts` · `projects-create-concurrency.test.ts`(풀 소진 교착 재현)의 모양을 따른다.

### Pattern 5: 증빙 업로드 경로(이 페이즈가 만들고 Phase 6이 확장)

```
브라우저                          서버(Server Action)                        저장소
───────                          ──────────────────                        ─────
파일 고름 → 이미지면 축소(최대 변 2000 JPEG, 디코딩 실패면 원본) · PDF 원본
        → SHA-256(crypto.subtle) · 크기 · 형식
        ──requestEvidenceUpload({ownerKind:'expense', ownerId, size, mime, sha256, name})──▶
                                  can + 문서 보임 + 기안자 · 문서 상태(추가 허용) 확인
                                  checkEvidenceUpload: 크기 ≤ evidence.max_size_mb · MIME 허용 목록
                                     · 같은 sha256 · 같은 owner_kind · 삭제 안 됨 → 중복 막힘
                                  upload_intents 행(object_key = 서버가 만든 `evidence/{intentId}`, 만료 15분)
                                  ObjectStorage.createSignedPut(key, {contentType, sizeRange:[1,max], meta:{sha256}}) ──▶ 서명 URL(짧은 만료)
        ◀─{intentId, url, headers}─
        ──PUT 바이트(headers 그대로: Content-Type · X-Goog-Content-Length-Range · x-goog-meta-sha256)────────────────▶ GCS/로컬
        ──completeEvidenceUpload({intentId})──▶
                                  의도 = 이 viewer · 미완료 · 미만료 확인
                                  getMetadata(key): 크기 = 선언 · ≤ 한도, contentType = 선언, meta.sha256 = 선언
                                  withTransaction: files 행 INSERT + 의도 completed + (제출 뒤면) bumpInstanceVersion(E4) + 행동 로그
        ◀─파일 행 DTO─
```

- **표:** `files`(id · `owner_kind` text CHECK ∈ {'expense'} — Phase 6이 값을 더한다 · `owner_id` uuid · `object_key` UNIQUE · `sha256` char(64) · `size_bytes` · `content_type` · `original_name` · `uploaded_by` · `created_at` · `removed_at` · `removed_by`, 인덱스 `(owner_kind, owner_id)` · `(sha256)`), `upload_intents`(id · owner · object_key · 선언 값 · `created_by` · `expires_at` · `completed_at`). 06-11 계획은 「중복 조회는 Phase 5 파일 리포지토리(가칭 `repositories/files.ts`)의 함수 하나이고 `ownerKinds` 목록만 받는다」 [CITED: 06-11-PLAN.md:40] · 중복 범위 = 같은 종류 주인끼리(지출결의↔지출결의) — 이 모양과 맞춘다(`findActiveBySha(viewer, sha256, ownerKinds)`).
- **설정 키:** `evidence.max_size_mb`(number, 기본 10, namespace `증빙`, 라벨 `증빙 크기 한도`) — **06-02가 계획한 키 이름과 똑같이** 이 페이즈가 등록한다(UI-SPEC UA-614). 06-02 목록은 넷 → 셋.
- **MIME 허용 목록:** `image/jpeg` · `image/png` · `image/webp` · `image/heic` · `image/heif` · `application/pdf`. HEIC는 크롬에서 `createImageBitmap` 디코딩이 안 될 수 있어 원본(한도 안)으로 올린다. [ASSUMED]
- **SHA-256은 클라이언트 선언값**이다 — 서버는 GCS 메타데이터(크기 · 형식 · 서명에 묶인 `x-goog-meta-sha256`)만 재확인하고 바이트를 내려받지 않는다(ROADMAP 「GCS 메타데이터를 재확인」). 거짓 해시는 중복 감지를 피할 뿐이라 영향이 낮다(Security 절).
- **`ObjectStorage` 인터페이스**(`lib/gcp/storage.ts`): `createSignedPut(key, opts)` · `createSignedGet(key, {expiresSec, disposition})` · `getMetadata(key)` · `delete(key)`. 드라이버 둘:
  - `gcs` — V4 서명 URL. 서명 문자열은 `GoogleAuth.sign(stringToSign)`(Cloud Run 런타임 SA는 개인 키가 없어 IAM `signBlob` 호출 — [VERIFIED: googleauth.js:883-903] `if (client instanceof jwtclient_1.JWT && client.key) { … crypto.sign … } … return this.signBlob(crypto, creds.client_email, data, endpoint);`). 메타데이터는 `auth.request({url: https://storage.googleapis.com/storage/v1/b/{bucket}/o/{key}})`. V4 알고리즘 세부는 [ASSUMED — 공식 문서 도메인이 이 세션에서 막혀 확인 못 함] → 단위 테스트는 로컬 생성 RSA 키로 서명 · 검증(배관 확인)만 하고, **실제 GCS 수락은 staging 스모크 `checkpoint:human-verify`**로 확인한다.
  - `local` — `app/api/storage-local/[...key]/route.ts`(PUT · GET)가 `.data/uploads/`(gitignore)에 쓴다. URL에 HMAC(기존 `BETTER_AUTH_SECRET` 파생 — 새 비밀 없음) · 만료 · 크기 범위를 싣고 GCS와 같은 규칙으로 거부. `STORAGE_DRIVER=local`이 아니면 404, 그리고 `lib/env.ts` refine이 `APP_ENV !== 'local'`에서 `STORAGE_DRIVER=local`을 거부(프로덕션에 로컬 드라이버가 켜지지 않게). 통합 테스트는 `deps.storage`로 메모리 가짜 주입.
- **인프라(이 페이즈 소관 — 지금 없음):** 버킷 `plant8-{env}-evidence`(서울 `asia-northeast3`, 균일 버킷 수준 접근, 공개 접근 방지 강제), CORS(`PUT` · `GET` · 원본 = 서비스 URL · 헤더 `Content-Type`, `X-Goog-Content-Length-Range`, `x-goog-meta-sha256`), 런타임 SA에 버킷 범위 객체 쓰기 · 읽기 역할과 **자기 자신에 대한 `roles/iam.serviceAccountTokenCreator`**(signBlob), 환경 변수 `STORAGE_DRIVER=gcs` · `GCS_EVIDENCE_BUCKET`. 추가할 곳: `infra/names.sh`(이름 함수) · `scripts/bootstrap-gcp.sh`(역할 루프 — [VERIFIED: bootstrap-gcp.sh:124-131] 지금 런타임 SA 역할은 `cloudsql.client cloudsql.instanceUser cloudsql.viewer logging.logWriter monitoring.metricWriter`) · `scripts/deploy.sh`의 `env_vars`(440행) · `scripts/verify-gcp.sh`. `X-Goog-Content-Length-Range`를 서명 헤더에 넣으면 PUT 요청이 같은 값을 보내야 하고 CORS에 그 헤더를 허용해야 한다 [CITED: WebSearch 결과 — docs.cloud.google.com/storage/docs/xml-api/reference-headers, blog.koliseo.com 요약].
- **보기:** `크게 보기` = 권한 판정 뒤 서버가 만드는 서명 GET(5분). 썸네일 48 · 72×96도 같은 URL(축소본이 이미 2000px JPEG). URL을 DB에 저장하지 않는다.
- **고아:** 의도만 있고 완료 없는 객체 청소 절차는 Phase 6 F8(`docs/OPERATIONS.md`) — Phase 5는 `upload_intents`가 그 쿼리의 재료임을 SUMMARY에 적는다.

### Pattern 6: 견적 줄 연결 — Phase 4가 비워 둔 함수 하나 채우기

[VERIFIED: domain/quotes/lines.ts:242-253]

```typescript
// D-66 — 줄마다 연결된 지출결의(번호). 이 페이즈에는 지출결의가 없어 빈 결과다 — Phase 5가 이 함수만 채운다.
// 저장 트랜잭션 안에서도 불리므로 tx를 받는다.
export type LinkedDocumentsByLine = Map<string, { number: string }[]>;
export function linkedDocumentsByLine(viewer: Viewer, revisionId: string, tx?: DbOrTx): Promise<LinkedDocumentsByLine> {
```

- 채우는 법: 그 프로젝트의 모든 차수 줄(계보) + **번호 있는** 지출결의를 리포지토리 한 쿼리로 읽어 `resolveLinkedDocumentsByLineage(lines, docsByLineId).byCurrentLine`에 넘긴다. `domain/quotes`가 `domain/expenses`를 import하면 순환 위험이 있으니 **리포지토리 함수(`repositories/expenses.ts`)를 직접** 부른다(`test/unit/import-cycles.test.ts`가 검사).
- 이 함수 하나로 D-66 금액 셀 읽기 전용 · 이유 문구 `지출결의 26001-0004 연결됨 · 고치려면 새 차수` · `quote.approval-toggle`의 `hasLinkedDocuments`(고객 승인 끄기 막힘)가 동시에 켜진다 — **Phase 4 통합 테스트(`quote-approved-lock` · `quote-lines-conflict` 등)가 실데이터로 다시 돌므로 회귀 확인 대상**.
- 파생 상태(UI Color 표): 한 값 규칙 `취소 > 반려 > 지출결의 중 > 미착수` — 같은 쿼리 결과에 인스턴스 상태를 붙여 계산. 표시 매핑은 Phase 4 `status-display.ts`.

### Pattern 7: 정산 결재(D-98) — 호출자 교체

현재 코드:
- 전이 표 [VERIFIED: domain/projects/status-transitions.ts:5, 16-21]: `PROJECT_STATUSES = ["bidding", "in_progress", "settling", "completed", "lost"]`, `{ from: "settling", to: "completed", menu: "projects.complete" }`.
- `changeProjectStatus(viewer, projectId, {from, to}, deps?)`의 deps에 이미 `tx: DbOrTx`(주석 「바깥 트랜잭션(Phase 5 결재) — 있으면 그 안에서 돈다」) · `facts: StatusChangeFacts` · `afterLock` [VERIFIED: domain/projects/status.ts:255-262]. 안에서 `loadProjectForGate`로 프로젝트 행을 잠그고 `row.status !== input.from`이면 `StatusChangedError`, 로그는 `detail: { from, to, trigger: "manual" }`로 고정.
- 호출자: `app/(app)/projects/actions.ts:233` `changeProjectStatusAction` · 화면 `statusDestinations`(`app/(app)/projects/[id]/page.tsx:115`). 메뉴 주석 「"projects.complete"(대표 — Phase 5에서 결재 승인이 호출자가 된다)」 [VERIFIED: domain/permissions/menus.ts:20-24].

**권하는 변경:**
1. 정산 결재 종류 등록(`settlement`, 결재선 17키 기본 1~3단 꺼짐 · 4단 대표 × 전사 · 자기 승인 `self_approve`).
2. `settlement_approvals`(id · `project_id` UNIQUE · `drafter_id` · timestamps). 기안 = 담당 PM + 프로젝트 `settling` + 미저장 편집 없음(화면). 다시 올리기 = 같은 문서 다음 차수(E1).
3. 최종 승인 훅(E2): `prepareFinalApproval` = `loadStatusChangeFacts(대표)`(트랜잭션 전), `onFinalApprovalInTx` = `changeProjectStatus(대표, projectId, {from:"settling", to:"completed"}, { tx, facts })`. 프로젝트가 `in_progress`로 돌아갔으면(D-80) `StatusChangedError` → 승인 전체 롤백.
4. **사람의 직접 완료 경로를 닫는다:** 전이 표 항목에 `via: "approval"` 표시(데이터 한 칸)를 더하고 `statusDestinations`는 이 전이를 내보내지 않으며 `changeProjectStatusAction`은 `via: "approval"` 전이를 거부한다. 결재 훅은 도메인 함수를 직접 부르므로 통과. 로그 `trigger`를 `"approval"`로 남기려면 `changeProjectStatus`에 선택 입력 하나(`trigger?`)가 필요하다 — Open Question 5.
5. UI Assumptions #17 「긴급 탈출구가 필요하면 설정 키로」 — 이 연구는 만들지 않기를 권한다(요청받지 않은 유연성, CLAUDE.md §3.2).

**잠금 순서 주의:** 정산 결재 승인 = 인스턴스 UPDATE → 프로젝트 행(훅). 지출결의 제출 = 프로젝트 행 → 지출결의 → 인스턴스(다른 인스턴스 행). 같은 인스턴스를 두 순서로 잡는 경로는 **정산 결재 다시 올리기가 프로젝트 행을 잠글 때** 생긴다 → 다시 올리기는 프로젝트 행을 `FOR UPDATE`로 잡지 말고 상태만 tx로 읽는다(최종 판정은 승인 훅이 잠금 안에서 다시 한다).

### Pattern 8: 제출 막힘 게이트 `expense.submit`

기존 규칙 문자열을 그대로 재사용 [VERIFIED: domain/rules/register.ts:209-226, 262-267]: `quote.customer-approval` → `` `${ctx.revisionSeq}차 고객 승인 전 · ${next}` ``(`next` = `고객 승인 표시` 또는 `` `담당 PM ${ctx.pmName}` ``), 면제 상태 `CUSTOMER_APPROVAL_EXEMPT_STATUSES = ["bidding", "lost"]`, 설정 `project.customer_approval_gate` 끄면 통과. `quote.vendor-required` → `거래처 없음 · 거래처 고르기`.

- 새 규칙 하나 `expense.submit`(`domain/rules/register.ts`에 등록, ctx는 `domain/expenses/gate.ts`가 조립)이 UI S6 순서 ①~⑨의 **첫 이유 + 다음 한 수 대상 칸**을 돌려준다. ①은 `gate(doc, "quote.customer-approval", ctx)`의 결과 문자열, ⑤는 `quote.vendor-required` 결과 그대로. 게이트 반환형 `GateDecision`은 `{allowed:false; reason}`뿐이라 **다음 한 수 대상(칸 id)은 ctx 조립 쪽이 같은 순서로 따로** 돌려준다(게이트 계약을 바꾸지 않는다).
- 설정 `PROJECT_CUSTOMER_APPROVAL_GATE`에는 `readBy: { phase: "5" }`가 달려 있다 [VERIFIED: domain/settings/keys.ts:239-248] — 이 페이즈가 읽기 시작하면 **`readBy`를 지워야** `test/unit/settings/registry-coverage.test.ts`의 「readBy 표시가 남은 키는 아직 settings 밖에서 읽히지 않는다」가 통과한다.
- 폼 미리보기 · 제출 액션 둘 다 같은 규칙. 제출 트랜잭션 안에서는 **tx로 읽은 사실**(현재 차수 · 줄 존재 · 줄 문 · 회차 합 · 증빙 수)로 다시 판정한다(설정 값은 트랜잭션 전).

### Anti-Patterns to Avoid

- **엔진에 문서 종류 이름 분기(`if (kind === "expense")`):** 04.1 금지 항목. 종류 차이는 전부 등록 필드(E1~E5)로.
- **`expenses.status` 복사 열:** 결재 상태 정본이 둘이 된다. 인스턴스에서 파생.
- **트랜잭션 안에서 `applyTaxRule`/`getSettingValue`/`teamAtDate`/`can` 호출:** 풀 소진 교착(§4-8 (3), `projects-create-concurrency` 선례). 준비 단계로.
- **브라우저가 보낸 세액 · 지급 총액 · 원화 환산액 저장:** 서버가 다시 계산한 값만 저장(06-03과 같은 원칙).
- **클라이언트가 정한 객체 키 · 버킷 경로:** 서버가 `evidence/{intentId}`로 만든다.
- **작성 중 문서에 인스턴스 `draft` 행 만들기:** 04.1은 제출 때 인스턴스를 만든다. 작성 중을 인스턴스로 표현하면 결재함 · 관련자 판정이 흔들린다.
- **증빙 변경 뒤 결재자 승인 허용:** E4 없이 가면 결재자가 보지 못한 증빙으로 승인된다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 세금 · 반올림 | 세액 식 | `applyTaxRule()` · `round()` | ROADMAP 기준 7 · Issue 8 |
| 원화 환산 · 외화 정밀도 | 곱셈 | `moneyToColumns` · `normalizeMoneyInput` · `toKrw` | BigInt 경계 · 정밀도 거부(domain/money/index.ts:54-125) |
| 합계 · 차이 | 인라인 `+`/`-` | `sumKrw` · `diffKrw`(06-02와 같은 이름으로 이 페이즈가 추가) | 금액 산술 한 모듈 |
| 문서 번호 | 새 카운터 | `allocateDocumentNumber` + `document_counters` | 행 잠금 · 결번 규약 검증됨 |
| 결재 흐름 · 잠금 | 지출결의 전용 상태 기계 | 04.1 `domain/approvals` + E1~E7 | 기준 6 「하드코딩 없이」 |
| 사용일 소속 팀 | 발령 쿼리 | `teamAtDate()` | ARCHITECTURE §4-3 |
| 프로젝트 완료 | 상태 UPDATE | `changeProjectStatus(deps.tx)` | D-79 |
| D-66 · 계보 | 줄별 쿼리 | `linkedDocumentsByLine` + `resolveLinkedDocumentsByLineage` | Phase 4가 비워 둔 한 함수 |
| 막힘 판정 | 화면 조건문 | `domain/rules.gate` | UX-06 · Issue 9 |
| 트랜잭션 · 잠금 대기 | `db.transaction` 직접 | `withTransaction` | `lock_timeout 5s` · 오류 변환 |
| 이미지 축소 | 서버 라이브러리 · npm 패키지 | 브라우저 `canvas` | 「서버 이미지 라이브러리 없음」 |
| GCS 인증 · 토큰 · signBlob | 토큰 요청 코드 | `google-auth-library` `GoogleAuth` | 이미 의존성, ADC · 메타데이터 서버 처리 |

**Key insight:** 이 페이즈의 새 코드는 「사실 모으기 + 저장 + 표시」다. 판정 · 계산 · 번호 · 결재는 전부 이미 있거나 04.1이 만든다. 새로 쓰는 위험한 코드는 V4 서명 문자열 조립 하나뿐이고, 그래서 staging 실측 checkpoint가 필요하다.

## Runtime State Inventory

> 이 페이즈는 이름 바꾸기 페이즈가 아니다. 다만 「정산 → 완료」의 호출자를 바꾸고 문서 문구를 정렬하므로 해당 범주만 적는다.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 정산 상태 프로젝트가 로컬 · 테스트 DB에 있을 수 있음(데모 데이터 `source` 기본 `"demo"`) — 직접 완료 경로가 닫히면 결재 문서 없이는 완료할 수 없다 | 없음(데이터 이전 불필요 — 정산 결재를 올리면 된다). 운영 DB에는 아직 실데이터 없음(Phase 8 전환 전) [ASSUMED] |
| Live service config | GCS 버킷 · CORS · IAM이 회사 GCP에 없다 | `bootstrap-gcp.sh`/`deploy.sh` 수정 + staging 적용(사람 checkpoint) |
| OS-registered state | 없음 — 이 페이즈는 Cloud Scheduler 작업을 더하지 않는다 | 없음 |
| Secrets/env vars | 새 비밀 없음. 새 환경 변수 `STORAGE_DRIVER` · `GCS_EVIDENCE_BUCKET`(비밀 아님) | `lib/env.ts` 스키마 · `.env.example` · `deploy.sh env_vars` |
| Build artifacts | 없음 | 없음 |
| 문서 문구(D-98) | 「경영관리 기안」: `.planning/ROADMAP.md:601`(Phase 5 기준 6) · `:744`(Phase 9 기준 5) · `.planning/REQUIREMENTS.md:67`(PNL-06) · `.planning/STATE.md:122`(CEO D3 기록) · `.planning/PROJECT.md:151` · `docs/inputs/phase-05-approval.md:45, :101`(입력 기록) | ROADMAP · REQUIREMENTS 셋은 `gsd_run`으로 「PM 기안 → 대표 승인(D-98)」으로 고친다. STATE · PROJECT의 D3 기록은 덮어쓰지 말고 「D-98로 기안자 PM」 대체 표기를 `gsd_run`으로 덧붙인다. `docs/inputs`는 입력 기록이라 그대로(CONTEXT canonical_refs가 대체를 명시) |
| 문서 범위 문구 | ROADMAP Phase 5 제목 「지출결의·결재·연차」 · Goal의 연차 문구 · 개요 32행 「같은 결재 모듈로 연차·정산 결재」 · 기준 5(연차)는 04.1 소관 | 제목 · Goal에서 연차를 04.1 참조로 바꾸는 정렬을 같은 문서 작업에 포함할지 계획이 정한다(사용자 결정 2026-09-24의 반영) |

## Common Pitfalls

### Pitfall 1: 04.1이 main에 없다 — 가정한 이름이 실제와 다름
**What goes wrong:** 04.1은 계획만 있고(7 플랜 모두 `[ ]`), 병합 직전에 마이그레이션을 다시 만든다(04.1-07). Phase 5 플랜이 `approval_instances` 열 이름 · 함수 시그니처를 계획 문서에서 베끼면 실행 때 어긋난다.
**How to avoid:** 실행 착수 게이트 한 작업: `git ls-files domain/approvals/kinds.ts domain/approvals/index.ts db/schema/approvals.ts ui/approval-route app/(app)/document-kinds.ts` 다섯 다 있어야 시작, 없으면 멈춤. 첫 플랜 read_first에 04.1 SUMMARY들. Phase 4도 42개 중 34번째 실행 중(STATE.md) — `ui/confirm-dialog`는 있지만 남은 Phase 4 플랜(상태 · 견적 표 · 폰 시트 파일)이 이 페이즈가 고칠 파일을 바꿀 수 있어 같은 게이트에 「Phase 4 머지 완료」를 건다.
**Warning signs:** 계획 파일 경로가 `git ls-files`에 없음.

### Pitfall 2: 트랜잭션 안에서 풀 읽기 → 동시 제출 교착
**What goes wrong:** 제출 트랜잭션 안에서 세금 · 설정 · 결재선 · 조직 스냅숏을 읽으면 풀 5에서 동시 제출이 멈춘다(`projects-create-concurrency` · 04.1 CEO-2가 이미 겪음).
**How to avoid:** 준비(트랜잭션 전) → 트랜잭션(tx 리포지토리만). 동시 제출 6건 통합 테스트 + 콜백 안 호출 목록을 SUMMARY 표로.

### Pitfall 3: `readBy` 표시를 안 지움 / 06과 같은 키를 두 번 등록
**What goes wrong:** `project.customer_approval_gate`를 읽으면서 `readBy: { phase: "5" }`를 두면 registry-coverage 단위 테스트가 실패. 06-02가 `evidence.max_size_mb`를 다시 등록하면 설정 키 중복.
**How to avoid:** 읽는 플랜이 `readBy`를 지운다. `evidence.max_size_mb`는 이 페이즈가 등록하고 06 M-9 게이트 목록(UA-614)에 「06-02 넷 → 셋」.

### Pitfall 4: 사업소득 원천징수가 8.8%로 계산됨
**What goes wrong:** `applyTaxRule`의 `incomeType` 기본값이 `"other"`라 `business_income` 증빙이 기타소득 세율로 계산된다.
**How to avoid:** `incomeTypeFor` + 단위 테스트(사업소득 1,000,000 → 원천징수 33,000). 06-03이 같은 함수를 가져다 쓴다.

### Pitfall 5: 증빙이 바뀐 뒤의 승인
**What goes wrong:** 기안자가 제출 뒤 파일을 떼거나 더했는데 먼저 문서를 연 결재자의 승인이 통과.
**How to avoid:** E4 — 파일 추가 · 삭제 트랜잭션이 인스턴스 version을 올린다. 통합 테스트 두 순서(증빙 추가 먼저 → 승인 거부 `…증빙을 더함 · 새로 고침` / 승인 먼저 → 증빙 추가는 성공하되 결재 결과 불변).

### Pitfall 6: 1줄 1문서 경합이 애플리케이션 판정만으로 막힘
**What goes wrong:** 「그 줄에 제출 문서가 없는지」를 SELECT로 보고 INSERT하면 두 제출이 동시에 통과.
**How to avoid:** 제출은 프로젝트 행 잠금 안에서 판정(§4-8 (2)). 작성 중 문서 생성은 부분 UNIQUE가 판정. 경합 테스트는 `deps.afterLock` + `test/integration/lock-race.ts`(sleep 금지, §4-8 (5)).

### Pitfall 7: `linkedDocumentsByLine`를 채우자 Phase 4 테스트가 실데이터로 바뀜
**What goes wrong:** 지금까지 빈 결과를 가정한 Phase 4 테스트 · 화면(D-66 셀 편집 · 고객 승인 끄기)이 지출결의 픽스처가 생기면 다르게 동작.
**How to avoid:** 이 함수를 채우는 플랜이 Phase 4 통합 · E2E 묶음(`quote-*` · `ledger-*`)을 같은 플랜의 검증 명령에 넣는다.

### Pitfall 8: 로컬 저장소 드라이버가 운영에 켜짐
**What goes wrong:** `app/api/storage-local` 라우트가 프로덕션에 살아 있으면 인증 없는 쓰기 창구가 된다.
**How to avoid:** 라우트 첫 줄에서 `env.STORAGE_DRIVER !== "local"`이면 404 + `lib/env.ts` refine(`APP_ENV !== "local"`이면 `STORAGE_DRIVER=local` 거부) + 단위 테스트 둘.

### Pitfall 9: 정산 직접 완료 버튼이 남음
**What goes wrong:** 결재 경로를 만들고도 `changeProjectStatusAction`이 `settling → completed`를 계속 받으면 D-79 「완료는 결재로만」이 깨진다.
**How to avoid:** Pattern 7 ④ + 통합 테스트 「대표가 액션으로 직접 완료 → 거부」 + 기존 `project-status.test.ts` · `project-lifecycle.spec.ts`의 직접 완료 사례를 결재 경로로 바꾼다.

### Pitfall 10: 마이그레이션 번호 충돌
**What goes wrong:** 04.1 · Phase 4 · Phase 5 · Phase 6 브랜치가 모두 마이그레이션을 만든다.
**How to avoid:** 04.1-07과 같은 규칙(ROADMAP 04.1 절): 브랜치에서는 `pnpm db:generate` 번호 그대로, 병합 직전 `origin/main` 병합 → 자기 마이그레이션 삭제 → `pnpm db:generate` 재생성. 가드 = `test/integration/migration-upgrade.test.ts`(journal).

## Code Examples

### 문서 번호 — 트랜잭션 전 서식, 트랜잭션 안 증가(기존)
```typescript
// Source: domain/document-numbering/index.ts (main, 이 세션 Read)
// `format`은 호출자가 **트랜잭션을 열기 전에** loadDocumentNumberFormat으로
// 미리 읽어 넘긴다 — … 풀 소진 교착 …
export async function allocateDocumentNumber(
  viewer: Viewer,
  input: { counterKey: string; year: number; format: DocumentNumberFormat },
  tx?: DbOrTx,
): Promise<{ number: string; seq: number }> {
```

### 바깥 트랜잭션에서 프로젝트 전환(기존 — 정산 결재 훅이 부른다)
```typescript
// Source: domain/projects/status.ts:255-262 (main, 이 세션 Read)
export type ChangeProjectStatusDeps = StatusChangeFactDeps & {
  // 바깥 트랜잭션(Phase 5 결재) — 있으면 그 안에서 돈다.
  tx: DbOrTx;
  facts: StatusChangeFacts;
  // 테스트 전용 주입 지점 — 잠금 획득 직후 호출(경합 재현, sleep 없이).
  afterLock: () => Promise<void>;
  recordAction: typeof defaultRecordAction;
};
```

### 제출 흐름 뼈대(권고 — 이름은 04.1 머지 뒤 확정)
```typescript
// [ASSUMED] 모양 예시. 04.1 함수 이름(prepareSubmission · submitDocument · resubmitDocument)은 04.1-01/02 계획 원문.
export async function submitExpense(viewer: Viewer, input: { expenseId: string; expectedVersion: number }, deps?: Partial<SubmitDeps>) {
  // ① 트랜잭션 전 읽기 — 풀 사용 가능
  const draft = await loadExpenseForDrafter(viewer, input.expenseId);          // 기안자 아니면 404
  const tax = await computeExpenseTax(draft, deps);                            // applyTaxRule 1회 + 세율 행 id
  const gateFacts = await loadSubmitGateSettings(viewer, draft);               // customer_approval_gate 등
  const prepared = await prepareSubmission(viewer, { kind: "expense", drafterId: viewer.id });
  const format = draft.projectNumber ? await loadExpenseNumberFormat() : await loadDocumentNumberFormat("expense_team");
  // ② 트랜잭션 — tx 리포지토리만
  return withTransaction(async (tx) => {
    if (draft.projectId) await lockProjectForWrite(viewer, draft.projectId, tx);
    const row = await lockExpense(viewer, input.expenseId, input.expectedVersion, tx); // version 불일치 → `14:01에 다른 곳에서 저장됨 · 새로 고침`
    const decision = await evaluateSubmitGate(row, gateFacts, tx);                      // expense.submit — 첫 이유
    if (!decision.allowed) throw new GateBlockedError(decision.reason);
    await saveTaxSnapshot(viewer, row.id, tax, tx);
    if (row.instanceId) await resubmitDocument(viewer, prepared, { instanceId: row.instanceId, expectedVersion: row.instanceVersion }, tx);
    else await submitDocument(viewer, prepared, { documentId: row.id }, tx);
    if (!row.number) await assignNumber(viewer, row, format, tx);                       // 마지막 쓰기 — 카운터 잠금 최소
  });
}
```

### 결재 종류 등록(권고)
```typescript
// [ASSUMED] 04.1 registerDocumentKind 필드(원문) + Phase 5 선택 필드(E1~E5).
registerDocumentKind({
  kind: "settlement",
  label: "정산 결재",
  loadRouteConfig: loadSettlementRouteConfig,          // approval_route.settlement.* 17키, SELECT 한 문장
  href: (doc) => `/projects/${doc.projectId}/settlement`,
  describeDocuments: describeSettlements,
  routeSettings: SETTLEMENT_ROUTE_SETTINGS,
  canResubmit: canResubmitSettlement,                  // 프로젝트 쓰기 + 상태 settling
  resubmitFrom: ["rejected", "withdrawn"],             // E1
  prepareFinalApproval: (viewer, id) => loadSettlementCompletionFacts(viewer, id),   // E2 — 트랜잭션 전
  onFinalApprovalInTx: (viewer, id, tx, facts) =>
    changeProjectStatus(viewer, facts.projectId, { from: "settling", to: "completed" }, { tx, facts: facts.statusFacts }),
  approveBlockedReason: settlementApproveBlockedReason, // E3 — `진행으로 바뀜 · 반려`
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 정산 결재 = 경영관리 기안 | PM 기안 → 대표 승인 | D-79(Phase 4) · D-98(2026-09-24) | 문서 문구 정렬(Runtime State Inventory) |
| 결재 모듈 · 연차가 Phase 5 | Phase 04.1로 이동 | 2026-09-24 사용자 결정 | 이 페이즈는 종류 등록 + 엔진 덧붙임만 |
| 대표 · 시스템 관리자 직접 완료 | 정산 결재 최종 승인만 | 이 페이즈 | 직접 완료 액션 닫기 · 테스트 교체 |
| 회사 대납 기본 8.8% flat | 22% gross-up(D-1105, 사용자 확정) | 2026-09-24 | 기본값 두 개 변경 권고(면제 기준은 Phase 11) |
| 증빙 설정 키 넷 06 소유 | `evidence.max_size_mb`는 Phase 5 | UI-SPEC UA-614(2026-09-26) | 06-02 목록 수정 |

**Deprecated/outdated:**
- `docs/inputs/phase-05-approval.md` §8 「경영관리 기안」 — D-98로 대체.
- 05-CONTEXT 「연차 신청·승인 화면은 `/gsd-ui-phase 5`에서」 — 04.1-UI-SPEC로 대체(05-UI-SPEC 머리말).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 04.1 머지 후 함수 · 열 이름이 04.1 계획 원문과 같다 | Pattern 1 | 플랜 read_first · 코드 예시 이름 교체(게이트가 잡는다) |
| A2 | 엔진 덧붙임 E1~E5를 선택 필드 · 선택 인자로 넣어도 04.1 테스트가 그대로 통과한다 | Pattern 1 | 04.1 테스트 수정이 필요해지면 04.1 계약 변경 — 사용자 확인 |
| A3 | 지출결의 번호 카운터의 `period` = 프로젝트 번호(연도 규약의 예외) | Pattern 4 | 번호 체계 재설계 — 비용 큼(번호는 되돌리기 어렵다). 계획 checkpoint 권장 |
| A4 | 팀 비용 번호 `expense_team` 카운터 · 기본 접두어 `TE`, 정산 결재 = 프로젝트 번호 | Pattern 4 | 설정 키 · 서식만 바뀜 |
| A5 | 팀 비용 종류 코드 값 `lost_bid` · `team_overhead` | Pattern 3 | 문자열만 바뀜 |
| A6 | 회사 대납 기본값을 Phase 5에서 22% gross-up으로 바꾼다 | Pattern 2 | 경품 외 회사 대납 용도가 있으면 금액이 달라짐 — 사용자 확인 |
| A7 | MIME 허용 목록(HEIC 포함)과 HEIC 원본 업로드 | Pattern 5 | 목록 조정 |
| A8 | V4 서명 알고리즘 세부(정본 문서 미확인) | Pattern 5 | staging 스모크 실패 → 서명 코드 수정 또는 SDK 대안(승인 필요) |
| A9 | 런타임 SA가 자기 자신에 `serviceAccountTokenCreator`로 signBlob 가능, 버킷 객체 역할 이름 | Pattern 5 인프라 | IAM 설정 재시도 — 사람 checkpoint |
| A10 | SHA-256은 클라이언트 선언값으로 충분(서버 재해시 없음) | Pattern 5 · Security | 거짓 해시로 중복 감지 우회 — 영향 낮음 |
| A11 | 운영 DB에 정산 상태 실프로젝트가 없다(전환 전) | Runtime State Inventory | 있으면 결재 문서를 올리는 안내만 필요 |
| A12 | 목록 가시성: PM = 자기 문서, 팀장 = 자기 팀(새 메뉴 키 `expenses.team`), 전사 범위 계급 = 전체 | Open Question 2 | 권한 모델 변경 — 사용자 확인 |
| A13 | 06-03 `pickTaxDates` 부가세 대체는 「작성일」(D-101)로 06 쪽을 맞춘다 | Pattern 2 | 06 M-9에서 06 문서 수정 |
| A14 | `google-auth-library` 저장소 URL | Package Audit | 없음(기존 의존성) |

## Open Questions

1. **04.1 엔진 덧붙임을 누가 소유하나**
   - What we know: 04.1은 미실행 · 미머지. 덧붙임 E1~E7은 04.1 파일(`domain/approvals/*`)을 고친다.
   - What's unclear: 04.1 실행 전에 04.1 플랜에 넣을지, Phase 5 Wave 1로 둘지.
   - Recommendation: **Phase 5 Wave 1**(04.1은 이미 7 플랜 · 리뷰를 통과한 계획 — 다시 열면 리뷰 비용). 단 04.1 SUMMARY가 나온 뒤 이름을 맞춘다.

2. **지출결의 목록 가시성(PM = 자기 문서 vs 팀)**
   - What we know: `scopeFor`는 메뉴 기준 `all`/`none`뿐 [VERIFIED: domain/permissions/scope-for.ts:11 — `export type Scope = { rows: "all" | "none"; includeArchived: boolean };`]. 계급 업무 범위는 `company` · `team` 둘이고 팀장 · 기획 PM 모두 `team` [VERIFIED: domain/permissions/roles.ts:29-33]. 팀장을 가리키는 열은 `teams`에 없다. UI S8은 「PM = 자기 문서, 팀장 = 자기 팀」.
   - What's unclear: 역할 이름 하드코딩 없이 PM과 팀장을 가를 방법.
   - Recommendation: 메뉴 키 `expenses.team`(view — 「팀 지출결의 보기」)을 더해 팀장 계급에 시드, 보임 = 기안자 ∪ 결재 관련자 ∪ (`expenses.team` view ∧ 귀속 팀 = 내 팀) ∪ (업무 범위 `company` ∧ `expenses` view). 작성 중은 기안자만. 기존 세분 메뉴 선례(`projects.status` · `projects.period`)와 같은 결. 계획 checkpoint로 사용자 확인.

3. **증빙 1개 이상이 제출 조건 — 06 `evidence.required` 설정과의 관계**
   - What we know: UI Assumptions #5 — 이 페이즈는 「파일 1개 이상」, 06이 `선결제` 예외를 연다.
   - Recommendation: Phase 5 게이트 ⑧은 설정과 무관하게 고정. 06 계획이 설정으로 끌지 정한다.

4. **외화 줄의 회차 상한 비교 통화**
   - What we know: 실행가 · 지출결의 모두 금액 모델(통화 · 외화 · 환율 · 원화). 회차마다 환율이 다르면 원화 합이 실행가 원화를 넘을 수 있다.
   - Recommendation: 문서 통화 = 줄 통화면 **원 통화 금액**으로, 다르면 원화로 비교(`domain/money` 함수 하나). 계획이 확정.

5. **상태 변경 로그 `trigger` 값**
   - What we know: `changeProjectStatus`는 로그 `trigger: "manual"` 고정.
   - Recommendation: 선택 입력 `trigger?: "manual" | "approval"`(기본 manual) 한 줄 추가 — 행동 로그에서 결재 완료를 구분. 사소하지만 Phase 4 함수 변경이라 플랜에 명시.

6. **회사 대납 기본값 변경 시점(A6)** — 위 Pattern 2 권고대로 계획 checkpoint 한 번.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | 전부 | ✓ | v22.22.2 | — |
| pnpm | 전부 | ✓ | 10.33.0 | — |
| PostgreSQL(로컬, `pnpm db:dev`) | 통합 · E2E | ✓ (`psql` · `pg_isready` 있음, 스크립트가 Docker 없으면 apt Postgres) | 16 | — |
| Docker 데몬 | GCS 에뮬레이터(대안) | ✗ (`docker info` 실패 — 이 세션) | 29.3.1 CLI만 | 로컬 저장소 드라이버(권고안) |
| GCS 버킷 · IAM | 운영 업로드 | ✗ (인프라 스크립트에 없음) | — | 없음 — staging 적용 사람 checkpoint |
| `google-auth-library` | V4 서명 · 메타데이터 | ✓ | 11.1.0 | — |
| Playwright Chromium | E2E | CI에서 설치(`ci.yml` 87행) | 1.63.0 | — |

**Missing dependencies with no fallback:** 회사 GCP의 증빙 버킷 · CORS · IAM(운영 · staging 업로드). 코드는 로컬 드라이버로 완성 · 검증하고, 버킷 적용과 실제 업로드 스모크는 `checkpoint:human-verify`.
**Missing dependencies with fallback:** Docker(에뮬레이터) → 로컬 드라이버.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.1(프로젝트 `unit` · `integration`) + Playwright 1.63.0 |
| Config file | `vitest.config.ts`(integration: `fileParallelism: false`, `globalSetup` · `setupFiles`) · `playwright.config.ts`(CI에서만 프로덕션 빌드) |
| Quick run command | `pnpm vitest run --project unit test/unit/domain/expenses` |
| Full suite command | `pnpm lint && pnpm typecheck && pnpm lint:sql && flock /tmp/plant8-erp-test.lock pnpm build` → `pnpm test:unit` → `flock /tmp/plant8-erp-test.lock sh -c 'pnpm db:dev && pnpm db:reset:test && pnpm vitest run --project integration'` → `flock /tmp/plant8-erp-test.lock sh -c 'pnpm db:dev && pnpm db:reset:test && CI=true pnpm playwright test'` |

(`flock /tmp/plant8-erp-test.lock` 형식은 Phase 04.5 플랜에서 반복 쓰인 검증 명령 그대로 — grep 실측.)

### Phase Requirements → Test Map

| Req / 기준 | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| 기준 6 · E1 | `nextStep` 기본은 withdrawn 종결 그대로, 옵션일 때만 `withdrawn --resubmit--> submitted` | unit | `pnpm vitest run --project unit test/unit/domain/approvals/next-step.test.ts` | ❌(04.1이 만든다 → Phase 5가 사례 추가) |
| 기준 6 · E2 | 정산 결재 최종 승인 → 같은 tx에서 프로젝트 `completed` · 훅 실패 시 전체 롤백 · 대표 직접 완료 액션 거부 | integration | `flock … sh -c 'pnpm db:dev && pnpm db:reset:test && pnpm vitest run --project integration test/integration/settlement-approval.test.ts'` | ❌ Wave 0 |
| 기준 6 · D-80 | 결재 중 진행 복귀 ↔ 대표 승인 두 순서(`afterLock` · `lock-race.ts`) | integration | 위와 같은 파일 | ❌ |
| 기준 6 | 문서 종류 셋이 같은 엔진 경로(종류 이름 분기 0 — grep 수락 기준) | integration + grep | `test/integration/expense-approval-lifecycle.test.ts` · `grep -rn '"expense"\|"settlement"' domain/approvals` 0건 | ❌ |
| EXP-01 | 같은 줄 두 번 · 동시 두 번 생성 → 작성 중 1건 | integration | `…/expense-create-idempotency.test.ts` | ❌ |
| EXP-01 | 회차 합계 > 실행가 거부, 마지막 회차 = 남은 실행가 | unit + integration | `test/unit/domain/expenses/installment-cap.test.ts` · `…/expense-installment-cap.test.ts` | ❌ |
| 기준 1 | 동시 제출 6건(같은 프로젝트) → 서로 다른 번호 `26001-000N` · 교착 없음(풀 2) | integration | `…/expense-submit-concurrency.test.ts` | ❌ |
| 기준 1 | 같은 비분할 줄 동시 제출 2건 → 1건만 성공, 나머지 게이트 ④ | integration | 위와 같은 파일 | ❌ |
| 기준 1 | 금액 모델: 외화 문서 저장 · 목록 · 결재함에 원화 + 원 통화 | integration + e2e | `…/expense-money.test.ts` · `test/e2e/expense-list.spec.ts` | ❌ |
| EXP-14 | 0 · 음수 · 빈 금액 제출 거부(서버 + CHECK) | unit + integration | `test/unit/domain/expenses/submit-gate.test.ts` · `…/expense-submit-concurrency.test.ts` 한 사례 | ❌ |
| UX-06 | 게이트 ①~⑨ 순서 · 첫 이유 · 다음 한 수 칸 | unit | `test/unit/domain/expenses/submit-gate.test.ts` | ❌ |
| 기준 2 | 제출 시 결재선 고정, 설정 변경 뒤 진행 중 문서 불변, 본인 승인(`self_approve`) | integration | `…/expense-approval-lifecycle.test.ts` | ❌ |
| 기준 3 | 승인↔회수 · 승인↔반려 두 순서 + 증빙 추가↔승인 두 순서(E4) | integration | `…/expense-approval-concurrency.test.ts` | ❌ |
| 기준 3 · UX-03 | PM 작성 → 증빙 이미지 → 제출 → 결재자 폰(375) 결재 시트 승인 | e2e(`CI=true`) | `flock … sh -c 'pnpm db:dev && pnpm db:reset:test && CI=true pnpm playwright test test/e2e/expense-submit-mobile-approval.spec.ts'` | ❌ |
| UI 확정 #2 | 반려 · 회수 뒤 같은 번호 다시 제출(차수 2) | integration | `…/expense-approval-lifecycle.test.ts` | ❌ |
| EXP-08 · 기준 4 | 팀 비용: `teamAtDate(사용일)` 귀속 · 소속 없음 오류 · 팀장 목록 `프로젝트 미연결` | integration + e2e | `…/expense-team-attribution.test.ts` · `test/e2e/expense-list.spec.ts` | ❌ |
| EXP-15 · 기준 7 | 규칙 넷 · 기준일 사슬(D-101) · `incomeType`(사업소득 3.3%) · 종류 바꾸면 재계산 | unit | `test/unit/domain/expenses/tax.test.ts` | ❌ |
| 기준 7 | 제출 시 세율 행 id 저장, 새 이력 세율 추가 뒤 `세율 바뀜 …` 표시, 같으면 없음 | integration | `…/expense-tax-snapshot.test.ts` | ❌ |
| EVID-01 | 크기 초과 · 형식 · 같은 종류 중복(번호 노출 규칙) · 의도 만료 · 남의 의도 · 메타데이터 불일치 → 거부, 정상 → files 행 | unit + integration | `test/unit/domain/evidence/upload-checks.test.ts` · `…/evidence-upload.test.ts` | ❌ |
| EVID-01 | 로컬 드라이버 운영 차단(env refine · 라우트 404) · V4 서명 배관(로컬 RSA 키 서명 검증) | unit | `test/unit/lib/gcp/storage.test.ts` | ❌ |
| EVID-01 · UX-03 | 폰 폭에서 이미지 한 장 축소 업로드(2000px 이하 · JPEG) | e2e | `test/e2e/expense-form.spec.ts`(폰 프로젝트) | ❌ |
| 보안 | 볼 수 없는 문서 404 · 작성 중은 기안자만 · 서명 GET은 보이는 사람만 | integration | `…/expense-visibility.test.ts` | ❌ |
| D-66 | 번호 있는 문서가 연결된 줄 금액 셀 읽기 전용 · 계보(새 차수) · 작성 중은 제외 · 파생 상태 | integration | `…/linked-documents-by-line.test.ts` + 기존 `quote-*` 묶음 | ❌ |
| 기준 5(누수) | 새 DTO · 액션 등록 → 계급별 누수 스캔 | integration | `…/leak-scan.test.ts`(side-effect import 줄 추가) | ✅ 수정 |
| 마이그레이션 | journal 가드 · 업그레이드 | integration | `…/migration-upgrade.test.ts` | ✅ |
| 설정 | `readBy` 만료 · 새 키 등록 | unit | `pnpm vitest run --project unit test/unit/settings/registry-coverage.test.ts` | ✅ |
| 화면 | 폭 1280 · 1024 · 700 · 375 · 320 가로 스크롤 0 · axe 위반 0 | e2e | `test/e2e/mobile-expense-form.spec.ts` · `test/e2e/expense-a11y.spec.ts` | ❌ |

### Sampling Rate
- **Per task commit:** 해당 unit 파일 + 싼 게이트(`pnpm lint && pnpm typecheck`).
- **Per wave merge:** `pnpm lint && pnpm typecheck && pnpm lint:sql && flock /tmp/plant8-erp-test.lock pnpm build` + `pnpm test:unit` + 그 웨이브의 integration 파일들(`flock … sh -c 'pnpm db:dev && pnpm db:reset:test && pnpm vitest run --project integration <files>'`).
- **Phase gate:** 전체 unit → integration → `CI=true` E2E 한 번(CLAUDE.md §6 순서 — DOM 감사 뒤), `/gsd-verify-work` 전 초록.

### Wave 0 Gaps
- [ ] `test/integration/expense-*.test.ts` 여덟(위 표) · `evidence-upload.test.ts` · `settlement-approval.test.ts` · `linked-documents-by-line.test.ts`
- [ ] `test/unit/domain/expenses/{tax,submit-gate,installment-cap,expense-number-format}.test.ts` · `test/unit/domain/evidence/upload-checks.test.ts` · `test/unit/lib/gcp/storage.test.ts`
- [ ] `test/e2e/expense-submit-mobile-approval.spec.ts` · `expense-form.spec.ts` · `expense-list.spec.ts` · `mobile-expense-form.spec.ts` · `expense-a11y.spec.ts` · `settlement-approval.spec.ts`
- [ ] 통합 픽스처: 프로젝트(진행 · 승인 차수) + 견적 줄(거래처 있음/없음) + 결재선 담당 네 계급 + 메모리 저장소 가짜(`deps.storage`)
- [ ] E2E: `STORAGE_DRIVER=local` 을 `playwright.config.ts` webServer env에 · 작은 JPEG 픽스처 파일
- 프레임워크 설치: 없음

## Security Domain

> `security_enforcement: true`, ASVS L1, `security_block_on: high` [VERIFIED: .planning/config.json]. 이 페이즈는 파일 업로드 · 서명 URL · 결재 권한 · 금액을 다룬다 → Post-build `/cso` 필수.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | 간접 | 모든 액션 `authedActionClient`(세션 필수). 로컬 드라이버 라우트는 세션이 아니라 HMAC · 만료 URL로 보호 |
| V3 Session Management | 아니오(기존) | — |
| V4 Access Control | **예** | 문서 보임(기안자 · 결재 관련자 · 범위) 아니면 404(D-17), 작성 중은 기안자만, 행동은 04.1 후보 판정 · 기안자 판정, 파일 추가 · 삭제는 기안자 + 문서 상태, 서명 GET은 보임 판정 뒤에만 생성. 누수 스캔(DTO · 액션) |
| V5 Input Validation | **예** | zod(액션 입력), `normalizeMoneyInput`(금액 · 환율 정밀도 · 범위), 금액 > 0(서버 + DB CHECK), 반려 사유 1~500자(04.1), MIME 허용 목록 · 크기 한도(서버 검사 + 서명된 `X-Goog-Content-Length-Range` + 완료 재확인) |
| V6 Cryptography | 예(서명) | V4 서명은 `GoogleAuth.sign()`(IAM signBlob) — 키를 코드 · 저장소에 두지 않는다. 로컬 HMAC은 `node:crypto` |
| V8 Data Protection | 예 | 버킷 공개 접근 방지 · 균일 접근, URL 짧은 만료 · 저장하지 않음, 거래처 계좌는 기존 암호화 그대로(이 페이즈는 읽지 않음) |
| V12 Files and Resources | **예** | 객체 키는 서버 생성(`evidence/{intentId}` — 경로 조작 없음), 원본 파일명은 표시용 문자열로만, 제공 원점이 앱과 다른 `storage.googleapis.com`(쿠키 · XSS 격리) |
| V13 API | 예 | Server Actions 요청 크기 한도(`checkPayloadSize`) — 파일 바이트는 액션을 지나지 않는다 |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 남의 지출결의 id로 조회 · 증빙 추가 · 서명 GET 요청(IDOR) | Information Disclosure / Tampering | 모든 도메인 함수 첫 줄 보임 판정 → 404, 파일 추가는 기안자만, 통합 테스트 `expense-visibility` |
| 남의 업로드 의도 id로 완료 통보 | Spoofing | 의도 `created_by = viewer` · 미완료 · 미만료 확인, 한 번만(`completed_at`) |
| 크기 한도 우회(브라우저 검사 무시) | Tampering / DoS | 서명 URL에 크기 범위 헤더 서명 + 완료 때 메타데이터 크기 재확인 + 초과 객체 삭제 |
| 형식 위장(HTML을 image/jpeg로) | Tampering | Content-Type 서명 · 허용 목록, GCS 원점 격리로 앱 XSS 불가, 필요 시 `response-content-disposition` [ASSUMED 잔여 위험 LOW] |
| 중복 오류로 다른 문서 존재 확인 | Information Disclosure | 못 읽는 문서면 번호 없이 `이미 첨부된 파일`(UI 원문) — 해시를 알아야 하는 존재 오라클만 남음(LOW, /cso 확인) |
| 금액 · 세액 변조(브라우저 값 저장) | Tampering | 서버 재계산 값만 저장, 제출 뒤 필드 수정 불가(증빙만 — E4) |
| 중복 제출 · 이중 문서 | Repudiation / Tampering | idempotency key UNIQUE · 부분 UNIQUE · 프로젝트 행 잠금 · version |
| 승인↔회수 · 증빙 변경↔승인 경합 | Tampering | 인스턴스 version 조건 UPDATE(04.1) + E4, 두 순서 통합 테스트 |
| 로컬 저장소 라우트 운영 노출 | Elevation | env refine + 라우트 404 + 단위 테스트 |
| 서명 권한 과다(런타임 SA) | Elevation | 버킷 범위 역할만, `serviceAccountTokenCreator`는 자기 자신에게만(프로젝트 범위 아님) |
| 결재 없이 완료 | Elevation | 직접 완료 액션 거부(Pattern 7 ④) + 테스트 |

## Sources

### Primary (HIGH confidence — 이 세션에서 Read/Bash로 직접 확인)
- `domain/money/tax.ts`(전문) · `domain/money/index.ts`(전문) — 세금 · 금액 계약
- `domain/settings/keys.ts:50-330` · `domain/settings/registry.ts:60-200` · `repositories/settings.ts:41-54` · `db/schema/settings.ts` — 세율 키 · 기본값 · 이력 행 id · `readBy`
- `domain/code-tables/tax-rule.ts`(전문) · `domain/seed/index.ts:40-118` — 규칙 종류 · 시드 증빙 종류
- `domain/document-numbering/index.ts`(전문) · `repositories/document-counters.ts`(전문) — 번호
- `domain/rules/gate.ts`(전문) · `domain/rules/register.ts:205-267` — 게이트
- `domain/projects/status-transitions.ts`(전문) · `domain/projects/status.ts:255-335` · `domain/permissions/menus.ts:10-32` — 정산 → 완료
- `domain/quotes/lines.ts:240-285` · `domain/quotes/lineage.ts` — D-66 자리
- `domain/org/index.ts:185-215` · `db/schema/{money-columns,quote-lines,vendors,code-tables,org}.ts` · `domain/action-log/record.ts:10-37`
- `lib/actions/{client,registry}.ts` · `lib/db-transaction.ts` · `lib/env.ts`(grep) · `test/integration/leak-scan.test.ts:1-60` · `vitest.config.ts` · `package.json`
- `node_modules/google-auth-library/build/src/auth/googleauth.js:878-919` · `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
- `scripts/bootstrap-gcp.sh:100-140` · `scripts/deploy.sh`(grep) · `infra/names.sh` · `docs/ARCHITECTURE.md:129-215`
- `.planning/phases/05-expense-approval-leave/05-CONTEXT.md` · `05-UI-SPEC.md`(전문) · `.planning/ROADMAP.md:372-640` · `.planning/REQUIREMENTS.md`(해당 줄) · `.planning/config.json`
- 실행 확인: `docker info` 실패, `node` v22.22.2, `pnpm` 10.33.0, `npm view google-auth-library version` 11.1.0, `gsd-tools package-legitimacy check @google-cloud/storage` → SUS

### Secondary (MEDIUM confidence — 계획 문서, 코드 아님)
- `.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md`(84 · 100 · 240 · 299-309행) · `04.1-02-PLAN.md`(247 · 295-315 · 368-373행) · `04.1-05-PLAN.md`(62-64 · 174행) · `04.1-RESEARCH.md`
- `.planning/phases/06-payment-evidence-cards/06-CONTEXT.md`(D-607) · `06-RESEARCH.md` · `06-02-PLAN.md`(30-36 · 156행) · `06-03-PLAN.md`(38 · 62-65 · 140-141 · 190-205행) · `06-11-PLAN.md`(40 · 247행) · `06-UI-SPEC.md`(UA-620)
- `.planning/phases/11-other-income-certificate/11-CONTEXT.md`(D-1105) · `.planning/phases/04-project-quote-ledger/04-CONTEXT.md`(D-42~D-80) · `docs/inputs/phase-05-approval.md` · `docs/inputs/phase-03-masters.md:102`

### Tertiary (LOW confidence — 확인 못 함 · 검색 요약)
- WebSearch 「x-goog-content-length-range signed URL PUT」 요약: [HTTP headers for XML API](https://docs.cloud.google.com/storage/docs/xml-api/reference-headers) · [Signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signed-urls) · [Limit the size of files uploaded with Signed URLs](https://blog.koliseo.com/limit-the-size-of-uploaded-files-with-signed-urls-on-google-cloud-storage/) — 공식 문서 도메인은 이 세션 프록시가 막아(`EGRESS_BLOCKED`) 본문 확인 못 함
- V4 서명 알고리즘 세부 — 훈련 지식([ASSUMED]), staging 스모크로 확인

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 패키지 0, 재사용 모듈 전부 코드 확인
- 04.1 통합 계약: MEDIUM — 계획 원문 인용, main에 코드 없음
- 데이터 모델 · 잠금 순서: MEDIUM — 기존 규약(§4-8) 위 설계, 번호 `period` 예외는 사용자 확인 권장
- 세금: HIGH(계산 없음 확인) / MEDIUM(세율 버전 저장 방식 — 설계)
- 업로드: MEDIUM(흐름 · 표) / LOW(V4 서명 세부 · IAM 역할 이름)
- Pitfalls: HIGH — 대부분 이전 페이즈 실측 사고(풀 교착 · journal · readBy)

**Research date:** 2026-09-26
**Valid until:** 04.1 머지 시점(그때 Pattern 1 이름 재확인) — 늦어도 2026-10-10
