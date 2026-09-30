#!/usr/bin/env bash
# UserPromptSubmit 훅 — 매 턴 CLAUDE.md 중 "훅이 기계로 막지 못하는 것"만 짧게 넣는다.
# 스킬 순서·커밋 전 스킬·게이트 기록·머지 정책·세션 경계는 skill-gate·rule-guard·
# session-boundary가 막으므로 여기 되풀이하지 않는다(2026-09-27: 10줄 → 4줄, 토큰 절약).
set -euo pipefail

read -r -d '' CHECKLIST <<'EOF' || true
[CLAUDE.md 체크 — 훅이 못 막는 것만]
1. 절차를 건너뛰거나 바꾸려면 먼저 말하고 승인받는다. 조용히 생략하거나 즉석 방법으로 대체하지 않는다.
2. 완료 판정은 CI=true — 로컬은 lint·typecheck·build·단위·통합 + 건드린 화면의 E2E 스펙만, 전체 E2E는 CI가 한 번 돈다. 실제 실행 확인 없이 "완료" 금지.
3. 화면: 싼 게이트 → 독립 DOM 감사(별도 에이전트, CI=true 실측) → 수정 → 전체 게이트 한 번. 스크린샷 육안 판정 금지.
4. 모델: 계획·판단·검토 Opus, 실행자는 Sonnet 기본(돈·권한·DB 잠금·마이그레이션 플랜만 Opus), Fable은 페이즈 최종 전체 검토·되돌리기 어려운 결정·명시 요청에만. 서브에이전트는 model을 명시한다.
EOF

jq -nc --arg ctx "$CHECKLIST" \
  '{hookSpecificOutput:{hookEventName:"UserPromptSubmit", additionalContext:$ctx}}'
