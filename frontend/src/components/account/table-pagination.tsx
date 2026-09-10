"use client";

import { useTranslations } from "next-intl";
type TablePaginationProps = {
  currentPage: number;
  pageCount: number;
  pageSize: number;
  totalItems: number;
  itemLabel?: string;
  onPageChange: (page: number) => void;
};

function clampPage(page: number, pageCount: number) {
  return Math.min(Math.max(page, 1), Math.max(pageCount, 1));
}

function pageNumbers(currentPage: number, pageCount: number) {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const start = clampPage(currentPage - 2, pageCount);
  const end = clampPage(start + 4, pageCount);
  const normalizedStart = Math.max(1, end - 4);

  return Array.from(
    { length: end - normalizedStart + 1 },
    (_, index) => normalizedStart + index,
  );
}

export function TablePagination({
  currentPage,
  pageCount,
  pageSize,
  totalItems,
  itemLabel,
  onPageChange,
}: TablePaginationProps) {
  const t = useTranslations("pagination");
  if (totalItems === 0) return null;

  const label = itemLabel ?? t("inregistrari");

  const safePageCount = Math.max(pageCount, 1);
  const safeCurrentPage = clampPage(currentPage, safePageCount);
  const startItem = (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);
  const canGoBack = safeCurrentPage > 1;
  const canGoForward = safeCurrentPage < safePageCount;

  return (
    <div className="flex flex-col gap-3 border-t border-subtle px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="font-semibold text-muted">
        {t("intervalDinTotal", {
          start: startItem,
          end: endItem,
          total: totalItems,
          label,
        })}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(safeCurrentPage - 1)}
          disabled={!canGoBack}
          className="rounded-md border border-subtle bg-app px-4 py-2 text-xs font-black text-content transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
        >
          {t("inapoi")}
        </button>

        {pageNumbers(safeCurrentPage, safePageCount).map((page) => {
          const isActive = page === safeCurrentPage;

          return (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              className={`flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-xs font-black transition ${
                isActive
                  ? "border-action bg-action text-on-action"
                  : "border-subtle bg-app text-muted hover:bg-surface-hover hover:text-content"
              }`}
            >
              {page}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onPageChange(safeCurrentPage + 1)}
          disabled={!canGoForward}
          className="rounded-md border border-subtle bg-app px-4 py-2 text-xs font-black text-content transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
        >
          {t("inainte")}
        </button>
      </div>
    </div>
  );
}
