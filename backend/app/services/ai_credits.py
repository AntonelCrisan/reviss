import logging
from datetime import datetime
from decimal import Decimal
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AiCreditRate, AiModelRate, AiUsageLog, User
from app.services.addons import balance_of
from app.services.audit import add_audit_log
from app.services.plan_errors import (
    AiCreditsLimitReachedError,
    CostCeilingReachedError,
    FeatureNotAvailableError,
    OcrLimitReachedError,
)

logger = logging.getLogger("revizzio.ai_credits")

AiFeature = Literal["chat", "quiz", "flashcards", "summary", "explanation", "ocr"]
SizeTier = Literal["small", "medium", "large"]

AI_CHAT_GATED_FEATURES: frozenset[str] = frozenset({"chat", "explanation"})

_PLAN_AI_FALLBACK: dict[str, dict[str, object]] = {
    "start": {
        "monthly_ai_credits": 10,
        "ai_chat_enabled": False,
        "monthly_ocr_pages": 0,
        "max_openai_cost_usd_per_cycle": Decimal("2.00"),
    },
    "focus": {
        "monthly_ai_credits": 60,
        "ai_chat_enabled": True,
        "monthly_ocr_pages": 200,
        "max_openai_cost_usd_per_cycle": Decimal("6.00"),
    },
    "pro": {
        "monthly_ai_credits": 120,
        "ai_chat_enabled": True,
        "monthly_ocr_pages": 500,
        "max_openai_cost_usd_per_cycle": Decimal("12.00"),
    },
}


def _plan_slug(user: User) -> str:
    plan = getattr(user, "current_plan", None)
    slug = getattr(plan, "slug", None)
    if isinstance(slug, str) and slug.strip():
        return slug.strip().lower()
    return "start"


def _plan_int_field(user: User, field: str) -> int:
    plan = getattr(user, "current_plan", None)
    value = getattr(plan, field, None)
    if not isinstance(value, bool):
        try:
            return int(value)
        except (TypeError, ValueError):
            pass
    fallback = _PLAN_AI_FALLBACK.get(_plan_slug(user), _PLAN_AI_FALLBACK["start"])
    return int(fallback[field])


def monthly_ai_credits(user: User) -> int:
    return _plan_int_field(user, "monthly_ai_credits") + balance_of(user).ai_credits


def ai_chat_enabled(user: User) -> bool:
    plan = getattr(user, "current_plan", None)
    value = getattr(plan, "ai_chat_enabled", None)
    if isinstance(value, bool):
        return value
    fallback = _PLAN_AI_FALLBACK.get(_plan_slug(user), _PLAN_AI_FALLBACK["start"])
    return bool(fallback["ai_chat_enabled"])


def monthly_ocr_pages(user: User) -> int:
    return _plan_int_field(user, "monthly_ocr_pages") + balance_of(user).ocr_pages


def _addon_cost_headroom(user: User) -> Decimal:
    """Extra spend allowance earned by buying AI credits.

    The spend ceiling exists to stop one account burning unbounded money at the
    provider. Bought credits have to raise it too, or a customer would pay for
    credits the ceiling then refuses to let them spend. The per-credit rate
    comes from the plan itself, so repricing a plan carries the pack with it.
    """
    extra_credits = balance_of(user).ai_credits
    if extra_credits <= 0:
        return Decimal("0")

    plan = getattr(user, "current_plan", None)
    plan_credits = getattr(plan, "monthly_ai_credits", None)
    plan_ceiling = getattr(plan, "max_openai_cost_usd_per_cycle", None)
    if (
        not isinstance(plan_credits, int)
        or isinstance(plan_credits, bool)
        or plan_credits <= 0
        or plan_ceiling is None
        or isinstance(plan_ceiling, bool)
    ):
        return Decimal("0")

    try:
        per_credit = Decimal(str(plan_ceiling)) / Decimal(plan_credits)
    except (ArithmeticError, ValueError):
        return Decimal("0")

    return per_credit * Decimal(extra_credits)


def _max_cost_usd_per_cycle(user: User) -> Decimal:
    plan = getattr(user, "current_plan", None)
    value = getattr(plan, "max_openai_cost_usd_per_cycle", None)
    headroom = _addon_cost_headroom(user)
    if value is not None and not isinstance(value, bool):
        try:
            return Decimal(str(value)) + headroom
        except (TypeError, ValueError, ArithmeticError):
            pass
    fallback = _PLAN_AI_FALLBACK.get(_plan_slug(user), _PLAN_AI_FALLBACK["start"])
    return Decimal(str(fallback["max_openai_cost_usd_per_cycle"])) + headroom


