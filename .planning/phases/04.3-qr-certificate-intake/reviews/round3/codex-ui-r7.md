지정한 diff와 6차 지적을 확인하고, 변경된 부분과 맞닿은 상태·접근성·권한 규칙만 검토하겠습니다. 금지한 경로는 읽지 않겠습니다.

[codex ran] /bin/bash -lc 'cat .planning/phases/04.3-qr-certificate-intake/reviews/round3/codex-ui-r6.md'
[codex ran] /bin/bash -lc 'git diff 39508ba ba6b3b6 -- .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md'
[codex ran] /bin/bash -lc "rg --files -g 'AGENTS.md' -g '"'!agents/**'"' -g '"'!.claude/**'"' -g '"'!**/.agents/**'"' -g '*button*' -g '*table*' -g '*status-tag*' -g '*shell*' -g 'SYSTEM.md' -g 'tokens.css' -g 'DESIGN.md'"
[codex ran] /bin/bash -lc 'git status --short'
[codex ran] /bin/bash -lc 'rg --files ui/button ui/table ui/status-tag ui/shell'
[codex ran] /bin/bash -lc 'git diff --unified=3 39508ba ba6b3b6 -- .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md'
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '345,381p;478,510p;568,595p'"
6차 지적의 수정 내용을 확인했습니다. 새로 추가된 E3 자동 재조회에는 전화번호 확인 전 제출 여부를 보여 주는 경로가 있어, 기존 공개 범위 규칙과 대조하고 있습니다. 복구 안내를 없앤 뒤에도 해제 후 진행할 수 있는지도 확인하겠습니다.

