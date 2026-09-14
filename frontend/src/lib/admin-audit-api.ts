export type AuditLogStatus = "success" | "failure";

export type AuditLog = {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  action: string;
  status: AuditLogStatus;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

/** A page of rows plus how many match the filter, not just how many were sent. */
export type Paged<T> = {
  items: T[];
  total: number;
};

export type AuditLogActionOption = {
  action: string;
  total: number;
};

type ApiErrorPayload = {
  detail?: string;
};

export class AdminAuditApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AdminAuditApiError";
  }
}

/**
 * Turn a date picked in the browser into the instants that day spans.
 *
 * The table renders timestamps in the reader's own timezone, so the day has
 * to be bounded there too. Sending a bare "2026-09-14" would leave the
 * database server's timezone to decide where the day starts, which differs
 * between development and production.
 */
export function dayBounds(day: string, { endOfDay = false } = {}): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return "";

  // Local midnight; the end bound is exclusive, so it is the next midnight.
  const instant = new Date(year, month - 1, date + (endOfDay ? 1 : 0));
  return Number.isNaN(instant.getTime()) ? "" : instant.toISOString();
}

export type AuditLogFilters = {
  action?: string;
  actor?: string;
  status?: AuditLogStatus | "";
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
};

export function auditQuery(filters: AuditLogFilters = {}) {
  const params = new URLSearchParams();

  if (filters.action) params.set("action", filters.action);
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.status) params.set("status", filters.status);
  if (filters.dateFrom) {
    params.set("date_from", dayBounds(filters.dateFrom));
  }
  if (filters.dateTo) {
    params.set("date_to", dayBounds(filters.dateTo, { endOfDay: true }));
  }
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));

  const query = params.toString();
  return query ? `?${query}` : "";
}

async function readJson<T>(response: Response, fallbackMessage: string) {
  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // The fallback below handles non-JSON upstream errors.
    }
    throw new AdminAuditApiError(
      payload.detail || fallbackMessage,
      response.status,
    );
  }

  return (await response.json()) as T;
}

const jsonRequest: RequestInit = {
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  cache: "no-store",
};

export async function getAdminAuditLogs(
  filters: AuditLogFilters = {},
): Promise<Paged<AuditLog>> {
  const response = await fetch(
    `/api/admin/audit-logs${auditQuery(filters)}`,
    jsonRequest,
  );

  return readJson<Paged<AuditLog>>(
    response,
    "Jurnalul de activitate nu a putut fi încărcat.",
  );
}

export async function getAdminAuditLogActions(): Promise<AuditLogActionOption[]> {
  const response = await fetch("/api/admin/audit-logs/actions", jsonRequest);

  return readJson<AuditLogActionOption[]>(
    response,
    "Lista de acțiuni nu a putut fi încărcată.",
  );
}

export type VisitorStats = {
  total_visitors: number;
  visitors_today: number;
  visitors_last_7_days: number;
  visitors_last_30_days: number;
};

export async function getAdminVisitorStats(): Promise<VisitorStats> {
  const response = await fetch("/api/admin/visitor-stats", jsonRequest);

  return readJson<VisitorStats>(
    response,
    "Statisticile vizitatorilor nu au putut fi încărcate.",
  );
}

export type VisitorVisit = {
  id: string;
  visitor_hash: string;
  visit_date: string;
  path: string | null;
  created_at: string;
};

export type VisitorVisitFilters = {
  dateFrom?: string;
  dateTo?: string;
  path?: string;
  limit?: number;
  offset?: number;
};

export function visitorQuery(filters: VisitorVisitFilters = {}) {
  const params = new URLSearchParams();

  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.path) params.set("path", filters.path);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));

  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function getAdminVisitorVisits(
  filters: VisitorVisitFilters = {},
): Promise<Paged<VisitorVisit>> {
  const response = await fetch(
    `/api/admin/visitor-visits${visitorQuery(filters)}`,
    jsonRequest,
  );

  return readJson<Paged<VisitorVisit>>(
    response,
    "Vizitele nu au putut fi încărcate.",
  );
}
