# Phase 2: 디자인 시스템·앱 셸 - Context

**Gathered:** 2026-09-19
**Status:** Ready for planning

<domain>
## Phase Boundary

`docs/design/SYSTEM.md`와 `docs/design/tokens.css`를 앱 코드로 실현한다. 앱 셸(상단 바·폰 하단 탭·더보기 시트·레이아웃·빈 상태), 로그인, 내 계정, 관리자 시스템 상태 화면이 전부 SYSTEM.md 컴포넌트와 tokens.css 토큰만 쓰고, Phase 1의 무스타일 임시 화면은 남지 않는다. 폰(375px)과 PC에서 같은 셸이 깨지지 않고 키보드만으로 로그인·내비게이션·비밀번호 변경이 된다. Pretendard 서체 파일을 리포에 넣고 앱에 연결한다.

**이 페이즈에 이미 끝나 있는 것(ROADMAP 전제가 낡았다).** ROADMAP Phase 2 절의 마지막 문단은 "`docs/design/`(BRIEF.md·EXPLORE.md·SYSTEM.md·tokens.css·DECISIONS.md)은 아직 없으며 이 페이즈의 산출물이다"라고 적었지만 사실이 아니다. 세 세션에 걸쳐 전부 만들어졌고 `docs/design/REVIEW.md`에 `/plan-design-review` 통과 기록(7/10 → 9/10, "NO UNRESOLVED DECISIONS", "SYSTEM.md is implementation-ready for Phase 2 screens")이 있다. 따라서:

- **성공 기준 1은 이미 충족** — §1 브리프 → §2 발산 → §3 수렴 절차의 산출물이 전부 존재하고 리뷰를 통과했다. 이 페이즈는 그것을 다시 만들지 않는다.
- **성공 기준 5도 이미 충족** — 엑셀식 표(grid) 동작 계약은 `SYSTEM.md` §7-3 「편집 (UX-05, 엑셀과 같은 키)」에 Tab/Shift+Tab·Enter·방향키·Esc·⌘C/⌘V·⌘↵·⌘S·전부 저장 또는 전부 거부·오류 셀 고정·충돌 표시까지 전부 적혀 있다.
- **남은 것은 코드(기준 2·3)와, SYSTEM.md의 빈 곳 두 군데(기준 4)** 다.

**SYSTEM.md에서 발견된 빈 곳 2개 — 이 페이즈가 메운다.**

1. **로그인 화면 템플릿 없음.** `SYSTEM.md`에 「로그인」·「내 계정」·「비밀번호」라는 말이 한 번도 나오지 않는다(§6-5 외부 수령자 절의 "로그인 없음" 한 번 제외). §6은 "모든 화면은 아래 템플릿 중 하나에서 시작한다. 새 템플릿이 필요하면 먼저 여기에 추가한다"고 스스로 규정했는데 템플릿 7개(공통 셸·목록·상세·폼·대시보드·외부 수령자·인쇄) 어디에도 로그인이 없다. 로그인은 상단 바·하단 탭이 없는 유일한 화면이다.
2. **「알림함」 계약 없음.** 성공 기준 4가 핵심 컴포넌트 계약으로 이름을 박아 둔 다섯 가지(서버 검증 오류 폼 · 엑셀식 표 · 선행 단계 전 비활성 + 이유 · **알림함·배지** · 폰용 목록·시트) 중 알림함만 없다. 있는 것은 상태 태그(§7-5) · PARTIAL 건수 배지(§7-7) · 폰 하단 탭 건수(§6-0) · 토스트(§7-6)뿐이다.

**범위 밖.** 표(§7-3) 컴포넌트 구현 — 성공 기준 5가 "자체 구현/라이브러리 선택은 Phase 4 계획에서 한다"고 명시했다. 손익 대시보드(Phase 9) · 인쇄 라우트(Phase 5·11) · 외부 수령자 화면(Phase 11) · 계급 5종과 정보 노출표(Phase 3) · 역할별 첫 화면의 실제 데이터(UX-02, Phase 9) · 알림 발송과 알림함 구현(Phase 7) · 회사 도메인 연결(Phase 3).

