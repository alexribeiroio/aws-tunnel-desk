import assert from "node:assert/strict";
import test from "node:test";
import { markOnboardingSeen, onboardingIsDue, onboardingSteps } from "../src/onboarding.js";

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value),
  };
}

test("onboarding is due when nothing was ever stored", () => {
  assert.equal(onboardingIsDue(fakeStorage()), true);
});

test("onboarding is no longer due after being marked seen", () => {
  const storage = fakeStorage();
  markOnboardingSeen(storage);
  assert.equal(onboardingIsDue(storage), false);
});

test("onboarding steps are non-empty and uniquely identified", () => {
  assert.ok(onboardingSteps.length > 0);
  assert.equal(new Set(onboardingSteps.map((step) => step.id)).size, onboardingSteps.length);
});
