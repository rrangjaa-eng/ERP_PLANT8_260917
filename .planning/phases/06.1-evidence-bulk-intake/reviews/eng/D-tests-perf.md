# 06.1 계획 독립 엔지니어링 검토 — D: 테스트 · 성능 · 순서 · 실행 가능성

검토자: plan-eng-review 꼴 독립 검토(읽기 전용) · 대상 브랜치 `claude/phase-06.1-evidence-bulk-discuss-a6nbbs` · 2026-10-04
범위: 06.1-01~13-PLAN.md · VALIDATION.md · UI-SPEC(필요 범위) · playwright.config.ts · visual*.spec.ts · visual-baseline.yml · scripts/codex-design-review* · next.config.ts · Next 16 문서
CONTEXT의 잠긴 결정(D-61xx)은 다투지 않는다.

---

## 0. 한 줄 판정

설계 · 동시성 · 행 범위 테스트는 매우 촘촘하다(경합 테스트가 `waitForLockWaiter`로 결정적, tx 규약 grep, 실제 계급으로 낮춘 범위 매트릭스). 같은 웨이브 플랜끼리 **파일 겹침은 없다**(아래 §2 표로 확인). 막히는 곳은 넷 — ① 시각 기준 사진 갱신 절차가 이 저장소에서 동작하지 않는다 ② 같은 웨이브 E2E가 공유 DB · 포트 3100을 잠금 없이 쓴다 ③ 1MB 거절 문구가 Next 본문 한도 때문에 닿지 않는다 ④ D-6110(05 파일 규칙 변경)의 주인이 없어 W4에서야 멈춘다.

---

## 1. 발견 사항

### P1

**P1-1 시각 기준 사진을 로컬에서 갱신하라는 절차가 동작하지 않는다 (확신 9)**
- 계획: `06.1-03-PLAN.md:223` 「`visual.spec.ts`의 `dev-components` 기준 사진은 쇼케이스가 바뀌었으니 `CI=true pnpm exec playwright test test/e2e/visual.spec.ts --update-snapshots`로 한 번 갱신하고(05-09 N2 선례), 갱신 뒤 플래그 없이 녹색인지 본다」 · 같은 꼴 `06.1-13-PLAN.md:157`, 수락 기준 `06.1-13-PLAN.md:164` 「`git diff --name-only origin/main -- test/e2e/visual.spec.ts-snapshots test/e2e/visual-390.spec.ts-snapshots` 출력이 `dev-components-1280-visual-linux.png` 한 줄」
- 근거: `test/e2e/visual.spec.ts:6-8` `test.skip(process.env.GITHUB_ACTIONS !== "true" && process.env.VISUAL_LOCAL !== "1", …)` — 로컬은 `CI=true`여도 건너뛴다. 갱신 명령은 아무것도 쓰지 않고, verify(`06.1-03-PLAN.md:226`)는 skipped로 「녹색」이 된다. 기준 사진은 `.github/workflows/visual-baseline.yml:1-10`(workflow_dispatch · Linux CI Chromium에서만 · 봇 커밋은 CI를 다시 깨우지 않음)으로만 만든다. 또 `test/e2e/visual-390.spec.ts-snapshots/dev-components-390-visual-linux.png`와 `dev-components-panel-*`도 같은 쇼케이스를 찍으므로 13의 「한 줄」 수락 기준은 틀릴 수 있다(`visual-fixtures.ts:23` `fullPage: false` — 첫 화면에 바뀐 절이 없으면 1280조차 안 바뀐다).
- 결과: 실행자가 「완료」를 말한 뒤 ready PR CI의 visual 잡이 빨갛게 된다(무인 머지 정지).
- 고칠 글(03 · 13 ⑤ 교체): 「기준 사진은 로컬에서 만들지 않는다. 쇼케이스 커밋을 푸시한 뒤 `gh workflow run visual-baseline.yml --ref <브랜치>` → 봇 커밋을 받은 뒤 CI를 직접 다시 돌린다(봇 푸시는 CI를 깨우지 않는다). 바뀐 사진 목록은 그 워크플로 결과로 SUMMARY에 적는다.」 13 수락 기준은 「`dev-components*` 사진 외 변경 0」으로 넓힌다. 03의 files_modified에 390 · panel 사진을 「바뀔 수 있음」으로 더한다.

**P1-2 같은 웨이브 E2E · Codex 캡처가 공유 `erp_test` · 포트 3100을 잠금 없이 쓴다 (확신 7)**
- 계획: 통합만 잠금 — `06.1-VALIDATION.md:30` 「`flock /tmp/plant8-erp-test.lock sh -c 'pnpm db:dev && pnpm db:reset:test && …'`」. E2E는 잠금 없음 — 예 `06.1-05-PLAN.md:206` `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/evidence-intake.spec.ts`, 같은 꼴 03:155 · 06:196 · 07:187 · 08:192 · 09:192 · 10:149 · 13:157.
- 근거: `playwright.config.ts` webServer `PORT: "3100"` · `reuseExistingServer: false`(둘째 실행은 포트 충돌로 실패) · DB는 한 `erp_test`. `scripts/codex-design-review.sh:10` 「캡처는 E2E와 같은 globalSetup으로 erp_test를 초기화한다 — E2E와 동시에 돌리지 않는다」. `.planning/config.json` `"parallelization": true`, execute-phase 워크플로 `use_worktrees` 기본 true(`.claude/gsd-core/workflows/execute-phase.md:107`).
- 겹치는 웨이브: W1(01 통합이 flock 안에서 DB를 쓰는 동안 03의 `pnpm db:reset:test`가 잠금 밖에서 DB를 지움) · W4(06 + 10 둘 다 E2E · 감사 · Codex) · W5(07 + 08 둘 다 E2E · 감사 · Codex).
- 고칠 글(실행자 규율 한 줄, 01의 「06.1-01 실행자 규율」에 추가): 「`pnpm db:reset:test` · `playwright test` · `scripts/codex-design-review.sh`는 전부 `flock /tmp/plant8-erp-test.lock sh -c '…'` 안에서만 돈다(통합과 같은 잠금).」 그리고 각 verify의 E2E 줄을 그 꼴로 바꾼다. 대안: W4 · W5를 「화면 플랜은 웨이브 안 직렬」로 표시.

