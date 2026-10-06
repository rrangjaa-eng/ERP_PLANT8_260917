import { Num } from "@/ui/num/Num";
import styles from "./expense.module.css";

// 05-06(UI-SPEC S5): 서버가 만든 계산 한 줄 · 세율 바뀜 조각을 그린다 — 폼(클라이언트) · 문서 화면(서버)이 같이 쓴다(지시문 · 훅 없음).
// 숫자 조각(emphasis)만 `Num` + 700. 조각 묶음(` · ` 사이) 안은 줄바꿈하지 않고 묶음 사이에서만 꺾인다. 마지막 `… 규칙` 꼬리도 한 덩어리 —
// 줄이 모자라면 통째로 다음 줄로 가고(사용자 확정 10/5 19:52), 한 줄보다 길 때만(증빙 종류 이름이 매우 길 때 — UIC long-text S5) 그 안에서 꺾인다.
// 이 파일은 글자를 만들지 않는다.

export type TaxPart = { text: string; emphasis: boolean };

const SEPARATOR = " · ";
// 세율 바뀜 `{전} → {후}` — 화살표 앞뒤는 세율 바뀜 줄(.drift)에서만 꺾일 수 있다(320 값 칸보다 넓은 묶음 — 06-06 DOM 감사 O-2).
const ARROW = " → ";

function segmentsOf(parts: readonly TaxPart[]): TaxPart[][] {
  const segments: TaxPart[][] = [[]];
  for (const part of parts) {
    if (!part.emphasis && part.text === SEPARATOR) segments.push([]);
    else segments.at(-1)?.push(part);
  }
  return segments;
}

export function TaxParts({ parts }: { parts: readonly TaxPart[] }) {
  const segments = segmentsOf(parts);
  return segments.map((segment, index) => (
    <span key={index}>
      {index > 0 ? <span>{SEPARATOR}</span> : null}
      <span className={index < segments.length - 1 ? styles.taxSegment : styles.taxTail}>
        {segment.map((part, partIndex) =>
          part.emphasis ? (
            <span key={partIndex} className={styles.strong}>
              <Num value={part.text} />
            </span>
          ) : (
            <span key={partIndex} className={part.text === ARROW ? styles.arrow : undefined}>
              {part.text}
            </span>
          ),
        )}
      </span>
    </span>
  ));
}