</domain>

<decisions>
## Implementation Decisions

Phase 1의 D-01~D-18은 그대로 유효하다. 아래는 이번 논의에서 확정한 것이며 번호를 이어 붙였다.

### 스타일링 기계장치

- **D-19:** 컴포넌트 CSS는 **전역 CSS + CSS Modules**다. Tailwind·CSS-in-JS·vanilla-extract를 쓰지 않으며 이 항목으로 새 런타임 의존성을 추가하지 않는다. 근거: `tokens.css`가 순수 CSS 커스텀 속성 195줄이고 `docs/design/system/`의 실물 HTML 10개도 전부 순수 CSS + `var(--…)`로 쓰여 있어 선택자만 모듈로 옮기면 이관이 끝난다. 표의 sticky 머리글·오류 셀 inset 선·`@media print` 같은 선택자도 제약 없이 쓴다. — **Reversibility:** costly — 나중에 유틸리티 방식으로 바꾸려면 이 페이즈가 만든 모든 컴포넌트와 이후 페이즈의 화면을 다시 쓴다.
- **D-20:** "새 색·서체·radius 생성 금지, 토큰은 `tokens.css`에서만"을 **stylelint 규칙 + CI**로 강제한다. CSS에서 **색·서체·radius** 리터럴을 금지하고 `var(--…)` 참조만 허용한다. **간격(padding·margin·gap)은 금지 대상이 아니다** — 2026-09-19 사용자 비준. 처음 이 결정을 적을 때 CLAUDE.md 원문("새 색·서체·radius 생성 금지")에 없는 「간격」을 덧붙였는데 그것이 과한 적용이었다. 확정된 디자인의 실물 HTML 10개에 있는 `padding`/`margin`/`gap` px 리터럴 283건 중 **175건(62%)이 4px 배수가 아니어서**(6px 55 · 2px 31 · 10px 24 · 7px 15 · 9px 13 · 5px 11 · 14px 11 · 1px 8 · 3px 5 · 18px 2), `tokens.css`의 간격 스케일(`--s-1`~`--s-12` = 4·8·12·16·20·24·32·48px)로는 옮겨 갈 자리가 없다. 간격까지 금지하면 확정된 디자인이 픽셀 단위로 바뀌어야 한다. Phase 1이 ESLint 커스텀 규칙 3개(`plant8/require-action-client`·`repository-viewer-param`·`money-boundary`)와 `@typescript-eslint/rule-tester` 기반 규칙 테스트를 둔 전례를 따른다 — 규칙 자체에도 테스트를 붙이고 `pnpm lint`와 CI lint 단계에 넣는다. 개발 의존성 추가는 stylelint 하나로 한정하고 CLAUDE.md의 "새 의존성은 이유 한 줄 + 승인" 절차를 따른다(이 문장이 그 승인이다).
- **D-21:** `tokens.css`의 **단일 출처는 `docs/design/tokens.css` 하나이며 앱이 그것을 직접 import한다.** 복사본을 만들지 않는다. 근거: CLAUDE.md가 "토큰은 `docs/design/tokens.css`에서만"이라고 못박았고, 실물 HTML 10개도 `../tokens.css`를 참조하고 있어 원본이 옮겨가면 전부 깨진다. **다만 Next.js 16의 CSS 처리와 ESLint boundaries가 `app/` 밖 경로 import를 허용하는지는 리서치가 확인해야 한다.** 실무적으로 불가능하다고 판명되면 차선은 `app/`으로 복사하되 `docs/design/tokens.css`와 **바이트 단위로 같은지 검사하는 테스트**를 두어 CI에서 드리프트를 막는 것이다(Phase 1의 `docs-limits.test.ts`와 같은 결). 원본을 앱으로 옮기는 안은 거부했다.

### 셸의 구성과 빈 화면

