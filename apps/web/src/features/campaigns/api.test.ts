import { describe, expect, it } from "vitest";
import { aggregateCandidateCounts } from "./api";

describe("aggregateCandidateCounts", () => {
  it("tallies rows per campaign id", () => {
    expect(
      aggregateCandidateCounts([
        { campaign_id: "a" },
        { campaign_id: "b" },
        { campaign_id: "a" },
        { campaign_id: "a" },
      ]),
    ).toEqual({ a: 3, b: 1 });
  });

  it("returns an empty map without links", () => {
    expect(aggregateCandidateCounts([])).toEqual({});
  });
});
