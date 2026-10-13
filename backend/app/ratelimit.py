"""A small in-memory rate limiter for the sign-in and sign-up endpoints (spec: brute-force protection).

It counts requests per client address (and, for sign-in, per email) in a sliding window. Memory
is per process, which suits MeetMind's single API process; a multi-server deployment would move
this to Redis. Behind a reverse proxy or tunnel every request arrives from the proxy, so set
TRUSTED_PROXY_HEADER (e.g. CF-Connecting-IP for Cloudflare) to count real client addresses.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.config import get_settings


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_s: float) -> None:
        """Record one attempt for ``key``; raise 429 if it exceeds ``limit`` within ``window_s``."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= now - window_s:
                hits.popleft()
            if len(hits) >= limit:
                retry = int(hits[0] + window_s - now) + 1
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    f"Too many attempts. Please wait {retry} seconds and try again.",
                    headers={"Retry-After": str(retry)},
                )
            hits.append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()


def client_address(request: Request) -> str:
    header = get_settings().trusted_proxy_header
    if header and (forwarded := request.headers.get(header)):
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def limit_auth(request: Request, scope: str, email: str | None = None) -> None:
    settings = get_settings()
    window = 60.0
    limiter.check(f"{scope}:ip:{client_address(request)}", settings.auth_attempts_per_minute, window)
    if email:
        limiter.check(f"{scope}:email:{email.lower()}", settings.auth_attempts_per_minute, window)
