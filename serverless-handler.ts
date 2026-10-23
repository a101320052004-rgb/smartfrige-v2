import { createCipheriv, createHmac, pbkdf2Sync, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { connect as connectNet } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { GoogleGenAI } from '@google/genai';

const SESSION_COOKIE = 'sf_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const GMAIL_UNSET_PASSWORD_PREFIX = 'gmail-unset$';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SMTP_TIMEOUT_MS = 20000;

type ApiRequest = {
  method?: string;
  query?: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  url?: string;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
};

type DbRow = Record<string, any>;

class HttpError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const method = (req.method || 'GET').toUpperCase();
    const segments = getPathSegments(req);
    const body = await getBody(req);

    if (segments[0] === 'health' && method === 'GET') {
      return ok(res, { ok: true });
    }

    if (segments[0] === 'register' && method === 'POST') {
      return register(req, res, body);
    }
    if (segments[0] === 'login' && segments[1] === 'google' && segments[2] === 'request' && method === 'POST') {
      return requestGmailLogin(res, body);
    }
    if (segments[0] === 'login' && segments[1] === 'google' && segments[2] === 'confirm' && method === 'POST') {
      return confirmGmailLogin(res, body);
    }
    if (segments[0] === 'login' && method === 'POST') {
      return login(req, res, body);
    }
    if (segments[0] === 'logout' && method === 'POST') {
      clearSession(res);
      return ok(res, { loggedOut: true });
    }
    if (segments[0] === 'me' && method === 'GET') {
      const userId = requireSession(req);
      const user = await getUser(userId);
      return ok(res, userToApi(user));
    }
    if (segments[0] === 'password' && segments[1] === 'change' && method === 'PUT') {
      const userId = requireSession(req);
      return changePassword(res, userId, body);
    }
    if (segments[0] === 'password' && segments[1] === 'reset' && segments[2] === 'request' && method === 'POST') {
      return requestPasswordReset(res, body);
    }
    if (segments[0] === 'password' && segments[1] === 'reset' && segments[2] === 'confirm' && method === 'POST') {
      return confirmPasswordReset(res, body);
    }

    if (segments[0] === 'scan' && method === 'POST') {
      await requireSupabaseProfile(req);
      return scanIngredients(res, body);
    }

    if (segments[0] === 'planner' && segments[1] === 'image' && method === 'POST') {
      await requireSupabaseProfile(req);
      return generatePlannerImage(res, body);
    }

    if (segments[0] === 'recipes' && segments[1] === 'generate' && method === 'POST') {
      const profile = await requireSupabaseProfile(req);
      return generateRecipes(res, profile, body);
    }

    if (segments[0] === 'prices') {
      return pricesRouter(req, res, segments.slice(1), method, body);
    }

    if (segments[0] === 'notifications' && segments[1] === 'sync-expiry' && method === 'GET') {
      ensureCronRequest(req);
      return ok(res, await syncAllExpiryNotifications());
    }

    if (segments[0] === 'notifications' && segments[1] === 'sync-expiry' && method === 'POST') {
      const profile = await requireSupabaseProfile(req);
      return ok(res, await syncExpiryNotifications(profile.id));
    }

    const userId = requireSession(req);

    if (segments[0] === 'settings') {
      if (method === 'GET') return ok(res, await getSettings(userId));
      if (method === 'PUT') return ok(res, await updateSettings(userId, body));
    }

    if (segments[0] === 'ingredients') {
      return ingredientsRouter(res, method, segments.slice(1), userId, body);
    }

    if (segments[0] === 'shopping-items') {
      return shoppingRouter(res, method, segments.slice(1), userId, body);
    }

    if (segments[0] === 'notifications') {
      return notificationsRouter(res, method, segments.slice(1), userId);
    }

    if (segments[0] === 'state') {
      return stateRouter(res, method, segments.slice(1), userId, body);
    }

    if (segments[0] === 'recipes') {
      return recipesRouter(res, method, segments.slice(1), userId, body);
    }

    if (segments[0] === 'follows') {
      return followsRouter(res, method, segments.slice(1), userId, body);
    }

    throw new HttpError('API route not found', 404);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Server error';
    return fail(res, message, status);
  }
}

async function register(req: ApiRequest, res: ApiResponse, body: any) {
  const username = String(body?.username || '').trim();
  const password = String(body?.password || '');
  const chefName = String(body?.chefName || '').trim().slice(0, 50) || username.split('@')[0] || 'Chef';

  if (!username || !password) throw new HttpError('Username and password are required.', 400);
  if (password.length < 8) throw new HttpError('Password must be at least 8 characters.', 400);

  const existing = await dbSelect('users', `select=id&username=eq.${enc(username)}&limit=1`);
  if (existing.length > 0) throw new HttpError('This account already exists.', 400);

  const inserted = await dbInsert('users', {
    username,
    password_hash: hashPassword(password),
    chef_name: chefName,
    chef_rank: 'Chef',
  });
  const user = inserted[0];
  await ensureSettings(Number(user.id));
  setSession(req, res, Number(user.id));
  return ok(res, userToApi(user), 201);
}

async function login(req: ApiRequest, res: ApiResponse, body: any) {
  const username = String(body?.username || '').trim();
  const password = String(body?.password || '');
  const users = await dbSelect('users', `select=*&username=eq.${enc(username)}&limit=1`);
  const user = users[0];
  if (!user || !verifyPassword(password, String(user.password_hash || ''))) {
    throw new HttpError('Email or password is incorrect.', 401);
  }
  await ensureSettings(Number(user.id));
  setSession(req, res, Number(user.id));
  return ok(res, userToApi(user));
}

async function requestGmailLogin(res: ApiResponse, body: any) {
  const email = normalizeEmail(body?.username || body?.email);
  ensureValidEmail(email);
  ensureGmailEmail(email);

  await requestSupabaseEmailOtp(email);

  return res.status(200).json({ success: true });
}

async function confirmGmailLogin(res: ApiResponse, body: any) {
  const email = normalizeEmail(body?.email || body?.username || body?.user || '');
  const token = String(body?.token || body?.code || body?.otp || '').trim();
  const isNumericOtp = /^\d+$/.test(token);

  if (!email || !token) {
    return res.status(400).json({ success: false, error: '請輸入 Email 與驗證碼' });
  }

  try {
    ensureValidEmail(email);
    ensureGmailEmail(email);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email 格式不正確。';
    return res.status(error instanceof HttpError ? error.status : 400).json({ success: false, error: message });
  }

  console.error(`Gmail confirm: email=${email}, tokenLength=${token.length}, isNumericOtp=${isNumericOtp}`);

  let authResult;
  try {
    authResult = await verifySupabaseEmailOtp(email, token);
  } catch (error) {
    const message = error instanceof Error ? error.message : '驗證失敗。';
    console.error(`Gmail confirm error: ${message}`);
    if (/token has expired|invalid/i.test(message)) {
      return res.status(400).json({ success: false, error: '驗證碼錯誤或已過期，請重新取得驗證碼' });
    }
    return res.status(error instanceof HttpError ? error.status : 500).json({ success: false, error: message });
  }

  const authUser = authResult.user;
  if (!authUser?.id) {
    return res.status(400).json({ success: false, error: 'Gmail 登入驗證失敗，請重新寄送。' });
  }
  const session = normalizeSupabaseSession(authResult);
  console.error(
    `Gmail confirm success: email=${email}, hasUser=${Boolean(authUser.id)}, hasSession=${Boolean(session?.access_token && session.refresh_token)}`,
  );
  if (!session?.access_token || !session.refresh_token) {
    return res.status(500).json({ success: false, error: '驗證成功，但登入 session 串接失敗。' });
  }

  const verifiedEmail = normalizeEmail(authUser.email || email);
  if (verifiedEmail !== email) {
    return res.status(400).json({ success: false, error: '登入信箱不相符，請重新寄送。' });
  }

  return res.status(200).json({
    success: true,
    session,
    user: authUser,
    data: {
      session,
      user: authUser,
    },
  });
}

async function requestPasswordReset(res: ApiResponse, body: any) {
  const email = normalizeEmail(body?.username || body?.email);
  ensureValidEmail(email);

  await requestSupabasePasswordRecovery(email);

  return res.status(200).json({
    success: true,
    message: '重設密碼連結已寄出',
    data: { sent: true, message: '重設密碼連結已寄出' },
  });
}

async function confirmPasswordReset(res: ApiResponse, body: any) {
  const email = normalizeEmail(body?.username || body?.email);
  const token = String(body?.token || '').trim();
  const newPassword = String(body?.newPassword || body?.password || '');
  ensureValidEmail(email);
  if (!token) throw new HttpError('重設連結無效，請重新寄送。', 400);
  if (newPassword.length < 8) throw new HttpError('新密碼至少需要 8 碼。', 400);

  const authResult = await verifySupabaseOtp({ token_hash: token, type: 'recovery' });
  const authUser = authResult.user;
  if (!authUser?.id || normalizeEmail(authUser.email || '') !== email) {
    throw new HttpError('重設連結與 Email 不相符。', 400);
  }

  const accessToken = authResult.session?.access_token;
  if (!accessToken) throw new HttpError('重設連結已過期，請重新寄送。', 400);
  await updateSupabaseUserPassword(accessToken, newPassword);
  await dbUpdate('users', { password_hash: 'managed-by-supabase-auth' }, `auth_user_id=eq.${enc(String(authUser.id))}`);

  return ok(res, { reset: true });
}

async function requestSupabasePasswordRecovery(email: string) {
  const url = getRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const anonKey = getRequiredEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  const response = await fetch(`${url}/auth/v1/recover`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      redirect_to: `${getAppUrl()}/?reset=1`,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(data?.message || data?.msg || '寄送重設密碼信失敗。', response.status);
  }
  return data;
}

async function requestSupabaseEmailOtp(email: string) {
  const url = getRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const anonKey = getRequiredEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  const response = await fetch(`${url}/auth/v1/otp`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      should_create_user: false,
      data: { chef_name: email.split('@')[0] || 'Gmail 使用者' },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(data?.message || data?.msg || '寄送 Gmail 驗證碼失敗，請稍後再試。', response.status);
  }
  return data;
}

async function changePassword(res: ApiResponse, userId: number, body: any) {
  const currentPassword = String(body?.currentPassword || '');
  const newPassword = String(body?.newPassword || '');
  if (newPassword.length < 8) throw new HttpError('New password must be at least 8 characters.', 400);
  const user = await getUser(userId);
  if (!verifyPassword(currentPassword, String(user.password_hash || ''))) {
    throw new HttpError('Current password is incorrect.', 400);
  }
  await dbUpdate('users', { password_hash: hashPassword(newPassword) }, `id=eq.${userId}`);
  return ok(res, { changed: true });
}

async function getUser(userId: number) {
  const rows = await dbSelect('users', `select=*&id=eq.${userId}&limit=1`);
  if (!rows[0]) throw new HttpError('Not logged in.', 401);
  return rows[0];
}

function userToApi(user: DbRow) {
  return {
    id: String(user.id),
    username: user.username,
    chefName: user.chef_name || user.username,
    chefRank: user.chef_rank || 'Chef',
    mustSetPassword: isGmailUnsetPassword(user.password_hash),
    isNewAccount: Boolean(user.is_new_account),
  };
}

async function getSettings(userId: number) {
  await ensureSettings(userId);
  const user = await getUser(userId);
  const rows = await dbSelect('user_settings', `select=*&user_id=eq.${userId}&limit=1`);
  const row = rows[0] || {};
  return {
    chefName: user.chef_name || user.username || 'Chef',
    theme: row.theme || 'sky',
    expiryReminderDays: row.expiry_reminder_days ?? 3,
    expiryPushTime: row.expiry_push_time || '09:00',
    recipeUpdateTime: row.recipe_update_time || '06:30',
    tourSeen: Boolean(row.tour_seen),
    restockDefaultsSet: Boolean(row.restock_defaults_set),
    restockReminderIds: parseJsonArray(row.restock_reminder_ids),
  };
}

async function updateSettings(userId: number, body: any) {
  await ensureSettings(userId);
  if (Object.prototype.hasOwnProperty.call(body || {}, 'chefName')) {
    await dbUpdate('users', { chef_name: String(body.chefName || '').trim().slice(0, 50) || 'Chef' }, `id=eq.${userId}`);
  }

  const patch: DbRow = {};
  if ('theme' in body) patch.theme = String(body.theme || 'sky');
  if ('expiryReminderDays' in body) patch.expiry_reminder_days = Number(body.expiryReminderDays);
  if ('expiryPushTime' in body) patch.expiry_push_time = String(body.expiryPushTime || '09:00');
  if ('recipeUpdateTime' in body) patch.recipe_update_time = String(body.recipeUpdateTime || '06:30');
  if ('tourSeen' in body) patch.tour_seen = Boolean(body.tourSeen);
  if ('restockDefaultsSet' in body) patch.restock_defaults_set = Boolean(body.restockDefaultsSet);
  if ('restockReminderIds' in body) patch.restock_reminder_ids = JSON.stringify(Array.isArray(body.restockReminderIds) ? body.restockReminderIds : []);
  if (Object.keys(patch).length > 0) {
    await dbUpdate('user_settings', patch, `user_id=eq.${userId}`);
  }
  return getSettings(userId);
}

