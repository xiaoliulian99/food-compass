import {
  Check,
  ChevronRight,
  Clock3,
  Compass,
  Download,
  History,
  MapPin,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  Share2,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Trash2,
  Users,
  Wallet,
  X,
  createIcons,
} from "lucide";
import { CATEGORIES, DEFAULT_STORES, REGIONS } from "./data.js";
import { COOLDOWN_DAYS, daysSince, getCandidates, recommendationReason } from "./recommender.js";
import { createStoreSearchIndex, matchesSearchIndex, matchesStoreSearch } from "./store-search.js";
import "./styles.css";

const STORAGE_KEY = "food-compass-v1";
const app = document.querySelector("#app");
let deferredInstallPrompt = null;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function canOfferInstall() {
  return !isStandalone() && (Boolean(deferredInstallPrompt) || isIos());
}

function currentMeal() {
  const hour = new Date().getHours();
  return hour >= 15 ? "晚饭" : "午饭";
}

function defaultState() {
  return {
    stores: structuredClone(DEFAULT_STORES),
    history: [],
    pending: null,
    settings: {
      budget: 30,
      partySize: 3,
      meal: currentMeal(),
      regions: [...REGIONS],
      includeTakeout: true,
      preferredCategories: [],
      scene: "都可以",
    },
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.stores)) return defaultState();
    return {
      ...defaultState(),
      ...saved,
      settings: { ...defaultState().settings, ...saved.settings },
    };
  } catch {
    return defaultState();
  }
}

let data = loadState();
let ui = {
  view: "home",
  search: "",
  storeFilter: "全部",
  recommendations: [],
  hasPicks: false,
  editingStoreId: null,
  logSearch: "",
  toast: "",
};

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const SPICY_CATEGORIES = ["火锅", "干锅", "焖锅", "烤鱼", "川菜", "冒菜", "麻辣烫"];
const CANTEEN_REGIONS = ["一食堂", "二食堂", "三食堂"];
const RUSH_REGIONS = ["一食堂", "二食堂", "三食堂", "东一门", "东二门"];
const RAIN_REGIONS = ["外卖", "一食堂", "二食堂", "三食堂"];
const SCENE_ORDER = ["都可以", "赶课", "下雨不出门", "想吃辣", "只食堂", "夜宵"];

function sameSet(left = [], right = []) {
  if (left.length !== right.length) return false;
  const pool = new Set(left);
  return right.every((item) => pool.has(item));
}

function matchesRush(settings) {
  return settings.budget === 20 && !settings.includeTakeout && sameSet(settings.regions, RUSH_REGIONS) && !(settings.preferredCategories ?? []).length;
}

function matchesCanteenOnly(settings) {
  return !settings.includeTakeout && sameSet(settings.regions, CANTEEN_REGIONS) && !(settings.preferredCategories ?? []).length;
}

function matchesRain(settings) {
  return settings.includeTakeout && sameSet(settings.regions, RAIN_REGIONS) && !(settings.preferredCategories ?? []).length;
}

function matchesSpicy(settings) {
  return sameSet(settings.preferredCategories ?? [], SPICY_CATEGORIES);
}

function matchesLateNight(settings) {
  return settings.meal === "晚饭" && settings.includeTakeout && settings.budget >= 25 && !(settings.preferredCategories ?? []).length;
}

function matchesOpen(settings) {
  return settings.includeTakeout && sameSet(settings.regions, REGIONS) && !(settings.preferredCategories ?? []).length;
}

function sceneStillMatches(sceneId, settings) {
  if (sceneId === "都可以") return matchesOpen(settings);
  if (sceneId === "赶课") return matchesRush(settings);
  if (sceneId === "下雨不出门") return matchesRain(settings);
  if (sceneId === "想吃辣") return matchesSpicy(settings);
  if (sceneId === "只食堂") return matchesCanteenOnly(settings);
  if (sceneId === "夜宵") return matchesLateNight(settings);
  return false;
}

function activeSceneId() {
  const settings = data.settings;
  const pinned = settings.scene;
  if (pinned && SCENE_ORDER.includes(pinned) && sceneStillMatches(pinned, settings)) return pinned;
  if (matchesRush(settings)) return "赶课";
  if (matchesCanteenOnly(settings)) return "只食堂";
  if (matchesRain(settings)) return "下雨不出门";
  if (matchesSpicy(settings)) return "想吃辣";
  if (matchesOpen(settings)) return "都可以";
  return "";
}