- **D-22:** 상단 바 1차 메뉴 **5개(프로젝트·지출결의·법인카드·결재·손익)를 전부 내보내고**, 대응 화면이 없는 라우트는 §7-7의 **EMPTY 상태**("무엇이 없다 · 다음 한 수" 한 줄)를 렌더한다. 근거: §6-0이 "빈 자리를 두지 않는다"고 규정했고, 이렇게 해야 셸이 진짜 셸임을 이 페이즈에서 증명할 수 있으며 Phase 4 이후는 EMPTY 자리에 표를 꽂기만 하면 된다. 다섯 상태 계약도 진짜 화면으로 검증된다. "구현된 것만 내보낸다"와 "비활성 + 이유"는 거부했다 — 후자의 패턴(UX-06)은 업무 흐름용이지 내비게이션용이 아니다.
- **D-23:** **역할 → (상단 바 메뉴 목록, 폰 하단 탭 4개) 매핑을 데이터로 한 곳에 분리한다.** 셸 컴포넌트는 그 매핑을 받아 렌더링만 한다. Phase 2는 D-14의 관리자/직원 둘만 채운다. Phase 3이 계급 5종·정보 노출표로 바꿀 때 **그 매핑 한 곳만** 교체하고 셸 컴포넌트는 건드리지 않는다. 배치는 4계층 경계를 지킨다(§D-26).
- **D-24:** 「내 차례」(§7-4)는 **컴포넌트만 만들고 입력은 빈 배열**이다. 가짜 데이터를 넣지 않는다. §7-4가 이미 "항목이 0이면 이 블록은 사라진다. 「할 일이 없습니다」를 쓰지 않는다. 대신 목록 화면이 위로 올라온다"고 규정했으므로 건수 0은 미완성이 아니라 계약대로의 동작이다. 단위 테스트가 최대 6줄·「더 보기 N건」·태그 순서(막힘 → 오늘 → 결재 → 대기)·폰 두 줄 배치를 고정한다.
- **D-28:** 루트 `/`는 **「내 차례」 홈 화면**이 된다. §6-0이 "폰 하단 탭 1번이 곧 첫 화면"이라 했고 §7-4가 "역할별 첫 화면 최상단"이라 했으므로, 이 구조를 지금 만들어 두면 Phase 9(UX-02 역할별 첫 화면)는 데이터만 꽂는다. 건수 0이면 「내 차례」가 사라지고 목록 EMPTY가 올라온다.

### 컴포넌트 인벤토리와 배치

- **D-25:** Phase 2가 **진짜 코드로 만드는 것**: 셸(상단 바 §6-0 · 폰 하단 탭 · 「더보기」 시트 §7-8) · 버튼 위계(§7-1, 서버 액션 진행 중 상태 포함) · 입력과 서버 검증 오류(§7-2) · 상태 태그(§7-5) · 토스트(§7-6) · 「내 차례」(§7-4) · 목록 화면 템플릿의 EMPTY(§6-1) · 다섯 상태(§7-7). **표(§7-3)는 만들지 않는다** — 성공 기준 5가 구현 결정을 Phase 4로 미뤘고, 지금 만들면 Phase 4가 라이브러리 선택과 함께 다시 만들게 된다. 모달(§7-8의 PC 480 모달)도 수요가 생기는 페이즈로 미룬다. 근거: 위 목록은 전부 이 페이즈에서 실제 화면에 쓰인다 — 「더보기」 시트는 §6-0이 셸의 일부로 규정했고, §7-2 서버 검증 오류 폼은 로그인·비밀번호 변경이 진짜로 쓴다. 추측으로 만드는 컴포넌트는 없다.
- **D-26:** 디자인 시스템 컴포넌트는 **최상위 `ui/`** 에 두고 `eslint.config`의 `boundaries/elements`에 **`ui` 타입을 신설**한다. 규칙은 `{ from: "ui", allow: ["ui", "lib"] }` — `ui`는 `domain`·`repositories`·`db`·`app`을 import할 수 없다. `{ from: "app", allow: [...] }`에 `"ui"`를 더한다. 근거: "이후 모든 화면은 이 토큰·컴포넌트만 쓴다"를 지키려면 컴포넌트가 순수 표현으로 남아야 하고, 경계 위반을 사람이 아니라 lint가 막아야 한다. `app/_components/`(설정 변경 0)는 거부했다 — `app/**` 패턴에 흡수돼 컴포넌트가 `domain`을 직접 부르는 것을 막을 장치가 없다. — **Reversibility:** costly — 나중에 옮기려면 모든 import 경로와 경계 설정을 함께 바꾼다.
- **D-27:** 실물 HTML 10개와 앱 코드가 어긋나면 **`SYSTEM.md`가 기준이고 실물은 참고**다. `docs/design/system/README.md`가 스스로 "앱 코드가 아니다"라고 적어 두었다. 실물 쪽이 맞다고 판단되면 먼저 `SYSTEM.md`를 고치고 그 다음에 따른다. 불일치와 그 처리는 `docs/design/DECISIONS.md`에 기록한다(CLAUDE.md 프론트엔드 규칙: "시스템을 벗어나야 하면 DECISIONS.md에 이유 기록 후 SYSTEM.md를 고친다. 화면 하나만 예외 금지").

