const ADMIN_SESSION_KEY = "digital_brain_admin_session";
const loginPanel = document.getElementById("admin-login-panel");
const sessionPanel = document.getElementById("admin-session-panel");
const statusEl = document.getElementById("admin-status");
const usersPanel = document.getElementById("users-panel");
const userDetail = document.getElementById("user-detail");
const usersSummary = document.getElementById("users-summary");

let activeUserKey = null;

function getAppsScriptUrl() {
    const url = window.DIGITAL_BRAIN_CONFIG?.appsScriptUrl;
    if (!url) {
        throw new Error("Missing Apps Script URL. Set it in config.js.");
    }
    return url;
}

function getAdminToken() {
    return localStorage.getItem(ADMIN_SESSION_KEY);
}

function setAdminToken(token) {
    if (!token) {
        localStorage.removeItem(ADMIN_SESSION_KEY);
        return;
    }
    localStorage.setItem(ADMIN_SESSION_KEY, token);
}

async function request(action, payload = {}) {
    const response = await fetch(getAppsScriptUrl(), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, ...payload })
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok || data.ok === false) {
        throw new Error(data.error || "Request failed.");
    }
    return data;
}

async function syncAdminUi() {
    const token = getAdminToken();
    if (!token) {
        loginPanel.classList.remove("hidden");
        sessionPanel.classList.add("hidden");
        usersPanel.innerHTML = "";
        userDetail.classList.add("hidden");
        usersSummary.textContent = "Not loaded";
        return;
    }

    try {
        const data = await request("adminSession", { adminToken: token });
        const authenticated = Boolean(data.authenticated);
        loginPanel.classList.toggle("hidden", authenticated);
        sessionPanel.classList.toggle("hidden", !authenticated);
        if (authenticated) {
            await loadUsers();
        } else {
            setAdminToken(null);
            await syncAdminUi();
        }
    } catch (error) {
        statusEl.textContent = error.message;
    }
}

async function loadUsers() {
    const data = await request("adminUsers", { adminToken: getAdminToken() });
    usersSummary.textContent = `${data.users.length} user${data.users.length === 1 ? "" : "s"}`;
    usersPanel.innerHTML = data.users.map((user) => `
        <button class="user-item${user.usernameKey === activeUserKey ? " active" : ""}" data-user-key="${user.usernameKey}" type="button">
            <strong>${escapeHtml(user.username)}</strong>
            <span class="muted">${user.category_count} categories • ${user.total_entries} entries</span>
        </button>
    `).join("");

    document.querySelectorAll("[data-user-key]").forEach((button) => {
        button.addEventListener("click", async () => {
            activeUserKey = button.dataset.userKey;
            await loadUserDetail(activeUserKey);
            await loadUsers();
        });
    });
}

async function loadUserDetail(usernameKey) {
    const data = await request("adminUserDetail", {
        adminToken: getAdminToken(),
        usernameKey
    });

    userDetail.classList.remove("hidden");
    userDetail.innerHTML = `
        <div class="category-block" style="border-top:none;padding-top:0;margin-top:20px;">
            <h3>${escapeHtml(data.user.username)}</h3>
            <p class="muted">username key: ${escapeHtml(data.user.username_key)}</p>
        </div>
        ${data.categories.map((category) => `
            <div class="category-block">
                <h3>${escapeHtml(category.payload.name)}</h3>
                <p class="muted">${category.payload.rows.length} entr${category.payload.rows.length === 1 ? "y" : "ies"}</p>
                <pre>${escapeHtml(JSON.stringify(category.payload, null, 2))}</pre>
            </div>
        `).join("")}
    `;
}

document.getElementById("admin-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        const data = await request("adminLogin", {
            password: document.getElementById("admin-password").value
        });
        setAdminToken(data.token);
        statusEl.textContent = "";
        document.getElementById("admin-password").value = "";
        await syncAdminUi();
    } catch (error) {
        statusEl.textContent = error.message;
    }
});

document.getElementById("admin-logout-btn").addEventListener("click", async () => {
    try {
        await request("adminLogout", { adminToken: getAdminToken() });
    } catch (error) {
        // Ignore remote failure and clear locally.
    }
    setAdminToken(null);
    activeUserKey = null;
    await syncAdminUi();
});

document.getElementById("refresh-users-btn").addEventListener("click", async () => {
    await loadUsers();
    if (activeUserKey) {
        await loadUserDetail(activeUserKey);
    }
});

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
}

syncAdminUi();
