---
phase: 05-expense-approval-leave
plan: 04
subsystem: evidence-upload
tags: [evidence, upload, signed-url, hmac, drizzle, postgres, migration, lock-race, settings]

requires:
  - phase: 05-03
    provides: 지출결의 작성 중 문서 · submitExpense 게이트 · lockExpenseForUpdate · canSeeExpense
  - phase: 05-14
    provides: submitReadyDraft 경합 픽스처 · lock-race 관례(deps.afterLock)
provides:
  - files · upload_intents 표(0026_gifted_genesis) · repositories/files · repositories/upload-intents
  - domain/evidence — requestEvidenceUpload · completeEvidenceUpload · removeEvidence · createEvidenceViewUrl · listEvidence
  - 제출 게이트 ⑧ `증빙 없음 · 증빙 올리기 Ctrl+U`(tx 안 countActiveByOwner)
  - lib/gcp/storage ObjectStorage 포트 + 로컬 드라이버(HMAC 서명 주소) · app/api/storage-local/[...key] 창구(local에서만)
  - lib/env STORAGE_DRIVER · GCS_EVIDENCE_BUCKET · resolvedStorageDriver
  - 설정 `증빙 크기 한도`(evidence.max_size_mb, 기본 10, MB 단위 글자)
  - 테스트 픽스처 attachEvidence · createMemoryStorage(메모리 가짜 저장소)
affects: [05-05, 05-09, 05-12, 05-07, phase-6-evidence]

actuals:
  tokens: 69636
  tasks: 3
  commits: 8
plan_head_before: 6cf58eacef3be0bcc151e5135d6c3ffaf856cd7a
commits: 8

migration_manifest:
  - tag: 0026_gifted_genesis
    sql: db/migrations/0026_gifted_genesis.sql
    snapshot: db/migrations/meta/0026_snapshot.json
    journal: db/migrations/meta/_journal.json (항목 하나 덧붙임)
    hand_edited: "1–5행 — 머리 주석 2줄 + SET LOCAL lock_timeout '1s' · statement_timeout '5s' + statement-breakpoint(db:generate 다시 돌려도 No schema changes)"
    tables: [files, upload_intents]
    lock_risk: "새 빈 표 · 재작성/백필 없음, users FK ALTER만 잠금 — 상한 1s/5s"

tech-stack:
  added: []
  patterns:
    - "서명 주소 PUT → 완료 통보가 메타데이터 재확인 → incoming/{의도} → evidence/{파일} 옮긴 뒤에만 파일 행"
    - "완료 거부는 문구 하나 + retry 갈래(complete = 옮기기만 실패 · restart = 그 밖)"
    - "저장소 호출은 트랜잭션 밖, 트랜잭션 거부 뒤 옮긴 객체 보상 삭제"
    - "로컬 창구는 첫 판정이 드라이버 — 아니면 404 + 키 없는 운영 로그"

key-files:
  created:
    - db/schema/files.ts
    - db/migrations/0026_gifted_genesis.sql
    - domain/evidence/index.ts
    - domain/evidence/upload-checks.ts
    - domain/evidence/dto.ts
    - lib/gcp/storage.ts
    - app/api/storage-local/[...key]/route.ts
    - repositories/files.ts
    - repositories/upload-intents.ts
    - test/integration/evidence-upload.test.ts
    - test/integration/fakes/memory-storage.ts
    - test/unit/lib/gcp/storage-local.test.ts
    - test/unit/app/storage-local-route.test.ts
    - test/unit/domain/evidence/upload-checks.test.ts
    - docs/design/checks/2026-10-04-05-04-settings-evidence-size.md
    - docs/design/checks/2026-10-04-05-04-settings-restore-per-section.md
  modified:
    - domain/expenses/gate.ts
    - domain/expenses/index.ts
    - domain/settings/keys.ts
    - domain/settings/registry.ts
    - lib/env.ts
    - app/(app)/admin/settings/page.tsx
    - app/(app)/admin/settings/settings-form-client.tsx
    - app/(app)/admin/settings/settings.module.css
    - test/integration/fixtures/expenses.ts
    - test/integration/tx-safety.test.ts
    - test/unit/env.test.ts
    - test/e2e/settings.spec.ts
    - test/e2e/settings-approval-route.spec.ts
    - .gitignore
    - .env.example

