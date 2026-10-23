/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { WEEKLY_MEALS } from '../data';
import { Ingredient, SharedRecipe } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, ShieldAlert, RefreshCcw, Bot, CheckCircle2, Plus, Pencil, X, AlertCircle, Sunrise, Sun, Moon, HeartPulse, Bookmark, BookmarkCheck, BookmarkMinus } from 'lucide-react';
import { plannerApi, recipesApi, userStateApi, type RecipeInput } from '../lib/api';

type DietPreference = {
  id: string;
  label: string;
  note?: string;
  category: 'allergen' | 'disease';
  selected: boolean;
};

type AiRecommendation = {
  id: string;
  title: string;
  description: string;
  ingredients: string[];           // 全部食材（向下相容）
  fridgeIngredients: string[];     // 冰箱現有食材
  suggestedIngredients: string[];  // 建議補充（調味料 / 家常備料）
  sourceItem: string;
  sourceCategory: string;
  sourceDaysLeft: number;
  prepTime: number;
  steps: string[];
  cookingMethod?: string;          // 料理方式，例如「清炒」「湯品」「烘烤」
  image?: string;                  // AI 生成的食物攝影圖（base64 data URL）
};

const MEAL_SLOTS = [
  { type: '早餐', offset: 5, note: '輕量開啟一天', emoji: '🌅', fridgeItems: ['雞蛋', '吐司'] },
  { type: '午餐', offset: 0, note: '主要能量補給', emoji: '☀️', fridgeItems: ['豬絞肉', '高麗菜', '豆腐'] },
  { type: '晚餐', offset: 3, note: '放鬆舒緩修復', emoji: '🌙', fridgeItems: ['雞胸肉', '青花椰菜', '紅蘿蔔'] },
];

const WEEKLY_RECIPE_INGREDIENTS: Record<string, string[]> = {
  'plan-1': ['鮭魚', '蘆筍', '檸檬'],
  'plan-2': ['藜麥', '羽衣甘藍', '烤豆'],
  'plan-3': ['雞胸', '香草', '胡蘿蔔'],
  'plan-4': ['義大利麵', '番茄', '羅勒'],
  'plan-5': ['和牛漢堡排', '生菜', '起司'],
  'plan-6': ['火龍果', '莓果', '薄荷'],
  'plan-7': ['丁骨牛排', '香草奶油', '時蔬'],
};

const cleanName = (value: string) => value.replace(/\s+/g, ' ').trim();

// 分類中文對應（對齊 DashboardView 的 CATEGORY_CONFIG）
const CATEGORY_LABEL_MAP: Record<string, string> = {
  grains:     '全榖雜糧類',
  vegetables: '蔬菜類',
  protein:    '豆魚蛋肉類',
  dairy:      '乳品類',
  fruits:     '水果類',
  fats:       '油脂與堅果種子類',
  other:      '其他',
};

// 每份食譜都附上的常備調味料
const PANTRY_STAPLES = ['鹽 適量', '蒜頭 2 瓣', '食用油 適量', '黑胡椒 少許'];

// 保存方式標準化（只顯示冷藏/冷凍/常溫）
const resolvePickerStorageLabel = (ingredient: Ingredient): string => {
  const st = ingredient.storageType;
  if (st === 'freezer') return '冷凍';
  if (st === 'fridge') return '冷藏';
  if (st === 'pantry') return '常溫';
  return '常溫';
};

const DIET_PREFERENCES_STATE_KEY = 'smartfridge:planner-diet-preferences:v1';
const GENERATED_RECOMMENDATIONS_STATE_KEY = 'smartfridge:planner-generated-recommendations:v1';

type GeneratedRecommendationsState = {
  recipes: AiRecommendation[];
  generationMode: 'random' | 'selected' | null;
  recentCookingMethods: string[];
};

// 依食材分類生成有食慾的料理名稱
const getCreativeRecipeTitle = (item: Ingredient, index: number): string => {
  const chineseChars = cleanName(item.name).match(/[一-鿿]+/g)?.join('') ?? cleanName(item.name);
  const coreName = chineseChars.length > 4 ? chineseChars.slice(-4) : chineseChars;
  const templates: Record<string, string[]> = {
    vegetables: [`蒜香嫩炒${coreName}`, `清炒${coreName}定食`, `家常${coreName}快炒`],
    protein:    [`香煎${coreName}定食`, `嫩滑${coreName}套餐`, `黃金${coreName}料理`],
    dairy:      [`${coreName}元氣早午餐`, `鮮濃${coreName}早餐`, `暖心${coreName}輕食`],
    fruits:     [`鮮甜${coreName}早餐碗`, `清爽${coreName}輕食盤`, `活力${coreName}果食`],
    grains:     [`${coreName}飽足蓋飯`, `元氣${coreName}早餐碗`, `養生${coreName}輕食`],
    fats:       [`香脆${coreName}能量碗`, `健康${coreName}輕食`, `元氣${coreName}堅果碗`],
    other:      [`家常${coreName}料理`, `快手${coreName}輕食`, `創意${coreName}套餐`],
  };
  const list = templates[item.category] ?? templates.other;
  return list[index % list.length];
};

// 換一道菜：同食材，不同烹調方式
const COOKING_VARIANTS: Record<string, Array<{ label: string; titleFn: (c: string) => string; step3: string }>> = {
  protein: [
    { label: '香煎',  titleFn: c => `香煎${c}定食`,    step3: '中大火熱鍋至冒煙，食材不翻動直到底部金黃，翻面後靜置 2 分鐘再切片裝盤。' },
    { label: '清燉',  titleFn: c => `清燉${c}暖湯`,    step3: '冷水下鍋，加薑片與少許米酒，大火煮沸撈浮沫後，小火燉 20 分鐘至軟嫩入味。' },
    { label: '炙烤',  titleFn: c => `炙烤${c}套餐`,    step3: '烤箱預熱 220°C，表面刷橄欖油撒鹽，炙烤 12–15 分鐘至表面微焦酥香。' },
    { label: '韓式拌', titleFn: c => `韓式${c}拌飯`,  step3: '切薄片以醬油、芝麻油、蒜泥醃 10 分鐘，鋪在熱飯上，加半熟蛋拌勻即可。' },
  ],
  vegetables: [
    { label: '清炒',   titleFn: c => `蒜香清炒${c}`,    step3: '大火熱油爆香蒜末，蔬菜下鍋快炒 2 分鐘，起鍋前沿鍋邊嗆入醬油提味。' },
    { label: '涼拌',   titleFn: c => `涼拌${c}輕食`,    step3: '汆燙 1 分鐘後立即冰鎮，瀝乾後拌入醬油、糖、麻油，冷藏 15 分鐘入味。' },
    { label: '起司焗', titleFn: c => `起司焗烤${c}`,    step3: '淋上白醬撒帕瑪森起司，以 200°C 烤 15 分鐘至起司金黃起泡即完成。' },
  ],
  dairy: [
    { label: '早餐碗', titleFn: c => `${c}元氣早餐碗`,  step3: '碗底鋪燕麥，倒入乳品至半碗，搭配當季水果與堅果，即時享用。' },
    { label: '輕食盤', titleFn: c => `鮮濃${c}輕食盤`,  step3: '搭配全麥吐司與生菜沙拉，淋少許蜂蜜提甜，清爽擺盤上桌。' },
  ],
  fruits: [
    { label: '果昔碗', titleFn: c => `${c}活力果昔碗`,  step3: '冷凍食材加少量椰奶打成濃稠果昔，倒入碗中鋪格蘭諾拉麥片裝飾。' },
    { label: '沙拉',   titleFn: c => `清爽${c}沙拉`,    step3: '切塊後與綜合嫩葉拌勻，淋油醋醬（橄欖油 2：蘋果醋 1），撒堅果碎。' },
  ],
  grains: [
    { label: '蓋飯', titleFn: c => `${c}飽足蓋飯`,     step3: '配料以醬油、味醂小火收汁後，熱騰騰蓋在白飯上，旁邊附味噌湯。' },
    { label: '炒飯', titleFn: c => `黃金${c}炒飯`,     step3: '隔夜冷飯下熱油鍋，大火翻炒至每粒分明，加醬油與蛋液快速拌炒。' },
    { label: '粥品', titleFn: c => `暖胃${c}粥`,       step3: '米水比例 1:10，大火滾後轉最小火熬 25 分鐘，攪拌至濃稠，加鹽調味。' },
  ],
  fats: [
    { label: '能量碗', titleFn: c => `${c}健康能量碗`,  step3: '烤箱 170°C 烤 10 分鐘喚醒香氣，冷卻後拌入優格與季節水果即完成。' },
    { label: '堅果醬', titleFn: c => `手工${c}堅果醬`,  step3: '食材倒入食物調理機，加少許海鹽與蜂蜜，打 3 分鐘至滑順濃稠。' },
  ],
  other: [
    { label: '快炒', titleFn: c => `家常快炒${c}`,     step3: '大火熱油，食材下鍋翻炒 3 分鐘，加醬油與少許糖調味，起鍋前淋麻油。' },
    { label: '湯品', titleFn: c => `暖心${c}湯`,       step3: '冷水下鍋煮至沸騰，轉小火熬 15 分鐘，依口味加鹽或味噌調味即完成。' },
  ],
};

