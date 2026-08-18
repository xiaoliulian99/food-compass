export const COOLDOWN_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export function daysSince(date, now = new Date()) {
  return Math.max(0, (now.getTime() - new Date(date).getTime()) / DAY_MS);
}

export function scoreStore(store, history, now = new Date(), random = Math.random, preferredCategories = []) {
  const recentCategory = history
    .filter((entry) => entry.category === store.category)
    .map((entry) => daysSince(entry.confirmedAt, now))
    .filter((days) => days < COOLDOWN_DAYS);

  const categoryFactor = recentCategory.length
    ? 0.24 + Math.min(...recentCategory) * 0.16
    : 1;

  const areaWeights = {
    "一食堂": 1.26,
    "二食堂": 1.26,
    "三食堂": 1.26,
    "正因村": 1.2,
    "东一门": 1.12,
    "东二门": 1.12,
    "东门": 1.12,
    "北门": 0.9,
    "静安路": 0.34,
    "外卖": 0.92,
  };

  const areaFactor = areaWeights[store.area] ?? 0.78;
  const verifiedFactor = store.verified ? 1.08 : 1;
  const preferredFactor = preferredCategories.includes(store.category) ? 1.35 : 1;
  const jitter = 0.82 + random() * 0.36;

  return areaFactor * categoryFactor * verifiedFactor * preferredFactor * jitter;
}

export function getCandidates(stores, history, options = {}) {
  const {
    budget = 30,
    meal = "午饭",
    regions = [],
    includeTakeout = true,
    preferredCategories = [],
    now = new Date(),
    random = Math.random,
    count = 3,
  } = options;

  const recentStoreIds = new Set(
    history
      .filter((entry) => !entry.cooldownExempt && daysSince(entry.confirmedAt, now) < COOLDOWN_DAYS)
      .map((entry) => entry.storeId),
  );

  const pool = stores.filter((store) => {
    if (!store.active || recentStoreIds.has(store.id)) return false;
    if (store.price > budget) return false;
    if (!store.meals.includes(meal)) return false;
    if (!includeTakeout && store.takeoutOnly) return false;
    if (regions.length && !regions.includes(store.area) && !store.takeoutOnly) return false;
    return true;
  });

  const scored = pool
    .map((store) => ({ store, score: scoreStore(store, history, now, random, preferredCategories) }))
    .sort((a, b) => b.score - a.score);

  const selected = [];
  const usedCategories = new Set();

  while (selected.length < count && scored.length) {
    const diverseIndex = scored.findIndex(({ store }) => !usedCategories.has(store.category));
    const index = diverseIndex === -1 ? 0 : diverseIndex;
    const [{ store }] = scored.splice(index, 1);
    selected.push(store);
    usedCategories.add(store.category);
  }

  return selected;
}

export function recommendationReason(store, history, now = new Date()) {
  const categoryEntries = history
    .filter((entry) => entry.category === store.category)
    .sort((a, b) => new Date(b.confirmedAt) - new Date(a.confirmedAt));

  if (!categoryEntries.length) return `最近没吃${store.category}，换个口味`;
  const days = Math.floor(daysSince(categoryEntries[0].confirmedAt, now));
  if (days >= COOLDOWN_DAYS) return `${store.category}已经 ${days} 天没吃了`;
  return `${store.area}方便，今天也在预算内`;
}
