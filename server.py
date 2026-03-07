import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DATA_DIR", str(ROOT)))
DB_PATH = Path(os.environ.get("DB_PATH", str(DATA_DIR / "digital_brain.db")))
SESSION_COOKIE = "digital_brain_session"

CATEGORY_DEFINITIONS = {
    "books": {"name": "Books", "columns": ["Title", "Author", "Status", "Rating", "Notes"]},
    "movies": {"name": "Movies", "columns": ["Title", "Director", "Year", "Rating", "Notes"]},
    "music": {"name": "Music", "columns": ["Title", "Artist", "Type", "Rating", "Notes"]},
    "thoughts": {"name": "Thoughts", "columns": ["Title", "Tag", "Date", "Status", "Notes"]},
    "tv": {"name": "TV Shows", "columns": ["Title", "Season", "Status", "Rating", "Notes"]},
}

DEMO_DATA = {
    "books": [{"id": "demo-book", "values": {"Title": "The Creative Act", "Author": "Rick Rubin", "Status": "Finished", "Rating": "9", "Notes": "Loose, intuitive, high-signal."}}],
    "movies": [{"id": "demo-movie", "values": {"Title": "The Social Network", "Director": "David Fincher", "Year": "2010", "Rating": "9", "Notes": "Sharp, fast, endlessly rewatchable."}}],
    "music": [{"id": "demo-music", "values": {"Title": "Blonde", "Artist": "Frank Ocean", "Type": "Album", "Rating": "10", "Notes": "For late-night overthinking."}}],
    "thoughts": [{"id": "demo-thought", "values": {"Title": "Taste compounds over time", "Tag": "Principle", "Date": "2026-03-07", "Status": "Active", "Notes": "Keep publishing, refining, and returning to what matters."}}],
    "tv": [{"id": "demo-tv", "values": {"Title": "Succession", "Season": "4", "Status": "Finished", "Rating": "9", "Notes": "Cruel, funny, precise."}}],
}


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200000)
    return salt, digest.hex()


def verify_password(password, salt, expected_hash):
    _, password_hash = hash_password(password, salt)
    return hmac.compare_digest(password_hash, expected_hash)


def normalize_username(username):
    return "".join(ch for ch in username.strip().lower().replace(" ", "-") if ch.isalnum() or ch in "-_")


def default_category_payload(slug):
    definition = CATEGORY_DEFINITIONS[slug]
    return {
        "slug": slug,
        "name": definition["name"],
        "columns": definition["columns"],
        "rows": [],
    }


