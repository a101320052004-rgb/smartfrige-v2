import { supabase } from './supabase';
import type { FoodCategory, Ingredient, SharedRecipe, ShoppingItem, StorageType, ThemeKey } from '../types';

export interface AuthUser {
  id: string;
  username: string;
  chefName?: string;
  chefRank?: string;
  mustSetPassword?: boolean;
  isNewAccount?: boolean;
}

export interface UserSettings {
  chefName: string;
  theme: ThemeKey;
  expiryReminderDays: number;
  expiryPushTime: string;
  recipeUpdateTime: string;
  tourSeen: boolean;
  restockDefaultsSet: boolean;
  restockReminderIds: string[];
}

export interface ScannedIngredient {
  name: string;
  category: FoodCategory;
  qty: string;
  storageType: StorageType;
  daysLeft: number | null;
}

export interface AppNotification {
  id: string;
  type: 'expiry' | 'restock' | 'recipe';
  ingredientId?: string | null;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export type RemovedIngredientReason = 'eaten' | 'wasted' | 'expired';

export interface RemovedIngredientRecord {
  id: string;
  item: Ingredient;
  reason: RemovedIngredientReason;
  removedAt: number;
  expiresAt?: string | null;
}

export interface PriceRecord {
  id?: string;
  channel: 'px' | 'carrefour' | 'amart';
  itemName: string;
  normName?: string | null;
  price: number;
  unit?: string | null;
  sourceUrl?: string | null;
  crawledAt?: string;
  rawPrice?: string;
  code?: string | number | null;
}

export interface PriceNormalizeResult {
  originalName: string;
  normName: string;
  searchName: string;
  storageKey: string;
  detectedUnits: string[];
  keywords: string[];
}

export interface PriceCrawlResult {
  channel: 'px';
  keyword: string;
  maxPages: number;
  fetched: number;
  inserted: number;
  items: PriceRecord[];
}

export interface PxmartCandidateResult {
  channel: 'px' | 'carrefour' | 'amart';
  query: string;
  normName?: string | null;
  searchName?: string | null;
  storageKey?: string | null;
  detectedUnits?: string[];
  searchedKeywords?: string[];
  selectedName?: string | null;
  selected?: PriceRecord | null;
  cheapest?: PriceRecord | null;
  price?: number | null;
  priceDisplay: string;
  candidates: PriceRecord[];
  fromCache: boolean;
  refreshed: boolean;
  inserted: number;
  cacheDays: number;
}

interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: number;
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
type DbRow = Record<string, any>;

const CURRENT_USER_STORAGE_KEY = 'smartfridge:currentUser';

export class ApiError extends Error {
  status: number;
  code?: number;

  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// Keep this only for endpoints that must stay server-side: custom auth,
// Gemini, image generation, and crawlers.
async function request<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    cache: method === 'GET' ? 'no-store' : 'default',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: ApiResult<T>;
  try {
    json = JSON.parse(text) as ApiResult<T>;
  } catch {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new ApiError('Backend service is temporarily unavailable.', res.status);
    }
    if (res.status === 413) {
      throw new ApiError('Uploaded file is too large.', res.status);
    }
    throw new ApiError('API response format is invalid.', res.status);
  }
  if (!res.ok || !json.success) {
    throw new ApiError(json.error || 'API request failed.', res.status, json.code);
  }
  return json.data as T;
}

function rememberUser(user: AuthUser): AuthUser {
  localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
  return user;
}

function forgetUser() {
  localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
}

function currentUser(): AuthUser {
  const raw = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
  if (!raw) throw new ApiError('Please log in first.', 401);
  try {
    const user = JSON.parse(raw) as AuthUser;
    if (!user.id) throw new Error('missing id');
    return user;
  } catch {
    forgetUser();
    throw new ApiError('Please log in again.', 401);
  }
}

function currentUserId(): number {
  const id = Number(currentUser().id);
  if (!Number.isFinite(id)) throw new ApiError('Invalid current user.', 401);
  return id;
}

function handleSupabaseError(error: { message?: string; code?: string } | null, fallback = 'Supabase request failed.') {
  if (error) {
    throw new ApiError(error.message || fallback, error.code === 'PGRST116' ? 404 : 500);
  }
}

function requireRow<T>(row: T | null | undefined, message: string): T {
  if (!row) throw new ApiError(message, 404);
  return row;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toInt(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new ApiError(`${field} must be a number.`, 400);
  return Math.trunc(parsed);
}

function profileToAuthUser(profile: DbRow): AuthUser {
  return {
    id: String(profile.id),
    username: profile.username,
    chefName: profile.chef_name || profile.username,
    chefRank: profile.chef_rank || 'Chef',
    mustSetPassword: String(profile.password_hash || '').startsWith('gmail-unset$'),
    isNewAccount: Boolean(profile.is_new_account),
  };
}

async function fetchProfileByAuthUserId(authUserId: string): Promise<DbRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, chef_name, chef_rank, auth_user_id, password_hash')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  handleSupabaseError(error, 'Unable to load user profile.');
  return data;
}

