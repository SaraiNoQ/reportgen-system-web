from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.v1.auth import current_session
from app.core.security import decode_access_token
from app.dependencies import Store, get_store
from app.schemas.domain import (
    AppUser,
    CreateProjectRequest,
    DeletedProjectRecord,
    Project,
    ProjectMetric,
    RestoreProjectResponse,
    UpdateProjectRequest,
)

router = APIRouter(prefix="/projects", tags=["projects"])


def _list_public(store: Store) -> list[Project]:
    return store.snapshot([p for p in store.projects if p.visibility == "public"])


@router.get("", response_model=list[Project])
def list_projects(
    request: Request,
    store: Annotated[Store, Depends(get_store)],
) -> list[Project]:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            claims = decode_access_token(auth.removeprefix("Bearer ").strip())
            user_id = str(claims.get("sub", ""))
            admins = [u for u in store.users if u.id == user_id]
            if admins:
                return store.list_projects_for_user(user_id, admins[0].role)
        except (ValueError, AttributeError):
            pass
    return _list_public(store)


@router.get("/metrics", response_model=list[ProjectMetric])
def list_project_metrics(
    store: Annotated[Store, Depends(get_store)],
) -> list[ProjectMetric]:
    return store.snapshot(store.project_metrics)


@router.get("/deleted", response_model=list[DeletedProjectRecord])
def list_deleted_projects(
    store: Annotated[Store, Depends(get_store)],
    session: Annotated[tuple[str, AppUser, dict[str, object]], Depends(current_session)],
) -> list[DeletedProjectRecord]:
    _token, _user, _claims = session
    return store.snapshot(store.deleted_projects)


@router.post("", response_model=Project)
def create_project(
    payload: CreateProjectRequest,
    store: Annotated[Store, Depends(get_store)],
    session: Annotated[tuple[str, AppUser, dict[str, object]], Depends(current_session)],
) -> Project:
    _token, user, _claims = session
    return store.create_project(payload, owner_id=user.id)


@router.get("/{project_id}", response_model=Project)
def get_project(
    project_id: str,
    store: Annotated[Store, Depends(get_store)],
    session: Annotated[tuple[str, AppUser, dict[str, object]], Depends(current_session)],
) -> Project:
    _token, user, _claims = session
    projects = store.list_projects_for_user(user.id, user.role)
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="project not found")
    return project


@router.patch("/{project_id}", response_model=Project)
def update_project(
    project_id: str,
    payload: UpdateProjectRequest,
    store: Annotated[Store, Depends(get_store)],
    session: Annotated[tuple[str, AppUser, dict[str, object]], Depends(current_session)],
) -> Project:
    _token, user, _claims = session
    project = store.update_project(project_id, payload, user_id=user.id, role=user.role)
    if not project:
        raise HTTPException(status_code=404, detail="project not found")
    return project


@router.delete("/{project_id}", response_model=DeletedProjectRecord)
def delete_project(
    project_id: str,
    store: Annotated[Store, Depends(get_store)],
    session: Annotated[tuple[str, AppUser, dict[str, object]], Depends(current_session)],
) -> DeletedProjectRecord:
    _token, user, _claims = session
    record = store.delete_project(project_id, actor=user.name)
    if not record:
        raise HTTPException(status_code=404, detail="project not found")
    return record


@router.post("/{project_id}/restore", response_model=RestoreProjectResponse)
def restore_project(
    project_id: str,
    store: Annotated[Store, Depends(get_store)],
    session: Annotated[tuple[str, AppUser, dict[str, object]], Depends(current_session)],
) -> RestoreProjectResponse:
    _token, user, _claims = session
    project = store.restore_project(project_id, actor=user.name)
    if not project:
        raise HTTPException(status_code=404, detail="deleted project not found")
    return RestoreProjectResponse(project=project, restored=True)
