# Phase 3 검토 묶음 — 권한·설정·마스터

> `/gsd-execute-phase 3` 실행 중 웨이브마다 이 파일에 누적한다.
> 사람이 볼 것: 각 웨이브의 커밋 SHA · 게이트 결과 · 새 화면 스크린샷 ·
> 계획이 열어둔 것 중 실행자가 판단한 것 · 브라우저 QA에서 사람 판단이 필요한 항목.

## 실행 조건

- 브랜치: `claude/gsd-execute-phase-3-uofrn0`
- 격리: `none` (worktree fork base 미해결 → 메인 워킹트리 순차 실행, GSD #683)
- 웨이브: 7개, 각 웨이브 1개 플랜, 전부 직렬 의존 (03-01 → … → 03-07)
- 체크포인트 4건(03-01·03-04·03-06·03-07 Task 1): 전부 **A** 확정
  (근거: `.planning/todos/pending/2026-09-20-phase-3-checkpoint-answers.md`)
- 스크린샷: PC 1440×900 · 모바일 375×812, `screens/wave-N/`

## 웨이브 요약

| 웨이브 | 플랜 | 상태 | 커밋 | lint | typecheck | unit | integration | e2e |
|---|---|---|---|---|---|---|---|---|
| 1 | 03-01 | ✓ 완료 | `53e26a9` | ✓ | ✓ | ✓ 347 | ✓ 48 | ✓ 59 |
| 2 | 03-02 | ○ 대기 | — | — | — | — | — | — |
| 3 | 03-03 | ○ 대기 | — | — | — | — | — | — |
| 4 | 03-04 | ○ 대기 | — | — | — | — | — | — |
| 5 | 03-05 | ○ 대기 | — | — | — | — | — | — |
| 6 | 03-06 | ○ 대기 | — | — | — | — | — | — |
| 7 | 03-07 | ○ 대기 | — | — | — | — | — | — |

---

## 웨이브 1 — 03-01 트레이서 (권한 판정 4함수·행동 로그·보관함·코드표)

**소요 52.8분** · 요구사항 ADMN-01, ADMN-02, ADMN-08, ADMN-12, MAST-04, OPS-05

### 커밋

| SHA | 내용 |
|---|---|
| `b69333d` | docs(03-01): Task 1 계급·권한 모델 결정 기록(옵션 A) |
| `2badaf0` | feat(03-01): 권한 판정 4함수·행동 로그·보관함·코드표 트레이서 배선 (41 파일) |
| `6ce4d57` | feat(03-01): 마이그레이션 0003/0004 적용 + 통합·E2E로 트레이서 증명 (12 파일) |
| `53e26a9` | docs(03-01): complete 트레이서 plan (SUMMARY.md) |

### 게이트

| 게이트 | 결과 |
|---|---|
| `pnpm lint` | ✓ PASS |
| `pnpm typecheck` | ✓ PASS |
| `pnpm lint:sql` | ✓ PASS — 5개 파일 0 issues |
| `pnpm build` | ✓ PASS — `/admin/code-tables` 라우트 생성 |
| `pnpm test:unit` | ✓ PASS — 37 파일 / 347 테스트 |
| `pnpm test:integration` | ✓ PASS — 11 파일 / 48 테스트 (roles·code-tables·action-log 20건 신규) |
| `pnpm test:e2e` | ✓ PASS — 59 테스트 (3회차 전체 실행에서 exit 0) |

오케스트레이터 독립 확인: 작업트리 깨끗 · `.squawk.toml` 무변경 · 테스트에 `.skip`/`.only`/`xit` 추가 0건.

### 체크포인트

Task 1(계급·권한 모델, `gate="blocking"`)은 사전 확정된 **옵션 A**로 기록하고 멈추지 않았다. 다섯 항목 전부 계획서 원문대로: 계급 식별자 5종 고정 · `roles` 순위 컬럼 없음 · 관리자 불리언 컬럼 유지 · 백필 관리자→`role-sysadmin`/나머지→`role-pm` · `archived_by` FK 없음.

### 계획이 열어둔 것 중 실행자가 판단한 것

1. **`users.role_id` FK를 마이그레이션 2개로 쪼갬** — `0003`이 `NOT VALID`로 추가하고 신규 `0004_users_role_id_validate.sql`이 별도 트랜잭션에서 `VALIDATE CONSTRAINT`. squawk가 이 FK만 `constraint-missing-not-valid`/`adding-foreign-key-constraint`로 잡았다(나머지 3개 FK는 같은 마이그레이션에서 새로 만드는 표에 붙어 통과, 이건 기존 `users` 표에 붙는다). 03-RESEARCH의 squawk 실측이 이 경우를 안 덮었다. **`.squawk.toml` 예외를 늘리지 않고** 해결했다 — 체크포인트 ③의 취지 유지
2. **`action_log.seq`를 `bigserial` → identity 컬럼**(`generatedByDefaultAsIdentity()`) — squawk `prefer-identity`. 역시 예외 추가 없이 해결
3. **`test/e2e/global-setup.ts`에 `seedMasterData` 호출 추가** (계획 파일 목록 밖) — 없으면 E2E 픽스처의 권한표가 비어 모든 메뉴 검사가 fail-closed로 떨어진다
4. `CODE_ITEM_DTO_SPEC`의 필드→정보항목 매핑
5. `scopeFor`의 지역 `ENTITY_MENUS` 레지스트리
6. `setCodeItemActive`가 `recordAction`을 부르지 않음 — 대응하는 `CORE_ACTION_TYPE`이 없다
7. `recordAction`이 설정 의존성 미배선 상태에서 fail-open 기본값

1·2는 되돌릴 수 없는 결정에 가까우니 사람이 한 번 봐주면 좋다 — 둘 다 "영구 lint 완화를 새로 만들지 않는다"는 체크포인트 ③ 판단과 같은 방향이다.

### 사람 판단이 필요한 항목 (docs/qa/PHASE-03-BROWSER-QA.md §3 코드표)

- [ ] 항목 추가·수정·비활성화가 화면에서 된다 (MAST-04)
- [ ] 비활성화한 항목이 다른 화면 선택 목록에서 사라지고, 기존 참조는 깨지지 않는다
- [ ] 증빙 종류에 세금 규칙 필드가 붙는다

### 알려진 불안정

`test/e2e/keyboard-nav.spec.ts`의 비밀번호 변경 테스트가 워커 2개 병렬 부하에서 2회 흔들리고 3회차에 통과했다. 이 플랜이 건드린 파일이 아니고(2026-09-19 이후 무변경) 단독 실행에서는 안정적이다 — **기존 불안정**으로 판단해 범위 밖으로 두었다. 재발하면 그때 잡는다.

### 스크린샷

`screens/wave-1/` — `screens/wave-1/` — `code-tables-pc.png`(1440×900) · `code-tables-375.png` · `system-status-pc.png` · `system-status-375.png`. 네 장 모두 POPULATED(코드표 6행, 시스템 상태는 로컬 dev라 GCP 필드가 "확인 불가" — 문서화된 정상 동작).

촬영 아티팩트로 보이는 것 2건 — 실브라우저에서 한 번 확인 필요:
- `code-tables-375.png`에 빨간 "1 Issue" 배지가 표 위에 겹침 → Next.js dev 인디케이터로 보임(실사용 화면엔 없을 것)
- `code-tables-375.png`의 fullPage 캡처에서 모바일 하단 네비가 표 중간에 한 번 더 렌더됨 → `position:fixed` 요소의 Playwright 스티칭 아티팩트로 보임

---
