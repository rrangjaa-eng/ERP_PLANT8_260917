담당 계획과 잠긴 결정, 저장소 구현을 대조해 라운드 1 수정 여부와 새 실행 실패 지점을 확인하겠습니다. 지정된 금지 경로는 읽지 않겠습니다.

공유 가드·동의 기간 고정·서명 업로드 의도 표는 수정된 계약에 반영돼 있습니다. E2E 프로젝트 간 전역 설정 충돌과 마이그레이션 재생성 검증이 실제 저장소에서도 성립하는지 추가로 확인하겠습니다.

새 실행 실패 지점 두 곳을 확인했습니다. 오류 로그에서 원문을 제거하라는 지시가 기존 테스트의 “원문이 있어야 한다” 단언과 충돌합니다. 또한 확인증 전용 프로젝트가 기능을 켜면 기존 관리자 메뉴 E2E의 “PM은 관리 메뉴가 없다” 단언이 깨지는데, 프로젝트 사이 실행 순서는 아직 분리되지 않았습니다.

MAJOR 3건, MINOR 2건입니다. 계획과 코드를 읽기 전용으로 대조했으며 파일 수정·테스트 실행은 하지 않았습니다. 아래 `01`·`02`·`13`은 해당 번호의 PLAN입니다.

A 샤드가 소유한 계약·검증과 관련된 라운드 1 재판정입니다.

| R1 | 판정 | 계획 근거 |
|---|---|---|
| #1 KMS 기동 실패 | FIXED | [COVERAGE:38](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/COVERAGE.md:38)의 기동 복호화 계약과 [08:154](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md:154)의 base64 텍스트 해석·초기화가 연결됐다. |
| #2 비활성 상태의 열람·정정 | FIXED | [02:194](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:194)이 인쇄·내부 액션까지 공유 가드를 요구하고, [07:234](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:234)이 세 액션에 적용한다. |
| #3 DB 오류의 개인정보 로그 | PARTIAL | [02:406](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:406)의 제거 지시는 있으나 기존 테스트 유지 지시와 충돌한다. 아래 1번. |
| #4 설정 토글만으로 활성화 | FIXED | [02:190](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:190), [02:279](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:279): 환경 게이트와 설정을 함께 요구하고, 환경 게이트가 없으면 설정 등록에서도 제외한다. |
| #6 전화 확인 전 제출 여부 노출 | FIXED | [02:298](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:298)은 선택 결과에서 제출 상태를 제외한다. [06:166](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:166)은 무효 증표의 제출 여부 비노출을 검증한다. |
| #10 키 회전 | FIXED | [COVERAGE:46](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/COVERAGE.md:46), [08:165](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md:165): 감싼 키 초기화와 확인증 암호화 칼럼 두 개의 회전 대상을 명시했다. |
| #12 고아 서명 파기 누락 | FIXED | [02:305](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:305), [COVERAGE:15](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/COVERAGE.md:15): 업로드 전 의도 커밋, 제출과 원자적 삭제, 실패 시 파기 대상 유지. |
| #15 동의한 보존 기간 변경 | FIXED | [02:255](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:255), [02:302](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:302): 증표에 기간·판을 묶고 제출값 대조 및 설정 변경 테스트를 요구한다. |
| #16 발급일을 생년월일로 치환 | FIXED | [02:402](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:402): 이전 출생자의 검증번호 불일치를 거부하지 않고 재확인으로 처리한다. |
| #17 문의 전화 정규화 | FIXED | [02:286](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:286), [02:384](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:384): 문의 전화 함수와 지역번호·대표번호 테스트를 분리했다. |
| #18 구별 표시 정규화 누락 | FIXED | [01:167](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md:167)의 UI 계약 이관과 [04:189](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md:189)의 구분자 제거·NFC·공백 제거 규칙이 연결됐다. |
| #20 마이그레이션·개발 DB 삭제 위험 | FIXED | [13:99](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-13-PLAN.md:99)부터 main 복원·별도 DB 적용·main 항목 보존 검증을 명시한다. 예약 번호의 잔존 문구는 아래 5번. |
| #21 E2E 전역 설정 충돌 | PARTIAL | [02:260](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:260)의 전용 프로젝트는 확인증 스펙끼리만 직렬화한다. 기존 프로젝트와 충돌한다. 아래 2번. |
| #24 트레이서 TDD 역전 | FIXED | [02:259](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:259)에서 구현 전 테스트 작성·RED 실행·선행 커밋을 요구한다. 다만 직접 호출 테스트의 실행 환경은 아래 3번이 막는다. |
| #27 PNG·본문 한도 불일치 | FIXED | [06:184](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:184)가 02의 200KB를 180KiB로 교체하고 최대 입력의 `checkPayloadSize` 검증을 요구한다. |