async function ensureSettings(userId: number) {
  await dbUpsert('user_settings', { user_id: userId }, 'user_id');
}

async function ensureSettingsAsUser(accessToken: string, userId: number) {
  await userDbUpsert(accessToken, 'user_settings', { user_id: userId }, 'user_id');
}

async function ensureProfileForAuthUser(
  authUserId: string,
  email: string,
  options: { markPasswordUnsetWhenCreated?: boolean } = {},
) {
  const byAuth = await adminDbSelect('users', `select=*&auth_user_id=eq.${enc(authUserId)}&limit=1`);
  if (byAuth[0]) return { profile: byAuth[0], isNewAccount: false };

  const byEmail = await adminDbSelect('users', `select=*&username=eq.${enc(email)}&limit=1`);
  if (byEmail[0]) {
    const updated = await adminDbUpdate('users', { auth_user_id: authUserId }, `id=eq.${Number(byEmail[0].id)}`);
    return { profile: updated[0] || byEmail[0], isNewAccount: false };
  }

  const inserted = await adminDbInsert('users', {
    auth_user_id: authUserId,
    username: email,
    chef_name: (email.split('@')[0] || 'Gmail 使用者').slice(0, 50),
    chef_rank: 'Chef',
    password_hash: options.markPasswordUnsetWhenCreated ? makeGmailUnsetPasswordHash() : 'managed-by-supabase-auth',
  });
  const profile = inserted[0];
  await ensureSettings(Number(profile.id));
  return { profile, isNewAccount: true };
}

type SupabaseAuthLinkType = 'magiclink' | 'recovery';

async function generateSupabaseAuthLink(type: SupabaseAuthLinkType, email: string) {
  const body: DbRow = {
    type,
    email,
    redirect_to: getAppUrl(),
  };
  if (type === 'magiclink') {
    body.data = { chef_name: email.split('@')[0] || 'Gmail 使用者' };
  }

  return supabaseAuthFetch('/admin/generate_link', {
    method: 'POST',
    body,
  }) as Promise<{
    properties: {
      action_link: string;
      email_otp?: string;
      hashed_token?: string;
      verification_type: string;
    };
    user: { id: string; email?: string };
  }>;
}

function getSupabaseAuthLinkProperties(link: any) {
  const props = link?.properties || link || {};
  const actionLink = String(props.action_link || props.actionLink || '');
  return {
    actionLink,
    emailOtp: String(props.email_otp || props.emailOtp || ''),
    hashedToken: String(
      props.hashed_token ||
      props.hashedToken ||
      props.token_hash ||
      props.tokenHash ||
      getUrlParam(actionLink, 'token_hash') ||
      '',
    ),
  };
}

function getSupabaseAuthLinkUserId(link: any) {
  const id = link?.user?.id || link?.id || link?.user_id || link?.userId;
  if (!id) throw new HttpError('Supabase 沒有回傳登入使用者資訊。', 502);
  return String(id);
}

function getUrlParam(url: string, name: string) {
  if (!url) return '';
  try {
    return new URL(url).searchParams.get(name) || '';
  } catch {
    return '';
  }
}

async function verifySupabaseOtp(body: DbRow) {
  return supabaseAuthFetch('/verify', {
    method: 'POST',
    body,
    useAnonKey: true,
  }) as Promise<{
    user: { id: string; email?: string };
    session?: { access_token: string; refresh_token: string } | null;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  }>;
}

function normalizeSupabaseSession(authResult: {
  session?: { access_token?: string; refresh_token?: string } | null;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}) {
  if (authResult.session?.access_token && authResult.session.refresh_token) {
    return authResult.session;
  }
  if (authResult.access_token && authResult.refresh_token) {
    return {
      access_token: authResult.access_token,
      refresh_token: authResult.refresh_token,
      expires_in: authResult.expires_in,
      token_type: authResult.token_type || 'bearer',
    };
  }
  return null;
}

async function verifySupabaseEmailOtp(email: string, token: string) {
  const types = ['magiclink', 'email'] as const;
  let lastError: unknown = null;

  for (const type of types) {
    try {
      console.error(`Gmail confirm verify: email=${email}, tokenLength=${token.length}, type=${type}`);
      return await verifySupabaseOtp({ email, token, type });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : 'Unknown OTP error';
      console.error(`Gmail confirm verify failed: email=${email}, tokenLength=${token.length}, type=${type}, message=${message}`);
    }
  }

  throw lastError instanceof Error ? lastError : new HttpError('驗證碼錯誤或已過期，請重新取得驗證碼', 400);
}

async function updateSupabaseUserPassword(accessToken: string, password: string) {
  const url = getRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const anonKey = getRequiredEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  const response = await fetch(`${url}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(data?.message || data?.msg || '設定新密碼失敗，請重新寄送重設信。', response.status);
  }
  return data;
}

async function supabaseAuthFetch(
  path: string,
  options: { method: string; body?: unknown; useAnonKey?: boolean },
) {
  const url = getRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const key = options.useAnonKey
    ? getRequiredEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
    : getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY');
  const response = await fetch(`${url}/auth/v1${path}`, {
    method: options.method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(data?.message || data?.msg || `Supabase Auth request failed: ${response.status}`, response.status);
  }
  return data;
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function ensureValidEmail(email: string) {
  if (!EMAIL_RE.test(email)) throw new HttpError('Email 格式不正確。', 400);
}

function ensureGmailEmail(email: string) {
  const domain = String(process.env.GOOGLE_LOGIN_EMAIL_DOMAIN || 'gmail.com').trim().toLowerCase();
  if (domain && !email.endsWith(`@${domain}`)) {
    throw new HttpError('目前只支援 Gmail 信箱。', 400);
  }
}

function makeGmailUnsetPasswordHash() {
  return `${GMAIL_UNSET_PASSWORD_PREFIX}${randomBytes(24).toString('base64url')}`;
}

function isGmailUnsetPassword(value: unknown) {
  return String(value || '').startsWith(GMAIL_UNSET_PASSWORD_PREFIX);
}

function getAppUrl() {
  return String(process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'http://localhost:3000')
    .replace(/^([^:/?#]+\.vercel\.app)$/i, 'https://$1')
    .replace(/\/$/, '');
}

function buildAppLink(params: Record<string, string>) {
  const query = new URLSearchParams(params);
  return `${getAppUrl()}/?${query.toString()}`;
}

async function sendPasswordResetEmail(toEmail: string, resetLink: string) {
  await sendSmtpMail({
    to: toEmail,
    subject: 'AI食代 Smart Fridge 密碼重設',
    text: [
      '你剛剛要求重設 AI食代 Smart Fridge 的密碼。',
      '',
      '請在 1 小時內開啟以下連結並設定新密碼：',
      resetLink,
      '',
      '如果不是你本人操作，請忽略這封信。',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,'Noto Sans TC',sans-serif;line-height:1.7;color:#0f172a">
        <h2>AI食代 Smart Fridge 密碼重設</h2>
        <p>你剛剛要求重設密碼，請在 1 小時內開啟以下連結並設定新密碼。</p>
        <p><a href="${escapeHtml(resetLink)}" style="display:inline-block;padding:12px 18px;border-radius:14px;background:#0ea5e9;color:white;text-decoration:none;font-weight:700">重設密碼</a></p>
        <p style="font-size:13px;color:#64748b">如果不是你本人操作，請忽略這封信。</p>
      </div>
    `,
  });
}

