# Railway deployment

Reviss is an isolated monorepo. Deploy it in Railway as four services in one
project:

- `Postgres`: Railway PostgreSQL database.
- `Redis`: Railway Redis database for shared rate limiting.
- `backend`: FastAPI service from `/backend`.
- `frontend`: Next.js service from `/frontend`.

## Service settings

Use the root-level config files below. They point Railway to dedicated
Dockerfiles, so the service can keep the repository root as its source and does
not need Railpack to auto-detect a monorepo.

### Backend

- Source Root Directory: `/`
- Railway Config File: `/railway.backend.toml`
- Public Networking: optional; keep it private if only the frontend calls it
- Dockerfile: `Dockerfile.backend`
- Start Command: handled by the Dockerfile
- Pre-deploy Command: `python -m alembic upgrade head`
- Healthcheck Path: `/api/ready`

### Frontend

- Source Root Directory: `/`
- Railway Config File: `/railway.frontend.toml`
- Public Networking: generate a domain, then attach `reviss.app`
- Dockerfile: `Dockerfile.frontend`
- Start Command: handled by the Dockerfile
- Healthcheck Path: `/`

If you instead deploy from a subdirectory root, set root `/backend` or
`/frontend` manually in Railway. Do not mix subdirectory source roots with the
root-level config files above.

## Backend variables

Set these on the `backend` service:

```env
ENVIRONMENT=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
SESSION_SECRET=<generate-a-strong-32+-character-secret>
CRON_SECRET=<generate-a-strong-32+-character-secret>
SESSION_COOKIE_NAME=revizzio_session
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax
PUBLIC_APP_URL=https://www.reviss.app
EMAIL_LOGO_URL=https://www.reviss.app/assets/logos/Reviss_logo_dark.svg
REDIS_URL=${{Redis.REDIS_URL}}
RATE_LIMIT_REDIS_REQUIRED=true
RECAPTCHA_SECRET_KEY=<google-recaptcha-v2-secret-key>
CONTACT_RATE_LIMIT_WINDOW_SECONDS=600
CONTACT_RATE_LIMIT_MAX_REQUESTS=5
PROJECT_UPLOAD_MAX_MB=100
MISTRAL_API_KEY=<mistral-api-key>
MISTRAL_OCR_API_URL=https://api.mistral.ai/v1/ocr
MISTRAL_OCR_MODEL=mistral-ocr-latest
MISTRAL_OCR_TIMEOUT_SECONDS=120
CORS_ORIGINS=https://reviss.app,https://www.reviss.app,https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
OPENAI_API_KEY=<openai-api-key>
OPENAI_REQUEST_TIMEOUT_SECONDS=600
OPENAI_QUIZ_REQUEST_TIMEOUT_SECONDS=900
RESEND_API_KEY=<resend-api-key>
RESEND_FROM_EMAIL=Reviss <noreply@reviss.app>
STRIPE_SECRET_KEY=<stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<stripe-webhook-secret>
STRIPE_API_BASE_URL=https://api.stripe.com/v1
STRIPE_CHECKOUT_SUCCESS_PATH=/upgrade?checkout=success&session_id={CHECKOUT_SESSION_ID}
STRIPE_CHECKOUT_CANCEL_PATH=/upgrade?checkout=cancelled
```

`DATABASE_URL` can use Railway's default `postgres://` or `postgresql://`
format. The backend normalizes it to the async SQLAlchemy driver internally.

`MISTRAL_API_KEY` enables OCR only for scanned PDF uploads on the Pro plan.
Beginner and Focus scanned PDFs are rejected before any OCR call.

## Daily notification digest (cron)

The backend does not run its own scheduler — `POST /api/internal/notifications/run-daily`
sends the daily email digest (and computes the "recapitulare zilnică" nudge)
when called, and does nothing on its own otherwise. It must be triggered once
a day by something external, with the `CRON_SECRET` value above sent either
as an `X-Cron-Secret` header or as an `Authorization: Bearer <secret>` header
(both are accepted, so templates that only support one or the other both
work):

```bash
curl -X POST https://api.reviss.app/api/internal/notifications/run-daily \
  -H "X-Cron-Secret: <same value as CRON_SECRET>"

# equivalent
curl -X POST https://api.reviss.app/api/internal/notifications/run-daily \
  -H "Authorization: Bearer <same value as CRON_SECRET>"
```

Any scheduler that can make one daily HTTPS request works — a Railway
service with a cron schedule running this `curl` command (e.g. the "Cron
Trigger External Webhook URL" Railway template, which sends the secret as an
`Authorization: Bearer` header), a GitHub Actions scheduled workflow, or an
external cron service (e.g. cron-job.org). Without `CRON_SECRET` set, the
endpoint returns 503 and does nothing; a request with the wrong secret
returns 401.

## Frontend variables

Set these on the `frontend` service:

```env
API_URL=http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:${{backend.PORT}}
NEXT_PUBLIC_SITE_URL=https://www.reviss.app
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=<google-recaptcha-v2-site-key>
```

If you rename Railway services, update the reference-variable namespaces above
to match the actual service names.

For Google reCAPTCHA, create a reCAPTCHA v2 Checkbox key and add `reviss.app`,
`www.reviss.app`, `localhost`, and `127.0.0.1` as allowed domains. Put the
public site key on the frontend service as `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` and
the secret key on the backend service as `RECAPTCHA_SECRET_KEY`. The contact
page also accepts `RECAPTCHA_SITE_KEY` on the frontend service as a runtime
fallback, but the `NEXT_PUBLIC_` variable is the safest Next.js convention for
frontend widgets.

After deploying the frontend, open `/api/public-config` on the production
domain. `recaptcha_configured` must be `true`; if it is `false`, the site key is
not available inside the frontend service.

Stripe webhook URL:

```text
https://www.reviss.app/api/payments/stripe/webhook
```

The frontend route forwards the raw webhook body and `Stripe-Signature` header
to the backend over Railway private networking.

## Deploy order

1. Create the Railway project.
2. Add PostgreSQL.
3. Add Redis.
4. Add the backend service from GitHub.
   - Source root: `/`
   - Railway Config File: `/railway.backend.toml`
5. Add backend variables, then deploy it.
6. Add the frontend service from GitHub.
   - Source root: `/`
   - Railway Config File: `/railway.frontend.toml`
7. Add frontend variables, then deploy it.
8. Attach `reviss.app` to the frontend service.
9. Configure Stripe webhook to `https://www.reviss.app/api/payments/stripe/webhook`.
10. Update backend `CORS_ORIGINS` and `PUBLIC_APP_URL` if the production domain
   changes, then redeploy backend.
11. In Google Search Console, submit `https://www.reviss.app/sitemap.xml`.

## Optional persistent uploads

Railway deploy storage is ephemeral. If uploaded project files must survive
redeploys, add a Railway Volume to the backend service and mount it at:

```text
/app/backend/storage/projects
```

## Useful local checks

```powershell
cd backend
python -m pytest
python -m ruff check .

cd ../frontend
npm.cmd run lint
npm.cmd run build
```