### Phase 1 임시 화면 교체

- **D-29:** **관리자 시스템 상태 화면(`app/admin/system-status/`)도 `SYSTEM.md` 기준으로 다시 만든다.** 01-CONTEXT.md의 domain 절이 이 화면을 "무스타일 임시 화면" 셋 중 하나로 적었고 성공 기준 2가 "Phase 1의 임시 화면은 남아 있지 않다"이므로 범위 안이다. D-17(관리자 계급만 조회, 직원은 404)과 한도 배너 동작은 그대로 유지하고 셸 안으로 들어온다.
- 교체 대상 전체: `app/page.tsx`(→ D-28), `app/(auth)/login/`, `app/(app)/account/`(임시 비밀번호 배너 D-08 포함), `app/admin/system-status/`, `app/globals.css`(현재 box-sizing 5줄), `app/layout.tsx`(서체 링크 D-32).

### SYSTEM.md 보강 (성공 기준 4를 넘기기 위해 필수)

- **D-30:** **`SYSTEM.md` §6에 로그인 화면 템플릿을 신설한다 — 코드보다 먼저.** §6 스스로가 "새 템플릿이 필요하면 먼저 여기에 추가한다"고 규정했다. 템플릿이 담아야 할 것: 셸이 없는 화면 구조(워드마크 + 폼 하나), 로그인 실패 문구 자리(Phase 1 재량 결정 — 이메일/비밀번호 구분 없이 같은 문구), 계정 잠금 안내 자리, 임시 비밀번호 배너(D-08)가 로그인 직후 어디에 뜨는지, 다섯 상태. **「내 계정」은 §6-3 폼 템플릿을 그대로 쓰므로 새 템플릿이 필요 없다.**
- **D-31:** **`SYSTEM.md` §7에 「알림함·배지」 계약을 신설한다. 구현은 Phase 7.** 계약이 담아야 할 것: 읽음/안 읽음 구분, 목록 행 모양(§7-4 「내 차례」와 어떻게 다른지), 진입점(상단 바 / 폰 「더보기」 시트 §6-0), 건수 배지 규칙(기존 상태 태그 §7-5 · PARTIAL 배지 §7-7 · 하단 탭 건수 §6-0과의 관계), 다섯 상태. 근거: 성공 기준 4의 목적이 "이후 페이즈가 그대로 가져다 쓰는 계약"이므로, Phase 7이 계약 없이 시작하면 지금 겪은 빈 곳이 그대로 반복된다. Phase 2는 계약 문서만 쓰고 컴포넌트는 만들지 않는다.

### 앞 세션에서 이미 잠긴 것 (논의 대상 아님 — 계획에 그대로 넣는다)