async function sendGmailLoginEmail(toEmail: string, code: string, magicLink: string) {
  if (!code) throw new HttpError('Supabase 沒有產生登入驗證碼，請稍後再試。', 502);
  await sendSmtpMail({
    to: toEmail,
    subject: 'AI食代 Smart Fridge Gmail 登入驗證',
    text: [
      '你剛剛要求登入 AI食代 Smart Fridge。',
      '',
      `驗證碼：${code}`,
      '',
      '也可以在 10 分鐘內開啟以下連結登入：',
      magicLink,
      '',
      '如果不是你本人操作，請忽略這封信。',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,'Noto Sans TC',sans-serif;line-height:1.7;color:#0f172a">
        <h2>AI食代 Smart Fridge Gmail 登入驗證</h2>
        <p>請輸入以下驗證碼完成登入：</p>
        <p style="font-size:30px;font-weight:800;letter-spacing:0.24em;margin:14px 0;color:#0f172a">${escapeHtml(code)}</p>
        <p>也可以在 10 分鐘內開啟以下連結登入：</p>
        <p><a href="${escapeHtml(magicLink)}" style="display:inline-block;padding:12px 18px;border-radius:14px;background:#0ea5e9;color:white;text-decoration:none;font-weight:700">登入 Smart Fridge</a></p>
        <p style="font-size:13px;color:#64748b">如果不是你本人操作，請忽略這封信。</p>
      </div>
    `,
  });
}

async function sendSmtpMail(message: { to: string; subject: string; text: string; html: string }) {
  const server = process.env.MAIL_SERVER || 'smtp.gmail.com';
  const port = Number(process.env.MAIL_PORT || 587);
  const username = process.env.MAIL_USERNAME || process.env.SMTP_USERNAME || '';
  const password = process.env.MAIL_PASSWORD || process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASSWORD || '';
  const sender = process.env.MAIL_DEFAULT_SENDER || username;
  const useSsl = parseEnvBool(process.env.MAIL_USE_SSL, false);
  const useTls = parseEnvBool(process.env.MAIL_USE_TLS, true);

  if (!server || !sender) throw new HttpError('尚未設定寄信服務 MAIL_SERVER / MAIL_DEFAULT_SENDER。', 500);
  if (server.includes('gmail') && (!username || !password)) {
    throw new HttpError('Gmail SMTP 需要設定 MAIL_USERNAME 和 MAIL_PASSWORD。', 500);
  }

  const attempts = [{ server, port, useSsl, useTls }];
  if (server.includes('gmail') && !(port === 465 && useSsl)) {
    attempts.push({ server, port: 465, useSsl: true, useTls: false });
  }

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      await sendSmtpMailWithConfig(message, {
        ...attempt,
        username,
        password,
        sender,
      });
      return;
    } catch (error) {
      lastError = error;
      const status = error instanceof HttpError ? error.status : 500;
      if (status !== 504) break;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new HttpError('SMTP 寄信失敗。', 502);
}

async function sendSmtpMailWithConfig(
  message: { to: string; subject: string; text: string; html: string },
  config: { server: string; port: number; useSsl: boolean; useTls: boolean; username: string; password: string; sender: string },
) {
  const socket = await openSmtpSocket(config.server, config.port, config.useSsl);
  const smtp = createSmtpClient(socket);
  try {
    await smtp.expect(220);
    await smtp.command(`EHLO ${smtpDomain()}`, 250);
    if (!config.useSsl && config.useTls) {
      await smtp.command('STARTTLS', 220);
      await smtp.upgradeTls(config.server);
      await smtp.command(`EHLO ${smtpDomain()}`, 250);
    }
    if (config.username && config.password) {
      await smtp.command('AUTH LOGIN', 334);
      await smtp.command(Buffer.from(config.username).toString('base64'), 334);
      await smtp.command(Buffer.from(config.password).toString('base64'), 235);
    }
    await smtp.command(`MAIL FROM:<${config.sender}>`, 250);
    await smtp.command(`RCPT TO:<${message.to}>`, 250);
    await smtp.command('DATA', 354);
    await smtp.write(`${buildMimeMessage({ ...message, from: config.sender })}\r\n.`);
    await smtp.expect(250);
    await smtp.command('QUIT', 221).catch(() => undefined);
  } finally {
    smtp.close();
  }
}

function openSmtpSocket(server: string, port: number, useSsl: boolean) {
  return new Promise<any>((resolve, reject) => {
    const socket = useSsl
      ? connectTls({ host: server, port, servername: server })
      : connectNet({ host: server, port });
    socket.setTimeout(SMTP_TIMEOUT_MS);
    socket.once('connect', () => resolve(socket));
    socket.once('secureConnect', () => resolve(socket));
    socket.once('timeout', () => reject(new HttpError('SMTP 連線逾時。', 504)));
    socket.once('error', reject);
  });
}

function createSmtpClient(initialSocket: any) {
  let socket = initialSocket;
  let buffer = '';
  const pending: Array<(line: string) => void> = [];

  const onData = (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let index = buffer.indexOf('\n');
    while (index >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, '');
      buffer = buffer.slice(index + 1);
      const resolve = pending.shift();
      if (resolve) resolve(line);
      index = buffer.indexOf('\n');
    }
  };
  socket.on('data', onData);

  const readLine = () => new Promise<string>((resolve, reject) => {
    const handler = (line: string) => {
      clearTimeout(timer);
      resolve(line);
    };
    const timer = setTimeout(() => {
      const index = pending.indexOf(handler);
      if (index >= 0) pending.splice(index, 1);
      reject(new HttpError('SMTP 回應逾時。', 504));
    }, SMTP_TIMEOUT_MS);
    pending.push(handler);
  });
  const readResponse = async () => {
    const lines: string[] = [];
    while (true) {
      const line = await readLine();
      lines.push(line);
      if (/^\d{3} /.test(line)) return { code: Number(line.slice(0, 3)), text: lines.join('\n') };
    }
  };

  return {
    async expect(expectedCode: number) {
      const response = await readResponse();
      if (response.code !== expectedCode) throw new HttpError(`SMTP 回應錯誤：${response.text}`, 502);
      return response;
    },
    async command(command: string, expectedCode: number) {
      await this.write(command);
      return this.expect(expectedCode);
    },
    write(command: string) {
      return new Promise<void>((resolve, reject) => {
        socket.write(`${command}\r\n`, (error: Error | null | undefined) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
    upgradeTls(servername: string) {
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new HttpError('SMTP TLS 升級逾時。', 504));
        }, SMTP_TIMEOUT_MS);
        socket.removeListener('data', onData);
        socket = connectTls({ socket, servername }, () => {
          clearTimeout(timer);
          socket.setTimeout(SMTP_TIMEOUT_MS);
          socket.on('data', onData);
          resolve();
        });
        socket.once('error', (error: Error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
    },
    close() {
      socket.destroy();
    },
  };
}

function buildMimeMessage(message: { from: string; to: string; subject: string; text: string; html: string }) {
  const boundary = `smartfridge-${randomBytes(12).toString('hex')}`;
  const normalizeBody = (value: string) => value.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
  return [
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(message.subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    normalizeBody(message.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    normalizeBody(message.html),
    `--${boundary}--`,
  ].join('\r\n');
}

function parseEnvBool(value: string | undefined, fallback: boolean) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function smtpDomain() {
  return process.env.VERCEL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'localhost';
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function ingredientsRouter(res: ApiResponse, method: string, segments: string[], userId: number, body: any) {
  if (segments[0] === 'removed') {
    if (method === 'GET') {
      const rows = await dbSelect('ingredient_removal_history', `select=*&user_id=eq.${userId}&order=removed_at.desc`);
      return ok(res, rows.map(removedIngredientToApi));
    }
    if (method === 'POST' && segments[1]) {
      const removedId = Number(segments[1]);
      if (segments[2] === 'restore' && method === 'POST') {
        const rows = await dbSelect('ingredient_removal_history', `select=*&id=eq.${removedId}&user_id=eq.${userId}&limit=1`);
        const removed = rows[0];
        if (!removed) throw new HttpError('Removed ingredient not found.', 404);
        const inserted = await dbInsert('ingredients', {
          user_id: userId,
          name: removed.name,
          category: removed.category,
          qty: removed.qty,
          note: removed.note || '',
          storage_type: removed.storage_type || 'fridge',
          days_left: removed.days_left || 0,
          total_days: removed.total_days || 0,
        });
        await dbDelete('ingredient_removal_history', `id=eq.${removedId}&user_id=eq.${userId}`);
        return ok(res, ingredientToApi(inserted[0]));
      }
    }
    throw new HttpError('Route not found.', 404);
  }

  if (method === 'GET' && segments.length === 0) {
    const rows = await dbSelect('ingredients', `select=*&user_id=eq.${userId}&order=created_at.desc`);
    return ok(res, rows.map(ingredientToApi).sort((a, b) => a.daysLeft - b.daysLeft));
  }

  if (method === 'POST' && segments.length === 0) {
    const inserted = await dbInsert('ingredients', ingredientFromApi(userId, body));
    return ok(res, ingredientToApi(inserted[0]), 201);
  }

  const ingredientId = Number(segments[0]);
  if (!ingredientId) throw new HttpError('Ingredient not found.', 404);

  if (method === 'PUT') {
    const rows = await dbUpdate('ingredients', ingredientFromApi(userId, body, false), `id=eq.${ingredientId}&user_id=eq.${userId}`);
    if (!rows[0]) throw new HttpError('Ingredient not found.', 404);
    return ok(res, ingredientToApi(rows[0]));
  }

  if (method === 'DELETE') {
    const rows = await dbSelect('ingredients', `select=*&id=eq.${ingredientId}&user_id=eq.${userId}&limit=1`);
    const row = rows[0];
    if (!row) throw new HttpError('Ingredient not found.', 404);
    const removed = await dbInsert('ingredient_removal_history', {
      user_id: userId,
      original_ingredient_id: ingredientId,
      name: row.name,
      category: row.category,
      qty: row.qty,
      note: row.note || '',
      storage_type: row.storage_type || 'fridge',
      days_left: effectiveDaysLeft(row),
      total_days: row.total_days || 0,
      removed_reason: ['eaten', 'wasted', 'expired'].includes(body?.reason) ? body.reason : 'wasted',
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180).toISOString(),
    });
    await dbDelete('ingredients', `id=eq.${ingredientId}&user_id=eq.${userId}`);
    return ok(res, { deleted: true, removed: removedIngredientToApi(removed[0]) });
  }

  throw new HttpError('Route not found.', 404);
}

function ingredientFromApi(userId: number, body: any, includeUser = true) {
  const name = String(body?.name || '').trim();
  if (!name) throw new HttpError('Ingredient name is required.', 400);
  return {
    ...(includeUser ? { user_id: userId } : {}),
    name,
    category: String(body?.category || 'other'),
    qty: String(body?.qty || '').trim(),
    note: String(body?.note || '').trim().slice(0, 500),
    storage_type: ['fridge', 'freezer', 'pantry'].includes(body?.storageType) ? body.storageType : 'fridge',
    days_left: toInt(body?.daysLeft, 'daysLeft'),
    total_days: toInt(body?.totalDays, 'totalDays'),
    ...(includeUser ? {} : { created_at: new Date().toISOString() }),
  };
}

function ingredientToApi(row: DbRow) {
  return {
    id: String(row.id),
    name: row.name,
    category: row.category,
    qty: row.qty,
    note: row.note || '',
    storageType: row.storage_type || 'fridge',
    daysLeft: effectiveDaysLeft(row),
    totalDays: row.total_days || 0,
  };
}

function removedIngredientToApi(row: DbRow) {
  return {
    id: String(row.id),
    item: {
      id: String(row.original_ingredient_id),
      name: row.name,
      category: row.category,
      qty: row.qty,
      note: row.note || '',
      storageType: row.storage_type || 'fridge',
      daysLeft: row.days_left || 0,
      totalDays: row.total_days || 0,
    },
    reason: row.removed_reason || 'wasted',
    removedAt: new Date(row.removed_at || Date.now()).getTime(),
    expiresAt: row.expires_at || null,
  };
}

async function shoppingRouter(res: ApiResponse, method: string, segments: string[], userId: number, body: any) {
  if (segments[0] === 'restock') {
    if (method === 'DELETE' && segments[1]) {
      await dbDelete('shopping_items', `user_id=eq.${userId}&source=eq.restock&linked_ingredient_id=eq.${Number(segments[1])}`);
      return ok(res, { deleted: true });
    }
    if (method === 'DELETE') {
      const deleted = await dbDelete('shopping_items', `user_id=eq.${userId}&source=eq.restock`);
      return ok(res, { deleted: deleted.length });
    }
  }

  if (method === 'GET' && segments.length === 0) {
    const rows = await dbSelect('shopping_items', `select=*&user_id=eq.${userId}&order=created_at.desc`);
    return ok(res, rows.map(shoppingToApi));
  }
  if (method === 'POST' && segments.length === 0) {
    const inserted = await dbInsert('shopping_items', shoppingFromApi(userId, body));
    return ok(res, shoppingToApi(inserted[0]), 201);
  }

  const itemId = Number(segments[0]);
  if (!itemId) throw new HttpError('Shopping item not found.', 404);
  if (method === 'PUT') {
    const rows = await dbUpdate('shopping_items', { qty: Math.max(1, toInt(body?.qty, 'qty')) }, `id=eq.${itemId}&user_id=eq.${userId}`);
    if (!rows[0]) throw new HttpError('Shopping item not found.', 404);
    return ok(res, shoppingToApi(rows[0]));
  }
  if (method === 'DELETE') {
    await dbDelete('shopping_items', `id=eq.${itemId}&user_id=eq.${userId}`);
    return ok(res, { deleted: true });
  }
  throw new HttpError('Route not found.', 404);
}

function shoppingFromApi(userId: number, body: any) {
  const name = String(body?.name || '').trim();
  if (!name) throw new HttpError('Shopping item name is required.', 400);
  return {
    user_id: userId,
    name,
    category: String(body?.category || '').slice(0, 20),
    qty: Math.max(1, toInt(body?.qty ?? 1, 'qty')),
    unit: String(body?.unit || 'pcs').slice(0, 20),
    price_px: Math.max(0, toInt(body?.pricePX ?? 0, 'pricePX')),
    price_carrefour: Math.max(0, toInt(body?.priceCarrefour ?? 0, 'priceCarrefour')),
    price_amart: Math.max(0, toInt(body?.priceAMart ?? 0, 'priceAMart')),
    source: ['manual', 'restock', 'seed'].includes(body?.source) ? body.source : 'manual',
    linked_ingredient_id: body?.linkedIngredientId ? Number(body.linkedIngredientId) : null,
  };
}

function shoppingToApi(row: DbRow) {
  return {
    id: String(row.id),
    name: row.name,
    category: row.category || '',
    qty: row.qty || 1,
    unit: row.unit || 'pcs',
    pricePX: row.price_px || 0,
    priceCarrefour: row.price_carrefour || 0,
    priceAMart: row.price_amart || 0,
    source: row.source || 'manual',
    linkedIngredientId: row.linked_ingredient_id ? String(row.linked_ingredient_id) : null,
  };
}

async function notificationsRouter(res: ApiResponse, method: string, segments: string[], userId: number) {
  if (method === 'GET' && segments.length === 0) {
    const rows = await dbSelect('notifications', `select=*&user_id=eq.${userId}&order=created_at.desc`);
    return ok(res, rows.map(notificationToApi));
  }
  if (method === 'POST' && segments[0] === 'sync-expiry') {
    return ok(res, await syncExpiryNotifications(userId));
  }
  if (method === 'PUT' && segments[1] === 'read') {
    const rows = await dbUpdate('notifications', { is_read: true }, `id=eq.${Number(segments[0])}&user_id=eq.${userId}`);
    if (!rows[0]) throw new HttpError('Notification not found.', 404);
    return ok(res, notificationToApi(rows[0]));
  }
  throw new HttpError('Route not found.', 404);
}

function notificationToApi(row: DbRow) {
  return {
    id: String(row.id),
    type: row.type,
    ingredientId: row.ingredient_id ? String(row.ingredient_id) : null,
    title: row.title,
    body: row.body || '',
    isRead: Boolean(row.is_read),
    createdAt: row.created_at || '',
  };
}

async function syncExpiryNotifications(userId: number, options: { admin?: boolean } = {}) {
  const select = options.admin ? syncAdminDbSelect : dbSelect;
  const settings = await getExpirySettingsForSync(userId, Boolean(options.admin));
  const schedule = expiryScheduleStatus(settings.expiryPushTime);
  if (!schedule.isDue) {
    return {
      created: 0,
      skipped: true,
      reason: 'not_due',
      nextRunTime: settings.expiryPushTime || '09:00',
      notifications: [],
    };
  }
  const reminderDays = Math.max(0, Math.trunc(Number(settings.expiryReminderDays ?? 3)));
  const ingredients = await select('ingredients', `select=*&user_id=eq.${userId}`);
  const candidates = ingredients
    .map((row: DbRow) => ({ row, daysLeft: effectiveDaysLeft(row) }))
    .filter(item => Number.isFinite(item.daysLeft) && item.daysLeft <= reminderDays);

  if (candidates.length === 0) {
    return { created: 0, notifications: [] };
  }

  const { start, end, date } = taipeiTodayUtcRange();
  const existing = await select(
    'notifications',
    `select=ingredient_id&type=eq.expiry&user_id=eq.${userId}&created_at=gte.${enc(start)}&created_at=lt.${enc(end)}`
  );
  const alreadyNotified = new Set(existing.map((row: DbRow) => String(row.ingredient_id || '')));

  const rowsToInsert = candidates
    .filter(item => !alreadyNotified.has(String(item.row.id)))
    .map(item => expiryNotificationFromIngredient(userId, item.row, item.daysLeft, date));

  if (rowsToInsert.length === 0) {
    return { created: 0, notifications: [] };
  }

  const inserted = await insertExpiryNotifications(rowsToInsert, Boolean(options.admin));
  return {
    created: inserted.length,
    notifications: inserted.map(notificationToApi),
  };
}

async function getExpirySettingsForSync(userId: number, useAdmin: boolean) {
  const upsert = useAdmin ? syncAdminDbUpsert : dbUpsert;
  const select = useAdmin ? syncAdminDbSelect : dbSelect;
  await upsert('user_settings', { user_id: userId }, 'user_id');
  const rows = await select('user_settings', `select=expiry_reminder_days,expiry_push_time&user_id=eq.${userId}&limit=1`);
  const row = rows[0] || {};
  return {
    expiryReminderDays: row.expiry_reminder_days ?? 3,
    expiryPushTime: row.expiry_push_time || '09:00',
  };
}

async function syncAllExpiryNotifications() {
  const users = await syncAdminDbSelect('users', 'select=id');
  let created = 0;
  const notifications: ReturnType<typeof notificationToApi>[] = [];
  const failures: { userId: number; error: string }[] = [];

  for (const user of users) {
    const userId = Number(user.id);
    if (!Number.isFinite(userId)) continue;
    try {
      const result = await syncExpiryNotifications(userId, { admin: true });
      created += result.created;
      notifications.push(...result.notifications);
    } catch (error) {
      failures.push({
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    created,
    users: users.length,
    failures,
    notifications,
  };
}

function ensureCronRequest(req: ApiRequest) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return;
  const header = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization || '';
  const querySecret = typeof req.query?.cron_secret === 'string' ? req.query.cron_secret : '';
  if (header !== `Bearer ${secret}` && querySecret !== secret) {
    throw new HttpError('Unauthorized cron request.', 401);
  }
}

async function insertExpiryNotifications(rows: DbRow[], useAdmin = false) {
  const insert = useAdmin ? syncAdminDbInsert : dbInsert;
  try {
    return await insert('notifications', rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!/notification_date|schema cache/i.test(message)) throw error;
    const fallbackRows = rows.map(({ notification_date, ...row }) => row);
    return insert('notifications', fallbackRows);
  }
}

function expiryNotificationFromIngredient(userId: number, row: DbRow, daysLeft: number, notificationDate: string) {
  const name = String(row.name || '食材');
  const absDays = Math.abs(daysLeft);

  if (daysLeft < 0) {
    return {
      user_id: userId,
      type: 'expiry',
      ingredient_id: row.id,
      notification_date: notificationDate,
      title: `${name} 已過期`,
      body: `已經超過建議保存天數 ${absDays} 天，請確認是否還能食用。`,
    };
  }

  if (daysLeft === 0) {
    return {
      user_id: userId,
      type: 'expiry',
      ingredient_id: row.id,
      notification_date: notificationDate,
      title: `${name} 今天到期`,
      body: '今天是建議保存期限最後一天，建議優先使用。',
    };
  }

  if (daysLeft === 1) {
    return {
      user_id: userId,
      type: 'expiry',
      ingredient_id: row.id,
      notification_date: notificationDate,
      title: `${name} 明天到期`,
      body: '剩下 1 天保存時間，建議安排到下一餐使用。',
    };
  }

  return {
    user_id: userId,
    type: 'expiry',
    ingredient_id: row.id,
    notification_date: notificationDate,
    title: `${name} 即將到期`,
    body: `剩下 ${daysLeft} 天保存時間，建議儘快使用。`,
  };
}

function legacyExpiryNotificationFromIngredient(userId: number, row: DbRow, daysLeft: number) {
  const name = String(row.name || '食材');
  const absDays = Math.abs(daysLeft);

  if (daysLeft < 0) {
    return {
      user_id: userId,
      type: 'expiry',
      ingredient_id: row.id,
      title: `${name} 已過期`,
      body: `已超過建議保存期限 ${absDays} 天，請確認是否已吃完或需要丟棄。`,
    };
  }

  if (daysLeft === 0) {
    return {
      user_id: userId,
      type: 'expiry',
      ingredient_id: row.id,
      title: `${name} 今天到期`,
      body: '今天是建議保存期限最後一天，建議優先使用。',
    };
  }

  if (daysLeft === 1) {
    return {
      user_id: userId,
      type: 'expiry',
      ingredient_id: row.id,
      title: `${name} 明天到期`,
      body: '剩約 1 天到期，建議排進今天或明天的餐點。',
    };
  }

  return {
    user_id: userId,
    type: 'expiry',
    ingredient_id: row.id,
    title: `${name} 即將到期`,
    body: `剩約 ${daysLeft} 天到期，建議優先使用。`,
  };
}

function taipeiTodayUtcRange() {
  const now = new Date();
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const start = Date.UTC(taipei.getUTCFullYear(), taipei.getUTCMonth(), taipei.getUTCDate()) - 8 * 60 * 60 * 1000;
  const date = [
    taipei.getUTCFullYear(),
    String(taipei.getUTCMonth() + 1).padStart(2, '0'),
    String(taipei.getUTCDate()).padStart(2, '0'),
  ].join('-');
  return {
    start: new Date(start).toISOString(),
    end: new Date(start + 24 * 60 * 60 * 1000).toISOString(),
    date,
  };
}

function expiryScheduleStatus(expiryPushTime: unknown) {
  const scheduledMinutes = parseTimeToMinutes(expiryPushTime, 9 * 60);
  const now = new Date();
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const currentMinutes = taipei.getUTCHours() * 60 + taipei.getUTCMinutes();
  return {
    isDue: currentMinutes >= scheduledMinutes,
    currentMinutes,
    scheduledMinutes,
  };
}

function parseTimeToMinutes(value: unknown, fallback: number) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return fallback;
  }
  return hours * 60 + minutes;
}

async function stateRouter(res: ApiResponse, method: string, segments: string[], userId: number, body: any) {
  if (segments[0] === 'batch' && method === 'POST') {
    const keys = Array.isArray(body?.keys) ? body.keys.map(String) : [];
    if (keys.length === 0) return ok(res, {});
    const filter = keys.map((key: string) => `"${key.replaceAll('"', '\\"')}"`).join(',');
    const rows = await dbSelect('user_state_entries', `select=state_key,value_json&user_id=eq.${userId}&state_key=in.(${encRaw(filter)})`);
    const result: DbRow = {};
    for (const row of rows) result[row.state_key] = parseJson(row.value_json, null);
    return ok(res, result);
  }

  const key = decodeURIComponent(segments.join('/'));
  if (!key) throw new HttpError('State key is required.', 400);

  if (method === 'GET') {
    const rows = await dbSelect('user_state_entries', `select=value_json&user_id=eq.${userId}&state_key=eq.${enc(key)}&limit=1`);
    return ok(res, { key, value: rows[0] ? parseJson(rows[0].value_json, null) : null });
  }
  if (method === 'PUT') {
    await dbUpsert('user_state_entries', {
      user_id: userId,
      state_key: key,
      value_json: JSON.stringify(body?.value ?? null),
    }, 'user_id,state_key');
    return ok(res, { key, value: body?.value ?? null });
  }
  if (method === 'DELETE') {
    const deleted = await dbDelete('user_state_entries', `user_id=eq.${userId}&state_key=eq.${enc(key)}`);
    return ok(res, { deleted: deleted.length > 0 });
  }
  throw new HttpError('Route not found.', 404);
}

async function recipesRouter(res: ApiResponse, method: string, segments: string[], userId: number, body: any) {
  if (method === 'GET' && segments.length === 0) {
    const rows = await dbSelect('recipes', `select=*&or=(is_public.eq.true,author_id.eq.${userId})&order=created_at.desc`);
    const recipes = await Promise.all(rows.map((row) => recipeToApi(row, userId)));
    return ok(res, recipes);
  }
  if (method === 'POST' && segments.length === 0) {
    const inserted = await dbInsert('recipes', recipeFromApi(userId, body));
    await replaceRecipeChildren(Number(inserted[0].id), body);
    return ok(res, await recipeToApi(inserted[0], userId), 201);
  }

  if (segments[0] === 'generate') {
    throw new HttpError('AI recipe generation is not implemented on Vercel yet.', 501);
  }

  const recipeId = Number(segments[0]);
  if (!recipeId) throw new HttpError('Recipe not found.', 404);

  if (method === 'PUT') {
    const rows = await dbUpdate('recipes', recipeFromApi(userId, body, false), `id=eq.${recipeId}&author_id=eq.${userId}`);
    if (!rows[0]) throw new HttpError('Recipe not found.', 404);
    await replaceRecipeChildren(recipeId, body);
    return ok(res, await recipeToApi(rows[0], userId));
  }
  if (method === 'DELETE') {
    await dbDelete('recipes', `id=eq.${recipeId}&author_id=eq.${userId}`);
    return ok(res, { deleted: true });
  }
  if (method === 'POST' && segments[1] === 'like') {
    return ok(res, await toggleRecipeJoin('recipe_likes', userId, recipeId));
  }
  if (method === 'POST' && segments[1] === 'save') {
    return ok(res, await toggleRecipeJoin('recipe_saves', userId, recipeId));
  }
  throw new HttpError('Route not found.', 404);
}

function recipeFromApi(userId: number, body: any, includeAuthor = true) {
  const name = String(body?.name || '').trim();
  if (!name) throw new HttpError('Recipe name is required.', 400);
  return {
    ...(includeAuthor ? { author_id: userId } : {}),
    name: name.slice(0, 100),
    description: String(body?.description || '').trim(),
    full_content: String(body?.fullContent || '').trim(),
    image_url: String(body?.image || body?.imageUrl || '').trim(),
    prep_time: Math.max(0, toInt(body?.prepTime ?? 0, 'prepTime')),
    rating: 5,
    origin: body?.origin === 'ai' ? 'ai' : 'manual',
    is_public: Boolean(body?.isPublic),
    tags: JSON.stringify(Array.isArray(body?.tags) ? body.tags : []),
  };
}

async function recipeToApi(row: DbRow, userId: number) {
  const [authorRows, ingredientRows, stepRows, likeRows, saveRows] = await Promise.all([
    dbSelect('users', `select=id,username,chef_name&id=eq.${Number(row.author_id)}&limit=1`),
    dbSelect('recipe_ingredients', `select=name&recipe_id=eq.${Number(row.id)}&order=ord.asc`),
    dbSelect('recipe_steps', `select=content&recipe_id=eq.${Number(row.id)}&order=step_no.asc`),
    dbSelect('recipe_likes', `select=user_id&recipe_id=eq.${Number(row.id)}`),
    dbSelect('recipe_saves', `select=user_id&recipe_id=eq.${Number(row.id)}&user_id=eq.${userId}&limit=1`),
  ]);
  const author = authorRows[0] || {};
  const chefName = author.chef_name || author.username || 'Chef';
  return {
    id: String(row.id),
    name: row.name,
    description: row.description || '',
    fullContent: row.full_content || '',
    image: row.image_url || '',
    prepTime: row.prep_time || 0,
    tags: parseJsonArray(row.tags),
    author: {
      id: String(row.author_id),
      name: chefName,
      avatar: String(chefName).slice(0, 1).toUpperCase(),
      verified: true,
      recipeCount: 0,
    },
    rating: Number(row.rating || 0),
    createdAt: String(row.created_at || '').slice(0, 10),
    ingredients: ingredientRows.map((item) => item.name),
    steps: stepRows.map((item) => item.content),
    owner: Number(row.author_id) === userId ? 'me' : 'community',
    isPublic: Boolean(row.is_public),
    origin: row.origin || 'manual',
    likes: likeRows.length,
    liked: likeRows.some((item) => Number(item.user_id) === userId),
    saved: saveRows.length > 0,
  };
}

async function replaceRecipeChildren(recipeId: number, body: any) {
  await Promise.all([
    dbDelete('recipe_ingredients', `recipe_id=eq.${recipeId}`),
    dbDelete('recipe_steps', `recipe_id=eq.${recipeId}`),
  ]);
  const ingredients = Array.isArray(body?.ingredients) ? body.ingredients.map(String).filter(Boolean) : [];
  const steps = Array.isArray(body?.steps) ? body.steps.map(String).filter(Boolean) : [];
  if (ingredients.length) {
    await dbInsert('recipe_ingredients', ingredients.map((name: string, index: number) => ({ recipe_id: recipeId, ord: index + 1, name })));
  }
  if (steps.length) {
    await dbInsert('recipe_steps', steps.map((content: string, index: number) => ({ recipe_id: recipeId, step_no: index + 1, content })));
  }
}

async function toggleRecipeJoin(table: string, userId: number, recipeId: number) {
  const rows = await dbSelect(table, `select=user_id&user_id=eq.${userId}&recipe_id=eq.${recipeId}&limit=1`);
  if (rows[0]) {
    await dbDelete(table, `user_id=eq.${userId}&recipe_id=eq.${recipeId}`);
  } else {
    await dbInsert(table, { user_id: userId, recipe_id: recipeId });
  }
  const [likes, liked, saved] = await Promise.all([
    dbSelect('recipe_likes', `select=user_id&recipe_id=eq.${recipeId}`),
    dbSelect('recipe_likes', `select=user_id&user_id=eq.${userId}&recipe_id=eq.${recipeId}&limit=1`),
    dbSelect('recipe_saves', `select=user_id&user_id=eq.${userId}&recipe_id=eq.${recipeId}&limit=1`),
  ]);
  return { likes: likes.length, liked: liked.length > 0, saved: saved.length > 0 };
}

async function followsRouter(res: ApiResponse, method: string, segments: string[], userId: number, body: any) {
  if (method === 'GET') {
    const rows = await dbSelect('follows', `select=followed_id&follower_id=eq.${userId}`);
    return ok(res, rows.map((row) => String(row.followed_id)));
  }
  if (method === 'POST') {
    const followedId = Number(body?.followedId);
    if (!followedId || followedId === userId) throw new HttpError('Invalid followed user.', 400);
    await dbUpsert('follows', { follower_id: userId, followed_id: followedId }, 'follower_id,followed_id');
    const rows = await dbSelect('follows', `select=followed_id&follower_id=eq.${userId}`);
    return ok(res, rows.map((row) => String(row.followed_id)));
  }
  if (method === 'DELETE' && segments[0]) {
    await dbDelete('follows', `follower_id=eq.${userId}&followed_id=eq.${Number(segments[0])}`);
    const rows = await dbSelect('follows', `select=followed_id&follower_id=eq.${userId}`);
    return ok(res, rows.map((row) => String(row.followed_id)));
  }
  throw new HttpError('Route not found.', 404);
}

type SupabaseProfile = {
  id: number;
  authUserId: string;
  email: string;
  accessToken: string;
};

type GeminiRecipe = {
  mealType: string;
  title: string;
  description: string;
  fridgeIngredients: string[];
  suggestedIngredients: string[];
  sourceItem: string;
  sourceCategory: string;
  sourceDaysLeft: number;
  steps: string[];
  prepTime: number;
  calories: number;
  cookingMethod?: string | null;
};

type PriceCandidate = {
  channel: 'px' | 'carrefour' | 'amart';
  item_name: string;
  norm_name: string;
  price: number;
  unit?: string | null;
  source_url?: string | null;
  raw_price?: string | null;
  code?: string | number | null;
};

async function requireSupabaseProfile(req: ApiRequest): Promise<SupabaseProfile> {
  const header = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new HttpError('Please log in first.', 401);

  const url = getRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const anonKey = getRequiredEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });
  const authUser = await response.json().catch(() => null);
  if (!response.ok || !authUser?.id) throw new HttpError('Please log in again.', 401);

  const email = String(authUser.email || authUser.user_metadata?.email || '').trim().toLowerCase();
  const existing = await userDbSelect(token, 'users', `select=id,username,auth_user_id&auth_user_id=eq.${enc(String(authUser.id))}&limit=1`);
  let profile = existing[0];
  if (!profile) {
    const inserted = await userDbInsert(token, 'users', {
      auth_user_id: String(authUser.id),
      username: email || `user-${String(authUser.id).slice(0, 8)}`,
      chef_name: String(authUser.user_metadata?.chef_name || email.split('@')[0] || 'Chef').slice(0, 50),
      chef_rank: 'Chef',
      password_hash: 'managed-by-supabase-auth',
    });
    profile = inserted[0];
    await ensureSettingsAsUser(token, Number(profile.id));
  }
  return { id: Number(profile.id), authUserId: String(authUser.id), email, accessToken: token };
}

async function scanIngredients(res: ApiResponse, body: any) {
  const { base64, mimeType } = parseImagePayload(body);
  const prompt = [
    '你是智慧冰箱 App 的食材影像辨識助理。',
    '請辨識圖片中看得見的食材、包裝食品、飲料或可食用物品。',
    '只回傳 JSON，不要使用 Markdown，不要加入說明文字。',
    '最多回傳 25 項。忽略盤子、餐具、手、桌面與背景物品。',
    '所有給使用者看的文字都必須使用台灣常用繁體中文。',
    'name 必須是繁體中文食材名稱；如果圖片文字是英文、簡體中文或其他語言，請翻譯成台灣常用繁體中文，例如 Whole Milk 要回「全脂牛奶」。',
    'qty 必須使用台灣常用繁體中文份量，例如「1 瓶」、「6 顆」、「半盒」、「1 包」。不要估計克數、毫升或公升。',
    'storageType must be one of: fridge, freezer, pantry.',
    'category must be one of: grains, vegetables, protein, dairy, fruits, fats, other.',
    '如果照片或包裝上看不出保存期限，或無法合理判斷剩餘天數，daysLeft 必須回傳 null，不要猜測。',
    '如果是蔬菜或水果但沒有清楚日期，也請回傳 null，系統會依據生鮮蔬果建議儲運溫度參考資料補入可儲天數。',
    'JSON 欄位名稱必須維持英文，欄位值中的 name 和 qty 必須是繁體中文。',
    'JSON format: {"items":[{"name":"雞蛋","category":"protein","qty":"6 顆","storageType":"fridge","daysLeft":14}]}',
  ].join('\n');
  const result = await geminiJson(prompt, {
    imageBase64: base64,
    imageMimeType: mimeType,
    temperature: 0.1,
  });
  const rawItems = Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [];
  const items = rawItems
    .filter((item: any) => item && typeof item === 'object')
    .map((item: any) => {
      const category = normalizeFoodCategory(item.category);
      const storageType = normalizeStorageType(item.storageType);
      return {
        name: normalizeScanFoodName(item.name),
        category,
        qty: safeQty(item.qty),
        storageType,
        daysLeft: safeDaysLeft(item.daysLeft, storageType, category) ?? referenceDaysLeft(String(item.name || ''), category, storageType),
      };
    })
    .filter((item: any) => item.name)
    .slice(0, 25);
  if (items.length === 0) throw new HttpError('AI did not detect any ingredients. Please try another photo.', 422);
  return ok(res, { items });
}

async function generateRecipes(res: ApiResponse, profile: SupabaseProfile, body: any) {
  const rows = await userDbSelect(profile.accessToken, 'ingredients', `select=*&user_id=eq.${profile.id}&order=days_left.asc`);
  const requestedNames = Array.isArray(body?.specifiedIngredients)
    ? new Set(body.specifiedIngredients.map((value: unknown) => String(value).trim()).filter(Boolean))
    : null;
  const ingredients = requestedNames?.size
    ? rows.filter((row) => requestedNames.has(String(row.name)))
    : rows;
  if (ingredients.length === 0) throw new HttpError('Please add ingredients before generating AI recipes.', 400);

  const prompt = buildRecipePrompt({
    ingredients,
    excludeAllergens: Array.isArray(body?.excludeAllergens) ? body.excludeAllergens.map(String) : [],
    excludeDiseases: Array.isArray(body?.excludeDiseases) ? body.excludeDiseases : [],
    avoidCookingStyles: Array.isArray(body?.avoidCookingStyles) ? body.avoidCookingStyles.map(String) : [],
    regenerate: body?.regenerate || null,
  });
  const raw = await geminiJson(prompt, { temperature: body?.regenerate ? 0.75 : 0.55 });
  const rawRecipes = Array.isArray(raw) ? raw : Array.isArray(raw?.recipes) ? raw.recipes : raw ? [raw] : [];
  const recipes = rawRecipes.map(validateGeminiRecipe).filter(Boolean);
  if (recipes.length === 0) throw new HttpError('Gemini did not return usable recipes. Please try again.', 502);
  return ok(res, { recipes: recipes.slice(0, body?.regenerate ? 1 : 3) });
}

async function generatePlannerImage(res: ApiResponse, body: any) {
  const title = String(body?.title || '').trim().slice(0, 100);
  const description = String(body?.description || '').trim().slice(0, 500);
  if (!title) throw new HttpError('Recipe title is required.', 400);
  const prompt = [
    'Generate a bright, realistic food photo for a smart fridge recipe card.',
    `Dish title: ${title}`,
    description ? `Dish description: ${description}` : '',
    'Style: clean Taiwanese home cooking, natural light, appetizing plating, no text, no logos, no people.',
  ].filter(Boolean).join('\n');
  const imageData = await geminiImage(prompt);
  return ok(res, { imageData });
}

async function pricesRouter(req: ApiRequest, res: ApiResponse, segments: string[], method: string, body?: any) {
  // Scheduled crawl endpoint. Vercel Cron triggers this via GET (see vercel.json).
  // Protected by CRON_SECRET; writes with service_role so RLS/anon limits don't block inserts.
  if (segments[0] === 'sync' && method === 'GET') {
    ensureCronRequest(req);
    return ok(res, await syncPriceWatchlist());
  }

  if (segments[0] === 'normalize' && method === 'GET') {
    const query = getUrl(req).searchParams;
    return ok(res, analyzePriceName(query.get('name') || '', query.get('selectedName') || undefined));
  }

  if (segments[0] === 'crawl' && method === 'POST') {
    const keyword = cleanText(body?.keyword || '?謜?');
    const channel = normalizeChannel(body?.channel || 'px');
    const items = await scrapePriceCandidates(channel, keyword, String(body?.selectedName || ''), toPositiveInt(body?.maxPages, 2));
    const inserted = await insertPriceCandidates(items);
    return ok(res, {
      channel,
      keyword,
      maxPages: toPositiveInt(body?.maxPages, 2),
      fetched: items.length,
      inserted,
      items: items.map(priceCandidateToApi),
    });
  }

  if (segments[1] === 'candidates' && method === 'GET') {
    const channel = normalizeChannel(segments[0]);
    const query = getUrl(req).searchParams;
    const name = cleanText(query.get('name') || '');
    const selectedName = cleanText(query.get('selectedName') || '');
    if (!name) throw new HttpError('name is required.', 400);

    const profile = analyzePriceName(name, selectedName);
    const scraped = await scrapePriceCandidates(
      channel,
      profile.searchName || name,
      selectedName,
      toPositiveInt(query.get('maxPages'), 2),
    );
    const candidateLimit = channel === 'px' ? 160 : 60;
    const candidates = scraped
      .map((item) => ({ ...item, crawled_at: new Date().toISOString() }))
      .map(priceCandidateToApi)
      .slice(0, candidateLimit);
    const selected = pickSelectedPrice(candidates, selectedName);
    const cheapest = candidates.length ? [...candidates].sort((a, b) => a.price - b.price)[0] : null;

    return ok(res, {
      channel,
      query: name,
      ...profile,
      selectedName: selectedName || null,
      selected,
      cheapest,
      price: selected?.price ?? cheapest?.price ?? null,
      priceDisplay: selected || cheapest ? `$${selected?.price ?? cheapest?.price}` : '無',
      candidates,
      fromCache: false,
      refreshed: true,
      inserted: 0,
      cacheDays: 7,
    });
  }

  if (segments.length > 0) throw new HttpError('Price route not found.', 404);

  const query = getUrl(req).searchParams;
  const filters: string[] = ['select=*', 'order=crawled_at.desc', `limit=${Number(query.get('limit') || 50)}`];
  if (query.get('channel')) filters.push(`channel=eq.${enc(String(query.get('channel')))}`);
  if (query.get('name')) {
    const name = enc(`*${String(query.get('name')).replaceAll(',', ' ')}*`);
    filters.push(`or=(item_name.ilike.${name},norm_name.ilike.${name})`);
  }
  const rows = await dbSelect('price_records', filters.join('&'));
  return ok(res, rows.map((row) => ({
    id: String(row.id),
    channel: row.channel,
    itemName: row.item_name,
    normName: row.norm_name,
    price: row.price,
    unit: row.unit,
    sourceUrl: row.source_url,
    crawledAt: row.crawled_at,
  })));
}

async function geminiJson(
  prompt: string,
  options: { imageBase64?: string; imageMimeType?: string; temperature?: number } = {},
) {
  try {
    const ai = new GoogleGenAI({ apiKey: getRequiredEnv('GEMINI_API_KEY') });
    const parts: any[] = [{ text: prompt }];
    if (options.imageBase64 && options.imageMimeType) {
      parts.push({ inlineData: { data: options.imageBase64, mimeType: options.imageMimeType } });
    }
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: parts,
      config: {
        responseMimeType: 'application/json',
        temperature: options.temperature ?? 0.4,
      },
    } as any);
    return parseJsonFromText(response.text || '');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw normalizeGeminiError(error);
  }
}

async function geminiImage(prompt: string) {
  try {
    const ai = new GoogleGenAI({ apiKey: getRequiredEnv('GEMINI_API_KEY') });
    const imageModel = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
    const response = await ai.models.generateContent({
      model: imageModel,
      contents: prompt,
      config: { responseModalities: ['TEXT', 'IMAGE'] },
    } as any);
    const part = response.candidates?.[0]?.content?.parts?.find((item: any) => item.inlineData?.data);
    const data = part?.inlineData?.data;
    const mimeType = part?.inlineData?.mimeType || 'image/png';
    if (!data) throw new HttpError('Gemini did not return an image.', 502);
    return `data:${mimeType};base64,${data}`;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw normalizeGeminiError(error);
  }
}

function normalizeGeminiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/API key|UNAUTHENTICATED|ACCOUNT_STATE_INVALID|service account/i.test(message)) {
    return new HttpError('Gemini API key is invalid or inactive. Please update GEMINI_API_KEY in Vercel.', 502);
  }
  return new HttpError('Gemini service is temporarily unavailable. Please try again later.', 502);
}

function parseJsonFromText(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const startArray = trimmed.indexOf('[');
    const startObject = trimmed.indexOf('{');
    const start = startArray === -1 ? startObject : startObject === -1 ? startArray : Math.min(startArray, startObject);
    const end = Math.max(trimmed.lastIndexOf(']'), trimmed.lastIndexOf('}'));
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new HttpError('Gemini response was not valid JSON.', 502);
  }
}

function parseImagePayload(body: any) {
  const raw = String(body?.imageData || body?.imageBase64 || '').trim();
  if (!raw) throw new HttpError('Image is required.', 400);
  const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = String(body?.mimeType || dataUrlMatch?.[1] || 'image/jpeg');
  if (!mimeType.startsWith('image/')) throw new HttpError('Only image uploads are supported.', 400);
  const base64 = (dataUrlMatch?.[2] || raw).replace(/\s/g, '');
  if (base64.length > 8_000_000) throw new HttpError('Uploaded image is too large.', 413);
  return { base64, mimeType };
}

function buildRecipePrompt(input: {
  ingredients: DbRow[];
  excludeAllergens: string[];
  excludeDiseases: any[];
  avoidCookingStyles: string[];
  regenerate?: any;
}) {
  const ingredientLines = input.ingredients.map((item) => (
    `- ${item.name}; category=${item.category || 'other'}; qty=${item.qty || ''}; storage=${item.storage_type || 'fridge'}; daysLeft=${effectiveDaysLeft(item)}`
  )).join('\n');
  const dietLines = [
    input.excludeAllergens.length ? `Avoid allergens: ${input.excludeAllergens.join(', ')}` : '',
    input.excludeDiseases.length
      ? `Health restrictions: ${input.excludeDiseases.map((item) => `${item.label || ''}${item.note ? ` (${item.note})` : ''}`).join(', ')}`
      : '',
    input.avoidCookingStyles.length ? `Avoid repeating these cooking styles or dishes: ${input.avoidCookingStyles.join(', ')}` : '',
  ].filter(Boolean).join('\n');
  const regenerate = input.regenerate
    ? `Generate exactly 1 replacement recipe for slot index ${Number(input.regenerate.slotIndex || 0)}.`
    : 'Generate exactly 3 recipes: breakfast, lunch, and dinner.';

  return [
    'You are the AI meal planner for Smart Fridge.',
    'Use the user fridge ingredients first, especially items with fewer daysLeft.',
    'All user-facing text values must be written in Traditional Chinese used in Taiwan.',
    'Recipe title, description, cookingMethod, ingredient names, suggestedIngredients, and steps must be Traditional Chinese.',
    'Keep JSON field names in English exactly as requested.',
    regenerate,
    'Return JSON only. Do not use Markdown.',
    'Each recipe must be practical for home cooking in Taiwan.',
    'Do not invent impossible ingredients. suggestedIngredients should be optional grocery items.',
    dietLines,
    'Available ingredients:',
    ingredientLines,
    'Required JSON format:',
    `[
  {
    "mealType": "breakfast|lunch|dinner",
    "title": "繁體中文料理名稱",
    "description": "繁體中文簡短描述",
    "cookingMethod": "繁體中文烹調方式",
    "fridgeIngredients": ["使用到的冰箱食材，繁體中文"],
    "suggestedIngredients": ["可選購補充食材，繁體中文"],
    "sourceItem": "主要冰箱食材，繁體中文",
    "sourceCategory": "vegetables|protein|dairy|fruits|grains|fats|other",
    "sourceDaysLeft": 3,
    "steps": ["6 to 8 clear cooking steps"],
    "prepTime": 20,
    "calories": 450
  }
]`,
  ].filter(Boolean).join('\n\n');
}

function validateGeminiRecipe(item: any): GeminiRecipe | null {
  if (!item || typeof item !== 'object') return null;
  const title = String(item.title || '').trim();
  if (!title) return null;
  const fridgeIngredients = toStringArray(item.fridgeIngredients);
  const suggestedIngredients = toStringArray(item.suggestedIngredients);
  const sourceItem = String(item.sourceItem || fridgeIngredients[0] || '').trim();
  return {
    mealType: String(item.mealType || 'meal'),
    title: title.slice(0, 100),
    description: String(item.description || '').trim().slice(0, 300),
    cookingMethod: item.cookingMethod ? String(item.cookingMethod).trim().slice(0, 80) : null,
    fridgeIngredients,
    suggestedIngredients,
    sourceItem,
    sourceCategory: normalizeFoodCategory(item.sourceCategory),
    sourceDaysLeft: toIntOrDefault(item.sourceDaysLeft, 0),
    steps: toStringArray(item.steps).slice(0, 8),
    prepTime: toIntOrDefault(item.prepTime, 20),
    calories: toIntOrDefault(item.calories, 400),
  };
}

function normalizeFoodCategory(value: unknown) {
  const category = String(value || 'other').trim();
  return ['grains', 'vegetables', 'protein', 'dairy', 'fruits', 'fats', 'other'].includes(category) ? category : 'other';
}

function normalizeStorageType(value: unknown) {
  const storageType = String(value || 'fridge').trim();
  return ['fridge', 'freezer', 'pantry'].includes(storageType) ? storageType : 'fridge';
}

const SCAN_FOOD_NAME_TRANSLATIONS: Record<string, string> = {
  'whole milk': '全脂牛奶',
  milk: '牛奶',
  egg: '雞蛋',
  eggs: '雞蛋',
  tofu: '豆腐',
  yogurt: '優格',
  yoghurt: '優格',
  cheese: '起司',
  butter: '奶油',
  bread: '麵包',
  rice: '白飯',
  noodles: '麵條',
  chicken: '雞肉',
  pork: '豬肉',
  beef: '牛肉',
  fish: '魚',
  shrimp: '蝦',
  cabbage: '高麗菜',
  lettuce: '萵苣',
  spinach: '菠菜',
  bokchoy: '青江菜',
  'bok choy': '青江菜',
  carrot: '紅蘿蔔',
  onion: '洋蔥',
  potato: '馬鈴薯',
  tomato: '番茄',
  apple: '蘋果',
  banana: '香蕉',
  orange: '柳橙',
  kiwi: '奇異果',
  kiwifruit: '奇異果',
  grapes: '葡萄',
  grape: '葡萄',
  mango: '芒果',
  pineapple: '鳳梨',
  juice: '果汁',
  soda: '汽水',
  'sarsaparilla soda': '沙士',
  'passion fruit apple juice': '百香果蘋果汁',
};

const SCAN_UNIT_TRANSLATIONS: Array<[RegExp, string]> = [
  [/\bcartons?\b/gi, '盒'],
  [/\bbox(?:es)?\b/gi, '盒'],
  [/\bbottles?\b/gi, '瓶'],
  [/\bbags?\b/gi, '包'],
  [/\bpack(?:age)?s?\b/gi, '包'],
  [/\bcans?\b/gi, '罐'],
  [/\bjars?\b/gi, '罐'],
  [/\bcups?\b/gi, '杯'],
  [/\bpieces?\b|\bpcs?\b/gi, '個'],
  [/\bitems?\b/gi, '個'],
  [/\bbunch(?:es)?\b/gi, '把'],
  [/\bheads?\b/gi, '顆'],
  [/\bslices?\b/gi, '片'],
  [/\btrays?\b/gi, '盒'],
  [/\bdozen\b/gi, '打'],
];

function normalizeScanFoodName(value: unknown) {
  const name = cleanText(value).slice(0, 80);
  if (!name) return '';

  const key = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (SCAN_FOOD_NAME_TRANSLATIONS[key]) return SCAN_FOOD_NAME_TRANSLATIONS[key];

  if (key.includes('passion fruit') && key.includes('apple') && key.includes('juice')) return '百香果蘋果汁';
  if (key.includes('sarsaparilla') && key.includes('soda')) return '沙士';
  if (key.includes('whole milk')) return '全脂牛奶';
  if (key.includes('milk')) return '牛奶';
  if (key.includes('kiwi')) return '奇異果';

  return name;
}

function safeQty(value: unknown) {
  let qty = cleanText(value || '').slice(0, 40);
  for (const [pattern, replacement] of SCAN_UNIT_TRANSLATIONS) {
    qty = qty.replace(pattern, replacement);
  }
  qty = qty.replace(/\s+/g, ' ').trim();
  if (/^\d+(?:\.\d+)?$/.test(qty)) qty = `${qty} 份`;
  return qty || '1 份';
}

function capDaysLeft(days: number, category: string) {
  return category === 'fruits' ? Math.min(days, 14) : days;
}

function safeDaysLeft(value: unknown, storageType: string, category = 'other') {
  if (value === null || value === undefined || value === '') return null;
  const max = storageType === 'freezer' ? 180 : storageType === 'pantry' ? 365 : 30;
  const days = Number(value);
  if (!Number.isFinite(days)) return null;
  return capDaysLeft(Math.max(1, Math.min(max, Math.trunc(days))), category);
}

type ProduceShelfLife = { fridge: number; pantry: number };

// Source: docs/references/生鮮蔬果建議儲運溫度參考資料.pdf
// Uses conservative lower-bound days from the reference ranges:
// fridge ~= 5°C / optimal cold storage, pantry ~= 常溫 25°C.
const PRODUCE_SHELF_LIFE_DAYS: Record<string, ProduceShelfLife> = {
  蘿蔔: { fridge: 18, pantry: 3 },
  白蘿蔔: { fridge: 18, pantry: 3 },
  胡蘿蔔: { fridge: 70, pantry: 7 },
  紅蘿蔔: { fridge: 70, pantry: 7 },
  甘藷: { fridge: 5, pantry: 30 },
  地瓜: { fridge: 5, pantry: 30 },
  牛蒡: { fridge: 150, pantry: 9 },
  芋頭: { fridge: 20, pantry: 10 },
  芋: { fridge: 20, pantry: 10 },
  蓮藕: { fridge: 10, pantry: 5 },
  筊白筍: { fridge: 9, pantry: 1 },
  蘆筍: { fridge: 6, pantry: 1 },
  萵苣: { fridge: 10, pantry: 1 },
  生菜: { fridge: 10, pantry: 1 },
  西洋芹: { fridge: 40, pantry: 2 },
  芹菜: { fridge: 15, pantry: 1 },
  茼蒿: { fridge: 8, pantry: 1 },
  筒萵: { fridge: 8, pantry: 1 },
  莧菜: { fridge: 4, pantry: 1 },
  空心菜: { fridge: 6, pantry: 1 },
  甕菜: { fridge: 6, pantry: 1 },
  蔥: { fridge: 10, pantry: 1 },
  青蔥: { fridge: 10, pantry: 1 },
  韭菜: { fridge: 7, pantry: 1 },
  韮菜: { fridge: 7, pantry: 1 },
  韭黃: { fridge: 14, pantry: 1 },
  韮黃: { fridge: 14, pantry: 1 },
  大蒜: { fridge: 15, pantry: 1 },
  九層塔: { fridge: 1, pantry: 1 },
  香菜: { fridge: 12, pantry: 1 },
  芫荽: { fridge: 12, pantry: 1 },
  紅鳳菜: { fridge: 6, pantry: 1 },
  甘藷葉: { fridge: 4, pantry: 1 },
  地瓜葉: { fridge: 4, pantry: 1 },
  菜豆: { fridge: 8, pantry: 2 },
  四季豆: { fridge: 8, pantry: 2 },
  豇豆: { fridge: 9, pantry: 1 },
  甜椒: { fridge: 10, pantry: 2 },
  彩椒: { fridge: 10, pantry: 2 },
  青椒: { fridge: 10, pantry: 2 },
  辣椒: { fridge: 25, pantry: 8 },
  甜玉米: { fridge: 5, pantry: 1 },
  玉米: { fridge: 5, pantry: 1 },
  玉米筍: { fridge: 4, pantry: 1 },
  扁蒲: { fridge: 7, pantry: 2 },
  絲瓜: { fridge: 6, pantry: 1 },
  冬瓜: { fridge: 15, pantry: 7 },
  南瓜: { fridge: 14, pantry: 14 },
  木瓜: { fridge: 7, pantry: 3 },
  西瓜: { fridge: 14, pantry: 3 },
  香蕉: { fridge: 7, pantry: 3 },
  甜瓜: { fridge: 14, pantry: 3 },
  哈密瓜: { fridge: 14, pantry: 3 },
  番石榴: { fridge: 14, pantry: 3 },
  芭樂: { fridge: 14, pantry: 3 },
  楊桃: { fridge: 21, pantry: 3 },
  鳳梨: { fridge: 14, pantry: 3 },
  蓮霧: { fridge: 14, pantry: 2 },
  檸檬: { fridge: 30, pantry: 7 },
  棗: { fridge: 14, pantry: 3 },
  枇杷: { fridge: 21, pantry: 2 },
  番荔枝: { fridge: 21, pantry: 2 },
  釋迦: { fridge: 21, pantry: 2 },
  火龍果: { fridge: 14, pantry: 3 },
  荔枝: { fridge: 21, pantry: 2 },
  龍眼: { fridge: 14, pantry: 2 },
  芒果: { fridge: 14, pantry: 3 },
  檬果: { fridge: 14, pantry: 3 },
  酪梨: { fridge: 14, pantry: 3 },
  百香果: { fridge: 21, pantry: 3 },
  文旦: { fridge: 60, pantry: 14 },
  柳橙: { fridge: 120, pantry: 14 },
  奇異果: { fridge: 90, pantry: 7 },
  石榴: { fridge: 60, pantry: 7 },
  安石榴: { fridge: 60, pantry: 7 },
  橄欖: { fridge: 28, pantry: 7 },
  金柑: { fridge: 21, pantry: 7 },
  草莓: { fridge: 7, pantry: 1 },
  桶柑: { fridge: 30, pantry: 7 },
  海梨柑: { fridge: 60, pantry: 7 },
  番茄: { fridge: 7, pantry: 3 },
  蕃茄: { fridge: 7, pantry: 3 },
  桃: { fridge: 14, pantry: 2 },
  水蜜桃: { fridge: 14, pantry: 2 },
  李: { fridge: 21, pantry: 2 },
  梅: { fridge: 14, pantry: 2 },
  葡萄: { fridge: 49, pantry: 2 },
  梨: { fridge: 30, pantry: 7 },
  蘋果: { fridge: 30, pantry: 7 },
  油桃: { fridge: 14, pantry: 2 },
  櫻桃: { fridge: 14, pantry: 2 },
  榴槤: { fridge: 42, pantry: 3 },
  紅毛丹: { fridge: 7, pantry: 2 },
  山竹: { fridge: 14, pantry: 2 },
  萊姆: { fridge: 42, pantry: 7 },
};

function referenceDaysLeft(name: string, category: string, storageType: string) {
  if (category !== 'vegetables' && category !== 'fruits') return null;
  if (storageType === 'freezer') return null;

  const normalizedName = cleanText(name);
  if (!normalizedName) return null;

  const storageKey: keyof ProduceShelfLife = storageType === 'pantry' ? 'pantry' : 'fridge';
  const matches = Object.entries(PRODUCE_SHELF_LIFE_DAYS)
    .filter(([keyword]) => normalizedName.includes(keyword))
    .map(([, life]) => life[storageKey]);

  return matches.length ? capDaysLeft(Math.min(...matches), category) : null;
}

function toStringArray(value: unknown) {
  return (Array.isArray(value) ? value : []).map((item) => String(item).trim()).filter(Boolean);
}

function toIntOrDefault(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function normalizeChannel(value: unknown): 'px' | 'carrefour' | 'amart' {
  const channel = String(value || 'px').toLowerCase();
  if (channel === 'pxmart') return 'px';
  if (channel === 'simplemart') return 'amart';
  if (channel === 'px' || channel === 'carrefour' || channel === 'amart') return channel;
  throw new HttpError('channel must be px, carrefour, or amart.', 400);
}

function analyzePriceName(value: unknown, selectedName?: unknown) {
  const originalName = cleanText(value);
  const normName = normalizePriceName(originalName);
  const searchName = removeUnits(normName) || normName || originalName;
  return {
    originalName,
    normName,
    searchName,
    storageKey: normName.toLowerCase().replace(/[^\dA-Za-z\u4e00-\u9fff]+/g, '') || originalName.toLowerCase(),
    detectedUnits: extractUnits(originalName),
    keywords: searchKeywords(originalName, selectedName, 6),
  };
}

async function loadCachedPrices(channel: 'px' | 'carrefour' | 'amart', name: string) {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const term = enc(`*${name}*`);
  try {
    return await dbSelect(
      'price_records',
      `select=*&channel=eq.${channel}&crawled_at=gte.${enc(since)}&or=(item_name.ilike.${term},norm_name.ilike.${term})&order=crawled_at.desc&limit=30`,
    );
  } catch (error) {
    if (isSupabasePermissionError(error)) return [];
    throw error;
  }
}

async function insertPriceCandidates(items: PriceCandidate[]) {
  if (!items.length) return 0;
  const rows = items.map((item) => ({
    channel: item.channel,
    item_name: item.item_name,
    norm_name: item.norm_name,
    price: item.price,
    unit: item.unit || null,
    source_url: item.source_url || null,
  }));
  try {
    const inserted = await dbInsert('price_records', rows);
    return inserted.length;
  } catch (error) {
    if (isSupabasePermissionError(error)) {
      return 0;
    }
    throw error;
  }
}

// Watchlist crawled on a schedule by GET /api/prices/sync (Vercel Cron).
// Keep it small so the run finishes within the function timeout.
const PRICE_SYNC_KEYWORDS = ['雞蛋', '鮮奶', '高麗菜', '雞胸肉', '白米', '洋蔥'];
const PRICE_SYNC_CHANNELS: Array<'px' | 'carrefour' | 'amart'> = ['px', 'carrefour', 'amart'];

// service_role insert so the scheduled job can persist prices (bypasses RLS/anon grant limits).
async function insertPriceCandidatesAdmin(items: PriceCandidate[]) {
  if (!items.length) return 0;
  const rows = items.map((item) => ({
    channel: item.channel,
    item_name: item.item_name,
    norm_name: item.norm_name,
    price: item.price,
    unit: item.unit || null,
    source_url: item.source_url || null,
  }));
  const inserted = await syncAdminDbInsert('price_records', rows);
  return inserted.length;
}

async function syncPriceWatchlist() {
  const started = Date.now();
  let fetched = 0;
  let inserted = 0;
  const failures: { keyword: string; channel: string; error: string }[] = [];
  for (const keyword of PRICE_SYNC_KEYWORDS) {
    for (const channel of PRICE_SYNC_CHANNELS) {
      try {
        const items = await scrapePriceCandidates(channel, keyword, '', 1);
        fetched += items.length;
        inserted += await insertPriceCandidatesAdmin(items);
      } catch (error) {
        failures.push({
          keyword,
          channel,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
  }
  return {
    ok: true,
    keywords: PRICE_SYNC_KEYWORDS.length,
    channels: PRICE_SYNC_CHANNELS.length,
    fetched,
    inserted,
    failures,
    ms: Date.now() - started,
  };
}

function isSupabasePermissionError(error: unknown) {
  return error instanceof HttpError
    && (error.status === 401 || error.status === 403 || /permission denied/i.test(error.message));
}

function priceCandidateToApi(row: DbRow) {
  return {
    id: row.id ? String(row.id) : undefined,
    channel: row.channel,
    itemName: row.item_name,
    normName: row.norm_name,
    price: Number(row.price || 0),
    unit: row.unit || null,
    sourceUrl: row.source_url || null,
    crawledAt: row.crawled_at || new Date().toISOString(),
    rawPrice: row.raw_price,
    code: row.code,
  };
}

function pickSelectedPrice(candidates: ReturnType<typeof priceCandidateToApi>[], selectedName: string) {
  if (!selectedName) return null;
  return candidates.find((item) => item.itemName === selectedName || item.normName === selectedName) || null;
}

async function scrapePriceCandidates(channel: 'px' | 'carrefour' | 'amart', keyword: string, selectedName: string, maxPages: number) {
  if (channel === 'px') return scrapePxmart(keyword, selectedName, maxPages);
  if (channel === 'carrefour') return scrapeCarrefour(keyword, selectedName, maxPages);
  return scrapeSimpleMart(keyword, selectedName, maxPages);
}

function pickPxmartPublicCode(product: any) {
  return product?.sale_code || product?.item_no || product?.code || product?.productCode || product?.product_code || null;
}

function looksLikePxmartPublicCode(value: unknown) {
  const text = cleanText(value);
  // 商品編號 values are usually zero-padded codes like 00101530/00228537.
  // They should remain display codes only, never /product/<商品編號>.
  return /^0\d{5,}$/.test(text);
}

function pickPxmartRouteProductId(product: any) {
  const publicCode = cleanText(pickPxmartPublicCode(product));
  const keys = [
    'product_id',
    'productId',
    'spu_id',
    'spuId',
    'spu_info_id',
    'spuInfoId',
    'product_info_id',
    'productInfoId',
    'id',
  ];
  for (const key of keys) {
    const value = product?.[key];
    const text = cleanText(value);
    if (!text) continue;
    if (publicCode && text === publicCode) continue;
    if (looksLikePxmartPublicCode(text)) continue;
    return value;
  }
  return null;
}

function pxmartProductUrl(product: any, keyword: string) {
  const internalLink = cleanText(product?.internal_link || product?.internalLink);
  if (internalLink.startsWith('/product/')) {
    const id = internalLink.split('/').pop()?.split('?')[0] || '';
    if (id && !looksLikePxmartPublicCode(id)) return `https://pxbox.es.pxmart.com.tw${internalLink}`;
  }
  const routeProductId = pickPxmartRouteProductId(product);
  if (routeProductId) return `https://pxbox.es.pxmart.com.tw/product/${encodeURIComponent(String(routeProductId))}`;
  return `https://pxbox.es.pxmart.com.tw/search/result?keyword=${encodeURIComponent(keyword)}`;
}

async function scrapePxmart(keyword: string, selectedName: string, maxPages: number): Promise<PriceCandidate[]> {
  const results: PriceCandidate[] = [];
  const seen = new Set<string>();
  const visitorId = `c.${Math.floor(Math.random() * 9000000000 + 1000000000)}.${Math.floor(Math.random() * 9000000000 + 1000000000)}`;
  for (const term of searchKeywords(keyword, selectedName, 4)) {
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await fetch('https://api-pxbox.es.pxmart.com.tw/app/2.0/spu/single_search', {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
          Origin: 'https://pxbox.es.pxmart.com.tw',
          Referer: `https://pxbox.es.pxmart.com.tw/search/result?keyword=${encodeURIComponent(term)}`,
          'User-Agent': browserUserAgent(),
        },
        body: JSON.stringify({
          search_setting_type: 1,
          keyword: term,
          sort_type: 0,
          page_index: page,
          page_size: 48,
          filters: [],
          visitor_id: visitorId,
          user_info_id: '',
        }),
      });
      if (!response.ok) break;
      const json = await response.json().catch(() => null);
      const products = Array.isArray(json?.data?.product_list) ? json.data.product_list : [];
      if (!products.length) break;
      for (const product of products) {
        const name = cleanText(product.product_name || product.title || product.name || findDeep(product, ['product_name', 'productName', 'title', 'name']));
        const price = parsePrice(product.sale_price ?? product.salePrice ?? product.sellingPrice ?? product.price ?? findDeep(product, ['sale_price', 'salePrice', 'sellingPrice', 'price']));
        if (!name || price === null || product.is_sold_out === true) continue;
        // PXBox has two different identifiers:
        // - product_id/productId/id-like route fields: internal route id used by /product/<id>
        // - sale_code/item_no/code: public 商品編號, e.g. 00228537, not a valid route id
        const publicCode = pickPxmartPublicCode(product);
        const routeProductId = pickPxmartRouteProductId(product);
        const code = publicCode || product.id || null;
        const key = `${name}:${price}:${code || routeProductId || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          channel: 'px',
          item_name: name.slice(0, 100),
          norm_name: normalizePriceName(name),
          price,
          unit: extractUnits(name)[0] || null,
          source_url: pxmartProductUrl(product, term),
          raw_price: String(price),
          code,
        });
      }
    }
  }
  return results;
}

async function scrapeSimpleMart(keyword: string, selectedName: string, maxPages: number): Promise<PriceCandidate[]> {
  const results: PriceCandidate[] = [];
  const seen = new Set<string>();
  for (const term of searchKeywords(keyword, selectedName, 4)) {
    for (let page = 1; page <= maxPages; page += 1) {
      const data = page > 1 ? { pageID: String(page), keyword: term } : { keyword: term };
      const payload = { type: 1, keyword: term, html_name: '/sortview', data };
      const response = await fetch('https://goshopping.simplemart.com.tw/api/get_goods_arr', {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/json;charset=UTF-8',
          Origin: 'https://goshopping.simplemart.com.tw',
          Referer: `https://goshopping.simplemart.com.tw/sortview?keyword=${encodeURIComponent(term)}`,
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': browserUserAgent(),
        },
        body: JSON.stringify({ data: encryptSimpleMartPayload(payload), member_card: '' }),
      });
      if (!response.ok) break;
      const json = await response.json().catch(() => null);
      const blocks = ['productblock', 'productblocktwo', 'productblockthree'].flatMap((key) => Array.isArray(json?.[key]) ? json[key] : []);
      if (!blocks.length) break;
      for (const product of blocks) {
        const name = cleanText(product.title);
        const price = parsePrice(product.price);
        if (!name || price === null) continue;
        const code = new URL(product.link || '/sortview', 'https://goshopping.simplemart.com.tw').searchParams.get('id');
        const key = `${name}:${price}:${code || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          channel: 'amart',
          item_name: name.slice(0, 100),
          norm_name: normalizePriceName(name),
          price,
          unit: extractUnits(name)[0] || null,
          source_url: product.link ? new URL(product.link, 'https://goshopping.simplemart.com.tw').toString() : `https://goshopping.simplemart.com.tw/sortview?keyword=${encodeURIComponent(term)}`,
          raw_price: cleanText(product.price),
          code,
        });
      }
    }
  }
  return results;
}

