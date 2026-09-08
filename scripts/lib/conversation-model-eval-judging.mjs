const KNOWN_FALLBACK = /cannot verify a complete answer from the order language available for this turn|safest practical next step based on the information available/i;
const FALSE_TOOL_CLAIM = /\b(?:i|we)\s+(?:searched|looked up|opened|retrieved|checked the (?:web|internet))\b/i;
const BACKGROUND_DOCUMENT_REFERENCE = /\bparenting order\b|\b(?:parenting order|motion)\.pdf\b/i;
const SYNTHETIC_EVIDENCE_DETAIL = /\bFriday at 6(?::00)?\b|\bSunday at 6(?::00)?\b|\bseven days(?:'|\u2019)? notice\b|\bSaturday at 9(?::00)?\b/i;
const KNOWN_RESOURCE_LABELS = ['Parenting Order.pdf', 'Motion.pdf'];

function relevancePatterns(testCase) {
  if (/mediation/i.test(testCase.message) || testCase.id.includes('mediation')) return [/mediat|neutral|session|meeting|discussion/i];
  if (testCase.id === 'incident-contextual-math') return [/\b30\b/];
  if (/12 times 4/i.test(testCase.message)) return [/\b48\b/];
  if (/rainbow/i.test(testCase.message)) return [/rainbow|light|color|refract/i];
  if (/grocery/i.test(testCase.message)) return [/grocery|list|food|produce|shop|meal/i];
  if (/bread rise/i.test(testCase.message)) return [/yeast|gas|ferment|rise/i];
  if (/saturn/i.test(testCase.message)) return [/saturn|ring|planet/i];
  if (/upload/i.test(testCase.message)) return [/upload|attach|send|when/i];
  if (/^hi$|^hey$/i.test(testCase.message)) return [/\bhi\b|\bhello\b|\bhey\b/i];
  if (testCase.category === 'task_resume' || /\b(?:resume|return to|go back to|continue)\b/i.test(testCase.message)) {
    return [/parenting|order|review|weekend|friday/i];
  }
  if (testCase.category === 'document') return [/order|document|weekend|friday|6:00|seven days|saturday|9:00/i];
  if (testCase.category === 'correction') {
    if (/Tuesday/i.test(testCase.message)) return [/Tuesday/i];
    if (/June 3/i.test(testCase.message)) return [/June 3/i];
    if (/Illinois/i.test(testCase.message)) return [/Illinois/i];
    return [/exception|missed|revis|correct/i];
  }
  const priorTopic = testCase.recentMessages.find((message) => message.role === 'user')?.content.match(/what is ([a-z]+)/i)?.[1]?.toLowerCase();
  const topicPatterns = {
    mediation: /mediat|neutral|agreement|negotiat|resolve|session/i,
    arbitration: /arbitrat|award|hearing|binding|private decision/i,
    photosynthesis: /photosynth|plant|light|sun|glucose|oxygen|carbon dioxide|chloroplast/i,
    gravity: /gravit|mass|attract|space|time|fall|orbit|accelerat|force|motion|toward each other/i,
    appeals: /appeal|higher court|lower court|decision|hearing|legal error/i,
    budgeting: /budget|income|expense|spend|saving|money|planned|actual/i,
  };
  return priorTopic && topicPatterns[priorTopic] ? [topicPatterns[priorTopic]] : [];
}

function unauthorizedEvidenceUse(testCase, answer) {
  const authorizedLabels = new Set(testCase.resources.map((resource) => resource.label.toLowerCase()));
  const namesUnauthorized = KNOWN_RESOURCE_LABELS.some((label) =>
    !authorizedLabels.has(label.toLowerCase()) && answer.toLowerCase().includes(label.toLowerCase()));
  const leakedEvidence = !testCase.expected.requiredEvidence && SYNTHETIC_EVIDENCE_DETAIL.test(answer);
  return namesUnauthorized || leakedEvidence;
}

export function evaluateConversationModelAnswer(testCase, answer) {
  const failures = [];
  const legitimatelyConcise = /^(?:hi|hey)$/i.test(testCase.message) ||
    testCase.expected.clarificationRequired ||
    /^what is \d+ times \d+\??$/i.test(testCase.message) ||
    /(?:only the number|twice that|add \d+ to that)/i.test(testCase.message) ||
    testCase.id === 'incident-contextual-math';
  if (answer.trim().length < (legitimatelyConcise ? 1 : 20)) failures.push('answer_too_short');
  if (KNOWN_FALLBACK.test(answer)) failures.push('known_fallback');
  if (FALSE_TOOL_CLAIM.test(answer)) failures.push('false_tool_claim');
  const patterns = relevancePatterns(testCase);
  if (patterns.length > 0 && !patterns.some((pattern) => pattern.test(answer))) failures.push('latest_goal_relevance');
  if (testCase.expected.clarificationRequired && !/(?:\?|what do you mean|which|clarif|could you tell me)/i.test(answer)) {
    failures.push('clarification_missing');
  }
  if (
    !testCase.expected.requiredEvidence && !testCase.expected.clarificationRequired && testCase.resources.length > 0 &&
    BACKGROUND_DOCUMENT_REFERENCE.test(answer)
  ) failures.push('unwanted_document_activation');
  if (unauthorizedEvidenceUse(testCase, answer)) failures.push('unauthorized_evidence_use');
  if (testCase.expected.requiredEvidence && !/(?:Friday|Saturday|6:00|9:00|seven days|parenting order|review)/i.test(answer)) {
    failures.push('evidence_support_missing');
  }
  return {
    passed: failures.length === 0,
    failures,
    knownFallback: failures.includes('known_fallback'),
    latestGoalRelevant: !failures.includes('latest_goal_relevance'),
    clarificationAppropriate: !failures.includes('clarification_missing'),
    unwantedDocumentActivation: failures.includes('unwanted_document_activation'),
    unauthorizedEvidenceUse: failures.includes('unauthorized_evidence_use'),
    falseToolClaim: failures.includes('false_tool_claim'),
  };
}
