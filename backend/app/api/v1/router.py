from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.gen_report import router as gen_report_router
from app.api.v1.health import router as health_router
from app.api.v1.messages import router as messages_router
from app.api.v1.projects import router as projects_router
from app.api.v1.records import router as records_router
from app.api.v1.reports import router as reports_router
from app.api.v1.rules import router as rules_router
from app.api.v1.system import router as system_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(gen_report_router)
api_router.include_router(health_router)
api_router.include_router(messages_router)
api_router.include_router(projects_router)
api_router.include_router(records_router)
api_router.include_router(reports_router)
api_router.include_router(rules_router)
api_router.include_router(system_router)
