import type { Metadata } from "next";
import { AdminPlanTranslationsPage } from "@/components/account/admin-plan-translations-page";

export const metadata: Metadata = {
  title: "Traduceri planuri | Reviss",
  description: "Textele planurilor Reviss în engleză și franceză.",
};

export default function AdminPlanTranslationsRoute() {
  return <AdminPlanTranslationsPage />;
}
