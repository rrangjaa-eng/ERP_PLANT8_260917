"use client";

import { useState } from "react";
import type { DetailLine } from "@/domain/action-log/detail-lines";
import { Button } from "@/ui/button/Button";
import styles from "./action-log.module.css";

// 07-25 K16 · SC-08: 표 상세 칸 — 바뀐 칸 앞 3줄을 보이고 넘으면 3차 `외 N칸`이 같은 칸 안에 나머지를 펼친다.
// 줄바꿈 허용 · 말줄임 없음. 펼친 뒤에도 같은 단추가 남아(`접기`) 포커스가 사라지지 않는다.
const VISIBLE_LINES = 3;

export function detailLineText(line: DetailLine): string {
  return `${line.label} · ${line.before} → ${line.after}`;
}

export function DetailCell({ lines }: { lines: DetailLine[] | null }) {
  const [open, setOpen] = useState(false);
  if (!lines) return <span data-ui="action-log-detail">—</span>;
  const rest = lines.length - VISIBLE_LINES;
  const shown = open ? lines : lines.slice(0, VISIBLE_LINES);
  return (
    <div data-ui="action-log-detail" className={styles.detail}>
      <ul className={styles.detailLines}>
        {shown.map((line, index) => (
          <li key={index}>{detailLineText(line)}</li>
        ))}
      </ul>
      {rest > 0 ? (
        <Button variant="tertiary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? "접기" : `외 ${rest}칸`}
        </Button>
      ) : null}
    </div>
  );
}
