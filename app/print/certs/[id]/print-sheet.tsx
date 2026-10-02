"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui/button/Button";
import styles from "./print-cert.module.css";

// 04.3-11 — P1 확인증 인쇄물(SYSTEM §6-6 · docs/design/system/print-cert.html 구조 그대로, 값만 채운다). 서명은 필수 이미지다:
// 자동 window.print()는 서명 decode()가 성공해 data-ready가 붙은 뒤에만 한 번 불리고, 서명이 없거나 decode가 거부되면
// 인쇄하지 않고 실패 줄을 세운다(⑬). 준비 전 · 실패 때 브라우저 인쇄는 본문 대신 준비 전 한 줄만 찍는다(CSS).
// 지출결의 · 프로젝트 · 지급일 · 금액 세 값은 Phase 11 칸이라 —, 원천징수 내역 2행과 한글 금액 줄은 그리지 않는다.

type Props = {
  printedAt: string;
  certNo: string;
  eventName: string;
  wonOn: string;
  prizeLine: string;
  name: string;
  rrnMasked: string;
  address: string;
  phone: string;
  submittedAt: string;
  signatureDataUrl: string | null;
};

type State = "loading" | "ready" | "error";

// 칸 폭(약 120mm)에 14px 한글이 한 줄 32자쯤 들어간다 — 이보다 길면 줄이 꺾일 수 있어 세로 간격을 줄인 배치로 바꾼다(M1).
const COMPACT_OVER = 28;

export function PrintSheet(props: Props) {
  const [state, setState] = useState<State>(props.signatureDataUrl === null ? "error" : "loading");
  const imageRef = useRef<HTMLImageElement>(null);
  const printed = useRef(false);
  const compact = Array.from(props.eventName).length > COMPACT_OVER || Array.from(props.address).length > COMPACT_OVER;

  // 문서 제목은 고정이다 — 이 화면(성공 · 실패 줄)만 정하고 404 변종은 기본 제목을 쓴다(L3).
  useEffect(() => {
    document.title = "확인증 인쇄";
  }, []);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    let cancelled = false;
    image.decode().then(
      () => {
        if (!cancelled) setState((current) => (current === "loading" ? "ready" : current));
      },
      () => {
        if (!cancelled) setState("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // 개발 모드 이중 효과에도 한 번이다 — ref는 재마운트에도 남는다.
  useEffect(() => {
    if (state !== "ready" || printed.current) return;
    printed.current = true;
    window.print();
  }, [state]);

  return (
    <main className={styles.root} data-ready={state === "ready" ? "" : undefined}>
      {state === "error" ? (
        <div className={styles.errorLine}>
          <h1 className={styles.errorTitle}>인쇄물 만들기 실패 ·</h1>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            다시 시도
          </Button>
        </div>
      ) : (
        <section className={compact ? `${styles.sheet} ${styles.compact}` : styles.sheet}>
          <div className={styles.top}>
            <span className={styles.mark}>PLANT8</span>
            <span>
              출력 <span className={styles.num}>{props.printedAt}</span>
            </span>
          </div>
          <h1 className={styles.title}>기타소득 지급 확인증</h1>
          <p className={styles.sub}>
            <span className={`${styles.num} ${styles.subNum}`}>{props.certNo}</span> 지출결의 —
          </p>
          <div className={styles.rule} />

          <dl className={styles.list}>
            <dt>프로젝트</dt>
            <dd>—</dd>
            <dt>항목</dt>
            <dd>
              {props.eventName}
              <span className={`${styles.small} ${styles.num}`}>당첨일 {props.wonOn}</span>
            </dd>
            <dt>소득 종류</dt>
            <dd>기타소득</dd>
            <dt>경품</dt>
            <dd>{props.prizeLine}</dd>
            <dt>지급일</dt>
            <dd className={styles.num}>—</dd>
          </dl>

          <h2 className={styles.section}>수령자</h2>
          <dl className={styles.list}>
            <dt>이름</dt>
            <dd>{props.name}</dd>
            <dt>주민등록번호</dt>
            <dd className={styles.num}>{props.rrnMasked}</dd>
            <dt>주소</dt>
            <dd>{props.address}</dd>
            <dt>연락처</dt>
            <dd className={styles.num}>{props.phone}</dd>
            <dt>계좌</dt>
            <dd>—</dd>
          </dl>

          <div className={styles.amount}>
            <div className={styles.row}>
              <span>지급액</span>
              <span className={styles.num}>—</span>
            </div>
            <div className={styles.row}>
              <span>원천징수</span>
              <span className={styles.num}>—</span>
            </div>
            <div className={`${styles.row} ${styles.total}`}>
              <span>실지급액</span>
              <b className={styles.num}>—</b>
            </div>
          </div>

          <p className={styles.declaration}>위 금액을 기타소득으로 지급받았음을 확인합니다.</p>
          <div className={styles.sign}>
            <div className={`${styles.who} ${styles.payer}`}>
              지급자<b>PLANT8</b>
              <span className={styles.num}>—</span>
            </div>
            <div className={styles.who}>
              수령자<b>{props.name}</b>
              <span className={styles.num}>{props.submittedAt}</span> 제출
            </div>
            <div className={styles.box}>
              {/* 서버가 권한 확인 뒤 내려준 data URL — next/image 최적화 대상이 아니다. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                className={styles.signature}
                src={props.signatureDataUrl ?? undefined}
                alt={`${props.name} 서명`}
                onError={() => setState("error")}
              />
              <span>서명</span>
            </div>
          </div>

          <div className={styles.foot}>
            <span>PLANT8 ERP</span>
            <span className={styles.num}>1 / 1</span>
          </div>
        </section>
      )}
      <p className={styles.notReady}>인쇄물이 아직 준비되지 않았습니다 · 화면이 다 뜬 뒤 다시 인쇄해 주세요</p>
    </main>
  );
}