남은 문제와 새로 발견한 실행 실패입니다.

1. **MAJOR — 개인정보 로그 수정과 “기존 테스트 유지”를 동시에 만족할 수 없다.**  
   [02:400](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:400)은 기존 케이스를 그대로 두라고 한다. 하지만 실제 [handle-server-error.test.ts:80](/home/user/ERP_PLANT8_260917/test/unit/actions/handle-server-error.test.ts:80)은 로그에 `Failed query`가 포함돼야 한다고 단언한다. [02:406](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:406)대로 원문을 제거하면 이 테스트는 반드시 실패한다. 기존 원문 로깅 케이스를 **안전한 메타데이터만 남기는 회귀 테스트로 교체**하도록 명시해야 한다.

2. **MAJOR — 확인증 프로젝트가 기존 관리자 메뉴 E2E의 전제를 깨뜨린다.**  
   [02:260](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:260)은 `certs → cert-setup` 의존성만 추가하고, setup은 기능을 켠 채 유지한다. 기존 [playwright.config.ts:99](/home/user/ERP_PLANT8_260917/playwright.config.ts:99)의 순서는 `desktop → mobile-375`뿐이다. 여기에 [09:151](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-09-PLAN.md:151)의 PM 권한 시드가 들어오면 PM에게 관리 메뉴가 생긴다. 실제 [admin-nav.spec.ts:112](/home/user/ERP_PLANT8_260917/test/e2e/admin-nav.spec.ts:112)은 같은 PM에게 관리 메뉴가 없고 `/admin`이 404여야 한다고 단언한다. `workers: 1`로는 프로젝트 간 공유 DB·설정 충돌을 막지 못한다. 기존 프로젝트 완료 후 setup을 실행하도록 의존성을 연결하거나 DB를 분리해야 한다.

3. **MAJOR · NEW — 트레이서의 서버 액션 직접 호출 통합 테스트가 import 단계에서 막힌다.**  
   [02:253](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:253), [02:263](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:263)은 실제 `actions.ts`를 직접 호출하도록 요구한다. 그러나 액션 클라이언트는 [client.ts:2](/home/user/ERP_PLANT8_260917/lib/actions/client.ts:2)에서 viewer를 가져오고, [viewer.ts:1](/home/user/ERP_PLANT8_260917/lib/viewer.ts:1)은 `server-only`를 import한다. [vitest.config.ts:20](/home/user/ERP_PLANT8_260917/vitest.config.ts:20)의 통합 프로젝트에는 이를 처리하는 설정이 없다. 저장소도 이미 [leak-scan.test.ts:10](/home/user/ERP_PLANT8_260917/test/integration/leak-scan.test.ts:10)에 이 import 실패를 기록했다. 따라서 요구한 404·DB 불변 단언까지 도달하지 못한다. 실제 액션 클라이언트와 가드를 유지하는 서버 의존성 mock을 명시하거나, 트레이서부터 실제 HTTP POST 테스트로 옮겨야 한다.

4. **MINOR · NEW — 01이 승인된 UI 계약을 이전 문구로 되돌린다.**  
   [01:184](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md:184), [01:189](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md:189)은 택배 부제를 `--fs-sm`으로 옮기고 “번호 없는 문장”을 추가한다. 정본은 [UI-SPEC:199](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:199)의 `--fs-md`이며, [UI-SPEC:160](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:160)은 번호 없는 대체 문장을 금지한다. 실제 수정 대상은 [external-cert.html:46](/home/user/ERP_PLANT8_260917/docs/design/system/external-cert.html:46)이다. 그대로 실행하면 SYSTEM과 실물이 승인 계약과 달라진다.

5. **MINOR · NEW — RESEARCH에 예약 번호 지시가 남아 있다.**  
   [RESEARCH:59](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-RESEARCH.md:59)는 여전히 “0017부터, 다른 페이즈와 겹치지 않게 계획 때 정한다”고 한다. 이는 같은 문서 [RESEARCH:382](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-RESEARCH.md:382), [PATTERNS:250](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-PATTERNS.md:250)의 예약 금지·머지 직전 재생성과 충돌한다. 실제 마이그레이션은 [migrate-runner.ts:54](/home/user/ERP_PLANT8_260917/scripts/migrate-runner.ts:54)의 Drizzle migrator 경로를 따른다. 이전 번호 배분 문구를 폐기된 결정으로 표시하거나 제거해야 한다.

VERDICT: FAIL

tokens used: 1934379
EXIT 0
