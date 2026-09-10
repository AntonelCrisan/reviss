import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccountTabRoutePage } from "@/components/account/account-tab-route-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta.chatAi");
  return { title: t("title"), description: t("description") };
}

export default function ChatAiPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] | undefined }>;
}) {
  return <AccountTabRoutePage searchParams={searchParams} tab="chat" />;
}