function applyScene(sceneId) {
  const settings = data.settings;
  settings.scene = sceneId;
  if (sceneId === "都可以") {
    settings.regions = [...REGIONS];
    settings.includeTakeout = true;
    settings.preferredCategories = [];
  } else if (sceneId === "赶课") {
    settings.budget = 20;
    settings.regions = [...RUSH_REGIONS];
    settings.includeTakeout = false;
    settings.preferredCategories = [];
  } else if (sceneId === "下雨不出门") {
    settings.regions = [...RAIN_REGIONS];
    settings.includeTakeout = true;
    settings.preferredCategories = [];
  } else if (sceneId === "想吃辣") {
    settings.preferredCategories = [...SPICY_CATEGORIES];
  } else if (sceneId === "只食堂") {
    settings.regions = [...CANTEEN_REGIONS];
    settings.includeTakeout = false;
    settings.preferredCategories = [];
  } else if (sceneId === "夜宵") {
    settings.meal = "晚饭";
    settings.includeTakeout = true;
    settings.budget = Math.max(settings.budget, 25);
    if (!settings.regions.length) settings.regions = [...REGIONS];
    settings.preferredCategories = [];
  }
}

function sceneToast(sceneId) {
  return {
    都可以: "已取消限制，全都看看",
    赶课: "已切到赶课：食堂和校门，人均 20",
    下雨不出门: "已切到下雨不出门：食堂加外卖",
    想吃辣: "已切到想吃辣：火锅干锅川菜优先",
    只食堂: "已切到只食堂：不出校门",
    夜宵: "已切到夜宵：晚饭，外卖打开",
  }[sceneId];
}

function startOfLocalDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function weeklyHistory(now = new Date()) {
  const start = startOfLocalDay(now);
  start.setDate(start.getDate() - 6);
  return data.history.filter((entry) => new Date(entry.confirmedAt) >= start);
}

function weeklyReport(now = new Date()) {
  const week = weeklyHistory(now).sort((a, b) => new Date(b.confirmedAt) - new Date(a.confirmedAt));
  const uniqueStores = new Set(week.map((entry) => entry.storeId)).size;
  const categoryCounts = week.reduce((counts, entry) => {
    counts[entry.category] = (counts[entry.category] || 0) + 1;
    return counts;
  }, {});
  const topCategory = Object.entries(categoryCounts).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    const latestA = week.find((entry) => entry.category === a[0]);
    const latestB = week.find((entry) => entry.category === b[0]);
    return new Date(latestB?.confirmedAt || 0) - new Date(latestA?.confirmedAt || 0);
  })[0];
  const cooldownCount = new Set(
    data.history
      .filter((entry) => !entry.cooldownExempt && daysSince(entry.confirmedAt, now) < COOLDOWN_DAYS)
      .map((entry) => entry.storeId),
  ).size;
  const canteenCount = week.filter((entry) => {
    const store = data.stores.find((item) => item.id === entry.storeId);
    return CANTEEN_REGIONS.includes(store?.area || entry.location);
  }).length;
  const takeoutCount = week.filter((entry) => {
    const store = data.stores.find((item) => item.id === entry.storeId);
    return store?.takeoutOnly || store?.area === "外卖" || entry.location.includes("线上");
  }).length;
  const summary = topCategory
    ? `这周${topCategory[0]} ${topCategory[1]} 次，食堂 ${canteenCount} 顿，外卖 ${takeoutCount} 顿`
    : "";
  return {
    count: week.length,
    uniqueStores,
    topCategory: topCategory?.[0] || "无",
    topCategoryCount: topCategory?.[1] || 0,
    cooldownCount,
    canteenCount,
    takeoutCount,
    summary,
    categoryCounts,
  };
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function icon(name, size = 18) {
  return `<i data-lucide="${name}" width="${size}" height="${size}" aria-hidden="true"></i>`;
}

function categoryTone(category) {
  const map = {
    火锅: "coral",
    干锅: "coral",
    焖锅: "coral",
    烤鱼: "coral",
    川菜: "coral",
    面食: "yellow",
    面点: "yellow",
    饺子: "yellow",
    小吃: "mint",
    甜品: "pink",
    水果: "pink",
    米饭: "blue",
    快餐: "blue",
    家常菜: "green",
  };
  return map[category] || "purple";
}

function showToast(message) {
  ui.toast = message;
  render();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    ui.toast = "";
    render();
  }, 2200);
}

function generateRecommendations() {
  ui.recommendations = getCandidates(data.stores, data.history, {
    ...data.settings,
    regions: data.settings.regions,
  });
}

function pendingStore() {
  return data.pending ? data.stores.find((store) => store.id === data.pending.storeId) : null;
}

