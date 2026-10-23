# AI食代 SmartFridge — 開發進度 & 前端紀錄

> 最後更新：2026-06-10
> 本文件已合併原 `FEATURES.md`，是**前端開發歷史 + 技術備忘**的唯一紀錄。
>
> 📌 **後端 / Docker / 分工，請改看 [`ARCHITECTURE.md`](./ARCHITECTURE.md)（後端階段的共同合約）。**
> 本文件只保留前端階段的成果與踩過的坑（技術備忘那節特別重要，別刪）。

---

## 專案概況

| 項目 | 說明 |
|------|------|
| 專案名稱 | AI食代 SmartFridge — 智慧冰箱管理系統 |
| 技術棧 | React 19 + TypeScript + Vite 6 + Tailwind CSS v4 + Framer Motion v12 |
| 原始來源 | Google AI Studio 匯出 |
| 目前版本 | v2（持續修改中） |
| 報告日期 | 2026 年 7 月 8 日 |

---

## 已完成的修改

### Bug 修復

- [x] **Tailwind 自訂 class 失效** — 將 `text-3xs`、`text-2xs`、`border-slate-150`、`bg-slate-55`、`bg-emerald-990` 等 AI Studio 自創的非標準 class 補進 `src/index.css`（`@layer utilities` + `@theme`）；這是造成「尺寸超怪」的根本原因
- [x] **搜尋圖示顯示錯誤** — Header 搜尋框圖示從 `LayoutDashboard` 改為 `Search`
- [x] **購物比價欄位比較列（價格比較條）為靜態** — 改為根據各商品真實最低價動態計算百分比
- [x] **重置按鈕觸發 `window.location.reload()`** — 改為 `setIngredients(INITIAL_INGREDIENTS)`，避免重載後登出
- [x] **Progress bar 使用 inline style 導致無法動態切色** — 改為 Tailwind className 條件判斷
- [x] **`z-15` 不是合法 Tailwind class** — 改為 `z-20`
- [x] **`bg-slate-55`、`border-emerald-990` 等** — 逐一替換為最接近的標準 Tailwind 色階

### 版面重構

- [x] **移除外框灰色邊框 / 浮動卡片感** — 將外層 `max-h-[95vh]` padding + rounded 全移除，改為 `h-screen overflow-hidden` 全螢幕佈局
- [x] **Flex scroll 修正** — 內容區加上 `min-h-0` 讓 `overflow-y-auto` 生效（否則 Flex 子元素無法捲動）
- [x] **Sidebar 可收合** — 桌面版新增收合按鈕，寬度在 `w-16` / `w-52` 切換

### 行動版（Mobile）優化

- [x] **Sidebar 行動版隱藏，改用底部導覽列** — `md:hidden` 底部 nav，含五個頁面快捷按鈕 + 上方 active indicator 線段動畫
- [x] **Header 行動版顯示當前頁面名稱**（桌面顯示品牌文字）
- [x] **導覽說明按鈕行動版僅顯示圖示**，桌面顯示完整文字
- [x] **FAB（AI 掃描鈕）行動版位置調整**：`bottom-24` 避免與底部 nav 重疊
- [x] **庫存清單行動版改為分類 Accordion**
  - 依類別（生鮮農產 / 精緻乳製 / 時令水果 / 頂級肉品 / 其他）分組
  - 每組可展開 / 收合，預設全部展開
  - 有即期食材時顯示 ⚡ 急件紅色 badge
  - 每筆食材顯示：名稱、剩餘天數色階 badge、數量、存放位置、刪除按鈕
  - 桌面版保留原始完整 table

### Tour 導覽重構

- [x] **導覽遮罩改為 Spotlight 效果** — 從 `backdrop-blur + bg-black/60`（讓所有內容模糊）改為 `box-shadow: 0 0 0 9999px` 的 spotlight 技術，目標元素清晰可見
- [x] **行動版目標元素不存在時的 Fallback** — sidebar 在行動版是 `display:none`，偵測到 `getBoundingClientRect()` 為 0×0 時，改為置中 modal 顯示

---

## 各頁面現況

