/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type StorageType = 'fridge' | 'freezer' | 'pantry';

export interface Ingredient {
  id: string;
  name: string;
  category: FoodCategory;
  qty: string;
  note?: string;
  storageType: StorageType;
  daysLeft: number;
  totalDays: number;
  image?: string;
  isCustom?: boolean;
}

export type FoodCategory = 'grains' | 'vegetables' | 'protein' | 'dairy' | 'fruits' | 'fats' | 'other';

export interface Recipe {
  id: string;
  name: string;
  description: string;
  prepTime: number;
  tags: string[];
  image: string;
}

export interface WeeklyMeal {
  day: string;
  recipe: Recipe;
}

export interface ShoppingItem {
  id: string;
  name: string;
  category: string;
  qty: number;
  unit: string;
  pricePX: number;
  priceCarrefour: number;
  image?: string;
  source?: 'seed' | 'manual' | 'restock';
  linkedIngredientId?: string;
}

export interface TourStep {
  targetId: string;
  title: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

// 社群功能相關類型
export interface CommunityRecipe {
  id: string;
  name: string;
  description: string;
  fullContent?: string; // 完整食譜步驟
  image: string;
  prepTime: number;
  tags: string[];
  author: {
    id: string;
    name: string;
    avatar: string;
    verified?: boolean; // 認證 ⭐
    recipeCount?: number; // 該主廚在平台累積公開分享的食譜總數（用於計算等級）
  };
  rating: number; // 1-5
  createdAt: string;
  ingredients?: string[]; // 食材清單
  steps?: string[]; // 烹飪步驟
}

// 個人食譜庫的食譜（社群「我的食譜」與配餐頁收藏共用）
export type SharedRecipe = CommunityRecipe & {
  owner?: 'ai' | 'community' | 'me';
  isPublic?: boolean;
  sourceIngredients?: string[];
  origin?: 'ai' | 'manual'; // 來源：AI 配餐收藏 / 自己建立
  likes?: number;
  liked?: boolean;
  saved?: boolean;
};

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

export interface RecipeInteraction {
  recipeId: string;
  likes: number;
  comments: Comment[];
  saved: boolean;
}

export type ThemeKey = 'brown' | 'emerald' | 'teal' | 'charcoal' | 'sky' | 'rose';