- **D-32:** Pretendard Variable **동적 서브셋 woff2 92개(3.1MB) + css + OFL 라이선스를 리포에 커밋**한다(사용자 결정 「커밋해」, `docs/design/DECISIONS.md` 「서체 파일 리포 커밋」, `SYSTEM.md` §2-1). 자체 호스팅 `public/fonts/pretendard/`, 외부 CDN 금지, `font-display: swap`. npm 의존성으로 넣지 않고 `pretendard@1.3.9` tarball에서 파일만 복사한다 — 정확한 명령은 `docs/design/NEXT-SESSION.md` §B에 적혀 있다. `app/layout.tsx` `<head>`에 스타일시트 `<link>` 한 줄, 전역 CSS는 `--font-sans`만 쓴다. 검수는 Windows Chrome/Edge에서 표의 자릿수 정렬(맑은 고딕 폴백 대 Pretendard `tnum`) 스크린샷과 첫 로드 전송량 200–300KB 확인 — **이것은 리눅스 컨테이너에서 자동화할 수 없으므로 사람 체크포인트다.**
- 폴백 스택: `'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif`.

### Claude's Discretion

- **성공 기준 3(폰 375px·PC·키보드만)을 무엇으로 증명하는지.** Phase 1이 Vitest 단위·Vitest+Postgres 통합·Playwright E2E 3계층과 CI를 이미 세웠고 `SYSTEM.md` §11에 "모든 화면이 통과해야 하는 것" 목록과 §10에 접근성 계약(랜드마크·스킵 링크·`role=grid`·`aria-live`·`aria-invalid`·포커스 복귀·200% 확대)이 있다. Playwright 두 뷰포트·axe 접근성 검사·시각 회귀 중 무엇을 쓸지는 planner가 정한다. 다만 §11과 §10의 항목이 테스트로 덮이는지는 plan-checker가 확인해야 한다.
- CSS Modules 파일 배치와 이름 규칙, 컴포넌트 파일 단위(한 파일 한 컴포넌트 여부), 셸의 서버/클라이언트 컴포넌트 분할.
- stylelint 규칙을 기성 플러그인으로 조합할지 커스텀 규칙을 쓸지, 금지 리터럴의 정확한 패턴 목록.
- 역할→메뉴 매핑을 어느 계층에 둘지(`domain/` 대 `ui/`의 순수 상수) — D-26의 경계 규칙만 지키면 된다.
- 빈 라우트 5개의 URL 경로 이름(`/projects`·`/expenses` 등)과 각 EMPTY의 "다음 한 수" 문구.
- 「더보기」 시트의 검색 항목을 이 페이즈에서 동작시킬지(§6-0은 "첫 항목이 검색, PC의 `⌘K`와 같은 화면"이라 했으나 검색 대상 데이터가 없다) — 자리만 두고 비활성해도 된다.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 디자인 시스템 — 이 페이즈의 1차 출처
- `docs/design/SYSTEM.md` — **가장 중요한 문서.** §0 방향 · §1 색 · §2 타입(§2-1 서체 확정 = Pretendard 파일 배치와 `@font-face` 계획) · §3 간격 · §4 형태(§4-4 브라우저 기본 표면) · §5 모션 · §6 레이아웃 템플릿(§6-0 공통 셸 = 상단 바·폰 하단 탭·태블릿 700–1023·역할별 탭 표·「더보기」 시트, §6-1 목록 화면) · §7 컴포넌트 규칙(§7-1 버튼 · §7-2 입력·오류 · §7-3 표 = **성공 기준 5의 전문** · §7-4 「내 차례」 · §7-5 상태 태그 · §7-6 토스트 · §7-7 다섯 상태 컴포넌트 7종 × 5상태 표 · §7-8 모달·시트 · §7-9 단축키 힌트 줄 · §7-10 첨부) · §8 카피 규칙 · §9 아이콘 · §10 접근성 계약 · §11 검증 목록과 핵심 동선 3개
- `docs/design/tokens.css` — 토큰 원본이자 **유일한 출처**(D-21). 색 명도 단계 + 의미 토큰 + 데이터 색 + 타입 + 간격 + 형태 + 모션 + z-index + 아이콘, `@media (max-width: 699.98px)` 폰 재정의, `prefers-reduced-motion`, `@media print`
- `docs/design/DECISIONS.md` — 확정된 결정의 근거. 서체·서체 파일 리포 커밋, 인쇄물 재디자인 4건, 폼 화면 7건, 손익·외부 수령자, 리뷰 보강 R1~R6, 미결 U1~U4의 답(U1 A 로고 반전 · U2 A · U3 A Pretendard 파일 추가 · U4 B)
- `docs/design/REVIEW.md` — `/plan-design-review` 결과. **성공 기준 1이 이미 충족임을 증명하는 문서.** 7패스 점수와 발견 → 조치, 의도적 이탈 1건(표 셀 14px), "다음 리뷰는 8점 미만 패스만 전체 검토"
- `docs/design/system/README.md` — 실물 HTML 10개 + 스크린샷 목록과 각각이 무엇인지. 해시로 장면을 고르는 법(`#blocked`·`#error`·`#approve` 등). "앱 코드가 아니다"
- `docs/design/NEXT-SESSION.md` §B — **Pretendard 파일 복사 명령 원문(D-32)** 과 검수 항목. §C·§A는 끝난 일의 기록
- `docs/design/BRIEF.md` · `docs/design/EXPLORE.md` — §1 브리프와 §2 발산. SYSTEM.md의 판단 근거를 거슬러 볼 때만. 어긋나면 SYSTEM.md가 맞다
- `docs/DESIGN.md` — 디자인 절차 문서. 이 페이즈는 **§4(통일)만** 적용한다. §1~§3은 끝났으므로 다시 돌지 않는다

