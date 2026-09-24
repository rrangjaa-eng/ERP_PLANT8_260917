"use client";

// UI-SPEC S15 — 쉼표 입력 칸 공용 훅. 판단 로직은 lib/format-number.ts에 다
// 있다 — 이 훅은 그 순수 함수들을 DOM 이벤트(커서 보존 포함)에 연결만 한다.
import { useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import {
  formatNumberInput,
  numberInputRejectionReason,
  stripNumberInput,
  type NumberInputKind,
} from "@/lib/format-number";

export type UseCommaInputResult = {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  error: string | null;
  rawValue: string;
};

export function useCommaInput(kind: NumberInputKind, initial: string): UseCommaInputResult {
  // 초깃값도 처음부터 쉼표가 들어간 채로 보인다 — 그렇지 않으면 칸을 다시
  // 열거나 새로고침한 직후엔 쉼표 없는 원문이 보이다가 사용자가 한 글자
  // 쳐야만 쉼표가 붙는다(D-95, 04-09 E2E 회귀). raw 그대로를 "타이핑"
  // 경로에 한 번 통과시켜 같은 그룹핑 규칙을 쓴다.
  const [text, setText] = useState(() => formatNumberInput({ raw: initial, caret: initial.length, kind }).text);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingCaretRef = useRef<number | null>(null);

  // 커서 위치는 리렌더 뒤에만 DOM에 반영할 수 있다 — setSelectionRange는
  // value가 실제로 바뀐 뒤에 불러야 한다(useLayoutEffect, 깜빡임 방지).
  useLayoutEffect(() => {
    if (pendingCaretRef.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(pendingCaretRef.current, pendingCaretRef.current);
      pendingCaretRef.current = null;
    }
  }, [text]);

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const caret = event.target.selectionStart ?? raw.length;
    const result = formatNumberInput({ raw, caret, kind, prev: text });

    setError(result.rejected ? numberInputRejectionReason(kind, result.rejected) : null);
    pendingCaretRef.current = result.caret;
    setText(result.text);
  }

  return { inputRef, value: text, onChange, error, rawValue: stripNumberInput(text) };
}
