const CATEGORY_DEFINITIONS = {
  books: { name: 'Books', columns: ['Title', 'Author', 'Status', 'Rating', 'Notes'] },
  movies: { name: 'Movies', columns: ['Title', 'Director', 'Year', 'Rating', 'Notes'] },
  music: { name: 'Music', columns: ['Title', 'Artist', 'Type', 'Rating', 'Notes'] },
  thoughts: { name: 'Thoughts', columns: ['Title', 'Tag', 'Date', 'Status', 'Notes'] },
  tv: { name: 'TV Shows', columns: ['Title', 'Season', 'Status', 'Rating', 'Notes'] }
};

const MASTER_SHEET_ID = '11vWPOqAZWiAfXokhE-WWwXevhiLR_-4GkUn5AhiNnqU';
const USER_SHEETS_FOLDER_ID = '1Ku7OOyyFJSxM1yKShlpS6jDi1KwViyju';
const MASTER_TAB = 'Users';
const ADMIN_PASSWORD = 'Facebookisover!';
const MASTER_HEADERS = ['username', 'usernameKey', 'email', 'emailKey', 'passwordHash', 'passwordSalt', 'sheetId', 'createdAt'];
const USER_CACHE_TTL_SECONDS = 120;
const SAMPLE_ROWS = {
  books: { Title: 'Sample Book', Author: 'Sample Author', Status: 'Reading', Rating: '5', Notes: 'Sample entry. Replace this with your own book notes.' },
  movies: { Title: 'Sample Movie', Director: 'Sample Director', Year: '2026', Rating: '5', Notes: 'Sample entry. Replace this with your own movie notes.' },
  music: { Title: 'Sample Song', Artist: 'Sample Artist', Type: 'Album', Rating: '5', Notes: 'Sample entry. Replace this with your own music notes.' },
  thoughts: { Title: 'Sample Thought', Tag: 'Sample', Date: '2026-03-08', Status: 'Draft', Notes: 'Sample entry. Replace this with your own thought.' },
  tv: { Title: 'Sample Show', Season: '1', Status: 'Watching', Rating: '5', Notes: 'Sample entry. Replace this with your own TV notes.' }
};

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const action = payload.action;

    switch (action) {
      case 'signup':
        return jsonResponse(handleSignup(payload));
      case 'login':
        return jsonResponse(handleLogin(payload));
      case 'logout':
        return jsonResponse(handleLogout(payload));
      case 'session':
        return jsonResponse(handleSession(payload));
      case 'getCategory':
        return jsonResponse(handleGetCategory(payload));
      case 'saveCategory':
        return jsonResponse(handleSaveCategory(payload));
      case 'publicProfile':
        return jsonResponse(handlePublicProfile(payload));
      case 'publicCategory':
        return jsonResponse(handlePublicCategory(payload));
      case 'adminLogin':
        return jsonResponse(handleAdminLogin(payload));
      case 'adminSession':
        return jsonResponse(handleAdminSession(payload));
      case 'adminLogout':
        return jsonResponse(handleAdminLogout(payload));
      case 'adminUsers':
        return jsonResponse(handleAdminUsers(payload));
      case 'adminUserDetail':
        return jsonResponse(handleAdminUserDetail(payload));
      default:
        return jsonResponse({ ok: false, error: 'Unknown action.' });
    }
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || String(error) });
  }
}

