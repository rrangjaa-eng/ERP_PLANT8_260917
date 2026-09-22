---
created: 2026-09-22T16:25:00.000Z
title: 새 세션 인수인계 — 코덱스 전체 통합 디자인 리뷰 → Phase 4 실행
area: planning
severity: major
files:
  - .planning/phases/04-project-quote-ledger/
  - docs/design/SYSTEM.md
  - docs/design/DECISIONS.md
---

## Problem

2026-09-22 세션에서 **관리자 메뉴 정리(quick 260922-i3k)가 끝나 main에 머지됐다**
(PR #36, 머지 커밋 `a224b1b`). 사용자 결정으로 남은 두 단계는 **새 세션**에서
진행한다. 세션 메모리는 사라지므로 디스크에 남긴다.

**Phase 4는 계획만 끝났고 실행은 아직이다**(7플랜/4웨이브, 서머리 0건).

## Solution

이 순서로 한다.

### ① 코덱스 전체 통합 디자인 리뷰

**Phase 4 실행 전에** 한다(사용자 확정, 앞 세션에서도 같은 결정).

**대상은 현존 화면 전부** — 앱 셸·로그인·내 계정·관리자 10화면 + 이번에 만든
`/admin` 인덱스. 프로젝트/견적/리저브 화면은 아직 없으므로 제외.

**설정**: `review.default_reviewers=["codex"]`, `models.codex="gpt-5.6-sol"`,
`effort.codex="xhigh"`. codex CLI 0.155.1 + `/root/.codex/auth.json` 있음.
네트워크는 2026-09-22 실측으로 이상 없다(프록시가 `api.openai.com`·
`chatgpt.com`·`auth.openai.com`에 CONNECT 터널을 연다).

**이 리뷰에서 반드시 다룰 것 — `/design-review` FINDING-002 (todo 별도 파일
`2026-09-22-single-column-max-width.md`)**: 한 칸짜리 목록·폼의 최대 폭이
SYSTEM.md에 규정돼 있지 않다. 1280px에서 콘텐츠 폭 1240px인데 `/admin` 인덱스의
가장 긴 라벨이 약 100px이고, `/account` 비밀번호 칸도 `--form-max: 720px`가
있는데 1240px로 늘어나 있다. **전역 습관이라 화면 하나만 고칠 수 없다** —
DECISIONS.md → SYSTEM.md → 전 화면 순서로 처리해야 한다. **Phase 4 전에 끝내는
것이 중요하다**: 새 화면(프로젝트·견적·리저브)이 규칙 없는 상태에서 만들어지면
같은 습관이 복제된다.

**범위 중복 주의**: 앞 세션의 `/design-review`는 이번 변경이 건드린 세 표면만
봤다(`/admin` 인덱스 · PC 사용자 메뉴 · 「더보기」 시트). 코덱스 리뷰는 **다른
리뷰어의 전체 화면 2차 의견**이라 중복이 아니다.

### ② `/gsd-execute-phase 4`

7플랜 / 4웨이브. 실행 후 Post-build 넷 필수이며 **`/cso` 포함**(권한·외부 입력).

**실행 전 반드시 읽을 것**: `.planning/phases/04-project-quote-ledger/04-OPEN-ITEMS.md`

**U-2·U-4·U-5는 이미 확정됐다** — 별도 todo
`2026-09-22-phase-4-u-2-u-4-ui.md`에 근거와 함께 있다. 요약:
- U-2ⓐ 최신+고객승인 차수 상태 열 = `승인`만(`success`)
- U-2ⓑ 승인 없이 지나간 이전 차수 = 빈 칸 (폰 P2 접힌 줄은 빈 값 자리 건너뜀)
- U-4 dirty=0 = 라벨에서 숫자 떼고 비활성 + `바뀐 칸 없음 · 고칠 칸을 눌러 주세요`(`--muted`)
- U-5 = 편집 가능 셀 0인 사람은 1차 버튼 **미렌더**
- **대가**: SYSTEM.md §7-1 보강 1건 → **Phase 4의 SYSTEM.md 개정이 4건이 아니라 5건이다**

**아직 미해소**: U-1(S3 머리 줄 375px 줄바꿈) · U-3(S6 입금 0줄일 때 미수 자리)
· U-6(오류 0칸인 표의 합계 행 거부 문구). 해당 플랜에서 정한다.

**체크포인트**:
- `04-01` Task 1 — 일방통행 결정 7건 묶음(`checkpoint:decision`, blocking). `A`면 전체 권고 채택
- `04-03` — `autonomous: false`. 인트라넷 덤프 경로 필요 + `amount_basis` 표본 대조. 「보류」면 ROADMAP 성공 기준 7이 미착수로 남고 페이즈가 6/7로 끝난다
- `04-04` Task 3 — 실제 Excel 3×3 붙여넣기(`checkpoint:human-verify`)

**주의**: `04-01`은 49파일 / 추정 토큰이 예산과 동률(여유 0). 재분할 방아쇠 3개가
계획에 있다 — 컨텍스트 60% 초과, `moneyColumns` 헬퍼 폴백, `db:generate` 2회 이상.

## 이 세션에서 배운 것 — 다음 세션이 반복하지 말 것

1. **`gsd-dom-verifier`는 이 저장소에서 못 쓴다.** 브라우저 MCP 전용 에이전트인데
   이 세션엔 그 MCP가 없고 CLAUDE.md가 `mcp__claude-in-chrome__*`를 금지한다.
   화면 감사는 **Bash가 있는 에이전트**에게 Playwright로 시켜야 한다
   (`CI=true` 프로덕션 빌드, 임시 spec 작성 → 실행 → 삭제).

2. **`/gsd-code-review`는 번호 있는 페이즈만 받는다**(`phase_found: false`로 정지).
   quick task는 `gsd-code-reviewer`를 직접 띄워 같은 계약으로 돌린다.

3. **`SYSTEM.md`의 「같은 결」식 위임은 샌다.** §6-10이 「§7-3 그룹 머리글 행과
   같은 결(`--fs-sm --muted` 600)」로 위임했더니 구현이 괄호 안 토큰만 가져오고
   §7-3이 함께 규정한 「아래 1px `--line-strong`」을 빠뜨렸다. **DOM 실측 감사도
   못 잡았다** — 인라인 토큰만 대조해 15항목 전부 PASS가 나왔다. 새 절을 쓸 때
   규격을 그 자리에 전부 적어라.

4. **세 게이트는 서로 대체 불가다.** 코드 리뷰(구조적 위험) · DOM 실측(계산값) ·
   디자인 리뷰(**없는 것**)가 각각 다른 것을 잡았다. 하나로 줄이지 마라.

5. **`/cso` 정식 실행은 이 환경에서 불가**하다. 신뢰 헬퍼(`gstack-cso-launcher`)가
   없고 `~/.claude/skills/gstack`도 없다. 감사 대상 저장소에서 헬퍼를 빌드하는
   것은 스킬이 금지한 우회다. 정적 감사 + 런타임 확인으로 대체하되 **스캐너
   증거(Gitleaks·OSV·Semgrep 등)가 없다는 사실을 보고에 남겨라.**

6. **gstack이 `.claude/skills/gstack/`에 벤더링돼 있고 벤더링은 폐기 예정**이다
   (team 모드 이전 권장). 스킬이 경고했다.

## 남은 부채 (이번 작업과 무관, 별도 처리)

- **Open Windows 11건** — Phase 01(7: lint-warning·unrun-verify) · Phase 02(4:
  deviation·unrun-verify). `/gsd-ship`을 막는다. quick task 하나 때문에 waive하지
  않기로 했다 — `unrun-verify`(안 돌린 검증)가 섞여 있다.
- **Phase 1~3 verification이 stale** — 같은 뿌리다.
- `pnpm start`가 `output: standalone` 경고를 낸다(기존 잡음, 서버는 정상 동작).

재개는 `/gsd-progress`.
