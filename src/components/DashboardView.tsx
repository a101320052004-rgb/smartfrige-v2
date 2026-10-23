/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { FoodCategory, Ingredient, StorageType } from '../types';
import {
  ApiError,
  ingredientsApi,
  scanApi,
  userStateApi,
  type IngredientInput,
  type RemovedIngredientReason,
  type RemovedIngredientRecord,
} from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, Plus, CheckCircle, HelpCircle, X,
  Trash2, ClipboardList, Refrigerator, ThermometerSun, AlarmClock, Check, Loader2, Sparkles, Camera, Snowflake, ChevronDown,
  Pencil, ScanBarcode, Bell, BellOff, UtensilsCrossed, Image as ImageIcon
} from 'lucide-react';

const CATEGORY_CONFIG: Record<FoodCategory, {
  label: string; dot: string; accent: string; stroke: string; emoji: string; desc: string;
}> = {
  grains:     { label: '全榖雜糧類', dot: 'bg-yellow-500',  accent: 'border-yellow-100 bg-yellow-50/60',  stroke: '#eab308', emoji: '🌾', desc: '主食來源，包含米飯、麵、燕麥、地瓜與雜糧，提供能量與膳食纖維。' },
  vegetables: { label: '蔬菜類',     dot: 'bg-emerald-500', accent: 'border-emerald-100 bg-emerald-50/60', stroke: '#10b981', emoji: '🥬', desc: '富含膳食纖維、維生素與礦物質，建議每餐都安排足量蔬菜。' },
  protein:    { label: '豆魚蛋肉類', dot: 'bg-red-500',     accent: 'border-red-100 bg-red-50/60',        stroke: '#ef4444', emoji: '🥩', desc: '主要蛋白質來源，包含豆製品、魚、蛋、海鮮與肉類。' },
  dairy:      { label: '乳品類',     dot: 'bg-amber-400',   accent: 'border-amber-100 bg-amber-50/60',    stroke: '#fbbf24', emoji: '🥛', desc: '鈣質與蛋白質來源，開封後請注意冷藏與保存期限。' },
  fruits:     { label: '水果類',     dot: 'bg-rose-400',    accent: 'border-rose-100 bg-rose-50/60',      stroke: '#fb7185', emoji: '🍎', desc: '提供維生素、礦物質與植化素，建議選擇當季水果。' },
  fats:       { label: '油脂與堅果種子類', dot: 'bg-lime-500', accent: 'border-lime-100 bg-lime-50/60', stroke: '#84cc16', emoji: '🥜', desc: '包含烹調油、堅果與種子，適量攝取可補充必需脂肪酸。' },
  other:      { label: '其他',       dot: 'bg-slate-400',   accent: 'border-slate-200 bg-slate-50',       stroke: '#94a3b8', emoji: '📦', desc: '飲料、醬料、調味品或暫時無法辨識的品項，可先放在這裡再手動調整。' },
};

// 把前端的 Ingredient 物件，轉成送給資料層的欄位（去掉 id 與純前端用的 image / isCustom）
const ingredientToInput = (ing: Ingredient): IngredientInput => ({
  name: ing.name,
  category: ing.category,
  qty: ing.qty,
  note: ing.note ?? '',
  storageType: ing.storageType,
  daysLeft: ing.daysLeft,
  totalDays: ing.totalDays,
});

const EXPIRY_REMINDER_DAY_OPTIONS = [1, 2, 3, 5, 7];
const REMOVED_INGREDIENT_UNDO_SECONDS = 30;
const EXTRA_UNITS_STATE_KEY = 'smartfridge:ingredient-extra-units:v1';
const SCAN_MAX_IMAGE_SIDE = 1280;
const SCAN_IMAGE_QUALITY = 0.78;
const STORAGE_OPTIONS: { value: StorageType; label: string }[] = [
  { value: 'fridge', label: '冷藏' },
  { value: 'freezer', label: '冷凍' },
  { value: 'pantry', label: '常溫' },
];

// 食材單位的常用選項（下拉用）；使用者可在表單裡「+ 新增單位」自訂其他單位
const UNIT_OPTIONS = ['份', '顆', '個', '瓶', '盒', '包', '罐', '條', '片', '把', '杯'];

interface PendingScanItem {
  id: string;
  name: string;
  category: FoodCategory;
  qty: string;
  storageType: StorageType;
  daysLeft: number | '';
}

interface ScanNotice {
  type: 'success' | 'error';
  message: string;
}

type RemovedReason = RemovedIngredientReason;

const resolveStorageType = (ingredient: Pick<Ingredient, 'storageType'>): StorageType => ingredient.storageType;

const getStorageLabel = (storageType?: StorageType) =>
  STORAGE_OPTIONS.find(option => option.value === storageType)?.label ?? '常溫';

const getMaxDaysForStorage = (storageType: StorageType) => {
  if (storageType === 'freezer') return 180;
  if (storageType === 'pantry') return 365;
  return 30;
};

const splitQtyText = (qty: string) => {
  const matched = qty.match(/^\s*([0-9]*(?:\.[0-9]*)?)\s*(.*)$/);
  return {
    amount: matched?.[1]?.trim() ?? '1',
    unit: (matched?.[2] || '').trim() || '份',
  };
};

const composeQtyText = (amount: string, unit: string) => `${amount.trim()} ${unit}`.trim();

const formatUndoCountdown = (seconds: number) => {
  if (seconds >= 60) return `${Math.ceil(seconds / 60)} 分鐘`;
  return `${seconds} 秒`;
};

const suggestStorageType = (category: FoodCategory, name: string): StorageType => {
  const normalizedName = name.toLowerCase();
  const fridgeKeywords = ['乳製飲品', '豆類飲品', '果汁', '飲料', '鮮乳', '牛奶', '豆漿', '燕麥奶', '優酪乳', '優格飲', '奶茶'];
  const freezerKeywords = ['冷凍肉', '冷凍海鮮', '冷凍', '冰品', '冰淇淋', '雪糕', '牛肉', '豬肉', '羊肉', '雞肉', '魚肉', '鮭魚', '蝦', '蟹', '干貝', '海鮮'];
  const pantryKeywords = ['罐頭', '泡麵', '調味料', '醬油', '鹽', '糖', '胡椒', '香料', '醬料', '醋', '油'];

  if (fridgeKeywords.some(keyword => normalizedName.includes(keyword))) return 'fridge';
  if (category === 'dairy') return 'fridge';
  if (pantryKeywords.some(keyword => normalizedName.includes(keyword))) return 'pantry';
  if (freezerKeywords.some(keyword => normalizedName.includes(keyword))) return 'freezer';
  return 'fridge';
};

const loadImageElement = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('圖片讀取失敗'));
    };
    image.src = url;
  });

const compressImageForScan = async (file: File): Promise<File> => {
  if (!file.type.startsWith('image/')) return file;

  try {
    const image = await loadImageElement(file);
    const maxSide = Math.max(image.naturalWidth, image.naturalHeight);
    if (maxSide <= SCAN_MAX_IMAGE_SIDE && file.size <= 1_200_000) return file;

    const scale = Math.min(1, SCAN_MAX_IMAGE_SIDE / maxSide);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', SCAN_IMAGE_QUALITY);
    });
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn('壓縮辨識圖片失敗，改用原圖：', error);
    return file;
  }
};

interface DashboardViewProps {
  ingredients: Ingredient[];
  setIngredients: React.Dispatch<React.SetStateAction<Ingredient[]>>;
  onStartTour: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  restockReminderIds: Set<string>;
  onToggleRestockReminder: (ingredient: Ingredient) => void;
  onSelectAllRestockReminders: () => void;
  onClearRestockReminders: () => void;
  expiryReminderDays: number;
  onExpiryReminderDaysChange: (days: number) => void;
}

