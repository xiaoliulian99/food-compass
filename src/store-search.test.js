import test from "node:test";
import assert from "node:assert/strict";
import {
  createStoreSearchIndex,
  matchesSearchIndex,
  matchesStoreSearch,
  normalizeSearchQuery,
} from "./store-search.js";

const store = {
  name: "霸王牛肉面",
  area: "正因村",
  category: "面食",
  location: "东二门",
};

const wikiStore = { name: "WIKI BURGER", area: "正因村", category: "西餐", location: "正因村" };
const jiuStore = { name: "90精卤", area: "东二门", category: "熟食", location: "东二门" };

test("1: ba 命中霸王牛肉面", () => {
  assert.equal(matchesStoreSearch(store, "ba"), true);
});

test("2: bawang 命中霸王牛肉面", () => {
  assert.equal(matchesStoreSearch(store, "bawang"), true);
});

test("3: bw 命中霸王牛肉面（首字母）", () => {
  assert.equal(matchesStoreSearch(store, "bw"), true);
});

test("4: bwnrm 命中霸王牛肉面（全首字母）", () => {
  assert.equal(matchesStoreSearch(store, "bwnrm"), true);
});

test("5: niurou 命中霸王牛肉面", () => {
  assert.equal(matchesStoreSearch(store, "niurou"), true);
});

test("6: 霸 命中霸王牛肉面（原文）", () => {
  assert.equal(matchesStoreSearch(store, "霸"), true);
});

test("7: 空查询命中", () => {
  assert.equal(matchesStoreSearch(store, ""), true);
});

test("8: 全空白查询命中", () => {
  assert.equal(matchesStoreSearch(store, "   "), true);
  assert.equal(matchesStoreSearch(store, "\t\n "), true);
});

test("9: BA 大小写不敏感命中", () => {
  assert.equal(matchesStoreSearch(store, "BA"), true);
});

test("10: niu rou 去空白后命中", () => {
  assert.equal(matchesStoreSearch(store, "niu rou"), true);
});

test("11: zyc 命中正因村", () => {
  assert.equal(matchesStoreSearch(store, "zyc"), true);
});

test("12: ms 命中面食", () => {
  assert.equal(matchesStoreSearch(store, "ms"), true);
});

test("13: 明显无关输入不命中", () => {
  assert.equal(matchesStoreSearch(store, "asdfgh"), false);
  assert.equal(matchesStoreSearch(store, "qqqqqq"), false);
});

test("14: wiki/burger/wikiburger 命中 WIKI BURGER", () => {
  assert.equal(matchesStoreSearch(wikiStore, "wiki"), true);
  assert.equal(matchesStoreSearch(wikiStore, "burger"), true);
  assert.equal(matchesStoreSearch(wikiStore, "wikiburger"), true);
});

test("15: 90 命中 90精卤", () => {
  assert.equal(matchesStoreSearch(jiuStore, "90"), true);
});

test("16: 不在默认数据中的新中文店可按全拼和首字母命中", () => {
  const newStore = { name: "重庆小面", area: "东二门", category: "面食", location: "东二门" };
  assert.equal(matchesStoreSearch(newStore, "chongqingxiaomian"), true);
  assert.equal(matchesStoreSearch(newStore, "cqxm"), true);
});

test("17: 同一对象改 name 后新名命中、旧名不再命中", () => {
  const mutable = { name: "川味小炒", area: "正因村", category: "家常菜", location: "正因村" };
  assert.equal(matchesStoreSearch(mutable, "chuanweixiaochao"), true);
  assert.equal(matchesStoreSearch(mutable, "chuanwei"), true);
  mutable.name = "蜀香干锅";
  assert.equal(matchesStoreSearch(mutable, "shuxiangganguo"), true);
  assert.equal(matchesStoreSearch(mutable, "chuanweixiaochao"), false);
});

test("18: matchesStoreSearch 与 createStoreSearchIndex+matchesSearchIndex 等价", () => {
  for (const query of ["ba", "bawang", "bw", "bwnrm", "niurou", "霸", "", "   ", "zyc", "ms", "BA", "niu rou", "asdfgh"]) {
    assert.equal(matchesStoreSearch(store, query), matchesSearchIndex(createStoreSearchIndex(store), query), `query=${query}`);
  }
});

test("normalizeSearchQuery 行为：NFKC+小写+去空白", () => {
  assert.equal(normalizeSearchQuery(" Ba WANG "), "bawang");
  assert.equal(normalizeSearchQuery("niu rou"), "niurou");
  assert.equal(normalizeSearchQuery("   "), "");
});
