검토자: Fable (Codex 사용 한도로 대체, 한도가 풀리면 Codex 재확인 필요)

# Phase 04.3 최종 4차 계획 검토 — 샤드 C (플랜 07~12)

읽기 전용으로 검토했다. 대상: `04.3-07~12-PLAN.md` 전체 + 교차 계약(01~06, 13은 계약이 걸리는 곳만), 근거는 `04.3-CONTEXT.md`(D-11xx) · `04.3-UI-SPEC.md`(approved) · 저장소 코드 · CLAUDE.md. 커밋 `2c6277b`(3차 이후 수정)의 바이트 수는 `lib/actions/payload-size.ts`와 같은 방식(`new TextEncoder().encode(JSON.stringify(payload)).length`)으로 node로 직접 재계산했다.

## 0. 3차(codex-final3-C) 지적 해결 여부

| 3차 | 내용 | 판정 | 근거(plan:line / repo:line) |
|---|---|---|---|
| C1 | 500줄 일괄 저장이 경품명 편집으로 262,144B 한도를 넘는다 | **RESOLVED**(소유자가 받아들인 한계로 확정, 계획 문장이 실측과 일치) | 04.3-10:69(must_haves — 새 값 + 원래 값 길이로 보장 문장) · 10:333(단위 경계: 같은 길이 다른 한글 `나` 기준선) · 10:349(RED 표본 모양) · 10:444(E2E: 80자 `가` 기존값 → 80자 `경` 붙여넣기 = 290,559B → 「284KB」, 250줄 재저장 145,309B) · 10:510 T-04.3-171 · 10:513 T-04.3-182 · 10:526 성공 기준. 한도·문구는 `lib/actions/payload-size.ts:7`(262_144) · `:11~14`(`Math.ceil(bytes/1024)`KB 문장) · `lib/actions/client.ts:27`(모든 액션 공통 검사). 바이트 실측은 §1 참조 — 전부 일치 |
| C2 | 두 줄 이름·전화 맞교환이 UNIQUE 23505로 실패 | **RESOLVED** | 04.3-02:90 · 02:253(`cert_winners_event_id_name_phone_unique`를 `--custom` 마이그레이션으로 `DEFERRABLE INITIALLY IMMEDIATE`) · 02:275(verify가 `pg_constraint.condeferrable/condeferred` 단언) · 04.3-10:245(`deferWinnerPersonUniqueTx(viewer, tx)` — `SET CONSTRAINTS … DEFERRED` 한 문장, 상수 `CERT_WINNER_PERSON_UNIQUE`) · 10:255(saveWinners tx 순서) · 10:262(COMMIT 23505를 `withTransaction` 호출 바깥에서 `code`·`constraint`만 보고 `invalid/duplicatePerson`으로, `detail` 안 읽음) · 10:242(RED 이유가 23505여야 함) · 10:296 · 10:512. 저장소: `node_modules/drizzle-orm/node-postgres/session.js:185~191`이 commit 실패 시 rollback 후 재던짐을 확인 → 커밋 오류가 콜백 밖으로 나온다는 계획 전제가 맞다. `lib/db-transaction.ts`는 `db.transaction`을 그대로 감싼다 |
| C3 | 게이트 꺼짐 404가 `loading.tsx` 스트리밍 때문에 HTTP 200일 수 있다 | **RESOLVED** | 04.3-11:42 · 11:57~58 · 11:76~78 · 11:186(세그먼트 `layout.tsx`에서 `await assertCertFeatureEnabled()`만, Suspense 없음) · 11:196(`loading.tsx` 유지) · 11:216(verify grep) · 11:180/186(RED: 레이아웃 없이 200으로 빨간 뒤 추가). 저장소: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md:76·86`(loading은 같은 세그먼트 layout을 감싸지 않음) · `:103·118`(스트리밍 시작 뒤 상태 고정) · `layout.md:316~323`(cacheComponents 없으면 레이아웃 대기 뒤 내려감) · `next.config.ts`에 `cacheComponents` 없음 · `01-getting-started/06-fetching-data.md:460`(layout·page 병렬) — 11:184의 「페이지 첫 판정도 그대로 둔다」 근거와 일치 |

3차 판정 셋 모두 회귀 없음.

## 1. 커밋 2c6277b 바이트 수 재계산

`payload-size.ts`와 같은 방식으로(스크립트 `scratchpad/bytes.mjs`, 요청 모양은 10:349 `{eventId, rows:[{id, version, prizeName, baseline:{prizeName}}]}`, 새 줄은 `{name, phone, prizeName, quantity, delivery, label}`) 계산:

| 케이스 | 계획 수치 | 실측 | 일치 |
|---|---|---|---|
| 새 500줄(붙여넣기 표본) | 259,559 | 259,559 | ○ |
| 500줄 경품명 60자 → 다른 60자 | 235,059 | 235,059 | ○ |
| 500줄 경품명 69자 | 262,059(≤ 한도) | 262,059 | ○ |
| 500줄 경품명 70자 | 265,059(> 한도) | 265,059 | ○ |
| 500줄 경품명 80자 → 80자(10:444 E2E, version 1) | 290,559 → 「284KB」 | 290,559 · ceil(290559/1024)=284 | ○ |
| 같은 E2E를 2자 기존값으로 했을 때(10:444 주석) | 173,559 | 173,559 | ○ |
| 250줄 재저장 | 145,309 | 145,309 | ○ |
| 80자 → 60자(version 10) | 265,059 | 265,059 | ○ |

Codex 4차가 끊기기 전에 의심했던 「짧은 기존 경품명 준비 + 긴 기존값 기준 오류 기대」 불일치는 2c6277b가 기존값도 80자로 바꿔 해소됐다(10:444). 계획의 「~69자」 경계 문장(10:69 · 10:333)도 실측(69자 262,059 ≤ 262,144 < 70자 265,059)과 일치한다.

## 2. 이번 라운드 새 발견

BLOCKER · MAJOR 없음. 아래는 두 근거를 갖춘 실행 실패·보안·계약 불일치로 확인되지 않은 NOTE다.

1. **NOTE — 플랜 10 Task 3 verify가 프로젝트 필터 없이 전체 E2E를 끌어온다.** 04.3-10:403 `pnpm playwright test test/e2e/cert-events.spec.ts test/e2e/quote-table.spec.ts`는 `--project`·`--no-deps`가 없다. 04.3-02:265(⑥)대로 `certs` 프로젝트(`*cert*.spec.ts`)가 `cert-setup` → `desktop`·`mobile-375`에 의존하므로, 이 명령은 `cert-events.spec.ts` 하나를 위해 의존 프로젝트의 **전체** 스펙(Playwright는 의존 프로젝트에 파일 필터를 적용하지 않는다)을 먼저 돌린다. 실패는 아니고 느릴 뿐이며, 같은 플랜의 10:463과 플랜 09:195 · 11:209/257이 이미 `--no-deps --workers=1 --project=cert-setup --project=certs` 형태를 쓰고 있어 그 형태로 맞추면 된다. 저장소 `playwright.config.ts`에는 아직 두 프로젝트가 없으므로(02가 만든다) 실행 전 단계에서는 문제로 드러나지 않는다.

2. **NOTE — 플랜 09의 role-menu 단위 테스트 갯수 단언 갱신 범위.** 저장소 `test/unit/ui/role-menu.test.ts:152`는 `ADMIN_MENU_KEYS.length toBe(10)`, `:189~198`은 「그룹 3개」를 하드코딩하고 §6-10 표를 파싱한다. 04.3-09:33 · 09:101 · 09:117(②) · 09:119(③)은 「관리자 화면 10개」 문구·주석·그림·그룹 수를 함께 고치고 테스트를 한 커밋에 넣는다고 적었고 09:115(①)는 「기존 파서가 넷째 그룹을 읽도록 표 행만 더하면 되는지 확인」을 두었다. 계획 문장은 충분하나, 실행 시 두 단언(10 → 11, 3 → 4)을 빠짐없이 바꾸지 않으면 09 Task 1 verify가 빨갛다 — 계획 결함이 아니라 실행 주의점.

3. **NOTE — `insertVisibilityIfAbsent`는 저장소에 아직 없다(계획대로 09가 만든다).** `repositories/permissions.ts:54~117`에는 `upsertVisibility`(:113, onConflictDoUpdate)만 있고, `domain/seed/index.ts:173`이 기본 계급에 그것을 쓴다. 04.3-09:76은 04-20과의 선후를 명시(먼저 들어왔으면 그대로 쓰고 시드·리포지토리를 안 고침)했으므로 계약은 정합. 04-20이 같은 이름으로 다른 시그니처를 만들 경우만 실행 시 확인 필요.

4. **NOTE — 플랜 11 `page-auth-guard` 확장 · 플랜 12 `cli-bundle` 파서 확장은 기존 테스트와 정합.** `test/unit/page-auth-guard.test.ts`는 현재 `app/(app)`만 훑고(`requireSession` 또는 `getSession`+redirect 허용), 11:163 ⑤가 `app/print`를 범위에 넣는다. `test/unit/deploy/cli-bundle.test.ts`는 `--args=`만 파싱하고 `scripts/deploy.sh:351`의 account 잡은 `--command=node,dist/cli/account-cli.mjs` 형태라, 12 ①의 파서 확장 서술과 일치. 실행 실패 요인 아님.

5. **NOTE — 07 · 10 · 11의 `PageHeader` 행동 슬롯.** `ui/page-header/PageHeader.tsx`에는 action 슬롯이 없고, 계획들은 `app/(app)/projects/[id]/quote-table.tsx:886~958` · `project-detail.module.css:1~26`의 `.header/.headerActions` 선례를 감싼다고 적어 새 부품을 만들지 않는다 — 정합. `ui/table/RowSheet.tsx` props에 `action`이 없고 `:71`이 `aria-label="닫기"`인 것도 07/10의 서술과 같다.

## 3. 검증한 교차 계약(불일치 없음)

- 웨이브·의존: 07:w4[03,04] · 08:w4[05] · 09:w4[04] · 10:w5[04,06,07] · 11:w5[05,07] · 12:w6[06,07,08,10] · 13:w7 — 10이 쓰는 `deferWinnerPersonUniqueTx`는 02(w2) 제약, `validateWinnerRows(rows, context)`·셀 오류 9종은 04(w3), `verifyLast4`·`VERIFY_HARD_LOCK_THRESHOLD`·`isDefiniteResult`는 03(w3), `submitCertificate`는 06(w4) — 모두 선행 웨이브.
- 기능 게이트: `assertCertFeatureEnabled()`·`isCertFeatureEnabled()`·`notFound` 유니온(02:77~78 · 02:193~197)을 07 · 09 · 10 · 11 · 12가 같은 이름·순서(게이트 → `requireSession`)로 쓴다. 인쇄 라우트가 `app/(app)` 밖이라 `app/(app)/layout.tsx:22`의 `requireSession`이 앞서지 않는다는 11:41 전제도 저장소와 일치(`app/layout.tsx`에는 세션 없음).
- 권한·노출: `can()`/`visible()` 분리(D-35), `project(viewer,row,DtoSpec)`·`registerDto`·`registerAction`(`domain/vendors/index.ts:49~67` 선례, `test/integration/leak-scan.test.ts:1~30` · `test/unit/leak-scan-coverage.test.ts`) — 07 ⑦ · 11 ③이 `project()` 투영을 요구해 `cert_submission.value` 끄면 404(11:43).
- 행동 로그: `domain/action-log/record.ts`의 CORE_ACTION_TYPES / ACTION_TYPE_LABELS / ALWAYS_ON_ACTION_TYPES 동시 변경 규칙을 07(`cert_correct`, `mask_reveal`) · 10(`cert_unlock`) · 12(`cert_purge`)가 같은 세 곳에 등록하고 단위 테스트를 먼저 쓴다.
- KMS(08): `lib/crypto.ts:36~70`(`rawKeyFor`/`keyFor`/`highestAvailableVersion`) · `scripts/rotate-key.ts:25~53` · `lib/env.ts:105~114` refine · `scripts/deploy.sh:253~288, 441` · `test/unit/deploy/fakebin/gcloud` 상태 파일 방식 — 08의 `loadDataKeys` · `instrumentation.ts register()` · `_ensure_wrapped_data_key`/`_verify_wrapped_data_key`/`--add-data-key-v2` 서술이 기존 구조·테스트 하네스와 맞물린다. 시크릿이 코드·로그에 남는 경로 없음.
- 표 키보드(10 ⑫(아)): `ui/table/use-grid-keyboard.ts:145~151`이 편집 셀만 Enter/Space 처리, `Table.tsx:264~329` tabIndex 로직 — 10이 행동 셀 갈래를 더하고 SYSTEM §7-3 (아)(`docs/design/SYSTEM.md:779~781`) 한 줄을 고치며 `docs/design/DECISIONS.md` 형식(`## 날짜 — 제목`)을 따른다.
- 인쇄(11): `docs/design/tokens.css:58~61, 179~197` 인쇄 토큰 · `docs/design/system/print-cert.html`(108줄) 템플릿 · UI-SPEC Copywriting 「인쇄 실패(화면)」 문장 · `app/(app)/error.tsx`의 `retry` 관례와 일치.
- 파기(12): `scripts/build-cli.mjs` · `test/unit/account-cli.test.ts` · Cloud Scheduler 잡 등록 위치(`deploy.sh:305~354`) · `lib/gcp/gcs.ts`(05가 만듦) 계약 일치.
- TDD 순서: 07 · 10 · 11 · 12 모두 RED(통합/E2E 스펙 먼저, 실패 이유를 SUMMARY 「RED 기록」에) → GREEN → 커밋 순서를 명시. 10:242의 「맞교환 RED 이유는 23505」, 11:186의 「레이아웃 없이 200으로 빨간 뒤 추가」는 실제 실패를 강제한다.
- CLAUDE.md §5 `any` 금지 · 새 의존성(qrcode는 승인됨) · `docs-limits.test.ts` 300줄 상한(OPERATIONS.md 263줄 + 08/12 추가분 계획이 상한 안) 위반 없음.

## 4. 결론

3차 지적 C1(수용된 한계로 문장·실측 정합) · C2 · C3 모두 해결됐고, 2c6277b의 바이트 수는 전부 실측과 같다. 이번 라운드에서 plan:line + repo:line 두 근거로 성립하는 BLOCKER · MAJOR는 없다. NOTE 1(10:403 프로젝트 필터)은 실행 시간 문제이며 필요하면 한 줄 수정으로 끝난다.

VERDICT: PASS
