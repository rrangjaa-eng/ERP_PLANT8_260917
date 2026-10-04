"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { countInkPixels, SIGNATURE_MIN_INK_PIXELS } from "@/domain/certs/signature-ink";
import {
  EXPORT_SCALE,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  PEN_START,
  gridCellName,
  isArrowKey,
  moveCursor,
  toLogical,
  toScreen,
  type LogicalPoint,
} from "./signature-geometry";
import styles from "./intake.module.css";

// UI-SPEC E4 「서명(개정 ①-i)」 · SYSTEM.md §6-5 — 고정 논리 영역 520×200에 획을
// 저장하고(값의 주인 — 확인 시간 지남으로 E3에 다녀와도 같은 자리면 되살린다)
// 배율 하나로 다시 그린다. 손가락 · 펜 · 마우스 · 키보드 모두 같은 순수 좌표
// 함수(signature-geometry)를 거친다. 「서명 있음」은 제출할 PNG(1040×400)의 잉크
// 픽셀을 서버와 같은 함수 · 같은 상수로 세어 획이 끝날 때마다 정한다.
const SCREEN_LINE_WIDTH = 3;
const CROSS_HALF = 4; // 8px 십자

export type Stroke = LogicalPoint[];

export type SignaturePadHandle = {
  clear: () => void;
  focus: () => void;
  toPngBase64: () => string;
};