**P1-3 「{n.n}MB · 1MB 초과」 거절이 1MiB를 넘는 파일에는 닿지 않는다 (확신 8)**
- 계획: `06.1-04-PLAN.md:43` 「파일 크기는 서버가 `File.size`로 직접 잰다 … 1,000,000바이트를 넘으면 바이트를 읽기 전에 `{n.n}MB · 1MB 초과 · 기간을 나눠 다시 내려받기`」 · UI-SPEC `06.1-UI-SPEC.md:219` 예시 `{1.4MB} · 1MB 초과`.
- 근거: `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md:61` 「By default, the maximum size of the request body sent to a Server Action is 1MB」 · `next.config.ts`에 `serverActions` 없음. 1,048,576바이트(+ multipart 머리)를 넘는 본문은 액션 코드가 돌기 전에 Next가 거절한다 → 서버 크기 검사는 1,000,000~약 1,048,000바이트 사이에서만 닿고, UI-SPEC 예시(1.4MB)는 일반 실패 행(`올리지 못함`)이 된다. 단위 테스트(`06.1-02-PLAN.md:249` 1,000,001바이트)는 `parseWorkbook`만 재서 이 길을 못 잡는다.
- 고칠 글: 06.1-05 Task 1 ⑤ intake-zone에 「`file.size > EVIDENCE_IMPORT_MAX_BYTES`면 액션을 부르지 않고 같은 거절 행(서버 문구 함수와 같은 글자 — 상수 · 문구 함수를 `domain/evidence-import`에서 내보내 클라이언트가 쓰게 하거나 서버 문구를 그대로 복제하지 말고 순수 함수 하나로)」을 더하고, behavior에 「E2E: 1.4MB 버퍼 `setInputFiles` → 결과 행 `1.4MB · 1MB 초과 · …` · 네트워크 요청 0」. 04의 서버 검사는 방어선으로 남긴다.

**P1-4 D-6110(05 파일 규칙 변경)의 주인 플랜이 없고, 확인이 W4에야 있다 (확신 6)**
- 계획: `06.1-CONTEXT.md:54` 「05-09의 파일 규칙은 05 실행 스레드가 고친다. 06.1은 … 실행 첫 단계에서 확인한다」 · `06.1-06-PLAN.md:137` 「작성자에게 결재 중 추가 · 삭제가 열려 있으면 **멈춘다**」(07:127 · 08:134도 같은 멈춤).
- 근거: `git log --all -S "D-6110" -- .planning/phases/05-expense-approval-leave` 결과 0건 — 05 계획(다른 브랜치에서 Round 6 수정 중)이 이 결정을 아직 받지 않았다. 05가 지금 규칙대로 머지되면 W1~W3(01 · 02 · 03 · 04 · 12 · 05 · 11)를 다 지은 뒤 W4에서 06 · 07 · 08 · 09 · 13이 줄줄이 멈춘다.
- 고칠 글: UA-6106 확인을 06.1-01 ⓪ 표로 올린다(「05 파일 규칙 판정 함수의 결재 중 갈래가 D-6110과 다르면 06.1 착수하지 않음」). 계획 레인에서 05 계획 스레드에 D-6110 반영 요청을 남기는 것을 06.1 execution_gate.start_after에 한 줄로 적는다.

### P2

**P2-1 고친 05 · 06 코드의 기존 테스트가 verify에 없다 (확신 8)** — CLAUDE.md §5 「바뀐 파일과 관련된 단위·통합 테스트 + 건드린 화면의 E2E」
- `06.1-12-PLAN.md:159` 「05 제출 게이트(⓪ P-GATE5)의 파일 수 호출을 `hasEvidence`로」인데 verify `12:166` · `12:227`은 06 테스트(expense-payments · evidence-reviews · pre-settle-check · card-usage-evidence · payment-batch)만 돈다 — 05 제출 게이트 · `repositories/files.ts`(조건 조각을 꺼냄) 기존 테스트 없음.
- 09: `domain/corp-card-usages/index.ts` `createCardUsage` · `app/(app)/cards/actions.ts` · `card-usage-form.tsx`를 고치는데(`09:229`) 06 카드 사용 통합 · E2E가 verify에 없다.
- 10: `repositories/payment-targets.ts` · `/expenses` 필터 — 06-20 필터 기존 테스트 없음(verify `10:145`).
- 08: `app/(app)/cards/purchases/*` — 06 구매 요청 E2E 없음. 06: `evidence-review-section.tsx`(06-06 화면) — 06-06 E2E 없음. 04: `insertVendor` · `setVendorArchived` 시그니처 — 거래처 · 보관 통합 없음(diff 검사만 `04:267`).
- 고칠 글: 각 플랜 ⓪에 「고칠 05 · 06 파일을 import하는 기존 테스트 파일 목록(`grep -rl "<모듈>" test`)을 SUMMARY에 적고 그 파일을 같은 verify 줄에 더한다」 한 줄.

