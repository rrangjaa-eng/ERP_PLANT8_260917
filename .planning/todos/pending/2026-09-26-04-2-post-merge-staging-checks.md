---
created: 2026-09-26T18:16:08.960Z
title: 04.2 머지 후 첫 스테이징 배포에서 확인 3건
area: tooling
severity: major
files:
  - .planning/phases/04.2-notify-holidays-foundation/04.2-VERIFICATION.md
  - app/internal/notify-tick/handle.ts
  - lib/email/smtp-sender.ts
  - domain/system-status/index.ts
  - scripts/deploy.sh
---

## Problem

04.2 검증 보고서(human_needed)의 사람 확인 2~4번은 실제 GCP 배포에서만 닫힌다. PR 브랜치에는 Actions 배포 경로가 없어 머지 전에는 확인할 수 없다. 코디네이터가 2026-09-26T17:54Z(PR #73, 결정 1a)에 머지 뒤 첫 스테이징 배포에서 확인하는 운영 점검 항목으로 이월했다.

1. Workspace SMTP 비밀 4개를 넣은 뒤 묶음 메일 1통이 수신된다.
2. 실제 Cloud Scheduler가 `/internal/notify-tick`을 호출해 200이 나오고, 시스템 상태의 마지막 tick 줄이 갱신된다. 토큰 없는 POST는 401이다.
3. `__unset__` 센티널로 배포하면 시스템 상태에 「미설정」이 표시된다.

함께 이월: SC5b 알림함 액션 3개·행 DTO의 leak-scan 레지스트리 등록은 Phase 7 성공 기준 5에서 처리한다(결정 2a).

## Solution

머지 후 첫 스테이징 배포 직후 docs/OPERATIONS.md의 notify-tick·SMTP 진단 절차대로 세 항목을 확인하고, 결과를 이 todo에 기록한 뒤 completed로 옮긴다. 코디네이터가 아침 보고에서 사용자에게 확인을 요청한다.
