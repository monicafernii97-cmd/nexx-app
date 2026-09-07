export type RepairCritique = {
  shouldRepair: boolean;
  reasonCodes: string[];
  instruction: string;
};

/** Produce one bounded, outcome-focused repair instruction. */
export function buildRepairCritique(args: {
  latestGoal: string;
  rejectionCodes: string[];
  priorAnswer: string;
}): RepairCritique {
  const reasonCodes = Array.from(new Set(args.rejectionCodes)).slice(0, 12);
  if (reasonCodes.length === 0) return { shouldRepair: false, reasonCodes, instruction: '' };
  return {
    shouldRepair: true,
    reasonCodes,
    instruction: [
      'Rewrite the answer once for the latest user request.',
      `Latest request: ${args.latestGoal.slice(0, 2_000)}`,
      `Defects to correct: ${reasonCodes.join(', ')}.`,
      'Preserve supported useful content, remove unsupported claims, answer directly, and do not mention validation or internal codes.',
      `Prior answer: ${args.priorAnswer.slice(0, 6_000)}`,
    ].join('\n'),
  };
}
