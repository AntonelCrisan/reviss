import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthPage, authPageMetadata } from "@/components/auth/auth-page";

export function generateMetadata() {
  return authPageMetadata("register");
}

type RegisterPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const { error } = await searchParams;
  const t = await getTranslations("auth");
  const initialError =
    firstSearchParam(error) === "google_oauth" ? t("googleFailed") : undefined;

  return (
    <AuthPage page="register">
      <AuthForm mode="register" initialError={initialError} />
    </AuthPage>
  );
}
