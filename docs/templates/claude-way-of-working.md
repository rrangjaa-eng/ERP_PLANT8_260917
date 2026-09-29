# Claude 작업 방식 템플릿 (PLANT8 ERP에서 추출)

새 프로젝트에 이 방식을 그대로 쓰기 위한 템플릿이다. 네 겹으로 되어 있다.

| 층 | 무엇 | 이 저장소의 원본 |
|----|------|------------------|
| ① 규칙 | 에이전트가 매 세션 읽는 규칙 | `CLAUDE.md`, `.claude/rules/*.md` |
| ② 절차 도구 | 계획·실행·검증 스킬 | GSD(`.claude/gsd-core/`), superpowers(`.claude/skills/`, 벤더링), gstack(`scripts/install-gstack.sh`로 설치), 프로젝트 스킬 `design-gate` |
| ③ 강제 장치 | 규칙을 어기면 도구 호출을 막는 훅 | `.claude/settings.json` + `.claude/hooks/plant8-*.sh` |
| ④ 운영 | 사람·세션 사이 지시와 인계 | PR 댓글 「[지시]」「[완료 보고]」「[막힘]」, `.planning/` 인계 파일, 클라우드 환경 |

---

## ① CLAUDE.md 템플릿

`{중괄호}`만 프로젝트에 맞게 채운다. 나머지는 그대로 둔다.

