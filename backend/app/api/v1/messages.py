from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.v1.auth import current_session
from app.dependencies import Store, get_store
from app.schemas.domain import AppUser, SystemMessage

router = APIRouter(prefix="/messages", tags=["messages"])
CurrentSession = Annotated[
    tuple[str, AppUser, dict[str, object]],
    Depends(current_session),
]


@router.get("", response_model=list[SystemMessage])
def list_messages(
    _: CurrentSession,
    store: Annotated[Store, Depends(get_store)],
) -> list[SystemMessage]:
    return store.snapshot(store.messages)


@router.patch("/{message_id}/read", response_model=SystemMessage)
def mark_message_read(
    message_id: str,
    _: CurrentSession,
    store: Annotated[Store, Depends(get_store)],
) -> SystemMessage:
    message = store.mark_message_read(message_id)
    if not message:
        raise HTTPException(status_code=404, detail="message not found")
    return message


@router.patch("/read-all")
def mark_all_messages_read(
    _: CurrentSession,
    store: Annotated[Store, Depends(get_store)],
) -> dict[str, bool]:
    store.mark_all_messages_read()
    return {"ok": True}
