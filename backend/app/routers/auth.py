import hmac

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, select

from app.config import get_settings
from app.deps import DB, CurrentUser
from app.models import User
from app.ratelimit import limit_auth
from app.schemas import LoginIn, RegisterIn, TokenOut, UserOut
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn, db: DB, request: Request) -> TokenOut:
    limit_auth(request, "register")
    code = get_settings().registration_code
    if code and not hmac.compare_digest((body.signup_code or "").strip().encode(), code.strip().encode()):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "A valid sign-up code is needed to create an account.")
    email = body.email.lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    return TokenOut(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: DB, request: Request) -> TokenOut:
    limit_auth(request, "login", body.email)
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    # The same message for unknown email and wrong password avoids revealing which accounts exist.
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password.")
    return TokenOut(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user