export default function DashboardView({
  ingredients,
  setIngredients,
  onStartTour,
  searchQuery,
  setSearchQuery,
  restockReminderIds,
  onToggleRestockReminder,
  onSelectAllRestockReminders,
  onClearRestockReminders,
  expiryReminderDays,
  onExpiryReminderDaysChange
}: DashboardViewProps) {
  const [selectedCategories, setSelectedCategories] = useState<Set<FoodCategory>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState<ScanNotice | null>(null);
  const [lastDeletedItem, setLastDeletedItem] = useState<Ingredient | null>(null);
  const [lastRemovalReason, setLastRemovalReason] = useState<RemovedReason>('wasted');
  const [removedIngredients, setRemovedIngredients] = useState<RemovedIngredientRecord[]>([]);
  const [activeInventoryTab, setActiveInventoryTab] = useState<'current' | 'eaten' | 'wasted'>('current');
  const [undoCountdown, setUndoCountdown] = useState<number | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [showExpiryReminderOptions, setShowExpiryReminderOptions] = useState(false);
  const [fabPosition, setFabPosition] = useState({ x: 92, y: 50 });
  const fabDragRef = useRef({ startX: 0, startY: 0, startXPercent: 92, startYPercent: 50, moved: false });
  const [cameraGuidePosition, setCameraGuidePosition] = useState({ x: 50, y: 50 });
  const cameraGuideDragRef = useRef({ startX: 0, startY: 0, startXPercent: 50, startYPercent: 50 });
  const undoTimerRef = useRef<number | null>(null);
  const bulkLongPressTimerRef = useRef<number | null>(null);

  // New Ingredient input formulation
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState<FoodCategory>('vegetables');
  // 份量拆成「數量 + 單位」兩個欄位；送出時再組回成 qty 字串（例如「3 顆」）
  const [newAmount, setNewAmount] = useState('1');
  const [newUnit, setNewUnit] = useState('個');
  const [newNote, setNewNote] = useState('');
  const [extraUnits, setExtraUnits] = useState<string[]>([]); // 使用者自訂新增的單位
  const [addingUnit, setAddingUnit] = useState(false);
  const [unitDraft, setUnitDraft] = useState('');
  const [newStorageType, setNewStorageType] = useState<StorageType>('fridge');
  const [newDays, setNewDays] = useState(7);
  // 編輯中的食材 id（null = 新增模式）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [pendingScanItems, setPendingScanItems] = useState<PendingScanItem[]>([]);
  const [showCameraGuide, setShowCameraGuide] = useState<'camera' | 'upload' | null>(null);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<Set<string>>(new Set());
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const updateExpiryReminderDays = (days: number) => {
    onExpiryReminderDaysChange(days);
    setShowExpiryReminderOptions(false);
  };

  const clearUndoTimer = () => {
    if (undoTimerRef.current !== null) {
      window.clearInterval(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  const startUndoCountdown = () => {
    clearUndoTimer();
    const expiresAt = Date.now() + REMOVED_INGREDIENT_UNDO_SECONDS * 1000;
    setUndoCountdown(REMOVED_INGREDIENT_UNDO_SECONDS);
    undoTimerRef.current = window.setInterval(() => {
      const remainingSeconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setUndoCountdown(remainingSeconds);
      if (remainingSeconds <= 0) {
        clearUndoTimer();
        setLastDeletedItem(null);
      }
    }, 1000);
  };

  const handleFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isScanning) return;
    fabDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startXPercent: fabPosition.x,
      startYPercent: fabPosition.y,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleFabPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const drag = fabDragRef.current;
    const deltaX = e.clientX - drag.startX;
    const deltaY = e.clientY - drag.startY;
    if (Math.hypot(deltaX, deltaY) > 4) drag.moved = true;
    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);
    const nextX = Math.min(94, Math.max(6, drag.startXPercent + (deltaX / viewportWidth) * 100));
    const nextY = Math.min(88, Math.max(12, drag.startYPercent + (deltaY / viewportHeight) * 100));
    setFabPosition({ x: nextX, y: nextY });
  };

  const handleFabPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleFabClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (fabDragRef.current.moved) {
      e.preventDefault();
      fabDragRef.current.moved = false;
      return;
    }
    // 與「AI 拍照辨識」選單邏輯一致：先顯示拍攝引導 modal，再由使用者決定開啟相機或相簿
    setShowCameraGuide('camera');
  };

  const handleCameraGuidePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    cameraGuideDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startXPercent: cameraGuidePosition.x,
      startYPercent: cameraGuidePosition.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCameraGuidePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const drag = cameraGuideDragRef.current;
    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);
    setCameraGuidePosition({
      x: Math.min(88, Math.max(12, drag.startXPercent + ((e.clientX - drag.startX) / viewportWidth) * 100)),
      y: Math.min(84, Math.max(16, drag.startYPercent + ((e.clientY - drag.startY) / viewportHeight) * 100)),
    });
  };

  const handleCameraGuidePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const clearBulkLongPressTimer = () => {
    if (bulkLongPressTimerRef.current !== null) {
      window.clearTimeout(bulkLongPressTimerRef.current);
      bulkLongPressTimerRef.current = null;
    }
  };

  const enterBulkSelectMode = (id: string) => {
    setBulkSelectMode(true);
    setSelectedIngredientIds(new Set([id]));
  };

  const handleIngredientPressStart = (id: string) => {
    if (bulkSelectMode || activeInventoryTab !== 'current') return;
    clearBulkLongPressTimer();
    bulkLongPressTimerRef.current = window.setTimeout(() => enterBulkSelectMode(id), 550);
  };

  const handleIngredientPressEnd = () => {
    clearBulkLongPressTimer();
  };

  const toggleSelectedIngredient = (id: string) => {
    setSelectedIngredientIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitBulkSelectMode = () => {
    clearBulkLongPressTimer();
    setBulkSelectMode(false);
    setSelectedIngredientIds(new Set());
  };

  // Filter items matching name, storage type, quantity, or category label.
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const searchMatchedIngredients = ingredients.filter(ing => {
    if (!normalizedSearchQuery) return true;
    const categoryLabel = CATEGORY_CONFIG[ing.category]?.label ?? '';
    const storageLabel = getStorageLabel(resolveStorageType(ing));
    return [ing.name, ing.qty, categoryLabel, storageLabel]
      .some(value => value.toLowerCase().includes(normalizedSearchQuery));
  });

  const filteredIngredients = searchMatchedIngredients.filter(ing =>
    selectedCategories.size === 0 || selectedCategories.has(ing.category)
  );
  const sortedFilteredIngredients = [...filteredIngredients].sort((a, b) => a.daysLeft - b.daysLeft);

  // Keep the overall inventory total stable even when the page is filtered.
  const totalCount = ingredients.length;
  const fridgeCount = filteredIngredients.filter(ing => resolveStorageType(ing) === 'fridge').length;
  const freezerCount = filteredIngredients.filter(ing => resolveStorageType(ing) === 'freezer').length;
  const pantryCount = filteredIngredients.filter(ing => resolveStorageType(ing) === 'pantry').length;
  const criticalRestock = filteredIngredients.filter(ing => ing.daysLeft <= expiryReminderDays).length;
  const expiringSoonList = sortedFilteredIngredients;
  const removedReasonLabel: Record<RemovedReason, string> = {
    eaten: '已吃完',
    wasted: '丟掉',
    expired: '已過期',
  };

  const resetIngredientForm = () => {
    setNewName('');
    setNewCat('vegetables');
    setNewAmount('1');
    setNewUnit('份');
    setNewNote('');
    setAddingUnit(false);
    setUnitDraft('');
    setNewStorageType('fridge');
    setNewDays(7);
    setEditingId(null);
  };

  // 把表單的「數量 + 單位」組回成 qty 字串；例如 3 + 顆 → 「3 顆」
  const composeQty = () => `${newAmount.trim()} ${newUnit}`.trim();

  // 下拉選到「+ 新增單位」時，打開自訂輸入框
  const handleUnitChange = (value: string) => {
    if (value === '__add__') {
      setAddingUnit(true);
      return;
    }
    setNewUnit(value);
  };

  // 確認加入自訂單位，並自動選中它
  const confirmAddUnit = () => {
    const u = unitDraft.trim();
    if (!u) return;
    if (![...UNIT_OPTIONS, ...extraUnits].includes(u)) {
      setExtraUnits(prev => {
        const next = [...prev, u];
        userStateApi.set(EXTRA_UNITS_STATE_KEY, next).catch(err => console.error('同步自訂單位失敗：', err));
        return next;
      });
    }
    setNewUnit(u);
    setUnitDraft('');
    setAddingUnit(false);
  };

  const closeIngredientModal = () => {
    setShowAddModal(false);
    resetIngredientForm();
    setFormError('');
  };

  // 開啟編輯：把現有食材帶入表單
  const openEditModal = (ing: Ingredient) => {
    setEditingId(ing.id);
    setNewName(ing.name);
    setNewCat(ing.category);
    // 把舊的 qty 字串拆回「數量 + 單位」；例如「3 顆」→ 3 / 顆
    const matched = ing.qty.match(/^\s*([\d.]+)?\s*(.*)$/);
    setNewAmount(matched?.[1]?.trim() || '1');
    const parsedUnit = (matched?.[2] || '').trim() || '份';
    setNewUnit(parsedUnit);
    if (![...UNIT_OPTIONS, ...extraUnits].includes(parsedUnit)) {
      setExtraUnits(prev => {
        const next = [...prev, parsedUnit];
        userStateApi.set(EXTRA_UNITS_STATE_KEY, next).catch(err => console.error('同步自訂單位失敗：', err));
        return next;
      });
    }
    setAddingUnit(false);
    setUnitDraft('');
    setNewNote(ing.note ?? '');
    setNewStorageType(resolveStorageType(ing));
    setNewDays(ing.daysLeft);
    setShowAddModal(true);
  };

  // Add or update raw item
  const handleAddIngredient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) { setFormError('請填寫食材名稱'); return; }
    if (!newAmount.trim()) { setFormError('請填寫數量'); return; }
    setFormError('');
    const composedQty = composeQty();

    if (editingId) {
      // 編輯模式：寫回 Supabase，成功後用回傳資料更新畫面
      const existing = ingredients.find(ing => ing.id === editingId);
      const input: IngredientInput = {
        name: newName,
        category: newCat,
        qty: composedQty,
        note: newNote.trim(),
        storageType: newStorageType,
        daysLeft: newDays,
        totalDays: Math.max(existing?.totalDays ?? newDays, newDays),
      };
      ingredientsApi.update(editingId, input)
        .then(updated => setIngredients(prev => prev.map(ing => ing.id === editingId ? updated : ing)))
        .catch(err => { console.error(err); alert(`更新食材失敗：${err.message}`); });
      closeIngredientModal();
      return;
    }

    // 新增模式：寫入 Supabase，回傳「含真實 DB id」的食材再放進畫面
    const input: IngredientInput = {
      name: newName,
      category: newCat,
      qty: composedQty,
      note: newNote.trim(),
      storageType: newStorageType,
      daysLeft: newDays,
      totalDays: newDays + 2,
    };
    ingredientsApi.create(input)
      .then(created => setIngredients(prev => [created, ...prev]))
      .catch(err => { console.error(err); alert(`新增食材失敗：${err.message}`); });
    closeIngredientModal();
  };

  // Consume item with Undo mechanism
  const handleConsume = (id: string, name: string, reason: RemovedReason = 'eaten') => {
    const itemToDelete = ingredients.find(ing => ing.id === id);
    if (itemToDelete) {
      ingredientsApi.remove(id, reason)
        .then(result => {
          setLastDeletedItem(itemToDelete);
          setLastRemovalReason(reason);
          setRemovedIngredients(prev => [
            result.removed,
            ...prev.filter(record => record.item.id !== id),
          ]);
          setIngredients(prev => prev.filter(ing => ing.id !== id));
          startUndoCountdown();
        })
        .catch(err => {
          console.error('刪除食材失敗：', err);
          alert(`移除食材失敗：${err.message}`);
        });
    }
  };

  const handleBulkRemove = (reason: RemovedReason) => {
    const ids = [...selectedIngredientIds];
    if (ids.length === 0) return;

    Promise.allSettled(ids.map(id => ingredientsApi.remove(id, reason)))
      .then(results => {
        const successful = results
          .filter((result): result is PromiseFulfilledResult<{ deleted: boolean; removed: RemovedIngredientRecord }> => result.status === 'fulfilled')
          .map(result => result.value);
        const successfulIds = new Set(successful.map(result => result.removed.item.id));
        if (successful.length === 0) {
          throw new Error('沒有任何食材更新成功');
        }
        setRemovedIngredients(prev => [
          ...successful.map(result => result.removed),
          ...prev.filter(record => !successfulIds.has(record.item.id)),
        ]);
        setIngredients(prev => prev.filter(ing => !successfulIds.has(ing.id)));
        exitBulkSelectMode();
        if (successful.length < ids.length) {
          alert(`已更新 ${successful.length} 項，另有 ${ids.length - successful.length} 項失敗，請稍後再試。`);
        }
      })
      .catch(err => {
        console.error('批次移除食材失敗：', err);
        alert(`批次更新失敗：${err.message}`);
      });
  };

  // Restore deleted item
  const handleUndo = () => {
    if (lastDeletedItem) {
      const removed = lastDeletedItem;
      clearUndoTimer();
      setLastDeletedItem(null);
      setUndoCountdown(null);
      const record = removedIngredients.find(item => item.item.id === removed.id);
      if (record) {
        restoreRemovedIngredient(record.id);
      }
    }
  };

  const restoreRemovedIngredient = (id: string) => {
    const record = removedIngredients.find(item => item.id === id);
    if (!record) return;

    setRemovedIngredients(prev => prev.filter(item => item.id !== id));
    setActiveInventoryTab('current');
    setShowMobileInventory(true);
    const restoreAction = record.id.startsWith('pending-')
      ? ingredientsApi.create(ingredientToInput(record.item))
      : ingredientsApi.restoreRemoved(record.id);
    restoreAction
      .then(created => {
        setIngredients(prev => [created, ...prev]);
        setHighlightedId(created.id);
        setTimeout(() => setHighlightedId(null), 2000);
      })
      .catch(err => {
        setRemovedIngredients(prev => [record, ...prev]);
        console.error(err);
        alert(`復原失敗：${err.message}`);
      });
  };

  const updatePendingScanItem = (id: string, patch: Partial<PendingScanItem>) => {
    setPendingScanItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const next = { ...item, ...patch };
      const maxDays = getMaxDaysForStorage(next.storageType);
      if (typeof next.daysLeft === 'number') {
        next.daysLeft = Math.max(1, Math.min(maxDays, next.daysLeft));
      }
      return next;
    }));
  };

  const applyBatchStorageType = (storageType: StorageType) => {
    const maxDays = getMaxDaysForStorage(storageType);
    setPendingScanItems(prev => prev.map(item => ({
      ...item,
      storageType,
      daysLeft: typeof item.daysLeft === 'number'
        ? Math.max(1, Math.min(maxDays, item.daysLeft))
        : '',
    })));
  };

  // 讓使用者補上拍照時沒有辨識到的食材
  const addManualPendingScanItem = () => {
    setPendingScanItems(prev => [
      ...prev,
      {
        id: `ing-manual-${Date.now()}-${prev.length}`,
        name: '',
        category: 'other',
        qty: '1 份',
        storageType: 'fridge',
        daysLeft: '',
      },
    ]);
  };

  const removePendingScanItem = (id: string) => {
    setPendingScanItems(prev => prev.filter(item => item.id !== id));
  };

  const confirmPendingScanItems = () => {
    if (pendingScanItems.length === 0) return;
    const itemsWithName = pendingScanItems.filter(item => item.name.trim().length > 0);
    const hasMissingDays = itemsWithName.some(item => item.daysLeft === '');
    if (hasMissingDays) {
      setScanNotice({ type: 'error', message: '請先填寫紅框標示的可儲天數，再加入庫存。' });
      return;
    }

    const inputs: IngredientInput[] = itemsWithName
      .map(item => {
        const qtyParts = splitQtyText(item.qty);
        return {
          name: item.name,
          category: item.category,
          qty: composeQtyText(qtyParts.amount || '1', qtyParts.unit),
          storageType: item.storageType,
          daysLeft: item.daysLeft || 1,
          totalDays: (item.daysLeft || 1) + 3,
        };
      });
    if (inputs.length === 0) return;

    // 批次寫入 Supabase，全部成功後一次更新畫面
    Promise.all(inputs.map(input => ingredientsApi.create(input)))
      .then(created => {
        setIngredients(prev => [...created, ...prev]);
        setHighlightedId(created[0]?.id ?? null);
        setTimeout(() => setHighlightedId(null), 3000);
      })
      .catch(err => { console.error(err); alert(`加入食材失敗：${err.message}`); });
    setScanNotice({ type: 'success', message: `已批次加入 ${inputs.length} 項食材，保存方式與份量已完成確認。` });
    setPendingScanItems([]);
  };

  const triggerAIScan = async (file: File) => {
    setIsScanning(true);
    setScanNotice(null);

    try {
      const optimizedFile = await compressImageForScan(file);
      const result = await scanApi.detectIngredients(optimizedFile);
      const detectedItems = result.items.map((item, index) => ({
        id: `ing-ai-${Date.now()}-${index}`,
        name: item.name,
        category: item.category,
        qty: item.qty,
        storageType: suggestStorageType(item.category, item.name),
        daysLeft: item.daysLeft ?? '',
      }));

      setPendingScanItems(detectedItems);
      setScanNotice({ type: 'success', message: `AI 已辨識 ${detectedItems.length} 項食材，請確認後加入庫存。` });
    } catch (err) {
      console.error(err);
      const message = err instanceof ApiError && err.status === 503
        ? 'Gemini 目前忙碌，請稍後再試。'
        : err instanceof Error
          ? err.message
          : 'AI 辨識食材失敗，請重新拍攝或改用手動新增。';
      setScanNotice({ type: 'error', message });
    } finally {
      setIsScanning(false);
    }
  };

  // Mobile: accordion expand/collapse state (all open by default)
  const [showScanMenu, setShowScanMenu] = useState(false);
  const [showMobileCategoryAnalysis, setShowMobileCategoryAnalysis] = useState(true);
  const [showMobileInventory, setShowMobileInventory] = useState(false);

  useEffect(() => {
    if (!scanNotice) return;
    const timeout = window.setTimeout(() => {
      setScanNotice(null);
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [scanNotice]);

  useEffect(() => {
    let cancelled = false;
    ingredientsApi.listRemoved()
      .then(items => {
        if (!cancelled) setRemovedIngredients(items);
      })
      .catch(err => console.error('讀取移除食材紀錄失敗：', err));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    userStateApi.get<string[]>(EXTRA_UNITS_STATE_KEY)
      .then(result => {
        if (!cancelled && Array.isArray(result.value)) setExtraUnits(result.value);
      })
      .catch(err => console.error('讀取自訂單位失敗：', err));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    clearUndoTimer();
    clearBulkLongPressTimer();
  }, []);

  useEffect(() => {
    const expiredItems = ingredients.filter(item => item.daysLeft < 0);
    if (expiredItems.length === 0) return;

    const expiredIds = new Set(expiredItems.map(item => item.id));
    setRemovedIngredients(prev => [
      ...expiredItems.map(item => ({
        id: `pending-expired-${item.id}`,
        item,
        reason: 'expired' as RemovedReason,
        removedAt: Date.now(),
      })),
      ...prev.filter(record => !expiredIds.has(record.item.id)),
    ]);
    setIngredients(prev => prev.filter(item => !expiredIds.has(item.id)));
    // 過期品同步從 Supabase 刪除
    expiredItems.forEach(item => {
      const pendingId = `pending-expired-${item.id}`;
      ingredientsApi.remove(item.id, 'expired')
        .then(result => {
          setRemovedIngredients(prev => prev.map(record =>
            record.id === pendingId ? result.removed : record
          ));
        })
        .catch(err => console.error('刪除過期食材失敗：', err));
    });
  }, [ingredients, setIngredients]);

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set<FoodCategory>(['grains', 'vegetables', 'protein', 'dairy', 'fruits', 'fats', 'other'])
  );
  const toggleCategory = (cat: FoodCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };
  const CATEGORY_ORDER: FoodCategory[] = ['grains', 'vegetables', 'protein', 'dairy', 'fruits', 'fats', 'other'];
  const mobileGrouped = CATEGORY_ORDER
    .map(cat => ({ cat, items: sortedFilteredIngredients.filter(i => i.category === cat) }))
    .filter(g => g.items.length > 0);

  // ── Category Distribution Panel ──
  const handleCatClick = (cat: FoodCategory) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };
  const clearCategoryFilters = () => setSelectedCategories(new Set());
  const CIRCUMFERENCE = 251.3; // 2π × r(40)
  const catStats = CATEGORY_ORDER.map(cat => ({
    cat,
    cfg: CATEGORY_CONFIG[cat],
    count: searchMatchedIngredients.filter(i => i.category === cat).length,
    items: searchMatchedIngredients.filter(i => i.category === cat),
  })).filter(c => c.count > 0);
  const categoryFilterStats = CATEGORY_ORDER.map(cat => ({
    cat,
    cfg: CATEGORY_CONFIG[cat],
    count: searchMatchedIngredients.filter(i => i.category === cat).length,
  }));
  const totalItems = searchMatchedIngredients.length || 1;
  const donutSegments = (() => {
    let offset = 0;
    return catStats.map(c => {
      const length = (c.count / totalItems) * CIRCUMFERENCE;
      const seg = { ...c, length, dashOffset: -offset };
      offset += length;
      return seg;
    });
  })();
  const selectedCatStats = catStats.filter(c => selectedCategories.has(c.cat));
  const selectedCount = selectedCatStats.reduce((sum, c) => sum + c.count, 0);
  const activeDonutInfo = selectedCategories.size === 1 ? selectedCatStats[0] ?? null : null;
  const donutCenterCount = selectedCategories.size === 0 ? searchMatchedIngredients.length : selectedCount;
  const donutCenterLabel = selectedCategories.size === 0
    ? '全部庫存'
    : selectedCategories.size === 1
      ? activeDonutInfo?.cfg.label ?? '已選分類'
      : `已選 ${selectedCategories.size} 類`;
  const donutCenterPercent = Math.round((donutCenterCount / totalItems) * 100);
  const expiringWithinReminder = expiringSoonList.filter(i => i.daysLeft <= expiryReminderDays);
  const expiryDayGroups = [
    { key: 'today', label: '今天到期', days: 0, items: expiringWithinReminder.filter(i => i.daysLeft <= 0) },
    ...Array.from({ length: expiryReminderDays }, (_, index) => {
      const days = index + 1;
      return {
        key: String(days),
        label: `剩 ${days} 天`,
        days,
        items: expiringWithinReminder.filter(i => i.daysLeft === days),
      };
    }),
  ].filter(group => group.items.length > 0);

  const filteredRemovedIngredients = activeInventoryTab === 'eaten'
    ? removedIngredients.filter(r => r.reason === 'eaten')
    : removedIngredients.filter(r => r.reason === 'wasted' || r.reason === 'expired');

  return (
    <div className="space-y-3 md:space-y-5">

      {/* ── 相機英雄區塊 ── */}
      <section
        id="tour-scan-panel"
        className="relative rounded-2xl overflow-hidden shadow-lg"
        style={{ background: 'linear-gradient(135deg, var(--theme-dark), var(--theme-main))' }}
      >
        {/* 背景裝飾圓 */}
        <div className="absolute top-0 right-0 w-32 h-32 md:w-48 md:h-48 rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-soft) 24%, transparent)' }} />
        <div className="absolute bottom-0 left-16 w-24 h-24 md:w-32 md:h-32 rounded-full translate-y-1/2 pointer-events-none" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-soft) 18%, transparent)' }} />

        <div className="relative px-4 py-3.5 md:px-5 md:py-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
          {/* 左：文案 */}
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[9px] md:text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-soft) 24%, transparent)', color: 'var(--theme-soft)' }}>核心功能</span>
            </div>
            <h3 className="font-sans font-extrabold text-base md:text-xl text-white leading-snug">
              拍照 → AI 辨識 → 自動建庫
            </h3>
            <p className="text-[11px] md:text-xs leading-relaxed" style={{ color: 'color-mix(in srgb, var(--theme-soft) 78%, white)' }}>
              買完菜直接拍，Smart Fridge 先辨識食材種類，再由您批次確認份量與保存方式後加入庫存。
            </p>
          </div>

          {/* 右：掃描按鈕 */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setShowScanMenu(true)}
              disabled={isScanning}
              className="flex items-center gap-2 bg-white font-bold text-xs md:text-sm py-2 px-4 md:py-2.5 md:px-5 rounded-full shadow-lg transition-all cursor-pointer disabled:opacity-60 active:scale-95"
              style={{ color: 'var(--theme-text)' }}
            >
              <Camera className="w-4 h-4" />
              <span>新增食材</span>
            </button>
          </div>
        </div>
      </section>

      {/* Top Controls Board */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-3">
        <div>
          <h2 className="font-sans font-bold text-xl md:text-2xl text-[var(--theme-text)] tracking-tight">我的食材庫</h2>
          <p className="text-slate-500 text-[11px] md:text-xs mt-0.5">追蹤食材儲存、保鮮率與即期提醒</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Restore Demo */}
          {/* Interactive Guided Tour trigger */}
          <button
            onClick={onStartTour}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg font-semibold text-[11px] border transition-all cursor-pointer"
            style={{
              backgroundColor: 'var(--theme-tint)',
              borderColor: 'var(--theme-soft)',
              color: 'var(--theme-text)',
            }}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>開始操作導覽</span>
          </button>

          {/* Add custom item */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 text-white py-1.5 px-3.5 rounded-lg font-semibold text-[11px] shadow-sm cursor-pointer"
            style={{ backgroundColor: 'var(--theme-dark)', boxShadow: '0 1px 8px color-mix(in srgb, var(--theme-dark) 16%, transparent)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>手動登記食材</span>
          </button>
        </div>
      </div>

      {/* Undo notification */}
      <AnimatePresence>
        {lastDeletedItem && undoCountdown !== null && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-amber-50 border border-amber-200 text-amber-950 py-3 px-4 rounded-xl flex items-center justify-between gap-2.5 shadow-sm"
          >
            <div className="text-xs">
              <span className="font-bold">
                {lastRemovalReason === 'eaten' ? '已吃完' : '已過期/丟掉'}：{lastDeletedItem.name}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-bold text-amber-700">{formatUndoCountdown(undoCountdown)}</span>
              <button
                onClick={handleUndo}
                className="bg-amber-900 hover:bg-amber-800 text-white text-[11px] font-bold px-3 py-1 rounded-lg transition-all cursor-pointer"
              >
                復原
              </button>
              <button
                onClick={() => {
                  clearUndoTimer();
                  setLastDeletedItem(null);
                  setUndoCountdown(null);
                }}
                className="text-amber-600 hover:text-amber-800 text-[11px] font-bold cursor-pointer"
              >
                確認
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Scanner toast */}
      <AnimatePresence>
        {scanNotice && (
          <motion.div
            initial={{ opacity: 0, y: -16, x: 16 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: -12, x: 12 }}
            className={`fixed right-3 top-3 z-[120] w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border bg-white/95 p-3 shadow-xl backdrop-blur-md md:right-5 md:top-5 ${
              scanNotice.type === 'error' ? 'border-rose-200' : 'border-[var(--theme-soft)]'
            }`}
          >
            <div className="flex items-start gap-2.5 text-[var(--theme-text)]">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                scanNotice.type === 'error' ? 'bg-rose-50' : 'bg-[var(--theme-tint)]'
              }`}>
                {scanNotice.type === 'error' ? (
                  <X className="h-4 w-4 text-rose-500" />
                ) : (
                  <Sparkles className="h-4 w-4 animate-pulse text-[var(--theme-main)]" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-[11px] font-bold md:text-xs ${
                  scanNotice.type === 'error' ? 'text-rose-600' : 'text-[var(--theme-main)]'
                }`}>
                  {scanNotice.type === 'error' ? 'AI 辨識失敗' : 'AI 辨識完成'}
                </p>
                <p className="mt-0.5 text-[11px] leading-5 text-slate-600 md:text-xs">{scanNotice.message}</p>
              </div>
              <button
                onClick={() => setScanNotice(null)}
                className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                aria-label="關閉通知"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bento Grid: Summary statistics (tour-summary) */}
      <section id="tour-summary" className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
        {/* Total — 點擊清除篩選，顯示全部 */}
        <button
          onClick={() => { setSelectedCategories(new Set()); setSearchQuery(''); document.getElementById('ingredient-list')?.scrollIntoView({ behavior: 'smooth' }); }}
          className="bg-white border border-slate-150 p-2.5 md:p-3 rounded-xl shadow-sm hover:shadow-md hover:border-[var(--theme-soft)] active:scale-95 transition-all flex flex-col justify-between h-16 md:h-20 text-left cursor-pointer w-full"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">庫存品項總數量</span>
          <div className="flex items-end justify-between mt-0.5">
            <div className="flex items-baseline gap-1">
              <span className="font-sans font-semibold text-xl md:text-2xl text-[var(--theme-text)]">{totalCount}</span>
              <span className="text-[10px] font-semibold text-slate-400">項</span>
            </div>
            <div className="bg-[var(--theme-tint)] p-1 rounded-lg">
              <ClipboardList className="w-4 h-4 text-[var(--theme-text)]" />
            </div>
          </div>
        </button>

        {/* 冷藏 — 點擊以搜尋「冷藏」 */}
        <button
          onClick={() => { setSelectedCategories(new Set()); setSearchQuery('冷藏'); document.getElementById('ingredient-list')?.scrollIntoView({ behavior: 'smooth' }); }}
          className="bg-white border border-slate-150 p-2.5 md:p-3 rounded-xl shadow-sm hover:shadow-md hover:border-[var(--theme-main)] active:scale-95 transition-all flex flex-col justify-between h-16 md:h-20 text-left cursor-pointer w-full"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">冷藏區食材</span>
          <div className="flex items-end justify-between mt-0.5">
            <div className="flex items-baseline gap-1">
              <span className="font-sans font-semibold text-xl md:text-2xl text-[var(--theme-text)]">{fridgeCount}</span>
              <span className="text-[10px] font-semibold text-slate-400">項</span>
            </div>
            <div className="bg-[var(--theme-tint)] p-1 rounded-lg">
              <Refrigerator className="w-4 h-4 text-[var(--theme-text)]" />
            </div>
          </div>
        </button>

        {/* 冷凍 — 點擊以搜尋「冷凍」 */}
        <button
          onClick={() => { setSelectedCategories(new Set()); setSearchQuery('冷凍'); document.getElementById('ingredient-list')?.scrollIntoView({ behavior: 'smooth' }); }}
          className="bg-white border border-slate-150 p-2.5 md:p-3 rounded-xl shadow-sm hover:shadow-md hover:border-[var(--theme-main)] active:scale-95 transition-all flex flex-col justify-between h-16 md:h-20 text-left cursor-pointer w-full"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">冷凍區食材</span>
          <div className="flex items-end justify-between mt-0.5">
            <div className="flex items-baseline gap-1">
              <span className="font-sans font-semibold text-xl md:text-2xl text-[var(--theme-text)]">{freezerCount}</span>
              <span className="text-[10px] font-semibold text-slate-400">項</span>
            </div>
            <div className="bg-[var(--theme-tint)] p-1 rounded-lg">
              <Snowflake className="w-4 h-4 text-[var(--theme-text)]" />
            </div>
          </div>
        </button>

        {/* 常溫 — 點擊以搜尋「常溫」 */}
        <button
          onClick={() => { setSelectedCategories(new Set()); setSearchQuery('常溫'); document.getElementById('ingredient-list')?.scrollIntoView({ behavior: 'smooth' }); }}
          className="bg-white border border-slate-150 p-2.5 md:p-3 rounded-xl shadow-sm hover:shadow-md hover:border-[var(--theme-main)] active:scale-95 transition-all flex flex-col justify-between h-16 md:h-20 text-left cursor-pointer w-full"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">常溫</span>
          <div className="flex items-end justify-between mt-0.5">
            <div className="flex items-baseline gap-1">
              <span className="font-sans font-semibold text-xl md:text-2xl text-[var(--theme-text)]">{pantryCount}</span>
              <span className="text-[10px] font-semibold text-slate-400">項</span>
            </div>
            <div className="bg-[var(--theme-tint)] p-1 rounded-lg">
              <ThermometerSun className="w-4 h-4 text-[var(--theme-text)]" />
            </div>
          </div>
        </button>

        {/* 即期 — 捲動到保鮮倒數區塊，保留目前搜尋與分類條件 */}
        <button
          onClick={() => {
            setShowMobileCategoryAnalysis(true);
            window.requestAnimationFrame(() => {
              document.getElementById('tour-expiring')?.scrollIntoView({ behavior: 'smooth' });
            });
          }}
          className="bg-[var(--theme-dark)] text-white p-2.5 md:p-3 rounded-xl shadow-md hover:shadow-lg hover:bg-[var(--theme-main)] active:scale-95 transition-all flex flex-col justify-between h-16 md:h-20 text-left cursor-pointer w-full"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/75">即期食材優先</span>
          <div className="flex items-end justify-between mt-0.5">
            <div className="flex items-baseline gap-1">
              <span className="font-sans font-bold text-xl md:text-2xl text-white">{criticalRestock}</span>
              <span className="text-[10px] font-semibold text-white/75">項 {expiryReminderDays} 天內到期</span>
            </div>
            <div className="bg-white/15 p-1 rounded-lg">
              <AlarmClock className="w-4 h-4 text-white animate-pulse" />
            </div>
          </div>
        </button>
      </section>

      {/* 搜尋欄 — 全寬，有清除按鈕 */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          id="tour-search"
          type="text"
          placeholder="搜尋食材名稱、數量或分類..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--theme-main)] transition-all font-medium shadow-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer p-0.5 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Category Distribution Panel ── */}
      <section className="bg-white border border-slate-150 rounded-xl overflow-hidden shadow-sm">

        {/* Filter chips */}
        <div className="px-3 md:px-4 pt-2.5 md:pt-3 pb-2.5 md:pb-3 border-b border-slate-100">
          <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto whitespace-nowrap pb-1">
            <span className="mr-1 shrink-0 text-[11px] font-bold uppercase tracking-widest text-slate-400">分類篩選</span>
            <button
              onClick={clearCategoryFilters}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                selectedCategories.size === 0
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >全部顯示</button>
            {categoryFilterStats.map(c => (
              <button
                key={c.cat}
                onClick={() => handleCatClick(c.cat)}
                aria-pressed={selectedCategories.has(c.cat)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                  selectedCategories.has(c.cat)
                    ? 'text-white border-transparent'
                    : c.count === 0
                      ? 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
                style={selectedCategories.has(c.cat) ? { backgroundColor: c.cfg.stroke } : {}}
              >
                {selectedCategories.has(c.cat) && <span className="w-1.5 h-1.5 rounded-full bg-white/70 shrink-0" />}
                {c.cfg.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                  selectedCategories.has(c.cat) ? 'bg-white/20 text-white' : 'bg-white text-slate-400'
                }`}>
                  {c.count}
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowMobileCategoryAnalysis(prev => !prev)}
            className="w-full mt-2 lg:hidden flex items-center justify-between rounded-2xl border border-[var(--theme-soft)] bg-[var(--theme-tint)] px-4 py-3 text-sm font-extrabold text-[var(--theme-text)] shadow-sm shadow-slate-900/5 transition-all active:scale-[0.99] cursor-pointer"
          >
            <span>{showMobileCategoryAnalysis ? '收合分類分析圖' : '展開分類分析圖'}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[var(--theme-text)]">
              {showMobileCategoryAnalysis ? '收合' : '展開'}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMobileCategoryAnalysis ? 'rotate-180' : ''}`} />
            </span>
          </button>
        </div>

        {/* 3-column grid: donut | list | detail */}
        <div className={`${showMobileCategoryAnalysis ? 'grid' : 'hidden'} lg:grid grid-cols-1 lg:grid-cols-12`}>

          {/* Donut chart — 3 cols */}
          <div className="lg:col-span-3 flex flex-col items-center justify-center py-6 px-4 border-b lg:border-b-0 lg:border-r border-slate-100">
            <div className="relative">
              <motion.svg
                key={[...selectedCategories].sort().join('-') || 'all'}
                initial={{ scale: 0.96 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.26, ease: 'easeOut' }}
                className="w-36 h-36 -rotate-90 overflow-visible"
                viewBox="0 0 100 100"
              >
                <defs>
                  <filter id="donutActiveGlow" x="-40%" y="-40%" width="180%" height="180%">
                    <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={activeDonutInfo?.cfg.stroke ?? '#10b981'} floodOpacity="0.45" />
                  </filter>
                </defs>
                <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" strokeWidth="14" />
                {donutSegments.map((seg, i) => {
                  const isActive = selectedCategories.has(seg.cat);
                  const isMuted = selectedCategories.size > 0 && !isActive;
                  return (
                    <motion.circle
                      key={seg.cat}
                      cx="50" cy="50" r="40"
                      fill="none"
                      stroke={seg.cfg.stroke}
                      strokeWidth="14"
                      strokeLinecap={isActive ? 'round' : 'butt'}
                      strokeDashoffset={seg.dashOffset}
                      filter={isActive ? 'url(#donutActiveGlow)' : undefined}
                      initial={{ strokeDasharray: `0 ${CIRCUMFERENCE}`, opacity: 0.35 }}
                      animate={{
                        strokeDasharray: `${seg.length} ${CIRCUMFERENCE}`,
                        opacity: isMuted ? 0.22 : 1,
                        strokeWidth: isActive ? 18 : 14,
                      }}
                      transition={{ duration: 0.65, delay: i * 0.06, ease: 'easeOut' }}
                    />
                  );
                })}
              </motion.svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none [&>span]:hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={[...selectedCategories].sort().join('-') || 'all'}
                    initial={{ opacity: 0, scale: 0.72, y: 4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 1.16, y: -4 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    className="flex flex-col items-center"
                  >
                    <span
                      className="font-sans font-extrabold text-3xl leading-none"
                      style={{ color: activeDonutInfo?.cfg.stroke ?? '#064e3b' }}
                    >
                      {donutCenterCount}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold leading-tight mt-1 text-center max-w-[68px]">
                      {donutCenterLabel}
                    </span>
                    <span className={`mt-1 text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                      selectedCategories.size > 0 ? 'bg-[var(--theme-tint)] text-[var(--theme-text)]' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {selectedCategories.size > 0 ? `${donutCenterPercent}%` : 'ALL'}
                    </span>
                  </motion.div>
                </AnimatePresence>
                <span className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5 text-center">庫存總項目</span>
              </div>
            </div>
            {/* Donut legend dots */}
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-4">
              {catStats.map(c => (
                <div key={c.cat} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.cfg.stroke }} />
                  <span className="text-[10px] text-slate-500 font-semibold">{c.cfg.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Category list — 5 cols */}
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-slate-100">
            <div className="px-4 py-2 border-b border-slate-50 flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-bold flex-1">勾選下方核取方塊以進行複選：</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                selectedCategories.size > 0 ? 'bg-[var(--theme-tint)] text-[var(--theme-text)]' : 'bg-slate-100 text-slate-500'
              }`}>
                {selectedCategories.size > 0 ? `已選 ${selectedCategories.size} 類` : '全部顯示中'}
              </span>
            </div>
            <div className="divide-y divide-slate-50">
              {catStats.map((c, i) => {
                const pct = Math.round((c.count / totalItems) * 100);
                const isChecked  = selectedCategories.has(c.cat);
                const isHighlight = selectedCategories.has(c.cat);
                return (
                  <button
                    key={c.cat}
                    onClick={() => handleCatClick(c.cat)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer border-l-2 ${
                      isHighlight ? 'bg-[var(--theme-tint)] border-[var(--theme-main)]' : 'hover:bg-slate-50/70 border-transparent'
                    }`}
                  >
                    {/* Checkbox */}
                    <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                      isChecked ? 'bg-[var(--theme-dark)] border-[var(--theme-dark)]' : 'border-slate-300'
                    }`}>
                      {isChecked && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    {/* Emoji icon */}
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                      style={{ backgroundColor: `${c.cfg.stroke}20` }}>
                      {c.cfg.emoji}
                    </div>
                    {/* Name + bar */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-slate-800">{c.cfg.label}</span>
                          {isChecked && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.cfg.stroke }} />}
                        </div>
                        <span className="text-[11px] text-slate-500 font-semibold ml-2 shrink-0">{c.count} 份 ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, delay: i * 0.06 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: c.cfg.stroke }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expiry panel — 4 cols */}
          <div id="tour-expiring" className="lg:col-span-4 p-3 md:p-4 min-h-[220px] flex flex-col bg-slate-50/40">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping" />
                  <h4 className="font-bold text-sm text-[var(--theme-text)]">保鮮倒數</h4>
                </div>
                <p className="mt-1 text-[11px] text-slate-400 font-semibold">只顯示 {expiryReminderDays} 天內到期食材</p>
              </div>
              <div className="relative flex flex-wrap items-center gap-1.5 sm:shrink-0">
                <button
                  type="button"
                  onClick={() => setShowExpiryReminderOptions(prev => !prev)}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-white px-2.5 py-1.5 text-[11px] font-bold text-rose-700 shadow-sm hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <Bell className="h-3 w-3" />
                  每日提醒 {expiryReminderDays} 天內
                  <ChevronDown className={`h-3 w-3 transition-transform ${showExpiryReminderOptions ? 'rotate-180' : ''}`} />
                </button>
                <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold text-rose-700">
                  {expiringWithinReminder.length} 項
                </span>
                {showExpiryReminderOptions && (
                  <div className="absolute right-0 top-8 z-30 w-32 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                    <p className="px-2 pb-1 text-[10px] font-bold text-slate-400">快到期提醒天數</p>
                    <div className="grid grid-cols-3 gap-1">
                      {EXPIRY_REMINDER_DAY_OPTIONS.map(days => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => updateExpiryReminderDays(days)}
                          className={`rounded-xl px-2 py-2 text-[11px] font-bold transition-colors cursor-pointer ${
                            expiryReminderDays === days
                              ? 'bg-[var(--theme-dark)] text-white'
                              : 'bg-slate-50 text-slate-600 hover:bg-[var(--theme-tint)] hover:text-[var(--theme-text)]'
                          }`}
                        >
                          {days} 天
                        </button>
                      ))}
                    </div>
                    <p className="px-2 pt-2 text-[10px] font-semibold text-slate-400">每天依此門檻提醒</p>
                  </div>
                )}
              </div>
            </div>

            {expiryDayGroups.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-6 text-center">
                <CheckCircle className="mb-2 h-7 w-7 text-emerald-500" />
                <p className="text-xs font-bold text-slate-600">{expiryReminderDays} 天內沒有即期食材</p>
                <p className="mt-1 text-[10px] font-semibold text-slate-400">目前保鮮狀態很穩定</p>
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto pr-1 lg:max-h-64">
                {expiryDayGroups.map(group => (
                  <div key={group.key} className="rounded-xl border border-slate-200 bg-white p-2.5">
                    <div className="mb-2 flex items-center justify-between">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        group.key === 'today' || group.key === '1'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {group.label}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">{group.items.length} 項</span>
                    </div>
                    <div className="space-y-1.5">
                      {group.items.map(ing => (
                        <div key={ing.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-800">{ing.name}</p>
                            <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{CATEGORY_CONFIG[ing.category]?.label} / {ing.qty}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              onClick={() => handleConsume(ing.id, ing.name, 'eaten')}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-500 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer"
                              title="已吃完"
                            >
                              <UtensilsCrossed className="h-3 w-3" />
                              已吃完
                            </button>
                            <button
                              onClick={() => handleConsume(ing.id, ing.name, 'wasted')}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                              title="已過期／丟掉"
                            >
                              <Trash2 className="h-3 w-3" />
                              丟掉
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Ingredient Detailed Lists */}
      <section id="ingredient-list" className="space-y-3.5 min-w-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 w-full">
            <button
              onClick={() => {
                const wasCurrentTab = activeInventoryTab === 'current';
                setActiveInventoryTab('current');
                setShowMobileInventory(prev => (wasCurrentTab ? !prev : true));
              }}
              className={`w-full md:w-auto flex items-center justify-between md:justify-start gap-3 text-left cursor-pointer rounded-2xl border px-4 py-3 shadow-sm transition-all ${
                activeInventoryTab === 'current'
                  ? 'bg-[var(--theme-tint)] border-[var(--theme-soft)]'
                  : 'bg-white border-slate-200'
              }`}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="font-bold text-sm text-[var(--theme-text)]">現有庫存明細</span>
                  <span className="bg-white border border-[var(--theme-soft)] text-[var(--theme-text)] text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {sortedFilteredIngredients.length} 項
                  </span>
                </span>
                <span className="block md:hidden text-[10px] text-slate-500 font-semibold mt-0.5">
                  {showMobileInventory || !!searchQuery ? '點擊可收合完整清單' : '點擊展開完整清單'}
                </span>
              </span>
              <span className="md:hidden ml-auto flex items-center gap-1 shrink-0">
                <ChevronDown className={`w-4 h-4 text-[var(--theme-text)] transition-transform ${showMobileInventory || !!searchQuery ? 'rotate-180' : ''}`} />
              </span>
            </button>
            <button
              onClick={() => {
                setActiveInventoryTab('eaten');
                setShowMobileInventory(true);
              }}
              className={`w-full md:w-auto flex items-center justify-between md:justify-start gap-3 text-left cursor-pointer rounded-2xl border px-4 py-3 shadow-sm transition-all ${
                activeInventoryTab === 'eaten'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <span className="min-w-0">
                <span className="block font-bold text-sm">已吃完</span>
                <span className="block md:hidden text-[10px] font-semibold mt-0.5 text-slate-500">
                  已吃完的食材紀錄
                </span>
              </span>
              <span className="bg-white border border-emerald-100 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {removedIngredients.filter(r => r.reason === 'eaten').length} 項
              </span>
            </button>
            <button
              onClick={() => {
                setActiveInventoryTab('wasted');
                setShowMobileInventory(true);
              }}
              className={`w-full md:w-auto flex items-center justify-between md:justify-start gap-3 text-left cursor-pointer rounded-2xl border px-4 py-3 shadow-sm transition-all ${
                activeInventoryTab === 'wasted'
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <span className="min-w-0">
                <span className="block font-bold text-sm">已過期/丟掉</span>
                <span className="block md:hidden text-[10px] font-semibold mt-0.5 text-slate-500">
                  過期與丟掉食材紀錄
                </span>
              </span>
              <span className="bg-white border border-rose-100 text-rose-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {removedIngredients.filter(r => r.reason === 'wasted' || r.reason === 'expired').length} 項
              </span>
            </button>
            {/* Category tabs — superseded by the Category Distribution Panel above; hidden */}
            <div className="hidden bg-slate-100 border border-slate-200 p-0.5 rounded-lg text-xs font-semibold">
              {[
                { label: '全部', val: 'all' },
                { label: '全榖雜糧類', val: 'grains' },
                { label: '蔬菜類', val: 'vegetables' },
                { label: '豆魚蛋肉類', val: 'protein' },
                { label: '乳品類', val: 'dairy' },
                { label: '水果類', val: 'fruits' },
                { label: '油脂堅果', val: 'fats' },
                { label: '其他', val: 'other' }
              ].map(tab => (
                <button
                  key={tab.val}
                  onClick={() => tab.val === 'all' ? clearCategoryFilters() : handleCatClick(tab.val as FoodCategory)}
                  className={`px-2.5 py-0.5 rounded-md transition-all text-[10px] cursor-pointer ${
                    (tab.val === 'all' ? selectedCategories.size === 0 : selectedCategories.has(tab.val as FoodCategory))
                      ? 'bg-[var(--theme-dark)] text-white shadow-xs' 
                      : 'text-slate-600 hover:text-[var(--theme-text)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Inline search box — hidden on desktop (Header already has search) */}
          <div className="hidden">
            <input
              type="text"
              placeholder="快速過濾食材名稱..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-2.5 py-1 text-[11px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--theme-main)] transition-all font-medium"
            />
            <Search className="absolute left-2 top-2 w-3 h-3 text-slate-400" />
          </div>
        </div>

        {bulkSelectMode && activeInventoryTab === 'current' && (
          <div className="flex flex-col gap-2 rounded-2xl border border-[var(--theme-soft)] bg-[var(--theme-tint)] px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-[var(--theme-text)]">已選取 {selectedIngredientIds.size} 項食材</p>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-500">長按食材進入多選，可一次批量標記。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedIngredientIds(new Set(sortedFilteredIngredients.map(ing => ing.id)))}
                className="rounded-xl border border-white/80 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 cursor-pointer"
              >
                全選目前列表
              </button>
              <button
                type="button"
                onClick={() => handleBulkRemove('eaten')}
                disabled={selectedIngredientIds.size === 0}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                批量已吃完
              </button>
              <button
                type="button"
                onClick={() => handleBulkRemove('wasted')}
                disabled={selectedIngredientIds.size === 0}
                className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                批量丟掉
              </button>
              <button
                type="button"
                onClick={exitBulkSelectMode}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50 cursor-pointer"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* ── Elements List: Mobile Accordion / Desktop Table ── */}
        <div className={`${showMobileInventory || !!searchQuery ? 'block' : 'hidden'} md:block`}>
        {activeInventoryTab !== 'current' ? (
          filteredRemovedIngredients.length === 0 ? (
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl py-6 text-center p-4 text-slate-400 text-xs">
              {activeInventoryTab === 'eaten' ? '目前沒有已吃完的食材紀錄。' : '目前沒有丟掉或已過期的食材紀錄。'}
            </div>
          ) : (
            <>
              <div className="md:hidden space-y-2">
                {filteredRemovedIngredients.map(record => (
                  <div key={record.id} className="rounded-xl border border-rose-100 bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">{record.item.name}</span>
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                            {removedReasonLabel[record.reason]}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] font-semibold text-slate-400">{record.item.qty} / {getStorageLabel(record.item.storageType)}</p>
                        {record.item.note && (
                          <p className="mt-1 line-clamp-2 text-[11px] font-medium text-slate-500">{record.item.note}</p>
                        )}
                      </div>
                      <button
                        onClick={() => restoreRemovedIngredient(record.id)}
                        className="shrink-0 rounded-lg border border-[var(--theme-soft)] bg-[var(--theme-tint)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--theme-text)] transition-colors hover:bg-white cursor-pointer"
                      >
                        復原
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block bg-white border border-slate-150 rounded-xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-150 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-2 px-3">狀態</th>
                        <th className="py-2 px-3">食材名稱</th>
                        <th className="py-2 px-3">份量</th>
                        <th className="py-2 px-3">保存方式</th>
                        <th className="py-2 px-3 text-center">復原</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                      {filteredRemovedIngredients.map(record => (
                        <tr key={record.id} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                              {removedReasonLabel[record.reason]}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-900">
                            <div>{record.item.name}</div>
                            {record.item.note && (
                              <div className="mt-0.5 max-w-[16rem] truncate text-[11px] font-medium text-slate-400">{record.item.note}</div>
                            )}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-600 whitespace-nowrap">{record.item.qty}</td>
                          <td className="py-2 px-3 font-medium text-slate-500 whitespace-nowrap">{getStorageLabel(record.item.storageType)}</td>
                          <td className="py-2 px-3 text-center">
                            <button
                              onClick={() => restoreRemovedIngredient(record.id)}
                              className="rounded-lg border border-[var(--theme-soft)] bg-[var(--theme-tint)] px-3 py-1.5 text-[11px] font-bold text-[var(--theme-text)] transition-colors hover:bg-white cursor-pointer"
                            >
                              復原
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )
        ) : sortedFilteredIngredients.length === 0 ? (
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl py-6 text-center p-4 text-slate-400 text-xs">
            找不到符合條件的庫存食材。請試試手動新增食材！
          </div>
        ) : (
          <>
            {/* ── Mobile: Category Accordion (hidden on md+) ── */}
            <div className="md:hidden space-y-2">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-slate-900">補貨提醒</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-400">已選 {restockReminderIds.size} 項食材</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={onSelectAllRestockReminders}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--theme-soft)] bg-[var(--theme-tint)] text-[var(--theme-text)] transition hover:bg-white"
                      title="全選補貨提醒"
                      aria-label="全選補貨提醒"
                    >
                      <Bell className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={onClearRestockReminders}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                      title="全不選補貨提醒"
                      aria-label="全不選補貨提醒"
                    >
                      <BellOff className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              {mobileGrouped.map(({ cat, items }) => {
                const cfg = CATEGORY_CONFIG[cat];
                const isOpen = expandedCategories.has(cat);
                const urgentCount = items.filter(i => i.daysLeft <= 2).length;
                return (
                  <div key={cat} className={`rounded-xl border overflow-hidden ${cfg.accent}`}>
                    {/* Accordion header */}
                    <button
                      onClick={() => toggleCategory(cat)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                        <span className="font-bold text-sm text-slate-900">{cfg.label}</span>
                        <span className="bg-white/80 border border-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {items.length} 項
                        </span>
                        {urgentCount > 0 && (
                          <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            ⚡ {urgentCount} 急
                          </span>
                        )}
                      </div>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Accordion body */}
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          key="body"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="divide-y divide-slate-100/80 border-t border-slate-100">
                            {items.map(ing => {
                              const isDanger = ing.daysLeft <= 2;
                              const isWarn   = ing.daysLeft <= 4;
                              const isHighlighted = highlightedId === ing.id;
                              const restockReminderOn = restockReminderIds.has(ing.id);
                              return (
                                <div
                                  key={ing.id}
                                  onPointerDown={() => handleIngredientPressStart(ing.id)}
                                  onPointerUp={handleIngredientPressEnd}
                                  onPointerCancel={handleIngredientPressEnd}
                                  onPointerLeave={handleIngredientPressEnd}
                                  onClick={() => { if (bulkSelectMode) toggleSelectedIngredient(ing.id); }}
                                  className={`flex items-center justify-between px-4 py-3 transition-colors ${
                                    selectedIngredientIds.has(ing.id)
                                      ? 'bg-[var(--theme-tint)] ring-1 ring-inset ring-[var(--theme-soft)]'
                                      : isHighlighted
                                      ? 'bg-[var(--theme-tint)] shadow-inner'
                                      : 'bg-white/70 hover:bg-white'
                                  } ${bulkSelectMode ? 'cursor-pointer select-none' : 'cursor-default'}`}
                                >
                                  {bulkSelectMode && (
                                    <span className={`mr-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                                      selectedIngredientIds.has(ing.id)
                                        ? 'border-[var(--theme-main)] bg-[var(--theme-dark)] text-white'
                                        : 'border-slate-300 bg-white text-transparent'
                                    }`}>
                                      <CheckCircle className="h-3.5 w-3.5" />
                                    </span>
                                  )}
                                  <div className="flex-1 min-w-0 pr-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-sm text-slate-900">{ing.name}</span>
                                      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                        isDanger ? 'bg-rose-100 text-rose-700'
                                        : isWarn  ? 'bg-amber-100 text-amber-700'
                                        : 'bg-[var(--theme-tint)] text-[var(--theme-text)]'
                                      }`}>
                                        剩 {ing.daysLeft} 天
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-400">
                                      <span>{ing.qty}</span>
                                    </div>
                                    {ing.note && (
                                      <p className="mt-1 line-clamp-2 text-[11px] font-medium text-slate-500">{ing.note}</p>
                                    )}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <button
                                      onPointerDown={e => e.stopPropagation()}
                                      onClick={e => {
                                        e.stopPropagation();
                                        onToggleRestockReminder(ing);
                                      }}
                                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                        restockReminderOn
                                          ? 'bg-[var(--theme-tint)] text-[var(--theme-text)]'
                                          : 'text-slate-500 hover:bg-[var(--theme-tint)] hover:text-[var(--theme-text)]'
                                      }`}
                                      title={restockReminderOn ? '已開啟補貨提醒' : '未開啟補貨提醒'}
                                      aria-label={restockReminderOn ? `${ing.name} 已開啟補貨提醒` : `${ing.name} 未開啟補貨提醒`}
                                      aria-pressed={restockReminderOn}
                                    >
                                      <Bell className={`w-4 h-4 ${restockReminderOn ? 'fill-current' : ''}`} />
                                    </button>
                                    <button
                                      onPointerDown={e => e.stopPropagation()}
                                      onClick={e => {
                                        e.stopPropagation();
                                        openEditModal(ing);
                                      }}
                                      className="text-slate-500 hover:text-[var(--theme-text)] hover:bg-[var(--theme-tint)] p-1.5 rounded-lg transition-colors cursor-pointer"
                                      title="編輯"
                                      aria-label={`${ing.name} 編輯`}
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                      onPointerDown={e => e.stopPropagation()}
                                      onClick={e => {
                                        e.stopPropagation();
                                        handleConsume(ing.id, ing.name, 'eaten');
                                      }}
                                      className="text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                                      title="已吃完"
                                      aria-label={`${ing.name} 已吃完`}
                                    >
                                      <UtensilsCrossed className="w-4 h-4" />
                                    </button>
                                    <button
                                      onPointerDown={e => e.stopPropagation()}
                                      onClick={e => {
                                        e.stopPropagation();
                                        handleConsume(ing.id, ing.name, 'wasted');
                                      }}
                                      className="text-slate-500 hover:text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                                      title="已過期/丟掉"
                                      aria-label={`${ing.name} 已過期/丟掉`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* ── Desktop: Full Table (hidden on mobile) ── */}
            <div className="hidden md:block bg-white border border-slate-150 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-150 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-2 px-3">食材類別</th>
                      <th className="py-2 px-3">食材名稱</th>
                      <th className="py-2 px-3">確認份量</th>
                      <th className="py-2 px-3">保鮮狀態</th>
                      <th className="py-2 px-3 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <span>補貨提醒</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={onSelectAllRestockReminders}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition-colors hover:border-[var(--theme-soft)] hover:bg-[var(--theme-tint)] hover:text-[var(--theme-text)] cursor-pointer"
                              title="全選補貨提醒"
                              aria-label="全選補貨提醒"
                            >
                              <Bell className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={onClearRestockReminders}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                              title="全不選補貨提醒"
                              aria-label="全不選補貨提醒"
                            >
                              <BellOff className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </th>
                      <th className="w-12 py-2 px-2 text-center">編輯</th>
                      <th className="py-2 px-3 text-center whitespace-nowrap">已吃完</th>
                      <th className="py-2 px-3 text-center whitespace-nowrap">已過期/丟掉</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    <AnimatePresence>
                      {sortedFilteredIngredients.map(ing => {
                        const getCategoryChinese = (cat: FoodCategory) => CATEGORY_CONFIG[cat]?.label ?? '未分類';
                        const getCategoryColor = (cat: FoodCategory) => {
                          switch (cat) {
                            case 'grains':     return 'bg-yellow-50 text-yellow-800 border-yellow-100';
                            case 'vegetables': return 'bg-emerald-50 text-emerald-800 border-emerald-100';
                            case 'protein':    return 'bg-red-50 text-red-800 border-red-100';
                            case 'dairy':      return 'bg-amber-50 text-amber-800 border-amber-100';
                            case 'fruits':     return 'bg-rose-50 text-rose-800 border-rose-100';
                            case 'fats':       return 'bg-lime-50 text-lime-800 border-lime-100';
                            case 'other':      return 'bg-slate-100 text-slate-700 border-slate-200';
                            default:           return 'bg-slate-100 text-slate-800 border-slate-200';
                          }
                        };
                        const daysColor = ing.daysLeft <= 2
                          ? 'text-rose-700 bg-rose-50 border border-rose-100'
                          : ing.daysLeft <= 4
                          ? 'text-amber-700 bg-amber-50 border border-amber-100'
                          : 'text-[var(--theme-text)] bg-[var(--theme-tint)] border border-[var(--theme-soft)]';

                        const isHighlighted = highlightedId === ing.id;
                        const restockReminderOn = restockReminderIds.has(ing.id);

                        return (
                          <motion.tr
                            key={ing.id}
                            layoutId={ing.id}
                            onPointerDown={() => handleIngredientPressStart(ing.id)}
                            onPointerUp={handleIngredientPressEnd}
                            onPointerCancel={handleIngredientPressEnd}
                            onPointerLeave={handleIngredientPressEnd}
                            onClick={() => { if (bulkSelectMode) toggleSelectedIngredient(ing.id); }}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className={`transition-colors ${
                              selectedIngredientIds.has(ing.id)
                                ? 'bg-[var(--theme-tint)] ring-1 ring-inset ring-[var(--theme-soft)]'
                                : isHighlighted
                                ? 'bg-[var(--theme-tint)] shadow-inner'
                                : 'hover:bg-slate-50/70'
                            } ${bulkSelectMode ? 'cursor-pointer select-none' : ''}`}
                          >
                            <td className="py-2 px-3 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {bulkSelectMode && (
                                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                                    selectedIngredientIds.has(ing.id)
                                      ? 'border-[var(--theme-main)] bg-[var(--theme-dark)] text-white'
                                      : 'border-slate-300 bg-white text-transparent'
                                  }`}>
                                    <CheckCircle className="h-3.5 w-3.5" />
                                  </span>
                                )}
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${getCategoryColor(ing.category)}`}>
                                  {getCategoryChinese(ing.category)}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900">
                              <div>{ing.name}</div>
                              {ing.note && (
                                <div className="mt-0.5 max-w-[18rem] truncate text-[11px] font-medium text-slate-400">{ing.note}</div>
                              )}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-600 whitespace-nowrap">{ing.qty}</td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${daysColor}`}>
                                剩餘 {ing.daysLeft} 天過期
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center align-middle whitespace-nowrap">
                              <button
                                onPointerDown={e => e.stopPropagation()}
                                onClick={e => {
                                  e.stopPropagation();
                                  onToggleRestockReminder(ing);
                                }}
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-all cursor-pointer ${
                                  restockReminderOn
                                    ? 'border-[var(--theme-main)] bg-[var(--theme-tint)] text-[var(--theme-text)] shadow-sm'
                                    : 'border-slate-200 bg-white text-slate-500 hover:border-[var(--theme-soft)] hover:bg-[var(--theme-tint)] hover:text-[var(--theme-text)]'
                                }`}
                                title={restockReminderOn ? '已開啟補貨提醒' : '未開啟補貨提醒'}
                                aria-label={restockReminderOn ? `${ing.name} 已開啟補貨提醒` : `${ing.name} 未開啟補貨提醒`}
                                aria-pressed={restockReminderOn}
                              >
                                <Bell className={`w-3.5 h-3.5 ${restockReminderOn ? 'fill-current' : ''}`} />
                              </button>
                            </td>
                            <td className="py-3 px-2 text-center align-middle whitespace-nowrap">
                              <button
                                onPointerDown={e => e.stopPropagation()}
                                onClick={e => {
                                  e.stopPropagation();
                                  openEditModal(ing);
                                }}
                                className="inline-flex items-center justify-center text-slate-500 hover:text-[var(--theme-text)] p-1 hover:bg-[var(--theme-tint)] rounded transition-colors cursor-pointer"
                                title="編輯"
                                aria-label={`${ing.name} 編輯`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </td>
                            <td className="py-3 px-2 text-center align-middle whitespace-nowrap">
                              <button
                                onPointerDown={e => e.stopPropagation()}
                                onClick={e => {
                                  e.stopPropagation();
                                  handleConsume(ing.id, ing.name, 'eaten');
                                }}
                                className="inline-flex items-center justify-center text-slate-500 hover:text-emerald-600 p-1 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                                title="已吃完"
                                aria-label={`${ing.name} 已吃完`}
                              >
                                <UtensilsCrossed className="w-3.5 h-3.5" />
                              </button>
                            </td>
                            <td className="py-3 px-2 text-center align-middle whitespace-nowrap">
                              <button
                                onPointerDown={e => e.stopPropagation()}
                                onClick={e => {
                                  e.stopPropagation();
                                  handleConsume(ing.id, ing.name, 'wasted');
                                }}
                                className="inline-flex items-center justify-center text-slate-500 hover:text-rose-600 p-1 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                title="已過期/丟掉"
                                aria-label={`${ing.name} 已過期/丟掉`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        </div>
      </section>

      {/* Manual Add dialog panel */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeIngredientModal} />

          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-6 max-w-md w-full relative z-10 border border-slate-100 shadow-2xl"
          >
            <h3 className="font-sans font-bold text-lg text-[var(--theme-text)] mb-4">{editingId ? '編輯食材資訊' : '手動補登冰箱新食材'}</h3>
            
            <form onSubmit={handleAddIngredient} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">食材名稱</label>
                <input 
                  type="text" 
                  value={newName} 
                  onChange={e => setNewName(e.target.value)}
                  placeholder="例如：日本大顆山藥、法式鵝肝"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--theme-main)]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">類別歸納</label>
                <select
                  value={newCat}
                  onChange={e => setNewCat(e.target.value as FoodCategory)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="grains">全榖雜糧類</option>
                  <option value="vegetables">蔬菜類</option>
                  <option value="protein">豆魚蛋肉類</option>
                  <option value="dairy">乳品類</option>
                  <option value="fruits">水果類</option>
                  <option value="fats">油脂與堅果種子類</option>
                  <option value="other">其他</option>
                </select>
              </div>

              <div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">數量</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={newAmount}
                      onChange={e => setNewAmount(e.target.value)}
                      placeholder="例如：3"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--theme-main)]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">單位</label>
                    <select
                      value={newUnit}
                      onChange={e => handleUnitChange(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    >
                      {[...UNIT_OPTIONS, ...extraUnits].map(unit => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                      <option value="__add__">＋ 新增單位…</option>
                    </select>
                  </div>
                </div>
                {addingUnit && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={unitDraft}
                      onChange={e => setUnitDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmAddUnit(); } }}
                      placeholder="輸入新單位，例如：串"
                      className="flex-1 bg-white border border-[var(--theme-main)] rounded-lg px-3 py-2 text-sm focus:outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={confirmAddUnit}
                      className="shrink-0 px-3 py-2 bg-[var(--theme-dark)] hover:bg-[var(--theme-main)] text-white rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      加入
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">保存方式</label>
                  <select
                    value={newStorageType}
                    onChange={e => setNewStorageType(e.target.value as StorageType)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  >
                    {STORAGE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">預計可儲天數</label>
                  <input 
                    type="number" 
                    min="1" 
                    value={newDays} 
                    onChange={e => setNewDays(parseInt(e.target.value) || 7)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--theme-main)]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">備註</label>
                <textarea
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="例如：已開封、要先煮、家人指定留用"
                  className="w-full resize-none bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--theme-main)]"
                />
              </div>

              {formError && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{formError}</p>
              )}

              <div className="pt-4 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={closeIngredientModal}
                  className="px-4 py-2 rounded-lg text-slate-500 hover:bg-slate-100 text-sm font-semibold cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--theme-dark)] hover:bg-[var(--theme-main)] text-white rounded-lg text-sm font-semibold cursor-pointer"
                >
                  {editingId ? '儲存變更' : '確認加入'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* 新增食材選單 — slide-up overlay */}
      <AnimatePresence>
        {showScanMenu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end justify-center"
            onClick={() => setShowScanMenu(false)}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              onClick={e => e.stopPropagation()}
              className="relative bg-white rounded-t-3xl p-6 w-full max-w-md shadow-2xl space-y-4 pb-8"
            >
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-2" />
              <h3 className="font-bold text-base text-[var(--theme-text)] text-center">選擇新增方式</h3>
              <div className="space-y-2.5">
                {[
                  { icon: <Camera className="w-5 h-5" />, title: 'AI 拍照辨識', desc: '拍下食材照片，AI 一次辨識多筆', action: () => { setShowScanMenu(false); setShowCameraGuide('camera'); } },
                  { icon: <ImageIcon className="w-5 h-5" />, title: '上傳照片', desc: '從相簿選擇照片，AI 辨識食材清單', action: () => { setShowScanMenu(false); uploadInputRef.current?.click(); } },
                  { icon: <ScanBarcode className="w-5 h-5" />, title: '掃描條碼', desc: '掃描商品條碼，自動查詢食材資訊', action: () => { setShowScanMenu(false); alert('條碼掃描功能開發中，敬請期待！'); } },
                  { icon: <Pencil className="w-5 h-5" />, title: '手動輸入', desc: '自行填寫食材名稱、份量與保存方式', action: () => { setShowScanMenu(false); setShowAddModal(true); } },
                ].map((opt, i) => (
                  <button
                    key={i}
                    onClick={opt.action}
                    className="w-full flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-left transition-all cursor-pointer group"
                  >
                    <div className="w-10 h-10 text-white rounded-xl flex items-center justify-center shrink-0 transition-colors" style={{ backgroundColor: 'var(--theme-dark)' }}>
                      {opt.icon}
                    </div>
                    <div>
                      <div className="font-bold text-sm" style={{ color: 'var(--theme-text)' }}>{opt.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingScanItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] flex items-end justify-center md:items-center p-4"
          >
            <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setPendingScanItems([])} />
            <motion.div
              initial={{ y: 24, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 24, opacity: 0, scale: 0.98 }}
              className="relative z-10 w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl md:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-sans text-xl font-bold text-[var(--theme-text)]">AI 辨識完成，請批次確認</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    已辨識 {pendingScanItems.length} 項食材。可先套用保存方式，再個別微調份量與天數。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingScanItems([])}
                  className="rounded-full bg-slate-50 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                  aria-label="關閉批次確認"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">全部套用保存方式</span>
                {STORAGE_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => applyBatchStorageType(option.value)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:border-[var(--theme-soft)] hover:bg-[var(--theme-tint)] hover:text-[var(--theme-text)] cursor-pointer"
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
                {pendingScanItems.map((item, index) => {
                  const qtyParts = splitQtyText(item.qty);
                  const pendingUnitOptions = Array.from(new Set([...UNIT_OPTIONS, ...extraUnits, qtyParts.unit].filter(Boolean)));
                  return (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 md:p-4">
                    <div className="mb-2 flex items-center text-xs font-extrabold text-[var(--theme-text)]">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200"
                        aria-label={`第 ${index + 1} 項`}
                      >
                        {index + 1}.
                      </span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[1.45fr_1.25fr_1fr_0.9fr]">
                      <div>
                        <label className="mb-1 block text-[11px] font-bold text-slate-500">食材名稱</label>
                        <input
                          type="text"
                          value={item.name}
                          onChange={e => updatePendingScanItem(item.id, { name: e.target.value })}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--theme-main)]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-bold text-slate-500">份量</label>
                        <div className="grid grid-cols-[minmax(0,1fr)_5.25rem] gap-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={qtyParts.amount}
                            onChange={e => updatePendingScanItem(item.id, { qty: composeQtyText(e.target.value, qtyParts.unit) })}
                            className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--theme-main)]"
                            aria-label={`${item.name || `第 ${index + 1} 項`}數量`}
                          />
                          <select
                            value={qtyParts.unit}
                            onChange={e => updatePendingScanItem(item.id, { qty: composeQtyText(qtyParts.amount, e.target.value) })}
                            className="min-w-0 rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--theme-main)]"
                            aria-label={`${item.name || `第 ${index + 1} 項`}單位`}
                          >
                            {pendingUnitOptions.map(unit => (
                              <option key={unit} value={unit}>{unit}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-bold text-slate-500">保存方式</label>
                        <select
                          value={item.storageType}
                          onChange={e => updatePendingScanItem(item.id, { storageType: e.target.value as StorageType })}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none"
                        >
                          {STORAGE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-bold text-slate-500">可儲天數</label>
                        <input
                          type="number"
                          min="1"
                          max={getMaxDaysForStorage(item.storageType)}
                          value={item.daysLeft}
                          onChange={e => {
                            const rawValue = e.target.value;
                            const maxDays = getMaxDaysForStorage(item.storageType);
                            updatePendingScanItem(item.id, {
                              daysLeft: rawValue === '' ? '' : Math.max(1, Math.min(maxDays, parseInt(rawValue) || 1)),
                            });
                          }}
                          className={`w-full rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 ${
                            item.daysLeft === ''
                              ? 'border-rose-300 ring-1 ring-rose-100 focus:border-rose-400 focus:ring-rose-200'
                              : 'border-slate-200 focus:ring-[var(--theme-main)]'
                          }`}
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                      <span className="mr-0.5">分類</span>
                      {(Object.keys(CATEGORY_CONFIG) as FoodCategory[]).map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => updatePendingScanItem(item.id, { category: cat })}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors cursor-pointer ${
                            item.category === cat
                              ? 'bg-[var(--theme-dark)] text-white'
                              : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          {CATEGORY_CONFIG[cat].label}
                        </button>
                      ))}
                      <span className="ml-1">· {getStorageLabel(item.storageType)}</span>
                      <button
                        type="button"
                        onClick={() => removePendingScanItem(item.id)}
                        className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-rose-400 transition-colors hover:bg-rose-50 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                        移除
                      </button>
                    </div>
                  </div>
                  );
                })}

                <button
                  type="button"
                  onClick={addManualPendingScanItem}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white py-3.5 text-sm font-bold text-slate-400 transition-colors hover:border-[var(--theme-soft)] hover:bg-[var(--theme-tint)] hover:text-[var(--theme-text)] cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  拍照沒掃到嗎？手動新增一筆食材
                </button>
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPendingScanItems([])}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmPendingScanItems}
                  className="rounded-xl bg-[var(--theme-dark)] px-5 py-2.5 text-sm font-bold text-white hover:bg-[var(--theme-main)] cursor-pointer"
                >
                  全部加入庫存
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden file inputs for camera/upload */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) {
            setShowCameraGuide(null);
            triggerAIScan(file);
          }
          e.target.value = '';
        }}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) {
            setShowCameraGuide(null);
            triggerAIScan(file);
          }
          e.target.value = '';
        }}
      />

      {/* Camera guide modal */}
      <AnimatePresence>
        {showCameraGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[190] bg-black/70 p-5 backdrop-blur-md"
            onClick={() => setShowCameraGuide(null)}
          >
            <motion.div
              id="tour-camera-guide"
              initial={{ scale: 0.95, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 16 }}
              onClick={e => e.stopPropagation()}
              className="absolute w-[min(24rem,calc(100vw-2.5rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-6 shadow-2xl space-y-5"
              style={{ left: `${cameraGuidePosition.x}%`, top: `${cameraGuidePosition.y}%` }}
            >
              {/* Title */}
              <div
                onPointerDown={handleCameraGuidePointerDown}
                onPointerMove={handleCameraGuidePointerMove}
                onPointerUp={handleCameraGuidePointerUp}
                onPointerCancel={handleCameraGuidePointerUp}
                className="-mx-2 -mt-2 rounded-2xl px-2 py-2 text-center cursor-grab active:cursor-grabbing touch-none select-none"
                title="拖曳移動相機提示視窗"
              >
                <h3 className="font-bold text-lg text-slate-800">拍攝前準備</h3>
                <p className="mt-1 text-xs text-slate-500">請將食材分散鋪平，讓每項清晰可見，AI 辨識更精準</p>
              </div>

              {/* Visual guide — flat surface with 3 horizontal guide lines */}
              <div className="relative bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
                {/* Corner brackets */}
                <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-slate-400 rounded-tl" />
                <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-slate-400 rounded-tr" />
                <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-slate-400 rounded-bl" />
                <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-slate-400 rounded-br" />
                {/* 3 vertical guide lines */}
                <div className="absolute inset-0 flex flex-row justify-evenly px-8 py-6 pointer-events-none">
                  <div className="border-l-2 border-dashed border-slate-300 h-full" />
                  <div className="border-l-2 border-dashed border-slate-300 h-full" />
                  <div className="border-l-2 border-dashed border-slate-300 h-full" />
                </div>
                {/* Center hint */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-1.5 text-center bg-white/80 rounded-xl px-5 py-3">
                    <Camera className="w-7 h-7 text-slate-400" />
                    <p className="text-xs font-bold text-slate-600">食材分散鋪平</p>
                    <p className="text-[10px] text-slate-400">每項放在不同區域，避免重疊堆疊</p>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 text-center">↑ 以三條直線為參考，讓每項食材各自鋪平在不同區域</p>

              {/* Action buttons */}
              <div className="flex gap-2.5">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold text-white transition-all cursor-pointer"
                  style={{ backgroundColor: 'var(--theme-dark)' }}
                >
                  <Camera className="w-4 h-4" />
                  開始拍照
                </button>
                <button
                  onClick={() => setShowCameraGuide(null)}
                  className="px-4 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating AI Scanning state */}
      {isScanning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[200] flex items-center justify-center p-4 hmr-prevent-block animate-fade-in">
          <div className="bg-white border rounded-2xl shadow-2xl p-8 max-w-md w-full text-center space-y-6 relative overflow-hidden">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto animate-pulse" style={{ backgroundColor: 'var(--theme-tint)', color: 'var(--theme-text)' }}>
              <Camera className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-xl text-slate-900 flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--theme-text)' }} />
                <span>AI 雲端影像食材辨識中...</span>
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                廚房探針正在分析照片細節，整理可辨識食材清單，接著會讓您一次確認份量與保存方式。
              </p>
            </div>

            {/* Glowing moving light beam mimicking document scanner */}
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
              <div className="absolute top-0 bottom-0 left-0 w-1/4 bg-[var(--theme-main)] rounded-full animate-ping" style={{ animationDuration: '1.5s', width: '30%' }} />
              <div className="w-full h-full bg-[var(--theme-main)] animate-pulse" />
            </div>

            <p className="text-3xs text-slate-400 uppercase tracking-widest font-bold">
              Smart Fridge Vision Engine v2.4
            </p>
          </div>
        </div>
      )}

      {/* Floating Action Button (FAB - tour-scan) */}
      <button
        id="tour-scan"
        onClick={handleFabClick}
        onPointerDown={handleFabPointerDown}
        onPointerMove={handleFabPointerMove}
        onPointerUp={handleFabPointerUp}
        onPointerCancel={handleFabPointerUp}
        disabled={isScanning}
        className="fixed z-40 h-14 w-14 -translate-x-1/2 -translate-y-1/2 disabled:opacity-50 text-white rounded-full flex items-center justify-center shadow-2xl active:scale-95 transition-transform duration-150 ease-out cursor-grab active:cursor-grabbing touch-none select-none group"
        style={{ left: `${fabPosition.x}%`, top: `${fabPosition.y}%`, backgroundColor: 'var(--theme-dark)' }}
        title="AI 鏡頭拍照辨識食材"
        aria-label="AI 鏡頭拍照辨識食材"
      >
        <Camera className="w-6 h-6 shrink-0 transition-transform group-hover:scale-110" />
      </button>
    </div>
  );
}
