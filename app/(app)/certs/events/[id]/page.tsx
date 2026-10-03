import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { getCreateGate, getEventDetail, type CertEventDetailDto } from "@/domain/certs/events";
import { formatSubmittedAtKst } from "@/domain/certs/format";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { KvList, type KvItem } from "@/ui/kv-list/KvList";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { QrSection } from "./qr-section";
import { PrizeSection } from "./prize-section";
import { SubmissionsSection } from "./submissions-section";
import { HeaderActions } from "./header-actions";
import { LandingToast } from "../landing-toast";
import { QR_SECTION_LABEL_ID } from "./prize-table-rules";

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
// 셸 안 404(C1 · T-04.3-19). 04.3-17 — 머리 2차 「링크 닫기」 · 「신청 취소」와 제출 섹션(대조). 섹션에 key를 준다 — QR 생성 뒤
// QR 섹션이 앞에 끼어도 경품 섹션(토스트 · 포커스 상태)이 다시 마운트되지 않는다. `?excluded={제출 id}`는 I4 「대조 제외」 뒤
// 착지 — 그 줄(제외된 줄)의 이름으로 토스트 · 그 줄 「제출 내용」에 포커스(T3).
export default async function CertEventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ excluded?: string }>;
}) {
  const { viewer } = await requireSession();
  await assertCertFeatureEnabled();

  const { id } = await params;
  const { excluded } = await searchParams;
  const detail = await getEventDetail(viewer, id);
  if (detail.kind === "notFound") notFound();
  const event = detail.event;

  const name = event.name ?? "—";
  const open = event.status === "open";
  // 신청됨은 마감이 없다(QR 생성 전) — 마감 대신 「신청 {시각}」.
  const summaryItems: KvItem[] = [
    { label: "당첨일", value: event.wonOn ?? "—" },
    { label: "담당", value: event.ownerName ?? "—" },
    event.status === "requested"
      ? { label: "신청", value: event.requestedAt ? formatSubmittedAtKst(event.requestedAt) : "—" }
      : { label: "마감", value: event.expiresAt ? formatSubmittedAtKst(event.expiresAt) : "—" },
  ];
  // 파생 태그 `접수 전`(UD-1 b) — QR이 있고 당첨일 00:00 KST 전. 행동은 접수 중과 같다.
  const tag = open && event.beforeOpen ? "접수 전" : event.status ? STATUS_LABEL[event.status] : null;
  const gate = event.canManagePrizes && event.status === "requested" ? await getCreateGate(viewer) : null;
  const excludedRow = excluded
    ? event.submissions?.flatMap((group) => group.rows).find((row) => row.id === excluded && row.excluded)
    : undefined;

  return (
    <DetailScreen
      title={name}
      status={tag ? <StatusTag status={tag} variant="tag" /> : undefined}
      actions={
        event.id
          ? {
              secondary: (
                <HeaderActions
                  eventId={event.id}
                  eventName={name}
                  submittedCount={event.submittedCount ?? 0}
                  canClose={event.canClose === true}
                  cancelRole={event.cancelRole ?? null}
                  prizeCount={event.prizes?.length ?? 0}
                />
              ),
            }
          : undefined
      }
    >
      <KvList items={summaryItems} />

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
      {event.status !== "requested" && event.submissions ? (
        <SubmissionsSection
          key="submissions"
          groups={event.submissions}
          {...(excludedRow?.id ? { focusSubmissionId: excludedRow.id } : {})}
        />
      ) : null}
      {excludedRow ? <LandingToast message={`대조 제외 · ${excludedRow.name ?? ""}`} href={`/certs/events/${id}`} /> : null}
    </DetailScreen>
  );
}
