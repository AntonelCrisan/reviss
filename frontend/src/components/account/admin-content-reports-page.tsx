"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AccountStaticShell } from "@/components/account/account-static-shell";
import { TablePagination } from "@/components/account/table-pagination";
import { Select } from "@/components/ui/select";
import {
  type AdminContentReport,
  type ContentReportType,
  getAdminContentReports,
} from "@/lib/admin-content-reports-api";
import { toast } from "@/lib/toast-store";

type AdminContentReportsPageProps = {
  initialReports: AdminContentReport[];
};

const CONTENT_REPORTS_PAGE_SIZE = 10;

const reportTypeLabels: Record<ContentReportType, string> = {
  drepturi_autor: "Drepturi de autor",
  date_personale: "Date personale",
  continut_incorect: "Conținut incorect",
  altul: "Alt motiv",
};

const reportTypeFilters: Array<{ value: ContentReportType | ""; label: string }> =
  [
    { value: "", label: "Toate" },
    { value: "drepturi_autor", label: "Drepturi de autor" },
    { value: "date_personale", label: "Date personale" },
    { value: "continut_incorect", label: "Conținut incorect" },
    { value: "altul", label: "Alt motiv" },
  ];

function formatDate(value: string | null) {
  if (!value) return "Niciodată";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "necunoscut";

  return new Intl.DateTimeFormat("ro-RO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function compactPreview(value: string | null | undefined, maxLength = 160) {
  const compactValue = (value ?? "").replace(/\s+/g, " ").trim();
  if (!compactValue) return "-";
  if (compactValue.length <= maxLength) return compactValue;
  return `${compactValue.slice(0, maxLength)}...`;
}

function formatFileSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 B";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

function attachmentDownloadHref(
  report: AdminContentReport,
  attachmentId: string,
) {
  return `/api/admin/content-reports/${report.id}/attachments/${attachmentId}/download`;
}

function replyHref(report: AdminContentReport) {
  const subject = encodeURIComponent(`Re: ${report.registration_number}`);
  const body = encodeURIComponent(
    `Bună, ${report.name}\n\nÎți răspundem la sesizarea ${report.registration_number}.\n\n`,
  );

  return `mailto:${report.email}?subject=${subject}&body=${body}`;
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4" />
      <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" />
    </svg>
  );
}

function ReportMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-xl border border-subtle bg-surface p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-4 font-serif text-2xl font-semibold leading-tight text-content">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted">{detail}</p>
    </article>
  );
}

