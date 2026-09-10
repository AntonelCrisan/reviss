import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/legal-document";
import { readLegalDocument } from "@/lib/legal-content";
import { getServerLegalDocument } from "@/lib/server-legal";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta.privacy");
  return { title: t("title"), description: t("description") };
}

export default async function PrivacyPolicyPage() {
  const t = await getTranslations("legal.privacy");
  const document = await getServerLegalDocument("privacy_policy");
  const contentHtml =
    document?.rendered_content_html ?? (await readLegalDocument("privacy.html"));

  return (
    <LegalDocument
      contentHtml={contentHtml}
      eyebrow={t("eyebrow")}
      summary={t("summary")}
    />
  );
}
