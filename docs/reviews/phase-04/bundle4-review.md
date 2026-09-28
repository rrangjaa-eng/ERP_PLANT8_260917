# 묶음 ④ /review (PR #85, base origin/main 90465dc, HEAD 726f708)

- 날짜: 2026-09-28 · 세션 08561e2c
- 범위: 90465dc..726f708 코드 전체(84파일, +15,805/−1,039, `.planning/`·`docs/` 제외). 필수 포함 6ea2c77 · 9e286b2 · 3fc1bf6 · 1db3896 · 6711ea9 · c89ab1b
- 검토자(전부 Opus): 전문가 8(testing · maintainability · security · performance · data-migration · api-contract · design · simplification) + Red Team + Claude adversarial. Codex 외부 검토는 CLAUDE.md 금지라 하지 않음
- data-migration: NO FINDINGS(0018만 이 diff, 0016·0017은 main에 이미 있음)
- 위험 경로 포함(`db/migrations/` · `db/schema/` · `domain/permissions/`) → 사용자가 GitHub에서 직접 머지

## 고친다 (PR 범위의 실제 결함 — TDD)

| id | 등급 | 위치 | 문제 | 수정 방향 |
|----|------|------|------|-----------|
| R1 | CRITICAL (red-team + adversarial) | `ui/table/use-clipboard-paste.ts:156` | 선택 칸에 붙여넣은 이름이 같은 이름 옵션 중 첫 번째에 매칭됨. 거래처 이름은 unique가 아님(`db/schema/vendors.ts`) → 리저브 새 줄의 클라이언트·견적 거래처가 조용히 다른 동명 거래처로 저장 | 같은 label이 2개 이상이면 셀 오류(명사형, 예 「같은 이름 여럿 · 목록에서 고르기」), 값(id) 일치는 그대로 |
| R2 | CRITICAL (red-team, /cso 지정 항목) | `app/(app)/pnl/reserves/reserves-table.tsx:554`, `ui/table/use-dirty-storage.ts:20-23`, `ui/logout/use-logout.ts:33` | 저장 안 한 초안(리저브: clientName·amountKrw·balanceKrw·메모 포함 base 행, 견적 초안 금액)이 사용자 구분 없는 localStorage 키에 남고 로그아웃 때 안 지워짐 → 같은 브라우저 다음 사용자가 복원 배너로 앞 사용자 값을 보고 자기 이름으로 저장 | 키에 viewer id 포함 · 로그아웃 성공 시 `quote-ledger:dirty:*` 전부 삭제. 가능하면 base 행에서 가려야 할 값(잔액·이름) 빼고 저장 |
| R3 | INFO 7 (security + adversarial) | `repositories/reserve-entries.ts:156`(listArchivedEntryNames) · `repositories/archive.ts` | 보관함 목록이 reserve.amount 없이 리저브 줄의 날짜·클라이언트명·입출금·건수를 보여 줌 — B-15 「줄·건수·날짜까지(부분 노출 금지)」 위반 | `reserve.amount`(+ pnl view) 없으면 reserve_entry 행을 목록에서 뺌 |
| R4 | INFO 8 (red-team + adversarial) | `reserves-table.tsx:997` | 외화 줄 금액 칸 붙여넣기가 조용히 KRW·환율 1로 바뀜($1,000@1,350 → ₩1,000). 견적 표는 D15 「외화 N줄 원화로」 알림이 있음 | 견적 표와 같은 D15 알림 조각 재사용(같은 동작·같은 문구) |
| R5 | INFO 7 (red-team) | `reserves-table.tsx:971` | 리저브 표 안 복사→붙여넣기가 copyMeta 없이 외부 붙여넣기로 취급 → 잔액(계산) 칸·잠긴 클라이언트 칸에 오류 셀, 저장 막힘 | reserves `<Table>`에 copyMeta(APP_CLIPBOARD_FORMAT, 줄별 통화) 전달 |
| R6 | INFO 7 (red-team) | `reserves-table.tsx:159` | 화면 원화 환산이 `Math.round(amount*fxRate)` — 서버 `toKrw`(정수 스케일)와 1원 어긋남(0.35×1350) | 같은 순수 `toKrw` 사용(클라이언트 안전 모듈) |
| R7 | INFO 6 (red-team + adversarial) | `domain/settings/export.ts:127-139` | 설정 가져오기가 순번 시작값 낮춤 가드(잠금+비교)를 건너뜀 → 발급 뒤 낮추면 이후 등록이 UNIQUE 충돌 | seqStart 키를 같은 잠금·비교 가드로 보냄(document-numbering에서 가드 export) |
| R8 | INFO 5 (security + adversarial) | `app/(app)/pnl/reserves/actions.ts:33` | rows·archivedIds 상한 없음 → 큰 요청이 거래처 행 잠금을 오래 잡음 | `.max(N)` — 기존 줄 상한 상수가 있으면 그것 |
| R9 | INFO 5 (adversarial) | `domain/reserves/index.ts` planBatch archivedIds | 보관(삭제)에 version 비교 없음 → 낡은 탭·복원 초안이 방금 수정된 줄을 보관(lost update) | archive도 `{id, version}` 보내고 stored.version 비교, 불일치면 VERSION_CONFLICT |
| R10 | INFO 5 (red-team) | `repositories/reserve-entries.ts:17` lockReserveClients | 보관·숨김 거래처도 새 리저브 줄 클라이언트로 받음 | 새 줄은 archivedAt·hidden 거래처를 CLIENT_NOT_FOUND로 거부 |
| R11 | INFO 7 (maintainability + api-contract) | `domain/document-numbering/index.ts:99-124` | allocateDocumentNumber가 `input.format.seqStart`를 조용히 무시(잠금 안 재조회)하는데 타입·주석은 쓰는 것처럼 보임 · 미등록 counterKey면 throw(전제 미기재) | 입력 타입 `Omit<DocumentNumberFormat,"seqStart">`, 주석에 「counterKey는 DOCUMENT_NUMBER_FORMAT_DEFS 등록 필수」 |
| R12 | INFO 5 (api-contract) | `reserves-table.tsx:185` | archivedIds 검증 오류가 일반 문구로만 나오고 줄 표시 없음 | archivedIds 오류를 해당 줄 ENTRY_NOT_FOUND 셀로 매핑 |
| R13 | INFO 7 (maintainability) | `ui/table/Table.tsx:523` | 복사 MIME 문자열 하드코딩 — 읽는 쪽은 `APP_CLIPBOARD_FORMAT` | 상수 import |
| R14 | INFO 6 (design) | `app/(app)/pnl/reserves/reserves.module.css:128` | `.restoreAction` 폰 44px 규칙 없음(견적 원장 S18은 있음) | `@media (max-width: 699.98px) { min-height: var(--touch-min) }` |
| R15 | INFO 8 (design) | `reserves.module.css:102` | `.batchErrorLink` 1px·2px 하드코딩 | `--line-w` · `--underline-offset` · `--line-w-strong` |
| T1 | INFO 8 (testing) | `domain/reserves/index.ts:358,451` | 버전 충돌·응답 유실 재전송 경로 테스트 없음(돈 원장) | 통합: 낡은 version 거부·DB 불변 / 같은 편집 재전송 no-op / 다른 값 재전송 충돌 |
| T2 | INFO 6 (testing) | `app/(app)/admin/settings/actions.ts:31` | 순번 시작값 거부 문구가 화면 경로로 검증 안 됨 | settings E2E: 50 입력 → 「순번 시작값은 현재 값(100)보다 낮출 수 없음」, 값 100 유지 |
| T3 | INFO 5 (testing) | `domain/document-numbering/index.ts:149` | setSimpleSettingValue 잘못된 값 → setSettingValue 폴스루 미검증 | it.each(["0","-5","abc","1.5"]) 거부·SeqStartOverlapError 아님·값 100 |
| T4 | INFO 5 (testing) | `lib/format-number.ts:232`(6ea2c77) | 쉼표 여러 개·음수 경우 미검증 | 단위: `1,234,567` 둘째 쉼표 뒤 Backspace · `-1,234` |

