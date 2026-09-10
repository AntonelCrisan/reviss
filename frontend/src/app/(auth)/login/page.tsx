import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthPage, authPageMetadata } from "@/components/auth/auth-page";

export function generateMetadata() {
  return authPageMetadata("login");
}

type LoginPageProps = {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
};

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, error } = await searchParams;
  const t = await getTranslations("auth");
  const initialError =
    firstSearchParam(error) === "google_oauth" ? t("googleFailed") : undefined;

  return (
    <AuthPage page="login">
      <AuthForm
        mode="login"
        redirectTo={firstSearchParam(next)}
        initialError={initialError}
      />
    </AuthPage>
  );
}
