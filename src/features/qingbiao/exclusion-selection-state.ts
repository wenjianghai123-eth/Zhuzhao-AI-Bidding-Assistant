export function updateExcludedCandidateSelection(
  current: readonly string[],
  candidateId: string,
  checked: boolean,
): string[] {
  const selected = new Set(current);

  if (checked) {
    selected.add(candidateId);
  } else {
    selected.delete(candidateId);
  }

  return [...selected];
}
