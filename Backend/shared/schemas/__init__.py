# shared/schemas/__init__.py
"""
Convenience re-exports so callers can do:
    from shared.schemas import RegulationCreate, ApiResponse, RiskEvent
"""
from shared.schemas.intelligence import (  # noqa: F401
    ApiResponse,
    RegulationEvent,
    RiskEvent,
    RiskSeverity,
    SanctionCheckRequest,
    SanctionCheckResult,
    SanctionEntity,
    ScanRequest,
    SourceHealth,
    TariffEvent,
    WatchdogStatus,
)

# Re-export the original flat schemas that already live in shared/schemas.py
# They stay in their original module; we just surface them here too.
from shared.schemas_legacy import (  # noqa: F401
    ActionPlanOut,
    ApproveActionPlanRequest,
    ExecutionLogOut,
    ImpactAnalysisOut,
    NotificationOut,
    PaginatedResponse,
    RegulationCreate,
    RegulationOut,
    TriggerAnalysisRequest,
)
