# 04.3 계획 문서 /review (2026-09-25 KST)

> Codex 대신 Opus(사용 한도), 한도 풀리면 Codex 재확인 필요.
> 대상: 7baa0d2 기준 04.3-01~13 PLAN, UI-SPEC, VALIDATION, COVERAGE. 검토자: Opus 샤드 A(01~06+UI-SPEC), 샤드 B(07~13+VALIDATION+COVERAGE), Opus 적대 검토(전체).

## 요약

- 합계: P1 1건 · P2 6건 · P3 18건. 적대 검토 판정 「막는 문제 없음」, 샤드 B가 P1 1건.
- P1: 08:183·:191 풀린 데이터 키를 모듈 변수에 두면 instrumentation과 라우트가 다른 모듈 인스턴스를 써 암복호화 실패 가능 → globalThis 보관 + 배포 스모크에 왕복 확인.
- P2: 06↔02 C3 실패 주입 기대값(의도 행 0→1) 갱신 누락, 03:238 FOR UPDATE를 속도 제한보다 먼저 잡아 풀 고갈(lock_timeout·잠금 전 판정), COVERAGE의 deploy.sh/bootstrap-gcp.sh 역할 옛 설계, 07 통합 테스트가 06의 winnerVersion 추가 뒤 깨짐, VALIDATION이 없는 e2e 파일 지목, 10의 셀 오류 「9종」(→12종).
- 반영은 다음 세션(세션 경계 D-01)에서 gsd-planner로. 사용자 결정 E3-03·E3-04·E3-10은 건드리지 않음.


---

## review-A

# 04.3 /review — 샤드 A (01~06 PLAN · UI-SPEC)

대상: 브랜치 `claude/plan-phase-04-3-9wian4` HEAD 7baa0d2, 기준 origin/main(merge-base a65c383). 문서만 바뀐 PR이다. 계획이 적은 대로 코드를 만들었을 때 결과가 틀리는지를 봤다.

방법:
- gstack `review/checklist.md`의 CRITICAL 항목(SQL · 동시성 · 신뢰 경계 · 셸 주입 · enum 완결성)과 INFORMATIONAL 항목을 적용했다.
- 계획이 인용한 기존 코드는 main에서 확인했다. Phase 4 부품은 `origin/claude/gsd-progress-e1nzgu`에서 `git show`로 확인했다.
- 확인한 것: `record.ts`의 `RecordActionDeps.tx`와 fail-open, `DbOrTx` 정의, `withTransaction` 주석과 줄 번호, `allocateDocumentNumber`와 비공개 `loadDocumentNumberFormat`, `findSimpleValue`에 캐시가 없음, `clientIp`가 맨 오른쪽 XFF를 씀, `checkPayloadSize` 262,144, `require-action-client`의 `clients` 옵션, `playwright.config` 프로젝트, `deploy.sh`의 `common_env`와 `env_vars`, `deploy-sh.test` 선례, `isUniqueViolation`, Coverage awk(현재 판에서 86).

참고: Phase 4 브랜치는 42개 플랜 가운데 15개만 실행됐다. 그래서 `ui/table/use-editable-width.ts`처럼 04-49가 만들 파일은 아직 없다. 04가 이를 precondition으로 멈추게 해 두었으므로 결함으로 치지 않았다.

## 결과 요약
- P1: 0건
- P2: 1건
- P3: 9건. 지난 교차 검토의 R3-1 · R3-4 · R3-5 · R3-6 판정이 이 안에 들어 있다.
- 사용자 결정 E3-03 · E3-04 · E3-10은 다시 다투지 않았다.

## P2

**[P2] (confidence 8/10) 04.3-06-PLAN.md:223 · :228 · :241 ↔ 04.3-02-PLAN.md:377 · :379 — 06이 예외 갈래의 의도 줄 규칙을 바꾸는데, 02의 통합 기대값은 바꾸지 않은 채 06 verify가 그 테스트를 다시 돌린다**

두 플랜의 문장:
- 02:379: 「`put` 뒤 트랜잭션 실패를 주입하면 객체가 지워지고 의도 행 0」
- 02:377: 「주입한 `appendActionLog`가 tx 안에서 던지면 → … 가짜 저장소의 객체가 지워짐 · 의도 행 0」
- 06:223: 「(예외 갈래) … `store.delete(key)`(실패해도 그대로 진행) 후 원래 예외를 다시 던진다 … **이 갈래는 의도 줄을 지우지 않는다**」
- 06의 behavior: 「(로그 원자성) … 의도 줄 1(예외 갈래 — 04.3-12가 치운다)」
- 06:228: 「04.3-02의 `test/integration/cert-intake.test.ts` 기대값 갱신을 맡는다: `submitCertificate` 결과를 단언하는 줄만 — … `submitted` → `saved`」
- 06:241의 verify가 `test/integration/cert-intake.test.ts`를 함께 돌린다.

무엇이 틀리는가:
- 06대로 만들면 02의 두 케이스가 「의도 행 0」에서 빨갛게 된다.
- 06은 그 파일을 결과 이름 바꾸기 범위만 고치라고 막아 두었다. 실행자는 둘 중 하나를 고르게 된다. 범위 밖 수정을 하거나, 코드를 02 쪽 옛 규칙으로 되돌리는 것이다.
- 코드를 되돌리면 커밋 결과가 불명일 때 객체를 지우는 codex-final3-B 1 결함이 다시 생긴다.

고칠 것:
- 06:228의 갱신 범위에 「02의 C3 실패 주입 두 케이스(02:377 · :379)의 의도 행 기대값 0 → 1(예외 갈래 — 04.3-12가 치운다) · 객체 0은 그대로」를 넣는다.
- 06 acceptance에 이 갱신을 한 줄 더한다.
- 02:422의 7단계 문장 끝에 「04.3-06이 예외 갈래를 바꾼다」를 가리키는 말을 단다. append-only가 부담이면 06 쪽만 고쳐도 된다.

