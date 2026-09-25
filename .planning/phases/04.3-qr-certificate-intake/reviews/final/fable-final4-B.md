검토자: Fable (Codex 사용 한도로 대체, 한도가 풀리면 Codex 재확인 필요)

# 04.3 최종 4차 · 샤드 B(플랜 03 · 04 · 05 · 06) 전체 적대 검토

대상: `.planning/phases/04.3-qr-certificate-intake/04.3-{03,04,05,06}-PLAN.md` 전문 + 교차 계약(02 · 07 · 09 · 10 · 11 · 12 · 13). 정본: 04.3-CONTEXT.md · 04.3-UI-SPEC.md · 저장소 코드 · CLAUDE.md. 저장소는 읽기만 했고 파일을 바꾸지 않았다. 확정된 소유자 결정(qrcode 승인 · 누적 잠금 20 고정 · 프로덕션 플래그 끔 · 경영관리 정정 + 로그 · 인쇄 P1)과 이미 받아들인 한계(500줄 배치 경품명 262,144바이트 초과)는 다시 열지 않는다.

## 1. Round-3(codex-final3-B) 지적의 해결 여부

| # | Round-3 지적 | 판정 | 현재 계획 근거 |
|---|---|---|---|
| 1 | MAJOR — 커밋 결과 불명 시 이미 저장된 확인증의 서명을 보상 삭제로 지움 | **RESOLVED** | 06-PLAN:48(must_have 「커밋 결과 불명」) · 06-PLAN:193(RED 케이스 — `deps.withTransaction` 첫 호출만 커밋 뒤 `commit` 응답 유실 예외 주입 → `saved` · 객체 보존 · 같은 키 재전송 `saved`, 조회 실패 두 갈래) · 06-PLAN:213-216(③ (g) 예외 갈래: 짧은 tx에서 `lockEventRow` → 자리 `FOR UPDATE` → `findSubmissionBySignatureKey` — 있으면 `saved` · 없으면 삭제 후 재던짐 · 조회 실패면 아무것도 지우지 않음) · 06-PLAN:220(④ `findSubmissionBySignatureKey(viewer, eventId, signatureKey, tx)`) · 06-PLAN:239(acceptance) · T-04.3-190(06-PLAN:392). 저장소 근거는 그대로 유효하다 — `lib/db-transaction.ts:9-10`이 `db.transaction(fn)`을 그대로 부르고 `node_modules/drizzle-orm/node-postgres/session.js:187-191`이 `commit` 실패도 `catch`로 보내 예외를 던진다 |
| 2 | NOTE — 결과 불명 뒤 재전송에서 주민등록번호 재확인 승인이 풀림 | **RESOLVED** | 06-PLAN:52(표시를 되물음을 받은 **값**에 묶음) · 06-PLAN:272(단위 RED `nextRrnRecheckConfirmed({armedRrn, rrn})` — 인자에 직전 결과 없음) · 06-PLAN:285(④ (c) `armedRrn` 메모리 상태 — 결과 불명으로 바꾸지 않음) · 06-PLAN:332(E2E — `route.abort()` 뒤 재전송 본문의 제출 키 동일 · `rrnRecheckConfirmed` true 유지 · E5) · 06-PLAN:307(acceptance) |
| 3 | NOTE — HTML 비노출 E2E의 임시 계급에 행사 정보 노출 준비 · 200/행사 이름 단언 누락 | **RESOLVED** | 04-PLAN:69(must_have — HTML 대조는 200 + 행사 이름이 보이는 응답에서만) · 04-PLAN:375((f-0) `upsertVisibility(…, {infoItem: "cert_event.value", visible: true})` + 근거 `domain/permissions/visible.ts:21`) · 04-PLAN:377((f) 끔·켬 두 응답 모두 `response.status()` 200 + 행사 이름을 당첨자 칸 단언보다 먼저) · 04-PLAN:399(acceptance grep) · T-04.3-81(04-PLAN:424). 저장소 근거 확인: `domain/permissions/visible.ts:20-22`가 행 없음 = 거짓, `repositories/permissions.ts:100-103` `upsertVisibility(viewer, {roleId, infoItem, visible})` 시그니처 일치 |

