#!/usr/bin/env bash
# UserPromptSubmit 훅 — 예약된 "스레드 멈춤 점검" 프롬프트에만 7개 점검 목록을 넣는다.
# 조정(coordinator) 세션이 점검 때마다 일부 항목(PR·한도·현황표·다음 예약)을 빠뜨렸다.
# 사용자 승인(2026-09-25 KST, 「훅 걸어」): 문장으로 기억시키지 않고 점검 턴마다
# 목록을 눈앞에 둔다. 다른 프롬프트에는 아무것도 넣지 않는다(토큰 절약).
set -euo pipefail

prompt="$(jq -r '.prompt // empty' 2>/dev/null || true)"
case "$prompt" in
  *"스레드 멈춤 점검"*) ;;
  *) exit 0 ;;
esac

read -r -d '' CHECKLIST <<'LIST' || true
[스레드 멈춤 점검 — 7개 모두, 빠짐없이]
1. 스레드: 최근 20분에 새 글·이벤트가 없는 스레드는 상태 줄이 "진행 중"이어도 멈춘 것으로 보고 작업자 확인·재시작을 지시한다. 권한·입력 대기(blocked·need_input)와 작업자 끊김은 바로 처리한다. 끝난 스레드는 해결 처리하고, 인계 요청은 새 스레드로 넘긴다. (list_thread_sessions는 next_cursor를 끝까지 따라간다)
2. PR·저장소(Haiku 작업자 한 번에): 열린 PR 최신 커밋 CI, main과 충돌·뒤처짐, 답 없는 리뷰·봇 지적, main 머지 뒤 CI·배포, 스레드가 보고한 커밋이 원격에 실제로 있는지.
3. 한도: 5시간·주간 사용률(못 읽으면 경고·오류만)에 따라 재개·휴식을 정한다.
4. 스킬·Codex: 2번에 1번은 그사이 관문을 끝낸 스레드, 3번에 1번은 전체가 스킬·Codex를 실제로 돌렸는지 Sonnet 작업자로 확인한다.
5. 현황표: 머지·관문 통과·하실 일 변화가 있었으면 현황표(update_status_page)를 갱신한다.
6. Phase 4 인계: Phase 4 실행 스레드가 플랜을 끝냈으면 다음 플랜을 새 스레드로 바로 인계한다.
7. 다음 점검 예약: "스레드 멈춤 점검"을 +20분으로 다시 예약한다.
채팅에는 사용자가 할 일이나 마일스톤만 올린다.
LIST

jq -nc --arg ctx "$CHECKLIST" \
  '{hookSpecificOutput:{hookEventName:"UserPromptSubmit", additionalContext:$ctx}}'