**P2-2 공개 저장의 서버 쪽 잠긴 줄 거부가 테스트에 없다 (확신 8)**
- `06.1-05-PLAN.md:191` 「줄마다 검사(version · 붙음 · 취소 · 확인 필요 · 카드 미등록 · 음수 PA-NEG) → 하나라도 실패면 … 롤백」인데 behavior `05:179`는 「version 낡은 줄 하나」 · 권한 없음만 단언한다. 화면 잠김(`05:235`)은 UI뿐 — 조작한 요청으로 확인 필요 · 카드 미등록 · 음수 줄을 공개하는 길이 회귀에 안 잡힌다.
- 고칠 글: `05:179` behavior에 「확인 필요 · 카드 미등록 · 붙음 · 취소 · 음수 줄을 각각 섞은 요청 → 저장 0줄 + 그 줄 오류 칸」 다섯 `it`.

**P2-3 붙이기의 잠금 뒤 상태 재검사 거부가 테스트에 없다 (확신 7)**
- `06.1-06-PLAN.md:183` 「상태 재검사(취소 · 확인 필요 · 카드 미등록)」 — behavior `06:169-175`에 그 거부 케이스가 없다(화면 `aria-disabled`만 감사). 08 작성자 길(`08:179`)도 「공개 범위 칸 · version 같음」 외 상태 갈래 단언 없음.
- 고칠 글: 06 Task 1 behavior에 「확인 필요 · 카드 미등록 · 취소 증빙 id로 `attachEvidence` → 거부 · 붙임 0」, 08 Task 2에 「작성자 풀 밖 상태(확인 필요 등) id → 없음」.

**P2-4 대사(09)의 동시 등록 · 잠금 뒤 재확인이 테스트에 없다 (확신 7)**
- `06.1-09-PLAN.md:177` 「`findReconcileCandidates`(… 증빙 있음 칸)」 → `09:179` 「짝의 카드 사용을 `lockCardUsagesForUpdate` → … `insertLink`」. 후보의 「증빙 없음」을 잠그기 **전에** 읽으므로, 서로 다른 두 카드 파일이 같은 카드 사용 U를 2단계 짝으로 고르면 둘 다 U에 붙을 수 있다(붙임 부분 유니크는 증빙 쪽 열쇠라 주인 쪽 중복을 막지 않는다). `applyFileWins`의 version 조건은 값이 같아 덮지 않는 갈래(승인번호만)에서는 겨냥하지 못한다.
- 고칠 글: ③에 「카드 사용 잠금 뒤 그 행의 살아 있는 붙임 · version을 다시 읽어 바뀌었으면 짝 없음으로」, behavior에 「서로 다른 카드 파일 둘을 동시에 등록(같은 카드 사용 하나가 둘의 2단계 후보) → 붙임 1 · 다른 쪽 짝 없음 1」(lock-race 꼴) · 「`applyFileWins` 0행 → 그 줄 짝 없음」.

**P2-5 Codex 캡처가 동적 문서 경로 · 모달을 찍을 수 없다 (확신 8)**
- `06.1-06-PLAN.md:270` 「문서 화면 경로(`/expenses/{id}`)는 스크립트가 고정 경로만 받으면 감사 스펙 픽스처 문서의 경로를 함께 넘긴다(스크립트 머리 주석대로)」 · 같은 꼴 `08:262`.
- 근거: `scripts/codex-design-review/lib.ts:151` 자리 표시는 `{adminId}` 하나뿐 · `capture.spec.ts`는 globalSetup으로 `erp_test`를 지운 뒤 새 시스템 관리자로 로그인하고 `response.ok()`를 단언 — 감사 스펙이 만든 픽스처 문서 id는 지워져 404, 캡처 실패. 빈 DB라 `/expenses/evidence`도 빈 상태만 찍힌다(S3 · S4 · S5 · S7 상태 없음).
- 고칠 글: 06 · 08 ③을 「고정 경로만 넘긴다(`/expenses/evidence` · `/cards/purchases`). 문서 화면 · 모달 상태는 Codex 범위 밖 — 보고서에 `Codex 디자인 검토 부분 건너뜀: 동적 경로 · 모달 미지원` 한 줄, 판정은 DOM 감사」로. 스크립트 확장은 이 페이즈 밖.

