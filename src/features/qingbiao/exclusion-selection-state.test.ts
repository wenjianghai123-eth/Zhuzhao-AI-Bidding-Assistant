import { describe, expect, it } from "vitest";

import { updateExcludedCandidateSelection } from "@/features/qingbiao/exclusion-selection-state";

describe("qingbiao exclusion checkbox state", () => {
  it("supports adding, cancelling, saving and editing an existing selection", () => {
    const added = updateExcludedCandidateSelection(["candidate-1"], "candidate-2", true);
    const cancelled = updateExcludedCandidateSelection(added, "candidate-1", false);
    const editedAgain = updateExcludedCandidateSelection(cancelled, "candidate-3", true);

    expect(added).toEqual(["candidate-1", "candidate-2"]);
    expect(cancelled).toEqual(["candidate-2"]);
    expect(editedAgain).toEqual(["candidate-2", "candidate-3"]);
  });

  it("does not duplicate a candidate when callbacks repeat quickly", () => {
    const selected = updateExcludedCandidateSelection([], "candidate-1", true);

    expect(
      updateExcludedCandidateSelection(selected, "candidate-1", true),
    ).toEqual(["candidate-1"]);
  });
});
