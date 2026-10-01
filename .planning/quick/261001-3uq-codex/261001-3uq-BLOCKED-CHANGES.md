# 261001-3uq — 승인이 필요해 막힌 변경

> **반영 상태(2026-10-01):** 사용자 승인(「훅 고쳐 — 261001-3uq 막힌 변경 반영」) 뒤 1·2·3을 PR #116에 반영했다. 반영 결과는 각 패치와 같다(`git apply -R --check` 통과). 검증: session-hooks·install-codex 29 passed, rule-guard 하네스 PASS=282 FAIL=0. **4(CLAUDE.md)는 아직 사용자 붙여 넣기 대기.**

이 quick 작업에서 훅이나 사용자 관리 규칙 때문에 세션이 직접 쓰지 못한 변경이다. 패치는 이 폴더에 있고, 모두 `git apply --check`를 통과했다(origin/main fe6ab22 기준).

| 파일 | 막은 장치 | 결과 |
|---|---|---|
| `.claude/settings.json` | rule-guard R8: 사람이 채팅에 직접 친 승인이 필요 | Edit 시도 → 「차단됨(규칙)」 |
| `.claude/hooks/plant8-rule-guard.sh`·`tests/plant8-rule-guard.test.sh` | 같은 R8 | 사본에서만 작성·검증 |
| `CLAUDE.md` | 사용자가 직접 관리(plant8-protect-claude-md), 세션의 CLAUDE.md 읽기는 자동 모드 분류기가 「자기 수정」으로 거부 | 붙여 넣을 문장만 아래에 적음(패치 없음) |

## 1. settings.json — install-codex 훅 (`261001-3uq-blocked-settings.patch`)

- 목적: 새 세션마다 `scripts/install-codex.sh`가 Codex 설치와 ChatGPT 로그인 복원을 자동으로 한다. 지금은 손으로 `bash scripts/install-codex.sh`를 돌려야 한다.
- 변경: SessionStart `startup|resume`에서 install_pkgs.sh 다음, dev-db.sh 앞에 아래를 넣는다. timeout 180은 첫 세션의 플랫폼 바이너리 내려받기 시간이다.
  ```json
  { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR\"/scripts/install-codex.sh", "timeout": 180 }
  ```
- 검증: 패치한 사본을 jq로 확인함. 순서는 install_pkgs → install-codex → dev-db → install-gstack.

## 2. session-hooks 단언 (`261001-3uq-blocked-session-hooks.patch`, 1과 같이 넣는다)

- 목적: 위 훅 줄의 순서와 형식(type command, timeout ≥ 120)을 고정한다.
- 1 없이 넣으면 CI가 빨개진다. 그래서 커밋하지 않고 패치로 뒀다.
- 검증: 현재 settings로 돌리면 이 2건만 실패한다(RED, 2 failed / 21 passed). 1을 넣으면 통과하는 조건은 jq로 확인함.

## 3. rule-guard R3 — 디자인 밖 Codex 차단 (`261001-3uq-blocked-rule-guard.patch`)

- 목적: gstack `codex_reviews disabled`(이미 적용, install-gstack.sh)를 따르지 않는 경로를 막는다. 해당 경로는 `/codex`·`/office-hours`·`/spec`·`design-consultation`과 손으로 친 `codex`다.
- 규칙: Bash의 `codex`를 막는다. 예외는 `--version`·`-V`·`--help`·`-h`·`login status`다.
  - 맨 명령, 경로 지정, 접두 명령 경유가 모두 해당한다: `timeout`·`gtimeout`·`_gstack_codex_timeout_wrapper`(`-s`·`-k` 값 포함), `env`·`sudo`·`nice`·`stdbuf`·`setsid`·`xargs`·`unbuffer`(값 받는 옵션 포함), `command`(`command -v`는 조회라 통과).
  - 패키지 실행기도 막는다: `npx`·`bunx`·`pnpm|npm dlx|exec|x`·`pnpm codex`에서 인자 중 `codex`나 `@openai/codex`가 있으면. 설치(`pnpm add -g`)는 막지 않는다.
  - 허용 조건: 세션 스킬 기록 `${TMPDIR}/plant8-skill-gate/<session>.skills`에 `design-review`나 `plan-design-review`가 정확히 있을 때.
  - `scripts/codex-design-review.sh`는 맨 `codex` 명령이 아니라서 통과한다.