## P3

**[P3] (confidence 8/10) 04.3-06-PLAN.md:216 · :219 · :243 — 02에 없는 「200KB 상수」를 가리키고, 상한이 두 번 정의됐는지 찾는 검사가 아무것도 걸러내지 못한다**

- 06:219: 「04.3-02가 둔 200KB 상수와 시그니처·IHDR 검사는 이 함수 하나로 바꾼다」
- 02:418: 「**184,320바이트 = 180 KiB 이하**」. 02의 인라인 상한은 처음부터 184,320이다.
- 06:243의 verify는 `grep -cE '200[_ ]?(KB|\* ?1024|000)'`가 0인지 본다. 이 패턴은 처음부터 나타나지 않는다. 그래서 intake.ts에 인라인 `184_320`이 남아 상한이 둘이 되어도 잡지 못한다.
- 고칠 것: 문장을 「04.3-02의 인라인 184,320 검사」로 바꾼다. verify는 `grep -v '^\s*//' domain/certs/intake.ts | grep -cE '184[_,]?320'`이 0인지 보게 바꾼다.

**[P3] (confidence 8/10) 04.3-03-PLAN.md:244 — throttled 화면 문장을 옛 계약으로 적었다**

- 03:244 끝: 「throttled 화면 문구를 … 이 플랜이 정하지 않는다(→ `/plan-design-review` — UI-SPEC 승인 계약 그대로 「결과 불명」 줄)」
- 같은 플랜의 truth(03:60)와 03:320 · :376, 그리고 UI-SPEC:625는 전용 문장 `확인이 잠시 멈췄습니다 · 잠시 뒤 다시 눌러 주세요`를 쓴다(D-3).
- E2E가 정확한 문장을 단언하므로 실제 결함으로 이어지지는 않는다. 다만 Task 1 본문이 정본과 다르다.
- 고칠 것: 괄호를 「UI-SPEC 「E3 확인 잠시 멈춤」 문장(D-3) — 처리는 결과 불명과 같음」으로 바꾼다.

**[P3] (confidence 7/10) 04.3-01-PLAN.md:192 · :194, 04.3-UI-SPEC.md:806 — 줄 번호 참조가 어긋났고, 대체된 옛 계약을 가리킨다**

- 01:192는 「누적 20회에서 바로 잠기고(UI-SPEC:806)」라고 한다. 그런데 UI-SPEC:806은 「세 줄을 1차 뒤 `<div tabindex="-1" aria-live="polite">`에 넣고(1차 `aria-describedby` = 묶음 …)」이다.
- 이것은 2차 손질 기록이고, 지금 계약(UI-SPEC:198 · :382 · 01:192 자신의 「`aria-live` 없음」 · 두 `<p>` id)과 정반대다. 취소선도 없다.
- 01:194의 `UI-SPEC :160`은 빈 줄이다. 가리켜야 할 곳은 :163 또는 :588이다.
- 01:194의 `:199`는 「E3 재확인 실패」 줄이다. 택배 부제 `--fs-md`는 :584다.
- 고칠 것: 01의 참조를 :384 · :163 · :584로 바꾼다. UI-SPEC:806에는 다른 역사 항목처럼 취소선이나 「5차 이후 대체 — :198 · :382가 정본」을 단다.

**[P3] (confidence 6/10) 04.3-02-PLAN.md:452 — E3-27 순서 검사가 거짓으로 실패하거나, 검사하지 못한 채 통과할 수 있다**

- 검사는 `grep -n "loadDocumentNumberFormat(" … | head -1`이다.
- 같은 플랜이 주입 자리 `deps.loadDocumentNumberFormat`(02:376 · :419)를 두라고 한다. 흔한 꼴 `(deps.loadDocumentNumberFormat ?? loadDocumentNumberFormat)("cert")`에는 `loadDocumentNumberFormat(`가 나오지 않는다. 그러면 빈 문자열이 `test -lt`에 들어가 오류로 실패한다.
- 반대로 파일 머리의 기본 deps 객체에 `loadDocumentNumberFormat(k)` 래퍼가 있으면, 실제 호출 순서와 상관없이 첫 줄이 그 래퍼가 되어 통과한다.
- 고칠 것: `submitCertificate` 함수 본문만 잘라(`sed -n '/export async function submitCertificate/,/^}/p'`) 그 안에서 `loadDocumentNumberFormat\b` · `insertSignatureUploadIntent\b` · `withTransaction\b`의 첫 위치를 비교한다. 주입 꼴도 잡히도록 여는 괄호를 요구하지 않는다.

**[P3] (confidence 7/10) 04.3-06-PLAN.md:223 — 줄 번호와 사실이 Phase 4 판과 맞지 않는다**

- 06:223: 「`withTransaction`(`lib/db-transaction.ts:9`)은 Drizzle `db.transaction`을 그대로 부르고」
- :9는 Phase 4 이전 main의 줄이다. Phase 4 판은 :41이고, `withTimeoutConversion`으로 감싸 lock/pool 시간 초과를 `UserFacingError`로 바꾼 뒤 `SET LOCAL`을 먼저 낸다.
- commit 응답을 잃는 경우의 전파는 같아서 결론은 맞다.
- 06:229의 `vendor-form.tsx:136`은 Phase 4 판에서 :142다.
- 고칠 것: 줄 번호 대신 함수 이름으로 가리킨다. 「Phase 4 판 — `withTimeoutConversion` 안의 `db.transaction`」 한 마디를 더한다.

