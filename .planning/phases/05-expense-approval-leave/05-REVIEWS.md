---
phase: 5
round: 5
sources:
  - code-drift-review-r5.md (계획 ↔ origin/main b41944d + 04.5 브랜치 8ae0903 코드 대조, Opus 독립 조사 — Round 4와 같은 형식. 범위 f3242c8..b41944d 53커밋: 04.2 · 04.3 #88 · 04.6 계획 #113 · #121 · #126 · #138 · #147 · #148 · #150 · #151 · #153~#155, 그리고 04.5 브랜치 diff)
reviewers: [opus-code-drift]
prior_rounds:
  - "Round 1 — 1108e20 (ceo-review.md, 반영 완료: 각 플랜 Ledger `### Round 1 — 1108e20`)"
  - "Round 2 — 69fb7ea (eng-review.md, 반영 완료: 각 플랜 Ledger `### Round 2 — 69fb7ea`)"
  - "Round 3 — efd6c67 (design-review.md, 반영 완료: 각 플랜 Ledger `### Round 3 — efd6c67`)"
  - "Round 4 — 0ded729 (code-drift-review.md, 반영 완료: 각 플랜 Ledger `### Round 4 — 0ded729`, 커밋 145be0d)"
---

# Phase 5 — Reviews (Round 5: main b41944d · 04.5 대조)

> `/gsd-plan-phase 5 --reviews` Round 5 입력. 정본은 `code-drift-review-r5.md`(파일:줄 근거 · 확인/추정 구분 · 그대로인 전제 목록 포함)이고, 이 파일은 그 지적을 반영용 목록으로 옮긴 것이다(내용 추가 없음, 사용자 결정 칸만 덧붙임).
> 이 브랜치(PR #89)는 PR 지시(2026-10-01 「draft 유지, main 반영 보류」)대로 main을 머지하지 않는다. 대조는 `git show origin/main:<path>`로만 했다.
> **중복 구현은 없다.** 결재 엔진 · 연차 코드(`domain/approvals/*` · `repositories/approvals.ts` · `domain/leave/*` · 결재함 화면)는 f3242c8 → b41944d · 8ae0903 사이 변경 0이라 Round 4 name_map · premise_check는 **04.6 머지 전까지** 그대로 맞다.
> 가장 큰 변화는 실행 순서 04.5 → 04.6 → 5(#147, 사용자 결정 2026-10-02)다. 04.6(스킨 A)이 Phase 5 화면 전제(화면 틀 · 상태 배지 · 숫자 · 토큰 · 옆 패널)와 Phase 5가 고칠 파일 18개를 먼저 바꾼다. 04.6은 아직 계획만 있다(0/32 실행).

## User Decisions (2026-10-02, 스레드 「05 계획 main 대조」 선택 카드)

카드 세 장을 올렸고 답을 기다린다. 프로젝트 규칙(카드는 작업을 멈추지 않고 추천안으로 진행)대로 **추천안 A로 반영**한다. 답이 다르면 다음 라운드에서 다시 반영한다.

- **U1 (F2 · F3) — 04.6 화면 규칙 맞추기: A(추천, 답 대기)** — 지금은 착수 게이트(F1)와 화면 밖 지적만 반영한다. 화면 부분(05-UI-SPEC 컴포넌트 · 토큰 · 간격 · 색 · 글자 절, 05-02 B1~B9 SYSTEM 개정 문장, 05-01 Task 4 · 05-05~05-11 · 05-13 · 05-15 화면 task)은 각 플랜에 「04.6 의존 — 04.6 머지 판 기준으로 다시 씀」을 표시하고 Ledger에 deferral로 남긴다. 04.6 머지 뒤 화면 재대조 라운드(UI-SPEC 개정 `/gsd-ui-phase 5` → `/plan-design-review` → 코드 대조 Round 6 → `/gsd-plan-phase 5 --reviews`)를 한 번 돈다. 근거: CLAUDE.md 「계획 레인은 확정되지 않은 부분을 의존성으로 표시하고 확정된 부분부터 계획한다」
- **U2 (F4 위계) — 폰 행 시트 지출결의 행동 1차 vs 3차: 이 라운드에서 묻지 않음** — 화면 결정이라 U1 A의 화면 재대조 라운드에서 묻는다. 이 라운드는 사실 수정(새 prop을 만들지 않고 기존 `action?: ReactNode` 자리를 쓴다)만 반영한다
- **U3 (F5) — 300줄 한도 문서: A(추천, 답 대기)** — 증빙 버킷 런북과 지출결의 · 증빙 계약을 별도 문서(가칭 `docs/EVIDENCE-STORAGE.md` · `docs/EXPENSES.md`)로 떼고, `docs/OPERATIONS.md` · `docs/ARCHITECTURE.md`에는 가리키는 한 줄만 둔다. `test/unit/docs-limits.test.ts`에 새 문서 상한 · 가리킴 단언을 더한다(04.3 `docs/CERT-PURGE.md` 선례, 사용자 결정 2026-10-01)
- **U4 (F11 ②) — 지급 방식 코드표: A(추천, 답 대기)** — 05-03이 코드표(`CODE_TABLES` 등록 + 시드 셋)를 만들고, 값 확정 · 관리 화면 점검은 Phase 6(MAST-05)이 한다
- 앞선 결정(U1 · U2 · `expenses.evidence_void` A · E1 A · E2 A · G1~G4 A · R1 A · Round 4 Z1~Z3 A · M1 A)은 그대로 전제

## Consensus Summary

### HIGH (P1 — 이 라운드 반영)
- **F1** 착수 게이트에 04.5 · 04.6 머지 확인 없음 — ROADMAP Phase 5 `Depends on`이 `Phase 4, Phase 04.1, Phase 04.5, Phase 04.6`(#147 d45a16b)인데 05-01 「선행 의존」 표(P-1~P-5) · must_haves 첫 truth · `<precondition>` · `.continue-here.md`는 04.1 · Phase 4만 본다. 수리: P-6(04.5 main 머지 — 04.5 SUMMARY 9 + `db/migrations/0023_custom_field_admin.sql` 존재), P-7(04.6 main 머지 — SUMMARY 수 = PLAN 수 − superseded, `ui/list-screen` · `ui/detail-screen` · `ui/status-tag/status-map.ts` 존재; 정확한 이름은 04.6 SUMMARY 「뒤 플랜에 넘기는 API」로 맞춤)를 더하고 같은 문장을 must_haves · `<precondition>`에. P-4 설명의 「dc5a8fc로 통과」는 지운다(지금 계획 브랜치는 b41944d를 포함하지 않아 P-4 종료 코드 1 — 실행 세션이 main을 머지 커밋으로 반영하면 통과). 영향: 05-01
- **F2** [추정: 04.6 계획 문장 기준] 04.6 스킨 A가 화면 전제를 뒤집음 — `app/**/page.tsx`는 `ListScreen`/`DetailScreen` 필수 · `PageHeader` 직접 import 금지, `app/**`에서 `<table>`/`<dialog>` 직접 사용 금지, `StatusTag status` + `ui/status-tag/status-map.ts`(kind 삭제), 숫자는 `ui/num/Num`, 옛 토큰 이름 삭제(`--fs-md` · `--muted` · `--accent` 등), §6-3 폼 = 옆 패널, `ListEmpty` · `TableSkeleton`, 행 행동 `RowActions`. 수리: U1 A — 화면 부분 「04.6 의존」 표시 + deferral, 04.6 머지 뒤 화면 재대조 라운드. 화면 플랜 acceptance에 `scripts/design/mark-legacy.mjs --audit <폴더>` 위반 0은 그 라운드에서. 영향: 05-UI-SPEC · 05-02 · 05-01 Task 4 · 05-05~05-11 · 05-13 · 05-15
- **F3** [추정: 04.6 files_modified 기준] 04.6이 Phase 5가 고칠 파일 18개를 먼저 고침(결재함 `approval-sheet` · `inbox-table` · `page` · `decision-dialogs`, `leave/[id]/page` · `document-actions`, 첫 화면 `page.tsx`, `expenses/page.tsx`, `projects/[id]/page` · `quote-table`, `admin/code-tables/page`, `admin/settings/settings-form-client`, e2e 둘, `playwright.config.ts`, SYSTEM · DECISIONS, `TODOS.md`) → ⓪-b E5 · E6 · E7 기대 문장이 04.6 뒤 낡음. 수리: U1 A — 05-01 Task 1 ⓪-b 앞에 「04.6 머지 뒤 name_map · premise_check E5~E7 다시 적기」(화면 재대조 라운드에서 미리 끝내면 생략) 한 단계, 겹치는 파일을 고치는 task read_first에 「04.6-NN SUMMARY 「뒤 플랜에 넘기는 API」」. 영향: 05-01 · 05-03 · 05-04 · 05-05 · 05-08 · 05-10 · 05-11 · 05-13 · 05-15
- **F4** `RowSheet`의 선택 prop `action`이 04.3에서 이미 `action?: ReactNode`(「본문 아래 3차 한 개」, SYSTEM §7-3 (바))로 있음 — 05-05 Task 2 ①의 새 `action?: {label; onPress; pending?} | {note}` · `actionError?`는 같은 이름 · 다른 타입이라 확인증 사용처가 깨진다. 수리(이 라운드): 새 prop을 만들지 않고 호출부(`quote-table.tsx`)가 기존 `action` 자리에 행동 버튼 + 오류/안내 한 줄을 넣는다. 위계(1차 vs 3차)는 U2로 화면 재대조 라운드에서. 영향: 05-05 Task 2 · 05-UI-SPEC:106 · 05-02 B4
- **F5** 문서 줄 한도 — `docs/OPERATIONS.md` 300/300 · `docs/ARCHITECTURE.md` 295/300(`test/unit/docs-limits.test.ts` 상한 300). 05-12 Task 2 ④ 「증빙 버킷(Phase 5)」 절 · 05-13 「지출결의 · 증빙 계약」 절(20줄) + §4-8 예외 둘 · 05-03 §4-6 한 줄이 들어갈 자리가 없다. 수리: U3 A. 영향: 05-03 · 05-12 · 05-13

### MEDIUM (P2 — 이 라운드 반영)
- **F6** 04.3이 `lib/gcp/gcs.ts`(`createAuthedRequest` · 주입 가능한 `GcsRequest` · `GcsUnavailableError` · 로그에 키 · 버킷 이름 안 남김)와 저장소 포트 `lib/storage/signature-store.ts`(APP_ENV로 드라이버 선택)를 먼저 만듦(중복 아님 — 서명 URL · move · retain은 없음). 수리: 05-12 read_first에 `lib/gcp/gcs.ts`, gcs 드라이버 호출은 `createAuthedRequest` · `GcsRequest` 주입 재사용. 05-04 ①②에 포트 자리 · `STORAGE_DRIVER` 필요 여부를 한 줄로 정한다(추천: `STORAGE_DRIVER` 유지, 포트는 `lib/storage/` 선례 쪽). 영향: 05-04 · 05-12
- **F7** 버킷 이름 · 부트스트랩 · 배포 · 검증 선례(04.3-05)와 어긋남 — `infra/names.sh` `cert_bucket()` = `{프로젝트}-plant8-{env}-cert-signatures`(전역 유일), 런타임 `objectUser` 바인딩은 `deploy.sh` `ensure_cert_bucket`(부트스트랩은 생성 + 배포자 버킷 admin), `scripts/verify-gcp.sh`는 `INPUT_CHECK` 환경 변수로만 돈다(`--project` 플래그 없음, 입력은 `.github/workflows/verify.yml` choice). `deploy.sh`에 #151 `_ensure_data_key_secret` · #153 `gcloud secrets versions list <name>`. 수리: `evidence_bucket()` = `$2-plant8-$1-evidence`, 런타임 바인딩은 `ensure_evidence_bucket`(deploy), 소프트 삭제 · 버전은 증빙 보존 요구대로(서명 버킷 `--soft-delete-duration=0` 복사 금지), 검증은 새 `INPUT_CHECK=evidence-bucket` + `verify.yml` choice 한 줄(위험 경로 — F9 별도 PR) 또는 Task 3 사람 확인을 gcloud 수동 명령으로. `_ensure_data_key_secret`는 건드리지 않는다. 영향: 05-12
- **F8** 세션 · 테스트 단계 규칙(사용자 결정 2026-10-01, CLAUDE.md §4 Build · §5) — 「세션 하나 = 웨이브 하나」 · 「컨텍스트 50% 넘으면 pause」(config `context_warnings: false`) · 플랜 `<verification>`의 `pnpm test:unit` 전체 · 통합 전체가 낡음. 수리: 05-01 「웨이브 근거」 「여러 세션으로 실행한다」 → 「한 세션에서 웨이브를 이어 가고 자동 압축으로 잇는다, 끊는 때는 독립 검토 경계뿐」, 50% 문장 삭제, 각 플랜 `<verification>`을 「lint · typecheck + 바뀐 파일 관련 단위 · 통합 + 건드린 화면 E2E」로, 전체는 CI(ready). 영향: 05-01 · 05-03 · 05-04 · 05-12 · 각 플랜 execution_notes
- **F9** `risk:` 태그 · 위험 경로 PR 분리 · Post-build 표 — Phase 5 플랜 15개에 `risk:` 0건. 후보: 05-01(마이그레이션 · 결재) · 05-03(마이그레이션 · 돈 · 권한 시드) · 05-04(마이그레이션 · 잠금) · 05-06(세금 · 돈) · 05-08 · 05-09(권한) · 05-11(마이그레이션 · 상태 전환 잠금) · 05-14(동시성 잠금). 수리: frontmatter `risk: [...]`(04.3 형식), 05-01 「웨이브 근거」 아래 「머지 묶음」 한 단락(위험 경로 — `db/migrations/` · `db/schema/` · `domain/permissions/` · `scripts/deploy.sh` · `bootstrap-gcp.sh` · `infra/` · `.github/workflows/` — 변경 PR은 사용자 머지, 위험 경로 변경은 별도 PR, 마이그레이션은 기대는 코드와 같은 묶음), 05-13 Post-build 순서를 새 표대로(돈 · 결재 `/review` + `/cso`, 화면 `/review` + `/design-review` → `/qa`). 묶음 방식이 바뀌면 사용자에게 알린다. 영향: 05-01 · 05-03 · 05-04 · 05-06 · 05-08 · 05-09 · 05-11 · 05-14 · 05-13
- **F10** 새 요구사항 OPS-08(문서 제출 · 승인 · 반려 · 회수를 핵심 행동 로그로, quick 261001-hfi #138)이 Phase 5에 배정됐는데 어느 플랜 `requirements`에도 없음. 동작은 04.1 엔진이 이미 함(`recordActionInTx`). 수리: 05-03(제출) · 05-09(회수 · 다시 제출) · 05-10 또는 05-11(승인 · 반려) `requirements`에 OPS-08, 통합 사례 한 줄(지출결의 네 사건이 `action_log`에 entity = 지출결의로 남음) + VALIDATION 행 후보. 「핵심」= 끌 수 없음인지는 지금 계획대로 04.1 동작(설정으로 고름)을 따르고, 바꿀 필요가 생기면 사용자에게 묻는다. 영향: 05-03 · 05-09 · 05-10/11 · VALIDATION
- **F11** 지급 방식 코드표 — ① 코드표 화면 목록은 `domain/code-tables/index.ts`의 `CODE_TABLES` 하나이고 `createCodeItem`이 목록 밖 `tableKey`를 거부(#148). 수리: 05-03 files_modified `app/(app)/admin/code-tables/page.tsx` → `domain/code-tables/index.ts`(`CODE_TABLES`에 `{ key: "payment_method", label: "지급 방식" }`)(04.6-15와의 겹침도 사라짐). ② MAST-05(Phase 6)로 떼어짐 → U4 A: REQUIREMENTS 추적표 MAST-05 비고 「표와 기본값은 Phase 5, 값 확정 · 관리 화면 점검은 Phase 6」은 이 브랜치가 main을 반영하지 않으므로 실행 세션이 main 반영 뒤 gsd 편집으로 남긴다(05-03 task에 한 줄). 영향: 05-03
- **F12** 이유 자리 칸 이름 구분자 「, 」(04.5 DECISIONS 2026-09-25, 사용자 결정 카드 U2) — 옛 모양 `공급가액 · 증빙 종류 2칸 비어 있음 · 공급가액 적기`(05-06:186) · `종류 · 내용 2칸 비어 있음 · 종류 고르기`(05-07:139) · 05-UI-SPEC.md:265 막힘 ⑥. 수리: 셋을 「, 」로(`공급가액, 증빙 종류 2칸 비어 있음 · 공급가액 적기` 등). 05-05 폼 서버 오류 갈래에 `lib/actions/form-reason.ts`(04.5-08) 규칙 사용 여부 한 줄. 영향: 05-05 · 05-06 · 05-07 · 05-UI-SPEC
- **F13** ① 04.5의 `test/integration/leak-scan.test.ts`는 `skipDbReset()` + `beforeAll(seedMasterData)` 한 번(사례 사이 초기화 없음), `MENU_GATED_DTOS` 축 생김. ② 폼 선택지도 `registerDto`된 투영 DTO(#121 계열). 수리: 05-03 · 04 · 05 · 11의 누수 사례는 「쓰기 없음, 있으면 같은 사례 안에서 `try/finally`로 되돌림」, 정보 항목 없는 새 DTO는 `MENU_GATED_DTOS`에, 05-07 ③에 `PickVendorOptionDto`(`vendor.value`) `registerDto` + 누수 스캔 단언 한 줄. 영향: 05-03 · 05-04 · 05-05 · 05-07 · 05-11

### LOW (P3)
1. **F14** 설정 조회 `asOf` 계약(#126 — 생략 = 서울 오늘, 넘길 때 `seoulDateToUtcDate`) — 05-03 ⑤ `getSettingEntry`에 한 줄. 영향: 05-03
2. **F15** 05-06 read_first(:136) 「`cancelHistorizedValue` 취소는 실제 시계 · 주입 없음」은 틀림 — `seoulToday(deps?.now)` · `withTransaction` · `FutureValueNotFoundError`(registry.ts:229-268). 영향: 05-06
3. **F16** `ConfirmDialog`가 `disabledReason` 끝 ` · 새로 고침`을 스스로 3차 `새로 고침`으로 바꿈(`splitRefreshTail` · `RefreshStep`, #125), 실패 줄 `failure`(04.3-17) — 05-09 무효 처리 확인 · 05-01 Task 4 확인 창은 꼬리를 손으로 자르지 않는다. 영향: 05-01 · 05-09
4. **F17** `Button.nextStep?: ReactNode`(§7-1) — UI-SPEC S6 「1차 비활성 + 왼쪽 이유 + 다음 한 수 3차」는 이 prop으로. 05-05 · 05-06 read_first 한 줄. 영향: 05-05 · 05-06
5. **F18** `QuoteLineDto.vendorName`(all-of) · `quote-table.tsx` +228줄 — 05-05 · 05-15 「거래처 없음」 셀이 숨김 거래처 갈래(이름 null)와 겹치지 않는지 확인. read_first는 grep 방식이라 손볼 것 없음. 영향: 05-05 · 05-15
6. **F19** 줄 번호 참조(SYSTEM §7-5 = 880행, DECISIONS 끝 바뀜) — 절 이름 grep 원칙 유지. 영향: 05-02
7. **F20** `.continue-here.md` BLOCKING CONSTRAINTS의 낡은 문장(「코디네이터 보고 · 세션 교대(코디네이터가 연다)」, 「0017~0020은 #73 · #88이 씀」 — 지금 0021 · 0022 main, 0023 04.5) — `/gsd-pause-work`가 다시 쓴다. 영향: `.continue-here.md`
8. **F21** `seedMasterData`의 시스템 관리자 루프가 새 메뉴를 `upsert`로 모두 켬 — 04.3은 민감 메뉴(`certs.submissions`)를 `insertPermissionIfAbsent`(기본 거짓)로 예외 처리. `expenses.evidence_void`를 같은 예외로 둘지 05-09에 한 줄(기본은 지금 계획 — 루프가 켬). 04.5가 `SEED_HISTORIZED_EFFECTIVE_FROM`을 `domain/settings/keys.ts`로 옮김(05-03 시드가 이력형 키를 쓰면 그 상수 import). 영향: 05-03 · 05-09

## 확인했고 그대로인 전제 (조치 없음)

- 마이그레이션: main 마지막 `0022_cert_intake`, 04.5가 `0023_custom_field_admin`. 계획은 번호를 미리 적지 않음(grep 0) — 05-13 「머지 직전 재생성」 규칙 유지
- 권한 키: `expenses.team` · `expenses.evidence_void`는 main · 04.5 어디에도 없음(05-08 · 05-09가 만든다). 새 키 `certs.*` · `admin.field-definitions`와 겹치지 않음. 정보 항목 `cf.*` · `cert_*`와도 겹치지 않음
- KMS 제거(#151): Phase 5 계획은 KMS · 암호화에 기대지 않음(grep 0)
- 의존성: `@google-cloud/storage` 여전히 없음(05-12 「새 의존성 0」 유지)
- 셸 · 토큰 · stylelint: f3242c8 → b41944d · 8ae0903 변경 0(04.6이 바꿀 예정 — F2)
- Playwright: `cert-setup` · `certs` 프로젝트 · `E2E_SKIP_DESKTOP` 추가, Phase 5 스펙과 충돌 없음
- 착수 게이트 P-1 · P-2 · P-3은 origin/main에서 통과(실행해서 확인)
- context-drift 경고: `05-VALIDATION.md`가 CONTEXT.md보다 오래됨 — 05-01 P-5(`/gsd-validate-phase 5`, 실행 전)가 다시 채운다(절차 그대로)

## Divergent Views

- 없음. U1 · U3 · U4는 카드 답 대기 중이며 추천안으로 반영한다. U2는 화면 재대조 라운드로 미룬다.
