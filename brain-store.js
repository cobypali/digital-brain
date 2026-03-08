const SESSION_KEY = "digital_brain_session";

export const CATEGORY_DEFINITIONS = {
    books: {
        name: "Books",
        description: "Books, highlights, and what to read next.",
        brainRegion: "Temporal language areas (Wernicke's area)",
        color: 0x44ff44,
        subtitle: "Books, highlights, authors, and reading notes.",
        columns: ["Title", "Author", "Status", "Rating", "Notes"]
    },
    movies: {
        name: "Movies",
        description: "Favorite movies, reviews, and things to revisit.",
        brainRegion: "Occipital Lobe",
        subtitle: "Movies, directors, ratings, and review notes.",
        color: 0xff4444,
        columns: ["Title", "Director", "Year", "Rating", "Notes"]
    },
    music: {
        name: "Music",
        description: "Artists, albums, tracks, and playlists.",
        brainRegion: "Auditory cortex",
        subtitle: "Albums, artists, moods, playlists, and notes.",
        color: 0xff44ff,
        columns: ["Title", "Artist", "Type", "Rating", "Notes"]
    },
    thoughts: {
        name: "Thoughts",
        description: "Ideas, fragments, questions, and observations.",
        brainRegion: "Anterior prefrontal cortex",
        subtitle: "Ideas, observations, questions, and loose thoughts.",
        color: 0x00d4ff,
        columns: ["Title", "Tag", "Date", "Status", "Notes"]
    },
    tv: {
        name: "TV Shows",
        description: "Shows, seasons, favorite episodes, and reviews.",
        brainRegion: "Visual association cortex",
        subtitle: "Shows, seasons, episodes, ratings, and notes.",
        color: 0xf87171,
        columns: ["Title", "Season", "Status", "Rating", "Notes"]
    }
};

export const HOME_REGIONS = [
    { slug: "books", position: [53.49, 15.3, -18.65] },
    { slug: "movies", position: [-30.06, 4.4, -59.25] },
    { slug: "music", position: [-55.86, 9.78, -3.42] },
    { slug: "thoughts", position: [-15.55, 20.11, 67.4] },
    { slug: "tv", position: [24.72, -6.84, 58.32] }
];

function getAppsScriptUrl() {
    const url = window.DIGITAL_BRAIN_CONFIG?.appsScriptUrl;
    if (!url) {
        throw new Error("Missing Apps Script URL. Set it in config.js.");
    }
    return url;
}

function getSession() {
    try {
        return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch (error) {
        return null;
    }
}

function setSession(session) {
    if (!session) {
        localStorage.removeItem(SESSION_KEY);
        return;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

async function request(action, payload = {}) {
    const response = await fetch(getAppsScriptUrl(), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, ...payload })
    });
    const text = await response.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch (error) {
        throw new Error(`Apps Script returned a non-JSON response. Recheck deployment access and redeploy the web app. Raw response: ${text.slice(0, 120)}`);
    }
    if (!response.ok || data.ok === false) {
        throw new Error(data.error || "Request failed.");
    }
    return data;
}

export async function getSessionUser() {
    const session = getSession();
    if (!session?.token) {
        return null;
    }
    try {
        const data = await request("session", { token: session.token });
        if (!data.user) {
            setSession(null);
            return null;
        }
        setSession({ token: session.token, username: data.user.username });
        return data.user;
    } catch (error) {
        setSession(null);
        return null;
    }
}

export async function getSessionUsername() {
    const user = await getSessionUser();
    return user?.username ?? null;
}

export async function signup(username, password) {
    const data = await request("signup", { username, password });
    setSession({ token: data.token, username: data.user.username });
    return data.user;
}

export async function login(username, password) {
    const data = await request("login", { username, password });
    setSession({ token: data.token, username: data.user.username });
    return data.user;
}

export async function logout() {
    const session = getSession();
    if (session?.token) {
        try {
            await request("logout", { token: session.token });
        } catch (error) {
            // Ignore remote logout failures and clear local session anyway.
        }
    }
    setSession(null);
}

export async function getCategory(slug) {
    const session = getSession();
    if (!session?.token) {
        throw new Error("You must be signed in.");
    }
    const data = await request("getCategory", { token: session.token, slug });
    return data.category;
}

export async function saveCategory(slug, categoryData) {
    const session = getSession();
    if (!session?.token) {
        throw new Error("You must be signed in.");
    }
    const data = await request("saveCategory", { token: session.token, slug, category: categoryData });
    return data.category;
}

export function createEmptyRow(slug) {
    const definition = CATEGORY_DEFINITIONS[slug];
    const values = {};
    definition.columns.forEach((column) => {
        values[column] = "";
    });
    return { id: crypto.randomUUID(), values };
}
