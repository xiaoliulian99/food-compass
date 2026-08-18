import test from "node:test";
import assert from "node:assert/strict";
import { getCandidates, scoreStore } from "./recommender.js";

const now = new Date("2026-07-23T12:00:00+08:00");
const stores = [
  { id: "hotpot-a", name: "甲火锅", category: "火锅", area: "正因村", price: 25, meals: ["午饭", "晚饭"], active: true, verified: true, takeoutOnly: false },
  { id: "hotpot-b", name: "乙火锅", category: "火锅", area: "东二门", price: 25, meals: ["午饭", "晚饭"], active: true, verified: true, takeoutOnly: false },
  { id: "noodle", name: "牛肉面", category: "面食", area: "静安路", price: 18, meals: ["午饭", "晚饭"], active: true, verified: true, takeoutOnly: false },
  { id: "rice", name: "小碗菜", category: "快餐", area: "一食堂", price: 15, meals: ["午饭", "晚饭"], active: true, verified: true, takeoutOnly: false },
];

test("三天内吃过的同一家店被排除", () => {
  const history = [{ storeId: "hotpot-a", category: "火锅", confirmedAt: "2026-07-22T12:00:00+08:00" }];
  const result = getCandidates(stores, history, { now, random: () => 0.5, count: 4 });
  assert.equal(result.some((store) => store.id === "hotpot-a"), false);
});

test("近期吃过的同品类会降低推荐分数", () => {
  const history = [{ storeId: "hotpot-a", category: "火锅", confirmedAt: "2026-07-22T12:00:00+08:00" }];
  const hotpotScore = scoreStore(stores[1], history, now, () => 0.5);
  const freshScore = scoreStore({ ...stores[1], category: "面食" }, history, now, () => 0.5);
  assert.ok(hotpotScore < freshScore);
});

test("推荐结果优先保持品类多样", () => {
  const result = getCandidates(stores, [], { now, random: () => 0.5, count: 3 });
  assert.equal(new Set(result.map((store) => store.category)).size, 3);
});

test("严格过滤超过预算的店", () => {
  const result = getCandidates(stores, [], { now, budget: 20, random: () => 0.5, count: 4 });
  assert.deepEqual(new Set(result.map((store) => store.id)), new Set(["noodle", "rice"]));
});

test("preferredCategories 提高对应品类分数", () => {
  const base = scoreStore(stores[0], [], now, () => 0.5);
  const boosted = scoreStore(stores[0], [], now, () => 0.5, ["火锅"]);
  assert.ok(boosted > base);
});

test("剔除冷却后该店可再被推荐，记录仍在", () => {
  const history = [{ storeId: "hotpot-a", category: "火锅", confirmedAt: "2026-07-22T12:00:00+08:00", cooldownExempt: true }];
  const result = getCandidates(stores, history, { now, random: () => 0.5, count: 4 });
  assert.equal(result.some((store) => store.id === "hotpot-a"), true);
  assert.equal(history.length, 1);
});
