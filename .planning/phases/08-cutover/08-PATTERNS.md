# Phase 8: 전환 (cutover) - Pattern Map

**Mapped:** 2026-11-04
**Files analyzed:** 11 (신규 7 · 수정 4)
**Analogs found:** 11 / 11 (전부 git 추적 파일 확인함)

> 파일 목록은 08-RESEARCH.md 권장안(§4.5 B, §4.6, §2 CUTOVER.md)을 따랐다. 확정이 아닌 항목은 「가정」으로 표시. 위험 경로(`.github/workflows/`·`scripts/deploy.sh`·`infra/`·`db/`)는 사용자 머지 PR로 따로 뗀다.

## File Classification

| 신규/수정 파일 | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `.github/workflows/cutover.yml` (신규, 이름 가정) | workflow | request-response (dispatch → Job) | `.github/workflows/restore-rehearsal.yml` + `account.yml` | exact |
| `scripts/cutover-cli.ts` (신규, 이름 가정) | CLI/utility | batch + 트랜잭션 삭제 | `scripts/demo-data.ts:452-564` + `scripts/purge-certs.ts` | exact |
| `domain/cutover/*` 표 분류·삭제 순서 (신규, 위치 가정) | domain/service | batch | `scripts/demo-data.ts` `purgeDemoData` | role-match |
| `domain/settings/keys.ts` (수정: `cutover.at` 키) | config | CRUD | 같은 파일 `TAX_ROUNDING_*` | exact |
| `repositories/{projects,quote-revisions,quote-lines,revenue-entries}.ts` + 기본값 의존 5표 (수정) | repository | CRUD | 기존 `source: input.source ?? "demo"` 4곳 | exact |
| `repositories/document-counters.ts` (수정/재사용: 카운터 초기화) | repository | CRUD | 같은 파일 `lockDocumentCounter` | exact |
| `domain/ops/restore-check-tables.ts` (수정: 업무 표 추가) | config | transform | 같은 파일 목록 | exact |
| `scripts/deploy.sh` `deploy_jobs` · `infra/names.sh` · `scripts/build-cli.mjs` (수정) | config/infra | - | 같은 파일의 `restore`·`purge-certs` 줄 | exact |
| `docs/CUTOVER.md` (신규) + `docs/OPERATIONS.md` 포인터 | docs | - | `docs/CERT-PURGE.md` | role-match |
| `test/unit/docs-limits.test.ts` (수정: CUTOVER 상한) | test | - | 같은 파일 | exact |
| `test/unit/deploy/cutover-workflow.test.ts`, `test/integration/cutover.test.ts`, 표 분류 가드 테스트 (신규) | test | - | `restore-rehearsal-workflow.test.ts`, `demo-data.test.ts` | exact / role-match |

## Pattern Assignments

### `.github/workflows/cutover.yml` (workflow, dispatch → Cloud Run Job)

**Analog:** `.github/workflows/restore-rehearsal.yml` (입력 가드) + `account.yml` (Job 실행·로그 폴링)

**트리거·입력 가드** (restore-rehearsal.yml:12-22, 47-62):
```yaml
on:
  workflow_dispatch:
    inputs:
      env: { type: choice, options: [staging, production], default: staging }
      confirm_production: { type: string, default: "" }
permissions: { contents: read, id-token: write }
...
      - id: input-guard
        shell: bash
        env: { REF: "${{ github.ref }}", INPUT_ENV: ..., CONFIRM_PRODUCTION: ... }
        run: |
          if [ "$REF" != "refs/heads/main" ]; then echo "::error::main에서만 돕니다" >&2; exit 1; fi
          if [ "$INPUT_ENV" = "production" ] && [ "$CONFIRM_PRODUCTION" != "plant8-prod-db" ]; then ... exit 1; fi
```
추가 입력: `mode`(dry-run|apply), apply용 `confirm`(dry-run이 찍은 건수 요약). 입력은 반드시 `env:`로 받아 쉘에 보간하지 않는다.

