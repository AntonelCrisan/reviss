import { AuthPage, authPageMetadata } from "@/components/auth/auth-page";
import { VerifyEmailClient } from "@/components/auth/verify-email-client";

export function generateMetadata() {
  return authPageMetadata("verifyEmail");
}

type VerifyEmailPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const { token } = await searchParams;

  return (
    <AuthPage page="verifyEmail">
      <VerifyEmailClient token={token} />
    </AuthPage>
  );
}
