"use client";

import { forwardRef, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import styles from "./intake.module.css";

// UI-SPEC ①-i · SYSTEM.md §6-5 — 고정 논리 영역 520×200, 배율
// s = 캔버스 폭 ÷ 520 하나를 x·y에 써서 어떤 크기 변경에도 잘리는 획이
// 없다. 제출 PNG은 1040×400(2배)로 다시 그려 base64 한 번 전송한다.
// 04.3-06이 키보드로 그리기(Space/Enter·방향키)를 더한다 — 이 태스크는
// 포인터(마우스·터치·펜) 입력까지만이다.
const LOGICAL_WIDTH = 520;
const LOGICAL_HEIGHT = 200;
const EXPORT_SCALE = 2; // 1040×400

export type SignaturePadHandle = {
  isEmpty: () => boolean;
  clear: () => void;
  toPngBase64: () => string;
};

export const SignaturePad = forwardRef<SignaturePadHandle, { hasStroke: boolean; onChange: (hasStroke: boolean) => void }>(
  function SignaturePad({ hasStroke, onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const [, setTick] = useState(0);

    function getContext(): CanvasRenderingContext2D | null {
      return canvasRef.current?.getContext("2d") ?? null;
    }

    function pointFromEvent(e: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const s = LOGICAL_WIDTH / rect.width;
      const x = Math.min(Math.max((e.clientX - rect.left) * s, 0), LOGICAL_WIDTH);
      const y = Math.min(Math.max((e.clientY - rect.top) * s, 0), LOGICAL_HEIGHT);
      return { x, y };
    }

    function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
      drawingRef.current = true;
      const ctx = getContext();
      const { x, y } = pointFromEvent(e);
      ctx?.beginPath();
      ctx?.moveTo(x, y);
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
      if (!drawingRef.current) return;
      const ctx = getContext();
      if (!ctx) return;
      const { x, y } = pointFromEvent(e);
      const fg = getComputedStyle(canvasRef.current!).getPropertyValue("--fg").trim() || "#111111";
      ctx.strokeStyle = fg;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineTo(x, y);
      ctx.stroke();
      if (!hasStroke) onChange(true);
    }

    function endStroke() {
      drawingRef.current = false;
    }

    function clear() {
      const canvas = canvasRef.current;
      const ctx = getContext();
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      setTick((t) => t + 1);
      onChange(false);
    }

    useImperativeHandle(ref, () => ({
      isEmpty: () => !hasStroke,
      clear,
      toPngBase64: () => {
        const canvas = canvasRef.current;
        if (!canvas) return "";
        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = LOGICAL_WIDTH * EXPORT_SCALE;
        exportCanvas.height = LOGICAL_HEIGHT * EXPORT_SCALE;
        const exportCtx = exportCanvas.getContext("2d");
        exportCtx?.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
        const dataUrl = exportCanvas.toDataURL("image/png");
        return dataUrl.split(",")[1] ?? "";
      },
    }));

    return (
      <div className={styles.signatureWrap}>
        <canvas
          ref={canvasRef}
          width={LOGICAL_WIDTH}
          height={LOGICAL_HEIGHT}
          role="application"
          aria-label="서명"
          className={styles.signatureCanvas}
          style={{ touchAction: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
        />
        {!hasStroke ? <span className={styles.signaturePlaceholder}>여기에 서명</span> : null}
      </div>
    );
  },
);
