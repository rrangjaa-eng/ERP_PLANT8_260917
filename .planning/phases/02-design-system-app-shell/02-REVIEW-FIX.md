---
phase: 02-design-system-app-shell
fixed_at: 2026-09-19T18:36:30Z
review_path: .planning/phases/02-design-system-app-shell/02-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Source review:** `02-REVIEW.md` (status `issues_found` — Critical 0 · Warning 9 · Info 7)
**Scope:** 사용자가 WR-08·WR-09 둘만 고르기로 결정했다(2026-09-19). 둘 다 **이 페이즈가 만들기로 한 장치 자체의 결함**이라 페이즈 안에서 닫는 것이 맞다 — 나머지 14건은 일반적인 코드 지적이라 `02-REVIEW.md`에 기록된 채로 남는다.

**검증 환경:** 격리된 git 워크트리(`.claude/worktrees/rf-02-29433-*`, 브랜치 `gsd-reviewfix/02-29433`)에서 `pnpm install --frozen-lockfile`로 실제 게이트를 돌린 뒤 `claude/gsd-plan-phase-2-jbf5c2`로 fast-forward 병합하고 워크트리·임시 브랜치를 정리했다.

## 고친 것

### WR-08 — D-20 stylelint 토큰 가드에 구멍이 있었다

**파일:** `stylelint.config.mjs` · `test/unit/stylelint-config.test.ts`
**커밋:** `6618524` — `fix(02): WR-08 close stylelint D-20 token guard holes`

기존 `declaration-property-value-disallowed-list`는 `#hex` · `rgb()/rgba()` · `hsl()/hsla()`만 부분 매치로 잡았다. 그래서 세 가지가 샜다:

1. **이름 있는 색** — `color: white`, `background: red`
2. **최신 색 함수** — `oklch()` · `oklab()` · `lab()` · `lch()` · `hwb()` · `color()` · `color-mix()`
3. **`font` 축약** — `font: 12px Arial`이 `font-family`·`font-size` 허용 목록을 통째로 우회

추가한 규칙 (기존 두 목록은 그대로 두고 덧붙였다):

| 규칙 | 막는 것 |
|---|---|
| `"color-named": "never"` | 이름 있는 색 전부 |
| `"function-disallowed-list": [rgb, rgba, hsl, hsla, hwb, lab, lch, oklab, oklch, color, color-mix]` | 리터럴 색 함수 전부. **`calc()`는 목록에 없다** — 간격 계산에 계속 쓰인다 |
| `"property-disallowed-list": ["font"]` | 축약 금지 → 항상 롱핸드를 쓰게 강제 |

**실측 (같은 프로브, 수정 전후):**

```
.probe{color:white;background:red;border-radius:9px;font:12px Arial}

수정 전:  1 problem  — border-radius 9px 만
수정 후:  4 problems — color-named "white" · color-named "red"
                      · border-radius "9px" · property "font"
```

**거짓 양성 없음:** `calc(var(--s-2) + 2px)` · `currentColor` · `var(--fg)` 모두 통과.

**`docs/design/tokens.css`는 영향 없다.** `package.json`의 lint 스크립트가 넘기는 glob이 `ui/**/*.module.css` · `app/globals.css` · `app/**/*.module.css` 셋뿐이라 토큰 정의 파일은 애초에 스캔 대상이 아니다. `--on-accent-weak: rgba(255, 255, 255, 0.5)`는 그대로 유효하고, 예외 규칙을 새로 만들지도 않았다.

### WR-09 — CI·배포 트리거가 단위 테스트가 읽는 문서를 가리고 있었다

**파일:** `.github/workflows/ci.yml` · `.github/workflows/deploy.yml` · `test/unit/ci-guard.test.ts` · `test/unit/deploy/workflows.test.ts`
**커밋:** `1e4412b` — `fix(02): WR-09 re-include docs unit tests actually read in CI/deploy triggers`

두 워크플로가 `!docs/**`로 문서를 통째로 제외하고 `docs/design/tokens.css` 하나만 되살려 뒀다. 그런데 `pnpm test:unit`이 실제로 읽는 문서는 다섯이다:

| 문서 | 읽는 테스트 |
|---|---|
| `docs/design/SYSTEM.md` | `design-system-docs.test.ts` · `ui/role-menu.test.ts` |
| `docs/design/DECISIONS.md` | `design-system-docs.test.ts` (6건 계수) |
| `docs/design/tokens.css` | `design-system-docs.test.ts` (이미 재포함돼 있었다) |
| `docs/ARCHITECTURE.md` | `docs-limits.test.ts` (300줄 상한) |
| `docs/OPERATIONS.md` | `docs-limits.test.ts` (300줄 상한) |

**결과:** `SYSTEM.md`만 고친 PR은 CI를 건너뛰고 머지됐고, main이 깨진 것은 그 다음 무관한 PR에서야 드러났다.

네 경로를 `!docs/**` **뒤에** 재포함했다(GitHub `paths`는 나중 항목이 앞을 덮으므로 순서가 의미를 가진다). `.planning/**` 제외는 그대로다. 무료 플랜 Actions 분을 아끼려는 원래 의도(진짜로 무관한 문서는 계속 제외)는 유지된다.

`test/unit/ui/next-turn.test.ts`가 `SYSTEM.md`를 언급하지만 주석일 뿐 읽지 않는 것을 확인하고 목록에서 뺐다.

## 건너뛴 것

없다 — 범위에 들어온 2건 모두 고쳤다.

**범위 밖으로 남은 14건**은 `02-REVIEW.md`에 그대로 있다. 그중 하나는 기한이 있다:

- **WR-07 — 인증이 `app/(app)/layout.tsx`에만 있다.** Next 16 문서가 부분 렌더링·RSC 페이로드로 우회 가능하다고 명시한다. 지금은 그 라우트들이 EMPTY 화면뿐이라 노출될 데이터가 없지만, **Phase 4가 원장 데이터를 올리기 전에 반드시 닫아야 한다.**

## TDD 증거 (red → green)

플랜 밖 수정이지만 CLAUDE.md의 "실패 테스트 → 최소 구현" 규칙을 지켰다.

| 대상 | RED (수정 전) | GREEN (수정 후) |
|---|---|---|
| WR-08 | `5 failed \| 15 passed (20)` — 예: `expected 0 to be greater than 0` (`color: white`) | `20 passed (20)` |
| WR-09 | `2 failed \| 29 passed (31)` — 예: `expected -1 to be greater than -1` (`docs/design/SYSTEM.md` 없음) | `31 passed (31)` |

## 최종 검증 (실행해서 관찰한 것)

- `pnpm lint` → 오류 0 (기존 `boundaries/element-types` deprecation 경고만 — IN-07, 범위 밖)
- `pnpm typecheck` → 오류 0
- `pnpm test:unit` → **26 파일 284 통과** (기준 272 + WR-08 8건 + WR-09 4건)
- 프로브 재실행 → 4 problems, 프로브 파일 삭제 후 `git status` 깨끗
- 두 워크플로 YAML 파싱 유효성 확인

---

*Fixed: 2026-09-19 · gsd-code-fixer (격리 워크트리) + 오케스트레이터 독립 재현 · Iteration 1*