**WIF 인증** (account.yml:42-48 = restore-rehearsal.yml:58-63 동일):
```yaml
      - uses: actions/checkout@v4
      - id: auth
        uses: google-github-actions/auth@v3
        with:
          workload_identity_provider: projects/${{ vars.GCP_PROJECT_NUMBER }}/locations/global/workloadIdentityPools/github/providers/erp-repo
          service_account: gha-deployer@${{ vars.GCP_PROJECT_ID }}.iam.gserviceaccount.com
      - uses: google-github-actions/setup-gcloud@v3
```

**Job 실행·args·execution name 고정·로그 폴링** (account.yml:60-75, 100 부근):
```bash
source infra/names.sh
ENV_SHORT="$INPUT_ENV"; [ "$ENV_SHORT" = "production" ] && ENV_SHORT="prod"
JOB="$(job_name "$ENV_SHORT" cutover)"      # names.sh 주석 목록에 cutover 추가
EXEC="$(gcloud run jobs execute "$JOB" --region "$REGION" --project "$PROJECT" --args="$ARGS" --wait --format='value(metadata.name)')"
# poll_logs: execution_name으로 좁혀 Cloud Logging에서 한 줄(예: cutover.done)을 찾아 요약에 쓴다
```
**동시성:** restore-rehearsal은 별도 그룹(`restore-rehearsal`)이지만 이 작업은 마이그레이션과 겹치면 안 되므로 `concurrency: group: deploy`(deploy.yml:40) 공유 — RESEARCH §4.6 권고. `cancel-in-progress: false`.
**timeout:** `timeout-minutes` 명시(Job `--task-timeout=15m` 보다 크게).

---

### `scripts/cutover-cli.ts` (CLI, dry-run 기본 → `--apply`)

**Analog:** `scripts/purge-certs.ts` (인자 규약·진입점), `scripts/restore-rehearsal-cli.ts` (APP_ENV 검사 뒤 동적 import)

**인자 규약: 기본 dry-run, 등호 결합 거부** (purge-certs.ts:11-25):
```typescript
export class UsageError extends Error {}
export function parseArgs(argv: string[]): { apply: boolean } {
  let apply = false;
  for (const token of argv) {
    if (token.startsWith("--") && token.includes("=")) throw new UsageError(`등호 결합(--flag=value) 토큰은 지원하지 않습니다: ${token}`);
    if (token === "--apply") apply = true;
    else if (token.startsWith("--")) throw new UsageError(`알 수 없는 플래그: ${token}`);
  }
  return { apply };
}
```
**진입점·로그·종료코드** (purge-certs.ts:28-48): `import.meta.url === pathToFileURL(process.argv[1]).href` 가드 → 성공 시 `log.info("purge_certs.done", { mode, ...result })` → `closeDb()` → `process.exit(0)`; 실패 시 `console.error` 후 `exit(1)`. 새 CLI도 `cutover.done {mode, counts}` 한 줄을 남긴다(워크플로가 이 줄을 폴링).
**APP_ENV·모듈 지연 로드** (restore-rehearsal-cli.ts 헤더 주석): `db/client.ts`가 top-level await로 커넥터를 만들므로 인자·APP_ENV 검사 통과 뒤에만 DB·도메인 모듈을 동적 import. 원본 환경은 인자가 아니라 컨테이너 `APP_ENV`로 정한다.
**apply 가드(추가):** 백업 최신성 — `lib/gcp/cloud-sql-admin.ts`의 「마지막 백업」 조회 재사용(RESEARCH §4.6, 추천).

---

### 삭제 순서·건수 집계 (domain/service 또는 CLI 내부, batch 트랜잭션)

**Analog:** `scripts/demo-data.ts:452-564` `purgeDemoData`. 선별 방식(이름 접두어·견본 이메일)은 버리고 **FK 순서 + `record()` 집계 + 한 트랜잭션**만 복제.

