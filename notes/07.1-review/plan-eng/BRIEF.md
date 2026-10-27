# 07.1 /plan-eng-review 검토자 지시 (공통)

대상: main b9acdd8, `/home/user/ERP_PLANT8_260917/.planning/phases/07.1-carryover-followup/07.1-NN-PLAN.md` (맡은 플랜만).
읽기 전용. 저장소·.planning 파일을 고치지 않는다. git 명령은 읽기만.
보조 문서는 필요한 줄만 Grep→범위 Read: 07.1-CONTEXT.md(결정 D-71xx), 07.1-RESEARCH.md, 07.1-VALIDATION.md, 07.1-UI-SPEC.md.
이미 처리된 지적은 다시 내지 않는다: notes/07.1-review/plan-checker/plan-checker-report-r2.md, SUMMARY.md, notes/07.1-review/plan-design/final-check.md (훑기만).

## 할 일 (gstack /plan-eng-review 4개 절, 플랜마다)
1. Architecture: 경계·의존·데이터 흐름·보안(권한·행 범위·세션)·트랜잭션/잠금·새 경로마다 현실적 운영 실패 1개와 플랜의 대응.
2. Code quality: 플랜이 가리키는 기존 함수·파일·줄이 실제로 맞는지(현재 코드에서 인용), 재사용 가능한 기존 헬퍼를 놓쳤는지, 오류 처리·경계값 누락, 과한 복잡도.
3. Tests: 플랜의 각 코드 경로·분기·사용자 흐름에 시험이 계획돼 있는지. 기존 동작을 바꾸는 곳의 회귀 시험(CRITICAL). 시험 명령·파일 경로가 실제로 맞는지(package.json scripts, vitest/playwright 설정 확인). 간단한 ASCII 커버리지 도표(GAP 표시).
4. Performance: N+1·잠금 범위·큰 목록·인덱스.

## 근거 규칙 (필수)
- 지적마다 `[P1|P2|P3] (confidence: N/10) 파일:줄 — 설명` + 동기가 된 줄을 그대로 인용(플랜 줄과 코드 줄). 인용 못 하면 confidence 4~5.
- P1 = 실행하면 틀린 결과·데이터 손상·보안 구멍·시험이 거짓 통과·플랜대로 하면 실행 불가. P2 = 같은 브랜치에서 고쳐야 할 것. P3 = 참고.
- 각 지적에 「고칠 내용」(플랜의 어느 줄을 어떻게) 한두 줄. 사용자 제품 결정이 필요한 것은 「결정 필요」로 따로 표시하고 선택지 2~3개와 추천.
- 260907(옛 시스템) 대조는 이미 체커가 했으니 새로 하지 않는다.

## 출력
`notes/07.1-review/plan-eng/notes-<그룹>.md` 에 위 형식으로 쓰고(플랜별 절 + 실패 모드 표: 경로·실패·시험 있음?·오류 처리 있음?·사용자에게 보임/조용함), 최종 답은 15줄 이내 요약(P1/P2/P3 개수, P1 한 줄씩, 결정 필요 목록).
/mnt/project-files 는 네트워크 마운트: 파일을 쓴 뒤 10초쯤 뒤 다시 읽어 확인.
테스트를 돌릴 필요는 없다(DB 없음). 돌리면 출력은 파일로 저장하고 요약만.