**[P3] (confidence 6/10) 04.3-02-PLAN.md:440 — 서명 판정 기준이 옛 규칙으로 남았다**

- 02:440: 「키보드 그리기 · `aria-live` 상태 · `pointercancel` · 24 판정 · 기준선은 04.3-06」
- UI-SPEC:835 · :404는 「획 길이 24」를 「PNG 잉크 288픽셀」로 바꿨다.
- 고칠 것: 「288 잉크 판정(`countInkPixels`)」으로 바꾼다.

**[P3] (confidence 7/10) 04.3-06-PLAN.md:190 ⓓ — R3-1: 재현 방법이 빠졌다**

- 06:190: 「ⓓ 기한을 지나게 하면 → `closed`」
- 06:216은 `now`를 (a)에서 한 번만 잡는다. 그래서 시계를 앞당기는 주입(`deps.now`)으로는 ⓓ를 재현할 수 없다.
- 고칠 것: 「`put` 장벽 동안 `db/client`로 행사 `expires_at`을 (a)의 `now`보다 과거로 고친다(시계 주입이 아님)」 한 줄을 붙인다. 실행자가 첫 시도에서 거짓 RED를 볼 수 있는 자리다.

**[P3] (confidence 6/10) 04.3-06-PLAN.md:216 ↔ :191 — R3-4: 두 문장이 서로 다르게 말한다**

- 06:216: 「제출 경로의 다른 어떤 단계도 `deps.now`를 다시 부르지 않는다」
- 06:191: 「제출 경로의 다른 함수가 같은 `deps.now`로 무관한 시각을 읽어도(예: 로그 시각) … 거짓 실패가 나지 않는다」
- 판정은 결과(`saved`)로 하므로 테스트는 흔들리지 않는다.
- 고칠 것: 216을 「만료 · 기한 판정에는 `deps.now`를 다시 부르지 않는다(다른 용도의 시각 읽기는 막지 않는다)」로 좁혀 191과 맞춘다.

**[P3] (confidence 4/10) 04.3-UI-SPEC.md:261 — R3-5: `block`이 무엇을 가리키는지 흐리다**

- UI-SPEC:261: 「`당첨자 {N}명 · 500명까지 줄이기`(`block` — I2 1차 막힘과 같은 문장, 새 문장 없음)」
- 이 줄은 `pinCellErrors`가 셀에 고정하는 오류다. 04:319는 「반환 모양은 문장 맵뿐이다 … `tone`은 없다」고 한다.
- 문맥상 `block`은 「같은 문장이 1차 막힘에서 갖는 톤」으로 읽힌다. 그래서 막는 문제는 아니다. 다만 10의 실행자가 셀 오류에 `tone: "block"`을 되살릴 여지가 있다.
- 고칠 것: 「(I2 1차 막힘 `block` 문장과 같은 글 — 셀 오류 표시에는 tone 없음, 04:319)」로 바꾼다.

**[P3] (confidence 6/10) 04.3-02-PLAN.md:472 — R3-6: 상수 이름 grep이 import 줄에도 맞는다**

- 02:472: 「`grep -E '"certs\.submissions"|CERTS_SUBMISSIONS' test/e2e/cert.setup.ts`가 1 이상」
- `import { CERTS_SUBMISSIONS } …` 한 줄만 있어도 통과한다.
- E2E나 통합 테스트가 권한을 소비하므로 막는 문제는 아니다.
- 고칠 것: `grep -v '^\s*import' test/e2e/cert.setup.ts | grep -E …`로 import 줄을 빼고 센다.

## 확인했고 문제 없음
- 03:187의 R3-3 갈래(`isIPv6`도 아니면 원문)와 03:244의 R3-2 메시지 형식이 복원돼 있다.
- `clientIp`는 맨 오른쪽 XFF 값을 쓴다. Cloud Run에 직접 연결된 구조라 클라이언트가 값을 위조해 앞에 붙여도 IP 한도를 우회하지 못한다.
- 테스트 환경은 `BETTER_AUTH_SECRET`을 `??=`로 채운다(`playwright.config.ts:8` · `test/integration/global-setup.ts:13`). 그래서 `certIpHash`가 빈 secret에서 던져도 로컬 E2E와 통합 테스트는 깨지지 않는다.
- 풀 교착 RED 가정이 성립한다. `findSimpleValue`에 캐시가 없어 두 번째 풀 연결을 실제로 잡고, 풀 크기는 5, 연결 대기 한도는 5초다.
- `document_submit`은 `ALWAYS_ON`이 아니다. 그래서 tx 전에 `submitLogEnabled`를 미리 읽는 것이 맞다.
- 서명 크기 예산이 맞는다. base64 245,760바이트는 262,144바이트 한도 안에 든다.
- `ADD CONSTRAINT … UNIQUE USING INDEX … DEFERRABLE INITIALLY IMMEDIATE`는 Postgres 문법에 맞다. PG16의 `ALTER CONSTRAINT`가 FK에만 쓰인다는 설명도 맞다.
- 04의 `create_request_id` 멱등은 23505를 받으면 트랜잭션 밖에서 `created_by` 범위로 다시 찾는다.
- wave 3(03 · 04 · 05)의 `files_modified`에는 겹치는 파일이 없다.

---

## review-B

# 04.3 계획 문서 /review — 샤드 B (07~13 · VALIDATION · COVERAGE)

