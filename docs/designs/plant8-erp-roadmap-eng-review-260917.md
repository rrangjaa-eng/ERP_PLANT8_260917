# PLANT8 ERP 로드맵 — 엔지니어링 리뷰 (/plan-eng-review, 2026-09-17)

**대상:** `.planning/ROADMAP.md`(10페이즈) + `.planning/REQUIREMENTS.md`(v1 89건) + `.planning/research/ARCHITECTURE.md`·`STACK.md`. 설계 문서 = `docs/designs/plant8-erp-roadmap-ceo-review-260917.md`(CEO 리뷰 결정 기록).
**브랜치:** `claude/btl-project-management-system-b1wd46` · **리뷰 시점 commit:** a37c352 · **모드:** FULL_REVIEW(범위 유지, D2=A)
**결과:** 이슈 15건 전부 결정(모두 권고안 A 채택), critical gap 0, 미결 0. 결정은 로드맵퍼로 `.planning/`에 반영한다.

## Step 0 — 스코프 챌린지

- **기존 코드:** 없음(그린필드). 260907은 업무 규칙 참고만. 대신 플랫폼 내장(Cloud Run 리비전·트래픽 분할, Cloud SQL 커넥터+IAM, Cloud Monitoring 경보, better-auth, drizzle-kit)을 deploy.sh가 부르는 구조로 — 직접 구현 대상이 아니다.
- **최소 집합:** 제품 범위는 CEO 리뷰 HOLD SCOPE. 세 번 실패의 원인을 막는 장치 4개(viewer 투영·설정 읽힘 테스트·누수 스캔 생성기·import 린트)는 유지. 미룰 후보(상태 화면 뼈대·경보·성능 수치·업로드 중복 감지)는 사용자가 "지금 구조 그대로"(D2=A) 선택.
- **복잡도 체크:** 발동 — 리서치 두 문서가 다른 구조(STACK.md Next.js 단일 앱 vs ARCHITECTURE.md Hono+raw pg)를 전제. Issue 1로 해소.
- **검색 체크:** Aside 미설치 → WebSearch(Sonnet 서브에이전트) 8개 패턴. 핵심: Next.js에 필드 마스킹 내장 없음(DAL+DTO 관례), Server Action zod 강제 린트 없음(next-safe-action 래퍼), drizzle-kit은 파괴적 SQL을 경고 없이 생성(Squawk), better-auth 계정 잠금 없음(속도 제한만), tick 멱등성은 유니크 제약이 담당, JSONB는 GIN 인덱스 필수, version 검사는 WHERE 절에.
- **TODOS.md:** 없음. **완전성:** 테스트 계층 부재(Issue 14). **배포물:** 이미지 레지스트리·태그 규칙 부재(Issue 4).
- Prior learning 적용: `plant8-no-golden-pnl` — 골든 손익 표 재제안 없음.

## 결정 기록 (15 issues)