## 기록만 (고치지 않음 — 이유)

- 성능(performance, 확신 4~6): 리저브 writePlan 줄별 왕복 · listReserves 전체 읽기 · 프로젝트 목록 aggregate→listPage 순차 · Table 렌더마다 전체 스캔 — 사용자 30명·현재 데이터 규모에서 결함 아님. 데이터가 커지면 재검토
- 여러 탭 초안 덮어쓰기(red-team 5): 설계 선택 — 탭 id 키·storage 이벤트는 별도 과제
- 연결 프로젝트가 보관·범위 밖이어도 리저브 연결 가능(adversarial 4) · 금액 편집기 잘못된 입력 시 옛 값으로 조용히 되돌림(4) · forward-Delete가 쉼표 앞 숫자 지움(4, 6ea2c77 이전부터) · 연말 자정 경합(4, 조사 항목) — 확신 4 이하(부록)
- clientName을 reserve.amount만으로 보이는지, vendor.value도 요구할지(adversarial 4, INVESTIGATE) — 사용자 결정 필요 시 올림
- 참고(simplification, ADVISORY 5건): isListDate 중복 · ReserveWriteDeps 미사용 주입 4개 · FxRateEditInput 중복 · readSourceKinds 이중 파싱 · onSelectAll 미사용 — 선택 사항, 이번엔 안 함

## 진행 상태 (세션 08561e2c, 중간 저장 — 세션이 끊기면 여기서 이어받기)

