"""Price the AI so the spend ceiling can do its job.

The model rates were zero, so every call was estimated at $0.00 and the
per-cycle ceiling never triggered. Measured on real generations at list
prices (luna $1/$6, terra $2.50/$15 per 1M tokens): a study pack costs about
$0.30, an exam quiz about $0.29, a chat answer under $0.01. The credit rates
and plan limits follow from that, with one credit worth about $0.025.

Revision ID: 20260921_0058
Revises: 20260921_0057
"""

import sqlalchemy as sa
from alembic import op

revision = "20260921_0058"
down_revision = "20260921_0057"
branch_labels = None
depends_on = None

# model -> (cost per 1k input tokens, cost per 1k output tokens)
MODEL_RATES = {
    "gpt-5.6-luna": ("0.001000", "0.006000"),
    "gpt-5.6-terra": ("0.002500", "0.015000"),
}

# (feature, size_tier) -> (threshold_max, credits)
CREDIT_RATES = {
    # Pages of material. A 60-page course measured $0.30.
    ("summary", "small"): (20, 4),
    ("summary", "medium"): (75, 14),
    ("summary", "large"): (None, 30),
    # Questions, doubled for high/exam: those batches carry the whole summary.
    ("quiz", "small"): (8, 5),
    ("quiz", "medium"): (16, 9),
    ("quiz", "large"): (None, 16),
    ("flashcards", "small"): (20, 3),
    ("flashcards", "medium"): (40, 5),
    ("flashcards", "large"): (None, 8),
    ("chat", "small"): (4000, 1),
    ("chat", "large"): (None, 2),
    ("explanation", "small"): (None, 1),
}

# slug -> plan limits. Credits are the real budget; the rest is a safety net.
PLANS = {
    "start": {
        "monthly_ai_credits": 30,
        "max_openai_cost_usd_per_cycle": "1.00",
        "active_project_limit": 1,
        "active_project_slots": 1,
        "monthly_material_limit": 3,
        "files_per_project_limit": 3,
        "file_size_limit_mb": 10,
        "project_size_limit_mb": 20,
        "estimated_page_limit": 25,
        "monthly_page_limit": 40,
        "initial_flashcard_limit": 20,
        "quiz_questions_per_quiz": 8,
        "quizzes_per_project_limit": 2,
        "ai_chat_enabled": False,
        "allow_scanned_documents": False,
        "monthly_ocr_pages": 0,
        "material_limit": "3 materiale procesate lunar",
    },
    "focus": {
        "monthly_ai_credits": 180,
        "max_openai_cost_usd_per_cycle": "5.50",
        "active_project_limit": 8,
        "active_project_slots": 8,
        "monthly_material_limit": 80,
        "files_per_project_limit": 10,
        "file_size_limit_mb": 50,
        "project_size_limit_mb": 200,
        "estimated_page_limit": 150,
        "monthly_page_limit": 800,
        "initial_flashcard_limit": 40,
        "quiz_questions_per_quiz": 12,
        "quizzes_per_project_limit": 5,
        "ai_chat_enabled": True,
        "allow_scanned_documents": False,
        "monthly_ocr_pages": 0,
        "material_limit": "80 materiale procesate lunar",
    },
    "pro": {
        "monthly_ai_credits": 320,
        "max_openai_cost_usd_per_cycle": "9.50",
        "active_project_limit": 20,
        "active_project_slots": 20,
        "monthly_material_limit": 240,
        "files_per_project_limit": 20,
        "file_size_limit_mb": 150,
        "project_size_limit_mb": 500,
        "estimated_page_limit": 400,
        "monthly_page_limit": 2000,
        "initial_flashcard_limit": 50,
        "quiz_questions_per_quiz": 20,
        "quizzes_per_project_limit": 10,
        "ai_chat_enabled": True,
        "allow_scanned_documents": True,
        "monthly_ocr_pages": 500,
        "material_limit": "240 materiale procesate lunar",
    },
}


def upgrade() -> None:
    connection = op.get_bind()

    for model, (input_cost, output_cost) in MODEL_RATES.items():
        connection.execute(
            sa.text(
                """
                INSERT INTO ai_model_rates
                    (id, model, cost_per_1k_input_tokens, cost_per_1k_output_tokens)
                VALUES (gen_random_uuid(), :model, :input_cost, :output_cost)
                ON CONFLICT (model) DO UPDATE SET
                    cost_per_1k_input_tokens = EXCLUDED.cost_per_1k_input_tokens,
                    cost_per_1k_output_tokens = EXCLUDED.cost_per_1k_output_tokens,
                    updated_at = now()
                """
            ),
            {"model": model, "input_cost": input_cost, "output_cost": output_cost},
        )

    for (feature, size_tier), (threshold_max, credits) in CREDIT_RATES.items():
        connection.execute(
            sa.text(
                """
                UPDATE ai_credit_rates
                SET threshold_max = :threshold_max, credits = :credits,
                    updated_at = now()
                WHERE feature = :feature AND size_tier = :size_tier
                """
            ),
            {
                "feature": feature,
                "size_tier": size_tier,
                "threshold_max": threshold_max,
                "credits": credits,
            },
        )

    for slug, values in PLANS.items():
        assignments = ", ".join(f"{column} = :{column}" for column in values)
        connection.execute(
            sa.text(
                f"UPDATE subscription_plans SET {assignments}, updated_at = now() "
                "WHERE slug = :slug"
            ),
            {**values, "slug": slug},
        )

    # Extra credits stay roughly 3.5x their cost after VAT and card fees.
    connection.execute(
        sa.text(
            """
            UPDATE addon_resources
            SET unit_price_ron = '0.50', min_quantity = 20, step = 10,
                updated_at = now()
            WHERE resource_key = 'ai_credits'
            """
        )
    )


def downgrade() -> None:
    # The previous values were the unpriced defaults; putting the zero rates
    # back is what makes this reversible, not the plan numbers.
    op.get_bind().execute(
        sa.text(
            "UPDATE ai_model_rates SET cost_per_1k_input_tokens = 0, "
            "cost_per_1k_output_tokens = 0"
        )
    )
