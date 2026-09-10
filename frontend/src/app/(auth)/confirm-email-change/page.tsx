import { AuthPage, authPageMetadata } from "@/components/auth/auth-page";
import { ConfirmEmailChangeClient } from "@/components/auth/confirm-email-change-client";

export function generateMetadata() {
  return authPageMetadata("confirmEmailChange");
}

type ConfirmEmailChangePageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ConfirmEmailChangePage({
  searchParams,
}: ConfirmEmailChangePageProps) {
  const { token } = await searchParams;

  return (
    <AuthPage page="confirmEmailChange">
      <ConfirmEmailChangeClient token={token} />
    </AuthPage>
  );
}
