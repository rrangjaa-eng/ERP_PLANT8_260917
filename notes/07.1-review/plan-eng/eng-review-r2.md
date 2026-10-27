# 07.1 /plan-eng-review 2회차(마지막, CLAUDE.md:81) — PR #301 head 41a5fe2

검토: Opus 2(그룹 A+B → r2-AB.md, C+D+웨이브 → r2-CD.md). Codex 없음(codex_reviews=disabled, eng 검토 Codex 금지).

## 1회차 지적 반영
- P1 13/13 해결.
- P2 53: 해결 52 · 부분 1(E-P2-03 07.1-01 — 판정 재료는 맞음, 픽스처가 만들 수 없음 → N-P2-A) · 미해결 0.
- 결정 D-E1~E7 · C-1 모두 사용자 답(decisions.md)대로 반영.
- 웨이브(07→1, 09·02→2, 14는 09 뒤): 같은 웨이브 files_modified 겹침 0, depends_on 누락 0(19개 frontmatter 스크립트 대조).

## 새 지적 (재계획으로 바뀐 부분)
- P1 0
- **N-P2-A** (9/10) 07.1-01:375 · :382 — E2E 픽스처 「번호 없는 구매 요청」은 만들 수 없다: `db/schema/purchase-requests.ts:15` `number: text("number").notNull()`. 번호가 null일 수 있는 주인은 카드 사용뿐(`db/schema/corp-card-usages.ts:42` `number: text("number")`). → 픽스처를 「번호가 null인 카드 사용에 붙은 확인 필요 줄」로. (본체가 스키마 직접 확인)
- **N-P2-B** (6/10) 07.1-14:58 · :155 · :203 — 미래 발령으로 본부 칸을 비운 뒤 관리자가 본부를 다시 넣을 수 있고 플랜 문구가 이 길을 권한다 → 팀 기간이 끝나면 옛 본부 공개 증빙이 다시 보임(CG-04 재발). → `setPersonDivision`이 미래 발령도 조회해 있으면 거부, 화면 칸도 숨김. D-E2 범위 안 — 새 사용자 결정 불필요.
- P3 4(18 말줄임 여러 칸 폭 배분 미확인 · 18 secondaryText 중복 글자로 고칠 기존 시험 전수 검색 한 줄 · 02 폰 시트 거래처 53건 정리 안 함 · 05 행동 로그 5,000+행 화면 두 번 렌더 CI 시간) — r2-CD.md.

## 판정
P1 0. 남은 P2 2건은 플랜 문구 수정이라 재검토 없이 #301 머지 전에 재계획 스레드가 반영(반영 확인은 플랜 체커/diff로). 이 조건으로 eng 게이트 통과 — phase-07.1.log `plan-eng-review` 줄(#300) 머지 가능. #300은 #301과 함께(또는 뒤에) 머지.

## 참고 (디자인 통과 영향)
D-E7로 07.1-18 한 줄 말줄임 대상에 「행 링크 표」(프로젝트·연차·지급 대상·지급 완료·발급 요청·일정)가 더해졌다. 디자인 최종 통과(plan-design/final/final-check.md)와 Codex 계획 검토는 이 표들을 보지 않았다. 사용자 결정(U-1 「모든 표」 · D-E7)과 같은 방향이라 막는 문제는 아니지만, 실행 때 /design-review(Codex·4폭 캡처)에서 이 표들을 반드시 포함해야 한다.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | CLEAR (조건: N-P2-A·B를 #301에 반영) | 2회차: 새 P1 0 · P2 2 · P3 4, 1회차 P1 13/13 해결 |
| Outside Review | codex (disabled) | Independent 2nd opinion | 0 | disabled | — |
| Design Review | `/plan-design-review` | UI/UX gaps | (이전) | CLEAR(final-check.md) — D-E7 추가 표는 실행 때 /design-review로 | — |

- **OUTSIDE COVERAGE:** codex · plan-review · disabled(codex_reviews=disabled, 규칙상 eng 검토 Codex 금지)
- **VERDICT:** ENG CLEARED — P1 0, 남은 P2 2건은 #301 머지 전 플랜 문구 수정

NO UNRESOLVED DECISIONS
