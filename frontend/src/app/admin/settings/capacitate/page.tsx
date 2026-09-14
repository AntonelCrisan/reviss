import type { Metadata } from "next";
import { AdminAddonResourcesPage } from "@/components/account/admin-addon-resources-page";

export const metadata: Metadata = {
  title: "Capacitate la bucată | Reviss",
  description: "Resurse vândute separat, peste alocarea planului.",
};

export default function AdminAddonResourcesRoute() {
  return <AdminAddonResourcesPage />;
}