| 頁面 | 桌面 | 行動版 | 備註 |
|------|------|--------|------|
| 庫存概覽 DashboardView | ✅ | ✅ | Accordion 已完成 |
| 營養分析 NutritionView | ✅ | ✅ | 資料為靜態 mock |
| 週功能表 PlannerView | ✅ | ✅ | 資料為靜態 mock |
| 購物比價 ShoppingView | ✅ | ✅ | 已改 table-fixed + colgroup，CP值獲勝欄琥珀框 |
| 門市地圖 StoreView | ✅ | ✅ | SVG 地圖（去留待全組確認） |
| 社區廚房 CommunityView | ✅ | ✅ | 食譜分享、追蹤主廚、廚師等級、來源篩選 |
| 系統設定 SettingsView | ✅ | ✅ | localStorage 持久化 |
| 登入頁 AuthScreen | ✅ | ✅ | |
| Tour 導覽 TourOverlay | ✅ | ✅ | Spotlight 效果 |

---

## 已知問題 / 待辦

### 高優先

- [ ] **購物比價行動版** — table 在 375px 太寬，建議改為可展開的價格卡片
- [ ] **食材刪除無 Undo 機制** — 誤刪只能重置全部資料；建議加 2 秒 Toast + Undo
- [ ] **AI 掃描結果沒有 highlight 新食材** — 掃描成功後沒有視覺提示說哪筆是新增的

### 中優先

- [ ] **營養分析與庫存完全脫鉤** — 食譜推薦是靜態，理想上應根據冰箱現有食材推薦
- [ ] **週功能表無法互動** — 靜態展示，未與庫存或購物清單串接
- [ ] **Header 與清單內都有搜尋框（桌面版重複）** — 建議擇一

### 低優先

- [ ] **保鮮進度條語意** — 「100%」看起來像「很多」，其實代表「快過期」；文案或顏色需調整
- [ ] **「燃脂保鮮分值 A+」為固定值** — 不是真實計算，建議改為佔位狀態或拿掉

---

## 未來規劃功能

- [ ] **真實 AI 圖片辨識串接** — 串接 Gemini Vision API，拍照辨識食材
- [ ] **食材 → 推薦食譜 → 加入菜單 → 補貨提醒**（完整主線任務流）
- [ ] **分類統計圓餅圖 + 分類篩選面板**（參考第三張 reference 圖，已確認要做）
- [ ] **購物清單行動版卡片化**

---

## 技術備忘

```
src/
├── App.tsx              # 主架構：Auth gate、sidebar、mobile nav、tour
├── index.css            # Tailwind v4 入口；自訂 class 補丁在此
├── types.ts             # Ingredient 介面
├── data.ts              # INITIAL_INGREDIENTS、TOUR_STEPS、RECOMMENDATIONS
└── components/
    ├── AuthScreen.tsx   # 登入/選角畫面
    ├── DashboardView.tsx  # 庫存概覽（accordion + table）
    ├── NutritionView.tsx  # 營養分析（bar chart + donut chart）
    ├── PlannerView.tsx    # 週功能表
    ├── ShoppingView.tsx   # 購物比價
    ├── SettingsView.tsx   # 系統設定
    └── TourOverlay.tsx    # 新手 spotlight 導覽
```

**重要 Tailwind v4 自訂 class（位於 `src/index.css`）：**

```css
@layer utilities {
  .text-3xs { font-size: 0.625rem; line-height: 1rem; }
  .text-2xs { font-size: 0.6875rem; line-height: 1.1rem; }
}
@theme {
  --color-slate-55:    #f9fafc;
  --color-slate-150:   #e8ecf2;
  --color-teal-850:    #115e59;
  --color-emerald-990: #022c22;
}
```

**Flex scroll 魔法公式：**
```
父元素：flex flex-col overflow-hidden
可捲動子元素：flex-1 min-h-0 overflow-y-auto   ← min-h-0 缺一不可
```

**Spotlight Tour 技術：**
```css
box-shadow: 0 0 0 9999px rgba(0,0,0,0.48), 0 0 20px rgba(52,211,153,0.35);
/* 單一元素的 box-shadow 撐滿整個視窗當遮罩，目標元素自然被裁出來 */
```