**P2-6 후보 · 풀 순위를 메모리에서 매긴다 — 잘림 또는 전 행 읽기 (확신 7)**
- `06.1-06-PLAN.md:183` 「`listAttachCandidates` — … 후보 조회 → `rankCandidates` → 상위 20」: 경영관리는 모든 지출결의(삭제 아님) · 구매 요청(취소 아님)을 읽을 수 있어 모달을 열 때마다 전 행을 끌어와 점수를 매긴다(해가 갈수록 커짐).
- `06.1-08-PLAN.md:177` `listPoolForScope(viewer, scope, { q, limit })` → `rankRecordsForDocument`: SQL `limit`이 먼저면 점수 1위가 잘리고, `limit` 없이면 경영관리 풀(안 붙은 기록 전부 — 짝 없는 카드 줄 누적)을 매번 전부 읽는다.
- 고칠 글: 점수(종류 4 · 사업자번호 2 · 금액 1)를 SQL `CASE` 합으로 `ORDER BY 점수 DESC, abs(날짜 차) LIMIT 20`, 순수 `scoreCandidate`는 단위 테스트 기준 · 결과 대조용으로 남긴다. 또는 사전 거르기(같은 사업자번호 OR 같은 합계 OR ±60일) 후 메모리 순위. 둘 중 하나를 PA-CAND에 명시.

**P2-7 비용 기준 호출부가 목록이면 N+1 (확신 6)**
- `06.1-12-PLAN.md:193` 「이 함수를 부르는 06 자리(손익 · 문서 화면)가 입력을 만들 때 `evidenceSummaryForOwner`를 거치게 한다」 — 문서 하나 함수를 목록(손익 · 지급 대상)이 행마다 부르면 N+1. Phase 9 effectiveCost는 「SQL 식 하나」(ROADMAP)라 같은 값을 SQL로도 내야 한다.
- 고칠 글: `repositories/evidence-record-links.ts`에 `sumLiveLinkedSupplyByOwners(viewer, ownerKind, ownerIds, tx?)`(GROUP BY 한 번)를 두고 목록 자리는 그것을 쓴다고 Task 2에 한 줄. effectiveCost가 쓸 SQL 조각(붙은 기록 공급가 합 서브쿼리)을 `evidence-presence.ts` 옆에 둔다고 적는다.

**P2-8 06.1-02가 `domain/money`를 고치는데 post_build가 `/review`뿐 (확신 8)**
- `06.1-02-PLAN.md:10` `- domain/money/index.ts` · `06.1-02-PLAN.md:34` `post_build: "/review"`. CLAUDE.md §4 「돈·결재(`domain/`의 `money`…): `/review` + 독립 검토 `/cso`」(훅이 강제).
- 고칠 글: `post_build: "/review + /cso(domain/money — grossFromSignedTotal)"`.

**P2-9 실행 게이트까지 거리가 멀고 05 이름이 아직 움직인다 (확신 7)**
- 모든 플랜 ⓪이 05 계획 이름(`countActiveByOwner` · `attachmentRights` · `canSeeExpense` · `lockExpenseRow` · `bumpInstanceVersion` · `drafterId`)에 기댄다. 그런데 origin/main의 `.planning/phases/05-expense-approval-leave/`에는 CONTEXT · DISCUSSION-LOG뿐이고 05 계획은 다른 브랜치에서 Round 6 수정 중(`git log --all` 5945316c), 06은 계획만 main에 있고 SUMMARY 0. 「가칭 → 실제」 + 멈춤 규칙은 안전하지만, 이름이 대거 바뀌면 플랜마다 멈춘다.
- 고칠 글: 06.1-01 execution_gate.start_after에 「05 · 06 머지 직후 06.1 계획 13개를 plan-checker로 한 번 다시 돌려(이름 · 파일 경로 대조) 어긋남을 계획 문서에 반영한 뒤 W1 착수」.

**P2-10 「묶음 PR」 경계가 정의되지 않았다 (확신 6)**
- `06.1-04-PLAN.md:125` 「이 플랜이 담긴 묶음 PR은 사용자가 06.1-01 PR을 GitHub에서 머지하기 전에는 머지하지 않는다」(05 · 06 · 07 · 08 · 09 · 10 · 12 같은 글). 어느 플랜끼리 한 PR인지, post_build(`/review` · `/cso` · `/design-review` · `/qa`)가 몇 번 도는지 어디에도 없다. 12개를 한 PR로 묶으면 `/review` diff가 100+파일, 웨이브마다 끊으면 게이트가 많아진다. 또 01 머지 전에 열린 묶음 PR은 diff에 위험 경로가 섞여 훅이 세션 머지를 막는다(01 머지 뒤 `git merge origin/main`으로 diff가 빠져야 풀림).
- 고칠 글: 페이즈 머리(또는 01 objective)에 PR 표 하나 — 예 「PR-A 01(사용자 머지) · PR-B 02 · 04 · 11 · 12(서버, /review + /cso) · PR-C 03 · 05 · 10(화면 1) · PR-D 06 · 07 · 08(붙이기) · PR-E 09 · 13」 + 「01 머지 뒤 각 PR은 origin/main을 머지 커밋으로 받아 diff에서 위험 경로가 빠졌는지 확인」.

### P3

