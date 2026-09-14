"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AccountStaticShell } from "@/components/account/account-static-shell";
import { TablePagination } from "@/components/account/table-pagination";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "@/lib/toast-store";
import {
  listSubscriptionInvoices,
  type SubscriptionInvoice,
} from "@/lib/payments-api";
import { InvoicesPageSkeletonBody } from "@/components/account/account-page-skeletons";
import { DatePicker } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import { toISODay } from "@/lib/calendar";

const INVOICES_PAGE_SIZE = 8;

type InvoicesTranslator = ReturnType<typeof useTranslations<"invoices">>;

function formatInvoiceAmount(locale: string, invoice: SubscriptionInvoice) {
  const amount = invoice.amount_paid || invoice.amount_due;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: invoice.currency || "RON",
  }).format(amount / 100);
}

function formatInvoiceDate(
  t: InvoicesTranslator,
  locale: string,
  value: string | null,
) {
  if (!value) return t("inAsteptare");
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function statusLabel(t: InvoicesTranslator, status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "paid") return t("platita");
  if (normalized === "open") return t("deschisa");
  if (normalized === "draft") return t("ciorna");
  if (normalized === "void") return t("anulata");
  if (normalized === "uncollectible") return t("neincasabila");
  return status || t("necunoscut");
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "paid") {
    return "border-success-border bg-success-soft text-success";
  }
  if (normalized === "open" || normalized === "draft") {
    return "border-warning-border bg-warning-soft text-warning";
  }
  if (normalized === "void" || normalized === "uncollectible") {
    return "border-danger-border bg-danger-soft text-danger";
  }
  return "border-subtle bg-surface-hover text-muted";
}

