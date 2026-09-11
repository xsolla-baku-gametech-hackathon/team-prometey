"""
Auth: bcrypt password hashing + JWT issuance/verification (see PROJECT.md
section 3). Email + password only for the MVP -- no OAuth/social login.
"""

from __future__ import annotations

import datetime
import os

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.db import get_session
from app.db_models import User

# In a real deployment this MUST come from an env var with a long random
# value. The fallback here is only so the app still runs out of the box
# for a hackathon demo -- never rely on it in anything that isn't localhost.
SECRET_KEY = os.environ.get("LOOT_AUDITOR_JWT_SECRET", "dev-only-insecure-secret-set-LOOT_AUDITOR_JWT_SECRET")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24 * 7

# Admin access is an env-configured allowlist, not a signup option or a
# separate role-management UI -- the standard early-startup pattern of "an
# operator edits a config value" before it's worth building real RBAC.
_ADMIN_EMAILS = {
    e.strip().lower() for e in os.environ.get("TRUELOOT_ADMIN_EMAILS", "").split(",") if e.strip()
}

security = HTTPBearer()


def sync_admin_flag(user: User, db: Session) -> User:
    """Promotes a user to admin if their email is in TRUELOOT_ADMIN_EMAILS.

    Called on signup and login so adding an email to the allowlist takes
    effect the next time that person logs in -- no migration script, no
    separate admin-creation flow.
    """
    should_be_admin = user.email.lower() in _ADMIN_EMAILS
    if should_be_admin and not user.is_admin:
        user.is_admin = True
        db.commit()
        db.refresh(user)
    return user


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user: User) -> str:
    expire = datetime.datetime.utcnow() + datetime.timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {"sub": user.id, "email": user.email, "plan": user.plan, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_session),
) -> User:
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    return user


def get_current_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user
