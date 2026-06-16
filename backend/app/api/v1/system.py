from fastapi import APIRouter, HTTPException

from app.schemas.domain import (
    AppUser,
    CreateUserRequest,
    ExportLogsResponse,
    ExportUsersResponse,
    ImportUsersResponse,
    LogDetailResponse,
    LogResult,
    OperationLog,
    UpdateUserRequest,
    UserStatus,
)
from app.services.mock_store import store

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/users", response_model=list[AppUser])
def list_users() -> list[AppUser]:
    return store.snapshot(store.users)


@router.post("/users", response_model=AppUser)
def create_user(payload: CreateUserRequest) -> AppUser:
    return store.create_user(payload)


@router.post("/users/import", response_model=ImportUsersResponse)
def import_users() -> ImportUsersResponse:
    users = store.import_users()
    return ImportUsersResponse(users=users, imported=len(users))


@router.get("/users/export", response_model=ExportUsersResponse)
def export_users() -> ExportUsersResponse:
    rows = store.export_users()
    return ExportUsersResponse(fileName="系统用户清单.xlsx", rows=rows, status="ready")


@router.patch("/users/{user_id}", response_model=AppUser)
def update_user(user_id: str, payload: UpdateUserRequest) -> AppUser:
    user = store.update_user(user_id, payload)
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    return user


@router.patch("/users/{user_id}/status", response_model=AppUser)
def update_user_status(user_id: str, status: UserStatus) -> AppUser:
    user = store.set_user_status(user_id, status)
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    return user


@router.get("/logs", response_model=list[OperationLog])
def list_logs(
    q: str | None = None,
    module: str | None = None,
    result: LogResult | None = None,
) -> list[OperationLog]:
    return store.snapshot(store.filter_logs(q=q, module=module, result=result))


@router.get("/logs/export", response_model=ExportLogsResponse)
def export_logs(
    q: str | None = None,
    module: str | None = None,
    result: LogResult | None = None,
) -> ExportLogsResponse:
    rows = len(store.filter_logs(q=q, module=module, result=result))
    store.add_log("日志管理", "管理员", f"导出日志 {rows} 条")
    return ExportLogsResponse(fileName="系统操作日志.xlsx", rows=rows, status="ready")


@router.get("/logs/{log_id}", response_model=LogDetailResponse)
def get_log_detail(log_id: str) -> LogDetailResponse:
    log = store.get_log(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="log not found")
    return LogDetailResponse(
        log=log,
        detail=(
            f"{log.time} 由 {log.actor} 在「{log.module}」"
            f"执行「{log.action}」，结果为{log.result}。"
        ),
    )
