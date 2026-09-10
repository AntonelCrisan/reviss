import { AuthForm } from "@/components/auth/auth-form";
import { AuthPage, authPageMetadata } from "@/components/auth/auth-page";

export function generateMetadata() {
  return authPageMetadata("forgotPassword");
}

export default function ForgotPasswordPage() {
  return (
    <AuthPage page="forgotPassword">
      <AuthForm mode="forgot-password" />
    </AuthPage>
  );
}
