import { describe, expect, it } from "vitest";
import { shouldAutoGrade } from "./gradingPolicy";

describe("automatic AI grading policy", () => {
  it("grades a non-empty ungraded response when a provider is available", () => {
    expect(shouldAutoGrade({ response: "作答", hasGrade: false, providerCount: 1 })).toBe(true);
  });

  it("does not grade twice or grade without an answer or provider", () => {
    expect(shouldAutoGrade({ response: "作答", hasGrade: true, providerCount: 1 })).toBe(false);
    expect(shouldAutoGrade({ response: "  ", hasGrade: false, providerCount: 1 })).toBe(false);
    expect(shouldAutoGrade({ response: "作答", hasGrade: false, providerCount: 0 })).toBe(false);
  });
});