셋 다 RESOLVED — 회귀 없음.

## 2. 이번 라운드 새 검토 — 확인한 것(문제 없음)

저장소와 대조해 **맞음**으로 확인한 계약(플랜이 인용한 파일:줄이 실제와 같다):

- 04.3-06 (h) 제출 로그 tx 삽입: `domain/action-log/record.ts:84-92`(`RecordActionDeps.appendActionLog: typeof defaultAppendActionLog` · `isActionTypeEnabled?`), `record.ts:127-134`(끌 수 있는 종류는 `isEnabled` 뒤 주입된 `appendActionLog(viewer, {...})` 호출 — `document_submit`은 `ALWAYS_ON_ACTION_TYPES`(65-72행)에 없고 `CORE_ACTION_TYPES`(10-30행)에 있다), `repositories/action-log.ts:20-36`(`appendActionLog(viewer, entry)` 두 인자 · `db.insert(actionLog).values(entry).returning()`), `eslint/rules/repository-viewer-param.mjs:29-35`(첫 인자 이름 `viewer` 판정) · `eslint.config.mjs:77`(error). `db/client.ts:48` `DbOrTx`에 `insert`가 있어 `tx.insert(actionLog)`가 타입에 맞는다.
- 04.3-06 precondition(`DbOrTx`에 `"delete"`): 지금 `db/client.ts:48`은 `"insert" | "update" | "select"`뿐이다 — 02-PLAN:367(⑨ 「`DbOrTx` 넓히기 RED → GREEN」)이 넓히므로 06이 「확인만」 하는 것이 맞다.
- 04.3-06 ② `node:zlib` `crc32`·`inflateSync({maxOutputLength})`: `node_modules/@types/node/zlib.d.ts:297`(`crc32`) · `:127,154`(`maxOutputLength`), `package.json` `engines.node >=22.12`, `Dockerfile:10,40` `node:24-slim`, 세션 Node v22.22 — 새 의존성 없이 된다.
- 04.3-06 ⑤ `validationErrors.signature._errors`: `lib/actions/client.ts:13` `createSafeActionClient({ handleServerError })`(기본 formatted 모양) · `app/(app)/admin/vendors/vendor-form.tsx:136` `result.validationErrors?.name?._errors?.[0]` 선례 일치.
- 04.3-06 본문 한도 예산: `lib/actions/payload-size.ts:7` `MAX_ACTION_PAYLOAD_BYTES = 262_144` · `checkPayloadSize`(순수) — 184,320 → base64 245,760, 나머지 16,384바이트 안에 이름 40×3 · 주소 200×3 · 키/증표 최대치가 넉넉히 든다.
- 04.3-03 ⑥ IP: `lib/client-ip.ts:11` `clientIp(headers: Headers)`(`next` import 없음) — `await headers()`(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/headers.md` 있음)의 `ReadonlyHeaders`를 그대로 넘길 수 있다. `x-forwarded-for` 없으면 null → 플랜의 `"unknown"` 솔트 갈래.
- 04.3-03 ①: 정수 설정 정의 선례 `domain/settings/keys.ts:14-22`(`SettingDef<number>` · `z.coerce.number().int().min(1)`) · `SETTING_DEFS`(303행) · `test/unit/settings/registry-coverage.test.ts` 존재 — 두 키를 `SETTING_DEFS`에 실으면 통과한다. `verify_idem_outcome` 맵 모양(03-PLAN:146·211)은 02-PLAN:246 정본과 같다.
- 04.3-03 Task 2 ① `Button`: `ui/button/Button.tsx:35-41`(이유 없는 비활성 경고 조건 `disabled && !pending && !disabledReason`) · `:57`(이유가 id 없는 `<span>`) — 플랜이 고칠 곳 서술이 정확하다. `size="external"`은 02-PLAN:391(⑭)이 더한다(03·06이 전제로 삼는 것이 맞다).
- 04.3-04 ⓪-b: `ui/table/types.ts:17`(`header: string`) · `ui/table/Table.tsx:228-236`(`<th>`에 설명 통로 없음) — 선택 필드 하나·속성 하나 추가로 충분하다. `renderToStaticMarkup`로 `Table`을 node 환경에서 그리는 것은 vitest가 CSS 모듈을 프록시로 돌려주고(`node_modules/vitest/dist/chunks/index.DzobfTyw.js:8000-8011`) `use-grid-keyboard.ts`·`Table.tsx`에 모듈 수준 `window`/`document` 참조가 없어 가능하다(다만 저장소에 `react-dom/server` 단위 선례는 아직 없다).
- 04.3-04 (f-0)·(f): `repositories/roles.ts:26-29` `insertRole(viewer, {id, name, sortOrder?})` · `:49` `setRoleArchived(viewer, id, value)` · `domain/permissions/matrix.ts:89-92` `setPermissionCell(viewer, {roleId, menu, action, allowed})` · `repositories/users.ts:10` `findUserByEmail(viewer, email)` · `domain/viewer.ts:11` `Viewer = {id, roleId}` · `test/e2e/fixtures.ts:10` `createFixtureUser({roleId})` · `test/e2e/code-tables-write-gate.spec.ts:17-25` 선례 — 전부 일치. `eslint.config.mjs:45` `app → domain` 허용이라 `"use client"` 부품이 `roster-display.ts`·`signature-ink.ts`를 import해도 경계 규칙에 걸리지 않는다(선례 `app/(app)/projects/projects-table.tsx`).
- 04.3-04 ①·⑥: `test/integration/revenue-entries.test.ts:51-52` `upsertPermission(SYSTEM_VIEWER, {roleId, menu, action, allowed})` 선례 · `test/integration/quote-line-visibility.test.ts:40-66` `upsertVisibility` 켜고 끄는 선례 · `app/(app)/admin/permissions/actions.registry.ts` `dtoName: null` 선례 · `test/unit/leak-scan-coverage.test.ts`(모든 `actions.registry.ts` import 강제) · `test/integration/leak-scan.test.ts:17-30`(import 목록 끝) — 일치.
- 04.3-05: `lib/env.ts:47-49` `APP_ENV` enum `local | staging | prod`(플랜의 `staging`·`prod` 케이스와 같다), `google-auth-library 11.1.0` → gaxios 7.1.3의 `GaxiosOptions`에 `timeout`(176) · `responseType: 'arraybuffer'`(185) · `validateStatus`(187) · `url: string | URL`(117)이 있다(`node_modules/.pnpm/gaxios@7.1.3/.../common.d.ts`). `lib/gcp/cloud-sql-admin.ts:12-17,29-33`의 `GoogleAuth` 스코프·`options.list` 주입 선례 일치. `package.json`에 `@google-cloud/storage` 없음.
- 04.3-05 Task 2: `scripts/deploy.sh:1-3,21-22`(`set -euo pipefail` · `errtrace` · ERR 트랩 「deploy failed at $STAGE」) · `:153-159` `ensure_apis` · `:275-289` `ensure_secrets` · `:440` `env_vars` · `:653-674` `main()` 순서 — 「`ensure_secrets` 다음 · `build_and_push_image` 앞」 자리가 있다. `infra/names.sh` 이름 함수 끝에 `cert_bucket()` 한 줄 추가 가능. `scripts/bootstrap-gcp.sh:109-131`(`ENVS` 루프 · `DEPLOYER_EMAIL` 118행 · 런타임 역할 루프) · `:133`((e)) — (d-2)를 둘 자리와 변수가 있다. `test/unit/deploy/fakebin/gcloud:333-336`(`*)` exit 1 — `storage buckets` 분기 없음) · `:11` `state_file` — 플랜 서술 그대로. `test/unit/deploy/deploy-sh.test.ts:45-53`(`deploy()` 도우미 `opts.state`만 씀) · `:103-134`(기본 성공 케이스 — 부분 순서 단언이라 호출 추가에 안전) — B3 도우미 기본값 처리가 맞다. `test/unit/deploy/bootstrap-sh.test.ts:149-157`은 여섯 상수만 대조하므로 `CERT_BUCKET_SUFFIX` 추가가 깨뜨리지 않고, 첫 실행 순서 단언(60-79행)의 `"add-iam-policy-binding gha-deployer@"` 바늘은 새 `storage buckets add-iam-policy-binding gs://…` 줄과 겹치지 않는다. `docs/OPERATIONS.md` 263줄 · §8(172행) 존재 · `test/unit/docs-limits.test.ts:42-43` 300줄 상한.
- 웨이브·파일 겹침: 웨이브 3(03·04·05) 사이, 웨이브 4(06·07·08·09) 사이에 `files_modified` 겹침이 없다(03은 `repositories/cert-winners.ts`, 04는 `repositories/cert-events.ts`, 06은 둘 다 — 06은 웨이브 4). 06의 `depends_on`에 05가 없지만 06은 02의 로컬 드라이버만 쓰고 05는 웨이브 3라 순서상 앞선다. 04.3-10(웨이브 5)이 `ui/table`을 다시 고치는 것은 04의 「더하기만」 규칙(04-PLAN:290·331)으로 충돌을 피한다.
- 교차 계약: 03 (h) 「`wrong` 항목은 개수로 빼지 않는다 · 담당자 수정은 `ok`만 지운다」 ↔ 10-PLAN:62·222-223(B1) 일치. 06 (g) 「예외 갈래는 의도 줄을 두고 12가 치운다」 ↔ 12-PLAN:38·81-82·127(`listStaleSignatureUploadIntents` · 24시간 · 404 = 성공) 일치. 06 CRC·IEND 검사 ↔ 11-PLAN:38·190-191(`decode()` 실패 = ERROR) 일치. 06 (h)가 07의 `appendCertActionLogTx`를 쓰지 않는 이유 ↔ 07-PLAN:73·186(`ALWAYS_ON_ACTION_TYPES`만 받고 그 밖은 던짐) 일치. 04 ①(PM 권한은 테스트가 스스로 줌) ↔ 09-PLAN:34(시드가 `certs.events`를 준다) 일치. 03 `recheckLockAction` 넷 응답 · `limit` ↔ UI-SPEC:828-829 일치. 06 잉크 288 ↔ UI-SPEC:397 일치. 04 구별 표시 정규화 ↔ UI-SPEC:362 일치.
- TDD 순서: 네 플랜의 모든 태스크가 `tdd="true"`이고 RED 단계가 구현 앞에 명시돼 있다(03 ②·⓪, 04 ④·②·⓪·⓪-b·⓪, 05 ①·⓪, 06 ①·①·①-b). 06 Task 1 ③은 「이름 바꾸기 전에 02 테스트를 먼저 고쳐 실패를 본다」까지 적었다.
- C1 게이트: 03-PLAN:229·240(공개 액션 넷 첫 문장 + grep ≥ 4) · 04-PLAN:246·261·291·359·391(두 페이지 + 액션) · 06-PLAN:51·222 — 직접 POST E2E까지 있다. 04.3-03의 `withCertFeatureOff`가 DB 설정을 바꾸는 방식은 `domain/settings/registry.ts:68-92` `getSettingValue`가 캐시 없이 매번 읽으므로 실행 중인 서버에 즉시 반영된다.

