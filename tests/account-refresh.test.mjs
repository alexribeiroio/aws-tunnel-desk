import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_CHECK_INTERVAL_MS, accountCheckIsDue } from "../src/accountRefresh.js";

test("account checks become due every five minutes", () => {
  const checkedAt = 1_000;
  assert.equal(accountCheckIsDue(checkedAt, checkedAt + ACCOUNT_CHECK_INTERVAL_MS - 1), false);
  assert.equal(accountCheckIsDue(checkedAt, checkedAt + ACCOUNT_CHECK_INTERVAL_MS), true);
});

test("an account that has never been checked is due immediately", () => {
  assert.equal(accountCheckIsDue(0, 1_000), true);
});
