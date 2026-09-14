import "server-only";

import {
  type AuditLog,
  type AuditLogActionOption,
  type AuditLogFilters,
  type Paged,
  auditQuery,
} from "@/lib/admin-audit-api";
import { getAdminJson } from "@/lib/server-admin-fetch";

export async function getServerAdminAuditLogs(
  filters: AuditLogFilters = {},
): Promise<Paged<AuditLog> | null> {
  return getAdminJson<Paged<AuditLog>>(
    `/api/admin/audit-logs/${auditQuery(filters)}`,
  );
}

export async function getServerAdminAuditLogActions(): Promise<
  AuditLogActionOption[] | null
> {
  return getAdminJson<AuditLogActionOption[]>("/api/admin/audit-logs/actions");
}