class AiCreditsService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def determine_tier(self, feature: AiFeature, size_signal: int) -> SizeTier:
        rates = list(
            (
                await self._session.scalars(
                    select(AiCreditRate).where(AiCreditRate.feature == feature)
                )
            ).all()
        )
        bounded = sorted(
            (rate for rate in rates if rate.threshold_max is not None),
            key=lambda rate: rate.threshold_max,  # type: ignore[arg-type,return-value]
        )
        for rate in bounded:
            if size_signal <= rate.threshold_max:  # type: ignore[operator]
                return rate.size_tier  # type: ignore[return-value]
        return "large"

    async def credits_for(self, feature: AiFeature, size_tier: SizeTier) -> int:
        rate = await self._session.scalar(
            select(AiCreditRate).where(
                AiCreditRate.feature == feature,
                AiCreditRate.size_tier == size_tier,
            )
        )
        return rate.credits if rate is not None else 1

    async def credits_used_this_cycle(
        self,
        user: User,
        window_start: datetime,
        window_end: datetime,
    ) -> int:
        used = await self._session.scalar(
            select(func.coalesce(func.sum(AiUsageLog.ai_credits_charged), 0)).where(
                AiUsageLog.user_id == user.id,
                AiUsageLog.created_at >= window_start,
                AiUsageLog.created_at < window_end,
            )
        )
        return int(used or 0)

    async def _model_rate(self, model: str) -> AiModelRate | None:
        return await self._session.scalar(
            select(AiModelRate).where(AiModelRate.model == model)
        )

    async def estimate_cost_usd(
        self,
        model: str | None,
        input_tokens: int | None,
        output_tokens: int | None,
    ) -> Decimal | None:
        if not model or input_tokens is None or output_tokens is None:
            return None
        rate = await self._model_rate(model)
        if rate is None:
            return None
        return (
            Decimal(input_tokens) / Decimal(1000) * rate.cost_per_1k_input_tokens
            + Decimal(output_tokens) / Decimal(1000) * rate.cost_per_1k_output_tokens
        )

    async def _cost_used_this_cycle(
        self,
        user: User,
        window_start: datetime,
        window_end: datetime,
    ) -> Decimal:
        used = await self._session.scalar(
            select(func.coalesce(func.sum(AiUsageLog.estimated_cost_usd), 0)).where(
                AiUsageLog.user_id == user.id,
                AiUsageLog.created_at >= window_start,
                AiUsageLog.created_at < window_end,
            )
        )
        return Decimal(used or 0)

    async def _ensure_under_cost_ceiling(
        self,
        *,
        user: User,
        window: tuple[datetime, datetime],
    ) -> None:
        window_start, window_end = window
        used = await self._cost_used_this_cycle(user, window_start, window_end)
        ceiling = _max_cost_usd_per_cycle(user)
        if used < ceiling:
            return

        try:
            add_audit_log(
                self._session,
                action="ai.cost_ceiling_reached",
                status="failure",
                actor=user,
                resource_type="ai_usage",
                details={
                    "used_usd": str(used),
                    "ceiling_usd": str(ceiling),
                    "plan": _plan_slug(user),
                },
            )
            await self._session.commit()
        except Exception:
            logger.exception(
                "Failed to write cost-ceiling audit log for user %s.", user.id
            )
            await self._session.rollback()

        raise CostCeilingReachedError(
            "Plafonul intern de cost AI pentru acest ciclu a fost atins."
        )

    async def ensure_can_consume(
        self,
        *,
        user: User,
        feature: AiFeature,
        tier: SizeTier,
        window: tuple[datetime, datetime],
    ) -> int:
        if feature in AI_CHAT_GATED_FEATURES and not ai_chat_enabled(user):
            raise FeatureNotAvailableError(
                "Functionalitatea AI nu este disponibila pe planul curent. "
                "Treci la un plan superior pentru acces."
            )

        await self._ensure_under_cost_ceiling(user=user, window=window)

        credits_needed = await self.credits_for(feature, tier)
        window_start, window_end = window
        used = await self.credits_used_this_cycle(user, window_start, window_end)
        monthly_credits = monthly_ai_credits(user)
        if used + credits_needed > monthly_credits:
            raise AiCreditsLimitReachedError(
                f"Ai folosit {used}/{monthly_credits} AI Credits din planul "
                "curent. Poti face upgrade la un plan superior sau poti "
                "astepta resetarea din ciclul viitor."
            )
        return credits_needed

    async def ocr_pages_used_this_cycle(
        self,
        user: User,
        window_start: datetime,
        window_end: datetime,
    ) -> int:
        used = await self._session.scalar(
            select(func.coalesce(func.sum(AiUsageLog.ocr_pages_charged), 0)).where(
                AiUsageLog.user_id == user.id,
                AiUsageLog.feature == "ocr",
                AiUsageLog.created_at >= window_start,
                AiUsageLog.created_at < window_end,
            )
        )
        return int(used or 0)

    async def ensure_ocr_budget(
        self,
        *,
        user: User,
        pages_needed: int,
        window: tuple[datetime, datetime],
    ) -> None:
        window_start, window_end = window
        used = await self.ocr_pages_used_this_cycle(user, window_start, window_end)
        monthly_pages = monthly_ocr_pages(user)
        if used + pages_needed > monthly_pages:
            raise OcrLimitReachedError(
                f"Ai folosit deja {used}/{monthly_pages} pagini OCR din planul "
                "curent in acest ciclu de facturare. Poti face upgrade la un "
                "plan superior sau poti astepta resetarea din ciclul viitor."
            )

    async def charge(
        self,
        *,
        user: User,
        feature: AiFeature,
        tier: SizeTier | None,
        credits: int,
        model: str | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        cached_tokens: int | None = None,
        estimated_cost_usd: Decimal | None = None,
        ocr_pages: int = 0,
    ) -> None:
        try:
            if estimated_cost_usd is None:
                estimated_cost_usd = await self.estimate_cost_usd(
                    model,
                    input_tokens,
                    output_tokens,
                )
            log = AiUsageLog(
                user_id=user.id,
                subscription_plan_slug=_plan_slug(user),
                feature=feature,
                size_tier=tier,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cached_tokens=cached_tokens,
                estimated_cost_usd=estimated_cost_usd,
                ai_credits_charged=credits,
                ocr_pages_charged=ocr_pages,
            )
            self._session.add(log)
            await self._session.commit()
        except Exception:
            logger.exception(
                "Failed to log AI usage for user %s feature %s.", user.id, feature
            )
            await self._session.rollback()