## 3. 이번 라운드 새 지적

BLOCKER · MAJOR는 없다. 아래는 NOTE(실행 때 한 번 확인하면 되는 것 · 문서 정확도).

1. **NOTE — UI-SPEC 줄 번호 인용이 밀렸다(절 이름은 맞다).** 03-PLAN:145(「멱등 키 세 줄(340~345행)」) · 03-PLAN:265(「첫 진입 실패 339행」 · 「뒤로 가기 줄 373행」) · 04-PLAN:159(「E2 354행」) · 06-PLAN:160(「E2 349행 · E4 388·395행」)이 가리키는 실제 위치는 UI-SPEC:346(첫 진입 실패) · :348-353(멱등 키) · :362(구별 표시 정규화) · :382(뒤로 가기 `history.back()`) · :394-397(서명). 절 이름·문장이 같이 적혀 있어 실행에 지장은 없다 — 실행 SUMMARY에서 절 이름으로 찾았다고만 적으면 된다.

2. **NOTE — 노출을 끈 계급의 I3 렌더 규칙이 없다(테스트는 있다).** 04-PLAN:377은 `cert_winner.value`를 끈 응답이 **HTTP 200**이어야 한다고 단언하지만, 04-PLAN:363(`winners-view.tsx` — 이름 · 전화 · `roster-display.ts` 계산 열)에는 이름·전화 키가 빠진 행(`domain/permissions/project.ts:29-32`가 노출 불통과 키를 결과에서 뺀다 → `Partial<CertWinnerDto>`)을 어떻게 그리는지가 없다. `buildPublicRows`에 이름 없는 행을 넘기면 타입 오류이거나 런타임 오류(→ 500 → (f)의 200 단언 실패)라, 실행자가 즉석에서 화면을 정해야 한다. 권고: 04 Task 4 ③에 한 줄 — 「이름·전화·`수령자 화면` 셀은 그 키가 DTO에 없으면 빈 셀(계산 열은 그리지 않음), 제출 열·합계 행은 그대로」 — 를 더해 (f)의 200이 계약으로 고정되게 한다.

