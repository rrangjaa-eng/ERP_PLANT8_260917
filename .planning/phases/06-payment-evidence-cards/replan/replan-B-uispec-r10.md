# 06 재계획 B — UI-SPEC rev 10 · 디자인 시스템 기준으로 플랜 25개에서 바꿀 것

> 읽기 전용 조사(2026-10-05). 리포 `ERP_PLANT8_260917` · 브랜치 `claude/06-ui-spec-revision-oju6s5` · HEAD `90fcd1c8`(`origin/main` = `341537c1` 포함). 리포 파일 수정 0 · 커밋 0 · `mcp__hearthbot__` 호출 0.
> 대상: `.planning/phases/06-payment-evidence-cards/06-UI-SPEC.md` **rev 10**(1508줄 — `072b3bc4` rev 10 · `b1118415` r2 · `b9a572d1` 밤 위임 5건 사용자 확정) 대 `06-01`~`06-25` PLAN 25개(2026-09-26 작성, UI-SPEC rev 8/9 기준, `7eb6c2ad`로 이 브랜치에 들어온 뒤 **한 줄도 안 바뀜**).
> 이 파일은 재계획 담당이 읽는 입력이다. 05 쪽 실제 이름 대조는 `replan-A-05-names.md`, 플랜 인벤토리·파일 겹침은 `replan-D-plan-inventory.md`가 맡았고 여기서 되풀이하지 않는다(필요한 자리에서만 가리킨다).

**인용 표기**(전부 조립할 때 실제 줄과 대조해 검증한 줄 번호다 — §7): `CL` = `CLAUDE.md` · `FE` = `.claude/rules/frontend.md` · `DESIGN` = `docs/DESIGN.md` · `SYSTEM` = `docs/design/SYSTEM.md` · `DECISIONS` = `docs/design/DECISIONS.md` · `CHECKLIST` / `design-gate/SKILL` = `.claude/skills/design-gate/` · `UI-SPEC` = 위 06-UI-SPEC.md · `design-review-rev10` · `codex-design-review-rev10` · `design-apply-cross-r2` = 같은 폴더의 검토 파일 · `ListScreen.tsx` `SidePanel.tsx` `PanelForm.tsx` `ConfirmDialog.tsx` `status-map.ts` = main `ui/` 소스 · `06-NN:줄` = `.planning/phases/06-payment-evidence-cards/06-NN-PLAN.md`의 줄 · `.continue-here` `06-CONTEXT` `design-review(rev 9)`(= `design-review.md`) = 같은 폴더 파일 · `ROADMAP` `REQUIREMENTS` = `.planning/` · `reconcile` = `/mnt/project-files/06-prep/reconcile.md` · `evidence-in-approval-rule` = `/mnt/project-files/05-prep/evidence-in-approval-rule.md` · `gsd-plan-checker` = `.claude/agents/gsd-plan-checker.md` · `plan-phase.md` `ui-consideration-probe.md` = `.claude/gsd-core/` 아래 · `*.test.ts` = `test/unit/` 아래(경로는 §1.5).

## 0. 한눈에 (핵심 발견)

1. **rev 10은 Phase 6 화면 계약을 04.6 「스킨 A」 디자인 시스템 · 05 「결재 중 증빙」 결정 · 사용자 결정 Q2~Q7(10/5 00:55)에 맞춘 개정이다** — 바뀐 것 열 가지는 UI-SPEC:24-34에 있고(§2.1), 플랜은 그 어느 것도 반영하지 않았다.
2. **플랜 25개 어디에도 화면 틀 이름이 없다**: `ListScreen` · `DetailScreen` · `SidePanel` · `PanelForm` · `status-map` · `design-gate` · `evidence_attach` · `evidence_void` · `voided_at` · `공용 카드` · `실행가 초과` · `짝 격자` · `SP-8` · `screen-frames` · `tokens.test` · Q2~Q7 표기 · 05-xx 플랜 id는 **0건**이다(전수 grep). `hasEvidence`만 06-25에 10줄 있는데 UI-SPEC의 「한 서버 함수」가 아니라 카드 목록 DTO 불리언 이름이다(§2.5 C4).
3. **`PageHeader`를 쓰는 곳이 플랜 3개 4줄이다**: 06-01:186 · 06-21:34 · 06-21:189 · 06-23:262. main에서는 `test/unit/ui/screen-frames.test.ts`가 `PageHeader` 직접 import와 틀 없는 `page.tsx`를 위반으로 잡는다(screen-frames.test.ts:66-74). 새 화면(`/cards/purchases` · `/projects/issue-requests` · 지급 대상/지급 완료 보기)은 전부 `ListScreen`이다.
4. **옆 패널 전환**: 법인카드 사용 등록·수정(S9) · 구매 요청 신청(S12) · 구매 완료(S13)는 rev 9의 「페이지 폼」에서 `SidePanel` + `PanelForm` 옆 패널이 됐다(UI-SPEC:26 · UI-SPEC:728). 플랜 06-05 · 06-07 · 06-08 · 06-09 · 06-12 · 06-14 · 06-25가 `card-usage-form.tsx` · `purchase-request-form.tsx` 페이지 폼을 전제한다. **S13 라우트가 바뀐다**: `/cards?new=1&purchase={id}` → `/cards/purchases?purchase={id}`(UI-SPEC:831).
5. **SP-1 · SP-4 · SP-8은 DECISIONS/SYSTEM에 없다 — UI-SPEC에만 있다**(§0.1). 06-01이 DECISIONS에 처음 쓰고 SYSTEM으로 올려야 한다. 그런데 06-01:26는 철회된 SP-6를 포함하고 SP-8이 없으며, 검사 명령도 `SP-[1-7]`이다(06-01:193 · 06-01:199) — rev 10 기준 승격 id는 **1 · 2 · 3 · 4 · 5 · 7 · 8**(일곱, 6 빠짐)이다.
6. **주인 없는 두 컴포넌트 일이 있다**: ① `ListScreen.primaryAction` **버튼 갈래**(SP-1 — 지금 링크 갈래뿐, ListScreen.tsx:13; 06-15의 1차 `지급 완료 N`이 필요) ② `ui/confirm-dialog` **검색 고르기 갈래**(SP-8 — 지금 `options` 갈래는 1차가 없다, ConfirmDialog.tsx:58; S10 「바꾸기」 목록이 필요, 06-07 4웨이브 앞). 06-17은 SP-7 `attachments` 슬롯만 맡는다(06-17:51). 06-15는 이미 `files_modified` 14개라 `ListScreen.tsx`와 그 단위 테스트를 더하면 16이 되어 플랜들의 「16번째 파일에서 멈춤」 방아쇠에 걸린다(§2.5 C10).
7. **상태 낱말은 `ui/status-tag/status-map.ts` 한 표다**(UI-SPEC:250). 06-01은 새 `app/(app)/status-display.ts` · `test/unit/status-display.test.ts`를 만들고 06-03 · 06-20 · 06-22가 그 파일을 읽는다(34줄 — `.ts` 25 + 테스트 9, §5.2). 낱말 이름도 바뀐다: `신청`/`요청` → **`신청됨`** · 문서 단위 `없음` → **`증빙 없음`**(필수 off는 빈 값 `—`) · 견적 줄 `구매 요청` → **`구매 요청 중`** · P3 막힘 이유 `담당 PM` → **`기안자`**(S18 완료 전 점검은 `담당 PM` 그대로).
8. **옛 토큰 이름 41히트(35줄)** — `--faint --muted --danger --warning --success --fs-xs/sm --line-strong --modal-w`(§5). 모두 `tokens.css` 정의 0이고 `tokens.test.ts`가 부재를 단언한다. `.num` 클래스 3줄은 `ui/num/Num` 컴포넌트로(UI-SPEC:167).
9. **토스트 57줄이 낡았다**(활성 50 + 판정 기록 7): rev 10은 **Phase 6에서 `ui/toast`를 쓰지 않는다**(UI-SPEC:177). 결과는 패널 `role="status"` 결과 한 줄 · 표 위 결과 줄 + 3차 `되돌리기`(SYSTEM:1008)다 — S8 카드 사용 삭제 · S11 본인 취소 · S21 · S22 증빙 삭제.
10. **증빙 판정(05 결정 「결재 중 증빙」)**: 증빙 유무는 **한 서버 함수 `hasEvidence`**, 살아 있는 파일 = `removed_at IS NULL AND voided_at IS NULL`(UI-SPEC:62 · UI-SPEC:67). 06-11의 「PM 증빙 변경이 확인을 풀고 version을 올린다」 훅(06-11:36)은 범위가 틀리다 — 확인을 푸는 길은 **기안자 추가(승인 뒤) · 시스템 관리자 무효** 둘뿐이고 결재 중에는 아무도 못 뗀다(§2.3 S4 · S7).
11. **Q2~Q7이 플랜에 0건이다**: Q2 구매 완료 취소 없음 · Q3 카드·구매 요청도 **실행가 초과 막힘** · Q4 지급 방식↔증빙 종류 짝(서버 규칙 `payment.method-evidence-mismatch` 가칭 + 설정 키 + 짝 격자) · Q5 **공용 카드** · Q6 사용일 오늘까지/지급일 미래 허용 · Q7 카드 매출 그대로. **Q5는 `db/schema/`(위험 경로)를 만져 별도 PR(사용자 머지)이어야 하는데** UI-SPEC은 「06-05가 `공용` 갈래를 더한다」(UI-SPEC:735)고 하고 06-05 `files_modified`에는 스키마 · 도메인 · 관리자 폼이 없다.
12. **r2 지적 중 어떤 플랜에도 없는 것**: F2(금액 빈 `확인 전`) · F5(행동 뒤 포커스) · F6(구매 완료 뒤 포커스) · F7(합계 줄 이체액 굵게) · F9(`예정 지급` 그룹) · F10(S21·S22 증빙 삭제 `되돌리기`) · F15(S11 링크 44×44) · R1/N3(제자리 확인 자동 선택 조건) · R2 · R3 · R6(활성 카드 0장) — §2.2 X11.
13. **설정 5번째 키와 짝 격자(S20)**: 06-02:38 · 06-02:121가 「새 키는 화면 코드 없이 나온다」를 전제한다. rev 10은 키 `지급 방식 · 증빙 종류 짝`과 **새 입력 모양 「짝 격자」**(O-23, 「06-02/03 계획이 SP로」 — UI-SPEC:937)를 요구한다 — 입력 모양이 SYSTEM §7-2에 없으니 SP 하나가 더 필요하다(§2.5 C7).
14. **`design-gate` 점검표**: 화면 파일을 만지는 커밋마다 `docs/design/checks/<날짜>-<작업>.md`가 있어야 훅이 통과시킨다(design-gate/SKILL:26). 화면 플랜 20여 개 어디에도 이 단계가 없다(0건) — 플랜의 acceptance에 넣어야 한다(§1.5).
15. **반려·회수 종결**: UI-SPEC rev 10에는 **화면도 흐름도 없다**(§3). 05 브랜치 커밋 `317d6413`의 todo + `06-CONTEXT.md:11` 한 문장이 06으로 넘긴 것이 전부이고, 이 브랜치의 `06-CONTEXT.md`와 로드맵 · 요구사항 · 플랜 25개에는 흔적이 없다.
16. **UI Considerations 199행**(147 explicit · 52 backstop · unresolved 0): rev 10이 25행을 더하고 41행을 고쳤다. 플랜 쪽 옮김은 171행에만 대응이 보이고 **28행은 대응이 안 보인다**(기계 추정 — §6).
17. **b9a572d(밤 위임 5건 사용자 확정)**: F3 `구매 요청 중` · F8/O-23 짝 격자 · F9 `예정 지급` 그룹 · F10 증빙 삭제 `되돌리기` · C1 합계 14 굵게 — 문구와 배치만 확정했고 구조는 안 바꿨다(§4.1). `/plan-eng-review`는 재계획 뒤 1회가 남아 있다(CL:81).
18. **UI-SPEC의 SYSTEM 줄 인용은 §7-15 이후에서 +1 어긋난다**(실측: UI-SPEC가 적은 §7-15 :1147 · §7-16 :1186 · §7-17 :1210 · §7-20 :1240 · §9 :1272의 실제 머리는 :1148 · :1187 · :1211 · :1241 · :1273이다 — §7-10 :1020까지의 인용은 맞다) — 재계획은 줄 번호가 아니라 절 이름으로 인용할 것(§2.5 C12).

### 0.1 전제 정정 — DECISIONS.md에 SP-1 · SP-4 · SP-8 항목은 아직 없다

의뢰서는 `DECISIONS.md`에 SP-1 · SP-4 · SP-8 항목이 있다고 적었으나, 이 브랜치의 `docs/design/DECISIONS.md`(1775줄)와 `docs/design/SYSTEM.md`(1340줄)에는 `SP-[0-9]`가 **0건 · 0건**이다. SP-1~SP-8은 UI-SPEC 「시스템 변경 제안」 절(UI-SPEC:1068 — SP-8 끝 UI-SPEC:1129-1133)에만 있고, UI-SPEC 스스로 「이 문서는 두 파일을 고치지 않는다 — 계획의 첫 태스크가 DECISIONS → SYSTEM 순서로 옮긴다」(UI-SPEC:1068 · UI-SPEC:1071)고 한다. 그래서 §1.6의 SP 표는 「이미 있는 DECISIONS 항목」이 아니라 **「승격 대상 제안」의 id · 제목 · UI-SPEC 줄 범위 · 받을 SYSTEM 절**이다. DECISIONS에 이미 있는 옆 패널 관련 기록(2026-10-02 항목)은 §1.6 첫 표에 따로 적었다.

### 목차

1. 지켜야 할 규칙(CLAUDE.md · frontend.md · DESIGN.md · SYSTEM.md · design-gate · DECISIONS.md와 SP 승격)
2. UI-SPEC rev 10 변경 로그 → 플랜 조치 (2.1 개정 기록 · 2.2 가로지르는 변경 · 2.3 화면별 S1~S22 · 2.4 플랜별 점검표 · 2.5 충돌·미결)
3. 반려·회수 종결
4. 열린·미결 항목 (design-review-rev10 · codex-design-review-rev10 · design-apply-cross-r2 · b9a572d)
5. 옛 토큰·낱말 이름 표
6. UI Considerations 199행
7. 검증 메모 (7.1 기계 대조 · 7.2 줄 번호 기준 · 7.3 재현 명령 · 7.4 추정인 곳 · 7.5 하지 않은 일)

**읽는 순서 권고**(재계획 담당): §0 → §2.5(충돌 C1~C14 · 판단 J1~J8 — 사용자에게 한 번에 물을 것) → §4.4(시작 전에 받는 열 가지) → §2.4(자기 플랜 몫) → §5(일괄 치환 표) → §6.1(`must_haves`로 옮길 문장). §1은 규칙 사전(어기면 훅 · 기계 검사 · 리뷰가 잡는 것), §2.2 · §2.3은 근거, §3은 반려 · 회수 종결, §7은 검증 · 한계다.

## 1. 지켜야 할 규칙 (파일:줄 — 재계획 · 실행 플랜이 어기면 훅 · 기계 검사 · 리뷰가 잡는 것)

한 줄 = 한 규칙. 「플랜에서」 칸은 재계획이 플랜 문장으로 옮겨야 하는 모양이다.

### 1.1 CLAUDE.md

| 규칙 | 줄 | 플랜에서 |
|---|---|---|
| `.planning/` 수동 편집 · `git push --force` · 프로덕션 DB 직접 명령 금지 | CL:16 | PLAN 고치기는 GSD 재계획 흐름으로만 · 실행 플랜 acceptance에 force push 없음 |
| 새 색·서체·radius 생성 · 화면 하나만 예외 · 스크린샷 육안 판정 · `SYSTEM.md` 없이 화면 만들기 금지 | CL:23 | 화면 플랜의 acceptance = 토큰 diff 0 + DOM 실측(§1.5) |
| 위험 경로(`db/migrations/` · `db/schema/` · `domain/permissions/` …) PR은 사용자가 머지, 위험 경로 변경은 별도 PR로 떼어 나머지가 무인으로 흐르게 한다 | CL:105 · CL:24 | Q5 `공용` 카드(스키마) · 설정/메뉴 키(`domain/permissions/`)는 별도 PR 플랜(§2.2 X10) |
| 플랜은 크게(coarse) — 플랜 하나가 세션 · 게이트 · CI 한 바퀴 | CL:80 | 체커 `Files/plan` 표는 15+를 막음으로 보지만(gsd-plan-checker:325) 플랜들은 15까지 「규모 근거」로 받아들이고 16번째 파일에서 멈춘다(06-16:411) — 06-15는 버튼 갈래 + 테스트로 16(§2.5 C10) |
| 계획 게이트: `/plan-eng-review` 1회(UI 포함 시 `/plan-design-review` 1회), 지적 반영 뒤 재검토 최대 1회 | CL:81 | 재계획 뒤 eng 1회 필요(§4.1) — design 1회는 rev 10 r2에서 끝남 |
| UI 포함 시 `docs/DESIGN.md` 읽기 — `SYSTEM.md`가 있으면 §4만 적용 | CL:82 | 화면 플랜 `read_first`에 SYSTEM 절 이름(줄 번호 아님 — §2.5 C12) |
| 세션은 독립 검토 경계(계획 완료 뒤 · 게이트 리뷰 종료 뒤)에서만 끊는다 | CL:87 | 재계획 완료 = 끊는 지점(실행 전 독립 게이트 리뷰) |
| 실행자 Sonnet 기본, `risk:` 태그(돈 · 권한 · DB 잠금 · 마이그레이션)만 Opus 실행자 + Opus 독립 검토 1명, 화면 플랜은 독립 DOM 감사 | CL:88 | 25개 모두 `risk:` 없음(`replan-D` §0 항목 3) — 위험 경로 11개 플랜은 태그 필요 |
| 실행 중 Superpowers 스킬 호출: 디버깅 전 `systematic-debugging` · 완료 전 `verification-before-completion` · 구현 전 `test-driven-development` — 서브에이전트 프롬프트에도 명시 | CL:89 | 플랜 task `<action>`에 스킬 호출 문장 |
| Post-build 게이트: 문서 · 계획만 = 없음 / 코드 = `/review` / 화면 영향 = `/review` + `/design-review` → `/qa` / 돈 · 결재 = `/review` + `/cso` | CL:94-97 | 화면 플랜 묶음(PR)마다 한 번 — 플랜마다 되풀이하지 않는다(CL:100) |
| 해당하는 게이트는 건너뛰지 않는다 · 절차 건너뛰기는 먼저 말하고 승인 | CL:100 · CL:108 | 재계획이 SP 승격 · design-gate를 줄이려면 사용자 승인 먼저 |
| TDD(실패 테스트 → 최소 구현 → 리팩터) · 실행 확인 없이 "완료" 금지 | CL:113 | behavior → RED 먼저 |
| 로컬 dev 통과는 완료 신호가 아니다 — 완료 판정은 `CI=true` | CL:114 | 화면 DOM 감사 · E2E는 `CI=true` |
| 작업 중 테스트 = lint · typecheck + 바뀐 파일 관련 단위 · 통합 + 건드린 화면 E2E만, 전체는 PR ready 때 CI 한 번 | CL:115 | 플랜 `<verify>`에 전체 통합 · 전체 E2E를 넣지 않는다 |
| 한 커밋 한 의도 · 새 의존성은 이유 한 줄 + 승인 · 시크릿 · `any` 금지 · 요청받지 않은 리팩터 금지 | CL:117-120 | DECISIONS 커밋과 SYSTEM 커밋 분리(06-01 acceptance가 이미 한다, 06-01:170) |
| 프론트엔드: 정본은 `frontend.md`, 기준은 `SYSTEM.md`, UI 완료 = `/design-review` → `/qa`, 검증 순서 = 싼 게이트 → 독립 DOM 감사 → 수정 → 전체 게이트 한 번 | CL:123-125 | §1.2 |
| Codex 디자인 검토는 `/design-review` · `/plan-design-review`에서만 | CL:126 | 06-01 ledger의 「Codex 대신 Opus」 문장(06-01:291)은 낡았다 |
| 화면 사용성 원칙(안내 문구 최소 · 결정 최소 · 행동 유도)과 UI-SPEC · 플랜 · 디자인 검토의 점검 물음 | CL:129-130 | UI-SPEC 「사용성 점검」 절(UI-SPEC:1137) |
| 서브에이전트를 띄울 때 `model`을 반드시 명시, 점검 · 계획 · 판단 · 검토는 Opus, 구현 · 테스트 실행은 Sonnet | CL:134 | 재계획 · 실행 지시문에 model 명시 |

### 1.2 `.claude/rules/frontend.md` (CLAUDE.md §6 · §7의 정본)

