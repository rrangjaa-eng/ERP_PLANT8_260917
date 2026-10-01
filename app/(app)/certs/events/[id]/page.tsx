import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { getCreateGate, getEventDetail, type CertEventDetailDto } from "@/domain/certs/events";
import { formatSubmittedAtKst } from "@/domain/certs/format";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { QrSection } from "./qr-section";
import { PrizeSection } from "./prize-section";
import { SubmissionsSection } from "./submissions-section";
import { QR_SECTION_LABEL_ID } from "./prize-table-rules";
import styles from "./event-detail.module.css";

export const dynamic = "force-dynamic";

// 받침이 있으면 「이」, 없으면 「가」(닫은 사람 이름 뒤).
function subjectParticle(name: string): string {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 === 0 ? "가" : "이";
}

// UI-SPEC Copywriting 「I3 닫힌 QR 섹션」 사유 둘(담당자가 닫음 · 기한 — 04.3-15).
function closedLine(event: Partial<CertEventDetailDto>): string {
  const at = event.closedAt ? formatSubmittedAtKst(event.closedAt) : "—";
  if (event.closedReason === "expired") return `닫힘 · ${at} · 기한 지남`;
  const closer = event.closerName ?? "—";
  return `닫힘 · ${at} · ${closer}${subjectParticle(closer)} 닫음`;
}

const STATUS_LABEL = { requested: "신청됨", open: "접수 중", closed: "닫힘" } as const;

// 04.3-04 Task 4 ① · 04.3-15 · 04.3-10 — I′3 행사 상세 머리 · QR 섹션 · 경품 섹션(§6-2 ⑯). 기능이 꺼져 있거나 범위 밖이면
// 셸 안 404(C1 · T-04.3-19). 제출 섹션 · 「링크 닫기」 · 「신청 취소」는 04.3-17이 더한다(빈 버튼을 두지 않는다). 섹션에
// key를 준다 — QR 생성 뒤 QR 섹션이 앞에 끼어도 경품 섹션(토스트 · 포커스 상태)이 다시 마운트되지 않는다.
export default async function CertEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { viewer } = await requireSession();
  await assertCertFeatureEnabled();

  const { id } = await params;
  const detail = await getEventDetail(viewer, id);
  if (detail.kind === "notFound") notFound();
  const event = detail.event;

  const name = event.name ?? "—";
  const open = event.status === "open";
  // 신청됨은 마감이 없다(QR 생성 전) — 마감 대신 「신청 {시각}」.
  const subtitle = [
    `당첨일 ${event.wonOn ?? "—"}`,
    `담당 ${event.ownerName ?? "—"}`,
    event.status === "requested"
      ? `신청 ${event.requestedAt ? formatSubmittedAtKst(event.requestedAt) : "—"}`
      : `마감 ${event.expiresAt ? formatSubmittedAtKst(event.expiresAt) : "—"}`,
  ].join(" · ");
  // 파생 태그 `접수 전`(UD-1 b) — QR이 있고 당첨일 00:00 KST 전. 행동은 접수 중과 같다.
  const tag = open && event.beforeOpen ? "접수 전" : event.status ? STATUS_LABEL[event.status] : null;
  const gate = event.canManagePrizes && event.status === "requested" ? await getCreateGate(viewer) : null;

  return (
    <>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <PageHeader title={name} subtitle={subtitle} />
        </div>
        {tag ? (
          <StatusTag kind={open && !event.beforeOpen ? "accent" : "muted"} variant="tag">
            {tag}
          </StatusTag>
        ) : null}
      </div>

      {open && event.qrSvg && event.link ? (
        <QrSection key="qr" eventName={name} qrSvg={event.qrSvg} link={event.link} />
      ) : event.status === "closed" ? (
        <QrSection key="qr" closedLine={closedLine(event)} />
      ) : null}

      {event.id && event.status ? (
        <PrizeSection
          key="prizes"
          eventId={event.id}
          eventName={name}
          status={event.status}
          canManagePrizes={event.canManagePrizes === true}
          prizes={event.prizes ?? []}
          contactMissing={gate?.contactMissing ?? false}
          canOpenSettings={gate?.canOpenSettings ?? false}
          qrLabelId={QR_SECTION_LABEL_ID}
        />
      ) : null}

      {/* 04.3-17 — 제출 섹션: 접수 중(접수 전 포함) · 닫힘이고 서버가 키를 실었을 때만(I4를 열 수 있는 사람 — N7 a). */}
      {event.status !== "requested" && event.submissions ? <SubmissionsSection key="submissions" groups={event.submissions} /> : null}
    </>
  );
}
