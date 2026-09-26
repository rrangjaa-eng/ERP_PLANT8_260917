지정한 diff와 5차 지적 사항을 대조한 뒤, 변경 구간과 연결된 설계 규칙만 읽어 검토하겠습니다. 파일은 수정하지 않겠습니다.

5차에서 지적한 모바일 포커스 복귀와 수령자 복구 안내는 새 문구에 반영되어 있습니다. 추가 검토에서는 해제 재전송이 성공한 뒤 현재 잠금 상태를 어떻게 표시하는지, 새 행동 버튼의 Tab 규칙이 기존 편집 표 규칙과 맞는지 확인하고 있습니다.

검토 범위: `bbe62d1 → 39508ba` 변경분과 해당 구간의 주변 계약. 파일 수정 없음.

**BLOCKER 0 · MAJOR 2 · MINOR 2**

5차 지적 재판정:

| 5차 지적 | 판정 | 현 UI-SPEC 근거 |
|---|---|---|
| MAJOR #1 해제 결과 불명·멱등 재전송 누락 | **PARTIAL** | [493행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:493)에 잠금 표시별 재전송·중복 로그 방지·새 틀림 보존을 추가했다. 그러나 재전송 성공 후 현재 상태 표시가 충돌한다. 아래 MAJOR #1. |
| MAJOR #2 모바일 취소 포커스 대상 소멸 | **RESOLVED** | [499행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:499): RowSheet 닫힘 → 확인 시트 열림 → 취소·Esc·성공 모두 원래 행으로 복귀. |
| MAJOR #3 누적 잠김 진입 포커스·낭독 누락 | **RESOLVED** | [376행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:376): 상시 존재하는 `aria-live="polite"` 묶음, `tabindex="-1"`, 모든 진입 경로의 포커스 이동을 명시했다. |
| MAJOR #4 담당자 해제 후 수령자 복귀 안내 누락 | **RESOLVED** | [195행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:195)에 이름 재선택 안내를 추가했다. 스케치 335행·UI Considerations 612행에도 반영했다. |
| MINOR #5 누적 잔여량 노출 | **RESOLVED** | [193행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:193): `{n}`을 짧은 잠김 잔여량으로만 제한했다. 다만 새 설명의 경계 정렬 주장은 아래 MINOR #1. |
| MINOR #6 고정 20회를 설정으로 확대 | **RESOLVED** | [376행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:376): 서버 고정 상수 20, 새 설정 없음으로 변경했다. |

변경분에서 발견한 문제:

1. **MAJOR — 과거 해제의 재전송 성공이 현재 잠김을 화면에서 지운다**

   [UI-SPEC:493](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:493)은 이전 잠금 표시의 재전송에는 같은 성공을 반환하고 이후 틀림은 보존하도록 정했다. 동시에 성공하면 무조건 `미제출`로 표시하고 「잠금 풀기」를 없앤다. [613행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:613)도 같은 규칙이다.

   해제 완료 → 응답 유실 → 다시 오답이 쌓여 새 잠김 발생 → 직원이 이전 요청 재전송 순서라면, 서버는 새 잠김을 유지하지만 I3는 잠김 표시를 지운다. 새 누적 잠김이면 필요한 해제 버튼까지 사라진다. 재전송 사이에 제출된 경우에도 `미제출`로 되돌리는 문제가 생긴다.

   **요청의 과거 성공과 현재 행 상태를 분리해야 한다.** 재전송 성공에도 현재 제출·잠금 상태와 잠금 표시를 받아 표시하고, 새 누적 잠김에는 새 해제 행동을 제공하도록 본문·UI Considerations를 맞춰야 한다.

2. **MAJOR — 새 Tab 규칙이 기존 편집 표의 단일 탭 정지 계약과 조정되지 않았다**

   [UI-SPEC:493](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:493)은 행동 버튼에 Tab으로 도달하는 규칙을 화면에서 새로 정한다. [797행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:797)은 §7-3 인용을 삭제했다고 명시한다. 그러나 I3는 485행에서 여전히 §7-3 편집 표를 사용한다.

   [SYSTEM.md:781](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:781)은 표 전체 탭 정지 하나와 방향키 로빙을 요구한다. 기존 [Table.tsx:280](/home/user/ERP_PLANT8_260917/ui/table/Table.tsx:280)도 활성 셀만 `tabIndex=0`으로 만든다. 여기에 행마다 일반 Tab 대상 버튼을 추가하면 탭 정지가 늘어난다. 반대로 버튼을 탭 순서에서 빼면 새 계약의 도달 경로가 성립하지 않는다.

   행동 셀의 진입·실행·이탈·복귀를 공통 grid 규칙 안에서 정해야 한다. 별도 규칙을 채택한다면 [DESIGN.md:92](/home/user/ERP_PLANT8_260917/docs/DESIGN.md:92)에 따라 SYSTEM 개정 목록과 결정 근거가 필요하다. 현재 수정은 기존 키보드 결정을 화면 단위로 다시 열었다.

3. **MINOR — “누적 잠김은 항상 짧은 잠김 경계”라는 새 설명이 설정 계약과 충돌한다**

   [UI-SPEC:193](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:193)·792행은 `20 = 5 × 4`를 일반 규칙처럼 적었다. 하지만 194·374행에서 5는 설정 기본값이고, 변경된 376행도 다른 값이면 경계가 어긋남을 인정한다.

   예를 들어 짧은 한도가 6이면 누적 19회에서 `남은 횟수 5번`을 보여 준 다음 한 번의 오답으로 누적 잠김에 들어간다. 누적 잔여량을 다시 노출할 필요는 없다. 경계 일치 설명을 기본값에만 한정하고, 공개 카피의 “남은 횟수”가 짧은 잠김 기준임을 분명히 해야 한다.

4. **MINOR — 새 알림 묶음 방식이 Button의 개발 경고 조건과 충돌한다**

   [UI-SPEC:195](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:195)·376행은 비활성 Button에 `disabledReason`을 주지 않고 외부 묶음을 `aria-describedby`로 연결한다. 기존 [Button.tsx:34](/home/user/ERP_PLANT8_260917/ui/button/Button.tsx:34)는 이 사용을 매번 “이유 없는 비활성 버튼”으로 경고한다. 개정 ⑦(586행)에는 해당 검사 변경이 없다.

   외부 설명을 연결한 사용도 검사에서 인정하도록 Button 개정 범위를 보완해야 한다.

VERDICT: FAIL

tokens used: 499847
EXIT 0
