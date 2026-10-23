/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ShoppingItem } from '../types';
import { pricesApi, userStateApi, type PriceRecord, type PxmartCandidateResult } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin, Trash2, Plus, Minus, X, Crown, RotateCcw
} from 'lucide-react';

type ShoppingChannel = 'AUTO' | 'PX' | 'CARREFOUR' | 'AMART' | 'RTMART' | 'WELLCOME' | 'FOODPANDA' | 'UBEREATS';
type ConcreteShoppingChannel = Exclude<ShoppingChannel, 'AUTO'>;

const SHOPPING_CHANNEL_TAGS: ConcreteShoppingChannel[] = ['PX', 'CARREFOUR', 'AMART', 'FOODPANDA', 'UBEREATS'];

const CHANNEL_META: Record<ConcreteShoppingChannel, {
  name: string;
  mode: string;
  url: string;
  brandColor?: string;   // subtle accent for table column
  brandBg?: string;
  brandNameColor?: string;
}> = {
  PX: {
    name: '全聯',
    mode: '實體',
    url: 'https://pxbox.es.pxmart.com.tw',
    brandColor: '#D0001B',
  },
  CARREFOUR: {
    name: '家樂福',
    mode: '實體',
    url: 'https://online.uni-prosperity.com.tw',
    brandColor: '#1A4EA4',
  },
  AMART: {
    name: '美廉社',
    mode: '實體',
    url: 'https://goshopping.simplemart.com.tw',
    brandColor: '#1A9E4B',
  },
  RTMART: {
    name: '大全聯',
    mode: '實體',
    url: 'https://pxbox.es.pxmart.com.tw',
    brandColor: '#D0001B',
  },
  WELLCOME: {
    name: '頂好 Wellcome',
    mode: '實體',
    url: 'https://online.wellcome.com.tw',
    brandColor: '#2AA65D',
  },
  FOODPANDA: {
    name: 'foodpanda',
    mode: '外送',
    url: 'https://www.foodpanda.com.tw',
    brandBg: '#D70F64',
    brandNameColor: '#ffffff',
  },
  UBEREATS: {
    name: 'Uber Eats',
    mode: '外送',
    url: 'https://www.ubereats.com/tw',
    brandBg: '#000000',
    brandNameColor: '#06C167',
  },
};

const CHANNEL_GROUPS: {
  title: string;
  desc: string;
  channels: { tag: ShoppingChannel; label: string; desc: string; mapQuery?: string }[];
}[] = [
  {
    title: '實體通路',
    desc: '適合到店採買',
    channels: [
      { tag: 'PX', label: '全聯福利中心', desc: '常態全台生鮮超市定價', mapQuery: '全聯福利中心' },
      { tag: 'CARREFOUR', label: '家樂福', desc: '量販與生鮮商品到店採買', mapQuery: '家樂福' },
      { tag: 'AMART', label: '美廉社', desc: '社區平價超市，日用生鮮便宜', mapQuery: '美廉社' },
    ],
  },
  {
    title: '外送',
    desc: '適合不出門快速補貨',
    channels: [
      { tag: 'FOODPANDA', label: 'foodpanda', desc: '附近商家外送估價' },
      { tag: 'UBEREATS', label: 'Uber Eats', desc: '即時外送估價含服務成本' },
    ],
  },
];

const openInGoogleMaps = (query: string) => {
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
};

const getItemSearchUrl = (itemName: string, channel: ConcreteShoppingChannel) => {
  const q = encodeURIComponent(itemName);
  switch (channel) {
    case 'PX':        return `https://pxbox.es.pxmart.com.tw/search/result?keyword=${q}`;
    case 'CARREFOUR': return `https://online.uni-prosperity.com.tw/zh/search/?q=${q}`;
    case 'AMART':     return `https://goshopping.simplemart.com.tw/sortview?keyword=${q}`;
    case 'RTMART':    return `https://www.rtmart.com.tw/product/list?q=${q}`;
    case 'WELLCOME':  return `https://online.wellcome.com.tw/search?q=${q}`;
    case 'FOODPANDA': return `https://www.foodpanda.com.tw/city/taipei?q=${q}`;
    case 'UBEREATS':  return `https://www.ubereats.com/tw/search?q=${q}`;
  }
};

type PriceSelection = {
  itemName: string;
  sourceUrl?: string | null;
  selectedAt: string;
};

type PxmartQuoteState = {
  loading: boolean;
  result?: PxmartCandidateResult;
  error?: string;
};

type ChannelQuote = (typeof CHANNEL_META)[ConcreteShoppingChannel] & {
  price: number | null;
  priceDisplay: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
};

type PxmartCachedQuote = {
  cachedAt: string;
  result: PxmartCandidateResult;
};

type PriceHistorySnapshot = {
  capturedAt: string;
  channel: ConcreteShoppingChannel;
  itemName: string;
  productName: string;
  price: number;
  qty: number;
  unit?: string | null;
  unitPrice?: number | null;
  unitPriceLabel?: string | null;
  sourceUrl?: string | null;
  code?: string | number | null;
};

type PriceHistoryStore = Record<string, PriceHistorySnapshot[]>;

type UnitPriceInfo = {
  amount: number;
  baseUnit: 'ml' | 'g' | 'piece' | 'm' | 'm2';
  value: number;
  pricePer100?: number;
  pricePerPiece?: number;
  unitLabel: string;
  label: string;
  title: string;
};

type PriceTrendInfo = {
  direction: 'up' | 'down' | 'flat' | 'new';
  diff: number;
  label: string;
  latestAt?: string;
};

type PriceTrendChartPoint = {
  label: string;
  capturedAt: string;
  rawPrice: number;
  metricValue: number;
  indexValue: number;
  isForecast?: boolean;
};

type PriceTrendSeries = {
  metricMode: 'unit' | 'raw';
  metricLabel: string;
  basisLabel: string;
  actualCount: number;
  points: PriceTrendChartPoint[];
  forecastValue: number;
  forecastIndex: number;
  confidenceLabel: string;
  methodLabel: string;
  summaryLabel: string;
};

type PriceTrendViewerTarget = {
  item: ShoppingItem;
  channel: ConcreteShoppingChannel;
};

type PxmartCandidateSortMode = 'price' | 'name' | 'unit';

const PXMART_SELECTION_STORAGE_KEY = 'smartfridge:pxmart-price-selections:v1';
const PXMART_QUOTE_CACHE_STORAGE_KEY = 'smartfridge:pxmart-price-quotes:v2';
const CARREFOUR_SELECTION_STORAGE_KEY = 'smartfridge:carrefour-price-selections:v1';
const CARREFOUR_QUOTE_CACHE_STORAGE_KEY = 'smartfridge:carrefour-price-quotes:v1';
const SIMPLEMART_SELECTION_STORAGE_KEY = 'smartfridge:simplemart-price-selections:v1';
const SIMPLEMART_QUOTE_CACHE_STORAGE_KEY = 'smartfridge:simplemart-price-quotes:v1';
const PXMART_SORT_STORAGE_KEY = 'smartfridge:price-candidate-sort:v1';
const PRICE_HISTORY_STORAGE_KEY = 'smartfridge:price-history:v1';
const STORE_ITEM_EXCLUSIONS_STATE_KEY = 'smartfridge:store-item-exclusions:v1';
const DELETED_STACK_STATE_KEY = 'smartfridge:shopping-deleted-stack:v1';
const SHOPPING_STATE_KEYS = [
  PXMART_SELECTION_STORAGE_KEY,
  PXMART_QUOTE_CACHE_STORAGE_KEY,
  CARREFOUR_SELECTION_STORAGE_KEY,
  CARREFOUR_QUOTE_CACHE_STORAGE_KEY,
  SIMPLEMART_SELECTION_STORAGE_KEY,
  SIMPLEMART_QUOTE_CACHE_STORAGE_KEY,
  PXMART_SORT_STORAGE_KEY,
  PRICE_HISTORY_STORAGE_KEY,
  STORE_ITEM_EXCLUSIONS_STATE_KEY,
  DELETED_STACK_STATE_KEY,
] as const;
const PXMART_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const SCRAPED_PRICE_CHANNELS: ConcreteShoppingChannel[] = ['PX', 'CARREFOUR', 'AMART'];
const isScrapedPriceChannel = (channel: ConcreteShoppingChannel) => SCRAPED_PRICE_CHANNELS.includes(channel);
let pxmartQuoteCacheStore: Record<string, PxmartCachedQuote> = {};
let carrefourQuoteCacheStore: Record<string, PxmartCachedQuote> = {};
let simplemartQuoteCacheStore: Record<string, PxmartCachedQuote> = {};

const PXMART_CANDIDATE_SORT_OPTIONS: { value: PxmartCandidateSortMode; label: string }[] = [
  { value: 'price', label: '價格低 → 高' },
  { value: 'unit', label: '單位類型 → 單位價格低 → 高' },
  { value: 'name', label: '商品名稱 A → Z / 注音' },
];

// Prefer Traditional Chinese / Zhuyin collation when the browser supports it;
// fall back to normal zh-TW collation. This keeps 中文商品名稱 sorting readable.
const pxmartNameCollator = new Intl.Collator(['zh-TW-u-co-zhuyin', 'zh-Hant-TW', 'zh-TW', 'zh'], {
  numeric: true,
  sensitivity: 'base',
});

type PriceNameProfile = {
  originalName: string;
  normName: string;
  searchName: string;
  storageKey: string;
  detectedUnits: string[];
};

