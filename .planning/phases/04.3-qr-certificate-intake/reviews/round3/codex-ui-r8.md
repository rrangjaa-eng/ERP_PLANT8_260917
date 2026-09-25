지정한 diff와 라운드 7 지적 사항을 먼저 대조한 뒤, 변경된 구간과 연결되는 디자인 규칙·기존 UI 컴포넌트만 읽기 전용으로 확인하겠습니다.

[codex ran] /bin/bash -lc 'git diff ba6b3b6 7243144 -- .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md'
[codex ran] /bin/bash -lc "pwd; git status --short; rg --files -g AGENTS.md -g '"'!agents/**'"' -g '"'!**/.claude/**'"' -g '"'!**/.agents/**'"' -g '"'!**/node_modules/**'"' -g '"'!**/.git/**'"'; nl -ba .planning/phases/04.3-qr-certificate-intake/reviews/round3/codex-ui-r7.md; nl -ba .planning/phases/04.3-qr-certificate-intake/reviews/round3/ui-checker-r7.md"
[codex ran] /bin/bash -lc "git diff --unified=0 ba6b3b6 7243144 -- .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | rg '"'^@@'"'; git rev-parse HEAD; rg --files ui/button ui/table ui/status-tag ui/shell; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '285,410p'"
[codex ran] /bin/bash -lc "git diff 7243144 -- .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '478,499p;560,592p'"
[codex ran] /bin/bash -lc "nl -ba docs/DESIGN.md | sed -n '70,115p'; rg -n '7-1|7-3|7-8|10\\.|aria-live|フォ|포커스|알림|높이|2차|모달|시트' docs/design/SYSTEM.md"
라운드 7의 세 MAJOR를 수정한 문구는 확인했습니다. 다만 새 재확인 경로가 닫힌 행사와 포커스 이동을 어떻게 처리하는지 추가 대조가 필요합니다. 이번 diff에 포함된 서명 판정 변경도 검토 범위에 넣겠습니다.

[codex ran] /bin/bash -lc 'nl -ba ui/button/Button.tsx; nl -ba ui/button/Button.module.css; nl -ba ui/table/RowSheet.tsx; nl -ba ui/shell/MoreSheet.tsx'
[codex ran] /bin/bash -lc "nl -ba docs/DESIGN.md | sed -n '75,110p'; nl -ba docs/design/SYSTEM.md | sed -n '660,691p;774,787p;1003,1016p;1031,1044p'; nl -ba docs/design/tokens.css | sed -n '1,157p'; nl -ba ui/status-tag/StatusTag.tsx; nl -ba ui/table/Table.tsx | sed -n '235,321p'"
[codex ran] /bin/bash -lc "git diff --unified=0 ba6b3b6 7243144 -- .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '/@@ -396/,/@@ -695/p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '45,78p;116,145p;187,199p;246,263p;584,592p;810,824p'; rg --files domain/certs; nl -ba docs/design/tokens.css | sed -n '157,171p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '105,116p;193,197p;374,375p;606,617p;693,697p'; nl -ba docs/design/SYSTEM.md | sed -n '247,263p'"
새 재확인 응답에서 행사 닫힘을 제외해, 누적 잠김 상태로 행사가 종료되면 「잠금 확인」을 눌러도 종료 화면에 도달할 수 없습니다. 또 새 버튼의 실패 안내와 짧은 잠김 전환에 낭독·포커스 규칙이 빠져 있습니다. 기존 지적의 해결 여부와 이 신규 문제를 분리해 정리하겠습니다.

검토 범위: `ba6b3b6 → 7243144`의 UI-SPEC 변경분과 연결된 주변 계약. 파일 수정 없음.

**BLOCKER 0 · MAJOR 2 · MINOR 3**

라운드 7 재판정:

| 지적 | 판정 | UI-SPEC 근거 |
|---|---|---|
| MAJOR #1 확인 전 제출 여부 노출 | **RESOLVED** | [376행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:376): 잠금 전용 조회로 변경하고 제출 여부 반환을 금지했다. |
| MAJOR #2 수동 복구·재시도 경로 없음 | **RESOLVED** | [195행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:195)·[612행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:612): 「잠금 확인」과 실패 후 재시도를 명시했다. |
| MAJOR #3 새 짧은 잠김을 누적 잠김으로 표시 | **RESOLVED** | [376행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:376): `shortLocked`에서 해제 시각·남은 초를 받아 짧은 잠김으로 전환한다. |
| FLAG D1 닫힌 행사의 「잠금 풀기 필요」 | **RESOLVED** | [243행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:243)·[491행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:491): 닫히면 `미제출`만 표시한다. |
| FLAG D2 포커스·live 중복 낭독 | **RESOLVED** | [376행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:376)·[612행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:612): 진입 시 포커스 이동을 유지하고 묶음의 `aria-live`를 제거했다. |
| FLAG #3 개정 기록의 옛 문구 | **RESOLVED** | [695행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:695): 후속 개정 우선과 Copywriting 표의 정본 지위를 명시했다. |