- 검증: 사본 하네스로 확인했다. 기준선은 PASS=245 FAIL=0이다. 1차 RED는 FAIL=16, 1차 GREEN은 266/0이다. /review의 adversarial 지적(접두 명령·옵션 값·패키지 실행기 우회) 반영: 2차 RED는 FAIL=12, 최종은 PASS=282 FAIL=0이다(R3 39건, B6-4·5·8·9 갱신).
- 남는 한계(토큰 단위 검사로는 못 막는다 — 1차 차단은 gstack `codex_reviews disabled`):
  - 스킬 기록이 세션 단위라 같은 세션에서 `/design-review`를 부른 뒤의 codex 호출은 통과한다.
  - 스킬 기록 파일(`${TMPDIR}/plant8-skill-gate/`)은 세션이 직접 쓸 수 있다(skill-gate 전체의 공통 한계).
  - `bash -c "codex …"`는 경고로만 낮춘다(B6-5, 기존 판정 불확실 규칙). `node -e`·변수 간접 호출(`X=codex; $X`)·`find -exec`는 잡지 못한다.
  - `scripts/codex-design-review.sh`는 스킬 기록 없이도 통과한다. 대신 디자인 검토 프롬프트만 만들고 `--plan`은 `.planning/`·`docs/`의 .md만 받는다.

## 4. CLAUDE.md — 사용자가 붙여 넣을 문장

| 위치 | 지금 | 바꿀 문장 |
|---|---|---|
| §2(24행) 마지막 항목 | `· Codex 등 외부 검토 호출 (§4)` | `· 디자인 검토 밖에서 Codex 등 외부 검토 호출 (§6)` |
| §4 Pre-build 끝(83행) | `외부(Codex) 검토는 하지 않는다` | `외부(Codex) 검토는 디자인 검토(\`/plan-design-review\`·\`/design-review\`)에서만 한다(§6)` |
| §8 모델 선택 끝(131행) | `외부(Codex) 검토는 하지 않는다` | `외부(Codex) 검토는 디자인 검토에서만(§6)` |

§6 「화면 검증 순서」 줄 다음에 넣을 줄:

```
- **Codex 디자인 검토**(사용자 결정 2026-10-01): `/design-review`·`/plan-design-review`에서만 `bash scripts/codex-design-review.sh <경로…> --out <보고서>`(계획 검토는 `--plan <파일>`)를 부른다 — `CI=true` 빌드 화면을 375·320·768·1280 폭으로 찍고 DOM 실측표와 함께 Codex(ChatGPT 구독 로그인)에 넘긴다. Codex 지적은 후보이고 결함 판정은 DOM 실측으로만 한다. 자격·CLI가 없으면 보고서에 「Codex 디자인 검토 건너뜀: 사유」 한 줄을 남기고 진행한다. 그 밖의 검토에서 Codex는 gstack `codex_reviews disabled`와 규칙 훅 R3가 막는다
```

## 반영 절차

1. 사용자가 채팅에 직접 승인을 친다. 예: 「훅 고쳐 — 261001-3uq 막힌 변경 반영」. 카드 선택은 승인으로 인정되지 않는다.
2. 세션이 1·2·3을 Edit 도구로 반영한다. `git apply --check`는 아직 들어가는지 확인하는 데만 쓴다.
   - 위험 경로(`.claude/`)라 사용자가 GitHub에서 머지한다.
   - 1과 2는 같은 커밋에 넣어 CI가 중간에 빨개지지 않게 한다.
3. 확인: `pnpm test:unit test/unit/session-hooks.test.ts`, `bash .claude/hooks/tests/plant8-rule-guard.test.sh`(FAIL=0).
4. CLAUDE.md는 사용자가 세션 끝에 직접 붙여 넣는다(CLAUDE.md §0).
