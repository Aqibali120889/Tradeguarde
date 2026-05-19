# services/models.py
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime

class Base(DeclarativeBase):
    pass

# ------------------------------------------------------------
# 1. Users & Organizations (for future auth)
# ------------------------------------------------------------
class Organization(Base):
    __tablename__ = "organizations"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(ForeignKey("organizations.id"), nullable=False)
    email = Column(String, unique=True, nullable=False)
    role = Column(String, default="member")
    created_at = Column(DateTime, default=datetime.utcnow)

# ------------------------------------------------------------
# 2. Products & BOM
# ------------------------------------------------------------
class Product(Base):
    __tablename__ = "products"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(ForeignKey("organizations.id"), nullable=False)
    sku = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    hs_code = Column(String)
    bom = Column(JSON)                # Bill of Materials as structured JSON
    supplier_ids = Column(JSON)       # Array of supplier IDs
    created_at = Column(DateTime, default=datetime.utcnow)

# ------------------------------------------------------------
# 3. Regulations
# ------------------------------------------------------------
class Regulation(Base):
    __tablename__ = "regulations"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String)
    source_url = Column(String, unique=True)
    published_date = Column(DateTime)
    raw_text = Column(Text)
    normalized_event = Column(JSON)   # structured data from Watchdog
    embedding_id = Column(String)     # reference to Qdrant vector
    created_at = Column(DateTime, default=datetime.utcnow)

# ------------------------------------------------------------
# 4. Impact Analyses & Action Plans (cycle removed)
# ------------------------------------------------------------
class ImpactAnalysis(Base):
    __tablename__ = "impact_analyses"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(ForeignKey("organizations.id"), nullable=False)
    regulation_id = Column(ForeignKey("regulations.id"), nullable=False)
    analysis_json = Column(JSON)       # Gemini output
    action_plan_id = Column(ForeignKey("action_plans.id"), nullable=True)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)

class ActionPlan(Base):
    __tablename__ = "action_plans"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(ForeignKey("organizations.id"), nullable=False)
    # cycle breaker: no analysis_id FK here
    steps = Column(JSON)               # array of steps
    approval_required = Column(String, default="false")
    approved_by = Column(String)
    executed_at = Column(DateTime)

# ------------------------------------------------------------
# 5. Execution Logs
# ------------------------------------------------------------
class ExecutionLog(Base):
    __tablename__ = "execution_logs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    action_plan_id = Column(ForeignKey("action_plans.id"), nullable=False)
    step_index = Column(Integer)
    api_call_details = Column(JSON)
    response = Column(JSON)
    status = Column(String)            # success, failed, retrying
    timestamp = Column(DateTime, default=datetime.utcnow)

# ------------------------------------------------------------
# 6. Notifications
# ------------------------------------------------------------
class Notification(Base):
    __tablename__ = "notifications"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(ForeignKey("organizations.id"), nullable=False)
    event_type = Column(String)
    channel = Column(String)           # email, slack, dashboard
    content = Column(Text)
    recipient = Column(String)
    sent_at = Column(DateTime)
    status = Column(String, default="pending")


# ------------------------------------------------------------
# 7. Sanctions Records  (Phase 1)
# ------------------------------------------------------------
class SanctionRecord(Base):
    """Persisted result of an OpenSanctions company screening."""
    __tablename__ = "sanction_records"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_name = Column(String, nullable=False, index=True)
    risk_score = Column(Integer)           # 0-100 scaled from 0.0-1.0
    is_sanctioned = Column(String, default="false")   # "true"/"false" (String for compat)
    datasets = Column(JSON)                # list of dataset names matched
    match_count = Column(Integer, default=0)
    raw_result = Column(JSON)              # full SanctionCheckResult
    checked_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)


# ------------------------------------------------------------
# 8. Risk Records  (Phase 1)
# ------------------------------------------------------------
class RiskRecord(Base):
    """Computed risk event derived from any data source."""
    __tablename__ = "risk_records"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_provider = Column(String, nullable=False)   # "gta" | "wto" | "opensanctions"
    source_entity_id = Column(String)     # regulation_id or sanction_record id
    risk_type = Column(String)             # e.g. "TARIFF_HIKE", "SANCTION_HIT"
    severity = Column(String)              # "critical"|"high"|"medium"|"low"|"info"
    score = Column(Integer)                # 0-100
    title = Column(String)
    description = Column(Text)
    affected_countries = Column(JSON)
    affected_hs_codes = Column(JSON)
    raw_payload = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)


# ------------------------------------------------------------
# 9. Watchdog Run Audit Log  (Phase 1)
# ------------------------------------------------------------
class WatchdogRun(Base):
    """Audit log entry for each external data ingestion run."""
    __tablename__ = "watchdog_runs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source = Column(String, nullable=False)   # "gta" | "wto" | "opensanctions" | "all"
    status = Column(String, default="started")  # started | completed | failed
    records_fetched = Column(Integer, default=0)
    records_stored = Column(Integer, default=0)
    errors = Column(Integer, default=0)
    error_detail = Column(Text)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)