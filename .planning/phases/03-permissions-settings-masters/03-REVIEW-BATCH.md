# Phase 3 검토 묶음 — 권한·설정·마스터

> `/gsd-execute-phase 3` 실행 중 웨이브마다 이 파일에 누적한다.
> 사람이 볼 것: 각 웨이브의 커밋 SHA · 게이트 결과 · 새 화면 스크린샷 ·
> 계획이 열어둔 것 중 실행자가 판단한 것 · 브라우저 QA에서 사람 판단이 필요한 항목.

## 실행 조건

- 브랜치: `claude/gsd-execute-phase-3-uofrn0`
- 격리: `none` (worktree fork base 미해결 → 메인 워킹트리 순차 실행, GSD #683)
- 웨이브: 7개, 각 웨이브 1개 플랜, 전부 직렬 의존 (03-01 → … → 03-07)
- 체크포인트 4건(03-01·03-04·03-06·03-07 Task 1): 전부 **A** 확정
  (근거: `.planning/todos/pending/2026-09-20-phase-3-checkpoint-answers.md`)
- 스크린샷: PC 1440×900 · 모바일 375×812, `screens/wave-N/`

## 웨이브 요약

| 웨이브 | 플랜 | 상태 | 커밋 | lint | typecheck | unit | integration | e2e |
|---|---|---|---|---|---|---|---|---|
| 1 | 03-01 | ✓ 완료 | `53e26a9` | ✓ | ✓ | ✓ 347 | ✓ 48 | ✓ 59 |
| 2 | 03-02 | ✓ 완료 | `fa6d880` | ✓ | ✓ | ✓ 363 | ✓ 48 | ✓ 59 |
| 3 | 03-03 | ✓ 완료 (+결함 2건 수정) | `3483fd8` | ✓ | ✓ | ✓ 381 | ✓ 103 | ✓ 63 |
| 4 | 03-04 | ✓ 완료 (+결함 1건 수정) | `e113c7d` | ✓ | ✓ | ✓ 425 | ✓ 143 | ✓ 66 |
| 5 | 03-05 | ✓ 완료 (+결함 4건 수정) | `25f7fdf` | ✓ | ✓ | ✓ 452 | ✓ 422 | ✓ 83 |
| 6 | 03-06 | ○ 대기 | — | — | — | — | — | — |
| 7 | 03-07 | ○ 대기 | — | — | — | — | — | — |

---

## 웨이브 1 — 03-01 트레이서 (권한 판정 4함수·행동 로그·보관함·코드표)

**소요 52.8분** · 요구사항 ADMN-01, ADMN-02, ADMN-08, ADMN-12, MAST-04, OPS-05

### 커밋

| SHA | 내용 |
|---|---|
| `b69333d` | docs(03-01): Task 1 계급·권한 모델 결정 기록(옵션 A) |
| `2badaf0` | feat(03-01): 권한 판정 4함수·행동 로그·보관함·코드표 트레이서 배선 (41 파일) |
| `6ce4d57` | feat(03-01): 마이그레이션 0003/0004 적용 + 통합·E2E로 트레이서 증명 (12 파일) |
| `53e26a9` | docs(03-01): complete 트레이서 plan (SUMMARY.md) |

### 게이트

| 게이트 | 결과 |
|---|---|
| `pnpm lint` | ✓ PASS |
| `pnpm typecheck` | ✓ PASS |
| `pnpm lint:sql` | ✓ PASS — 5개 파일 0 issues |
| `pnpm build` | ✓ PASS — `/admin/code-tables` 라우트 생성 |
| `pnpm test:unit` | ✓ PASS — 37 파일 / 347 테스트 |
| `pnpm test:integration` | ✓ PASS — 11 파일 / 48 테스트 (roles·code-tables·action-log 20건 신규) |
| `pnpm test:e2e` | ✓ PASS — 59 테스트 (3회차 전체 실행에서 exit 0) |

오케스트레이터 독립 확인: 작업트리 깨끗 · `.squawk.toml` 무변경 · 테스트에 `.skip`/`.only`/`xit` 추가 0건.

### 체크포인트

Task 1(계급·권한 모델, `gate="blocking"`)은 사전 확정된 **옵션 A**로 기록하고 멈추지 않았다. 다섯 항목 전부 계획서 원문대로: 계급 식별자 5종 고정 · `roles` 순위 컬럼 없음 · 관리자 불리언 컬럼 유지 · 백필 관리자→`role-sysadmin`/나머지→`role-pm` · `archived_by` FK 없음.

### 계획이 열어둔 것 중 실행자가 판단한 것

1. **`users.role_id` FK를 마이그레이션 2개로 쪼갬** — `0003`이 `NOT VALID`로 추가하고 신규 `0004_users_role_id_validate.sql`이 별도 트랜잭션에서 `VALIDATE CONSTRAINT`. squawk가 이 FK만 `constraint-missing-not-valid`/`adding-foreign-key-constraint`로 잡았다(나머지 3개 FK는 같은 마이그레이션에서 새로 만드는 표에 붙어 통과, 이건 기존 `users` 표에 붙는다). 03-RESEARCH의 squawk 실측이 이 경우를 안 덮었다. **`.squawk.toml` 예외를 늘리지 않고** 해결했다 — 체크포인트 ③의 취지 유지
2. **`action_log.seq`를 `bigserial` → identity 컬럼**(`generatedByDefaultAsIdentity()`) — squawk `prefer-identity`. 역시 예외 추가 없이 해결
3. **`test/e2e/global-setup.ts`에 `seedMasterData` 호출 추가** (계획 파일 목록 밖) — 없으면 E2E 픽스처의 권한표가 비어 모든 메뉴 검사가 fail-closed로 떨어진다
4. `CODE_ITEM_DTO_SPEC`의 필드→정보항목 매핑
5. `scopeFor`의 지역 `ENTITY_MENUS` 레지스트리
6. `setCodeItemActive`가 `recordAction`을 부르지 않음 — 대응하는 `CORE_ACTION_TYPE`이 없다
7. `recordAction`이 설정 의존성 미배선 상태에서 fail-open 기본값

1·2는 되돌릴 수 없는 결정에 가까우니 사람이 한 번 봐주면 좋다 — 둘 다 "영구 lint 완화를 새로 만들지 않는다"는 체크포인트 ③ 판단과 같은 방향이다.

### 사람 판단이 필요한 항목 (docs/qa/PHASE-03-BROWSER-QA.md §3 코드표)

- [ ] 항목 추가·수정·비활성화가 화면에서 된다 (MAST-04)
- [ ] 비활성화한 항목이 다른 화면 선택 목록에서 사라지고, 기존 참조는 깨지지 않는다
- [ ] 증빙 종류에 세금 규칙 필드가 붙는다

### 알려진 불안정

`test/e2e/keyboard-nav.spec.ts`의 비밀번호 변경 테스트가 워커 2개 병렬 부하에서 2회 흔들리고 3회차에 통과했다. 이 플랜이 건드린 파일이 아니고(2026-09-19 이후 무변경) 단독 실행에서는 안정적이다 — **기존 불안정**으로 판단해 범위 밖으로 두었다. 재발하면 그때 잡는다.

### 스크린샷

`screens/wave-1/` — `screens/wave-1/` — `code-tables-pc.png`(1440×900) · `code-tables-375.png` · `system-status-pc.png` · `system-status-375.png`. 네 장 모두 POPULATED(코드표 6행, 시스템 상태는 로컬 dev라 GCP 필드가 "확인 불가" — 문서화된 정상 동작).

촬영 아티팩트로 보이는 것 2건 — 실브라우저에서 한 번 확인 필요:
- `code-tables-375.png`에 빨간 "1 Issue" 배지가 표 위에 겹침 → Next.js dev 인디케이터로 보임(실사용 화면엔 없을 것)
- `code-tables-375.png`의 fullPage 캡처에서 모바일 하단 네비가 표 중간에 한 번 더 렌더됨 → `position:fixed` 요소의 Playwright 스티칭 아티팩트로 보임

---

## 웨이브 2 — 03-02 관리자 불리언 → 계급 판정 전량 이관

**소요 43분** · 요구사항 ADMN-01, ADMN-03

### 커밋

| SHA | 내용 |
|---|---|
| `7509041` | docs(03-02): SYSTEM.md §6-0 역할별 탭 표를 계급 5종으로 교체 |
| `dbd80c1` | feat(03-02): 관리자 불리언을 판정 함수로 전량 이관 |
| `47b4fc7` | test(03-02): 관리자 불리언 참조 0을 메타 테스트로 고정 |
| `fa6d880` | docs(03-02): complete plan (SUMMARY.md) |

### 게이트

| 게이트 | 결과 |
|---|---|
| `pnpm lint` | ✓ PASS (기존 boundaries 플러그인 deprecation 경고만) |
| `pnpm typecheck` | ✓ PASS |
| `pnpm lint:sql` | ✓ PASS — 신규 마이그레이션 없음, `.squawk.toml` 무변경 |
| `pnpm build` | ✓ PASS — 13 라우트 |
| `pnpm test:unit` | ✓ PASS — 38 파일 / 363 테스트 |
| `pnpm test:integration` | ✓ PASS — 11 파일 / 48 테스트 |
| `pnpm test:e2e` | ✓ PASS — 59 테스트, **2회 연속 플레이크 0** |
| CLI 스모크 | `--role role-team-lead` → exit 0 · `--role role-does-not-exist` → exit 2 |

오케스트레이터 독립 확인: 테스트 약화 0건 · `.squawk.toml`·eslint 설정 무변경 · `package.json` 무변경(신규 의존성 0).

웨이브 1에서 흔들렸던 `keyboard-nav.spec.ts` 플레이크는 **2회 실행 모두 재현되지 않았다**.

### 계획이 열어둔 것 중 실행자가 판단한 것

1. **`Viewer.roleId`를 `string | null`로 유지** (필수 키, nullable) — `string`으로 좁히면 `can()`/`visible()`의 "계급 없으면 거부" 방어 테스트가 깨진다. 그 테스트는 이 플랜의 `<files>` 밖이다
2. **`scripts/account-cli.ts`의 계급 검증을 둘로 분리** — 순수 동기 `SEED_ROLES` 검사 + 주입 가능한 `ParseArgsDeps`를 통한 비동기 DB 검사. 코드베이스의 기존 `StatusDeps`/`CanDeps` 패턴을 따랐고, `parseArgs`가 Postgres 없이 단위 테스트 가능하면서도 알 수 없는 커스텀 계급은 거부한다
3. **`main()`의 에러 처리를 try/catch/finally 하나로 통합** — 인자 파싱 중 DB 연결이 열려도 `closeDb()`가 항상 돈다
4. **`test/integration/roles.test.ts`를 no-admin-boolean 메타 테스트 예외 목록에 추가** (Task 3이 명시하지 않았다) — `db/schema/auth.ts`와 같은 이유로, 잔존 `is_admin` 컬럼을 정당하게 사용해 백필을 검증하는 코드지 판정 코드가 아니다

### 계획 범위 밖 수정 (전부 컴파일·테스트 파손 대응, SUMMARY에 전문)

`Viewer`/`RoleMenuViewer`/CLI 시그니처 변경으로 6개 파일이 깨져 인라인 수정했다 — `test/unit/permissions/*.test.ts`, `test/unit/action-log/record.test.ts`, `test/integration/code-tables.test.ts`, `test/e2e/code-tables.spec.ts`, `test/unit/deploy/workflows.test.ts`. 더해 새 메타 테스트에 걸릴 `isAdmin`/`is_admin` 주석 참조 3건 정리.

### 스크린샷

`screens/wave-2/` 8장. **이번 웨이브의 핵심 확인 지점 — 계급별로 메뉴가 실제로 다르다:**

- PC 사용자 메뉴: `role-sysadmin`은 「시스템 상태 / 내 정보 / 로그아웃」 3항목, `role-pm`은 「내 정보 / 로그아웃」 2항목(시스템 상태 없음). 상단 1차 메뉴 5개는 설계대로 두 계급 동일
- 폰 하단 탭: sysadmin 「내 차례·결재·손익·더보기」 vs pm 「내 차례·프로젝트·지출결의·더보기」 — 3번째 탭까지 다르다. `role-menu.ts`의 `ROLE_BOTTOM_TABS` 매핑과 일치
- `role-pm`은 `/admin/code-tables`에서 **404**(권한표에 메뉴 없음), sysadmin만 200 — 권한 판정이 라우트 수준에서 실제로 동작한다

`code-tables-375.png`에 웨이브 1과 같은 fullPage 스티칭 아티팩트(고정 탭바 중복)가 있다. 앱 결함 아님.

### 사람 판단이 필요한 항목

이 웨이브에서 새로 생긴 것 없음. 실행자 보고도 "human attention 불필요" — 체크포인트·인증 게이트·스텁 없음.

---

## 웨이브 3 — 03-03 체크박스 격자 · DTO 출구 lint · 누수 스캔

**소요 50분** · 요구사항 ADMN-01, ADMN-02, ADMN-03

### 커밋

| SHA | 내용 |
|---|---|
| `179e7f7` | docs(03-03): §7-13 체크박스 매트릭스 계약 신설, §7-3과 분리 (D-40) |
| `5952bf9` | feat(03-03): DTO 출구 lint 강제 + 누수 스캔 생성기(ADMN-03) |
| `9ef73e7` | feat(03-03): 체크박스 격자 컴포넌트 + 권한표·정보 노출표 화면(ADMN-01/02) |
| `dea00fd` | docs(03-03): complete plan (SUMMARY.md) |

### 게이트

| 게이트 | 결과 |
|---|---|
| `pnpm lint` · `typecheck` · `build` | ✓ PASS |
| ESLint 규칙 프로브 | ✓ 정상 코드 exit 0 · 위반 코드 exit 1 |
| `pnpm test:unit` | ✓ PASS — 39 파일 / 381 테스트 |
| `pnpm test:integration` | ✓ PASS — 13 파일 / 103 테스트 (누수 스캔 51건, 노출 4건 신규) |
| `pnpm test:e2e` | ✓ PASS — 62/62, 2회 실행 플레이크 0 |
| CI (`dea00fd`) | ✓ quality · integration-e2e |

오케스트레이터 독립 확인: 테스트 약화 0건 · `.squawk.toml`·`package.json` 무변경 · 저장소 루트 오염 없음.

### ⚠ 스크린샷 검증에서 **결함 1건 발견** — 수정 진행 중

UI-SPEC이 `backstop`으로 남긴 질문(열이 수십 개일 때 2단 sticky 머리글 + 가로 스크롤이 버티는가)을 DOM 실측으로 다섯 갈래 판정했다.

| # | 판정 항목 | 결과 |
|---|---|---|
| 1 | 실제 열 개수 | **45개** (메뉴 15 × 동작 3). `MENUS`·`PERMISSION_ACTIONS`와 정합 |
| 2 | 가로 스크롤 후 2단 머리글 유지 | ✓ 통과 — `scrollLeft`를 끝(~2016–2102px)까지 이동해도 sticky 유지 |
| 3 | 첫 열(계급)이 가로 스크롤에 묻히는가 | ✓ 통과 — 스크롤 후에도 `x: 20` 고정 |
| 4 | **세로 스크롤 후 머리글 유지** | **✗ 실패 — 실제 결함** |
| 5 | 폰 375px select+KvList 폴백 | ✓ 통과 |

**4번 상세**: `PermissionGrid.module.css`의 `.wrap`이 `overflow-x: auto`만 갖고 높이 제약이 없다 → `.wrap`이 세로 스크롤 컨테이너가 되지 못한다(`scrollHeight === clientHeight`, 항상) → `.colHeader`/`.corner`의 `position: sticky; top: 0`이 아무 효과가 없다 → 문서 전체가 대신 스크롤되며 머리글이 함께 밀려 사라진다.

실측: 페이지 810px 스크롤 → 머리글 y −671(완전히 화면 밖). 다른 실행에서 150px 스크롤 → y 138.875 → −11.125(정확히 스크롤량만큼). **2회 재현.**

**왜 못 잡았나**: 시드 계급이 5종뿐이라 세로 오버플로가 아예 발생하지 않는다. 화면만 봐서는 절대 안 보이고, 계급이 늘어나는 순간(ADMN-08이 계급 추가를 허용한다) 실사용에서 터진다. 검증 에이전트가 임시 계급 20개를 넣어야 재현됐다.

**계약 위반이기도 하다**: 같은 웨이브가 방금 쓴 SYSTEM.md §7-13이 "열 머리글은 top:0 — 정보 노출표는 항목 수가 늘면 세로 스크롤도 생기므로 함께 필요"라고 명시한다. 계약서엔 있고 구현에 그 전제(자체 세로 스크롤 컨테이너)가 빠졌다. 계약을 약화시키지 않고 구현을 계약에 맞추는 방향으로 수정 중이다(RED 테스트 먼저).

### 계획이 열어둔 것 중 실행자가 판단한 것

1. **누수 스캔의 "(계급, 항목) 노출 행 조회 가능" 단언을 "예외 없이 boolean으로 해석된다"로 정의** — `domain/seed`가 sysadmin·pm에게만 노출 행을 시드하므로 "행이 존재한다"로 잡으면 정상 시드 상태에서 실패한다
2. **roleId zod 검증이 정적 `SEED_ROLES`가 아니라 실제 `roles` 표를 조회**(신규 `roleExists()`) — ADMN-08이 이 페이즈 화면 밖에서 계급이 늘어나는 것을 허용한다
3. **`PermissionGridClient`가 함수가 아니라 `kind: "permission" | "visibility"` 문자열 prop을 받는다** — 평범한 클로저는 RSC 서버→클라이언트 경계를 못 넘는다 (Server Action 참조만 예외, `toggleAction`에 사용)

### 계획 범위 밖에서 발견·수정한 것 (중요)

**`ACTION_REGISTRY`가 03-01 이후 테스트에서 한 번도 채워진 적이 없었다.** `actions.ts`가 `"use server"` 경유로 `server-only`/`next/headers`를 전이적으로 import하는데 Vitest가 이를 로드하지 못한다. 즉 **누수 스캔의 동작 축이 그동안 사실상 비어 있었다.** `registerAction(...)` 호출을 `server-only` 비의존 형제 파일 `actions.registry.ts`로 분리하고 03-01의 코드표 액션에도 소급 적용해, 이제 동작 축이 실제로 검사된다.

E2E 작성 중 발견한 버그 하나 더: 첫 초안이 `role-pm`의 권한을 토글해 `code-tables.spec.ts`의 "PM은 404" 단언과 경쟁했다(재현: 404 기대, 200 수신). Playwright가 워커별 DB 초기화 없이 병렬 실행하기 때문. 공유 계급 대신 `insertRole()`로 테스트 전용 임시 계급을 만들어 워커 수·순서와 무관하게 격리했다.

### 사람 판단이 필요한 항목

- **위 4번 결함의 수정 방향** — `.wrap`에 `max-height`+`overflow-y`를 주느냐, 셸 `.main`을 스크롤 영역으로 만드느냐. 수정 에이전트가 셸 구조를 읽고 고르게 했고 선택 이유를 보고하게 했다. 결과는 아래 「웨이브 3 후속 수정」에 기록한다
- 폰(<700px) select+KvList 폴백은 정적 검사와 코드 리뷰로만 확인됐다(전용 모바일 스펙은 이 플랜 범위 밖). 스크린샷은 있으니 육안 확인 권장 — SYSTEM.md §7-13 "폰(375px)"
- `EXPORT_REGISTRY`는 아직 비어 있다(이 플랜에선 정상). **03-04가 `"settings.export"`를 `EXPORT_REGISTRY`와 `leak-scan.test.ts`의 `NULL_DTO_EXEMPT_EXPORTS`에 모두 추가해야 한다**

### 스크린샷

`screens/wave-3/` 5장 — `permissions-pc.png` · `permissions-375.png` · `visibility-pc.png` · `visibility-375.png` · `permissions-scrolled-pc.png`(가로 끝까지 스크롤한 뷰포트 고정 캡처).

검증 중 만든 임시 계급 40개는 모두 `setRoleArchived`로 보관 처리됐다(하드 DELETE는 권한 정책상 차단). `listRoles()`가 보관분을 제외하므로 무해하나, `erp_test`에 남아 있다는 점은 기록해 둔다.

---

## 웨이브 3 후속 수정 — 격자 sticky 머리글 결함 2건

**소요 22분** · TDD(RED → GREEN) 준수

| SHA | 내용 |
|---|---|
| `48dfc91` | test(03-03): 세로 sticky 회귀 테스트(RED) — 수정 전 코드에서 머리글 −356px 이탈로 실패 확인 |
| `3483fd8` | fix(03-03): 세로 sticky 머리글이 실제로 붙게 수정 |

### 채택한 수정 방향과 이유

**`.wrap`이 자체 세로 스크롤 영역을 갖게 한다** (`overflow: auto; max-height: 70vh`). 셸 `.main`을 스크롤 영역으로 만드는 대안은 **CSS 명세상 불가능**하다 — 같은 박스에서 `overflow-x: auto`와 `overflow-y: visible`을 섞을 수 없어 visible 축이 조용히 `auto`로 승격된다. 이게 애초 버그의 근본 원인이기도 하다: `.wrap`은 이미 두 축 모두의 sticky 컨테이닝 블록이었는데, 세로로 스크롤될 만큼 높이가 제한된 적이 없었을 뿐이다. 따라서 (b)안은 가로 스크롤 자기완결성을 잃거나 같은 버그를 한 단계 위에서 재현한다. 변경 반경은 이 컴포넌트 밖으로 나가지 않는다.

**새 토큰 없음.** 기존 `--s-8` 간격 토큰과 `vh` 리터럴(선례: `ui/shell/MoreSheet.module.css`의 `max-height: 85vh`)을 썼다. CLAUDE.md·D-20이 금지하는 것은 새 **색·서체·radius**이고 치수 리터럴은 아니다(stylelint 설정이 이를 명시한다).

### GREEN 과정에서 드러난 두 번째 결함

세로 스크롤이 실제로 동작하기 시작하자, 그룹 머리글 행과 열 머리글 행이 **둘 다 `top: 0`이라 붙는 순간 겹쳤다**(실측 31.6875px 충돌). 첫 번째 버그가 두 번째 버그를 가리고 있던 셈이다 — sticky가 아예 동작하지 않아 겹칠 기회조차 없었다.

`.groupHeader`에 고정 높이(`var(--s-8)`, 이 파일이 `.cellLabel`에 이미 쓰던 32px)를 주고, 그룹 행이 앞설 때만 두 번째 머리글 행을 그만큼 내리는 구조 선택자(`.table thead tr:last-child:not(:first-child)`)를 추가했다. 그룹이 없는 **정보 노출표 머리글은 그대로 `top: 0`**으로 남는다.

### 회귀 테스트 설계

- 테스트 전용 임시 계급 25개(`role-e2e-vscroll-{uuid}-{n}`) 생성, 공유 계급 무접촉, `finally`에서 전부 `setRoleArchived` 처리
- **CSS 속성 존재가 아니라 기하(`boundingBox()` 전후 비교)로 단언** — "sticky는 선언돼 있는데 효과가 없다"를 잡는 건 이것뿐이다. 원래 버그도 `position: sticky`는 멀쩡히 있었다
- `page.mouse.wheel` 실제 스크롤, 델타를 `.wrap`의 실측 스크롤 가능 범위로 클램프(문서 스크롤 체이닝 오염 방지). `.wrap`에 스크롤 여력이 0인 경우(수정 전 결함 상태)는 큰 고정 델타로 폴백해 원래 실패를 정확히 재현
- 같은 테스트가 이어서 가로 스크롤도 수행하고 모서리 머리글 x좌표 불변을 단언 — 가로축 회귀도 같은 자리에서 덮는다

### 게이트

lint · typecheck · lint:sql(0 issues) · build(15 라우트) 전부 PASS. unit 381/381 · integration 103/103 · **e2e 63/63**(신규 회귀 테스트 포함, `keyboard-nav` 플레이크 없음, `mobile-375` 11개 전부 통과). `package.json` 무변경.

오케스트레이터 독립 확인: 새 색·서체·radius 추가 0건 · 테스트 약화 0건.

### 사람이 봐야 할 것 (기존 문제, 이번 수정과 무관)

`test/e2e/permissions-grid.spec.ts`의 **원래 첫 테스트**가 계급을 정적 이름 `"E2E 임시 계급"`으로 만들고 보관 처리하지 않는다. 그래서 이전 실행 데이터가 남은 DB에 같은 스펙을 다시 돌리면 `roles_name_unique` 충돌이 난다(수정 에이전트가 개발 루프에서 2회 겪었다).

CI는 매번 새 DB를 잡으므로 안전하지만, **로컬에서 마이그레이션 없이 e2e를 반복 실행하면 깨진다.** 남은 웨이브 4–7이 로컬에서 e2e를 반복 실행하므로 이 문제를 만날 수 있다 — 각 실행자 프롬프트에 알려두겠다.

---

## 웨이브 4 — 03-04 설정 레지스트리 · 이력형 값 · JSON 내보내기

**소요 60분** · 요구사항 ADMN-05, ADMN-06 · 커밋 7건

| SHA | 내용 |
|---|---|
| `b84acda` | docs(03-04): Phase 4 설정 조회 계약 체크포인트 확정(옵션 A) |
| `1749f43` | test(03-04): 설정 레지스트리·미사용 키 검출·잠금 조회 테스트 |
| `c816e85` | feat(03-04): 두 저장 표·미사용 키 검출·JSON 내보내기 (마이그레이션 **0005**) |
| `700ec32` | docs(03-04): SYSTEM.md §7-14 이력 목록 계약 + §7-2 자동 생성 설정 필드 규칙 |
| `eccc349` | fix(03-04): permissions-grid E2E 비멱등성 수정(임시 계급 이름 유일화 + 보관) |
| `c278705` | feat(03-04): 이력 목록 컴포넌트 + 레지스트리 자동 생성 설정 화면(ADMN-05) |
| `72fc95e` | docs(03-04): complete plan (SUMMARY.md) |

### 게이트

lint · typecheck · build PASS · `lint:sql` 6파일 0 issues. unit 41파일/**422** · integration 15파일/**143** · e2e **66** — 전체 스위트 2회 연속, 플레이크 0. `.squawk.toml`·`package.json` 무변경.

CI(`72fc95e`) ✓ quality · integration-e2e. 오케스트레이터 독립 확인: 테스트 약화 0건, `settings.export`가 `EXPORT_REGISTRY`(`app/(app)/admin/settings/actions.registry.ts`)와 `NULL_DTO_EXEMPT_EXPORTS` 양쪽에 등록됨 — 웨이브 3이 넘긴 숙제 완료.

### 체크포인트 ② 확정

옵션 A 그대로: 두 저장 표 · `getSettingValue(def, {asOf})` · `effective_from <= asOf` 경계 포함 · `readBy` 예외 표시. 멈추지 않았다.

### ⚠ 공정 이탈 — TDD RED 단계를 밟지 않았다

실행자가 스스로 밝혔다: Task 2·3이 `tdd="true"`지만 플랜 frontmatter가 `type: execute`라 GSD의 엄격한 RED 증거 게이트가 안 걸렸고, 범위가 커서(키 18개·표 2개·내보내기·화면 하나) **테스트와 구현을 함께 만들고 커밋만 `test()`/`feat()`로 나눴다.** 없던 RED를 있었다고 주장하지 않고 정직하게 보고한 점은 맞지만, CLAUDE.md의 "실패 테스트 → 최소 구현 → 리팩터"는 GSD 설정과 무관한 프로젝트 상시 규칙이다.

**대응**: 지금 와서 RED를 소급 연출하는 건 연극이라 하지 않았다. 테스트는 존재하고 실제로 통과한다. 웨이브 5–7 프롬프트에 RED 선행을 못박았다. 사람이 이 웨이브의 테스트 품질을 볼 때 참고할 것.

### 스크린샷 독립 검증 (DOM 실측)

`screens/wave-4/` 3장 — `settings-pc.png` · `settings-375.png` · `settings-history-pc.png`.

**UI-SPEC이 `unresolved`로 남긴 「설정 설명 문구 long-text」 항목 → 해소됨.** 실행자 판단("한 줄 힌트로 충분")을 독립 검증했고 버틴다:

| # | 판정 | 결과 |
|---|---|---|
| 1 | 렌더된 키 개수 | ✓ 18/18, 섹션 6개 전부 렌더 (PC·375px 양쪽) |
| 2 | 최장 라벨/힌트 줄바꿈 | 최장 라벨 PC 210px·375px 225px **둘 다 1줄**. 최장 힌트 PC 1줄, 375px 2줄(정상) |
| 3 | 한 줄로 의미가 안 통하는 키 | ✓ 없음 — 18개 전부 "무엇을·언제·어떤 조건"이 한 문장에 자기완결 |
| 4 | §7-7 다섯 상태 | POPULATED ✓ · PARTIAL 해당없음(§7-14 명시) · **EMPTY·LOADING은 구조적으로 도달 불가**(아래) |
| 5 | `keep-all` + `overflow-wrap: anywhere` | ✓ 18개 항목 전부 computed style 확인, 375px에서 단어 중간 깨짐 없음 |

**EMPTY·LOADING이 도달 불가인 이유(스텁 아님, 코드로 확인)**: `domain/seed`가 모든 이력형 키에 2000-01-01 기본 행을 항상 시드해 `entries.length===0`이 될 수 없고, `page.tsx`가 서버 컴포넌트라 초기 렌더에 값이 이미 들어 있으며 `HistoryList`의 `isLoading`은 아예 전달되지 않는다. §7-14가 정의는 해뒀지만 이 화면에서 발동 조건이 없다는 뜻이다.

### ⚠ 검증 중 발견된 결함 2건 (웨이브 4 실행자가 못 잡은 것)

**1순위 — 원본 Zod 오류 JSON이 사용자 화면에 노출된다. 수정 중.**
`tax.rounding.min_withholding`에 -5를 넣고 blur하면:
```
저장하지 못했습니다 · [{"origin":"number","code":"too_small","minimum":0,...}]
```
`errorMessageOf`(`settings-form-client.tsx`)가 `serverError`가 문자열이면 그대로 붙이는데, 이 경로에서 원본 Zod 이슈 배열이 들어온다. **SYSTEM.md §8 카피 규칙 위반**이고 내부 스키마 구조(필드명·제약 코드·경계값)가 그대로 드러난다. 값은 "0"으로 정상 복원됐고 DB에 쓰이지 않았으므로 표시 결함이다. 같은 누수가 다른 화면에도 있는지 함께 점검하게 했다.

**2순위 — 사람 판단 필요.** PC(1440px)에서도 §6-3의 고정 96px 라벨 칸 때문에 "원천징수 절사 단위(원)"(11자) 라벨이 2줄로 줄바꿈된다. 기능 문제는 아니지만 §7-2가 자동 생성 설정 화면과 §6-3의 상호작용을 다루지 않아 방치돼 있다. 고칠지(§7-2에 예외 규칙 추가) 그대로 둘지는 사람이 정할 일이라 손대지 않았다.

### 계획이 열어둔 것 중 실행자가 판단한 것

1. 마이그레이션 0004→**0005** 재번호 (0004는 03-01의 role_id validate가 선점)
2. **`getSettingValue(def, opts?)`에 `viewer`를 받지 않는다** — 읽기는 무게이트, 게이트는 설정 화면에 둔다. 쓰기 3개 함수만 `admin.settings` 쓰기 권한을 검사한다. 체크포인트 ② 결정문이 이 점을 명시하지 않았다
3. §7-2의 5행 매핑표를 넘어 **6번째 내부 필드 종류 "multi-enum"** 추가 — `action_log.optional_types`(`z.array(z.enum(...))`)에 필요. 체크박스 그룹으로 렌더
4. `tax.basis_date.*` enum을 ROADMAP이 명명한 2개가 아니라 **4개**로(payment_date/evidence_date/issue_date/document_date) — Phase 4 여유분, 기본값 불변
5. `record.ts` ↔ `registry.ts` 순환 import를 함수 본문 내 동적 `import()`로 해소(오류 시 fail-open)

### 범위 밖 수정

기존 `permissions-grid.spec.ts` 비멱등성(정적 계급 이름 `"E2E 임시 계급"` 미보관)을 별도 커밋 `eccc349`로 고쳤다 — 내가 디스패치 프롬프트에서 미리 알린 건이다. 이름 유일화 + `finally` 보관 처리.

### 알려진 스텁

없음. 설정 가져오기 UI(파일 업로드)는 플랜이 의도적으로 범위 밖에 뒀고, `importSettings` + 통합 테스트가 유일한 인터페이스이며 화면이 내보내기 버튼 옆에 그렇게 안내한다.

---

## 웨이브 4 후속 수정 — Zod 오류 JSON 누수

**소요 10분** · TDD(RED → GREEN) 준수

| SHA | 내용 |
|---|---|
| `c3dd448` | test(03-04): RED — 원본 zod 이슈 JSON이 설정 화면에 절대 닿지 않아야 한다 |
| `e113c7d` | fix(03-04): GREEN — Server Action 단일 진입점에서 ZodError를 한국어 카피로 변환 |

### 보고된 원인이 한 겹 얕았다

검증 에이전트는 `settings-form-client.tsx`의 `errorMessageOf`를 지목했지만, 그건 **표시 말단**이고 진짜 누수는 한 층 위였다:

`lib/actions/client.ts`의 `handleServerError`(파일 주석: "이후 모든 페이즈의 유일한 Server Action 진입점")가 `e instanceof Error ? e.message : ...`로 처리하는데, **zod 4.6.5의 `ZodError.message`가 `JSON.stringify(issues, null, 2)`다.** `ZodError instanceof Error`가 참이라 가공 없이 통과했다.

`errorMessageOf`만 고쳤다면 같은 원본 문자열이 다른 세 화면의 `serverError`에도 계속 도달했을 것이다. 수정 에이전트에게 "보고를 액면 그대로 믿지 말고 직접 재현해 원인을 확인하라"고 지시한 것이 값을 했다.

### 수정

`lib/actions/zod-error-message.ts` 신설 — `koreanZodErrorMessage(error: ZodError)`가 zod 이슈 코드(`too_small`·`too_big`·`invalid_type`·`invalid_value`·`not_multiple_of`·`invalid_format`·기본)를 SYSTEM.md §8 규칙 3(원인 · 다음 행동, 한 줄, 가운뎃점 구분)에 맞는 한국어 한 줄로 변환한다. `handleServerError`가 `ZodError`만 특별 처리하고 나머지 `Error`는 기존 경로를 탄다.

재현 케이스 결과: `"0 이상이어야 합니다 · 값을 확인해 주세요"` — 사람에게 의미 있는 경계값은 남기고 zod 내부 구조는 전부 버린다. 화면 최종 문구는 `저장하지 못했습니다 · 0 이상이어야 합니다 · 값을 확인해 주세요`로 §7-7의 ERROR 예시(`저장하지 못했습니다 · 네트워크 · 다시 시도`)와 같은 3단 구조다.

### 영향 범위 점검 (누수 경로를 닫았는가)

- `grep -rn createSafeActionClient` — 앱 코드에 실제 클라이언트 인스턴스는 `lib/actions/client.ts` 하나뿐. **단일 지점 수정이 맞다**
- `grep -rln '\.parse(' domain/` — `domain/settings/registry.ts`가 유일. 오케스트레이터가 독립 확인함
- `permission-grid-client.tsx` · `code-item-form.tsx` · `change-password-form.tsx` 세 화면도 `serverError`를 같은 방식으로 가공 없이 렌더하지만, 각자의 도메인 호출이 `.parse()`를 쓰지 않아 현재는 노출되지 않는다. 이제 같은 수정으로 **선제적으로 보호된다**

### 데이터 안전성

`setSettingValue`가 저장소 쓰기 전에 검증하므로 아무것도 기록되지 않았다 — 표시 전용 결함이 맞다(검증 에이전트 보고와 일치, 수정 에이전트가 독립 확인).

### 게이트

lint · typecheck · build PASS. unit **425/425**(42파일, 신규 RED→GREEN 포함) · integration 143/143 · e2e 66/66(`settings.spec.ts` 포함, `keyboard-nav` 플레이크 없이 통과). 신규 의존성 0(zod는 이미 있다).

### 남긴 것 (범위 밖 판단)

`errorMessageOf`의 `저장하지 못했습니다 · ` 접두사는 그대로 뒀다. §7-2의 2단 필드 오류 스타일로 재설계하는 것은 이 결함 티켓의 범위가 아니라고 판단했다 — 타당하다.

---

## 웨이브 5 — 03-05 조직·사람·법인카드

**소요 62분** · 요구사항 MAST-02, MAST-03, ADMN-08 · 커밋 4건

| SHA | 내용 |
|---|---|
| `37ec3c4` | feat(03-05): Task 1 — 조직·법인카드 스키마, `teamAtDate`, 마이그레이션 **0006** |
| `ba2f89b` | feat(03-05): Task 2 — 사람 관리, 등록 한 흐름에서 계정·초기 비밀번호까지 |
| `e17d6bd` | feat(03-05): Task 3 — 법인카드 관리 화면 |
| `e963f2d` | docs(03-05): complete plan (SUMMARY.md) |

### 게이트

lint · typecheck · build PASS · `lint:sql` 7파일 0 issues. unit **438** · integration **421**(19파일) · e2e **70**. CI(`e963f2d`) ✓.

integration이 143 → 421로 뛴 것은 누수 스캔 생성기에 새 DTO·액션이 물리면서 생성 케이스가 곱으로 늘어난 결과다 — **오케스트레이터가 직접 `pnpm test:integration`을 돌려 19파일 421테스트 통과를 확인했다.**

오케스트레이터 독립 확인: 테스트 약화 0건 · `.squawk.toml`·`package.json`·eslint 설정 무변경.

### TDD — 부분 준수 (웨이브 4보다 개선)

순수 함수 두 개는 **RED를 실제로 확인**했다: `teamAtDate`·`cardOwnerKind`를 모듈이 없는 상태에서 테스트 실행 → "Cannot find package" 실패 확인 → 구현. 복합 흐름(`registerPerson`·화면)은 RED 선행을 하지 않았고 그렇다고 정직하게 보고했다.

### 주목할 발견 — 순환 import가 권한 검사를 거짓으로 만들었다

`domain/permissions/roles.ts` → `domain/action-log/record.ts` → `domain/viewer.ts` → 다시 `roles.ts`로 도는 고리가 **Vitest의 vite-node에서 `SYSTEM_VIEWER`의 live binding을 깨뜨렸다.** 실제 DB 권한 검사가 `true`여야 할 자리에서 `false`를 반환했고, **vitest 밖에서는 재현되지 않는다**. 웨이브 4가 `record.ts`↔`registry.ts`에서 쓴 동적 import 패턴으로 풀었다.

같은 구조의 고리가 두 웨이브 연속 나왔다 — `domain/` 안에서 `record.ts`·`viewer.ts`·`registry.ts`·`roles.ts`가 서로를 끌어당기는 형태다. Phase 4 이후에 또 나올 수 있으니 사람이 구조를 한 번 볼 만하다.

### 그 밖의 계획 범위 밖 수정

- `plant8/no-row-type-escape`가 `listRoles`/`createRole`의 `RoleRow` 반환을 잡아 `RoleDto` + `role.value` 정보 항목 추가 (웨이브 3이 만든 lint 규칙이 실제로 일함)
- Playwright `getByLabel("팀")` 모호성 — 중첩 `<label>{text}<select>` 구조에서 Chromium의 접근 가능 이름 계산이 옵션 텍스트("팀장"에 "팀" 포함)를 흡수했다. 이 플랜의 새 폼을 전부 `<label htmlFor>` + `<select id>`로 전환
- `eslint-plugin-react-hooks` 불변성 규칙이 서버 컴포넌트 본문의 `let` 재할당을 잡아 헬퍼 함수로 추출

### 실행자가 판단한 것

1. **자기 계급 변경을 양방향 전부 차단** — 순위 컬럼이 없어(D-33) "강등"을 계산할 수 없다. `matrix.ts`의 자기 잠금 방지 선례를 따라 더 안전한 전면 차단을 택했다
2. `PersonDto.roleName`/`currentTeamName`을 행마다 개별 해석(배치 아님) — 10~30명 규모에서 문제없다는 YAGNI 판단
3. `updateCorpCardOwner`는 `setCorpCardActive`와 달리 멱등성 검사 없이 항상 `recordAction`을 부른다

### ⚠ DOM 감사 결과 — 결함 4건 발견, 수정 중

스크린샷 9장(`screens/wave-5/`)과 함께 DOM 실측 감사를 돌렸다.

**1순위 (정보 노출) — 법인카드 중복 등록 시 원본 SQL INSERT 문 전체가 화면에 노출된다**

같은 발급사+뒤4자리로 재등록하면:
```
Failed query: insert into "corp_cards" ("id", "issuer", ... "holder_user_id", ...)
values (default, $1, $2, ...) returning ...
params: E2E웨이브5카드사-..., 8191, 중복카드웨이브5, personal, <내부 user id>, ...
```

**구조적 원인이 핵심이다.** `lib/actions/client.ts`의 `handleServerError`가
```ts
if (e instanceof ZodError) return koreanZodErrorMessage(e);
return e instanceof Error ? e.message : "서버 오류가 발생했습니다.";
```
즉 **denylist**다 — 명시적으로 처리하지 않은 모든 오류 유형이 원본 `message`를 그대로 브라우저에 흘린다. Drizzle은 SQL 전문과 바인드 파라미터를 `message`에 담는다.

웨이브 4의 Zod 누수 수정이 ZodError 분기만 추가해 **한 갈래만 막고 이 종류를 살려뒀다.** 수정 에이전트가 보고서에 그 폴백을 명시했는데 내가 함의를 놓쳤다 — 내 판단 착오다. 이번엔 allowlist로 뒤집어 구조를 고친다.

**2순위 (접근성)** — `/admin/people/org`의 본부·팀 이름 변경 인라인 입력 4개, `/admin/people/roles`의 계급 이름 변경 입력 5개 전부 `label`·`aria-label`·`aria-labelledby`가 **전혀 없다**. 스크린 리더 사용자는 이 입력이 무엇인지 알 수 없다.

**3순위 (반응형)** — 375px에서 가로 스크롤 발생: org `scrollWidth` 399 vs 375, roles 416 vs 375. 원인 특정됨: rename `<input>`이 `styles.select`를 쓰는데 `.select`에 `width`가 없고, `<select>`와 달리 flex 부모가 없어 브라우저 기본 폭(`size=20`)이 최소 콘텐츠 폭이 된다. `roles-375`의 머리글 「시드 여부」「정렬」「동작」이 한 글자씩 세로로 쪼개지는 것도 같은 원인.

**4순위** — `.tertiary` 버튼이 `height: auto; padding: 0`이라 좁은 셀에서 텍스트가 꺾이면 형태가 무너진다(「비활성화」가 19×78로 렌더). 터치 타깃 미달도 함께: 「상세」 13×42, 「숨김 포함」 43×19.

### §7-7 다섯 상태 — 구조상 도달 불가 항목이 또 나왔다

- corp-cards: EMPTY ✓(실측) · POPULATED ✓
- people: **EMPTY 도달 불가** — `listPeople`이 뷰어 자신을 포함해 전체를 나열하므로, 화면을 보려면 최소 관리자 1명이 로그인해 있어야 하고 그 자신이 항상 1행을 채운다
- org·roles: **EMPTY 도달 불가** — 시드가 본부 2·팀 2를 항상 넣고 `SEED_ROLES` 5종은 마이그레이션으로 들어간다 (DB 실측 org_units=2/teams=2/roles=5 일치)
- 전 화면 LOADING·PARTIAL: 서버 컴포넌트라 클라이언트 스켈레톤 자체가 없다 — 결함이 아니라 구조

웨이브 4의 설정 화면과 같은 패턴이 세 번째다. §7-7이 정의한 다섯 상태 중 EMPTY·LOADING이 이 제품의 관리자 화면에서 **구조적으로 발동하지 않는다**는 뜻이라, 계약 자체를 손볼지 사람이 판단할 만하다.

### 통과 항목

- `word-break: keep-all` + `overflow-wrap: anywhere` ✓ — computed style 실측, 공백 없는 긴 혼합 문자열도 정상 줄바꿈
- people 등록 폼·상세·corp-cards 등록 폼의 라벨 짝 ✓ 전부 정상
- BottomTabs 터치 타깃 ✓ 91×44 / 103×44
- PC 40px 버튼들은 SYSTEM.md 187·751행이 명시한 의도된 값 — 결함 아님

### 사람이 봐야 할 것 (이번 웨이브 범위 밖)

**상단 바 사용자 메뉴 버튼이 56×19로 44px에 크게 미달한다.** 웨이브 5 화면 5개 전부에서 재현되지만 원인은 `ui/shell/TopBar`(이전 페이즈 산출물)라 손대지 않았다.

스크린샷의 빨간 "1 Issue" 배지는 앱 결함이 아니다 — Playwright의 CDP가 입력에 `style="caret-color:transparent"`를 인라인 주입해 생기는 하이드레이션 경고이고, 앱 코드에 그런 곳이 없음을 grep으로 확인했다(테스트 환경 노이즈).

---

## 웨이브 5 후속 수정 — 감사 결함 4건 (RED→GREEN 8커밋)

**소요 50분** · 네 결함 모두 RED를 실제로 확인한 뒤 GREEN

| # | RED | GREEN | 내용 |
|---|---|---|---|
| 1 | `973bec2` | `723f5e3` | handleServerError를 **허용목록으로 반전** |
| 2 | `9b79d43` | `a772004` | 인라인 이름 입력에 행 식별 가능한 접근 가능한 이름 |
| 3 | `41e0ea1` | `dc89853` | `.select{width:100%}` + `.table th{white-space:nowrap}` |
| 4 | `c515920` | `25f7fdf` | `.tertiary{white-space:nowrap}` + 터치 목표 44×44 |

### 결함 1 — 구조를 고쳤다

`handleServerError`를 denylist → **allowlist**로 반전:

```
ZodError        → 기존 한국어 변환기
UserFacingError → message 통과
그 외           → "처리 중 오류가 발생했습니다 · 잠시 후 다시 시도해 주세요"
                  + log.error로 원본은 서버에만 기록
```

**기존 컨벤션을 살린 선택**: 코드베이스에 이미 `ForbiddenError`·`WeakPasswordError`·`NotFoundError` 등 전용 오류 클래스 **약 30개**가 `extends Error {}`로 있었다. 즉 "이건 의도된 운영자 문구다"를 표현하는 관례가 이미 존재했다. 각 클래스를 `extends UserFacingError`로 바꾸는 한 줄 변경(약 20파일)으로 기존 `instanceof` 검사를 하나도 건드리지 않고 전부 보존했다. 새 관례를 발명하지 않았다.

맨 `throw new Error("한국어…")` 9곳도 `UserFacingError`로 전환했다.

**일부러 일반 `Error`로 남긴 것** (이제 일반 문구 + 서버 로그):
- `repositories/*.ts`의 `"OOO insert가 행을 반환하지 않았습니다"` 7건 — 내부 불변식 단언이지 "원인·다음 행동" 운영자 안내가 아니다
- 등록 시점 불변식 3건(`DuplicateDtoError` 등) — 실제 HTTP 요청에서 도달 불가
- `lib/env.ts`의 기동 검증 — 프로세스 경계라 `handleServerError`에 닿지 않는다

법인카드 중복은 `lib/pg-errors.ts`의 `isUniqueViolation()`(`code===23505` + 제약 이름, drizzle의 `.cause`까지 확인)으로 잡아 `이미 등록된 카드입니다 · 발급사와 뒤 4자리를 확인하세요`로 변환한다.

오케스트레이터 독립 확인: 남은 `e.message` 2건은 주석과 **서버 측 `log.error`**용이라 클라이언트로 나가지 않는다.

### 결함 3·4 — 원인을 먼저 검증하고 고쳤다

감사가 지목한 원인을 액면 그대로 믿지 않고 Playwright 실측으로 확인한 뒤 수정했다. 결과: org 399→**375**, roles 416→**375**. 3차 버튼 22.78×39.375 → **40.59×20.19**. 터치 목표는 폰(`<=699.98px`)에만 `min-width/min-height: var(--touch-min)` 적용, PC 40px 버튼은 SYSTEM.md 규정대로 건드리지 않았다.

**회귀 테스트가 측정 기반이다** — `scrollWidth <= clientWidth`, bounding box 실측. 결함 3이 완전히 녹색인 스위트를 통과해 살아남은 이유가 바로 측정 없는 CSS였다. e2e가 70 → **83**으로 늘었고 신규 스펙 6개(org·roles·mobile-org·mobile-roles·mobile-corp-cards·mobile-people)가 생겼다.

### 게이트

lint · lint:sql(7파일 0 issues) · typecheck · build PASS. unit **452/452** · integration **422/422** · e2e **83/83**.

e2e 첫 실행에서 `permissions-grid.spec.ts`가 1회 흔들렸다(2워커 병렬 부하에서 로그인 리다이렉트 타임아웃). 단독 4/4 통과, 전체 재실행 83/83 통과로 `keyboard-nav`와 같은 종류의 플레이크로 확인했다 — **테스트를 약화시키지 않았다.**

### 파일 이동 1건

`lib/db/pg-errors.ts` → `lib/pg-errors.ts`. `boundaries/element-types` eslint 규칙이 경로에 `db/` 세그먼트가 있으면 `db` 요소로 분류해, `domain/corp-cards`가 import할 수 없었다.

### 사람이 한 번 볼 것

저장소 계층의 `"insert가 행을 반환하지 않았습니다"` 7건을 `UserFacingError`로 만들지 않고 일반 문구+로그로 둔 판단. 수정자도 나도 옳다고 보지만(운영자 안내가 아니라 내부 단언), 기존(전부 노출)에서 **동작이 바뀐 지점**이라 리뷰에서 한 번 볼 만하다.

TopBar 56×19 터치 목표는 이전 페이즈 산출물이라 열어뒀다.

---
