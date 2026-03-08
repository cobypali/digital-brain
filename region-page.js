import {
    buildBrainPath,
    CATEGORY_DEFINITIONS,
    createEmptyRow,
    getCategory,
    getPublicBrain,
    getPublicCategory,
    getSessionUser,
    login,
    logout,
    normalizeUsernameKey,
    saveCategory,
    signup
} from "./brain-store.js";

const route = resolveRoute();
const slug = route.slug;
const definition = CATEGORY_DEFINITIONS[slug];
const state = {
    category: null,
    sort: { field: definition?.columns[0] ?? "Title", order: "asc" },
    editing: false,
    username: null,
    usernameKey: null,
    viewedBrain: null
};

if (!definition) {
    document.body.innerHTML = "<main style='padding:40px;color:#E6EDF7'>Unknown region.</main>";
    throw new Error("Unknown region");
}

applyPageIdentity();

attachEvents();
renderRegionNav();
initialize();

async function initialize() {
    const routeReady = await initializeRouteState();
    if (!routeReady) {
        return;
    }
    await syncSessionUi();
    await renderPage();
}

function attachEvents() {
    document.getElementById("edit-toggle-btn").addEventListener("click", async () => {
        if (!state.username) {
            openAuthModal();
            return;
        }
        state.editing = !state.editing;
        await syncSessionUi();
        await renderPage();
    });

    document.getElementById("modal-close").addEventListener("click", closeDetailModal);
    document.getElementById("detail-modal-overlay").addEventListener("click", (event) => {
        if (event.target === event.currentTarget) {
            closeDetailModal();
        }
    });

    document.getElementById("auth-close").addEventListener("click", closeAuthModal);
    document.getElementById("auth-modal-overlay").addEventListener("click", (event) => {
        if (event.target === event.currentTarget) {
            closeAuthModal();
        }
    });

    document.getElementById("signup-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
            const user = await signup(
                document.getElementById("signup-username").value,
                document.getElementById("signup-email").value,
                document.getElementById("signup-password").value
            );
            closeAuthModal();
            await syncSessionUi();
            window.location.href = buildBrainPath(user.usernameKey, slug);
        } catch (error) {
            document.getElementById("auth-message").textContent = error.message;
        }
    });

    document.getElementById("login-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
            const user = await login(document.getElementById("login-identifier").value, document.getElementById("login-password").value);
            closeAuthModal();
            await syncSessionUi();
            window.location.href = buildBrainPath(user.usernameKey, slug);
        } catch (error) {
            document.getElementById("auth-message").textContent = error.message;
        }
    });

    document.getElementById("add-row-btn").addEventListener("click", async () => {
        const row = createEmptyRow(slug);
        state.category.rows.unshift(row);
        await saveCategory(slug, state.category);
        await renderPage();
        openEditor(row.id);
    });

    document.getElementById("edit-row-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const rowId = event.currentTarget.dataset.rowId;
        const row = state.category.rows.find((item) => item.id === rowId);
        if (!row) {
            return;
        }

        state.category.columns.forEach((column) => {
            row.values[column] = event.currentTarget.elements[column].value.trim();
        });
        closeEditor();
        await saveAndRender();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeDetailModal();
            closeAuthModal();
            closeEditor();
        }
    });
}

function renderRegionNav() {
    const nav = document.getElementById("region-links");
    nav.innerHTML = Object.entries(CATEGORY_DEFINITIONS).map(([key, item]) => `
        <li><a href="${buildBrainPath(state.viewedBrain?.usernameKey || state.usernameKey || "", key)}" class="${key === slug ? "active" : ""}"><span class="dot" style="background: #${item.color.toString(16).padStart(6, "0")}"></span>${item.name}</a></li>
    `).join("");
    document.getElementById("back-to-brain-link").href = buildBrainPath(state.viewedBrain?.usernameKey || state.usernameKey || "");
}

