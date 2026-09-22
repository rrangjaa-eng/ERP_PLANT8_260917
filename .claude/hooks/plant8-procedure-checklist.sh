#!/usr/bin/env bash
# UserPromptSubmit 훅 — 매 턴 CLAUDE.md의 "건너뛰면 안 되는 것"만 짧게 주입한다.
# CLAUDE.md 전문은 이미 프롬프트 프리픽스에 들어가지만, Phase 3에서 그걸
# 갖고도 Post-build 게이트를 전부 건너뛴 일이 있었다. 문장을 다시 읽히는 게
# 아니라 매 턴 눈앞에 두는 것이 목적이라 체크리스트만 넣는다(토큰 절약).
set -euo pipefail

read -r -d '' CHECKLIST <<'EOF' || true
[CLAUDE.md 절차 체크 — 이번 턴에 해당하는 것만]
1. 절차를 건너뛰지 않는다. 건너뛰는 게 맞다고 판단되면 먼저 말하고 승인받는다.
2. 페이즈/기능이 끝나면 Post-build 넷을 실제로 호출한다: /review → /qa → (인증·권한·암호화·외부 입력을 건드렸으면)/cso → /ship.
3. Superpowers 스킬은 호출한다: 버그·테스트·CI 실패 전 systematic-debugging, "완료" 말하기 전 verification-before-completion, 구현 전 test-driven-development.
4. TDD: 실패 테스트(RED 확인) → 최소 구현 → 리팩터. 실제 실행 확인 없이 "완료" 금지.
5. 로컬 dev 통과는 완료 신호가 아니다 — CI=true로 확인한다.
6. 화면 검증 순서: 싼 게이트(lint·typecheck·build) → 독립 DOM 감사 → 수정 → 전체 게이트 한 번.
7. 서브에이전트는 model을 명시한다. 판단·검토·계획은 Opus 5. Fable 5는 정말 필요한 순간(되돌리기 어려운 결정·Opus 5가 갈리는 문제·명시 요청)에만.
8. 금지: .planning/ 수동 편집 · git push --force · 프로덕션 DB 직접 명령 · CLAUDE.md 임의 수정.
EOF

jq -nc --arg ctx "$CHECKLIST" \
  '{hookSpecificOutput:{hookEventName:"UserPromptSubmit", additionalContext:$ctx}}'