대상: 브랜치 `claude/plan-phase-04-3-9wian4` HEAD 7baa0d2 (merge-base a65c383). 문서만 바뀐 PR이다.
방법: gstack `review/checklist.md`의 CRITICAL(SQL · 데이터 안전, 경합, 신뢰 경계, 셸/배포 스크립트 · KMS/IAM, enum 완결성)과 INFORMATIONAL 항목을 **계획이 시키는 코드**에 적용했다. 기존 코드에 대한 주장은 `origin/main`과 Phase 4 브랜치 `origin/claude/gsd-progress-e1nzgu`(4684e7a, 아직 main에 머지되지 않음)에서 직접 확인했다. E3-03 · E3-04 · E3-10 결정은 다시 따지지 않았다.

## 요약

| 등급 | 건수 |
|---|---|
| P1 | 1 |
| P2 | 4 |
| P3 | 6 |

---

## P1

### [P1] (confidence 7/10) 04.3-08-PLAN.md:183 · :191 — 풀린 데이터 키를 모듈 안 변수에 두면 instrumentation과 라우트 · 액션이 서로 다른 모듈 인스턴스를 쓸 수 있다

- 인용 08:183 「③-b 모듈 안에 풀린 키 저장소(버전 → `Buffer`)를 두고 `loadDataKeys(deps?)`를 더한다」
- 인용 08:191 「`instrumentation.ts`(저장소 루트, 새 파일): `export async function register()` — `process.env.NEXT_RUNTIME === "nodejs"`일 때만 `lib/crypto`를 동적 import해 `await loadDataKeys()`」
- 인용 08:184 「감싼 변수만 있고 아직 안 풀렸으면 `MissingEncryptionKeyError`」
- **문제:** Next 16은 `register()`를 `.next/server/instrumentation.js` 한 파일에서 따로 불러 실행한다(`node_modules/next/dist/server/lib/router-utils/instrumentation-globals.external.js`의 `require(path.join(projectDir, distDir, 'server', 'instrumentation.js'))`). 앱 페이지(RSC)와 서버 액션(action-browser)은 다른 엔트리 · 다른 번들러 레이어로 빌드된다. 같은 `lib/crypto.ts`라도 레이어가 다르면 모듈 인스턴스가 따로 생긴다(`next build` 기본 번들러 Turbopack은 모듈 id에 레이어가 붙는다).
  - 그러면 `register()`가 채운 키 저장소는 instrumentation 쪽 인스턴스에만 있다.
  - `revealRrn` · `submitCertificate` · 거래처 `revealAccountNumber`가 쓰는 인스턴스는 비어 있어, 감싼 변수만 있는 스테이징 · 프로덕션에서 `encrypt` · `decrypt`가 모두 `MissingEncryptionKeyError`로 끝난다.
- **왜 검증에서 안 잡히나:**
  - 단위 테스트는 주입한 `unwrap`과 같은 모듈 그래프를 쓴다.
  - 로컬 · CI E2E는 평문 키라서 `loadDataKeys`가 아무것도 하지 않는다(08:166).
  - 배포 스모크(`scripts/deploy.sh` `smoke`)는 `/api/health` · `/login` · 로그인 시도만 본다.
  - 결국 머지(= 스테이징 자동 배포) 뒤 사람 스모크(13)에서야 드러난다.
- **고칠 점:**
  - 풀린 키를 `globalThis[Symbol.for("plant8.appDataKeys")]`에 둔다. 모듈 변수는 쓰지 않는다.
  - 단위 테스트를 하나 더한다: `vi.resetModules()` 뒤 다시 import한 `lib/crypto`(다른 인스턴스)에서도 `loadDataKeys` 결과가 보여야 한다.
  - 배포 스모크가 라우트 쪽 인스턴스에서 키 준비를 확인하게 한다. 예: `/api/health`가 `encrypt` → `decrypt` 왕복 결과를 싣고 `smoke`가 그 값을 본다.

---

## P2

### [P2] (confidence 9/10) COVERAGE.md:5 · :22 · :24 · :44 · :48 · :53 — 버킷 · KMS 키링 · IAM을 누가 만드는지가 04.3-05 · 08과 반대로 적혀 있다

- 인용 COVERAGE:44 「`scripts/deploy.sh`가 `gcloud kms keyrings create` / `keys create`로 만든다」
- 인용 COVERAGE:48 「`roles/cloudkms.cryptoKeyDecrypter` 바인딩은 `scripts/deploy.sh`가 건다」
- 인용 COVERAGE:22 「버킷은 `scripts/deploy.sh`가 `gcloud storage buckets create/update`로 만든다」
- 인용 COVERAGE:24 「IAM 바인딩은 `scripts/deploy.sh`가 `gcloud`로 건다」
- **반대쪽 근거:**
  - 08:65 「`scripts/bootstrap-gcp.sh`(소유자, PR 머지 전)가 키링·대칭 키를 서울에 만들고 … `scripts/deploy.sh`의 `ensure_kms_key`는 이 자원들이 있는지 확인만 한다」
  - 08:296 verify는 `deploy.sh`에 `kms (keyrings|keys) create`가 있으면 실패한다.
  - 05:49 「버킷을 만드는 쪽은 소유자의 부트스트랩이다」
- **문제:**
  - 08:151의 read_first가 실행자에게 COVERAGE KMS 표부터 읽게 한다.
  - E3-12 교차 B-3(최소 권한)이 뒤집은 설계가 COVERAGE에는 옛 모양으로 남아 있다.
  - COVERAGE는 API 사용 범위의 정본이다. 머지 뒤 문서로 남으면 운영자가 배포자에게 키링 생성 권한을 다시 줄 근거가 된다.
- **고칠 점:** 여섯 줄의 주체를 `scripts/bootstrap-gcp.sh`(소유자, 머지 전)로 바꾸고, `deploy.sh`는 「확인만(`kms keys describe` · 버킷 확인 · 맞춤)」으로 적는다. KMS 소개 문단(:38)의 「키링·키 생성과 감싸기는 운영자가 `scripts/deploy.sh`·`gcloud kms`로」도 「생성은 bootstrap, 감싸기는 deploy」로 나눈다.