[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '482,493p'"
[codex ran] /bin/bash -lc "nl -ba docs/DESIGN.md | sed -n '70,110p'
nl -ba docs/design/SYSTEM.md | sed -n '680,795p;1180,1240p'"
[codex ran] /bin/bash -lc "nl -ba ui/button/Button.tsx
nl -ba ui/table/use-grid-keyboard.ts | sed -n '1,230p'
nl -ba ui/table/Table.tsx | sed -n '200,320p'"
[codex ran] /bin/bash -lc "nl -ba ui/table/RowSheet.tsx
nl -ba ui/shell/MoreSheet.tsx
nl -ba ui/status-tag/StatusTag.tsx
nl -ba docs/design/tokens.css | sed -n '1,160p'
rg -n '7-8|10\\.|포커스|aria-live|오류.*행동' docs/design/SYSTEM.md"
[codex ran] /bin/bash -lc "git diff --unified=0 39508ba ba6b3b6 -- .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '/@@ -490/,/@@ -609/p'"
[codex ran] /bin/bash -lc "git diff --unified=0 39508ba ba6b3b6 -- .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | rg '"'^@@'"'
nl -ba docs/design/tokens.css | sed -n '1,147p'
nl -ba ui/status-tag/StatusTag.tsx
nl -ba docs/design/SYSTEM.md | sed -n '834,844p;1005,1017p;1031,1042p'
nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '401,413p;556,567p'"
새 자동 재조회에서 세 가지 문제가 확인됐습니다. 확인 전 제출 여부가 드러나고, 화면을 계속 보고 있거나 재조회가 실패하면 해제 후 복구 동작이 없으며, 해제 뒤 새로 생긴 짧은 잠김도 기존 누적 잠김으로 계속 표시합니다. 각 문제의 변경 행과 기존 계약 근거를 정리하겠습니다.

[codex ran] /bin/bash -lc "git diff ba6b3b6 -- .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md
nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '193,196p;612,613p;802,809p'
nl -ba docs/design/SYSTEM.md | sed -n '1008,1014p'
nl -ba ui/table/RowSheet.tsx | sed -n '54,85p'"
검토 범위: `39508ba → ba6b3b6` 변경분과 연결된 주변 계약. 파일 수정 없음.

**BLOCKER 0 · MAJOR 3 · MINOR 0**

6차 지적 재판정:

| 6차 지적 | 판정 | UI-SPEC 근거 |
|---|---|---|
| MAJOR #1 과거 해제 재전송이 현재 상태를 지움 | **RESOLVED** | [493행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:493): 첫 성공·재전송 모두 현재 제출·잠금 상태를 반환하고, 새 누적 잠김의 해제 버튼을 유지한다. |
| MAJOR #2 행동 버튼 Tab 규칙 충돌 | **RESOLVED** | [493행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:493)·[591행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:591): 로빙 셀에서 실행·포커스 복귀, 내부 버튼 `tabindex="-1"`, 공통 SYSTEM·Table 개정을 명시했다. |
| MINOR #1 항상 짧은 잠김 경계라는 주장 | **RESOLVED** | [193행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:193)·[376행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:376): 설정과 무관하게 누적 20회에서 즉시 잠그도록 정했다. |
| MINOR #2 Button 개발 경고와 충돌 | **RESOLVED** | [586행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:586): 호출부 `aria-describedby`도 비활성 이유로 인정하도록 경고 조건을 개정한다. |

변경분의 신규 문제:

1. **MAJOR — 자동 재조회가 전화번호 확인 전 제출 여부를 공개한다**

   새 [376행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:376)은 누적 잠김 화면에서 `selectWinner`로 재조회하고, “제출됐으면 E6-a”로 이동시킨다. 그러나 [356행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:356)·[409행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:409)은 **전화번호 확인을 통과한 뒤에만 E6-a를 허용**한다.

   누적 잠김 화면을 가진 미확인 방문자가, 담당자 해제 후 실제 수령자가 제출한 시점에 화면으로 돌아오면 제출 여부를 알게 된다. 이전 승인된 공개 범위 결정을 다시 연 것이다.

   **수정:** 자동 재조회에서도 미확인 사용자에게 제출 여부를 반환하지 않는다. E6-a는 기존 `verifyLast4` 통과 경로에 유지한다.

2. **MAJOR — 복구 안내를 삭제했지만 자동 복구가 실행되지 않는 경로가 남는다**

   [195행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:195)은 해제 후 이름 재선택 안내를 삭제했다. 대체 동작인 [376행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:376)은 `visibilitychange`·`pageshow`에만 재조회하며, 실패·결과 불명이면 조용히 그대로 둔다.

   화면을 켜 둔 채 현장 담당자에게 해제를 요청하거나, 전화에서 돌아온 최초 재조회가 실패하면 서버는 풀렸어도 입력은 계속 비활성이다. 「다른 이름 고르기」는 남지만, 같은 사람의 잠금 상태를 다시 확인하는 행동이라는 의미가 사라졌다. 6차에서 해결됐던 수령자 복구 안내를 다시 누락시켰다. [SYSTEM.md:1013](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:1013)의 “다음 한 수를 버튼으로 보인다”에도 맞지 않는다.

   **수정:** 자동 재조회와 별개로 명시적인 잠금 상태 재확인 행동을 제공하거나 기존 복구 안내를 유지한다. 실패 후 재시도 경로도 카피 표·UI Considerations에 반영한다.

3. **MAJOR — 재조회에서 새 짧은 잠김을 누적 잠김으로 계속 표시한다**

   새 [376행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:376)은 재조회 결과가 “아직 잠겼으면 아무것도 바꾸지 않는다”고 정한다. **누적 잠김 → 담당자 해제 → 새 오답으로 짧은 잠김 → 수령자 화면 복귀** 경로를 구분하지 않는다.

   이 경우 화면은 담당자 문의가 필요한 누적 잠김으로 남고, 짧은 잠김의 해제 시각과 복구 타이머가 설정되지 않는다. 이는 [374행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:374)·[375행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:375)의 짧은 잠김 표시·자동 복구 계약과 충돌한다.

   **수정:** 재조회 결과를 잠금 종류별로 분기한다. 짧은 잠김이면 서버 해제 시각·남은 초를 받아 해당 상태로 전환하고, 누적 잠김이 유지될 때만 화면과 낭독을 그대로 둔다.

VERDICT: FAIL

tokens used: 505645
EXIT 0
