"""phase_1_intelligence_tables

Revision ID: a1b2c3d4e5f6
Revises: 7c229fb462e7
Create Date: 2026-05-16 07:00:00.000000

Adds Phase 1 tables:
  - sanction_records   (OpenSanctions screening results)
  - risk_records       (computed risk events)
  - watchdog_runs      (ingestion audit log)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "7c229fb462e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create Phase 1 tables."""

    # sanction_records
    op.create_table(
        "sanction_records",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("entity_name", sa.String(), nullable=False),
        sa.Column("risk_score", sa.Integer(), nullable=True),
        sa.Column("is_sanctioned", sa.String(), nullable=True),
        sa.Column("datasets", sa.JSON(), nullable=True),
        sa.Column("match_count", sa.Integer(), nullable=True),
        sa.Column("raw_result", sa.JSON(), nullable=True),
        sa.Column("checked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_sanction_records_entity_name",
        "sanction_records",
        ["entity_name"],
    )

    # risk_records
    op.create_table(
        "risk_records",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("source_provider", sa.String(), nullable=False),
        sa.Column("source_entity_id", sa.String(), nullable=True),
        sa.Column("risk_type", sa.String(), nullable=True),
        sa.Column("severity", sa.String(), nullable=True),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("affected_countries", sa.JSON(), nullable=True),
        sa.Column("affected_hs_codes", sa.JSON(), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    # watchdog_runs
    op.create_table(
        "watchdog_runs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("records_fetched", sa.Integer(), nullable=True),
        sa.Column("records_stored", sa.Integer(), nullable=True),
        sa.Column("errors", sa.Integer(), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Drop Phase 1 tables."""
    op.drop_table("watchdog_runs")
    op.drop_index("ix_sanction_records_entity_name", table_name="sanction_records")
    op.drop_table("risk_records")
    op.drop_table("sanction_records")