| # | 섹션 | 심각도 / 신뢰도 | 결정 (전부 A) | 반영 위치 |
|---|---|---|---|---|
| 1 | Arch | P1 / 9 | 앱 구조 = Next.js 단일 앱 + Drizzle 4계층 app/ → domain/ → repositories/(viewer 필수) → db/. ARCHITECTURE.md의 Hono·REST·raw pg는 참고용 | Overview, Phase 1 기준 4, `docs/ARCHITECTURE.md` |
| 2 | Arch | P1 / 8 | Server Action은 next-safe-action `authedActionClient`(세션·viewer·zod)로만 생성. 커스텀 ESLint가 래퍼 없는 `use server` export를 막음. 새 의존성 승인(버전 고정) | Phase 1 기준 4 |
| 3 | Arch | P1 / 8 | 읽기 2계층: repositories는 `scopeFor(viewer)`로 행만 거르고 전체 컬럼 반환(domain 안에서만), domain 출구는 `project(viewer, dto)` DTO만(행 객체 금지, 타입 강제), React taint 2차 방어. 누수 스캔은 DTO 목록에서 | Phase 3 기준 2, Phase 8 기준 4 |
| 4 | Arch | P2 / 8 | 마이그레이션 = 같은 이미지의 Cloud Run Job(migrate)을 deploy.sh가 실행 후 리비전 배포. `drizzle-kit push` CI 금지. Squawk이 drizzle SQL 린트(확장-축소). Artifact Registry(서울) git SHA 태그, 더티 트리 거부, rollback.sh = 이전 리비전 트래픽 복구. 풀·max-instances·티어 숫자는 Phase 1 계획(16A 공식 유지) | Phase 1 기준 1·6 |
| 5 | Arch | P1 / 8 | better-auth rateLimit(IP, 로그인 경로 엄격, DB 저장소, X-Forwarded-For 신뢰) + 계정 잠금은 `login_attempts` 표 + before-hook(15분 창 실패 ≥ N 거부, 성공 시 초기화, 잠금·해제 행동 로그, 관리자 해제). N·15분은 설정 키 | Phase 1 기준 2 |
| 6 | Arch | P2 / 8 | notify-tick: Google OIDC ID 토큰 검증(audience=서비스 URL, 이메일=스케줄러 SA), 실패 401+로그, 건수 상한(설정) 배치, 응답 `{sent, skipped, remaining}`, deploy.sh가 스케줄러 잡·SA 생성, 검증 비활성 변수는 배포 거부 | Phase 6 기준 5 |
| 7 | Arch | P2 / 7 | 데이터 키 `APP_DATA_KEY_v1` Secret Manager→환경 변수(Phase 1). `encrypt()/decrypt()` 헬퍼(AES-256-GCM, 키 버전 접두어 `v1:`, 회전 = 새 버전 + 재암호화 스크립트, 복호화 = 마스킹 해제 권한 + 행동 로그)(Phase 3). transform이 같은 헬퍼로 암호화(Phase 7). /cso 뒤 KMS 봉투 승격, 인터페이스 동일(Phase 10) | Phase 1 기준 1, 3 기준 5, 7 기준 1, 10 기준 3 |
| 8 | Quality | P1 / 8 | `domain/money` 단일 모듈: Money 타입, `round(단위, 방식)`, `toKrw()`, `splitWithRemainder()`, `grossFromTotal()`(합계→공급가 역산), `applyTaxRule()`(4종). Phase 5·6·8·10은 참조만. 린트: 모듈 밖 금액 산술 금지(branded Money 또는 커스텀 규칙) | Phase 4 기준 5, 5·6·8·10 기준, Phase 1 린트 |
| 9 | Quality | P1 / 7 | `legacy_exempt` 컬럼(Phase 7 load true, 리포지토리 쓰기 훅이 첫 편집에서 false + 행동 로그) + `domain/rules.gate(doc, rule, ctx)` 단일 게이트(고객 승인·증빙 필수·마감·알림 전부 경유) | Phase 4·6 기준, Phase 7 기준 3 |
| 10 | Quality | P1 / 8 | 문서 번호 = `document_counters(format_key, scope_key, next_no)` 행을 같은 트랜잭션에서 `UPDATE … RETURNING`으로 잠그고 증가, 문서 표 `UNIQUE(format_key, number)`, 결번 허용, 동시 제출 테스트 | Phase 4 기준 1, Phase 5 기준 1 |
| 11 | Quality | P2 / 8 | 누수 스캔 생성기 입력 = 액션 레지스트리 × 계급, DTO 타입 목록 × 계급, Excel 내보내기 함수 × 계급. "미등록 엔드포인트 실패" → "DTO 타입이 노출표 항목에 매핑되지 않으면 실패" | Phase 3 기준 3, Phase 6 기준 7 |
| 12 | Quality | P2 / 7 | 세금 규칙 필드에 절사 단위(1원/10원)·방식(절사/반올림/올림)·최소 징수액 추가. `applyTaxRule()`이 읽고 `round()`는 단위·방식 인자. 기본값(부가세 1원 절사, 원천징수 10원 절사, 최소 징수액 0)은 시드, Phase 5 계획에서 경영관리 확인 | Phase 3 기준 5, Phase 4 기준 5 |
| 13 | Quality | P2 / 7 | custom_fields: 서버 액션이 저장 전 field_definitions에서 zod 스키마 조립(미등록 키 거부), 표 생성 마이그레이션에 GIN 인덱스, 정렬 필드만 실측 후 표현식 인덱스, 타입 변경 금지(새 필드로) | Phase 3 스키마 규약, Phase 9 기준 4 |
| 14 | Tests | P1 / 9 | 테스트 3계층: 단위(Vitest, domain/*), 통합(Vitest + GitHub Actions Postgres 서비스 컨테이너: repositories·액션·동시성·누수 생성·설정 읽힘·tick 멱등성), E2E(Playwright, 역할 4종 핵심 흐름 + 계급별 노출 스모크). 페이즈 완료 조건: 새 도메인 모듈=단위, 새 액션·DTO=통합+누수 생성, 새 화면 흐름=E2E 1개 | Overview, Phase 1 기준 4, 각 페이즈 기준 |
| 15 | Perf | P2 / 7 | 증빙 업로드 = 브라우저 축소(최대 변 2000px JPEG) + SHA-256 → 서버가 한도·형식·중복 검사 후 GCS 서명 PUT URL(크기 상한 조건) → 완료 통보 시 GCS 메타데이터 재확인 후 files 행. 서버 이미지 라이브러리 없음, PDF는 원본 | Phase 6 기준 2 |

Section 4의 그 외 항목(손익 요청당 TS 계산, 콜드스타트, Excel 메모리)은 규모(프로젝트 수백 건·사용자 30명)와 17A로 충분 — 이슈 없음.

## NOT in scope (이 리뷰에서 제안하지 않은 것)

- Postgres RLS 2차 방어 — 필드 단위 노출표를 표현 못 하고 비개발자 유지보수와 맞지 않음(ARCHITECTURE.md 결론 유지, Issue 3 C안 기각)
- 처음부터 Cloud KMS 봉투 암호화 — 개인 GCP 단계 비용·IAM·로컬 개발 의존 증가. Phase 10 /cso 뒤 승격(Issue 7)
- 서버 이미지 처리(sharp) — 네이티브 의존성·메모리(Issue 15)
- 골든 손익 데이터셋·양 본부 사전 합의 절차 — 사용자 거부(15B), 재제안 없음
- 운영 장치 4건(상태 화면 뼈대·경보·성능 수치·업로드 중복 감지)의 후행 이동 — 사용자가 현 구조 유지(D2=A)
- 이메일 채널 재검토(STACK.md Brevo 권고 vs D5 Google SMTP) — D5는 사용자 결정 2회 확정. Phase 6 계획에서 Workspace SMTP 릴레이(앱 비밀번호·발송 한도)만 확인
- 워크플로 엔진·큐·마이크로서비스 — ARCHITECTURE.md Anti-Pattern 그대로 배제

## What already exists

| 하위 문제 | 이미 있는 것 | 계획의 태도 |
|---|---|---|
| 배포 순서·롤백·경보 | Cloud Run 리비전 `--no-traffic`·트래픽 분할, `gcloud monitoring policies`, Cloud Run Job | deploy.sh가 부른다(Issue 4) — 재구현 아님 |
| DB 접속·IAM | `@google-cloud/cloud-sql-connector`(authType IAM) | 그대로 사용(6A) |
| 세션·비밀번호·프로바이더 전환 | better-auth(rateLimit, socialProviders, Drizzle 어댑터) | 사용. 계정 잠금만 직접(Issue 5) |
| 액션 검증·인증 | next-safe-action | 도입(Issue 2) |
| 마이그레이션 생성·린트 | drizzle-kit generate, Squawk | 사용, `push` 금지(Issue 4) |
| 필드 노출 강제 | Next.js DAL/DTO 권고, React taint API | 관례를 계층·타입·린트로 강제(Issue 3) |
| 스케줄러 인증 | Cloud Scheduler OIDC | 검증만 직접(Issue 6) |
| 동시성 | Postgres 행 잠금·유니크 제약·advisory lock | 그대로(Issue 10, 2A) |
| 업로드 | GCS 서명 URL, 브라우저 canvas | 조합(Issue 15) |
| 이전 스크립트 골격 | ARCHITECTURE.md 패턴 9(extract/transform/load/verify, id_map) | 유지, Phase 4부터(OV-1) |

## Diagrams

### 1. 계층과 노출 강제 지점 (Issue 1·3·8·9)

```
브라우저 ──(server action: next-safe-action authedActionClient)──▶ app/
                                                              │  ← DTO만 통과 (린트: app/은 repositories/ import 금지, taint)
                                                              ▼
                                            domain/ ── project(viewer, dto) ── 출구
                                              │ ├ money (round/toKrw/tax/gross)   ← 금액 산술 유일 지점
                                              │ ├ rules.gate(doc, rule, ctx)      ← 게이트·legacy_exempt 유일 지점
                                              │ ├ approvals (routes/steps/instances, nextStep, version)
                                              │ └ pnl (결과 + trace)
                                              ▼
                                       repositories/ (Drizzle) ── scopeFor(viewer) WHERE, 전체 컬럼 반환
                                              ▼
                                            db/ (schema, drizzle/*.sql ← Squawk)
```

### 2. 배포 파이프라인 (Issue 4)

```
git SHA ─▶ CI(lint·typecheck·Squawk·unit·integration[Postgres container]·E2E)
       ─▶ build image ─▶ Artifact Registry(서울):sha
       ─▶ deploy.sh: Cloud Run Job migrate (same image, IAM connector) ─ 실패 ▶ 중단
                    ─▶ deploy revision --no-traffic ─▶ smoke ─▶ traffic 100%
                    ─▶ scheduler job/SA upsert, alert policies upsert
       rollback.sh: previous revision ─▶ traffic 100%
```

### 3. 증빙 업로드 (Issue 15)

```
폰/PC ─ canvas 축소(≤2000px) + SHA-256 ─▶ action: uploadIntent(size,type,hash)
   ◀─ 검사(한도·형식·중복) ─ signed PUT URL(size cap) ─┘
폰/PC ─ PUT bytes ─▶ GCS
폰/PC ─▶ action: uploadDone(objectKey) ─ GCS metadata 재확인 ─▶ files row ─▶ 지출결의/카드 건 연결
```

### 4. notify-tick (Issue 6 + 2A)

```
Cloud Scheduler(OIDC SA) ─▶ POST /internal/notify-tick
  ─ verify ID token(aud, email) ✗ 401
  ─ pg_try_advisory_lock ✗ 409 skip
  ─ evaluate rule instances (predicate 종류 × 파라미터), batch ≤ cap
  ─ INSERT notification_log ON CONFLICT DO NOTHING ─▶ 신규만 알림함 + SMTP
  ◀ {sent, skipped, remaining}
```

## 인라인 다이어그램이 필요한 파일

- `domain/approvals/`: 상태 전이 표(draft→submitted→in_review→approved/rejected/withdrawn)와 빈 자리 건너뜀
- `domain/money/`: 세금 규칙 4종 × 절사 파이프라인(공급가 → 세액 → 지급 총액; 합계 → 공급가 역산)
- `domain/rules/`: 게이트 순서와 legacy_exempt 단락
- `domain/pnl/`: 비용 우선순위(증빙 > 승인액 > 실행가) + '계산 불가' 분기
- `scripts/migrate/`: extract → transform → load(단일 트랜잭션) → verify → ROLLBACK 분기
- `scripts/deploy.sh`: 위 다이어그램 2

## Test Review — 커버리지 다이어그램

(리뷰 채팅에 제시한 것과 동일. 그린필드라 실행된 테스트 0, 기준에 이름 있는 테스트 24/38, GAP 8은 E2E 예외 흐름으로 Phase 5·6·8·10 계획의 E2E 목록에 포함.)

- 테스트 계획 산출물: `~/.gstack/projects/rrangjaa-eng-ERP_PLANT8_260917/root-claude-btl-project-management-system-b1wd46-eng-review-test-plan-20260917-172541.md`
- 회귀 규칙: 해당 없음(기존 코드 없음)

## Failure Modes Registry

| # | 코드 경로 | 운영 실패 시나리오 | 테스트 | 오류 처리 | 사용자에게 | 판정 |
|---|---|---|---|---|---|---|
| F1 | 서버 액션 반환 | 행 객체를 그대로 반환해 숨김 필드 직렬화 | 누수 생성(DTO×계급) | 타입 강제 + taint | 없음(누수) | Issue 3·11로 봉합 |
| F2 | migrate Job | 확장-축소 위반 마이그레이션이 락·데이터 손실 | Squawk CI | 배포 중단 | 배포 실패 알림 | 봉합(Issue 4) |
| F3 | 로그인 잠금 | 인스턴스별 메모리 카운트로 잠금 미작동 | 통합(N회 잠금) | DB 저장소 | 잠금 화면 | 봉합(Issue 5) |
| F4 | notify-tick | 외부 반복 호출·요청 시간 초과 절단 | 통합(401, 배치 이어감) | OIDC·배치 상한 | 없음(내부) | 봉합(Issue 6) |
| F5 | 암호화 키 회전 | 접두어 없는 암호문이 회전 뒤 복호화 불가 | 단위(v1/v2 혼재 복호화) | 버전 접두어 | 마스킹 해제 실패 표시 | 봉합(Issue 7) |
| F6 | 문서 번호 | 동시 제출 중복 번호 | 통합(트랜잭션 2개) | 행 잠금·UNIQUE | 제출 재시도 안내 | 봉합(Issue 10) |
| F7 | legacy 규칙 | 면제 누락으로 전환 첫날 봉쇄 / 면제 영구 잔존 | 단위(규칙×면제 표), 통합(훅) | 단일 게이트 | 제출 버튼 비활성 이유 | 봉합(Issue 9) |
| F8 | 업로드 | 서명 URL 발급 뒤 완료 통보 누락(고아 객체) | 통합(의도만 있고 완료 없음) | 미완료 객체 청소 스크립트(OPERATIONS.md) | 첨부 없음 표시 | Phase 6 계획에 청소 절차 필요 — critical 아님(비용만) |
| F9 | 세금 절사 | 위하고 전표와 원 단위 불일치 | 단위(규칙별 절사) | 설정 필드 | 지급 총액 차이 표시 | 봉합(Issue 12) |
| F10 | Cloud SQL 커넥션 | max-instances × 풀 초과로 연결 거부 | deploy.sh 검사 | 배포 거부(16A) | 500 → 경보 | 봉합(16A·Issue 4) |

**Critical gaps: 0** (테스트도 처리도 없고 조용히 실패하는 경로 없음).

## Worktree parallelization strategy

| Step | Modules touched | Depends on |
|---|---|---|
| S1 배포 스켈레톤·CI·deploy.sh·Job | scripts/, .github/, Dockerfile | — |
| S2 인증(better-auth + 잠금) | app/(auth), domain/auth, db/ | S1(스키마 러너) |
| S3 액션 래퍼·린트·경계 | lib/actions, eslint config | — |
| S4 암호화 헬퍼·설정 레지스트리 | domain/crypto, domain/settings, db/ | S1 |
| S5 authz·viewer 투영·DTO·누수 생성기 | domain/authz, repositories/, test/ | S3, S4 |
| S6 domain/money·rules·approvals | domain/money, domain/rules, domain/approvals | S4 |
| S7 화면(Phase 2 디자인 시스템 뒤) | app/ | S3, S5 |

- Lane A: S1 → S2 → S4 (sequential, shared db/)
- Lane B: S3 (independent) → S5 (needs S4)
- Lane C: S6 (needs S4, independent of app/)
- 실행: A와 B(S3까지) 병렬 → S4 머지 → S5·S6 병렬 → S7. Conflict flag: S2·S4·S5가 모두 db/ 스키마를 만진다 — 마이그레이션 파일 번호 충돌 주의(순차 머지).

## Implementation Tasks
Synthesized from this review's findings. Each task derives from a specific finding above. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, planning)** — roadmap — Overview·Phase 1 기준 4에 4계층 구조 명시, ARCHITECTURE.md 참고용 강등 (Issue 1)
  - Surfaced by: Architecture — STACK.md:56 vs ARCHITECTURE.md:53·57·540
  - Files: .planning/ROADMAP.md, docs/ARCHITECTURE.md(Phase 1)
  - Verify: Phase 1 계획이 routes/·REST를 만들지 않음
- [ ] **T2 (P1, human: ~1d / CC: ~20min)** — actions — next-safe-action authedActionClient + 커스텀 ESLint "래퍼 없는 use server export 금지" (Issue 2)
  - Surfaced by: Architecture — ROADMAP.md:47 "zod 검증 필수 린트"는 존재하지 않음
  - Files: lib/actions/client.ts, eslint/rules/require-action-client.js
  - Verify: 래퍼 없는 액션 파일이 lint fail
- [ ] **T3 (P1, human: ~2d / CC: ~40min)** — authz/repositories — scopeFor 행 필터 + project(viewer, dto) + DTO 타입 + taint (Issue 3)
  - Surfaced by: Architecture — ROADMAP.md:78 리포지토리 투영만으로는 PNL-05 계산 불가
  - Files: domain/authz/project.ts, repositories/*, domain/*/dto.ts
  - Verify: 누수 생성 테스트(DTO×계급) 통과, app/에서 repositories import 시 lint fail
- [ ] **T4 (P1, human: ~2d / CC: ~30min)** — deploy — Cloud Run Job migrate, Squawk CI, Artifact Registry SHA 태그, rollback.sh (Issue 4)
  - Surfaced by: Architecture — ROADMAP.md:44,49
  - Files: scripts/deploy.sh, scripts/rollback.sh, .github/workflows/ci.yml, Dockerfile
  - Verify: 컬럼 drop 마이그레이션이 CI에서 거부, 빈 GCP에서 deploy.sh 1회 성공
- [ ] **T5 (P1, human: ~1d / CC: ~20min)** — auth — better-auth rateLimit(DB) + login_attempts 잠금 훅 + 관리자 해제 (Issue 5)
  - Surfaced by: Architecture — ROADMAP.md:45
  - Files: domain/auth/lockout.ts, db/schema/login_attempts.ts
  - Verify: 통합 테스트 N회 실패 잠금·15분 해제·관리자 해제
- [ ] **T6 (P2, human: ~0.5d / CC: ~15min)** — notify — OIDC 검증, 배치 상한, {sent,skipped,remaining}, deploy.sh 스케줄러·SA (Issue 6)
  - Surfaced by: Architecture — ROADMAP.md:134
  - Files: app/api/internal/notify-tick/route.ts, scripts/deploy.sh
  - Verify: 토큰 없음→401, 배치 상한 초과 시 remaining>0 후 다음 tick 완료
- [ ] **T7 (P2, human: ~1d / CC: ~20min)** — crypto — APP_DATA_KEY_v1(Secret Manager), encrypt/decrypt 헬퍼(버전 접두어), 재암호화 스크립트, KMS 인터페이스 (Issue 7)
  - Surfaced by: Architecture — ROADMAP.md:81,193
  - Files: domain/crypto/index.ts, scripts/rotate-key.ts
  - Verify: v1·v2 혼재 복호화 단위 테스트
- [ ] **T8 (P1, human: ~1d / CC: ~25min)** — money — domain/money 모듈(round·toKrw·splitWithRemainder·grossFromTotal·applyTaxRule) + 금액 산술 린트 (Issue 8·12)
  - Surfaced by: Code Quality — ROADMAP.md:98,112,118,131,161,194 중복 서술
  - Files: domain/money/*.ts, eslint/rules/money-boundary.js
  - Verify: 규칙 4종×절사 표 기반 단위 테스트, 모듈 밖 산술 lint fail
- [ ] **T9 (P1, human: ~0.5d / CC: ~15min)** — rules — legacy_exempt 컬럼 + 쓰기 훅 + domain/rules.gate 단일 진입점 (Issue 9)
  - Surfaced by: Code Quality — ROADMAP.md:150 vs :96,131,133
  - Files: domain/rules/gate.ts, repositories/hooks/legacy.ts
  - Verify: 규칙×면제 표 단위 테스트, 첫 편집 후 면제 해제 통합 테스트
- [ ] **T10 (P1, human: ~0.5d / CC: ~10min)** — numbering — document_counters 행 잠금 + UNIQUE (Issue 10)
  - Surfaced by: Code Quality — ROADMAP.md:94,112
  - Files: domain/numbering/allocate.ts, db/schema/document_counters.ts
  - Verify: 동시 제출 통합 테스트
- [ ] **T11 (P2, human: ~1d / CC: ~20min)** — tests — 누수 생성기 입력을 액션 레지스트리×DTO×Excel×계급으로 (Issue 11)
  - Surfaced by: Code Quality — ROADMAP.md:79,136
  - Files: test/generated/leak-scan.ts
  - Verify: 노출표에 매핑 안 된 DTO 타입이 있으면 실패
- [ ] **T12 (P2, human: ~0.5d / CC: ~10min)** — custom-fields — zod 동적 스키마 검증 + GIN 인덱스 (Issue 13)
  - Surfaced by: Code Quality — ROADMAP.md:86,181
  - Files: domain/custom-fields/schema.ts, db/migrations
  - Verify: 미등록 키·타입 불일치 거부 통합 테스트
- [ ] **T13 (P1, human: ~1d / CC: ~30min)** — tests — 3계층 테스트 골격(Vitest·Postgres 컨테이너·Playwright 역할 4종) (Issue 14)
  - Surfaced by: Test Review — 커버리지 다이어그램 GAP 8
  - Files: vitest.config.ts, playwright.config.ts, .github/workflows/ci.yml, test/e2e/roles/*
  - Verify: CI에서 3계층 전부 실행
- [ ] **T14 (P2, human: ~1d / CC: ~25min)** — files — 브라우저 축소 + 서명 URL 업로드 + GCS 메타데이터 재확인 + 고아 객체 청소 절차 (Issue 15, F8)
  - Surfaced by: Performance — ROADMAP.md:131
  - Files: app/(evidence)/upload.tsx, domain/files/intent.ts, docs/OPERATIONS.md
  - Verify: 이미지·PDF 두 경로 E2E, 고아 객체 청소 스크립트 dry-run
- [ ] **T15 (P2, planning)** — roadmap — 결정 1~15를 ROADMAP.md·STATE.md 기준에 접기(gsd-roadmapper)
  - Surfaced by: 전 섹션
  - Files: .planning/ROADMAP.md, .planning/STATE.md
  - Verify: 89/89 커버리지 유지, 각 이슈의 반영 위치 문구 존재

## OUTSIDE VOICE (Claude subagent — 신선한 컨텍스트, 같은 하네스, 모델 미확인)

Codex 미설치로 네이티브 대체(outside_status: unavailable). 8건 발견. 전문은 리뷰 채팅에 verbatim으로 제시했다.

| # | 발견 | 결정 | 반영 위치 |
|---|---|---|---|
| OV-1 | 전환 전 "실사용"과 "이중 입력 금지" 충돌, Phase 8 게이트 공허, 델타 이전 중복 검출 없음 | **A 수용**: 전환 전 새 시스템 입력은 source='demo', Phase 8 착수 = 전환 후 N주(설정, 기본 2주) 실입력, MIG-01 델타 이전 시 중복 후보(클라이언트·이름·기간) 표시 | Overview, Phase 7 기준 4, Phase 8 Depends on, MIG-01 |
| OV-2 | 결재선 "계급 고정"이 조직 모델로 해석 불가(경영관리는 계급 아님, 본부 엔티티 없음, 자기 승인 미정의) | **A 수용**: 본부 엔티티(팀 ⊂ 본부, 발령일 이력), 결재 단계 = 계급 × 조직 범위(기안자 팀/본부/전사/특정 부서), 자기 승인 = 건너뛰고 다음 단계(설정) | Phase 3 기준 1, Phase 5 기준 2, MAST-02·EXP-03/04 |
| OV-3 | 개인→회사 GCP 이식이 인프라만, 데이터·키·조직 정책 이관 없음 | **A 수용(재질문)**: 사용자가 회사 GCP를 다음 주 확보 → Phase 1부터 회사 GCP 운영, 개인 GCP 단계 삭제(로컬 개발만), OV-6 게이트는 Phase 1에서 충족, D5 개인 Gmail 단계 삭제, Phase 1 기준 1에 조직 정책(비인증 ingress·외부 링크) 확인. deploy.sh 인자 유지 | PROJECT.md 제약·결정, Phase 1 기준 1, Phase 7 Depends on, STATE 차단 |
| OV-4 | 손익 비용 이중 구현(CASE 집계 + trace) — 쓰기 시점 파생 컬럼 권고 | **B 보강(기각)**: 읽기 시점 유지, effectiveCost SQL 식 하나를 목록·합계·상세(trace)가 공유, 저장은 정산 스냅샷만. 파생 컬럼은 갱신 누락 비정규화 | Phase 8 기준 4, PNL-02 |
| OV-5 | 이력형 세율의 적용 기준일 미정 | **A 수용**: 규칙 종류별 기준일 필드(기본: 원천징수·대납 = 지급일, 미지급이면 지급 예정일; 부가세 = 증빙일, 없으면 작성일), 문서에 세율 버전 id 저장·재계산 시 차이 표시. 기본값은 Phase 5 계획에서 경영관리 확인 | Phase 3 기준 4, Phase 5 기준 7, EXP-15 |
| OV-6 | Phase 6 요구사항 17개, 분할 안전장치 없음 | **A 수용**: Phase 6 = 지급·증빙·법인카드·구매 요청·미결 점검(EXP-06/07/09/10/13/16, EVID-02/03/04, PROJ-06); 새 페이즈 = 공휴일·지급일·마감·알림·SMTP·tick·전 메뉴 권한 검수(EXP-11/12, ADMN-11, NOTI-01~04, OV-5 검수). 로드맵퍼가 재번호 | ROADMAP 페이즈 구조, 커버리지 |
| OV-7 | 리허설 삭제·재적재가 FK RESTRICT·카운터와 충돌, 금액 기준 판정이 늦음 | **A 수용**: (source, source_id) upsert, 이전 문서 번호는 옛 id에서 결정적 파생(예약 범위), 공급가/합계 판정(표본 대조 + 행별 amount_basis, 불명 = 계산 불가)을 Phase 4 기준 7로 | Phase 4 기준 7, Phase 7 기준 1·4, MIG-01/05 |
| OV-8 | FX-01 전면 적용 근거 부재 — v2 이관 권고 | **B 유지**: 사용자 요구, domain/money 한 묶음으로 비용 경계. Phase 4 extract에서 외화 건수 보고 한 줄(정보) | Phase 4 기준 7 |

CROSS-MODEL TENSION: 정면 충돌은 OV-4(파생 컬럼 vs 읽기 시 계산 — 리뷰 유지, 식 공유로 보강)와 OV-8(FX-01 축소 — 사용자 요구 유지). OV-1은 CEO 리뷰 OV-1 게이트를 교체(수용). 나머지 5건은 리뷰 사각지대(수용).

## TODOS.md updates

3건 제안 → 2건 추가(`TODOS.md` 생성: Workspace SMTP 릴레이 확인 P2, exceljs 6개월 재점검 P3), 1건 건너뜀(TypeScript 7 전환 재확인 — 가치 부족).

## Implementation Tasks (외부 목소리 반영분)

- [ ] **T16 (P1, planning)** — roadmap — 전환 전 입력 source='demo', Phase 8 게이트 = 전환 후 N주 실입력, MIG-01 델타 중복 후보 (OV-1)
- [ ] **T17 (P1, human: ~1d / CC: ~20min)** — org/approvals — 본부 엔티티(팀 ⊂ 본부), 결재 단계 = 계급 × 조직 범위, 자기 승인 규칙 (OV-2)
- [ ] **T18 (P1, planning)** — infra — Phase 1부터 회사 GCP, 조직 정책 확인, PROJECT.md·D5·OV-6 갱신 (OV-3)
- [ ] **T19 (P2, human: ~0.5d / CC: ~15min)** — pnl — effectiveCost SQL 식 하나를 목록·합계·상세가 공유, 저장은 스냅샷만 (OV-4)
- [ ] **T20 (P2, human: ~0.5d / CC: ~10min)** — tax — 규칙별 적용 기준일 필드 + 문서에 세율 버전 id 저장·차이 표시 (OV-5)
- [ ] **T21 (P1, planning)** — roadmap — Phase 6을 지급/알림 둘로 분할, 재번호·커버리지 정리 (OV-6)
- [ ] **T22 (P1, human: ~1d / CC: ~20min)** — migrate — 리허설 upsert, 결정적 이전 문서 번호, amount_basis 판정을 Phase 4로 (OV-7)
- [ ] **T23 (P3, human: ~0.1d / CC: ~5min)** — migrate — extract에서 외화 건수 보고 (OV-8)

JSONL: `~/.gstack/projects/rrangjaa-eng-ERP_PLANT8_260917/tasks-eng-review-20260917-175230.jsonl` (23 tasks)

## Completion Summary

- Step 0: Scope Challenge — scope accepted as-is (D2=A, HOLD SCOPE 유지; 구조 불일치는 Issue 1로)
- Architecture Review: 7 issues found (전부 결정)
- Code Quality Review: 6 issues found (전부 결정)
- Test Review: diagram produced, 8 gaps identified (D16 remedy에 포함)
- Performance Review: 1 issue found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 3 items proposed to user (2 added, 1 skipped)
- Failure modes: 0 critical gaps flagged (F8 고아 객체는 T14에 절차 포함)
- Outside voice: ran (claude subagent — codex unavailable), 8 findings → 6 accepted, 2 kept with refinement
- Parallelization: 3 lanes, 2 parallel / 1 sequential (db/ 마이그레이션 번호 충돌 주의)
- Lake Score: 5/5 recommendations chose complete option (D4, D5, D7, D14, D16, D17 중 completeness 비교가 있던 결정 전부 완전판)
- Unresolved decisions: 0

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR (2026-09-17, commit 5aebc3c) | mode: HOLD_SCOPE, 0 critical gaps, 23 findings + 8 outside-voice decided |
| Outside Review | codex (unavailable) → in-host Claude subagent fallback | Independent 2nd opinion | 2 (plan-ceo-review, plan-eng-review phases) | issues_found (outside_status: unavailable, native fallback) | 8 + 8 findings, all decided by user |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (2026-09-17, commit a37c352) | 22 issues (15 asked + 8 test gaps folded − overlap), 0 critical gaps, 0 unresolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** provider codex — not installed; plan-review phase for both CEO and Eng reviews completed by a native in-host Claude subagent (model identity unknown). External-model coverage: none.
- **VERDICT:** CEO + ENG CLEARED — ready to implement once the roadmapper folds decisions 1–15 and OV-1–8 into `.planning/` (T15·T16·T18·T21). Design review optional before Phase 2.

NO UNRESOLVED DECISIONS
