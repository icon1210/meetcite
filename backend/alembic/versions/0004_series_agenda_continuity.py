"""meeting series (project memory), agendas and cross-meeting continuity

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-11
"""

import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "series",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_series_user_id", "series", ["user_id"])
    # batch_alter_table lets the same migration run on SQLite (development) and PostgreSQL.
    with op.batch_alter_table("meetings") as t:
        t.add_column(sa.Column("series_id", sa.Integer(), nullable=True))
        t.add_column(sa.Column("agenda", sa.Text(), nullable=True))
        t.create_foreign_key("fk_meetings_series_id", "series", ["series_id"], ["id"], ondelete="SET NULL")
        t.create_index("ix_meetings_series_id", ["series_id"])
    with op.batch_alter_table("summaries") as t:
        t.add_column(sa.Column("continuity", sa.JSON(), nullable=False, server_default="{}"))
        t.add_column(sa.Column("agenda_review", sa.JSON(), nullable=False, server_default="{}"))


def downgrade() -> None:
    with op.batch_alter_table("summaries") as t:
        t.drop_column("agenda_review")
        t.drop_column("continuity")
    with op.batch_alter_table("meetings") as t:
        t.drop_index("ix_meetings_series_id")
        t.drop_constraint("fk_meetings_series_id", type_="foreignkey")
        t.drop_column("agenda")
        t.drop_column("series_id")
    op.drop_index("ix_series_user_id", table_name="series")
    op.drop_table("series")
