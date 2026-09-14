/**
 * Human labels for audit actions.
 *
 * Only actions that actually land in `audit_logs` belong here. Compliance
 * events (contact messages, cookie consent, withdrawal requests) are written
 * to `compliance_events`, so labels for those would promise rows this page
 * can never show.
 */
export const auditActionLabels: Record<string, string> = {
  "account.deletion_requested": "Ștergere cont solicitată",
  "admin.account_deletion_request.completed":
    "Solicitare ștergere cont rezolvată",
  "admin.account_deletion_request.email_failed": "Email ștergere cont eșuat",
  "admin.addon_packs.updated": "Pachete extra actualizate",
  "admin.addon_resources.updated": "Resurse extra actualizate",
  "admin.ai_credit_rates.updated": "Tarife credite AI actualizate",
  "admin.ai_model_rates.updated": "Tarife modele AI actualizate",
  "admin.company_data.updated": "Date companie actualizate",
  "admin.legal_document_section.created": "Secțiune legală adăugată",
  "admin.legal_document_section.deleted": "Secțiune legală ștearsă",
  "admin.legal_document_section.updated": "Secțiune legală actualizată",
  "admin.plan_translations.updated": "Traduceri planuri actualizate",
  "admin.subscription.manual_plan.granted": "Plan acordat manual",
  "admin.subscription.manual_plan.revoked": "Plan manual retras",
  "admin.subscription.resynced": "Abonament resincronizat cu Stripe",
  "admin.subscription_plans.updated": "Planuri de abonament actualizate",
  "admin.usage.reset": "Limite de utilizare resetate",
  "admin.user.delete": "Utilizator șters",
  "admin.user.delete_email_failed": "Email ștergere utilizator eșuat",
  "admin.user.update": "Utilizator actualizat",
  "admin.user.verification_email_failed": "Email de verificare eșuat",
  "admin.user.verification_email_requested": "Email de verificare trimis",
  "ai.cost_ceiling_reached": "Plafon de cost AI atins",
  "auth.email_change_email_failed": "Email schimbare adresă eșuat",
  "auth.email_change_failed": "Schimbare adresă email eșuată",
  "auth.email_change_requested": "Schimbare adresă email solicitată",
  "auth.email_changed": "Adresă de email schimbată",
  "auth.email_verified_and_registered": "Email verificat și cont creat",
  "auth.email_verified_existing_user": "Email verificat pentru cont existent",
  "auth.google_account_linked": "Cont Google asociat",
  "auth.logged_in": "Autentificare reușită",
  "auth.logged_out": "Delogare",
  "auth.login_blocked_pending_email_confirmation":
    "Autentificare blocată până la confirmarea emailului",
  "auth.login_failed": "Autentificare eșuată",
  "auth.logout_failed": "Delogare eșuată",
  "auth.password_change_failed": "Schimbare parolă eșuată",
  "auth.password_changed": "Parolă schimbată",
  "auth.password_reset_completed": "Parolă resetată",
  "auth.password_reset_duplicate_confirm_ignored":
    "Confirmare duplicată resetare parolă ignorată",
  "auth.password_reset_email_failed": "Email resetare parolă eșuat",
  "auth.password_reset_request_ignored_active_token":
    "Resetare parolă ignorată, token activ",
  "auth.password_reset_requested": "Resetare parolă solicitată",
  "auth.password_reset_requested_ignored": "Resetare parolă ignorată",
  "auth.register_failed": "Înregistrare eșuată",
  "auth.registered_via_google": "Cont creat prin Google",
  "auth.registration_email_failed": "Email de confirmare înregistrare eșuat",
  "auth.registration_verification_requested":
    "Email de confirmare înregistrare trimis",
  "stripe.addon.checkout_started": "Cumpărare extra inițiată",
  "stripe.addon.purchased": "Capacitate extra cumpărată",
  "stripe.checkout_session.created": "Checkout Stripe creat",
  "stripe.checkout_session.synced": "Checkout Stripe sincronizat",
  "stripe.invoice_email.failed": "Email factură eșuat",
  "stripe.invoice_email.sent": "Email factură trimis",
  "stripe.subscription.cancel_at_period_end.disabled":
    "Reînnoire abonament reactivată",
  "stripe.subscription.cancel_at_period_end.enabled":
    "Reînnoire abonament oprită",
  "stripe.subscription.superseded_cancel_failed":
    "Anulare abonament înlocuit eșuată",
  "stripe.subscription.superseded_cancelled": "Abonament înlocuit anulat",
  "stripe.webhook.checkout.session.completed": "Stripe: checkout finalizat",
  "stripe.webhook.customer.subscription.created": "Stripe: abonament creat",
  "stripe.webhook.customer.subscription.deleted": "Stripe: abonament șters",
  "stripe.webhook.customer.subscription.updated": "Stripe: abonament actualizat",
  "stripe.webhook.invoice.paid": "Stripe: factură plătită",
  "stripe.webhook.invoice.payment_failed": "Stripe: plată eșuată",
  "stripe.webhook.invoice.payment_succeeded": "Stripe: plată reușită",
  "user.data_export_requested": "Export date solicitat",
  "user.full_name.updated": "Nume actualizat",
  "user.newsletter_consent_withdrawn": "Consimțământ newsletter retras",
  "user.preferences.updated": "Preferințe utilizator actualizate",
  "user.study_preferences.updated": "Preferințe de studiu actualizate",
};

function fallbackActionLabel(action: string) {
  return action
    .replace(/[_:.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (firstLetter) => firstLetter.toUpperCase());
}

export function actionLabel(action: string) {
  return auditActionLabels[action] ?? fallbackActionLabel(action);
}
