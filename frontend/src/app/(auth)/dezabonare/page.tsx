import { AuthPage, authPageMetadata } from "@/components/auth/auth-page";
import { UnsubscribeClient } from "@/components/auth/unsubscribe-client";

export function generateMetadata() {
  return authPageMetadata("unsubscribe");
}

type UnsubscribePageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function UnsubscribePage({
  searchParams,
}: UnsubscribePageProps) {
  const { token } = await searchParams;

  return (
    <AuthPage page="unsubscribe">
      <UnsubscribeClient token={token} />
    </AuthPage>
  );
}
