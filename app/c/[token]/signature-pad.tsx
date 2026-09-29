"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, type PointerEvent as ReactPointerEvent } from "react";
import styles from "./intake.module.css";

// UI-SPEC ①-i · SYSTEM.md §6-5 — 고정 논리 영역 520×200. 획은 논리 좌표로
// 저장해(값의 주인 — 확인 시간 지남으로 E3에 다녀와도 같은 자리면 되살린다)
// 배율 s = 캔버스 폭 ÷ 520 하나로 다시 그린다. 제출 PNG은 논리 영역에서
// 1040×400(2배) · 굵기 6 · 바탕 투명으로 다시 그린다.
const LOGICAL_WIDTH = 520;
const LOGICAL_HEIGHT = 200;
const EXPORT_SCALE = 2; // 1040×400
const SCREEN_LINE_WIDTH = 3;

export type LogicalPoint = { x: number; y: number };
export type Stroke = LogicalPoint[];

export type SignaturePadHandle = {
  clear: () => void;
  focus: () => void;
  toPngBase64: () => string;
};

function strokeColor(el: Element): string {
  return getComputedStyle(el).getPropertyValue("--fg").trim();
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

export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { id: string; strokes: Stroke[]; onStrokesChange: (strokes: Stroke[]) => void }
>(function SignaturePad({ id, strokes, onStrokesChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef<Stroke | null>(null);
  const strokesRef = useRef(strokes);

  // 화면 비트맵 = CSS 크기 × devicePixelRatio, 논리 점 × s로 다시 그린다.
  function redraw(list: Stroke[]) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    drawStrokes(ctx, list, rect.width / LOGICAL_WIDTH, SCREEN_LINE_WIDTH, strokeColor(canvas));
  }

  useEffect(() => {
    strokesRef.current = strokes;
    redraw(strokes);
  }, [strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => redraw(strokesRef.current));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  function logicalPoint(e: ReactPointerEvent<HTMLCanvasElement>): LogicalPoint {
    const rect = e.currentTarget.getBoundingClientRect();
    const s = rect.width / LOGICAL_WIDTH;
    return {
      x: Math.min(Math.max((e.clientX - rect.left) / s, 0), LOGICAL_WIDTH),
      y: Math.min(Math.max((e.clientY - rect.top) / s, 0), LOGICAL_HEIGHT),
    };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const stroke: Stroke = [logicalPoint(e)];
    activeRef.current = stroke;
    onStrokesChange([...strokesRef.current, stroke]);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const active = activeRef.current;
    if (!active) return;
    const next = [...active, logicalPoint(e)];
    activeRef.current = next;
    onStrokesChange([...strokesRef.current.slice(0, -1), next]);
  }

  function endStroke() {
    activeRef.current = null;
  }

  useImperativeHandle(ref, () => ({
    clear: () => onStrokesChange([]),
    focus: () => canvasRef.current?.focus(),
    toPngBase64: () => {
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = LOGICAL_WIDTH * EXPORT_SCALE;
      exportCanvas.height = LOGICAL_HEIGHT * EXPORT_SCALE;
      const ctx = exportCanvas.getContext("2d");
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return "";
      drawStrokes(ctx, strokesRef.current, EXPORT_SCALE, SCREEN_LINE_WIDTH * EXPORT_SCALE, strokeColor(canvas));
      return exportCanvas.toDataURL("image/png").split(",")[1] ?? "";
    },
  }));

  const hasInk = strokes.some((s) => s.length > 0);

  return (
    <div className={styles.signatureWrap}>
      <canvas
        ref={canvasRef}
        id={id}
        role="application"
        aria-label="서명"
        className={styles.signatureCanvas}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={endStroke}
      />
      {!hasInk ? <span className={styles.signaturePlaceholder}>여기에 서명</span> : null}
    </div>
  );
});
