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

security = HTTPBearer()


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