### [P2] (confidence 8/10) 04.3-07-PLAN.md:6 · :184 — 같은 웨이브 4의 04.3-06이 `submitCertificate` 입력에 필수 `winnerVersion`을 더하는데, 07 통합 테스트는 `submitCertificate`를 직접 불러 표본을 만든다

- 인용 07:184 「제출 표본은 04.3-02의 domain 흐름(`selectWinner` → `verifyLast4` → `submitCertificate`)으로 만든다」
- 인용 07:6 `depends_on: ["04.3-03", "04.3-04"]` — 06이 없다
- 인용 06:234 「③ (c)가 domain 제출 입력에 `winnerVersion`을 필수로 더하므로 `test/e2e/helpers/cert.ts` `seedSubmittedCert()`의 `submitCertificate` 호출 줄을 **같은 커밋에서** 맞춘다」
- **문제:**
  - 06은 표본 도우미(`seedSubmittedCert`)만 고친다.
  - 07은 병렬 워크트리에서 녹색으로 끝나지만, 웨이브 머지 뒤에는 `cert-crypto.test.ts` · `cert-review.test.ts`의 직접 호출이 zod 입력 검사나 typecheck에서 깨진다.
  - E3-32가 E2E에 대해 같은 이유로 `seedSubmittedCert`만 쓰라고 정했는데(07:390), 통합 테스트에는 그 규칙이 없다.
  - 12:20은 「제출 표본은 `seedSubmittedCert()`로만 — 표본 만드는 길을 한 곳에」로 이미 통일했다.
- **고칠 점:** 07 Task 1 ②의 표본 생성을 `seedSubmittedCert({ …rrn })`(04.3-02 C4)로 바꾼다. 또는 07 `depends_on`에 04.3-06을 더한다(그러면 웨이브 5로 밀린다).

### [P2] (confidence 8/10) 04.3-VALIDATION.md:55 · :75 — 어느 플랜도 만들지 않는 `test/e2e/cert-intake.spec.ts`를 가리킨다

- 인용 VALIDATION:55 「`pnpm playwright test test/e2e/cert-intake.spec.ts` | ❌ W0」
- 인용 VALIDATION:75 「`test/e2e/cert-intake.spec.ts` — 로그인 없는 외부 흐름 E2E (CERT-01)」
- **근거:**
  - 01~13 PLAN 전체를 grep하면 이 경로는 0건이다.
  - 실제 외부 흐름 E2E는 `test/e2e/mobile-cert-intake.spec.ts`(02) · `mobile-cert-verify.spec.ts`(03) · `mobile-cert-submit.spec.ts`(06)다.
  - 이 스펙들은 `certs` 프로젝트(`*cert*.spec.ts`)와 `cert-setup` 의존이 있어야 돈다.
- **문제:** 이 명령은 「No tests found」로 실패하거나 다른 필터에 걸려 아무것도 검증하지 않는다. `/gsd-validate-phase`가 이 표를 씨앗으로 쓰므로 틀린 경로가 그대로 옮겨진다.
- **고칠 점:** 경로를 실제 세 스펙으로 바꾼다. 명령은 `pnpm playwright test --no-deps --workers=1 --project=cert-setup --project=certs test/e2e/cert.setup.ts test/e2e/mobile-cert-*.spec.ts` 꼴로 쓴다.

### [P2] (confidence 6/10) 04.3-10-PLAN.md:57 · :384 — 셀 오류 문장 수가 「9종」으로 남아 있다(04가 11종 · `pinCellErrors` 12종으로 정했다)

- 인용 10:57 「셀 오류 문장은 I2와 같은 9종이다」
- 인용 10:384 「셀 오류 `code` → 문장 선택(Copywriting I2 셀 오류 9종)」
- 인용 04:206 「UI-SPEC Copywriting 「I2 셀 오류」 11종(기존 9종 + 길이 둘 …)」 · 「`pinCellErrors` 유니온만 12종」
- **문제:** 10의 공용 부품 `winner-table-parts.tsx` 실행자가 9종 매핑을 만들 수 있다. 그러면 I3에서 `nameTooLong` · `prizeTooLong`(E3-21) · `tooManyWinners`(E3-35, 10:227이 단언한다)의 문장이 빠진다. 10:725 ledger에는 11종이 적혀 있어 문서 안에서도 서로 어긋난다.
- **고칠 점:** 두 곳을 「11종(`validateWinnerRows`) + `tooManyWinners` = `pinCellErrors` 12종 — 04.3-04 `pinCellErrors`를 그대로 쓴다」로 바꾼다.

---

## P3

### [P3] (confidence 7/10) 04.3-08-PLAN.md:298 — 프로젝트 단위 KMS 역할을 막는 grep이 실제 추가 경로를 보지 못한다

- 인용 08:298 「`test "$(grep -v '^\s*#' scripts/bootstrap-gcp.sh | grep -cE 'projects add-iam-policy-binding.*cloudkms')" = 0`」
- **근거:** `scripts/bootstrap-gcp.sh`(Phase 4 브랜치 119~121행)는 `for role in run.admin cloudsql.admin …; do gcloud projects add-iam-policy-binding … --role="roles/${role}"`처럼 역할 이름을 반복 목록에 둔다. 이 목록에 `cloudkms.admin`을 넣어도 grep은 0을 낸다(검사가 헛돈다).
- **고칠 점:** `grep -E '^for role in .*cloudkms'`도 0인지 함께 본다. 또는 `bootstrap-sh.test.ts`에 「프로젝트 단위 `add-iam-policy-binding` 호출의 `--role`에 `cloudkms`가 없다」 단언을 더한다.