**집계 패턴** (demo-data.ts:~455-470):
```typescript
const counts: Record<string, number> = {};
const record = (key: string, result: { rowCount: number | null }) => {
  counts[key] = (counts[key] ?? 0) + (result.rowCount ?? 0);
};
await db.transaction(async (tx: Tx) => { ... });
```
**FK 순서 핵심 발췌** (demo-data.ts:507-549): 결재(`approvalSteps → approvalRoutes → approvalInstances`) → `evidenceRecordLinks`(owner kind별) → `expensePayments → expenseEvidenceReviews → files/uploadIntents → expenses → corpCardUsages → purchaseRequests → revenueIssueRequests → revenueEntries → reserveEntries → settlementApprovals` → `quoteLines`(자기참조 `copiedFromLineId` 먼저 null) `→ quoteRevisions → projectMembers → projects`.
**빠진 표 추가 필요(RESEARCH §4.3):** `project_documents`, `project_budget_entries`, `leave_requests`, `expense_date_change_requests`. **제외:** `action_log`(DELETE 트리거 거부, 0046), `restore_rehearsals`, `evidence_*`, `leave_adjustments`, 마스터·설정 표.
**차이점:** 견본 전용은 프로젝트 id 목록으로 `inArray` 필터. 전환은 「업무 표 전체 삭제」라 where 없이 표 단위 `tx.delete(table)`; 건수는 dry-run에서 `count(*)`로.
**같은 트랜잭션 끝에:** (1) 카운터 초기화 (2) 전환 마커 쓰기 (3) 행동 로그 1줄 — 삭제 먼저, 카운터 나중(`expenses.number` unique).
**GCS 객체:** `files.object_key`를 삭제 전에 읽어 두고 커밋 뒤 객체 삭제(RESEARCH §4.3 / Open Q7 — 사용자 결정 대기).

---

### 카운터 초기화 (`repositories/document-counters.ts` 재사용)

**Analog:** `repositories/document-counters.ts:65-100`

**행 잠금 규약** (document-counters.ts:~72-88):
```typescript
await tx.insert(documentCounters).values({ counterKey, period, value: 0 })
  .onConflictDoNothing({ target: [documentCounters.counterKey, documentCounters.period] });
const [row] = await tx.select({ value: documentCounters.value }).from(documentCounters)
  .where(and(eq(documentCounters.counterKey, counterKey), eq(documentCounters.period, period))).for("update");
```
**잠금판:** `ALL_PERIODS = "*"`(:111)을 먼저 `lockDocumentCounter`로 배타 잠금해 동시 채번 직렬화. 초기화는 `counter_key in ('project','expense','purchase_request','expense_team','purchase_request_team','leave')` 행 삭제(또는 value=0), **`cert` 제외**. 범위는 Open Q3(사용자 확인) 따름.

---

### 전환 마커 `cutover.at` (`domain/settings/keys.ts` 수정)

**Analog:** 같은 파일 `TAX_ROUNDING_VAT_UNIT` (keys.ts:~171-181)
```typescript
export const TAX_ROUNDING_VAT_UNIT: SettingDef<number> = {
  key: "tax.rounding.vat_unit",
  kind: "simple",
  schema: z.coerce.number().int().refine((v) => v === 1 || v === 10, { message: "1 또는 10 · 다시 입력" }),
  label: "부가세 절사 단위(원)", hint: "...", namespace: "절사", default: 1,
};
```
새 키는 문자열(`z.string()`, 기본 `""` = 전환 전) 형태로 `SETTING_DEFS`(keys.ts:482)에 등록. 읽기 경로는 `getSettingValue`(`domain/document-numbering/index.ts:114-131` 사용 예). **주의:** 일반 설정 화면에 노출되는지(편집 가능) 확인 필요 — 화면 편집을 막아야 하면 별도 처리(가정/계획에서 확인).

---

### `repositories/*` source 쓰기 지점 (수정, 돈 경로 포함 → `/cso`)