### 이관할 실물 (이 페이즈 범위)
- `docs/design/system/preview.html` — 원장 화면 실물. 상단 바 · 「내 차례」 · 표 · 단축키 힌트 줄 · EMPTY · 폼 · 토스트 · 폰 하단 탭. 폰(<700) 칸 접기 동작
- `docs/design/system/sheet-modal.html` — 시트·모달 실물(§7-8). `#more`가 폰 「더보기」 시트 = 셸 필수 부분. 탭·Esc·첫 행동 요소 포커스가 실제로 동작한다
- `docs/design/system/form-expense.html` — 폼 실물(§6-3). `#error` 서버 오류 장면이 §7-2 계약의 실물
- `docs/design/system/shots/` — 위 실물의 스크린샷(PC 1280 · 폰 390). 시각 비교 기준선으로 쓸 수 있다

### 페이즈 범위·요구사항
- `.planning/ROADMAP.md` §"Phase 2: 디자인 시스템·앱 셸" — 성공 기준 1~5. **단, 마지막 문단의 "`docs/design/`은 아직 없으며 이 페이즈의 산출물이다"는 사실이 아니다**(위 domain 절 참조). 기준 1·5는 이미 충족이다
- `.planning/REQUIREMENTS.md` — UX-01(이 페이즈). 참고로 UX-02는 Phase 9, UX-03은 Phase 5, UX-04·UX-05는 Phase 4, UX-06은 Phase 5다 — 이 페이즈는 그것들의 **계약**만 SYSTEM.md에 두고 구현하지 않는다
- `.planning/PROJECT.md` §Constraints·§Key Decisions

### 앞 페이즈에서 이어지는 것
- `.planning/phases/01-deploy-skeleton-login/01-CONTEXT.md` — D-08(임시 비밀번호 배너) · D-14(계급은 관리자/직원 둘, Phase 3이 5종으로 교체) · D-17(상태 화면 관리자 전용, 직원 404) · D-18(상태 화면 조회 방식) · domain 절(임시 화면 셋의 목록) · deferred(회사 도메인 연결 "Phase 2~3")
- `.planning/phases/01-deploy-skeleton-login/01-08-SUMMARY.md` — Phase 1 최종 상태
- `docs/ARCHITECTURE.md` — 4계층 구조. `ui` 계층 신설(D-26)은 이 문서에도 반영해야 한다(300줄 상한, `test/unit/docs-limits.test.ts`가 고정)
- `CLAUDE.md` §프론트엔드 — "모든 화면의 기준은 `docs/design/SYSTEM.md`" · "새 색·서체·radius 생성 금지, 토큰은 `docs/design/tokens.css`에서만" · "시스템을 벗어나야 하면 `DECISIONS.md`에 이유 기록 후 SYSTEM.md를 고친다" · "UI 완료 판정은 `/design-review` → `/qa` 통과 후"

