import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminUserDetailPage } from "@/components/account/admin-user-detail-page";
import { getServerAdminUser } from "@/lib/server-admin-users";
import { getServerAdminPlans } from "@/lib/server-plans";

export const metadata: Metadata = {
  title: "Detalii utilizator | Reviss",
  description: "Date administrative pentru utilizator.",
};

type AdminUserRouteProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminUserRoute({ params }: AdminUserRouteProps) {
  const { id } = await params;
  const [user, plans] = await Promise.all([
    getServerAdminUser(id),
    getServerAdminPlans(),
  ]);

  if (!user) {
    notFound();
  }

  return (
    <AdminUserDetailPage
      user={user}
      plans={(plans ?? []).map((plan) => ({
        slug: plan.slug,
        name: plan.name,
      }))}
    />
  );
}