async function createProfileForAuthUser(authUserId: string, email: string, chefName?: string): Promise<DbRow> {
  const { data, error } = await supabase
    .from('users')
    .insert({
      auth_user_id: authUserId,
      username: email,
      chef_name: (chefName || email.split('@')[0] || 'Chef').slice(0, 50),
      chef_rank: 'Chef',
      password_hash: 'managed-by-supabase-auth',
    })
    .select('id, username, chef_name, chef_rank, auth_user_id, password_hash')
    .single();
  handleSupabaseError(error, 'Unable to create user profile.');
  return data;
}

type SupabaseOtpLoginResult = {
  user?: {
    id?: string;
    email?: string;
    user_metadata?: { chef_name?: string };
  } | null;
  session: {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    token_type?: string;
  } | null;
};

async function finishSupabaseOtpLogin(result: SupabaseOtpLoginResult, fallbackEmail: string, errorMessage: string) {
  if (!result.session?.access_token || !result.session.refresh_token || !result.user?.id) {
    throw new ApiError(errorMessage, 401);
  }
  const { error } = await supabase.auth.setSession({
    access_token: result.session.access_token,
    refresh_token: result.session.refresh_token,
  });
  handleSupabaseError(error, 'Unable to set Gmail login session.');

  const email = (result.user.email || fallbackEmail).trim().toLowerCase();
  const existing = await fetchProfileByAuthUserId(result.user.id);
  const profile = existing || await createProfileForAuthUser(
    result.user.id,
    email,
    result.user.user_metadata?.chef_name,
  );
  await ensureSettings(Number(profile.id));
  return rememberUser(profileToAuthUser(profile));
}

export const authApi = {
  register: async (username: string, password: string, chefName?: string) => {
    const email = username.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          chef_name: chefName || email.split('@')[0],
        },
      },
    });
    handleSupabaseError(error, 'Unable to register.');
    const authUser = data.user;
    if (!authUser) throw new ApiError('Unable to register.', 400);
    if (!data.session) {
      throw new ApiError('Registration created. Please confirm your email, then log in.', 401);
    }

    const existing = await fetchProfileByAuthUserId(authUser.id);
    const profile = existing || await createProfileForAuthUser(authUser.id, email, chefName);
    await ensureSettings(Number(profile.id));
    return rememberUser(profileToAuthUser(profile));
  },
  login: async (username: string, password: string) => {
    const email = username.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    handleSupabaseError(error, 'Email or password is incorrect.');
    if (!data.user) throw new ApiError('Email or password is incorrect.', 401);

    const existing = await fetchProfileByAuthUserId(data.user.id);
    const profile = existing || await createProfileForAuthUser(data.user.id, email, data.user.user_metadata?.chef_name);
    await ensureSettings(Number(profile.id));
    return rememberUser(profileToAuthUser(profile));
  },
  requestGoogleLogin: (username: string) =>
    request<{ sent: boolean; isNewAccount?: boolean }>('/api/login/google/request', 'POST', { username }),
  confirmGoogleLogin: async (username: string, _challenge: string, code: string) => {
    const result = await request<SupabaseOtpLoginResult>('/api/login/google/confirm', 'POST', { username, code });
    return finishSupabaseOtpLogin(result, username, 'Gmail 登入驗證失敗，請重新寄送。');
  },
  confirmGoogleLoginToken: async (username: string, token: string) => {
    const result = await request<SupabaseOtpLoginResult>('/api/login/google/confirm', 'POST', { username, token });
    return finishSupabaseOtpLogin(result, username, 'Gmail 登入連結失敗，請重新寄送。');
  },
  logout: async () => {
    const { error } = await supabase.auth.signOut();
    forgetUser();
    handleSupabaseError(error, 'Unable to log out.');
    return { loggedOut: true };
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const user = currentUser();
    if (currentPassword) {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.username,
        password: currentPassword,
      });
      handleSupabaseError(verifyError, 'Current password is incorrect.');
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    handleSupabaseError(error, 'Unable to change password.');
    const { error: profileError } = await supabase
      .from('users')
      .update({ password_hash: 'managed-by-supabase-auth' })
      .eq('id', Number(user.id));
    handleSupabaseError(profileError, 'Unable to update password status.');
    rememberUser({ ...user, mustSetPassword: false });
    return { changed: true };
  },
  requestPasswordReset: (username: string) =>
    request<{ sent: boolean; message?: string }>('/api/password/reset/request', 'POST', { email: username }),
  confirmPasswordReset: (username: string, token: string, newPassword: string) =>
    request<{ reset: boolean }>('/api/password/reset/confirm', 'POST', { email: username, token, newPassword }),
  setPasswordRecoverySession: async (accessToken: string, refreshToken: string) => {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    handleSupabaseError(error, 'Unable to open password reset session.');
    return data.user?.email || '';
  },
  completePasswordRecovery: async (newPassword: string) => {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    handleSupabaseError(error, 'Unable to reset password.');
    const authUser = data.user || (await supabase.auth.getUser()).data.user;
    if (authUser?.id) {
      const { error: profileError } = await supabase
        .from('users')
        .update({ password_hash: 'managed-by-supabase-auth' })
        .eq('auth_user_id', authUser.id);
      handleSupabaseError(profileError, 'Unable to update password status.');
    }
    await supabase.auth.signOut();
    forgetUser();
    return { reset: true };
  },
  me: async () => {
    const { data, error } = await supabase.auth.getUser();
    handleSupabaseError(error, 'Please log in first.');
    const authUser = data.user;
    if (!authUser?.email) {
      forgetUser();
      throw new ApiError('Please log in first.', 401);
    }
    const existing = await fetchProfileByAuthUserId(authUser.id);
    const profile = existing || await createProfileForAuthUser(
      authUser.id,
      authUser.email,
      authUser.user_metadata?.chef_name,
    );
    await ensureSettings(Number(profile.id));
    return rememberUser(profileToAuthUser(profile));
  },
};

