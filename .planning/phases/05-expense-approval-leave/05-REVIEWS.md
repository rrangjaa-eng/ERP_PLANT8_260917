---
phase: 5
round: 6
sources:
  - design-review-r6.md (/plan-design-review Round 6 종합 — Codex 4폭 캡처 + Opus 7 패스, 2026-10-04)
  - design-review-r6-opus.md (Opus 독립 디자인 검토, R6-01~R6-11)
  - design-review-r6-codex.md (Codex GPT-6.1 Sol · medium, 4폭 캡처 · DOM 실측 판정)
  - code-drift-review-r6.md (계획 ↔ main fb277b08 코드 대조, Opus 독립 조사 — 범위 b41944d..fb277b08: 04.5 · 04.6 #158 · #152 · #157 · #159~#161, N1~N10)
reviewers: [opus-design, codex-design, opus-code-drift]
prior_rounds:
  - "Round 1 — 1108e20 (ceo-review.md, 반영 완료)"
  - "Round 2 — 69fb7ea (eng-review.md, 반영 완료)"
  - "Round 3 — efd6c67 (design-review.md, 반영 완료)"
  - "Round 4 — 0ded729 (code-drift-review.md, 반영 완료)"
  - "Round 5 — 82d02cc4 (code-drift-review-r5.md, 반영 완료 #156 — 화면 부분은 「04.6 의존」 표시로 이 라운드에 미룸)"
---

# Phase 5 — Reviews (Round 6: 화면 재대조 라운드 — 04.6 머지 판 fb277b08)

> `/gsd-plan-phase 5 --reviews` Round 6 입력. 정본은 위 네 보고서(파일:줄 근거)이고 이 파일은 반영용 목록이다(내용 추가 없음).
> 이 브랜치(PR #162)는 main fb277b08(04.6 머지)을 이미 포함한다(d3941068). `05-UI-SPEC.md`는 이 라운드에 04.6 머지 판으로 개정됐다(33fefee8, gsd-ui-checker VERIFIED) — 플랜은 그 UI-SPEC을 따라간다.
> 이 라운드의 목표: Round 5 U1 A대로 「04.6 의존 — 04.6 머지 판 기준으로 다시 씀」 표시 23줄(11개 플랜)을 실제로 다시 쓰고 지운다 → 05-01 P-8 충족.

## User Decisions

- 앞선 결정(Round 1~5의 U1 · U3 · U4 A, `expenses.evidence_void` A, E1 · E2 A, G1~G4 A, R1 A, Z1~Z3 A, M1 A)은 그대로 전제.
- **밤 위임(사용자 승인 2026-10-03 「예」 — #158 머지 뒤 #89 main 반영 · 화면 재대조 진행)**: 사용자에게 묻지 않고 추천안으로 반영하고, 아래 셋은 사용자 확인 대기로 Ledger에 표시한다. 답이 다르면 해당 줄만 다시 고친다.
  - **U2 — 폰 행 시트 문서 행동 위계: 추천 3차(기존 `RowSheet` `action` 자리, 본문과 같이 스크롤)** — 근거 SYSTEM.md:896 (바) · RowSheet.tsx:23-24,84, Opus 검토 「유지」. 뒤집는 신호: 320×568 실측에서 흔한 행이 접힘 아래(R6-10)
  - **R6-06 — `/expenses/new` 첫 포커스: 추천 첫 저장 전에는 `견적 줄 고르기`**
  - **R6-08 — 내 초안이 있는 줄의 셀 글자: 추천 그대로(`지출결의 올리기`가 같은 초안을 연다)**

## Consensus Summary

### HIGH (P1)
- **R6-01 + N1** 새 상태 낱말 4개(`작성 중` · `본인 승인` · `지출결의 중` · `무효`)를 `ui/status-tag/status-map.ts`(+ 테스트)에 더하는 플랜이 없다 — 없으면 typecheck 실패(status-map.ts:59). `본인 승인`은 05-01 Task 3(E6)이 웨이브 1에서 처음 쓴다(04.6에서 `stepResult`가 `{text, status: StatusWord}`로 바뀜). 수리: 05-01 E6 기대 문장 · Task 3 ③ 고침 + files에 `status-map.ts`와 테스트(`본인 승인` 하나), 나머지 셋은 처음 쓰는 플랜(05-05 `지출결의 중` · `작성 중`, 05-09 `무효`)에, SYSTEM §7-5 기록(05-02 B2)이 먼저 오도록 depends_on 정리. 영향: 05-01 · 05-02 · 05-05 · 05-09
- **R6-02** 플랜 8개가 개정 UI-SPEC보다 뒤처짐 — 이름(옛 토큰 · `PageHeader` · `.num`/`tabular-nums`, 플랜별 수는 design-review-r6-opus.md 표, 정확한 줄은 UI 조사 목록: 05-02:22,25,27,29,31,69,121,134,136,138,168,169,234 · 05-04:181,406 · 05-05:48,49,55,179 · 05-06:37,41,121,148,156,165,237 · 05-07:39,42,45,144,149,150 · 05-08:40,44,47,49,156,161,199,202,237,349 · 05-09:58,262,264,362,394 · 05-10:43,196,200,331 · 05-11:54,176,181,252,387 · 05-15:27,29 · 05-01:407)과 동작(05-05:61,230-234 시트 1차 전폭 단언 → U2 3차 · 05-05:58 증빙 절 2px → 1px · 05-08:43,49 걸러서 빈 보기에서 1차 숨김 · 빈 문구 · 로딩 합계 라벨 → ListScreen 규칙 · 05-10:198 빈 결재함 행동 3차 → `ListEmpty` 2차 · 05-15 지역 색 표 → status-map · 05-02:121 B3 · B7 SYSTEM 편집 → 04.6이 흡수, 지움). 「04.6 의존」 표시 23줄 제거 포함. 영향: 05-01 · 02 · 04~11 · 13 · 15
- **N2** Phase 5가 바꾸는 화면을 기존 테스트가 고정 — 시각 기준 사진(`dev-components` — 갤러리가 `STATUS_KIND`를 그림, `approvals` 빈 화면), `test/unit/ui/system-md-compliance.test.ts:48-60`(`연차 목록 보기` · `/leave`), `test/e2e/page-chrome.spec.ts:232-247` · `mobile-design-review-p2.spec.ts:20`(`/expenses` 자리 화면). 수리: 바꾸는 플랜(05-05 또는 05-01 · 05-10 · 05-08)에 그 테스트 갱신과 `visual-baseline.yml` 실행 단계를 넣는다

### MEDIUM (P2)
- **R6-03** 무효 대화 실패 · 거부 줄 자리 — UI-SPEC :308,:473,:895 「사유 칸 아래」 → `ConfirmDialog.tsx:30-33,324-331` · SYSTEM:1000대로 1차 왼쪽 이유 자리(폰은 버튼 위). 05-09:435 미룸 항목도 닫는다. 영향: UI-SPEC · 05-09
- **R6-04** 골라내기 폰 시트 높이 85vh(UI-SPEC :676,:140) → `--sheet-max-h`(SYSTEM §7-8). `RowSheet` · `ConfirmDialog`의 같은 85vh 어긋남은 공용 `ui/`라 이 페이즈 밖 — 05 범위 밖 할 일로 기록만. 영향: UI-SPEC · 05-15
- **R6-05** UI-SPEC :747이 `지출결의 올리기`를 링크라 부름 — S1 · S2(:335,:344,:370)는 초안을 만들고 여는 서버 행동. B4 (바) 문장에 「문서를 만들고 여는 행 행동」 허용 구절. 영향: UI-SPEC · 05-02
- **R6-06** `/expenses/new` 첫 포커스(:410 vs :432) — 위 사용자 확인 대기 추천안으로. 영향: UI-SPEC · 05-07
- **N3** 05-11 머리 줄 버튼은 `quote-table.tsx:2311-2325`가 그림 — 05-11 files에 추가
- **N4** 결재함 열 이름 · 로딩 뼈대가 `approvals/list-columns.ts`로 옮겨짐 — 05-01 Task 4 `measureHeader` 반영 자리, files에 추가
- **N5** 04.6 `screen-routes.ts`에 Phase 5 새 화면 셋(`/expenses` · `/expenses/[id]` · `/expenses/new`)의 행 없음 → 원칙 · 대비 · 글자 위계 점검을 건너뜀. 화면을 만드는 플랜에 행 추가
- **Codex(유효 1)** 진행 바 — SYSTEM.md:301,:307 · DECISIONS R3(:108)은 2px 진행 바, C-10(:787)은 만들지 않음. UI-SPEC B6(05-02 SYSTEM 개정)에 이미 있음 — 유지

### LOW (P3)
1. **R6-07** 폰 시트 다시 시도는 같은 3차 하나(두 번째 버튼 없음). 영향: 05-05
2. **R6-09** 폰 시트에서 만든 초안을 폰에서 지울 수 없음 — 기록만
3. **R6-10** 폰 시트 DOM 감사에 320×568 최악 사례 추가(U2 뒤집기 신호). 영향: 05-05
4. **R6-11** 「한 줄 사유 칸」 → SYSTEM대로 여러 줄 사유 칸. 영향: UI-SPEC · 05-09
5. **N6** REQUIREMENTS MAST-05 비고 — 브랜치가 main을 포함해 이제 넣을 수 있음(`.continue-here.md` 남은 일, `/gsd-quick`)
6. **N7** `.continue-here.md` · 05-01:156 P-4 설명 낡음
7. **N8** RESEARCH:368 버킷 이름 낡음
8. **N9** main에 04.6 VERIFICATION 없음 · STATE/ROADMAP 진행표가 04.6 미반영 — P-7 통과에는 영향 없음, 05가 고칠 일 아님
9. **N10** 새 헬퍼 `expectSheetDocumentLink` · 시트 `href`를 E2E에서 재사용 가능

## 확인했고 그대로인 전제 (조치 없음)

- 결재 엔진 · 도메인 · 인프라 · 운영 문서 · CLAUDE.md는 b41944d → fb277b08 diff 0 — Round 4 · 5 엔진 전제(E1~E4)와 인프라 · 문서 사실 그대로(code-drift-review-r6.md)
- 마이그레이션: main 마지막 0023 → Phase 5 넷(05-01 · 03 · 04 · 11)은 0024~0027. 플랜은 번호를 미리 적지 않음 — 그대로
- 중복 구현 없음
- 착수 게이트(HEAD 563d4550 실행): P-1~P-4 · P-6 · P-7 통과. P-5(VALIDATION draft) · P-8(표시 23줄) 미충족 → 이 라운드(P-8)와 validate-phase 5(P-5)가 채운다
- `git diff docs/design/tokens.css` 0줄 유지(새 토큰 0)

## Divergent Views

- 없음. Codex 후보 5건 중 4건은 05 범위 밖(04.6 화면 /projects 필터 — 04.6 결정 ②), 1건은 B6과 같은 결론.