export function AdminContentReportsPage({
  initialReports,
}: AdminContentReportsPageProps) {
  const [reports, setReports] = useState(initialReports);
  const [search, setSearch] = useState("");
  const [reportType, setReportType] = useState<ContentReportType | "">("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const latestReport = reports[0] ?? null;
  const privacyCount = reports.filter(
    (report) => report.report_type === "date_personale",
  ).length;
  const attachmentCount = reports.reduce(
    (total, report) => total + report.attachments.length,
    0,
  );

  const filteredReports = useMemo(() => {
    const normalizedSearch = normalizeText(search);

    return reports.filter((report) => {
      const matchesType = !reportType || report.report_type === reportType;
      const matchesSearch =
        !normalizedSearch ||
        normalizeText(report.registration_number).includes(normalizedSearch) ||
        normalizeText(report.name).includes(normalizedSearch) ||
        normalizeText(report.email).includes(normalizedSearch) ||
        normalizeText(reportTypeLabels[report.report_type]).includes(
          normalizedSearch,
        ) ||
        normalizeText(report.content_reference).includes(normalizedSearch) ||
        normalizeText(report.description).includes(normalizedSearch) ||
        normalizeText(report.rights_evidence).includes(normalizedSearch) ||
        report.attachments.some((attachment) =>
          normalizeText(attachment.original_filename).includes(normalizedSearch),
        ) ||
        normalizeText(report.ip_address).includes(normalizedSearch);

      return matchesType && matchesSearch;
    });
  }, [reportType, reports, search]);

  const pageCount = Math.max(
    1,
    Math.ceil(filteredReports.length / CONTENT_REPORTS_PAGE_SIZE),
  );
  const safeCurrentPage = Math.min(currentPage, pageCount);
  const paginatedReports = useMemo(() => {
    const start = (safeCurrentPage - 1) * CONTENT_REPORTS_PAGE_SIZE;
    return filteredReports.slice(start, start + CONTENT_REPORTS_PAGE_SIZE);
  }, [filteredReports, safeCurrentPage]);

  async function refreshReports() {
    setIsRefreshing(true);

    try {
      setReports(await getAdminContentReports({ limit: 200 }));
      setCurrentPage(1);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Raportările de conținut nu au putut fi încărcate.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <AccountStaticShell activePage="admin-settings">
      <section className="space-y-7">
        <div className="flex flex-col gap-5 border-b border-subtle pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href="/admin/settings"
              className="mb-5 flex w-fit items-center rounded-md border border-subtle bg-surface px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-hover hover:text-content"
            >
              ← Setări admin
            </Link>
            <p className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
              Raportări
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold leading-[0.95] text-content sm:text-5xl">
              Raportări conținut.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Sesizări trimise prin formularul public pentru conținut incorect,
              drepturi de autor sau date personale.
            </p>
          </div>

          <button
            type="button"
            onClick={refreshReports}
            disabled={isRefreshing}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-md bg-action px-5 py-3 text-sm font-black text-on-action transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshIcon spinning={isRefreshing} />
            <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <ReportMetric
            label="Raportări"
            value={String(reports.length)}
            detail={`${filteredReports.length} afișate`}
          />
          <ReportMetric
            label="Date personale"
            value={String(privacyCount)}
            detail="Sesizări confidențialitate"
          />
          <ReportMetric
            label="Documente"
            value={String(attachmentCount)}
            detail={
              latestReport
                ? `Ultima raportare: ${latestReport.registration_number}`
                : "fără raportări"
            }
          />
        </div>

        <section className="rounded-xl border border-subtle bg-surface p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-center">
            <label className="min-w-0">
              <span className="sr-only">Caută în raportări</span>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Caută după nume, email, referință, descriere sau IP..."
                className="h-12 w-full rounded-lg border border-subtle bg-app px-4 text-sm text-content outline-none transition placeholder:text-muted focus:border-action"
              />
            </label>

            <div className="min-w-0">
              <Select
                value={reportType}
                onChange={(next) => {
                  setReportType(next as ContentReportType | "");
                  setCurrentPage(1);
                }}
                options={reportTypeFilters.map((item) => ({
                  value: item.value,
                  label: item.label,
                }))}
                aria-label="Filtrează după tip"
              />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-subtle bg-surface">
          <div className="data-table-scroll max-h-[38rem] overflow-auto">
            <table className="w-full min-w-[1380px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-subtle bg-surface text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                <tr>
                  <th className="px-5 py-4">Dată</th>
                  <th className="px-5 py-4">Reporter</th>
                  <th className="px-5 py-4">Tip</th>
                  <th className="px-5 py-4">Conținut</th>
                  <th className="px-5 py-4">Descriere</th>
                  <th className="px-5 py-4">Dovezi</th>
                  <th className="px-5 py-4">Documente</th>
                  <th className="px-5 py-4">Context</th>
                  <th className="px-5 py-4">Acțiune</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {paginatedReports.map((report) => (
                  <tr
                    key={report.id}
                    className="align-top transition hover:bg-surface-hover/45"
                  >
                    <td className="whitespace-nowrap px-5 py-4 text-muted">
                      <span className="block">{formatDate(report.created_at)}</span>
                      <span className="mt-1 block font-mono text-[11px] text-muted">
                        {report.registration_number}
                      </span>
                    </td>
                    <td className="max-w-[250px] px-5 py-4">
                      <span className="block break-words font-bold text-content">
                        {report.name}
                      </span>
                      <a
                        href={`mailto:${report.email}`}
                        className="mt-1 block break-all text-xs font-semibold text-muted transition hover:text-content"
                      >
                        {report.email}
                      </a>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-muted">
                        {reportTypeLabels[report.report_type]}
                      </span>
                    </td>
                    <td className="max-w-[260px] break-words px-5 py-4 font-bold text-content">
                      {report.content_reference}
                    </td>
                    <td className="min-w-[320px] max-w-[420px] px-5 py-4">
                      <p className="break-words leading-6 text-muted">
                        {compactPreview(report.description)}
                      </p>
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-black text-content">
                          Vezi descrierea completă
                        </summary>
                        <p className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-subtle bg-app p-3 text-sm leading-6 text-muted">
                          {report.description}
                        </p>
                      </details>
                    </td>
                    <td className="min-w-[260px] max-w-[340px] px-5 py-4">
                      <p className="break-words leading-6 text-muted">
                        {compactPreview(report.rights_evidence, 120)}
                      </p>
                      {report.rights_evidence ? (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs font-black text-content">
                            Vezi dovezile
                          </summary>
                          <p className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-subtle bg-app p-3 text-sm leading-6 text-muted">
                            {report.rights_evidence}
                          </p>
                        </details>
                      ) : null}
                    </td>
                    <td className="min-w-[260px] max-w-[320px] px-5 py-4">
                      {report.attachments.length > 0 ? (
                        <ul className="grid gap-2">
                          {report.attachments.map((attachment) => (
                            <li
                              key={attachment.id}
                              className="min-w-0 rounded-lg border border-subtle bg-app p-3"
                            >
                              <a
                                href={attachmentDownloadHref(
                                  report,
                                  attachment.id,
                                )}
                                className="block break-words text-xs font-black text-content transition hover:text-muted"
                              >
                                {attachment.original_filename}
                              </a>
                              <span className="mt-1 block text-[11px] font-semibold text-muted">
                                {formatFileSize(attachment.size_bytes)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="max-w-[260px] px-5 py-4 text-xs leading-5 text-muted">
                      <span className="block break-all">
                        IP: {report.ip_address ?? "-"}
                      </span>
                      <span className="mt-2 block break-words">
                        User agent: {report.user_agent ?? "-"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <a
                        href={replyHref(report)}
                        className="inline-flex items-center justify-center rounded-md bg-action px-4 py-2 text-xs font-black text-on-action transition hover:bg-action-hover"
                      >
                        Răspunde
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredReports.length === 0 ? (
            <p className="border-t border-subtle p-5 text-sm text-muted">
              Nu există raportări pentru filtrele alese.
            </p>
          ) : null}
          <TablePagination
            currentPage={safeCurrentPage}
            pageCount={pageCount}
            pageSize={CONTENT_REPORTS_PAGE_SIZE}
            totalItems={filteredReports.length}
            itemLabel="raportări"
            onPageChange={setCurrentPage}
          />
        </section>
      </section>
    </AccountStaticShell>
  );
}
