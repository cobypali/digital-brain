const loginPanel = document.getElementById("admin-login-panel");
const sessionPanel = document.getElementById("admin-session-panel");
const statusEl = document.getElementById("admin-status");
const usersPanel = document.getElementById("users-panel");
const userDetail = document.getElementById("user-detail");
const usersSummary = document.getElementById("users-summary");

let activeUserId = null;

async function request(path, options = {}) {
    const response = await fetch(path, {
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        ...options
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
        throw new Error(data.error || "Request failed.");
    }
    return data;
}

async function syncAdminUi() {
    try {
        const data = await request("/api/admin/session");
        const authenticated = Boolean(data.authenticated);
        loginPanel.classList.toggle("hidden", authenticated);
        sessionPanel.classList.toggle("hidden", !authenticated);
        if (authenticated) {
            await loadUsers();
        } else {
            usersPanel.innerHTML = "";
            userDetail.classList.add("hidden");
            usersSummary.textContent = "Not loaded";
        }
    } catch (error) {
        statusEl.textContent = error.message;
    }
}

async function loadUsers() {
    const data = await request("/api/admin/users");
    usersSummary.textContent = `${data.users.length} user${data.users.length === 1 ? "" : "s"}`;
    usersPanel.innerHTML = data.users.map((user) => `
        <button class="user-item${user.id === activeUserId ? " active" : ""}" data-user-id="${user.id}" type="button">
            <strong>${escapeHtml(user.username)}</strong>
            <span class="muted">id ${user.id} • ${user.category_count} categories • ${user.total_entries} entries</span>
        </button>
    `).join("");

    document.querySelectorAll("[data-user-id]").forEach((button) => {
        button.addEventListener("click", async () => {
            activeUserId = Number(button.dataset.userId);
            await loadUserDetail(activeUserId);
            await loadUsers();
        });
    });

    if (activeUserId && !data.users.some((user) => user.id === activeUserId)) {
        activeUserId = null;
        userDetail.classList.add("hidden");
    }
}

async function loadUserDetail(userId) {
    const data = await request(`/api/admin/user/${userId}`);
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
        await request("/api/admin/login", {
            method: "POST",
            body: JSON.stringify({ password: document.getElementById("admin-password").value })
        });
        statusEl.textContent = "";
        document.getElementById("admin-password").value = "";
        await syncAdminUi();
    } catch (error) {
        statusEl.textContent = error.message;
    }
});

document.getElementById("admin-logout-btn").addEventListener("click", async () => {
    await request("/api/admin/logout", { method: "POST", body: "{}" });
    activeUserId = null;
    await syncAdminUi();
});

document.getElementById("refresh-users-btn").addEventListener("click", async () => {
    await loadUsers();
    if (activeUserId) {
        await loadUserDetail(activeUserId);
    }
});

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
}

syncAdminUi();