### [P3] (confidence 8/10) 04.3-08-PLAN.md:284 — 「`rotated` 0이면 v1 암호문이 남지 않았다」가 사실이 아니다

- 인용 08:284 「(3) 한 번 더 돌려 모든 대상의 `rotate_key.done` `rotated`가 0이면 v1 암호문이 남지 않았다」
- **근거:** 02:281 「`p` = `encrypt(증표)` 문자열」 — `cert_winners.verify_idem_outcome` 맵 안의 `p`도 데이터 키 암호문이다. 그런데 08:197의 `TARGETS`에는 `rrn_encrypted` · `token_encrypted` 둘만 더한다.
- **영향:** 작다. v1은 서비스에서 떼지 않고(08:284 (4)), `p`는 증표 만료(`until`) 뒤에는 쓰이지 않는다. 다만 런북 문장이 틀렸다.
- **고칠 점:** 문장을 「회전 대상 칸에서 v1 암호문이 남지 않았다(확인 멱등 맵의 짧게 사는 증표 암호문은 대상 밖 — v1을 떼지 않는 이유 중 하나)」로 고친다.

### [P3] (confidence 9/10) 04.3-07-PLAN.md:149 — `revealAccountNumber` 줄 범위가 틀렸다

- 인용 07:149 「`domain/vendors/index.ts` 360~393행(`revealAccountNumber` — deps 주입 · 순서)」
- **근거:** main과 Phase 4 브랜치 모두 360행은 `updateVendor`의 `project(...)` 반환 줄이다. `RevealAccountNumberDeps` 타입은 368행, 함수는 376~393행이다.
- **고칠 점:** 「368~393행」으로 고친다(또는 이름으로 찾게 한다).

### [P3] (confidence 9/10) 04.3-08-PLAN.md:157 · :183 · :187 — `vendor-form.tsx:12`는 Phase 4 머지 뒤 13행이다

- 인용 08:183 「`app/(app)/admin/vendors/vendor-form.tsx:12`가 `maskTail4`를 위해 import」
- **근거:** main은 12행이지만 Phase 4 브랜치는 13행이다(`import { maskTail4 } from "@/lib/crypto"`). 08은 Phase 4 머지 뒤에 시작한다(08:130).
- **고칠 점:** 줄 번호를 빼고 「`maskTail4` import 줄」로 가리킨다(다른 곳에서 쓰는 「이름으로 찾는다」 규칙과 맞춘다).

### [P3] (confidence 5/10) 04.3-07-PLAN.md:253 · :205 — 권한이 없는 사람도 I4 주소를 열면 개인정보 비활동 시계가 걸린다

- 인용 07:253 「`requireSession` → 세션 id로 `touchPrivacySession` → `expired`면 `redirect("/login")` → `getSubmissionForReview`가 `notFound`면 `notFound()`」
- 인용 07:205 「넘으면 세션 행을 지우고 `expired`」
- **문제:** 기획 PM처럼 `certs.submissions` 권한이 없는 사람이 I4나 인쇄 주소를 한 번 열었다가(404) 120분 넘게 지나 다시 열면 ERP 세션 전체가 끊긴다. 개인정보를 본 적이 없는데 「개인정보취급자」 규칙이 적용된다.
- **고칠 점:** `touchPrivacySession` 앞에 값싼 판정(`isCertPrivacyBarredRole` · `can(viewer, "certs.submissions", "view")`)을 두고, 통과한 사람에게만 활동을 기록 · 만료한다(11 인쇄 라우트도 같게). 또는 이 교환을 T-04.3-17 잔여 위험에 한 줄 적는다.

### [P3] (confidence 6/10) 04.3-VALIDATION.md:80~84 — 사람 확인 목록이 13의 목록과 어긋난다

- 인용 VALIDATION:84 「실제 폰 카메라로 행사 QR을 찍어 진입」(한 줄뿐)
- 인용 13(truths) 「사람만 판정할 수 있는 항목(실기기 서명 · 보조기술 · 실제 인쇄 미리보기 · 카메라 QR 스캔 · 동의 전문 법무 확인 · **스테이징 스모크** …)」
- **고칠 점:** 13의 목록(특히 스테이징 스모크 — P1의 KMS 경로를 실제로 증명하는 유일한 단계)을 VALIDATION Manual-Only 표에 옮긴다.

---

## 확인했고 문제없던 주장(발췌)

- `recordAction(viewer, entry, deps)`: `deps.appendActionLog ?? default`와 `deps.tx` 전달, ALWAYS_ON 종류는 설정 조회를 건너뛴다. 대상은 Phase 4 `domain/action-log/record.ts:131-162`이고, 07 · 10 · 12의 `{ tx, appendActionLog: deps?.appendActionLog }` 호출과 맞는다.
- `POOL_CONNECTION_TIMEOUT_MS = 5000`(Phase 4 `db/client.ts:20`) · `DB_POOL_MAX` 기본 5(`lib/env.ts:54`) · 풀 하나(`db/client.ts:48`).
- `lib/actions/payload-size.ts:7`의 262,144와 `lib/actions/client.ts:26-30` 미들웨어(10:74).
- `node_modules/drizzle-orm/node-postgres/session.js` 185~191행: commit 실패 → rollback → 다시 던짐(10:281).
- Next 문서: `loading.md` 76 · 86 · 103 · 118행, `layout.md` 316~323행, `06-fetching-data.md` 460행, `error.md`의 `retry`(11). 모두 인용과 같다. `next.config.ts`에 `cacheComponents`가 없다.
- `role-menu.test.ts`의 `ADMIN_MENU_KEYS`(131행) · `adminRouteExists`(145~156행) · `/admin/${…}` 단언(267행)은 09:116 · :124 설명과 맞다.
- `seedMasterData`의 PM 노출 `upsertVisibility`(main 173행) · `permissions.ts:113` `onConflictDoUpdate`(09:40)는 main 기준으로 정확하다.
- `lib/env.ts` 주석 「Cloud Run Job은 이 키를 받지 않으므로 존재 자체는 강제하지 않는다」: 12의 `purge-certs` Job이 데이터 키 없이 뜨는 전제가 맞다.
- `deploy.sh`는 `--set-secrets`(교체)를 쓴다: 08의 「같은 버전 평문 + 감싼 변수 동시 존재 금지」 refine이 옛 `APP_DATA_KEY_v1` 연결과 부딪히지 않는다.
- 12의 파기 대상 거친 조건 「제출 now − 1년」은 보존 연수 하한 1(02:223 `정수 1~20`)이면 기한이 늘 제출 후 14개월 이상이라 대상을 빠뜨리지 않는다.
- 같은 웨이브에서 겹치는 `files_modified`는 없다. 겹치는 파일(`record.ts` 07→10→12, `deploy.sh` 08→12, I4 파일 07→11)은 모두 웨이브 순서와 `depends_on`으로 줄지어 있다.

