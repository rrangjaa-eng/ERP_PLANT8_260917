# 07 계획 디자인·Codex 검토 (2026-10-21 KST, 밤 위임 — 계획 파일·PR #257 수정 없음)

스킬: gstack /plan-design-review (Skill 도구 호출). 디자인 목업은 만들지 않음(DESIGN.md: 비교는 실제 앱 화면으로만).
대상 커밋: claude/project-thread-g0xvm8 (PR #257) — UI-SPEC SC-01~22, 플랜 07-01~25, CONTEXT.

## 결과 요약
- 막는 문제 43건 = 1차 대조 확인 34 + Fable 확정 7(N1·N2·N4·N7·N8·N9·N10) + 사용자 확인 필요 2(N3·N11, 추천안으로 진행). 그 밖에 eng 지적과 같은 막는 문제 22건(eng-review.md 쪽에서 반영).
- 참고 약 108건(대조 강등 포함, Fable 강등 N5·N6).
- 7패스 점수(Opus): 정보 구조 6 · 상태 7 · 여정 5 · AI 슬롭 8 · 디자인 시스템 5 · 반응형·접근성 6 · 미결 결정 5 → 평균 6.0/10.
- 계획 판단 7개(사용액=실행가 합 등): 7개 모두 유지 추천(내려받기 5,000은 2차 「파일 받기」 버튼으로, 거래처 권한 3줄은 일하는 자리 등록과 무관함·계좌 줄이 보기를 켜지 않음 명시).

## 사용자 확인 필요(아침 카드, 지금은 추천안으로 진행)
- N3 틀린 예산 교정 길: 추천 = 경영관리 직접 수정(사유 필수·이력 「직접 수정」), 원가율 첫 저장 확인 창 없음.
- N11 PO 감액 자동 반영: 추천 = 증액만 자동(결정 문구 그대로), 감액은 N3 직접 수정 길.

## 파일
- reconcile-sonnet.md — 전체 지적 합본·근거 대조(가·나·다), 재계획은 이것부터
- fable-verdicts.md — N1~N11 최종 판정·추천 수정·카드 문구
- claude-passes.md — Opus 7패스 검토
- codex/codex-A~G.md — Codex 적대적 검토(GPT-6.1 Sol, medium, codex exec 0.160.0 실제 실행 exit 0): A UI-SPEC·CONTEXT·매핑, B 플랜01-06, C 07-12, D 13-18, E 19-25, F 플랜 체커 지적 검증, G eng 지적 검증
- codex/script-uispec.md — scripts/codex-design-review.sh(4폭 CI=true 캡처 9경로 + DOM 실측 + Codex) 지적 후보 7건, 모두 시각 지적(DOM 실측 근거 없음)