```markdown
## 0. 이 파일에 대해
> 프롬프트 캐시 프리픽스에 들어가는 파일. 바뀌면 캐시가 깨진다.
> 여기엔 "몇 달 뒤에도 그대로인 것"만. 진행 상황·날짜·TODO는 GSD `.planning/`에.
- 이 파일과 @import 대상은 세션 중 수정 금지. 수정은 세션 끝에 몰아서.
- 자주 바뀌는 파일(`.planning/*`, 로그)은 @import 금지 — 필요 시 Read.

## 1. 프로젝트
- 이름 / 한 줄 설명: {이름 — 무엇을 누구를 위해}
- 스택: {프레임워크 · 언어 · 계층 구조 · DB · 배포}
- 패키지 매니저: {pnpm} (다른 것 금지)
- 명령: dev `{..}` · test `{..}` · lint `{..}` · build `{..}`
- 구조: `docs/ARCHITECTURE.md` · 디자인: `docs/DESIGN.md` — 필요할 때 Read (import 금지)

## 2. 금지 한눈에
- `.planning/` 수동 편집 · `git push --force` · 프로덕션 DB 직접 명령 · 이 파일에 진행 상황 추가
- 승인 없이 절차 건너뛰기·즉석 방법으로 대체 · `/review` 통과 없이 ship
- 실제 실행 확인 없이 "완료" · 추측 수정 · 승인 없는 새 의존성
- 시크릿을 코드·커밋에 · `any` · 요청받지 않은 리팩터·주석·파일 이동
- 디자인 시스템 문서 없이 화면 만들기 · 새 색·서체·radius 생성 · 스크린샷 육안 판정
- 위험 경로({마이그레이션·스키마·인증·권한·암호화·배포·.claude/·이 파일}) PR을 세션이 머지

## 3. 작업 원칙
### 3.1 코딩 전에 생각하라 — 가정은 밝히고, 해석이 여럿이면 제시하고, 불명확하면 멈추고 묻는다.
### 3.2 단순함이 먼저다 — 요청받은 것만. 추측성 코드·한 번 쓰는 추상화·요청 없는 설정 가능성 금지.
### 3.3 외과적으로 변경하라 — 필요한 줄만. 주변 개선·리팩터 금지. 내 변경으로 생긴 고아만 치운다.
### 3.4 목표 지향 실행 — 작업을 검증 가능한 목표(테스트)로 바꾸고, 여러 단계면 「단계 → 검증」 계획을 먼저 쓴다.

## 4. 워크플로: Pre-build(gstack) → Build(GSD+Superpowers) → Post-build(gstack)
**[Pre-build]** 1) 모호하면 `/office-hours` 2) `/gsd-new-project` 또는 `/gsd-plan-phase` — 플랜은 크게(`granularity: coarse`) 3) 계획 게이트: `/plan-eng-review` 1회(UI면 `/plan-design-review` 1회), 재검토 최대 1회. `/plan-ceo-review`는 마일스톤 수준에서만 4) UI면 `docs/DESIGN.md` — 시스템 문서가 없으면 먼저 만든다
**[Build]** `/gsd-execute-phase`. 상태의 단일 출처는 `.planning/`. **세션 하나 = 웨이브 하나** → 커밋·푸시 → `/gsd-pause-work` → 새 세션 `/gsd-progress`. 실행자는 Sonnet 기본, 돈·권한·DB 잠금·마이그레이션(`risk:` 태그)만 Opus 실행자 + Opus 독립 검토. 스킬은 **호출**한다: `test-driven-development`(구현 전) · `systematic-debugging`(실패 전) · `verification-before-completion`(완료·커밋 전). 서브에이전트 프롬프트에도 명시
**[Post-build] (PR마다 한 번, 건너뛰지 않는다)** `/review` → `/qa`(UI면 `/design-review`) → 인증·권한·외부 입력이면 `/cso` → `/ship` → 머지 → `/retro`
**머지:** PR ready · 최신 커밋 CI 초록 · 충돌 없음 · 게이트 기록 · 「머지 보류」 없음이면 세션이 머지. 위험 경로 PR은 사용자가 직접 머지
**공통:** 절차를 건너뛰려면 먼저 말하고 승인받는다. 사소한 변경(한 파일 안)만 절차 없이

## 5. 코딩 규칙
- TDD: 실패 테스트 → 최소 구현 → 리팩터. 로컬 통과는 완료 신호가 아니다 — 완료 판정은 CI
- 버그: 재현 → 원인 → 수정 → 회귀 테스트
- 한 커밋 한 의도. 제목 영어 접두어(docs:/feat:/fix:/chore:), 본문 한국어
- 새 의존성은 이유 한 줄 + 승인 후

## 6. 프론트엔드
- 모든 화면의 기준은 `docs/design/SYSTEM.md`. 토큰은 `tokens.css`에서만. 이탈은 `DECISIONS.md` 기록 뒤 SYSTEM.md 수정
- 화면 검증: 싼 게이트(lint·typecheck·build) → 독립 DOM 감사(별도 에이전트, CI 모드 실측) → 수정 → CI

## 7. 화면 사용성 원칙
- 문구 없이 다음 행동으로 이끈다: 안내 문구 최소(오류·되돌릴 수 없는 일에만, 명사형), 사용자 결정 최소(기본값·계산은 시스템·불가 선택지는 숨김), 주 버튼 하나·키보드만으로 가능

## 8. 캐시·컨텍스트·모델 선택
- 조사·탐색·긴 로그는 서브에이전트에 위임, 결론만 받는다
- 계획·판단·검토는 Opus, 실행은 Sonnet(→ Haiku). 되돌리기 어려운 결정만 최상위 모델. 서브에이전트는 `model` 명시
- Grep으로 위치 찾고 필요한 범위만 Read. 테스트·빌드 출력은 요약만
- 반복 규칙은 문장이 아니라 hooks로. 응답은 짧게 — 결과와 다음 행동만

## 세션 자율 운영
- 지시는 사용자 채팅 또는 PR 댓글 「[지시]」. 작업 시작·푸시·보고 직전마다 최신 「[지시]」를 읽는다. 끝나면 「[완료 보고]」 한 줄, 막히면 「[막힘]」
- 새 세션은 {프로젝트 전용 클라우드 환경}에서만 만든다(시크릿·허용 목록 있음)
- 웨이브 시작 전과 푸시 전에 main을 머지 커밋으로 반영(force push 금지)
- 동시 레인: 만들기 1 + 계획 1 + 검증 1 — 건드리는 파일이 겹치지 않게
```

`.claude/rules/`에는 영역별 상세 규칙을 따로 둔다(원본: `db.md` · `deploy.md` · `frontend.md` · `tests.md` · `gstack.md`). 해당 경로 파일을 만질 때만 붙는다.

---

## ② 절차 도구 설치

| 도구 | 설치 | 비고 |
|------|------|------|
| GSD | `npx -y @opengsd/gsd-core@latest --claude --local` | `.claude/gsd-core/`, `.planning/` 생성. `model_profile: adaptive`, `granularity: coarse` |
| superpowers | 이 저장소 `.claude/skills/` 복사(벤더링, `SUPERPOWERS-VENDORED.md` 참고) | TDD·verification·systematic-debugging 등 |
| gstack | `scripts/install-gstack.sh` 복사 → SessionStart 훅에서 실행 | `/review` `/qa` `/cso` `/ship` `/browse` 등 |
| 프로젝트 스킬 | `.claude/skills/design-gate/` | 화면 파일 수정 전 점검표 강제 |

---

## ③ 강제 장치 (훅)

`.claude/settings.json`의 `hooks`와 `.claude/hooks/plant8-*.sh`를 복사하고 이름 접두어만 바꾼다. 각 훅이 막는 것:

| 이벤트 · 매처 | 훅 | 막는 것 |
|---------------|----|---------|
| SessionStart | `scripts/install_pkgs.sh` · `scripts/dev-db.sh` · `scripts/install-gstack.sh` | 의존성·로컬 Postgres(erp + erp_test)·gstack 자동 준비 |
| SessionStart · PostToolUse · Stop · PreToolUse(Agent, Skill) | `plant8-session-boundary.sh` | 한 세션에 여러 단위(웨이브·게이트 리뷰·quick) 진행 |
| UserPromptSubmit | `plant8-procedure-checklist.sh` | 매 요청마다 「훅이 못 막는 것」 체크리스트 주입 |
| UserPromptSubmit · PostToolUse · PostToolUseFailure · PreToolUse(Agent, Bash, Edit/Write, merge) | `plant8-skill-gate.sh` | 커밋 전 verification·TDD 스킬 미호출, 화면 파일 수정 전 design-gate 미호출, 조건 미충족 머지·위험 경로 세션 머지 |
| PreToolUse(Write/Edit) | `plant8-protect-claude-md.sh` | 세션 중 CLAUDE.md 수정 |
| PreToolUse(Bash) | `plant8-pre-push-gate.sh` | lint·typecheck 실패 상태의 푸시 |
| PreToolUse(Agent·Skill·Bash·Write·Edit·PR 도구) | `plant8-rule-guard.sh` | 기타 규칙 위반(외부 Codex 검토, PR 생성·수정 규칙 등) |
| 자동 기록 | 게이트 스킬 호출 시 `.claude/gates/phase-NN.log`에 한 줄 | 머지 조건의 「게이트 기록」 근거 |

훅 테스트: `.claude/hooks/tests/*.test.sh`(예: `bash .claude/hooks/tests/plant8-skill-gate.test.sh`). 훅을 고치면 이 테스트부터 통과시킨다.

---

## ④ 운영

- **클라우드 환경:** 프로젝트 전용 환경을 하나 만들고 시크릿·네트워크 허용 목록·SessionStart 스크립트를 둔다. 「기본값」 환경에서는 작업하지 않는다
- **PR 한 개 = 묶음 하나:** 페이즈 브랜치에서 draft PR을 열고, 웨이브마다 커밋·푸시. PR 이벤트 구독으로 세션이 CI·댓글에 깨어난다
- **인계:** `/gsd-pause-work`가 `.planning/.continue-here.md`와 HANDOFF를 쓴다. 다음 세션은 `/gsd-progress`로 재개. 한도·사고로 pause-work를 못 하면 `docs/reviews/…`에 「인계」 절을 커밋·푸시하고 새 세션 첫 메시지에서 그 절을 가리킨다
- **보고:** PR 댓글은 「[완료 보고]」(지시 완료 한 줄) · 「[막힘]」(원인 한 줄) · 「[사용자 결정 요청]」(무엇을·선택지·추천·근거)만. 모든 댓글 끝에 Claude Code 푸터
- **게이트 기록:** 게이트 줄은 세션이 임의로 쓰지 않는다 — 사용자에게 보여 주거나 위임받은 경우에만 넣는다