### 리포 규칙·기존 설정
- `eslint.config.mjs` — `boundaries/elements` 8종과 `boundaries/element-types` 규칙. D-26이 `ui` 타입을 더한다
- `eslint/index.mjs`와 `test/unit/eslint-rules/` — 커스텀 규칙 + 규칙 테스트 전례(D-20이 따른다)
- `app/globals.css`(현재 5줄) · `app/layout.tsx`(23줄) — 이 페이즈가 다시 쓴다
- `package.json` — 현재 런타임 의존성 12개, CSS 프레임워크 없음. D-19는 새 런타임 의존성을 만들지 않고 D-20이 개발 의존성 stylelint 하나를 더한다

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- 앱 화면은 넷뿐이고 전부 교체 대상이다: `app/page.tsx`(7줄) · `app/(auth)/login/`(page 23 + login-form 89줄) · `app/(app)/account/`(page 21 + change-password-form 52 + logout-button 24줄) · `app/admin/system-status/page.tsx`(60줄). 폼의 **동작**(`next-safe-action` 연결·서버 검증 오류 표시·로그아웃)은 그대로 살리고 표현만 `ui/` 컴포넌트로 갈아끼운다
- `app/session-refresh.tsx` — sliding 세션 쿠키 연장(Phase 1 Eng OV-3). 새 `layout.tsx`에도 반드시 남아야 한다
- `lib/actions/client.ts`(`authedActionClient`) · `lib/viewer.ts` — 셸이 현재 사용자(이름·소속·계급)를 읽는 통로. 상단 바 우측의 "박서연·기획1팀"과 D-23 역할 매핑이 여기서 온다
- `test/unit/eslint-rules/` · `test/unit/docs-limits.test.ts` — "규칙을 테스트로 고정한다"는 기존 패턴. D-20의 stylelint 규칙과 D-21의 토큰 드리프트 검사가 같은 결로 붙는다
- Playwright E2E가 이미 있다(`test/e2e/login-logout.spec.ts` · `change-password.spec.ts` · `system-status.spec.ts`). 이 페이즈가 화면을 갈아끼우면 **이 세 스펙이 깨질 수 있다** — 선택자를 새 마크업에 맞춰 고치는 일이 범위 안이다

### Established Patterns
- 4계층 경계를 `eslint-plugin-boundaries`로 강제한다: `app → app, domain, lib` · `domain → domain, repositories, lib` · `repositories → repositories, db, domain` · `db → db, lib` · `lib → lib, domain, repositories, db`. D-26의 `ui`는 여기에 다섯 번째 요소로 들어간다
- `any` 금지(`@typescript-eslint/no-explicit-any: error`), TypeScript 6 strict, 타입 정보 기반 규칙
- 커밋: 영어 접두어 + 짧은 요약, 본문 한국어. 한 커밋 한 의도
- pnpm만. 새 의존성은 이유 한 줄 + 승인
- 문서는 300줄 상한이 테스트로 고정돼 있다(`docs/ARCHITECTURE.md` · `docs/OPERATIONS.md`)
- CI는 `pull_request`(+`workflow_call`)만, `.planning/**`·`docs/**`만 바뀐 PR은 건너뛴다 — **주의: 이 페이즈는 `docs/design/SYSTEM.md`를 고치는 커밋(D-30·D-31)이 있는데 그 커밋만으로는 CI가 돌지 않는다**