const normalizeShoppingItemName = (itemName: string): PriceNameProfile => {
  const originalName = (itemName ?? '').trim().replace(/\s+/g, ' ');
  const withoutPromo = originalName
    .replace(/<[^>]{1,30}>/g, ' ')
    .replace(/618必搶|限時|特價|促銷|美廉價|促銷價|首購價|買一送一|第二件\d+折|第2件\d+折/g, ' ')
    .replace(/[()（）\[\]{}<>《》「」『』]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const detectedUnits = Array.from(
    withoutPromo.matchAll(/\d+(?:\.\d+)?\s?(?:ml|mL|ML|l|L|公升|cc|g|G|kg|KG|克|公斤|公克|入|包|瓶|罐|盒|袋|顆|粒|片|抽|張|捲|組|份|人份)/g),
    match => match[0].trim()
  );
  const searchName = (withoutPromo
    .replace(/\d+(?:\.\d+)?\s?(?:ml|mL|ML|l|L|公升|cc|g|G|kg|KG|克|公斤|公克|入|包|瓶|罐|盒|袋|顆|粒|片|抽|張|捲|組|份|人份)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || withoutPromo || originalName);
  const storageKey = (withoutPromo || originalName)
    .toLowerCase()
    .replace(/[^0-9a-z\u4e00-\u9fff]+/g, '');

  return {
    originalName,
    normName: withoutPromo || originalName,
    searchName,
    storageKey: storageKey || originalName.toLowerCase(),
    detectedUnits,
  };
};

const legacyPriceSelectionKey = (itemName: string) => itemName.trim().toLowerCase();
const priceSelectionKey = (itemName: string) => normalizeShoppingItemName(itemName).storageKey;
const priceSearchQuery = (itemName: string) => normalizeShoppingItemName(itemName).searchName || itemName.trim();
const priceQuoteCacheKey = (itemName: string, selectedName?: string) =>
  `${priceSelectionKey(itemName)}::${priceSelectionKey(selectedName ?? '')}`;

const getSelectionForItem = (selections: Record<string, PriceSelection>, item: ShoppingItem): PriceSelection | undefined =>
  selections[priceSelectionKey(item.name)] ?? selections[legacyPriceSelectionKey(item.name)];

const saveSelectionForItem = (
  selections: Record<string, PriceSelection>,
  item: ShoppingItem,
  selection: PriceSelection
): Record<string, PriceSelection> => {
  const key = priceSelectionKey(item.name);
  const legacyKey = legacyPriceSelectionKey(item.name);
  const next = { ...selections, [key]: selection };
  if (legacyKey !== key) delete next[legacyKey];
  return next;
};

const removeSelectionForItem = (selections: Record<string, PriceSelection>, item: ShoppingItem): Record<string, PriceSelection> => {
  const next = { ...selections };
  delete next[priceSelectionKey(item.name)];
  delete next[legacyPriceSelectionKey(item.name)];
  return next;
};

const loadJsonObject = <T extends Record<string, unknown>>(key: string): T => {
  return {} as T;
};

const saveJsonObject = (key: string, value: Record<string, unknown>) => {
  userStateApi.set(key, value).catch(err => console.error(`同步 ${key} 失敗：`, err));
};

const loadPxmartSelections = (): Record<string, PriceSelection> =>
  loadJsonObject<Record<string, PriceSelection>>(PXMART_SELECTION_STORAGE_KEY);

const savePxmartSelections = (value: Record<string, PriceSelection>) => {
  saveJsonObject(PXMART_SELECTION_STORAGE_KEY, value);
};

const loadPxmartQuoteCache = (): Record<string, PxmartCachedQuote> =>
  pxmartQuoteCacheStore;

const savePxmartQuoteCache = (value: Record<string, PxmartCachedQuote>) => {
  pxmartQuoteCacheStore = value;
  saveJsonObject(PXMART_QUOTE_CACHE_STORAGE_KEY, value);
};

const loadCarrefourSelections = (): Record<string, PriceSelection> =>
  loadJsonObject<Record<string, PriceSelection>>(CARREFOUR_SELECTION_STORAGE_KEY);

const saveCarrefourSelections = (value: Record<string, PriceSelection>) => {
  saveJsonObject(CARREFOUR_SELECTION_STORAGE_KEY, value);
};

const loadCarrefourQuoteCache = (): Record<string, PxmartCachedQuote> =>
  carrefourQuoteCacheStore;

const saveCarrefourQuoteCache = (value: Record<string, PxmartCachedQuote>) => {
  carrefourQuoteCacheStore = value;
  saveJsonObject(CARREFOUR_QUOTE_CACHE_STORAGE_KEY, value);
};

const loadSimplemartSelections = (): Record<string, PriceSelection> =>
  loadJsonObject<Record<string, PriceSelection>>(SIMPLEMART_SELECTION_STORAGE_KEY);

const saveSimplemartSelections = (value: Record<string, PriceSelection>) => {
  saveJsonObject(SIMPLEMART_SELECTION_STORAGE_KEY, value);
};

const loadSimplemartQuoteCache = (): Record<string, PxmartCachedQuote> =>
  simplemartQuoteCacheStore;

const saveSimplemartQuoteCache = (value: Record<string, PxmartCachedQuote>) => {
  simplemartQuoteCacheStore = value;
  saveJsonObject(SIMPLEMART_QUOTE_CACHE_STORAGE_KEY, value);
};

const loadPriceHistory = (): PriceHistoryStore =>
  loadJsonObject<PriceHistoryStore>(PRICE_HISTORY_STORAGE_KEY);

const savePriceHistory = (value: PriceHistoryStore) => {
  saveJsonObject(PRICE_HISTORY_STORAGE_KEY, value);
};

const loadPxmartCandidateSort = (): PxmartCandidateSortMode => {
  try {
    const saved = localStorage.getItem(PXMART_SORT_STORAGE_KEY);
    if (saved === 'price' || saved === 'name' || saved === 'unit') return saved;
  } catch { /* ignore */ }
  return 'price';
};

const savePxmartCandidateSort = (value: PxmartCandidateSortMode) => {
  try { localStorage.setItem(PXMART_SORT_STORAGE_KEY, value); } catch { /* ignore */ }
};

const sortPxmartCandidates = (
  candidates: PriceRecord[],
  sortMode: PxmartCandidateSortMode
): PriceRecord[] => {
  const priceValue = (item: PriceRecord) => (item.price == null ? Number.POSITIVE_INFINITY : Number(item.price));
  const nameValue = (item: PriceRecord) => item.itemName || '';

  return [...candidates].sort((a, b) => {
    if (sortMode === 'unit') {
      const aUnit = getUnitSortInfo(a);
      const bUnit = getUnitSortInfo(b);
      const byUnitRank = unitSortRank(aUnit?.unitLabel) - unitSortRank(bUnit?.unitLabel);
      if (byUnitRank !== 0) return byUnitRank;

      const byUnitLabel = pxmartNameCollator.compare(aUnit?.unitLabel ?? '未標示', bUnit?.unitLabel ?? '未標示');
      if (byUnitLabel !== 0) return byUnitLabel;

      const byUnitPrice = (aUnit?.value ?? Number.POSITIVE_INFINITY) - (bUnit?.value ?? Number.POSITIVE_INFINITY);
      if (byUnitPrice !== 0) return byUnitPrice;

      const byTotalPrice = priceValue(a) - priceValue(b);
      if (byTotalPrice !== 0) return byTotalPrice;
      return pxmartNameCollator.compare(nameValue(a), nameValue(b));
    }

    if (sortMode === 'name') {
      const byName = pxmartNameCollator.compare(nameValue(a), nameValue(b));
      if (byName !== 0) return byName;
      return priceValue(a) - priceValue(b);
    }

    const byPrice = priceValue(a) - priceValue(b);
    if (byPrice !== 0) return byPrice;
    return pxmartNameCollator.compare(nameValue(a), nameValue(b));
  });
};

const getCachedPxmartQuote = (itemName: string, selectedName?: string): PxmartCandidateResult | null => {
  const cached = loadPxmartQuoteCache()[priceQuoteCacheKey(itemName, selectedName)];
  if (!cached?.cachedAt || !cached.result) return null;

  const age = Date.now() - new Date(cached.cachedAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age > PXMART_CACHE_MS) return null;

  return {
    ...cached.result,
    fromCache: true,
    refreshed: false,
    cacheDays: 7,
  };
};

const setCachedPxmartQuote = (itemName: string, selectedName: string | undefined, result: PxmartCandidateResult) => {
  const cache = loadPxmartQuoteCache();
  cache[priceQuoteCacheKey(itemName, selectedName)] = {
    cachedAt: new Date().toISOString(),
    result,
  };
  savePxmartQuoteCache(cache);
};

const clearCachedPxmartQuote = (itemName: string, selectedName?: string) => {
  const cache = loadPxmartQuoteCache();
  const key = priceQuoteCacheKey(itemName, selectedName);
  if (!(key in cache)) return;
  delete cache[key];
  savePxmartQuoteCache(cache);
};

const getCachedCarrefourQuote = (itemName: string, selectedName?: string): PxmartCandidateResult | null => {
  const cached = loadCarrefourQuoteCache()[priceQuoteCacheKey(itemName, selectedName)];
  if (!cached?.cachedAt || !cached.result) return null;

  const age = Date.now() - new Date(cached.cachedAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age > PXMART_CACHE_MS) return null;

  return {
    ...cached.result,
    fromCache: true,
    refreshed: false,
    cacheDays: 7,
  };
};

const setCachedCarrefourQuote = (itemName: string, selectedName: string | undefined, result: PxmartCandidateResult) => {
  const cache = loadCarrefourQuoteCache();
  cache[priceQuoteCacheKey(itemName, selectedName)] = {
    cachedAt: new Date().toISOString(),
    result,
  };
  saveCarrefourQuoteCache(cache);
};

const getCachedSimplemartQuote = (itemName: string, selectedName?: string): PxmartCandidateResult | null => {
  const cached = loadSimplemartQuoteCache()[priceQuoteCacheKey(itemName, selectedName)];
  if (!cached?.cachedAt || !cached.result) return null;

  const age = Date.now() - new Date(cached.cachedAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age > PXMART_CACHE_MS) return null;

  return {
    ...cached.result,
    fromCache: true,
    refreshed: false,
    cacheDays: 7,
  };
};

const setCachedSimplemartQuote = (itemName: string, selectedName: string | undefined, result: PxmartCandidateResult) => {
  const cache = loadSimplemartQuoteCache();
  cache[priceQuoteCacheKey(itemName, selectedName)] = {
    cachedAt: new Date().toISOString(),
    result,
  };
  saveSimplemartQuoteCache(cache);
};

const rebuildPxmartSelectionResult = (
  base: PxmartCandidateResult,
  query: string,
  selectedName?: string
): PxmartCandidateResult => {
  const cleanSelected = selectedName?.trim() || '';
  const selected = cleanSelected
    ? base.candidates.find(candidate => candidate.itemName === cleanSelected) ?? null
    : null;
  const cheapest = base.cheapest ?? base.candidates.reduce<PriceRecord | null>((best, item) => {
    if (item.price == null) return best;
    if (!best || item.price < best.price) return item;
    return best;
  }, null);
  const effective = cleanSelected ? selected : cheapest;
  const price = effective?.price ?? null;

  return {
    ...base,
    query,
    selectedName: cleanSelected || null,
    selected,
    cheapest,
    price,
    priceDisplay: price == null ? '無' : String(price),
    fromCache: true,
    refreshed: false,
    inserted: 0,
    cacheDays: 7,
  };
};

const formatMoney = (value: number | null | undefined) => (value == null ? '無' : `$${value}`);
const normalizePriceDisplay = (value: string | null | undefined) => {
  const normalized = String(value ?? '').trim();
  return !normalized || normalized === '--' ? '無' : normalized;
};
const formatCompactPrice = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  if (value >= 100) return Number.isInteger(value) ? String(value) : value.toFixed(0);
  if (value >= 10) return Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (value >= 1) return Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (value >= 0.1) return value.toFixed(2);
  return value.toFixed(3);
};

const getEffectiveScrapedCandidate = (result?: PxmartCandidateResult): PriceRecord | null =>
  result?.selected ?? (!result?.selectedName ? result?.cheapest : null) ?? null;

const NUMBER_PATTERN = '\\d+(?:\\.\\d+)?|[一二兩三四五六七八九十百]+';
const COUNT_UNITS = '抽|張|片|入|包|瓶|罐|盒|袋|箱|串|束|杯|條|支|桶|顆|粒|錠|膠囊|粒裝|錠裝|捲|卷|組|份|人份|枚|個|打|尾|帖|貼|板|排|條裝|支裝|包裝|袋裝|盒裝|瓶裝|罐裝';
const METRIC_UNITS = 'fl\\s*oz|floz|oz|OZ|盎司|ml|mL|ML|cc|c\\.c\\.|l|L|公升|毫升|g|G|kg|KG|克|公斤|公克';
const LENGTH_UNITS = '公尺|公分|厘米|毫米|cm|CM|mm|MM|m|M';
const AREA_UNITS = '平方公尺|㎡|m2|M2|m²|M²';

const PRICE_METRIC_UNIT_RE = new RegExp(`(${NUMBER_PATTERN})\\s*(${METRIC_UNITS})`, 'g');
const PRICE_LENGTH_UNIT_RE = new RegExp(`(${NUMBER_PATTERN})\\s*(${LENGTH_UNITS})(?![a-zA-Z])`, 'g');
const PRICE_AREA_UNIT_RE = new RegExp(`(${NUMBER_PATTERN})\\s*(${AREA_UNITS})`, 'g');
const PRICE_COUNT_UNIT_RE = new RegExp(`(${NUMBER_PATTERN})\\s*(${COUNT_UNITS})`, 'g');
const PACKAGE_MULTIPLIER_RE = new RegExp(`(?:[xX*×]\\s*)?(${NUMBER_PATTERN})\\s*(?:${COUNT_UNITS})`, 'g');
const STANDALONE_MULTIPLIER_RE = new RegExp(`(?:[xX*×]\\s*)(${NUMBER_PATTERN})(?!\\s*(?:${METRIC_UNITS}|${LENGTH_UNITS}|${AREA_UNITS}|${COUNT_UNITS}))`, 'g');
const PREFIX_STANDALONE_MULTIPLIER_RE = new RegExp(`(${NUMBER_PATTERN})\\s*x\\s*$`);

const toHalfWidthText = (value: string) =>
  value.replace(/[０-９Ａ-Ｚａ-ｚ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0));

const normalizePriceParseText = (value: string) =>
  toHalfWidthText(value)
    .replace(/,/g, '')
    .replace(/[＊Ｘｘ×✕]/g, 'x')
    .replace(/[／]/g, '/')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/c\.c\./gi, 'cc')
    .replace(/fl\s*oz/gi, 'floz')
    .replace(/公克/g, 'g')
    .replace(/公斤/g, 'kg')
    .replace(/平方公尺/g, 'm²')
    .replace(/公升/g, 'L')
    .replace(/毫升/g, 'ml')
    .replace(/公尺/g, 'm')
    .replace(/公分|厘米/g, 'cm')
    .replace(/毫米/g, 'mm')
    .replace(/克/g, 'g')
    .replace(/條裝/g, '條')
    .replace(/支裝/g, '支')
    .replace(/包裝/g, '包')
    .replace(/袋裝/g, '袋')
    .replace(/盒裝/g, '盒')
    .replace(/瓶裝/g, '瓶')
    .replace(/罐裝/g, '罐')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeSpecCompareText = (value: string | null | undefined) =>
  normalizePriceParseText(value ?? '')
    .replace(/\s+/g, '')
    .toLowerCase();

const shouldAppendCandidateUnit = (itemName?: string | null, unit?: string | null) => {
  const normalizedUnit = normalizeSpecCompareText(unit);
  if (!normalizedUnit) return false;

  const normalizedName = normalizeSpecCompareText(itemName);
  if (!normalizedName) return true;

  // Avoid double-counting specs that were already extracted from the title.
  // Example: title has `2片(6組)` and `unit` is also `2片`; using both made 2*6*2.
  return !normalizedName.includes(normalizedUnit);
};

const parseChinesePositiveNumber = (value: string) => {
  const text = value.replace(/兩/g, '二').trim();
  if (!text || /[^一二三四五六七八九十百]/.test(text)) return null;
  const digit: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (text === '十') return 10;
  if (text === '百') return 100;

  let total = 0;
  let current = 0;
  for (const char of text) {
    if (char === '百') {
      total += (current || 1) * 100;
      current = 0;
    } else if (char === '十') {
      total += (current || 1) * 10;
      current = 0;
    } else {
      current = digit[char] ?? 0;
    }
  }
  const parsed = total + current;
  return parsed > 0 ? parsed : null;
};

const normalizeMetricUnitText = (unit: string) => {
  const lower = normalizePriceParseText(unit).toLowerCase().replace(/\s+/g, '');
  if (lower === 'l') return { baseUnit: 'ml' as const, multiplier: 1000 };
  if (lower === 'ml' || lower === 'cc') return { baseUnit: 'ml' as const, multiplier: 1 };
  if (lower === 'floz') return { baseUnit: 'ml' as const, multiplier: 29.5735 };
  if (lower === 'kg') return { baseUnit: 'g' as const, multiplier: 1000 };
  if (lower === 'oz' || lower === '盎司') return { baseUnit: 'g' as const, multiplier: 28.3495 };
  return { baseUnit: 'g' as const, multiplier: 1 };
};

const normalizeLengthUnitText = (unit: string) => {
  const lower = normalizePriceParseText(unit).toLowerCase();
  if (lower === 'mm') return 0.001;
  if (lower === 'cm') return 0.01;
  return 1;
};

const normalizeAreaUnitText = (_unit: string) => 1;

const parsePositiveNumber = (value: string | undefined) => {
  if (!value) return null;
  const normalized = toHalfWidthText(value).trim();
  const parsed = Number(normalized);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return parseChinesePositiveNumber(normalized);
};

const countUnitMultiplier = (unit: string | undefined) => (unit === '打' ? 12 : 1);

const isSafePackageMultiplier = (value: number | null | undefined) => value != null && value > 1 && value <= 999;

const safeMultipliers = (values: Array<number | null | undefined>) =>
  values.filter((value): value is number => isSafePackageMultiplier(value)).slice(0, 6);

const collectPackageMultipliers = (text: string, afterIndex: number) => {
  const afterText = text.slice(afterIndex, afterIndex + 180);
  const quantityMultipliers = Array.from(afterText.matchAll(PACKAGE_MULTIPLIER_RE)).map(match => {
    const amount = parsePositiveNumber(match[1]);
    return amount == null ? null : amount * countUnitMultiplier(match[2]);
  });
  const standaloneMultipliers = Array.from(afterText.matchAll(STANDALONE_MULTIPLIER_RE)).map(match => parsePositiveNumber(match[1]));

  // Handles 200ml x 6入 x 4組, 125mlx24瓶/箱, 100抽x10包x6串, and also plain forms like 200mlx6.
  return safeMultipliers([...quantityMultipliers, ...standaloneMultipliers]);
};

const collectPackageMultipliersBefore = (text: string, amountIndex: number) => {
  const beforeText = text.slice(Math.max(0, amountIndex - 100), amountIndex);
  const quantityMultipliers = Array.from(beforeText.matchAll(PRICE_COUNT_UNIT_RE)).map(match => {
    const amount = parsePositiveNumber(match[1]);
    return amount == null ? null : amount * countUnitMultiplier(match[2]);
  });
  const prefixStandalone = beforeText.match(PREFIX_STANDALONE_MULTIPLIER_RE);
  const prefixMultiplier = prefixStandalone ? parsePositiveNumber(prefixStandalone[1]) : null;

  // Handles titles like 5包(70g/包), 2瓶x200ml, 6x200ml, and 二入x500ml.
  return safeMultipliers([...quantityMultipliers.slice(-4), prefixMultiplier]);
};

const countUnitLabel = (unit: string | undefined) => {
  if (!unit) return '件';
  if (unit === '入' || unit === '組' || unit === '份' || unit === '人份' || unit === '個') return '件';
  if (unit === '卷') return '捲';
  if (unit === '粒裝' || unit === '錠裝') return unit.replace('裝', '');
  return unit;
};

const COUNT_UNIT_PRIORITY = ['抽', '張', '片', '枚', '顆', '粒', '錠', '膠囊', '尾', '帖', '貼', '板', '支', '條', '杯', '瓶', '罐', '桶', '捲', '卷', '包', '袋', '盒', '箱', '串', '束', '入', '個', '組', '份', '人份', '打'];

const chooseDisplayCountUnit = (quantities: { value: number; unit: string }[]) => {
  const best = [...quantities].sort((a, b) => {
    const aRank = COUNT_UNIT_PRIORITY.indexOf(a.unit);
    const bRank = COUNT_UNIT_PRIORITY.indexOf(b.unit);
    const normalizedA = aRank === -1 ? Number.MAX_SAFE_INTEGER : aRank;
    const normalizedB = bRank === -1 ? Number.MAX_SAFE_INTEGER : bRank;
    return normalizedA - normalizedB;
  })[0];
  return countUnitLabel(best?.unit);
};

const buildMetricUnitPriceInfo = (price: number, text: string): UnitPriceInfo | null => {
  let best: UnitPriceInfo | null = null;

  for (const match of text.matchAll(PRICE_METRIC_UNIT_RE)) {
    if (match.index == null) continue;
    const rawAmount = parsePositiveNumber(match[1]);
    if (rawAmount == null) continue;

    const normalized = normalizeMetricUnitText(match[2]);
    let totalAmount = rawAmount * normalized.multiplier;
    const multipliers = [
      ...collectPackageMultipliersBefore(text, match.index),
      ...collectPackageMultipliers(text, match.index + match[0].length),
    ];

    if (multipliers.length) {
      totalAmount *= multipliers.reduce((product, value) => product * value, 1);
    }

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) continue;

    const pricePer100 = (price / totalAmount) * 100;
    const unitLabel = normalized.baseUnit === 'ml' ? '每100ml' : '每100g';
    const titleUnit = normalized.baseUnit === 'ml' ? 'ml' : 'g';
    const info: UnitPriceInfo = {
      amount: totalAmount,
      baseUnit: normalized.baseUnit,
      value: pricePer100,
      pricePer100,
      unitLabel,
      label: `${unitLabel} $${formatCompactPrice(pricePer100)}`,
      title: `單位價格分析：共 ${formatCompactPrice(totalAmount)}${titleUnit}`,
    };

    if (!best || info.amount > best.amount) {
      best = info;
    }
  }

  return best;
};

