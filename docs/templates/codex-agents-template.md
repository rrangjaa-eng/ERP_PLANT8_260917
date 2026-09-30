# GPT(Codex 로컬)용 작업 방식 템플릿

`claude-way-of-working.md`의 방식을 Codex에 옮긴 것. 전역 `~/.codex/AGENTS.md`(모든 프로젝트 공통)에 아래 블록을 넣고, 프로젝트 고유 내용은 저장소 루트 `AGENTS.md`에 둔다.

| 층 | Claude | Codex |
|----|--------|-------|
| 규칙 | `CLAUDE.md` + `.claude/rules/` | 전역 `~/.codex/AGENTS.md` + 프로젝트 `AGENTS.md` |
| 절차 도구 | GSD · superpowers · gstack | 같은 스킬(설치돼 있으면 그대로) |
| 강제 장치 | Claude 훅 | git 훅 + GitHub CI + 브랜치 보호(일부만 가능) |
| 운영 | PR 「[지시]」/「[완료 보고]」, `.planning/` 인계 | 그대로 |
| 모델 선택 | 계획·검토 Opus / 실행 Sonnet | 계획·검토 세션 reasoning effort high / 실행 medium |

## 전역 AGENTS.md 블록

```markdown
# 작업 방식 (모든 프로젝트 공통)

## 원칙
- 코딩 전에 생각: 가정은 밝히고, 해석이 여럿이면 제시하고, 모르면 묻는다.
- 단순함: 요청받은 것만. 추측성 코드·추상화·설정 금지.
- 외과적 변경: 필요한 줄만. 요청 없는 리팩터·주석·파일 이동 금지.
- 목표 지향: 성공 기준을 검증 가능한 테스트로 바꾸고 통과할 때까지 반복.

## 워크플로 (건너뛰려면 먼저 묻고 승인받는다)
1. Pre-build: 모호하면 /office-hours → /gsd-new-project 또는 /gsd-plan-phase(coarse)
   → /plan-eng-review 1회(화면 있으면 /plan-design-review 1회). 게이트를 통과한 계획만 실행.
2. Build: /gsd-execute-phase. 세션 하나 = 웨이브 하나. 끝나면 커밋·푸시 → /gsd-pause-work
   → 새 세션에서 /gsd-progress. 상태의 단일 출처는 .planning/.
3. 실행 규율: 구현 전 test-driven-development, 버그·실패 전 systematic-debugging,
   "완료"·커밋 전 verification-before-completion 스킬을 실제로 호출한다.
4. Post-build(PR마다 한 번): /review → /qa(화면이면 /design-review) → 인증·권한·외부입력이면 /cso → /ship → /retro.

## 코딩 규칙
- TDD: 실패 테스트 → 최소 구현 → 리팩터. 실제 실행 확인 없이 "완료" 금지. 완료 판정은 CI.
- 버그: 재현 → 원인 → 수정 → 회귀 테스트. 추측 수정 금지.
- 한 커밋 한 의도. 제목 영어 접두어(feat:/fix:/docs:/chore:), 본문 한국어.
- 새 의존성은 이유 + 승인 후. 시크릿 커밋 금지. `any` 금지.
- git push --force 금지. .planning/ 수동 편집 금지(GSD 명령으로만).

## 화면
- 디자인 시스템 문서(SYSTEM.md) 없이 화면 금지. 새 색·서체·radius 금지(토큰만).
- 화면 검증: lint·typecheck·build → 별도 검토자가 DOM 실측 → 수정 → CI. 스크린샷 육안 판정 금지.

## 머지·운영
- 조건(CI 초록·충돌 없음·게이트 기록) 충족 시에만 머지. 위험 경로(마이그레이션·스키마·인증·권한·배포·에이전트 설정)는 사용자가 직접 머지.
- 지시는 PR 댓글 「[지시]」, 끝나면 「[완료 보고]」 한 줄. 막히면 「[막힘]」.
- 계획·검토 작업은 reasoning effort high, 실행은 medium.
- 응답은 한국어로 짧게. 결과와 다음 행동만.
```

## 강제 장치 (프로젝트마다 한 번, Git Bash)

```bash
mkdir -p .githooks
printf '#!/bin/sh\npnpm lint && pnpm typecheck\n' > .githooks/pre-push
printf '#!/bin/sh\ngit diff --cached --name-only | grep -qx "AGENTS.md" && { echo "AGENTS.md는 사용자가 직접 수정"; exit 1; }; exit 0\n' > .githooks/pre-commit
git config core.hooksPath .githooks
```

GitHub: 브랜치 보호(force push 금지, CI 통과 필수) 켜기.

## Codex에서 강제할 수 없는 것 (규칙으로만 남음)
- 스킬 호출 강제(verification 없이 커밋 불가 등) — Codex는 도구 호출 기록을 훅에 넘기지 않는다. 커밋 기록으로 가끔 점검
- 세션 경계(한 세션 한 웨이브)
- 게이트 로그 자동 기록 — 수동으로
- Claude 훅(`.claude/hooks/*.sh`)을 Codex 설정에 옮기지 않는다: `$CLAUDE_PROJECT_DIR`·Claude 도구 이름·transcript 형식에 의존해 `hook exited with code 1`로 실패한다