function renderNav() {
  const items = [
    ["home", "compass", "选吃的"],
    ["stores", "store", "店铺库"],
    ["history", "history", "吃过的"],
  ];
  return `<nav class="app-nav" aria-label="主要导航">
    ${items
      .map(
        ([view, iconName, label]) => `<button class="nav-item ${ui.view === view ? "active" : ""}" data-action="navigate" data-view="${view}" type="button">
          ${icon(iconName, 21)}<span>${label}</span>
        </button>`,
      )
      .join("")}
  </nav>`;
}

function renderPending() {
  const store = pendingStore();
  if (!store) return "";
  return `<section class="pending-strip" aria-labelledby="pending-title">
    <div class="pending-copy">
      <span class="eyebrow">待确认用餐</span>
      <h2 id="pending-title">最后吃了「${escapeHtml(store.name)}」吗？</h2>
      <p>${escapeHtml(store.location)} · 只有确认后才会进入冷却期</p>
    </div>
    <div class="pending-actions">
      <button class="key-button key-green" data-action="confirm-pending" type="button">${icon("check", 18)}吃了</button>
      <button class="key-button key-yellow" data-action="open-alternative" type="button">吃了别家</button>
      <button class="icon-button key-red" data-action="cancel-pending" type="button" aria-label="没去这家" title="没去">${icon("x", 20)}</button>
    </div>
  </section>`;
}

function renderHero() {
  const activeCount = data.stores.filter((store) => store.active).length;
  return `<section class="scene-header">
    <div class="scene-scrim"></div>
    <div class="wood-sign">
      <span class="wood-sign-small">SWPU 饭点专用</span>
      <h1>美食指南针</h1>
    </div>
    <div class="register-display" aria-label="当前用餐设置">
      <span>${data.settings.meal}</span>
      <strong>${data.settings.partySize} 人 · ¥${data.settings.budget}</strong>
      <small>${activeCount} 家营业中</small>
    </div>
    ${canOfferInstall() ? `<button class="install-launcher" data-action="install-app" type="button">${icon("download", 18)}<span>安装</span></button>` : ""}
  </section>`;
}

function renderControls() {
  const regions = REGIONS.map(
    (region) => `<label class="filter-chip">
      <input type="checkbox" name="region" value="${region}" ${data.settings.regions.includes(region) ? "checked" : ""} />
      <span>${region}</span>
    </label>`,
  ).join("");

  const scene = activeSceneId();
  const sceneChips = SCENE_ORDER.map(
    (id) => `<button class="scene-chip ${scene === id ? "active" : ""}" data-action="apply-scene" data-scene="${id}" type="button">${escapeHtml(id)}</button>`,
  ).join("");

  return `<section class="order-console" aria-labelledby="console-title">
    <div class="console-heading">
      <div>
        <span class="eyebrow">点餐台</span>
        <h2 id="console-title">这顿按什么来？</h2>
      </div>
      <button class="icon-button" data-action="open-filters" type="button" aria-label="展开地点筛选" title="筛选地点">${icon("sliders-horizontal", 20)}</button>
    </div>

    <div class="scene-row" role="listbox" aria-label="场景一键">
      ${sceneChips}
    </div>

    <div class="control-grid">
      <fieldset class="control-group">
        <legend>${icon("clock-3", 16)}饭点</legend>
        <div class="segmented">
          ${["午饭", "晚饭"].map((meal) => `<button class="segment ${data.settings.meal === meal ? "active" : ""}" data-action="set-meal" data-meal="${meal}" type="button">${meal}</button>`).join("")}
        </div>
      </fieldset>

      <fieldset class="control-group">
        <legend>${icon("users", 16)}人数</legend>
        <div class="stepper">
          <button data-action="party-down" type="button" aria-label="减少人数">−</button>
          <output>${data.settings.partySize}</output>
          <button data-action="party-up" type="button" aria-label="增加人数">＋</button>
        </div>
      </fieldset>

      <fieldset class="control-group budget-control">
        <legend>${icon("wallet", 16)}人均预算 <strong>¥${data.settings.budget}</strong></legend>
        <input id="budget-range" type="range" min="10" max="50" step="5" value="${data.settings.budget}" aria-label="人均预算" />
      </fieldset>
    </div>

    <div class="filter-panel" id="filter-panel" hidden>
      <div class="filter-panel-heading">
        <strong>可接受范围</strong>
        <button class="text-button" data-action="toggle-all-regions" type="button">全选 / 清空</button>
      </div>
      <div class="filter-chips">${regions}</div>
      <label class="switch-row">
        <span>${icon("shopping-bag", 17)}包含纯外卖店</span>
        <input type="checkbox" id="takeout-toggle" ${data.settings.includeTakeout ? "checked" : ""} />
      </label>
    </div>

    <button class="recommend-button" data-action="recommend" type="button">
      ${icon("compass", 23)}<span>给我三家</span><small>避开近三天吃过的</small>
    </button>
  </section>`;
}

