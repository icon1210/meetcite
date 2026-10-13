"""detailed minutes and fact-check results

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-08
"""

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # batch_alter_table lets the same migration run on SQLite (development) and PostgreSQL.
    with op.batch_alter_table("summaries") as t:
        t.add_column(sa.Column("overview", sa.Text(), nullable=False, server_default=""))
        t.add_column(sa.Column("topics", sa.JSON(), nullable=False, server_default="[]"))
        t.add_column(sa.Column("open_questions", sa.JSON(), nullable=False, server_default="[]"))
        t.add_column(sa.Column("risks", sa.JSON(), nullable=False, server_default="[]"))
        t.add_column(sa.Column("verification", sa.JSON(), nullable=False, server_default="{}"))
    for table in ("decisions", "action_items"):
        with op.batch_alter_table(table) as t:
            t.add_column(sa.Column("verdict", sa.String(20), nullable=False, server_default="unverified"))
            t.add_column(sa.Column("verdict_note", sa.Text(), nullable=True))


def downgrade() -> None:
    for table in ("decisions", "action_items"):
        with op.batch_alter_table(table) as t:
            t.drop_column("verdict_note")
            t.drop_column("verdict")
    with op.batch_alter_table("summaries") as t:
        for col in ("verification", "risks", "open_questions", "topics", "overview"):
            t.drop_column(col)