**Analog:** 현재 4곳 `source: input.source ?? "demo"` — `projects.ts:447`, `quote-revisions.ts:26`, `quote-lines.ts:173`, `revenue-entries.ts:136`. 기본값 의존 5곳(insert에 source 대입 없음): `revenue-issue-requests.ts:39`, `reserve-entries.ts:113`, `corp-card-usages.ts:21`, `expense-payments.ts:18`, `purchase-requests.ts:28`.
**변경 모양(RESEARCH §4.5 B):** `source: input.source ?? await readSourceMarker(tx)` (마커 비어 있으면 `'demo'`, 있으면 `'live'`). 9곳 전부 명시. 5곳은 먼저 `values` 줄을 읽어 확인(RESEARCH 미확인).

---

### `domain/ops/restore-check-tables.ts` (수정)

**Analog:** 같은 파일 (restore-check-tables.ts:1-19) — 항목만 더한다:
```typescript
  { table: "expenses", requireRows: false },
  { table: "settlement_approvals", requireRows: false },
  // 추가(CEO-3): projects·quote_lines·revenue_entries 등을 requireRows: false로
```
전환 시점 업무 행 0이므로 `requireRows: false` 권고(RESEARCH §3).

---

### `scripts/deploy.sh` `deploy_jobs` · `infra/names.sh` · `scripts/build-cli.mjs` (위험 경로 PR)

**Analog:** deploy.sh:453-460 `restore` Job
```bash
  run gcloud run jobs deploy "$(job_name "$ENV" restore)" \
    "${job_common[@]}" \
    --command=node,dist/cli/restore-rehearsal-cli.mjs \
    --set-env-vars="$common_env" \
    --set-secrets="BETTER_AUTH_SECRET=${better_auth_secret}:latest"
```
`cutover` Job도 `--command=node,dist/cli/cutover-cli.mjs`(execute `--args`가 인자를 대체하므로 account/restore처럼 스크립트를 `--command`에 둠). `names.sh:35` 주석 목록에 `cutover` 추가. `build-cli.mjs`는 `entryPoints`(:6-14)와 `outputs`(:16-24) **두 배열 모두**에 추가하고 상단 주석의 「Job 6개」 문구도 맞춘다. `cli-bundle.test.ts`에 번들 포함 단언 추가(기존 `expect(bundledOutputs()).toContain("dist/cli/purge-certs.mjs")` 모양).

---

### `docs/CUTOVER.md` (docs) + `docs/OPERATIONS.md` 포인터

**Analog:** `docs/CERT-PURGE.md` — 헤더 줄 상한 선언 + 실제 ID 미기재 + 명령은 `ENV`·`GCP_PROJECT_ID` 변수 사용 + 번호 절(무엇을 지우나 / 실행 순서 / 미리 보기 → 로그의 `...done`에서 개수 확인):
```markdown
# CERT-PURGE — 확인증 파기 런북 (CERT-02)
> 150줄 상한(테스트로 고정: `test/unit/docs-limits.test.ts`). 실제 프로젝트 ID·번호는 적지 않는다(D-03).
## 1. 무엇을 지우고 무엇을 남기나
## 2. 실행 주기와 순서   (1. 미리 보기 → 2. Job 로그의 `purge_certs.done`에서 개수 확인 ...)
```
**제약:** `docs/OPERATIONS.md`는 정확히 300줄(상한). CUTOVER 링크 한 줄을 넣으려면 같은 문서에서 한 줄 줄여야 한다. 체크리스트 순서는 RESEARCH §2 (사전 ①~⑦ / 전환 전날~당일 ⑧~⑬ / 직후 ⑭~⑰).

---

### 테스트 파일