const buildAreaUnitPriceInfo = (price: number, text: string): UnitPriceInfo | null => {
  let best: UnitPriceInfo | null = null;

  for (const match of text.matchAll(PRICE_AREA_UNIT_RE)) {
    if (match.index == null) continue;
    const rawAmount = parsePositiveNumber(match[1]);
    if (rawAmount == null) continue;

    let totalArea = rawAmount * normalizeAreaUnitText(match[2]);
    const multipliers = [
      ...collectPackageMultipliersBefore(text, match.index),
      ...collectPackageMultipliers(text, match.index + match[0].length),
    ];
    if (multipliers.length) {
      totalArea *= multipliers.reduce((product, value) => product * value, 1);
    }

    if (!Number.isFinite(totalArea) || totalArea <= 0) continue;

    const pricePerM2 = price / totalArea;
    const info: UnitPriceInfo = {
      amount: totalArea,
      baseUnit: 'm2',
      value: pricePerM2,
      unitLabel: '每平方公尺',
      label: `每平方公尺 $${formatCompactPrice(pricePerM2)}`,
      title: `單位價格分析：共 ${formatCompactPrice(totalArea)}平方公尺`,
    };

    if (!best || info.amount > best.amount) best = info;
  }

  return best;
};

const buildLengthUnitPriceInfo = (price: number, text: string): UnitPriceInfo | null => {
  let best: UnitPriceInfo | null = null;

  for (const match of text.matchAll(PRICE_LENGTH_UNIT_RE)) {
    if (match.index == null) continue;
    const rawAmount = parsePositiveNumber(match[1]);
    if (rawAmount == null) continue;

    let totalMeters = rawAmount * normalizeLengthUnitText(match[2]);
    const multipliers = [
      ...collectPackageMultipliersBefore(text, match.index),
      ...collectPackageMultipliers(text, match.index + match[0].length),
    ];
    if (multipliers.length) {
      totalMeters *= multipliers.reduce((product, value) => product * value, 1);
    }

    if (!Number.isFinite(totalMeters) || totalMeters <= 0) continue;

    const pricePerMeter = price / totalMeters;
    const info: UnitPriceInfo = {
      amount: totalMeters,
      baseUnit: 'm',
      value: pricePerMeter,
      unitLabel: '每公尺',
      label: `每公尺 $${formatCompactPrice(pricePerMeter)}`,
      title: `單位價格分析：共 ${formatCompactPrice(totalMeters)}公尺`,
    };

    if (!best || info.amount > best.amount) best = info;
  }

  return best;
};

const countBasisForDisplay = (displayUnit: string, totalCount: number) => {
  const usePer100 = totalCount >= 40 && ['張', '抽', '片', '枚', '顆', '粒', '錠', '膠囊', '貼'].includes(displayUnit);
  return usePer100 ? 100 : 1;
};

type CountMatchInfo = {
  value: number;
  unit: string;
  index: number;
  text: string;
};

type CountFormulaGroup = {
  total: number;
  displayUnit: string;
};

const stripGiftTextForUnitPrice = (text: string) => {
  const giftIndex = text.search(/(?:加贈|附贈|贈送|贈品|贈)/);
  return giftIndex >= 0 ? text.slice(0, giftIndex) : text;
};

const splitCountFormulaSegments = (text: string) =>
  stripGiftTextForUnitPrice(text)
    .split(/[+＋]/)
    .map(segment => segment.trim())
    .filter(Boolean);

const parseCountMatches = (text: string): CountMatchInfo[] =>
  Array.from(text.matchAll(PRICE_COUNT_UNIT_RE))
    .map(match => {
      const value = parsePositiveNumber(match[1]);
      if (value == null || match.index == null) return null;
      return {
        value: value * countUnitMultiplier(match[2]),
        unit: match[2],
        index: match.index,
        text: match[0],
      };
    })
    .filter((entry): entry is CountMatchInfo => entry != null && entry.value > 0 && entry.value <= 9999);

const COUNT_BASE_PRIORITY = ['抽', '張', '片', '枚', '顆', '粒', '錠', '膠囊', '尾', '帖', '貼', '板', '支', '條', '杯', '瓶', '罐', '桶', '捲', '卷', '件', '入', '個', '包', '袋', '盒', '箱', '串', '束', '組', '份', '人份', '打'];