def ensure_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            username_key TEXT NOT NULL UNIQUE,
            password_salt TEXT NOT NULL,
            password_hash TEXT NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS categories (
            user_id INTEGER NOT NULL,
            slug TEXT NOT NULL,
            payload TEXT NOT NULL,
            PRIMARY KEY (user_id, slug),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    connection.commit()

    cursor.execute("SELECT id FROM users WHERE username_key = ?", ("demo",))
    if cursor.fetchone() is None:
        salt, password_hash = hash_password("demo")
        cursor.execute(
            "INSERT INTO users (username, username_key, password_salt, password_hash) VALUES (?, ?, ?, ?)",
            ("Demo User", "demo", salt, password_hash),
        )
        demo_user_id = cursor.lastrowid
        for slug, rows in DEMO_DATA.items():
            payload = default_category_payload(slug)
            payload["rows"] = rows
            cursor.execute(
                "INSERT INTO categories (user_id, slug, payload) VALUES (?, ?, ?)",
                (demo_user_id, slug, json.dumps(payload)),
            )
        connection.commit()

    connection.close()


def create_session(user_id):
    token = secrets.token_urlsafe(32)
    connection = get_connection()
    connection.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
    connection.commit()
    connection.close()
    return token


def destroy_session(token):
    if not token:
        return
    connection = get_connection()
    connection.execute("DELETE FROM sessions WHERE token = ?", (token,))
    connection.commit()
    connection.close()


def get_user_by_session(token):
    if not token:
        return None
    connection = get_connection()
    row = connection.execute(
        """
        SELECT users.id, users.username, users.username_key
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token = ?
        """,
        (token,),
    ).fetchone()
    connection.close()
    return dict(row) if row else None


def get_user_categories(user_id):
    connection = get_connection()
    rows = connection.execute("SELECT slug, payload FROM categories WHERE user_id = ?", (user_id,)).fetchall()
    payloads = {row["slug"]: json.loads(row["payload"]) for row in rows}
    missing = [slug for slug in CATEGORY_DEFINITIONS if slug not in payloads]
    for slug in missing:
        payload = default_category_payload(slug)
        connection.execute(
            "INSERT OR REPLACE INTO categories (user_id, slug, payload) VALUES (?, ?, ?)",
            (user_id, slug, json.dumps(payload)),
        )
        payloads[slug] = payload
    if missing:
        connection.commit()
    connection.close()
    return payloads


def get_category_for_user(user_id, slug):
    categories = get_user_categories(user_id)
    return categories.get(slug)


def upsert_category(user_id, slug, payload):
    connection = get_connection()
    connection.execute(
        "INSERT OR REPLACE INTO categories (user_id, slug, payload) VALUES (?, ?, ?)",
        (user_id, slug, json.dumps(payload)),
    )
    connection.commit()
    connection.close()
    return payload


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/session":
            return self.handle_session()
        if parsed.path.startswith("/api/category/"):
            return self.handle_get_category(parsed.path.split("/")[-1])
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/signup":
            return self.handle_signup()
        if parsed.path == "/api/login":
            return self.handle_login()
        if parsed.path == "/api/demo-login":
            return self.handle_demo_login()
        if parsed.path == "/api/logout":
            return self.handle_logout()
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/category/"):
            return self.handle_put_category(parsed.path.split("/")[-1])
        self.send_error(HTTPStatus.NOT_FOUND)

    def parse_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        return json.loads(raw or "{}")

    def send_json(self, status, payload, cookie=None, clear_cookie=False):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        if clear_cookie:
            self.send_header("Set-Cookie", f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")
        self.end_headers()
        self.wfile.write(body)

    def session_token(self):
        cookie_header = self.headers.get("Cookie")
        if not cookie_header:
            return None
        cookie = SimpleCookie()
        cookie.load(cookie_header)
        morsel = cookie.get(SESSION_COOKIE)
        return morsel.value if morsel else None

    def current_user(self):
        return get_user_by_session(self.session_token())

    def require_user(self):
        user = self.current_user()
        if not user:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "You must be logged in."})
            return None
        return user

    def handle_session(self):
        user = self.current_user()
        self.send_json(HTTPStatus.OK, {"user": {"username": user["username"]} if user else None})

    def handle_signup(self):
        data = self.parse_json()
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""
        username_key = normalize_username(username)

        if len(username_key) < 3:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Choose a username with at least 3 valid characters."})
        if len(password) < 6:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Password must be at least 6 characters."})

        connection = get_connection()
        existing = connection.execute("SELECT id FROM users WHERE username_key = ?", (username_key,)).fetchone()
        if existing:
            connection.close()
            return self.send_json(HTTPStatus.CONFLICT, {"error": "That username already exists."})

        salt, password_hash = hash_password(password)
        cursor = connection.execute(
            "INSERT INTO users (username, username_key, password_salt, password_hash) VALUES (?, ?, ?, ?)",
            (username, username_key, salt, password_hash),
        )
        user_id = cursor.lastrowid
        for slug in CATEGORY_DEFINITIONS:
            connection.execute(
                "INSERT INTO categories (user_id, slug, payload) VALUES (?, ?, ?)",
                (user_id, slug, json.dumps(default_category_payload(slug))),
            )
        connection.commit()
        connection.close()

        token = create_session(user_id)
        self.send_json(
            HTTPStatus.OK,
            {"user": {"username": username}},
            cookie=f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax",
        )

    def handle_login(self):
        data = self.parse_json()
        username_key = normalize_username(data.get("username") or "")
        password = data.get("password") or ""
        connection = get_connection()
        row = connection.execute(
            "SELECT id, username, password_salt, password_hash FROM users WHERE username_key = ?",
            (username_key,),
        ).fetchone()
        connection.close()

        if not row or not verify_password(password, row["password_salt"], row["password_hash"]):
            return self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "Incorrect username or password."})

        token = create_session(row["id"])
        self.send_json(
            HTTPStatus.OK,
            {"user": {"username": row["username"]}},
            cookie=f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax",
        )

    def handle_demo_login(self):
        connection = get_connection()
        row = connection.execute("SELECT id, username FROM users WHERE username_key = 'demo'").fetchone()
        connection.close()
        token = create_session(row["id"])
        self.send_json(
            HTTPStatus.OK,
            {"user": {"username": row["username"]}},
            cookie=f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax",
        )

    def handle_logout(self):
        destroy_session(self.session_token())
        self.send_json(HTTPStatus.OK, {"ok": True}, clear_cookie=True)

    def handle_get_category(self, slug):
        slug = unquote(slug)
        if slug not in CATEGORY_DEFINITIONS:
            return self.send_json(HTTPStatus.NOT_FOUND, {"error": "Unknown category."})
        user = self.require_user()
        if not user:
            return
        category = get_category_for_user(user["id"], slug)
        self.send_json(HTTPStatus.OK, {"category": category})

    def handle_put_category(self, slug):
        slug = unquote(slug)
        if slug not in CATEGORY_DEFINITIONS:
            return self.send_json(HTTPStatus.NOT_FOUND, {"error": "Unknown category."})
        user = self.require_user()
        if not user:
            return
        data = self.parse_json()
        category = data.get("category") or default_category_payload(slug)
        category["slug"] = slug
        category["name"] = CATEGORY_DEFINITIONS[slug]["name"]
        category["columns"] = CATEGORY_DEFINITIONS[slug]["columns"]
        category["rows"] = category.get("rows", [])
        upsert_category(user["id"], slug, category)
        self.send_json(HTTPStatus.OK, {"category": category})


def main():
    ensure_db()
    port = int(os.environ.get("PORT", "4173"))
    server = ThreadingHTTPServer(("0.0.0.0", port), AppHandler)
    print(f"Digital Brain running at http://0.0.0.0:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