| 규칙 | 줄 |
|---|---|
| 모든 화면의 기준은 `docs/design/SYSTEM.md`(통째로 읽지 말고 목차 → Grep → 범위 Read), 없으면 화면을 만들지 않고 `DESIGN.md` §1부터 | FE:11 |
| 화면 파일(`app/`의 `.tsx` · `.css`, `ui/`, `docs/design/`)을 고치기 전 `design-gate` 스킬 호출(훅 강제) — 화면 코드 커밋에는 빈칸 없는 점검표 `docs/design/checks/<날짜>-<작업>.md` | FE:12 |
| 새 화면 · 컴포넌트는 `DESIGN.md` §4 절차, 새 색 · 서체 · radius 생성 금지, 토큰은 `tokens.css`에서만 | FE:13 |
| 시스템을 벗어나야 하면 `DECISIONS.md`에 이유를 기록한 뒤 `SYSTEM.md`를 고친다 — 화면 하나만 예외 금지 | FE:14 |
| UI 완료 판정 = `/design-review` → `/qa`, 묶음(PR)마다 한 번 | FE:15 |
| 검증 순서 = 싼 게이트 → 독립 DOM 감사(실행자가 아닌 별도 Sonnet 에이전트, `CI=true`, 스크린샷 육안 금지) → 수정 → 전체 게이트 한 번(= CI) | FE:16 |
| 컴포넌트가 된 계약은 지켜지고 산문으로 남은 계약은 어긋난다 — 반복 지적(폰 44px · 320px 넘침 · 포커스 링)은 E2E로 | FE:17 |
| 안내 문구는 최소 — 오류 · 되돌릴 수 없는 작업 · 잠김에만 한 줄, 무엇을 하면 되는지(명사형, PR #87 규약). 빈 화면에는 설명 대신 첫 행동 버튼 | FE:21 |
| 사용자 결정 최소 — 알 수 있는 값은 기본값(오늘 날짜 · 내 팀 · 이전 입력값), 계산할 수 있는 것은 묻지 않는다, 할 수 없는 선택지는 숨기거나 비활성, 확인 창 대신 되돌리기(확인은 되돌릴 수 없는 일에만) | FE:22 |
| 행동은 동작 · 컴포넌트 · 디자인으로 — 화면마다 주 버튼 하나, 순서 있는 일은 단계, 형식을 잡는 입력 칸, 키보드만으로 엑셀처럼, 상태는 색 · 배지, 위험한 동작은 떨어뜨려 | FE:23 |

### 1.3 `docs/DESIGN.md` §4(통일) · §6(품질 바닥)

| 규칙 | 줄 |
|---|---|
| ① `SYSTEM.md` 레이아웃 템플릿 중 하나에서 시작, 새 템플릿이 필요하면 먼저 `SYSTEM.md`에 추가 | DESIGN:89 |
| ② 새 색 · 서체 · radius · 그림자를 만들지 않는다(필요하면 제안 → 승인 → `tokens.css` → 사용) | DESIGN:90 |
| ③ 기존 컴포넌트를 먼저 찾는다 — 변형은 variant로, 새 컴포넌트는 두 곳 이상에서 쓰일 때만 | DESIGN:91 |
| ④ 카피는 카피 규칙대로, 같은 행동은 앱 전체에서 같은 단어 | DESIGN:92 |
| ⑤ 완료 전 §6 확인 + `/design-review` | DESIGN:93 |
| ⑥ 시스템을 벗어나야 하면 `DECISIONS.md`에 이유를 남기고 `SYSTEM.md`를 고친다 | DESIGN:94 |
| §6 품질 바닥: 360–1440px · 키보드 전 행동 · `:focus-visible` · 대비 4.5:1 / UI 3:1 · `prefers-reduced-motion`, 실제 데이터(긴 이름 · 큰 금액 · 빈 값)로 확인 | DESIGN:105-106 |
| §7 연결: §4 통일 = `design-gate` 점검표 → 독립 DOM 감사 → `/design-review` → `/qa` | DESIGN:115 |

### 1.4 `docs/design/SYSTEM.md` — Phase 6 화면이 읽는 절(절 이름이 정본, 줄은 이 브랜치 기준)

| 무리 | 규칙 한 줄 | 줄 |
|---|---|---|
| **한 건 폼 = 옆 패널** | 한 건 등록 · 수정 폼은 옆 패널(PC 오른쪽 `--panel-w` 480 · 폰 아래 시트)이고 견적 줄 입력에는 쓰지 않는다. 배치는 둘 — 페이지 배치(`--form-max` 720)와 옆 패널 배치, 둘 밖의 폼은 없다 | SYSTEM:455 · SYSTEM:488 |
| 〃 | 한 열 · 라벨 위 · 칸 전폭(칸 폭 3종은 페이지 배치에만) · 입력 높이 `--control-h-panel` 40 · 머리 = 제목 `--text-subtitle`(실제 동작) + 글자 없는 닫기 x · 행동 줄 아래 고정, DOM · Tab · 시각 순서 = 2차 「취소 Esc」 → 1차 · 제출 중 1차 `aria-disabled` | SYSTEM:488 |
| 〃 | 제출 뒤: 등록 = 패널 열린 채 칸 비움 + 첫 칸 포커스 + 행동 줄 위 결과 한 줄(`role="status"`), 수정 = 닫힘 + 포커스가 그 행 「수정」, 상세 화면이 있는 새 대상은 상세로 이동 | SYSTEM:489 |
| 〃 | 닫기는 `requestClose` 한 경로(Esc · x · 「취소」 · 가림막 · 성공) — 바뀐 칸이 있으면 「입력 버리기」 확인 창(`ConfirmDialog`), 가림막 누르기는 무시, 열려 있는 동안 뒤 스크롤 잠금 · Tab은 패널 안에서 | SYSTEM:490 |
| 〃 | 모든 옆 패널이 뒤를 막는다(네이티브 모달 · `aria-modal` · 뒤 `inert` · `--scrim-panel`, 폰 시트는 `--scrim-dialog`) — 여는 요소(목록 1차 · 행 「수정」)는 렌더에서 빼지 않는다 | SYSTEM:1010 |
| 〃 | 언제 무엇을 쓰나: 모달 = 되돌릴 수 없는 일 확인 · 「바꾸기」 목록 · 근거 한 칸(한 건 폼은 쓰지 않는다), 옆 패널 = 목록을 보며 한 건을 등록 · 수정 | SYSTEM:994-995 |
| 〃 | 토글 URL = 같은 검색 파라미터(`?new=1` · `?editId=`), 등록 폼은 목록 위에 상시 렌더하지 않는다, 닫기는 파라미터를 지운 목록 URL | SYSTEM:415 |
| 〃 | 틀 계약: `SidePanel` + `PanelForm` — 제목 + 닫기 x · 본문 · 아래 고정 행동 줄, 1차 = 제출(`Ctrl+Enter`) · 2차 = 「취소 Esc」 · 3차 없음 | SYSTEM:1249-1250 |
| **두 단 토큰 이름** | 원시 층(`--g-*` `--n-*` `--red-*` `--amber-*` `--blue-*` `--ink-a*`)은 `tokens.css` 안에서만, 화면 · 컴포넌트는 역할 이름만 쓴다(`--surface-*` `--text-*` `--border-*` `--accent*` `--status-*` `--radius-*` `--shadow-*` `--scrim-*`) | SYSTEM:81 · SYSTEM:96-105 |
| 〃 | 크기 · 폭 역할 토큰: `--row-h` 44 · `--panel-w` 480 · `--dialog-w` 480 · `--touch-min` 44 · `--field-w-*` · `--form-max` · `--fw-regular/medium/bold` | SYSTEM:105 · SYSTEM:175 |
| 〃 | **화면 CSS(`app/**`)는 `font-size`에 `--text-body` · `--text-aux` · `--text-tag` 셋만**, 제목 · 부제 크기는 틀 컴포넌트(`ui/`)가 낸다. `font-weight`는 `--fw-*`만 | SYSTEM:163 · SYSTEM:175 |
| 〃 | 옛 이름(`--bg --surface --fg --muted --danger --warning --success --faint --fs-* --modal-w --row-min --line-strong`)은 정의 0, `tokens.test.ts`가 부재를 단언한다 → §5 표 | SYSTEM:115 |
| 〃 | 대비: 허용 쌍은 4.5 이상, **금지 쌍**(`--text-faint` × `--surface-selected` 4.26 · `--status-success` × `--surface-selected` 4.18 · `--status-success` × `--status-danger-weak` 4.49), UI 경계 3:1 | SYSTEM:111-113 |
| **섹션 선 · 제목 크기** | 섹션 시작 = 위 `1px solid --border-row`(2px 섹션 선 없음), 2px는 포커스 링 · 현재 탭 인셋 · 오류 셀 인셋 · 3차 버튼 호버 밑줄뿐 | SYSTEM:256 · SYSTEM:262 |
| 〃 | 크기 위계: `--text-title` 22 = 화면 제목 1개 · `--text-subtitle` 18 = 옆 패널 · 모달 · **상세 섹션 제목** · `--text-body` 14(폰 15) · `--text-aux` 13 · `--text-tag` 11 — 본문 위계는 3단계, 보조(aux · tag · KPI)는 위계 밖 | SYSTEM:167-171 · SYSTEM:176 |
| 〃 | `DetailScreen.Section` = 제목 `--text-subtitle` + 위 1px `--border-row`(부제 prop 없음 — 코드 `Section({ title, children })`) | SYSTEM:1247 |
| **상태 낱말 닫힌 표** | 상태 배지 색은 상태 역할 토큰 하나(`--status-danger` · `-warning` · `-accent` · `-success` · `-muted`), **낱말 → 색은 `ui/status-tag/status-map.ts`의 한 표**가 정한다 — 호출부는 `status` 낱말만(`kind` prop 없음), 표에 없는 낱말은 타입 오류 | SYSTEM:937 |
| 〃 | 표 상태 열은 색 글자만(`variant="text"`), 테두리 태그(`variant="tag"`)는 「내 차례」와 화면 제목 옆에서만, 태그 글자는 두~네 글자 명사(문장 금지) | SYSTEM:938-939 |
| 〃 | 낱말 추가는 §7-5 보강 항목으로 — Phase 4 · 04.3 · 04.1 선례(`진행` `현재` `완료` `미수주` `정산` / `접수 중` `닫힘` `제출됨` `신청됨` / `회수` `내 결재`) | SYSTEM:941-945 |
| **표 · 키보드 규칙** | 편집 표는 엑셀과 같은 키 — 셀 클릭/Enter 편집 · Tab/Shift+Tab · Enter 아래 · 방향키 · Esc 취소 · `Ctrl+C/V` · `Ctrl+Enter` 새 줄 · `Ctrl+S` 저장 | SYSTEM:831-832 |
| 〃 | 일괄 저장은 전부 저장 또는 전부 거부(실패 시 오류 셀) — **SP-1이 지급 표에 한해 행 단위 부분 처리를 더한다**(§1.6) · 화면 1차 「일괄 저장 Ctrl+S N」 하나가 그 화면의 모든 편집 표를 저장 | SYSTEM:835 · SYSTEM:901 |
| 〃 | `role="grid"` 키보드 계약 — 표 전체가 탭 정지 1개, 안에서는 방향키 로빙 `tabindex`, `Esc` 규칙 | SYSTEM:903-905 |
| 〃 | 행 높이 `--row-h` 44(PC · 폰), 세로선 없음, 그룹 머리글 행 `--surface-group` + `--text-group`, **편집 표**의 합계 행은 표 아래 `--surface-foot` | SYSTEM:825-827 |
| 〃 | 폰은 칸 접기(P1 · P2 · P3, P1 = 항목 + 금액 + 상태/행동 최대 3열), 가로 스크롤 · 카드 전환 금지, 폰에서 셀 편집 없음(행 탭 → 하단 시트) | SYSTEM:846-853 |
| 〃 | 줄 수 상한 · 30줄 페이지 · 붙여넣기 정규화 · 미저장 편집 복원은 견적 줄 표의 계약(06은 건드리지 않는다) | SYSTEM:911-913 |
| **목록 화면** | 목록 틀 = `ListScreen`: 제목 `--text-title` · **부제 없음** · 1차는 하나(필터 줄 오른쪽 끝, 밑줄 링크가 아니라 1차 버튼 모양) · 표는 흰 면 한 장 · 컨테이너 1280 왼쪽 정렬 | SYSTEM:403 |
| 〃 | 읽기 목록의 합계는 표 위 합계 줄(필터 줄 바로 아래 합계 면 — 라벨 `--text-aux` + 금액 `--text-subtitle` 700, **필터 전체 합**), 편집 표의 합계 행은 표 아래 | SYSTEM:409 |
| 〃 | 그룹 머리글로 나누고 50건씩 번호 페이지(`ui/pagination`), 필터는 표 위 한 줄, 열이 많은 표는 1280 · 1024 두 폭 아래에서 숨길 열과 순서를 선언 | SYSTEM:408 · SYSTEM:413 |
| 〃 | 빈 목록이면 `ListScreen`이 머리 1차를 숨기고 빈 화면 버튼 하나가 같은 등록 행동을 맡는다(DR5 A), 빈 화면 = 「무엇이 없다 · 다음 한 수」 한 줄 + 3차 | SYSTEM:1246 · SYSTEM:958 |
| 〃 | 행동 순위: 1차 = `primaryAction` 하나 · 2차 = 필터 줄 보조 행동 · 3차 = 행의 `RowActions`(삭제는 위험 색 글자 행동 링크, 맨 끝에 떨어뜨림) | SYSTEM:1246 · SYSTEM:768 |
| **다이얼로그** | 모달은 되돌릴 수 없는 일 확인에만, 위험 행동(삭제 · 반려)은 확인 모달 · 붉은 버튼 없음(버튼 면 규칙) — **같은 값으로 다시 넣을 수 있는 목록 행 삭제는 확인 없이 바로 지우고 표 위 결과 줄 `{대상} 삭제됨` + 3차 `되돌리기`**(`role="status"`, 포커스 → `되돌리기`) | SYSTEM:768 · SYSTEM:1008 |
| 〃 | 비활성 버튼은 이유를 옆에 글자로(이유 없는 비활성 금지), 이유가 있는 비활성 · 진행 중은 `aria-disabled="true"`(네이티브 `disabled` 아님 — 탭 순서에 남는다) | SYSTEM:763 · SYSTEM:765 |
| 〃 | 모달 · 시트는 `ui/confirm-dialog`로 — 화면마다 `<div>`로 다시 만들지 않는다. 슬롯 = 제목 · 부제 · 결과 줄 0~3 · 확인 근거 한 칸 · 막힘 이유 + 다음 한 수 · 2차(자동 파생) · 1차(`Ctrl+Enter`, 생략하면 목록형) | SYSTEM:1009 · SYSTEM:1216 |
| 〃 | 확인 모달 포커스 · ERROR · SUCCESS 계약(성공하면 바로 닫는다, 결과 줄을 따로 보이지 않는다) — **SP-7 · SP-8이 이 계약에 갈래를 더한다**(LOADING 없음 · 행 0이면 열지 않음과 다른 갈래) | SYSTEM:1218-1219 · SYSTEM:1225-1228 |
| 〃 | 팝업(좁은 뜻 = 팝오버 · 드롭다운)은 뒤를 막지 않는 잠깐 고르기, 시트 위 시트는 없다(결재 시트 → 확인 시트는 닫고 연다) | SYSTEM:993 · SYSTEM:1002 |
| **카피** | 버튼 = 실제 동작 · 결과 = 버튼과 같은 단어 · **오류 = 「원인 · 다음 행동」 짧은 명사형 한 줄(마침표 · 높임말 종결 금지)** · 다음 한 수가 권한 밖이면 담당을 적는다 · 안내 문구 없음 · 용어는 앱 전체에서 하나 | SYSTEM:1258-1267 |
| 〃 | 토스트: 화면 이동이 따르는 행동(제출 · 승인)만, **표 저장 결과는 토스트를 띄우지 않는다**(합계 행에 이미 있다) | SYSTEM:951 |
| 〃 | 다섯 상태(LOADING · EMPTY · ERROR · SUCCESS · PARTIAL)를 화면 · 컴포넌트마다 정한다(UI Considerations가 이 표의 Phase 6 판) | SYSTEM:955-961 |

### 1.5 `design-gate` 스킬 · CHECKLIST · 기계 검사

| 규칙 | 줄 |
|---|---|
| 화면을 만들거나 고치기 전 호출(훅 강제): CHECKLIST 전체 · `frontend.md` 사용성 원칙 · `BRIEF.md` · `SYSTEM.md` 해당 절 순서로 읽는다 | design-gate/SKILL:10-14 |
| 점검표 = CHECKLIST 틀을 `docs/design/checks/<YYYY-MM-DD>-<작업>.md`로 복사, 코드 쓰기 전에 현재 화면 기준으로 먼저 채운다 | design-gate/SKILL:17-18 |
| 화면 코드(`app/` · `ui/`의 `.tsx` · `.css`) 커밋에는 모든 항목이 `- [x]` + 항목마다 근거 한 줄인 점검표가 있어야 한다, **엄격 모드** = 커밋하는 화면 파일마다 점검표 「화면:」 줄에 그 파일/폴더가 있어야 한다 | design-gate/SKILL:25-27 |
| 점검표는 독립 DOM 감사 → `/design-review` → `/qa`의 대신이 아니라 앞이다 | design-gate/SKILL:28 |
| 사용자 디자인 결정 목록(바꾸지 않는다 — 바꾸려면 먼저 사용자에게): 견적 줄 엑셀식 · 한 건 폼 옆 패널 · 스킨 A · 실제 앱 화면으로만 비교 · UQ-8 · DR1(입력 버리기) · DR5(빈 목록) · ⑥ 합계 글자 14 굵게 | CHECKLIST:9-13 · CHECKLIST:19-25 · CHECKLIST:35 |
| 점검표 틀 항목: 안내 문구 · 결정 최소 · 할 수 없는 선택지 · 주 버튼 하나 · 위험한 동작 · 같은 말 두 번 · 빈 화면 · 키보드만 · 같은 종류 행동은 같은 모양 / 사용자 결정 / 새 토큰 없음 · 폰 320 · 실제 앱 화면 | CHECKLIST:51-67 |
| **기계 검사 ①** `test/unit/ui/screen-frames.test.ts` — 모든 `page.tsx`는 `ListScreen`/`DetailScreen`(또는 예외 경로)이고 `PageHeader` 직접 import 금지, 틀 이관 전 표시 래칫 0 | screen-frames.test.ts:55-74 |
| **②** `test/unit/design/tokens.test.ts` — 두 단 구조 · 웜톤 금지 · 역할 간격 `--s-*` 참조 · 대비 허용/금지 쌍 · 입력 테두리 · 옛 이름 없음 · 인쇄 접기 | tokens.test.ts:85-145 |
| **③** `test/unit/ui/status-map.test.ts` — 낱말마다 한 색 · 표 밖 낱말 타입 오류 · 같은 낱말 두 색 금지 | status-map.test.ts:43-81 |
| **④** `test/unit/error-copy-noun-style.test.ts` — 사용자에게 보이는 오류 문구에 높임말 종결 · 마침표 · 「~하지 못했습니다」 없음 | error-copy-noun-style.test.ts:111-147 |
| **⑤** `test/unit/design-system-docs.test.ts` — SYSTEM · DECISIONS 문서 구조 검사(SP 승격이 절 구조를 깨면 빨간불) | design-system-docs.test.ts:37-74 |

### 1.6 `docs/design/DECISIONS.md` — 기존 옆 패널 기록과 SP 승격

**이미 있는 DECISIONS 항목**(재계획이 인용만 한다):

| 항목 | 줄 | 내용 |
|---|---|---|
| 2026-10-02 한 건 등록 · 수정 폼은 옆 패널 | DECISIONS:1456 | 토글 URL은 그대로, 자리만 목록 위 → 옆 패널 · 모달에 폼을 넣지 않는다는 규칙의 대체 · Q1 A(뒤를 막는다) |
| 2026-10-02 토큰은 두 단계 | DECISIONS:1504 | 원시 층 + 역할 층 + `--underline-w-hover` |
| 2026-10-02 삭제 행동 링크 | DECISIONS:1541 | 위험 색 글자 + 떨어뜨림, 「붉은 버튼 없음」은 버튼 면 규칙으로 유지 |
| 2026-10-02 옆 패널 제출 뒤 · 닫기 · 빈 목록 등록 버튼 | DECISIONS:1553 | UQ-8 B · R9 D · DR1 A · DR5 A(사용자 답 인용) |
| 2026-10-02 「QR 생성 신청」 · 사람 등록 | DECISIONS:1569 · DECISIONS:1584 | R9 D의 예외 둘(Q2 · Q3) — 옆 패널 제출 뒤 동작의 선례 |
| 2026-10-02 스킨 A 「정돈」 · 표 머리글 아래 선 1px · 척도 확정 | DECISIONS:1432 · DECISIONS:1444 · DECISIONS:1518 | 1px 섹션 선 · 글자 크기 · 굵기 · 확인 창 폭 |

**승격 대상 제안 SP-1~SP-8**(UI-SPEC에만 있다 — §0.1). 「승격」 = ① `DECISIONS.md` 끝에 `## YYYY-MM-DD — 제목` 항목을 **먼저** 추가(항목 모양은 DECISIONS:1456-1466 — `결정` · `결정자` · `이유` · `버린 대안` · `범위`) → ② **다음 커밋**에서 `SYSTEM.md` 해당 절에 문장을 더하고 절마다 `(DECISIONS SP-n)`을 단다 → ③ 컴포넌트 · 테스트를 맞춘다. 순서는 DESIGN:94 · FE:14 · UI-SPEC:1071가 정하고 06-01 acceptance가 `git log` 순서로 검사한다(06-01:170).

| SP | 제목(UI-SPEC) | UI-SPEC 줄 | 승격 내용 → **받는 SYSTEM 절** | 코드 · 테스트 쪽 | 06-01 현재 |
|---|---|---|---|---|---|
| **SP-1** | §7-3에 「일괄 처리 표」 — 선택 열과 행 단위 부분 처리 | UI-SPEC:1073-1088 | 편집 표 variant `selectable`(맨 왼쪽 네이티브 체크박스 · 고른 행 `--accent-weak` · 머리글 = 이 쪽의 고를 수 있는 행 전체 · `Space` · 서버가 행마다 「고를 수 있음」), 1차 `{동사} N Ctrl+Enter`, **행마다 따로 커밋**(AS1)과 막힌 행 이유 줄, 결과 글자 `시:분 {동사} N건 · 막힘 N건`, 힌트 낱말 `고르기 Space`, rev 9 보강 넷(`aria-selected` = 활성 셀 뜻 · `selectable`에 새 줄 없음 · 처리 뒤 선택 · `aria-live` · 포커스) → **§7-3**(+ §7-9 힌트 낱말) · **`ListScreen.primaryAction` 버튼 갈래**(rev 10) → **§7-20** SYSTEM:1245 | `ui/table` `selectable`(06-15) · **`ui/list-screen` Button 갈래(주인 없음)** · 테스트 | 있음(rev 9 형태 — 06-01:27), 버튼 갈래 · `ui/table` 폭 식 없음 |
| SP-2 | §7-5 보강 한 줄 + `status-map.ts` 낱말 | UI-SPEC:1090-1094 | Phase 6 낱말(견적 줄 파생 · 증빙 확인 · 구매 요청 · 발행 요청)은 `status-map.ts`가 정본, 견적 줄 한 값 우선순위 `취소 > 반려 > 증빙 없음 > 지출결의 중 > 구매 요청 중 > 지급 완료 > 카드 사용 > 미착수`, `지출결의 중`은 `text` 변형만(「4자 이하」는 `tag`에만), 기존 낱말 `증빙 없음 · 반려 · 미착수 · 취소 · 신청됨` 재사용 → **§7-5**(보강 줄) | `ui/status-tag/status-map.ts` + `test/unit/ui/status-map.test.ts` + F16 대비 단언(`tokens.test.ts`) | `status-display.ts`로 잘못 잡음(06-01:25) |
| SP-3 | §6-3에 「제출 뒤 문서 화면」 | UI-SPEC:1096-1105 | 틀 `DetailScreen`, 한 열 `--form-max`, 읽기 칸 → 업무 섹션(`DetailScreen.Section`) → 행동 줄(`actions.primary` 하나, 상태 × 권한으로 정해짐 + 담당 표기), 제자리 편집 칸 저장 ① 1차가 입력을 가진 경우 ② dirty면 1차가 `{칸} 저장 Ctrl+Enter`로 바뀜 → **§6-3** | 문서 화면(06-03 · 06-04 · 06-06) | 있음(06-01:186) |
| **SP-4** | §6-1에 「하위 목록」 진입 규칙 | UI-SPEC:1107-1110 | 1차 메뉴 안의 하위 목록은 부모 목록 **필터 묶음 끝**의 3차 링크 `{목록 이름} {열린 건수}`(0이면 이름만)와 「내 차례」 두 곳에서 들어간다, 하위 목록도 `ListScreen`이고 **부제 없음**, 첫 사례 04-UI-SPEC B-13 `리저브 대장`, 적용 목록에 `/cards/purchases` · `/projects/issue-requests` 추가 → **§6-1** | 06-14(카드 목록 링크) · 06-21(프로젝트 목록 링크) | 있음 — 그러나 「PageHeader 부제 = 부모 메뉴」로 적었다(06-01:186) |
| SP-5 | §8 규칙 7 용어 추가 | UI-SPEC:1112-1116 | `지급 완료` · `이체액` · `지급 총액` · `차이`/`차이 사유` · `증빙 확인`/`증빙 면제` · `선결제` · `경영관리 등록` · `구매 요청`/`구매 완료` · `발행 요청`/`발행 줄` · `완료 전 점검` · `강행` → **§8 규칙 7** SYSTEM:1267 | 없음(문서만) | 있음 |
| SP-6 | ~~§7-10 「마지막 증빙 삭제」 확인~~ | UI-SPEC:1118-1119 | **철회(rev 10)** — 05 결정 뒤 확인이 걸릴 상태가 없다. `DECISIONS.md`에 올리지 않는다 | 06-11의 `lastEvidenceDeleteNeedsConfirm` · 「Destructive — 증빙 삭제」 모달 제거 | 아직 일곱에 포함(06-01:26) |
| SP-7 | §7-17 확인 모달에 「첨부 보기 칸」(읽기 전용) | UI-SPEC:1121-1127 | `ui/confirm-dialog` 슬롯 선택 칸 0~1, 부제 아래 · 결과 줄 위, 썸네일 72×96 + 파일명 · 장수 · 용량 + 3차 `크게 보기`, 보기만, 셋 넘으면 칸 안 스크롤, **상태 계약 둘**(열 때 LOADING `…` + 1차 `aria-disabled` · 새로 고침 뒤 열린 채 다시 세움) → **§7-17** | 06-17 `attachments` 슬롯 | 있음 |
| **SP-8** | §7-8에 「옆 패널 위의 고르기 목록」(rev 10) | UI-SPEC:1129-1133 | 옆 패널 안 「바꾸기」는 패널을 닫지 않고 **패널 위에** `ui/confirm-dialog` **검색 고르기 갈래**로 연다(PC 가운데 `--dialog-w` + `--scrim-dialog`, 폰 시트 위 시트, 겹침은 둘까지) · `Esc`/`취소`는 목록만 닫고 포커스를 누른 「바꾸기」로 · 컴포넌트 다섯(검색 칸 · 행 `disabled` + 2행 이유 · 현재 줄 `--fw-bold` + 왼쪽 2px `--accent` · 1차 `이 줄로 Enter` · 목록 LOADING/EMPTY 세 갈래/ERROR) → **§7-8** + **§7-17**(「열 때 LOADING 없음」 · 「행 0이면 목록형을 열지 않음」과 다른 갈래라 함께) | **`ui/confirm-dialog` 검색 고르기 갈래(주인 없음)** · 06-07 S10이 쓴다 | **없음** |

「승격 순서」는 UI-SPEC이 문장으로 못 박았다: **SP-1 · SP-4 · SP-8을 먼저 DECISIONS에 기록 → SYSTEM §7-3 · §6-1 · §7-8에 반영 → SP-2 낱말을 §7-5 + `status-map.ts`에 더함, SP-3 · SP-5 · SP-7도 같은 태스크에서 기록**(UI-SPEC:1071). 사용자 답으로 확정된 SP는 없다 — SP-1~SP-8은 Opus 설계 검토가 올린 제안이고, DECISIONS 항목의 `결정자` 칸에 쓸 사용자 인용이 지금은 없다. 06-01은 「UI-SPEC 원문의 내용 · 이유 · 버린 대안 그대로 한 항목」으로 커밋한다고만 한다(06-01:154) — **`결정자`를 무엇으로 적을지 재계획이 정해야 한다**(제안: UI-SPEC rev 10 `status: approved` · gsd-ui-checker APPROVED(UI-SPEC:10) + `/plan-design-review` 통과를 근거로 적고, 06-01에 사용자 확인 체크포인트를 둔다 — 06-01 Task 3과 같은 꼴, 판단 사항).


## 2. UI-SPEC rev 10 변경 로그 → 플랜 조치

### 2.1 개정 기록 (git log + 본문 개정 메모)

`git log -- 06-UI-SPEC.md`(이 브랜치). 플랜 25개는 `7eb6c2ad`(10-01 19:42, PR #124 스쿼시)에서 UI-SPEC rev 8/9와 함께 들어왔고 그 뒤 **`06-*-PLAN.md`를 건드린 커밋이 0건**이다(`git log -- '06-*-PLAN.md'` 결과 `7eb6c2ad` 하나).

| 커밋 | 시각(UTC) | 한 일 | 규모 |
|---|---|---|---|
| `7eb6c2ad` | 10-01 19:42 | rev 8/9 UI-SPEC + 플랜 25개 + 검토 기록이 이 브랜치에 들어온 기준점(이 폴더 39파일, +12,964줄) | — |
| `072b3bc4` | 10-04 16:28 | **rev 10** — 스킨 A · 05 「결재 중 증빙」 규칙에 맞춤(UI-SPEC만) | +524 / −405(929줄) |
| `b1118415` | 10-04 16:50 | **rev 10 r2** — `/plan-design-review` + Codex 검토 반영(rev 번호 그대로, 플랜이 「rev 10」을 인용) | UI-SPEC 105줄 · `design-review-rev10.md` 52줄 · `codex-design-review-rev10.md` 251줄 · `.claude/gates/phase-04.6.log` 1줄 |
| `b9a572d1` | 10-04 16:55 | 밤 위임 추천안 5건 **사용자 확정** 표시(F3 · F8/O-23 · F9 · F10 · C1 — 「문구, 배치 5건은 추천대로 해」, 10/5 01:53 KST) | UI-SPEC 6줄 · `design-review-rev10.md` 1줄 |

머리: `status: approved` · `revision: 10` · gsd-ui-checker APPROVED(UI-SPEC:10). 아래 표는 본문 「rev 10 — 바꾼 것만」 열 가지(UI-SPEC:24-34)를 플랜 25개의 현재 상태와 맞댄 것이다.

| # | rev 10이 바꾼 것 | 플랜 25개의 현재(전수 grep) | 처리 |
|---|---|---|---|
| 1 | 토큰 → 두 단 역할 이름 · 「2px 섹션 선」 → 1px `--border-row` · 합계 글자 18 → 14 굵게(UI-SPEC:25) | 옛 이름 41히트(35줄) · 2px `--line-strong` 1줄(06-16:194) · `.num` 3줄 | X1 · X12 · §5.1 |
| 2 | S9 · S12 · S13 → 옆 패널(UI-SPEC:26) | 페이지 폼 전제(`card-usage-form.tsx` · `purchase-request-form.tsx`) · `/cards?new=1` 19줄 · 모달 어휘 189줄 | X3 · X14 · §2.3 S9 · S12 · S13 · §5.3 · §5.5 |
| 3 | 상태 낱말 → `status-map.ts` 한 표, `신청` 대신 `신청됨`(UI-SPEC:27) | `status-display` 34줄(`.ts` 25 + 테스트 9) · `신청` 41줄 · `요청` 22줄 · `없음` 7줄 | X4 · §5.2 · §5.7 |
| 4 | 화면 틀 `ListScreen`/`DetailScreen.Section` · SP-1 재작성 · SP-1/4/8 승격(UI-SPEC:28) | 틀 이름 0건 · `PageHeader` 4줄 | X2 · X6 · §1.6 |
| 5 | Component Inventory = main `ui/` 27개(UI-SPEC:29) | `Form.Actions` 1줄(06-09:226), 나머지 `ui/` 이름 거의 없음 | X2 · X14 |
| 6 | 06-11 증빙 표면 = 05 「결재 중 증빙」, SP-6 철회(UI-SPEC:30) | 06-11 훅 · 마지막 삭제 모달 · `lastEvidenceDeleteNeedsConfirm` | X7 · §2.3 S4 · S7 · §2.5 C2 |
| 7 | 증빙 유무 = 한 서버 함수 `hasEvidence`(UI-SPEC:31) | 06-25 카드 목록 DTO 불리언 이름뿐 | X7 · §2.5 C4 |
| 8 | 칸 오류 문구 명사형(UI-SPEC:32) | 플랜이 못 박은 리터럴 `…불러오지 못했습니다` | §2.5 C13 |
| 9 | gap-audit 06 행 → Q2~Q7(UI-SPEC:33) | Q2~Q7 표기 0건 | X8 · X10 |
| 10 | r2 — 지적 F/R/N 반영 + 밤 위임 5건 확정(UI-SPEC:34) | 반영 0건 | X11 · §4 |

### 2.2 가로지르는 변경 X1~X14 (화면마다 되풀이되지 않게 한 번만 적는다)

각 항목: **rev 10**(UI-SPEC 줄) → **플랜 현재**(plan:줄) → **조치**. 화면별 적용은 §2.3, 플랜별 점검은 §2.4.

**X1 토큰 · 글자**
- rev 10: 화면 · 컴포넌트 CSS는 역할 토큰만, 새 토큰 0 · 옛 이름 0 · 원시 이름(`--g-*` `--n-*` `--red-*` `--amber-*`) 0이 검수 조건(UI-SPEC:150), `app/**` `font-size`는 `--text-body` · `--text-aux` · `--text-tag` 셋(UI-SPEC:209), 합계 금액은 읽기 목록 · 편집 표 **둘 다** `--text-body` 14 + `--fw-bold`(UI-SPEC:219).
- 플랜: 41히트(35줄) — `--faint` 11 · `--muted` 13 · `--danger` 6 · `--warning` 5 · `--success` 1 · `--fs-xs/sm` 3 · `--line-strong` 1 · `--modal-w` 1(§5.1). 굵기 숫자 `600`/`700` 4줄(§5.1 `--fw-*`).
- 조치: §5.1 표대로 바꾸고, 화면을 만지는 모든 플랜의 acceptance에 UI-SPEC 검수 grep(`app ui`에서 옛 이름 0건)과 `git diff docs/design/tokens.css` 0줄을 넣는다. 합계 글자 줄 · `tokens.test.ts` 대비 단언은 06-01(X13 · design-review C1 — §4.2).

**X2 화면 틀 · 기존 컴포넌트 먼저**
- rev 10: 목록 다섯(S1 · S3 = Phase 5 05-08의 `/expenses` 보기, S8 `/cards`, S11 `/cards/purchases`, S17 `/projects/issue-requests`)은 `ListScreen`, 문서 화면 · 상세 섹션(S4 · S5 · S15 · S16 · S18)은 `DetailScreen.Section`, 한 건 폼(S9 · S12 · S13)은 `SidePanel` + `PanelForm`, 확인 · 고르기는 `ConfirmDialog`(UI-SPEC:162 · UI-SPEC:158). `app/**` JSX에서 `<table>` · `<dialog>` 직접 금지(UI-SPEC:146).
- 기계 검사: `screen-frames.test.ts`는 모든 `page.tsx`에 틀 import를 요구하고 `PageHeader` import를 금지한다. 틀 없는 새 `page.tsx`는 「이관 전」 표시 줄이 있어야 통과하는데 표시가 있으면서 이미 틀을 쓰면 실패한다(screen-frames.test.ts:30-50) — 새 화면은 처음부터 틀로 시작하는 길뿐이다.
- 플랜: 틀 이름이 25개 어디에도 없다(`ListScreen` · `DetailScreen` · `SidePanel` · `PanelForm` · `RowActions` 0건). `PageHeader` 4줄(06-01:186 · 06-21:34 · 06-21:189 · 06-23:262). 홈 `/`는 main에서 이미 `ListScreen title="내 차례"`이므로 06-23:262의 「홈의 `PageHeader`」 단언은 대상이 없다.
- 조치: 새 라우트 둘(`/cards/purchases` · `/projects/issue-requests`) 플랜의 Task에 `ListScreen` 조립(`title`(부제 없음) · `filters` · `primaryAction` · `summary` · `empty` · `pagination` · `panel`)을 명시. `/expenses`는 05가 `app/(app)/expenses/page.tsx`를 지웠으므로 06-15 · 06-20의 파일 경로를 05 실물 기준으로 다시 잡는다(`replan-D-plan-inventory.md` §0 항목 5).

**X3 한 건 폼 = 옆 패널 (S9 · S12 · S13)**
- rev 10: 틀 = `SidePanel` + `PanelForm` + `Form layout="panel"`. 토글 URL — S9 `/cards?new=1` · `?editId=`, S12 `/cards/purchases?new=1[&line={id}]`, S13 `/cards/purchases?purchase={id}`(rev 9의 `/cards?new=1&purchase=` 대체). 칸은 한 열 · 라벨 위 · 전폭(칸 폭 숫자 3종은 페이지 배치 S4 · S5 · S6에만), 행동 줄 2차 `취소 Esc` → 1차(`Ctrl+Enter`), 바뀐 칸이 있을 때만 「입력 버리기」, 폰은 아래 시트(UI-SPEC:728-731 · UI-SPEC:813-816 · UI-SPEC:831-834).
- 제출 뒤: 등록 = 패널 열린 채 칸이 기본값으로 · 첫 칸 포커스 · 행동 줄 위 `role="status"` 한 줄(`카드 사용 등록됨 · 1,240,000` · `구매 요청됨 · 26001-C0001`), **토스트 없음 · 등록 `되돌리기` 없음**(rev 9 H-4 등록 되돌리기 철회, 지우는 길은 S8 행 `삭제` / S11 행 `요청 취소`). 수정 = 닫힘 + 포커스 → 그 행 `수정`. S13 성공 = 닫힘 + 포커스 → **다음 `신청됨` 행의 `구매 완료`**(없으면 화면 제목, `moveFocusToResult` — r2 F6)(UI-SPEC:728-745 · UI-SPEC:834).
- 플랜: 06-05 · 06-07 · 06-08 · 06-09 · 06-12 · 06-14 · 06-25가 `card-usage-form.tsx` · `purchase-request-form.tsx` 페이지 폼과 「저장 → `/cards`로 이동 + 토스트」를 전제한다(§5.3 · §5.4 · §2.3 S9 · S12 · S13).
- 조치: 칸 컴포넌트 하나(S9 · S13 공용 — UI-SPEC은 S13을 「S9 칸 재사용 · `PanelForm intent="edit"`」로 정한다)를 `SidePanel` 안에 올리는 구조로 06-05 Task를 다시 쓰고, 뒤 목록(S8 / S11)이 `panel` prop을 받게 한다. S13은 `/cards/purchases` 쪽 `page.tsx`가 연다(06-12 `files_modified`의 `app/(app)/cards/page.tsx` 진입 설명 정정). 패널 안 「바꾸기」는 SP-8(X6).

**X4 상태 낱말 = `ui/status-tag/status-map.ts` 한 표**
- rev 10: 새 `status-display.ts` 없음 — 낱말은 `status-map.ts`에 더한다(UI-SPEC:250). 재사용 낱말: `증빙 없음` · `반려` · `미착수` · `취소` · `신청됨`(`신청` · `요청`을 새로 만들지 않는다). 새 낱말 둘: `구매 요청 중`(F3, 견적 줄 한 값 — 행동 `구매 요청`과 낱말 충돌 해소) · `지출결의 중`(`text` 변형만, 「4자 이하」는 `tag`에만)(UI-SPEC:270-278 · UI-SPEC:1090-1094). 증빙 값 `없음` → 증빙 필수 on이면 `증빙 없음`, off면 빈 값 `—`(UI-SPEC:255).
- 플랜: 06-01이 `app/(app)/status-display.ts` · `test/unit/status-display.test.ts`를 만들고(06-01:25) 06-03 · 06-20 · 06-22가 읽는다(34줄 — §5.2). 낱말 이름 41 + 22 + 7줄(§5.7).
- 조치: 06-01은 `status-map.ts` 낱말 추가 + 기존 `test/unit/ui/status-map.test.ts`(낱말마다 한 색 · 표 밖 낱말 타입 오류)로 바꾼다. 읽는 쪽 세 플랜의 import를 `ui/status-tag`로. S18 점검 행 상태 글자 넷(`결재 중` `반려` `증빙 없음` `선결제 · 증빙 없음`)도 같은 표를 거친다(06-22:40).

**X5 토스트 → 결과 줄 · `되돌리기`**
- rev 10: 이 페이즈는 `ui/toast`를 쓰지 않는다(UI-SPEC:177) — 일괄 지급 = S1 결과 글자(`aria-live`), 지급 완료 · 지급 취소 = S5 1차 자리 결과, 패널 등록 = 패널 `role="status"` 한 줄, 패널 수정 · 구매 완료 = 바뀐 행, **행 삭제 · 본인 취소 = 표 위 결과 줄 + 3차 `되돌리기`**(§7-8 :1008)(SYSTEM:1008). `되돌리기`가 남는 곳은 S8 `카드 사용 삭제` · S11 `요청 취소`(본인) · S21 · S22 `증빙 삭제`(F10)뿐이다.
- 플랜: 토스트 57줄(활성 50 + 판정 기록 7 — §5.4) — 등록 · 수정 · 삭제 · 구매 요청 · 구매 완료 · 지급 완료 · 지급 취소 · 일괄 지급 토스트와 「등록 `되돌리기`」(06-09:46 · 06-14:38).
- 조치: §5.4 표대로. **되돌리기 수명이 바뀐다** — 토스트(몇 초)가 아니라 결과 줄이 다음 행동까지 남으므로 06-25 T-06-201(「되돌리기 뒤 중복」 수용, 근거 = 「토스트 수명 안」 — 06-25:361 · 06-25:409)의 수용 근거가 사라진다. 결과 줄이 언제까지 남는지 UI-SPEC 문장(UI-SPEC:693)대로 확인해 재판정한다.

**X6 주인 없는 컴포넌트 일 · SP 승격 대상**
- (a) `ListScreen.primaryAction` **버튼 갈래**(SP-1): 지금 링크 갈래뿐(ListScreen.tsx:13). S1 1차 `지급 완료 N`은 버튼 · `aria-disabled` + 이유 · kbd가 필요하고 1024 미만에는 렌더하지 않는다(UI-SPEC:1073-1088). 06-15는 `ui/table` 3파일만 만지고 `ListScreen.tsx`가 없다 → 15번째 파일(C10).
- (b) `ui/confirm-dialog` **검색 고르기 갈래**(SP-8): `options` 갈래는 1차가 없다(ConfirmDialog.tsx:58). S10 목록은 검색 칸 · 고를 수 없는 행 + 2행 이유 · 현재 줄 · 1차 `이 줄로 Enter` · LOADING/EMPTY/ERROR가 필요하고 `app/**`에서 `<dialog>`를 직접 쓸 수 없다(UI-SPEC:1129-1133). 06-07 4웨이브 앞에 갈래가 있어야 한다. 06-07:185는 S10을 「PC 480 모달 · 폰 시트」 전용 `link-picker.tsx`로 만든다고 적는다(06-07:185).
- (c) SP-7 `attachments` 슬롯: 06-17이 맡는다(06-17:418) — 구현은 DECISIONS → SYSTEM §7-17 뒤. 상태 계약 둘(열 때 LOADING · 새로 고침 뒤 열린 채 다시 세움 — r2 R3)이 슬롯 acceptance에 있어야 한다(UI-SPEC:1121-1127).
- (d) `ui/table` `selectable`: 06-15가 맡되 칸 폭 식이 다르다 — 플랜 「폭 44」(06-15:45) vs UI-SPEC `calc(var(--row-number-w) + 2 * var(--cell-pad-x))`(= 44, UI-SPEC:1073-1088).
- (e) **짝 격자**(O-23 · Q4 설정 키 입력 모양): SYSTEM §7-2 새 입력 타입 — 「06-02/03 계획이 SP로」(UI-SPEC:937). SP-9 같은 새 승격 id가 필요하다(UI-SPEC SP는 8까지). 비슷한 선례 `ui/permission-grid/PermissionGrid`(SYSTEM §7-13 체크박스 매트릭스 — 칸마다 즉시 저장 + 토스트)는 재사용 가능 여부를 06-02 ⓪에서 확인한다.
- 조치: (a)(b)(e)는 각각 DECISIONS 항목 → SYSTEM 문장 → 컴포넌트 · 테스트 순서로 주인 플랜을 정한다. 제안: 컴포넌트 일 세 가지를 06-01 뒤 · 06-07/06-15 앞 웨이브의 한 플랜(예: 「06-0x 화면 컴포넌트 갈래」)에 모으거나 06-15 · 06-07 앞 Task로 넣는다 — 파일 수가 15를 넘지 않게 결정(판단 사항).

**X7 증빙 판정 = 05 「결재 중 증빙」 + 한 서버 함수 `hasEvidence`**
- rev 10: 살아 있는 파일 = `removed_at IS NULL AND voided_at IS NULL`(UI-SPEC:62), 증빙 유무는 한 서버 함수 하나(UI-SPEC:67) — 증빙 개수 · `증빙 없음` · P3 · 견적 줄 파생 · 완료 전 점검 · 「내 차례」에서 무효 파일은 세지 않는다. 결재 중 = 아무도 못 뗀다(붙이기는 `expenses.evidence_attach` 권한자), 승인 뒤 = 기안자 「추가」만 + 시스템 관리자 `expenses.evidence_void` 「무효」, 확인 기록은 결재 통과 뒤에만 있다(UI-SPEC:53-60 · UI-SPEC:61-66). SP-6 철회.
- 플랜: 06-11 훅 「PM이 증빙을 더하거나 떼거나 금액을 고치면 확인이 풀린다」(06-11:34 · 06-11:36), 마지막 삭제 모달(S7 zero-one-many 06-11:51), `증빙 0` 판정이 파일 수를 직접 세는 곳 다수.
- 조치: C2(06-11 훅 범위) · C4(`hasEvidence` DTO 이름) · §2.3 S4 · S7. 06-04 `evidenceGateDecision` · 06-06 `resolveEvidenceStatus` · 06-13 줄 파생 · 06-19/22 미결 · 06-23 신호가 전부 `hasEvidence` 하나를 부르게 하고(05의 `listEvidenceVoidSignals`와 한 신호 — UI-SPEC:67), 05 `expenses.evidence_attach`/`evidence_void` 실물 이름은 `replan-A-05-names.md`를 따른다.

**X8 사용자 결정 Q2~Q7(10/5 00:55) — 플랜에 0건**(UI-SPEC:42-47)
- Q2 구매 완료 뒤 취소 없음(취소는 `신청됨`에서만, 잘못 처리하면 조정 줄 D-83 + S9 「카드 고치기」) → 06-14 S11 행동 칸 · 06-12 · Copywriting 「Destructive — 구매 요청 취소」.
- Q3 카드 · 구매 요청도 **실행가 초과 막힘**(남은 실행가 = 그 줄 실행가 − 다른 카드 사용 공급가 합, 수정이면 이 건 제외, 서버도 같은 판정으로 거부 — 경합) → 06-05 · 06-07(B-1 잠금 뒤 판정) · 06-08(공급가 추정 역산) · 06-09(수정) · 06-12(S13 갈래 문구) · 06-14(S10 `purchase` 모드의 「실행가 소진」 행 + 「다른 `신청됨` 요청 예상 금액은 빼지 않는다」 확인 후보 — UI-SPEC:827). 새 서버 규칙 키(가칭)와 문구 갈래 둘(「막힘 — 카드 사용 폼」 · 「막힘 — 구매 요청 폼」)이 필요하다.
- Q4 지급 방식 ↔ 증빙 종류 짝 = 서버 규칙 `payment.method-evidence-mismatch`(가칭) + 설정 키 + 짝 격자(X6 e) → 06-02(키 · 입력 모양) · 06-03/06-04(지급 게이트) · 06-15(S1 선택 칸 `rules.gate` 판정에 포함 — UI-SPEC:494) · 06-17 · S2 결과 문구 「거부 — 일괄 지급 건별 결과」. 짝 목록이 비어 있으면(기본값) 막힘 없음.
- Q5 공용 카드 → X10.
- Q6 카드 **사용일은 오늘까지**(칸 `max` = 오늘 KST, 서버도 거부), **지급일은 미래 허용**(예정일) → 06-05(S9 칸 오류) · 06-03/06-04(지급일 칸 · 세율 기준일) · 06-15/06-17(S2 지급일 칸 기본 오늘 · 미래 허용 — UI-SPEC:567).
- Q7 계산서 없는 카드 매출 — **06은 그대로**(`매출 미입력` + 「강행 허용」 설정으로 넘김, 카드 매출 입력은 Phase 9) → 06-19 · 06-22는 범위 밖임을 한 줄 prohibition으로 못 박는다(UI-SPEC:917).
- 조치: 각 플랜 must_haves에 Q 번호를 붙인 truth를 더하고, 해당 Task behavior에 RED 케이스를 둔다.

**X9 `담당 PM` → `기안자`(P3 · S19)**
- rev 10: 승인 뒤 증빙을 붙이는 사람은 기안자뿐이므로 P3 막힘 이유가 `증빙 없음 · 기안자 박서연`(UI-SPEC:298 · UI-SPEC:420), 「내 차례」 `증빙 없음 · 지급 대기` 줄의 받는 사람 = 기안자(UI-SPEC:925). **S18 · 대표 승인 막힘 · S21 · S13 실행가 초과 문구의 `담당 PM`은 그대로**다.
- 플랜: 리터럴 `증빙 없음 · 담당 PM {이름}` 12줄 + 식별자 `pmName` 14줄 + S19 받는 사람 4줄(§5.7).
- 조치: 06-04 `pmName` 출처 확인(기안자 이름을 읽는 경로 — 05 실물), 06-23 수신자 판정을 `projects.pmUserId = viewer`에서 `기안자 = viewer`로(PN-5 06-23:132). 선결제 기한 초과 줄의 수신자는 UI-SPEC 문장이 모호(C8).

**X10 Q5 공용 법인카드 — 위험 경로 별도 PR**
- rev 10: 카드 자격에 `공용`(소지자 · 팀 없는 카드) 갈래. 지금 스키마는 소지자 · 팀 중 하나가 필수이고(`db/schema/corp-cards.ts:32-35`) `CardOwnerKind = "personal" | "team"`이다. UI-SPEC은 「06-05가 `공용` 갈래를 더한다(관리자 폼 옵션 하나 · 소유자 칸 없음). `db/schema/`는 위험 경로라 별도 PR(사용자 머지)」(UI-SPEC:735).
- 플랜: 06-05 `files_modified`에 `db/schema/corp-cards.ts` · `domain/corp-cards/` · 관리자 카드 폼이 없다(`replan-D-plan-inventory.md` §4).
- 조치: 마이그레이션 + CHECK 완화 + 관리자 폼 + 카드 옵션 자격 판정을 **위험 경로 전용 플랜 하나로 분리**(CLAUDE.md §4 「위험 경로 변경은 별도 PR」, CL:105). 돈 · 결재 경로(`domain/corp-cards`)라 `/review` + `/cso`, 실행자 Opus + 독립 검토 1명(`risk:` 태그). 공용 카드의 사용은 직원에게 자기가 등록한 것만 보이는 S8 범위 · 대리 등록 「사용한 사람」 후보(사용일에 재직한 사람 전부 · 기본값 없음) · 카드 힌트 없음 · 목록 「등록」 칸 표시를 06-05 · 06-09가 받는다(UI-SPEC:687-690).

**X11 r2 지적 중 플랜에 없는 것**(`design-review-rev10.md` 표 — §4.1)
- F2(금액 빈 `확인 전`: S4 칸 열린 채 · 1차 막힘 `증빙 금액 없음`, 제자리 모달 대신 문서 화면 — UI-SPEC:529 · UI-SPEC:592) → 06-06 · 06-17(S1 3차 분기).
- F5(S5 행동 뒤 포커스 — 새 1차, 없으면 1차 자리 결과 글자 `tabindex="-1"` · `role="status"`, UI-SPEC:644) → 06-04 · 06-06 · 06-10.
- F6(S13 구매 완료 뒤 다음 `신청됨` 행 `구매 완료`로 포커스, UI-SPEC:834) → 06-12 · 06-14.
- F7(S1 고른 이체액 합 `--text-body` + `--fw-bold`, UI-SPEC:351) → 06-15 · 06-17 summary.
- F9(S3 맨 앞 `예정 지급` 그룹 — 미래 지급일, UI-SPEC:582) → 06-20. 밤 위임 확정.
- F10(S21 · S22 증빙 삭제 결과 줄 `증빙 삭제 · {파일명}` + 3차 `되돌리기`, UI-SPEC:967 · UI-SPEC:988) → 06-16(`되돌리기`의 서버 쪽 = 삭제 취소 경로 — Phase 5 파일 행 되살리기 경로 확인 필요). 밤 위임 확정.
- F15(S11 링크 아이콘 44×44, UI-SPEC:805) → 06-08 · 06-14. F16(`tokens.test.ts` 대비 단언 — SP-2, UI-SPEC:1092) → 06-01.
- R1 · N3(제자리 확인 자동 선택은 선택 칸이 `고를 수 있음`일 때만 · 짝 막힘 갈래 — UI-SPEC:534 · UI-SPEC:536) → 06-17. R2(S13 실행가 초과 문구 — UI-SPEC:837) → 06-12. R3(SP-7 상태 계약 — UI-SPEC:1125) → 06-17 · 06-01. R6(활성 카드 0장 — UI-SPEC:838) → 06-12.

**X12 숫자 칸 `.num` → `ui/num/Num`**: `.num` 클래스 3줄(06-03:210 · 06-04:165 · 06-05:184) → `ui/num/Num` 컴포넌트(UI-SPEC:167). 금액 셀은 `Num`, 새 CSS 클래스를 만들지 않는다.

**X13 `design-gate` 점검표 · 기계 검사 5종**(§1.5): 화면을 만지는 플랜 약 20개 모두 acceptance에 ① `docs/design/checks/<날짜>-<작업>.md`(엄격 모드: 커밋하는 화면 파일마다 「화면:」 줄에 그 파일/폴더) ② `screen-frames` · `tokens` · `status-map` · `error-copy-noun-style` · `design-system-docs` 5종 통과 ③ 독립 DOM 감사 `CI=true`(스크린샷 육안 금지)를 넣는다. 현재 25개 모두 0건. 플랜마다 되풀이하지 않고 **묶음(PR)마다 한 번**이므로 화면 플랜들의 마지막 Task 하나 또는 페이즈 게이트 플랜(06-24)에 모은다(CL:100).

**X14 모달 어휘 → 표면별 틀**(§5.5, 189줄): rev 10에서 「모달」은 되돌릴 수 없는 일 확인 · 「바꾸기」 목록 · 근거 한 칸에만 남는다(SYSTEM:994-995). S2 일괄 지급 · S5 지급 취소 · 증빙 면제 · S11 남의 요청 취소 · 발행 요청 취소 · 완료 전 점검 대표 승인 막힘 = `ConfirmDialog`(유지), S1 · S3 제자리 증빙 확인 = `ConfirmDialog` + SP-7 슬롯, **S10 = 패널 위 `ConfirmDialog` 검색 고르기 갈래**(SP-8, 「PC 480 모달 · 폰 시트」 단독 표현 폐기), 카드 · 구매 요청 폼 = 모달이 아니라 옆 패널, 폰의 「폼이 그대로 선다(UX-03)」 = 「같은 패널이 아래 시트로 선다」.


### 2.3 화면별 S1~S22 — 어느 플랜이 짓나 · 지금 무엇이라 적었나 · rev 10은 무엇을 요구하나

읽는 법: **빌더** = 그 화면을 만드는 플랜(웨이브 순). **지금** = 플랜의 낡은 자리(plan:줄 — 전부 실제 줄과 대조). **rev 10** = UI-SPEC 줄. **조치** = 재계획이 플랜 문장으로 옮길 것. 옛 토큰 · 낱말 · 토스트 · 모달 어휘는 §5의 줄 목록으로 갈음하고 여기서는 화면 구조를 바꾸는 것만 적는다. 변경이 없는 하위 절(S1 「문서 화면 왕복」 UI-SPEC:542 · S1 「일괄 결과 알림」 UI-SPEC:554)은 rev 9 그대로다.

**S1 지출결의 「지급 대상」 보기 `/expenses?view=pay`** — 빌더 06-15(표 · 1차 · 결과 글자) → 06-17(이체액 편집 · 서버 합 · 제자리 증빙 확인) → 06-20(계좌 칸 · `[증빙 ▾]` 필터 · 왕복의 문서 쪽).
- 지금: 파일 `app/(app)/expenses/page.tsx`(06-15:14 — 05가 지운 파일) · 선택 열 폭 44(06-15:45) · 토스트 06-15:55 · 차이 `--warning`(06-17:33) · 합 요청 중 `--faint`(06-17:39) · 제자리 확인 모달 `--modal-w`(06-17:68).
- rev 10: 틀 = `ListScreen` `title="지출결의"`(부제 없음) · `primaryAction` = 버튼 갈래 `지급 완료 N`(SP-1, ≥1024에서만) · `summary` 합계 면 · 표 = `ui/table` 편집 표 + 선택 열(UI-SPEC:442). 선택 칸 판정에 Q4 짝 규칙과 `hasEvidence` 하나가 들어간다(UI-SPEC:494). P3 행 `증빙 없음 · 기안자`(UI-SPEC:472). `[증빙 ▾]` 값은 서버 열거에서 온다 — 6.1이 값을 더해도 화면 코드 변경 없음(06-20)(UI-SPEC:521). F2: 금액 빈 `확인 전`은 제자리 모달을 열지 않고 3차가 문서 화면(`?from=pay`)으로 간다(UI-SPEC:529). R1 · N3: 제자리 확인 뒤 자동 선택은 선택 칸이 `고를 수 있음`일 때만, 짝 막힘이면 편집 칸 · 합 갱신 · 포커스를 하지 않는다(UI-SPEC:534 · UI-SPEC:536).
- 조치: 06-15 Task 1에 `ListScreen` 조립 + 버튼 갈래 주인(X6 a) · 선택 열 폭 식 · 파일 경로 정정 · 토스트 줄 삭제(결과 글자가 같은 사실 — UI-SPEC:577) · 선택 판정에 짝 규칙. 06-17은 토큰 3건 · 제자리 확인에 F2 분기와 R1/N3 갈래 + 짝 막힘 E2E. 06-20은 증빙 필터 값 열거 · `없음` → `증빙 없음`(06-20:39).

**S2 일괄 지급 완료 확인 모달** — 빌더 06-15 · 06-17.
- 지금: 지급일 한 칸 기본 오늘만(06-15:52) · 일부 처리 시 토스트 `지급 완료 · N건`(06-15:55) · 폭 `--modal-w` 480(06-17:68).
- rev 10: 확인 근거 한 칸 = 지급일, 기본 오늘 · **미래 허용**(Q6) · `--field-w-short`(UI-SPEC:567). 토스트 없음 — 결과 글자 `14:02 지급 완료 5건 · 막힘 2건`이 같은 사실을 말한다(UI-SPEC:577). 짝 막힘 건은 막힌 행 이유로 돌아온다(Q4).
- 조치: 06-15:52 · :55 · 06-17:68 문장과 acceptance 정정, 지급일 미래 허용 E2E 1건.

**S3 「지급 완료」 보기 `/expenses?view=paid`** — 빌더 06-20.
- 지금: 그룹 `이번 주` → `지난주` → `MM-DD ~ MM-DD`(06-20:36).
- rev 10: 미래 지급일이 있으면 **맨 앞 `예정 지급` 그룹**(Q6 · F9, 밤 위임 확정)(UI-SPEC:582). 상태 열 2행 `증빙 16일 경과`는 `--status-warning` · `--text-tag`(UI-SPEC:585). 틀 `ListScreen`, 1차 없음.
- 조치: 06-20 Task 3 behavior에 `예정 지급` 그룹(그룹 판정은 서버 — 06-15 그룹 판정과 한 함수) · 틀 정정.

**S4 문서 화면 「증빙」 섹션 확인부** — 빌더 06-06(확인 · 금액 고쳐 확인) → 06-10(면제) → 06-11(증빙 변경 훅) → 06-20(왕복 문서 쪽 3차).
- 지금: 확인 줄 값 넷 `statusDisplay`(06-06:46) · `--faint`(06-06:44) · 증빙 필수 off `없음`(`--muted`) + P3 `증빙 없음 · 담당 PM {이름}`(06-10:44) · 훅 「PM이 증빙을 바꾸면 확인이 풀리고 version +1」(06-11:34).
- rev 10: 섹션 = `DetailScreen.Section`(제목 `--text-subtitle`, 위 1px `--border-row`) + `Form layout="page"`(UI-SPEC:588). **F2 증빙 금액 빈 `확인 전`**: 금액 칸이 처음부터 열린 입력 칸, 1차 `증빙 확인`은 금액이 찰 때까지 비활성 + 이유 `증빙 금액 없음`(UI-SPEC:592). P3 `증빙 없음 · 기안자 박서연`, 증빙 필수 off는 빈 값 `—`(상태 낱말 아님)(UI-SPEC:615-616). 확인이 풀리는 길은 **기안자 「추가」 · 시스템 관리자 「무효」** 둘뿐, 승인 뒤 떼기 없음(UI-SPEC:620). 결재 중 잠김 한 줄 `결재 중 · 증빙은 경영관리`는 05 표면의 것 — 06은 같은 낱말을 다시 쓰지 않는다(UI-SPEC:626).
- 조치: 06-06 S4 populated · empty에 F2 분기 · 값 낱말은 `status-map.ts` · 토큰. 06-10 S4 empty 갈래(P3 · 필수 off · 선결제 `—`/`증빙 없음`). 06-11은 C2.

**S5 문서 화면 「지급」 섹션** — 빌더 06-03(트레이서: P0 · P4 · P6) → 06-04(이체액 · 차이 사유 · 예정일 제자리 저장 · 지급 취소).
- 지금: 1차 `지급 완료` 뒤 읽기 줄(06-04:33) · 서버 계산 힌트 `--faint`(06-04:45) · P3 이유 `담당 PM`(06-03:207 · 06-04:35,39,42,126,194,199,236 — §5.7).
- rev 10: `DetailScreen.Section` + `Form layout="page"`, 칸 폭 `--field-w-short` · `--field-w-long`(UI-SPEC:640 — 지급일 기본 오늘 · **미래 허용**), 성공 뒤 1차 자리 결과 `지급 완료 → 2026-09-19 · 14:02`(**토스트 없음**)(UI-SPEC:643), **F5 행동 뒤 포커스**(새 1차, 1차가 없으면 결과 글자 `tabindex="-1"` · `role="status"`)(UI-SPEC:644), Q4 짝 밖이면 `지급 완료` 비활성 + 이유, 무효로 살아 있는 증빙이 0이면 P3(UI-SPEC:648), 폰은 `DetailScreen` `actions.primary` 자리(UI-SPEC:651).
- 조치: 06-04 Task 2(`payment-section.tsx`)에 F5 포커스 · 토스트 없음 · 짝 막힘 · `hasEvidence`, `pmName` → 기안자 이름 출처.

**S6 지출결의 폼 — 선결제 칸** — 빌더 06-10 Task 3(Phase 5 폼 위).
- 지금: `선결제 사유` 480 칸(06-10:39).
- rev 10: 체크박스 `--native-accent`, 사유 칸 `--field-w-long`(UI-SPEC:655). 증빙 필수 off의 증빙 값은 빈 값 `—`.
- 조치: 폭 숫자 → `--field-w-long`(페이지 배치라 칸 폭 3종이 유효). 새 화면 구조 변경 없음.

**S7 증빙 첨부 규칙** — 빌더 06-11(규칙 · 업로드 검사) · 06-16(주인 종류 확장) · 06-25(카드 전표).
- 지금: 「마지막 증빙 삭제 확인 모달」 truth(06-11:51) · 훅 두 줄(06-11:34).
- rev 10: 떼기 · 무효 — 결재 중 · 승인 뒤 파일 행에 `삭제`가 없다(떼기는 작성 중 · 반려 · 회수에서만, §7-10 보통 삭제 — 모달 없음). 06은 무효의 결과(확인 풀림 · 살아 있는 파일 0이면 `증빙 없음`)만 그린다. SP-6 철회(UI-SPEC:667). 카드 사용 첨부는 05 결재 규칙과 무관(UI-SPEC:669).
- 조치: 06-11 Task 2 · 3(모달 · `lastEvidenceDeleteNeedsConfirm` 일체 제거, 06-25:51도 같은 가정), C2.

**S8 법인카드 사용 목록 `/cards`** — 빌더 06-05(목록) · 06-09(행 `수정` · `삭제`) · 06-14(하위 링크 건수) · 06-25(증빙 열 값).
- 지금: `app/(app)/cards/page.tsx`의 `ListEmpty` 자리를 S8로 바꾸고 `?new=1`이면 S9 폼(06-05:184) · 오른쪽 3차 `구매 요청` + 1차(06-05:45) · 수정 모드 2차 `카드 사용 삭제` + 토스트(06-09:45) · 행을 누르면 `?editId=`(06-09:49).
- rev 10: `ListScreen` `title="카드 사용"`(부제 없음) · `primaryAction` 링크 `/cards?new=1`(쓸 카드 0장이면 안 넘김) · `summary` · `empty` · `pagination` · `panel`(UI-SPEC:687). 행동 칸 `RowActions`: `수정` · `삭제`(맨 끝 · 구매 완료로 생긴 건은 `수정`만)(UI-SPEC:692). **삭제 = 확인 없이 보관 + 표 위 결과 줄 `카드 사용 삭제됨 · 48,000` + 3차 `되돌리기`**(UI-SPEC:693). 공용 카드 사용은 직원에게 자기가 등록한 것만(UI-SPEC:687-690). 필터 묶음 끝에 하위 목록 링크 `구매 요청 3`(SP-4).
- 조치: 06-05 Task 3 · 06-09 Task 2를 위 구조로(삭제 · 되돌리기 위치가 폼 → 목록 행으로 이동), 06-25 증빙 열은 값 자리만.

**S9 법인카드 사용 등록·수정 — 옆 패널 `/cards?new=1` · `?editId=`** — 빌더 06-05 → 06-07(연결 셋) → 06-09(대리 등록 · 수정 · 삭제) → 06-13/06-14(진입 줄 · 팀 비용) → 06-25(첨부).
- 지금: 페이지 폼 `card-usage-form.tsx`(06-05:16) · 「저장 → `/cards`로 돌아가」(06-05:33) · 서버 계산 한 줄 `--faint`(06-05:52) · 대리 등록 카드 `Select`(200)(06-09:50) · 삭제 토스트(06-09:45).
- rev 10: 옆 패널 `SidePanel` + `PanelForm`, 카드 칸 `Select` 전폭, 머리 = 실제 동작(수정이면 `카드 사용 수정`), 1차 `카드 사용 등록`/`카드 사용 저장` + `Ctrl+Enter`, 막힘은 `PanelForm` `blockedReason`, 서버 거부는 `reason`(UI-SPEC:728). **카드 자격에 공용 카드**(Q5, X10)(UI-SPEC:733). **사용일 `max` = 오늘(KST)**(Q6)(UI-SPEC:751). **견적 줄 연결의 실행가 초과 막힘**(Q3) · 줄 아래 `Form.Hint` `남은 실행가 {값} · 카드 사용 {N}건 {합}`(UI-SPEC:768-769). 대리 등록 「사용한 사람」 후보는 공용 카드면 사용일에 재직한 사람 전부 · 기본값 없음(UI-SPEC:772). 삭제 버튼은 패널에 없다(S8 행으로). 폰은 같은 패널이 아래 시트(UI-SPEC:785).
- 조치: X3 · X8 Q3/Q5/Q6 · X10. 06-05는 칸 컴포넌트 + 패널 연결, 06-09의 삭제 · 토스트 · `Select`(200) 정정, 06-25 첨부 영역은 패널 안 칸으로.

**S10 연결 고르기 — 「바꾸기」 목록** — 빌더 06-07(`card` 모드) · 06-14(`purchase` 모드).
- 지금: PC 480 모달 · 폰 시트 전용 `link-picker.tsx`(06-07:185) · 현재 줄 700 + 왼쪽 2px `--accent`(06-07:47).
- rev 10: 패널 위에 여는 `ui/confirm-dialog` **검색 고르기 갈래**(SP-8) — PC 가운데 `--dialog-w` · 폰 시트 위 시트, 첫 포커스 검색 칸, `Esc`는 목록만 닫고 포커스를 누른 「바꾸기」로, `이 줄로 Enter`가 패널 칸에 값을 넣는다(UI-SPEC:789). 줄 행 = 실행가 `Num` + 2행 `남은 실행가`, 남은 실행가 0 이하는 `aria-disabled` + `실행가 소진 · 다른 줄`(Q3), 현재 줄 `--fw-bold`(UI-SPEC:795).
- 조치: X6 b · X8 Q3. 06-07 4웨이브 앞에 갈래가 있어야 하고, 06-07 Task가 갈래를 쓰는 쪽이다(「목록 컴포넌트 신설」이 아니다).

**S11 구매 요청 목록 `/cards/purchases`** — 빌더 06-08(목록 뼈대) → 06-12(구매 완료 행) → 06-14(마감: 필터 · 그룹 · 합계 · 취소).
- 지금: 기본 보기 `신청`(06-08:42) · 본인 취소 → 토스트 `되돌리기`(06-14:38) · 취소 행동은 `신청` 행에만(06-14:46).
- rev 10: `ListScreen` `title="구매 요청"`(부제 없음, rev 9의 PageHeader 부제 `법인카드 · 온라인구매` 삭제) · `primaryAction` 링크 `/cards/purchases?new=1` · `filters` `[신청됨 ▾ …]` · `panel`(S12 · S13)(UI-SPEC:803). 링크 아이콘 누르는 영역 44×44(F15)(UI-SPEC:805). 본인 취소 = 표 위 결과 줄 `구매 요청 취소됨 · 26001-C0001` + 3차 `되돌리기`(UI-SPEC:807). **취소는 `신청됨`에서만**(Q2) — `구매 완료` 행에 취소를 렌더하지 않는다. 낱말 `신청` → `신청됨`(§5.7 41줄).
- 조치: 06-08 · 06-14의 `신청` 41줄 정정 + 토스트 → 결과 줄 + Q2 prohibition.

**S12 구매 요청 신청 — 옆 패널 `/cards/purchases?new=1[&line={id}]`** — 빌더 06-08 → 06-14.
- 지금: 페이지 폼 `purchase-request-form.tsx`(06-08:16) · 저장 순간 번호 + 토스트 `구매 요청 · {번호}`(06-08:33) · 연결 칸 · 링크 칸 480(06-08:47).
- rev 10: S9와 같은 옆 패널(머리 `구매 요청`, 1차 `구매 요청 Ctrl+Enter`), 견적 줄 표 · 점검 섹션에서 들어와도(`&line=`) 뒤는 S11이고 `closeHref`로 S11에 남는다(UI-SPEC:815). **실행가 초과 막힘**(Q3 — 공급가 추정이 남은 실행가보다 크면 1차 막힘 · 다른 `신청됨` 요청의 예상 금액은 빼지 않는다 = 06-14 확인 후보)(UI-SPEC:826-829). 등록 뒤 패널 열린 채 + 결과 한 줄 `구매 요청됨 · 26001-C0001`, 토스트 · 등록 `되돌리기` 없음.
- 조치: X3 · X8 Q3.

**S13 구매 완료 — 옆 패널 `/cards/purchases?purchase={id}`** — 빌더 06-12(+06-14 팀 비용 갈래 · 06-25 첨부).
- 지금: 카드 사용 폼의 구매 완료 모드 `/cards?new=1&purchase={id}`(06-12:33 · 라우트 06-12:305) · 성공 → `/cards/purchases` + 토스트 `구매 완료 · {번호}`.
- rev 10: 경로 **`/cards/purchases?purchase={id}`**(S11 행 `구매 완료` → 목록 위 옆 패널, `PanelForm intent="edit"`, 칸은 S9 재사용)(UI-SPEC:831 · UI-SPEC:833). 성공 뒤 닫힘 + 그 행이 `구매 완료` + 2행 `카드 사용 09-20 · 1,238,000`, **포커스 = 다음 `신청됨` 행의 `구매 완료`**(없으면 화면 제목, F6)(UI-SPEC:834). 실행가 초과(Q3)는 **S13 갈래 문구**(`다른 줄 고르기` 없음 — R2)(UI-SPEC:837), 활성 카드 0장 = 카드 칸 `—` + 1차 `구매 완료` 비활성 + `활성 법인카드 없음 · 카드 등록은 관리자`(R6)(UI-SPEC:838). 취소 없음(Q2).
- 조치: 06-12 `files_modified`의 `/cards` 진입 정정 + 라우트 표 · E2E · 06-14:323 · 06-25:35,252 라우트 정정(§5.3).

**S14 견적 줄 표에 더하는 것** — 빌더 06-13(상태 열 · 행 행동) · 06-14.
- 지금: 우선순위 `… 구매 요청 > 지급 완료 …`(06-13:33) · `증빙 {N}일 경과`(`--fs-xs` 400 `--warning`)(06-13:35) · 상태 파생 위치 `domain/quotes/line-status.ts`(06-13:34).
- rev 10: 견적 줄 한 값 우선순위 `취소 > 반려 > 증빙 없음 > 지출결의 중 > 구매 요청 중 > 지급 완료 > 카드 사용 > 미착수`(F3 확정, 낱말은 `status-map.ts`)(UI-SPEC:1090-1094), `증빙 N일 경과` 2행 `--text-tag` `--status-warning`(UI-SPEC:850). 파생 위치는 UI-SPEC이 05-15 확장 + `status-map.ts`를 가리킨다(C3).
- 조치: 06-13 낱말 · 토큰 정정, C3.

**S15 프로젝트 상세 「법인카드 사용」 섹션** — 빌더 06-07(Task 3).
- 지금: 섹션 부제 `{N}건 · 결제 합계 {합}`(06-07:54) · 파일 `card-usage-section.tsx`.
- rev 10: `DetailScreen.Section` + 읽기 표, 행 → 권리가 있으면 S9 **수정 패널**(`/cards?editId={id}`), 없으면 `RowSheet`(UI-SPEC:860 · UI-SPEC:866).
- 조치: C1(부제), 행 링크 목적지 정정.

**S16 매출 발행 요청 — 상세 매출 섹션 「발행 요청」 표** — 빌더 06-18 → 06-21.
- 지금: 상태 값 `요청`(06-18:44) · 요청 줄 상태 2행 `--muted`(06-18:45).
- rev 10: 소제목 `발행 요청` `--text-aux --text-muted`, 상태 `신청됨`, 2행 `--text-muted`(UI-SPEC:870 · UI-SPEC:874). 구조 변경 없음.
- 조치: 낱말(`요청` 22줄) · 토큰만.

**S17 발행 요청 목록 `/projects/issue-requests`** — 빌더 06-21.
- 지금: `PageHeader` 제목 + 부제 = 부모 메뉴 이름(06-21:189 · 06-21:34) · `희망일 지남`(`--warning`)(06-21:40).
- rev 10: `ListScreen` `title="발행 요청"`(부제 없음) · `primaryAction` 없음 · 필터 `[신청됨 ▾ | 발행됨 | 취소 | 전체]`, 그룹 `희망일 지남`(`--status-warning`)(UI-SPEC:884). 프로젝트 목록 필터 묶음 끝 하위 링크(SP-4).
- 조치: X2 · X4.

**S18 완료 전 점검** — 빌더 06-19(판정) → 06-22(표시 마감).
- 지금: 그룹 머리글 건수 `--danger` · 차이 `--warning`(06-19:36 · 06-19:43) · 상태 글자 `status-display.ts` 매핑(06-22:40) · 섹션 부제 `정산 결재 전 · 막힘 {N}건`(06-19:43).
- rev 10: 섹션 = `DetailScreen.Section`(위 1px `--border-row`), 그룹 머리글 건수 `--status-danger`(UI-SPEC:897). 미결 지출결의의 `증빙 없음` 판정은 `hasEvidence` 하나(무효 파일 제외)(UI-SPEC:918)이고, **계산서 없는 카드 매출은 06이 바꾸지 않는다**(Q7)(UI-SPEC:917). S18 · 대표 승인 막힘의 `담당 PM`은 그대로.
- 조치: C1(부제), X4 · X7 · X8 Q7.

**S19 「내 차례」 항목** — 빌더 06-23.
- 지금: PM 항목 세 종류 · P3 줄의 받는 사람 = 담당 PM(06-23:31 · 06-23:32) · 오류 줄 `--danger`(06-23:37) · 홈 `PageHeader`(06-23:262) · `신청 {N}건`(06-23:30).
- rev 10: P3 `증빙 없음 · 지급 대기` 줄의 받는 사람 = **기안자**(승인 뒤 증빙을 붙이는 사람은 기안자뿐), 완료 전 점검 막힘 = 담당 PM(UI-SPEC:925). 홈 `/`는 `ListScreen title="내 차례"`. 낱말 `구매 요청 — 신청됨 {N}건`.
- 조치: X9 · C8. 오류 문구 리터럴은 C13.

**S20 설정 키 — 관리자 설정 화면** — 빌더 06-02(키 정의) · 06-08(`purchase.online_vendor_name` 읽는 쪽).
- 지금: 새 설정 키 **넷**이 「화면 코드 없이」 나온다(06-02:30), 이 플랜은 설정 화면 코드를 고치지 않는다(06-02:38).
- rev 10: 키 **다섯**째 `지급 방식 · 증빙 종류 짝` — 짝 목록 · 입력 모양 = O-23 **짝 격자**(행 = 지급 방식 코드 · 열 = 증빙 종류 코드 · 칸 = 체크박스, 빈 값 = 짝 검사 없음 — 밤 위임 확정)(UI-SPEC:937). §7-2 자동 렌더(boolean · number · string) 밖이라 화면 코드가 필요하다.
- 조치: C7 · X6 e · X8 Q4.

**S21 차수 승인 증빙 · S22 리저브 줄 증빙** — 빌더 06-16(+06-25 카드 전표 중복 판정).
- 지금: 제목 `--fs-sm` 600 + 2px `--line-strong`(06-16:194) · 섹션 부제 `승인 {승인일}`(06-16:48) · 삭제 뒤 `되돌리기` 없음.
- rev 10: 제목 `--text-aux` 600, 위 1px `--border-row`로 시작(UI-SPEC:964). **F10: 증빙 삭제 뒤 펼침 섹션 위(S21)/표 위(S22) 결과 줄 `증빙 삭제 · {파일명}` + 3차 `되돌리기`**(§7-8 :1008, 확인 창 대신 되돌리기)(UI-SPEC:967 · UI-SPEC:988). 마지막 파일 삭제도 모달 없음.
- 조치: 06-16에 되돌리기 서버 경로(파일 행 되살리기 — Phase 5 쪽 존재 여부 ⓪ 확인) · 토큰 · C1.


### 2.4 플랜별 점검표 06-01~06-25

읽는 법: 플랜마다 **적용**(§2.2 X · §2.3 S · §2.5 C 번호) → **낡은 곳**(plan:줄 — 전부 실제 줄과 대조, 토큰 · 낱말 · 토스트 · 모달 줄은 §5가 전체 목록이라 대표 줄만) → **더할 것**(must_haves · Task · acceptance에 옮길 문장). W = 웨이브 · fm = `files_modified` 수(`replan-D-plan-inventory.md` 기준). 플랜 25개 모두 `risk:` 태그가 없다(§1.1 CL:88) — 위험 경로를 만지는 11개(06-02 · 03 · 05 · 06 · 08 · 10 · 12 · 16 · 18 · 24 · 25)는 태그를 달고 사용자 머지 PR로 나간다(`replan-D` §0 항목 3).

**공통 묶음 A** — 화면 파일(`app/**`의 `.tsx` · `.css`, `ui/**`)을 만지는 모든 플랜의 마지막 Task acceptance에 한 번씩. 단 게이트 실행은 플랜마다가 아니라 **묶음(PR)마다 한 번**이다(CL:100).
- A1 점검표 `docs/design/checks/<날짜>-<작업>.md` — 코드 쓰기 전에 현재 화면 기준으로 채우고, 커밋하는 화면 파일마다 「화면:」 줄에 그 파일/폴더가 있어야 한다(design-gate/SKILL:25-27).
- A2 기계 검사 5종 통과 — `screen-frames` · `tokens` · `status-map` · `error-copy-noun-style` · `design-system-docs`(§1.5). 새 `page.tsx`는 처음부터 `ListScreen`/`DetailScreen`이어야 한다(§2.2 X2).
- A3 UI-SPEC 검수 grep — `app ui`에 옛 이름 0건 · 원시 이름 0건(UI-SPEC:150), `git diff docs/design/tokens.css` 0줄.
- A4 독립 DOM 감사(별도 에이전트 · `CI=true` · 스크린샷 육안 금지) → `/design-review` → `/qa`(FE:15-16).
- A5 돈 · 결재 경로(`domain/`의 money · corp-cards · reserves · revenue · approvals, 해당 `repositories/`)를 만지면 `/cso`를 더한다(CL:97).

**공통 묶음 B** — 화면 여부와 상관없이 25개 플랜 모두의 머리 · `read_first` · acceptance 인용에서 한 번씩.
- B1 기준선 표기 — 플랜 본문에 「rev 8 · rev 9」 표기가 84줄(ledger 표 줄 65 포함 149줄), 「rev 10」은 0줄이다. 재계획이 가리키는 기준선은 UI-SPEC rev 10(r2 · 밤 위임 확정 포함 — rev 번호는 그대로)이다. UI-SPEC 쪽 **물리 줄 번호 인용은 플랜 본문에 0건**(절 이름 인용)이라 줄 번호 표류는 없다.
- B2 바뀐 절 제목 — rev 10이 제목을 바꾼 절을 옛 제목 그대로 인용한 `read_first` 7줄은 찾아도 안 나온다: 「S9. 법인카드 사용 등록·수정 폼」(06-05:154 · 06-25:187) · 「S12. 구매 요청 신청 폼」 · 「S13. 구매 완료 — 카드 사용 폼의 구매 완료 모드」(06-08:144 · 06-12:196 · 06-25:243) · 「SP-2. §7-5 상태 낱말·종류 추가」(06-13:214) · 「SP-6. §7-10에 「마지막 증빙 삭제」 확인」(06-11:275 — SP-6은 철회). 지금 제목은 S9 UI-SPEC:697 · S12 UI-SPEC:813 · S13 UI-SPEC:831 · SP-2 UI-SPEC:1090 · SP-6 UI-SPEC:1118이다. 번호 머리(`S9.`)와 낱말 하나로 인용하면 다음 개정에 안 깨진다.
- B3 SYSTEM · ROADMAP · 원본 코드 줄 번호 인용(`read_first` 본문 10줄 중 확인한 것) — 어긋난 것: 06-23:162(§7-4는 지금 SYSTEM:927), 06-24:112(Phase 6 성공 기준은 지금 ROADMAP:720-726), 06-02:142(`SETTING_DEFS` 배열은 `domain/settings/keys.ts:460`, 190-230행 밖). 맞는 것: `domain/settings/keys.ts` `document_number.project.*`(:262-282, 06-02:214의 230-290행 안) · `domain/revenue/index.ts` `computeGrossFromPayment`(:87, 06-05:215의 80-100행 안) · `domain/org/index.ts` `teamAtDate`(:193, 06-14:165) · `pg_blocking_pids` 대기 판정(`test/integration/projects-create-concurrency.test.ts:96-102`, 06-08:197의 96-142행 안). 나머지 3줄(06-19:160 · 06-19:163 · 06-20:186)은 확인하지 않았다 — 05 · 04.6 머지로 밀리는 값이라 함수 이름으로 바꾼다.

**06-01 — SP 기록 · 상태 낱말(W1 · fm 6 · 문서 + 매핑, 사용자 체크포인트)** — 적용: §1.6 · X1 · X4 · X6 · C11 · C14 · J1 · J3 · J8
- 낡은 곳
  - SP 개수: 「SP-1~SP-7 일곱 항목」(06-01:26) — SP-6은 철회됐고 SP-8이 없다. 검사 명령 `grep -o "SP-[1-7]" … | wc -l` = 7(06-01:193 · 06-01:199)은 id가 1..7이라고 가정한다 → 허용 id 집합 `{1,2,3,4,5,7,8}`(+ SP-9가 서면 9)을 단언하고 `SP-6`은 DECISIONS에 0건이어야 한다. ROADMAP의 06-01 줄도 「SP-1~6」이다(ROADMAP:733).
  - 낱말 파일: 새 `app/(app)/status-display.ts` · `test/unit/status-display.test.ts`(06-01:10 · 06-01:11 · 06-01:25 · 06-01:158 외 §5.2의 34줄)는 UI-SPEC이 **버린 대안**이다 — 「페이즈 전용 `status-display.ts` — 같은 낱말의 두 정본」(UI-SPEC:1094). → `ui/status-tag/status-map.ts`의 한 표에 낱말을 더하고 `test/unit/ui/status-map.test.ts`가 잡는다(낱말마다 한 색 · 표 밖 낱말 타입 오류). 05-05가 이미 `app/(app)/expenses/status-display.ts`(`expenseStatusWord`)를 두었으나 그 파일은 **낱말만** 돌려주고 색은 `status-map.ts`가 정한다 — domain 값 → 낱말 변환이 필요하면 그 꼴만 허용(J8).
  - `status-map.ts`에 더할 낱말은 main에 없다(grep 0건): `구매 요청 중`(accent) · `지급 완료`(success) · `카드 사용`(success) · `확인 전`(accent) · `확인됨`(success) · `면제`(muted) · `선결제`(warning) · `구매 완료`(success) · `발행됨`(success)(UI-SPEC:259-274). `지출결의 중`(accent)은 05(PR #162)가 이미 더했고, 재사용 낱말 `증빙 없음` · `반려` · `미착수` · `취소` · `신청됨`은 main에 있다. 같은 낱말에 두 색이 없어야 하고(`지급 완료`는 두 행 모두 success) `지출결의 중` · `구매 요청 중`은 `text` 변형만(「4자 이하」는 `tag`에만).
  - 낱말 이름: 견적 줄 우선순위의 `구매 요청`(06-01:103) → `구매 요청 중`(F3 사용자 확정). `요청`(06-01:105) · `신청`(06-01:106) → `신청됨`(이미 `status-map.ts`에 있다).
  - SP-4 서술 「PageHeader 부제 = 부모 메뉴」(06-01:186) → 하위 목록도 `ListScreen`이고 **부제 없음**, 부모는 셸의 현재 메뉴가 말한다(UI-SPEC:1108).
  - SP-1은 rev 9 보강 네 문장(06-01:27)만 있다 — rev 10 재작성분(`ListScreen.primaryAction` 버튼 갈래 → SYSTEM §7-20, `ui/table` `selectable` 열 폭 식)이 없다. SP-7은 상태 계약 둘(r2 R3: 열 때 LOADING · 새로 고침 뒤 열린 채 다시 세움)을 §7-17 문장에 담아야 한다(06-01:28 · UI-SPEC:1125).
  - ledger 한 줄 「Codex 대신 Opus … 한도 풀리면 Codex 재확인 필요」(06-01:291) — rev 10 r2에서 Codex 검토가 이미 돌았다(§4.2). 새 라운드 행으로 대체 표기.
- 더할 것
  - 기록 순서는 UI-SPEC 문장 그대로: SP-1 · SP-4 · SP-8을 DECISIONS에 → SYSTEM §7-3 · §6-1 · §7-8에 → SP-2 낱말을 §7-5 보강 줄 + `status-map.ts`, SP-3 · SP-5 · SP-7도 같은 태스크(UI-SPEC:1071). 한 커밋 한 의도(DECISIONS 커밋 → SYSTEM 커밋)와 `git log` 순서 검사는 이미 06-01에 있다(§1.6).
  - **SP-9(짝 격자, O-23)**: UI-SPEC은 「06-02/03 계획이 SP로」(UI-SPEC:937)라 하지만 DECISIONS · SYSTEM 편집을 두 플랜이 하면 같은 웨이브에서 파일이 겹친다 → 06-01이 기록하고 컴포넌트는 06-02(또는 J1의 새 플랜)가 짓는 것을 권한다.
  - F16: `test/unit/design/tokens.test.ts`에 대비 단언 추가(`--accent-weak` 위 다섯 쌍 · `--status-warning` × `--surface-group`) + SYSTEM 허용 쌍 목록 갱신(UI-SPEC:1092) — `files_modified`에 이 테스트가 없다.
  - design-review C1: SYSTEM §6-1 합계 줄 문장(금액 `--text-subtitle` 700)을 사용자 결정 ⑥(합계 글자 14 굵게)에 맞춰 정리(design-review-rev10:43) — 새 토큰 없음.
  - `ui/status-tag/status-map.ts` · `docs/design/`을 고치므로 design-gate 호출(훅 강제, §1.2 FE:12). `결정자` 칸에는 사용자 인용이 아직 없다 — 체크포인트로 사용자 확인을 받는다(J3).

**06-02 — 설정 키 · 메뉴 키 · 돈 함수(W1 · fm 11 · 위험 경로 `domain/permissions/`)** — 적용: X8 Q4 · X6 e · S20 · C7 · J1
- 낡은 곳: 새 설정 키 **넷**(06-02:30)이 「화면 코드 없이」 나온다(06-02:30 · 06-02:121), 이 플랜은 설정 화면 코드를 고치지 않는다(06-02:38 · 06-02:280). S20 truths는 empty · loading · error 셋뿐이다(06-02:37).
- 더할 것: 다섯째 키 `지급 방식 · 증빙 종류 짝`(기본 빈 값 = 짝 검사 없음, 키 이름은 가칭 — UI-SPEC:937)과 **짝 격자 입력**(행 = 지급 방식 코드 · 열 = 증빙 종류 코드 · 칸 = 체크박스) — §7-2 자동 렌더(boolean · number · string) 밖이라 화면 코드가 생긴다. 선례 `ui/permission-grid`(칸마다 즉시 저장 + 토스트)는 이 페이즈 「토스트 없음」과 갈리므로 재사용 여부를 ⓪에서 확인. 06-02의 E2E 이름 `permissions-grid`(06-02:278)와 혼동하지 않게 한다. 화면을 만지게 되므로 공통 묶음 A가 붙는다(지금은 「화면 코드를 고치지 않는다」라 DOM 감사 backstop 2건만).

**06-03 — 단건 지급 완료 트레이서(W2 · fm 17 · 돈 · 잠금 · 위험 경로)** — 적용: X4 · X7 · X8 Q4 · Q6 · X9 · X12 · S5
- 낡은 곳: `app/(app)/status-display.ts` 의존(06-03:143) → `status-map.ts`. P3 이유 `증빙 없음 · 담당 PM {이름}`(06-03:207) → `기안자`. `.num` 클래스(06-03:210) → `ui/num/Num`. 지급일 기준일 함수(06-03:205)는 지급일이 오늘 이후로 열리지 않는다고 가정한다.
- 더할 것: ① Q6 지급일 미래 허용 — 미래 지급일의 세율 기준(원천징수 · 회사 대납은 지급일 기준 — 오늘 이후 날짜에 유효한 세율 행이 없을 때의 규칙)을 ⓪에서 확인하고 RED 케이스 하나. ② Q4 짝 게이트 `payment.method-evidence-mismatch`(가칭)를 `completeExpensePayment` 게이트 순서에 둔다(결재 통과 → 증빙 → 짝). ③ 행동 줄: `DetailScreen` `actions.primary` 하나(SP-3) · 성공 뒤 1차 자리 결과(토스트 없음) · F5 포커스(§2.3 S5). ④ fm 17은 체커 표의 막음 문턱(15+)을 넘지만 사용자가 분할 안 함으로 정했다(.continue-here:54) — 재계획이 파일을 더 늘리지 않는다.

**06-04 — S5 지급 섹션 완성(W3 · fm 14 · 돈 · 잠금)** — 적용: X1 · X7 · X8 Q4 · Q6 · X9 · X11 F5 · X12 · S5
- 낡은 곳: P3 이유 `담당 PM {이름}`(06-04:35 · 06-04:39) · `pmName` 식별자(06-04:194 · 06-04:199) → `기안자` · `drafterName`류(출처는 05 실물에서 확인). `--faint`(06-04:45 · 06-04:165) → `--text-faint`, `.num`(06-04:165) → `Num`. 증빙 게이트 입력이 파일 수를 직접 읽는다(06-04:42).
- 더할 것: 증빙 판정은 `hasEvidence` 한 함수(무효 파일 제외 — UI-SPEC:67), 지급일 칸은 기본 오늘 · 미래 허용(06-04:33 — Q6), 지급 완료 · 지급 취소 뒤 F5 포커스 + 1차 자리 결과 글자, 짝 게이트(`payment.method-evidence-mismatch` 가칭)와 비활성 이유, 칸 폭 `--field-w-short` · `--field-w-long`(페이지 배치).

**06-05 — 카드 사용 등록 첫 경로 · S8 목록 · S9 폼(W3 · fm 14 · 돈 · 마이그레이션)** — 적용: X1 · X2 · X3 · X5 · X8 Q3 · Q5 · Q6 · X10 · X12 · S8 · S9 · C5 · J2
- 낡은 곳: 페이지 폼 `card-usage-form.tsx`(06-05:16)와 「저장 → `/cards`로 돌아가」(06-05:33). S8 오른쪽 3차 `구매 요청` + 1차(06-05:45). 보관 · 토스트 `되돌리기` 서술(06-05:50). `--faint`(06-05:52). `.num` · `ListEmpty` 자리(06-05:184 · 06-05:184). 「입력 버리기」 `ConfirmDialog` 의존(06-05:127)은 `SidePanel`이 그린다.
- 더할 것: S8 = `ListScreen`(`title="카드 사용"` 부제 없음 · `filters` · `primaryAction` 링크 `/cards?new=1` — 쓸 카드 0장이면 안 넘김 · `summary` · `empty` · `pagination` · `panel`), S9 = `SidePanel` + `PanelForm`(`intent="create"`)과 `Form layout="panel"`(precedent: `app/(app)/admin/vendors/page.tsx`의 `panel={<SidePanel …>}`, `app/(app)/admin/corp-cards/page.tsx`). 등록 뒤 패널 열린 채 + 결과 한 줄 `카드 사용 등록됨 · 1,240,000`, 토스트 · 등록 `되돌리기` 없음. 사용일 `max` = 오늘(KST) + 서버 거부(Q6), 카드 자격에 `공용`(Q5 — **스키마를 06-05가 만지지 않는다**: C5), 서버 기본값은 이미 `cardUsageFormDefaults`로 맞다. 하위 링크 `구매 요청 {N}`은 필터 묶음 끝 3차(SP-4)로.

**06-06 — S4 증빙 확인(W4 · fm 14 · 돈 · 잠금 · 마이그레이션)** — 적용: X1 · X4 · X7 · X9 · X11 F2 · F5 · S4
- 낡은 곳: `statusDisplay`(06-06:46) → `status-map.ts`. `--faint`(06-06:44 · 06-06:244). 증빙 값 `없음`(06-06:34) → `증빙 없음`/`—`. `pmName`(06-06:35 · 06-06:207). 「06-11 훅이 늘 version을 올림」 전제(06-06:42)는 훅 범위가 바뀐다(C2).
- 더할 것: F2(금액 빈 `확인 전`: 금액 칸이 처음부터 열린 입력, 1차 `증빙 확인`은 금액이 찰 때까지 비활성 + `증빙 금액 없음`), F5 포커스, 05-09가 `expenses.evidence_attach`를 더한 **뒤** 착수(UI-SPEC:59), `resolveEvidenceStatus` 입력의 증빙 유무 = `hasEvidence`(live files). 섹션 = `DetailScreen.Section` + `Form layout="page"`.

**06-07 — 카드 사용 연결 · S10 · S15(W4 · fm 17 · 잠금)** — 적용: X1 · X3 · X6 b · X8 Q3 · X14 · S10 · S15 · C1 · C13 · C14
- 낡은 곳: 전용 `link-picker.tsx`(06-07:16 · 06-07:185)와 「PC 480 모달 · 폰 시트」(06-07:79 · 06-07:55 · 06-07:57). 현재 줄 700 + 왼쪽 2px `--accent`(06-07:47) — 2px 막대는 시스템 요소라 유효, `700` → `--fw-bold`. S15 부제(06-07:53 · 06-07:54). 오류 리터럴 「…불러오지 못했습니다」(06-07:46)는 C13.
- 더할 것: S10은 `ui/confirm-dialog`의 **검색 고르기 갈래**(SP-8)를 쓰는 쪽이다 — 갈래가 06-07 4웨이브 앞에 있어야 한다(J1). Q3: 줄 연결 게이트에 「실행가 초과」 판정(B-1 잠금 뒤, 서버 거부와 같은 판정)과 줄 아래 `Form.Hint` `남은 실행가 {값} · 카드 사용 {N}건 {합}`. 줄 행 = 실행가 `Num` + 2행 `남은 실행가`, 남은 0 이하 `aria-disabled` + 이유. S15 = `DetailScreen.Section` + 읽기 표, 행 → 권리 있으면 S9 수정 패널(`/cards?editId={id}`), 없으면 `RowSheet`. fm 17 — 06-03과 같이 분할 안 함(.continue-here:54), 파일을 더 늘리지 않는다(검색 고르기 갈래는 J1 플랜 몫).

**06-08 — 구매 요청 신청 경로 · S11 목록(W5 · fm 14 · 잠금 · 마이그레이션)** — 적용: X1 · X2 · X3 · X4 · X5 · X8 Q2 · Q3 · X11 F15 · S11 · S12
- 낡은 곳: 페이지 폼 `purchase-request-form.tsx`(06-08:16), 저장 순간 번호 + 토스트(06-08:33 · 06-08:154), 기본 보기 `신청`(06-08:42), 링크 칸 480(06-08:47).
- 더할 것: `app/(app)/cards/purchases/page.tsx`는 처음부터 `ListScreen`(`title="구매 요청"` · `primaryAction` 링크 `/cards/purchases?new=1` · `filters` · `panel`), 신청 = 옆 패널(`/cards/purchases?new=1[&line={id}]`, 뒤는 항상 S11 — `closeHref`), 등록 뒤 패널 열린 채 + 결과 한 줄 `구매 요청됨 · 26001-C0001`. 링크 아이콘 누르는 영역 44×44(F15). Q3: 공급가 추정이 남은 실행가보다 크면 1차 막힘. 낱말 `신청` → `신청됨`.

**06-09 — 대리 등록 · 카드 사용 수정 · 삭제(W5 · fm 13 · 권한 · 잠금)** — 적용: X1 · X3 · X5 · X8 Q3 · Q5 · S8 · S9
- 낡은 곳: 수정 모드 2차 `카드 사용 삭제` + 토스트 `되돌리기`(06-09:45 · 06-09:46 · 06-09:47 · 토스트 의존 06-09:131). 행을 누르면 `?editId=`(06-09:49). 카드 `Select`(200)(06-09:50), 480 칸(06-09:52), `Form.Actions`(06-09:226).
- 더할 것: 삭제는 **S8 행**의 `삭제`(`RowAction danger`, 맨 끝, 구매 완료로 생긴 건은 `수정`만) — 확인 없이 보관 + 표 위 결과 줄 `카드 사용 삭제됨 · 48,000` + 3차 `되돌리기`(`role="status"`, 포커스 → `되돌리기`, SYSTEM:1008). 수정 패널에는 삭제 버튼이 없다. `restoreCardUsage` 보관 해제 서버 경로는 그대로 필요하다. 카드 `Select`는 패널 전폭. 대리 등록 「사용한 사람」 후보는 공용 카드면 사용일에 재직한 사람 전부 · 기본값 없음(Q5).

**06-10 — 증빙 면제 · 선결제(W6 · fm 15 · 권한 · 마이그레이션)** — 적용: X1 · X4 · X9 · S4 · S6 · C6
- 낡은 곳: 증빙 값 `없음`(06-10:36 · 06-10:44) + P3 이유 `담당 PM {이름}`(06-10:44). `선결제 사유` 480 칸(06-10:39). PM 폼 경로 `app/(app)/expenses/expense-form.tsx`(06-10:16) — 05 실물은 `app/(app)/expenses/[id]/expense-form.tsx`(PR #162 head `git ls-tree` — 이름 대조는 `replan-A-05-names.md`).
- 더할 것: 증빙 필수 on → `증빙 없음`(danger), off → 빈 값 `—`(상태 낱말 아님), P3 이유 `증빙 없음 · 기안자 {이름}`, 칸 폭 `--field-w-long`, 체크박스 `--native-accent`.

**06-11 — 증빙 수명 주기(W7 · fm 15 · 잠금)** — 적용: X7 · X13 · S4 · S7 · C2 · J5(05 의존)
- 낡은 곳: 훅 「PM이 증빙을 더하거나 떼거나 금액을 고치면 확인이 풀린다」(06-11:34) · 결재 통과 문서의 version +1(06-11:36) · `invalidateEvidenceReview`(06-11:37). 마지막 삭제 확인 모달(06-11:51) · `lastEvidenceDeleteNeedsConfirm`(06-11:75 · 06-11:248 — SP-6 철회).
- 더할 것: 훅은 **두 길**만 푼다 — 승인 뒤 기안자 「추가」(파일 + 그때 적는 증빙 금액)와 시스템 관리자 「무효」(`expenses.evidence_void`). 결재 중 권한자 추가는 확인 기록이 없어 확인을 건드리지 않고 결재 인스턴스 `version`만 올린다(05-09). 결재 중에는 아무도 못 뗀다. 06-11은 05-09 머지 **뒤** 착수(UI-SPEC:59). 마지막 증빙 삭제 모달 · `lastEvidenceDeleteNeedsConfirm` 일체 제거(06-16:143 · 06-25:51 · 06-01 SP-6도). 증빙 유무 = `hasEvidence` 한 함수에 무효 파일 제외를 넣는다(`listEvidenceVoidSignals`와 한 신호 — UI-SPEC:67).

**06-12 — 구매 완료 S13(W7 · fm 14 · 돈 · 권한 · 마이그레이션)** — 적용: X1 · X3 · X5 · X8 Q2 · Q3 · X11 F6 · R2 · R6 · S13 · C14
- 낡은 곳: `신청` 행에서 S13 카드 폼 구매 완료 모드(06-12:33) · 구매 완료 토스트(06-12:34) · 라우트 `/cards?new=1&purchase={id}`(06-12:155 · 06-12:305) · `--muted`(06-12:39) · `--faint`(06-12:45).
- 더할 것: S13 = `/cards/purchases?purchase={id}`(구매 요청 목록 위 옆 패널, `PanelForm intent="edit"`, 칸은 S9 재사용 — 한 칸 컴포넌트). 성공 뒤 닫힘 + 그 행이 `구매 완료` + 2행 `카드 사용 09-20 · 1,238,000`, **포커스 = 다음 `신청됨` 행의 `구매 완료`**(없으면 화면 제목, F6). 실행가 초과 문구는 S13 갈래(`다른 줄 고르기` 없음, R2), 활성 카드 0장은 카드 칸 `—` + 1차 비활성 + `활성 법인카드 없음 · 카드 등록은 관리자`(R6). 취소 없음(Q2). `files_modified`의 `app/(app)/cards/page.tsx` 진입 설명을 `/cards/purchases/page.tsx`로.

**06-13 — 지출결의 쪽 이중 연결 게이트 · 견적 줄 상태 파생 · S14(W7 · fm 14 · 잠금)** — 적용: X1 · X4 · S14 · C3
- 낡은 곳: 우선순위 `… 구매 요청 > 지급 완료 …`(06-13:33) → `구매 요청 중`. 파생 위치 `domain/quotes/line-status.ts`(06-13:34) — UI-SPEC은 05-15의 `app/(app)/projects/status-display.ts` 확장 + `status-map.ts`를 가리킨다(C3). `--fs-xs` · `--warning`(06-13:35 · 06-13:47). 행 행동 `구매 요청`(06-13:44)은 행동 이름이라 그대로(낱말 충돌은 상태 낱말만 `구매 요청 중`으로 풀었다).
- 더할 것: `지출결의 중`(`text` 변형만) · `구매 요청 중`을 `status-map.ts`에, 2행 `증빙 N일 경과`는 `--text-tag` 400 `--status-warning`, 증빙 없음 판정 = `hasEvidence`(무효 제외).

**06-14 — 구매 요청 마감(W8 · fm 14 · 잠금 · 권한)** — 적용: X1 · X5 · X8 Q2 · Q3 · X11 F6 · F15 · S10 · S11 · S12
- 낡은 곳: 본인 취소 → 토스트 `되돌리기`(06-14:38), `신청` 상태 서술(06-14:37 · 06-14:46 — 41줄 §5.7), `--faint`(06-14:49), 구매 완료 라우트(06-14:323).
- 더할 것: 본인 취소는 표 위 결과 줄 `구매 요청 취소됨 · 26001-C0001` + 3차 `되돌리기`(`신청됨`으로) — 토스트 · 등록 `되돌리기` 없음. **취소는 `신청됨`에서만**(Q2): `구매 완료` 행에 취소를 렌더하지 않는다(prohibition + RED). S10 `purchase` 모드는 SP-8 갈래를 쓰고 남은 실행가 0 이하 줄은 `aria-disabled` + `실행가 소진 · 다른 줄`. Q3 확인 후보: 다른 `신청됨` 요청의 예상 금액은 남은 실행가에서 **빼지 않는다**(UI-SPEC:826-829) — 이 플랜이 확정. 하위 링크 `구매 요청 {열린 건수}`(SP-4).

**06-15 — 일괄 지급 뼈대 S1 · S2 · `ui/table` selectable(W8 · fm 14 · 돈 · 권한)** — 적용: X1 · X2 · X5 · X6 a d · X8 Q4 · Q6 · X11 F7 · X13 · S1 · S2 · C6 · C10 · C14
- 낡은 곳: 파일 `app/(app)/expenses/page.tsx`(06-15:14) — 05가 지운 파일이다(05 실물 `app/(app)/expenses/(list)/page.tsx` + `layout.tsx` · `list-columns.ts` · `expenses-table.tsx` · `status-filter.tsx`). 선택 열 폭 44(06-15:45). S2 지급일 한 칸 기본 오늘만(06-15:52). 일부 처리 토스트(06-15:55).
- 더할 것: S1 = `ListScreen`(`title="지출결의"` 부제 없음 · `primaryAction` **버튼 갈래** `지급 완료 N`(≥1024에서만) · `summary` 합계 면 · `ui/table` 편집 표 + 선택 열) — **버튼 갈래와 `ListScreen.tsx`는 주인이 없다**(C14), `files_modified`가 이미 14이고 `ListScreen.tsx`와 그 단위 테스트(`test/unit/ui/list-screen.test.ts`)를 더하면 16이라 16번째 파일 방아쇠에 걸린다(C10). 선택 열 폭은 `calc(var(--row-number-w) + 2 * var(--cell-pad-x))`(= 44, UI-SPEC:1073-1088). 선택 칸 판정에 Q4 짝 규칙 + `hasEvidence`. S2 확인 근거 한 칸 = 지급일(기본 오늘 · 미래 허용 · `--field-w-short`), 토스트 없음 — 결과 글자 `14:02 지급 완료 5건 · 막힘 2건`이 처음부터 DOM에 있는 `aria-live="polite"` 영역에 쓰인다. 고른 이체액 합 `--text-body` + `--fw-bold`(F7).

**06-16 — 차수 승인 증빙 S21 · 리저브 줄 증빙 S22(W8 · fm 15 · 권한 · 마이그레이션)** — 적용: X1 · X5 · X7 · X11 F10 · S21 · S22 · C1
- 낡은 곳: 제목 `--fs-sm` 600 + 2px `--line-strong`(06-16:194) → `--text-aux` 600 + 위 1px `--border-row`. 부제 `승인 {승인일}`(06-16:48) — S21 펼침 섹션은 04 S5 「차수 열기」 마크업이라 `DetailScreen.Section`이 아닐 수 있다(C1 확인). `lastEvidenceDeleteNeedsConfirm` 의존(06-16:143). `담당 PM`(06-16:45)은 P3 낱말 바꿈 대상이 아니다(S21 `올리기는 담당 PM` 그대로).
- 더할 것: **F10** — 증빙 삭제 뒤 펼침 섹션 위(S21)/표 위(S22) 결과 줄 `증빙 삭제 · {파일명}` + 3차 `되돌리기`(확인 창 대신 되돌리기, 마지막 파일 삭제도 모달 없음) — 서버 쪽 되돌리기 경로(파일 행 `removed_at` 해제)가 Phase 5 첨부에 있는지 ⓪에서 확인, 없으면 이 플랜 범위. 밤 위임 5건 중 하나로 사용자 확정.

**06-17 — 일괄 지급 마감 · 제자리 증빙 확인(W9 · fm 14 · 돈 · Task 4개)** — 적용: X1 · X5 · X6 c · X8 Q4 · Q6 · X11 F2 · F7 · R1 · R3 · N3 · S1 · S2 · S1 제자리 증빙 확인
- 낡은 곳: 차이 `--warning`(06-17:33) · 합 요청 중 `--faint`(06-17:39) · 모달 폭 `--modal-w`(06-17:68 → `--dialog-w`). 첨부 보기 칸 슬롯(SP-7)의 주인(06-17:51).
- 더할 것: SP-7 슬롯 acceptance에 상태 계약 둘(열 때 LOADING `…` + 1차 `aria-disabled` · 새로 고침 뒤 열린 채 다시 세움, R3). 제자리 확인 분기: F2(금액 빈 `확인 전`은 모달을 열지 않고 3차가 문서 화면 `?from=pay`로) · R1/N3(확인 뒤 자동 선택은 선택 칸이 `고를 수 있음`일 때만, 짝 막힘이면 편집 칸 · 합 갱신 · 포커스를 하지 않는다) + 짝 막힘 E2E. 합계 줄 이체액 합 굵게(F7, `--fw-bold`). S2 지급일 미래 허용 E2E 1건.

**06-18 — 세금계산서 발행 요청 S16(W9 · fm 14 · 매출 · 마이그레이션 · 위험 경로)** — 적용: X1 · X4
- 낡은 곳: 상태 값 `요청`(06-18:44 — 22줄 §5.7) → `신청됨`. 2행 `--muted`(06-18:45).
- 더할 것: 낱말 · 토큰만(구조 변경 없음 — 소제목 `발행 요청` `--text-aux --text-muted`, 상태 `신청됨`, 2행 `--text-muted`). `담당 PM`은 그대로.

**06-19 — 완료 전 점검 판정 · S18 섹션(W10 · fm 13 · 결재 · 잠금)** — 적용: X1 · X4 · X7 · X8 Q7 · S18 · C1
- 낡은 곳: `--warning`(06-19:36) · `--muted`(06-19:37) · `--danger`(06-19:43). 섹션 부제 `정산 결재 전 · 막힘 {N}건`(06-19:39 · 06-19:43) — `DetailScreen.Section`에는 부제 prop이 없다(C1).
- 더할 것: 미결 지출결의의 `증빙 없음` 판정 = `hasEvidence`(무효 제외, 면제 제외). 계산서 없는 카드 매출은 06이 바꾸지 않는다는 prohibition 한 줄(Q7 — UI-SPEC:917).

**06-20 — 지급 완료 보기 S3 · 문서 화면 왕복 · 필터(W10 · fm 11)** — 적용: X1 · X2 · X4 · X11 F9 · S3 · C6 · C13
- 낡은 곳: 파일 `app/(app)/expenses/page.tsx`(06-20:11). 그룹 `이번 주` → `지난주` → 날짜 범위(06-20:36) — 맨 앞 `예정 지급` 그룹이 없다. 필터 값 `없음`(06-20:39) → `증빙 없음`. 읽는 낱말 파일(06-20:161). 오류 리터럴 「…불러오지 못했습니다 · 다시 시도」(06-20:35) — C13.
- 더할 것: **F9** 미래 지급일이 있으면 맨 앞 `예정 지급` 그룹(그룹 판정은 서버, 06-15 그룹 판정과 한 함수 — 밤 위임 확정). 틀 = `ListScreen`(1차 없음). `[증빙 ▾]` 값은 서버 열거에서 온다(6.1이 값을 더해도 화면 코드 변경 없음).

**06-21 — 발행 요청 마감 S17(W10 · fm 11 · 매출 전이 · 잠금)** — 적용: X1 · X2 · X4 · S17
- 낡은 곳: `PageHeader` 제목 + 부제 = 부모 메뉴(06-21:34 · 06-21:189). 필터 `요청` 기본(06-21:30). `희망일 지남` `--warning`(06-21:40).
- 더할 것: `ListScreen` `title="발행 요청"`(부제 없음, `primaryAction` 없음) · 필터 `[신청됨 ▾ | 발행됨 | 취소 | 전체]`(기본 `신청됨`) · 그룹 `희망일 지남`(`--status-warning`). 프로젝트 목록 필터 묶음 끝 3차 링크 `발행 요청 {열린 건수}`(SP-4). 취소 확인은 `ConfirmDialog` 유지.

**06-22 — 완료 전 점검 대표 승인 경로 · S18 표시 마감(W11 · fm 9 · 결재 · 잠금)** — 적용: X1 · X4 · X7 · S18 · C1
- 낡은 곳: 점검 행 상태 글자가 `app/(app)/status-display.ts` 매핑을 거친다(06-22:40) → `status-map.ts`. `미결 없음` `--success`(06-22:36). 부제 `정산 결재 전 · 막힘 없음`(06-22:38).
- 더할 것: 점검 행의 `증빙 없음` 판정은 `hasEvidence` 하나. 막힘 이유의 `담당 PM`은 그대로.

**06-23 — 홈 「내 차례」 S19(W11 · fm 9)** — 적용: X1 · X9 · X4 · S19 · C8 · C13
- 낡은 곳: `구매 요청 — 신청 {N}건`(06-23:30) → `신청됨 {N}건`. P3 줄의 받는 사람 = 담당 PM · `pmName`(06-23:31 · 06-23:32 · 범위 `projects.pmUserId = viewer`: 06-23:132 · 06-23:297). 오류 줄 `--danger` + 「…불러오지 못했습니다」(06-23:37 · 06-23:37). 홈의 `PageHeader`(06-23:262) — 홈 `app/(app)/page.tsx`는 이미 `ListScreen title="내 차례"`이므로 대상이 없다. `read_first`의 SYSTEM 줄 인용 `783-789행(§7-4)` · `163행(빈 값 `—`)`(06-23:162 · 06-23:129)은 지금 §7-4 머리 SYSTEM:927 · 빈 값 규칙 SYSTEM:196과 다르다 → 절 이름으로 인용.
- 더할 것: `증빙 없음 · 지급 대기` 줄의 받는 사람 = **기안자**(P3 건을 그 건의 기안자에게), 완료 전 점검 막힘 = 담당 PM. 선결제 기한 초과 줄의 받는 사람은 UI-SPEC 문장이 모호하다(C8 — 결정 필요).

**06-24 — 페이즈 게이트(W12 · fm 3 · 마이그레이션 재생성)** — 적용: X13 · C11
- 낡은 곳: `verification: backstop` 「48건」(06-24:28 · 06-24:197 · 06-24:226) — UI Considerations만 backstop 52행이고 재계획이 더하는 backstop도 있어 다시 틀어진다.
- 더할 것: 숫자를 박지 말고 「06-01~06-25(+ 새 플랜) `grep -c 'verification: backstop'` 합」으로(교차 검토 X-5의 두 번째 안 — §4.3). 새 플랜(컴포넌트 갈래 · 공용 카드)을 `depends_on`에 넣는다. A1~A5 묶음을 한 번 걸고, 새 입력 · 컴포넌트(버튼 갈래 · 검색 고르기 갈래 · 짝 격자) DOM 감사 항목을 추가. Q5 마이그레이션이 별도 PR로 먼저 나가므로 번호가 겹치면 내 것을 지우고 `pnpm db:generate`로 다시 만든다(CL:152).

**06-25 — 카드 전표 첨부(W10 · fm 15 · 권한 · 마이그레이션)** — 적용: X3 · X5 · X7 · C4 · C9
- 낡은 곳: 카드 목록 DTO 불리언 이름 `hasEvidence`(06-25:102 · 06-25:170) — UI-SPEC의 `hasEvidence`는 지출결의 증빙의 한 서버 함수라 이름이 겹친다(C4). 라우트 `/cards?new=1&purchase={id}`(06-25:35 · 06-25:252). 마지막 삭제 모달 `lastEvidenceDeleteNeedsConfirm`(06-25:51). T-06-201 근거 「토스트 수명 안」(06-25:169,361,409) — C9.
- 더할 것: 카드 폼 첨부 영역은 옆 패널 안(한 열 · 폭 480 안, 폰은 아래 시트)이다. 카드 사용 첨부는 05 결재 규칙과 무관 — 무효 처리 · 결재 중 잠김이 없다(`증빙 열` 값 `있음`/`—` 그대로). 되돌리기 뒤 중복 수용 근거를 결과 줄 수명으로 다시 쓴다(C9).


### 2.5 충돌 · 미결 C1~C14와 재계획 판단 J1~J8

「충돌」은 플랜 문장이 UI-SPEC rev 10 · main 코드 · 기계 검사 · 05 결정과 **서로 맞지 않아 그대로 구현할 수 없는 것**이다(낱말 · 토큰 바꿈처럼 기계적으로 고칠 수 있는 것은 §5가 맡는다). 표기: C 번호는 이 절 안의 충돌 id이고, design-review-rev10의 `C1`(합계 14 굵게)은 늘 「design-review C1」로 적는다. 처리 열: **결정** = 사용자 또는 UI-SPEC 개정이 먼저 · **플랜** = 재계획이 플랜 문장으로 고치면 끝 · **PR 분리** = 위험 경로라 별도 PR.

| id | 한 줄 | 처리 |
|---|---|---|
| C1 | 상세 섹션 부제(S15 · S18 · S21)가 `DetailScreen.Section`에 자리 없음 | 결정 |
| C2 | 06-11 훅의 행위자 · 범위가 05 「결재 중 증빙」과 다름 | 플랜(05-09 의존) |
| C3 | 06-13이 새 `domain/quotes/line-status.ts`를 짓지만 UI-SPEC은 05-15 `lineStatusWord` 확장 | 플랜 |
| C4 | 06-25의 카드 목록 DTO `hasEvidence`가 UI-SPEC의 「한 서버 함수 `hasEvidence`」와 이름 충돌 | 플랜 |
| C5 | Q5 공용 카드는 `db/schema/`를 만지는데 UI-SPEC은 06-05에 맡기고 06-05엔 파일이 없다 | PR 분리 |
| C6 | 06-15 · 06-17 · 06-20의 `app/(app)/expenses/page.tsx` · 06-10 · 06-11의 `expense-form.tsx`가 05 실물과 다름 | 플랜 |
| C7 | 06-02 「새 키는 화면 코드 없이」 대 짝 격자(화면 코드 필요) | 플랜 + SP-9 |
| C8 | S19 선결제 기한 초과 줄의 받는 사람이 UI-SPEC 문장에서 모호 | 결정 |
| C9 | 되돌리기 수명이 토스트 → 결과 줄로 바뀌어 06-25 T-06-201 수용 근거가 사라짐 | 플랜(재판정) |
| C10 | 06-15가 `ListScreen.tsx` · 단위 테스트를 더하면 `files_modified` 16개(16번째 파일 방아쇠) | 플랜(J1이 풀어 준다) |
| C11 | 06-01이 SP-1~SP-7(철회된 SP-6 포함) · SP-8 없음 · `status-display.ts` | 플랜 |
| C12 | UI-SPEC의 SYSTEM 줄 인용이 §7-15 이후 +1 어긋남 | 플랜(절 이름 인용) |
| C13 | UI-SPEC · 플랜의 로드 오류 리터럴 「…불러오지 못했습니다」가 `error-copy-noun-style.test.ts`에 걸림 | 결정 |
| C14 | 주인 없는 컴포넌트 일 다섯(버튼 갈래 · 검색 고르기 갈래 · 짝 격자 · `ui/table` 폭 식 · SP-7 상태 계약) | 플랜(J1) |

**C1 상세 섹션 부제 ↔ `DetailScreen.Section`**
- 부딪힘: UI-SPEC rev 10은 상세 섹션에 「제목 + 부제」를 그린다 — S15 `법인카드 사용` + 부제 `{N}건 · 결제 합계 {합}`(UI-SPEC:862), S18 `완료 전 점검` + 부제 `정산 결재 전 · 막힘 3건`(UI-SPEC:373 · UI-SPEC:910), S21 펼침 `승인 {승인일}`(UI-SPEC:964). 그러나 `DetailScreen.Section`은 `Section({ title, children })`뿐이고(`ui/detail-screen/DetailScreen.tsx:52`) SYSTEM도 부제 prop 없음이라 적는다(SYSTEM:1247). 플랜(06-07:53-54 · 06-19:39,43 · 06-22:38 · 06-16:48)대로 구현하면 화면 파일이 부제 줄을 직접 그려 틀 밖 변형이 된다(DESIGN §4 규칙 3).
- 해법 후보: (a) `DetailScreen.Section`에 `subtitle?` prop 추가 — SP로 기록(S15 · S18 두 곳이라 규칙 3 충족) (b) 부제 정보를 섹션 본문 첫 줄 읽기 `--text-aux --text-muted`로 (c) 부제를 없애고 건수 · 합계는 그룹 머리글 · 합계 행이 말한다(CL:129의 「안내 문구 최소」에 맞다). S21 펼침은 04 S5 「차수 열기」 마크업이라 `DetailScreen.Section`이 아닐 수 있어 이 충돌에서 빠질 수 있다(06-16 ⓪에서 확인). 추천: (c)를 먼저 따져 보고 정보가 모자라면 (a). UI-SPEC 한 줄 개정(`/plan-design-review` 한 번)으로 닫는다.

**C2 06-11 훅 ↔ 05 「결재 중 증빙」**
- 부딪힘: 06-11은 「PM이 증빙을 더하거나 떼거나 금액을 고치면 확인이 풀린다」(06-11:34)이고 결재 통과 문서의 version을 +1 한다(06-11:36). 05 결정은 행위자가 다르다 — 결재 중에는 아무도 못 뗀다(붙이기는 `expenses.evidence_attach` 권한자), 승인 뒤에는 **기안자만 붙이고 시스템 관리자가 `expenses.evidence_void`로 무효**, 확인이 풀리는 서버 훅은 **두 길뿐**이다(UI-SPEC:56-58 · UI-SPEC:63). 결재 중 권한자 추가는 확인 기록이 없으므로 확인을 건드리지 않고 결재 인스턴스 `version`만 올린다(05-09).
- 영향: 훅을 PM 기준으로 구현하면 승인 뒤 기안자 「추가」와 시스템 관리자 「무효」에서 확인이 안 풀려 **보지 않은 증빙이 확인된 채 남는다**(06-06의 B-1 방어가 06-11 훅에 기대어 있다 — 06-06:42). 06-11은 05-09 머지 뒤 착수해야 한다(UI-SPEC:59).
- 권고: 훅의 호출 지점을 05 실물 함수 두 곳(기안자 추가 · 무효)으로 다시 잡고, 「결재 통과 문서 · 확인 기록이 있을 때만 확인을 푼다 + 문서 version +1」로 범위를 좁힌다(과거 X-1 — 결재 중 · 초안에서 version이 오르면 기안자 자신의 저장이 동시성으로 거절되는 문제 — 도 같이 닫힌다). 실물 이름은 `replan-A-05-names.md`.

**C3 견적 줄 상태 파생 위치**
- 부딪힘: 06-13은 우선순위 표를 새 `domain/quotes/line-status.ts` 한 곳에 둔다(06-13:34). UI-SPEC은 「05-15 `app/(app)/projects/status-display.ts` 파생 함수를 확장 — 새 파일 없음, 06-13」(UI-SPEC:259 · UI-SPEC:132). 05 브랜치(PR #162 head)의 그 함수는 `lineStatusWord(line: { lineStatus, linkedStatus })` — `취소 > 반려 > 지출결의 중 > 미착수` 넷이고 `StatusWord`(`status-map.ts`)를 돌려준다.
- 권고: 06-13이 `lineStatusWord`의 입력(`linkedStatus`)과 우선순위를 여덟 값으로 넓힌다(`취소 > 반려 > 증빙 없음 > 지출결의 중 > 구매 요청 중 > 지급 완료 > 카드 사용 > 미착수`). 서버 쪽 파생(문서 · 구매 요청 · 카드 사용에서 줄별 한 값)은 05가 넓힌 `domain/quotes/lines.ts` 위에 얹는다. 순수 함수를 `domain/`에 두고 `lineStatusWord`가 부르는 절충도 가능하나 낱말 표는 한 곳이어야 한다.

**C4 `hasEvidence` 이름 충돌**
- 부딪힘: UI-SPEC의 `hasEvidence`는 지출결의 증빙의 **한 서버 함수**(S1 · S4 · S5 · S14 · S18 · S19 · 지급 게이트 · 06-23 신호가 전부 이 하나를 부른다 — UI-SPEC:67)다. 06-25는 카드 목록 DTO의 불리언을 같은 이름으로 쓴다(06-25:102 · 06-25:170). 카드 전표는 05 결재 규칙과 무관하고 `voided_at`도 없어(UI-SPEC:669 — §2.3 S7) 같은 함수가 아니다.
- 권고: 카드 쪽 이름을 `hasCardSlip`류로 바꾸거나, 한 함수가 주인 종류를 받는 형태로 일반화하되 지출결의 판정 규칙(무효 제외)이 카드에 새지 않게 한다. 어느 쪽이든 06-25 acceptance의 `grep -c "hasEvidence"`가 지출결의 쪽과 섞이지 않게 한다.

**C5 Q5 공용 법인카드 ↔ 06-05 파일 목록**
- 부딪힘: UI-SPEC은 「06-05가 `공용` 갈래를 더한다 … `db/schema/`는 위험 경로라 별도 PR(사용자 머지)」(UI-SPEC:735)라 적는다. 지금 스키마는 소지자 · 팀 둘 중 하나가 필수(`db/schema/corp-cards.ts:32-35`의 `corp_cards_owner_xor_check`)이고 `CardOwnerKind = "personal" | "team"`(`domain/corp-cards/index.ts:45`), 관리자 카드 폼 소유 옵션은 `개인` · `팀` 둘이다(`app/(app)/admin/corp-cards/card-form.tsx`). 06-05의 `files_modified`(06-05:8-21)에는 이 파일이 하나도 없다.
- 권고(PR 분리): CHECK 완화 마이그레이션 + `CardOwnerKind` 확장 + 관리자 폼 옵션 `공용`(소유자 칸 없음) + 카드 옵션 자격 판정을 **위험 경로 전용 플랜 하나**로 떼어 06-05(W3) **앞**에 둔다(J2). 돈 · 결재 경로(`domain/corp-cards`)라 `/review` + `/cso`, 사용자가 GitHub에서 직접 머지(CL:105). 06-05 · 06-09는 그 결과를 읽는 쪽만 맡는다(S8 범위 · 「사용한 사람」 후보 · 카드 힌트 없음).

**C6 05가 바꾼 경로**
- 부딪힘: 06-15 · 06-17 · 06-20이 목록 파일을 `app/(app)/expenses/page.tsx`로 적는다(06-15:14 · 06-20:11). 05(PR #162 head, `git diff --name-status origin/main...refs/remotes/pr162`)는 그 파일을 **삭제**하고 `app/(app)/expenses/(list)/page.tsx`(+ `layout.tsx` · `loading.tsx` · `error.tsx`) · `expenses-table.tsx` · `list-columns.ts` · `status-filter.tsx` · `actions.ts` · `actions.registry.ts`를 더했다. 06-10 · 06-11의 PM 폼 `app/(app)/expenses/expense-form.tsx`(06-10:16 · 06-11:16)는 05 실물이 `app/(app)/expenses/[id]/expense-form.tsx`다.
- 권고: 파일 경로를 05 실물로 다시 잡고 「선행 의존(A-6xx)」 ⓪ 재확인 줄에 `git ls-files` 존재 확인을 둔다. 전체 이름 대조는 `replan-A-05-names.md`가 맡는다.

**C7 06-02 「화면 코드 없이」 ↔ 짝 격자**
- 부딪힘: 06-02는 새 키가 「화면 코드 없이」 설정 화면에 나오고(06-02:30) 이 플랜은 설정 화면 코드를 고치지 않는다고 못 박는다(06-02:38). UI-SPEC rev 10의 다섯째 키 `지급 방식 · 증빙 종류 짝`은 §7-2 자동 렌더 셋 밖이라 입력 모양을 **짝 격자**로 정했고 사용자가 확정했다(10/5 01:53, O-23 — UI-SPEC:937 · UI-SPEC:1411).
- 권고: 06-02(또는 J1의 새 컴포넌트 플랜)가 짝 격자 컴포넌트를 짓고, SYSTEM §7-2 새 입력 타입은 SP-9로 06-01이 기록한다(06-01 블록 참고). 06-02의 「화면 코드를 고치지 않는다」 두 줄(06-02:121 · 06-02:280)은 지운다.

**C8 S19 선결제 기한 초과 줄의 받는 사람**
- 부딪힘: UI-SPEC은 PM 항목을 「기안자 · PM 항목」으로 묶고 `증빙 없음 · 지급 대기` 줄의 받는 사람만 **기안자**로 명시하며, 선결제 기한 초과 줄의 받는 사람은 쓰지 않았다(UI-SPEC:925). 06-23은 둘 다 담당 PM이다(06-23:31).
- 판단: 선결제 증빙은 지급 뒤 **기안자**가 올린다는 05 규칙과 UI-SPEC의 지급 뒤 증빙 문장(S4)이 같은 사람을 가리키므로 기안자가 자연스럽다. 그러나 UI-SPEC이 말하지 않았으니 재계획이 추정하지 말고 한 줄 물어 확정한다(기본 추천: 기안자).

**C9 되돌리기 수명 ↔ T-06-201**
- 부딪힘: 06-25는 「되돌리기 뒤 중복」을 「토스트 수명 안의 동작이라 드물다」며 수용한다(06-25:169,361,409). rev 10의 되돌리기는 토스트가 아니라 표 위 결과 줄 + 3차 `되돌리기`(마지막 지운 한 건만, 다른 행을 지우거나 되돌리면 사라짐 — UI-SPEC:693 · UI-SPEC:1369 · SYSTEM:1008)이라 **다음 행동까지 남는다**.
- 권고: 수용 근거를 「결과 줄이 남아 있는 동안」으로 다시 쓰고, 그 사이 같은 전표가 다른 건에 붙은 뒤 되돌리면 어떻게 되는지(06-09 `restoreCardUsage`가 중복을 다시 보지 않는다) RED 케이스로 한 번 고정하거나 되돌리기 시 중복을 다시 본다로 바꾼다.

**C10 06-15 파일 수**
- 부딪힘: 06-15는 `files_modified`가 이미 14개이고 S1의 버튼 갈래를 위해 `ListScreen.tsx`를 더하면 15, 그 단위 테스트(`test/unit/ui/list-screen.test.ts`, 이미 있다)까지 만지면 16이다. 체커 `Files/plan` 표는 15+를 막음으로 보고(gsd-plan-checker:325) 플랜들은 15까지 「규모 근거」를 적어 받아들이되 **16번째 파일에서 멈춘다**(06-11:416 · 06-16:411) — 06-15는 그 방아쇠에 걸린다. 지금도 15 이상인 플랜이 여섯이다(06-03 · 06-07 = 17, 06-10 · 06-11 · 06-16 · 06-25 = 15 — 플랜 머리에서 센 값). 사용자가 분할 안 함으로 정한 것은 06-03 · 06-07 · 06-17 · 06-20이다(.continue-here:54). 선택 열 폭 「폭 44」(06-15:45)도 UI-SPEC은 `calc(var(--row-number-w) + 2 * var(--cell-pad-x))`(= 44)로 적는다(UI-SPEC:1073-1088).
- 권고: 버튼 갈래를 J1의 컴포넌트 플랜으로 옮기면 06-15는 14로 남는다.

**C11 06-01 대 rev 10 SP 집합**
- 부딪힘: 06-01은 SP-1~SP-7 일곱(06-01:26), 철회된 SP-6 포함, SP-8 없음, 검사 정규식 `SP-[1-7]`(06-01:193), 낱말 파일 `status-display.ts`(06-01:25) — UI-SPEC 기준은 SP-1 · 2 · 3 · 4 · 5 · 7 · 8, SP-6 철회(UI-SPEC:1070), 낱말은 `status-map.ts`(UI-SPEC:1094).
- 권고: §2.4 06-01 블록대로 다시 쓴다. ROADMAP의 06-01 줄도 「SP-1~6」이라(ROADMAP:733) GSD 도구로 같이 고친다(수동 편집 금지, CL:16).

**C12 SYSTEM 줄 인용 +1**
- 부딪힘: UI-SPEC은 SYSTEM 절 머리를 §7-15 :1147 · §7-16 :1186 · §7-17 :1210 · §7-20 :1240 · §9 :1272로 적는다(UI-SPEC:130 · UI-SPEC:158 · UI-SPEC:147). 실제 머리는 :1148 · :1187 · :1211 · :1241 · :1273이다(SYSTEM:1148 · SYSTEM:1187 · SYSTEM:1211 · SYSTEM:1241 · SYSTEM:1273). §7-17 안 「열 때 LOADING 없음」도 UI-SPEC은 :1224라 하나 실제는 :1225다(UI-SPEC:1131 · SYSTEM:1225). §7-10 :1020까지는 맞다.
- 권고: 플랜 `read_first`는 줄 번호 대신 절 이름(`SYSTEM §7-17 확인 모달`)으로 적는다(교차 검토 X-6과 같은 처방 — §4.3). 줄 번호를 못 박은 `acceptance`가 있으면 단언 대신 `grep -c 절 이름`으로.

**C13 로드 오류 리터럴 ↔ `error-copy-noun-style.test.ts`**
- 부딪힘: `FAILURE_SENTENCE`는 따옴표 · 백틱 · JSX 안의 「지 못했습니다」를 오류로 잡고(`app domain lib ui` 스캔 — error-copy-noun-style.test.ts:55-56) SYSTEM 카피 규칙은 오류를 「원인 · 다음 행동」 명사형 한 줄로 정한다(SYSTEM:1258-1267). UI-SPEC rev 10 Copywriting은 로드 오류 넷을 문장형으로 적는다 — `지급 대상을 불러오지 못했습니다 · 다시 시도` · `지급 완료 목록을 …` · `카드 사용 목록을 …` · 연결 고르기 · 「내 차례」(UI-SPEC:326-328) — 같은 표의 섹션 로드 · 증빙 확인 모달은 이미 명사형 `불러오지 못함`이다(UI-SPEC:329). 변경 8번은 「칸 오류」만 명사형으로 고쳤다고 한다(UI-SPEC:32). 플랜은 문장형을 그대로 못 박았다(06-07:46 · 06-20:35 · 06-23:37 · 06-23:247 · 06-23:253).
- 영향: 그대로 구현하면 `pnpm test`의 단위 검사가 빨갛다(main 선례: `app/c/`는 면제 접두어, 그 밖의 로드 오류는 `불러오지 못함`).
- 권고(결정): 구현은 명사형 `… 불러오지 못함 · 다시 시도`로 하고 UI-SPEC Copywriting 네 줄 · UIC 행 셋(S3 · S10 · S19 error)을 같은 꼴로 고친다 — 사용자 결정이 아니라 규칙 정합이므로 UI-SPEC r3 한 줄 개정이면 충분하다.

**C14 주인 없는 컴포넌트 일**
- 부딪힘: rev 10이 요구하는 컴포넌트 변경 가운데 06-17의 SP-7 `attachments` 슬롯(06-17:51)만 주인이 있다. 나머지 다섯 — ① `ListScreen.primaryAction` **버튼 갈래**(지금 링크 갈래뿐 — `ListScreen.tsx:13` `primaryAction?: { label; href; phoneHidden? }`, 요구: UI-SPEC:1080) ② `ui/confirm-dialog` **검색 고르기 갈래**(지금 `options` 갈래는 1차가 없다 — `ConfirmDialog.tsx:58` `options: ConfirmDialogOption[]`, 요구: UI-SPEC:1129-1133) ③ **짝 격자** 입력(SP-9) ④ `ui/table` `selectable` 폭 식(06-15가 맡되 값이 다름 — C10) ⑤ SP-7 상태 계약 둘 — 은 플랜 25개 어디에도 Task가 없다.
- 영향: 06-15(버튼 갈래) · 06-07 4웨이브(검색 고르기) · 06-02(짝 격자)가 컴포넌트 없이 화면부터 짓게 되고, `app/**`에서 `<dialog>` · `<table>`을 직접 쓸 수 없으니(UI-SPEC:146) 우회가 막혀 있다.
- 권고: J1.

**재계획이 정할 판단 J1~J8**(UI-SPEC이 정하지 않았거나 플랜 구조에 걸린 것 — 추천을 함께 적는다)
- **J1 컴포넌트 갈래 플랜**: 버튼 갈래(SP-1) · 검색 고르기 갈래(SP-8) · 짝 격자(SP-9)를 한 플랜(가칭 06-26, W2~W3 — 06-07 W4 · 06-15 W8 · 06-02 W1 앞뒤)에 모은다. 각각 DECISIONS → SYSTEM → 컴포넌트 · 단위 테스트 순서이고 새 색 · 토큰 없음. 대안(06-15 · 06-07 · 06-02에 흡수)은 06-15가 16이 되고 06-07은 이미 17인 위에 더 얹는다(C10).
- **J2 공용 카드 플랜(Q5)**: 위험 경로 전용 플랜을 06-05 앞(W1~W2)에 둔다 — `risk:` 태그 · Opus 실행자 · Opus 독립 검토 1명(CL:88) · 사용자 머지 PR(CL:105). 06-05 · 06-09는 읽는 쪽만.
- **J3 SP `결정자`**: SP-1~SP-8은 사용자 답으로 확정된 것이 없고 Opus 설계 검토의 제안이다(§1.6). 06-01의 DECISIONS 항목에 적을 `결정자`를 정한다 — 추천: UI-SPEC rev 10 `status: approved` + gsd-ui-checker APPROVED(UI-SPEC:10) + `/plan-design-review` 통과를 근거로 적고 06-01에 사용자 확인 체크포인트를 둔다. 밤 위임 5건(F3 · F8/O-23 · F9 · F10 · design-review C1)은 사용자 확정이다(§4.4).
- **J4 반려 · 회수 종결**: 06에 넣는다면 UI-SPEC rev 11 + 새 플랜, 아니면 사용자가 이월 시점을 정한다(§3).
- **J5 05 의존 배선**: 06-06 · 06-10 · 06-11은 05-09 머지(`expenses.evidence_attach` · `evidence_void` · `voided_at`) 뒤에 착수한다(UI-SPEC:59) — 플랜의 「선행 의존(A-6xx)」 표에 그 줄 + 멈춤 조건(`grep -c "voided_at" db/schema/…`)을 더하고 `depends_on`을 정한다.
- **J6 C1 부제**: (c) 부제 삭제 우선, 안 되면 (a) `subtitle?` prop(SP-10).
- **J7 C13 오류 리터럴**: 명사형으로 구현 + UI-SPEC r3 한 줄 정정.
- **J8 낱말 변환 함수**: 새 낱말 **표**는 만들지 않는다. domain 값 → 낱말 변환이 필요하면 05-05의 `expenseStatusWord`(`app/(app)/expenses/status-display.ts` — 낱말만 돌려주고 색은 `status-map.ts`가 정한다)와 같은 꼴만 두고 이름은 `status-display`가 아닌 것을 권한다(UI-SPEC:1094의 「두 정본」 금지와 혼동되지 않게).


## 3. 반려 · 회수 종결 — UI-SPEC rev 10에 화면 · 흐름이 있나

**결론: 없다.** UI-SPEC rev 10(1508줄)에는 「종결」 「종결(취소)」 항목이 0건이고 화면(S1~S22)도 흐름도 열린 선택(O-1~O-23)도 이것을 다루지 않는다. 25개 플랜 · ROADMAP · REQUIREMENTS · 이 브랜치의 `06-CONTEXT.md`에도 0건이다(`grep` 확인). 이 일을 06으로 넘긴 기록은 **05 브랜치(PR #162)에만** 있다.

### 3.1 넘어온 기록 (05 브랜치 PR #162 head — 이 브랜치에는 아직 없음)

- 사용자 결정 U2 「Phase 6 TODO 확정」(2026-09-26, 코디네이터 PR #89가 U2를 Phase 5 범위에서 제외). 05 브랜치 커밋 `0517e871`(2026-09-26 15:05 UTC, plan-ceo-review 반영)이 todo를 만들고 `317d6413`(15:13 UTC, 「apply user decisions U1 … and U2 (Phase 6)」)이 U2를 확정하며 `06-CONTEXT.md`에 한 문장을 더했다.
- todo `.planning/todos/pending/2026-09-26-phase-6-rejected-expense-close-path.md`(05 브랜치에만 있음)의 내용: **문제** — 번호를 받은 반려 · 회수 지출결의(예 `26001-0003`)가 ① 그 견적 줄의 문을 계속 닫고(1줄 1문서 · D-66) ② 분할 줄이면 회차 상한 계산에 계속 들어가며 ③ 비용이 실제로 취소돼도 그 줄은 계속 `반려`로 닫혀 있다. **제안(Phase 6에서 다룸)** — ⒜ 반려 · 회수 지출결의에 「종결(취소)」 동작을 둔다(기안자 또는 경영관리, 행동 로그는 같은 트랜잭션, 번호 재사용 없음) ⒝ 종결 문서는 회차 상한(`remainingForInstallments`)과 줄 문 판정(`expenseLineDoor`)에서 뺀다 ⒞ 목록 · 문서 화면 낱말, 되돌림 가능 여부, 권한은 Phase 6 계획 때 정한다. 이 세 가지(낱말 · 되돌림 · 권한)가 곧 UI-SPEC에 없는 디자인 결정이다.
- 05 브랜치의 `06-CONTEXT.md` 11줄: 「Phase 5에서 넘어온 것: … 반려·회수 지출결의 종결(취소) 경로 — 종결 문서는 회차 상한·줄 문 판정에서 제외(Phase 5 U2 이관 — 사용자 결정 2026-09-26 …)」. 이 브랜치의 같은 줄은 D-99 · D-100만 적는다(06-CONTEXT:11).
- 05(PR #162)가 머지되면 `06-CONTEXT.md`(M)와 todo(A)가 들어온다(`git diff --name-status origin/main...refs/remotes/pr162 -- .planning/phases/06-payment-evidence-cards .planning/todos` 결과). 재계획이 `06-CONTEXT.md` 11줄을 고치면 그때 충돌한다 — 11줄은 건드리지 않거나 05 문장을 보존한다.
- 호출 대상 함수: `expenseLineDoor`(PR #162 head의 `domain/expenses/line-door.ts:19`, 05-03) · `remainingForInstallments`(PR #162 head의 `domain/money/index.ts:219`, 05-03이 더했고 06-02도 같은 파일을 고친다) — 둘 다 **05가 만든 함수**라 이 브랜치(main 기준)에는 `domain/expenses/`가 아직 없고, 06이 고치려면 05 머지 뒤여야 하며, `domain/money`는 돈 경로(훅 `/cso` 대상)다.

### 3.2 rev 10 · 플랜에서 이 문제와 맞닿는 줄 (종결 경로가 없을 때 드러나는 곳)

| 어디 | 줄 | 내용 | 시사 |
|---|---|---|---|
| S18 점검 행 | UI-SPEC:374 · UI-SPEC:899 | 미결 지출결의 행 상태 글자 `결재 중` / `반려` / `증빙 없음` / `선결제 · 증빙 없음`, 행동은 3차 `지출결의 열기` 하나 | **반려 문서가 정산 결재를 막는데 그 막힘을 비우는 길이 화면에 없다**(증빙 없음 행의 길은 `증빙 면제`뿐 — UI-SPEC:910-912) |
| 미결 정의 | 06-CONTEXT:53 | 「미결 지출결의」 = 결재 중 · 반려 문서 + 증빙 없는 문서(면제 제외) | 종결한 문서를 이 집합에서 뺀다는 문장이 필요 |
| 06-19 트레이서 | 06-19:34 · 06-19:155 | 「정산 상태 프로젝트의 반려 지출결의 1건이 섹션에 서고 정산 결재 올리기가 막힌다」가 첫 케이스 | 종결 뒤에는 행이 빠지는 RED 케이스가 필요 |
| 견적 줄 상태 | UI-SPEC:260 · UI-SPEC:276 · 06-13:33 | 줄 한 값 우선순위 `취소 > 반려 > …` — `반려`는 「지출결의 쪽 문서 중 반려가 있다」 | todo ③이 바로 이 낱말 — 종결 문서는 파생에서 빠져야 줄이 `미착수`로 돌아온다 |
| 이중 연결 게이트 | 06-07:171 | 카드 쪽 게이트는 살아 있는 지출결의(반려 · 취소 제외)만 본다 | 카드 쪽은 이미 반려를 닫힌 문으로 보지 않는다 — 비대칭(지출결의 쪽 문은 05의 `expenseLineDoor`) |
| 결재 낱말 | UI-SPEC:112 · 06-03:37 | 결재 상태 낱말 `반려`(danger) · `회수`(muted), 결재 통과 전(결재 중 · 반려 · 회수)은 지급 막힘 | 종결 낱말이 필요하면 `status-map.ts`(SP-2 보강 줄)에 같이 |
| 증빙 규칙 | UI-SPEC:58 · UI-SPEC:64 | 반려 · 회수 문서는 기안자가 증빙을 붙이고 뗀다 | 종결 문서의 증빙(떼기)은 정의되지 않았다 |
| 증빙 확인부 | UI-SPEC:631 | 결재 통과 뒤에만 렌더(결재 중 · 반려 · 회수에는 섹션 없음, P0) | 종결 문서 화면의 모양은 P0와 같게 둘 수 있다 |

### 3.3 06에 넣으려면 정해야 하는 것

1. **디자인 결정(사용자 또는 UI-SPEC rev 11)** — ① 종결 동작의 자리와 이름(문서 화면 `DetailScreen.actions` 3차 · 확인 모달 `ConfirmDialog`로 되돌릴 수 없는 일 확인인지, 되돌리기 결과 줄인지 — SYSTEM:1008의 「같은 값으로 다시 넣을 수 있는 행」 기준) ② 문서 · 목록의 낱말(새 낱말이면 `status-map.ts` + SP-2 보강 줄, 기존 `취소`(muted) 재사용이 시스템에 맞다) ③ 권한(기안자 또는 경영관리 — 05 권한 키와 맞춤) ④ 되돌림 가능 여부 ⑤ 종결 문서의 증빙 · 번호(재사용 없음).
2. **플랜** — 새 플랜 하나(가칭): 종결 서버 함수(행 잠금 · 행동 로그 같은 트랜잭션 · 번호 재사용 금지) · `expenseLineDoor` · `remainingForInstallments` · S18 미결 판정(06-19 `OPEN_EXPENSE_STATUS_ORDER`) · 견적 줄 상태 파생(06-13) · 줄 문(06-13의 이중 연결 입구)이 종결 문서를 제외하게 하는 변경 + 화면 한 곳. 05 소유 파일(`domain/expenses/`)을 고치므로 05 머지 뒤 웨이브.
3. **위험 경로** — 종결 상태가 `db/schema/expenses.ts`의 상태 칸을 늘리면 마이그레이션 + 스키마 = 사용자 머지 PR(J2와 같은 별도 PR 규칙, CL:105), `domain/money`를 건드리면 `/cso`.
4. **로드맵 정합** — 06-CONTEXT 11줄이 05 머지로 돌아오면 ROADMAP Phase 6 성공 기준 · REQUIREMENTS에 이 항목이 없다는 점을 같이 정리(`.planning/`은 GSD 도구로).

권고: UI-SPEC rev 11(또는 `/gsd-quick`의 한 장짜리 UI-SPEC 보충)로 ① 과 ② 만 먼저 확정하고 3 · 4를 플랜에 옮긴다. 다음 두 가지는 **지금 안 정하면 다른 플랜이 틀린 채로 굳는다**: S18 미결 판정에서 종결 문서를 빼는 문장(06-19 · 06-22)과 줄 상태 파생에서 `반려`를 빼는 문장(06-13).


## 4. 열린 · 미결 항목 — 검토 파일 셋 · `b9a572d1`

**읽는 법.** 검토 파일이 「닫았다」고 적은 것과 재계획이 **받는** 것을 가른다. 표기: `X-1~X-9`(하이픈 있음)는 `design-apply-cross-r2`의 id로 §2.2의 `X1~X14`(하이픈 없음)와 다르다. `design-review C1`(= Codex 후보 C1, 합계 글자 위계)은 §2.5의 충돌 C1(부제)과 다르다. `F#` · `R#` · `N#` · `M#`은 `design-review-rev10` 표의 지적 id다.

### 4.0 한눈에

1. **막는 지적은 셋 모두 0이다** — design-review-rev10 「하드 리젝션 0」(design-review-rev10:52), Codex 2 · 3차 「막는 문제 없음」(design-review-rev10:14 · design-review-rev10:15), cross-r2의 막음 1건(X-1)은 r3 플랜 ledger에서 닫혔다(§4.3). UI-SPEC은 「NO UNRESOLVED DECISIONS」를 두 번 적는다(UI-SPEC:1480 · UI-SPEC:1508) — **UI-SPEC 문서 안의 결정**이 0이라는 뜻이다. 재계획이 받을 일은 문서 밖에 남아 있다.
2. design-review-rev10의 id 33개는 서로 다른 지적 30개(F4=R5 · F11=R8 · F13=R9는 같은 지적)이고 **반영 26 · 버림 3(F14 · F17 · R4) · 수정 없음 1(R7)**이다 — UI-SPEC의 「26건 반영 · 3건 버림」(UI-SPEC:1491)과 맞는다(합산은 이 문서의 계산).
3. **사용자가 직접 확정한 것**: Q2~Q7(10/5 00:55, UI-SPEC:38) · O-6 · O-21 · O-22(9/25 11:13, design-review(rev 9):103-105) · 밤 위임 5건(10/5 01:53, `b9a572d1`). rev 10 `/plan-design-review`의 나머지 결정은 **밤 위임 추천안**이다 — 사용자 카드 없이 추천안으로 정했다(design-review-rev10:6).
4. 재계획이 받는 일의 핵심: SYSTEM · DECISIONS · 테스트로 **올려야 하는 것**(SP-8 · SP-7 계약 · SP-9 짝 격자 · F16 대비 단언 · SYSTEM §6-1 :409 — §4.1) · **플랜에 한 줄도 없는 r2 반영분**(§0 12번) · **사용자 확정이 없는 추천안**(§4.4 ②).
5. cross-r2 아홉 건은 **전부 플랜 ledger에 반영돼 있다**(X-9만 UI-SPEC 쪽 — rev 10이 해소). 그러나 반영 문장 상당수가 rev 10 · 05 규칙 아래에서 다시 낡았다(§4.3).
6. 이 검토들이 **보지 못한 곳**: 반려 · 회수 종결(§3) · 05 실물 이름(`replan-A-05-names.md`) · 플랜의 옛 절 제목 · 기준선 표기(§2.4 공통 B) · `reconcile.md`의 Codex 계획 검토 지시(§4.4 ⑥).

### 4.1 `design-review-rev10.md` — 지적 33개의 수준과 재계획이 받는 일

수준: **확정** = 사용자 확정(10/5 01:53, `b9a572d1`) · **추천안** = 밤 위임 추천안, 사용자 미확정 · **맞춤** = 이미 확정된 결정에 문장만 맞춤 · **버림** · **참고**. 개수는 확정 5 · 추천안 15 · 맞춤 9 · 버림 3 · 참고 1 = 33이다.

| id | 지적 → 정한 것 | 수준 | 재계획이 받는 일 |
|---|---|---|---|
| F3 design-review-rev10:22 | 견적 줄 상태 `구매 요청`과 행동 `구매 요청`이 같은 말 → 상태만 `구매 요청 중`(색은 accent 그대로) | **확정** | 06-01 `status-map.ts` · 06-13 우선순위 · 06-14 · 06-23(낱말 §5.7) |
| F8 · O-23 design-review-rev10:27 | Q4 짝 설정의 입력 모양 → **짝 격자**(§7-2 새 입력 타입 — 행 = 지급 방식 · 열 = 증빙 종류 · 칸 = 체크박스, 빈 값 = 짝 검사 없음 — UI-SPEC:1411) | **확정** | SP-9로 기록(06-01 — §2.5 C14) · 컴포넌트(J1) · 06-02 키 · 06-03 서버 규칙 · S20 화면(C7) |
| F9 design-review-rev10:28 | 미래 지급일(Q6) 건이 S3 그룹에 없음 → 맨 앞 `예정 지급` 그룹 | **확정** | 06-20 Task 3(그룹 판정은 06-15와 한 함수) |
| F10 design-review-rev10:29 | S21 · S22 파일 삭제가 즉시이고 되돌리기가 없음 → 결과 줄 + `되돌리기`(§7-8) | **확정** | 06-16 되살리기 서버 경로(Phase 5 파일 행 쪽 ⓪) · 06-25 T-06-201 재판정(C9) |
| C1 design-review-rev10:43 | 합계 14 굵게가 SYSTEM §6-1 :409(금액 `--text-subtitle` 700)와 다름 → 사용자 결정 ⑥이 이김 | **확정** | 06-01이 SYSTEM 문장을 정리(§4.2) |
| F1 design-review-rev10:20 · N1 design-review-rev10:44 · N2 design-review-rev10:45 | S10 고르기 목록의 컴포넌트가 없음 → `ui/confirm-dialog` **검색 고르기 갈래**(SP-8): 검색 · 행 막힘 · 현재 줄 · 1차 `이 줄로 Enter`(N1이 「1차 없음」안을 되돌림) · LOADING/EMPTY/ERROR(N2) | 추천안 | 06-01 SP-8 기록 · **갈래 구현은 주인 없음**(J1) · 06-07 · 06-14가 소비 |
| F2 design-review-rev10:21 | 금액 없이 붙은 증빙(05 결재 중 붙이기)의 `확인 전` → 제자리 모달 대신 문서 화면, S4 금액 칸이 열린 채 · 1차 막힘 `증빙 금액 없음`(승인액 자동 채움 안 함) | 추천안 | 06-06 S4 · 06-17 제자리 확인 분기 |
| R1 design-review-rev10:37 · N3 design-review-rev10:46 | 제자리 확인 성공 뒤 자동 선택은 선택 칸이 `고를 수 있음`일 때만 · 짝 막힘 갈래(선택 없음 · 이유 · 행 링크 포커스) | 추천안 | 06-17 + E2E |
| R3 design-review-rev10:39 | SP-7이 LOADING · 새로 고침 뒤 열린 채 유지를 공용 계약에 안 넣음 | 추천안 | 06-01 §7-17 문장 · 06-17 슬롯 |
| F5 design-review-rev10:24 · F6 design-review-rev10:25 | 행동 뒤 포커스 — S5는 새 1차, 없으면 결과 글자(`tabindex=-1` · `role=status`) / S13은 다음 `신청됨` 행의 `구매 완료`, 없으면 제목 | 추천안 | 06-04 · 06-12 |
| F7 design-review-rev10:26 | S1 고른 이체액 합이 흐린 보조 글자 → 숫자 `--text-body` + `--fw-bold`(C1과 같은 값) | 추천안 | 06-15 · 06-17 |
| F12 design-review-rev10:31 | 외화 2행 형식 두 가지 → 한 형식 | 추천안 | 06-05 · 06-12 |
| F15 design-review-rev10:34 | S11 아이콘 링크 누르는 영역 미정 → 44×44(`--touch-min`) | 추천안 | 06-08 |
| F16 design-review-rev10:35 | 이 문서가 잰 대비 쌍이 `tokens.test`에 없음 → 06-01이 단언 추가 | 추천안 | 06-01(`files_modified`에 테스트 없음 — UI-SPEC:1092) |
| R2 design-review-rev10:38 | S13 실행가 초과 문구가 없는 `견적 줄 바꾸기`를 가리킴 → S13 갈래 `… · 견적 줄은 담당 PM 박서연` | 추천안 | 06-12(Q3) |
| R6 design-review-rev10:41 | S13 활성 카드 0장 상태 없음 → 카드 칸 `—` + 1차 막힘 `활성 법인카드 없음 · 카드 등록은 관리자` | 추천안 | 06-12 |
| F4=R5 · F11=R8 · F13=R9 · M1 · N4 · N5 design-review-rev10:49 | 토스트 문장(:364) 지움 · 와이어프레임 `증빙 기한 —` 지움 · O-6 · O-21 · O-22 확정 표기 · `status-map` 줄 인용 4곳 · O-23 표기 · prop 「네 가지」 | 맞춤 | 플랜에 옮길 일 없음. 다만 같은 낡은 토스트 문장이 플랜에 57줄 있다(§5.4) |
| F14 design-review-rev10:33 | 「반려 뒤 경영관리가 붙인 파일도 뗄 수 있음」이 미확정이라는 지적 | **버림** — 05 지시서의 사용자 답으로 확정(evidence-in-approval-rule:85; 이 `Q2`는 05 지시서의 Q2이지 reconcile §8의 Q2와 다르다) | 다시 열지 않는다 |
| F17 design-review-rev10:36 | 폰 행동 자리 S8(행 시트) ↔ S11(행 안) 다름 | **버림** — S11에 이유가 있다(폰에서도 처리해야 해 패널 · 모달이 선다) | 두 화면을 같게 맞추지 않는다 |
| R4 design-review-rev10:40 | 발행 요청 취소 확인 창이 불필요 | **버림** — SYSTEM §7-3 :905 편집 표 줄 삭제 = 확인 모달(SYSTEM:905), 바꾸면 화면 하나만 예외 | 06-18 · 06-21의 확인 모달 유지 |
| R7 design-review-rev10:42 | 768 열 수 — Codex 스스로 「수정 필요 없음」 | 참고 | 없음 |

**읽는 법의 함정 둘.** ① 「추천안」 15개 중 F1 · N1 · N2(새 컴포넌트 갈래) · F2(흐름) · R3(공용 계약)는 구조를 바꾸는 쪽이라 가장 무겁다 — 재계획은 그대로 옮기되 `/plan-eng-review`에서 사용자 확인 후보로 올릴 수 있다. ② 이 표의 「재계획이 받는 일」 열은 §2.3 · §2.4의 빌더 표를 따른다 — UI-SPEC 자신은 플랜 번호를 거의 적지 않는다(적은 곳: 06-01 · 06-02/03 · 06-05).

### 4.2 `codex-design-review-rev10.md` — 한 건의 후보와 보이지 않는 2 · 3차

- **1차**(자동 `scripts/codex-design-review.sh`, CI=true 빌드 4폭 캡처 + DOM 실측): 후보 **한 건** — C1 `/expenses` 1280 「합계 글자를 일괄 `--text-body` 14 + `--fw-bold`로 바꾸면 읽기 목록 합계 줄 금액이 본문과 같은 14px가 되어 위계가 무너질 수 있다」(codex-design-review-rev10:15). 보고서 스스로 한계를 적는다 — 캡처가 EMPTY 상태라 실제 합계 렌더 위반은 확인되지 않았고 「실측 확인」 칸은 비어 있다(codex-design-review-rev10:15). Codex 지적은 후보이고 결함 판정은 DOM 실측으로만 한다(codex-design-review-rev10:3) — **DOM으로 확정되지 않은 후보가 사용자 결정 ⑥으로 풀렸다.** 같은 1차는 화면 넘침 0 · 폰 버튼 44를 확인했지만(design-review-rev10:13) 대상이 기존 화면(`/expenses` `/cards` `/approvals`)이라 rev 10의 새 화면 계약과는 무관하다. 계획 글은 프롬프트 한도(약 100KB)로 앞부분만 들어갔다(design-review-rev10:13).
- **2차 · 3차**(`codex exec -s read-only`): 2차가 UI-SPEC 1~1469줄을 다 읽고 「막는 문제 없음 · 고침 6 · 참고 3」(R1~R9), 3차가 지난 지적 + 바뀐 부분을 확인해 「막는 문제 없음 · 고침 3 · 참고 2」(N1~N5)다(design-review-rev10:14 · design-review-rev10:15). **2 · 3차의 산출물 경로는 어디에도 적혀 있지 않다** — 근거는 `design-review-rev10.md` 표의 한 줄 요약뿐이고, 1차 캡처 폴더 `test-results/codex-design-review/20261004-163034-3775/`도 커밋되지 않았으며 이 작업 트리에 없다. 최종 UI-SPEC 1508줄 전문을 Codex가 다시 읽은 적은 없다(2차 1469줄 · 3차 변경분 · `b9a572d1`은 3줄).
- **design-review C1의 처리와 남은 일**: UI-SPEC은 합계 금액을 읽기 목록 합계 줄(§6-1)과 편집 표 합계 행(§7-3) **둘 다** `--text-body` 14 + `--fw-bold` 700으로 못 박고 SYSTEM §6-1 :409의 「금액 `--text-subtitle` 700」은 ⑥ 이전 문장이라 ⑥이 이긴다고 적었다(UI-SPEC:219). ⑥ = 사용자 결정 「합계 글자 18에서 14로, 굵게」(2026-10-03, CHECKLIST:35)이고 main 구현도 이미 ⑥이다(`.totalsPair dd` — projects.module.css:248-252). 반면 SYSTEM :409는 아직 `--text-subtitle` 700이고(SYSTEM:409) Codex는 「두 합계를 구분하라」고 했다(codex-design-review-rev10:15) — 두 문서가 갈리므로 **06-01이 DECISIONS 항목(인용 `04.6-ANSWERS.md` 「2026-10-03 답」 ⑥) → SYSTEM §6-1 한 줄 정리 순서로 닫아야 한다**(지금 DECISIONS에 합계 글자 ⑥ 항목은 `grep` 0건). 그 줄을 단언하는 테스트는 없다(합계 면 테두리 · 여백만 list-screen.test.ts:73-77). 플랜 쪽: 어느 플랜도 합계 글자 크기를 적지 않는다(`18px` · `--fs-lg` · `--text-subtitle` grep 0건 — S1 합계 줄은 06-15 · 06-17).

### 4.3 `design-apply-cross-r2.md` — 아홉 건은 r3에서 닫혔고 일부가 다시 낡았다

대상은 **옛 브랜치 `claude/plan-phase-06-b3dsju` HEAD 050d71a**의 플랜이고(design-apply-cross-r2:3) 판정은 「막음 1 · 고침 5 · 참고 3」이다(design-apply-cross-r2:46). 아홉 건 모두 플랜 25개의 Review Dispositions ledger에 r3 줄이 있다(아래 plan:줄). 이 파일 자체에 열린 항목은 없다 — **다시 볼 것**은 rev 10 · 05 규칙이 그 반영 문장의 전제를 바꾼 곳이다. 파일이 「사용자 확정이라 다시 따지지 않았다」고 적은 목록(DR-4 · DR-3 · DR-2 · 한 페이즈 유지 · O-2 막기 · D-601~613 · M-8 기각 · 06-17/06-20 분할 안 함)은 design-apply-cross-r2:6 그대로다.

| id | 원 지적 | 플랜에 반영된 자리 | 재계획에서 다시 볼 것 |
|---|---|---|---|
| X-1 막음 design-apply-cross-r2:12 | B-1 훅이 PM 증빙 변경마다 version을 올려 Phase 5 즉시 저장 경로에서 PM 자신의 저장 · 결재자 승인이 동시성으로 거절될 수 있다 | 06-11:402 · 파생 06-04:366 · 06-06:368 · 06-15:392 · 06-17:464 | 반영의 전제 「결재 통과 문서에서도 PM이 증빙을 더하고 **뗄 수 있다**(UA-606)」(06-11:408)가 05 규칙으로 틀렸다 — 결재 중에는 아무도 못 떼고 승인 뒤는 기안자 추가 · 시스템 관리자 무효뿐이다(§2.5 C2). 훅이 최종 `{ version }`을 돌려주고 승인 뒤 문서에서만 version을 올린다는 해법은 유지하되 행위자 · 호출 지점을 05 함수 두 곳(기안자 추가 · 무효)과 결재 중 권한자 추가로 다시 잡는다 |
| X-2 design-apply-cross-r2:13 | 카드 전표 경로가 06-11 훅(지출결의 행 잠금 · version)을 타면 안 된다는 조건이 없다 | 06-16:410 · 06-25:418 | 조건(훅은 주인이 `expense`일 때만)은 유지하고 훅 이름이 바뀌면 문장 · 테스트 이름도 같이. 카드 사용 첨부는 05 결재 규칙과 무관하다(UI-SPEC:669) |
| X-3 design-apply-cross-r2:14 | A-608-P 재확인이 결합 함수가 주인 종류를 받는지 보지 않는다 | 06-25:419(⒞) | 05 실물 코드가 정한다 — 05 머지 전에는 ⓪ 멈춤 조건으로 남긴다(`replan-A-05-names.md`의 이름 대조와 같이) |
| X-4 design-apply-cross-r2:15 | 06-11 `files_modified`에 리포지토리가 없다 · 방아쇠가 15번째/16번째로 어긋남 · `duplicateScopeKinds` 순환 | 06-11:403 · 06-16:411 · 06-25:420 | C2로 06-11이 바뀌면 `files_modified`를 다시 센다. 파일 수 문턱 한 규칙(15개 보고 · 16번째에서 멈춤)을 새 플랜(J1 · J2)에도 같게 쓴다 |
| X-5 design-apply-cross-r2:16 | 06-24가 `verification: backstop` 「41건」을 감사하는데 실제는 48건 | 06-24:253(본문 06-24:28 · :182 · :197 · :226도 48건) | 재계획이 truth 줄을 바꾸므로 48을 또 박으면 다시 틀린다 → 두 번째 안(「`grep -c 'verification: backstop'` 합」)으로(§2.4 06-24). UIC의 backstop 52행(§6)과 플랜 truth 수는 단위가 다르다 |
| X-6 design-apply-cross-r2:17 | read_first의 UI-SPEC 줄 번호 11곳이 rev 9에서 밀림 | 06-02:341 · 06-03:377 · 06-04:367 · 06-05:411 · 06-08:360(절 이름으로 바꿈) | UI-SPEC 줄 번호 인용은 지금 0건이지만 **rev 10이 절 제목을 바꿔** 옛 제목을 그대로 인용한 7줄이 안 나온다 · SYSTEM · ROADMAP 줄 번호 3줄이 어긋났다 — §2.4 공통 B2 · B3 |
| X-7 design-apply-cross-r2:18 | 06-25 `<assumption_delta_decision>`의 「지출결의 동작은 안 바꾼다」가 중복 판정 확장과 모순 | 06-25:421 | 유지(06-25 카드 목록 DTO 불리언 이름 `hasEvidence`의 충돌 C4는 새 건) |
| X-8 design-apply-cross-r2:19 | ROADMAP에 06-25 줄 · 계획 수 25, REQUIREMENTS EVID-01 분리 | 앞 절반 반영 — ROADMAP:728 · ROADMAP:781. 뒤 절반은 06-01 Task 3 체크포인트(06-01:318 · 06-25:422) | **아직 안 됨**: REQUIREMENTS:226이 `Phase 5` 한 칸이다. 06-01을 다시 쓸 때 Task 3(REQ-ROUTE)을 보존한다. ROADMAP의 06-01 줄 「SP-1~6」(ROADMAP:733) · 새 플랜 줄 · 계획 수는 GSD 도구로 — `.planning/` 수동 편집 금지(CL:16) |
| X-9 design-apply-cross-r2:20 | UI-SPEC의 옛 「DR-10 · 11」과 이번 검토의 DR-10 · DR-11 번호 충돌, 출처 없는 「(+ DR-5)」 | 플랜 ledger 줄 없음 — rev 10이 옛 줄을 다시 써서 해소(`DR-10`은 스토리보드 하나 UI-SPEC:444, 옛 DR-5는 출처를 밝혔다 UI-SPEC:1454) | 없음 |

cross-r2의 「design-review 추적」(rev 9의 24개 항목이 전부 플랜에 있다, 추적 못 한 항목 0 — design-apply-cross-r2:42)에서 rev 10이 바꾼 것은 H-4(카드 사용 삭제 · 본인 취소의 토스트 `되돌리기` → 표 위 결과 줄 + 3차 `되돌리기`, §2.3 S8 · S11)와 DR-6/H-3의 SP-1(버튼 갈래)이다. `.continue-here.md`의 「참고(막지 않음)」 중 「삭제한 카드 사용은 토스트 뒤 되돌릴 수 없음」(.continue-here:50)은 이제 되돌리기 결과 줄로 바뀌어 소멸했다.

### 4.4 `b9a572d1`이 정한 것 · 정하지 않은 것 · 재계획이 받는 일

**`b9a572d1`**(2026-10-04 16:55 UTC = 10/5 01:55 KST)은 UI-SPEC 6줄과 `design-review-rev10.md` 1줄만 바꿨다. 커밋 메시지: 「사용자가 문구 · 배치 5건을 추천대로 확정했다(10/5 01:53). O-23과 반영 기록을 확정으로 고침」. 확정된 다섯은 전부 **문구 · 배치**이고 구조는 바꾸지 않았다.

| # | 확정 | 고친 자리 |
|---|---|---|
| 1 | F3 견적 줄 상태 `구매 요청 중` | 머리 변경 목록 10번 UI-SPEC:34 |
| 2 | F9 S3 맨 앞 `예정 지급` 그룹 | 같은 줄 |
| 3 | F10 S21 · S22 증빙 삭제 `되돌리기` | 같은 줄 |
| 4 | F8/O-23 짝 격자 | O-23 행 UI-SPEC:1411 |
| 5 | design-review C1 합계 14 굵게 | 검토 보고 「7 결정」 UI-SPEC:1502 · design-review-rev10:6 |

**정하지 않은 것 · 재계획이 시작 전에 받는 일**(사용자 결정이 필요한 것은 한 번에 묶어 묻는다 — 사용자 결정 최소, CL §7):

1. **① 재계획 시점(reconcile Q1)** — UI-SPEC은 Q2~Q7만 확정이라 적었고(UI-SPEC:38) design-review 머리는 「Q1~Q7」이라 적었다(design-review-rev10:5). Q1은 「플랜 재계획은 05-11(정산 결재)이 끝난 뒤」가 추천이었다(reconcile:129). 05-08 · 05-09 · 05-11 · 05-13의 실제 이름이 정해져야 05 연동 항목을 확정할 수 있다(reconcile:119). 사용자 답이 기록돼 있지 않다.
2. **② 열린 선택 16행 확인** — O-1 · O-3 · O-4 · O-5 · O-7 · O-8 · O-10 · O-11 · O-12 · O-13 · O-14 · O-15 · O-16 · O-17 · O-19 · O-20은 「추천안으로 이 문서를 썼다」 상태이고 UI-SPEC은 `/gsd-plan-phase 6` 전(또는 `/plan-design-review` 때) 한 줄씩 확인한다고 적었다(UI-SPEC:1384). 확정 기록이 있는 것은 O-6 · O-9 · O-21 · O-22 · O-23뿐이고, O-2는 CEO 라운드의 「잠김」(UI-SPEC:1447 · design-review(rev 9):7), O-18은 rev 2에서 「닫힘」이다. rev 10 `/plan-design-review`는 이 16행을 묻지 않았다(고정 결정 목록에 없다 — design-review-rev10:5). 플랜 25개가 이 16행의 O-n을 204번 가리킨다(전 O-n 309번 중, ledger 포함 실측) — 현 값을 유지한다는 확인을 한 번 받아 두면 연쇄가 작다. 05 결정으로 정해진 O-14의 뒷부분(결재 중 보완 = `evidence_attach` 권한자만)은 UI-SPEC:1402.
3. **③ 반려 · 회수 종결**(§3) — 06 편입 여부 · 낱말 · 권한 · 되돌림. `reconcile.md`도 「구현하는 플랜이 없다」고 적었다(reconcile:74).
4. **④ 충돌 판단 C1(부제) · C8(S19 선결제 기한 초과 받는 사람) · C13(오류 문구 명사형)**(§2.5) — UI-SPEC rev 11의 한 줄 정정 또는 사용자 결정.
5. **⑤ SP `결정자`**(J3) — SP-1~SP-8은 사용자 답으로 확정된 것이 없고 Opus 설계 검토의 제안이다. 06-01의 DECISIONS 항목에 적을 `결정자`와 사용자 확인 체크포인트.
6. **⑥ Codex 계획 검토 지시 충돌** — `reconcile.md`는 「Codex 계획 검토 · 승인 직전 최종본 Codex 1회」를 필요한 게이트로 적었다(reconcile:123). 그러나 CLAUDE.md는 Codex를 디자인 검토에서만 쓰게 하고(CL:83 · CL:126) 훅 R3가 그 밖의 호출을 막는다(CL:126) → 이 지시는 따르지 않는다. 계획 게이트는 `/plan-eng-review` 1회(CL:81 — UI-SPEC도 「재계획 뒤 `/plan-eng-review` — eng review required」 UI-SPEC:1506)이고 `/plan-design-review`는 rev 10 r2에서 1회 썼으며 재검토는 최대 1회가 남았다 — UI-SPEC을 rev 11로 고치면 그 한 번(Codex 디자인 검토 포함)을 쓴다.
7. **⑦ `--reviews` 입력** — `/gsd-plan-phase 6 --reviews`는 REVIEWS.md를 요구하는데(.continue-here:27) 이 폴더에 없다 → 위 세 검토 파일(+ 이 문서)을 reviews 입력으로 플래너에 넘긴다(r3 ~ r5 선례). `.planning/`은 GSD 스킬 절차 안에서만 고친다(.continue-here:13).
8. **⑧ `gsd-ui-checker`** — APPROVED(BLOCK 0)는 rev 10 본체(`072b3bc4`) 기준이다(UI-SPEC:1435). r2(`b1118415`, UI-SPEC +72/−33줄 — SP-8 · F2 · F5~F10 · R1~R6 · N1~N3)는 머리 `reviewed_at` 한 줄만 고쳤고 r2 뒤 체커 재확인 기록은 없다. 재계획 앞에서 돌릴지, rev 11에 합칠지 판단한다.
9. **⑨ 다시 열지 않는 것** — 한 페이즈 유지 · O-2 막기 · D-601~D-613 · M-8 기각 · 06-03 · 06-07 · 06-17 · 06-20 분할 안 함(.continue-here:54) · DR-2 · DR-3 · DR-4(design-review(rev 9):103-105) · Q2~Q7 · 05 「결재 중 증빙」 · 밤 위임 5건. 이번 UI-SPEC과 부딪히는 곳(06-03 · 06-07의 파일 17개, J1 컴포넌트 일)은 「분할」이 아니라 **새 플랜 추가**로 푼다.
10. **⑩ UI-SPEC 밖에서 넘어온 일**(`reconcile.md` §3) — 반려 · 회수 종결(③) · MAST-05 · OPS-09 요구사항 매핑(플랜 `requirements`에 0건이고 ROADMAP에는 있다 — reconcile:75 · ROADMAP:719) · 6.1 대비 `hasEvidence` 한 함수(06-06에 둔다, reconcile:76).


## 5. 옛 토큰 · 낱말 이름 표 — 플랜 25개에 남은 옛 이름 → 플랜 줄 → 바꿀 이름

`06-NN:줄`은 `.planning/phases/06-payment-evidence-cards/06-NN-PLAN.md`의 물리 줄이다. 아래 표의 줄은 전부 `7eb6c2ad`로 들어온 상태(그 뒤 한 줄도 안 바뀜) 기준의 grep 실측이고, 한 표에 든 줄마다 그 이름이 실제로 있는지 조립 뒤 다시 대조했다(§7). 재계획이 플랜을 다시 쓰면 줄이 밀리니, **표의 줄로 먼저 한꺼번에 고치고** 새 줄 번호는 그 뒤에 적는다. 재계획 뒤 같은 grep이 0이어야 한다(금지 검사 줄이 옛 이름을 인용하는 것만 예외 — 재현 명령은 §7.3).

구성: 5.1 CSS 토큰 · 굵기 · `.num`(35줄) / 5.2 `status-display`(34줄) / 5.3 `/cards?new=1`(19줄) / 5.4 토스트(57줄) / 5.5 모달 어휘(189줄) / 5.6 `PageHeader` · 부제 / 5.7 낱말 · 문구(`신청` · `요청` · `없음` · `구매 요청` · `담당 PM` · `pmName`).

### 5.1 옛 이름 → 바꿀 이름 (요약)

출처: 25개 플랜 전체를 `(?<![\w-])이름(?![\w-])`로 훑은 실측(조립 때 재생성). 정의된 이름 대조: `docs/design/tokens.css`(정의 172개)에 없는 이름 중 CSS 토큰은 아래 아홉 가지뿐이고(나머지 `--project` `--custom` `--name` `--stat` `--edit` `--format` `--help` `--exit-code` `--diff-filter` `--name-only` `--porcelain` `--reviews`는 CLI 플래그), 플랜이 쓰는 정의된 토큰은 `--accent`(2) · `--accent-weak`(3) · `--native-accent`(2) · `--cell-pad-x`(1) 넷뿐이다. 옛 이름은 `tokens.css`에 정의 0개이고 `test/unit/design/tokens.test.ts`가 부재를 단언한다(SYSTEM:115) — 플랜 문장대로 구현하면 테스트가 깨진다.

| 옛 이름 | 히트 | 줄 | 바꿀 이름 |
|---|---:|---|---|
| `--faint` | 11 | 06-04:45,165 · 06-05:52 · 06-06:44,244 · 06-12:45 · 06-14:49,53,179,227 · 06-17:39 | `--text-faint` (SYSTEM:99 글자 역할 토큰) |
| `--muted` | 13 | 06-10:44 · 06-12:39,41,48,207,238 · 06-16:51,246 · 06-18:35,45 · 06-19:37,241,275 | 글자색이면 `--text-muted` (SYSTEM:99), 상태 「muted」 의미면 `--status-muted` (SYSTEM:101) — 낱말 색은 `status-map.ts`가 정한다 |
| `--danger` | 6 | 06-19:43,241 · 06-22:40 · 06-23:37 | `--status-danger` (SYSTEM:101) — 상태 낱말이면 색을 직접 적지 말고 `status-map.ts`(SYSTEM:937) |
| `--warning` | 5 | 06-13:35 · 06-17:33 · 06-19:36,241 · 06-21:40 | `--status-warning` (SYSTEM:101) |
| `--success` | 1 | 06-22:36 | `--status-success` (SYSTEM:101) |
| `--fs-xs / --fs-sm` | 3 | 06-13:35,47 · 06-16:194 | `--text-tag`(옛 xs) · `--text-aux`(옛 sm) — 화면 CSS는 `--text-body` `--text-aux` `--text-tag`만 (SYSTEM:163) |
| `--line-strong` | 1 | 06-16:194 | 섹션 시작 = 위 1px `--border-row` (SYSTEM:256 · :445). 2px 섹션 선 없음 (SYSTEM:262) |
| `--modal-w` | 1 | 06-17:68 | `--dialog-w` (SYSTEM:105) |
| `--bg` | 0 | — | 플랜에는 없다(UI-SPEC 금지 목록 UI-SPEC:19-20에만 있음). 새로 쓰지 않는다 |
| `--fg` | 0 | — | 플랜에는 없다(UI-SPEC 금지 목록 UI-SPEC:19-20에만 있음). 새로 쓰지 않는다 |
| `--row-min` | 0 | — | 플랜에는 없다(UI-SPEC 금지 목록 UI-SPEC:19-20에만 있음). 새로 쓰지 않는다 |
| `18px` | 0 | — | 플랜에는 없다(UI-SPEC 금지 목록 UI-SPEC:19-20에만 있음). 새로 쓰지 않는다 |

**`2px` 6건 판정** — SYSTEM:262: 2px로 남는 것은 포커스 링 · 현재 탭 인셋 · 오류 셀 인셋 · 3차 버튼 호버 밑줄뿐이고, 진행 바(§7-10 · §7-1 LOADING)와 S10 현재 줄 왼쪽 막대(§6-3 :482 원문)는 시스템 요소다.

| 줄 | 판정 | 내용 |
|---|---|---|
| 06-07:47 | 유효(§6-3 :482 현재 줄 표시) — 단 `700` → `--fw-bold` | …줄 행 = 번호 · 항목(거래처) · 실행가, 현재 줄 700 + 왼쪽 2px `--accent`, 같은 쪽 기존 연결 2행 `카드 사용 1건 1,200,000`" |
| 06-11:47 | 유효(시스템 진행 바) | - "S7 loading: 업로드 행 아래 2px 진행 바(§7-10)가 서고, 폰 사진은 최대 변 2000px JPEG로 줄인 뒤 올린다 — PDF는 원본… |
| 06-16:46 | 유효(시스템 진행 바) | …규칙(이 페이즈 새 진행 표시 없음). 업로드 = §7-10 행 아래 2px 진행 바, 삭제 = 누른 3차 `…`. 즉시 저장이라 상세의 `일괄 저장 Ctrl+S N`에 들지 않는다" |
| 06-16:52 | 유효(시스템 진행 바) | - "S22 loading: 업로드 = §7-10 행 아래 2px 진행 바, 삭제 = 누른 3차 `…`. 즉시 저장이라 표의 dirty `N`에 들지 않고 잔액 · 금액을… |
| 06-16:194 | **무효 — 2px 섹션 선 폐지** → 위 1px `--border-row` | …다. 제목 `상세 견적 {n}차 승인 증빙`(`--fs-sm` 600, 2px `--line-strong`으로 시작) + 부제 `승인 {승인일}`, 안에 Phase 5 첨부 컴포넌트(§… |
| 06-25:47 | 유효(시스템 진행 바) | - "S7 loading(카드 폼): 업로드 행 아래 2px 진행 바(§7-10). 폰 사진은 최대 변 2000px JPEG로 줄인 뒤 올리고 PDF는 원본이다 — 카… |

**글자 굵기 숫자** — `font-weight`는 `--fw-regular`(400) · `--fw-medium`(600) · `--fw-bold`(700) 토큰만 (SYSTEM:175). 플랜의 맨 숫자:

| 줄 | 내용 | 바꿀 것 |
|---|---|---|
| 06-07:47 | …당 {PM}` / 견적 줄 행 = 번호 · 항목(거래처) · 실행가, 현재 줄 700 + 왼쪽 2px `--accent`, 같은 쪽 기존 연결… | `--fw-bold` |
| 06-07:52 | …· 결제 합계 2행 공급가 · 등록)이고 경영관리 등록 건은 `경영관리 등록`(600) — 팀 비용 연결 건은 없다" | `--fw-medium` |
| 06-13:35 | …선결제 기한이 지난 줄은 상태 2행에 `증빙 {N}일 경과`(`--fs-xs` 400 `--warning`)가 서고, 면제된 문서의 줄에는 기… | `--fw-regular` |
| 06-13:47 | …상태 열 = Color 매핑표 견적 줄 값(`text` 변형 `--fs-xs` 600) + 2행 `증빙 {N}일 경과`, 온라인구매 줄의 행… | `--fw-medium` |

**`.num` 3건** → 숫자 표기는 `ui/num/Num` 하나(`<Num value unit? currency? fx? />`, SYSTEM:1231-1233): 06-03:210 · 06-04:165 · 06-05:184.

### 5.2 `status-display` 34줄(`.ts` 25 + 테스트 9) → `ui/status-tag/status-map.ts`

rev 10: 상태 낱말은 새 `status-display.ts` 없이 `ui/status-tag/status-map.ts`의 `STATUS_KIND` 한 표에 더한다(UI-SPEC SP-2 UI-SPEC:1091). 06-01이 만들려던 `app/(app)/status-display.ts` · `test/unit/status-display.test.ts`는 `ui/status-tag/status-map.ts` · `test/unit/ui/status-map.test.ts`(이미 main에 있다)로 대체한다. 호출부는 낱말만 넘기고 `kind` prop이 없으며(SYSTEM:937) 표에 없는 낱말은 타입 오류다 — 아래 줄에 있는 `kind` · `variant` 매핑 서술(06-01:25,43,142,158 · 06-11:246 · 06-18:97)도 같이 고친다.

줄: 06-01:10,25,42,43,51,69,105,106,137,138,142,158,173,271,285,332 · 06-03:143 · 06-20:161 · 06-22:10,40,84,175,179,188,267

테스트 파일 `test/unit/status-display.test.ts`(→ `test/unit/ui/status-map.test.ts`) 줄 9: 06-01:11,45,160,163,267,287 · 06-22:191,198,252 — 위 25줄(`status-display.ts`)과 합쳐 `status-display`를 담은 줄 34(그 밖에 Phase 4 파일 `projects/status-display.ts`를 가리키는 줄은 06-01:25 · 06-13 등에 6줄 겹쳐 있어 파일 이름만으로는 세 줄이 섞인다).

참고: `app/(app)/projects/status-display.ts`(Phase 4 프로젝트 상태, 05-15가 견적 줄 상태 파생으로 확장 — UI-SPEC UI-SPEC:132)는 06-01:25가 「고치지 않는다」로 둔 별개 파일이다. 06-13은 견적 줄 상태 파생을 새 `domain/quotes/line-status.ts`에 두는데 rev 10은 05-15 확장 + `status-map.ts` 색을 가리킨다(§2.5 C3).

### 5.3 `/cards?new=1` 19줄 — 페이지 폼 경로 → 옆 패널 토글

rev 10: S8 `/cards`는 `ListScreen`이고 S9는 그 위 옆 패널이다 — 토글 URL은 그대로(`?new=1` · `?editId=`), 자리만 목록 위 패널로(DECISIONS 2026-10-02 DECISIONS:1456 · UI-SPEC UI-SPEC:728). `closeHref` = 지금 필터의 `/cards`. 폼으로 「이동」·「돌아가」는 서술(저장 뒤 `/cards`로 이동)은 모두 「패널이 열린 채 칸이 기본값으로 돌아가고 결과 한 줄」(등록) · 「패널이 닫히고 그 행 값이 바뀜」(수정)로 바뀐다.

| 갈래 | 줄 | rev 10 |
|---|---|---|
| 새 건 `/cards?new=1` (S8 1차 → S9 패널) | 06-05:33 · 06-09:32 · 06-13:280 · 06-25:253 | URL 토글 유지 · 패널 · 저장 뒤 이동 서술 삭제(UI-SPEC UI-SPEC:731) |
| 줄에서 들어옴 `/cards?new=1&line={id}` (S14 막힘 3차 · S15 `&project=`) | 06-07:41,227,401 · 06-13:48,99,270,274,286,366 | 유지 — 뒤 목록 = `/cards`, 패널이 연다 (UI-SPEC UI-SPEC:728) |
| 구매 완료 `/cards?new=1&purchase={id}` (S13) | 06-12:155,168,305 · 06-14:323 · 06-25:35,252 | **경로 변경 → `/cards/purchases?purchase={id}`** (구매 요청 목록 위 옆 패널, `PanelForm intent="edit"`; UI-SPEC UI-SPEC:831-833) — 06-12 · 06-14 · 06-25의 라우트 · E2E · 라우트 표를 모두 |

### 5.4 토스트 57줄 — 이 페이즈에는 토스트가 없다

세는 법: 한글 「토스트」를 담은 줄 61(96히트) 가운데 이미 「토스트 없음」으로 rev 10과 맞는 8줄(06-15:249 · 06-16:48,54 · 06-17:55,302,311,325 · 06-20:253)을 빼고, 영문 `Toast` · `ui/toast` 줄 4(06-09:131 · 06-12:168 · 06-14:136,208)를 더하면 아래 57줄(활성 50 + 판정 기록 7)이다.

rev 10: 「이 페이즈는 `ui/toast`를 쓰지 않는다」(UI-SPEC UI-SPEC:177) — SYSTEM:951 「표 저장 결과는 토스트를 띄우지 않는다 · 화면 이동이 따르는 행동만 토스트」. 결과는 자리에 보인다. 아래 줄의 `Toast` · `actionLabel` · `onAction` · `tone="error"` · `ui/toast/Toast.tsx` 의존(06-09:131,227 · 06-14:136,208의 UA 줄 포함)이 모두 사라진다.

| 옛 토스트 | rev 10 자리 | 규칙 |
|---|---|---|
| S2 일괄 지급 `지급 완료 · N건` (06-15:55,252) | S1의 처음부터 DOM에 있는 `aria-live="polite"` 결과 글자 `14:02 지급 완료 5건 · 막힘 2건` | SYSTEM:951 · UI-SPEC UI-SPEC:577 |
| S5 `지급 완료 → 날짜 · 14:02` · `지급 취소` | 1차 자리 결과 글자(`tabindex="-1"` `role="status"`) + 새 1차로 포커스(F5) | UI-SPEC UI-SPEC:643 |
| S9 `카드 사용 등록 · 1,240,000` (06-09:46,101,237,238,243,260,309) | 패널 안 행동 줄 위 `role="status"` 한 줄 `카드 사용 등록됨 · 1,240,000`(다음 입력 시작되면 사라짐). 등록 `되돌리기` 없음 | SYSTEM:489 UQ-8 B · UI-SPEC UI-SPEC:731 |
| S9 `카드 사용 저장` · 수정 | 패널이 닫히고 그 행 값이 바뀜 + 포커스 그 행 `수정` | UI-SPEC UI-SPEC:732 |
| S9 수정 모드 2차 `카드 사용 삭제` + 토스트 `되돌리기` (06-09:45,89,94,223,243,260) | **S8 행 `삭제`**(`RowAction danger`, 맨 끝) → 확인 없이 보관 + 표 위 결과 줄 `카드 사용 삭제됨 · 48,000` + 3차 `되돌리기`(`role="status"`, 포커스 → `되돌리기`). 수정 패널에는 삭제 버튼 없음 | SYSTEM:1008 · UI-SPEC UI-SPEC:693 |
| S12 `구매 요청 · 26001-C0001` + 토스트 `되돌리기` (06-08:33,154 · 06-14:38,93,223,240) | 패널 `구매 요청됨 · 26001-C0001`(`role="status"`). 등록 `되돌리기` 철회 — 지우는 길은 S11 행 `요청 취소` | UI-SPEC UI-SPEC:828 |
| S13 `구매 완료 · {번호}` (06-12:34,155,168,187,305) | 패널이 닫히고 그 행이 `구매 완료` + 2행 `카드 사용 09-20 · 1,238,000`, 포커스 = 다음 `신청됨` 행의 `구매 완료`(없으면 화면 제목, `moveFocusToResult`) (F6) | UI-SPEC UI-SPEC:833 |
| S11 본인 `요청 취소` + 토스트 `되돌리기` (06-14:38,93,98,105,216,221,240,243,306,312,323) | 표 위 결과 줄 `구매 요청 취소됨 · 26001-C0001` + 3차 `되돌리기`(`신청됨`으로) | UI-SPEC UI-SPEC:807 |
| S21 · S22 파일 삭제 | 결과 줄 `증빙 삭제 · {파일명}` + 3차 `되돌리기`(F10) — 06-16에 되돌리기 줄이 없다 | UI-SPEC UI-SPEC:967 · UI-SPEC:988 |

활성 줄(고칠 줄) 50: 06-05:50 · 06-08:33,154 · 06-09:45,46,47,69,89,94,101,103,131,138,139,223,226,227,237,238,243,260,264,292,299,309 · 06-12:34,146,155,168,187,238,305 · 06-14:38,93,98,105,107,136,207,208,216,221,223,240,243,306,312,323 · 06-15:55,252

Review Dispositions Ledger의 기록 행(옛 결정의 서술 — 새 라운드 행으로 「대체」 표기하면 되고 본문 규칙이 아니다) 7: 06-09:369,376 · 06-12:367 · 06-14:384 · 06-25:169,361,409

06-25의 T-06-201(06-25:169,361,409)은 되돌리기 뒤 중복을 「토스트 수명 안의 동작」이라 수용한다 — rev 10에서 되돌리기는 결과 줄(마지막 지운 한 건만, 다른 행을 지우거나 되돌리면 사라짐: UI-SPEC UI-SPEC:1369)이라 수명 근거 문장을 바꿔야 하고, 06-09 `restoreCardUsage`(보관 해제)는 그대로 필요하다.

### 5.5 모달 어휘 189줄 — 표면별로 갈린다

플랜별 줄 수: 06-01 7 · 06-04 3 · 06-05 1 · 06-06 5 · 06-07 4 · 06-09 9 · 06-10 2 · 06-11 11 · 06-12 1 · 06-14 14 · 06-15 16 · 06-16 14 · 06-17 71 · 06-20 14 · 06-21 6 · 06-25 11.

| 표면 | rev 10 | 해당 줄 |
|---|---|---|
| S2 일괄 지급 확인 · S1/S3 제자리 증빙 확인 · 남의 구매 요청 취소 사유 · 지급 취소 · 증빙 면제 · 정산 결재 | **`ui/confirm-dialog` 그대로**(되돌릴 수 없는 일 확인 — SYSTEM:994 · :1211-1229). `app/**`에서 `<dialog>` 직접 금지 | 06-15 · 06-17 · 06-20 · 06-04 · 06-06 · 06-10 · 06-14 일부 — 유지 |
| S9 · S12 · S13 한 건 폼 | **옆 패널**(`SidePanel` + `PanelForm`) — 모달·페이지 폼 아님. 「입력 버리기」 확인은 `SidePanel`이 그린다(SidePanel.tsx:283 — 플랜이 따로 만들지 않는다) | 06-05:127 · 06-09:129 · 06-14:135의 UA-602 줄(「입력 버리기」 `ConfirmDialog` 의존) · 06-05/06-09/06-14/06-25의 「입력 버리기」 13줄 |
| S10 연결 고르기 | 패널 위 `ui/confirm-dialog` **검색 고르기 갈래**(SP-8, PC 가운데 `--dialog-w` 480 + `--scrim-dialog` · 폰 시트 위 시트) — 「PC 480 모달 · 폰 시트」 서술을 이 이름으로 | 06-07:55,57,79,185 · 06-09 `link-picker.tsx` · 06-14 `link-picker` purchase 모드 |
| 카드 사용 삭제 · 본인 구매 요청 취소 | **모달 없음**(즉시 + 결과 줄 `되돌리기`) — 플랜은 이미 모달 없음이라 합당, 토스트만 결과 줄로 | 06-09:45 · 06-14:38 |
| 마지막 증빙 삭제 확인(SP-6) | **철회** — 모달 일체 삭제 | 06-11:51,74,75,125,248,252,264,272-282,356,388 · 06-16:143,241 · 06-25:51,151,288,312,322 · 06-01:96,182,186,284,298 |

### 5.6 `PageHeader` · 부제

`test/unit/ui/screen-frames.test.ts`는 모든 `app/**/page.tsx`를 `ListScreen`/`DetailScreen`에 묶고 `PageHeader` import를 금지한다(래칫 0). `ListScreen`에는 부제 prop이 없다(ListScreen.tsx:9 · SYSTEM:403 · SYSTEM:1245). `DetailScreen.Section`도 제목 `--text-subtitle`뿐이다(SYSTEM:1247).

| 줄 | 내용 | rev 10 |
|---|---|---|
| 06-01:186 | …①②) · SP-4 §6-1 「하위 목록」 진입 규칙(필터 줄 오른쪽 3차 링크, PageHeader 부제 = 부모 메뉴) · SP-5 §8 규칙 7 용어 · SP-6 §7-10 「마지막 증빙 삭제」 확인(지출결의 문서만) ·… | `ListScreen` `title`(부제 없음) — 부모 메뉴는 셸의 현재 메뉴가 말한다(UI-SPEC UI-SPEC:1108) |
| 06-21:34 | …줄 오른쪽 3차 `발행 요청 {열린 건수}`(0이면 `발행 요청`)로 들어간다 — PageHeader 부제 = 부모 메뉴 이름(SP-4)" | `ListScreen` `title`(부제 없음) — 부모 메뉴는 셸의 현재 메뉴가 말한다(UI-SPEC UI-SPEC:1108) |
| 06-21:189 | …rojects/issue-requests/page.tsx`(§6-1 읽기 목록): PageHeader 제목 `발행 요청` · 부제 = 부모 메뉴 이름 `프로젝트`(SP-4) · 1차 없음 · 열 희망 발행일 · 프로젝트(번호… | `ListScreen` `title`(부제 없음) — 부모 메뉴는 셸의 현재 메뉴가 말한다(UI-SPEC UI-SPEC:1108) |
| 06-23:262 | - E2E가 behavior 네 줄을 단언하고, 오류 케이스에서 홈의 `PageHeader`가 서 있음을 확인한다 | `ListScreen` `title`(부제 없음) — 부모 메뉴는 셸의 현재 메뉴가 말한다(UI-SPEC UI-SPEC:1108) |

섹션 부제(`DetailScreen.Section`에 부제 prop 없음 — 충돌, §2.5 C1): 06-07:53,54(S15) · 06-16:48,194(S21) · 06-19:39,43 · 06-22:38(S18). 모달 부제(06-07:49 S10 · 06-17:45 S2)는 `ConfirmDialog`에 부제 슬롯이 있어 충돌이 아니다.

### 5.7 낱말 · 문구

| 옛 | 줄 수 | 줄 | rev 10 |
|---|---:|---|---|
| 구매 요청 상태 `신청` | 41 | 06-01:106 · 06-08:42,168 · 06-12:33,142,153,155,165,168,201,202,275 · 06-13:185,224 · 06-14:37,38,39,46,47,65,73,93,144,172,195,213,215,216,221,223,240,243,254,257,299,311 · 06-25:41,247,258,264,358 | `신청됨`(04.3 낱말 재사용, `status-map.ts`에 이미 있음 → muted. UI-SPEC UI-SPEC:27) |
| 발행 요청 상태 `요청` | 22 | 06-01:105 · 06-18:33,35,36,38,44,133,159,160,171,187,264 · 06-21:30,31,40,118,133,146,153,185,189,213 | `신청됨`(O-12 · UI-SPEC UI-SPEC:1400) |
| 증빙 값 `없음` | 7 | 06-06:34 · 06-10:36,44,162 · 06-11:282 · 06-20:39,268 | `증빙 없음`(증빙 필수 on, danger) / 빈 값 `—`(필수 off — 상태 낱말 아님). UI-SPEC UI-SPEC:413 |
| 견적 줄 상태 `구매 요청` | 1 | 06-13:44 | `구매 요청 중`(F3 — 행동 `구매 요청`과 낱말 충돌 해소, 사용자 확정 10/5 01:53). UI-SPEC UI-SPEC:1091 |
| P3 막힘 이유 `증빙 없음 · 담당 PM {이름}`(리터럴) | 12 | 06-03:207 · 06-04:35,39,42,126,194,199,236 · 06-10:44 · 06-23:32,222,297 | `증빙 없음 · 기안자 {이름}`(승인 뒤 증빙을 붙이는 사람은 기안자뿐 — 05 규칙. UI-SPEC UI-SPEC:298 · UI-SPEC:615-616 · UI-SPEC:346). **S18 · 대표 승인 막힘 · S21 `올리기는 담당 PM`은 `담당 PM` 그대로**(UI-SPEC UI-SPEC:375) — 06-22 · 06-16:45,239 · 06-08:40 · 06-09 · 06-14:260 · 06-18:33 · 06-21의 `담당 PM`은 이 낱말 바꿈 대상이 아니다 |
| S19 PM 항목의 받는 사람(P3 `증빙 없음 · 지급 대기` 줄) | 4 | 06-23:31,217,233,249 | **기안자**(UI-SPEC UI-SPEC:925). 완료 전 점검 막힘 줄은 담당 PM 그대로. 선결제 기한 초과 줄의 받는 사람은 :925 문장 구조가 모호하다(§2.5 C8) |
| 식별자 `pmName`(06-04 기준 P3 이름 출처) | 14 | 06-04:35,41,194,199,207,287,308,324,325 · 06-06:35,207 · 06-23:32,132,208 | 값이 기안자 이름이 되므로 `drafterName`류로 이름 바꿈 권장(05 실물에서 기안자 이름을 읽는 경로를 06-04 ⓪에서 확인) |


## 6. `## UI Considerations` 199행 — 플래너가 `must_haves`로 옮길 것

### 6.0 규칙 · 개수 · 읽는 법

- **옮기는 규칙**: `explicit` → `must_haves.truths` 문자열 · `backstop` → `{ statement, verification: backstop }` · `unresolved` → 계획 가정(UI-SPEC:1174 · plan-phase.md:875). 품질 게이트는 「resolved 항목이 한 줄도 조용히 빠지지 않는다」다(plan-phase.md:924). 개수는 **199행 = 147 explicit + 52 backstop + 0 unresolved**(UI-SPEC:1176)이고 실제 표도 같다(UIC 줄 199개 전부가 `| 요소 | 종류 |`로 시작함을 대조 — §7).
- **backstop의 뜻**: 검증 때 명시 증거(연결된 테스트)가 없으면 `human_needed`로 빠진다(ui-consideration-probe.md:59-62). 이 페이즈의 증거는 06-24의 독립 DOM 감사(`CI=true`)이므로 backstop 줄마다 `verification: backstop` 표기가 `grep`으로 세어져야 한다(§4.3 X-5).
- **rev 10의 변화**: 엔진 재실행으로 4개 요소 **25행을 더했다**(UI-SPEC:1173) — `S9·S12·S13 옆 패널` 5 · `SP-8 패널 위 고르기 목록` 8 · `S8 카드 사용 삭제 · 되돌리기` 4 · `증빙 판정 표면(05 규칙)` 8. 머리가 「손으로 고친 행」으로 적은 목록(UI-SPEC:1172)은 23행인데 rev 9와 문장을 직접 대조하면 **41행**이 바뀌었다 — 목록에 없는 18행은 옛 토큰 · 낱말 이름 교체와 r2 문장 변화다(S1 제자리 증빙 확인|populated, S11|overflow, S11|partial, S11|zero-one-many, S12|loading, S13|loading, S14|populated, S14|zero-one-many, S16|partial, S16|populated, S17|populated, S1|loading, S2|long-text, S4|loading, S4|overflow, S5|loading, S5|overflow, S9|loading). 플래너는 머리 목록이 아니라 아래 66행 표를 쓴다.
- **플랜 쪽 옮김 추정**: 플랜 `must_haves`의 `"{요소} {종류}: …"` 머리말 줄(truths) · `statement: "…"`(backstop)을 찾아 UIC 행과 맞췄다 — **171행에 줄이 보이고 28행은 안 보인다**(줄 191개 = truths 143 + backstop 48; 06-24가 센 48건과 backstop 수가 같다). 머리말 없이 풀어 쓴 줄은 못 찾으므로 「안 보인다」는 「없다」가 아니다. `(b)` = backstop 줄.
- 표의 표지: **A** = rev 10이 더한 행, **C** = rev 9 문장이 바뀐 행. 「낡음」은 지금 플랜 줄에 옛 토큰(`--faint` `--muted` `--danger` `--warning` `--success` `--fs-xs` `--fs-sm` `--line-strong` `--modal-w`) · 토스트 · `PageHeader` · `status-display` · 페이지 폼 · 옛 라우트가 든 것이다(§5가 줄 전체 목록).

### 6.1 더한 25행 + 바뀐 41행 — 새 truth를 쓰거나 고쳐 쓸 것

| 표지 | 요소 · 종류(UIC 줄) | rev 10 내용(줄임) | 지금 플랜 줄 | 받을 플랜 · 할 일 |
|---|---|---|---|---|
| C | S1 · loading UI-SPEC:1181 | +`--text-faint`로 −`--faint`로 | 06-15:47 · 06-17:39 — 낡음: 06-17:39 옛 토큰 --faint | 고쳐 쓰기 → 06-15; 06-17 |
| C(b) | S2 · long-text UI-SPEC:1192 | +`--dialog-w` −`--modal-w` | 06-17:68(b) — 낡음: 06-17:68 옛 토큰 --modal-w | 고쳐 쓰기 → 06-17 |
| C | S4 · empty UI-SPEC:1201 | +기안자 / `—`(상태 낱말 없음, rev 10)이고 −담당 PM / `없음`(`--muted`)이고 | 06-10:44 — 낡음: 06-10:44 옛 토큰 --muted·P3 받는 사람 담당 PM | 고쳐 쓰기 → 06-10 |
| C | S4 · loading UI-SPEC:1202 | +`--text-faint`로 −`--faint`로 | 06-06:44 — 낡음: 06-06:44 옛 토큰 --faint | 고쳐 쓰기 → 06-06 |
| C | S4 · partial UI-SPEC:1205 | +풀림(rev 10 — 05 규칙): 승인 뒤 기안자의 추가(+ 증빙 금… / 보존), 무효 뒤 살아 있는 파일 0이면 `증빙 없음`. −풀림: PM이 증빙을 더하거나 떼거나 금액을 고치면 / 보존). | **없음** | 새 truth 작성 → 06-11(훅 C2) · 06-06 |
| C(b) | S4 · overflow UI-SPEC:1206 | +`--form-max` −720 | 06-06:47(b) | 문장 대조 → 06-06 |
| C | S5 · loading UI-SPEC:1209 | +`--text-faint` −`--faint` | 06-04:45 — 낡음: 06-04:45 옛 토큰 --faint | 고쳐 쓰기 → 06-04 |
| C(b) | S5 · overflow UI-SPEC:1212 | +`--form-max` −720 | 06-04:48(b) | 문장 대조 → 06-04 |
| C | S6 · empty UI-SPEC:1214 | +`--field-w-long` −480 | **없음** | 새 truth 작성 → 06-10 |
| C | S7 · zero-one-many UI-SPEC:1225 | +파일 삭제는 마지막이어도 모달 없음(rev 10 / SP-6 철회): 떼기는 작성 중 −문서의 마지막 증빙 삭제 = 확인 모달(「Destructive / 증빙 삭제」, SP-6) | 06-11:51 · 06-25:51 | 문장 대조 → 06-11; 06-25 |
| C | S8 · populated UI-SPEC:1230 | +`ListScreen`(부제 없음) · / 행동 칸 `수정` · `삭제` · −· 열 여섯 / 줄 | 06-05:45 | 문장 대조 → 06-05 |
| C | S8 · partial UI-SPEC:1231 | +· 행 삭제 뒤 표 위 결과 줄 `카드 사용 삭제됨 · 48,000` … | 06-05:46 · 06-25:52 | 문장 대조 → 06-05; 06-25 |
| C | S9 · loading UI-SPEC:1236 | +`--text-faint` −`--faint` | 06-05:52 — 낡음: 06-05:52 옛 토큰 --faint | 고쳐 쓰기 → 06-05 |
| C | S9 · error UI-SPEC:1237 | +칸」(사용일 미래 — Q6) / · 실행가 초과 Q3 −칸」 | 06-09:42 | 문장 대조 → 06-09 |
| C | S9 · populated UI-SPEC:1238 | +옆 패널(PC 480 · 폰 아래 시트) / 폼)」). 등록 뒤 패널 유지 + 결과 한 줄 `카드 사용 등록됨 · … −폼)」) | 06-05:53 · 06-25:53 | 문장 대조 → 06-05; 06-25 |
| C | S9 · partial UI-SPEC:1239 | +바뀐 칸이 있을 때 `Esc` · x · `취소` / 버리기」(가림막은 무시, 서버 기본값은 바뀐 칸 아님). −입력이 있는데 `취소 Esc` / 버리기」. | 06-09:43 | 문장 대조 → 06-09 |
| C(b) | S9 · overflow UI-SPEC:1240 | +`Select`(패널 전폭)와 / 서고 본문만 스크롤 · 행동 줄 고정인지 −`Select`(200)와 / 서는지 | 06-09:50(b) | 문장 대조 → 06-09 |
| C(b) | S9 · long-text UI-SPEC:1242 | +항목(패널 전폭), −항목 480 칸, | 06-09:52(b) | 문장 대조 → 06-09 |
| C | S10 · populated UI-SPEC:1246 | +실행가 + 2행 `남은 실행가`(Q3), / `--fw-bold` −실행가, / 700 | 06-07:47 | 문장 대조 → 06-07 |
| C | S10 · partial UI-SPEC:1247 | +패널에서는 / 지출결의로`. 남은 실행가 0 이하 줄 = `aria-disabled`… −폼에서는 / 지출결의로` | 06-07:48 | 문장 대조 → 06-07 |
| C | S11 · loading UI-SPEC:1252 | +옆 패널(`?purchase=`). −3차 / 폼 이동. | 06-14:43 | 문장 대조 → 06-14 |
| C | S11 · partial UI-SPEC:1255 | +`신청됨` −`신청` | 06-14:46 — 낡음: 06-14:46 옛 낱말 신청/요청 | 고쳐 쓰기 → 06-14 |
| C | S11 · overflow UI-SPEC:1256 | +`신청됨` −`신청` | 06-14:47 · 06-14:56(b) — 낡음: 06-14:47 옛 낱말 신청/요청 | 고쳐 쓰기 → 06-14 |
| C | S11 · zero-one-many UI-SPEC:1257 | +(신청됨 −(신청 | 06-14:48 — 낡음: 06-14:48 옛 낱말 신청/요청 | 고쳐 쓰기 → 06-14 |
| C | S12 · loading UI-SPEC:1260 | +`--text-faint` −`--faint` | 06-14:49 — 낡음: 06-14:49 옛 토큰 --faint | 고쳐 쓰기 → 06-14 |
| C | S12 · error UI-SPEC:1261 | +실행가 초과 Q3 · | 06-08:44 | 문장 대조 → 06-08 |
| C | S12 · partial UI-SPEC:1263 | +바뀐 칸이 있을 때 `Esc` · x · `취소` / 버리기」. 등록 뒤 패널 유지 + `구매 요청됨 · 26001-C000… −입력이 있는데 `취소 Esc` / 버리기」 | 06-14:51 | 문장 대조 → 06-14 |
| C(b) | S12 · long-text UI-SPEC:1266 | +패널 전폭 / 칸에서 −칸 480에서 | 06-08:47(b) | 문장 대조 → 06-08 |
| C | S13 · loading UI-SPEC:1268 | +`--text-faint` −`--faint` | 06-12:45 — 낡음: 06-12:45 옛 토큰 --faint | 고쳐 쓰기 → 06-12 |
| C | S13 · error UI-SPEC:1269 | +문구(실행가 초과 Q3 · 사용일 미래 Q6 포함) −문구 | 06-12:46 | 문장 대조 → 06-12 |
| C | S13 · populated UI-SPEC:1270 | +구매 요청 목록 위 옆 패널 — 머리 / 완료` + 본문 첫 줄 `26001-C0001 −제목 / 완료 — 26001-C0001 | 06-12:47 | 문장 대조 → 06-12 |
| C | S13 · partial UI-SPEC:1271 | +-12,000`(`--text-muted`, / 비교). 완료 프로젝트 줄의 요청도 구매 완료 가능(gap 38 기본값… −-12,000`(`--muted`, / 비교) | 06-12:48 — 낡음: 06-12:48 옛 토큰 --muted | 고쳐 쓰기 → 06-12 |
| C(b) | S13 · long-text UI-SPEC:1274 | +패널 본문 첫 −제목 | 06-12:52(b) | 문장 대조 → 06-12 |
| C | S14 · populated UI-SPEC:1278 | +`--text-tag` / 경과`(`--status-warning` −`--fs-xs` / 경과`(`--warning` | 06-13:47 — 낡음: 06-13:47 옛 토큰 --fs-xs | 고쳐 쓰기 → 06-13 |
| C | S14 · zero-one-many UI-SPEC:1281 | +중 | 06-13:50 | 문장 대조 → 06-13 |
| C | S16 · populated UI-SPEC:1293 | +상태(`신청됨` −상태(`요청` | 06-18:44 — 낡음: 06-18:44 옛 낱말 신청/요청 | 고쳐 쓰기 → 06-18 |
| C | S16 · partial UI-SPEC:1294 | +중`(`--text-muted`), −중`(`--muted`), | 06-18:45 — 낡음: 06-18:45 옛 토큰 --muted | 고쳐 쓰기 → 06-18 |
| C | S17 · populated UI-SPEC:1301 | +(신청됨 / `신청됨` −(요청 / `요청` | 06-21:40 — 낡음: 06-21:40 옛 토큰 --warning·옛 낱말 신청/요청 | 고쳐 쓰기 → 06-21 |
| C | S19 · partial UI-SPEC:1318 | +기안자 / rev 10 받는 사람 = 기안자, −PM / 않는다) · | 06-23:38 | 문장 대조 → 06-23 |
| C | S20 · empty UI-SPEC:1322 | +· 지급 방식 · 증빙 종류 짝 빈 값(짝 검사 없음 — Q4) | 06-02:37 | 문장 대조 → 06-02 |
| C | S1 제자리 증빙 확인 · populated UI-SPEC:1346 | +· 고를 수 있음 / 다시 / 짝 막힘 → 선택 없음 + 짝 이유 + 포커스 그 행 링크. −다시. | 06-17:55 — 낡음: 06-17:55 토스트 | 고쳐 쓰기 → 06-17 |
| A | S9·S12·S13 옆 패널 · empty UI-SPEC:1354 | 새 건은 빈 패널로 열지 않는다 — 서버 기본값(S9 사용일 오늘 · 직전 카드 · 직전 연결 / S12 진입 줄 또는 `팀 비용` / S13 예상 금액 · 협력사 · 사용일 오늘). 등록 뒤 패널은 열린 채 `f… | **없음** | 새 truth 작성 → 06-05(S9) · 06-08(S12) · 06-12(S13) |
| A | S9·S12·S13 옆 패널 · loading UI-SPEC:1355 | 제출 중 1차 `진행 중` + `aria-disabled`, `Ctrl+Enter` 연타 · `Esc` · x · 가림막 무시(D7 — PanelForm.tsx:101 동기 잠금, SidePanel.tsx:181)… | **없음** | 새 truth 작성 → 06-05(S9) · 06-08(S12) · 06-12(S13) |
| A | S9·S12·S13 옆 패널 · error UI-SPEC:1356 | 칸 오류 = 명사형 `Form.Error`(「Error — 카드 사용 폼 칸」 · 「Error — 구매 요청 폼 칸」), 막힘 = `blockedReason` 한 줄 + 1차 비활성(빈 칸 · 연결 없음 · 실행가… | **없음** | 새 truth 작성 → 06-05(S9) · 06-08(S12) · 06-12(S13) |
| A | S9·S12·S13 옆 패널 · partial UI-SPEC:1357 | 바뀐 칸이 있을 때만 `Esc` · x · `취소` → 「입력 버리기」(부제 `{패널 제목} · N칸`, SidePanel.tsx:181-184 · :283), 가림막 누르기는 무시, 바뀐 칸 0이면 바로 닫힘(서… | **없음** | 새 truth 작성 → 06-05(S9) · 06-08(S12) · 06-12(S13) |
| A(b) | S9·S12·S13 옆 패널 · long-text UI-SPEC:1358 | 긴 가맹점 · 카드 · 품목 · URL이 패널 전폭(PC 480 · 폰 시트)에서 말줄임 / `overflow-wrap: anywhere`로 서고 본문만 스크롤 · 머리 · 행동 줄 고정, 폰 행동 줄 버튼 `--… | **없음** | 새 backstop 작성 → 06-05(S9) · 06-08(S12) · 06-12(S13) |
| A | SP-8 패널 위 고르기 목록 · empty UI-SPEC:1359 | 「Empty — 연결 고르기 목록」 세 갈래 — 다음 한 수(`견적 외 비용으로` / `팀 비용으로`)는 패널의 연결 라디오를 바꾸고 목록만 닫는다(패널 입력 유지) | **없음** | 새 truth 작성 → 컴포넌트 플랜(J1) · 06-07 · 06-14 |
| A(b) | SP-8 패널 위 고르기 목록 · loading UI-SPEC:1360 | 목록 로드 · 검색 중은 §7-7 LOADING 꼴, 뒤의 패널은 그대로 — 느린 응답을 강제해 CI=true DOM 감사 | **없음** | 새 backstop 작성 → 컴포넌트 플랜(J1) · 06-07 · 06-14 |
| A | SP-8 패널 위 고르기 목록 · error UI-SPEC:1361 | 「Error — 연결 고르기 목록 로드(S10)」 목록 자리 한 줄 + 2차 `다시 시도`, 1차 `이 줄로` 비활성(`aria-describedby` → 오류 줄), `취소 Esc`는 목록만 닫고 패널 입력은 남… | **없음** | 새 truth 작성 → 컴포넌트 플랜(J1) · 06-07 · 06-14 |
| A | SP-8 패널 위 고르기 목록 · populated UI-SPEC:1362 | 열린 패널 위 `ui/confirm-dialog` 검색 고르기 갈래 — PC 가운데 `--dialog-w` 480 + `--scrim-dialog` · 폰 시트 위 시트. 첫 포커스 = 검색 칸. 행 = 번호 · … | **없음** | 새 truth 작성 → 컴포넌트 플랜(J1) · 06-07 · 06-14 |
| A | SP-8 패널 위 고르기 목록 · partial UI-SPEC:1363 | `Esc`(`preventDefault` — `isPanelCloseKey`가 패널 닫기로 받지 않는다, SidePanel.tsx:33-36) · `취소` = 목록만 닫힘 → 포커스 누른 `{칸} 바꾸기`. `이 … | **없음** | 새 truth 작성 → 컴포넌트 플랜(J1) · 06-07 · 06-14 |
| A(b) | SP-8 패널 위 고르기 목록 · overflow UI-SPEC:1364 | 견적 줄 100줄+ 목록이 모달 · 시트 안에서만 스크롤하고 행동 줄이 고정되는지, 폰에서 두 시트 겹침이 `--sheet-max-h` 안에 서는지 CI=true DOM 감사 | **없음** | 새 backstop 작성 → 컴포넌트 플랜(J1) · 06-07 · 06-14 |
| A | SP-8 패널 위 고르기 목록 · zero-one-many UI-SPEC:1365 | 고를 수 있는 줄 0 = `이 줄로` 비활성 + `이을 수 있는 줄 없음 · 견적 외 비용으로` / `온라인구매 줄 없음 · 팀 비용으로`, 1+ = 부제 `… · 카드로 이을 수 있는 줄 N`. 겹침은 둘까지 —… | **없음** | 새 truth 작성 → 컴포넌트 플랜(J1) · 06-07 · 06-14 |
| A(b) | SP-8 패널 위 고르기 목록 · long-text UI-SPEC:1366 | 긴 항목 · 거래처 · 프로젝트 이름이 480 모달 · 폰 시트 폭에서 말줄임 + `title`로 서는지 CI=true DOM 감사 | **없음** | 새 backstop 작성 → 컴포넌트 플랜(J1) · 06-07 · 06-14 |
| A | S8 카드 사용 삭제 · 되돌리기 · loading UI-SPEC:1367 | 누른 `삭제` `…` + `aria-disabled`(요청 중 같은 행 `수정`도 비활성), 응답 뒤 행이 빠지고 표 위 결과 줄 `카드 사용 삭제됨 · 48,000` + 3차 `되돌리기`, 포커스 → `되돌리기`… | **없음** | 새 truth 작성 → 06-09 · 06-05(결과 줄 자리) |
| A | S8 카드 사용 삭제 · 되돌리기 · error UI-SPEC:1368 | 삭제 거부 = 행 유지 + 결과 줄 자리 `--status-danger` 서버 막힘 문구. `되돌리기` 실패(이중 연결 등) = 결과 줄 글자 `--status-danger` + 그 판정의 막힘 문구(「막힘 — 카… | **없음** | 새 truth 작성 → 06-09 · 06-05(결과 줄 자리) |
| A | S8 카드 사용 삭제 · 되돌리기 · overflow UI-SPEC:1369 | 결과 줄은 마지막으로 지운 한 건만 — 다른 행을 지우면 그 행의 줄로 바뀌고, 되돌리면 줄이 사라진다. 구매 완료로 생긴 행에는 `삭제`가 없다(O-11) | **없음** | 새 truth 작성 → 06-09 |
| A(b) | S8 카드 사용 삭제 · 되돌리기 · long-text UI-SPEC:1370 | 결과 줄 `카드 사용 삭제됨 · {13자리 금액}` + `되돌리기`가 320 폭에서 숫자 중간 줄바꿈 없이 서고 `되돌리기` 누르는 영역이 `--touch-min`인지 CI=true DOM 감사 | **없음** | 새 backstop 작성 → 06-09 · 06-05(결과 줄 자리) |
| A | 증빙 판정 표면(05 규칙) · empty UI-SPEC:1371 | 살아 있는 파일(`removed_at IS NULL AND voided_at IS NULL`) 0 = `hasEvidence` 거짓 → 증빙 필수 on이면 `증빙 없음`(danger, P3) · off면 `—`. … | **없음** | 새 truth 작성 → 06-06(`hasEvidence`) · 06-10 · 06-19 · 06-22 |
| A | 증빙 판정 표면(05 규칙) · loading UI-SPEC:1372 | 업로드 진행 = Phase 5 첨부 영역의 §7-10 행 아래 2px 진행 바 — 06은 새 진행 표시를 더하지 않는다. 판정 값은 서버 응답으로만 바뀐다 | **없음** | 새 truth 작성 → 06-11 |
| A | 증빙 판정 표면(05 규칙) · error UI-SPEC:1373 | 결재 중 `evidence_attach` 없는 사람의 직접 호출 = 서버 거부(05-09 문구). 06 업로드 오류 = 「Error — 증빙 업로드」 넷. 결재 중 · 승인 뒤 파일 행에는 `삭제`가 없어 떼기 오… | **없음** | 새 truth 작성 → 06-11 |
| A | 증빙 판정 표면(05 규칙) · populated UI-SPEC:1374 | 무효 파일 행 모양과 무효 처리 창은 05 표면(05-09)이 그린다 — 06은 그 결과만: 무효 뒤 `확인됨` → `확인 전`, 살아 있는 파일 0이면 `증빙 없음` + P3(지급 전) / P6 갈래(지급 뒤) | **없음** | 새 truth 작성 → 06-11 · 06-06 |
| A | 증빙 판정 표면(05 규칙) · partial UI-SPEC:1375 | 결재 중 `evidence_attach` 권한이 없는 사람에게는 첨부 영역 · 붙이기 버튼을 렌더하지 않는다(비활성 버튼 없음 — 잠김 한 줄 `결재 중 · 증빙은 경영관리`는 05 표면). 권한자의 결재 중 추가… | **없음** | 새 truth 작성 → 06-11(C2) |
| A(b) | 증빙 판정 표면(05 규칙) · overflow UI-SPEC:1376 | 무효 파일이 섞인 파일 10개+ 문서에서 S1 증빙 칸 · S4 · S18 · S19가 살아 있는 파일만 세는지 — `hasEvidence` 통합 테스트 + CI=true DOM 감사 | **없음** | 새 backstop 작성 → 06-06 · 06-15/06-20 · 06-19/06-22 · 06-23 |
| A | 증빙 판정 표면(05 규칙) · zero-one-many UI-SPEC:1377 | 0 = `증빙 없음` / `—`, 1+ = `확인 전` → `확인됨`(또는 `면제` · `선결제`), S8 카드 사용 증빙 열은 `있음` / `—` 글자. 판정은 `hasEvidence` 한 함수 | **없음** | 새 truth 작성 → 06-06 · 06-10 · 06-25 |
| A(b) | 증빙 판정 표면(05 규칙) · long-text UI-SPEC:1378 | 80자 파일명이 Phase 5 첨부 영역 파일 행에서 말줄임 + `title`로 서는지 CI=true DOM 감사(06은 행 모양을 바꾸지 않는다) | **없음** | 새 backstop 작성 → 06-11(05 표면 — 06은 행 모양 불변) |

backstop은 더한 행 7건 · 바뀐 행 7건이다 — 새 backstop 7건이 플랜에 들어오면 06-24가 세는 `verification: backstop` 합이 늘어난다(숫자를 박지 말고 `grep -c` 합으로 — §4.3 X-5).

**플랜별로 손볼 UIC 행**(위 표 기준의 추정 — 행이 여러 플랜에 걸리면 각 플랜에 센다. 이미 줄이 있는 행은 그 줄을 가진 플랜, 없는 행은 요소별 빌더 표(§2.3)를 따랐다. 새 줄은 「없음」 행, 나머지는 고쳐 쓰기 · 대조):

| 플랜 | 행 수 | 새로 쓸 행(없음) |
|---|---:|---|
| 06-02 | 1 | — |
| 06-04 | 2 | — |
| 06-05 | 12 | 옆패널·empty, 옆패널·loading, 옆패널·error, 옆패널·partial, 옆패널·long-text, S8삭제·loading, S8삭제·error, S8삭제·long-text |
| 06-06 | 7 | S4·partial, 증빙판정·empty, 증빙판정·populated, 증빙판정·overflow, 증빙판정·zero-one-many |
| 06-07 | 10 | SP-8·empty, SP-8·loading, SP-8·error, SP-8·populated, SP-8·partial, SP-8·overflow, SP-8·zero-one-many, SP-8·long-text |
| 06-08 | 7 | 옆패널·empty, 옆패널·loading, 옆패널·error, 옆패널·partial, 옆패널·long-text |
| 06-09 | 8 | S8삭제·loading, S8삭제·error, S8삭제·overflow, S8삭제·long-text |
| 06-10 | 4 | S6·empty, 증빙판정·empty, 증빙판정·zero-one-many |
| 06-11 | 7 | S4·partial, 증빙판정·loading, 증빙판정·error, 증빙판정·populated, 증빙판정·partial, 증빙판정·long-text |
| 06-12 | 10 | 옆패널·empty, 옆패널·loading, 옆패널·error, 옆패널·partial, 옆패널·long-text |
| 06-13 | 2 | — |
| 06-14 | 14 | SP-8·empty, SP-8·loading, SP-8·error, SP-8·populated, SP-8·partial, SP-8·overflow, SP-8·zero-one-many, SP-8·long-text |
| 06-15 | 2 | 증빙판정·overflow |
| 06-17 | 3 | — |
| 06-18 | 2 | — |
| 06-19 | 2 | 증빙판정·empty, 증빙판정·overflow |
| 06-20 | 1 | 증빙판정·overflow |
| 06-21 | 1 | — |
| 06-22 | 2 | 증빙판정·empty, 증빙판정·overflow |
| 06-23 | 2 | 증빙판정·overflow |
| 06-25 | 4 | 증빙판정·zero-one-many |
| J1 | 8 | SP-8·empty, SP-8·loading, SP-8·error, SP-8·populated, SP-8·partial, SP-8·overflow, SP-8·zero-one-many, SP-8·long-text |

### 6.2 나머지 133행 — 문장은 그대로, 줄은 있다

rev 10이 문장을 안 바꾼 133행 중 **132행은 플랜에 줄이 보인다**. 나머지 1행은 `S6 partial`(UIC UI-SPEC:1217)인데 06-10에 머리말 있는 줄이 안 보인다 — 06-10:39 · :45가 같은 내용을 머리말 없이 풀어 쓴 것으로 보이고 read_first는 「S6 행 전부」를 가리킨다(06-10:225). 줄이 옛 낱말 · 토큰을 품은 것이 있어 요소별로 모았다 — 플래너는 UIC 문장을 그대로 두고 플랜 줄만 §5 대로 고친다.

| 요소 | 행(explicit/backstop) | 플랜 줄이 있는 플랜 | 낡은 표기가 든 줄 |
|---|---|---|---|
| S1 | 7 (6/1) | 06-15 · 06-17 | — |
| S2 | 4 (4/0) | 06-15 · 06-17 | partial: 06-15:55 토스트 |
| S3 | 8 (7/1) | 06-20 | — |
| S4 | 3 (2/1) | 06-06 · 06-10 | — |
| S5 | 4 (3/1) | 06-04 · 06-20 | — |
| S6 | 4 (2/2) | 06-10 | — |
| S7 | 7 (5/2) | 06-11 · 06-25 | — |
| S8 | 6 (5/1) | 06-05 | — |
| S9 | 2 (2/0) | 06-05 · 06-09 | — |
| S10 | 6 (3/3) | 06-07 | — |
| S11 | 4 (3/1) | 06-08 · 06-14 | — |
| S12 | 4 (3/1) | 06-08 · 06-14 | — |
| S13 | 3 (2/1) | 06-12 | — |
| S14 | 6 (3/3) | 06-13 | — |
| S15 | 7 (5/2) | 06-07 | — |
| S16 | 6 (4/2) | 06-18 | — |
| S17 | 7 (6/1) | 06-21 | — |
| S18 | 8 (5/3) | 06-19 · 06-22 | empty: 06-22:36 옛 토큰 --success; populated: 06-19:43 옛 토큰 --danger |
| S19 | 7 (4/3) | 06-23 | error: 06-23:37 옛 토큰 --danger |
| S20 | 4 (1/3) | 06-02 · 06-08 | — |
| S21 | 8 (6/2) | 06-16 | populated: 06-16:48 토스트 |
| S22 | 8 (6/2) | 06-16 | empty: 06-16:51 옛 토큰 --muted; populated: 06-16:54 토스트 |
| S1 제자리 증빙 확인 | 6 (4/2) | 06-17 | — |
| S1 일괄 결과 알림 | 4 (4/0) | 06-17 | — |

### 6.3 줄이 안 보이는 28행 — 플래너가 새로 쓸 truth(S6 partial은 확인만)

- **S4** — partial. 받을 플랜: 06-11(훅 C2) · 06-06.
- **S6** — empty · partial. 받을 플랜: 06-10.
- **S9·S12·S13 옆 패널** — empty · loading · error · partial · long-text(b). 받을 플랜: 06-05(S9) · 06-08(S12) · 06-12(S13).
- **SP-8 패널 위 고르기 목록** — empty · loading(b) · error · populated · partial · overflow(b) · zero-one-many · long-text(b). 받을 플랜: 컴포넌트 플랜(J1) · 06-07 · 06-14.
- **S8 카드 사용 삭제 · 되돌리기** — loading · error · overflow · long-text(b). 받을 플랜: 06-09 · 06-05(결과 줄 자리).
- **증빙 판정 표면(05 규칙)** — empty · loading · error · populated · partial · overflow(b) · zero-one-many · long-text(b). 받을 플랜: 06-06 · 06-11(소비 06-10 · 06-13 · 06-19 · 06-22 · 06-23 · 06-25).

이 28행 가운데 25행은 rev 10이 새 요소로 더한 것이라 **플랜 25개 어디에도 대응 줄이 없다**. 나머지 3행 중 S4 partial · S6 empty는 rev 10에서 문장이 바뀌었는데 머리말 있는 플랜 줄이 안 보이는 것이고(S4 partial은 05 규칙으로 통째로 다시 쓴다 — §2.5 C2), S6 partial은 rev 10에서 안 바뀐 행이다.


## 7. 검증 메모 — 무엇을 어떻게 확인했나 · 줄 번호 기준 · 재현 명령 · 추정인 곳 · 하지 않은 일

### 7.1 기계 · 스크립트로 대조한 것

- **줄 인용 949건 · 오류 0.** 초안의 줄 인용은 `대상:줄 ~ 정규식` 태그로 적고, 조립 스크립트가 실제 파일의 그 줄(범위는 그 구간)을 열어 정규식이 있는지 확인했다. 하나라도 어긋나면 조립이 실패하게 두었고 이 문서는 통과한 조립본이다(남은 태그 0). 대상별 건수: 플랜 360 · UI-SPEC 341 · SYSTEM 72 · `design-review-rev10.md` 37 · CLAUDE.md 33 · `design-apply-cross-r2.md` 13 · `frontend.md` 12 · DECISIONS 11 · DESIGN 9 · ROADMAP 7 · `design-gate` SKILL 6 · `reconcile.md` 6 · CHECKLIST 5 · `codex-design-review-rev10.md` 4 · `gsd-plan-checker.md` 2 · `.continue-here.md` 7 · `screen-frames.test.ts` 3 · 옛 `design-review.md`(rev 9) 3 · `ListScreen.tsx` · `ConfirmDialog.tsx` · `error-copy-noun-style.test.ts` · `06-CONTEXT.md` · `plan-phase.md` 각 2 · `tokens.test.ts` · `status-map.test.ts` · `design-system-docs.test.ts` · `list-screen.test.ts` · `evidence-in-approval-rule.md` · `projects.module.css` · REQUIREMENTS · `ui-consideration-probe.md` 각 1.
- **태그 밖 줄 인용**: 평문으로 적은 `CL` · `FE` · `SYSTEM` · `UI-SPEC` · `ui/` 소스 줄 인용 45건과 이어 쓴 줄(`:445` `:482` `:1211-1229` `:283` `:1148 · :1187 · :1211 · :1241 · :1273` 등), 경로 + 줄 인용(`db/schema/corp-cards.ts` 32-35 · `domain/settings/keys.ts` 460 · `DetailScreen.tsx` 52 · `domain/corp-cards/index.ts` 45 등)은 조립 뒤 인용된 줄을 하나씩 열어 주장과 맞는지 눈으로 대조했다 — 어긋난 것은 §3.1의 한 줄뿐이었고(`expenseLineDoor` · `remainingForInstallments` 인용이 이 브랜치가 아니라 PR #162 head의 줄이었다) 고쳤다.
- **플랜 줄**: 조립본에 나온 `06-NN:줄` 418개(중복 제외, 태그 · 평문 합계)가 모두 파일 안에 있고 비어 있지 않다. §5 표의 줄 목록은 줄마다 **그 이름이 실제로 있는지**까지 다시 대조했다 — 옛 토큰 8행(35줄) · `status-display` 25 + 9줄 · `/cards?new=1` 19줄 · 토스트 활성 50 + 기록 7줄 · SP-6 모달 행 22항목 · `PageHeader` · 섹션 부제 · 낱말 7행 — 빗나감 0(범위로 적은 줄은 한 줄이라도 맞으면 통과).
- **플랜 머리 값**: §2.4 제목줄의 웨이브(W)와 `files_modified` 수(fm) 25개를 각 플랜 머리 YAML에서 다시 세어 대조했다(전부 일치 — fm 15 이상은 06-03 · 06-07(17) · 06-10 · 06-11 · 06-16 · 06-25(15)).
- **§6의 199행**: UI-SPEC UIC 표의 물리 줄이 `| 요소 | 종류 |`로 시작하는지 199행 모두 스크립트가 단언했다(불일치 0). 분류 147 explicit · 52 backstop · unresolved 0은 UI-SPEC 본문이 적은 합계와 같다.
- **0건 단언**: §0 2의 「플랜 25개에 이름이 없다」는 이 문서를 마감하며 다시 grep했다 — `ListScreen` `DetailScreen` `SidePanel` `PanelForm` `status-map` `design-gate` `evidence_attach` `evidence_void` `voided_at` `공용 카드` `실행가 초과` `짝 격자` `SP-8` `screen-frames` `tokens.test`의 합집합이 0줄, `Q2~Q7` 표기 0줄, `05-NN` 플랜 id 0줄이고 `hasEvidence`만 10줄(06-25)이다.
- **git 사실(PR #162)**: `git for-each-ref refs/remotes/pr162` = `a972a5ac` · 커밋 `0517e871`(2026-09-26T15:05:12Z)와 `317d6413`(15:13:57Z) · todo 경로 · `git diff --name-status origin/main...refs/remotes/pr162 -- .planning/phases/06-payment-evidence-cards .planning/todos` = `M 06-CONTEXT.md` + `A` todo 한 개 · `git show refs/remotes/pr162:.planning/phases/06-payment-evidence-cards/06-CONTEXT.md`의 11줄 — 마감 때 다시 실행해 §3과 같았다. `git status --short`는 비어 있었다(리포 수정 0).

### 7.2 줄 번호 기준 — rev 11이 서면 어떻게 읽나

- UI-SPEC · SYSTEM · DECISIONS · 플랜 · `ui/` 소스 · 테스트의 줄은 **HEAD `90fcd1c8`**(작업 트리 = 커밋) 기준이다. UI-SPEC rev 11 또는 정오표가 서면 UI-SPEC 줄이 밀린다 — 재계획 산출물은 **절 이름 · ID(S9 · O-23 · SP-8 · F10 …)로 인용**하고 줄은 보조로만 적는다. 이 문서의 UI-SPEC 줄을 새 판에서 찾을 때는 줄이 아니라 이 문서가 같이 적은 절 이름 · 낱말로 찾는다.
- SYSTEM은 이 브랜치의 1340줄 기준이고, UI-SPEC이 적은 SYSTEM 줄 인용은 §7-15 이후에서 +1 어긋나 있다(§0 18). 그래서 SYSTEM은 절 이름이 정본이다.
- 05 쪽 이름 · 줄은 이 브랜치에 없다. PR #162 head(`refs/remotes/pr162` = `a972a5ac`)에서만 읽은 것(`domain/expenses/line-door.ts:19` `expenseLineDoor` · `domain/money/index.ts:219` `remainingForInstallments` · `app/(app)/expenses/status-display.ts` · `(list)/page.tsx` · `[id]/expense-form.tsx` · `db/schema/expenses.ts`)은 본문에 그렇게 적었다. 05가 머지되면 이 이름 · 줄은 main 기준으로 다시 읽는다. 05 실물 이름 전수 대조는 `replan-A-05-names.md`의 몫이다.
- 플랜 줄은 `7eb6c2ad`로 들어온 상태 그대로다. 재계획이 플랜을 고치면 줄이 밀리므로 §5 표의 줄을 **먼저 한꺼번에** 처리하고 새 줄 번호는 그 뒤에 적는다.

### 7.3 재현 명령 — 지금 값(이 문서가 센 값)과 재계획 뒤 목표

`.planning/phases/06-payment-evidence-cards`에서 `P='06-[0-9][0-9]-PLAN.md'`로 두고 돌린 줄 수다. 목표에서 「예외」는 금지 검사 줄이 옛 이름을 인용하는 것이다.

```
grep -nP '(?<![\w-])--(?:faint|muted|danger|warning|success|fs-xs|fs-sm|line-strong|modal-w)(?![\w-])' $P | wc -l
                                      # 지금 35줄(41히트) -> 0
grep -n 'status-display' $P | wc -l   # 지금 34 -> 0 (예외: Phase 4 `projects/status-display.ts`를 가리키는 6줄)
grep -nF '/cards?new=1&purchase' $P | wc -l   # 지금 6 -> 0 (S13 경로 변경, §5.3)
grep -nF '/cards?new=1' $P | wc -l    # 지금 19 -> 13 (S8 · S9 · S14 · S15 토글 URL은 그대로 남는다)
grep -n '토스트' $P | wc -l            # 지금 61(한글) -> 「토스트 없음」 서술 8줄 + 이력 행만 (§5.4 정의 57줄 중 활성 50 -> 0)
grep -n 'PageHeader' $P | wc -l       # 지금 4 -> 0
grep -n 'pmName' $P | wc -l           # 지금 14 -> 이름 바꿈 권장(§5.7) 또는 의도적 유지
grep -nE '모달|[Mm]odal' $P | wc -l   # 지금 189 -> 표면별로 줄고 `ConfirmDialog` 표면만 남는다 (§5.5)
grep -nE 'rev ?[89]' $P | wc -l       # 지금 149 = 본문 84 + 표 줄 65 (`^\s*\|`) -> 본문 0 (표의 이력 행은 유지), `rev ?10`은 지금 0
grep -ohP '(?<![\w-])O-(?:1|3|4|5|7|8|10|11|12|13|14|15|16|17|19|20)(?!\d)' $P | wc -l
                                      # 지금 204(전 O-n 309 — `O-\d+`) — 열린 선택 16행(§4.4 ②)을 가리키는 횟수
grep -nE 'ListScreen|DetailScreen|SidePanel|PanelForm|status-map|design-gate|evidence_attach|evidence_void|voided_at|공용 카드|실행가 초과|짝 격자|SP-8|screen-frames|tokens\.test' $P | wc -l
                                      # 지금 0 -> 0이 아니어야 한다(화면 틀 · 옆 패널 · 상태 표 · 점검표 이름이 들어와야 하므로)
```

### 7.4 추정이거나 휴리스틱인 곳 — 사람이 한 번 더 볼 것

- **§6 플랜 쪽 옮김 대응(171 / 28)**: 플랜의 `must_haves` 줄(`S{n} {종류}` 머리 · 요소 낱말)을 기계로 맞춘 것이다. 「대응이 안 보인다」는 **머리 달린 줄이 없다**는 뜻이지 내용이 없다는 뜻이 아니다 — 다른 모양으로 서술됐을 수 있다. 낡음 표지(옛 토큰 · 토스트 · `PageHeader` · `status-display` · 페이지 폼 · 옛 라우트 · 옛 낱말 · `담당 PM`)도 낱말 일치이지 의미 판정이 아니다.
- **소유 플랜 지정**(§2.3 · §2.4 · §6의 「어느 플랜이 짓나」): 플랜 머리 · `files_modified` · 화면 번호 언급에서 추정했다. 플랜이 안 짓는 화면은 「소유 없음」으로 적었다(§0 6).
- **§2.5의 C · J는 권고**이며 사용자 결정이 아니다. 특히 J1(컴포넌트 플랜 신설) · J2(공용 카드 별도 위험 경로 PR) · J3(SP 승격 `결정자`) · SP-9 제안은 사용자 또는 UI-SPEC rev 11이 확정해야 한다.
- **§4.1의 수준 분류**(확정 5 · 추천안 15 · 맞춤 9 · 버림 3 · 참고 1)는 문서에 적힌 확정 · 적용 기록(`b9a572d1` · 세 검토 파일 · UI-SPEC 개정 메모)에만 근거한다. 채팅 기록은 보지 못했으므로 문서 밖에서 확정된 것이 더 있을 수 있다.
- **Codex 2 · 3차 원문은 리포에 없다**(§4.2) — 「최종 1508줄 본문을 Codex가 통으로 다시 읽지 않았다」는 검토 파일의 기록을 옮긴 것이다.
- **기계 검사 · 훅 동작**(§1.5)은 테스트 · 스킬 소스를 읽고 적은 것이다. 읽기 전용 작업이라 실행하지 않았다(`pnpm` 호출 0).
- **수 세기 정의**: 토스트 57(= 한글 61줄 − 이미 「토스트 없음」 8줄 + 영문 `Toast` · `ui/toast` 4줄) · `status-display` 34(= `.ts` 25 + 테스트 9, 파일 이름이 다른 `projects/status-display.ts` 줄과 6줄 겹침) · 모달 어휘 189(= `모달|[Mm]odal`) · 옛 토큰 41히트 · 35줄 · 39쌍(토큰 × 줄) — 정의가 다르면 숫자가 달라진다. 정의는 §5 각 소절에 적었다.

### 7.5 하지 않은 일

- 리포 파일 수정 0 · 커밋 0 · push 0 · `.planning/` 수동 편집 0 · 테스트 · 빌드 · 훅 실행 0 · 브라우저 0 · 패키지 설치 0 · `mcp__hearthbot__` 호출 0. 조립 스크립트와 조각 파일은 이 세션의 스크래치패드에만 있고 리포 밖이다.
- `/mnt/project-files`에서는 이 파일 하나만 새로 만들었다. 형제 파일은 쓰지 않았고, `reconcile.md` · `replan-D-plan-inventory.md` · `05-prep/evidence-in-approval-rule.md`만 읽어 인용했다. `replan-A-05-names.md`와 `replan-C-prior-reviews.md`는 다른 워커의 산출물이라 내용을 인용하지 않았고, 두 파일과 겹치는 주제(05 실물 이름 · 이전 검토)는 원본(PR #162 head · 검토 파일 셋)에서 직접 읽었다 — 두 파일과 숫자나 이름이 다르면 원본이 정본이다.
- 재계획 자체(플랜 고치기 · UI-SPEC rev 11 쓰기 · SP 승격 · `.planning/` 갱신 · `/plan-eng-review`)는 하지 않았다. 이 문서가 그 입력이다.