function renderRecommendations() {
  if (!ui.hasPicks) {
    return `<section class="empty-state">
      <span class="empty-number">03</span>
      <h2>柜台还没开单</h2>
      <p>按下“给我三家”，今天的纠结到此为止。</p>
    </section>`;
  }

  if (!ui.recommendations.length) {
    return `<section class="empty-state">
      <span class="empty-number">00</span>
      <h2>这组条件筛空了</h2>
      <p>换个场景，或者把地点再放开一点。</p>
    </section>`;
  }

  return `<section class="results-section" aria-labelledby="results-title">
    <div class="section-heading">
      <h2 id="results-title">今天从这三家选</h2>
      <button class="icon-button" data-action="recommend" type="button" aria-label="换一批推荐" title="换一批">${icon("refresh-cw", 20)}</button>
    </div>
    <div class="ticket-grid">
      ${ui.recommendations
        .map(
          (store, index) => `<article class="meal-ticket tone-${categoryTone(store.category)}" style="--delay:${index * 70}ms">
            <div class="ticket-topline">
              <span class="ticket-number">0${index + 1}</span>
              <span class="source-stamp">${store.verified ? "常吃" : "帖子严选"}</span>
            </div>
            <div class="ticket-title">
              <span class="food-mark" aria-hidden="true">${["◉", "◆", "✦"][index]}</span>
              <div>
                <span class="category-label">${escapeHtml(store.category)}</span>
                <h3>${escapeHtml(store.name)}</h3>
              </div>
            </div>
            <dl class="ticket-meta">
              <div><dt>${icon("map-pin", 15)}位置</dt><dd>${escapeHtml(store.location)}</dd></div>
              <div><dt>${icon("wallet", 15)}人均</dt><dd>约 ¥${store.price}</dd></div>
            </dl>
            <p class="reason-line">${escapeHtml(recommendationReason(store, data.history))}</p>
            <button class="choose-button" data-action="choose-store" data-id="${store.id}" type="button">就去这家 ${icon("chevron-right", 18)}</button>
          </article>`,
        )
        .join("")}
    </div>
  </section>`;
}

function renderHome() {
  return `${renderPending()}${renderHero()}<main class="main-content">${renderControls()}${renderRecommendations()}</main>`;
}

function renderStores() {
  const filtered = data.stores
    .filter((store) => {
      const matchesFilter = ui.storeFilter === "全部" || (ui.storeFilter === "营业中" ? store.active : !store.active);
      return matchesFilter;
    })
    .sort((a, b) => Number(b.verified) - Number(a.verified) || a.name.localeCompare(b.name, "zh-CN"));
  const visibleCount = filtered.filter((store) => matchesStoreSearch(store, ui.search)).length;

  return `<main class="page-shell">
    <header class="page-header">
      <div><span class="eyebrow">店铺档案</span><h1>店铺库</h1><p>${data.stores.filter((store) => store.active).length} 家参与推荐，随时可以修正。</p></div>
      <button class="key-button key-green" data-action="add-store" type="button">${icon("plus", 18)}新增</button>
    </header>
    <div class="store-toolbar">
      <label class="search-box">${icon("search", 18)}<input id="store-search" type="search" placeholder="搜店名、区域或品类" value="${escapeHtml(ui.search)}" /></label>
      <div class="segmented compact">
        ${["全部", "营业中", "已停用"].map((filter) => `<button class="segment ${ui.storeFilter === filter ? "active" : ""}" data-action="store-filter" data-filter="${filter}" type="button">${filter}</button>`).join("")}
      </div>
    </div>
    <section class="store-list" aria-label="店铺列表">
      ${filtered.length ? filtered.map(renderStoreRow).join("") : `<div class="empty-list">没有找到匹配店铺</div>`}
      <div class="empty-list live-search-empty" ${filtered.length && !visibleCount ? "" : "hidden"}>没有找到匹配店铺</div>
    </section>
  </main>`;
}

