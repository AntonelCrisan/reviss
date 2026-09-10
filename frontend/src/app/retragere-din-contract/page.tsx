import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  CompanyDetailsCard,
  WithdrawalForm,
} from "@/components/legal/compliance-forms";
import { LegalPageShell } from "@/components/legal/legal-page-shell";
import { getFallbackCompanyData, getServerCompanyData } from "@/lib/server-legal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta.withdrawal");
  return { title: t("title"), description: t("description") };
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WithdrawalPage() {
  const t = await getTranslations("legal.withdrawal");
  const companyData = (await getServerCompanyData()) ?? getFallbackCompanyData();
  const recaptchaSiteKey =
    process.env.RECAPTCHA_SITE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() ||
    "";

  return (
    <LegalPageShell
      eyebrow={t("eyebrow")}
      title={t("title")}
      description={t("description")}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <section className="min-w-0">
          <WithdrawalForm recaptchaSiteKey={recaptchaSiteKey} />
        </section>
        <CompanyDetailsCard companyData={companyData} />
      </div>
    </LegalPageShell>
  );
}