3. **NOTE — I3 읽기 표의 제출 열에 누적 잠김 표기가 빠져 있다(10이 채운다).** 04-PLAN:62·363은 `잠김` + `HH:mm까지`(짧은 잠김)만 정의하는데 UI-SPEC:244는 `잠김` + 2행 `잠금 풀기 필요`(누적 잠김)도 정한다. 03-PLAN:203 ⓓ대로 누적 잠김은 `locked_until`을 쓰지 않으므로 04 시점의 표에서는 누적 잠긴 줄이 `미제출`로 보인다. 10-PLAN:63이 이 표기를 맡고 있어 최종 모양은 맞지만, 04의 상세 DTO(04-PLAN:239)가 `hardLockedAt`(또는 잠김 종류)을 처음부터 싣게 해 두면 10이 DTO 모양을 다시 바꾸지 않는다.

4. **NOTE — 「서명 base64 최대 길이 + 1 → zod 거절」을 단위 테스트로 두려면 스키마 위치를 정해야 한다.** 06-PLAN:176은 이 케이스를 `test/unit/certs/signature-png.test.ts`의 단위 줄로 두고, 06-PLAN:222는 그 zod 상한을 `app/c/[token]/actions.ts`에 둔다. 그런데 `actions.ts`는 `"use server"` → `publicActionClient`(`lib/actions/client.ts`) → `lib/viewer` → `server-only` 사슬이라 vitest가 import하지 못한다(`test/integration/leak-scan.test.ts:12-16`이 같은 이유를 적어 두었다). 실행자는 ① domain `submitCertificate`의 입력 zod(02-PLAN:373)에 같은 `max(SIGNATURE_BASE64_MAX_LENGTH)`를 두고 단위 테스트가 그것을 부르거나, ② 입력 스키마를 `app/c/[token]/submit-schema.ts` 같은 순수 모듈로 빼 액션과 테스트가 함께 import하게 하면 된다. 어느 쪽이든 06-PLAN:231의 grep(`actions.ts`에 `SIGNATURE_BASE64_MAX_LENGTH`)은 그대로 만족시킬 수 있다.