**`test/unit/docs-limits.test.ts` (수정)** — 기존 모양 복제 (docs-limits.test.ts:7-30):
```typescript
function lineCount(content: string): number { const lines = content.split("\n"); if (lines[lines.length - 1] === "") lines.pop(); return lines.length; }
describe("docs/CUTOVER.md", () => {
  const content = readDoc("CUTOVER.md");
  it("N줄 이하다", () => { expect(lineCount(content)).toBeLessThanOrEqual(N); });
});
```
**`test/unit/deploy/cutover-workflow.test.ts` (신규)** — `restore-rehearsal-workflow.test.ts:1-45` 헬퍼(`read`, `steps`, `stepWith`, `topLevelGroup`) 복제: 트리거는 `workflow_dispatch` 하나, `permissions` 두 줄, input-guard 단계가 main·production 확인을 검사, `concurrency.group`이 `deploy`, 입력이 쉘에 직접 보간되지 않고 `env:`로만 전달됨을 텍스트로 단언. YAML 파서 없이 문자열 단언.
**`test/integration/cutover.test.ts` (신규)** — `demo-data.test.ts:1-40` 모양: `db`·`schema` import, 행 수 `count(table)`(`sql.raw(SELECT count(*)::text ...)`), 도메인 함수(`createProject`·`createExpenseFromLines`·`createVendor` 등)로 픽스처 구성, `afterEach` 정리. 검증: dry-run은 변경 없음, apply 후 업무 표 0행·마스터 유지·카운터 초기화·마커 기록·이후 입력 `source`가 `'live'`.
**표 분류 가드 테스트 (신규)** — 「새 표가 분류에서 빠지면 실패」: 코드의 삭제/유지/불변 분류 목록 대비 DB의 전체 표를 비교. 직접 선례 없음(RESEARCH: `source`+`information_schema` 가드 부재; 반대 단언은 `test/integration/evidence-schema.test.ts:168-175`). 유사 스키마 단언 모양은 `test/integration/schema/phase7-s2-constraints.test.ts`를 참고.

## Shared Patterns

### 운영 DB 보호 (두 단계 + 확인 입력)
**Source:** `purge-certs.ts`(dry-run 기본) + `restore-rehearsal.yml:47-62`(main·production 확인). **Apply to:** cutover.yml, cutover-cli.ts. main 아니면 인증 전에 실패, production은 `plant8-prod-db` 확인 입력.

### CLI 인자·종료코드
**Source:** `purge-certs.ts:11-48`. **Apply to:** cutover-cli.ts. 등호 결합 거부, `UsageError`, 로그 한 줄(`*.done {mode, ...}`)로 결과 전달.

### 한 트랜잭션 + 행 잠금
**Source:** `repositories/document-counters.ts:65-100`, `scripts/demo-data.ts` `db.transaction`. **Apply to:** 삭제·카운터·마커·로그.

### 테스트 방식(워크플로·스크립트 텍스트 단언)
**Source:** `test/unit/deploy/restore-rehearsal-workflow.test.ts`. **Apply to:** cutover.yml, deploy.sh 줄, build-cli 번들.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| 표 분류 가드 테스트 | test | transform | 「스키마 전 표가 분류됨」 선례 없음. `evidence-schema.test.ts:168-175`의 컬럼 단언 방식만 참고 |
| 전환 마커를 읽는 `readSourceMarker` | repository helper | request-response | 쓰기 지점마다 설정을 읽는 선례 없음. `getSettingValue`(`domain/document-numbering/index.ts:114-131`) 읽기 경로를 참고 |
| GCS 객체 삭제(커밋 뒤) | utility | file-I/O | 증빙 객체 일괄 삭제 코드 없음(`purge-certs`는 서명 객체 정리 — 재사용 가능성은 계획에서 확인) |

## Metadata

**Analog search scope:** `.github/workflows/`, `scripts/`, `repositories/`, `domain/settings`, `domain/ops`, `infra/`, `docs/`, `test/unit`, `test/integration`
**Files scanned:** 약 20 (analog 16개는 `git ls-files`로 추적 확인)
**Pattern extraction date:** 2026-11-04
**미확인:** 기본값 의존 5개 repository의 `values` 줄 직접 확인, `cutover.at`이 설정 화면에서 편집되는지 여부
