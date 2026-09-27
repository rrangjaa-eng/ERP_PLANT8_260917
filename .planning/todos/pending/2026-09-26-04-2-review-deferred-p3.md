---
created: 2026-09-26T18:25:00.000Z
title: 04.2 /review 이월 P3 6건
area: general
severity: minor
files:
  - app/(app)/admin/holidays/delete-undo.tsx:51
  - app/(app)/admin/holidays/delete-holiday.tsx:49
  - ui/shell/unread-count.tsx:75
  - repositories/notifications.ts:203
  - repositories/notifications.ts:336
  - domain/notify/tick.ts:85
---

## Problem

2026-09-26 /review(Opus 검토자 3명, Codex 대체)에서 P3로 분류하고 이 PR에서 고치지 않은 항목이다. 모두 현재 사용 규모(30명), Cloud SQL 기본 설정, 현재 날짜 범위에서는 재현되지 않는다.

1. 삭제 되돌리기 칸이 하나뿐이라, A를 지운 뒤 B를 지우면 A의 되돌리기 줄이 조용히 사라진다(delete-undo.tsx:51). 설계 선택이지만 데이터 손실과 가깝다.
2. 자정(KST)이 지나 삭제할 수 없게 된 공휴일을 지우면 「삭제 실패 · 다시 시도」가 뜨는데, 다시 해도 성공할 수 없다(delete-holiday.tsx:49).
3. 화면을 이동할 때마다 안 읽음 수를 새로 받는다(POST 1회 + COUNT 1회, unread-count.tsx:75). 직후의 사용자 액션이 그 뒤로 줄을 선다.
4. `read_at`(timestamp)을 세션 TimeZone 기준 `now()`로 채운다(notifications.ts:203). DB 세션 TZ가 UTC가 아니면 안 읽음 표시가 사라진다. Cloud SQL 기본값은 UTC다.
5. 수동 tick이 겹치면 email claim이 lock_timeout 5s에 걸려 500을 낸다(notifications.ts:336). 행은 pending으로 남아 데이터 손실은 없다.
6. 2036-01-01부터는 음력 표(마지막 2035년)가 없어 tick이 500을 낸다(tick.ts:85). tick-stale 경보가 잡는다.
- 함께: 04.2-12의 300ms 진행 바는 앱 전체에 없는 공용 컴포넌트라 별도 결정이 필요하다.

## Solution

1은 「N건 삭제됨」으로 마지막 건만 되돌리기, 2는 서버 오류 문구 표시 또는 새로고침, 3은 30초 안이면 건너뛰기, 4는 `SET read_at = opened.at AT TIME ZONE 'UTC'`, 5는 55P03을 잡아 null 반환 뒤 finish, 6은 2034년부터 경고 로그와 음력 표 연장. 각 항목은 TDD로 한 커밋씩 처리한다.

## /qa 이월 (2026-09-26, health 99)

- ISSUE-002 [low] 잠금이 걸리는 N번째 시도에도 「이메일 또는 비밀번호 오류」가 뜨고, 잠금 문구는 N+1번째 시도부터 보인다(domain/auth/hooks.ts:66-69, before 훅에서만 잠금 확인). 해법: recordLoginFailure가 locked:true를 돌려주면 그 응답을 lockedMessage(windowMinutes) 403으로 바꾸기. 04.2 이전부터 있던 동작이다.
- /notifications loading.tsx 스켈레톤의 「시각」 th에 styles.time이 없어 로드 뒤 머리글이 옮겨질 수 있다(코드 판독만, 실측 불가 — 알림함 링크가 전체 페이지 이동이라 스켈레톤이 보이지 않았다).

## /cso 이월 (2026-09-26, run 1790449069493-67ca82919885b7dd, partial)

- F1 [low, medium confidence] 로그인 잠금 확인-후-실행 경쟁: `domain/auth/hooks.ts` before 훅이 잠금 없이 `countOpenFailures`를 읽고 실패는 after에서만 기록해, 같은 이메일로 동시에 들어온 틀린 비밀번호 N건이 모두 검사된다(창당 임계보다 많은 추측). IP별 rateLimit(로그인 10회/60초)이 버스트를 막지만 여러 IP로 분산하면 우회된다. main(1dcfd6a)에도 같은 패턴이 있어 04.2가 만든 문제는 아니다. 해법: before에서 이메일별 advisory lock + 실패 수 확인 + 대기 실패 행 삽입을 한 트랜잭션으로, after에서 그 행을 성공·실패로 확정. 임계+k 병렬 로그인 회귀 테스트. 수정 뒤 `gstack-cso recheck 36e4b8bb0cfa83b51df42b5ad71f5680`.
- 의존성: `pnpm audit --prod` 결과 nodemailer 10.0.10 취약점 없음. esbuild <=0.24.2 moderate(GHSA-67mh-4wv8-2f99, better-auth>drizzle-kit 경로, 개발 서버 한정)는 기존부터 있던 것이다.
- 미평가: 비밀 이력 스캔(헬퍼 history 출력 한도 초과), gitleaks·OSV 스캐너(프록시 403), `.claude/` 스킬 공급망(스냅샷 제외).

## /design-review 재실측 이월 (2026-09-26, A-)

- [low] 공용 `ui/list-empty/ListEmpty.module.css` `.secondary`(오류 화면 「다시 시도」)가 폰에서 69×40px — 옆 `.tertiary`와 달리 700px 미만 44px 규칙이 없다. 04.2 이전부터 있던 공용 컴포넌트 문제로, 오류 상태를 강제로 띄운 재실측에서 처음 측정됐다. 해법: `.secondary`에도 폰 `min-height: var(--touch-min)` 규칙 추가.
