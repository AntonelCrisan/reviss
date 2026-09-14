import type { Metadata } from "next";
import { AdminAuditLogsPage } from "@/components/account/admin-audit-logs-page";
import {
  getServerAdminAuditLogActions,
  getServerAdminAuditLogs,
} from "@/lib/server-admin-audit";

export const metadata: Metadata = {
  title: "Jurnal activitate | Reviss",
  description: "Audit logs pentru platforma Reviss.",
};

const AUDIT_LOGS_PAGE_SIZE = 25;

export default async function AdminAuditLogsRoute() {
  const [logs, actions, failures] = await Promise.all([
    getServerAdminAuditLogs({ limit: AUDIT_LOGS_PAGE_SIZE }),
    getServerAdminAuditLogActions(),
    // Only the count is wanted, so ask for the smallest page that still
    // carries it rather than pulling every failure across the whole history.
    getServerAdminAuditLogs({ status: "failure", limit: 1 }),
  ]);

  return (
    <AdminAuditLogsPage
      initialLogs={logs ?? { items: [], total: 0 }}
      initialActions={actions ?? []}
      initialFailureTotal={failures?.total ?? 0}
    />
  );
}
