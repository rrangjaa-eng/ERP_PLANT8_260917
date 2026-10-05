---
phase: 05-expense-approval-leave
plan: 13
subsystem: database
tags: [migration, merge, drizzle, squawk, a11y, e2e, contract-docs, restore-check, phase-gate]

requires:
  - phase: 05-11
    provides: "settlement_approvals 표 · 정산 결재 최종 승인 잠금 순서 표"
  - phase: 05-12
    provides: "gcs 드라이버 · 증빙 버킷 인프라(staging 부트스트랩 끝)"
provides:
  - "Phase 5 마이그레이션 하나 0024_even_mulholland_black(idx 24 = main 마지막 0023 + 1)"
  - "docs/EXPENSES.md 「계약(Phase 5 → Phase 6)」 · 「잠금 순서 예외」 + ARCHITECTURE §4-9 (8) · §4-8 조각"
  - "RESTORE_CHECK_TABLES에 Phase 5 표 넷"
  - "E2E expense-a11y(desktop) · mobile-expense-320(375 + 320)"
  - "첨부 영역 버튼 접근 이름 = 보이는 글자(ui/attachments)"
affects: [phase-06-M-9, phase-09-PNL-01, phase-11-CERT-04, ship-05]

plan_head_before: a972a5accb5d0fe9234df8282328fc47789db3c5
actuals:
  tokens: 8500
  tasks: 2
  commits: 6

tech-stack:
  added: []
  patterns:
    - "병합 직전 재생성: manifest 목록만 git rm → journal은 origin/main 판 checkout → pnpm db:generate 한 번 → 손 편집(머리 주석 · SET LOCAL · CHECK 인라인) → db:generate No schema changes"
    - "접근 이름 = 보이는 글자: 폭별 글자 둘을 span 하나로 감싸 aria-labelledby — display:none 쪽은 이름에서 빠진다(self-labelledby는 Chrome에서 <label for>로 되돌아간다)"

key-files:
  created: [db/migrations/0024_even_mulholland_black.sql, db/migrations/meta/0024_snapshot.json, test/e2e/expense-a11y.spec.ts, test/e2e/mobile-expense-320.spec.ts, docs/design/checks/2026-10-05-05-13-attachments-accessible-name.md]
  modified: [db/migrations/meta/_journal.json, docs/EXPENSES.md, docs/ARCHITECTURE.md, test/unit/docs-limits.test.ts, TODOS.md, domain/ops/restore-check-tables.ts, ui/attachments/Attachments.tsx]
  deleted: [db/migrations/0024_white_guardsmen.sql, db/migrations/0025_aromatic_hawkeye.sql, db/migrations/0026_gifted_genesis.sql, db/migrations/0027_spicy_loners.sql, "db/migrations/meta/002{4,5,6,7}_snapshot.json"]

key-decisions:
  - "origin/main(341537c1)이 이미 조상 — 병합 커밋 없이 일반 커밋으로 삭제 · 복원(04.1-07 CX-R1 갈래)"
  - "Phase 5 네 마이그레이션을 하나(0024_even_mulholland_black)로 재생성 — 손 편집은 앞 플랜과 같은 범위만"
  - "첨부 영역 접근 이름 위반(UI-SPEC S4)을 ui/attachments에서 고침 — 사용자 지시(10/5 00:55)에 따라 추천안 적용"

requirements-completed: []

coverage:
  - id: D1
    description: "main 뒤 Phase 5 마이그레이션 하나 · 빈 DB 적용 · 손 편집 재적용 · journal 연속성"
    verification:
      - { kind: other, ref: "pnpm db:generate → No schema changes (rc 0)", status: pass }
      - { kind: other, ref: "pnpm lint:sql → 0 issues in 25 files", status: pass }
      - { kind: unit, ref: "test/unit/db (3 files 12)", status: pass }
      - { kind: integration, ref: "expense-approval-lifecycle + migration-upgrade (29)", status: pass }
      - { kind: integration, ref: "Phase 5 통합 전체 git diff 55647a0b..HEAD -- test/integration (25 files 3214)", status: pass }
      - { kind: e2e, ref: "CI=true mobile-375 expense-submit-mobile-approval + mobile-next-turn-approval (6)", status: pass }
    human_judgment: false
  - id: D2
    description: "Phase 6 계약 · 잠금 순서 예외 문서 · 복원 확인 표"
    requirement: EXP-14
    verification:
      - { kind: unit, ref: "test/unit/docs-limits.test.ts (89) · test/unit/ops (24)", status: pass }
    human_judgment: false
  - id: D3
    description: "지출결의 화면 axe 0 · 포커스 규칙 · 375/320 넘침 0 (backstop E2E 둘)"
    requirement: UX-03
    verification:
      - { kind: e2e, ref: "CI=true --no-deps test/e2e/expense-a11y.spec.ts + mobile-expense-320.spec.ts (7)", status: pass }
    human_judgment: true
    rationale: "독립 DOM 감사(별도 에이전트 · CI=true)가 아직 없다 — 오케스트레이터가 돈 뒤 표를 이 SUMMARY에 채운다"
  - id: D4
    description: "staging 실제 GCS V4 서명 PUT · GET · 크기 초과 거부 · 앱 전체 경로"
    requirement: EVID-01
    verification: []
    human_judgment: true
    rationale: "Task 3 checkpoint:human-verify — 첫 staging 배포(사용자 머지 뒤)에서만 확인 가능"

