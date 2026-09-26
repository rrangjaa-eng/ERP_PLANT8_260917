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