const getVariantRecipe = (base: AiRecommendation, variantIndex: number): AiRecommendation => {
  const variants = COOKING_VARIANTS[base.sourceCategory] ?? COOKING_VARIANTS.other;
  if (variantIndex === 0 || variants.length === 0) return base;
  const variant = variants[variantIndex % variants.length];
  const chineseChars = base.sourceItem.match(/[一-鿿]+/g)?.join('') ?? base.sourceItem;
  const coreName = chineseChars.length > 4 ? chineseChars.slice(-4) : chineseChars;
  const cookIdx = Math.min(4, base.steps.length - 2); // 主要烹調動作在中段
  return {
    ...base,
    title: variant.titleFn(coreName),
    steps: base.steps.map((step, i) => i === cookIdx ? variant.step3 : step),
  };
};

type MealIngredientMatchOption = {
  label: string;
  matchKeywords: string[];
};

const MEAL_RECIPE_OPTIONS: Record<string, MealIngredientMatchOption[]> = {
  'plan-1': [
    { label: '鮭魚', matchKeywords: ['鮭魚', '魚'] },
    { label: '蘆筍', matchKeywords: ['蘆筍'] },
    { label: '檸檬', matchKeywords: ['檸檬'] },
  ],
  'plan-2': [
    { label: '藜麥', matchKeywords: ['藜麥'] },
    { label: '羽衣甘藍', matchKeywords: ['羽衣甘藍', '甘藍'] },
    { label: '烤豆', matchKeywords: ['豆'] },
  ],
  'plan-3': [
    { label: '雞胸', matchKeywords: ['雞胸', '雞'] },
    { label: '香草', matchKeywords: ['香草'] },
    { label: '胡蘿蔔', matchKeywords: ['胡蘿蔔', '紅蘿蔔'] },
  ],
  'plan-4': [
    { label: '義大利麵', matchKeywords: ['義大利麵', '麵'] },
    { label: '番茄', matchKeywords: ['番茄'] },
    { label: '羅勒', matchKeywords: ['羅勒'] },
  ],
  'plan-5': [
    { label: '和牛漢堡排', matchKeywords: ['和牛', '牛排', '漢堡'] },
    { label: '生菜', matchKeywords: ['生菜', '萵苣', '羽衣甘藍'] },
    { label: '起司', matchKeywords: ['起司', '乳酪'] },
  ],
  'plan-6': [
    { label: '火龍果', matchKeywords: ['火龍果'] },
    { label: '莓果', matchKeywords: ['莓'] },
    { label: '薄荷', matchKeywords: ['薄荷'] },
  ],
  'plan-7': [
    { label: '丁骨牛排', matchKeywords: ['丁骨', '牛排', '牛'] },
    { label: '香草奶油', matchKeywords: ['奶油', '香草'] },
    { label: '時蔬', matchKeywords: ['青花菜', '蘆筍', '蔬菜'] },
  ],
};

const getPrioritizedMealCardIngredients = (
  recipeId: string,
  recipeName: string,
  ingredients: Ingredient[]
) => {
  const fallbackOptions = (() => {
    const name = cleanName(recipeName);
    if (name.includes('雞')) return [
      { label: '雞胸', matchKeywords: ['雞胸', '雞'] },
      { label: '香草', matchKeywords: ['香草'] },
      { label: '時蔬', matchKeywords: ['蔬菜', '胡蘿蔔'] },
    ];
    if (name.includes('鮭') || name.includes('魚')) return [
      { label: '鮭魚', matchKeywords: ['鮭魚', '魚'] },
      { label: '蘆筍', matchKeywords: ['蘆筍'] },
      { label: '檸檬', matchKeywords: ['檸檬'] },
    ];
    if (name.includes('義大利麵')) return [
      { label: '義大利麵', matchKeywords: ['義大利麵', '麵'] },
      { label: '番茄', matchKeywords: ['番茄'] },
      { label: '羅勒', matchKeywords: ['羅勒'] },
    ];
    if (name.includes('牛排') || name.includes('和牛')) return [
      { label: '牛排', matchKeywords: ['牛排', '牛'] },
      { label: '生菜', matchKeywords: ['生菜', '羽衣甘藍'] },
      { label: '香草奶油', matchKeywords: ['奶油', '香草'] },
    ];
    if (name.includes('水果')) return [
      { label: '火龍果', matchKeywords: ['火龍果'] },
      { label: '莓果', matchKeywords: ['莓'] },
      { label: '薄荷', matchKeywords: ['薄荷'] },
    ];
    return [
      { label: '主食材', matchKeywords: [] },
      { label: '配菜', matchKeywords: [] },
      { label: '調味', matchKeywords: [] },
    ];
  })();

  const recipeOptions = MEAL_RECIPE_OPTIONS[recipeId] ?? fallbackOptions;
  const normalizedInventory = ingredients.map(item => ({
    displayName: cleanName(item.name),
    normalizedName: cleanName(item.name).toLowerCase(),
  }));

  const matchedInventoryItems = recipeOptions
    .map(option =>
      normalizedInventory.find(item =>
        option.matchKeywords.some(keyword => item.normalizedName.includes(keyword.toLowerCase()))
      )?.displayName ?? null
    )
    .filter((value): value is string => Boolean(value));

  const fallbackLabels = recipeOptions.map(option => option.label);
  return [...new Set([...matchedInventoryItems, ...fallbackLabels])].slice(0, 3);
};

const getMealCardIngredients = (recipeId: string, recipeName: string) => {
  const mappedIngredients = WEEKLY_RECIPE_INGREDIENTS[recipeId];
  if (mappedIngredients) return mappedIngredients;

  const name = cleanName(recipeName);
  if (name.includes('雞')) return ['雞胸', '香草', '時蔬'];
  if (name.includes('鮭') || name.includes('魚')) return ['鮭魚', '蘆筍', '檸檬'];
  if (name.includes('義大利麵')) return ['義大利麵', '番茄', '羅勒'];
  if (name.includes('牛排') || name.includes('和牛')) return ['牛排', '生菜', '香草奶油'];
  if (name.includes('水果')) return ['火龍果', '莓果', '薄荷'];
  return ['主食材', '配菜', '調味'];
};