function renderStoreRow(store) {
  const hiddenAttr = matchesStoreSearch(store, ui.search) ? "" : " hidden";
  return `<article class="store-row ${store.active ? "" : "inactive"}" data-search="${escapeHtml(createStoreSearchIndex(store))}"${hiddenAttr}>
    <div class="store-avatar tone-${categoryTone(store.category)}">${escapeHtml(store.name.slice(0, 1))}</div>
    <div class="store-row-copy">
      <div class="store-row-title"><h2>${escapeHtml(store.name)}</h2>${store.verified ? `<span>常吃</span>` : ""}</div>
      <p>${escapeHtml(store.category)} · ${escapeHtml(store.location)} · 约 ¥${store.price}</p>
    </div>
    <div class="row-actions">
      <button class="icon-button small" data-action="edit-store" data-id="${store.id}" type="button" aria-label="编辑 ${escapeHtml(store.name)}" title="编辑">${icon("pencil", 17)}</button>
      <button class="icon-button small ${store.active ? "power-on" : ""}" data-action="toggle-store" data-id="${store.id}" type="button" aria-label="${store.active ? "停用" : "启用"} ${escapeHtml(store.name)}" title="${store.active ? "停用" : "启用"}">${icon("power", 17)}</button>
    </div>
  </article>`;
}

