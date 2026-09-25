지정한 diff와 8라운드 지적 사항을 먼저 확인한 뒤, 변경된 부분과 연결된 설계 규칙만 읽어 검토하겠습니다.

[codex ran] /bin/bash -lc 'nl -ba .planning/phases/04.3-qr-certificate-intake/reviews/round3/codex-ui-r8.md'
[codex ran] /bin/bash -lc 'git diff 7243144 56aff06 -- .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md'
[codex ran] /bin/bash -lc "git status --short; rg --files -g '"'!agents/**'"' -g '"'!.claude/**'"' -g '"'!**/.agents/**'"' -g '"'!**/.claude/**'"' -g 'SYSTEM.md' -g 'tokens.css' -g 'DESIGN.md' -g '*button*' -g '*table*' -g '*status-tag*' -g '*shell*' ui docs src app components"
[codex ran] /bin/bash -lc 'git diff --unified=0 7243144 56aff06 -- .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md'
[codex ran] /bin/bash -lc "nl -ba docs/DESIGN.md | sed -n '75,125p'; rg -n '7-1|7-3|7-8|aria-live|포커스|알림|비활성|시트' docs/design/SYSTEM.md; rg --files ui/button ui/table ui/status-tag ui/shell"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '340,382p;395,418p;484,505p'"
행사 종료를 우선 처리하는 규칙과 재확인 실패 카피는 추가됐습니다. 다만 짧은 잠김으로 전환한 뒤 타이머가 끝나는 경우의 포커스, 정상 재확인과 실패 안내의 구분을 더 대조하고 있습니다.

[codex ran] /bin/bash -lc 'nl -ba ui/button/Button.tsx; nl -ba ui/table/RowSheet.tsx; nl -ba ui/shell/MoreSheet.tsx'
[codex ran] /bin/bash -lc "nl -ba docs/DESIGN.md | sed -n '75,112p'; nl -ba docs/design/SYSTEM.md | sed -n '657,674p;834,844p;1031,1040p'; nl -ba docs/design/tokens.css | sed -n '1,170p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '580,590p;606,620p;690,704p;815,839p'; git diff 56aff06 -- .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md"
[codex ran] /bin/bash -lc "nl -ba ui/table/Table.tsx | sed -n '245,322p'; nl -ba ui/status-tag/StatusTag.tsx; nl -ba ui/button/Button.module.css | sed -n '1,150p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '550,565p'"
검토 범위: `7243144 → 56aff06`의 UI-SPEC 변경분과 연결된 주변 계약. 파일 수정 없음.

**BLOCKER 0 · MAJOR 1 · MINOR 2**

라운드 8 재판정:

| 기존 지적 | 판정 | UI-SPEC 근거 |
|---|---|---|
| MAJOR #1 누적 잠김 중 행사 종료 처리 불가 | **RESOLVED** | [377행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:377): `closed{reason}`을 추가하고 잠금보다 우선해 E6-b로 전환한다. 개인별 제출 여부는 반환하지 않는다. |
| MAJOR #2 재확인 실패·상태 전환의 접근성 전달 누락 | **RESOLVED** | [196행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:196)·[377행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:377): 실패 문장을 2차 버튼에 연결하고, 수동 결과 및 짧은 잠김 전환의 포커스 목적지를 지정했다. 다만 이후 만료 단계에 아래 신규 문제가 생겼다. |
| MINOR #3 개정 기록의 카운트다운 재도입 | **RESOLVED** | [821행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:821): 해제 시각 표시·내부 복구 타이머로 정정했다. |
| MINOR #4 카피 표·스케치 누락 | **RESOLVED** | [196행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:196)·[336행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:336): 재확인 실패를 별도 상태로 추가하고 스케치에 「잠금 확인」을 명시했다. |
| MINOR #5 서명 판정 변경의 결정 기록 부족 | **RESOLVED** | [834행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:834): 기존 길이 기준을 대체하는 이유와 겹친 획을 한 번만 세는 의미 변경을 기록했다. |

변경분의 신규 문제:

1. **MAJOR — 새 짧은 잠김 전환 이후, 잠금이 풀려도 포커스가 빈 묶음에 남는다**

   변경된 [377행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:377)은 `shortLocked` 응답에서 **항상 존재하는** `<div tabindex="-1">`에 짧은 잠김 문장을 넣고 포커스를 옮긴다. 그런데 기존 [376행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:376)의 만료 처리는 문장을 지운 뒤 `activeElement === body`일 때만 입력으로 포커스를 돌린다.

   따라서 **누적 잠김 → 재확인으로 짧은 잠김 전환 → 기다림 → 만료**에서는 포커스가 비워진 묶음에 남는다. 묶음에는 `aria-live`도 없어 보조기술 사용자는 입력이 다시 열렸다는 전달을 받지 못한다. 새로 지정한 포커스 목적지를 기존 복귀 조건이 처리하지 못하는 회귀다. 관련 기준: [SYSTEM.md:1035](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:1035)·[1037행](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:1037).

   **수정:** 만료 시 포커스가 잠김 묶음 또는 제거될 내부 요소에 남아 있는 경우에도 입력으로 옮긴다. 사용자가 다른 요소로 이동한 경우는 유지한다.

2. **MINOR — UI Considerations가 정상 `hardLocked` 응답에도 실패 문장을 표시하도록 한다**

   변경된 [613행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:613)은 수동 응답이 **`hardLocked`·실패·결과 불명**이면 묶음으로 포커스를 옮기고 `확인 결과를 받지 못했습니다`를 세운다고 묶어 적었다. 정상적으로 잠김을 확인한 경우에도 통신 실패로 표시하는 계약이다.

   [196행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:196)·[377행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:377)처럼 포커스 이동 조건과 실패 문장 표시 조건을 분리해야 한다. 재시도가 정상 응답을 받으면 이전 실패 문장과 설명 연결을 지우는 시점도 명시해야 한다.

3. **MINOR — 1차 버튼의 설명 대상이 같은 본문 안에서 충돌한다**

   [195행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:195)과 변경된 [377행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:377) 후반은 `aria-describedby`를 **두 `<p>`의 id만**으로 제한하지만, 377행 앞부분에는 여전히 **“묶음 id를 받는다”**가 남아 있다. 앞부분대로 구현하면 재확인 버튼과 실패 문장까지 1차 버튼의 설명에 포함되어 이번 수정 목적이 사라진다.

   **수정:** 본문 앞부분도 두 `<p>` id로 통일한다.

VERDICT: FAIL

tokens used: 275336
EXIT 0