function doGet() {
  return jsonResponse({
    ok: true,
    status: 'healthy',
    service: 'digital-brain-apps-script'
  });
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function getMasterSheet() {
  const sheet = SpreadsheetApp.openById(MASTER_SHEET_ID);
  let tab = sheet.getSheetByName(MASTER_TAB);
  if (!tab) {
    tab = sheet.insertSheet(MASTER_TAB);
  }
  if (tab.getLastRow() === 0) {
    tab.getRange(1, 1, 1, MASTER_HEADERS.length).setValues([MASTER_HEADERS]);
  } else {
    const existingHeaders = tab.getRange(1, 1, 1, Math.max(tab.getLastColumn(), 1)).getValues()[0];
    if (existingHeaders.join('|') !== MASTER_HEADERS.join('|')) {
      tab.getRange(1, 1, 1, MASTER_HEADERS.length).setValues([MASTER_HEADERS]);
    }
  }
  return tab;
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password, salt) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + password,
    Utilities.Charset.UTF_8
  );
  return raw.map((b) => {
    const value = b < 0 ? b + 256 : b;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function randomToken() {
  return Utilities.getUuid() + Utilities.getUuid();
}

function getUserRowByIdentifier(identifier) {
  const normalizedIdentifier = String(identifier || '').includes('@')
    ? normalizeEmail(identifier)
    : normalizeUsername(identifier);
  const cache = CacheService.getScriptCache();
  const cached = cache.get('user:' + normalizedIdentifier);
  if (cached) {
    return JSON.parse(cached);
  }

  const sheet = getMasterSheet();
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i += 1) {
    const rowUsernameKey = values[i][1];
    const hasEmailColumns = values[i].length >= 8;
    const rowEmail = hasEmailColumns ? (values[i][2] || '') : '';
    const rowEmailKey = hasEmailColumns ? (values[i][3] || normalizeEmail(rowEmail)) : '';
    if (rowUsernameKey === normalizedIdentifier || rowEmailKey === normalizedIdentifier) {
      const user = {
        rowIndex: i + 1,
        username: values[i][0],
        usernameKey: rowUsernameKey,
        email: rowEmail,
        emailKey: rowEmailKey,
        passwordHash: hasEmailColumns ? values[i][4] : values[i][2],
        passwordSalt: hasEmailColumns ? values[i][5] : values[i][3],
        sheetId: hasEmailColumns ? values[i][6] : values[i][4],
        createdAt: hasEmailColumns ? values[i][7] : values[i][5]
      };
      cache.put('user:' + user.usernameKey, JSON.stringify(user), USER_CACHE_TTL_SECONDS);
      if (user.emailKey) {
        cache.put('user:' + user.emailKey, JSON.stringify(user), USER_CACHE_TTL_SECONDS);
      }
      return user;
    }
  }
  return null;
}

function createUserSheet(username) {
  const spreadsheet = SpreadsheetApp.create(username + ' - Digital Brain');
  const defaultSheet = spreadsheet.getSheets()[0];

  Object.keys(CATEGORY_DEFINITIONS).forEach((slug, index) => {
    const definition = CATEGORY_DEFINITIONS[slug];
    const sheet = index === 0 ? defaultSheet : spreadsheet.insertSheet();
    sheet.setName(definition.name);
    sheet.getRange(1, 1, 1, definition.columns.length + 1).setValues([['id'].concat(definition.columns)]);
    const sampleValues = SAMPLE_ROWS[slug] || {};
    const sampleRow = [Utilities.getUuid()].concat(definition.columns.map((column) => sampleValues[column] || ''));
    sheet.getRange(2, 1, 1, definition.columns.length + 1).setValues([sampleRow]);
  });

  const file = DriveApp.getFileById(spreadsheet.getId());
  const folder = DriveApp.getFolderById(USER_SHEETS_FOLDER_ID);
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  return spreadsheet.getId();
}

function createSession(usernameKey, username) {
  const token = randomToken();
  PropertiesService.getScriptProperties().setProperty('session:' + token, JSON.stringify({
    usernameKey: usernameKey,
    username: username
  }));
  return token;
}

function getSession(token) {
  if (!token) {
    return null;
  }
  const raw = PropertiesService.getScriptProperties().getProperty('session:' + token);
  return raw ? JSON.parse(raw) : null;
}

function destroySession(token) {
  if (token) {
    PropertiesService.getScriptProperties().deleteProperty('session:' + token);
  }
}

function requireSession(token) {
  const session = getSession(token);
  if (!session) {
    throw new Error('Invalid session.');
  }
  return session;
}

function createAdminSession() {
  const token = randomToken();
  PropertiesService.getScriptProperties().setProperty('admin:' + token, '1');
  return token;
}

function isAdmin(token) {
  return PropertiesService.getScriptProperties().getProperty('admin:' + token) === '1';
}

function destroyAdminSession(token) {
  if (token) {
    PropertiesService.getScriptProperties().deleteProperty('admin:' + token);
  }
}

function requireAdmin(token) {
  if (!isAdmin(token)) {
    throw new Error('Admin login required.');
  }
}

function categorySheet(spreadsheetId, slug) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const definition = CATEGORY_DEFINITIONS[slug];
  const sheet = spreadsheet.getSheetByName(definition.name);
  if (!sheet) {
    throw new Error('Missing category sheet: ' + definition.name);
  }
  return sheet;
}

function readCategory(spreadsheetId, slug) {
  const definition = CATEGORY_DEFINITIONS[slug];
  const sheet = categorySheet(spreadsheetId, slug);
  const values = sheet.getDataRange().getValues();
  const rows = [];

  for (let i = 1; i < values.length; i += 1) {
    const rowValues = {};
    definition.columns.forEach((column, index) => {
      rowValues[column] = values[i][index + 1] || '';
    });
    rows.push({ id: values[i][0] || Utilities.getUuid(), values: rowValues });
  }

  return {
    slug: slug,
    name: definition.name,
    columns: definition.columns,
    rows: rows
  };
}

function writeCategory(spreadsheetId, slug, category) {
  const definition = CATEGORY_DEFINITIONS[slug];
  const sheet = categorySheet(spreadsheetId, slug);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, definition.columns.length + 1).setValues([['id'].concat(definition.columns)]);

  const rows = category.rows || [];
  if (rows.length) {
    const values = rows.map((row) => {
      return [row.id || Utilities.getUuid()].concat(definition.columns.map((column) => row.values[column] || ''));
    });
    sheet.getRange(2, 1, values.length, definition.columns.length + 1).setValues(values);
  }

  return readCategory(spreadsheetId, slug);
}