async function fetchUserRow(userId = currentUserId()): Promise<DbRow> {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, chef_name, chef_rank, auth_user_id')
    .eq('id', userId)
    .maybeSingle();
  handleSupabaseError(error, 'Unable to load user.');
  return requireRow(data, 'User not found.');
}

async function ensureSettings(userId = currentUserId()) {
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId }, { onConflict: 'user_id' });
  handleSupabaseError(error, 'Unable to prepare user settings.');
}

function settingsToApi(user: DbRow, row: DbRow | null): UserSettings {
  return {
    chefName: user.chef_name || user.username || 'Chef',
    theme: (row?.theme || 'sky') as ThemeKey,
    expiryReminderDays: row?.expiry_reminder_days ?? 3,
    expiryPushTime: row?.expiry_push_time || '09:00',
    recipeUpdateTime: row?.recipe_update_time || '06:30',
    tourSeen: Boolean(row?.tour_seen),
    restockDefaultsSet: Boolean(row?.restock_defaults_set),
    restockReminderIds: parseJson<string[]>(row?.restock_reminder_ids, []),
  };
}

export const settingsApi = {
  get: async (): Promise<UserSettings> => {
    const userId = currentUserId();
    await ensureSettings(userId);
    const [user, settingsResult] = await Promise.all([
      fetchUserRow(userId),
      supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
    ]);
    handleSupabaseError(settingsResult.error, 'Unable to load settings.');
    return settingsToApi(user, settingsResult.data);
  },
  update: async (patch: Partial<UserSettings>): Promise<UserSettings> => {
    const userId = currentUserId();
    await ensureSettings(userId);

    if (Object.prototype.hasOwnProperty.call(patch, 'chefName')) {
      const { error } = await supabase
        .from('users')
        .update({ chef_name: String(patch.chefName || '').trim().slice(0, 50) || 'Chef' })
        .eq('id', userId);
      handleSupabaseError(error, 'Unable to update chef name.');
    }

    const updates: DbRow = {};
    if ('theme' in patch) updates.theme = patch.theme;
    if ('expiryReminderDays' in patch) updates.expiry_reminder_days = patch.expiryReminderDays;
    if ('expiryPushTime' in patch) updates.expiry_push_time = patch.expiryPushTime;
    if ('recipeUpdateTime' in patch) updates.recipe_update_time = patch.recipeUpdateTime;
    if ('tourSeen' in patch) updates.tour_seen = patch.tourSeen;
    if ('restockDefaultsSet' in patch) updates.restock_defaults_set = patch.restockDefaultsSet;
    if ('restockReminderIds' in patch) updates.restock_reminder_ids = JSON.stringify(patch.restockReminderIds || []);

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('user_settings')
        .update(updates)
        .eq('user_id', userId);
      handleSupabaseError(error, 'Unable to update settings.');
    }

    return settingsApi.get();
  },
};