---

## review-adversarial-opus

Codex 대신 Opus, 한도 풀리면 Codex 재확인 필요 (Codex 한도 2026-09-29까지)

# 04.3 `/review` Step 5.7 적대적 검토 (문서 전용 PR)

- 대상: `claude/plan-phase-04-3-9wian4` HEAD 7baa0d2와 origin/main의 차이. 플랜 04.3-01~13, UI-SPEC, VALIDATION, docs/designs 04.3 검토서 셋.
- 저장소 실측: Phase 4는 `origin/claude/gsd-progress-e1nzgu`(아래에서 「P4」)를 `git show`로 읽었다.
- `cso-apply-cross-r3.md`에서 해결된 항목(R2-*, R3-1~6)은 다시 적지 않았다. 사용자 결정 E3-03 · E3-04 · E3-10과 설계 /cso가 확정한 수치(E3-08 · D-16 · M-3 · E3-12 · E3-15 · E3-16 · X-10)도 다시 다투지 않았다.

## 확인했고 문제가 없던 공격면 (적지 않은 이유)
- XFF 위조로 IP 한도 우회: P4 `lib/client-ip.ts:11-20`이 **마지막** 항목을 쓴다. Cloud Run이 뒤에 붙이는 값이라 위조되지 않는다.
- 본문 크기와 압축 폭탄: 02:569 T-04.3-10, 06:212의 `maxOutputLength`, 06:55 본문 예산에서 다룬다.
- 파기와 정정이 겹칠 때: 07:187 조건부 갱신에 `purged_at IS NULL`이 있어, 파기된 줄에 정정이 개인정보를 되살리지 못한다.
- 트랜잭션 안 전역 db 교착: 02:99 · 03:236 (a0) · 06:227 (h) · 07:195 · 10:289가 설정과 플래그를 tx 전에 읽는다. 끌 수 없는 종류의 로그는 tx 안에서 설정을 읽지 않는다.
- 동시 배포 때 키가 두 번 생기는 경합: P4 `.github/workflows/deploy.yml:38-40`의 `concurrency: deploy`가 직렬화한다.
- 비밀 교체: P4 `deploy.sh:461`이 `--set-secrets`로 전체를 교체하므로, 평문 키와 감싼 키가 함께 붙는 부팅 오류(08:172)가 배포 때 생기지 않는다.
- 서명 객체 이름: 02:577 · 05:42에 따라 `signatures/{eventId}/{winnerId}-{uuid}.png` 꼴이라 개인정보가 없다. 버킷은 소프트 삭제 0이다(05:203).

## 발견

[P2] (confidence 7/10) 04.3-03-PLAN.md:238 · :244 (+ :456 T-04.3-30) — **공개 확인 요청은 한도를 넘었든 아니든 모두 행사 행 `FOR UPDATE`를 먼저 잡는다.** 속도 제한은 그 잠금 뒤에 판정되고, 잠금 대기에는 시간 제한이 없다. 그래서 요청이 몰리면 풀 연결이 고갈된다.
- 순서는 03:238 「(c) `withTransaction` 안에서 `lockEventRow` → 자리 행 `FOR UPDATE`」 다음에 03:244 「(f) … `countRecentMisses(...)` → … `{kind: "throttled"}`」이다. 위협 등록부 03:452 T-04.3-03도 「행사 행을 잠근 뒤 지난 15분 틀림이 …」라고 적는다.
- `countRecentMisses`는 잠금을 쥔 채로 그 행사 모든 자리의 맵을 `jsonb_each`로 편다(03:231). 명단은 최대 500명이고, 자리마다 `ok` 20개와 60분치 `wrong`이 들어 있다.
- 저장소 실측:
  - P4 `db/client.ts:20` `POOL_CONNECTION_TIMEOUT_MS = 5000`, `:34-41` `max: env.DB_POOL_MAX`. `statement_timeout`과 `lock_timeout`이 없어서, 잠금을 기다리는 트랜잭션이 연결을 무기한 쥔다.
  - P4 `scripts/deploy.sh:456` `--concurrency=80`. 02:99는 풀 기본값을 5로 적는다.
  - P4 `proxy.ts`의 matcher는 `/api/auth/:path*`뿐이라, `/c/*` 앞에서 DB 전에 걸리는 제한이 없다.
