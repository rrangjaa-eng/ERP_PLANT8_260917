---
phase: 07-schedule-notify-audit
plan: 17
subsystem: admin-people
status: complete
tags: [people, lockout, unlock, password-reset, confirm-dialog, pagination, search, sc-11, sc-12, sc-15, risk-permissions]
requires: [07-09, 07-12, claude/07-pr-auth]
provides:
  - "사람 목록 `잠김` · `퇴직` 한 값 · 행 `잠금 풀기` + 표 위 결과 줄"
  - "사람 목록 이름·이메일 검색 · `잠김 N` 끝 링크 · 50명/쪽"
  - "사람 상세 로그인 섹션 · 비밀번호 초기화(ConfirmDialog 결과 단계)"
  - "ConfirmDialog `result` prop(§7-17 결과 단계 개정 7) · HistoryList `canAdd`"
  - "domain `unlockPerson` · `resetPersonPassword` · `listPeoplePage` · `isRetiredOn`"
affects: [07-25]
tech-stack:
  added: []
  patterns: ["null-DTO 일회성 비밀 액션(resetPersonPasswordAction)", "결과 단계는 닫기로만 닫는 모달 단계", "노출표 기준 열 · 검색 · 거르기(T-07-17-03)"]
key-files:
  created:
    - app/(app)/admin/people/unlock-result.tsx
    - test/integration/people-list-page.test.ts
    - test/unit/domain/people-unlock-retired.test.ts
    - test/unit/domain/people-temp-password-result.test.ts
    - test/unit/app/people-reset-password-registry.test.ts
    - test/unit/ui/history-list-can-add.test.ts
    - test/e2e/people-unlock-reset.spec.ts
    - docs/design/checks/2026-10-22-07-17-people-screens.md
  modified:
    - repositories/login-attempts.ts
    - repositories/users.ts
    - domain/people/index.ts
    - app/(app)/admin/people/page.tsx
    - app/(app)/admin/people/person-status.ts
    - app/(app)/admin/people/person-form.tsx
    - app/(app)/admin/people/people.module.css
    - app/(app)/admin/people/actions.ts
    - app/(app)/admin/people/actions.registry.ts
    - app/(app)/admin/people/[id]/page.tsx
    - app/(app)/admin/people/[id]/person-detail-client.tsx
    - app/(app)/admin/people/[id]/leave-section.tsx
    - app/(app)/admin/people/[id]/actions.ts
    - app/(app)/admin/people/[id]/actions.registry.ts
    - ui/confirm-dialog/ConfirmDialog.tsx
    - ui/confirm-dialog/ConfirmDialog.module.css
    - ui/history-list/HistoryList.tsx
    - ui/row-actions/RowActions.tsx
key-decisions:
  - "SC-11 한 값: 퇴직 > 잠김은 한 낱말, 그 밖은 기존 두 배지(D8-07) 유지 — 열린 질문 1"
  - "resetPersonPassword 결과는 TempPasswordResult(DTO 아님 · registerDto 안 함), 액션은 dtoName null"
  - "상세 `로그인 상태` 한 값: 보관됨 > 퇴직 > 잠김 > 임시 비밀번호 사용 중 > 첫 로그인 전 > 정상(플랜 :205 순서)"
  - "상세 잠금 풀기는 목록 `unlockPersonAction`(../actions) 재사용 — [id]/actions.ts에 같은 액션을 두 벌 두지 않음"
duration: "약 115분(원장 기준 10:01 → 11:49 UTC)"
completed: 2026-10-22
plan_head_before: b92afabe8daf66fa8cd84c287d91e81ad426b357
actuals:
  tokens: 43600
  tasks: 3
  commits: 4
---

# Phase 07 Plan 17: 사람 화면 잠금 풀기 · 검색 · 쪽 나눔 · 상세 로그인 섹션 · 비밀번호 초기화 결과 단계 Summary

사람 목록이 로그인 거부와 같은 판정으로 `잠김`을 보이고 그 줄에서 확인 없이 풀며(퇴직자 제외 · 상한 안), 이름·이메일 검색 · `잠김 N` · 50명/쪽으로 서고, 상세는 로그인 섹션에서 잠금 풀기 · 비밀번호 초기화(같은 창 결과 단계 — Esc · 바깥 누름 무시, 값은 클라이언트 상태에만)를 하며, 상한 밖 대상에게는 쓰기 버튼을 그리지 않는다.

## 커밋

| 커밋 | 태스크 | 내용 |
|------|--------|------|
| 9d182d7f | Task 1 (tracer) | 목록 `잠김` · `퇴직` · 행 `잠금 풀기` · 결과 줄 · domain `unlockPerson` · `isRetiredOn` · `listLockedEmails` |
| 10332aba | Task 2 | 검색 · `잠김 N` · 50명/쪽 · EMPTY · N10 ui Select · TextField 이관 · E2E 도우미 `?q=` |
| d031ac6d | Task 3 | 상세 로그인 섹션 · ConfirmDialog 결과 단계 · `resetPersonPassword(Action)` · 상한 밖 쓰기 숨김 |
| 61995d6e | Task 3 보정 | 상세 한 값의 배지 우선을 플랜 :205 순서로 |