function strokeColor(el: Element): string {
  return getComputedStyle(el).getPropertyValue("--text-strong").trim();
}

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number, width: number, color: string) {
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  for (const stroke of strokes) {
    const [first, ...rest] = stroke;
    if (!first) continue;
    if (rest.length === 0) {
      ctx.beginPath();
      ctx.arc(first.x * scale, first.y * scale, width / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(first.x * scale, first.y * scale);
    for (const p of rest) ctx.lineTo(p.x * scale, p.y * scale);
    ctx.stroke();
  }
}

// 제출 PNG — 논리 영역에서 1040×400 · 굵기 6 · 바탕 투명으로 다시 그린다
// (기준선 · 자리표시 · 십자 없음).
function renderExport(strokes: Stroke[], color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = LOGICAL_WIDTH * EXPORT_SCALE;
  canvas.height = LOGICAL_HEIGHT * EXPORT_SCALE;
  const ctx = canvas.getContext("2d");
  if (ctx) drawStrokes(ctx, strokes, EXPORT_SCALE, SCREEN_LINE_WIDTH * EXPORT_SCALE, color);
  return canvas;
}

function inkEnough(strokes: Stroke[], color: string): boolean {
  if (strokes.length === 0) return false;
  const canvas = renderExport(strokes, color);
  const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
  return data ? countInkPixels(data) >= SIGNATURE_MIN_INK_PIXELS : false;
}

export const SignaturePad = forwardRef<
  SignaturePadHandle,
  {
    id: string;
    strokes: Stroke[];
    onStrokesChange: (strokes: Stroke[]) => void;
    onSignedChange: (signed: boolean) => void;
  }
>(function SignaturePad({ id, strokes, onStrokesChange, onSignedChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef(strokes);
  const activeRef = useRef(false); // 포인터 획 진행 중
  const penRef = useRef<LogicalPoint>({ ...PEN_START });
  const penDownRef = useRef(false); // 키보드 펜을 댄 채
  const arrowsRef = useRef(new Set<string>());
  const signedRef = useRef(false);
  const [signed, setSigned] = useState(false);
  const [keyFocus, setKeyFocus] = useState(false);
  const [message, setMessage] = useState("");
  const guideId = useId();
  const keyFocusRef = useRef(false);
  keyFocusRef.current = keyFocus;

  function color(): string {
    return canvasRef.current ? strokeColor(canvasRef.current) : "";
  }

  // 화면 비트맵 = CSS 크기 × devicePixelRatio, 논리 점 × s로 다시 그린다.
  function redraw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const fg = strokeColor(canvas);
    drawStrokes(ctx, strokesRef.current, rect.width / LOGICAL_WIDTH, SCREEN_LINE_WIDTH, fg);
    if (keyFocusRef.current) {
      const p = toScreen(penRef.current, rect.width);
      ctx.lineWidth = 1;
      ctx.strokeStyle = fg;
      ctx.beginPath();
      ctx.moveTo(p.x - CROSS_HALF, p.y);
      ctx.lineTo(p.x + CROSS_HALF, p.y);
      ctx.moveTo(p.x, p.y - CROSS_HALF);
      ctx.lineTo(p.x, p.y + CROSS_HALF);
      ctx.stroke();
    }
  }
  // 획이 끝날 때마다 잉크를 센다(움직이는 동안에는 세지 않는다). 막 서명 있음이
  // 되었으면 참을 돌려준다.
  function judge(list: Stroke[]): boolean {
    const next = inkEnough(list, color());
    const became = next && !signedRef.current;
    signedRef.current = next;
    setSigned(next);
    onSignedChange(next);
    return became;
  }

  function commit(list: Stroke[]) {
    strokesRef.current = list;
    onStrokesChange(list);
  }

  useEffect(() => {
    strokesRef.current = strokes;
    redraw();
  });

  const judgeRef = useRef(judge);
  useEffect(() => {
    judgeRef.current = judge;
  });

  // 되살린 획(값의 주인)도 처음 한 번 잰다.
  useEffect(() => {
    judgeRef.current(strokesRef.current);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []); // 마운트 때 한 번

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    activeRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    commit([...strokesRef.current, [toLogical({ x: e.clientX - rect.left, y: e.clientY - rect.top }, rect.width)]]);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!activeRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const point = toLogical({ x: e.clientX - rect.left, y: e.clientY - rect.top }, rect.width);
    const list = strokesRef.current;
    const last = list[list.length - 1] ?? [];
    commit([...list.slice(0, -1), [...last, point]]);
  }

  function endPointerStroke() {
    if (!activeRef.current) return;
    activeRef.current = false;
    if (judge(strokesRef.current)) setMessage("서명이 들어갔습니다");
  }

  function penUp() {
    penDownRef.current = false;
    const count = strokesRef.current.length;
    setMessage(judge(strokesRef.current) ? "서명이 들어갔습니다" : `펜을 뗐습니다 · 획 ${count}개`);
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLCanvasElement>) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (e.repeat) return;
      if (penDownRef.current) {
        penUp();
      } else {
        penDownRef.current = true;
        commit([...strokesRef.current, [{ ...penRef.current }]]);
        setMessage(`펜을 댔습니다 · ${gridCellName(penRef.current)}`);
      }
      return;
    }
    if (isArrowKey(e.key)) {
      e.preventDefault();
      arrowsRef.current.add(e.key);
      const moved = moveCursor(penRef.current, [...arrowsRef.current], { shift: e.shiftKey });
      penRef.current = { x: moved.x, y: moved.y };
      if (penDownRef.current) {
        const list = strokesRef.current;
        const last = list[list.length - 1] ?? [];
        commit([...list.slice(0, -1), [...last, { ...penRef.current }]]);
      } else {
        redraw();
      }
      if (moved.edge) setMessage("칸 가장자리입니다");
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      if (strokesRef.current.length === 0) return;
      penDownRef.current = false;
      const list = strokesRef.current.slice(0, -1);
      commit(list);
      judge(list);
      setMessage(`마지막 획을 지웠습니다 · 획 ${list.length}개`);
    }
  }

  function handleKeyUp(e: ReactKeyboardEvent<HTMLCanvasElement>) {
    arrowsRef.current.delete(e.key);
  }

  useImperativeHandle(ref, () => ({
    clear: () => {
      penDownRef.current = false;
      penRef.current = { ...PEN_START };
      commit([]);
      judge([]);
      setMessage("서명을 모두 지웠습니다");
      canvasRef.current?.focus();
    },
    focus: () => canvasRef.current?.focus(),
    toPngBase64: () => renderExport(strokesRef.current, color()).toDataURL("image/png").split(",")[1] ?? "",
  }));

  const hasInk = strokes.some((s) => s.length > 0);

  return (
    <div>
      <div className={styles.signatureWrap}>
        <canvas
          ref={canvasRef}
          id={id}
          tabIndex={0}
          role="application"
          aria-label={signed ? "서명 칸 · 서명함" : "서명 칸"}
          aria-describedby={guideId}
          className={styles.signatureCanvas}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointerStroke}
          onPointerCancel={endPointerStroke}
          onPointerLeave={endPointerStroke}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onFocus={(e) => setKeyFocus(e.currentTarget.matches(":focus-visible"))}
          onBlur={() => {
            if (penDownRef.current) penUp();
            arrowsRef.current.clear();
            setKeyFocus(false);
          }}
        />
        <span className={styles.signatureBaseline} aria-hidden="true" />
        {!hasInk ? <span className={styles.signaturePlaceholder}>여기에 서명</span> : null}
      </div>
      <p id={guideId} className={keyFocus ? styles.keyGuide : styles.keyGuideHidden}>
        Space로 펜을 대고 떼고 방향키로 그립니다 · Shift를 함께 누르면 크게 움직이고 Backspace는 마지막 획을 지웁니다
        <span className="sr-only"> 화면 읽기 프로그램에서는 두 번 탭한 뒤 누른 채 그릴 수도 있습니다</span>
      </p>
      <p className="sr-only" aria-live="polite">
        {message}
      </p>
    </div>
  );
});