5. **NOTE — `ensure_cert_bucket` 실패 경로는 `exit 1`이 아니라 `return 1`이어야 한다.** 05-PLAN:196은 「`ensure_network`의 『run scripts/bootstrap-gcp.sh first』 선례와 같은 결」이라 하면서 「기존 ERR 트랩이 마지막 줄 `deploy failed at ensure_cert_bucket`을 쓴다」(05-PLAN:179 behavior)를 기대한다. 그런데 선례 `scripts/deploy.sh:180-182`는 메시지 뒤 `exit 1`이라 ERR 트랩(`deploy.sh:22`)이 발동하지 않고 마지막 줄이 안내 문장이 된다. 플랜 본문의 「실패로 돌아간다(return)」를 그대로 따르면 되지만, 선례를 복사하면 behavior의 「마지막 줄」 단언이 깨지므로 실행 때 `return 1`로 통일한다(05-PLAN:197도 같다).

6. **NOTE — `qrcode` SVG의 어두운 모듈은 `fill`이 아니라 `stroke`다.** 04-PLAN:178은 「어두운 모듈 채움을 `currentColor`로」라 적었다. node-qrcode의 SVG 렌더러는 어두운 모듈을 `<path stroke="#000000" …>`로, 밝은 바탕을 `fill`로 그린다(패키지가 아직 설치되지 않아 저장소에서 확인할 수는 없다). 04 Task 1 ②의 문자열 치환이 `stroke`를 겨냥해야 04-PLAN:171(색 리터럴 0)이 통과한다 — 설치 뒤 출력 한 번 보고 정하면 된다.