duration: ~1h50m
completed: 2026-10-05
status: halted
---

# Phase 05 Plan 13: 병합 직전 재생성 · 페이즈 게이트 Summary (Task 3 대기)

**main 뒤 Phase 5 마이그레이션을 0024_even_mulholland_black 하나로 다시 만들고(손 편집 재적용 · 빈 DB 적용 · 통합 25 files 3214 통과), 지출결의 접근성 · 폭 E2E 둘과 Phase 6 계약 문서를 더했다. 독립 DOM 감사(오케스트레이터)와 staging GCS 확인(Task 3)이 남아 `status: halted`다.**

## 상태
- Task 1 ✅ · Task 2 ✅(독립 DOM 감사 ③ 빼고 — 실행자가 하면 안 된다) · Task 3 ⏸ checkpoint:human-verify(첫 staging 배포 뒤).
- 감사 · Task 3 결과가 오면 이어받는 세션이 아래 「DOM 감사 표」 · 「staging 확인」을 채우고 `status: complete`로 바꾼다. requirements mark-complete는 그때 한다.

## Task 1 — 병합 트레이서
- `PLAN_BASE=a972a5ac` · `MAIN_SHA=341537c188ae5503c6157f99254aec4f9113f2ec`(`.git/gsd-05-13.env`). main은 이미 조상(병합 d4264feb #166) — 병합 커밋 없이 `0c501fed`가 manifest 목록 8개(0024~0027 SQL · 스냅숏)만 지우고 `_journal.json`을 origin/main 판으로.
- 재생성 tag `0024_even_mulholland_black`, journal idx 0~23(main) 보존 + idx 24 하나. main 마이그레이션 삭제 0(`git diff --diff-filter=D $MAIN_SHA -- db/migrations` 빈 값).
- 다시 넣은 손 편집: 1~4행 머리 주석 · 5~7행 `SET LOCAL lock_timeout '1s'` · `statement_timeout '5s'` · breakpoint · 107행 `version_reason` CHECK를 ADD COLUMN 안으로 인라인(생성된 별도 `ADD CONSTRAINT … CHECK` 문장 삭제 — 0024 옛 판과 같은 손질). 0027의 SET LOCAL 머리는 하나로 합쳐진 이 파일의 5~7행이 덮는다.
- 증명: db:generate 재실행 No schema changes · lint:sql 0 · 빈 erp_test 적용 · 개발 DB erp DROP/CREATE 뒤 적용 · 시드 · test/unit/db 12 · 트레이서 통합 29 · 기준 3 E2E 6(CI=true). STATE.md diff 0.

## Task 2 — 페이즈 게이트
- 싼 게이트: lint 0 · typecheck 0 · lint:sql 0 · build rc 0 · `mark-legacy --audit`(Phase 5 화면 폴더 여섯) rc 0 · 관련 단위 8 files 198 · `pnpm test:unit` 254 files 3889.
- 새 E2E 둘(CI=true, `--project=desktop --project=mobile-375 --no-deps`): 7 통과. 첨부를 쓰는 회귀 스펙 6개 45/46(1건 부하 경합 — 아래 Issues).
- 수용 기준: 브랜드 캐스트 0 · dangerouslySetInnerHTML 0 · package.json · lockfile · tokens.css · STATE.md diff 0 · EXPENSES 토큰 넷 · §4-9 가리킴 1 · §4-8 「인스턴스 → 프로젝트」 1 · 「교착」 1 · §4-6 expense · 프로젝트 번호 1 · 복원 표 넷 · 삭제 줄 0 · ARCHITECTURE 296 · EXPENSES 46줄 · 손 촬영 사진 diff 0(PLAN_BASE 뒤 사진 변경 없음).
- 잠금 순서 예외: 05-11 표 대조 — 프로젝트 행 → 같은 정산 결재 인스턴스 경로 없음(올리기 · 다시 올리기는 읽기만, 회수 `withdrawSettlement`는 인스턴스만, D-80은 프로젝트만).
- 복원 표: `expenses` · `files` · `upload_intents` · `settlement_approvals`(실제 표 이름 그대로). 04.1 표(approval_* · leave_*)는 목록에 없다 — 범위 밖, 언급만.

## DOM 감사 표 (오케스트레이터가 채움)
감사: 독립 에이전트(Sonnet 5.5) · `CI=true` 프로덕션 빌드 · 시드 실측 · 브랜치 3360707e · 기준선 merge-base 341537c1(전 페이즈 화면은 기준선에 없음 — 웨이브 13 수치와 대조) · 원본 `notes/05-review/wave14/README.md` · 결함 3 · OK 18 · Codex 실행(후보 2건 → 판정 결함 아님, D1과 연결).

| 표면 | 폭 | 판정 | 근거 수치 |
|---|---|---|---|
| 견적 줄 행 행동 열 | 1280 · 1024 · 700 | OK | 행동 열 3 폭 모두 있음(12/10/8열), 3차 91×21 · 69×20 nowrap 한 줄, 700 `거래처 없음`만, 표 가로 스크롤 0 |
| 폰 행 시트(긴 항목 · 거래처 · 비고) | 375 · 320 | OK | 3차 109×44, 넘침 0, 본문 스크롤 끝에서 도달 |
| 지출결의 목록(긴 거래처 72자) | 1280 · 1024 · 700 · 375 · 320 | OK | 데이터 행 ≥44(44/51/69–92), 그룹 머리 37(비대화형), 넘침 0, 이월 41/40 |
| 폼 고정 제출 줄 · 탭 | 375 · 320 | OK(정지) / DEFECT(포커스) | 줄 497–622 · 탭 622–667 · 본문 끝 459 < 497. Tab 이동 시 `#supplyAmount` 593–633 등 줄에 덮임(D1: `expense.module.css:163-175` `scroll-padding-bottom` 없음) |
| 문서(기안자 · 결재자) 고정 줄 | 1280 · 375 · 320 | OK | 폰 줄 561–622 위, 본문 끝 534 < 561, 승인 218×44 / 181×44 |
| 계산 한 줄 | 375 · 320 | OK(조각) | 숫자 조각 nowrap 한 줄, 12자리는 조각 사이에서만 꺾임, 넘침 0 · 꼬리 `… 규칙` 줄바꿈은 사용자 결정 U1 |
| 결재함 · 결재 시트(긴 이름) | 375 · 320 | OK | 시트 `승인` 218/181×44 · `반려` · `크게 보기` 70×44, kbd 0, 넘침 0 |
| 골라내기 경계 | 699 · 700 · 701 | OK | 699 시트 w699 · 줄 버튼 44, 700 · 701 모달 w480 · 버튼 32 |
| 정산 결재 문서 | 1280 · 375 | OK | 승인 119×32 / 218×44, 1차 하나, CLS 0 |
| `tokens.css` diff | — | OK | 0줄(341537c1 · a6dd1f2e 모두) |
| 첨부 `button` · `하나 더` 이름 | 5 폭 | OK | `aria-labelledby`, 이름 = 보이는 글자(exact 1개), `하나 더` 폰 36×44 |
| 05-11 수정 — 머리 CLS | 320 · 375 · 768 | DEFECT(부분) | PM 0.0002 · 0.0002 · 0.0144(수정 전 0.113–0.204). 팀장 · 대표 320 첫 로드 0.225 간헐 2/6(D3, 머리 줄 29px 축소) |
| 05-11 수정 — 폰 시트 막힘 이유 | 375 · 320 | OK | 100×21 한 줄 · 버튼 줄 아래 전폭(수정 전 63×42 두 줄) |
| 05-11 수정 — 폰 시트 승인 → 포커스 | 375 · 320 | OK | 다음 행 문서 버튼 · `/` 다음 행 `열기`(수정 전 BODY) |
| 05-11 수정 — 정산 다시 올리기 토스트 | 4 폭 | OK | `되돌리기` 폰 44×44, 고정 줄 위 |
| 05-11 수정 — 코드표 폰 2열 | 375 · 320 | OK | 2×2 격자 높이 44, CLS ≤0.0113 |
| 미리보기 서버 오류 무시(알려진 열린 결함) | 5 폭 | DEFECT | 7,407,407,407 입력 뒤에도 계산 줄 이전 값 · 오류 줄 0 · `.stale` 없음(D2: `expense-form.tsx:278`) |
| 회귀(웨이브 6–13 스펙) · 전역 | 5 폭 | OK | 45 passed · 673 캡처 overflowX 0 · 토큰 밖 0 · 폰 kbd 0 |
| 사용자 결정 필요 | — | U1 · U2 | U1 계산 줄 꼬리 줄바꿈 · U2 고정 줄 포커스 가림 공통 처리(연차 폼 포함) |

## Phase 6 정렬 메모(06 M-9 게이트용)
1. 06-02 설정 키 넷 → 셋 — `evidence.max_size_mb`는 Phase 5가 등록했다.
2. `sumKrw` · `diffKrw`는 Phase 5(`domain/money`).
3. 06-03 `pickTaxDates` 부가세 대체 = 작성일(D-101).
4. 06 S4 계산 한 줄은 세율 `%`를 쓴다(`taxLineText`).
5. 06 S18 강행 결과 줄 → 정산 결재 문서 화면 KvList 한 행(같은 버튼 막힘은 06 S18이 더함).
6. 05-01 `name_map` 실제 이름 — `describeDocuments`는 `Promise<Map<string, DocumentSummary>>`, `canResubmit(viewer, documentId?)`, 나머지 같음(05-01 SUMMARY). 계약 전문은 `docs/EXPENSES.md`.
- Phase 11 메모: 회사 대납 시가 5만원 이하 면제는 CERT-04(지금은 금액 무관 22% gross-up). TODOS.md 네 항목.

## 머지 묶음 자르기 표(`/ship`이 이대로 PR을 나눈다)
목록 재현: `. .git/gsd-05-13.env; git diff --name-only "$MAIN_SHA" HEAD | grep -v '^.planning/'`(284개, 이 플랜 SUMMARY 커밋 전 기준).
| 묶음 | 경로 | 수 | 머지 |
|---|---|---|---|
| ⓐ 증빙 버킷 인프라 | `infra/names.sh` · `scripts/{bootstrap-gcp,deploy,verify-gcp}.sh` · `scripts/gcs-sign-smoke.ts` · `.github/workflows/verify.yml` · `docs/{EVIDENCE-STORAGE,OPERATIONS}.md` · `test/unit/deploy/**` | 12 | 사용자(소유자가 머지 전 PR 브랜치 부트스트랩 — 05-12에서 이미 함) |
| ⓑ 스키마 · 권한 · 도메인 | `db/**`(0024 · journal · schema) · `domain/**`(permissions 포함) · `repositories/**` · `lib/**` · `test/integration/**` · `test/support/**` · `test/unit/{domain,lib,settings}/**` · `test/unit/env.test.ts` · `.env.example` · `.gitignore` + **`app/(app)/document-kinds.ts`**(document-kinds-import 가드가 새 종류 진입점을 같은 PR에서 요구) | ~101 | 사용자 |
| ⓒ 화면 · 액션 · 문서 · E2E | `app/**` · `ui/**` · `docs/design/**` · `docs/{ARCHITECTURE,EXPENSES}.md` · `TODOS.md` · `test/e2e/**` · `test/unit/{app,ui}/**` · `test/unit/docs-limits.test.ts` · `playwright.config.ts` | ~170 | 세션(조건 충족 시) |
- 순서 ⓐ → ⓑ → ⓒ. ⓒ는 ⓐ · ⓑ가 main에 들어간 뒤 main을 머지 커밋으로 반영해서. 나눈 브랜치마다 `pnpm typecheck` · `pnpm test:unit`을 먼저 돌려 묶음 사이 결합(가드 테스트 · import)을 확인한다. `.claude/gates/phase-05.log`는 어느 묶음에도 넣지 않는다.
- Post-build(PR마다 한 번): 모두 `/review` · ⓒ는 화면 영향이라 `/design-review` → `/qa` · ⓑ는 돈 · 결재(`domain/approvals` · 지출결의 세금 · 정산 승인 훅 · `repositories/approvals`)라 `/cso` · 외부 입력(증빙 업로드 · 서명 URL · `app/api/storage-local`)이 있는 ⓑ · ⓒ에 `/cso`를 더한다 → `/ship` → 머지(ⓐ · ⓑ 사용자 GitHub, ⓒ 조건 충족 시 세션 — 머지한 세션은 스테이징 배포를 지켜본다) → `/retro`.
- `/ship` 바로 앞: `git diff origin/main -- .planning/STATE.md` 빈 값 · 그 PR의 최신 사용자 「[지시]」(머지 보류 · `hold` 라벨) 확인.
- **전체 게이트: PR ready 뒤 CI.** 빨간불이면 `systematic-debugging` 뒤 고치고 머지하지 않는다.
- **시각 기준 사진(`/ship` 지시)**: CI `visual`이 빨간불이면 ⓐ 실패 사진이 이 페이즈가 바꾼 화면(`visual_baseline_expected` 합: approvals · dev-components · dev-components-panel · project-detail)이거나 병합에서 main 판을 택한 사진뿐인지 실패 목록으로 대조 ⓑ 그렇다면 `gh workflow run visual-baseline.yml --ref <페이즈 브랜치>`로 다시 찍어 봇 커밋을 받고 CI 재실행(로컬 `--update-snapshots` 커밋 금지), 바뀐 화면은 DOM 감사 표로 판정 ⓒ 그 밖의 사진이 다르면 `systematic-debugging` 뒤 코드 수정. 이 플랜의 첨부 버튼 고침은 모양 변경 0이라 사진 목록을 늘리지 않는다.

## staging 확인(Task 3 — 대기)
- 배포 SHA · 버킷(`<프로젝트>-plant8-staging-evidence`) · 단계 1~6 결과는 사람 `approved` 뒤 채운다. 실패하면 실패 단계 · 문구 · 05-12 갭 플랜 제안을 적고 complete로 바꾸지 않는다.

## Deviations from Plan
1. **[Rule 1 - Bug] 첨부 영역 버튼 접근 이름이 칸 라벨 `증빙`으로 덮였다(UI-SPEC a11y S4)** — Task 2 ① 새 E2E RED → `ui/attachments/Attachments.tsx`에서 보이는 글자 묶음을 aria-labelledby로(Chrome AX 실측 확인, 모양 · CSS 0) · 점검표 · `6d00e18b`. 사용자 지시(10/5 00:55)에 따라 추천안 적용.
2. **[Rule 3] 회사 대납 증빙 종류가 시드에 없다** — 폭 E2E가 `createCodeItem` + `setEvidenceTypeTaxRule`로 만들고 끝에서 끈다. 13자리 원화 공급가액은 도메인 금액 상한(999,999,999,999원)이라 불가 — 상한 바로 아래(조각 셋 모두 12자리)로 쟀다.
3. **[Rule 3] 로컬 E2E 명령** — 플랜 verify 그대로(`--project` 없이)는 mobile-375 의존 사슬로 desktop 전체가 돈다. 한 번 그렇게 돌다 중단했고 이후 `--project=desktop --project=mobile-375 --no-deps`로 돌렸다.
**Total deviations:** 3 (Rule 1 ×1, Rule 3 ×2). **Impact:** 화면 고침 하나는 DOM 감사 · `/design-review` 범위에 든다.

## Issues Encountered
- 미리보기가 서버 오류(금액 상한 초과)를 조용히 버린다 — deferred-items 05-13.
- 회귀 실행 중 `mobile-expense-form.spec.ts:265` 1280 썸네일 폴링 1건 실패(동시 `pnpm test:unit` 부하 — 단독 9/9) · 전체 desktop 우발 실행의 20건 실패 — deferred-items 05-13(전체 E2E는 CI 몫).

## Next
- 오케스트레이터: 독립 DOM 감사(아래 범위) → 위반 고침 → 이 SUMMARY 표 채움. 그 뒤 Task 3 checkpoint를 사용자에게.

## Self-Check: PASSED
- 파일 4개(0024 마이그레이션 · a11y · 320 스펙 · 점검표) 있음 · 커밋 6개(0c501fed f29de044 136abb53 00a974f4 4fbcf642 6d00e18b) 있음 · rev-list a972a5ac..HEAD = 6.
