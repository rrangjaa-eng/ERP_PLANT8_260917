---
phase: "02"
slug: "design-system-app-shell"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-01"
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> 2026-10-01 `/gsd-secure-phase 02`(State B — PLAN 8개 `<threat_model>`에서 레지스터 작성) · 감사 gsd-security-auditor(Opus) · 기준 HEAD `bf613df`(코드는 deploy #103 `f85c9af`와 같음)

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| 문서 → 이후 모든 화면 | SYSTEM.md·tokens.css가 화면 계약 | 디자인 결정(DECISIONS → SYSTEM 절차) |
| 사람 결정 → 문서 | 02-01 blocking-human 체크포인트 | 제품 동작 결정 |
| `ui/` → domain/repositories/db | ESLint `boundaries` 경계 | 데이터 계층 접근(금지) |
| 로컬 빌드 → 프로덕션 이미지 | Dockerfile runtime COPY 화이트리스트 | 빌드 산출물 |
| npm 레지스트리 → 리포 | stylelint · @axe-core/playwright 정확 버전 고정 | 서드파티 코드 |
| 브라우저(미인증) → 로그인 폼 | 단일 실패 문구 · 이메일 기준 잠김 | 자격 증명 |
| 클라이언트 폼 → 서버 검증 | zod · better-auth 서버 판정 | 비밀번호 |
| 리포 → 정적 자산 | public/fonts/pretendard | 서체 파일(공개) |
| 세션 → 셸 메뉴 | `roleMenu()` 한 곳 + `can()` 사전 계산 | 메뉴 진입점 |
| 라우트 이동 → 접근 제어 | 시스템 상태 세 줄 + domain 이중 방어 | 운영 상태 |
| 미인증 → 인증 화면 | 레이아웃 + 페이지별 세션 게이트 | 업무 화면 |
| 예외 → 오류 경계 | 고정 문구만 렌더 | 예외 내용(비노출) |
| 검사 설정 → 검사 결과 | axe 규칙 비활성·범위 축소 0 | 접근성 판정 |
| 브라우저 URL → 클라이언트 컴포넌트 | `usePathname` 동등 비교만 | 경로 문자열 |
| 전역 CSS → 모든 라우트 | stylelint CI 강제 | 스타일 |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-01 | Tampering | SYSTEM.md 신설 절 | medium | mitigate | 02-01 blocking-human 체크포인트 · 사용자 출처 승인(02-UAT, 2026-10-01 — 신설 절 전체 승인, 절 단위 확인 아님) | closed |
| T-02-02 | Repudiation | DECISIONS.md | low | mitigate | 2026-09-19 기록 6건 · `design-system-docs.test.ts:139-146` | closed |
| T-02-03 | Tampering | CI 사각지대(docs/**) | medium | mitigate | ci.yml:21-30 · deploy.yml:15-24 재포함 · `ci-guard.test.ts:175-192` | closed |
| T-02-04 | Information Disclosure | `ui/**` import 경계 | high | mitigate | eslint.config.mjs:33·72 — 프로브 4건 error | closed |
| T-02-05 | Information Disclosure | Docker 빌드 컨텍스트 docs/ | low | accept | runtime 스테이지 미복사(Dockerfile:40-58) | closed |
| T-02-06 | Denial of Service | 경로 필터(paths + !) | medium | mitigate | 첫 패턴 `"**"` · `ci-guard.test.ts:86-94` · `workflows.test.ts:17-27` | closed |
| T-02-SC | Tampering | stylelint@17.15.0 설치 | high | mitigate | 정확 버전 고정 package.json:65 · lock integrity | closed |
| T-02-07 | Information Disclosure | 로그인 실패 문구 | medium | mitigate | `login-error.ts:18-27` 단일 문구 · 잠김은 이메일 기준(domain/auth/hooks.ts) | closed |
| T-02-08 | Tampering | 서버 검증 | high | mitigate | better-auth 서버 판정 · `authedActionClient` + zod(account/actions.ts) · E2E | closed |
| T-02-09 | Spoofing | sliding 세션 쿠키 | medium | mitigate | `<SessionRefresh />`(app/layout.tsx) · login-logout.spec.ts:18 | closed |
| T-02-10 | Information Disclosure | public/fonts 공개 서빙 | low | accept | OFL 서체·라이선스만 | closed |
| T-02-11 | Elevation of Privilege | 시스템 상태 라우트 이동 | high | mitigate | system-status/page.tsx:70-72 세션·`can()`·`notFound()` · 직원 404 E2E | closed |
| T-02-12 | Information Disclosure | 셸 메뉴 역할 외 진입점 | medium | mitigate | `ui/shell/role-menu.ts` 단일 분기 · layout `can()` 사전 계산 · role-menu.test.ts | closed |
| T-02-13 | Denial of Service | 라우트 그룹 경로 충돌 | low | mitigate | 이동 전 경로 잔존 0 · CI build success | closed |
| T-02-14 | Elevation of Privilege | 새 라우트 6개 세션 게이트 | high | mitigate | `(app)` layout `requireSession()` + 페이지별 게이트(WR-07 해소) | closed |
| T-02-15 | Information Disclosure | EMPTY 문구 | low | accept | 고정 문자열만 렌더 | closed |
| T-02-16 | Repudiation | 빈 화면을 완성으로 오인 | medium | mitigate | `buildNextTurnView([])` 빈 입력 명시 · 02-05-SUMMARY 기록 | closed |
| T-02-17 | Elevation of Privilege | 시스템 상태 접근 제어 세 줄 | critical | mitigate | page.tsx:70-72 · domain `NotAdminError`(index.ts:148-150) · 단위·E2E | closed |
| T-02-18 | Information Disclosure | 오류 경계 화면 | medium | mitigate | error.tsx 고정 문구 — 이후 추가 5곳도 예외 내용 렌더 0 | closed |
| T-02-19 | Tampering | 서버 검증 메시지 문자열 | medium | mitigate | 폼은 서버 `validationErrors`만 표시 · E2E가 서버 문자열 고정 | closed |
| T-02-20 | Information Disclosure | 시스템 상태 값 | medium | mitigate | `force-dynamic` · 접근 제어 뒤 `getSystemStatus` · domain 재검사 | closed |
| T-02-SC2 | Tampering | @axe-core/playwright@4.13.0 설치 | high | mitigate | 사용자 승인(2026-09-19) · 정확 버전 고정 · lock integrity | closed |
| T-02-21 | Repudiation | 접근성 검사 범위 축소 | medium | mitigate | a11y.spec.ts SCREENS `toHaveLength(6)` · `disableRules`/`exclude` 0 | closed |
| T-02-22 | Denial of Service | 폰 프로젝트 스펙 중복 | low | mitigate | playwright.config.ts testMatch/testIgnore · `--list` 중복 0 | closed |
| T-02-08-01 | Information Disclosure / Tampering | TopBar·BottomTabs `usePathname` | low | accept | 동등·접두 비교만 · current-path.test.ts 경계 사례 | closed |
| T-02-08-02 | Tampering | app/globals.css 전역 선택자 | low | mitigate | stylelint.config.mjs 금지 규칙 · CI `pnpm lint` | closed |
| T-02-08-03 | Denial of Service | E2E 로그인 rate limit 상향 | low | accept | playwright.config.ts:20에만 · 기본값 10(lib/env.ts:66) | closed |
| T-02-08-04 | Elevation of Privilege | system-status page.tsx 재구성 | medium | mitigate | `notFound()` 유지 · 직원 404 E2E | closed |
| T-02-08-SC | Tampering | npm 설치 | low | accept | 설치 없음(02-08-SUMMARY `added: []`) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-05 | docs/는 build 스테이지에만 들어가고 runtime 스테이지가 복사하지 않아 최종 이미지에 없다. `.planning`은 계속 제외 | 02-02 계획(계획 게이트 통과) · 2026-10-01 감사에서 전제 확인 | 2026-10-01 |
| AR-02-02 | T-02-10 | OFL 서체 파일과 라이선스 원문뿐, 비밀 없음 | 02-03 계획 · 감사 확인 | 2026-10-01 |
| AR-02-03 | T-02-15 | EMPTY는 고정 문자열만 렌더, 사용자·업무 데이터 없음 | 02-05 계획 · 감사 확인 | 2026-10-01 |
| AR-02-04 | T-02-08-01 | 경로 문자열은 정적 href와 동등 비교만, 렌더되지 않음 | 02-08 계획 · 감사 확인 | 2026-10-01 |
| AR-02-05 | T-02-08-03 | rate limit 상향은 Playwright 프로세스에만 | 02-08 계획 · 감사 확인 | 2026-10-01 |
| AR-02-06 | T-02-08-SC | 패키지 설치 없음(D-19) | 02-08 계획 · 감사 확인 | 2026-10-01 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-01 | 29 | 29 (완화 23 + 수용 6) | 0 | gsd-security-auditor (Opus) — 단위 8파일 268건 · ESLint 경계 프로브 · stylelint · `playwright --list` · deploy #103 CI 확인 |

**범위:** 감사 기준은 `bf613df`(코드 = f85c9af)다. 그 뒤 병합된 bada253(#111)은 관리자 표 행 동작 묶음(프래그먼트 → span)과 CSS(간격·밑줄)만 바꿔 위 레지스터의 완화 지점에 닿지 않는다고 판단했고 다시 감사하지 않았다(02-VERIFICATION bada253 대조 참조).

**비차단 참고:** (1) 「tokens.css만 바뀐 PR에서 CI가 도는가」(02-02-SUMMARY 사람 확인)는 2026-10-01 확인용 PR #118에서 실측해 해소(ci run 36816314681이 pull_request로 뜸 — 02-UAT 3번). (2) `ui` → `lib` 허용 경로로 데이터 계층에 닿는 전이 경로가 이론상 있음 — 현재 `ui/`가 쓰는 lib는 클라이언트용 넷뿐.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-01