key-decisions:
  - "선언 · 삭제가 상태로 막히면(결재 중 등) 새 문구 없이 ExpenseConflictError(`HH:MM에 다른 곳에서 저장됨 · 새로 고침`) 재사용"
  - "크기 0 · 잘못된 sha256 선언은 EVIDENCE_UPLOAD_FAILED 문구(`올리지 못함 · 다시 올리기`)"
  - "게이트 ⑧은 견적 줄 제출 경로에서만 평가 — 팀 지출 제출 경로는 05-07"
  - "로컬 서명 주소는 상대 경로(/api/storage-local/…), PUT 헤더는 GCS와 같은 이름(Content-Type · x-goog-meta-sha256)"
  - "STORAGE_DRIVER 빈 문자열은 미설정으로 본다(.env.example를 복사해도 파싱 실패 없음)"
  - "설정 복원 줄은 보관본 단계가 있는 섹션(결재선 종류)에만 — 복원 · 버림도 그 섹션 단계만(WINDOWS #42)"

patterns-established:
  - "deps.afterLock + lock-race로 제출 ∥ 증빙 삭제 두 순서와 같은 파일 두 삭제를 시간 대기 없이 고정"
  - "메모리 가짜 저장소(failNextMove · failRetain · tamper)로 저장소 실패 갈래를 통합 테스트"

requirements-completed: [EVID-01, EXP-02]

coverage:
  - id: D1
    description: "증빙 선언 → 서명 PUT → 완료 통보 → 파일 행 · 보존 표식 · 로그, 증빙 없으면 제출 게이트 ⑧"
    requirement: EVID-01
    verification:
      - kind: integration
        ref: "test/integration/evidence-upload.test.ts#트레이서 — 선언에서 제출까지"
        status: pass
      - kind: unit
        ref: "test/unit/domain/evidence/upload-checks.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "업로드 거부(남의 · 만료 · 두 번째 완료 · 메타데이터 불일치 · 상태 · 권한 · 중복 번호 노출 규칙)와 다시 올리기 갈래"
    requirement: EVID-01
    verification:
      - kind: integration
        ref: "test/integration/evidence-upload.test.ts#거부 — 의도 · 메타데이터 · 상태 · 권한 · 중복 · 다시 올리기 갈래"
        status: pass
    human_judgment: false
  - id: D3
    description: "제출 ∥ 증빙 삭제 잠금 경합(두 순서) · 같은 파일 두 삭제 · 풀 2 동시 증빙 추가 셋"
    requirement: EXP-02
    verification:
      - kind: integration
        ref: "test/integration/evidence-upload.test.ts#잠금 — 제출과 증빙 삭제"
        status: pass
      - kind: integration
        ref: "test/integration/tx-safety.test.ts#풀 2 · 동시 증빙 추가 셋(05-04)"
        status: pass
    human_judgment: false
  - id: D4
    description: "로컬 저장소 드라이버(HMAC 서명 · 키 꼴 · move/retain)와 창구(gcs면 404, 변조 403), staging에서 local 거부"
    verification:
      - kind: unit
        ref: "test/unit/lib/gcp/storage-local.test.ts · test/unit/app/storage-local-route.test.ts · test/unit/env.test.ts#STORAGE_DRIVER(05-04)"
        status: pass
    human_judgment: false
  - id: D5
    description: "설정 `증빙 크기 한도` 기본 10 · MB 단위 글자 · 숫자 형식 오류"
    verification:
      - kind: e2e
        ref: "test/e2e/settings.spec.ts#05-04 S13 (CI=true desktop)"
        status: pass
    human_judgment: true
    rationale: "화면 플랜 — 폰 폭 DOM 실측은 웨이브 독립 DOM 감사 · /design-review 대상"
  - id: D6
    description: "WINDOWS #42 — 설정 복원 줄이 보관한 결재선 섹션에만 뜨고 복원 · 버림이 그 섹션만 다룸"
    verification:
      - kind: e2e
        ref: "test/e2e/settings-approval-route.spec.ts#복원 줄은 보관한 결재선 섹션에만 뜨고 … (CI=true desktop-settings)"
        status: pass
    human_judgment: false

duration: 47min
completed: 2026-10-04
status: complete
---

# Phase 5 Plan 04: 증빙 업로드 경로 · 제출 게이트 ⑧ · 로컬 저장소 드라이버 Summary

**서명 PUT → 메타데이터 재확인 → incoming/→evidence/ 옮긴 뒤에만 파일 행을 만드는 증빙 업로드, 증빙 없는 지출결의 제출 차단(⑧), 로컬에서만 열리는 HMAC 서명 저장소 창구**

## Performance
- **Started:** 2026-10-04T09:33Z(원장) · **Completed:** 2026-10-04T10:20Z · **Tasks:** 3 · **Files:** 35

