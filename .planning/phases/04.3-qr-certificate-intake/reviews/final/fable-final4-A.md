검토자: Fable (Codex 사용 한도로 대체, 한도가 풀리면 Codex 재확인 필요)

# Phase 04.3 최종 라운드 4 — 샤드 A(04.3-01 · 02 · 13) 전체 계획 검토

읽기 전용으로 검토했다(리포 파일 수정 · 커밋 없음). 계획의 주장은 리포 코드 · `node_modules` · 로컬 Postgres 16.13 · squawk 2.65.0으로 실측 대조했다. 실측용 임시 파일 · 임시 DB(`erp_fable_check`)는 스크래치패드와 로컬 Postgres에만 만들었고 DB는 확인 뒤 지웠다(개발 DB `erp` · `erp_test`는 건드리지 않았다).

경로 약어: `P/` = `.planning/phases/04.3-qr-certificate-intake/`.

## 1. Round 3 지적의 해결 여부

| Round 3 지적 | 판정 | 근거(plan:line · repo) |
|---|---|---|
| #1 MAJOR · 당첨자 `UNIQUE(event_id, name, phone)`과 04.3-10 행별 UPDATE 맞교환 충돌 | **RESOLVED** | 02:90(제약을 `DEFERRABLE INITIALLY IMMEDIATE`로, 10 일괄 저장만 `SET CONSTRAINTS … DEFERRED`) · 02:245(제약 이름 명시 `cert_winners_event_id_name_phone_unique`) · 02:253(②-b custom 마이그레이션 본문: DROP → UNIQUE INDEX → `ADD CONSTRAINT … UNIQUE USING INDEX … DEFERRABLE INITIALLY IMMEDIATE`) · 02:274(verify가 `pg_constraint`의 `condeferrable=true`·`condeferred=false`를 단언) · 10:53 · 10:219~220(맞교환 `saved` · 최종 중복 검사/커밋 단계 거부 통합 테스트) · 10:242(맞교환 케이스 RED 이유 = 23505) · 10:245(`deferWinnerPersonUniqueTx`) · 10:262(COMMIT의 23505를 `duplicatePerson`으로) · 13:26 · 13:105(재생성 순서 `cert_intake` → `--custom`) · 13:118(새 DB에서 같은 `pg_constraint` 확인). **실측:** 로컬 Postgres 16.13 임시 DB에서 ②-b 본문 그대로 실행 → `condeferrable=t, condeferred=f` · 즉시 모드 맞교환 첫 UPDATE 23505 · `SET CONSTRAINTS … DEFERRED` 뒤 맞교환 통과 · 최종 중복은 COMMIT에서 23505 · `ON CONFLICT (event_id,name,phone)`는 「deferrable unique constraints … as arbiters」 오류 · NULL 두 줄은 서로 다름(4행) — 02:90 · 02:245 · 02:253의 네 주장 전부 맞다. squawk 2.65.0(`.squawk.toml`)로 ②-b 본문을 돌리면 **0건**, 괄호형 `ADD CONSTRAINT … UNIQUE (…) DEFERRABLE`은 `constraint-missing-not-valid` · `disallowed-unique-constraint` · `require-statement-timeout` 3건 — 02:253의 「계획 시점 실측」과 일치한다. `drizzle-kit` 0.31.10 `bin.cjs`의 `generate --custom`이 `writeResult({cur: custom2, type:"custom"})`로 스냅샷(`prevId` = 직전 `id`)과 journal 항목을 쓰는 것도 확인했다(13:105 주장 맞음). |

