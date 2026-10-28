// 번호 표지 상수 — 다른 모듈을 가져오지 않는 잎 파일이다. 설정 키(domain/settings/keys.ts)가 이 표지를 보고 접두 충돌을 거부하는데,
// 번호 모듈(index.ts)은 설정 모듈을 가져오므로 상수를 index.ts에 두면 설정 키 ↔ 번호 모듈 순환이 생긴다.
// 06.5 D-6503: 카드 사용 K 번호의 가름 글자. K · 4자리 · 시작 1은 상수다(새 설정 키를 만들지 않는다).
export const CARD_USAGE_NUMBER_MARK = "K";
