# Phase 5 — `/plan-design-review` Round 6 (화면 재대조 라운드)

- 일시: 2026-10-04 (UTC) · 브랜치 `claude/phase-05-execute-pxok9w` @ 33fefee8 · PR #162 · 기준 main fb277b08(04.6 머지)
- 대상: `05-UI-SPEC.md`(04.6 머지 판 개정, gsd-ui-checker VERIFIED) + 화면 플랜 05-05~11 · 05-15 · 05-02(SYSTEM 개정)
- 밤 위임: 사용자 질문 없음. 판정 a(이미 정해진 결정 · SYSTEM 규칙 옮겨 적기)는 추천안으로 `/gsd-plan-phase 5 --reviews` Round 6에 넣고, 판정 b(새 화면 결정)는 코디네이터에 올려 사용자 확인을 기다린다.
- 시안(mockup): 만들지 않음 — 정본(SYSTEM.md · tokens.css)이 있고 CLAUDE.md §6이 새 시각 언어 · 육안 판정을 금하며 비교 보드를 볼 사용자가 없다(Round 3과 같은 사유).

## 교차 검토 증거

| 목소리 | 결과 | 증거 경로 |
|---|---|---|
| Codex(GPT-6.1 Sol · medium, `scripts/codex-design-review.sh --plan 05-UI-SPEC.md`) + 4폭 캡처(375·320·768·1280, CI=true 빌드) | 완료(exit 0) · 후보 5건 → DOM 실측 판정: 결함 0 · 계획 지적 유효 1(진행 바 = B6) · 05 범위 밖 4 | `design-review-r6-codex.md` · `test-results/codex-design-review/20261004-041735-30115/`(스크린샷 · measurements.json · codex-output.md, 커밋 안 함) · 캡처 경로 /projects · /approvals · /expenses |
| Opus 독립 디자인 검토(7 패스) | 7/10(지난 6) · P1 2 · P2 4 · P3 5 | `design-review-r6-opus.md` |

## 결론

| 항목 | 값 |
|---|---|
| 전체 점수 | 7/10 (IA 8 · 상태 8 · 여정 8 · AI 슬롭 9 · 디자인 시스템 7 · 반응형/접근성 8) |
| 막는 문제(P1) | R6-01 상태 낱말 4개 `status-map.ts` 추가 플랜 없음(typecheck 실패) · R6-02 플랜 8개가 UI-SPEC보다 뒤처짐(이름 + 동작) |
| 반영 권장(P2) | R6-03 무효 대화 오류 자리 · R6-04 골라내기 시트 85vh → `--sheet-max-h` · R6-05 B4 문장(문서 만들고 여는 행 행동) · R6-06 `/expenses/new` 첫 포커스(b) |
| 사소한 것(P3) | R6-07~11 |
| Codex 유효 지적 | B6(진행 바 SYSTEM ↔ C-10 불일치) — 05-02 SYSTEM 개정에 이미 있음, 유지 |
| 반영 경로 | 판정 a 전부 → `/gsd-plan-phase 5 --reviews` Round 6(UI-SPEC과 플랜 함께) |

## GSTACK REVIEW REPORT

| Run | Status | Findings |
|---|---|---|
| Codex 디자인 검토 + 4폭 캡처 | completed | 5 후보 → 유효 1(B6, 기존 제안) |
| Opus 독립 검토 | completed | P1 2 · P2 4 · P3 5 |

VERDICT: 반영 필요 — P1 2건은 Round 6 계획 수정으로 해소, 실행 전 재검증(validate-phase 5)
OUTSIDE COVERAGE: Codex completed
CROSS-MODEL: B6 진행 바 불일치는 두 목소리가 같은 결론(SYSTEM 개정 대상)

**UNRESOLVED DECISIONS:**
- U2 폰 행 시트 문서 행동 위계 — 추천: 3차(기존 action 자리) 유지, 320×568 실측에서 흔한 행이 접힘 아래로 가면 뒤집음
- R6-06 `/expenses/new` 첫 포커스 — 추천: 첫 저장 전에는 `견적 줄 고르기`
- R6-08 내 초안이 있는 줄의 셀 글자 — 추천: 그대로(같은 초안을 연다)