async function syncSessionUi() {
    const user = await getSessionUser();
    state.username = user?.username ?? null;
    state.usernameKey = user?.usernameKey ?? null;

    const ownsViewedBrain = !state.viewedBrain || state.viewedBrain.usernameKey === state.usernameKey;
    const canEdit = Boolean(state.usernameKey) && ownsViewedBrain;
    document.getElementById("edit-toggle-btn").textContent = canEdit ? (state.editing ? "Done Editing" : "Edit Sheet") : (state.username ? "Viewing Only" : "Sign In");
    document.getElementById("edit-toggle-btn").disabled = state.username ? !canEdit : false;
    applyPageIdentity();
    renderRegionNav();
}

async function renderPage() {
    try {
        if (state.viewedBrain) {
            state.category = await getPublicCategory(state.viewedBrain.usernameKey, slug);
        } else {
            state.category = await getCategory(slug);
        }
    } catch (error) {
        state.category = { slug, name: definition.name, columns: [...definition.columns], rows: [] };
    }

    const ownerName = state.viewedBrain?.username || state.username;
    const canEdit = Boolean(state.usernameKey) && (!state.viewedBrain || state.viewedBrain.usernameKey === state.usernameKey);
    document.getElementById("item-count").textContent = ownerName
        ? `${state.category.rows.length} entr${state.category.rows.length === 1 ? "y" : "ies"} in ${ownerName}'s sheet`
        : `${state.category.rows.length} entr${state.category.rows.length === 1 ? "y" : "ies"} loaded`;
    document.getElementById("editor-toolbar").style.display = state.editing && canEdit ? "flex" : "none";
    document.getElementById("content").innerHTML = renderTableHtml();
    bindTableHandlers();
}