- 사전: quick 260928-85f(04-51 거부 문구 현재 값 기준) 6711ea9 RED → c89ab1b → 726f708 문서. DR-P4-02 WINDOWS id 37 waived(04.6 이관)
- /review 수정 A(보안·데이터, Opus): R2 3f60856→46dc3e4 · R3 bdf8c8e→a551fe0 · R7 69c906a→4ce181d · R8 bc20ab8→7983d11 · R9 f9ee722→4a5775e · R10 73dbac1→bfdfb67 · R11 9651b5b→8c14806 · T1 a6410e5 · T3 e535bf0. 오케스트레이터가 수정 전 코드로 RED 재현·GREEN 재확인(6건). **편차:** 커밋 17개 중 verification은 첫 커밋 직전·마지막만 호출 · R2의 base 행 잔액·이름 제거 미실시(복원 테스트 없음) · T3 "0"은 스키마 min(0)이라 거부가 아닌 낮춤 처리 — 04-05 SUMMARY 「0/음수 거부」와 불일치, 결정 필요 시 올림
- /review 수정 B(붙여넣기·돈·화면, Opus): R1 f733131→e3d09a7 · R4 b3f7cef→fc76ea2 · R5 c4f5cff→b83c41c · R6 1abe5a7→2bca228 · R12 e2dca2b→405b265 · R13 ec7acb8→411316d · R14 8f48d50→445ba9f · R15 e2c3e4c→930ab8f · T2 b6a5720 · T4 a83cadb. verification 커밋마다 호출 확인(transcript 대조). 단위 RED 재현 5건
- 독립 DOM 감사(Opus, CI=true 프로덕션 빌드, 1280·1024·700·375): 전 항목 PASS, FAIL 0
- /review 결과 기록(gstack-review-log) 완료. 게이트 줄은 훅이 자동 추가 → 되돌림, 마지막에 한 번에 넣기로 함(사용자 「판단해서 넣어」):
  - `review 2026-09-28T06:06Z session=08561e2c-13e6-5d2d-a96f-e47c2d2a364d`
  - `qa 2026-09-28T07:35Z session=08561e2c-13e6-5d2d-a96f-e47c2d2a364d`
- 남은 순서: /qa(진행 중, 결과 docs/reviews/phase-04/bundle4-qa.md) → /cso(별도 worktree, 지정 항목: 로그아웃 뒤 localStorage 잔존 = R2로 수정됨 재확인, 리저브 clientName 노출 = R3 + vendor.value 여부 조사) → 게이트 줄 3개 추가 → 푸시·CI → PR #85 「[완료 보고]」 → /gsd-pause-work → 다음 세션

## 인계 (2026-09-28 08:2x UTC — 이 계정 주간 한도 소진, 다른 계정이 이어받기)

- 멈춘 곳: **/qa 도중.** 기준 보고서 `docs/reviews/phase-04/bundle4-qa.md`(381f1df), 수정 1건 ISSUE-003 49568f7(쉼표 앞 Delete가 다음 숫자를 지움). 다음 수정 진행 중이던 미완성 변경(`ui/table/Table.tsx`, `test/e2e/reserves.spec.ts`)은 검증 전이라 커밋하지 않고 `docs/reviews/phase-04/qa-wip.patch`로만 보관 — 참고용, 그대로 적용하지 말고 bundle4-qa.md의 이슈 목록에서 다시 TDD로
- 이어서 할 일(새 계정, 그 계정의 plant8 환경에서 브랜치 `claude/gsd-progress-e1nzgu`로 세션 열고 `/gsd-progress`):
  1. PR #85 최신 「[지시]」 확인(마지막 본 댓글 5864259502)
  2. `/qa` 재개: bundle4-qa.md의 남은 이슈 수정(TDD, 커밋마다 직전 verification-before-completion, 커밋마다 푸시) → 최종 재점검 → 보고서 완성
  3. `/cso`(별도 worktree): 로그아웃 뒤 localStorage 잔존(R2로 수정됨 — 재확인), 리저브 clientName 노출(R3 수정됨 + vendor.value 요구 여부 조사)
  4. 게이트 줄 추가(`.claude/gates/phase-04.log`, 시간순): 위 review·qa 줄 + /cso 줄 — 사용자가 「판단해서 넣어」로 위임함
  5. 푸시 → CI 초록 → PR #85 「[완료 보고]」 → `/gsd-pause-work`(HANDOFF open_questions의 04-51 문구 항목을 decisions로 이동 — 지시 5864259502)
  6. 그다음 단위: `/ship`(PR ready·전체 CI) → 사용자 직접 머지(위험 경로) → 스테이징 (C)(D) 사람 확인 → `/gsd-verify-work 4` → id 71(DECISIONS.md 결정 ② (b) 갱신, design-gate) → Phase 04.6
- 열린 결정: 순번 시작값 "0" 허용 여부(T3 참고) · 리저브 clientName에 vendor.value 요구 여부
- 이 세션은 `.planning/.continue-here.md`를 갱신하지 못했다(한도). 새 세션은 이 절을 기준으로 삼고, `.planning/phases/04-project-quote-ledger/.continue-here.md`의 BLOCKING CONSTRAINTS·Anti-Patterns는 그대로 적용
