"""summaries per configuration, evidence status, claim reviews, evaluation runs, speaker names

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-08

Generated notes (summaries, decisions, action items) are recreated with the new
structure: one summary per configuration. Transcripts are kept; existing meetings
can be re-summarized with the "Re-summarize" button.
"""

import sqlalchemy as sa

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def _notes_tables() -> None:
    op.create_table(
        "summaries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("meeting_id", sa.Integer(), sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("configuration", sa.String(20), nullable=False, server_default="llm"),
        sa.Column("prompt_version", sa.String(40), nullable=False, server_default=""),
        sa.Column("settings", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("timings", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("overview", sa.Text(), nullable=False, server_default=""),
        sa.Column("points", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("topics", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("open_questions", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("risks", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("verification", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("model_used", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_summaries_meeting_id", "summaries", ["meeting_id"])
    for name, extra in (
        ("decisions", [sa.Column("text", sa.Text(), nullable=False)]),
        (
            "action_items",
            [
                sa.Column("task", sa.Text(), nullable=False),
                sa.Column("owner", sa.String(120), nullable=True),
                sa.Column("deadline", sa.String(120), nullable=True),
                sa.Column("status", sa.String(20), nullable=False, server_default="open"),
            ],
        ),
    ):
        op.create_table(
            name,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("meeting_id", sa.Integer(), sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False),
            sa.Column("summary_id", sa.Integer(), sa.ForeignKey("summaries.id", ondelete="CASCADE"), nullable=False),
            *extra,
            sa.Column("source_segment_ids", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("evidence_status", sa.String(20), nullable=False, server_default="missing"),
            sa.Column("verdict", sa.String(20), nullable=False, server_default="unverified"),
            sa.Column("verdict_note", sa.Text(), nullable=True),
        )
        op.create_index(f"ix_{name}_meeting_id", name, ["meeting_id"])
        op.create_index(f"ix_{name}_summary_id", name, ["summary_id"])


def upgrade() -> None:
    with op.batch_alter_table("meetings") as t:
        t.add_column(sa.Column("source", sa.String(20), nullable=False, server_default="upload"))
        t.add_column(sa.Column("names_file_path", sa.String(500), nullable=True))
    with op.batch_alter_table("jobs") as t:
        t.add_column(sa.Column("configuration", sa.JSON(), nullable=False, server_default="{}"))
    with op.batch_alter_table("speakers") as t:
        t.add_column(sa.Column("suggested_name", sa.String(120), nullable=True))
        t.add_column(sa.Column("suggestion_reason", sa.Text(), nullable=True))
        t.add_column(sa.Column("suggestion_segment_ids", sa.JSON(), nullable=False, server_default="[]"))
    with op.batch_alter_table("segments") as t:
        t.add_column(sa.Column("edited_text", sa.Text(), nullable=True))

    op.drop_table("action_items")
    op.drop_table("decisions")
    op.drop_table("summaries")
    _notes_tables()

    op.create_table(
        "claim_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("meeting_id", sa.Integer(), sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reviewer_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("claim_type", sa.String(20), nullable=False),
        sa.Column("claim_key", sa.String(120), nullable=False),
        sa.Column("claim_text", sa.Text(), nullable=False),
        sa.Column("configuration", sa.String(20), nullable=False),
        sa.Column("label", sa.String(20), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("reviewer_id", "claim_key", name="uq_claim_review_reviewer_claim"),
    )
    op.create_index("ix_claim_reviews_meeting_id", "claim_reviews", ["meeting_id"])
    op.create_index("ix_claim_reviews_claim_key", "claim_reviews", ["claim_key"])
    op.create_table(
        "evaluation_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("experiment", sa.String(40), nullable=False),
        sa.Column("dataset_split", sa.String(40), nullable=False),
        sa.Column("model_config", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("prompt_version", sa.String(40), nullable=False, server_default=""),
        sa.Column("metrics", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("runtime_s", sa.Float(), nullable=False, server_default="0"),
        sa.Column("hardware", sa.String(200), nullable=False, server_default=""),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    # Meetings whose notes were removed above can be re-summarized from their transcript.
    op.execute("UPDATE meetings SET status = 'failed' WHERE status = 'completed'")
    op.execute(
        "UPDATE jobs SET error = 'MeetMind was upgraded. Press Retry to regenerate the notes from the transcript.' "
        "WHERE meeting_id IN (SELECT id FROM meetings WHERE status = 'failed')"
    )


def downgrade() -> None:
    raise NotImplementedError("Downgrading past 0003 is not supported; restore a backup instead.")