function renderWeeklyReport() {
  const report = weeklyReport();
  if (!report.count) {
    return `<section class="weekly-report empty-week" aria-labelledby="weekly-title">
      <h2 id="weekly-title">本周食报</h2>
      <p class="weekly-empty">这周还没记下饭。选一家，吃完回来按“吃了”。</p>
    </section>`;
  }

  const bars = Object.entries(report.categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(
      ([category, count]) => `<div class="week-bar">
        <span>${escapeHtml(category)}</span>
        <i style="width:${Math.max(18, Math.round((count / report.count) * 100))}%"></i>
        <em>${count}</em>
      </div>`,
    )
    .join("");

  return `<section class="weekly-report" aria-labelledby="weekly-title">
    <h2 id="weekly-title">本周食报</h2>
    <p class="weekly-summary">${report.count} 顿 · ${report.uniqueStores} 家 · ${escapeHtml(report.topCategory)}重复最多 · 冷却 ${report.cooldownCount} 家</p>
    <div class="week-bars">${bars}</div>
  </section>`;
}

function removeFromCooldown(entryId) {
  const entry = data.history.find((item) => item.id === entryId);
  if (!entry) return;
  entry.cooldownExempt = true;
  persist();
  generateRecommendations();
  render();
  showToast(`已解除「${entry.storeName}」冷却，记录还在`);
}

function renderHistory() {
  const recent = [...data.history].sort((a, b) => new Date(b.confirmedAt) - new Date(a.confirmedAt));
  const now = new Date();

  return `${renderPending()}<main class="page-shell">
    <header class="page-header">
      <div><h1>吃过的</h1><p>饭后确认，或自己补记今天吃了哪家。</p></div>
      <button class="key-button key-green" data-action="open-log-meal" type="button">${icon("plus", 18)}记下今天</button>
    </header>
    ${renderWeeklyReport()}
    <section class="timeline" aria-label="用餐记录">
      ${recent.length ? recent.map((entry) => {
        const inCooldown = !entry.cooldownExempt && daysSince(entry.confirmedAt, now) < COOLDOWN_DAYS;
        return `<article class="timeline-entry">
          <span class="timeline-dot"></span>
          <div class="timeline-entry-content">
            <div>
              <time>${formatDate(entry.confirmedAt)}</time>
              <h2>${escapeHtml(entry.storeName)}</h2>
              <p>${escapeHtml(entry.category)} · ${escapeHtml(entry.location)}</p>
            </div>
            ${inCooldown ? `<button class="cooldown-remove-button" data-action="remove-cooldown" data-id="${escapeHtml(entry.id)}" type="button" title="剔除冷却" aria-label="剔除冷却">${icon("x", 16)}剔除冷却</button>` : ""}
          </div>
        </article>`;
      }).join("") : `<div class="empty-list"><strong>还没有确认记录</strong><span>选一家，吃完回来按“吃了”。</span></div>`}
    </section>
    ${recent.length ? `<button class="text-button danger-text" data-action="clear-history" type="button">${icon("trash-2", 16)}清空记录</button>` : ""}
  </main>`;
}

function storeDialogTemplate() {
  const store = data.stores.find((item) => item.id === ui.editingStoreId);
  const value = (key, fallback = "") => escapeHtml(store?.[key] ?? fallback);
  return `<dialog id="store-dialog" class="app-dialog">
    <form class="dialog-card" id="store-form">
      <div class="dialog-heading">
        <div><span class="eyebrow">${store ? "店铺编辑" : "新增入库"}</span><h2>${store ? "编辑店铺" : "新增店铺"}</h2></div>
        <button class="icon-button" data-action="close-dialog" data-dialog="store-dialog" type="button" aria-label="关闭">${icon("x", 20)}</button>
      </div>
      <input type="hidden" name="id" value="${value("id")}" />
      <label class="field"><span>店名</span><input name="name" required maxlength="30" value="${value("name")}" placeholder="例如：盛源饭店" /></label>
      <div class="field-grid">
        <label class="field"><span>区域</span><select name="area" required>${REGIONS.map((region) => `<option value="${region}" ${store?.area === region ? "selected" : ""}>${region}</option>`).join("")}</select></label>
        <label class="field"><span>人均价格</span><input name="price" type="number" min="1" max="200" required value="${value("price", 20)}" /></label>
      </div>
      <label class="field"><span>具体位置</span><input name="location" required maxlength="50" value="${value("location")}" placeholder="例如：二食堂二楼" /></label>
      <label class="field"><span>品类</span><input name="category" list="category-list" required maxlength="20" value="${value("category")}" placeholder="例如：面食" /><datalist id="category-list">${CATEGORIES.map((category) => `<option value="${category}"></option>`).join("")}</datalist></label>
      <label class="field"><span>推荐备注</span><input name="note" maxlength="80" value="${value("note")}" placeholder="例如：牛肉面分量足" /></label>
      <label class="switch-row form-switch"><span>${icon("shopping-bag", 17)}仅支持外卖</span><input name="takeoutOnly" type="checkbox" ${store?.takeoutOnly ? "checked" : ""} /></label>
      <button class="key-button key-green full-width" value="default" type="submit">${icon("check", 18)}保存店铺</button>
    </form>
  </dialog>`;
}

function alternativeDialogTemplate() {
  return `<dialog id="alternative-dialog" class="app-dialog">
    <form class="dialog-card" id="alternative-form">
      <div class="dialog-heading"><div><span class="eyebrow">实际用餐</span><h2>实际吃了哪家？</h2></div><button class="icon-button" data-action="close-dialog" data-dialog="alternative-dialog" type="button" aria-label="关闭">${icon("x", 20)}</button></div>
      <label class="field"><span>选择店铺</span><select name="storeId" required>${data.stores.filter((store) => store.active).sort((a, b) => a.name.localeCompare(b.name, "zh-CN")).map((store) => `<option value="${store.id}">${escapeHtml(store.name)} · ${escapeHtml(store.location)}</option>`).join("")}</select></label>
      <button class="key-button key-green full-width" type="submit">${icon("check", 18)}确认这一顿</button>
    </form>
  </dialog>`;
}

function logMealOptions() {
  return data.stores
    .filter((store) => store.active)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function filterLogStores(query) {
  let visibleCount = 0;
  document.querySelectorAll(".log-store-row").forEach((row) => {
    row.hidden = !matchesSearchIndex(row.dataset.search, query);
    if (!row.hidden) visibleCount += 1;
  });
  const empty = document.querySelector(".live-log-empty");
  if (empty) empty.hidden = visibleCount > 0;
}

function logMealDialogTemplate() {
  const matches = logMealOptions();
  return `<dialog id="log-meal-dialog" class="app-dialog">
    <div class="dialog-card">
      <div class="dialog-heading">
        <div><span class="eyebrow">补记一顿</span><h2>今天吃了哪家？</h2></div>
        <button class="icon-button" data-action="close-dialog" data-dialog="log-meal-dialog" type="button" aria-label="关闭">${icon("x", 20)}</button>
      </div>
      <label class="search-box log-search">${icon("search", 18)}<input id="log-store-search" type="search" placeholder="搜店名、区域或品类" value="${escapeHtml(ui.logSearch)}" autocomplete="off" /></label>
      <div class="log-store-list" aria-label="可选店铺">
        ${matches.map((store) => {
          const index = createStoreSearchIndex(store);
          const hiddenAttr = matchesSearchIndex(index, ui.logSearch) ? "" : " hidden";
          return `<button class="log-store-row" data-action="log-store" data-id="${store.id}" data-search="${escapeHtml(index)}"${hiddenAttr} type="button">
            <strong>${escapeHtml(store.name)}</strong>
            <span>${escapeHtml(store.category)} · ${escapeHtml(store.location)}</span>
          </button>`;
        }).join("")}
        <div class="empty-list live-log-empty" ${matches.some((store) => matchesStoreSearch(store, ui.logSearch)) ? "hidden" : ""}>没有找到匹配店铺</div>
      </div>
    </div>
  </dialog>`;
}

function installDialogTemplate() {
  return `<dialog id="install-dialog" class="app-dialog install-dialog" aria-labelledby="install-title">
    <div class="dialog-card">
      <div class="dialog-heading">
        <div><span class="eyebrow">添加到桌面</span><h2 id="install-title">放到手机桌面</h2></div>
        <button class="icon-button" data-action="close-dialog" data-dialog="install-dialog" type="button" aria-label="关闭">${icon("x", 20)}</button>
      </div>
      <div class="install-identity">
        <img src="/icons/apple-touch-icon.png" alt="" width="68" height="68" />
        <p>在 iPhone 上需要通过浏览器菜单完成，安装后会像普通 App 一样从桌面打开。</p>
      </div>
      <ol class="install-steps">
        <li><strong>打开分享菜单</strong><span>${icon("share-2", 17)}点击 Safari 工具栏中的分享图标</span></li>
        <li><strong>选择“添加到主屏幕”</strong><span>如果没看到，向下滚动菜单</span></li>
        <li><strong>点击“添加”</strong><span>桌面会出现“吃什么”图标</span></li>
      </ol>
    </div>
  </dialog>`;
}

function render() {
  const content = ui.view === "home" ? renderHome() : ui.view === "stores" ? renderStores() : renderHistory();
  app.innerHTML = `<div class="app-frame"><div class="view-frame">${content}</div>${renderNav()}</div>${storeDialogTemplate()}${alternativeDialogTemplate()}${logMealDialogTemplate()}${installDialogTemplate()}${ui.toast ? `<div class="toast" role="status">${escapeHtml(ui.toast)}</div>` : ""}`;
  createIcons({
    icons: { Check, ChevronRight, Clock3, Compass, Download, History, MapPin, Pencil, Plus, Power, RefreshCw, Search, Share2, ShoppingBag, SlidersHorizontal, Store, Trash2, Users, Wallet, X },
    attrs: { "stroke-width": 2.4 },
  });
  document.querySelector("#store-form").addEventListener("submit", handleStoreSubmit);
  document.querySelector("#alternative-form").addEventListener("submit", handleAlternativeSubmit);
  bindLogMealDialog();
}

function bindLogMealDialog() {
  const dialog = document.querySelector("#log-meal-dialog");
  const search = document.querySelector("#log-store-search");
  if (!dialog || !search) return;
  search.addEventListener("input", () => {
    ui.logSearch = search.value;
    filterLogStores(ui.logSearch);
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.preventDefault();
  });
  dialog.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='log-store']");
    if (!button) return;
    const store = data.stores.find((item) => item.id === button.dataset.id);
    if (!store) return;
    recordMeal(store);
    ui.logSearch = "";
    ui.view = "history";
    showToast(`已记下「${store.name}」`);
  });
}

