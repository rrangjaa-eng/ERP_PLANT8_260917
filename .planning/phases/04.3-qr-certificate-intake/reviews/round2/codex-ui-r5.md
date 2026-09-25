지정한 diff와 변경 구간의 주변 문맥을 먼저 확인한 뒤, 잠금·재시도·접근성·권한 규칙을 기존 디자인 기준 및 UI 컴포넌트와 대조하겠습니다. 파일은 수정하지 않겠습니다.
누적 잠김의 우선순위와 해제 조건은 명시되어 있습니다. 현재는 해제 요청의 응답이 끊긴 뒤 재시도하는 경우와, 모바일 확인 시트를 취소할 때의 포커스 복귀 규칙을 대조하고 있습니다.
모바일 취소 경로는 이미 닫힌 RowSheet 안의 버튼으로 포커스를 돌리도록 적혀 있습니다. 또한 I3 해제 요청에는 E3·E4의 결과 불명·멱등 규칙이 적용되지 않습니다. 새 누적 잠김에서 생기는 이 두 경로와 수령자의 해제 후 복귀 안내를 중심으로 지적을 정리하겠습니다.
검토 범위: `d138427 → bbe62d1`의 변경분과 관련 문맥. 파일 수정 없음.

BLOCKER: 없음. MAJOR: 4건. MINOR: 2건.

1. **MAJOR — 「잠금 풀기」의 결과 불명·재전송 계약 누락**

   [UI-SPEC 492행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:492)은 실패를 `풀지 못했습니다 · 다시 시도`로만 처리합니다. 기존 멱등 규칙은 [345–350행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:345)의 E3·E4에만 적용됩니다.

   서버가 해제·로그 기록을 마친 뒤 응답이 유실되면, 재시도가 새로 쌓인 틀림 횟수까지 다시 지우거나 이미 해제된 줄을 실패로 처리할 수 있습니다. 해제 요청의 결과 불명 상태와 동일 요청 재전송 규칙을 추가해야 합니다. 재전송으로 새 잠금까지 해제하거나 로그를 중복 기록하지 않도록 대상 잠금 버전과 성공 결과의 재사용도 명시해야 합니다.

2. **MAJOR — 모바일 확인 시트 취소의 포커스 복귀 대상이 사라짐**

   [UI-SPEC 492행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:492)은 취소·Esc 후 누른 「잠금 풀기」로 복귀하도록 하지만, [498행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:498)은 그 버튼이 있는 RowSheet를 먼저 닫습니다. 성공의 행 복귀만 별도로 정의되어 있습니다.

   닫힌 시트 안 버튼에는 포커스를 돌릴 수 없습니다. 이는 [SYSTEM.md 843행](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:843)의 복귀 계약과 충돌합니다. 기존 [RowSheet.tsx 42–44행](/home/user/ERP_PLANT8_260917/ui/table/RowSheet.tsx:42)도 닫힐 때 자체 복귀를 실행합니다. 취소 시 RowSheet를 다시 열어 버튼에 복귀하거나, 원래 행으로 복귀하도록 정하고 두 시트의 포커스 처리 순서를 명시해야 합니다.

3. **MAJOR — 새 누적 잠김 진입에 유효한 포커스·상태 전달 경로가 없음**

   [UI-SPEC 375행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:375)은 입력과 1차를 비활성화하면서 포커스를 “짧은 잠김 진입과 같다”고만 정합니다. 그러나 [352행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:352)의 E2→E3 대상은 바로 그 비활성 입력입니다. 누적 잠김 설명은 비활성 버튼의 `aria-describedby`에만 연결되어 있습니다.

   따라서 이미 누적 잠긴 이름을 고르거나 마지막 오답으로 진입할 때 포커스 이동과 새 상태 낭독이 보장되지 않습니다. 짧은 잠김과 달리 자동 복귀도 없습니다. 누적 잠김 설명 블록에 `tabindex="-1"`로 포커스를 주는 등 명시적인 진입 규칙이 필요합니다. 근거: [SYSTEM.md 1035–1037행](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:1035), 네이티브 비활성 처리 [Button.tsx 46행](/home/user/ERP_PLANT8_260917/ui/button/Button.tsx:46).

4. **MAJOR — 담당자가 풀어도 수령자 화면은 계속 잠겨 있는데 복귀 안내가 없음**

   [UI-SPEC 375행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:375)은 해제 후 같은 이름 재선택 또는 새로 고침을 요구합니다. 하지만 실제 [카피 195행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:195)은 전화하라는 안내뿐이며, 살아 있는 행동은 「다른 이름 고르기」입니다.

   사용자가 전화로 해제 완료를 확인하고 돌아와도 입력은 계속 비활성입니다. 「잠금 상태 다시 확인」 같은 행동이나 “담당자가 잠금을 푼 뒤 이름을 다시 골라 주세요”라는 복귀 안내를 카피·스케치·UI Considerations에 반영해야 합니다. [SYSTEM.md 1046행](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:1046)의 막힘 이후 다음 행동 계약에 해당합니다.

5. **MINOR — 남은 횟수 계산이 누적 잔여량을 노출할 수 있음**

   [UI-SPEC 193행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:193)은 두 잠금 중 먼저 닿는 잔여량을 공개합니다. 설정 가능한 두 한도가 정렬되지 않으면 누적 잠금까지 남은 횟수가 드러납니다. 이는 [195행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:195)의 “짧은 잠김이 이미 보이는 것 밖의 숫자를 주지 않는다”와 맞지 않습니다. 기존 남은 횟수 표시 승인과 별개로, 새 계산의 공개 범위를 명시해야 합니다.

6. **MINOR — ‘20회’ 결정이 ‘기본 20회인 새 설정’으로 확대됨**

   [UI-SPEC 375행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:375)은 한도를 설정 가능하게 만들지만, 설정 변경이 이미 누적된 횟수·잠긴 줄에 미치는 영향은 없습니다. 요청된 고정 20회를 유지하거나, 설정 가능 결정의 근거와 기존 잠금 적용 규칙을 추가해야 합니다.

VERDICT: FAIL

tokens used: 404192
EXIT 0