### Integration Points
- `app/layout.tsx` — 서체 `<link>`(D-32) · 토큰 import(D-21) · 셸 삽입 · `SessionRefresh` 유지
- `eslint.config.mjs` `boundaries/elements` + `element-types` — `ui` 타입 추가(D-26)
- `package.json` scripts — `pnpm lint`에 stylelint 단계 추가(D-20). CLAUDE.md의 명령 4개(`dev`·`test`·`lint`·`build`) 문장이 Phase 1에서 확정됐으므로 그 형태를 깨지 않는다
- `docs/ARCHITECTURE.md` — `ui` 계층을 4계층 설명에 반영(300줄 상한 안에서)
- `public/fonts/pretendard/` — 신규(D-32). 3.1MB·92개 파일이 리포에 들어간다. `.gitignore`·Dockerfile `--ignore-scripts` 빌드·Cloud Run 이미지 크기에 영향
- Phase 3이 교체할 지점: D-23의 역할→메뉴 매핑 한 곳(계급 5종·정보 노출표)
- Phase 4가 채울 지점: D-22의 빈 라우트 EMPTY 자리 + §7-3 표 컴포넌트
- Phase 7이 채울 지점: D-31의 알림함 계약 → 구현

</code_context>

<specifics>
## Specific Ideas

- 사용자는 이번 논의의 모든 항목에서 **권장안을 택했다.** 방향을 요약하면: 의존성을 늘리지 않고(D-19 CSS Modules, 새 런타임 의존성 0), 규칙은 사람이 아니라 도구가 지키게 하며(D-20 stylelint + CI, D-26 boundaries `ui` 계층), 중복 출처를 만들지 않고(D-21 복사본 0, D-27 SYSTEM.md가 기준), 추측으로 만들지 않는다(D-25 표 제외, D-24 가짜 데이터 없음).
- **문서가 코드보다 먼저다.** D-30·D-31에서 `SYSTEM.md`의 빈 곳을 먼저 메우고 그 다음에 화면을 쓴다 — 코드를 먼저 만들고 문서를 역으로 맞추는 안은 명시적으로 거부했다(UX-01의 "SYSTEM.md를 먼저 확정하고").
- **빈 화면도 계약대로 동작하는 화면이다.** D-22·D-24·D-28의 공통 논리 — 데이터가 없는 것과 화면이 미완성인 것은 다르다. §7-4·§7-7이 "0이면 어떻게 보이는가"를 이미 규정했으므로, 그대로 만들면 Phase 4~9는 데이터만 꽂는다.

</specifics>

<deferred>
## Deferred Ideas

- **회사 도메인 연결**(예: `erp.plant8.co.kr`) — Phase 1 이월 항목이 "Phase 2~3, 직원 공개 전"이었다. **Phase 3으로 확정**한다. 직원 공개는 계정·권한(Phase 3)이 선 뒤이고, 이 페이즈는 화면만 다룬다. `deploy.sh`에 선택 인자 자리는 이미 있다. 서울 리전 Cloud Run 도메인 매핑 가능 여부는 그때 확인한다
- **표(§7-3) 컴포넌트 구현과 라이브러리 선택** — Phase 4(UX-04·UX-05). 동작 계약은 이 페이즈 시점에 `SYSTEM.md` §7-3에 이미 다 있다
- **알림함 구현** — Phase 7. 계약만 D-31로 이 페이즈에서 쓴다
- **PC 480 모달(§7-8)** — 수요가 생기는 페이즈(반려 확인 = Phase 5)
- **손익 대시보드 화면**(`system/dashboard-ceo.html`·`dashboard-team.html`) — Phase 9
- **인쇄 라우트 `/print/…`**(`system/print-expense.html`·`print-cert.html`) — Phase 5·11. 실물 두 개를 그대로 옮긴다
- **외부 수령자 화면**(`system/external-cert.html`) — Phase 11
- **「더보기」 시트의 검색(`⌘K` 명령 팔레트)** — 검색 대상 데이터가 생기는 페이즈. 이 페이즈는 자리만 둔다
- **다크 모드** — `tokens.css`에 `prefers-color-scheme`이 없다(있는 `@media`는 `max-width`·`prefers-reduced-motion`·`print` 셋뿐). 이번 논의에서 다루지 않았다. 필요가 생기면 `DECISIONS.md`에 기록하고 토큰 재정의로 연다

</deferred>

---

*Phase: 02-디자인 시스템·앱 셸*
*Context gathered: 2026-09-19*