function handleSignup(payload) {
  const username = String(payload.username || '').trim();
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || '');
  const usernameKey = normalizeUsername(username);
  const emailKey = normalizeEmail(email);

  if (usernameKey.length < 3) {
    throw new Error('Choose a username with at least 3 valid characters.');
  }
  if (!isValidEmail(email)) {
    throw new Error('Enter a valid email address.');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  if (getUserRowByIdentifier(usernameKey)) {
    throw new Error('That username already exists.');
  }
  if (getUserRowByIdentifier(emailKey)) {
    throw new Error('That email already exists.');
  }

  const salt = Utilities.getUuid();
  const passwordHash = hashPassword(password, salt);
  const sheetId = createUserSheet(username);
  const master = getMasterSheet();
  master.appendRow([username, usernameKey, email, emailKey, passwordHash, salt, sheetId, new Date().toISOString()]);
  const user = { rowIndex: master.getLastRow(), username: username, usernameKey: usernameKey, email: email, emailKey: emailKey, passwordHash: passwordHash, passwordSalt: salt, sheetId: sheetId, createdAt: new Date().toISOString() };
  const cache = CacheService.getScriptCache();
  cache.put('user:' + usernameKey, JSON.stringify(user), USER_CACHE_TTL_SECONDS);
  cache.put('user:' + emailKey, JSON.stringify(user), USER_CACHE_TTL_SECONDS);
  const token = createSession(usernameKey, username);
  return { ok: true, token: token, user: { username: username, usernameKey: usernameKey } };
}

function handleLogin(payload) {
  const identifier = String(payload.identifier || payload.username || '').trim();
  const password = String(payload.password || '');
  const user = getUserRowByIdentifier(identifier);
  if (!user) {
    throw new Error('Incorrect username or password.');
  }
  if (hashPassword(password, user.passwordSalt) !== user.passwordHash) {
    throw new Error('Incorrect username or password.');
  }
  const token = createSession(user.usernameKey, user.username);
  return { ok: true, token: token, user: { username: user.username, usernameKey: user.usernameKey } };
}

function handleLogout(payload) {
  destroySession(payload.token);
  return { ok: true };
}

function handleSession(payload) {
  const session = getSession(payload.token);
  return { ok: true, user: session ? { username: session.username, usernameKey: session.usernameKey } : null };
}

function handleGetCategory(payload) {
  const session = requireSession(payload.token);
  const user = getUserRowByIdentifier(session.usernameKey);
  return { ok: true, category: readCategory(user.sheetId, payload.slug) };
}

function handleSaveCategory(payload) {
  const session = requireSession(payload.token);
  const user = getUserRowByIdentifier(session.usernameKey);
  return { ok: true, category: writeCategory(user.sheetId, payload.slug, payload.category) };
}

function handlePublicProfile(payload) {
  const user = getUserRowByIdentifier(payload.usernameKey || payload.username);
  if (!user) {
    throw new Error('Brain not found.');
  }
  return {
    ok: true,
    user: {
      username: user.username,
      usernameKey: user.usernameKey
    }
  };
}

function handlePublicCategory(payload) {
  const user = getUserRowByIdentifier(payload.usernameKey || payload.username);
  if (!user) {
    throw new Error('Brain not found.');
  }
  return { ok: true, category: readCategory(user.sheetId, payload.slug) };
}

function handleAdminLogin(payload) {
  if (String(payload.password || '') !== ADMIN_PASSWORD) {
    throw new Error('Incorrect admin password.');
  }
  return { ok: true, token: createAdminSession() };
}

function handleAdminSession(payload) {
  return { ok: true, authenticated: isAdmin(payload.adminToken) };
}

function handleAdminLogout(payload) {
  destroyAdminSession(payload.adminToken);
  return { ok: true };
}

function handleAdminUsers(payload) {
  requireAdmin(payload.adminToken);
  const sheet = getMasterSheet();
  const values = sheet.getDataRange().getValues();
  const users = [];
  for (let i = 1; i < values.length; i += 1) {
    const username = values[i][0];
    const usernameKey = values[i][1];
    const email = values[i][2] || '';
    const sheetId = values[i][6];
    let totalEntries = 0;
    Object.keys(CATEGORY_DEFINITIONS).forEach((slug) => {
      totalEntries += readCategory(sheetId, slug).rows.length;
    });
    users.push({
      id: i,
      username: username,
      usernameKey: usernameKey,
      email: email,
      category_count: Object.keys(CATEGORY_DEFINITIONS).length,
      total_entries: totalEntries
    });
  }
  return { ok: true, users: users };
}

function handleAdminUserDetail(payload) {
  requireAdmin(payload.adminToken);
  const targetKey = normalizeUsername(payload.usernameKey);
  const user = getUserRowByIdentifier(targetKey);
  if (!user) {
    throw new Error('User not found.');
  }
  return {
    ok: true,
    user: { username: user.username, username_key: user.usernameKey, email: user.email || '' },
    categories: Object.keys(CATEGORY_DEFINITIONS).map((slug) => ({
      slug: slug,
      payload: readCategory(user.sheetId, slug)
    }))
  };
}
