import { pinyin } from "pinyin-pro";

const SEARCH_FIELDS = ["name", "area", "category", "location"];
const PINYIN_OPTIONS = { type: "array", toneType: "none", nonZh: "consecutive" };

const indexCache = new WeakMap();

export function normalizeSearchQuery(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function fieldTokens(value) {
  const text = String(value ?? "");
  const original = normalizeSearchQuery(text);
  const syllables = pinyin(text, PINYIN_OPTIONS);
  const full = syllables.join("").toLowerCase().replace(/\s+/g, "");
  const initials = syllables
    .map((syllable) => syllable.slice(0, 1))
    .join("")
    .toLowerCase()
    .replace(/\s+/g, "");
  return new Set([original, full, initials].filter(Boolean));
}

export function createStoreSearchIndex(store) {
  const tokens = new Set();
  for (const key of SEARCH_FIELDS) {
    for (const token of fieldTokens(store[key])) tokens.add(token);
  }
  return [...tokens].join(" ");
}

function storeSignature(store) {
  return SEARCH_FIELDS.map((key) => String(store?.[key] ?? "")).join("\u0001");
}

function cachedIndex(store) {
  const signature = storeSignature(store);
  const cached = indexCache.get(store);
  if (cached && cached.signature === signature) return cached.index;
  const index = createStoreSearchIndex(store);
  indexCache.set(store, { signature, index });
  return index;
}

export function matchesSearchIndex(index, query) {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return true;
  return String(index ?? "").split(/\s+/).some((token) => token.includes(normalized));
}

export function matchesStoreSearch(store, query) {
  return matchesSearchIndex(cachedIndex(store), query);
}