function recordMeal(store) {
  data.history.push({
    id: crypto.randomUUID(),
    storeId: store.id,
    storeName: store.name,
    category: store.category,
    location: store.location,
    confirmedAt: new Date().toISOString(),
  });
  data.pending = null;
  persist();
  generateRecommendations();
}

let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 350 && !event.target.closest("button, a, input, textarea, select, label, [data-action]")) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  },
  { passive: false },
);

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "navigate") {
    ui.view = target.dataset.view;
    render();
  }
  if (action === "apply-scene") {
    applyScene(target.dataset.scene);
    persist();
    generateRecommendations();
    showToast(sceneToast(target.dataset.scene));
    return;
  }
  if (action === "set-meal") {
    data.settings.meal = target.dataset.meal;
    persist();
    generateRecommendations();
    render();
  }
  if (action === "party-down" || action === "party-up") {
    const delta = action === "party-up" ? 1 : -1;
    data.settings.partySize = Math.max(1, Math.min(6, data.settings.partySize + delta));
    persist();
    render();
  }
  if (action === "open-filters") {
    const panel = document.querySelector("#filter-panel");
    panel.hidden = !panel.hidden;
  }
  if (action === "toggle-all-regions") {
    data.settings.regions = data.settings.regions.length === REGIONS.length ? [] : [...REGIONS];
    persist();
    render();
    document.querySelector("#filter-panel").hidden = false;
  }
  if (action === "recommend") {
    ui.hasPicks = true;
    generateRecommendations();
    render();
  }
  if (action === "choose-store") {
    data.pending = { storeId: target.dataset.id, selectedAt: new Date().toISOString() };
    persist();
    showToast("已暂定，吃完回来确认");
  }
  if (action === "confirm-pending") {
    const store = pendingStore();
    if (store) recordMeal(store);
    ui.view = "history";
    showToast("这一顿已记下");
  }
  if (action === "cancel-pending") {
    data.pending = null;
    persist();
    showToast("没有计入历史");
  }
  if (action === "open-alternative") {
    document.querySelector("#alternative-dialog").showModal();
  }
  if (action === "open-log-meal") {
    ui.logSearch = "";
    render();
    document.querySelector("#log-meal-dialog").showModal();
    document.querySelector("#log-store-search")?.focus();
  }
  if (action === "log-store") {
    const store = data.stores.find((item) => item.id === target.dataset.id);
    if (store) {
      recordMeal(store);
      ui.logSearch = "";
      ui.view = "history";
      showToast(`已记下「${store.name}」`);
    }
  }
  if (action === "install-app") {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      if (outcome === "accepted") showToast("正在添加到主屏幕");
      else render();
    } else {
      document.querySelector("#install-dialog").showModal();
    }
  }
  if (action === "close-dialog") {
    document.querySelector(`#${target.dataset.dialog}`).close();
  }
  if (action === "add-store" || action === "edit-store") {
    ui.editingStoreId = action === "edit-store" ? target.dataset.id : null;
    render();
    document.querySelector("#store-dialog").showModal();
  }
  if (action === "toggle-store") {
    const store = data.stores.find((item) => item.id === target.dataset.id);
    if (store) store.active = !store.active;
    persist();
    generateRecommendations();
    showToast(store.active ? "已恢复推荐" : "已停用，不再推荐");
  }
  if (action === "store-filter") {
    ui.storeFilter = target.dataset.filter;
    render();
  }
  if (action === "clear-history") {
    data.history = [];
    persist();
    generateRecommendations();
    showToast("历史记录已清空");
  }
  if (action === "remove-cooldown") {
    removeFromCooldown(target.dataset.id);
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "budget-range") {
    data.settings.budget = Number(event.target.value);
    persist();
    const output = document.querySelector(".budget-control legend strong");
    if (output) output.textContent = `¥${data.settings.budget}`;
  }
  if (event.target.id === "store-search") {
    ui.search = event.target.value;
    let visibleCount = 0;
    document.querySelectorAll(".store-row").forEach((row) => {
      row.hidden = !matchesSearchIndex(row.dataset.search, ui.search);
      if (!row.hidden) visibleCount += 1;
    });
    const empty = document.querySelector(".live-search-empty");
    if (empty) empty.hidden = visibleCount > 0;
  }
  if (event.target.id === "log-store-search") {
    ui.logSearch = event.target.value;
    filterLogStores(ui.logSearch);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.target.id === "log-store-search" && event.key === "Enter") event.preventDefault();
});

