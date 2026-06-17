from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import create_access_token, decode_access_token, verify_password
from app.dependencies import Store, get_store
from app.schemas.domain import (
    AppUser,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    UpdateUserPreferenceRequest,
    UserPreference,
)

router = APIRouter(prefix="/auth", tags=["auth"])
bearer_scheme = HTTPBearer(auto_error=False)


def iso_from_claim(value: object) -> str:
    if not isinstance(value, (int, float)):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token")
    return datetime.fromtimestamp(value, tz=UTC).isoformat()


def current_session(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
    store: Annotated[Store, Depends(get_store)],
) -> tuple[str, AppUser, dict[str, object]]:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing token")
    try:
        claims = decode_access_token(credentials.credentials)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token",
        ) from error
    subject = str(claims.get("sub", ""))
    user = next((item for item in store.users if item.id == subject), None)
    if not user or user.status != "启用":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="account unavailable")
    return credentials.credentials, user, claims


def session_response(token: str, user: AppUser, claims: dict[str, object]) -> LoginResponse:
    return LoginResponse(
        ok=True,
        accessToken=token,
        expiresAt=iso_from_claim(claims.get("exp")),
        authenticatedAt=iso_from_claim(claims.get("iat")),
        user=user,
    )


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    store: Annotated[Store, Depends(get_store)],
) -> LoginResponse:
    user = store.find_login_user(payload.username)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号或密码错误")
    if user.password_hash:
        if not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号或密码错误")
    elif payload.password != "report-demo":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号或密码错误")
    if user.status != "启用":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已禁用")
    user = store.record_login(user.id) or user
    token = create_access_token(user.id)
    claims = decode_access_token(token)
    return session_response(token, user, claims)


@router.get("/me", response_model=LoginResponse)
def me(session: tuple[str, AppUser, dict[str, object]] = Depends(current_session)) -> LoginResponse:
    token, user, claims = session
    return session_response(token, user, claims)


@router.post("/logout", response_model=LogoutResponse)
def logout(
    session: Annotated[
        tuple[str, AppUser, dict[str, object]],
        Depends(current_session),
    ],
    store: Annotated[Store, Depends(get_store)],
) -> LogoutResponse:
    _, user, _ = session
    store.add_log("登录认证", user.name, "用户退出")
    return LogoutResponse(ok=True)


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    store: Annotated[Store, Depends(get_store)],
) -> ForgotPasswordResponse:
    account = payload.account.strip()
    user = next(
        (
            item
            for item in store.users
            if account and (account == item.id or account == item.name or account in item.name)
        ),
        None,
    )
    actor = user.name if user else account or "未知账号"
    store.add_log("登录认证", actor, "提交忘记密码协助申请", "警告")
    return ForgotPasswordResponse(
        ticketId=store.create_password_ticket(),
        message="已生成密码协助申请，请联系系统管理员完成核验。",
        expiresInMinutes=30,
    )


@router.get("/preferences", response_model=UserPreference)
def get_preferences(
    session: Annotated[
        tuple[str, AppUser, dict[str, object]],
        Depends(current_session),
    ],
    store: Annotated[Store, Depends(get_store)],
) -> UserPreference:
    _, user, _ = session
    return store.get_user_preference(user.id)


@router.patch("/preferences", response_model=UserPreference)
def update_preferences(
    payload: UpdateUserPreferenceRequest,
    session: Annotated[
        tuple[str, AppUser, dict[str, object]],
        Depends(current_session),
    ],
    store: Annotated[Store, Depends(get_store)],
) -> UserPreference:
    _, user, _ = session
    return store.update_user_preference(user.id, payload)