async function scrapeCarrefour(keyword: string, selectedName: string, maxPages: number): Promise<PriceCandidate[]> {
  const results: PriceCandidate[] = [];
  const seen = new Set<string>();
  for (const term of searchKeywords(keyword, selectedName, 4)) {
    for (let page = 1; page <= maxPages; page += 1) {
      const url = page <= 1
        ? `https://online.uni-prosperity.com.tw/zh/search/?q=${encodeURIComponent(term)}`
        : `https://online.uni-prosperity.com.tw/on/demandware.store/Sites-Uniprosperity-Site/default/Search-UpdateGrid?q=${encodeURIComponent(term)}&start=${(page - 1) * 24}`;
      const response = await fetch(url, { headers: { 'User-Agent': browserUserAgent(), Accept: 'text/html,application/xhtml+xml' } });
      if (!response.ok) break;
      const html = await response.text();
      const matches = [...html.matchAll(/<a\b(?=[^>]*\bclass=['"][^'"]*\bgtm-product-alink\b[^'"]*['"])[^>]*>/gis)];
      if (!matches.length) break;
      for (const match of matches) {
        const attrs = parseHtmlAttrs(match[0]);
        const name = cleanText(attrs['data-name'] || attrs.title || attrs['aria-label']);
        const price = parsePrice(attrs['data-price'] || attrs['data-baseprice']);
        if (!name || price === null) continue;
        const code = attrs['data-pid'] || null;
        const key = `${name}:${price}:${code || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          channel: 'carrefour',
          item_name: name.slice(0, 100),
          norm_name: normalizePriceName(name),
          price,
          unit: extractUnits(attrs['data-variant'] || name)[0] || null,
          source_url: attrs.href ? new URL(attrs.href, 'https://online.uni-prosperity.com.tw').toString() : url,
          raw_price: String(price),
          code,
        });
      }
    }
  }
  return results;
}

function encryptSimpleMartPayload(payload: unknown) {
  const key = Buffer.from('absoietlj32fai12', 'utf8');
  const cipher = createCipheriv('aes-128-cbc', key, key);
  return Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]).toString('base64');
}

function searchKeywords(keyword: unknown, selectedName?: unknown, limit = 4) {
  const terms: string[] = [];
  const add = (value: unknown) => {
    const text = removeUnits(normalizePriceName(value));
    if (text && !terms.includes(text)) terms.push(text.slice(0, 60));
  };
  add(selectedName);
  add(keyword);
  for (const token of cleanText(keyword).match(/[\u4e00-\u9fff]+|[A-Za-z0-9]+/g) || []) add(token);
  return terms.slice(0, limit);
}

function normalizePriceName(value: unknown) {
  return cleanText(value)
    .replace(/<[^>]{1,40}>/g, ' ')
    .replace(/[()[\]{}<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function removeUnits(value: unknown) {
  return cleanText(value).replace(/\d+(?:\.\d+)?\s?(?:ml|mL|ML|l|L|cc|g|G|kg|KG)/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractUnits(value: unknown) {
  return [...cleanText(value).matchAll(/\d+(?:\.\d+)?\s?(?:ml|mL|ML|l|L|cc|g|G|kg|KG)/g)].map((match) => match[0]);
}

function parsePrice(value: unknown) {
  const match = cleanText(value).match(/\d[\d,]*(?:\.\d+)?/);
  return match ? Math.trunc(Number(match[0].replaceAll(',', ''))) : null;
}

function cleanText(value: unknown) {
  return String(value || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

function findDeep(value: any, keys: string[]): unknown {
  if (!value || typeof value !== 'object') return undefined;
  for (const key of keys) if (value[key] !== undefined && value[key] !== null && value[key] !== '') return value[key];
  for (const child of Object.values(value)) {
    const found = findDeep(child, keys);
    if (found !== undefined && found !== null && found !== '') return found;
  }
  return undefined;
}

function parseHtmlAttrs(tag: string) {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(['"])(.*?)\2/gs)) {
    attrs[match[1].toLowerCase()] = cleanText(match[3]);
  }
  return attrs;
}

function toPositiveInt(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(10, Math.trunc(number)) : fallback;
}

function browserUserAgent() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
}

async function dbSelect(table: string, query: string) {
  return supabaseFetch(table, query, { method: 'GET' });
}

async function dbInsert(table: string, body: unknown) {
  return supabaseFetch(table, 'select=*', {
    method: 'POST',
    body,
    prefer: 'return=representation',
  });
}

async function dbUpdate(table: string, body: unknown, filter: string) {
  return supabaseFetch(table, `${filter}&select=*`, {
    method: 'PATCH',
    body,
    prefer: 'return=representation',
  });
}

async function adminDbSelect(table: string, query: string) {
  return supabaseAdminFetch(table, query, { method: 'GET' });
}

async function adminDbInsert(table: string, body: unknown) {
  return supabaseAdminFetch(table, 'select=*', {
    method: 'POST',
    body,
    prefer: 'return=representation',
  });
}

async function adminDbUpdate(table: string, body: unknown, filter: string) {
  return supabaseAdminFetch(table, `${filter}&select=*`, {
    method: 'PATCH',
    body,
    prefer: 'return=representation',
  });
}

async function adminDbUpsert(table: string, body: unknown, onConflict: string) {
  return supabaseAdminFetch(table, `on_conflict=${encRaw(onConflict)}&select=*`, {
    method: 'POST',
    body,
    prefer: 'resolution=merge-duplicates,return=representation',
  });
}

async function syncAdminDbSelect(table: string, query: string) {
  return supabaseSyncAdminFetch(table, query, { method: 'GET' });
}

async function syncAdminDbInsert(table: string, body: unknown) {
  return supabaseSyncAdminFetch(table, 'select=*', {
    method: 'POST',
    body,
    prefer: 'return=representation',
  });
}

async function syncAdminDbUpsert(table: string, body: unknown, onConflict: string) {
  return supabaseSyncAdminFetch(table, `on_conflict=${encRaw(onConflict)}&select=*`, {
    method: 'POST',
    body,
    prefer: 'resolution=merge-duplicates,return=representation',
  });
}

async function dbDelete(table: string, filter: string) {
  return supabaseFetch(table, `${filter}&select=*`, {
    method: 'DELETE',
    prefer: 'return=representation',
  });
}

async function dbUpsert(table: string, body: unknown, onConflict: string) {
  return supabaseFetch(table, `on_conflict=${encRaw(onConflict)}&select=*`, {
    method: 'POST',
    body,
    prefer: 'resolution=merge-duplicates,return=representation',
  });
}

async function userDbSelect(accessToken: string, table: string, query: string) {
  return supabaseFetchAsUser(accessToken, table, query, { method: 'GET' });
}

async function userDbInsert(accessToken: string, table: string, body: unknown) {
  return supabaseFetchAsUser(accessToken, table, 'select=*', {
    method: 'POST',
    body,
    prefer: 'return=representation',
  });
}

async function userDbUpsert(accessToken: string, table: string, body: unknown, onConflict: string) {
  return supabaseFetchAsUser(accessToken, table, `on_conflict=${encRaw(onConflict)}&select=*`, {
    method: 'POST',
    body,
    prefer: 'resolution=merge-duplicates,return=representation',
  });
}

async function supabaseFetchAsUser(
  accessToken: string,
  table: string,
  query: string,
  options: { method: string; body?: unknown; prefer?: string },
) {
  const url = getRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const anonKey = getRequiredEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
    method: options.method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : [];
  if (!response.ok) {
    throw new HttpError(data?.message || data?.hint || `Supabase request failed: ${response.status}`, response.status);
  }
  return Array.isArray(data) ? data : [data];
}

async function supabaseFetch(table: string, query: string, options: { method: string; body?: unknown; prefer?: string }) {
  const url = getRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const key = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
    method: options.method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const data = parseJson(text, {});
  if (!response.ok) {
    throw new HttpError(data?.message || data?.hint || `Supabase request failed: ${response.status}`, response.status);
  }
  return Array.isArray(data) ? data : [data];
}

async function supabaseAdminFetch(table: string, query: string, options: { method: string; body?: unknown; prefer?: string }) {
  const url = getRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const key = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY');
  const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
    method: options.method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const data = parseJson(text, {});
  if (!response.ok) {
    throw new HttpError(data?.message || data?.hint || `Supabase admin request failed: ${response.status}`, response.status);
  }
  return Array.isArray(data) ? data : [data];
}

async function supabaseSyncAdminFetch(table: string, query: string, options: { method: string; body?: unknown; prefer?: string }) {
  const url = getRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const key = getNotificationSyncServiceRoleKey();
  const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
    method: options.method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const data = parseJson(text, {});
  if (!response.ok) {
    throw new HttpError(data?.message || data?.hint || `Supabase notification sync admin request failed: ${response.status}`, response.status);
  }
  return Array.isArray(data) ? data : [data];
}

function getNotificationSyncServiceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new HttpError('Missing SUPABASE_SERVICE_ROLE_KEY for notification sync.', 500);
  }

  const parts = key.split('.');
  if (parts.length >= 2) {
    const payload = parseJson(Buffer.from(parts[1], 'base64url').toString('utf8'), null);
    if (payload?.role && payload.role !== 'service_role') {
      throw new HttpError('SUPABASE_SERVICE_ROLE_KEY is not a service_role key for notification sync.', 500);
    }
  }

  return key;
}

function setSession(req: ApiRequest, res: ApiResponse, userId: number) {
  const payload = base64Url(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_MAX_AGE * 1000 }));
  const signature = sign(payload);
  const secure = getProto(req) === 'https' ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${payload}.${signature}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`);
}

function clearSession(res: ApiResponse) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

function requireSession(req: ApiRequest) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) throw new HttpError('Not logged in.', 401);
  const [payload, signature] = token.split('.');
  if (!payload || !signature || sign(payload) !== signature) throw new HttpError('Not logged in.', 401);
  const parsed = parseJson(Buffer.from(payload, 'base64url').toString('utf8'), null);
  if (!parsed?.uid || !parsed?.exp || parsed.exp < Date.now()) throw new HttpError('Not logged in.', 401);
  return Number(parsed.uid);
}

function sign(value: string) {
  return createHmac('sha256', getSessionSecret()).update(value).digest('base64url');
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || process.env.SECRET_KEY || getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_ANON_KEY');
}

function getCookie(req: ApiRequest, name: string) {
  const header = Array.isArray(req.headers.cookie) ? req.headers.cookie.join(';') : req.headers.cookie || '';
  return header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function getProto(req: ApiRequest) {
  const proto = req.headers['x-forwarded-proto'];
  return Array.isArray(proto) ? proto[0] : proto || 'https';
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const iterations = 260000;
  const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2:sha256:${iterations}$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const parts = stored.split('$');
  try {
    if (parts.length === 3 && parts[0].startsWith('pbkdf2:')) {
      const methodParts = parts[0].split(':');
      const digest = methodParts[1] || 'sha256';
      const iterations = Number(methodParts[2] || 260000);
      const expected = Buffer.from(parts[2], 'hex');
      const actual = pbkdf2Sync(password, parts[1], iterations, expected.length, digest).toString('hex');
      return safeEqualHex(actual, parts[2]);
    }
    if (parts.length === 3 && parts[0].startsWith('scrypt:')) {
      const [, n, r, p] = parts[0].split(':');
      const expected = Buffer.from(parts[2], 'hex');
      const actual = scryptSync(password, parts[1], expected.length, {
        N: Number(n || 32768),
        r: Number(r || 8),
        p: Number(p || 1),
        maxmem: 128 * 1024 * 1024,
      }).toString('hex');
      return safeEqualHex(actual, parts[2]);
    }
  } catch {
    return false;
  }
  return false;
}

function safeEqualHex(a: string, b: string) {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function ok(res: ApiResponse, data: unknown, status = 200) {
  return res.status(status).json({ success: true, data });
}

function fail(res: ApiResponse, message: string, status = 500) {
  return res.status(status).json({ success: false, error: message, code: status });
}

async function getBody(req: ApiRequest) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function getPathSegments(req: ApiRequest) {
  const raw = req.query?.path;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    return raw
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
  }
  const pathname = getUrl(req).pathname.replace(/^\/api\/?/, '');
  return pathname.split('/').filter(Boolean).map(decodeURIComponent);
}

function getUrl(req: ApiRequest) {
  return new URL(req.url || '/api', 'https://local.test');
}

function effectiveDaysLeft(row: DbRow) {
  const base = Number(row.days_left || 0);
  if (!row.created_at) return base;
  const created = new Date(row.created_at);
  if (Number.isNaN(created.getTime())) return base;
  const elapsed = Math.max(0, Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)));
  return base - elapsed;
}

function parseJson(value: unknown, fallback: any) {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseJsonArray(value: unknown) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function toInt(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new HttpError(`${field} must be a number.`, 400);
  return Math.trunc(number);
}

function getRequiredEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new HttpError(`Missing environment variable: ${names.join(' or ')}`, 500);
}

function enc(value: string) {
  return encodeURIComponent(value);
}

function encRaw(value: string) {
  return encodeURIComponent(value).replaceAll('%2C', ',');
}

function base64Url(value: string) {
  return Buffer.from(value).toString('base64url');
}
