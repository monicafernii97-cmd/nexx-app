export function documentProviderPolicy(intent: 'attachment' | 'court_order', openAiZdrConfirmed: boolean) {
  const confidentialityLevel = intent === 'court_order' ? 'sensitive' as const : 'normal' as const;
  return {
    confidentialityLevel,
    allowOpenAiOcr: confidentialityLevel === 'normal' || openAiZdrConfirmed,
    allowHostedOpenAiDocumentStorage: confidentialityLevel === 'normal' || openAiZdrConfirmed,
  };
}
