import { AuthPage, authPageMetadata } from "@/components/auth/auth-page";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export function generateMetadata() {
  return authPageMetadata("resetPassword");
}

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const { token } = await searchParams;

  return (
    <AuthPage page="resetPassword">
      <ResetPasswordForm token={token} />
    </AuthPage>
  );
}
