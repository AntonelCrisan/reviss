import "server-only";

import {
  type Paged,
  type VisitorStats,
  type VisitorVisit,
  type VisitorVisitFilters,
  visitorQuery,
} from "@/lib/admin-audit-api";
import { getAdminJson } from "@/lib/server-admin-fetch";

export async function getServerAdminVisitorStats(): Promise<VisitorStats | null> {
  return getAdminJson<VisitorStats>("/api/admin/visitor-stats");
}

export async function getServerAdminVisitorVisits(
  filters: VisitorVisitFilters = {},
): Promise<Paged<VisitorVisit> | null> {
  return getAdminJson<Paged<VisitorVisit>>(
    `/api/admin/visitor-visits${visitorQuery(filters)}`,
  );
}