변경분의 신규 문제:

1. **MAJOR — 누적 잠김 중 행사 종료를 재확인 경로에서 처리할 수 없다**

   변경된 [376행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:376)은 응답을 `hardLocked / shortLocked / open`으로 한정하고, **닫힘 여부도 입력이 살아난 뒤 `verifyLast4`에서만** 드러내도록 한다. 그러나 [493행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:493)은 닫힌 행사에서 담당자의 잠금 해제를 금지한다.

   따라서 **누적 잠김 → 행사 종료 → 「잠금 확인」**에서는 입력을 살릴 수도, E6-b로 전환할 수도 없다. 계속 담당자에게 전화하라는 화면을 보이지만 담당자는 풀 수 없다. 이는 [409행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:409)의 공개된 링크 종료 처리와도 어긋난다. 개인별 제출 여부와 링크 전체 종료 여부를 함께 차단한 결과다.

   **수정:** 재확인에도 링크 단위 `closed{reason}`을 허용하고 잠금보다 우선해 E6-b로 전환한다. 개인별 제출 여부 비공개는 유지한다.

2. **MAJOR — 새 「잠금 확인」의 실패·상태 전환에 접근성 전달 경로가 없다**

   [376행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:376)·[612행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:612)은 수동 재확인 실패를 버튼 아래에 표시하지만, **그 2차 버튼의 `aria-describedby`, 결과 낭독, 오류로의 포커스 이동을 정하지 않았다.** 묶음의 `aria-live`는 제거됐고 설명 연결은 비활성 1차 버튼에만 있다.

   또한 `shortLocked`로 전환하면 누적 잠김 묶음 안의 재확인 버튼이 사라지는데, 새 포커스 목적지가 없다. 입력·1차도 비활성이므로 사용자는 포커스를 잃는다. [375행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:375)의 복귀 규칙은 **짧은 잠김이 끝날 때**만 작동한다. 관련 기준은 [SYSTEM.md:1035](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:1035)의 결과·이유 전달 계약이다.

   **수정:** 수동 실패 문장을 2차 버튼에 연결하고 한 번 알리는 방법을 정한다. 짧은 잠김으로 전환할 때도 상태 문장 등 유효한 포커스 목적지를 지정한다. 자동 조회와 사용자 요청의 알림 정책을 분리한다.

3. **MINOR — 새 개정 기록이 카운트다운을 다시 도입한다**

   [820행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:820)은 짧은 잠김 화면을 “해제 시각·카운트다운”으로 설명한다. [374행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:374)은 카운트다운 표시를 명시적으로 금지한다. “해제 시각 표시·내부 복구 타이머”로 정정해야 한다.

4. **MINOR — 새 재확인 상태가 카피 표·스케치에 완전히 반영되지 않았다**

   [195행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:195)에 버튼을 추가했지만, [335행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:335)의 스케치는 여전히 “두 줄 알림 묶음”만 표시한다. 재확인 실패는 본문·UI Considerations에만 있고, 카피 표 [196행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:196)은 `verifyLast4` 실패와 **1차 활성화**만 설명한다. 재확인 실패에서는 1차가 계속 비활성이므로 별도 상태 행이 필요하다.

5. **MINOR — 서명 변경은 기존 승인 판정의 동등한 치환이 아니다**

   [396행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:396)·[822행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:822)은 획 길이 합 24를 PNG 잉크 면적 288로 바꾼다. 같은 자리를 반복해서 그으면 길이는 늘지만 점유 픽셀은 거의 늘지 않으므로, 이전에 인정되던 서명이 거부될 수 있다. 기존 승인 결정을 다시 연 변경임을 명시하고, 겹친 획의 인정 기준과 변경 이유를 결정 기록에 남겨야 한다.

VERDICT: FAIL

tokens used: 373199
EXIT 0