## 검증(모두 CI=true 프로덕션 빌드 · 로그 /home/user/wt/logs/07-17/)

- 단위: Task 3 verify 묶음 + 관련 219/219(t3-unit2.log), person-status 17/17, Task 2 관련 88/88(t2-unit-final.log)
- 통합: people-list-page 7/7(t2-int-final.log — 쪽 · 이스케이프 · U2 잠긴 수 · 대소문자 · 정렬 · 열 노출 · T-07-17-03 누수)
- E2E desktop: Task 3 verify 목록(people-unlock-reset · admin-people-detail-link · expense-close · payment-batch · leave-approval) + single-column · people · form-label-section-gap · admin-person-leave 150/150(t3-e2e-1.log), 순서 보정 뒤 people-unlock-reset 14/14(t3-e2e-2.log); Task 2 묶음 녹색(t2-e2e-2/3/4.log)
- E2E mobile-375: mobile-people · mobile-history-list 10/10(t3-e2e-mobile.log)
- 변이 확인: 결과 단계 Esc 무시를 끄면 U1 E2E 빨강(t3-e2e-mutation.log) → 복원 후 녹색. 퇴직 거부를 지우면 단위 빨강(Task 1)
- `pnpm lint` 0 · `pnpm typecheck` 0(t3-lint-final.log · t3-tc-final.log). build는 E2E webServer의 CI=true `next build`가 매 실행 통과
- 위험 경로 빈 차이(:225): `git diff origin/claude/07-pr-auth -- domain/auth domain/permissions db` 0줄 · 브랜치 기준도 0줄
- 수락 grep: Task 2(`listPeoplePage` 2 · `?q=` 2 · `<select` 0/0 · `<input` 0), Task 3(결과 단계 문구 4종 ≥1 · spec `복사됨` 3 · `Escape` 3 · registry 1 · `TempPasswordResultDto` 0)
- `grep -rn "toast" "app/(app)/admin/people/[id]/person-detail-client.tsx"` → 출력 없음(초기화 · 풀기 성공 경로에 토스트 자체가 없음 — 임시 비밀번호는 `tempPassword` 상태 → ConfirmDialog `result`로만)

## 스킬 호출

- `superpowers:test-driven-development` — 구현 전(각 태스크 단위 · 통합 RED 확인 뒤 GREEN)
- `plant8:design-gate` — 화면 파일 전, 점검표 docs/design/checks/2026-10-22-07-17-people-screens.md(모든 항목 [x] · Task 1~3 근거)
- `superpowers:verification-before-completion` — 커밋 ①②③ 전
- `superpowers:systematic-debugging` — E2E 필터가 의존 프로젝트를 통째로 끌어온 실행(1489건) 정지 · 자기 자신을 죽인 pkill 두 번(원인: 패턴이 자기 명령 줄과 일치)

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 2 - 누수] 가린 값으로 검색 · 거르기 · 세기(T-07-17-03)** — Task 2 중 이름 · 이메일 · 잠김을 못 보는 계급에게도 검색 · `locked` 거르기 · 잠긴 수가 그 값에 반응했다. domain `listPeoplePage`가 노출표(visibleKeys)로 검색 대상 · 거르기 · 잠긴 수를 막고 화면은 보이는 칸만 placeholder에 쓴다. 통합 RED 사례 추가. (10332aba)
2. **[Rule 2] 공용 `RowAction` pending에 `aria-busy`** — 공통 계약 10(요청 중 aria-busy · aria-disabled)을 만족하려고 ui/row-actions에 한 줄. (9d182d7f)
3. **[Rule 3] 기존 E2E 선택자** — 목록 쪽 나눔 · 검색으로 행이 마지막 줄이 되거나(mobile-people 아래 선 단언 — 뒤에 설 사람을 하나 더 만들어 유지), N10 이관으로 DOM이 바뀐 자리(single-column · form-label-section-gap · people `div:has(> #person-role-change)` → Form.Field 줄 · `#person-role-change-error`)를 갱신. 단언 뜻은 그대로. single-column `main dl` 2 → 3(로그인 섹션 dl). (10332aba · d031ac6d)
4. **[Rule 3] 단위 시험 경계** — domain 시험이 app 등록을 import하면 eslint boundaries 위반이라 액션 등록 단언을 test/unit/app/people-reset-password-registry.test.ts로 나눔. (d031ac6d)
5. **[Rule 3] HistoryList `canAdd` · LeaveSection `adjustWritable`** — R15 「새 이력 추가 · 연차 조정 추가 렌더 없음」에 공용 HistoryList 읽기 전용 갈래가 없어 prop 하나씩(기본 참 — 기존 호출처 불변, 단위 history-list-can-add RED → GREEN). 플랜 files 목록 밖 ui/history-list/를 점검표 「화면:」에 더함. (d031ac6d)
6. **[Rule 1] 상세 한 값 순서** — 처음 구현이 `첫 로그인 전`을 앞세웠고 플랜 :205는 `임시 비밀번호 사용 중`이 앞이다. 단위 RED → GREEN으로 맞춤. (61995d6e)

