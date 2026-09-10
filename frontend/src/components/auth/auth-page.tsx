import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";

export type AuthPageKey =
  | "login"
  | "register"
  | "forgotPassword"
  | "resetPassword"
  | "verifyEmail"
  | "confirmEmailChange";

const alternateHrefs: Record<AuthPageKey, "/login" | "/register"> = {
  login: "/register",
  register: "/login",
  forgotPassword: "/login",
  resetPassword: "/login",
  verifyEmail: "/login",
  confirmEmailChange: "/login",
};

/** `generateMetadata` for an auth route: title and description from its messages. */
export async function authPageMetadata(page: AuthPageKey): Promise<Metadata> {
  const t = await getTranslations(`auth.pages.${page}`);
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

/** The shell of one auth route with every text taken from `auth.pages.<page>`. */
export async function AuthPage({
  page,
  children,
}: {
  page: AuthPageKey;
  children: React.ReactNode;
}) {
  const t = await getTranslations(`auth.pages.${page}`);

  return (
    <AuthShell
      eyebrow={t("eyebrow")}
      title={t("title")}
      description={t("description")}
      alternateText={t("alternateText")}
      alternateLabel={t("alternateLabel")}
      alternateHref={alternateHrefs[page]}
      asideTitle={t("asideTitle")}
      asideDescription={t("asideDescription")}
      features={[t("feature1"), t("feature2"), t("feature3")]}
    >
      {children}
    </AuthShell>
  );
}
