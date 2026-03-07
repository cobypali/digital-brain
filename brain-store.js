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

export async function getSessionUser() {
    const data = await request("/api/session", { method: "GET" });
    return data.user;
}

export async function getSessionUsername() {
    const user = await getSessionUser();
    return user?.username ?? null;
}

export async function signup(username, password) {
    const data = await request("/api/signup", {
        method: "POST",
        body: JSON.stringify({ username, password })
    });
    return data.user;
}

export async function login(username, password) {
    const data = await request("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
    });
    return data.user;
}

export async function loginDemo() {
    const data = await request("/api/demo-login", { method: "POST", body: "{}" });
    return data.user;
}

export async function logout() {
    await request("/api/logout", { method: "POST", body: "{}" });
}

export async function getCategory(slug) {
    const data = await request(`/api/category/${slug}`, { method: "GET" });
    return data.category;
}

export async function saveCategory(slug, categoryData) {
    const data = await request(`/api/category/${slug}`, {
        method: "PUT",
        body: JSON.stringify({ category: categoryData })
    });
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
