"""Shared FastAPI dependencies: the current user and ownership-checked lookups.

Every meeting query is filtered by the logged-in user's ID so that users can
never read or change each other's data (NFR5). A meeting that belongs to someone
else returns 404, not 403, so its existence is not revealed.
"""

from typing import Annotated, TypeVar

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ActionItem, Decision, Meeting, Segment, Series, Speaker, User
from app.security import decode_access_token

_bearer = HTTPBearer(auto_error=False)

DB = Annotated[Session, Depends(get_db)]


def get_current_user(db: DB, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]) -> User:
    user_id = decode_access_token(creds.credentials) if creds else None
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def _not_found(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def owned_meeting(db: Session, user: User, meeting_id: int) -> Meeting:
    meeting = db.scalar(select(Meeting).where(Meeting.id == meeting_id, Meeting.user_id == user.id))
    if meeting is None:
        raise _not_found("Meeting")
    return meeting


def owned_series(db: Session, user: User, series_id: int) -> Series:
    series = db.scalar(select(Series).where(Series.id == series_id, Series.user_id == user.id))
    if series is None:
        raise _not_found("Series")
    return series


Child = TypeVar("Child", Speaker, Segment, Decision, ActionItem)


def owned_child(db: Session, user: User, model: type[Child], item_id: int) -> Child:
    item = db.scalar(
        select(model)
        .join(Meeting, Meeting.id == model.meeting_id)
        .where(model.id == item_id, Meeting.user_id == user.id)
    )
    if item is None:
        raise _not_found(model.__name__)
    return item
