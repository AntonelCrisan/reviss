import type { Metadata } from "next";
import { AdminVisitorVisitsPage } from "@/components/account/admin-visitor-visits-page";
import {
  getServerAdminVisitorStats,
  getServerAdminVisitorVisits,
} from "@/lib/server-admin-visitors";

export const metadata: Metadata = {
  title: "Vizitatori fără cont | Reviss",
  description: "Trafic anonim pe platforma Reviss.",
};

const VISITS_PAGE_SIZE = 25;

export default async function AdminVisitorVisitsRoute() {
  const [visits, stats] = await Promise.all([
    getServerAdminVisitorVisits({ limit: VISITS_PAGE_SIZE }),
    getServerAdminVisitorStats(),
  ]);

  return (
    <AdminVisitorVisitsPage
      initialVisits={visits ?? { items: [], total: 0 }}
      initialStats={stats}
    />
  );
}
