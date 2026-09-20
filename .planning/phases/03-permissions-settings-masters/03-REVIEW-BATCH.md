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
| 4 | 03-04 | ○ 대기 | — | — | — | — | — | — |
| 5 | 03-05 | ○ 대기 | — | — | — | — | — | — |
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