function renderTableHtml() {
    const rows = sortRows(state.category.rows);
    const canEdit = Boolean(state.usernameKey) && (!state.viewedBrain || state.viewedBrain.usernameKey === state.usernameKey);
    if (!rows.length) {
        return `<div class="loading"><p>${canEdit ? "No entries yet. Use the edit button to add rows." : "This region does not have any entries yet."}</p></div>`;
    }

    return `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th class="row-num-header">#</th>
                        ${state.category.columns.map((column) => {
                            const isSorted = state.sort.field === column;
                            const arrow = isSorted ? (state.sort.order === "asc" ? "&#9650;" : "&#9660;") : "&#9650;";
                            return `<th data-sort="${column}" class="${isSorted ? "sorted" : ""}">${column}<span class="sort-arrow">${arrow}</span></th>`;
                        }).join("")}
                        ${state.editing && canEdit ? "<th>Actions</th>" : ""}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((row, index) => `
                        <tr>
                            <td class="row-num">${index + 1}</td>
                            ${state.category.columns.map((column, columnIndex) => `<td class="${columnIndex === 0 ? "title-cell" : ""}" data-row="${row.id}" data-open="${columnIndex === 0 ? "true" : "false"}">${escapeHtml(row.values[column] || "-")}</td>`).join("")}
                            ${state.editing && canEdit ? `<td><button class="table-action" data-action="edit" data-row="${row.id}">Edit</button><button class="table-action delete" data-action="delete" data-row="${row.id}">Delete</button></td>` : ""}
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function bindTableHandlers() {
    document.querySelectorAll("th[data-sort]").forEach((th) => {
        th.addEventListener("click", async () => {
            const field = th.dataset.sort;
            state.sort = { field, order: state.sort.field === field && state.sort.order === "asc" ? "desc" : "asc" };
            await renderPage();
        });
    });

    document.querySelectorAll('td[data-open="true"]').forEach((cell) => {
        cell.addEventListener("click", () => openDetailModal(cell.dataset.row));
    });

    document.querySelectorAll('[data-action="edit"]').forEach((button) => {
        button.addEventListener("click", () => openEditor(button.dataset.row));
    });

    document.querySelectorAll('[data-action="delete"]').forEach((button) => {
        button.addEventListener("click", async () => {
            state.category.rows = state.category.rows.filter((row) => row.id !== button.dataset.row);
            await saveAndRender();
        });
    });
}

function sortRows(rows) {
    return [...rows].sort((a, b) => {
        const left = String(a.values[state.sort.field] || "").toLowerCase();
        const right = String(b.values[state.sort.field] || "").toLowerCase();
        if (left === right) {
            return 0;
        }
        return state.sort.order === "asc" ? (left > right ? 1 : -1) : (left < right ? 1 : -1);
    });
}

function openDetailModal(rowId) {
    const row = state.category.rows.find((item) => item.id === rowId);
    if (!row) {
        return;
    }

    document.getElementById("modal-title").textContent = row.values[state.category.columns[0]] || definition.name;
    document.getElementById("modal-meta").innerHTML = state.category.columns.slice(1, 4).map((column) => `
        <div class="modal-meta-item"><span class="modal-meta-label">${column}</span><span class="modal-meta-value">${escapeHtml(row.values[column] || "-")}</span></div>
    `).join("");
    document.getElementById("modal-review").textContent = state.category.columns.map((column) => `${column}: ${row.values[column] || "-"}`).join("\n");
    document.getElementById("detail-modal-overlay").classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeDetailModal() {
    document.getElementById("detail-modal-overlay").classList.remove("active");
    document.body.style.overflow = "";
}

function openAuthModal() {
    document.getElementById("auth-message").textContent = "";
    document.getElementById("auth-modal-overlay").classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeAuthModal() {
    document.getElementById("auth-modal-overlay").classList.remove("active");
    document.body.style.overflow = "";
}

function openEditor(rowId) {
    const row = state.category.rows.find((item) => item.id === rowId);
    const canEdit = Boolean(state.usernameKey) && (!state.viewedBrain || state.viewedBrain.usernameKey === state.usernameKey);
    if (!row || !canEdit) {
        return;
    }

    document.getElementById("edit-fields").innerHTML = state.category.columns.map((column) => `
        <label>${column}<input type="text" name="${column}" value="${escapeAttribute(row.values[column] || "")}"></label>
    `).join("");
    document.getElementById("edit-row-form").dataset.rowId = row.id;
    document.getElementById("edit-row-modal-overlay").classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeEditor() {
    document.getElementById("edit-row-modal-overlay").classList.remove("active");
    document.body.style.overflow = "";
}

window.closeEditor = closeEditor;

async function saveAndRender() {
    await saveCategory(slug, state.category);
    await renderPage();
}

function applyPageIdentity() {
    const brainName = state.viewedBrain?.username || state.username;
    document.title = brainName ? `${brainName}'s Brain | ${definition.name}` : `${definition.name} | Digital Brain`;
    document.getElementById("page-title").textContent = brainName ? `${brainName}'s Brain` : "Digital Brain";
    document.getElementById("page-subtitle").textContent = brainName
        ? `Explore ${brainName}'s ${definition.name.toLowerCase()}`
        : definition.subtitle;
    document.querySelector("nav .logo").href = buildBrainPath(state.viewedBrain?.usernameKey || state.usernameKey || "");
}

function resolveRoute() {
    const params = new URLSearchParams(window.location.search);
    const queryBrain = normalizeUsernameKey(params.get("brain"));
    const pathSegments = window.location.pathname.split("/").filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1] || "";
    const pathSlug = lastSegment.endsWith(".html") ? lastSegment.replace(".html", "") : lastSegment;
    const explicitSlug = CATEGORY_DEFINITIONS[pathSlug] ? pathSlug : null;

    if (pathSegments.length >= 2 && CATEGORY_DEFINITIONS[pathSegments[pathSegments.length - 1]]) {
        return {
            usernameKey: normalizeUsernameKey(pathSegments[pathSegments.length - 2]),
            slug: pathSegments[pathSegments.length - 1]
        };
    }

    return {
        usernameKey: queryBrain || "",
        slug: explicitSlug || "movies"
    };
}

async function initializeRouteState() {
    if (!route.usernameKey) {
        return true;
    }
    try {
        state.viewedBrain = await getPublicBrain(route.usernameKey);
        renderRegionNav();
        applyPageIdentity();
        if (window.location.search.includes("brain=")) {
            window.history.replaceState({}, "", buildBrainPath(state.viewedBrain.usernameKey, slug));
        }
        return true;
    } catch (error) {
        document.getElementById("content").innerHTML = `<div class="error"><p>${escapeHtml(error.message)}</p></div>`;
        document.getElementById("edit-toggle-btn").style.display = "none";
        document.getElementById("editor-toolbar").style.display = "none";
        return false;
    }
}

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
}

function escapeAttribute(value) {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