### 계획과 다르게 한 것(판단)

- 잠금 풀기 뒤 포커스: 플랜 「같은 행 이름 링크」 — 목록의 이름은 링크가 아니라 같은 행 `상세` 링크로(행이 빠지면 결과 줄). 상세는 남는 `비밀번호 초기화`로.
- 검색칸 라벨은 `검색`, placeholder가 보이는 칸(`이름·이메일`) — 라벨에 「이름」「이메일」을 넣으면 기존 스펙의 `getByLabel("이메일")` 등과 겹친다.
- `[id]/actions.ts`에 `unlockPersonAction`을 다시 만들지 않고 목록 `../actions`의 같은 액션을 쓴다(같은 액션 두 벌 · 등록 이름 충돌 회피).
- 점검표 파일명 날짜는 플랜 frontmatter의 2026-10-21이 아니라 만든 날 2026-10-22.
- E2E RED: Task 1은 webServer 빌드가 단위 시험의 없는 export로 typecheck 실패해 E2E RED를 따로 보지 못했고, Task 3 E2E는 구현 뒤 첫 실행이 녹색이라 변이(Esc 무시 끄기)로 빨강을 확인했다. 단위 · 통합 RED는 태스크마다 관찰.
- SUMMARY 중간 기록(플랜 :151)은 따로 커밋하지 않고 이 최종 SUMMARY에 모았다(한 세션 연속 실행).

## Known Gaps(범위 밖 — 고치지 않음)

- `unlockAccount`(07-09 domain/auth)는 이메일이 정확히 같은 실패 행만 해소한다 — 대소문자가 다른 옛 실패 행은 목록에 `잠김`으로 세지만(부록 ND) 풀어도 남을 수 있다. domain/auth 수정 금지라 PR-AUTH 몫.
- `unlockAccount` 자체와 CLI 경로는 퇴직을 보지 않는다 — 퇴직 거부는 관리자 화면 경로(domain `unlockPerson`)만(PR-AUTH 범위, 플랜 :205).
- R15 서버 쪽: `addLeaveAdjustment` · `assignTeam`(발령 이력 추가)은 상한 판정 없이 `admin.people` 쓰기만 본다 — 이번 플랜은 버튼을 숨길 뿐이고 직접 호출 거부는 로그인 두 행동(`unlockPerson` · `resetPersonPassword`)만 E2E로 확인. 열린 질문 3.

## 07-25 입력

- `resetPersonPasswordAction` = null DTO 비밀 액션 — 최종 누수 스캔 검토 목록에 올릴 것.
- SC-15(N10): 사람 폼 · 상세의 네이티브 select · input 0(소스 grep) — 07-25 최종 0 단언의 이 플랜 몫. 판정은 독립 DOM 감사.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: secret-response | app/(app)/admin/people/[id]/actions.ts | `resetPersonPasswordAction`이 임시 비밀번호를 서버 액션 응답으로 돌려준다(플랜 위협 모델 범위 — 게이트: admin.people 쓰기 · 상한 · 자기 제외, 재검증 응답 · URL · 토스트에 값 없음 E2E 확인) |

## 열린 질문(권장안으로 진행)

1. SC-11 「한 값 규칙」 — (a) 목록 상태도 엄격히 한 값(새 계정의 `첫 로그인 전`이 `임시 비밀번호 사용 중`에 가려짐) / (b) 지금: `퇴직` · `잠김`만 한 낱말, 그 밖은 기존 두 배지(D8-07). 권장 (b). 상세 `로그인 상태`는 플랜 순서대로 한 값.
2. 잠금 풀기 뒤 포커스를 같은 행 `상세`로 둔 것(이름이 링크가 아님) · 검색 라벨 `검색` + placeholder — 권장: 지금대로.
3. 상한 밖 연차 조정 · 발령 이력 추가의 서버 거부 — (a) 후속 플랜에서 domain에 상한 판정 추가 / (b) 숨김만 유지. 권장 (a)(권한 경로라 별도 검토).

## Self-Check: PASSED

- 파일: unlock-result.tsx · people-list-page.test.ts · people-unlock-retired.test.ts · people-temp-password-result.test.ts · people-reset-password-registry.test.ts · history-list-can-add.test.ts · people-unlock-reset.spec.ts · 점검표 — 모두 존재(git ls-files 확인)
- 커밋: 9d182d7f · 10332aba · d031ac6d · 61995d6e — `git rev-list --count b92afabe..HEAD` = 4
