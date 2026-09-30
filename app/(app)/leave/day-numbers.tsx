import styles from "./leave.module.css";

// 04.1-06 DOM 감사 #4: 잔고·일수 글자에서 `일` 앞 숫자 토막만 700(UI-SPEC Typography · SYSTEM §7-15 Form.Hint
// 「숫자만 700」). 날짜의 숫자는 `일`이 뒤따르지 않아 굵어지지 않는다. 글자는 도메인 formatter가 만든 그대로 둔다.
const DAY_NUMBER = /(-?\d+(?:\.\d+)?)(?=일)/;

export function splitDayNumbers(text: string): { text: string; num: boolean }[] {
  return text
    .split(DAY_NUMBER)
    .map((part, index) => ({ text: part, num: index % 2 === 1 }))
    .filter((part) => part.text !== "");
}

export function DayNumbers({ text }: { text: string }) {
  return (
    <>
      {splitDayNumbers(text).map((part, index) =>
        part.num ? (
          <b key={index} className={styles.dayNumber}>
            {part.text}
          </b>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