Round 2 이전 항목(final3 표의 #1~#3)은 Round 3에서 RESOLVED로 닫혔고, 이번 판에서 되돌아간 흔적은 없다(06:211 `insertActionLogTx` · 13:104~106 journal 항목 비교 · 01:182 누적 20회 문장 그대로).

## 2. 새 발견

### 1. MAJOR — `TextField`에 `size?: "default" | "external"`를 더하면 `size="external"`이 타입 오류다(02:391 · 02:397 ↔ `ui/input/TextField.tsx:5~8`)

- 계획: 02:391 「`ui/button` · `ui/input`: `size?: "default" | "external"` prop」, 02:397 「E3 = `TextField size="external"`」, 02:406 verify `pnpm lint && pnpm typecheck && pnpm build`.
- 리포: `ui/input/TextField.tsx:5~8`은 `Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "aria-invalid" | "aria-describedby"> & {…}`다 — HTML `<input>`의 `size?: number`가 Omit되지 않는다. 여기에 `size?: "default" | "external"`를 교차하면 프로퍼티 타입이 `number & ("default" | "external")` = `never`가 되어 `size="external"`이 거부된다.
- 실측: 같은 형태의 타입을 리포의 `tsc`(TypeScript 6, `--strict`)로 돌리면 `error TS2322: Type 'string' is not assignable to type 'undefined'`. 즉 Task 2 verify(02:406)가 E3 화면에서 빨갛게 서고, RED→GREEN 순서와 무관하게 구현이 막힌다.
- `Button`은 `Omit<ButtonHTMLAttributes, "disabled">`(`ui/button/Button.tsx:8`)라 `size` 충돌이 없다 — 문제는 `TextField`뿐이다.
- 고칠 곳: 02:391에 「`TextField`는 Omit 목록에 `"size"`를 더해 HTML `size` 속성을 걷어낸 뒤 variant를 둔다(기존 호출부에 `size` 속성 사용 없음 확인)」 한 줄. 02:423 acceptance(「기존 호출부 diff 없음」)와 어긋나지 않는다.

### 2. MAJOR — 02가 정한 `DbOrTx` 넓히기가 `execute`를 빼놓아 04.3-10의 `SET CONSTRAINTS … DEFERRED`가 타입으로 막힌다(02:367 ↔ 10:245 · 10:255 · `db/client.ts:48` · `lib/db-transaction.ts:10`)

- 계획: 02:367 「`db/client.ts`의 `DbOrTx`를 `Pick<typeof db, "insert" | "update" | "select" | "delete">`로 넓혀 GREEN」 — 이 페이즈에서 `DbOrTx`를 고치는 유일한 자리이고, 02 `<interfaces>`(02:190~209)와 10의 파일 목록(10:7~38 — `db/client.ts` 없음) 어디에도 `execute`를 더하는 말이 없다.
- 10:245 「`deferWinnerPersonUniqueTx(viewer, tx)` — 그 tx에서 `SET CONSTRAINTS cert_winners_event_id_name_phone_unique DEFERRED` 한 문장만」, 10:255 「`withTransaction` 시작 → … → `deferWinnerPersonUniqueTx`(②-a)」. `SET CONSTRAINTS`는 `insert/update/select/delete` 빌더로 낼 수 없고 `tx.execute(sql\`…\`)`가 필요하다.
- 리포: `lib/db-transaction.ts:10`이 콜백에 `tx: DbOrTx`를 준다 · `db/client.ts:48` `DbOrTx = Pick<typeof db, "insert" | "update" | "select">` · 실제 `tx`(drizzle `PgTransaction`, `node_modules/drizzle-orm/pg-core/session.d.ts:49`가 `PgDatabase`를 상속)는 `execute`를 갖지만 Pick이 감춘다. 리포에서 `.execute(`를 쓰는 곳은 `repositories/health.ts:7`(전역 `db`)뿐이라 `tx.execute`의 선례도 없다.
- 결과: 04.3-10 Task 1이 `pnpm typecheck`에서 `Property 'execute' does not exist on type 'DbOrTx'`로 선다. 02가 이미 같은 이유로 `delete`를 더하는 RED→GREEN(02:367)을 두었으므로, 같은 줄에 `"execute"`를 함께 넣거나(권장 — 10이 `db/client.ts`를 건드리지 않게) 10의 파일 목록에 `db/client.ts`와 같은 RED→GREEN을 더해야 한다. 어느 쪽이든 02 `<interfaces>`에 「`DbOrTx`에 `execute` 포함 — 10의 `SET CONSTRAINTS`가 쓴다」 한 줄이 있어야 계약이 닫힌다.

### 3. NOTE — 02 Task 2 `<files>`에 `db/client.ts`가 없다(02:300 ↔ 02:367)

02:18(플랜 머리 `files_modified`)에는 있고 Task 2 본문 ⑨(02:367)가 고치는데 Task 2 `<files>`(02:300)에는 빠져 있다. 실행에는 영향이 없지만 실행자가 태스크 파일 목록만 보고 「이 태스크 밖 파일」로 오해할 수 있다.

### 4. NOTE — 루트 레이아웃의 `SessionRefresh`가 공개 화면 `/c/[token]`에도 마운트된다(`app/layout.tsx:27` · `app/session-refresh.tsx:6`)

02:393 「`app/c/[token]/`(`(app)` 그룹 밖 — 셸·세션 게이트 없음)」은 맞지만, 루트 `app/layout.tsx:27`이 `<SessionRefresh />`를 모든 라우트에 그리고 그 컴포넌트는 마운트 때 `/api/auth/get-session`을 한 번 부른다(`app/session-refresh.tsx:6`). 보안 구멍은 아니다(세션 없음 응답뿐)이나 「앱 세션과 분리된 별도 경로」(02:84)라는 진술과 어긋나는 요청이 수령자 화면에서 한 번 나가고, `proxy.ts:15`의 matcher(`/api/auth/*`)를 지난다. 13:146의 「서버 액션 요청 0건」 감사는 액션 요청만 세므로 영향이 없다. 02 ⑮에 「공개 라우트에서는 `SessionRefresh`를 그리지 않는다(레이아웃 분리 또는 경로 조건)」를 둘지, 아니면 수용하고 SUMMARY에 적을지 정해 두면 `/cso`에서 다시 묻지 않는다.

### 5. NOTE — `MENUS`에 `certs.events`를 더하는 시점(02:354)과 헤더 주석(`domain/permissions/menus.ts:2~6`)

주석은 「뒤 플랜은 화면만 더하고 이 배열은 건드리지 않는다」이지만 PATTERNS(`P/04.3-PATTERNS.md:243`)의 append-only 규칙대로 항목만 더하는 것이라 문제는 아니다. 확인한 사실: `app/(app)/layout.tsx:25~29`가 `MENUS` 전부를 `can`으로 걸러 `allowedMenus`로 넘기고 `ui/shell/role-menu.ts:131 · 142`는 `ADMIN_MENUS`에 있는 키만 그리므로, 04.3-09 전에도 시스템 관리자 내비게이션에 낯선 항목이 생기지 않고 `test/unit/admin-menu-registry.test.ts:16~22`(`admin.*` 키만 대조)도 깨지지 않는다.

## 3. 이번 판에서 맞다고 확인한 계획 주장(재검토 때 다시 볼 필요 없음)

- 01:143~150 grep · awk 단언이 현재 `REQUIREMENTS.md:244~247` · `:282`(`4 (11)` · `11 (4)`) · `ROADMAP.md:38 · :611 · :618~619 · :621` 형식과 맞고, awk는 현재 파일에서 합 86 · 종료 0이다.
- 01:171 · 01:172의 줄 번호(SYSTEM §6-5 456행 · §7-7 805행 · §10 1031행 · 실물 171행 · 46/47/58/112/124행)가 실제와 같다. 01:196의 옛 문장 두 개는 지금 `SYSTEM.md:487~488 · :823`에 있고 `응답 없음`은 0건이다.
- 01 Task 2·3이 SYSTEM.md에 새로 쓰는 토큰(`--print-ink` · `--s-12` · `--surface` · `--line` · `--fs-xs/sm/md/lg/xl` · `--fg/bg/muted/accent/success/warning`)은 전부 `docs/design/tokens.css`에 있어 `test/unit/design-system-docs.test.ts:122~136`(참조 토큰 실재 단언)이 녹색을 유지한다. 같은 파일 :144~146의 「2026-09-19 기록 6건」 셈은 01이 더하는 2026-09-24 절과 무관하다.
- 02:230 · 02:203: Playwright 1.63 `testProject.workers`(`types/test.d.ts:757`) · webServer가 `process.env`를 물려받음(`lib/runner/index.js:1920~1922`의 `{...process.env, ...}`) · CLI 파일 필터가 의존 프로젝트에 걸리지 않음(`lib/runner/index.js:2517~2523` — `--no-deps`일 때만 비움) 모두 맞다.
- 02:228 · 02:229: `lib/actions/handle-server-error.ts:26~29`가 `message`를 로그에 싣고 `lib/log.ts:6~15`의 `...fields`가 바깥 `message`를 덮는다 · 옛 단언은 `test/unit/actions/handle-server-error.test.ts:80~90`(계획의 79~88과 한두 줄 차이, 내용 같음).
- 02:317 · 02:382: `domain/document-numbering/index.ts:105`가 `formatDocumentNumber` → `loadDocumentNumberFormat`(현재 `export` 아님, :68) → `getSettingValue`로 전역 `db`(`repositories/settings.ts:12`)를 쓴다 · `db/client.ts:32~35` 풀에 대기 시간 한도가 없다 · `DB_POOL_MAX` 기본 5(`lib/env.ts:54`). 「풀 교착 없음」 RED/GREEN 설계가 실제 코드 경로와 맞는다.
- 02:259: `domain/settings/keys.ts:2`가 이미 `env`를 import하므로 `SETTING_DEFS` 조건부 spread가 가능하고, `app/(app)/admin/settings/actions.ts:18~20`의 `findSettingDef`가 `등록되지 않은 설정 키입니다`로 거부한다. `test/unit/settings/registry-coverage.test.ts:26`의 파서는 `export const … : SettingDef<…> = {` 형태만 보므로 조건부 등록에 영향이 없다.
- 02:364 · 02:381: `recordAction`(`domain/action-log/record.ts:118~122`)은 tx 인자가 없고 `entity`는 자유 문자열(:78) · `document_create` · `document_submit`은 핵심 종류(:12 · :14)이며 `ACTION_LOG_OPTIONAL_TYPES` 기본값이 선택 종류 전부(`keys.ts:53`)라 Task 3 ⑦의 「`document_submit` 1건」 단언이 기본 설정에서 성립한다.
- 02:246: 확인 멱등 맵 계약이 03(`countRecentMisses` 6곳) · 10 · 12에서 같은 칸 이름으로 쓰인다. 02 `<interfaces>`의 이름들(`contactMissing` · `findIndistinguishable` · `expiredProof` · `rrnRecheckConfirmed` · `CERT_CONSENT_VERSION` · `listStaleSignatureUploadIntents` · `getSignatureStore` · `createCertEvent` · `cert.setup.ts` · `assertCertFeatureEnabled`)이 03~12에서 같은 철자로 참조된다. 02:249의 `privacy_session_activity`는 07:15 · 07:150이 `repositories/privacy-session-activity.ts` · `db/schema/privacy-session-activity.ts`로 쓴다.
- 02:325: `lib/viewer.ts:1`이 `server-only`라 액션 파일을 Vitest가 import하지 못한다는 사실과, 누수 스캔(`test/integration/leak-scan.test.ts` · `test/unit/leak-scan-coverage.test.ts:41~57`)이 `actions.registry.ts` 유무만 보고 `actions.ts` 자체를 훑지 않아 `app/c/[token]/actions.ts`에 등록 파일이 없어도 깨지지 않는 점. `test/unit/page-auth-guard.test.ts:14`는 `app/(app)`만 훑어 `app/c/`에 세션 검사를 요구하지 않는다.
- 02:394~396: Next 16 문서(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md:15`)가 `notFound()`를 Server Functions · Route Handlers에서 허용하고, next-safe-action 8.7.3(`dist/errors-*.mjs:65`)이 redirect · HTTP fallback 오류를 프레임워크 오류로 다시 던진다.
- 13:93 · 13:109 · 13:118: `package.json`의 `db:migrate`가 `--env-file-if-exists=.env.local`(Node 22.22, 환경이 파일보다 우선) · `scripts/reset-test-db.sh`가 같은 `psql -h 127.0.0.1` 형태 · `docs/ARCHITECTURE.md` 현재 237줄(`test/unit/docs-limits.test.ts:22~23` 상한 300). `test/unit/db/`는 아직 없어 02 ⑦의 「없으면 만든다」 갈래가 실행된다.
- 13:120의 `node -e` 검증 스크립트를 손으로 따라가면 `A` 넷(SQL 둘 · 스냅샷 둘) + `M` 하나(journal) · journal 앞부분 동일 · 스냅샷 체인 · custom SQL 본문 검사 순서가 맞고, 태그에서 스냅샷 번호를 `split("_")[0]`으로 얻는 방식이 현재 `_journal.json`(`0010_revenue_entries` 형태)과 맞는다.

## 4. 판정

BLOCKER 0 · MAJOR 2(둘 다 한 줄 수정으로 닫히지만, 지금 문장대로 실행하면 `pnpm typecheck`가 각각 04.3-02 Task 2 · 04.3-10 Task 1에서 빨갛게 선다) · NOTE 3.

VERDICT: FAIL