export const scanApi = {
  detectIngredients: async (image: File) => {
    const imageData = await fileToDataUrl(image);
    return request<{ items: ScannedIngredient[] }>('/api/scan', 'POST', {
      imageData,
      mimeType: image.type || 'image/jpeg',
    });
  },
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new ApiError('Unable to read image file.', 400));
    reader.readAsDataURL(file);
  });
}

export type IngredientInput = Omit<Ingredient, 'id' | 'image' | 'isCustom'>;
export type ShoppingItemInput = Omit<ShoppingItem, 'id' | 'image'>;
export type RecipeInput = Pick<
  SharedRecipe,
  'name' | 'description' | 'fullContent' | 'image' | 'prepTime' | 'tags' | 'ingredients' | 'steps' | 'isPublic' | 'origin'
>;

function effectiveDaysLeft(row: DbRow): number {
  const base = Number(row.days_left || 0);
  if (!row.created_at) return base;
  const createdAt = new Date(row.created_at);
  if (Number.isNaN(createdAt.getTime())) return base;
  const elapsedDays = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86400000));
  return base - elapsedDays;
}

function ingredientToApi(row: DbRow): Ingredient {
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

function ingredientFromApi(input: IngredientInput, userId?: number): DbRow {
  const name = String(input.name || '').trim();
  if (!name) throw new ApiError('Ingredient name is required.', 400);
  return {
    ...(userId ? { user_id: userId } : {}),
    name,
    category: input.category || 'other',
    qty: String(input.qty || '').trim(),
    note: String(input.note || '').trim().slice(0, 500),
    storage_type: input.storageType || 'fridge',
    days_left: toInt(input.daysLeft, 'daysLeft'),
    total_days: toInt(input.totalDays, 'totalDays'),
  };
}

function removedIngredientToApi(row: DbRow): RemovedIngredientRecord {
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

export const ingredientsApi = {
  list: async (): Promise<Ingredient[]> => {
    const userId = currentUserId();
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    handleSupabaseError(error, 'Unable to load ingredients.');
    return (data || []).map(ingredientToApi).sort((a, b) => a.daysLeft - b.daysLeft);
  },
  listRemoved: async (): Promise<RemovedIngredientRecord[]> => {
    const userId = currentUserId();
    const { data, error } = await supabase
      .from('ingredient_removal_history')
      .select('*')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('removed_at', { ascending: false });
    handleSupabaseError(error, 'Unable to load removed ingredients.');
    return (data || []).map(removedIngredientToApi);
  },
  create: async (input: IngredientInput): Promise<Ingredient> => {
    const userId = currentUserId();
    const { data, error } = await supabase
      .from('ingredients')
      .insert(ingredientFromApi(input, userId))
      .select('*')
      .single();
    handleSupabaseError(error, 'Unable to create ingredient.');
    return ingredientToApi(data);
  },
  update: async (id: string, input: IngredientInput): Promise<Ingredient> => {
    const userId = currentUserId();
    const { data, error } = await supabase
      .from('ingredients')
      .update({ ...ingredientFromApi(input), created_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    handleSupabaseError(error, 'Unable to update ingredient.');
    return ingredientToApi(requireRow(data, 'Ingredient not found.'));
  },
  remove: async (id: string, reason: RemovedIngredientReason = 'wasted') => {
    const userId = currentUserId();
    const { data: ingredient, error: fetchError } = await supabase
      .from('ingredients')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    handleSupabaseError(fetchError, 'Unable to load ingredient.');
    const row = requireRow(ingredient, 'Ingredient not found.');

    const { data: removedRows, error: insertError } = await supabase
      .from('ingredient_removal_history')
      .insert({
        user_id: userId,
        original_ingredient_id: row.id,
        name: row.name,
        category: row.category,
        qty: row.qty,
        note: row.note || '',
        storage_type: row.storage_type || 'fridge',
        days_left: effectiveDaysLeft(row),
        total_days: row.total_days || 0,
        removed_reason: reason,
        expires_at: new Date(Date.now() + 180 * 86400000).toISOString(),
      })
      .select('*');
    handleSupabaseError(insertError, 'Unable to archive ingredient.');

    const { error: deleteError } = await supabase
      .from('ingredients')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (deleteError && removedRows?.[0]?.id) {
      await supabase.from('ingredient_removal_history').delete().eq('id', removedRows[0].id).eq('user_id', userId);
    }
    handleSupabaseError(deleteError, 'Unable to delete ingredient.');
    return { deleted: true, removed: removedIngredientToApi(removedRows![0]) };
  },
  restoreRemoved: async (id: string): Promise<Ingredient> => {
    const userId = currentUserId();
    const { data: removed, error: fetchError } = await supabase
      .from('ingredient_removal_history')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    handleSupabaseError(fetchError, 'Unable to load removed ingredient.');
    const row = requireRow(removed, 'Removed ingredient not found.');

    const { data: inserted, error: insertError } = await supabase
      .from('ingredients')
      .insert({
        user_id: userId,
        name: row.name,
        category: row.category,
        qty: row.qty,
        note: row.note || '',
        storage_type: row.storage_type || 'fridge',
        days_left: row.days_left || 0,
        total_days: row.total_days || 0,
      })
      .select('*')
      .single();
    handleSupabaseError(insertError, 'Unable to restore ingredient.');

    const { error: deleteError } = await supabase
      .from('ingredient_removal_history')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    handleSupabaseError(deleteError, 'Unable to remove restore record.');
    return ingredientToApi(inserted);
  },
};

function shoppingToApi(row: DbRow): ShoppingItem {
  return {
    id: String(row.id),
    name: row.name,
    category: row.category || '',
    qty: row.qty || 1,
    unit: row.unit || 'pcs',
    pricePX: row.price_px || 0,
    priceCarrefour: row.price_carrefour || 0,
    source: row.source || 'manual',
    linkedIngredientId: row.linked_ingredient_id ? String(row.linked_ingredient_id) : undefined,
  };
}

function shoppingFromApi(input: ShoppingItemInput, userId: number): DbRow {
  const name = String(input.name || '').trim();
  if (!name) throw new ApiError('Shopping item name is required.', 400);
  return {
    user_id: userId,
    name,
    category: String(input.category || '').slice(0, 20),
    qty: Math.max(1, toInt(input.qty ?? 1, 'qty')),
    unit: String(input.unit || 'pcs').slice(0, 20),
    price_px: Math.max(0, toInt(input.pricePX ?? 0, 'pricePX')),
    price_carrefour: Math.max(0, toInt(input.priceCarrefour ?? 0, 'priceCarrefour')),
    price_amart: Math.max(0, toInt((input as any).priceAMart ?? 0, 'priceAMart')),
    source: input.source || 'manual',
    linked_ingredient_id: input.linkedIngredientId ? Number(input.linkedIngredientId) : null,
  };
}

export const shoppingApi = {
  list: async (): Promise<ShoppingItem[]> => {
    const userId = currentUserId();
    const { data, error } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    handleSupabaseError(error, 'Unable to load shopping items.');
    return (data || []).map(shoppingToApi);
  },
  create: async (input: ShoppingItemInput): Promise<ShoppingItem> => {
    const userId = currentUserId();
    if (input.source === 'restock' && input.linkedIngredientId) {
      await shoppingApi.removeRestockByIngredient(input.linkedIngredientId);
    }
    const { data, error } = await supabase
      .from('shopping_items')
      .insert(shoppingFromApi(input, userId))
      .select('*')
      .single();
    handleSupabaseError(error, 'Unable to create shopping item.');
    return shoppingToApi(data);
  },
  updateQty: async (id: string, qty: number): Promise<ShoppingItem> => {
    const userId = currentUserId();
    const { data, error } = await supabase
      .from('shopping_items')
      .update({ qty: Math.max(1, toInt(qty, 'qty')) })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    handleSupabaseError(error, 'Unable to update shopping item.');
    return shoppingToApi(requireRow(data, 'Shopping item not found.'));
  },
  remove: async (id: string) => {
    const userId = currentUserId();
    const { error } = await supabase
      .from('shopping_items')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    handleSupabaseError(error, 'Unable to delete shopping item.');
    return { deleted: true };
  },
  removeRestockByIngredient: async (ingredientId: string) => {
    const userId = currentUserId();
    const { error } = await supabase
      .from('shopping_items')
      .delete()
      .eq('user_id', userId)
      .eq('source', 'restock')
      .eq('linked_ingredient_id', ingredientId);
    handleSupabaseError(error, 'Unable to delete restock item.');
    return { deleted: true };
  },
  removeAllRestock: async () => {
    const userId = currentUserId();
    const { data, error } = await supabase
      .from('shopping_items')
      .delete()
      .eq('user_id', userId)
      .eq('source', 'restock')
      .select('id');
    handleSupabaseError(error, 'Unable to clear restock items.');
    return { deleted: data?.length || 0 };
  },
};

export const pricesApi = {
  normalizeName: (name: string, selectedName?: string) => {
    const query = new URLSearchParams();
    query.set('name', name);
    if (selectedName) query.set('selectedName', selectedName);
    return request<PriceNormalizeResult>(`/api/prices/normalize?${query.toString()}`, 'GET');
  },
  crawlPXMart: (keyword = '牛奶', maxPages = 10) =>
    request<PriceCrawlResult>('/api/prices/crawl', 'POST', {
      channel: 'px',
      keyword,
      maxPages,
    }),
  list: async (params?: { name?: string; channel?: 'px' | 'carrefour' | 'amart'; limit?: number }): Promise<PriceRecord[]> => {
    let query = supabase
      .from('price_records')
      .select('*')
      .order('crawled_at', { ascending: false })
      .limit(params?.limit || 50);
    if (params?.channel) query = query.eq('channel', params.channel);
    if (params?.name) {
      const term = params.name.replaceAll(',', ' ');
      query = query.or(`item_name.ilike.%${term}%,norm_name.ilike.%${term}%`);
    }
    const { data, error } = await query;
    handleSupabaseError(error, 'Unable to load price records.');
    return (data || []).map(priceRecordToApi);
  },
  pxmartCandidates: (params: { name: string; selectedName?: string; maxPages?: number; refresh?: boolean }) => {
    const query = new URLSearchParams();
    query.set('name', params.name);
    if (params.selectedName) query.set('selectedName', params.selectedName);
    if (params.maxPages) query.set('maxPages', String(params.maxPages));
    if (params.refresh) {
      query.set('refresh', '1');
      query.set('_', String(Date.now()));
    }
    return request<PxmartCandidateResult>(`/api/prices/pxmart/candidates?${query.toString()}`, 'GET');
  },
  carrefourCandidates: (params: { name: string; selectedName?: string; maxPages?: number; refresh?: boolean }) => {
    const query = new URLSearchParams();
    query.set('name', params.name);
    if (params.selectedName) query.set('selectedName', params.selectedName);
    if (params.maxPages) query.set('maxPages', String(params.maxPages));
    if (params.refresh) {
      query.set('refresh', '1');
      query.set('_', String(Date.now()));
    }
    return request<PxmartCandidateResult>(`/api/prices/carrefour/candidates?${query.toString()}`, 'GET');
  },
  simplemartCandidates: (params: { name: string; selectedName?: string; maxPages?: number; refresh?: boolean }) => {
    const query = new URLSearchParams();
    query.set('name', params.name);
    if (params.selectedName) query.set('selectedName', params.selectedName);
    if (params.maxPages) query.set('maxPages', String(params.maxPages));
    if (params.refresh) {
      query.set('refresh', '1');
      query.set('_', String(Date.now()));
    }
    return request<PxmartCandidateResult>(`/api/prices/simplemart/candidates?${query.toString()}`, 'GET');
  },
};

function priceRecordToApi(row: DbRow): PriceRecord {
  return {
    id: String(row.id),
    channel: row.channel,
    itemName: row.item_name,
    normName: row.norm_name,
    price: row.price,
    unit: row.unit,
    sourceUrl: row.source_url,
    crawledAt: row.crawled_at,
  };
}

function notificationToApi(row: DbRow): AppNotification {
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

export const notificationsApi = {
  list: async (): Promise<AppNotification[]> => {
    const userId = currentUserId();
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    handleSupabaseError(error, 'Unable to load notifications.');
    return (data || []).map(notificationToApi);
  },
  syncExpiry: () =>
    request<{ created: number; notifications: AppNotification[] }>('/api/notifications/sync-expiry', 'POST', {}),
  markRead: async (id: string): Promise<AppNotification> => {
    const userId = currentUserId();
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    handleSupabaseError(error, 'Unable to mark notification as read.');
    return notificationToApi(requireRow(data, 'Notification not found.'));
  },
};

export const recipesApi = {
  list: async (): Promise<SharedRecipe[]> => {
    const userId = currentUserId();
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .or(`is_public.eq.true,author_id.eq.${userId}`)
      .order('created_at', { ascending: false });
    handleSupabaseError(error, 'Unable to load recipes.');
    return Promise.all((data || []).map(row => recipeToApi(row, userId)));
  },
  create: async (input: RecipeInput): Promise<SharedRecipe> => {
    const userId = currentUserId();
    const { data, error } = await supabase
      .from('recipes')
      .insert(recipeFromApi(input, userId))
      .select('*')
      .single();
    handleSupabaseError(error, 'Unable to create recipe.');
    await replaceRecipeChildren(Number(data.id), input);
    return recipeToApi(data, userId);
  },
  update: async (id: string, input: RecipeInput): Promise<SharedRecipe> => {
    const userId = currentUserId();
    const { data, error } = await supabase
      .from('recipes')
      .update(recipeFromApi(input))
      .eq('id', id)
      .eq('author_id', userId)
      .select('*')
      .maybeSingle();
    handleSupabaseError(error, 'Unable to update recipe.');
    const row = requireRow(data, 'Recipe not found.');
    await replaceRecipeChildren(Number(id), input);
    return recipeToApi(row, userId);
  },
  remove: async (id: string) => {
    const userId = currentUserId();
    const { error } = await supabase
      .from('recipes')
      .delete()
      .eq('id', id)
      .eq('author_id', userId);
    handleSupabaseError(error, 'Unable to delete recipe.');
    return { deleted: true };
  },
  toggleLike: (id: string) => toggleRecipeJoin('recipe_likes', id),
  toggleSave: (id: string) => toggleRecipeJoin('recipe_saves', id),
};

function recipeFromApi(input: RecipeInput, userId?: number): DbRow {
  const name = String(input.name || '').trim();
  if (!name) throw new ApiError('Recipe name is required.', 400);
  return {
    ...(userId ? { author_id: userId } : {}),
    name: name.slice(0, 100),
    description: String(input.description || '').trim(),
    full_content: String(input.fullContent || '').trim(),
    image_url: String(input.image || '').trim(),
    prep_time: Math.max(0, toInt(input.prepTime ?? 0, 'prepTime')),
    rating: 5,
    origin: input.origin === 'ai' ? 'ai' : 'manual',
    is_public: Boolean(input.isPublic),
    tags: JSON.stringify(Array.isArray(input.tags) ? input.tags : []),
  };
}

async function replaceRecipeChildren(recipeId: number, input: RecipeInput) {
  await Promise.all([
    supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId),
    supabase.from('recipe_steps').delete().eq('recipe_id', recipeId),
  ]);
  const ingredients = Array.isArray(input.ingredients) ? input.ingredients.map(String).filter(Boolean) : [];
  const steps = Array.isArray(input.steps) ? input.steps.map(String).filter(Boolean) : [];
  if (ingredients.length > 0) {
    const { error } = await supabase
      .from('recipe_ingredients')
      .insert(ingredients.map((name, index) => ({ recipe_id: recipeId, ord: index + 1, name })));
    handleSupabaseError(error, 'Unable to save recipe ingredients.');
  }
  if (steps.length > 0) {
    const { error } = await supabase
      .from('recipe_steps')
      .insert(steps.map((content, index) => ({ recipe_id: recipeId, step_no: index + 1, content })));
    handleSupabaseError(error, 'Unable to save recipe steps.');
  }
}

async function recipeToApi(row: DbRow, userId: number): Promise<SharedRecipe> {
  const [authorResult, ingredientResult, stepResult, likesResult, likedResult, savedResult] = await Promise.all([
    supabase.from('users').select('id, username, chef_name').eq('id', row.author_id).maybeSingle(),
    supabase.from('recipe_ingredients').select('name').eq('recipe_id', row.id).order('ord', { ascending: true }),
    supabase.from('recipe_steps').select('content').eq('recipe_id', row.id).order('step_no', { ascending: true }),
    supabase.from('recipe_likes').select('user_id').eq('recipe_id', row.id),
    supabase.from('recipe_likes').select('user_id').eq('recipe_id', row.id).eq('user_id', userId).maybeSingle(),
    supabase.from('recipe_saves').select('user_id').eq('recipe_id', row.id).eq('user_id', userId).maybeSingle(),
  ]);
  [
    authorResult.error,
    ingredientResult.error,
    stepResult.error,
    likesResult.error,
    likedResult.error,
    savedResult.error,
  ].forEach(error => handleSupabaseError(error, 'Unable to load recipe details.'));

  const author = (authorResult.data || {}) as DbRow;
  const chefName = author.chef_name || author.username || 'Chef';
  return {
    id: String(row.id),
    name: row.name,
    description: row.description || '',
    fullContent: row.full_content || '',
    image: row.image_url || '',
    prepTime: row.prep_time || 0,
    tags: parseJson<string[]>(row.tags, []),
    author: {
      id: String(row.author_id),
      name: chefName,
      avatar: String(chefName).slice(0, 1).toUpperCase(),
      verified: true,
      recipeCount: 0,
    },
    rating: Number(row.rating || 0),
    createdAt: String(row.created_at || '').slice(0, 10),
    ingredients: (ingredientResult.data || []).map(item => item.name),
    steps: (stepResult.data || []).map(item => item.content),
    owner: Number(row.author_id) === userId ? 'me' : 'community',
    isPublic: Boolean(row.is_public),
    origin: row.origin || 'manual',
    likes: likesResult.data?.length || 0,
    liked: Boolean(likedResult.data),
    saved: Boolean(savedResult.data),
  };
}

async function toggleRecipeJoin(table: 'recipe_likes' | 'recipe_saves', recipeId: string) {
  const userId = currentUserId();
  const { data: existing, error: existingError } = await supabase
    .from(table)
    .select('user_id')
    .eq('user_id', userId)
    .eq('recipe_id', recipeId)
    .maybeSingle();
  handleSupabaseError(existingError, 'Unable to load recipe interaction.');

  if (existing) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId).eq('recipe_id', recipeId);
    handleSupabaseError(error, 'Unable to remove recipe interaction.');
  } else {
    const { error } = await supabase.from(table).insert({ user_id: userId, recipe_id: Number(recipeId) });
    handleSupabaseError(error, 'Unable to save recipe interaction.');
  }

  const [likes, liked, saved] = await Promise.all([
    supabase.from('recipe_likes').select('user_id').eq('recipe_id', recipeId),
    supabase.from('recipe_likes').select('user_id').eq('recipe_id', recipeId).eq('user_id', userId).maybeSingle(),
    supabase.from('recipe_saves').select('user_id').eq('recipe_id', recipeId).eq('user_id', userId).maybeSingle(),
  ]);
  [likes.error, liked.error, saved.error].forEach(error => handleSupabaseError(error, 'Unable to load recipe stats.'));
  return {
    likes: likes.data?.length || 0,
    liked: Boolean(liked.data),
    saved: Boolean(saved.data),
  };
}

export const followsApi = {
  list: async (): Promise<string[]> => {
    const userId = currentUserId();
    const { data, error } = await supabase
      .from('follows')
      .select('followed_id')
      .eq('follower_id', userId);
    handleSupabaseError(error, 'Unable to load follows.');
    return (data || []).map(row => String(row.followed_id));
  },
  follow: async (followedId: string): Promise<string[]> => {
    const userId = currentUserId();
    const targetId = Number(followedId);
    if (!targetId || targetId === userId) throw new ApiError('Invalid followed user.', 400);
    const { error } = await supabase
      .from('follows')
      .upsert({ follower_id: userId, followed_id: targetId }, { onConflict: 'follower_id,followed_id' });
    handleSupabaseError(error, 'Unable to follow user.');
    return followsApi.list();
  },
  unfollow: async (followedId: string): Promise<string[]> => {
    const userId = currentUserId();
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', userId)
      .eq('followed_id', Number(followedId));
    handleSupabaseError(error, 'Unable to unfollow user.');
    return followsApi.list();
  },
};

export const userStateApi = {
  get: async <T>(key: string): Promise<{ key: string; value: T | null }> => {
    const userId = currentUserId();
    const { data, error } = await supabase
      .from('user_state_entries')
      .select('value_json')
      .eq('user_id', userId)
      .eq('state_key', key)
      .maybeSingle();
    handleSupabaseError(error, 'Unable to load user state.');
    return { key, value: data ? parseJson<T | null>(data.value_json, null) : null };
  },
  getMany: async <T extends Record<string, unknown>>(keys: string[]): Promise<Partial<T>> => {
    const userId = currentUserId();
    if (keys.length === 0) return {};
    const { data, error } = await supabase
      .from('user_state_entries')
      .select('state_key, value_json')
      .eq('user_id', userId)
      .in('state_key', keys);
    handleSupabaseError(error, 'Unable to load user states.');
    return (data || []).reduce((acc, row) => {
      (acc as Record<string, unknown>)[row.state_key] = parseJson(row.value_json, null);
      return acc;
    }, {} as Partial<T>);
  },
  set: async <T>(key: string, value: T): Promise<{ key: string; value: T }> => {
    const userId = currentUserId();
    const { error } = await supabase
      .from('user_state_entries')
      .upsert(
        { user_id: userId, state_key: key, value_json: JSON.stringify(value) },
        { onConflict: 'user_id,state_key' },
      );
    handleSupabaseError(error, 'Unable to save user state.');
    return { key, value };
  },
  remove: async (key: string) => {
    const userId = currentUserId();
    const { data, error } = await supabase
      .from('user_state_entries')
      .delete()
      .eq('user_id', userId)
      .eq('state_key', key)
      .select('state_key');
    handleSupabaseError(error, 'Unable to delete user state.');
    return { deleted: Boolean(data?.length) };
  },
};

export interface AiRecipe {
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
  cookingMethod?: string;
}

export const plannerApi = {
  generate: (params: {
    specifiedIngredients?: string[];
    excludeAllergens?: string[];
    excludeDiseases?: { label: string; note?: string }[];
    avoidCookingStyles?: string[];
    regenerate?: { slotIndex: number; excludeCookingStyle?: string };
  }) =>
    request<{ recipes: AiRecipe[] }>('/api/recipes/generate', 'POST', params),

  generateImage: (params: { title: string; description: string }) =>
    request<{ imageData: string }>('/api/planner/image', 'POST', params),
};