const buildDetailedSteps = (item: Ingredient, partners: Ingredient[]): string[] => {
  const name = cleanName(item.name);
  const partnerNames = partners.map(p => cleanName(p.name)).join('、');
  const partnerPrepStep = partners.length > 0
    ? `${partnerNames} 洗淨切塊備用；`
    : '';

  const byCategory: Record<string, string[]> = {
    protein: [
      `備料：將 ${name} 取出，用廚房紙巾拍乾表面水分，切成 3-4 公分見方的塊狀備用。`,
      `醃製：在 ${name} 表面均勻抹上鹽 ½ 茶匙、白胡椒粉少許，靜置 10 分鐘讓食材入味。`,
      `輔料備妥：${partnerPrepStep}蒜頭 2 瓣拍碎切末、薑 3 片，醬油 1 大匙、糖 ½ 茶匙量好備用。`,
      `熱鍋：中大火加熱炒鍋約 1 分鐘，倒入食用油 1 大匙，油燒熱後下蒜末、薑片，爆香 30 秒至香氣四溢。`,
      `煎製：${name} 下鍋保持中大火，不翻動先煎 2-3 分鐘至底部金黃，翻面再煎 2 分鐘至兩面上色。`,
      partners.length > 0
        ? `加入配料：${partnerNames} 入鍋，翻炒 1-2 分鐘，加醬油 1 大匙、糖 ½ 茶匙拌炒，讓食材均勻上色入味。`
        : `調味：加醬油 1 大匙、糖 ½ 茶匙，翻炒 1 分鐘讓食材均勻上色入味。`,
      `收尾：轉小火悶 1-2 分鐘確保熟透，試吃後依口味補鹽，起鍋前滴少許麻油提香。`,
      `盛盤：盛入盤中趁熱享用，建議搭配白飯或麵條一起食用，風味最佳。`,
    ],
    vegetables: [
      `備料：${name} 洗淨瀝乾，葉菜切 4-5 公分段，根莖類切 0.5 公分薄片備用。`,
      `輔料備妥：${partnerPrepStep}蒜頭 2-3 瓣切末，醬油 1 大匙、鹽 ¼ 茶匙、食用油 1 大匙量好備用。`,
      `熱鍋：大火加熱炒鍋約 1 分鐘至鍋面冒煙，倒入食用油，油熱後下蒜末爆香 20-30 秒至香味出來。`,
      `下鍋翻炒：${name} 入鍋，大火快炒 1-2 分鐘，鍋鏟不停翻動避免燒焦，炒至食材稍微軟化出水。`,
      partners.length > 0
        ? `加入配料：${partnerNames} 跟進，繼續大火翻炒 1 分鐘讓所有食材均勻受熱。`
        : `持續翻炒：維持大火繼續炒 1 分鐘，讓食材均勻受熱並釋出自然甜味。`,
      `調味：沿鍋邊嗆入醬油 1 大匙，撒鹽少許（依口味），快速翻炒 30 秒讓醬色均勻上色提鮮。`,
      `起鍋：食材熟軟有光澤後立即起鍋，避免過熟變黃失去口感。趁熱盛盤，搭配白飯食用。`,
    ],
    dairy: [
      `備料：${name} 從冰箱取出回溫 5 分鐘，搖勻後量好所需份量（約 200ml 或 1 杯）。`,
      `輔料備妥：${partnerPrepStep}燕麥片 ½ 杯、蜂蜜 1 大匙、綜合堅果碎 2 大匙各自備好。`,
      `底層鋪設：碗底鋪入燕麥片 ½ 杯，倒少許 ${name} 先浸潤，讓口感更柔滑綿密。`,
      `倒入 ${name}：沿碗邊緩慢倒入剩餘 ${name} 至八分滿，避免直衝底層沖散燕麥。`,
      partners.length > 0
        ? `擺放配料：${partnerNames} 切丁或切片後整齊排列在表面，顏色搭配均衡更有食欲。`
        : `擺放配料：放上新鮮水果切片或綜合莓果，整齊排列在頂端增加色彩與甜度。`,
      `點綴調味：撒上堅果碎 2 大匙增加香脆口感，均勻淋上蜂蜜 1 大匙，可依喜好加肉桂粉少許。`,
      `享用：立即食用以保持堅果脆感；或蓋保鮮膜冷藏 15-30 分鐘讓風味更融合，隔天早餐也適合。`,
    ],
    fruits: [
      `備料：${name} 用流水仔細洗淨，去皮去核，切成 2-3 公分塊狀，放入大碗中備用。`,
      `輔料備妥：${partnerPrepStep}優格 1 杯、蜂蜜 1 大匙、薄荷葉數片、堅果碎 2 大匙各自備好。`,
      `調醬：取小碗混合橄欖油 2 茶匙、檸檬汁 1 茶匙、蜂蜜 1 大匙，用小叉攪拌均勻備用。`,
      `冷藏食材處理：若有冷凍食材，先泡入冰水 5 分鐘半解凍，保持清脆口感再瀝乾。`,
      partners.length > 0
        ? `組合食材：${name} 與 ${partnerNames} 一同放入碗中，輕柔翻拌讓食材均勻混合。`
        : `組合食材：${name} 與優格輕柔翻拌，讓每塊食材都裹上優格，層次豐富。`,
      `淋醬：將調好的醬汁從外緣往中心均勻淋上，確保每一口都有滋味，不要全部集中在中心。`,
      `裝飾盛盤：撒堅果碎 2 大匙增加口感，擺薄荷葉點綴提色，即可享用。請勿久置以免 ${name} 出水影響口感。`,
    ],
    grains: [
      `備料：${name} 洗淨後放入容器，加水量高出 ${name} 約 1 指節，浸泡 10 分鐘讓穀物吸水（免浸泡品種可跳過）。`,
      `煮熟穀物：電鍋外鍋加 1 杯水，內鍋放 ${name} 與浸泡水（${name} 與水比例約 1:1.2），按下開關煮至跳起悶 10 分鐘。`,
      `輔料備妥：${partnerPrepStep}蒜末 2 瓣、醬油 1 大匙、蛋 1 顆打散，備好食用油 1 大匙。`,
      `熱鍋：中大火加熱炒鍋，倒食用油 1 大匙，油熱後下蒜末爆香 20 秒至香氣釋出。`,
      `炒製穀物：煮好的 ${name} 入鍋，大火翻炒 2 分鐘，用鍋鏟將結塊撥散，使每粒分明不沾連。`,
      partners.length > 0
        ? `加入配料：${partnerNames} 入鍋，加醬油 1 大匙翻炒均勻，倒入蛋液快速拌炒 1 分鐘至蛋花凝固。`
        : `調味：加醬油 1 大匙翻炒均勻，沿鍋邊嗆少許米酒提香，炒至 ${name} 粒粒分明有光澤。`,
      `試味起鍋：試吃確認鹹淡，依口味補鹽或醬油，起鍋前可撒少許蔥花，趁熱盛碗享用。`,
    ],
    fats: [
      `備料：${name} 量取所需份量（約 30-40 克，堅果類以一小把為準），若有未去殼者先去殼。`,
      `喚醒香氣：烤箱預熱 160°C，${name} 均勻攤平於烤盤，送入烤箱烤 8-10 分鐘至微金黃飄香，取出放涼備用。`,
      `輔料備妥：${partnerPrepStep}優格 ½ 杯、蜂蜜 1 茶匙、海鹽少許各自備好。`,
      `基底準備：碗底鋪入優格 ½ 杯或燕麥片 ¼ 杯，作為能量碗的綿密基底。`,
      partners.length > 0
        ? `組合：${partnerNames} 切丁後均勻鋪在基底上，再撒上烤香的 ${name}。`
        : `組合：烤香的 ${name} 均勻鋪在基底上，讓每一口都能嚐到堅果的香脆感。`,
      `調味點綴：淋蜂蜜 1 茶匙增加自然甜味，撒海鹽少許平衡甜鹹層次，可再加肉桂粉 ¼ 茶匙提升香氣。`,
      `立即享用以保持 ${name} 的酥脆口感；若要保存，密封罐冷藏至多 3 天，食用前再撒上堅果即可。`,
    ],
    other: [
      `備料：${name} 用流水清洗，切成 3-4 公分適口大小，用廚房紙巾吸乾多餘水分備用。`,
      `輔料備妥：${partnerPrepStep}蒜頭 2 瓣切末、薑 2 片切絲，醬油 1 大匙、鹽 ¼ 茶匙、食用油 1 大匙備好。`,
      `熱鍋：中火加熱炒鍋約 1 分鐘，倒入食用油，油熱後下蒜末、薑絲爆香 30 秒至香味四溢。`,
      `下鍋翻炒：${name} 入鍋，轉大火翻炒 2 分鐘，讓食材表面均勻受熱、微微上色。`,
      partners.length > 0
        ? `加入配料：${partnerNames} 入鍋，繼續翻炒 1-2 分鐘，所有食材一起炒勻至熟。`
        : `持續翻炒：保持大火翻炒 1-2 分鐘，確認 ${name} 受熱均勻、顏色轉熟。`,
      `調味：加醬油 1 大匙翻炒均勻，沿鍋邊嗆少許米酒提香，撒鹽依口味調整，再炒 30 秒收汁。`,
      `收尾：轉小火悶 1 分鐘讓 ${name} 熟透入味，試吃確認鹹淡後，起鍋前淋少許麻油增香。`,
      `盛盤享用：趁熱盛入盤中，搭配白飯或饅頭，即可享用。`,
    ],
  };

  return byCategory[item.category] ?? byCategory.other;
};

const buildAiRecommendations = (ingredients: Ingredient[], preferRandom = false): AiRecommendation[] => {
  const seen = new Set<string>();
  const usableIngredients = [...ingredients]
    .filter(item => item.daysLeft >= 0)
    .sort((a, b) => preferRandom ? Math.random() - 0.5 : a.daysLeft - b.daysLeft);
  const rawCandidates = usableIngredients
    .filter(item => {
      if (!preferRandom) return true;
      if (seen.has(item.category)) return false;
      seen.add(item.category);
      return true;
    })
    .slice(0, 3);

  // 確保一定有 3 張食譜卡（早/午/晚），不足時循環補齊
  const candidates: Ingredient[] = rawCandidates.length > 0
    ? Array.from({ length: 3 }, (_, i) => rawCandidates[i % rawCandidates.length])
    : [];

  return candidates.map((item, index) => {
    const otherCandidates = rawCandidates.filter(c => c.id !== item.id);
    const partners = otherCandidates.slice(0, 2);
    const recipeIngredients = preferRandom ? [item, ...partners] : usableIngredients;
    const fridgeIngs = recipeIngredients.map(ingredient => `${cleanName(ingredient.name)} ${ingredient.qty}`);
    return {
      id: `planner-ai-${item.id}-${index}`,
      title: getCreativeRecipeTitle(item, index),
      description: `優先使用剩餘 ${item.daysLeft} 天的 ${cleanName(item.name)}，搭配冰箱現有食材安排一餐。`,
      sourceCategory: item.category,
      fridgeIngredients: fridgeIngs,
      suggestedIngredients: PANTRY_STAPLES,
      ingredients: [...fridgeIngs, ...PANTRY_STAPLES],
      sourceItem: cleanName(item.name),
      sourceDaysLeft: item.daysLeft,
      prepTime: item.category === 'protein' ? 18 : 12 + index * 4,
      steps: buildDetailedSteps(item, partners),
    };
  });
};