- **P3-1 10의 depends_on에 11이 없다 (확신 8)** — `06.1-10-PLAN.md:6` `depends_on: ["06.1-05", "06.1-12"]`인데 `10:110` 「06.1-11이 W3에서 먼저 들어와 실행 때 넷 — 개수를 박지 않는다」. 웨이브 순서로는 맞지만 재계획으로 웨이브가 바뀌면 깨진다 → `depends_on`에 `"06.1-11"` 추가.
- **P3-2 VALIDATION.md가 플랜과 어긋난다 (확신 8)** — `06.1-VALIDATION.md:56` 「`test/unit/domain/evidence-amounts.test.ts` · `test/unit/domain/evidence-reconcile.test.ts`」 vs 플랜의 `test/unit/domain/evidence-records/reconcile.test.ts`(09) · 금액은 `money.test.ts` · `formats.test.ts`(02) · `amount.test.ts`(07). Per-Task 지도 빈칸 · `nyquist_compliant: false`. → 실행 전 `/gsd-validate-phase 06.1`로 지도를 채우고 이름을 맞춘다.
- **P3-3 인덱스가 범위 · 필터 where와 다르다 (확신 6)** — `06.1-01-PLAN.md:206` 인덱스 `(visibility)` · `(batch_id)` · `(corp_card_id, issued_on)`. published 범위(`05:189`)는 `visible_team_id` · `visible_org_unit_id` 등치, 목록은 서식 · `issued_on` 정렬, 필터 `needs_check` · `canceled` · `corp_card_id IS NULL`. `(visibility)` 단독은 선택도가 낮다. 30명 · 연 수만 행이면 체감 문제는 없으나, `(visible_team_id) WHERE visibility='team'` · `(visible_org_unit_id) WHERE visibility='division'` 부분 인덱스 둘과 `(issued_on)`을 01에서 같이 만드는 편이 싸다(마이그레이션은 01 한 번뿐).
- **P3-4 거래처 숫자 조회가 사업자번호마다 전 표 훑기 (확신 6)** — `06.1-04-PLAN.md:255` 「`findVendorsByBusinessDigits(viewer, digits, tx)`(`regexp_replace(business_no, '\D', '', 'g') = 숫자`」를 오름차순 루프에서 번호마다 부름 → advisory lock을 쥔 채 seq scan × 번호 수. 잠금은 번호마다 하되 조회는 `= ANY($digits)` 한 번으로(잠금 뒤), 또는 식 인덱스 — 스키마 변경 금지라면 앞쪽.
- **P3-5 이력 조회가 행동 로그의 entity 칸을 인덱스 없이 읽는다 (확신 6)** — `06.1-07-PLAN.md:172` `listRecordHistory` 「행동 로그에서 이 기록의 `evidence_amount_change` 줄(entity · entity id 조건)」. `db/schema/action-log.ts:32-35` 인덱스는 actor · (action_type, occurred_at) · document_id · pruned — entity_id 없음. 지금 규모면 수용, SUMMARY에 「수용 · 규모」 한 줄.
- **P3-6 대사 트랜잭션 안 줄마다 문장 서넛 (확신 5)** — `09:179` 짝마다 `applyFileWins` → `insertLink` → `recordAction`. 3000줄 카드 파일이면 수천 왕복을 잠금 쥔 채 한다. 붙임 INSERT는 한 문장 다중 VALUES, 덮기는 짝 있을 때만이라 대개 적다 — 「insertLink 다건 한 문장」만 적어 두면 충분.
- **P3-7 목록 제안값 계산 N+1 위험 (확신 5)** — `06.1-05-PLAN.md:191` 「제안값 함수…: 카드 줄 = `corp_cards.team_id`, 없으면 소지자의 오늘(`seoulToday`) 발령 팀」 — 행마다 발령 조회로 짜이기 쉽다. 「쪽의 카드 id 집합 · 소지자 집합으로 한 번씩 읽는다」 한 줄.
- **P3-8 여러 파일 한 번에 놓기 E2E 없음 (확신 7)** — UI-SPEC 「여러 파일 → 파일 하나당 액션 하나 · 파일마다 결과 행」인데 `05:181`은 파일 하나. 「정상 하나 + 거절 하나를 함께 놓기 → 결과 행 둘(성공 · 거절) · 정상 파일 기록만 생김」 E2E 한 줄.
- **P3-9 떼기 · 결재 올리기 경합 테스트 없음 (확신 6)** — `06.1-06-PLAN.md:251` 「결재 중 거부가 트랜잭션 **안** 잠금 뒤에도 있다 — … 결재 상태 판정 호출이 1건 이상」은 grep뿐. 07 금액 고침(`07:212`)과 같은 결정적 경합 케이스를 detach에도.
- **P3-10 카드 사용에 붙은 증빙의 금액 고침 갈래 미검증 (확신 6)** — `06.1-07-PLAN.md:220` 「카드 사용에 붙은 기록은 문서 행을 잠근 뒤 기록만 고친다」 — behavior 없음. 「카드 사용 붙은 기록 고침 → 카드 사용 칸 불변 · 증빙만 바뀜」 한 줄.
- **P3-11 `applyFileWins` 0행 갈래 미검증** — P2-4에 포함.
- **P3-12 홈택스 `품목` 시트와 행 상한 (확신 4)** — `02:171` `readSheets`의 `sheetRows` 상한이 시트마다 걸리면 `품목` 시트(품목 수 ≥ 줄 수)가 먼저 상한을 넘어 「줄 수 초과」로 오판할 수 있다 — 「상한 판정은 서식이 고른 시트에만」 한 줄 + 단위 케이스.

### 긍정 확인(결함 아님)

- **화면 플랜 8개 모두 DOM 감사 · Codex 파일이 있다.** 10도 있다 — `06.1-10-PLAN.md:14` `06.1-10-DOM-AUDIT.md` · `:15` `06.1-10-codex-design.md`, Task 2(`10:161-191`)에 별도 에이전트 · 폭 여섯 · 자격 둘. 03:20-21 · 05:28-29 · 06:29-30 · 07:19-20 · 08:28-29 · 09:30-31 · 13:19-20.
- **위험 경로는 01만 건드린다.** 02~13의 files_modified에 `db/schema/` · `db/migrations/` · `domain/permissions/` · `lib/crypto*` · `.github/workflows/` · `infra/` · `.claude/` 없음(08은 `repositories/evidence-records.ts` export 한 단어). 나머지는 무인 머지 가능 — 단 P2-10의 「01 머지 뒤 origin/main 받기」 조건.
- **risk 태그 ↔ 실행자 모델 일치.** money/approvals/db-lock/permissions/migration 태그 = Opus(01 · 02 · 04 · 05 · 06 · 07 · 08 · 09 · 11 · 12), 태그 없음 = Sonnet(03 · 10 · 13). 05는 permissions 태그로 Opus — 행 범위 집행이라 타당.
- **01 사용자 머지와 이후 웨이브.** 개발은 페이즈 브랜치 위에 쌓고 머지만 01 뒤(04:125 등) — 웨이브는 01 main 머지를 기다리지 않는다. 타당.
- **경합 테스트 품질.** 04 동시 N = `pool.options.max + 1` + RED 확인 · 06/07/08 `waitForLockWaiter` · sleep 금지 grep. 좋음.

---

## 2. 같은 파일을 고치는 플랜 — 웨이브 대조

| 파일 | 고치는 플랜(웨이브) | 같은 웨이브 겹침 |
|---|---|---|
| test/integration/leak-scan.test.ts | 04(W2) · 05(W3) · 06(W4) · 08(W5) | 없음 — 07은 import된 모듈에 DTO를 더해 파일 무변경(07:174), 10은 안 고침 |
| test/integration/fixtures/evidence.ts | 04(W2) · 05(W3) · 06(W4) · 08(W5) · 09(W6) | 없음 — 07(07:178) · 10(10:142)은 테스트 파일 안 도우미 |
| app/(app)/expenses/evidence/evidence-table.tsx | 05(W3) · 06(W4) · 07(W5) · 09(W6) · 13(W7) | 없음 — 08은 읽기만(08:124) |
| attach-actions.ts · .registry.ts | 06(W4) · 08(W5) · (09 attach.ts 경유) | 없음 — 07 읽기만(07:117) |
| test/e2e/mobile-320-no-overflow.spec.ts | 05(W3) · 08(W5) | 없음 |
| dev-components-1280 사진 | 03(W1) · 13(W7) | 없음 — 단 갱신 절차가 틀림(P1-1) |
| app/(app)/expenses/page.tsx | 05(W3) · 10(W4) | 없음 |
| repositories/payment-targets.ts | 12(W2) · 10(W4) | 없음 |
| repositories/corp-card-usages.ts | 12(W2) · 09(W6) | 없음 |
| domain/evidence-import/registry.ts · formats.test.ts · build.ts | 02(W1) · 11(W3) | 없음 |
| test/integration/evidence-import.test.ts | 04(W2) · 11(W3) | 없음(W3의 05는 안 고침) |
| domain/evidence-records/index.ts | 05 · 06 · 07 | 없음 — 08은 pool.ts 따로 |
| [id]/page.tsx · evidence-records-section.tsx | 06(W4) · 08(W5) | 없음 |
| docs/design/SYSTEM.md · DECISIONS.md | 03(W1) · 13(W7) | 없음 |

결론: 글자 겹침 0. 같은 웨이브의 실제 충돌은 파일이 아니라 **공유 DB · 포트 · 빌드 자원**(P1-2)이다.

---

## 3. 성능 요약

| 자리 | 계획 | 판정 |
|---|---|---|
| 증빙 목록 | 50건 쪽 + 합계 SQL `sum` 한 번(05:189) | 좋음. 인덱스 보강 권장(P3-3), 제안값 일괄 읽기(P3-7) |
| 증빙 있음 판정 | `evidencePresenceSql` EXISTS + 부분 인덱스 `(owner_kind, owner_id) WHERE detached_at IS NULL`(01:206) | 좋음 |
| 붙일 문서 후보(S4) | 전 행 → 메모리 순위 → 20(06:183) | P2-6 |
| 작성자 풀(S5) | `limit` 뒤 순위 또는 전 행(08:177) | P2-6 |
| 구매 요청 목록 N | 쪽에서 한 번(08:225 PA-POOLN) | 좋음 |
| 비용 기준 | 문서 하나 함수(12:193) | 목록이면 N+1(P2-7) |
| 대사 | 후보 IN 조회 한 번 + 메모리 계획 + 짝마다 쓰기(09:177-179) | 수용, 다건 INSERT 권장(P3-6) |
| 거래처 자동 생성 | 번호마다 잠금 + regexp seq scan(04:255) | P3-4 |
| 파일 파싱 | 1MB · CFB만 · `sheetRows` 상한 · 수식/HTML 끔(02:171) | 좋음. 메모리 문제 없음 |
| 액션 본문 | 파일 하나 = 액션 하나(04:41) | 맞음. 단 1MiB 초과 문구(P1-3) |
| 레이아웃 권한 | `MENUS.map(can)`(app/(app)/layout.tsx:30)에 키 둘 추가 | 무시 가능 |

---

## 4. 추정 · 웨이브

- 합계 추정 약 1,330k 토큰(01 90 · 02 110 · 03 80 · 04 120 · 05 140 · 06 140 · 07 100 · 08 120 · 09 140 · 10 60 · 11 60 · 12 100 · 13 70), 전부 `confidence: low`. 06 · 09는 `stop_trigger`(06:39 · 09:528 범위)가 있어 넘침 대비가 있다. 05(140k)도 Task 2가 필터 · 그룹 · 폭별 열 · 빈 상태 넷 · 진입 링크를 한 태스크에 담아 06 · 09와 같은 무게 — 05에도 같은 stop_trigger를 두는 것을 권한다(P3).
- 웨이브: W1 01·02·03 → W2 04·12 → W3 05·11 → W4 06·10 → W5 07·08 → W6 09 → W7 13. 의존 순서는 옳다(10의 11 의존 표기만 빠짐 P3-1). 임계 경로 01→04→05→06→08→09→13(7단).
- GSD는 오케스트레이터 HEAD가 origin/HEAD와 갈라지면 병렬을 순차로 떨어뜨린다(execute-phase.md:136). 페이즈 브랜치가 main보다 앞서 있는 동안 웨이브 병렬은 실제로는 직렬일 가능성이 크다 — 그 경우 P1-2는 사라지지만 벽시계 시간이 늘어난다. 어느 쪽이든 E2E를 잠금 안에 두는 수정이 안전하다.

---

## 5. 커버리지 지도

```
범례: [★★★ TESTED] 이름 있는 테스트 + 구체 단언 · [★★ PARTIAL] 일부 갈래만 · [GAP] 테스트 없음

엑셀 일괄 등록 (EVID-05 · 06 · 11 · 12)
├─ 브라우저 intake-zone (05)
│   ├─ 파일 하나 업로드 → 결과 행 · 표                [★★★ TESTED] e2e evidence-intake (05:181)
│   ├─ 여러 파일 동시 (정상+거절)                      [GAP] P3-8
│   └─ 1MiB 초과 파일 → 크기 거절 문구                 [GAP] P1-3 (Next 본문 한도에서 먼저 막힘)
├─ 서버 액션 registerEvidenceFileAction (04)
│   ├─ 권한 없음 → 행 0                               [★★★ TESTED] evidence-import (04:164)
│   ├─ File.size 검사 (1,000,000~1MiB 구간)            [★★ PARTIAL] 단위 parseWorkbook만 (02:249)
│   └─ FormData 컴파일                                [★★★ TESTED] pnpm build (04:182)
├─ parseWorkbook (02 · 11)
│   ├─ sniff CFB/xlsx/HTML/모름                        [★★★ TESTED] pipeline (02:157 · 247-248)
│   ├─ 서식 판별 6종 교차표                             [★★★ TESTED] formats describe.each (11:68)
│   ├─ 전부-아니면-전무 (줄 오류 1 → 거절)              [★★★ TESTED] 단위 02:163 + 통합 행 0 (04:163)
│   ├─ 총계 검산 (세금계산서 · 계산서 · 현금영수증)     [★★★ TESTED] 02:242 · 11:67 · 11:17
│   ├─ 행 상한 3000                                   [★★★ TESTED] 02:250  (품목 시트 오판 [GAP] P3-12)
│   ├─ 카드 끝4만 · 16자리/계좌 부재                   [★★★ TESTED] 02:160 · 02:210
│   ├─ 부호 대칭 역산 · 신한 세율 = splitCardTotal      [★★★ TESTED] 02:207-209
│   └─ 실물 견본 (env 있을 때만)                       [★★ PARTIAL] 로컬 전용 — CI 미실행(의도)
├─ 등록 트랜잭션 (04)
│   ├─ 이미 등록 건너뜀 · 같은 파일                     [★★★ TESTED] 04:161-162
│   ├─ 동시 N = pool.max+1 · 같은 파일 동시             [★★★ TESTED] evidence-import-concurrency (04:209)
│   ├─ 세율 날짜별 사전 조회                           [★★★ TESTED] 04:205
│   ├─ 카드 연결 끝4 + 별칭 / 미등록                    [★★★ TESTED] cards 단위 + 통합 (04:204-208)
│   └─ 거래처 생성/되살림/이름 다름/숨김/중복/동시      [★★★ TESTED] evidence-vendor-autocreate (04:244-252 · 11:23)
└─ 대사 (09) — 등록 tx 안
    ├─ 1단계 승인번호 · 2단계 카드+날짜+합계 일대일      [★★★ TESTED] reconcile 단위 (09:165)
    ├─ 파일이 이김 덮기 + always-on 기록                [★★★ TESTED] evidence-reconcile (09:167)
    ├─ 수정 잠김 카드 사용 제외                         [★★★ TESTED] 09:168
    ├─ 두 등록이 같은 카드 사용을 노림 (동시)            [GAP] P2-4
    └─ applyFileWins 0행 → 짝 없음                     [GAP] P2-4

행 범위 · 공개 (EVID-07)
├─ evidenceScopeFor all/published/none · 발령 없음 · 미래 발령   [★★★ TESTED] scope-for 단위 (01:200 · 242-245)
├─ Scope 유니온 불변                                         [★★★ TESTED] expectTypeOf (01:201)
├─ 목록 매트릭스 5기록 × 5사람 (실제 계급)                     [★★★ TESTED] evidence-row-scope (05:230-232)
├─ getEvidence 범위 밖 → null                                [★★★ TESTED] 05:231
├─ 공개 저장 version 낡음 → 전부 거부                         [★★★ TESTED] 05:179
├─ 공개 저장 잠긴 줄(확인 필요·카드 미등록·붙음·취소·음수)     [GAP] P2-2
├─ 브라우저가 팀 id 못 보냄                                   [★★ PARTIAL] grep 수락 기준만 (05:213)
├─ 시드 insert-if-absent · 회수 유지                          [★★★ TESTED] seed-permissions (01:246-247)
└─ 붙여넣기로 다른 팀 공개 불가 (13)                          [★★★ TESTED] publish-paste 단위 (13 prohibitions)

붙이기 · 떼기 (EVID-08 · 09)
├─ 1차 경영관리 붙이기 · version+1 · 로그                     [★★★ TESTED] evidence-attach (06:170)
├─ 1차 잠금 뒤 상태 재검사 거부                               [GAP] P2-3
├─ 결재 중 1차 붙이기 · 인스턴스 version · 스냅숏 불변         [★★★ TESTED] 06:218
├─ 같은 증빙 두 문서 동시                                     [★★★ TESTED] lock-race (06:219)
├─ 구매 요청 붙이기 · 실행가 불변 · 취소 제외                  [★★★ TESTED] 06:220
├─ 떼기 사유 · 이력 · 로그 꺼도 남음                          [★★★ TESTED] 06:221 · 06:224
├─ 결재 중 떼기 거부 (경영관리 포함)                           [★★★ TESTED] 06:222 + e2e 세 자격 (06:225)
├─ 떼기 vs 결재 올리기 경합                                   [GAP] P3-9 (grep만)
├─ 2차 작성자 본인만 · 다른 팀 id → 404                        [★★★ TESTED] evidence-author-attach (08:166-167)
├─ 팀장 대리 거부 (지출결의 · 구매 요청 · 카드 사용)            [★★★ TESTED] 08:168 · 08:217 · 09:216
├─ 작성자 결재 중 거부 · 경영관리와 경합 · 공개 회수 낡음       [★★★ TESTED] 08:214-216
├─ 자기 2차 붙임만 떼기 · 지급 완료 숨김                        [★★★ TESTED] 08:218
├─ 카드 사용 붙이기 S4/S5 덮기 · S8 대리 등록 · 경합 롤백        [★★★ TESTED] evidence-card-attach (09:214-218)
└─ 문서 비용 → 예상 복귀 · 떼기 미리 보기                       [★★★ TESTED] 06:223 · 12:189-190

증빙 판정 · 게이트 (EVID-08 · 12 — 12)
├─ 기록만 붙은 문서 제출 · 지급 통과 · 떼면 막힘               [★★★ TESTED] evidence-presence (12:147-149)
├─ resolveEvidenceStatus O-6101 + 불변 갈래                    [★★★ TESTED] 12:146
├─ 비용 기준 기록 갈래 + 불변 갈래                              [★★★ TESTED] 12:188
├─ 06-19 · 06-25 · 06-15/20 목록 SQL                            [★★★ TESTED] 12:218-220 + 06 기존 테스트
├─ 05 제출 게이트 기존 테스트 회귀                              [GAP] P2-1
└─ 파일만 있음 필터 (10) 범위 AND · 뗀 붙임 · 무효 파일          [★★★ TESTED] evidence-file-only-filter (10:126-130)
    └─ 06-20 기존 필터 회귀                                    [GAP] P2-1

금액 고침 (EVID-12 — 07)
├─ resolveEditedAmounts 부호·크기·면세                         [★★★ TESTED] amount 단위 (07:160)
├─ 고침 + always-on 전후 기록                                   [★★★ TESTED] 07:161-162
├─ 결재 중 붙은 기록 잠김 · 잠금 뒤 재판정 경합                  [★★★ TESTED] 07:210 · 07:212
├─ 카드 사용에 붙은 기록 고침                                   [GAP] P3-10
└─ 확인 필요 풀기 · 1024 미만 읽기 전용                          [★★★ TESTED] 07:214 · 07:217

화면 검증 (03 · 05 · 06 · 07 · 08 · 09 · 10 · 13)
├─ 독립 DOM 감사 · 폭 여섯 · 자격별                              [★★★ TESTED] 각 Task 3/2
├─ Codex 고정 경로                                             [★★ PARTIAL] 동적 경로·모달 불가 (P2-5)
└─ 시각 기준 사진 dev-components                                 [GAP] 로컬 갱신 불가 (P1-1)
```

---

## 6. 고칠 것 우선순위 (계획 문서 수정만 — 코드 아님)

1. P1-1 사진 갱신 절차 → visual-baseline.yml 경로로 (03 ⑤ · 13 ② · 13 수락 기준)
2. P1-2 E2E · 감사 · Codex 명령을 같은 flock 안으로 (실행자 규율 + 각 verify)
3. P1-3 intake-zone 사전 크기 검사 + 1.4MB E2E (05 Task 1)
4. P1-4 UA-6106을 01 ⓪으로 당기고 05 스레드 handoff 한 줄
5. P2-1~P2-10 (테스트 갈래 추가 · 회귀 테스트 목록 · SQL 순위 · /cso · 게이트 재검 · PR 표)
6. P3 묶음 — 실행 중 SUMMARY 「수용」 기록으로도 충분한 것 다수
