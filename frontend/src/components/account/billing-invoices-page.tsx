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
  const pageCount = Math.max(
    1,
    Math.ceil(invoices.length / INVOICES_PAGE_SIZE),
  );
  const safeCurrentPage = Math.min(currentPage, pageCount);
  const paginatedInvoices = useMemo(() => {
    const start = (safeCurrentPage - 1) * INVOICES_PAGE_SIZE;
    return invoices.slice(start, start + INVOICES_PAGE_SIZE);
  }, [invoices, safeCurrentPage]);

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
              totalItems={invoices.length}
              itemLabel="facturi"
              onPageChange={setCurrentPage}
            />
          ) : null}
        </div>
      </section>
    </AccountStaticShell>
  );
}
