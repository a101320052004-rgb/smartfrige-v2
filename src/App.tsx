/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FoodCategory, Ingredient, ShoppingItem, ThemeKey } from './types';
import { authApi, ingredientsApi, notificationsApi, settingsApi, shoppingApi, type AppNotification, type ShoppingItemInput, type UserSettings } from './lib/api';
import { INITIAL_INGREDIENTS } from './data';
import DashboardView from './components/DashboardView';
import PlannerView from './components/PlannerView';
import ShoppingView from './components/ShoppingView';
import SettingsView from './components/SettingsView';
import CommunityView from './components/CommunityView';
import TourOverlay from './components/TourOverlay';
import AuthScreen from './components/AuthScreen';
import { getChefTier, getUserOriginalRecipeCount } from './lib/chefTier';
import {
  Refrigerator, Calendar, ShoppingCart, Settings, Search,
  ChevronLeft, ChevronRight, LogOut, HelpCircle, User, MapPin, Sparkles, Bell, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const logoImage = new URL('../assets/logo-mark-transparent.png', import.meta.url).href;

// ─── Theme class definitions ───────────────────────────────────────────────
const TC: Record<ThemeKey, {
  sidebarBg: string;
  sidebarBorder: string;
  brandIconBg: string;
  brandIconBorder: string;
  brandIconColor: string;
  brandTitle: string;
  brandSub: string;
  chevronBtn: string;
  navActive: string;
  navInactive: string;
  navActiveIcon: string;
  userAvatar: string;
  userLabel: string;
  logoutBtn: string;
  mobileNavActive: string;
  mobileNavIndicator: string;
  headerBtn: string;
  searchRing: string;
  appBg: string;
}> = {
  emerald: {
    sidebarBg:       'bg-emerald-950',
    sidebarBorder:   'border-emerald-800',
    brandIconBg:     'bg-emerald-800/80',
    brandIconBorder: 'border-emerald-700',
    brandIconColor:  'text-emerald-300 animate-pulse',
    brandTitle:      'text-emerald-100',
    brandSub:        'text-emerald-400',
    chevronBtn:      'bg-emerald-900 hover:bg-emerald-800 text-emerald-300 border-emerald-800 hover:text-white',
    navActive:       'bg-emerald-800 text-white font-bold shadow-sm',
    navInactive:     'text-emerald-200/80 hover:bg-emerald-900/60 hover:text-white',
    navActiveIcon:   'text-emerald-300',
    userAvatar:      'bg-emerald-800 border-emerald-700 text-emerald-300',
    userLabel:       'text-emerald-400',
    logoutBtn:       'text-emerald-300 hover:text-white hover:bg-emerald-900/60',
    mobileNavActive:    'text-emerald-700',
    mobileNavIndicator: 'bg-emerald-600',
    headerBtn:   'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200',
    searchRing:  'focus:ring-emerald-800',
    appBg:       'bg-white',
  },
  teal: {
    sidebarBg:       'bg-[#0c3547]',
    sidebarBorder:   'border-[#1a5c78]',
    brandIconBg:     'bg-[#155e7a]/80',
    brandIconBorder: 'border-[#1d7595]',
    brandIconColor:  'text-[#7ec8dc] animate-pulse',
    brandTitle:      'text-[#d9eff5]',
    brandSub:        'text-[#7ec8dc]',
    chevronBtn:      'bg-[#0f4560] hover:bg-[#155e7a] text-[#7ec8dc] border-[#1a5c78] hover:text-white',
    navActive:       'bg-[#155e7a] text-white font-bold shadow-sm',
    navInactive:     'text-[#b3dfe9]/80 hover:bg-[#0f4560]/60 hover:text-white',
    navActiveIcon:   'text-[#7ec8dc]',
    userAvatar:      'bg-[#155e7a] border-[#1d7595] text-[#7ec8dc]',
    userLabel:       'text-[#7ec8dc]',
    logoutBtn:       'text-[#7ec8dc] hover:text-white hover:bg-[#0f4560]/60',
    mobileNavActive:    'text-[#1d7595]',
    mobileNavIndicator: 'bg-[#2a8aab]',
    headerBtn:   'bg-[#eef7fb] hover:bg-[#d9eff5] text-[#0c3547] border-[#b3dfe9]',
    searchRing:  'focus:ring-[#1d7595]',
    appBg:       'bg-white',
  },
  charcoal: {
    sidebarBg:       'bg-slate-800',
    sidebarBorder:   'border-slate-700',
    brandIconBg:     'bg-slate-700/80',
    brandIconBorder: 'border-slate-600',
    brandIconColor:  'text-slate-300 animate-pulse',
    brandTitle:      'text-slate-100',
    brandSub:        'text-slate-400',
    chevronBtn:      'bg-slate-700 hover:bg-slate-600 text-slate-300 border-slate-600 hover:text-white',
    navActive:       'bg-slate-700 text-white font-bold shadow-sm',
    navInactive:     'text-slate-300/80 hover:bg-slate-700/60 hover:text-white',
    navActiveIcon:   'text-slate-300',
    userAvatar:      'bg-slate-700 border-slate-600 text-slate-300',
    userLabel:       'text-slate-400',
    logoutBtn:       'text-slate-300 hover:text-white hover:bg-slate-700/60',
    mobileNavActive:    'text-slate-600',
    mobileNavIndicator: 'bg-slate-500',
    headerBtn:   'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200',
    searchRing:  'focus:ring-slate-500',
    appBg:       'bg-white',
  },
  sky: {
    sidebarBg:       'bg-white',
    sidebarBorder:   'border-sky-200',
    brandIconBg:     'bg-sky-100',
    brandIconBorder: 'border-sky-200',
    brandIconColor:  'text-sky-600 animate-pulse',
    brandTitle:      'text-slate-800',
    brandSub:        'text-sky-500',
    chevronBtn:      'bg-sky-100 hover:bg-sky-200 text-sky-700 border-sky-200 hover:text-sky-900',
    navActive:       'bg-sky-500 text-white font-bold shadow-sm',
    navInactive:     'text-slate-600 hover:bg-sky-50 hover:text-slate-900',
    navActiveIcon:   'text-sky-100',
    userAvatar:      'bg-sky-100 border-sky-200 text-sky-700',
    userLabel:       'text-sky-500',
    logoutBtn:       'text-slate-500 hover:text-slate-800 hover:bg-sky-50',
    mobileNavActive:    'text-sky-600',
    mobileNavIndicator: 'bg-sky-500',
    headerBtn:   'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200',
    searchRing:  'focus:ring-sky-500',
    appBg:       'bg-sky-50',
  },
  brown: {
    sidebarBg:       'bg-[#5b3a2e]',
    sidebarBorder:   'border-[#7a5442]',
    brandIconBg:     'bg-[#7a5442]/80',
    brandIconBorder: 'border-[#a77f63]',
    brandIconColor:  'text-[#ead8c5] animate-pulse',
    brandTitle:      'text-[#fff8ef]',
    brandSub:        'text-[#ead8c5]',
    chevronBtn:      'bg-[#7a5442] hover:bg-[#8f664f] text-[#ead8c5] border-[#a77f63] hover:text-white',
    navActive:       'bg-[#9a6b4f] text-white font-bold shadow-sm',
    navInactive:     'text-[#fff3e4]/85 hover:bg-[#7a5442]/70 hover:text-white',
    navActiveIcon:   'text-[#fff3e4]',
    userAvatar:      'bg-[#9a6b4f] border-[#c39a76] text-[#fff3e4]',
    userLabel:       'text-[#ead8c5]',
    logoutBtn:       'text-[#fff3e4] hover:text-white hover:bg-[#7a5442]/70',
    mobileNavActive:    'text-[#8f664f]',
    mobileNavIndicator: 'bg-[#9a6b4f]',
    headerBtn:   'bg-[#fbf5ee] hover:bg-[#ead8c5] text-[#5b3a2e] border-[#e8d6c4]',
    searchRing:  'focus:ring-[#9a6b4f]',
    appBg:       'bg-[#fbf5ee]',
  },
  rose: {
    sidebarBg:       'bg-[#fff7fa]',
    sidebarBorder:   'border-[#fde2ea]',
    brandIconBg:     'bg-[#fff0f5]',
    brandIconBorder: 'border-[#fbd5e1]',
    brandIconColor:  'text-[#d988a1] animate-pulse',
    brandTitle:      'text-[#8a5262]',
    brandSub:        'text-[#d988a1]',
    chevronBtn:      'bg-[#fff0f5] hover:bg-[#fde2ea] text-[#ad6a7f] border-[#fbd5e1] hover:text-[#8a5262]',
    navActive:       'bg-[#f4adc1] text-white font-bold shadow-sm',
    navInactive:     'text-[#9f6475] hover:bg-[#fff0f5] hover:text-[#8a5262]',
    navActiveIcon:   'text-white',
    userAvatar:      'bg-[#fff0f5] border-[#fbd5e1] text-[#ad6a7f]',
    userLabel:       'text-[#d988a1]',
    logoutBtn:       'text-[#9f6475] hover:text-[#8a5262] hover:bg-[#fff0f5]',
    mobileNavActive:    'text-[#ad6a7f]',
    mobileNavIndicator: 'bg-[#f4adc1]',
    headerBtn:   'bg-[#fff7fa] hover:bg-[#fff0f5] text-[#ad6a7f] border-[#fde2ea]',
    searchRing:  'focus:ring-[#f4adc1]',
    appBg:       'bg-[#fff9fb]',
  },
};

const THEME_VARS: Record<ThemeKey, React.CSSProperties> = {
  brown: {
    '--theme-dark': '#5b3a2e',
    '--theme-main': '#9a6b4f',
    '--theme-soft': '#e8d6c4',
    '--theme-tint': '#fbf5ee',
    '--theme-text': '#5b3a2e',
  } as React.CSSProperties,
  emerald: {
    '--theme-dark': '#022c22',
    '--theme-main': '#065f46',
    '--theme-soft': '#d1fae5',
    '--theme-tint': '#ecfdf5',
    '--theme-text': '#064e3b',
  } as React.CSSProperties,
  teal: {
    '--theme-dark': '#0c3547',
    '--theme-main': '#155e7a',
    '--theme-soft': '#d9eff5',
    '--theme-tint': '#eef7fb',
    '--theme-text': '#0c3547',
  } as React.CSSProperties,
  charcoal: {
    '--theme-dark': '#334155',
    '--theme-main': '#475569',
    '--theme-soft': '#e2e8f0',
    '--theme-tint': '#f8fafc',
    '--theme-text': '#334155',
  } as React.CSSProperties,
  sky: {
    '--theme-dark': '#0f172a',
    '--theme-main': '#38bdf8',
    '--theme-soft': '#bae6fd',
    '--theme-tint': '#f0f9ff',
    '--theme-text': '#0369a1',
  } as React.CSSProperties,
  rose: {
    '--theme-dark': '#ad6a7f',
    '--theme-main': '#f4adc1',
    '--theme-soft': '#fde2ea',
    '--theme-tint': '#fff7fa',
    '--theme-text': '#9f6475',
  } as React.CSSProperties,
};

const THEME_KEYS: ThemeKey[] = ['brown', 'emerald', 'teal', 'charcoal', 'sky', 'rose'];
const DEFAULT_EXPIRY_REMINDER_DAYS = 3;
const NOTIFICATION_POLL_MS = 3 * 60 * 60 * 1000;
const FOOD_CATEGORY_LABELS: Record<FoodCategory, string> = {
  grains: '全榖雜糧類',
  vegetables: '蔬菜類',
  protein: '豆魚蛋肉類',
  dairy: '乳品類',
  fruits: '水果類',
  fats: '油脂與堅果種子類',
  other: '其他',
};

const getShoppingUnitFromIngredientQty = (qty: string) => {
  const parts = qty.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : '份';
};

const getSuggestedShoppingPrice = (category: FoodCategory) => {
  const basePriceMap: Record<FoodCategory, { px: number; carrefour: number }> = {
    grains: { px: 109, carrefour: 105 },
    vegetables: { px: 118, carrefour: 125 },
    protein: { px: 249, carrefour: 258 },
    dairy: { px: 92, carrefour: 89 },
    fruits: { px: 149, carrefour: 158 },
    fats: { px: 135, carrefour: 142 },
    other: { px: 79, carrefour: 85 },
  };
  return basePriceMap[category];
};

const isUserDrivenShoppingItem = (item: ShoppingItem) =>
  item.source === 'manual' ||
  item.source === 'restock' ||
  item.id.startsWith('shop-custom-') ||
  item.id.startsWith('shop-restock-');

export default function App() {
  // Authentication & Onboarding states
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [chefName, setChefName] = useState('頂級大廚');
  // 使用者自己的主廚等級（依自己公開分享的食譜數量，與社群頁同一套規則）
  const userChefTier = getChefTier(getUserOriginalRecipeCount());
  const [isTourOpen, setIsTourOpen] = useState(false);

  const [theme, setTheme] = useState<ThemeKey>('sky');
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>(() => {
    const saved = localStorage.getItem('smartfridge:fontSize') as 'sm' | 'md' | 'lg' | null;
    return saved ?? 'md';
  });
  const [expiryReminderDays, setExpiryReminderDays] = useState(DEFAULT_EXPIRY_REMINDER_DAYS);
  const [expiryPushTime, setExpiryPushTime] = useState('09:00');
  const [restockDefaultsSet, setRestockDefaultsSet] = useState(false);
  const [inventoryLoaded, setInventoryLoaded] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const handleThemeChange = (t: ThemeKey) => {
    setTheme(t);
    settingsApi.update({ theme: t }).catch(err => console.error('同步主題設定失敗：', err));
  };

  const handleFontSizeChange = (size: 'sm' | 'md' | 'lg') => {
    setFontSize(size);
    localStorage.setItem('smartfridge:fontSize', size);
  };

  useEffect(() => {
    const sizeMap = { sm: '14px', md: '16px', lg: '18px' };
    document.documentElement.style.fontSize = sizeMap[fontSize];
  }, [fontSize]);

  // Core App states
  const [currentView, setCurrentView] = useState<'dashboard' | 'planner' | 'shopping' | 'community' | 'settings'>(() => {
    const saved = sessionStorage.getItem('smartfridge:lastView');
    const valid = ['dashboard', 'planner', 'shopping', 'community', 'settings'];
    return (valid.includes(saved ?? '') ? saved : 'dashboard') as 'dashboard' | 'planner' | 'shopping' | 'community' | 'settings';
  });
  const [ingredients, setIngredients] = useState<Ingredient[]>(INITIAL_INGREDIENTS);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [notificationToast, setNotificationToast] = useState<AppNotification | null>(null);
  const [notificationQueue, setNotificationQueue] = useState<AppNotification[]>([]);
  const shownNotificationIdsRef = useRef<Set<string>>(new Set());
  const [restockReminderIds, setRestockReminderIds] = useState<Set<string>>(
    () => new Set(INITIAL_INGREDIENTS.map(ingredient => ingredient.id))
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const navigateTo = (view: typeof currentView) => {
    if (view === 'dashboard' && currentView !== 'dashboard') {
      setSearchQuery('');
    }
    setCurrentView(view);
    sessionStorage.setItem('smartfridge:lastView', view);
  };

  const t = TC[theme];

  const applyUserSettings = (settings: UserSettings) => {
    setChefName(settings.chefName || '頂級大廚');
    if (THEME_KEYS.includes(settings.theme)) {
      setTheme(settings.theme);
    }
    setExpiryReminderDays(settings.expiryReminderDays || DEFAULT_EXPIRY_REMINDER_DAYS);
    setExpiryPushTime(settings.expiryPushTime || '09:00');
    setRestockDefaultsSet(settings.restockDefaultsSet);
    setRestockReminderIds(new Set<string>(settings.restockReminderIds || []));
  };

  const persistSettings = (patch: Partial<UserSettings>) => {
    settingsApi.update(patch).catch(err => console.error('同步使用者設定失敗：', err));
  };

  // 啟動時自動還原登入狀態（防止手機下拉重整後跳回登入頁）
  // 若使用者主動點過「登出」，localStorage 有旗標 → 跳過還原，維持登入頁
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const isPasswordRecovery =
      searchParams.get('reset') === '1' ||
      searchParams.get('type') === 'recovery' ||
      hashParams.get('type') === 'recovery';
    if (isPasswordRecovery) {
      setIsCheckingSession(false);
      return;
    }

    const intentionalLogout = localStorage.getItem('smartfridge:loggedOut') === '1';
    if (intentionalLogout) {
      localStorage.removeItem('smartfridge:loggedOut');
      authApi.logout().catch(() => {}); // 清掉 Supabase session，避免登出後重整又還原
      setIsCheckingSession(false);
      return;
    }
    authApi.me()
      .then(user => {
        if (user.mustSetPassword) {
          return;
        }
        const name = (user.chefName || user.username || '頂級大廚').slice(0, 15);
        setChefName(name);
        setIsLoggedIn(true);
      })
      .catch(() => { /* 無可用 session，正常顯示登入頁 */ })
      .finally(() => setIsCheckingSession(false));
  }, []);

  const markNotificationRead = async (id: string) => {
    const updated = await notificationsApi.markRead(id);
    setNotifications(prev => prev.map(item => item.id === id ? updated : item));
  };

  const markAllNotificationsRead = async () => {
    const unread = notifications.filter(item => !item.isRead);
    const updated = await Promise.all(unread.map(item => notificationsApi.markRead(item.id)));
    const byId = new Map(updated.map(item => [item.id, item]));
    setNotifications(prev => prev.map(item => byId.get(item.id) || item));
  };

  const shoppingItemToInput = (item: ShoppingItem): ShoppingItemInput => ({
    name: item.name,
    category: item.category,
    qty: item.qty,
    unit: item.unit,
    pricePX: item.pricePX,
    priceCarrefour: item.priceCarrefour,
    source: item.source,
    linkedIngredientId: item.linkedIngredientId,
  });

  // Handle first time load and auto-tour trigger
  const handleAuthSuccess = (selectedName: string, isRegisterMode: boolean) => {
    setChefName(selectedName);
    setSettingsLoaded(false);
    setNotifications([]);
    setIsNotificationPanelOpen(false);
    setNotificationToast(null);
    setNotificationQueue([]);
    shownNotificationIdsRef.current.clear();
    setIsLoggedIn(true);
    localStorage.removeItem('smartfridge:loggedOut'); // 登入成功，清掉登出旗標
    if (isRegisterMode) {
      persistSettings({ tourSeen: true });
      setTimeout(() => setIsTourOpen(true), 800);
    }
  };

  const handleLogout = () => {
    setNotificationToast(null);
    setNotifications([]);
    setIsNotificationPanelOpen(false);
    setNotificationQueue([]);
    shownNotificationIdsRef.current.clear();
    setIsLoggedIn(false);
    sessionStorage.removeItem('smartfridge:lastView');
    localStorage.setItem('smartfridge:loggedOut', '1'); // 主動登出旗標：告訴下次重整不要還原 session
    authApi.logout().catch(() => {});
  };

  const handleChefNameChange = (nextName: string) => {
    setChefName(nextName);
    persistSettings({ chefName: nextName });
  };

  const handleExpiryReminderDaysChange = (days: number) => {
    setExpiryReminderDays(days);
    persistSettings({ expiryReminderDays: days });
  };

  const handleExpiryPushTimeChange = (time: string) => {
    setExpiryPushTime(time);
    persistSettings({ expiryPushTime: time });
  };

  const loadUnreadNotifications = useCallback(async () => {
    await notificationsApi.syncExpiry();
    const notifications = await notificationsApi.list();
    setNotifications(notifications);
    const unread = notifications.filter(item => !item.isRead && item.type !== 'recipe');
    const nextToasts = unread.filter(item => !shownNotificationIdsRef.current.has(item.id));
    if (nextToasts.length === 0) return;

    nextToasts.forEach(item => shownNotificationIdsRef.current.add(item.id));
    setNotificationQueue(prev => [...prev, ...nextToasts]);
  }, []);

  // 登入後，透過 src/lib/api.ts 從 Supabase 載入使用者食材。
  // AI、圖片辨識與比價仍經由 Vercel /api routes，由 serverless-handler.ts 處理。
  //    這是「前端頁面接 API」的標準範例，其他頁面（採購、社群…）照這個模式做：
  //    1) 用 lib/api.ts 的 xxxApi.list()  2) 成功就 set 進 state  3) 失敗印 log 不讓畫面壞掉
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    setInventoryLoaded(false);
    ingredientsApi
      .list()
      .then(items => {
        if (!cancelled) {
          setIngredients(items);
          setInventoryLoaded(true);
        }
      })
      .catch(err => {
        console.error('載入食材失敗，暫用本地資料：', err);
        if (!cancelled) setInventoryLoaded(true);
      });
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !settingsLoaded) return;
    loadUnreadNotifications().catch(err => console.error('讀取通知失敗：', err));
    const interval = window.setInterval(() => {
      loadUnreadNotifications().catch(err => console.error('讀取通知失敗：', err));
    }, NOTIFICATION_POLL_MS);
    return () => window.clearInterval(interval);
  }, [isLoggedIn, settingsLoaded, loadUnreadNotifications]);

  useEffect(() => {
    if (notificationToast || notificationQueue.length === 0) return;
    const [next, ...rest] = notificationQueue;
    setNotificationToast(next);
    setNotificationQueue(rest);
  }, [notificationToast, notificationQueue]);

  useEffect(() => {
    if (!notificationToast) return;
    const timeout = window.setTimeout(() => setNotificationToast(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [notificationToast]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    setSettingsLoaded(false);
    settingsApi
      .get()
      .then(settings => {
        if (!cancelled) {
          applyUserSettings(settings);
          setSettingsLoaded(true);
        }
      })
      .catch(err => {
        console.error('載入使用者設定失敗：', err);
        if (!cancelled) setSettingsLoaded(true);
      });
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    shoppingApi
      .list()
      .then(items => {
        if (!cancelled) setShoppingItems(items.filter(isUserDrivenShoppingItem));
      })
      .catch(err => console.error('讀取採購清單失敗：', err));
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !inventoryLoaded || !settingsLoaded) return;
    notificationsApi
      .syncExpiry()
      .catch(err => console.error('同步即期通知失敗：', err));
  }, [ingredients, inventoryLoaded, isLoggedIn, settingsLoaded, expiryReminderDays]);

  useEffect(() => {
    if (!isLoggedIn || !inventoryLoaded || !settingsLoaded) return;
    const timeout = window.setTimeout(() => {
      loadUnreadNotifications().catch(err => console.error('讀取通知失敗：', err));
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [ingredients, inventoryLoaded, isLoggedIn, settingsLoaded, expiryReminderDays, loadUnreadNotifications]);

  useEffect(() => {
    const validIds = new Set(ingredients.map(ingredient => ingredient.id));

    setRestockReminderIds(prev => {
      const next = new Set([...prev].filter(id => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });

    setShoppingItems(prev => prev.filter(item => {
      if (item.source !== 'restock' || !item.linkedIngredientId) return true;
      return validIds.has(item.linkedIngredientId);
    }));
  }, [ingredients]);

  useEffect(() => {
    if (!isLoggedIn || !inventoryLoaded || !settingsLoaded || restockDefaultsSet) return;
    const allIngredientIds = ingredients.map(ingredient => ingredient.id);
    setRestockDefaultsSet(true);
    setRestockReminderIds(new Set(allIngredientIds));
    persistSettings({
      restockDefaultsSet: true,
      restockReminderIds: allIngredientIds,
    });
    Promise.all(ingredients.map(ingredient => shoppingApi.create(shoppingItemToInput(buildRestockShoppingItem(ingredient)))))
      .then(created => {
        setShoppingItems(prev => [
          ...created,
          ...prev.filter(item => item.source !== 'restock'),
        ]);
      })
      .catch(err => console.error('建立預設補貨採購項目失敗：', err));
  }, [ingredients, inventoryLoaded, isLoggedIn, restockDefaultsSet, settingsLoaded]);

  useEffect(() => {
    if (!isLoggedIn || !inventoryLoaded || !settingsLoaded) return;
    const existingRestockIngredientIds = new Set(
      shoppingItems
        .filter(item => item.source === 'restock' && item.linkedIngredientId)
        .map(item => item.linkedIngredientId)
    );
    const missingIngredients = ingredients.filter(
      ingredient => restockReminderIds.has(ingredient.id) && !existingRestockIngredientIds.has(ingredient.id)
    );
    if (missingIngredients.length === 0) return;

    Promise.all(missingIngredients.map(ingredient => shoppingApi.create(shoppingItemToInput(buildRestockShoppingItem(ingredient)))))
      .then(created => {
        setShoppingItems(prev => [
          ...created,
          ...prev.filter(item => !created.some(createdItem => (
            createdItem.source === 'restock' &&
            createdItem.linkedIngredientId &&
            createdItem.linkedIngredientId === item.linkedIngredientId
          ))),
        ]);
      })
      .catch(err => console.error('同步補貨採購項目失敗：', err));
  }, [ingredients, inventoryLoaded, isLoggedIn, restockReminderIds, settingsLoaded, shoppingItems]);

  const removeLinkedRestockItem = (ingredientId: string) => {
    setRestockReminderIds(prev => {
      if (!prev.has(ingredientId)) return prev;
      const next = new Set<string>(prev);
      next.delete(ingredientId);
      setRestockDefaultsSet(true);
      persistSettings({ restockDefaultsSet: true, restockReminderIds: [...next] });
      return next;
    });
    setShoppingItems(prev => prev.filter(item => !(item.source === 'restock' && item.linkedIngredientId === ingredientId)));
    shoppingApi.removeRestockByIngredient(ingredientId).catch(err => console.error('刪除補貨採購項目失敗：', err));
  };

  const toggleRestockReminder = (ingredient: Ingredient) => {
    const nextEnabled = !restockReminderIds.has(ingredient.id);

    setRestockReminderIds(prev => {
      const next = new Set<string>(prev);
      if (nextEnabled) next.add(ingredient.id);
      else next.delete(ingredient.id);
      setRestockDefaultsSet(true);
      persistSettings({ restockDefaultsSet: true, restockReminderIds: [...next] });
      return next;
    });

    setShoppingItems(prev => {
      const filtered = prev.filter(item => !(item.source === 'restock' && item.linkedIngredientId === ingredient.id));
      if (!nextEnabled) return filtered;

      const price = getSuggestedShoppingPrice(ingredient.category);
      const autoShoppingItem: ShoppingItem = {
        id: `shop-restock-${ingredient.id}`,
        linkedIngredientId: ingredient.id,
        source: 'restock',
        name: ingredient.name,
        category: FOOD_CATEGORY_LABELS[ingredient.category],
        qty: 1,
        unit: getShoppingUnitFromIngredientQty(ingredient.qty),
        pricePX: price.px,
        priceCarrefour: price.carrefour,
        image: ingredient.image,
      };

      return [autoShoppingItem, ...filtered];
    });

    if (nextEnabled) {
      const pendingItem = buildRestockShoppingItem(ingredient);
      shoppingApi.create(shoppingItemToInput(pendingItem))
        .then(created => {
          setShoppingItems(prev => [
            created,
            ...prev.filter(item => !(item.source === 'restock' && item.linkedIngredientId === ingredient.id)),
          ]);
        })
        .catch(err => console.error('新增補貨採購項目失敗：', err));
    } else {
      shoppingApi.removeRestockByIngredient(ingredient.id).catch(err => console.error('刪除補貨採購項目失敗：', err));
    }
  };

  const buildRestockShoppingItem = (ingredient: Ingredient): ShoppingItem => {
    const price = getSuggestedShoppingPrice(ingredient.category);
    return {
      id: `shop-restock-${ingredient.id}`,
      linkedIngredientId: ingredient.id,
      source: 'restock',
      name: ingredient.name,
      category: FOOD_CATEGORY_LABELS[ingredient.category],
      qty: 1,
      unit: getShoppingUnitFromIngredientQty(ingredient.qty),
      pricePX: price.px,
      priceCarrefour: price.carrefour,
      image: ingredient.image,
    };
  };

  const selectAllRestockReminders = () => {
    const allIds = ingredients.map(ingredient => ingredient.id);
    setRestockDefaultsSet(true);
    setRestockReminderIds(new Set(allIds));
    persistSettings({ restockDefaultsSet: true, restockReminderIds: allIds });
    setShoppingItems(prev => {
      const withoutRestock = prev.filter(item => item.source !== 'restock');
      return [...ingredients.map(buildRestockShoppingItem), ...withoutRestock];
    });
    Promise.all(ingredients.map(ingredient => shoppingApi.create(shoppingItemToInput(buildRestockShoppingItem(ingredient)))))
      .then(created => {
        setShoppingItems(prev => [
          ...created,
          ...prev.filter(item => item.source !== 'restock'),
        ]);
      })
      .catch(err => console.error('批次建立補貨採購項目失敗：', err));
  };

  const clearRestockReminders = () => {
    setRestockDefaultsSet(true);
    setRestockReminderIds(new Set());
    persistSettings({ restockDefaultsSet: true, restockReminderIds: [] });
    setShoppingItems(prev => prev.filter(item => item.source !== 'restock'));
    shoppingApi.removeAllRestock().catch(err => console.error('清除補貨採購項目失敗：', err));
  };

  const createShoppingItem = (item: ShoppingItem) => {
    setShoppingItems(prev => [...prev, item]);
    shoppingApi.create(shoppingItemToInput(item))
      .then(created => {
        setShoppingItems(prev => prev.map(existing => existing.id === item.id ? created : existing));
      })
      .catch(err => {
        console.error('新增採購項目失敗：', err);
        setShoppingItems(prev => prev.filter(existing => existing.id !== item.id));
      });
  };

  const deleteShoppingItem = (item: ShoppingItem) => {
    setShoppingItems(prev => prev.filter(existing => existing.id !== item.id));
    if (/^\d+$/.test(item.id)) {
      shoppingApi.remove(item.id).catch(err => console.error('刪除採購項目失敗：', err));
    }
  };

  const updateShoppingItemQty = (item: ShoppingItem, qty: number) => {
    if (/^\d+$/.test(item.id)) {
      shoppingApi.updateQty(item.id, qty).catch(err => console.error('更新採購數量失敗：', err));
    }
  };

  const handleRestartTour = () => setIsTourOpen(true);

  // Page title shown in mobile header
  const VIEW_LABELS: Record<string, string> = {
    dashboard: '我的食材庫',
    planner:   'AI 智慧配餐',
    shopping:  '智能採購清單',
    community: '主廚食譜社群',
    settings:  '個人設定',
  };

  const NAV_ITEMS = [
    { tag: 'dashboard', label: '我的食材庫', short: '庫存', desc: '保鮮庫存', icon: Refrigerator },
    { tag: 'planner',   label: 'AI 智慧配餐', short: '菜單', desc: '每日餐程', icon: Calendar },
    { tag: 'shopping',  label: '智能採購清單', short: '採購', desc: '補貨比價', icon: ShoppingCart },
    { tag: 'community', label: '主廚食譜社群', short: '社群', desc: '料理靈感', icon: Sparkles },
    { tag: 'settings',  label: '個人設定', short: '個人', desc: '暱稱主題', icon: Settings },
  ] as const;

  const unreadNotificationCount = notifications.filter(item => !item.isRead).length;
  const formatNotificationTime = (value: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('zh-TW', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      className={`h-screen overflow-hidden ${t.appBg} text-slate-800 flex font-sans antialiased selection:bg-[var(--theme-soft)] selection:text-[var(--theme-text)]`}
      style={THEME_VARS[theme]}
    >

      {/* 1. Gated Access welcome screen if not logged in */}
      {isCheckingSession ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-white">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--theme-soft)] border-t-[var(--theme-main)]" />
            <p className="text-sm font-semibold text-slate-400">載入中…</p>
          </div>
        </div>
      ) : !isLoggedIn && (
        <AuthScreen onSuccess={handleAuthSuccess} />
      )}

      <AnimatePresence>
        {notificationToast && (
          <motion.div
            initial={{ opacity: 0, y: -18, x: 18 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: -12, x: 12 }}
            className="fixed right-4 top-4 z-[220] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-[var(--theme-soft)] bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--theme-tint)] text-[var(--theme-text)]">
                <Bell className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-slate-900">{notificationToast.title}</p>
                {notificationToast.body && (
                  <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-500">{notificationToast.body}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setNotificationToast(null)}
                className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="關閉通知"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isLoggedIn && isNotificationPanelOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed right-4 top-16 z-[210] w-[min(25rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-extrabold text-slate-900">通知中心</p>
                <p className="text-xs text-slate-500">{unreadNotificationCount} 則未讀</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadUnreadNotifications().catch(err => console.error('同步通知失敗：', err))}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  重新整理
                </button>
                <button
                  type="button"
                  onClick={() => markAllNotificationsRead().catch(err => console.error('標記通知已讀失敗：', err))}
                  disabled={unreadNotificationCount === 0}
                  className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200"
                >
                  全部已讀
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm font-semibold text-slate-400">目前沒有通知</div>
              ) : (
                notifications.slice(0, 30).map(item => (
                  <div key={item.id} className={`border-b border-slate-100 px-4 py-3 ${item.isRead ? 'bg-white' : 'bg-[var(--theme-tint)]/60'}`}>
                    <div className="flex items-start gap-3">
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.isRead ? 'bg-slate-200' : 'bg-rose-400'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-extrabold text-slate-900">{item.title}</p>
                          <span className="shrink-0 text-[11px] font-semibold text-slate-400">{formatNotificationTime(item.createdAt)}</span>
                        </div>
                        {item.body && <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-500">{item.body}</p>}
                        {!item.isRead && (
                          <button
                            type="button"
                            onClick={() => markNotificationRead(item.id).catch(err => console.error('標記通知已讀失敗：', err))}
                            className="mt-2 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-white"
                          >
                            標記已讀
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Main Content Canvas */}
      {isLoggedIn && (
        <div className="w-full h-full flex flex-row overflow-hidden">
          {/* Sidebar — hidden on mobile, collapsible on desktop */}
          <aside
            id="tour-sidebar"
            className={`hidden md:flex flex-col ${t.sidebarBg} text-white shrink-0 transition-all duration-300 relative border-r ${t.sidebarBorder} z-20 shadow-xl shadow-black/5 ${
              isSidebarCollapsed ? 'w-[76px]' : 'w-72'
            }`}
          >
            <div className="min-h-[92px] px-4 py-4 border-b border-white/10 flex items-center">
              <div className={`flex w-full items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} gap-3`}>
                {!isSidebarCollapsed && (
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className={`${t.brandIconBg} flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border ${t.brandIconBorder} shadow-sm`}>
                      <img src={logoImage} alt="Smart Fridge logo" className="h-11 w-11 object-contain" />
                    </div>
                    <div className="flex min-w-0 flex-col items-center justify-center text-center">
                      <h4 className={`font-sans font-extrabold text-lg ${t.brandTitle} leading-tight whitespace-nowrap text-center`}>AI食代</h4>
                      <span className={`block w-full text-center text-[11px] ${t.brandSub} font-semibold tracking-[0.18em] mt-1 whitespace-nowrap uppercase`}>Smart Fridge</span>
                    </div>
                  </div>
                )}

                {isSidebarCollapsed && (
                  <div className={`${t.brandIconBg} flex h-14 w-14 items-center justify-center rounded-2xl border ${t.brandIconBorder}`}>
                    <img src={logoImage} alt="Smart Fridge logo" className="h-11 w-11 object-contain" />
                  </div>
                )}

                <button
                  onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                  className={`${t.chevronBtn} ${isSidebarCollapsed ? 'absolute -right-3 top-5' : ''} w-9 h-9 rounded-xl border transition-all cursor-pointer flex items-center justify-center shadow-sm`}
                  title={isSidebarCollapsed ? "展開目錄面板" : "收合目錄面板"}
                >
                  {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 px-3 py-4">
              {!isSidebarCollapsed && (
                <div className="px-2 mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                  Navigation
                </div>
              )}

              <nav className="space-y-2">
                {NAV_ITEMS.map(item => {
                  const Icon = item.icon;
                  const isActive = currentView === item.tag;

                  return (
                    <button
                      key={item.tag}
                      onClick={() => {
                        navigateTo(item.tag as any);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`relative w-full flex items-center rounded-2xl transition-all cursor-pointer text-left group ${
                        isSidebarCollapsed ? 'justify-center h-12 px-0' : 'gap-3 px-3 py-2.5'
                      } ${isActive ? t.navActive : t.navInactive}`}
                      title={item.label}
                    >
                      {isActive && !isSidebarCollapsed && (
                        <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-white/80" />
                      )}
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        isActive ? 'bg-white/18' : 'bg-white/8 group-hover:bg-white/12'
                      }`}>
                        <Icon className={`w-5 h-5 shrink-0 ${isActive ? t.navActiveIcon : ''}`} />
                      </span>
                      {!isSidebarCollapsed && (
                        <span className="min-w-0">
                          <span className="block text-sm font-bold leading-tight truncate">{item.label}</span>
                          <span className="block text-[10px] font-semibold opacity-60 mt-0.5 truncate">{item.desc}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Downward Executive Chef Profile summary */}
            <div className="p-3 border-t border-white/10">
              <div className={`${isSidebarCollapsed ? 'space-y-2' : 'rounded-2xl bg-white/8 border border-white/10 p-3 space-y-3'}`}>
                <div className={`flex items-center gap-2.5 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                  <div className={`w-9 h-9 ${t.userAvatar} border rounded-full flex items-center justify-center shrink-0`}>
                    <User className="w-4 h-4" />
                  </div>
                  {!isSidebarCollapsed && (
                    <>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <h5 className={`text-xs font-bold truncate ${t.userLabel}`}>{chefName}</h5>
                        <span className="block text-[9px] font-semibold text-white/55 mt-0.5">已登入</span>
                      </div>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${userChefTier.className}`}>{userChefTier.label}</span>
                    </>
                  )}
                </div>

                <button
                  onClick={handleLogout}
                  className={`w-full ${t.logoutBtn} text-[11px] font-bold flex items-center gap-2.5 py-2 px-2 rounded-xl cursor-pointer transition-colors ${
                    isSidebarCollapsed ? 'justify-center' : ''
                  }`}
                  title="更換主廚登入"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {!isSidebarCollapsed && <span>更換主廚登入</span>}
                </button>
              </div>
            </div>
          </aside>

          {/* 3. Central Application Viewport */}
          <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Top Navigation Frame */}

            {/* Dynamic viewport view content space */}
            <div className="flex-1 min-h-0 overflow-y-auto pt-4 px-4 pb-24 md:p-5 space-y-5">
              <AnimatePresence mode="wait">
                {currentView === 'dashboard' && (
                  <motion.div key="dashboard" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
                    <DashboardView
                      ingredients={ingredients}
                      setIngredients={setIngredients}
                      onStartTour={handleRestartTour}
                      searchQuery={searchQuery}
                      setSearchQuery={setSearchQuery}
                      restockReminderIds={restockReminderIds}
                      onToggleRestockReminder={toggleRestockReminder}
                      onSelectAllRestockReminders={selectAllRestockReminders}
                      onClearRestockReminders={clearRestockReminders}
                      expiryReminderDays={expiryReminderDays}
                      onExpiryReminderDaysChange={handleExpiryReminderDaysChange}
                    />
                  </motion.div>
                )}

                {currentView === 'planner' && (
                  <motion.div key="planner" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
                    <PlannerView ingredients={ingredients} />
                  </motion.div>
                )}

                {currentView === 'shopping' && (
                  <motion.div key="shopping" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
                    <ShoppingView
                      items={shoppingItems}
                      setItems={setShoppingItems}
                      onRemoveLinkedRestock={removeLinkedRestockItem}
                      onCreateItem={createShoppingItem}
                      onDeleteItem={deleteShoppingItem}
                      onUpdateQty={updateShoppingItemQty}
                    />
                  </motion.div>
                )}

{currentView === 'community' && (
                  <motion.div key="community" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
                    <CommunityView />
                  </motion.div>
                )}

                {currentView === 'settings' && (
                  <motion.div key="settings" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
                    <SettingsView
                      theme={theme}
                      onThemeChange={handleThemeChange}
                      chefName={chefName}
                      onChefNameChange={handleChefNameChange}
                      expiryPushTime={expiryPushTime}
                      onExpiryPushTimeChange={handleExpiryPushTimeChange}
                      fontSize={fontSize}
                      onFontSizeChange={handleFontSizeChange}
                      onLogout={handleLogout}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </main>

          {/* ── Mobile Bottom Navigation ── */}
          <nav className="fixed bottom-3 left-3 right-3 md:hidden z-30">
            <div className="flex items-center justify-between gap-1 rounded-2xl bg-white/95 border border-slate-200 shadow-2xl shadow-slate-900/12 px-1.5 py-1.5 backdrop-blur">
              {NAV_ITEMS.map(item => {
                const Icon = item.icon;
                const isActive = currentView === item.tag;
                return (
                  <button
                    key={item.tag}
                    onClick={() => navigateTo(item.tag)}
                    className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 rounded-xl py-2 cursor-pointer transition-colors ${
                      isActive ? 'bg-[var(--theme-tint)]' : 'hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? t.mobileNavActive : 'text-slate-400'}`} />
                    <span className={`text-[10px] font-semibold ${isActive ? t.mobileNavActive : 'text-slate-400'}`}>
                      {item.short}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Collapsible tutorial widget */}
          <TourOverlay
            isOpen={isTourOpen}
            onClose={() => setIsTourOpen(false)}
          />
        </div>
      )}

    </div>
  );
}