- 공격 시나리오: 현장 QR만 가진 공격자가 `verifyLast4Action`을 초당 수십 번 보낸다. 한도에 걸린 뒤에도 매 요청이 행사 잠금 대기열에 서서 인스턴스마다 풀 연결 5개를 붙든다. 같은 인스턴스의 **내부 ERP 요청 전체**(지출결의 등)가 5초 뒤 「다른 저장이 끝나지 않음」으로 실패한다. 같은 행사의 정상 확인 · 제출(06:227 (f)도 같은 행사 잠금을 쓴다)과 담당자 일괄 저장도 함께 멈춘다.
- 공격자가 없어도 생긴다: 500명 행사장에서 동시에 몰리면 확인 전부가 한 줄로 서고, 매번 전체 맵을 편다. 10:570 T-04.3-193은 「A2 규모(행사당 수~수십 명)」만 받아들였다.
- T-04.3-30 · 110은 한도 **소진**만 다룬다. 잠금 대기로 **풀이 고갈**되는 경우는 위협 등록부 어디에도 없다. 검토서들을 grep한 결과(`폭주 · 경합 · lock_timeout · FOR UPDATE`)도 0건이다.
- 고칠 것(03에 한정, 결정 수치는 바꾸지 않음):
  1. (f)의 셈을 잠금 없는 짧은 읽기로 **트랜잭션 전에 한 번** 한다. 이미 넘었으면 곧바로 `throttled`를 돌려준다. 잠근 뒤에도 지금처럼 다시 판정한다(동시 요청이 한도를 넘지 못하는 계약은 그대로 둔다).
  2. 확인과 제출 트랜잭션 머리에 `SET LOCAL lock_timeout`(예: 3s)을 두고, `55P03`은 「결과 불명」 갈래로 보낸다. 서버 로그에는 C2 규칙대로 코드만 남긴다.
  3. 위협 등록부에 「잠금 대기 풀 고갈」 행을 하나 더한다. 통합 케이스 하나도 더한다: 한도 넘은 동시 요청 `DB_POOL_MAX`×3 동안 다른 행사의 `loadIntake`가 5초 안에 끝난다.
- 막지 않는 이유: 기능이 프로덕션에서 꺼져 있고(02:90, Phase 11 전), 규모 가정이 A2다. 다만 실행 전에 03에 반영하기를 권한다.

[P3] (confidence 6/10) 04.3-02-PLAN.md:109 · :570 (T-04.3-11) — 「서버 로그에 … 토큰 평문이 없다」와 「로그에 토큰 · 개인정보를 남기지 않는다」는 앱 로그에만 맞는 말이다.
- Cloud Run이 자동으로 남기는 요청 로그(`requestUrl`)에는 `/c/{token}`이 그대로 찍힌다. 페이지 GET뿐 아니라 서버 액션 POST도 페이지 URL로 가기 때문이다. 프로젝트 로그 열람 권한이 있는 사람은 모든 행사 링크를 모을 수 있다.
- 링크는 현장에 공개되고 확인에는 뒤 4자리가 필요하므로 영향은 작다. 문제는 truth 문장이 사실과 다르다는 점이다.
- 고칠 것: truth의 범위를 「앱 로그(`lib/log.ts`) · 행동 로그」로 좁힌다. T-04.3-11에는 인프라 요청 로그를 받아들인 잔여 위험으로 적는다(또는 `/c/` 경로에 로그 제외 필터를 건다).

[P3] (confidence 6/10) 04.3-08-PLAN.md:66 · :284(「평문 시크릿 버전 `disable`」) · :331(T-04.3-18 「시크릿에는 KMS 암호문만 … 평문 시크릿은 런북대로 끈다」) — 끈(disable) 버전은 되살릴 수 있다.
- `secretmanager.admin`을 가진 누구든 다시 켜서 읽을 수 있다. 08:278은 배포자가 그 역할을 가졌다고 적는다.
- 런타임 SA의 평문 시크릿 `secretAccessor` 바인딩(P4 `scripts/deploy.sh:271`)도 떼는 단계가 없다.
- 그래서 「시크릿 하나가 새도 그것만으로 풀 수 없다」(08:115)는 운영자가 파기(destroy)할 때까지 성립하지 않는다.
- 배포자가 KMS decrypt 권한도 가졌으므로(E3-12, 받아들인 결정) 실질 영향은 작다.
- 고칠 것: 런북 승격 순서 끝에 「두 환경 확인 + 유예 기간 뒤 `gcloud secrets versions destroy` · 런타임 SA의 평문 시크릿 바인딩 제거」를 넣는다. 또는 T-04.3-18의 disposition을 잔여 위험을 명시하는 쪽으로 고친다.

[P3] (confidence 6/10) 04.3-12-PLAN.md:39(파기는 칸 비우기) · :292(T-04.3-59) — 파기 뒤에도 Cloud SQL 자동 백업과 PITR 로그에는 비운 개인정보가 남는다(주민등록번호 암호문 포함, 키도 남아 있어 풀린다). P4 `scripts/deploy.sh:200` `--retained-backups-count=7`이 근거다.
- 혼돈 시나리오: 장애 복구로 파기 전 백업을 복원하면 파기된 행이 조용히 되살아난다. 서명 객체는 소프트 삭제 0이라 없어졌는데 `signature_key`는 채워진 채로 남아 참조가 끊긴다.
- 고칠 것: OPERATIONS 파기 절과 T-04.3-59에 두 줄을 더한다. ① 「백업 보관 7일이 지나야 완전 파기」 ② 「백업 · PITR 복원 뒤에는 곧바로 `purge-certs --apply`를 한 번 돌린다(기한이 지난 행이 다시 비워지고, 없는 객체는 이미 지워진 것으로 친다 — 12:40)」.

## 집계
- P1 0건 · P2 1건 · P3 3건

판정: 막는 문제 없음