const countBaseRank = (unit: string) => {
  const normalizedUnit = countUnitLabel(unit);
  const index = COUNT_BASE_PRIORITY.indexOf(normalizedUnit);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

const chooseCountFormulaBase = (matches: CountMatchInfo[]) => {
  if (!matches.length) return null;
  // Prefer the smallest physical unit in the expression, so `3入/包，28包組` is counted as 84 件, not 28 包.
  return [...matches].sort((a, b) => countBaseRank(a.unit) - countBaseRank(b.unit) || a.index - b.index)[0];
};

const collectTrailingCountMultipliers = (segment: string, base: CountMatchInfo) => {
  const afterText = segment.slice(base.index + base.text.length);
  const multipliers: Array<number | null> = [];
  const xMultiplierRe = new RegExp(`[xX*]\\s*(${NUMBER_PATTERN})\\s*(?:${COUNT_UNITS})?`, 'g');

  for (const match of afterText.matchAll(xMultiplierRe)) {
    multipliers.push(parsePositiveNumber(match[1]));
  }

  for (const match of afterText.matchAll(PRICE_COUNT_UNIT_RE)) {
    if (match.index == null) continue;
    const before = afterText.slice(0, match.index).trimEnd();
    // `x10包` is already captured by xMultiplierRe; avoid multiplying the same number twice.
    if (/[xX*]$/.test(before)) continue;
    multipliers.push(parsePositiveNumber(match[1]));
  }

  return safeMultipliers(multipliers);
};

const parseCountFormulaGroups = (text: string): CountFormulaGroup[] => {
  const groups: CountFormulaGroup[] = [];

  for (const segment of splitCountFormulaSegments(text)) {
    const matches = parseCountMatches(segment);
    const base = chooseCountFormulaBase(matches);
    if (!base || base.value <= 0) continue;

    const trailingMultipliers = collectTrailingCountMultipliers(segment, base);
    const total = base.value * (trailingMultipliers.length ? trailingMultipliers.reduce((product, value) => product * value, 1) : 1);
    if (!Number.isFinite(total) || total <= 1 || total > 999999) continue;

    groups.push({
      total,
      displayUnit: countUnitLabel(base.unit),
    });
  }

  return groups;
};

const mergeCountFormulaGroups = (groups: CountFormulaGroup[]) => {
  if (!groups.length) return null;

  const bestUnit = groups
    .map(group => group.displayUnit)
    .sort((a, b) => countBaseRank(a) - countBaseRank(b) || pxmartNameCollator.compare(a, b))[0];
  const sameUnitGroups = groups.filter(group => group.displayUnit === bestUnit);
  if (!sameUnitGroups.length) return null;

  return {
    totalCount: sameUnitGroups.reduce((sum, group) => sum + group.total, 0),
    displayUnit: bestUnit,
  };
};

const buildCountUnitPriceInfo = (price: number, text: string): UnitPriceInfo | null => {
  const formulaResult = mergeCountFormulaGroups(parseCountFormulaGroups(text));
  if (!formulaResult || !Number.isFinite(formulaResult.totalCount) || formulaResult.totalCount <= 1) return null;

  const { totalCount, displayUnit } = formulaResult;
  const basis = countBasisForDisplay(displayUnit, totalCount);
  const pricePerBasis = (price / totalCount) * basis;
  const unitLabel = basis === 100 ? `每100${displayUnit}` : `每${displayUnit}`;

  return {
    amount: totalCount,
    baseUnit: 'piece',
    value: pricePerBasis,
    pricePerPiece: price / totalCount,
    unitLabel,
    label: `${unitLabel} $${formatCompactPrice(pricePerBasis)}`,
    title: `單位價格分析：共 ${formatCompactPrice(totalCount)}${displayUnit}`,
  };
};

const getUnitPriceInfo = (
  price: number | null | undefined,
  unit?: string | null,
  itemName?: string | null
): UnitPriceInfo | null => {
  if (price == null || price <= 0) return null;

  // Put itemName first because it usually contains the full package expression, e.g. 200mlx6入x4組.
  // Only append candidate.unit when it is not already present in the title; many scrapers extract unit from the title,
  // and appending it again can double-count packages such as `2片(6組)` + unit `2片`.
  const text = normalizePriceParseText(
    `${itemName ?? ''} ${shouldAppendCandidateUnit(itemName, unit) ? unit ?? '' : ''}`
  );
  if (!text) return null;

  const metricInfo = buildMetricUnitPriceInfo(price, text);
  if (metricInfo) return metricInfo;

  const countInfo = buildCountUnitPriceInfo(price, text);
  const hasPieceLikeCount = /(抽|張|片|枚|顆|粒|錠|膠囊|入|瓶|罐|包|盒|袋|支|條|貼|帖|板)/.test(text);
  if (countInfo && hasPieceLikeCount) return countInfo;

  return buildAreaUnitPriceInfo(price, text) ?? buildLengthUnitPriceInfo(price, text) ?? countInfo;
};

const getUnitSortInfo = (candidate: PriceRecord) => getUnitPriceInfo(candidate.price, candidate.unit, candidate.itemName);

const unitSortRank = (label?: string | null) => {
  const order = ['每100ml', '每100g', '每100張', '每100抽', '每100片', '每瓶', '每罐', '每包', '每袋', '每盒', '每件', '每支', '每條', '每捲', '每公尺', '每平方公尺'];
  const index = label ? order.indexOf(label) : -1;
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

const priceHistoryKey = (item: ShoppingItem, channel: ConcreteShoppingChannel, quote: ChannelQuote) => {
  const productKey = priceSelectionKey(`${quote.sourceName ?? ''}-${quote.sourceUrl ?? ''}`);
  return `${channel}::${priceSelectionKey(item.name)}::${productKey}`;
};

const appendPriceHistorySnapshot = (
  history: PriceHistoryStore,
  item: ShoppingItem,
  channel: ConcreteShoppingChannel,
  quote: ChannelQuote,
  candidate?: PriceRecord | null
): PriceHistoryStore => {
  if (!isScrapedPriceChannel(channel) || quote.price == null || !quote.sourceName) return history;

  const key = priceHistoryKey(item, channel, quote);
  const current = history[key] ?? [];
  const unitInfo = getUnitPriceInfo(quote.price, candidate?.unit, quote.sourceName);
  const now = new Date();
  const last = current[current.length - 1];

  // Avoid creating duplicate points on every render or page reload. A new point is recorded
  // when price/product changes or when the previous point is older than 12 hours.
  if (last) {
    const ageMs = now.getTime() - new Date(last.capturedAt).getTime();
    const samePrice = last.price === quote.price;
    const sameProduct = last.productName === quote.sourceName;
    const sameUnit = (last.unitPriceLabel ?? '') === (unitInfo?.label ?? '');
    if (samePrice && sameProduct && sameUnit && Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 12 * 60 * 60 * 1000) {
      return history;
    }
  }

  const snapshot: PriceHistorySnapshot = {
    capturedAt: now.toISOString(),
    channel,
    itemName: item.name,
    productName: quote.sourceName,
    price: quote.price,
    qty: item.qty,
    unit: candidate?.unit ?? null,
    unitPrice: unitInfo?.value ?? null,
    unitPriceLabel: unitInfo?.label ?? null,
    sourceUrl: quote.sourceUrl ?? null,
    code: candidate?.code ?? null,
  };

  return {
    ...history,
    [key]: [...current, snapshot].slice(-30),
  };
};

const getPriceTrend = (
  history: PriceHistoryStore,
  item: ShoppingItem,
  channel: ConcreteShoppingChannel,
  quote: ChannelQuote
): PriceTrendInfo | null => {
  if (!isScrapedPriceChannel(channel) || quote.price == null || !quote.sourceName) return null;
  const snapshots = history[priceHistoryKey(item, channel, quote)] ?? [];
  if (snapshots.length === 0) return null;
  if (snapshots.length === 1) {
    return { direction: 'new', diff: 0, label: '新追蹤', latestAt: snapshots[0].capturedAt };
  }

  const latest = snapshots[snapshots.length - 1];
  const previous = snapshots[snapshots.length - 2];
  const diff = latest.price - previous.price;
  if (diff === 0) return { direction: 'flat', diff, label: '持平', latestAt: latest.capturedAt };
  return {
    direction: diff > 0 ? 'up' : 'down',
    diff,
    label: `${diff > 0 ? '↑' : '↓'} $${Math.abs(diff)}`,
    latestAt: latest.capturedAt,
  };
};

const trendClassName = (trend: PriceTrendInfo) => {
  if (trend.direction === 'down') return 'text-emerald-500 bg-emerald-50';
  if (trend.direction === 'up') return 'text-rose-500 bg-rose-50';
  if (trend.direction === 'flat') return 'text-slate-500 bg-slate-100';
  return 'text-sky-600 bg-sky-50';
};

const extractUnitMetricLabel = (label?: string | null) => {
  if (!label) return null;
  const clean = label.split('$')[0].trim();
  return clean || null;
};

const formatTrendDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const formatTrendMetricValue = (value: number, metricLabel: string) => {
  if (!Number.isFinite(value)) return '—';
  if (metricLabel.startsWith('每')) return `${metricLabel} $${formatCompactPrice(value)}`;
  return `$${formatCompactPrice(value)}`;
};

const daysBetween = (a: string, b: string) => {
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(diff) ? diff / (24 * 60 * 60 * 1000) : 0;
};

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const medianPositiveGap = (points: PriceTrendChartPoint[]) => {
  const gaps = points
    .slice(1)
    .map((point, index) => daysBetween(points[index].capturedAt, point.capturedAt))
    .filter(gap => Number.isFinite(gap) && gap > 0)
    .sort((a, b) => a - b);
  if (!gaps.length) return 7;
  return gaps[Math.floor(gaps.length / 2)] || 7;
};

const predictNextMetricValue = (points: PriceTrendChartPoint[]) => {
  const actual = points.filter(point => !point.isForecast && Number.isFinite(point.metricValue));
  const n = actual.length;
  const latest = actual[n - 1]?.metricValue ?? 0;
  if (n <= 1) {
    return { value: latest, methodLabel: '資料不足，先以目前價格做保守預估', confidenceLabel: '低' };
  }

  const firstDate = actual[0].capturedAt;
  const xs = actual.map(point => Math.max(0, daysBetween(firstDate, point.capturedAt)));
  const ys = actual.map(point => point.metricValue);
  const nextX = xs[xs.length - 1] + medianPositiveGap(actual);

  // Recent observations are more useful for grocery prices, so we use a lightweight
  // exponentially weighted regression and blend it with a weighted moving average.
  const weights = ys.map((_, index) => Math.pow(0.72, ys.length - 1 - index));
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const xMean = xs.reduce((sum, value, index) => sum + value * weights[index], 0) / weightSum;
  const yMean = ys.reduce((sum, value, index) => sum + value * weights[index], 0) / weightSum;
  const denominator = xs.reduce((sum, value, index) => sum + weights[index] * Math.pow(value - xMean, 2), 0);
  const slope = denominator === 0 ? 0 : xs.reduce((sum, value, index) => sum + weights[index] * (value - xMean) * (ys[index] - yMean), 0) / denominator;
  const regression = yMean + slope * (nextX - xMean);
  const recentWeights = ys.map((_, index) => index + 1);
  const recentWeightSum = recentWeights.reduce((sum, value) => sum + value, 0);
  const weightedMovingAverage = ys.reduce((sum, value, index) => sum + value * recentWeights[index], 0) / recentWeightSum;
  const blend = n >= 4 ? regression * 0.65 + weightedMovingAverage * 0.35 : latest + (latest - ys[n - 2]) * 0.6;

  const recent = ys.slice(-Math.min(5, n));
  const minRecent = Math.min(...recent);
  const maxRecent = Math.max(...recent);
  const guard = n >= 5 ? 0.35 : 0.2;
  const guarded = clampNumber(blend, Math.max(0, minRecent * (1 - guard)), maxRecent * (1 + guard));
  const mean = ys.reduce((sum, value) => sum + value, 0) / n;
  const variance = ys.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / n;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  const confidenceLabel = n >= 6 && cv < 0.12 ? '高' : n >= 4 && cv < 0.25 ? '中' : '低';

  return {
    value: Number.isFinite(guarded) ? guarded : latest,
    methodLabel: n >= 4 ? '近期加權回歸 + 移動平均' : '最近漲跌幅保守外推',
    confidenceLabel,
  };
};

const buildPriceTrendSeries = (
  history: PriceHistoryStore,
  item: ShoppingItem,
  channel: ConcreteShoppingChannel,
  quote: ChannelQuote,
  candidate?: PriceRecord | null
): PriceTrendSeries | null => {
  if (!isScrapedPriceChannel(channel) || quote.price == null || !quote.sourceName) return null;

  const stored = [...(history[priceHistoryKey(item, channel, quote)] ?? [])].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
  const currentUnit = getUnitPriceInfo(quote.price, candidate?.unit, quote.sourceName);
  const currentSnapshot: PriceHistorySnapshot = {
    capturedAt: new Date().toISOString(),
    channel,
    itemName: item.name,
    productName: quote.sourceName,
    price: quote.price,
    qty: item.qty,
    unit: candidate?.unit ?? null,
    unitPrice: currentUnit?.value ?? null,
    unitPriceLabel: currentUnit?.label ?? null,
    sourceUrl: quote.sourceUrl ?? null,
    code: candidate?.code ?? null,
  };
  const last = stored[stored.length - 1];
  const shouldAppendCurrent = !last || last.price !== currentSnapshot.price || last.productName !== currentSnapshot.productName || extractUnitMetricLabel(last.unitPriceLabel) !== extractUnitMetricLabel(currentSnapshot.unitPriceLabel);
  const snapshots = (shouldAppendCurrent ? [...stored, currentSnapshot] : stored.length ? stored : [currentSnapshot]).slice(-30);
  if (!snapshots.length) return null;

  const latestUnitLabel = currentUnit?.unitLabel ?? extractUnitMetricLabel(snapshots[snapshots.length - 1].unitPriceLabel);
  const unitCompatible = Boolean(latestUnitLabel) && snapshots.every(snapshot => {
    if (snapshot.unitPrice == null || !Number.isFinite(snapshot.unitPrice)) return false;
    return extractUnitMetricLabel(snapshot.unitPriceLabel) === latestUnitLabel;
  });
  const metricMode: 'unit' | 'raw' = unitCompatible ? 'unit' : 'raw';
  const metricLabel = metricMode === 'unit' ? latestUnitLabel! : '商品總價';
  const basisLabel = metricMode === 'unit'
    ? `${metricLabel}評估，並轉成價格指數（第一筆 = 100）`
    : '缺少穩定規格時，以商品總價轉成價格指數（第一筆 = 100）';

  const actualPoints = snapshots.map(snapshot => ({
    label: formatTrendDate(snapshot.capturedAt),
    capturedAt: snapshot.capturedAt,
    rawPrice: snapshot.price,
    metricValue: metricMode === 'unit' ? Number(snapshot.unitPrice) : snapshot.price,
    indexValue: 100,
  })).filter(point => Number.isFinite(point.metricValue) && point.metricValue > 0);
  if (!actualPoints.length) return null;

  const baseValue = actualPoints[0].metricValue || 1;
  const normalizedActual = actualPoints.map(point => ({
    ...point,
    indexValue: (point.metricValue / baseValue) * 100,
  }));
  const forecast = predictNextMetricValue(normalizedActual);
  const forecastIndex = baseValue > 0 ? (forecast.value / baseValue) * 100 : 100;
  const forecastPoint: PriceTrendChartPoint = {
    label: '下次預估',
    capturedAt: new Date(new Date(normalizedActual[normalizedActual.length - 1].capturedAt).getTime() + medianPositiveGap(normalizedActual) * 24 * 60 * 60 * 1000).toISOString(),
    rawPrice: metricMode === 'raw' ? forecast.value : quote.price,
    metricValue: forecast.value,
    indexValue: forecastIndex,
    isForecast: true,
  };
  const latest = normalizedActual[normalizedActual.length - 1];
  const changePercent = normalizedActual.length >= 2 ? latest.indexValue - normalizedActual[0].indexValue : 0;
  const summaryLabel = normalizedActual.length >= 2
    ? `目前較第一筆${changePercent >= 0 ? '上升' : '下降'} ${Math.abs(changePercent).toFixed(1)}%`
    : '目前只有一筆紀錄，趨勢會在後續更新後更準確';

  return {
    metricMode,
    metricLabel,
    basisLabel,
    actualCount: normalizedActual.length,
    points: [...normalizedActual, forecastPoint],
    forecastValue: forecast.value,
    forecastIndex,
    confidenceLabel: forecast.confidenceLabel,
    methodLabel: forecast.methodLabel,
    summaryLabel,
  };
};

const PriceTrendLineChart = ({ series }: { series: PriceTrendSeries }) => {
  const width = 520;
  const height = 190;
  const padX = 38;
  const padY = 26;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  const values = series.points.map(point => point.indexValue).filter(Number.isFinite);
  const minValue = Math.min(...values, 96);
  const maxValue = Math.max(...values, 104);
  const range = Math.max(1, maxValue - minValue);
  const x = (index: number) => padX + (series.points.length <= 1 ? plotW / 2 : (plotW * index) / (series.points.length - 1));
  const y = (value: number) => padY + plotH - ((value - minValue) / range) * plotH;
  const actualPoints = series.points.filter(point => !point.isForecast);
  const actualString = actualPoints.map((point, index) => `${x(index)},${y(point.indexValue)}`).join(' ');
  const forecastStartIndex = Math.max(0, actualPoints.length - 1);
  const forecastString = series.points.slice(forecastStartIndex).map((point, offset) => `${x(forecastStartIndex + offset)},${y(point.indexValue)}`).join(' ');
  const ticks = [minValue, (minValue + maxValue) / 2, maxValue];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full overflow-visible" role="img" aria-label="價格趨勢圖">
      <rect x={0} y={0} width={width} height={height} rx={18} className="fill-slate-50" />
      {ticks.map((tick, index) => (
        <g key={`tick-${index}`}>
          <line x1={padX} x2={width - padX} y1={y(tick)} y2={y(tick)} className="stroke-slate-200" strokeDasharray="4 4" />
          <text x={10} y={y(tick) + 4} className="fill-slate-400 text-[10px] font-bold">{tick.toFixed(0)}</text>
        </g>
      ))}
      {actualString && <polyline points={actualString} fill="none" className="stroke-sky-500" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
      {series.points.length > actualPoints.length && <polyline points={forecastString} fill="none" className="stroke-amber-500" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="7 6" />}
      {series.points.map((point, index) => (
        <g key={`${point.label}-${index}`}>
          <circle cx={x(index)} cy={y(point.indexValue)} r={point.isForecast ? 5 : 4} className={point.isForecast ? 'fill-amber-500 stroke-white' : 'fill-sky-500 stroke-white'} strokeWidth={2} />
          <text x={x(index)} y={height - 8} textAnchor="middle" className="fill-slate-400 text-[10px] font-bold">{point.label}</text>
        </g>
      ))}
    </svg>
  );
};

const getChannelQuote = (
  item: ShoppingItem,
  channel: ConcreteShoppingChannel,
  scrapedResult?: PxmartCandidateResult
): ChannelQuote => {
  if (isScrapedPriceChannel(channel)) {
    const effective = getEffectiveScrapedCandidate(scrapedResult);
    const price = scrapedResult ? (scrapedResult.price ?? null) : null;
    return {
      ...CHANNEL_META[channel],
      price,
      priceDisplay: scrapedResult ? normalizePriceDisplay(scrapedResult.priceDisplay) : '…',
      sourceName: effective?.itemName ?? null,
      sourceUrl: effective?.sourceUrl ?? null,
    };
  }

  if (channel === 'FOODPANDA' || channel === 'UBEREATS') {
    return {
      ...CHANNEL_META[channel],
      price: null,
      priceDisplay: '依平台顯示',
      sourceUrl: getItemSearchUrl(priceSearchQuery(item.name), channel),
    };
  }

  const physicalBase = Math.min(item.pricePX, item.priceCarrefour);
  const prices: Record<Exclude<ConcreteShoppingChannel, 'FOODPANDA' | 'UBEREATS'>, number> = {
    PX:         item.pricePX,
    CARREFOUR:  item.priceCarrefour,
    AMART:      Math.round(physicalBase * 0.97),   // 量販略便宜
    RTMART:     Math.round(physicalBase * 0.94),   // 大型量販最優惠
    WELLCOME:   Math.round(item.pricePX * 1.04),   // 社區超市微貴
  };

  return {
    ...CHANNEL_META[channel],
    price: prices[channel],
    priceDisplay: formatMoney(prices[channel]),
  };
};

interface ShoppingViewProps {
  items: ShoppingItem[];
  setItems: React.Dispatch<React.SetStateAction<ShoppingItem[]>>;
  onRemoveLinkedRestock?: (ingredientId: string) => void;
  onCreateItem?: (item: ShoppingItem) => void;
  onDeleteItem?: (item: ShoppingItem) => void;
  onUpdateQty?: (item: ShoppingItem, qty: number) => void;
}

export default function ShoppingView({
  items,
  setItems,
  onRemoveLinkedRestock,
  onCreateItem,
  onDeleteItem,
  onUpdateQty,
}: ShoppingViewProps) {
  const [storeItemExclusions, setStoreItemExclusions] = useState<Record<ConcreteShoppingChannel, string[]>>({
    PX: [],
    CARREFOUR: [],
    AMART: [],
    RTMART: [],
    WELLCOME: [],
    FOODPANDA: [],
    UBEREATS: [],
  });

  const [pxmartSelections, setPxmartSelections] = useState<Record<string, PriceSelection>>(loadPxmartSelections);
  const [pxmartQuotes, setPxmartQuotes] = useState<Record<string, PxmartQuoteState>>({});
  const [carrefourSelections, setCarrefourSelections] = useState<Record<string, PriceSelection>>(loadCarrefourSelections);
  const [carrefourQuotes, setCarrefourQuotes] = useState<Record<string, PxmartQuoteState>>({});
  const [simplemartSelections, setSimplemartSelections] = useState<Record<string, PriceSelection>>(loadSimplemartSelections);
  const [simplemartQuotes, setSimplemartQuotes] = useState<Record<string, PxmartQuoteState>>({});
  const [pxmartCandidateSort, setPxmartCandidateSort] = useState<PxmartCandidateSortMode>(loadPxmartCandidateSort);
  const [pricePickerItem, setPricePickerItem] = useState<ShoppingItem | null>(null);
  const [carrefourPickerItem, setCarrefourPickerItem] = useState<ShoppingItem | null>(null);
  const [simplemartPickerItem, setSimplemartPickerItem] = useState<ShoppingItem | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryStore>(loadPriceHistory);
  const [trendViewer, setTrendViewer] = useState<PriceTrendViewerTarget | null>(null);
  const [deletedStack, setDeletedStack] = useState<{ item: ShoppingItem; index: number }[]>([]);
  useEffect(() => {
    let cancelled = false;
    userStateApi.getMany<Record<string, unknown>>([...SHOPPING_STATE_KEYS])
      .then(state => {
        if (cancelled) return;
        if (state[PXMART_SELECTION_STORAGE_KEY]) setPxmartSelections(state[PXMART_SELECTION_STORAGE_KEY] as Record<string, PriceSelection>);
        if (state[CARREFOUR_SELECTION_STORAGE_KEY]) setCarrefourSelections(state[CARREFOUR_SELECTION_STORAGE_KEY] as Record<string, PriceSelection>);
        if (state[SIMPLEMART_SELECTION_STORAGE_KEY]) setSimplemartSelections(state[SIMPLEMART_SELECTION_STORAGE_KEY] as Record<string, PriceSelection>);
        if (state[PXMART_QUOTE_CACHE_STORAGE_KEY]) pxmartQuoteCacheStore = state[PXMART_QUOTE_CACHE_STORAGE_KEY] as Record<string, PxmartCachedQuote>;
        if (state[CARREFOUR_QUOTE_CACHE_STORAGE_KEY]) carrefourQuoteCacheStore = state[CARREFOUR_QUOTE_CACHE_STORAGE_KEY] as Record<string, PxmartCachedQuote>;
        if (state[SIMPLEMART_QUOTE_CACHE_STORAGE_KEY]) simplemartQuoteCacheStore = state[SIMPLEMART_QUOTE_CACHE_STORAGE_KEY] as Record<string, PxmartCachedQuote>;
        if (state[PRICE_HISTORY_STORAGE_KEY]) setPriceHistory(state[PRICE_HISTORY_STORAGE_KEY] as PriceHistoryStore);
        if (state[STORE_ITEM_EXCLUSIONS_STATE_KEY]) {
          setStoreItemExclusions(prev => ({
            ...prev,
            ...(state[STORE_ITEM_EXCLUSIONS_STATE_KEY] as Partial<Record<ConcreteShoppingChannel, string[]>>),
          }));
        }
        const sortMode = state[PXMART_SORT_STORAGE_KEY];
        if (sortMode === 'price' || sortMode === 'unit' || sortMode === 'name') setPxmartCandidateSort(sortMode);
        if (Array.isArray(state[DELETED_STACK_STATE_KEY])) {
          setDeletedStack(state[DELETED_STACK_STATE_KEY] as { item: ShoppingItem; index: number }[]);
        }
      })
      .catch(err => console.error('讀取採購頁狀態失敗：', err));
    return () => { cancelled = true; };
  }, []);

  const updatePxmartCandidateSort = (mode: PxmartCandidateSortMode) => {
    setPxmartCandidateSort(mode);
    savePxmartCandidateSort(mode);
  };

  const getSavedPxmartSelection = (item: ShoppingItem) => getSelectionForItem(pxmartSelections, item);
  const getSavedCarrefourSelection = (item: ShoppingItem) => getSelectionForItem(carrefourSelections, item);
  const getSavedSimplemartSelection = (item: ShoppingItem) => getSelectionForItem(simplemartSelections, item);
  const pxmartLoadKey = items
    .map(item => `${item.id}:${item.name}:${getSavedPxmartSelection(item)?.itemName ?? ''}`)
    .join('|');
  const carrefourLoadKey = items
    .map(item => `${item.id}:${item.name}:${getSavedCarrefourSelection(item)?.itemName ?? ''}`)
    .join('|');
  const simplemartLoadKey = items
    .map(item => `${item.id}:${item.name}:${getSavedSimplemartSelection(item)?.itemName ?? ''}`)
    .join('|');

  const loadPxmartQuote = (item: ShoppingItem, refresh = false) => {
    const selectedName = getSavedPxmartSelection(item)?.itemName;

    if (refresh) {
      clearCachedPxmartQuote(item.name, selectedName);
    }

    if (!refresh) {
      const cached = getCachedPxmartQuote(item.name, selectedName);
      if (cached) {
        setPxmartQuotes(prev => ({
          ...prev,
          [item.id]: { loading: false, result: cached },
        }));
        return Promise.resolve(cached);
      }
    }

    setPxmartQuotes(prev => ({
      ...prev,
      [item.id]: { loading: true, result: prev[item.id]?.result },
    }));

    return pricesApi.pxmartCandidates({
      name: priceSearchQuery(item.name),
      selectedName,
      maxPages: 2,
      refresh,
    })
      .then(result => {
        setCachedPxmartQuote(item.name, selectedName, result);
        setPxmartQuotes(prev => ({
          ...prev,
          [item.id]: { loading: false, result },
        }));
        return result;
      })
      .catch(err => {
        console.error('讀取全聯商品價格失敗：', err);
        setPxmartQuotes(prev => ({
          ...prev,
          [item.id]: { loading: false, result: prev[item.id]?.result, error: err instanceof Error ? err.message : '讀取失敗' },
        }));
        return null;
      });
  };

  useEffect(() => {
    let cancelled = false;

    items.forEach(item => {
      const selectedName = getSavedPxmartSelection(item)?.itemName;
      const cached = getCachedPxmartQuote(item.name, selectedName);

      if (cached) {
        setPxmartQuotes(prev => ({
          ...prev,
          [item.id]: { loading: false, result: cached },
        }));
        return;
      }

      setPxmartQuotes(prev => ({
        ...prev,
        [item.id]: { loading: true, result: prev[item.id]?.result },
      }));

      pricesApi.pxmartCandidates({ name: priceSearchQuery(item.name), selectedName, maxPages: 2 })
        .then(result => {
          if (cancelled) return;
          setCachedPxmartQuote(item.name, selectedName, result);
          setPxmartQuotes(prev => ({
            ...prev,
            [item.id]: { loading: false, result },
          }));
        })
        .catch(err => {
          if (cancelled) return;
          console.error('讀取全聯商品價格失敗：', err);
          setPxmartQuotes(prev => ({
            ...prev,
            [item.id]: { loading: false, result: prev[item.id]?.result, error: err instanceof Error ? err.message : '讀取失敗' },
          }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [pxmartLoadKey]);

  const selectPxmartCandidate = (item: ShoppingItem, candidate: PriceRecord) => {
    const next = saveSelectionForItem(pxmartSelections, item, {
      itemName: candidate.itemName,
      sourceUrl: candidate.sourceUrl,
      selectedAt: new Date().toISOString(),
    });
    setPxmartSelections(next);
    savePxmartSelections(next);

    const current = pxmartQuotes[item.id]?.result;
    if (current) {
      const selectedResult = rebuildPxmartSelectionResult(current, priceSearchQuery(item.name), candidate.itemName);
      setCachedPxmartQuote(item.name, candidate.itemName, selectedResult);
      setPxmartQuotes(prev => ({
        ...prev,
        [item.id]: { loading: false, result: selectedResult },
      }));
    }

    setPricePickerItem(null);
  };

  const clearPxmartSelection = (item: ShoppingItem) => {
    const next = removeSelectionForItem(pxmartSelections, item);
    setPxmartSelections(next);
    savePxmartSelections(next);

    const current = pxmartQuotes[item.id]?.result;
    if (current) {
      const cheapestResult = rebuildPxmartSelectionResult(current, priceSearchQuery(item.name));
      setCachedPxmartQuote(item.name, undefined, cheapestResult);
      setPxmartQuotes(prev => ({
        ...prev,
        [item.id]: { loading: false, result: cheapestResult },
      }));
    }
  };

  const loadCarrefourQuote = (item: ShoppingItem, refresh = false) => {
    const selectedName = getSavedCarrefourSelection(item)?.itemName;

    if (!refresh) {
      const cached = getCachedCarrefourQuote(item.name, selectedName);
      if (cached) {
        setCarrefourQuotes(prev => ({
          ...prev,
          [item.id]: { loading: false, result: cached },
        }));
        return Promise.resolve(cached);
      }
    }

    setCarrefourQuotes(prev => ({
      ...prev,
      [item.id]: { loading: true, result: prev[item.id]?.result },
    }));

    return pricesApi.carrefourCandidates({
      name: priceSearchQuery(item.name),
      selectedName,
      maxPages: 2,
      refresh,
    })
      .then(result => {
        setCachedCarrefourQuote(item.name, selectedName, result);
        setCarrefourQuotes(prev => ({
          ...prev,
          [item.id]: { loading: false, result },
        }));
        return result;
      })
      .catch(err => {
        console.error('讀取家樂福商品價格失敗：', err);
        setCarrefourQuotes(prev => ({
          ...prev,
          [item.id]: { loading: false, result: prev[item.id]?.result, error: err instanceof Error ? err.message : '讀取失敗' },
        }));
        return null;
      });
  };

  useEffect(() => {
    let cancelled = false;

    items.forEach(item => {
      const selectedName = getSavedCarrefourSelection(item)?.itemName;
      const cached = getCachedCarrefourQuote(item.name, selectedName);

      if (cached) {
        setCarrefourQuotes(prev => ({
          ...prev,
          [item.id]: { loading: false, result: cached },
        }));
        return;
      }

      setCarrefourQuotes(prev => ({
        ...prev,
        [item.id]: { loading: true, result: prev[item.id]?.result },
      }));

      pricesApi.carrefourCandidates({ name: priceSearchQuery(item.name), selectedName, maxPages: 2 })
        .then(result => {
          if (cancelled) return;
          setCachedCarrefourQuote(item.name, selectedName, result);
          setCarrefourQuotes(prev => ({
            ...prev,
            [item.id]: { loading: false, result },
          }));
        })
        .catch(err => {
          if (cancelled) return;
          console.error('讀取家樂福商品價格失敗：', err);
          setCarrefourQuotes(prev => ({
            ...prev,
            [item.id]: { loading: false, result: prev[item.id]?.result, error: err instanceof Error ? err.message : '讀取失敗' },
          }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [carrefourLoadKey]);

  const selectCarrefourCandidate = (item: ShoppingItem, candidate: PriceRecord) => {
    const next = saveSelectionForItem(carrefourSelections, item, {
      itemName: candidate.itemName,
      sourceUrl: candidate.sourceUrl,
      selectedAt: new Date().toISOString(),
    });
    setCarrefourSelections(next);
    saveCarrefourSelections(next);

    const current = carrefourQuotes[item.id]?.result;
    if (current) {
      const selectedResult = rebuildPxmartSelectionResult(current, priceSearchQuery(item.name), candidate.itemName);
      setCachedCarrefourQuote(item.name, candidate.itemName, selectedResult);
      setCarrefourQuotes(prev => ({
        ...prev,
        [item.id]: { loading: false, result: selectedResult },
      }));
    }

    setCarrefourPickerItem(null);
  };

  const clearCarrefourSelection = (item: ShoppingItem) => {
    const next = removeSelectionForItem(carrefourSelections, item);
    setCarrefourSelections(next);
    saveCarrefourSelections(next);

    const current = carrefourQuotes[item.id]?.result;
    if (current) {
      const cheapestResult = rebuildPxmartSelectionResult(current, priceSearchQuery(item.name));
      setCachedCarrefourQuote(item.name, undefined, cheapestResult);
      setCarrefourQuotes(prev => ({
        ...prev,
        [item.id]: { loading: false, result: cheapestResult },
      }));
    }
  };


  const loadSimplemartQuote = (item: ShoppingItem, refresh = false) => {
    const selectedName = getSavedSimplemartSelection(item)?.itemName;

    if (!refresh) {
      const cached = getCachedSimplemartQuote(item.name, selectedName);
      if (cached) {
        setSimplemartQuotes(prev => ({
          ...prev,
          [item.id]: { loading: false, result: cached },
        }));
        return Promise.resolve(cached);
      }
    }

    setSimplemartQuotes(prev => ({
      ...prev,
      [item.id]: { loading: true, result: prev[item.id]?.result },
    }));

    return pricesApi.simplemartCandidates({
      name: priceSearchQuery(item.name),
      selectedName,
      maxPages: 2,
      refresh,
    })
      .then(result => {
        setCachedSimplemartQuote(item.name, selectedName, result);
        setSimplemartQuotes(prev => ({
          ...prev,
          [item.id]: { loading: false, result },
        }));
        return result;
      })
      .catch(err => {
        console.error('讀取美廉社商品價格失敗：', err);
        setSimplemartQuotes(prev => ({
          ...prev,
          [item.id]: { loading: false, result: prev[item.id]?.result, error: err instanceof Error ? err.message : '讀取失敗' },
        }));
        return null;
      });
  };

  useEffect(() => {
    let cancelled = false;

    items.forEach(item => {
      const selectedName = getSavedSimplemartSelection(item)?.itemName;
      const cached = getCachedSimplemartQuote(item.name, selectedName);

      if (cached) {
        setSimplemartQuotes(prev => ({
          ...prev,
          [item.id]: { loading: false, result: cached },
        }));
        return;
      }

      setSimplemartQuotes(prev => ({
        ...prev,
        [item.id]: { loading: true, result: prev[item.id]?.result },
      }));

      pricesApi.simplemartCandidates({ name: priceSearchQuery(item.name), selectedName, maxPages: 2 })
        .then(result => {
          if (cancelled) return;
          setCachedSimplemartQuote(item.name, selectedName, result);
          setSimplemartQuotes(prev => ({
            ...prev,
            [item.id]: { loading: false, result },
          }));
        })
        .catch(err => {
          if (cancelled) return;
          console.error('讀取美廉社商品價格失敗：', err);
          setSimplemartQuotes(prev => ({
            ...prev,
            [item.id]: { loading: false, result: prev[item.id]?.result, error: err instanceof Error ? err.message : '讀取失敗' },
          }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [simplemartLoadKey]);

  const selectSimplemartCandidate = (item: ShoppingItem, candidate: PriceRecord) => {
    const next = saveSelectionForItem(simplemartSelections, item, {
      itemName: candidate.itemName,
      sourceUrl: candidate.sourceUrl,
      selectedAt: new Date().toISOString(),
    });
    setSimplemartSelections(next);
    saveSimplemartSelections(next);

    const current = simplemartQuotes[item.id]?.result;
    if (current) {
      const selectedResult = rebuildPxmartSelectionResult(current, priceSearchQuery(item.name), candidate.itemName);
      setCachedSimplemartQuote(item.name, candidate.itemName, selectedResult);
      setSimplemartQuotes(prev => ({
        ...prev,
        [item.id]: { loading: false, result: selectedResult },
      }));
    }

    setSimplemartPickerItem(null);
  };

  const clearSimplemartSelection = (item: ShoppingItem) => {
    const next = removeSelectionForItem(simplemartSelections, item);
    setSimplemartSelections(next);
    saveSimplemartSelections(next);

    const current = simplemartQuotes[item.id]?.result;
    if (current) {
      const cheapestResult = rebuildPxmartSelectionResult(current, priceSearchQuery(item.name));
      setCachedSimplemartQuote(item.name, undefined, cheapestResult);
      setSimplemartQuotes(prev => ({
        ...prev,
        [item.id]: { loading: false, result: cheapestResult },
      }));
    }
  };

  const getPxmartResult = (item: ShoppingItem) => pxmartQuotes[item.id]?.result;
  const getCarrefourResult = (item: ShoppingItem) => carrefourQuotes[item.id]?.result;
  const getSimplemartResult = (item: ShoppingItem) => simplemartQuotes[item.id]?.result;
  const getScrapedResultForChannel = (item: ShoppingItem, channel: ConcreteShoppingChannel) => {
    if (channel === 'PX') return getPxmartResult(item);
    if (channel === 'CARREFOUR') return getCarrefourResult(item);
    if (channel === 'AMART') return getSimplemartResult(item);
    return undefined;
  };

  const getScrapedQuoteStateForChannel = (item: ShoppingItem, channel: ConcreteShoppingChannel) => {
    if (channel === 'PX') return pxmartQuotes[item.id];
    if (channel === 'CARREFOUR') return carrefourQuotes[item.id];
    if (channel === 'AMART') return simplemartQuotes[item.id];
    return undefined;
  };

  const getSavedSelectionForChannel = (item: ShoppingItem, channel: ConcreteShoppingChannel) => {
    if (channel === 'PX') return getSavedPxmartSelection(item);
    if (channel === 'CARREFOUR') return getSavedCarrefourSelection(item);
    if (channel === 'AMART') return getSavedSimplemartSelection(item);
    return undefined;
  };

  const openPricePickerForChannel = (item: ShoppingItem, channel: ConcreteShoppingChannel) => {
    if (channel === 'PX') {
      setPricePickerItem(item);
      if (!pxmartQuotes[item.id]?.result && !pxmartQuotes[item.id]?.loading) loadPxmartQuote(item);
      return;
    }
    if (channel === 'CARREFOUR') {
      setCarrefourPickerItem(item);
      if (!carrefourQuotes[item.id]?.result && !carrefourQuotes[item.id]?.loading) loadCarrefourQuote(item);
      return;
    }
    if (channel === 'AMART') {
      setSimplemartPickerItem(item);
      if (!simplemartQuotes[item.id]?.result && !simplemartQuotes[item.id]?.loading) loadSimplemartQuote(item);
    }
  };

  const priceActionLabel = (_quote?: ChannelQuote, _hasSavedSelection?: boolean) => '更換商品';

  const priceHistorySignature = items
    .flatMap(item => SCRAPED_PRICE_CHANNELS.map(channel => {
      const result = getScrapedResultForChannel(item, channel);
      const quote = getChannelQuote(item, channel, result);
      return `${item.id}:${channel}:${quote.sourceName ?? ''}:${quote.price ?? ''}:${quote.sourceUrl ?? ''}`;
    }))
    .join('|');

  useEffect(() => {
    setPriceHistory(prev => {
      let next = prev;
      items.forEach(item => {
        SCRAPED_PRICE_CHANNELS.forEach(channel => {
          const result = getScrapedResultForChannel(item, channel);
          const quote = getChannelQuote(item, channel, result);
          next = appendPriceHistorySnapshot(next, item, channel, quote, getEffectiveScrapedCandidate(result));
        });
      });

      if (next !== prev) savePriceHistory(next);
      return next;
    });
  }, [priceHistorySignature]);

  const physicalChannels: ConcreteShoppingChannel[] = SHOPPING_CHANNEL_TAGS.filter(ch => CHANNEL_META[ch].mode === '實體');

  const baseStoreReceipts = SHOPPING_CHANNEL_TAGS.map(channel => {
    const excludedIds = new Set(storeItemExclusions[channel]);
    const rows = items.filter(item => !excludedIds.has(item.id)).map(item => {
      const quote = getChannelQuote(item, channel, getScrapedResultForChannel(item, channel));
      return {
        item,
        quote,
        subtotal: quote.price == null ? null : quote.price * item.qty,
      };
    });

    const missingCount = rows.filter(row => row.subtotal == null).length;
    const partialTotal = rows.reduce((sum, row) => sum + (row.subtotal ?? 0), 0);
    return {
      channel,
      meta: CHANNEL_META[channel],
      rows,
      total: missingCount === 0 ? partialTotal : null,
      partialTotal,
      missingCount,
    };
  });
  const comparableReceipts = baseStoreReceipts.filter(receipt => receipt.rows.length > 0 && receipt.total != null);
  // CP 值最高（最便宜）只在「實體通路」之間比較；外送平台不參與 CP 值判定。
  const physicalComparable = comparableReceipts.filter(receipt => receipt.meta.mode === '實體');
  const cheapestPhysicalTag = physicalComparable.length
    ? physicalComparable.reduce((a, b) => ((b.total ?? Infinity) < (a.total ?? Infinity) ? b : a)).channel
    : null;
  const storeReceipts = baseStoreReceipts.map(receipt => ({
    ...receipt,
    isCheapest: receipt.meta.mode === '實體' && cheapestPhysicalTag === receipt.channel,
  }));
  const deliveryReceipts = storeReceipts.filter(r => r.meta.mode === '外送');

  // Custom dialog state to add new shopping targets
  const [showAddItem, setShowAddItem] = useState(false);
  const [targetName, setTargetName] = useState('');
  const [targetCat, setTargetCat] = useState('蔬菜類');
  const [targetUnit, setTargetUnit] = useState('包');

  // 嵌入式地圖：結合通路資訊卡與地圖介面，顯示該實體通路附近門市的位置分布
  const [mapModalTag, setMapModalTag] = useState<ShoppingChannel | null>(null);
  const physicalChannelOptions = CHANNEL_GROUPS.flatMap(group => group.channels).filter(ch => Boolean(ch.mapQuery));
  const activeMapChannel = physicalChannelOptions.find(ch => ch.tag === mapModalTag) ?? null;

  // 取得使用者目前位置，讓地圖開啟時以使用者所在地為中心顯示附近門市分布
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'granted' | 'denied'>('idle');
  // 已刪除品項的「堆疊」（後刪的在最上面），可一步步往回復原；一段時間沒動作就清掉
  useEffect(() => {
    if (!activeMapChannel || userCoords || locationStatus !== 'idle') return;
    if (!('geolocation' in navigator)) {
      setLocationStatus('denied');
      return;
    }

    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      position => {
        setUserCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationStatus('granted');
      },
      () => setLocationStatus('denied'),
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, [activeMapChannel, userCoords, locationStatus]);

  const mapSearchQuery = activeMapChannel
    ? (userCoords ? `${activeMapChannel.mapQuery} near ${userCoords.lat},${userCoords.lng}` : activeMapChannel.mapQuery!)
    : '';
  const activeMapChannelTotal = activeMapChannel
    ? storeReceipts.find(receipt => receipt.channel === activeMapChannel.tag)?.total ?? null
    : null;

  const trendViewerData = trendViewer ? (() => {
    const result = getScrapedResultForChannel(trendViewer.item, trendViewer.channel);
    const quote = getChannelQuote(trendViewer.item, trendViewer.channel, result);
    const candidate = getEffectiveScrapedCandidate(result);
    return {
      result,
      quote,
      candidate,
      series: buildPriceTrendSeries(priceHistory, trendViewer.item, trendViewer.channel, quote, candidate),
    };
  })() : null;

  // Quantity helpers
  const updateQty = (id: string, delta: number) => {
    const targetItem = items.find(item => item.id === id);
    if (!targetItem) return;
    const newQty = Math.max(1, targetItem.qty + delta);
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, qty: newQty };
      }
      return item;
    }));
    onUpdateQty?.(targetItem, newQty);
  };

  const removeItem = (id: string) => {
    const index = items.findIndex(item => item.id === id);
    if (index === -1) return;
    const targetItem = items[index];
    if (targetItem.source === 'restock' && targetItem.linkedIngredientId) {
      onRemoveLinkedRestock?.(targetItem.linkedIngredientId);
    } else {
      onDeleteItem?.(targetItem);
    }
    // 把被刪的品項與原位置壓進堆疊，讓使用者可以一步步「復原」
    setDeletedStack(prev => {
      const next = [...prev, { item: targetItem, index }];
      userStateApi.set(DELETED_STACK_STATE_KEY, next).catch(err => console.error('同步採購復原紀錄失敗：', err));
      return next;
    });
    setItems(prev => prev.filter(item => item.id !== id));
  };

  // 復原「上一步」：把堆疊最上面（最後刪的）那筆放回原本位置
  const undoRemove = () => {
    const last = deletedStack[deletedStack.length - 1];
    if (!last) return;
    setItems(prev => {
      const next = [...prev];
      next.splice(Math.min(last.index, next.length), 0, last.item);
      return next;
    });
    setDeletedStack(prev => {
      const next = prev.slice(0, -1);
      userStateApi.set(DELETED_STACK_STATE_KEY, next).catch(err => console.error('同步採購復原紀錄失敗：', err));
      return next;
    });
  };

  const removeStoreItem = (channel: ConcreteShoppingChannel, id: string) => {
    setStoreItemExclusions(prev => {
      const next = {
        ...prev,
        [channel]: prev[channel].includes(id) ? prev[channel] : [...prev[channel], id],
      };
      userStateApi.set(STORE_ITEM_EXCLUSIONS_STATE_KEY, next).catch(err => console.error('同步通路排除品項失敗：', err));
      return next;
    });
  };

  // 切換某通路是否計入此品項（剔除 / 復原）
  const toggleStoreItem = (channel: ConcreteShoppingChannel, id: string) => {
    setStoreItemExclusions(prev => {
      const next = {
        ...prev,
        [channel]: prev[channel].includes(id)
          ? prev[channel].filter(x => x !== id)
          : [...prev[channel], id],
      };
      userStateApi.set(STORE_ITEM_EXCLUSIONS_STATE_KEY, next).catch(err => console.error('同步通路排除品項失敗：', err));
      return next;
    });
  };

  const isStoreItemExcluded = (channel: ConcreteShoppingChannel, id: string) =>
    storeItemExclusions[channel].includes(id);

  // Add customized comparative item
  const handleAddShoppingItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetName.trim()) return;

    // Generate random mock pricing for channels
    const pxRandom = Math.floor(Math.random() * 150) + 50;
    const carrefourRandom = Math.floor(pxRandom * 0.95);

    const newItem: ShoppingItem = {
      id: `shop-custom-${Date.now()}`,
      name: targetName,
      category: targetCat,
      qty: 1,
      unit: targetUnit,
      pricePX: pxRandom,
      priceCarrefour: carrefourRandom,
      source: 'manual',
    };

    if (onCreateItem) {
      onCreateItem(newItem);
    } else {
      setItems(prev => [...prev, newItem]);
    }
    setTargetName('');
    setShowAddItem(false);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="font-sans font-bold text-2xl text-[var(--theme-text)] tracking-tight">我的智能採購清單</h2>
          <p className="text-slate-500 text-xs mt-0.5">智慧對比實體通路與外送平台，依情境選擇最適合的補貨方式</p>
        </div>

        <button
          onClick={() => setShowAddItem(true)}
          className="bg-[var(--theme-dark)] hover:bg-[var(--theme-main)] text-white rounded-lg font-semibold text-xs py-2 px-3.5 flex items-center gap-1.5 self-start md:self-auto cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>登記待買品項</span>
        </button>
      </div>

      {items.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl py-12 text-center text-slate-400 text-sm">
          <p>採購清單暫無品項，點右上角「登記待買品項」新增。</p>
          {/* 全部刪光時，這裡仍保留復原入口，避免「刪光就救不回來」 */}
          {deletedStack.length > 0 && (
            <button
              onClick={undoRemove}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--theme-dark)] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[var(--theme-main)] active:scale-95 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              復原上一步（還有 {deletedStack.length} 步）
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── 實體商店比價表格 ── */}
          <section className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-3 px-1">
              <h3 className="text-xl font-extrabold text-slate-900">實體商店</h3>
              <span className="text-[11px] font-bold text-slate-400">單位價格與歷史趨勢會在選定商品後自動追蹤</span>
            </div>

            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs text-sky-800 shadow-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-bold">不知道系統選到哪個商品？點每家通路的價格就能自己確認或更換。</p>
                <p className="text-[11px] font-semibold text-sky-600">選定後會保存紀錄，之後自動更新同一商品的價格。</p>
              </div>
            </div>

            {/* ── 手機版：改成卡片式，避免表格在小螢幕擠在一起 ── */}
            <div className="md:hidden space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {physicalChannels.map(ch => {
                  const receipt = storeReceipts.find(r => r.channel === ch)!;
                  return (
                    <div
                      key={ch}
                      className={`rounded-2xl border bg-white p-3 text-center shadow-sm ${receipt.isCheapest ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'}`}
                    >
                      <p className="text-[11px] font-extrabold" style={{ color: receipt.meta.brandColor ?? 'var(--theme-text)' }}>{receipt.meta.name}</p>
                      <p className={`mt-1 font-mono text-sm font-extrabold ${receipt.isCheapest ? 'text-amber-600' : 'text-slate-700'}`}>{formatMoney(receipt.total)}</p>
                      {receipt.isCheapest && <p className="mt-1 rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-extrabold text-white">最優</p>}
                    </div>
                  );
                })}
              </div>

              {items.map(item => {
                const cellData = physicalChannels.map(ch => {
                  const quote = getChannelQuote(item, ch, getScrapedResultForChannel(item, ch));
                  return { ch, quote, price: quote.price == null ? null : quote.price * item.qty };
                });
                const numericPrices = cellData.map(c => c.price).filter((value): value is number => value != null);
                const rowMin = numericPrices.length ? Math.min(...numericPrices) : null;

                return (
                  <section key={`mobile-${item.id}`} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold leading-snug text-slate-900">{item.name}</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-400">採買數量：{item.qty}{item.unit}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                          <button onClick={() => updateQty(item.id, -1)} className="px-2 py-1 text-slate-400 hover:bg-white hover:text-[var(--theme-text)] cursor-pointer">
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-6 border-x border-slate-200 py-1 text-center text-xs font-extrabold text-slate-800">{item.qty}</span>
                          <button onClick={() => updateQty(item.id, 1)} className="px-2 py-1 text-slate-400 hover:bg-white hover:text-[var(--theme-text)] cursor-pointer">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <button onClick={() => removeItem(item.id)} className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500 cursor-pointer" aria-label={`移除 ${item.name}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {cellData.map(({ ch, quote, price }) => {
                        const meta = CHANNEL_META[ch];
                        const isCheapest = price != null && rowMin != null && price === rowMin;
                        const excluded = isStoreItemExcluded(ch, item.id);
                        const scrapedState = getScrapedQuoteStateForChannel(item, ch);
                        const effectiveCandidate = getEffectiveScrapedCandidate(scrapedState?.result);
                        const unitPriceInfo = isScrapedPriceChannel(ch) ? getUnitPriceInfo(quote.price, effectiveCandidate?.unit, quote.sourceName) : null;
                        const trendInfo = isScrapedPriceChannel(ch) ? getPriceTrend(priceHistory, item, ch, quote) : null;
                        const displayPrice = price == null ? quote.priceDisplay : formatMoney(price);
                        const hasSavedSelection = Boolean(getSavedSelectionForChannel(item, ch));

                        return (
                          <div key={`${item.id}-${ch}-mobile`} className={`rounded-xl border p-3 ${excluded ? 'border-slate-100 bg-slate-50' : isCheapest ? 'border-amber-200 bg-amber-50/60' : 'border-slate-100 bg-white'}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-extrabold" style={{ color: meta.brandColor ?? 'var(--theme-text)' }}>{meta.name}</p>
                                {quote.sourceName ? (
                                  <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-slate-500" title={quote.sourceName}>{quote.sourceName}</p>
                                ) : (
                                  <p className="mt-1 text-[11px] font-semibold text-slate-400">尚未選定商品</p>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                {excluded ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleStoreItem(ch, item.id)}
                                    className="rounded-full bg-slate-200 px-3 py-1 text-[11px] font-bold text-slate-600 cursor-pointer"
                                  >
                                    加回
                                  </button>
                                ) : isScrapedPriceChannel(ch) ? (
                                  <button
                                    type="button"
                                    onClick={() => openPricePickerForChannel(item, ch)}
                                    className={`rounded-xl border px-3 py-2 text-right shadow-sm cursor-pointer ${isCheapest ? 'border-amber-300 bg-white text-amber-600' : 'border-slate-200 bg-slate-50 text-slate-800'}`}
                                  >
                                    <span className="block font-mono text-base font-extrabold tabular-nums">{scrapedState?.loading && !scrapedState.result ? '…' : displayPrice}</span>
                                    <span className="mt-0.5 block text-[10px] font-bold">{priceActionLabel(quote, hasSavedSelection)}</span>
                                  </button>
                                ) : (
                                  <span className={`font-mono text-base font-extrabold ${isCheapest ? 'text-amber-600' : 'text-slate-800'}`}>{displayPrice}</span>
                                )}
                              </div>
                            </div>

                            {!excluded && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {isCheapest && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-white">此品項最低</span>}
                                {unitPriceInfo && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500" title={unitPriceInfo.title}>{unitPriceInfo.label}</span>}
                                {trendInfo && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${trendClassName(trendInfo)}`}>{trendInfo.label}</span>}
                                {quote.sourceUrl && (
                                  <a href={quote.sourceUrl} target="_blank" rel="noopener noreferrer" className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">商品頁 ↗</a>
                                )}
                                {isScrapedPriceChannel(ch) && quote.price != null && quote.sourceName && (
                                  <button
                                    type="button"
                                    onClick={() => setTrendViewer({ item, channel: ch })}
                                    className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500 cursor-pointer hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600"
                                  >
                                    趨勢圖
                                  </button>
                                )}
                                <button onClick={() => toggleStoreItem(ch, item.id)} className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-400 cursor-pointer hover:border-rose-200 hover:text-rose-500">不在這買</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            {/* ── 桌機版比價表格 ── */}
            <div className="hidden md:block rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden">
              <table className="w-full table-fixed text-left border-collapse">
                <colgroup>
                  {/* 品項欄：30%；其餘三家均分剩下 70% */}
                  <col style={{ width: '30%' }} />
                  {physicalChannels.map(ch => (
                    <col key={ch} style={{ width: `${70 / physicalChannels.length}%` }} />
                  ))}
                </colgroup>

                {/* 表頭 */}
                <thead>
                  <tr className="border-b-2 border-slate-100">
                    <th className="bg-slate-50 px-3 py-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 text-left">
                      <div className="flex items-center justify-between gap-1.5">
                        <span>品項</span>
                        {/* 復原上一步（像 Word 回上一步）：對齊在垃圾桶上方，提示可按；有刪過才出現 */}
                        {deletedStack.length > 0 && (
                          <button
                            onClick={undoRemove}
                            title={`復原上一步（還有 ${deletedStack.length} 步可復原）`}
                            className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold normal-case tracking-normal text-slate-500 shadow-sm transition hover:border-[var(--theme-main)] hover:text-[var(--theme-main)] active:scale-95 cursor-pointer"
                          >
                            <RotateCcw className="h-2.5 w-2.5" />
                            復原
                            <span className="rounded-full bg-slate-100 px-1 text-[8px] font-bold text-slate-500">{deletedStack.length}</span>
                          </button>
                        )}
                      </div>
                    </th>
                    {physicalChannels.map(ch => {
                      const meta = CHANNEL_META[ch];
                      const mapCh = physicalChannelOptions.find(c => c.tag === ch);
                      const receipt = storeReceipts.find(r => r.channel === ch);
                      const isWinner = receipt?.isCheapest;
                      return (
                        <th
                          key={ch}
                          className={`px-2 pt-0 pb-2.5 text-center bg-slate-50 ${isWinner ? 'border-x-2 border-amber-400' : ''}`}
                          style={isWinner ? { borderTop: '3px solid #fbbf24' } : (meta.brandColor ? { borderTop: `3px solid ${meta.brandColor}` } : {})}
                        >
                          <div className="flex flex-col items-center gap-1 pt-2">
                            <span className="text-[11px] font-extrabold leading-tight" style={{ color: meta.brandColor ?? 'var(--theme-text)' }}>
                              {meta.name}
                            </span>
                            {mapCh?.mapQuery ? (
                              <button
                                onClick={() => setMapModalTag(ch)}
                                className="text-[9px] rounded-full border border-slate-200 bg-white px-1.5 py-0.5 font-bold text-slate-500 hover:bg-[var(--theme-tint)] hover:text-[var(--theme-text)] hover:border-[var(--theme-soft)] cursor-pointer whitespace-nowrap transition-colors"
                              >
                                前往門市
                              </button>
                            ) : (
                              <a href={meta.url} target="_blank" rel="noopener noreferrer" className="text-[9px] rounded-full border border-slate-200 bg-white px-1.5 py-0.5 font-bold text-slate-500 hover:bg-slate-50 whitespace-nowrap">
                                前往
                              </a>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                {/* 品項列 */}
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, rowIdx) => {
                    const cellData = physicalChannels.map(ch => {
                      const quote = getChannelQuote(item, ch, getScrapedResultForChannel(item, ch));
                      return {
                        ch,
                        quote,
                        price: quote.price == null ? null : quote.price * item.qty,
                      };
                    });
                    const numericPrices = cellData
                      .map(c => c.price)
                      .filter((value): value is number => value != null);
                    const rowMin = numericPrices.length ? Math.min(...numericPrices) : null;
                    return (
                      <tr key={item.id} className={`group ${rowIdx % 2 === 1 ? 'bg-slate-50/40' : ''}`}>
                        {/* 品項欄：手機名稱在上控制在下；電腦名稱在左、數量＋垃圾桶在右 */}
                        <td className="bg-white group-hover:bg-[var(--theme-tint)]/20 px-3 py-2.5 transition-colors align-middle">
                          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
                            <p className="text-xs font-bold text-slate-800 leading-snug break-words lg:flex-1">{item.name}</p>
                            <div className="flex items-center gap-1 lg:shrink-0">
                              <div className="flex items-center rounded-md border border-slate-200 bg-white overflow-hidden shrink-0">
                                <button onClick={() => updateQty(item.id, -1)} className="px-1 py-0.5 text-slate-400 hover:text-[var(--theme-text)] hover:bg-slate-50 cursor-pointer transition-colors">
                                  <Minus className="w-2.5 h-2.5" />
                                </button>
                                <span className="w-4 text-center text-[10px] font-extrabold text-slate-800 border-x border-slate-200 py-0.5">{item.qty}</span>
                                <button onClick={() => updateQty(item.id, 1)} className="px-1 py-0.5 text-slate-400 hover:text-[var(--theme-text)] hover:bg-slate-50 cursor-pointer transition-colors">
                                  <Plus className="w-2.5 h-2.5" />
                                </button>
                              </div>
                              <span className="text-[9px] text-slate-400 shrink-0">{item.unit}</span>
                              <button onClick={() => removeItem(item.id)} className="rounded p-0.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500 cursor-pointer transition-colors shrink-0" aria-label={`移除 ${item.name}`}>
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </td>
                        {/* 價格欄 */}
                        {cellData.map(({ ch, quote, price }) => {
                          const isCheapest = price != null && rowMin != null && price === rowMin;
                          const excluded = isStoreItemExcluded(ch, item.id);
                          const isWinnerCol = storeReceipts.find(r => r.channel === ch)?.isCheapest;
                          const displayPrice = price == null ? quote.priceDisplay : formatMoney(price);
                          const pxState = ch === 'PX' ? pxmartQuotes[item.id] : undefined;
                          const carrefourState = ch === 'CARREFOUR' ? carrefourQuotes[item.id] : undefined;
                          const simplemartState = ch === 'AMART' ? simplemartQuotes[item.id] : undefined;
                          const scrapedState = pxState ?? carrefourState ?? simplemartState;
                          const effectiveCandidate = getEffectiveScrapedCandidate(scrapedState?.result);
                          const unitPriceInfo = isScrapedPriceChannel(ch) ? getUnitPriceInfo(quote.price, effectiveCandidate?.unit, quote.sourceName) : null;
                          const trendInfo = isScrapedPriceChannel(ch) ? getPriceTrend(priceHistory, item, ch, quote) : null;
                          return (
                            <td key={ch} className={`px-2 py-2.5 text-center align-middle transition-colors group-hover:bg-[var(--theme-tint)]/20 ${isWinnerCol ? 'border-x-2 border-amber-400' : ''} ${excluded ? 'bg-slate-50/60' : ''}`}>
                              {excluded ? (
                                /* 已剔除：顯示劃線價格 + 加回按鈕 */
                                <div className="flex flex-col items-center gap-1">
                                  <span className="font-mono text-xs text-slate-300 line-through tabular-nums">{displayPrice}</span>
                                  <button
                                    onClick={() => toggleStoreItem(ch, item.id)}
                                    className="flex items-center gap-0.5 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500 hover:bg-[var(--theme-soft)] hover:text-[var(--theme-text)] cursor-pointer transition-colors"
                                    title={`將此品項加回 ${CHANNEL_META[ch].name}`}
                                  >
                                    <Plus className="w-2.5 h-2.5" /> 加回
                                  </button>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-1.5">
                                  {/* 價格：全聯/家樂福/美廉社欄可點選候選商品；其他通路維持原本估價邏輯 */}
                                  {isScrapedPriceChannel(ch) ? (
                                    <button
                                      type="button"
                                      onClick={() => openPricePickerForChannel(item, ch)}
                                      className={`rounded-lg border px-2 py-1 shadow-sm transition-colors cursor-pointer ${
                                        isCheapest
                                          ? 'border-amber-200 bg-amber-50 text-amber-600'
                                          : 'border-slate-200 bg-white text-slate-700 hover:border-[var(--theme-soft)] hover:bg-[var(--theme-tint)]'
                                      }`}
                                      title={`點選${CHANNEL_META[ch].name}價格，確認或更換取得的商品`}
                                    >
                                      <span className={`block font-mono font-extrabold tabular-nums ${isCheapest ? 'text-base' : 'text-sm'}`}>
                                        {scrapedState?.loading && !scrapedState.result ? '…' : displayPrice}
                                      </span>
                                      <span className="mt-0.5 block text-[9px] font-bold leading-none">
                                        {priceActionLabel(quote, Boolean(getSavedSelectionForChannel(item, ch)))}
                                      </span>
                                    </button>
                                  ) : (
                                    <div className="flex items-baseline justify-center gap-0.5">
                                      <span className={`font-mono font-extrabold tabular-nums ${isCheapest ? 'text-amber-600 text-base' : 'text-slate-700 text-sm'}`}>
                                        {displayPrice}
                                      </span>
                                      {isCheapest && <span className="text-amber-400 text-[10px] font-bold leading-none">★</span>}
                                    </div>
                                  )}
                                  {isScrapedPriceChannel(ch) && quote.sourceName && (
                                    <span className="max-w-[92px] truncate text-[9px] font-semibold text-slate-400" title={quote.sourceName}>
                                      {quote.sourceName}
                                    </span>
                                  )}
                                  {isScrapedPriceChannel(ch) && unitPriceInfo && (
                                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500" title={unitPriceInfo.title}>
                                      {unitPriceInfo.label}
                                    </span>
                                  )}
                                  {isScrapedPriceChannel(ch) && trendInfo && (
                                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${trendClassName(trendInfo)}`} title={trendInfo.latestAt ? `價格追蹤：${trendInfo.latestAt.slice(0, 16).replace('T', ' ')}` : '價格追蹤'}>
                                      {trendInfo.label}
                                    </span>
                                  )}
                                  {isScrapedPriceChannel(ch) && isCheapest && <span className="text-amber-400 text-[10px] font-bold leading-none">★</span>}
                                  {isScrapedPriceChannel(ch) && scrapedState?.error && (
                                    <span className="text-[9px] font-semibold text-rose-400" title={scrapedState.error}>讀取失敗</span>
                                  )}
                                  {/* 動作按鈕：搜尋 ↗ ｜ 剔除 × */}
                                  <div className="flex items-center justify-center gap-2">
                                    {isScrapedPriceChannel(ch) && quote.price != null && quote.sourceName && (
                                      <button
                                        type="button"
                                        onClick={() => setTrendViewer({ item, channel: ch })}
                                        className="flex items-center justify-center rounded-full border border-slate-200 px-2 py-0.5 text-[9px] font-bold text-slate-500 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600 cursor-pointer transition-colors"
                                        title="查看價格趨勢圖與下次預估"
                                      >
                                        趨勢
                                      </button>
                                    )}
                                    <a
                                      href={quote.sourceUrl ?? getItemSearchUrl(priceSearchQuery(item.name), ch)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center justify-center w-5 h-5 text-slate-500 hover:text-[var(--theme-text)] transition-colors"
                                      title={`在 ${CHANNEL_META[ch].name} 搜尋此品項`}
                                    >
                                      <span className="text-[12px] leading-none">↗</span>
                                    </a>
                                    <button
                                      onClick={() => toggleStoreItem(ch, item.id)}
                                      className="flex items-center justify-center w-5 h-5 text-slate-500 hover:text-rose-500 cursor-pointer transition-colors"
                                      title={`不在 ${CHANNEL_META[ch].name} 買此品項`}
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>

                {/* 總計列 */}
                <tfoot>
                  <tr className="border-t-2 border-slate-200">
                    <td className="bg-slate-100 px-3 py-3">
                      <span className="text-xs font-extrabold text-slate-700">總計</span>
                    </td>
                    {physicalChannels.map(ch => {
                      const receipt = storeReceipts.find(r => r.channel === ch)!;
                      return (
                        <td key={ch} className={`px-1 py-3 text-center bg-slate-100 ${receipt.isCheapest ? 'border-x-2 border-b-2 border-amber-400' : ''}`}>
                          <div className="flex flex-col items-center gap-1">
                            <span className={`font-mono font-extrabold tabular-nums ${receipt.isCheapest ? 'text-amber-600 text-base' : 'text-slate-700 text-sm'}`}>
                              {formatMoney(receipt.total)}
                            </span>
                            {receipt.isCheapest && (
                              <span className="flex items-center gap-0.5 rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-extrabold text-white animate-pulse shadow-sm">
                                <Crown className="w-2.5 h-2.5" />
                                <span className="hidden sm:inline">CP值 Win</span>
                                <span className="sm:hidden">最優</span>
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* ── 外送平台 ── */}
          <section className="space-y-3">
            <div className="flex items-baseline gap-3 px-1">
              <h3 className="text-xl font-extrabold text-slate-900">外送平台</h3>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
              {deliveryReceipts.map(receipt => (
                <motion.section
                  key={receipt.channel}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`overflow-hidden rounded-2xl bg-white transition-all ${
                    receipt.isCheapest
                      ? 'relative z-10 border-2 border-amber-400 shadow-xl shadow-amber-100 ring-4 ring-amber-100'
                      : 'border border-slate-150 shadow-sm'
                  }`}
                >
                  <div
                    className="border-b border-slate-100 px-3 py-3"
                    style={receipt.meta.brandBg
                      ? { backgroundColor: receipt.meta.brandBg, borderColor: 'transparent' }
                      : { backgroundColor: 'rgba(248,250,252,0.8)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4
                        className="text-base font-extrabold"
                        style={{ color: receipt.meta.brandNameColor ?? 'var(--theme-text)' }}
                      >
                        {receipt.meta.name}
                      </h4>
                      <a
                        href={receipt.meta.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors cursor-pointer border-white/30 bg-white/20 text-white hover:bg-white/35"
                      >
                        前往
                      </a>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[280px] text-left">
                      <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                          <th className="px-3 py-2">品項</th>
                          <th className="px-2 py-2 text-center">數量</th>
                          <th className="px-3 py-2 text-right">金額</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {receipt.rows.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-3 py-8 text-center text-xs font-semibold text-slate-400">
                              此平台已移除全部品項
                            </td>
                          </tr>
                        ) : receipt.rows.map(({ item, quote, subtotal }) => (
                          <tr key={`${receipt.channel}-${item.id}`} className="align-top">
                            <td className="px-3 py-3">
                              <p className="truncate text-xs font-extrabold text-slate-900">{item.name}</p>
                            </td>
                            <td className="px-2 py-3">
                              <div className="mx-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-1 py-0.5">
                                <button onClick={() => updateQty(item.id, -1)} className="rounded p-0.5 text-slate-400 hover:text-[var(--theme-text)] cursor-pointer">
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-5 text-center text-xs font-extrabold text-slate-800">{item.qty}</span>
                                <button onClick={() => updateQty(item.id, 1)} className="rounded p-0.5 text-slate-400 hover:text-[var(--theme-text)] cursor-pointer">
                                  <Plus className="w-3 h-3" />
                                </button>
                                <span className="pr-1 text-[10px] font-semibold text-slate-400">{item.unit}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-end gap-2">
                                <a
                                  href={getItemSearchUrl(item.name, receipt.channel)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-slate-400 hover:text-[var(--theme-text)] hover:underline whitespace-nowrap cursor-pointer"
                                >
                                  來源 ↗
                                </a>
                                <span className="font-mono text-sm font-extrabold text-[var(--theme-text)]">
                                  {subtotal == null ? quote.priceDisplay : formatMoney(subtotal)}
                                </span>
                                <button
                                  onClick={() => removeStoreItem(receipt.channel, item.id)}
                                  className="rounded p-1 text-slate-300 transition-colors hover:text-rose-500 cursor-pointer"
                                  aria-label={`從 ${receipt.meta.name} 移除 ${item.name}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className={`flex items-center justify-between border-t px-3 py-3 ${
                    receipt.isCheapest
                      ? 'border-amber-100 bg-gradient-to-r from-amber-50 to-yellow-50'
                      : 'border-slate-100 bg-white'
                  }`}>
                    <span className="text-xs font-extrabold text-slate-500">小計</span>
                    <div className="flex items-center gap-2">
                      {receipt.isCheapest && (
                        <span className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-400 px-3 py-1 text-xs font-extrabold text-white shadow-md animate-pulse">
                          <Crown className="w-3.5 h-3.5" />
                          CP值 Win
                        </span>
                      )}
                      <span className={`font-mono text-lg font-extrabold ${
                        receipt.isCheapest ? 'text-amber-600' : 'text-[var(--theme-text)]'
                      }`}>
                        {receipt.total == null ? '依平台顯示' : formatMoney(receipt.total)}
                        {receipt.missingCount > 0 && (
                          <span className="ml-1 text-xs font-normal text-slate-400">（{receipt.missingCount} 項不抓價格）</span>
                        )}
                      </span>
                    </div>
                  </div>
                </motion.section>
              ))}
            </div>
          </section>

        </div>
      )}

      {/* Manual Item modal drawer */}
      {showAddItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAddItem(false)} />
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white text-slate-800 rounded-2xl p-6 max-w-sm w-full relative z-10 border border-slate-100 shadow-2xl"
          >
            <h3 className="font-sans font-bold text-lg text-[var(--theme-text)] mb-4">登記自訂待買品項</h3>
            
            <form onSubmit={handleAddShoppingItem} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">商品名稱</label>
                <input 
                  type="text" 
                  value={targetName} 
                  onChange={e => setTargetName(e.target.value)}
                  placeholder="如：熊本A5頂級霜降和牛"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">產品種類</label>
                  <select 
                    value={targetCat} 
                    onChange={e => setTargetCat(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none"
                  >
                    <option value="全榖雜糧類">全榖雜糧類</option>
                    <option value="蔬菜類">蔬菜類</option>
                    <option value="豆魚蛋肉類">豆魚蛋肉類</option>
                    <option value="乳品類">乳品類</option>
                    <option value="水果類">水果類</option>
                    <option value="油脂與堅果種子類">油脂與堅果種子類</option>
                    <option value="其他">其他</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">計價包裝</label>
                  <input 
                    type="text" 
                    value={targetUnit} 
                    onChange={e => setTargetUnit(e.target.value)}
                    placeholder="如：塊、包、瓶"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3 justify-end text-xs font-bold">
                <button 
                  type="button" 
                  onClick={() => setShowAddItem(false)}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 bg-[var(--theme-dark)] hover:bg-[var(--theme-main)] text-white rounded-lg cursor-pointer"
                >
                  確認添加
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* PXMart price picker: user-selected scraped item persists per user in DB by shopping item name. */}
      {pricePickerItem && (() => {
        const state = pxmartQuotes[pricePickerItem.id];
        const result = state?.result;
        const candidates = result?.candidates ?? [];
        const sortedCandidates = sortPxmartCandidates(candidates, pxmartCandidateSort);
        const savedSelection = getSavedPxmartSelection(pricePickerItem);
        const savedFound = !savedSelection || Boolean(result?.selected);

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPricePickerItem(null)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-100 bg-white text-slate-800 shadow-2xl sm:max-h-[82vh] sm:rounded-2xl"
            >
              <div className="border-b border-slate-100 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-sans text-lg font-bold text-[var(--theme-text)]">選擇全聯商品</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      採購品項：<span className="font-bold text-slate-700">{pricePickerItem.name}</span>
                    </p>
                    {priceSearchQuery(pricePickerItem.name) !== pricePickerItem.name.trim() && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        整理後搜尋名：<span className="font-semibold text-slate-500">{priceSearchQuery(pricePickerItem.name)}</span>
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-slate-400">
                      每 7 天才會重新取得價格；你選過的商品會保留，只要通路仍找得到就會繼續用它的最新價格。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPricePickerItem(null)}
                    className="shrink-0 rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-500">
                    目前價格：{state?.loading && !result ? '讀取中…' : result?.priceDisplay ?? '無'}
                  </span>
                  {result?.fromCache && <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-600">本週快取</span>}
                  {result?.refreshed && <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-600">剛更新</span>}
                  {savedSelection && !savedFound && (
                    <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-500">已選商品目前找不到，價格顯示「無」</span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadPxmartQuote(pricePickerItem, true)}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-500 transition-colors hover:border-[var(--theme-soft)] hover:bg-[var(--theme-tint)] hover:text-[var(--theme-text)] cursor-pointer"
                  >
                    重新抓取
                  </button>
                  {savedSelection && (
                    <button
                      type="button"
                      onClick={() => clearPxmartSelection(pricePickerItem)}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-500 transition-colors hover:border-amber-200 hover:bg-amber-50 hover:text-amber-600 cursor-pointer"
                    >
                      取消指定，改用最低價
                    </button>
                  )}
                  <label className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-500">
                    排序
                    <select
                      value={pxmartCandidateSort}
                      onChange={event => updatePxmartCandidateSort(event.target.value as PxmartCandidateSortMode)}
                      className="bg-transparent text-[11px] font-bold text-slate-600 outline-none cursor-pointer"
                    >
                      {PXMART_CANDIDATE_SORT_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="overflow-y-auto p-3 sm:p-3">
                {state?.loading && !result ? (
                  <div className="py-10 text-center text-xs font-semibold text-slate-400">正在讀取全聯候選商品…</div>
                ) : candidates.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs font-semibold text-slate-400">
                    目前找不到可用商品，這個品項在全聯價格會顯示「無」。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sortedCandidates.map(candidate => {
                      const isSelected = savedSelection?.itemName === candidate.itemName;
                      const unitPriceInfo = getUnitPriceInfo(candidate.price, candidate.unit, candidate.itemName);
                      return (
                        <button
                          key={`${candidate.itemName}-${candidate.price}-${candidate.unit ?? ''}`}
                          type="button"
                          onClick={() => selectPxmartCandidate(pricePickerItem, candidate)}
                          className={`w-full rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'border-[var(--theme-main)] bg-[var(--theme-tint)]'
                              : 'border-slate-100 bg-white hover:border-[var(--theme-soft)] hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold text-slate-800">{candidate.itemName}</p>
                              <p className="mt-1 text-[11px] text-slate-400">
                                {candidate.unit ? `規格：${candidate.unit}` : '規格：未標示'}
                                {candidate.crawledAt ? `｜更新：${candidate.crawledAt.slice(0, 10)}` : ''}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="font-mono text-sm font-extrabold text-[var(--theme-text)]">{formatMoney(candidate.price)}</p>
                              {unitPriceInfo && <p className="mt-1 text-[10px] font-bold text-slate-400">{unitPriceInfo.label}</p>}
                              {isSelected && <p className="mt-1 text-[10px] font-bold text-[var(--theme-text)]">✓ 已指定</p>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        );
      })()}

      {/* Carrefour price picker: same local-only cache/selection model as PXMart. */}
      {carrefourPickerItem && (() => {
        const state = carrefourQuotes[carrefourPickerItem.id];
        const result = state?.result;
        const candidates = result?.candidates ?? [];
        const sortedCandidates = sortPxmartCandidates(candidates, pxmartCandidateSort);
        const savedSelection = getSavedCarrefourSelection(carrefourPickerItem);
        const savedFound = !savedSelection || Boolean(result?.selected);

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCarrefourPickerItem(null)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-100 bg-white text-slate-800 shadow-2xl sm:max-h-[82vh] sm:rounded-2xl"
            >
              <div className="border-b border-slate-100 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-sans text-lg font-bold text-[var(--theme-text)]">選擇家樂福商品</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      採購品項：<span className="font-bold text-slate-700">{carrefourPickerItem.name}</span>
                    </p>
                    {priceSearchQuery(carrefourPickerItem.name) !== carrefourPickerItem.name.trim() && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        整理後搜尋名：<span className="font-semibold text-slate-500">{priceSearchQuery(carrefourPickerItem.name)}</span>
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-slate-400">
                      每 7 天才會重新取得價格；你選過的商品會保留，只要通路仍找得到就會繼續用它的最新價格。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCarrefourPickerItem(null)}
                    className="shrink-0 rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-500">
                    目前價格：{state?.loading && !result ? '讀取中…' : result?.priceDisplay ?? '無'}
                  </span>
                  {result?.fromCache && <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-600">本週快取</span>}
                  {result?.refreshed && <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-600">剛更新</span>}
                  {savedSelection && !savedFound && (
                    <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-500">已選商品目前找不到，價格顯示「無」</span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadCarrefourQuote(carrefourPickerItem, true)}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-500 transition-colors hover:border-[var(--theme-soft)] hover:bg-[var(--theme-tint)] hover:text-[var(--theme-text)] cursor-pointer"
                  >
                    重新抓取
                  </button>
                  {savedSelection && (
                    <button
                      type="button"
                      onClick={() => clearCarrefourSelection(carrefourPickerItem)}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-500 transition-colors hover:border-amber-200 hover:bg-amber-50 hover:text-amber-600 cursor-pointer"
                    >
                      取消指定，改用最低價
                    </button>
                  )}
                  <label className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-500">
                    排序
                    <select
                      value={pxmartCandidateSort}
                      onChange={event => updatePxmartCandidateSort(event.target.value as PxmartCandidateSortMode)}
                      className="bg-transparent text-[11px] font-bold text-slate-600 outline-none cursor-pointer"
                    >
                      {PXMART_CANDIDATE_SORT_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="overflow-y-auto p-3 sm:p-3">
                {state?.loading && !result ? (
                  <div className="py-10 text-center text-xs font-semibold text-slate-400">正在讀取家樂福候選商品…</div>
                ) : candidates.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs font-semibold text-slate-400">
                    目前找不到可用商品，這個品項在家樂福價格會顯示「無」。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sortedCandidates.map(candidate => {
                      const isSelected = savedSelection?.itemName === candidate.itemName;
                      const unitPriceInfo = getUnitPriceInfo(candidate.price, candidate.unit, candidate.itemName);
                      return (
                        <button
                          key={`${candidate.itemName}-${candidate.price}-${candidate.unit ?? ''}`}
                          type="button"
                          onClick={() => selectCarrefourCandidate(carrefourPickerItem, candidate)}
                          className={`w-full rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'border-[var(--theme-main)] bg-[var(--theme-tint)]'
                              : 'border-slate-100 bg-white hover:border-[var(--theme-soft)] hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold text-slate-800">{candidate.itemName}</p>
                              <p className="mt-1 text-[11px] text-slate-400">
                                {candidate.unit ? `規格：${candidate.unit}` : '規格：未標示'}
                                {candidate.crawledAt ? `｜更新：${candidate.crawledAt.slice(0, 10)}` : ''}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="font-mono text-sm font-extrabold text-[var(--theme-text)]">{formatMoney(candidate.price)}</p>
                              {unitPriceInfo && <p className="mt-1 text-[10px] font-bold text-slate-400">{unitPriceInfo.label}</p>}
                              {isSelected && <p className="mt-1 text-[10px] font-bold text-[var(--theme-text)]">✓ 已指定</p>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        );
      })()}

      {/* SimpleMart price picker: same local-only cache/selection model as PXMart. */}
      {simplemartPickerItem && (() => {
        const state = simplemartQuotes[simplemartPickerItem.id];
        const result = state?.result;
        const candidates = result?.candidates ?? [];
        const sortedCandidates = sortPxmartCandidates(candidates, pxmartCandidateSort);
        const savedSelection = getSavedSimplemartSelection(simplemartPickerItem);
        const savedFound = !savedSelection || Boolean(result?.selected);

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSimplemartPickerItem(null)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-100 bg-white text-slate-800 shadow-2xl sm:max-h-[82vh] sm:rounded-2xl"
            >
              <div className="border-b border-slate-100 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-sans text-lg font-bold text-[var(--theme-text)]">選擇美廉社商品</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      採購品項：<span className="font-bold text-slate-700">{simplemartPickerItem.name}</span>
                    </p>
                    {priceSearchQuery(simplemartPickerItem.name) !== simplemartPickerItem.name.trim() && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        整理後搜尋名：<span className="font-semibold text-slate-500">{priceSearchQuery(simplemartPickerItem.name)}</span>
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-slate-400">
                      每 7 天才會重新取得價格；你選過的商品會保留，只要通路仍找得到就會繼續用它的最新價格。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSimplemartPickerItem(null)}
                    className="shrink-0 rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-500">
                    目前價格：{state?.loading && !result ? '讀取中…' : result?.priceDisplay ?? '無'}
                  </span>
                  {result?.fromCache && <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-600">本週快取</span>}
                  {result?.refreshed && <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-600">剛更新</span>}
                  {savedSelection && !savedFound && (
                    <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-500">已選商品目前找不到，價格顯示「無」</span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadSimplemartQuote(simplemartPickerItem, true)}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-500 transition-colors hover:border-[var(--theme-soft)] hover:bg-[var(--theme-tint)] hover:text-[var(--theme-text)] cursor-pointer"
                  >
                    重新抓取
                  </button>
                  {savedSelection && (
                    <button
                      type="button"
                      onClick={() => clearSimplemartSelection(simplemartPickerItem)}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-500 transition-colors hover:border-amber-200 hover:bg-amber-50 hover:text-amber-600 cursor-pointer"
                    >
                      取消指定，改用最低價
                    </button>
                  )}
                  <label className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-500">
                    排序
                    <select
                      value={pxmartCandidateSort}
                      onChange={event => updatePxmartCandidateSort(event.target.value as PxmartCandidateSortMode)}
                      className="bg-transparent text-[11px] font-bold text-slate-600 outline-none cursor-pointer"
                    >
                      {PXMART_CANDIDATE_SORT_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="overflow-y-auto p-3 sm:p-3">
                {state?.loading && !result ? (
                  <div className="py-10 text-center text-xs font-semibold text-slate-400">正在讀取美廉社候選商品…</div>
                ) : candidates.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs font-semibold text-slate-400">
                    目前找不到可用商品，這個品項在美廉社價格會顯示「無」。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sortedCandidates.map(candidate => {
                      const isSelected = savedSelection?.itemName === candidate.itemName;
                      const unitPriceInfo = getUnitPriceInfo(candidate.price, candidate.unit, candidate.itemName);
                      return (
                        <button
                          key={`${candidate.itemName}-${candidate.price}-${candidate.unit ?? ''}`}
                          type="button"
                          onClick={() => selectSimplemartCandidate(simplemartPickerItem, candidate)}
                          className={`w-full rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'border-[var(--theme-main)] bg-[var(--theme-tint)]'
                              : 'border-slate-100 bg-white hover:border-[var(--theme-soft)] hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold text-slate-800">{candidate.itemName}</p>
                              <p className="mt-1 text-[11px] text-slate-400">
                                {candidate.unit ? `規格：${candidate.unit}` : '規格：未標示'}
                                {candidate.crawledAt ? `｜更新：${candidate.crawledAt.slice(0, 10)}` : ''}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="font-mono text-sm font-extrabold text-[var(--theme-text)]">{formatMoney(candidate.price)}</p>
                              {unitPriceInfo && <p className="mt-1 text-[10px] font-bold text-slate-400">{unitPriceInfo.label}</p>}
                              {isSelected && <p className="mt-1 text-[10px] font-bold text-[var(--theme-text)]">✓ 已指定</p>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        );
      })()}

      {trendViewer && trendViewerData && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setTrendViewer(null)} />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-slate-100 bg-white text-slate-800 shadow-2xl sm:max-h-[86vh] sm:rounded-2xl"
          >
            <div className="border-b border-slate-100 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-sans text-lg font-bold text-[var(--theme-text)]">價格趨勢分析</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {CHANNEL_META[trendViewer.channel].name}｜{trendViewer.item.name}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[11px] text-slate-400" title={trendViewerData.quote.sourceName ?? ''}>
                    選定商品：{trendViewerData.quote.sourceName ?? '尚未選定商品'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTrendViewer(null)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-4 sm:p-5">
              {trendViewerData.series ? (
                <div className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] font-bold text-slate-400">評估方式</p>
                      <p className="mt-1 text-xs font-extrabold text-slate-700">{trendViewerData.series.metricLabel}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] font-bold text-slate-400">下次預估</p>
                      <p className="mt-1 text-xs font-extrabold text-slate-700">{formatTrendMetricValue(trendViewerData.series.forecastValue, trendViewerData.series.metricLabel)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] font-bold text-slate-400">可信度</p>
                      <p className="mt-1 text-xs font-extrabold text-slate-700">{trendViewerData.series.confidenceLabel}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-3">
                    <PriceTrendLineChart series={trendViewerData.series} />
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-400">
                      <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-sky-500" />實際紀錄</span>
                      <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-amber-500" />下次預估</span>
                      <span>圖表以價格指數呈現，第一筆 = 100</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3 text-xs text-sky-800">
                    <p className="font-bold">{trendViewerData.series.summaryLabel}</p>
                    <p className="mt-1 text-[11px] font-semibold text-sky-600">
                      {trendViewerData.series.basisLabel}。預估方法：{trendViewerData.series.methodLabel}。資料點：{trendViewerData.series.actualCount} 筆。
                    </p>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-100">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-50 text-slate-400">
                        <tr>
                          <th className="px-3 py-2 font-bold">時間</th>
                          <th className="px-3 py-2 font-bold">價格指數</th>
                          <th className="px-3 py-2 font-bold">實際指標</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trendViewerData.series.points.map((point, index) => (
                          <tr key={`${point.capturedAt}-${index}`} className="border-t border-slate-100">
                            <td className="px-3 py-2 font-semibold text-slate-500">{point.label}</td>
                            <td className="px-3 py-2 font-mono font-bold text-slate-700">{point.indexValue.toFixed(1)}</td>
                            <td className="px-3 py-2 font-mono font-bold text-slate-700">
                              {formatTrendMetricValue(point.metricValue, trendViewerData.series.metricLabel)}
                              {point.isForecast && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] text-amber-600">預估</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs font-semibold text-slate-400">
                  需要先選定商品並取得價格後，才會開始累積趨勢資料。
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* 嵌入式地圖介面：結合通路資訊與地圖，顯示附近門市的位置分布，可在實體通路間切換比較 */}
      {activeMapChannel && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMapModalTag(null)} />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-5 text-slate-800 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-sans text-lg font-bold text-[var(--theme-text)]">{activeMapChannel.label} 附近門市分布</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  目前清單預估在此通路消費約 <span className="font-mono font-bold text-[var(--theme-text)]">{formatMoney(activeMapChannelTotal)}</span>
                </p>
              </div>
              <button
                onClick={() => setMapModalTag(null)}
                className="shrink-0 rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 通路頁籤：在同一張地圖介面內切換比較不同實體通路的門市分布 */}
            <div className="mt-3 flex gap-2">
              {physicalChannelOptions.map(ch => (
                <button
                  key={ch.tag}
                  type="button"
                  onClick={() => setMapModalTag(ch.tag)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                    ch.tag === activeMapChannel.tag
                      ? 'bg-[var(--theme-dark)] text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {ch.label}
                </button>
              ))}
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              <iframe
                key={`${activeMapChannel.tag}-${userCoords ? 'located' : 'default'}`}
                title={`${activeMapChannel.label}附近門市地圖`}
                src={`https://www.google.com/maps?q=${encodeURIComponent(mapSearchQuery)}&output=embed`}
                className="h-72 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allow="geolocation"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-slate-400">
                {locationStatus === 'loading' && '📍 正在取得您目前的位置，將以此為中心顯示附近門市…'}
                {locationStatus === 'granted' && userCoords && `📍 已定位您目前的位置，地圖將以此為中心顯示附近的${activeMapChannel.mapQuery}門市分布`}
                {locationStatus === 'denied' && `尚未取得您的位置權限，地圖以「${activeMapChannel.mapQuery}」為搜尋中心顯示附近門市（可至瀏覽器設定允許定位後重新開啟）`}
                {locationStatus === 'idle' && `地圖以「${activeMapChannel.mapQuery}」為搜尋中心，顯示附近門市分布`}
              </p>
              <button
                type="button"
                onClick={() => openInGoogleMaps(activeMapChannel.mapQuery!)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--theme-soft)] bg-[var(--theme-tint)] px-3 py-1.5 text-[11px] font-bold text-[var(--theme-text)] transition-colors hover:bg-white cursor-pointer"
              >
                <MapPin className="w-3 h-3" />
                在 Google 地圖開啟完整版
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}