7. **NOTE — 03 Task 2 verify의 Playwright 호출 형태.** 03-PLAN:337은 `pnpm playwright test <세 파일>`만 부른다(프로젝트·`--no-deps` 없음). 02-PLAN:289대로 `certs` → `cert-setup` → `desktop`·`mobile-375` 의존이 걸려 있어 의존 프로젝트가 통째로 돌아 매우 느리고, 실패 시 어느 프로젝트의 실패인지 읽기 어렵다. 04-PLAN:387 · 06-PLAN:354의 형태(`--no-deps --workers=1 --project=cert-setup --project=certs test/e2e/cert.setup.ts …`)로 맞추는 것이 좋다(`a11y.spec.ts`는 `desktop`으로 따로).

8. **NOTE — IP 없는 요청은 한 버킷을 나눠 쓴다.** 03-PLAN:220의 `ip ?? "unknown"`은 `x-forwarded-for`가 없는 모든 요청(`lib/client-ip.ts:12-14`가 null)을 같은 IP 셈(행사당 60분 10번)에 넣는다. Cloud Run 뒤에서는 헤더가 늘 있고, E2E는 테스트마다 행사를 새로 만들어(03-PLAN:326) 한도에 닿지 않지만, 한 행사에서 틀림 E2E를 10번 넘게 넣는 케이스를 나중에 더하면 `throttled`로 바뀐다 — 스펙에 한 줄 주석으로 남겨 두면 된다.

## 4. 판정 근거 요약

- 실행 실패 요인(잘못된 경로·API·타입·명령·마이그레이션·테스트 격리): 없음. 위 NOTE 4·5·6은 실행자가 한 번 고르면 되는 수준이고 계획의 검증 명령과 acceptance로 잡힌다.
- 보안(인증·권한·게이트 우회 · PII 로그 · 키 취급 · 속도 제한 · IDOR): 새 구멍 없음. C1 게이트 · 제출 비노출 순서 · IP 해시 · 로그 필드 제한 · 버킷 최소 권한이 코드 사실과 맞는다.
- 교차 계약(이름·모양·웨이브·depends_on): 불일치 없음.
- TDD 순서 · UI 계약: 위반 없음(NOTE 1~3은 정확도·보강).

VERDICT: PASS
