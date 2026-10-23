/**
 * 主廚等級制度（共用）
 *
 * 邏輯：依該主廚「累積公開分享的食譜數量」自動分級，分享越多、資歷越深。
 * 名稱對應「產量／資歷」而非人氣：
 *  - 見習廚人（0–4 道）
 *  - 家常廚人（5–14 道）
 *  - 進階廚人（15–29 道）
 *  - 料理達人（30–59 道）
 *  - 星級名廚（60 道以上）
 *
 * App 側邊欄與社群頁共用同一套規則，確保等級一致。
 */

export type ChefTier = {
  key: string;
  label: string;
  className: string;    // 填色徽章（卡片／主頁用）
  dotClass: string;     // 進程圓點顏色（規則說明用）
  textClass: string;    // 進程文字顏色（規則說明用）
  min: number;          // 達到此「累積食譜分享數」即屬此級
};

// 由高到低排列，方便用 find 取第一個達標的等級
export const CHEF_TIERS: ChefTier[] = [
  // 原創軌統一用「琥珀金」一個色系，由淺到深代表資歷，不再五顏六色
  { key: 'star',     label: '星級名廚', className: 'bg-amber-400 text-white',   dotClass: 'bg-amber-500', textClass: 'text-amber-700', min: 60 },
  { key: 'master',   label: '料理達人', className: 'bg-amber-200 text-amber-900', dotClass: 'bg-amber-500', textClass: 'text-amber-800', min: 30 },
  { key: 'advanced', label: '進階廚人', className: 'bg-amber-100 text-amber-800', dotClass: 'bg-amber-400', textClass: 'text-amber-700', min: 15 },
  { key: 'home',     label: '家常廚人', className: 'bg-amber-50 text-amber-700',  dotClass: 'bg-amber-300', textClass: 'text-amber-600', min: 5 },
  { key: 'rookie',   label: '見習廚人', className: 'bg-slate-100 text-slate-500', dotClass: 'bg-slate-300', textClass: 'text-slate-500', min: 0 },
];

export const getChefTier = (recipeCount: number): ChefTier =>
  CHEF_TIERS.find(tier => recipeCount >= tier.min) ?? CHEF_TIERS[CHEF_TIERS.length - 1];

/**
 * AI 美食家等級制度（第二條獨立的徽章線）
 *
 * 依「公開分享的 AI 配餐食譜數量」自動分級，與主廚等級互不影響。
 * 名稱一律以「AI」開頭，讓人一眼就知道這是 AI 配餐軌、不是原創軌：
 *  - AI 嚐鮮家（0–4 道）
 *  - AI 玩家（5–14 道）
 *  - AI 調味師（15–29 道）
 *  - AI 美食家（30–59 道）
 *  - AI 配餐大師（60 道以上）
 *
 * 門檻與原創軌一致（5 / 15 / 30 / 60），顏色統一用「天藍」一個色系。
 */
export const AI_TIERS: ChefTier[] = [
  { key: 'ai-master',   label: 'AI 配餐大師', className: 'bg-sky-500 text-white',   dotClass: 'bg-sky-500', textClass: 'text-sky-700', min: 60 },
  { key: 'ai-gourmet',  label: 'AI 美食家',   className: 'bg-sky-200 text-sky-900', dotClass: 'bg-sky-500', textClass: 'text-sky-800', min: 30 },
  { key: 'ai-seasoner', label: 'AI 調味師',   className: 'bg-sky-100 text-sky-800', dotClass: 'bg-sky-400', textClass: 'text-sky-700', min: 15 },
  { key: 'ai-player',   label: 'AI 玩家',     className: 'bg-sky-50 text-sky-700',  dotClass: 'bg-sky-300', textClass: 'text-sky-600', min: 5 },
  { key: 'ai-rookie',   label: 'AI 嚐鮮家',   className: 'bg-slate-100 text-slate-500', dotClass: 'bg-slate-300', textClass: 'text-slate-500', min: 0 },
];

export const getAiChefTier = (aiRecipeCount: number): ChefTier =>
  AI_TIERS.find(tier => aiRecipeCount >= tier.min) ?? AI_TIERS[AI_TIERS.length - 1];

/** 算出「離下一級還差幾道」；已滿級回 null。給進度提示用。 */
export const getNextTierGap = (
  count: number,
  tiers: ChefTier[],
): { next: ChefTier; remaining: number } | null => {
  const next = tiers
    .slice()
    .sort((a, b) => a.min - b.min)
    .find(tier => tier.min > count);
  return next ? { next, remaining: next.min - count } : null;
};

// Deprecated compatibility fallback. App now calculates this from recipes API data.
const readMyRecipes = (): { isPublic?: boolean; origin?: string }[] => {
  try {
    const value = JSON.parse('[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

/** 原創公開食譜數（origin ≠ ai）→ 累積「主廚等級」 */
export const getUserOriginalRecipeCount = (): number =>
  readMyRecipes().filter(recipe => recipe?.isPublic && recipe?.origin !== 'ai').length;

/** AI 配餐公開分享數（origin = ai）→ 累積「AI 美食家」 */
export const getUserAiRecipeCount = (): number =>
  readMyRecipes().filter(recipe => recipe?.isPublic && recipe?.origin === 'ai').length;

/**
 * 主徽章（單一稱號）計算規則：
 *  - 原創公開數與 AI 公開數「分開計算」
 *  - 取「較多的那一軌」當作使用者的稱號
 *  - 平手時，原創優先（鼓勵原創）
 * 回傳該稱號的等級、屬於哪一軌、以及那一軌的分享數（用來顯示在徽章旁）。
 */
export type MainBadge = {
  tier: ChefTier;
  track: 'original' | 'ai';
  count: number;
};

export const getMainBadge = (originalCount: number, aiCount: number): MainBadge =>
  originalCount >= aiCount
    ? { tier: getChefTier(originalCount), track: 'original', count: originalCount }
    : { tier: getAiChefTier(aiCount), track: 'ai', count: aiCount };

export const getUserMainBadge = (): MainBadge =>
  getMainBadge(getUserOriginalRecipeCount(), getUserAiRecipeCount());
