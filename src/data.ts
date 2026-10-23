/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommunityRecipe, Ingredient, Recipe, ShoppingItem, TourStep, WeeklyMeal } from './types';

export const INITIAL_INGREDIENTS: Ingredient[] = [];

export const RECOMMENDATIONS: Recipe[] = [];

export const WEEKLY_MEALS: WeeklyMeal[] = [];

export const SHOPPING_ITEMS: ShoppingItem[] = [];

export const TOUR_STEPS: TourStep[] = [
  {
    targetId: 'tour-sidebar',
    title: '側邊欄導覽目錄',
    content: '這裡是主要功能入口，可以切換我的食材庫、AI 智慧配餐、智能採購清單、主廚食譜社群與個人設定。右上角箭頭可收合側欄，讓畫面更寬。',
    position: 'right',
  },
  {
    targetId: 'tour-scan-panel',
    title: '拍照 AI 辨識食材',
    content: '點擊新增食材或相機按鈕後，可以拍照或上傳圖片。AI 會先辨識最多 25 項食材，再讓您確認品名、份量、保存方式與可儲天數後批次加入庫存。',
    position: 'bottom',
  },
  {
    targetId: 'tour-scan',
    title: '相機快捷鍵與拖移',
    content: '右側相機按鈕可以拖到不擋內容的位置；點擊後會開啟拍攝前準備視窗，視窗標題列也可以拖移。',
    position: 'left',
  },
  {
    targetId: 'tour-summary',
    title: '庫存總覽',
    content: '這裡快速整理目前庫存數量、冷藏、冷凍、常溫與即期食材。點擊卡片可以快速篩選對應的食材。',
    position: 'top',
  },
  {
    targetId: 'tour-search',
    title: '搜尋與分類分析',
    content: '可用搜尋列快速找食材名稱、份量、分類或保存方式。下方分類分析圖可複選分類，手機版預設收合，需要時可展開分類分析圖。',
    position: 'top',
  },
  {
    targetId: 'tour-expiring',
    title: '即期食材提醒',
    content: '這裡會整理即將到期的食材，並依您設定的提醒天數顯示。可用來優先安排配餐或採購。',
    position: 'top',
  },
  {
    targetId: 'ingredient-list',
    title: '庫存明細與批次操作',
    content: '庫存明細可查看每項食材、補貨提醒與移除操作。長按食材可進入多選模式，一次批量標記已吃完或丟掉。',
    position: 'top',
  },
];

export const COMMUNITY_RECIPES: CommunityRecipe[] = [];