export default function PlannerView({ ingredients }: { ingredients: Ingredient[] }) {
  const [selectedDay, setSelectedDay] = useState<string>('星期一');
  const [allergyRefreshKey, setAllergyRefreshKey] = useState(0);
  const [swappedSlots, setSwappedSlots] = useState<Record<string, number>>({});
  const [selectedAiRecipe, setSelectedAiRecipe] = useState<AiRecommendation | null>(null);
  const [selectedRecipeIngredientIds, setSelectedRecipeIngredientIds] = useState<Set<string>>(new Set());
  const [showIngredientPicker, setShowIngredientPicker] = useState(false);
  const [generatedRecommendations, setGeneratedRecommendations] = useState<AiRecommendation[] | null>(null);
  const [recentCookingMethods, setRecentCookingMethods] = useState<string[]>([]);
  const [generationMode, setGenerationMode] = useState<'random' | 'selected' | null>(null);
  const [showPreferencePanel, setShowPreferencePanel] = useState(false);
  const [swapNotice, setSwapNotice] = useState<string | null>(null);
  const [cardVariantIndexes, setCardVariantIndexes] = useState<Record<number, number>>({});
  const [pickerCategoryFilter, setPickerCategoryFilter] = useState<Set<string>>(new Set());
  const [pickerExpiringOnly, setPickerExpiringOnly] = useState(false);
  const [dietPreferences, setDietPreferences] = useState<DietPreference[]>([
    { id: 'dairy',          label: '乳製品',     category: 'allergen', selected: false },
    { id: 'egg',            label: '蛋',          category: 'allergen', selected: false },
    { id: 'peanut',         label: '堅果／花生',  category: 'allergen', selected: false },
    { id: 'shellfish',      label: '甲殼海鮮',    category: 'allergen', selected: false },
    { id: 'gluten',         label: '小麥／麩質',  category: 'allergen', selected: false },
    { id: 'soy',            label: '大豆',        category: 'allergen', selected: false },
    { id: 'diabetes',       label: '糖尿病',      note: '需低糖、低 GI 飲食',    category: 'disease', selected: false },
    { id: 'hypertension',   label: '高血壓',      note: '需低鹽、低鈉飲食',      category: 'disease', selected: false },
    { id: 'hyperlipidemia', label: '高血脂',      note: '需低油、低膽固醇',      category: 'disease', selected: false },
    { id: 'kidney',         label: '腎臟病',      note: '需限鉀、磷及蛋白質',    category: 'disease', selected: false },
    { id: 'gout',           label: '痛風',        note: '需少普林食物',          category: 'disease', selected: false },
  ]);
  const [editingPreferenceId, setEditingPreferenceId] = useState<string | null>(null);
  const [draftPreferenceLabel, setDraftPreferenceLabel] = useState('');
  const [draftPreferenceNote, setDraftPreferenceNote] = useState('');
  const [newAllergenLabel, setNewAllergenLabel] = useState('');
  const [newDiseaseLabel, setNewDiseaseLabel] = useState('');
  const [newDiseaseNote, setNewDiseaseNote] = useState('');
  // 個人食譜庫（由 recipes API / DB 載入）
  const [myLibrary, setMyLibrary] = useState<SharedRecipe[]>([]);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  // 收藏清單分頁
  const [savedPageSize, setSavedPageSize] = useState<number | 'all'>(12);
  const [savedPage, setSavedPage] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [swappingSlot, setSwappingSlot] = useState<number | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const isRecipeSaved = (title: string) => myLibrary.some(recipe => recipe.name.trim() === title.trim());

  useEffect(() => {
    let cancelled = false;

    // 先從 sessionStorage 快速還原（切頁不會閃回空白）
    try {
      const cached = sessionStorage.getItem(GENERATED_RECOMMENDATIONS_STATE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as GeneratedRecommendationsState;
        if (Array.isArray(parsed.recipes) && parsed.recipes.length > 0) {
          setGeneratedRecommendations(parsed.recipes);
          setGenerationMode(parsed.generationMode ?? null);
          setRecentCookingMethods(Array.isArray(parsed.recentCookingMethods) ? parsed.recentCookingMethods : []);
        }
      }
    } catch { /* ignore */ }

    recipesApi.list()
      .then(recipes => {
        if (!cancelled) setMyLibrary(recipes.filter(recipe => recipe.owner === 'me'));
      })
      .catch(err => console.error('讀取我的食譜庫失敗：', err));
    userStateApi.get<DietPreference[]>(DIET_PREFERENCES_STATE_KEY)
      .then(result => {
        if (!cancelled && Array.isArray(result.value)) setDietPreferences(result.value);
      })
      .catch(err => console.error('讀取飲食偏好失敗：', err));
    userStateApi.get<GeneratedRecommendationsState>(GENERATED_RECOMMENDATIONS_STATE_KEY)
      .then(result => {
        if (cancelled || !result.value) return;
        if (Array.isArray(result.value.recipes) && result.value.recipes.length > 0) {
          setGeneratedRecommendations(result.value.recipes);
          setGenerationMode(result.value.generationMode ?? null);
          setRecentCookingMethods(Array.isArray(result.value.recentCookingMethods) ? result.value.recentCookingMethods : []);
          try { sessionStorage.setItem(GENERATED_RECOMMENDATIONS_STATE_KEY, JSON.stringify(result.value)); } catch { /* ignore */ }
        }
      })
      .catch(err => console.error('讀取 AI 配餐暫存失敗：', err));
    return () => { cancelled = true; };
  }, []);

  const syncDietPreferences = (next: DietPreference[]) => {
    userStateApi.set(DIET_PREFERENCES_STATE_KEY, next).catch(err => console.error('同步飲食偏好失敗：', err));
  };

  const updateDietPreferences = (updater: (prev: DietPreference[]) => DietPreference[]) => {
    setDietPreferences(prev => {
      const next = updater(prev);
      syncDietPreferences(next);
      return next;
    });
  };

  // 把收藏的食譜（SharedRecipe）還原成 AI 食譜格式，以便用同一個食譜彈窗檢視
  const syncGeneratedRecommendations = (
    recipes: AiRecommendation[] | null,
    mode: 'random' | 'selected' | null,
    methods = recentCookingMethods
  ) => {
    if (!recipes || recipes.length === 0) return;
    const payload = { recipes, generationMode: mode, recentCookingMethods: methods };
    try { sessionStorage.setItem(GENERATED_RECOMMENDATIONS_STATE_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
    userStateApi.set(GENERATED_RECOMMENDATIONS_STATE_KEY, payload).catch(err => console.error('同步 AI 配餐暫存失敗：', err));
  };

  const clearGeneratedRecommendationsCache = () => {
    userStateApi.set(GENERATED_RECOMMENDATIONS_STATE_KEY, {
      recipes: [],
      generationMode: null,
      recentCookingMethods,
    }).catch(err => console.error('清除 AI 配餐暫存失敗：', err));
  };

  const openSavedRecipe = (recipe: SharedRecipe) => {
    const all = recipe.ingredients ?? [];
    setSelectedAiRecipe({
      id: recipe.id,
      title: recipe.name,
      description: recipe.description,
      ingredients: all,
      fridgeIngredients: all.filter(item => !PANTRY_STAPLES.includes(item)),
      suggestedIngredients: all.filter(item => PANTRY_STAPLES.includes(item)),
      sourceItem: '',
      sourceCategory: '',
      sourceDaysLeft: 0,
      prepTime: recipe.prepTime,
      steps: recipe.steps ?? [],
    });
  };

  // 把一道 AI 配餐收藏進「我的食譜」（預設私密，來源標記 ai）
  const handleSaveRecipe = (recipe: AiRecommendation) => {
    if (isRecipeSaved(recipe.title)) {
      setSaveToast('這道已經在你的食譜庫了');
      return;
    }
    const saved: SharedRecipe = {
      id: `cooked-${recipe.id}-${myLibrary.length}`,
      name: recipe.title,
      description: recipe.description,
      fullContent: recipe.steps.join(' '),
      image: '', // AI 配餐沒有實拍照片，留空 → 在「我的食譜」可自行上傳
      prepTime: recipe.prepTime,
      tags: ['#AI配餐', `#${recipe.sourceCategory || '家常菜'}`],
      author: { id: 'me', name: '目前星廚', avatar: '我', verified: true },
      rating: 5,
      createdAt: '剛剛',
      ingredients: [...recipe.fridgeIngredients, ...recipe.suggestedIngredients],
      steps: recipe.steps,
      owner: 'me',
      isPublic: false,
      origin: 'ai',
    };
    recipesApi.create(saved)
      .then(created => setMyLibrary(prev => [created, ...prev]))
      .catch(err => console.error('收藏 AI 食譜失敗：', err));
    setSaveToast('已收藏到「我的食譜」（私密）');
  };

  // 從「我的食譜」移除這道收藏的 AI 食譜（依名稱比對，只移除 AI 來源）
  const handleUnsaveRecipe = (title: string) => {
    const target = myLibrary.find(recipe => recipe.origin === 'ai' && recipe.name.trim() === title.trim());
    if (target) {
      recipesApi.remove(target.id).catch(err => console.error('移除 AI 食譜收藏失敗：', err));
      setMyLibrary(prev => prev.filter(recipe => recipe.id !== target.id));
    }
    setSaveToast('已從「我的食譜」移除');
  };

  useEffect(() => {
    if (!saveToast) return;
    const timer = setTimeout(() => setSaveToast(null), 2600);
    return () => clearTimeout(timer);
  }, [saveToast]);

  const dayIndex = WEEKLY_MEALS.findIndex(m => m.day === selectedDay);
  const selectedRecipeIngredients = useMemo(
    () => ingredients.filter(item => selectedRecipeIngredientIds.has(item.id)),
    [ingredients, selectedRecipeIngredientIds]
  );
  const recipeSourceIngredients = selectedRecipeIngredients.length > 0 ? selectedRecipeIngredients : ingredients;
  const aiRecommendations = useMemo(
    () => buildAiRecommendations(recipeSourceIngredients, selectedRecipeIngredients.length === 0),
    [recipeSourceIngredients, selectedRecipeIngredients.length]
  );

  // 顯示用：有 AI 生成結果就用 AI 的，否則直接顯示本地即時推薦（不需 API call）
  const activeRecipes = useMemo(
    () => generatedRecommendations ?? aiRecommendations,
    [generatedRecommendations, aiRecommendations]
  );

  useEffect(() => {
    const validIds = new Set(ingredients.map(item => item.id));
    setSelectedRecipeIngredientIds(prev => {
      const next = new Set([...prev].filter(id => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [ingredients]);
  // 食材選取器 — 分類篩選 + 即將過期篩選
  const expiringIngredientCount = ingredients.filter(item => item.daysLeft >= 0 && item.daysLeft <= 3).length;
  const filteredPickerIngredients = ingredients.filter(item => {
    if (pickerCategoryFilter.size > 0 && !pickerCategoryFilter.has(item.category)) return false;
    if (pickerExpiringOnly && !(item.daysLeft >= 0 && item.daysLeft <= 3)) return false;
    return true;
  });

  const pickerCategoryOptions = Object.entries(CATEGORY_LABEL_MAP).filter(
    ([cat]) => ingredients.some(item => item.category === cat)
  );

  const togglePickerCategory = (cat: string) => {
    setPickerCategoryFilter(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const usableIngredientCount = ingredients.filter(item => item.daysLeft >= 0).length;
  const priorityIngredient = useMemo(
    () => [...ingredients]
      .filter(item => item.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft)[0] ?? null,
    [ingredients]
  );
  const priorityMealType = priorityIngredient
    ? priorityIngredient.category === 'fruits' || priorityIngredient.category === 'dairy'
      ? '早餐'
      : priorityIngredient.category === 'protein' || priorityIngredient.category === 'grains'
        ? '午餐'
        : '晚餐'
    : null;
  const priorityDaysText = priorityIngredient
    ? priorityIngredient.daysLeft <= 0
      ? '今天到期'
      : `剩 ${priorityIngredient.daysLeft} 天`
    : '';
  const aiBannerText = priorityIngredient
    ? `冰箱有即期食材「${cleanName(priorityIngredient.name)}」（${priorityDaysText}），已優先納入${priorityMealType}建議。點「換一道菜」可重新分配。`
    : '目前冰箱沒有可判斷的即期食材，新增食材後 AI 會依到期時間更新建議。';

  const getMealRecipeIndex = (slotOffset: number, slotKey: string, overrideDelta?: number) => {
    const swapDelta = swappedSlots[slotKey] ?? 0;
    const delta = overrideDelta ?? swapDelta;
    return ((dayIndex + slotOffset + delta) % WEEKLY_MEALS.length + WEEKLY_MEALS.length) % WEEKLY_MEALS.length;
  };

  const getMealRecipe = (slotOffset: number, slotKey: string) => {
    return WEEKLY_MEALS[getMealRecipeIndex(slotOffset, slotKey)].recipe;
  };

  const showSwapNotice = (message: string) => {
    setSwapNotice(message);
    window.setTimeout(() => setSwapNotice(null), 2400);
  };

  const handleSwap = (slotKey: string, slotOffset: number) => {
    if (usableIngredientCount < 3) {
      showSwapNotice('冰箱食材不足，先新增更多食材後再換菜；目前食譜先保留。');
      return;
    }

    const otherRecipeIds = new Set(
      MEAL_SLOTS
        .filter(slot => `${selectedDay}-${slot.type}` !== slotKey)
        .map(slot => WEEKLY_MEALS[getMealRecipeIndex(slot.offset, `${selectedDay}-${slot.type}`)].recipe.id)
    );
    const currentDelta = swappedSlots[slotKey] ?? 0;
    const nextDelta = Array.from({ length: WEEKLY_MEALS.length - 1 }, (_, index) => (currentDelta + index + 1) % WEEKLY_MEALS.length)
      .find(delta => {
        const recipeId = WEEKLY_MEALS[getMealRecipeIndex(slotOffset, slotKey, delta)].recipe.id;
        return !otherRecipeIds.has(recipeId);
      });

    if (nextDelta === undefined) {
      showSwapNotice('目前可用菜色會和其他餐別重複，先保留這道菜。');
      return;
    }

    setSwappedSlots(prev => ({ ...prev, [slotKey]: nextDelta }));
  };

  const togglePreference = (id: string) => {
    updateDietPreferences(prev => prev.map(item =>
      item.id === id ? { ...item, selected: !item.selected } : item
    ));
  };

  const startEditPreference = (item: DietPreference) => {
    setEditingPreferenceId(item.id);
    setDraftPreferenceLabel(item.label);
    setDraftPreferenceNote(item.note ?? '');
  };

  const savePreferenceEdit = (id: string) => {
    const label = draftPreferenceLabel.trim();
    if (!label) return;
    updateDietPreferences(prev => prev.map(item =>
      item.id === id ? { ...item, label, note: draftPreferenceNote.trim() || undefined } : item
    ));
    setEditingPreferenceId(null);
    setDraftPreferenceLabel('');
    setDraftPreferenceNote('');
  };

  const removePreference = (id: string) => {
    updateDietPreferences(prev => prev.filter(item => item.id !== id));
  };

  const addAllergen = () => {
    const label = newAllergenLabel.trim();
    if (!label) return;
    updateDietPreferences(prev => [...prev, { id: `allergen-${Date.now()}`, label, category: 'allergen', selected: true }]);
    setNewAllergenLabel('');
  };

  const addDisease = () => {
    const label = newDiseaseLabel.trim();
    if (!label) return;
    updateDietPreferences(prev => [...prev, { id: `disease-${Date.now()}`, label, note: newDiseaseNote.trim() || undefined, category: 'disease', selected: true }]);
    setNewDiseaseLabel('');
    setNewDiseaseNote('');
  };

  const applyDietPreferences = () => {
    setAllergyRefreshKey(key => key + 1);
  };

  const toggleRecipeIngredient = (id: string) => {
    setSelectedRecipeIngredientIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearRecipeIngredientSelection = () => {
    setSelectedRecipeIngredientIds(new Set());
    if (generationMode === 'selected') {
      setGeneratedRecommendations(null);
      setGenerationMode(null);
    }
  };

  const getDietParams = () => ({
    excludeAllergens: dietPreferences.filter(p => p.category === 'allergen' && p.selected).map(p => p.label),
    excludeDiseases: dietPreferences.filter(p => p.category === 'disease' && p.selected).map(p => ({ label: p.label, note: p.note })),
  });

  const toAiRecommendation = (r: any, index: number) => ({
    ...r,
    id: `planner-ai-${index}-${Date.now()}`,
    ingredients: [...r.fridgeIngredients, ...r.suggestedIngredients],
  });

  const rememberCookingMethods = (recipes: AiRecommendation[]) => {
    const methods = recipes
      .map(recipe => recipe.cookingMethod || '')
      .map(method => method.trim())
      .filter(Boolean);
    const nextMethods = [...new Set([...methods, ...recentCookingMethods])].slice(0, 12);
    if (methods.length > 0) setRecentCookingMethods(nextMethods);
    return nextMethods;
  };

  const handleSwapCardVariant = async (slotIndex: number) => {
    if (swappingSlot !== null) return;

    // 本地模式（尚未點 AI 生成）→ 直接切換本地變體，不耗費 API
    if (!generatedRecommendations) {
      setCardVariantIndexes(prev => ({ ...prev, [slotIndex]: ((prev[slotIndex] ?? 0) + 1) }));
      return;
    }
    setSwappingSlot(slotIndex);
    try {
      const result = await plannerApi.generate({
        ...getDietParams(),
        avoidCookingStyles: [
          ...recentCookingMethods,
          ...(generatedRecommendations ?? []).map(recipe => recipe.cookingMethod || recipe.title),
        ].filter(Boolean),
        regenerate: {
          slotIndex,
          excludeCookingStyle: generatedRecommendations[slotIndex]?.cookingMethod || generatedRecommendations[slotIndex]?.title || '',
        },
      });
      const newRecipe = result.recipes[0];
      if (newRecipe) {
        const converted = toAiRecommendation(newRecipe, slotIndex);
        const nextRecipes = [...generatedRecommendations];
        nextRecipes[slotIndex] = converted;
        setGeneratedRecommendations(nextRecipes);
        const nextMethods = rememberCookingMethods([converted]);
        syncGeneratedRecommendations(nextRecipes, generationMode, nextMethods);
        setCardVariantIndexes(prev => ({ ...prev, [slotIndex]: 0 }));
      }
    } catch (err: any) {
      showSwapNotice(err.message ?? 'AI 換菜失敗，請稍後再試');
    } finally {
      setSwappingSlot(null);
    }
  };

  const generateRandomRecipes = async () => {
    if (isGenerating) return;
    setSelectedRecipeIngredientIds(new Set());
    setGenerationMode('random');
    setCardVariantIndexes({});
    setGeneratedRecommendations(null);
    clearGeneratedRecommendationsCache();
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const result = await plannerApi.generate({
        ...getDietParams(),
        avoidCookingStyles: recentCookingMethods,
      });
      const nextRecipes = result.recipes.map(toAiRecommendation);
      setGeneratedRecommendations(nextRecipes);
      const nextMethods = rememberCookingMethods(nextRecipes);
      syncGeneratedRecommendations(nextRecipes, 'random', nextMethods);
    } catch (err: any) {
      setGenerateError(err.message ?? 'AI 配餐失敗，請稍後再試');
      setGeneratedRecommendations(null);
      setGenerationMode(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateSelectedIngredientRecipes = async () => {
    if (isGenerating) return;
    setGenerationMode('selected');
    setCardVariantIndexes({});
    setGeneratedRecommendations(null);
    clearGeneratedRecommendationsCache();
    setShowIngredientPicker(false);
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const result = await plannerApi.generate({
        specifiedIngredients: selectedRecipeIngredients.length > 0
          ? selectedRecipeIngredients.map(item => item.name)
          : undefined,
        avoidCookingStyles: recentCookingMethods,
        ...getDietParams(),
      });
      const nextRecipes = result.recipes.map(toAiRecommendation);
      setGeneratedRecommendations(nextRecipes);
      const nextMethods = rememberCookingMethods(nextRecipes);
      syncGeneratedRecommendations(nextRecipes, 'selected', nextMethods);
    } catch (err: any) {
      setGenerateError(err.message ?? 'AI 配餐失敗，請稍後再試');
      setGeneratedRecommendations(null);
      setGenerationMode(null);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-sans font-bold text-3xl text-[var(--theme-text)] tracking-tight">AI 智慧配餐</h2>
          <p className="text-slate-500 text-sm mt-1">不知道要煮什麼？沒關係，AI 食代為您配好現有食材，無痛做出美味料理</p>
        </div>
        <div className="flex w-full flex-col gap-2 md:w-auto md:self-center">
          {/* Step 1 */}
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center">Step 1. 飲食禁忌設定</p>
            <button
              onClick={() => setShowPreferencePanel(true)}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                dietPreferences.some(p => p.selected)
                  ? 'bg-[var(--theme-dark)] text-white hover:bg-[var(--theme-main)]'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>飲食禁忌設定</span>
              {dietPreferences.filter(p => p.selected).length > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] text-white">
                  {dietPreferences.filter(p => p.selected).length} 項
                </span>
              )}
            </button>
          </div>
          {/* Step 2 — 兩個並排按鈕 */}
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center">Step 2. 選擇生成方式</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={generateRandomRecipes}
                disabled={isGenerating}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                  generationMode === 'random'
                    ? 'bg-[var(--theme-dark)] text-white'
                    : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                {isGenerating && generationMode === 'random' && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {isGenerating && generationMode === 'random' ? 'AI 思考中...' : '隨機生成食譜'}
              </button>
              <button
                type="button"
                onClick={() => setShowIngredientPicker(true)}
                disabled={isGenerating}
                className={`flex-1 inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                  generationMode === 'selected'
                    ? 'bg-[var(--theme-dark)] text-white hover:bg-[var(--theme-main)]'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                選擇食材生成食譜
                {selectedRecipeIngredientIds.size > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                    generationMode === 'selected' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>{selectedRecipeIngredientIds.size}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {swapNotice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-relaxed text-amber-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{swapNotice}</span>
          </motion.div>
        )}
        {generateError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold leading-relaxed text-rose-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{generateError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="hidden">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-[var(--theme-text)]">食材來源</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {selectedRecipeIngredientIds.size > 0
                ? `目前會使用您選取的 ${selectedRecipeIngredientIds.size} 項食材生成食譜。`
                : '目前未指定食材，AI 會隨機使用冰箱現有食材。'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-extrabold text-slate-500">
              {selectedRecipeIngredientIds.size > 0 ? `已選 ${selectedRecipeIngredientIds.size} 項` : '隨機取材'}
            </span>
            <button
              type="button"
              onClick={() => setShowIngredientPicker(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--theme-dark)] px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[var(--theme-main)] cursor-pointer"
            >
              <Bot className="h-4 w-4" />
              選擇食材
            </button>
          </div>
        </div>
      </section>

      <AnimatePresence>
        {showIngredientPicker && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-0 md:items-center md:p-5">
            <button
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
              onClick={() => setShowIngredientPicker(false)}
              aria-label="關閉食材選擇"
            />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl md:rounded-3xl"
            >
              <div className="border-b border-slate-100 px-5 py-4 md:px-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-sans text-2xl font-extrabold tracking-tight text-[var(--theme-text)]">
                      選擇食材生成食譜
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
                      從我的食材庫勾選要使用的食材。沒有勾選時，AI 會隨機使用冰箱現有食材。
                    </p>
                  </div>
                  <button
                    onClick={() => setShowIngredientPicker(false)}
                    className="rounded-full bg-slate-50 p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                    aria-label="關閉食材選擇"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-500">
                    {selectedRecipeIngredientIds.size > 0 ? `已選 ${selectedRecipeIngredientIds.size} 項` : '未選取，將隨機取材'}
                  </span>
                  {selectedRecipeIngredientIds.size > 0 && (
                    <button
                      type="button"
                      onClick={clearRecipeIngredientSelection}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-50 cursor-pointer"
                    >
                      清除選取
                    </button>
                  )}
                </div>

                {/* 即將過期 + 分類篩選 chips */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {expiringIngredientCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setPickerExpiringOnly(v => !v)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                        pickerExpiringOnly
                          ? 'bg-rose-500 text-white border-transparent'
                          : 'bg-rose-50 text-rose-600 border-rose-200 hover:border-rose-300'
                      }`}
                    >
                      🔴 即將過期
                      <span className={`ml-1 text-[9px] ${pickerExpiringOnly ? 'text-white/70' : 'text-rose-400'}`}>{expiringIngredientCount}</span>
                    </button>
                  )}
                  {pickerCategoryOptions.length > 1 && pickerCategoryOptions.map(([cat, label]) => {
                      const isActive = pickerCategoryFilter.has(cat);
                      const count = ingredients.filter(item => item.category === cat).length;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => togglePickerCategory(cat)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-[var(--theme-dark)] text-white border-transparent'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {label}
                          <span className={`ml-1 text-[9px] ${isActive ? 'text-white/70' : 'text-slate-400'}`}>{count}</span>
                        </button>
                      );
                    })}
                  {(pickerCategoryFilter.size > 0 || pickerExpiringOnly) && (
                    <button
                      type="button"
                      onClick={() => { setPickerCategoryFilter(new Set()); setPickerExpiringOnly(false); }}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:bg-slate-50 cursor-pointer"
                    >
                      全部
                    </button>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-7">
                <div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">
                      <tr>
                        <th className="w-16 px-4 py-3 text-center">選取</th>
                        <th className="px-4 py-3">食材名稱</th>
                        <th className="px-4 py-3">份量</th>
                        <th className="px-4 py-3">保存方式</th>
                        <th className="px-4 py-3">剩餘天數</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPickerIngredients.map(item => {
                        const isSelected = selectedRecipeIngredientIds.has(item.id);
                        return (
                          <tr
                            key={item.id}
                            className={`transition-colors ${isSelected ? 'bg-[var(--theme-tint)]' : 'hover:bg-slate-50/70'}`}
                          >
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => toggleRecipeIngredient(item.id)}
                                className={`inline-flex h-6 w-6 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                                  isSelected ? 'border-[var(--theme-main)] bg-[var(--theme-dark)] text-white' : 'border-slate-300 bg-white text-transparent hover:border-[var(--theme-soft)]'
                                }`}
                                aria-label={`${isSelected ? '取消選取' : '選取'} ${cleanName(item.name)}`}
                                aria-pressed={isSelected}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </button>
                            </td>
                            <td className="px-4 py-3 font-extrabold text-slate-900">{cleanName(item.name)}</td>
                            <td className="px-4 py-3 font-semibold text-slate-600">{item.qty}</td>
                            <td className="px-4 py-3 font-semibold text-slate-500">{resolvePickerStorageLabel(item)}</td>
                            <td className="px-4 py-3 font-semibold text-slate-600">剩 {item.daysLeft} 天</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2 md:hidden">
                  {filteredPickerIngredients.map(item => {
                    const isSelected = selectedRecipeIngredientIds.has(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleRecipeIngredient(item.id)}
                        className={`w-full rounded-2xl border p-3 text-left transition-all cursor-pointer ${
                          isSelected ? 'border-[var(--theme-main)] bg-[var(--theme-tint)]' : 'border-slate-200 bg-white'
                        }`}
                        aria-pressed={isSelected}
                      >
                        <span className="flex items-start gap-3">
                          <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${
                            isSelected ? 'border-[var(--theme-main)] bg-[var(--theme-dark)] text-white' : 'border-slate-300 bg-white text-transparent'
                          }`}>
                            <CheckCircle2 className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-extrabold text-slate-900">{cleanName(item.name)}</span>
                            <span className="mt-1 block text-xs font-semibold text-slate-500">
                              {item.qty} / {resolvePickerStorageLabel(item)} / 剩 {item.daysLeft} 天
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 md:px-7">
                <button
                  type="button"
                  onClick={generateSelectedIngredientRecipes}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--theme-dark)] px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[var(--theme-main)] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isGenerating && generationMode === 'selected' && (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  )}
                  {isGenerating && generationMode === 'selected' ? 'AI 思考中...' : '生成食譜'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-6 items-start">

        {/* Left: Day tabs + 3 meal cards */}
        <div className="space-y-5">

          {/* Day selector */}
          <div className="hidden">
            {WEEKLY_MEALS.map(meal => (
              <button
                key={meal.day}
                onClick={() => setSelectedDay(meal.day)}
                className={`px-4 py-2.5 rounded-xl transition-all whitespace-nowrap cursor-pointer flex-1 text-center ${
                  selectedDay === meal.day
                    ? 'bg-[var(--theme-dark)] text-white shadow-sm font-bold'
                    : 'text-slate-600 hover:text-[var(--theme-text)] hover:bg-slate-50'
                }`}
              >
                {meal.day}
              </button>
            ))}
          </div>

          {/* 3 recommendation cards */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`${generationMode ?? 'empty'}-${generatedRecommendations?.map(item => item.id).join('-') ?? 'none'}-${allergyRefreshKey}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className={activeRecipes.length > 0
                ? 'flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory -mx-1 px-1 md:overflow-x-visible md:snap-none'
                : 'space-y-3'
              }
            >
              {isGenerating ? (
                <div className="rounded-2xl border-2 border-dashed border-[var(--theme-soft)] bg-[var(--theme-tint)] px-5 py-10 text-center">
                  <RefreshCcw className="mx-auto h-8 w-8 text-[var(--theme-text)] animate-spin" />
                  <p className="mt-3 text-sm font-extrabold text-[var(--theme-text)]">AI 正在幫你配餐中...</p>
                  <p className="mt-1 text-xs font-semibold text-slate-400">Gemini 思考需要幾秒，請稍候</p>
                </div>
              ) : activeRecipes.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white px-5 py-10 text-center">
                  <Bot className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-extrabold text-slate-700">先新增食材，AI 就會幫你配餐</p>
                  <p className="mt-1 text-xs font-semibold text-slate-400">前往「我的食材庫」新增庫存後，這裡會自動顯示推薦。</p>
                </div>
              ) : activeRecipes.map((baseRecipe, slotIndex) => {
                const slot = MEAL_SLOTS[slotIndex % MEAL_SLOTS.length];
                const variantIndex = cardVariantIndexes[slotIndex] ?? 0;
                const aiRecipe = getVariantRecipe(baseRecipe, variantIndex);
                const variants = COOKING_VARIANTS[baseRecipe.sourceCategory] ?? COOKING_VARIANTS.other;
                const currentVariantLabel = variants[variantIndex % variants.length]?.label;
                return (
                  <div
                    key={baseRecipe.id}
                    className="snap-start shrink-0 w-[82vw] sm:w-auto sm:flex-1 border border-[var(--theme-soft)] rounded-2xl overflow-hidden shadow-sm flex flex-col"
                    style={{ background: 'linear-gradient(90deg, var(--theme-tint), #ffffff)' }}
                  >
                    {/* 餐別標籤 */}
                    <div className="flex items-center justify-center gap-2 border-b border-slate-150/60 px-4 py-3">
                      {slot.type === '早餐' ? <Sunrise className="w-4 h-4 text-[var(--theme-text)]" />
                        : slot.type === '午餐' ? <Sun className="w-4 h-4 text-[var(--theme-text)]" />
                        : <Moon className="w-4 h-4 text-[var(--theme-text)]" />}
                      <span className="rounded-full border border-[var(--theme-soft)] bg-[var(--theme-tint)] px-2 py-0.5 text-[11px] font-extrabold text-[var(--theme-text)]">{slot.type}</span>
                      {variantIndex > 0 && (
                        <span className="rounded-full bg-[var(--theme-main)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--theme-text)]">{currentVariantLabel}</span>
                      )}
                    </div>

                    {/* 食物圖片（待開發） */}
                    <div className="relative w-full aspect-[4/3] overflow-hidden bg-[var(--theme-tint)] flex flex-col items-center justify-center gap-1.5 text-[var(--theme-text)]/30">
                      <Bot className="h-7 w-7" />
                      <span className="text-[10px] font-medium tracking-wide">圖片生成功能待開發</span>
                    </div>

                    {/* 資訊 */}
                    <div className="flex-1 p-5 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-sm text-[var(--theme-text)] leading-snug">{aiRecipe.title}</h4>
                          {aiRecipe.cookingMethod && (
                            <span className="shrink-0 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                              {aiRecipe.cookingMethod}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{aiRecipe.description}</p>
                      </div>
                      {/* 冰箱食材標籤 */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {aiRecipe.ingredients.slice(0, 4).map((item, idx) => (
                          <span key={idx} className="flex items-center gap-0.5 rounded-full border border-[var(--theme-soft)] bg-[var(--theme-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--theme-text)]">
                            <CheckCircle2 className="w-2.5 h-2.5" />{item}
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            if (aiRecipe) setSelectedAiRecipe(aiRecipe);
                          }}
                          disabled={!aiRecipe}
                          className="flex items-center gap-1.5 rounded-full bg-[var(--theme-dark)] px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-[var(--theme-main)] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer"
                        >
                          <Bot className="w-3 h-3" />
                          <span>食譜</span>
                        </button>
                        <button
                          onClick={() => handleSwapCardVariant(slotIndex)}
                          disabled={swappingSlot !== null}
                          className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition-all hover:bg-slate-50 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                          title="換烹調方式"
                        >
                          <RefreshCcw className={`w-3 h-3 ${swappingSlot === slotIndex ? 'animate-spin' : ''}`} />
                          {swappingSlot === slotIndex ? '換菜中...' : '換一道菜'}
                        </button>
                        <button
                          onClick={() => isRecipeSaved(aiRecipe.title) ? handleUnsaveRecipe(aiRecipe.title) : handleSaveRecipe(aiRecipe)}
                          className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                            isRecipeSaved(aiRecipe.title)
                              ? 'border-rose-200 bg-rose-50 text-rose-500 hover:bg-rose-100'
                              : 'border-[var(--theme-soft)] bg-white text-[var(--theme-text)] hover:bg-[var(--theme-tint)]'
                          }`}
                          title={isRecipeSaved(aiRecipe.title) ? '從我的食譜移除' : '存成我的食譜'}
                        >
                          {isRecipeSaved(aiRecipe.title) ? <BookmarkMinus className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
                          {isRecipeSaved(aiRecipe.title) ? '移除收藏' : '收藏'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 我收藏的食譜（快速查看，管理仍在社群「我的食譜」） */}
        {(() => {
          const aiSaved = myLibrary.filter(r => r.origin === 'ai');
          if (aiSaved.length === 0) return null;
          const total = aiSaved.length;
          const size = savedPageSize === 'all' ? total : savedPageSize;
          const totalPages = Math.max(1, Math.ceil(total / size));
          const page = Math.min(savedPage, totalPages);
          const paged = aiSaved.slice((page - 1) * size, page * size);
          return (
            <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bookmark className="h-4 w-4 text-[var(--theme-text)]" />
                  <h4 className="text-sm font-extrabold text-[var(--theme-text)]">我收藏的食譜</h4>
                  <span className="text-[11px] font-bold text-slate-400">{total} 道</span>
                </div>
                <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                  每頁顯示
                  <select
                    value={String(savedPageSize)}
                    onChange={e => { setSavedPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value)); setSavedPage(1); }}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 cursor-pointer outline-none focus:border-[var(--theme-main)]"
                  >
                    <option value="12">12</option>
                    <option value="24">24</option>
                    <option value="48">48</option>
                    <option value="all">全部</option>
                  </select>
                </label>
              </div>
              <p className="mb-3 text-[11px] text-slate-400">到「主廚食譜社群 › 我的食譜」即可一鍵公開分享</p>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
                {paged.map(recipe => (
                  <button
                    key={recipe.id}
                    onClick={() => openSavedRecipe(recipe)}
                    className="flex w-full flex-col gap-2 rounded-xl border border-slate-150 bg-slate-50/60 p-3 text-left transition-colors hover:border-[var(--theme-soft)] hover:bg-[var(--theme-tint)]/40 cursor-pointer"
                    title="查看食譜"
                  >
                    <p className="line-clamp-2 text-xs font-bold text-slate-800 leading-snug">{recipe.name}</p>
                    <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-400">
                      <span className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{recipe.prepTime} 分鐘</span>
                        <span className={`rounded-full px-1.5 py-0.5 font-bold ${
                          recipe.isPublic ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-200 text-slate-500'
                        }`}>
                          {recipe.isPublic ? '已公開' : '私密'}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-0.5 font-bold text-[var(--theme-text)]">看食譜 →</span>
                    </div>
                  </button>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-1.5">
                  <button
                    onClick={() => setSavedPage(page - 1)}
                    disabled={page === 1}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                  >
                    ‹
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                    <button
                      key={n}
                      onClick={() => setSavedPage(n)}
                      className={`h-7 min-w-7 rounded-lg px-2 text-xs font-bold transition-colors cursor-pointer ${
                        n === page ? 'bg-[var(--theme-dark)] text-white' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    onClick={() => setSavedPage(page + 1)}
                    disabled={page === totalPages}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                  >
                    ›
                  </button>
                </div>
              )}
            </section>
          );
        })()}

      </div>

      {/* 收藏回饋 toast */}
      <AnimatePresence>
        {saveToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 rounded-full bg-[var(--theme-dark)] px-5 py-3 text-sm font-bold text-white shadow-xl"
          >
            <span className="inline-flex items-center gap-2"><BookmarkCheck className="h-4 w-4" />{saveToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedAiRecipe && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-0 md:items-center md:p-5">
            <button
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
              onClick={() => setSelectedAiRecipe(null)}
              aria-label="關閉食譜"
            />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              className="relative z-10 max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:rounded-3xl"
            >
              <div className="border-b border-slate-100 px-5 py-4 md:px-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[var(--theme-tint)] px-3 py-1 text-[10px] font-extrabold text-[var(--theme-text)]">
                      <Bot className="h-3.5 w-3.5" />
                      Smart Fridge 食譜
                    </div>
                    <h3 className="font-sans text-2xl font-extrabold tracking-tight text-[var(--theme-text)]">
                      {selectedAiRecipe.title}
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
                      {selectedAiRecipe.description}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedAiRecipe(null)}
                    className="rounded-full bg-slate-50 p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-3 py-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {selectedAiRecipe.prepTime} 分鐘
                  </span>
                  {selectedAiRecipe.sourceItem && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5 text-rose-700">
                      即期優先：{selectedAiRecipe.sourceItem}，剩 {selectedAiRecipe.sourceDaysLeft} 天
                    </span>
                  )}
                </div>

                <button
                  onClick={() => isRecipeSaved(selectedAiRecipe.title) ? handleUnsaveRecipe(selectedAiRecipe.title) : handleSaveRecipe(selectedAiRecipe)}
                  className={`mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all cursor-pointer ${
                    isRecipeSaved(selectedAiRecipe.title)
                      ? 'border border-rose-200 bg-rose-50 text-rose-500 hover:bg-rose-100'
                      : 'bg-[var(--theme-dark)] text-white hover:bg-[var(--theme-main)]'
                  }`}
                >
                  {isRecipeSaved(selectedAiRecipe.title) ? <BookmarkMinus className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                  {isRecipeSaved(selectedAiRecipe.title) ? '移除收藏' : '存成我的食譜'}
                </button>
              </div>

              {/* ── 食材 + 步驟 ── */}
              {(() => {
                // 偵測步驟文字是否提到建議補充食材（調味料可省略）
                const suggestedKeywords = (selectedAiRecipe.suggestedIngredients ?? [])
                  .map(s => s.replace(/\s.*$/, '').match(/[一-鿿]{1,3}/)?.[0] ?? '')
                  .filter(Boolean);
                const stepHasOptional = (step: string) =>
                  suggestedKeywords.some(k => step.includes(k));

                return (
                  <div className="grid gap-4 p-5 md:grid-cols-[0.9fr_1.1fr] md:p-7">
                    {/* 食材區塊（分兩段） */}
                    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                      {/* 冰箱食材 */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600">🧊 冰箱食材</span>
                        </div>
                        <div className="space-y-1.5">
                          {(selectedAiRecipe.fridgeIngredients ?? selectedAiRecipe.ingredients).map(item => (
                            <div key={item} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700">
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 建議補充 */}
                      {(selectedAiRecipe.suggestedIngredients ?? []).length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">🧂 建議補充</span>
                          </div>
                          <div className="space-y-1.5">
                            {(selectedAiRecipe.suggestedIngredients ?? []).map(item => (
                              <div key={item} className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/60 px-3 py-2 text-sm font-semibold text-slate-400">
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-slate-300" />
                                <span>{item}</span>
                                <span className="ml-auto text-[10px] text-slate-300 font-normal whitespace-nowrap">可省略</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>

                    {/* 步驟區塊 */}
                    <section className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h4 className="mb-3 text-sm font-extrabold text-slate-900">料理步驟</h4>
                      <div className="space-y-3">
                        {selectedAiRecipe.steps.map((step, index) => {
                          const isOptional = stepHasOptional(step);
                          return (
                            <div key={step} className="grid grid-cols-[auto_1fr] gap-3">
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--theme-tint)] text-xs font-extrabold text-[var(--theme-text)]">
                                {index + 1}
                              </span>
                              <div className="pt-1">
                                <p className="text-sm font-semibold leading-relaxed text-slate-600">{step}</p>
                                {isOptional && (
                                  <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                                    ✦ 此步驟調味料可依家中庫存省略或替換
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPreferencePanel && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-0 md:items-center md:p-5">
            <button
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
              onClick={() => setShowPreferencePanel(false)}
              aria-label="關閉飲食禁忌設定"
            />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              className="relative z-10 max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl md:rounded-3xl"
            >
              {/* Header */}
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-xl text-[var(--theme-text)]">飲食禁忌設定</h3>
                  <p className="mt-1 text-xs text-slate-400">生成食譜時，AI 將自動迴避以下勾選的項目。</p>
                </div>
                <button
                  onClick={() => setShowPreferencePanel(false)}
                  className="rounded-full bg-slate-50 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* ── Section 1：過敏原 ── */}
              <div className="mb-5">
                <div className="flex items-center gap-1.5 mb-3">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">過敏原</span>
                </div>
                <div className="space-y-2">
                  {dietPreferences.filter(item => item.category === 'allergen').map(item => {
                    const isEditing = editingPreferenceId === item.id;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-2 p-2.5 bg-white border rounded-xl transition-colors text-xs font-semibold ${
                          item.selected ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 hover:border-amber-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => togglePreference(item.id)}
                          className="accent-amber-500 shrink-0 cursor-pointer"
                        />
                        {isEditing ? (
                          <input
                            value={draftPreferenceLabel}
                            onChange={e => setDraftPreferenceLabel(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') setEditingPreferenceId(null); }}
                            className="min-w-0 flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-400"
                            autoFocus
                          />
                        ) : (
                          <button onClick={() => togglePreference(item.id)} className="min-w-0 flex-1 text-left cursor-pointer text-slate-700">
                            {item.label}
                          </button>
                        )}
                        {item.selected && !isEditing && (
                          <span className="text-[9px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0">已選</span>
                        )}
                        {isEditing ? (
                          <button onClick={() => savePreferenceEdit(item.id)} className="p-1 text-green-500 hover:bg-green-50 rounded-lg transition-colors cursor-pointer shrink-0" title="儲存">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button onClick={() => startEditPreference(item)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0" title="編輯">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => removePreference(item.id)} className="p-1 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0" title="移除">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {/* 新增過敏原 */}
                <div className="flex items-center gap-2 mt-3">
                  <input
                    value={newAllergenLabel}
                    onChange={e => setNewAllergenLabel(e.target.value)}
                    placeholder="新增過敏原（如：芝麻、魚）"
                    className="min-w-0 flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <button
                    onClick={addAllergen}
                    className="w-9 h-9 flex items-center justify-center bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all cursor-pointer shrink-0"
                    title="新增過敏原"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="h-px bg-slate-100 mb-5" />

              {/* ── Section 2：疾病 / 慢性病 ── */}
              <div className="mb-5">
                <div className="flex items-center gap-1.5 mb-3">
                  <HeartPulse className="w-3.5 h-3.5 text-rose-500" />
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">疾病 / 慢性病</span>
                </div>
                <div className="space-y-2">
                  {dietPreferences.filter(item => item.category === 'disease').map(item => {
                    const isEditing = editingPreferenceId === item.id;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-2 p-2.5 bg-white border rounded-xl transition-colors text-xs font-semibold ${
                          item.selected ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200 hover:border-rose-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => togglePreference(item.id)}
                          className="accent-rose-500 mt-0.5 shrink-0 cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div className="space-y-1.5">
                              <input
                                value={draftPreferenceLabel}
                                onChange={e => setDraftPreferenceLabel(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Escape') setEditingPreferenceId(null); }}
                                placeholder="病症名稱"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-rose-400"
                                autoFocus
                              />
                              <input
                                value={draftPreferenceNote}
                                onChange={e => setDraftPreferenceNote(e.target.value)}
                                placeholder="注意事項（如：需低糖飲食）"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-400"
                              />
                            </div>
                          ) : (
                            <button onClick={() => togglePreference(item.id)} className="block w-full text-left cursor-pointer">
                              <span className="text-slate-700">{item.label}</span>
                              {item.note && (
                                <span className="ml-2 text-[10px] font-medium text-rose-500 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full">{item.note}</span>
                              )}
                            </button>
                          )}
                        </div>
                        {item.selected && !isEditing && (
                          <span className="text-[9px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0 mt-0.5">已選</span>
                        )}
                        {isEditing ? (
                          <button onClick={() => savePreferenceEdit(item.id)} className="p-1 text-green-500 hover:bg-green-50 rounded-lg transition-colors cursor-pointer shrink-0" title="儲存">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button onClick={() => startEditPreference(item)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0" title="編輯">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => removePreference(item.id)} className="p-1 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0" title="移除">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {/* 新增病症 */}
                <div className="space-y-2 mt-3">
                  <input
                    value={newDiseaseLabel}
                    onChange={e => setNewDiseaseLabel(e.target.value)}
                    placeholder="病症名稱（如：糖尿病）"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-400"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      value={newDiseaseNote}
                      onChange={e => setNewDiseaseNote(e.target.value)}
                      placeholder="注意事項（可選，如：需少糖）"
                      className="min-w-0 flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-400"
                    />
                    <button
                      onClick={addDisease}
                      className="w-9 h-9 flex items-center justify-center bg-rose-500 hover:bg-rose-600 text-white rounded-xl transition-all cursor-pointer shrink-0"
                      title="新增病症"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 套用按鈕 */}
              <button
                onClick={() => {
                  applyDietPreferences();
                  setShowPreferencePanel(false);
                }}
                className="w-full flex items-center justify-center gap-2 bg-[var(--theme-dark)] hover:bg-[var(--theme-main)] text-white text-xs font-bold px-4 py-3 rounded-xl transition-all cursor-pointer"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                套用設定
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
