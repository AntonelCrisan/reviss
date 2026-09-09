from urllib.parse import urlparse

from fastapi import HTTPException, Request, status

from app.api.dependencies import AppSettings

# Every deployment hop that adds to X-Forwarded-For (the Railway edge, the
# Next.js proxy) appends to the right. Anything a client sends itself sits
# on the left, so only the rightmost entry can be trusted: reading the first
# one let a request pick its own rate-limit bucket.
MAX_CLIENT_IP_LENGTH = 64


def client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    for candidate in reversed(forwarded_for.split(",")):
        cleaned = candidate.strip()
        if cleaned:
            return cleaned[:MAX_CLIENT_IP_LENGTH]

    return request.client.host if request.client is not None else None


def request_origin(request: Request) -> str | None:
    origin = request.headers.get("origin")
    if origin:
        return origin.rstrip("/")

    referer = request.headers.get("referer")
    if not referer:
        return None

    parsed_referer = urlparse(referer)
    if not parsed_referer.scheme or not parsed_referer.netloc:
        return None
    return f"{parsed_referer.scheme}://{parsed_referer.netloc}"


def protect_state_changing_request(request: Request, settings: AppSettings) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return

    origin = request_origin(request)
    if origin is None:
        return

    if origin not in {allowed.rstrip("/") for allowed in settings.allowed_origins}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cererea nu a putut fi verificata.",
        )
