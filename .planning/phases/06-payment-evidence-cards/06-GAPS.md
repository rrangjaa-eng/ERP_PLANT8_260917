# 06 갭 메우기 계획 (2026-10-14)

입력: `/mnt/project-files/06-review/verify/06-gap-input.md`(G-06-A ~ G-06-G) · 근거 `06-VERIFICATION.md` · `06-UAT.md` · `260907-gaps-adjudicated.md` · `codex-dom-adjudication.md` · `safari-report.md`.
결정 카드: 2026-10-14 14:20 KST 사용자 답 셋 — 카드 ① 「구매 요청만」(G-06-D) · 카드 ② 「경고만」(G-06-E — D-611의 결재 통과 · 증빙 없음 막힘을 대체) · 카드 ③ 「지금 모양 유지」(G-06-F — Codex N1 A). 답을 기다리는 갭 없음 → `checkpoint:decision` 태스크 없음.

## 갭 → 플랜

| gap_id | plan | PR group | wave | blocked_until | depends_on_decision | gate |
|---|---|---|---|---|---|---|
| G-06-C | 06-31 | PR-G1 | 1 | — | — | `/review`(PR-G1 한 번) |
| G-06-G | 06-32 | PR-G1 | 1 | — | — | `/review`(PR-G1 한 번) |
| G-06-B | 06-33 | PR-G2 | 2 | 06.5-03 merged to main | — | `/review` + `/design-review` → `/qa`(PR-G2 한 번) |
| G-06-D | 06-34(서버) | PR-G2 | 2 | 06.5-02 · 06.5-03 merged to main | — (카드 ① 2026-10-14 14:20 KST 「구매 요청만」) | `/review` + `/design-review` → `/qa`(PR-G2 한 번) |
| G-06-D | 06-35(화면 · depends_on 06-34) | PR-G2 | 3 | 06.5-02 · 06.5-03 merged to main | — (카드 ①) | `/review` + `/design-review` → `/qa` + 독립 DOM 감사(PR-G2 한 번) |
| G-06-E | 06-36 | PR-G3 | 2 | 06.5-01 · 06.5-07 · 06.5-09 merged to main | — (카드 ② 2026-10-14 14:20 KST 「경고만」) | `/review` + `/design-review` → `/qa` + 독립 DOM 감사 |
| G-06-A | 06-37(`risk:` 마이그레이션) | PR-GA(단독) | 3 | 06.5-01 · 06.5-07 · 06.5-10 merged to main | — (사용자 카드 20:42 「보관 카드 재등록 다시 허용」) | `/review` · Opus 실행자 + Opus 독립 검토 · **사용자 머지**(위험 경로 `db/migrations/` · `db/schema/`) |
| G-06-F | 06-38 | PR-G4 | 4 | 06.5-07 · 06.5-10 merged to main | — (카드 ③ 2026-10-14 14:20 KST 「지금 모양 유지」) | 없음(문서만 — CLAUDE.md §4) |
| G-06-H | 06-39(Task 1) | PR-G5 | 2 | 06.5-07 · 06.5-05 merged to main | — (지정한 `defaultPrevented` 한 줄을 먼저 넣고, 칸 안 Ctrl+Enter 회귀 · 막힌 모달 지급이 실행으로 확인되면 열린 dialog 가드로 바꿈 — 06-39 「고칠 줄」 절) | `/review` + `/design-review` → `/qa` + 독립 DOM 감사(PR-G5 한 번) |
| G-06-I | 06-39(Task 2) | PR-G5 | 2 | 06.5-05 merged to main(`next-turn.test.ts`) | — | PR-G5 한 번(위와 같음) |
| G-06-J | 06-39(Task 3) | PR-G5 | 2 | 06.5-05 merged to main(PR-G5 묶음) | — (재현 먼저 — CI 빌드 5회, 재현될 때만 수정) | PR-G5 한 번(위와 같음) |
| G-06-K | — (07로 넘김 · 계획 안 함) | — | — | — | — | — |

요구사항 추적: EVID-04(06-31) · EXP-13(06-32 · 06-38, 추적) · EXP-07(06-33 · 06-37 — 카드 마스터 MAST-03은 Phase 3) · EXP-10(06-34 · 06-35) · PROJ-06(06-36). 각 플랜의 엣지 프로브는 `unclassified · unresolved`로 드러내고 자동 해소하지 않았다.

## 순서 · 브랜치

- **웨이브는 blocked_until 순서다.** 06-33 · 06-34 · 06-36 · 06-37 · 06-38은 다른 플랜에 기대지 않지만(`depends_on` 빔) 06.5 PR이 main에 머지된 뒤에만 시작한다 — 검증기의 「Wave > 1 but depends_on is empty」 경고는 이 때문이고 받아들였다. 06.5 PR 순서: PR-A(01) · PR-B(07 · 09) → PR-C(02 · 03 · 05) · PR-C2(04) → PR-D2(06) → PR-D(08 · 11) → PR-A2(10, 마지막 · 사용자 머지).
  - 지금 시작: PR-G1(06-31 · 06-32 — 06.5 파일 겹침 0).
  - PR-A · PR-B 뒤: PR-G3(06-36 — `domain/pre-settle-check/index.ts`를 06.5-01 · 07 · 09가 모두 고친다).
  - PR-C 뒤: PR-G2(06-33 → 06-34 → 06-35, 같은 작업 트리에서 차례로).
  - PR-A2 뒤: PR-GA(06-37) · PR-G4(06-38).
- 브랜치 전략 none → PR마다 작업 트리 하나: `git worktree add ../plant8-06-gap-<g1|g2|g3|ga|g4> -b claude/06-gap-<…> origin/main`. 웨이브 시작 전 · 푸시 전 origin/main을 머지 커밋으로 반영(force push 금지).
- **위험 경로는 PR-GA 하나에만** 있다 — 나머지 PR은 조건이 맞으면 세션이 머지한다.

## 겹침 메모

- `docs/design/DECISIONS.md` 끝 덧붙임: 06.5-07 · 06.5-10(먼저) → 06-37(wave 3) → 06-38(wave 4). PR-GA가 사용자 머지를 기다리는 동안 PR-G4가 열리면, 푸시 전 origin/main 머지에서 두 항목을 날짜 순으로 모두 남긴다(어느 쪽도 지우지 않는다).
- `docs/design/checks/`: 06-35 · 06-36 · 06-37 · 06-38이 서로 다른 파일 이름(`<날짜>-06-3N-…md`)을 만든다 — 같은 파일 겹침 없음.
- `docs/design/SYSTEM.md`: 06.5-07이 먼저 고치고 06-38은 §0 인용 줄 · §1-4 면 토큰 줄 두 줄만 고친다.
- 06.5 플랜 파일은 어느 갭 플랜도 고치지 않는다(각 플랜 prohibitions · acceptance로 확인) — 06.5 파일에서 회귀가 나면 멈추고 보고.

## 다른 곳으로 보낸 것 (계획 안 함)

- 07: /mnt/project-files/06.4-review/verify/07-input.md 마지막 절(P26·E26·C20·07-CONTEXT 누락 이관·화면 결함 D1/D2·실기기 사파리·09 입력)
- 06.1: /mnt/project-files/06.1-prep/from-06-verify.md(E06·E13·E14·G15·G6·N4)
- 스테이징 막힌 14개(T1~5·7·8·12·21~23·25·30·31): 카드 ④(계정 만들기) 답 대기 — 코드 갭 아님