document.addEventListener("change", (event) => {
  if (event.target.name === "region") {
    const region = event.target.value;
    data.settings.regions = event.target.checked
      ? [...new Set([...data.settings.regions, region])]
      : data.settings.regions.filter((item) => item !== region);
    persist();
  }
  if (event.target.id === "takeout-toggle") {
    data.settings.includeTakeout = event.target.checked;
    persist();
  }
});

function handleStoreSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const id = form.get("id");
  const existing = data.stores.find((store) => store.id === id);
  const values = {
    name: form.get("name").trim(),
    area: form.get("area"),
    price: Number(form.get("price")),
    category: form.get("category").trim(),
    location: form.get("location").trim(),
    note: form.get("note").trim(),
    takeoutOnly: form.get("takeoutOnly") === "on",
    meals: ["午饭", "晚饭"],
    active: existing?.active ?? true,
    verified: true,
    source: existing?.source ?? "手动",
  };
  if (existing) Object.assign(existing, values);
  else data.stores.unshift({ id: `manual-${crypto.randomUUID()}`, ...values });
  persist();
  generateRecommendations();
  document.querySelector("#store-dialog").close();
  ui.editingStoreId = null;
  showToast(existing ? "店铺信息已更新" : "新店已加入推荐池");
}

function handleAlternativeSubmit(event) {
  event.preventDefault();
  const storeId = new FormData(event.currentTarget).get("storeId");
  const store = data.stores.find((item) => item.id === storeId);
  if (store) recordMeal(store);
  document.querySelector("#alternative-dialog").close();
  ui.view = "history";
  showToast("实际用餐已记下");
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  render();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  showToast("已添加到主屏幕");
});

render();

if ("serviceWorker" in navigator && window.isSecureContext && !import.meta.env.DEV) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
