import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { getEventDetail, type CertEventDetailDto } from "@/domain/certs/events";
import { formatSubmittedAtKst } from "@/domain/certs/format";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { QrSection } from "./qr-section";
import { WinnersView } from "./winners-view";
import { CreatedToast } from "./created-toast";
import styles from "./event-detail.module.css";

export const dynamic = "force-dynamic";

// 받침이 있으면 「이」, 없으면 「가」(닫은 사람 이름 뒤).
function subjectParticle(name: string): string {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 === 0 ? "가" : "이";
}

// UI-SPEC Copywriting 「I3 닫힌 QR 섹션」 사유 셋.
function closedLine(event: Partial<CertEventDetailDto>): string {
  const at = event.closedAt ? formatSubmittedAtKst(event.closedAt) : "—";
  if (event.closedReason === "allSubmitted") return `닫힘 · ${at} · 모두 제출`;
  if (event.closedReason === "expired") return `닫힘 · ${at} · 기한 지남`;
  const closer = event.closerName ?? "—";
  return `닫힘 · ${at} · ${closer}${subjectParticle(closer)} 닫음`;
}

// 04.3-04 Task 4 ① — I3 행사 상세(읽기). 기능이 꺼져 있거나 범위 밖이면 셸 안 404(C1 · T-04.3-19).
// 머리 2차 「링크 닫기」 · 당첨자 편집은 04.3-10이 더한다(빈 버튼을 두지 않는다).
export default async function CertEventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { viewer } = await requireSession();
  await assertCertFeatureEnabled();

  const { id } = await params;
  const detail = await getEventDetail(viewer, id);
  if (detail.kind === "notFound") notFound();
  const event = detail.event;
  const created = (await searchParams).created === "1";

  const name = event.name ?? "—";
  const open = event.status === "open";
  const subtitle = [
    `당첨일 ${event.wonOn ?? "—"}`,
    `담당 ${event.ownerName ?? "—"}`,
    `마감 ${event.expiresAt ? formatSubmittedAtKst(event.expiresAt) : "—"}`,
  ].join(" · ");

  return (
    <>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <PageHeader title={name} subtitle={subtitle} />
        </div>
        {event.status ? (
          <StatusTag kind={open ? "accent" : "muted"} variant="tag">
            {open ? "접수 중" : "닫힘"}
          </StatusTag>
        ) : null}
      </div>

      {open && event.qrSvg && event.link ? (
        <QrSection eventName={name} qrSvg={event.qrSvg} link={event.link} />
      ) : event.status === "closed" ? (
        <QrSection closedLine={closedLine(event)} />
      ) : null}

      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>당첨자</h2>
        <WinnersView winners={event.winners ?? []} />
      </section>

      {created ? <CreatedToast eventId={id} message={`행사 만들기 · ${name} · 당첨자 ${event.totalCount ?? 0}명`} /> : null}
    </>
  );
}