export function BillingInvoicesPage() {
  const t = useTranslations("invoices");
  const locale = useLocale();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasLoadFailed, setHasLoadFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const hasFilters = Boolean(search || status || dateFrom || dateTo);

  // Only the statuses actually present are offered: a filter for "void" on an
  // account that has never had one is a dead end.
  const statusOptions = useMemo(() => {
    const present = Array.from(
      new Set(invoices.map((invoice) => invoice.status).filter(Boolean)),
    ).sort();
    return [
      { value: "", label: t("toateStatusurile") },
      ...present.map((value) => ({ value, label: statusLabel(t, value) })),
    ];
  }, [invoices, t]);

  // Filtering happens here rather than on the server: the endpoint returns one
  // account's invoices, which is a handful of rows, so a round trip per
  // keystroke would cost more than it saves.
  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase();

    return invoices.filter((invoice) => {
      if (status && invoice.status !== status) return false;

      if (term) {
        const haystack = [invoice.number, invoice.stripe_invoice_id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      if (dateFrom || dateTo) {
        const stamp = invoice.paid_at ?? invoice.created_at;
        const day = new Date(stamp);
        if (Number.isNaN(day.getTime())) return false;
        // Compared as calendar days in the reader's timezone, so an invoice
        // issued late in the evening is not pushed into the next day.
        const invoiceDay = toISODay(day);
        if (dateFrom && invoiceDay < dateFrom) return false;
        if (dateTo && invoiceDay > dateTo) return false;
      }

      return true;
    });
  }, [dateFrom, dateTo, invoices, search, status]);

  const pageCount = Math.max(
    1,
    Math.ceil(filteredInvoices.length / INVOICES_PAGE_SIZE),
  );
  const safeCurrentPage = Math.min(currentPage, pageCount);
  const paginatedInvoices = useMemo(() => {
    const start = (safeCurrentPage - 1) * INVOICES_PAGE_SIZE;
    return filteredInvoices.slice(start, start + INVOICES_PAGE_SIZE);
  }, [filteredInvoices, safeCurrentPage]);

  function changeFilter(apply: () => void) {
    setCurrentPage(1);
    apply();
  }

  function resetFilters() {
    changeFilter(() => {
      setSearch("");
      setStatus("");
      setDateFrom("");
      setDateTo("");
    });
  }

  const refreshInvoices = useCallback(() => {
    if (!user) return;

    setIsLoading(true);
    setHasLoadFailed(false);
    listSubscriptionInvoices()
      .then(setInvoices)
      .catch(() => {
        setHasLoadFailed(true);
        toast.error(t("facturileNuAuPututFi"));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [t, user]);

  useEffect(() => {
    if (isAuthLoading || !user) return;
    let isMounted = true;

    listSubscriptionInvoices()
      .then((nextInvoices) => {
        if (!isMounted) return;
        setInvoices(nextInvoices);
        setHasLoadFailed(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setHasLoadFailed(true);
        toast.error(t("facturileNuAuPututFi"));
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthLoading, t, user]);

  return (
    <AccountStaticShell activePage="billing-invoices"
      loadingBody={<InvoicesPageSkeletonBody />}>
      <section className="space-y-7">
        <div className="flex flex-col gap-5 border-b border-subtle pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
              {t("facturi")}
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold leading-[0.95] text-content sm:text-5xl">
              {t("istoricPlati")}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
              {t("facturileStripePentruAbonamentulTau")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/upgrade"
              className="inline-flex items-center rounded-md border border-subtle bg-surface px-4 py-2 text-xs font-bold text-muted transition hover:bg-surface-hover hover:text-content"
            >
              {t("planuri")}
            </Link>
            <button
              type="button"
              onClick={refreshInvoices}
              className="rounded-md border border-subtle bg-surface px-4 py-2 text-xs font-bold text-muted transition hover:bg-surface-hover hover:text-content"
            >
              {t("reincarca")}
            </button>
          </div>
        </div>

        {!isLoading && !hasLoadFailed && invoices.length > 0 ? (
          <section className="rounded-xl border border-subtle bg-surface p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto_auto]">
              <label className="min-w-0">
                <span className="sr-only">{t("cautaFactura")}</span>
                <input
                  value={search}
                  onChange={(event) =>
                    changeFilter(() => setSearch(event.target.value))
                  }
                  placeholder={t("cautaFactura")}
                  className="h-12 w-full rounded-lg border border-subtle bg-app px-4 text-sm text-content outline-none transition placeholder:text-muted focus:border-action focus:ring-4 focus:ring-action-soft"
                />
              </label>

              <div className="min-w-0">
                <Select
                  value={status}
                  onChange={(next) => changeFilter(() => setStatus(next))}
                  options={statusOptions}
                  aria-label={t("filtreazaDupaStatus")}
                />
              </div>

              <div className="min-w-0">
                <DatePicker
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(next) => changeFilter(() => setDateFrom(next))}
                  placeholder={t("deLa")}
                  aria-label={t("deLa")}
                  locale={locale}
                />
              </div>

              <div className="min-w-0">
                <DatePicker
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(next) => changeFilter(() => setDateTo(next))}
                  placeholder={t("panaLa")}
                  aria-label={t("panaLa")}
                  locale={locale}
                />
              </div>

              <button
                type="button"
                onClick={resetFilters}
                disabled={!hasFilters}
                className="h-12 rounded-md border border-subtle bg-app px-5 text-xs font-black text-muted transition hover:bg-surface-hover hover:text-content disabled:opacity-40"
              >
                {t("reseteaza")}
              </button>
            </div>

            {hasFilters ? (
              <p className="mt-3 text-xs font-semibold text-muted">
                {t("facturiGasite", {
                  count: filteredInvoices.length,
                  total: invoices.length,
                })}
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="overflow-hidden border-y border-subtle">
          {isLoading ? (
            <div className="py-6 text-sm font-semibold text-muted">
              {t("seIncarcaFacturile")}
            </div>
          ) : hasLoadFailed ? (
            <div className="py-6 text-sm font-semibold text-danger">
              {t("listaNuAPututFi")}
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-6 text-sm text-muted">
              {t("nuExistaIncaFacturiPentru")}
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="py-6 text-sm text-muted">
              {t("nuExistaFacturiPentruFiltre")}
            </div>
          ) : (
            <div className="data-table-scroll max-h-[34rem] overflow-auto divide-y divide-subtle">
              <div className="hidden grid-cols-[1.25fr_0.65fr_0.65fr_auto] gap-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-muted sm:grid">
                <span>{t("factura")}</span>
                <span>{t("valoare")}</span>
                <span>{t("status")}</span>
                <span className="text-right">{t("actiuni")}</span>
              </div>

              {paginatedInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="grid gap-4 py-5 text-sm transition hover:bg-surface-hover/45 sm:grid-cols-[1.25fr_0.65fr_0.65fr_auto] sm:items-center"
                >
                  <div>
                    <p className="text-base font-black tracking-tight">
                      {invoice.number ?? invoice.stripe_invoice_id}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {formatInvoiceDate(t, locale, invoice.paid_at ?? invoice.created_at)}
                    </p>
                  </div>
                  <p className="text-base font-black">
                    {formatInvoiceAmount(locale, invoice)}
                  </p>
                  <span
                    className={`w-fit rounded-md border px-3 py-1 text-xs font-black ${statusClass(
                      invoice.status,
                    )}`}
                  >
                    {statusLabel(t, invoice.status)}
                  </span>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {invoice.hosted_invoice_url ? (
                      <a
                        href={invoice.hosted_invoice_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md bg-action px-4 py-2 text-sm font-black text-on-action transition hover:bg-action-hover"
                      >
                        {t("veziFactura")}
                      </a>
                    ) : null}
                    {invoice.invoice_pdf_url ? (
                      <a
                        href={invoice.invoice_pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-subtle bg-surface px-4 py-2 text-sm font-black transition hover:bg-surface-hover"
                      >
                        PDF
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!isLoading && !hasLoadFailed ? (
            <TablePagination
              currentPage={safeCurrentPage}
              pageCount={pageCount}
              pageSize={INVOICES_PAGE_SIZE}
              totalItems={filteredInvoices.length}
              itemLabel="facturi"
              onPageChange={setCurrentPage}
            />
          ) : null}
        </div>
      </section>
    </AccountStaticShell>
  );
}
