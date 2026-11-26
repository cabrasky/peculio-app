"""Isolated SQLite browser cookie and legacy Bearer authentication smoke test."""
import os
import sys
import tempfile
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
work = tempfile.mkdtemp(prefix="browser_auth_e2e_")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{work}/test.db"

import sqlalchemy.ext.asyncio as sa
original = sa.create_async_engine
def sqlite_engine(url, **kwargs):
    if "sqlite" in str(url):
        kwargs.pop("pool_size", None)
        kwargs.pop("max_overflow", None)
    return original(url, **kwargs)
sa.create_async_engine = sqlite_engine

import anyio
from starlette.testclient import TestClient
from app.database import Base, engine
from app.main import app
from app.config import settings
from app.models.models import OAuthConfig
from app.database import async_session_factory

async def prepare():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session_factory() as db:
        db.add(OAuthConfig(provider="google", client_id="test-client", client_secret="test-secret", enabled=True))
        await db.commit()
anyio.run(prepare)
with TestClient(app) as c:
    headers = {"X-Peculio-Web-Session": "1"}
    a = c.post("/api/auth/register", json={"email": "browser-a@example.test", "name": "Alice", "password": "secret123"}, headers=headers)
    assert a.status_code == 200, a.text
    assert a.json()["token"] == ""
    assert "gastos_token" not in a.text
    cookie_headers = a.headers.get_list("set-cookie")
    assert any("peculio_session=" in h and "httponly" in h.lower() and "samesite=lax" in h.lower() for h in cookie_headers)
    assert any("peculio_csrf=" in h and "httponly" not in h.lower() for h in cookie_headers)
    assert c.get("/api/auth/me").json()["id"] == a.json()["user"]["id"]
    assert c.get("/api/auth/inexistent").status_code == 404
    assert c.post("/api/auth/login", json={"email": "browser-a@example.test", "password": "secret123"}, headers={**headers, "Origin": "https://evil.example"}).status_code == 403
    assert c.post("/api/auth/demo", headers={**headers, "Origin": "https://evil.example"}).status_code == 403
    body = {"date": "2026-01-12", "asset": "ETF", "kind": "contribution", "amount": 20}
    assert c.post("/api/investments", json=body).status_code == 403
    csrf = c.cookies.get("peculio_csrf")
    assert isinstance(csrf, str) and csrf
    good = c.post("/api/investments", json=body, headers={"X-CSRF-Token": csrf})
    assert good.status_code == 201, good.text
    assert c.post("/api/investments", json=body, headers={"X-CSRF-Token": "bad"}).status_code == 403
    assert c.get("/api/investments").json()[0]["id"] == good.json()["id"]
    assert c.get("/api/excel/template").status_code == 200
    assert c.get("/api/excel/export").status_code == 200
    assert c.post("/api/excel/import", files={"file": ("invalid.xlsx", b"not xlsx")}).status_code == 403
    assert c.post("/api/excel/import", headers={"X-CSRF-Token": csrf}, files={"file": ("invalid.xlsx", b"not xlsx")}).status_code == 400
    expense = c.post("/api/expenses", json={"date": "2026-01-12", "description": "Foto", "amount": 12}, headers={"X-CSRF-Token": csrf})
    assert expense.status_code == 201, expense.text
    from PIL import Image
    import io
    picture = io.BytesIO()
    Image.new("RGB", (100, 100), "red").save(picture, "JPEG")
    photo_url = f"/api/expenses/{expense.json()['id']}/photo"
    assert c.post(photo_url, content=picture.getvalue(), headers={"Content-Type": "image/jpeg"}).status_code == 403
    photo = c.post(photo_url, files={"file": ("test.jpg", picture.getvalue(), "image/jpeg")}, headers={"X-CSRF-Token": csrf})
    assert photo.status_code == 201, photo.text
    assert c.get(photo_url).content == picture.getvalue()
    assert c.get("/api/admin/stats").status_code == 403
    assert c.post("/api/auth/logout").status_code == 403
    out = c.post("/api/auth/logout", headers={"X-CSRF-Token": csrf})
    assert out.status_code == 204, out.text
    assert c.get("/api/auth/me").status_code == 401
    mobile = c.post("/api/auth/login", json={"email": "browser-a@example.test", "password": "secret123"})
    assert mobile.status_code == 200 and mobile.json()["token"]
    bearer = {"Authorization": f"Bearer {mobile.json()['token']}"}
    assert c.post("/api/investments", json=body, headers=bearer).status_code == 201
    b = c.post("/api/auth/register", json={"email": "browser-b@example.test", "name": "Bob", "password": "secret123"}, headers=headers)
    assert b.status_code == 200
    assert c.get("/api/investments").json() == []
    assert c.get("/api/investments", headers=bearer).json()
    # A web OAuth state cookie must accompany the callback. An unbound state is rejected.
    oauth = c.get("/api/auth/google", follow_redirects=False)
    assert oauth.status_code in (302, 307), oauth.text
    state = parse_qs(urlsplit(oauth.headers["location"]).query)["state"][0]
    assert c.get("/api/auth/google/callback", params={"code": "fake", "state": "attacker"}).status_code == 400
    c.cookies.delete("peculio_oauth_state")
    assert c.get("/api/auth/google/callback", params={"code": "fake", "state": state}).status_code == 400
    assert c.get("/api/auth/google", params={"redirect_to": "peculioapp://attacker"}, follow_redirects=False).status_code in (302, 307)
    redirected = c.get("/api/auth/google", params={"redirect_to": "peculioapp://attacker"}, follow_redirects=False)
    state = parse_qs(urlsplit(redirected.headers["location"]).query)["state"][0]
    import base64
    claimed = base64.urlsafe_b64decode(state.split(".", 1)[1]).decode()
    assert claimed == settings.frontend_url
    # Fake the provider only; exercise the real OAuth route and redirect policy.
    import app.routers.auth as auth_router
    class Provider:
        async def __aenter__(self): return self
        async def __aexit__(self, *_): return None
        async def post(self, *_, **__):
            return type("Result", (), {"json": lambda self: {"access_token": "provider-test-token"}})()
        async def get(self, *_, **__):
            return type("Result", (), {"json": lambda self: {"sub": "provider-user", "email": "browser-a@example.test", "name": "Alice"}})()
    real_provider = auth_router.httpx.AsyncClient
    auth_router.httpx.AsyncClient = Provider
    try:
        for target, is_mobile in [(settings.frontend_url, False), ("peculioapp://oauth", True)]:
            start = c.get("/api/auth/google", params={"redirect_to": target}, follow_redirects=False)
            state = parse_qs(urlsplit(start.headers["location"]).query)["state"][0]
            callback = c.get("/api/auth/google/callback", params={"code": "fake", "state": state}, follow_redirects=False)
            assert callback.status_code == 303, callback.text
            destination = callback.headers["location"]
            if is_mobile:
                assert destination.startswith("peculioapp://oauth?token=")
            else:
                assert destination == settings.frontend_url and "token=" not in destination
                assert "peculio_session" in callback.headers.get("set-cookie", "")
    finally:
        auth_router.httpx.AsyncClient = real_provider
print("TODO OK: web cookies, CSRF, logout, OAuth state/redirect, Bearer and account isolation")
