# 04.1 디자인 계획 검토 — 검토자 공통 지시

저장소: /home/user/ERP_PLANT8_260917 (브랜치 claude/phase-04.1-plan-1iqtwe, 커밋 d7372af). 파일은 수정하지 말 것 — 지정된 보고서 파일 하나만 쓴다.

## 대상
- `.planning/phases/04.1-approvals-leave/04.1-UI-SPEC.md` (정본 화면 계약 S1~S10, 개정 제안 A1~A4)
- 화면을 건드리는 플랜: `.planning/phases/04.1-approvals-leave/04.1-0[1-7]-PLAN.md` 중 UI 태스크(Grep으로 `src/app`, `components`, `ui/`, `tsx` 찾아 해당 범위만 Read)
- 기준: `docs/design/SYSTEM.md`(1074줄, 필요한 절만 range Read), `docs/design/tokens.css`, 실물 `docs/design/system/*.html`
- Phase 4 선행 개정(04.1은 따르기만 함): `git show origin/claude/gsd-progress-e1nzgu:docs/design/SYSTEM.md` 필요 절, `.../04-UI-SPEC.md` S16
- 참고: 엔지니어링 2회차 교차 메모 `docs/designs/phase04.1-eng-review2-260925/cross-notes-B.md`(UI-SPEC 문구 변경 근거), `fable-final-full.md`, 이전 결정 `docs/designs/plant8-erp-phase04.1-ceo-review-260924.md`, `.planning/phases/05-expense-approval-leave/05-CONTEXT.md`(D-96·D-97 등 사용자 결정)

## 무엇을 보는가 (gstack /plan-design-review 7패스)
1 정보 구조(무엇이 먼저 보이나) 2 상태(로딩·빈·오류·성공·부분·잠김) 3 사용자 여정 4 AI 슬롭·구체성(OPERATE 앱 규칙) 5 SYSTEM.md·토큰 정렬(새 색·서체·radius·화면 하나만 예외 금지) 6 반응형(1024·375)·접근성(키보드, aria, 44px 터치, 대비) 7 미결 결정.
각 패스 0~10점과 "10이 되려면".

**최우선 렌즈 — 화면 사용성 원칙(CLAUDE.md §7):** 각 화면 S1~S10에 대해
- "문구 없이 이해되는가": 설명문·도움말·자리표시 설명이 남았나. 문구는 오류·되돌릴 수 없는 일·잠김에만 한 줄, 무엇을 하면 되는지를 말하나. 빈 화면엔 설명 대신 첫 행동 버튼인가.
- "사용자가 하지 않아도 될 결정이 남았나": 알 수 있는 값(오늘 날짜, 내 팀, 최근 입력값, 결재선)을 기본값으로 채우나. 시스템이 계산할 것(일수·잔여 연차·상태 전환)을 묻지 않나. 할 수 없는 선택은 숨김·비활성인가. 확인 창 대신 되돌리기, 확인은 되돌릴 수 없는 일에만인가.
- 주 버튼 하나, 단계, 입력 형식(날짜 선택·검색 선택), 키보드 흐름, 색 배지, 위험 동작 분리.

## 금지
- 사용자가 이미 정한 결정(05-CONTEXT D-96·D-97, CEO 리뷰 결정, UI-SPEC에 "사용자 결정/확정"으로 적힌 것, Phase 4 개정 P0·Ctrl+·진행 바 없음 등)을 뒤집는 제안 금지. 충돌해 보이면 "사용자 결정과 충돌 — 참고"로만.
- 범위 넓히기 금지(새 기능 추가 제안 금지). 문구 줄이기·기본값·비활성·상태 누락 보완은 가능.
- 근거 없는 주장 금지: 모든 지적에 `파일:줄` 근거. 근거 없으면 "참고".

## 출력 (지정 파일에 한국어로)
1. 점수표(패스 1~6 처음 점수, 10이 되려면 한 줄)
2. 지적 목록: `ID | 등급(막음/경고/참고) | 화면 | 문제 | 근거 파일:줄 | 추천 고치기(옵션 A 추천, 대안 B) | 원칙(CLAUDE.md §7 어느 항목)`
   - 막음 = 실행하면 사용자가 헷갈리거나 틀린 선택이 가능하거나 SYSTEM.md 위반/화면 하나만 예외.
3. 패스 7 미결 결정 표(결정 필요 | 미루면 생기는 일)
4. 맨 끝에 한 줄 결론: `막는 문제 N · 경고 N · 참고 N`
토큰 절약: 필요한 범위만 Read, 500줄 넘는 파일은 range 필수. 도구 호출은 병렬로 묶어라.