## Task Commits
1. 스키마 `7e8bdc19` (feat) — Task 1 RED 전 05-03 선례대로 먼저
2. Task 1 RED `d4d4c899` (test) · GREEN `08bde7fe` (feat) — 트레이서 게이트 재실행 통합 2346 통과
3. Task 2 `43bee0a6` (chore) — 0026 SET LOCAL 상한
4. Task 3 RED `0d62b5eb` (test) · GREEN `13690727` (feat)
5. WINDOWS #42 RED `afc95506` (test) · 수정 `f75a4c73` (fix)

## Verification (latest runs)
- unit: evidence · settings · env · storage-local · route · import-cycles · error-copy 등 — 전부 통과(Task 3 범위 49 · 공통 44)
- integration: evidence-upload + tx-safety 28 통과 · Task 1 때 lifecycle/concurrency/installment/leak-scan 포함 2346 통과
- lint 0 · typecheck 0 · build 통과(`/api/storage-local/[...key]` ƒ) · lint:sql 0건
- CI=true E2E: settings-approval-route(desktop-settings) 22 · settings(desktop) 11 통과 · 포트 3100 비움
- 통합 거부 사례는 Task 1 도메인이 이미 만족해 처음부터 초록 — 변이 확인(삭제 tx 안 재확인 제거 · 옮기기 실패를 restart로)에서 ⓐ · 다시 올리기 갈래가 실패함을 확인 후 원복
- log.warn `storage.local_route_blocked` 인자는 `{method, reason}`뿐 — key · url 없음(F7 확인)

## Deviations from Plan

**1. [Rule 3] `app/(app)/admin/settings/page.tsx` 수정** — 플랜 files에 없지만 unitLabel을 뷰 모델로 넘기려면 필요. `08bde7fe`.

**2. [Rule 2] `test/e2e/settings.spec.ts` S13 사례 추가** — must_have(기본 10 · MB · 형식 오류)를 화면에서 확인. `08bde7fe`.

**3. [Rule 1 - 오케스트레이터 배정] WINDOWS #42 수정** — 복원 줄이 단계 칸 있는 모든 섹션에 떠 연차 보관본이 지출결의 섹션에서 복원되던 결함. 섹션별 restorable로 좁히고 setStored를 키 단위로. 줄 모양 · 문구 그대로(설계 결정 불필요). design-gate 점검표 추가. `afc95506` · `f75a4c73`. `gsd-tools windows fixed 42` 처리.

**4. [Rule 2] STORAGE_DRIVER 빈 문자열 = 미설정** — `.env.example`의 빈 값을 복사해도 enum 파싱이 깨지지 않게. `13690727`.

**5. [Rule 3] `createLocalStorage`에 선택 `now` 시계 · `writeObject`/`readObject`** — 결정적 서명 단위 테스트와 라우트의 바이트 쓰기용(포트 ObjectStorage는 그대로). `13690727`.

**Total:** 5 (Rule 1 ×1 · Rule 2 ×2 · Rule 3 ×2). 범위 밖 변경 없음.

## Notes for next plans
- **requirements:** `requirements.ready-ids`가 EXP-02만 ready로 돌려줘 EXP-02만 mark-complete. EVID-01은 ready-ids에 나오지 않음(폰 사진 축소 등 05-05 몫으로 보임) — 프런트매터에는 플랜 값대로 둘 다 적었다.
- **05-05(화면):** 서명 PUT은 상대 주소 · 돌려준 headers를 그대로 보낸다. 완료 거부의 `retry`로 갈래(complete = 완료만 다시, restart = 선언부터). playwright webServer에 STORAGE_DRIVER 지정은 05-05 몫.
- **05-09:** 결재 중 업로드 · 삭제는 지금 ExpenseConflictError — OWNER_RULES.editable과 removeEvidence 잠금 아래 「> 1」 조건을 거기서 연다.
- **05-12:** `getObjectStorage()` gcs 갈래가 설정 오류를 던진다 — 05-12 전에는 staging 배포 금지. GCS_EVIDENCE_BUCKET 검사는 드라이버 생성 때.
- **05-14 메모:** submitReadyDraft가 증빙을 붙인 뒤 「같은 문서 두 번 제출 — 동시」 사례 재확인 통과.
- 설정 복원 「버림」 알림은 마지막 버림 하나만 되돌린다(두 섹션을 연달아 버리면 앞 것은 되돌리기 불가) — 기존 단일 알림 구조 그대로.

## Self-Check: PASSED
- 커밋 8개 `git log 6cf58eac..HEAD` 확인 · 핵심 파일 존재 확인(route.ts · storage.ts · 0026 · 점검표 둘)
