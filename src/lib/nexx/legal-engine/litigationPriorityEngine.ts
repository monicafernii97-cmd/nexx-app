import type { PackedCaseIntake } from './packedCaseIntake';
import type { LitigationNavigationResponse } from './litigationNavigationSchema';

export function determineImmediatePriority(intake: PackedCaseIntake): LitigationNavigationResponse['immediatePriority'] {
  if (intake.immediateRisks.safetyRisk || intake.immediateRisks.childSafetyRisk) {
    return {
      priority: 'Safety comes first.',
      whyItMatters: 'No court strategy matters more than immediate safety for you or the child.',
      whatToDoNow: 'If there is immediate danger, use emergency help first and preserve messages or orders after you are safe.',
    };
  }

  if (intake.courtPosture.proceedingStatus === 'threat_only') {
    return {
      priority: 'Verify whether there is a real court case first.',
      whyItMatters: 'A threat to file does not create a court deadline by itself.',
      whatToDoNow: 'Check whether anything was actually filed, served, or noticed for hearing before treating it like a deadline.',
    };
  }

  if (intake.courtPosture.proceedingStatus === 'filing_claimed_not_seen') {
    return {
      priority: 'Confirm the filing and service status first.',
      whyItMatters: 'A claimed filing may matter, but the actual filed paper, service date, and hearing notice control next steps.',
      whatToDoNow: 'Get the filed document or docket notice, then confirm when and how you actually received it.',
    };
  }

  if (intake.immediateRisks.deadlineRisk || intake.immediateRisks.hearingRisk) {
    return {
      priority: 'Protect the court deadline first.',
      whyItMatters: 'If a motion or petition was filed, the service date, response deadline, and hearing date control how fast you need to act.',
      whatToDoNow: 'Find the filed document, the date you were served, and any notice of hearing before drafting or responding further.',
    };
  }

  if (intake.immediateRisks.exchangeRisk) {
    return {
      priority: 'Protect the exchange and communication record.',
      whyItMatters: 'Possession and exchange disputes often turn on the order language and the calmness of the written record.',
      whatToDoNow: 'Respond once in order-based language, then save the thread and relevant order page.',
    };
  }

  return {
    priority: 'Slow the situation down and organize the issue.',
    whyItMatters: 'A calm structure helps separate legal facts from pressure, fear, and accusations.',
    whatToDoNow: 'Identify the order language, the exact request, the next deadline, and the cleanest response.',
  };
}

export function buildIssueBreakdown(intake: PackedCaseIntake): LitigationNavigationResponse['issueBreakdown'] {
  const issues: LitigationNavigationResponse['issueBreakdown'] = [];

  if (intake.courtPosture.proceedingStatus === 'threat_only') {
    issues.push({
      issue: 'Court threat',
      priority: 'medium',
      whatItMeans: 'A threat to file is not the same as an actual filed or served case.',
      nextStep: 'Verify whether anything was actually filed or served before treating it as a court deadline.',
    });
  }

  if (intake.courtPosture.otherPartyFiledSomething) {
    issues.push({
      issue: 'Court case',
      priority: intake.immediateRisks.deadlineRisk || intake.immediateRisks.hearingRisk ? 'urgent' : 'high',
      whatItMeans: intake.immediateRisks.deadlineRisk || intake.immediateRisks.hearingRisk
        ? 'A filed court paper creates deadline and hearing risk until the filing, service date, and requested relief are checked.'
        : 'A filing has been claimed, but the actual filed document and service details still need to be verified.',
      nextStep: 'Upload or paste the filed document and identify when and how you actually received it.',
    });
  }

  if (intake.coParentCommunication.messagesMentioned || intake.coParentCommunication.userNeedsResponseDraft) {
    issues.push({
      issue: 'Co-parent messages',
      priority: intake.coParentCommunication.toneRisk === 'high' ? 'high' : 'medium',
      whatItMeans: 'The message thread can either help or hurt the record depending on how calmly you respond.',
      nextStep: 'Respond only to the order/logistics issue and do not debate accusations.',
    });
  }

  if (intake.factualTimeline.length > 0 || intake.accusationsOrDisputes.length > 0) {
    issues.push({
      issue: 'Evidence and timeline',
      priority: 'high',
      whatItMeans: 'The court will need dates, proof, and a neutral explanation rather than a long emotional history.',
      nextStep: 'Save messages and build a date-order timeline.',
    });
  }

  if (intake.userQuestions.some((q) => q.category === 'can_i_do_this_myself') || intake.emotionalState.financiallyStressed) {
    issues.push({
      issue: 'Pro se and limited-scope help',
      priority: 'medium',
      whatItMeans: 'Some tasks may be manageable pro se, but contested custody, contempt, or emergency issues are higher-risk.',
      nextStep: 'Consider limited-scope review if full representation is not affordable.',
    });
  }

  if (intake.userQuestions.some((q) => q.category === 'cost') || intake.emotionalState.financiallyStressed) {
    issues.push({
      issue: 'Costs and resources',
      priority: 'medium',
      whatItMeans: 'Exact costs depend on county, court, filing type, and attorney options.',
      nextStep: 'Use county/state to verify official fees and legal-aid or lawyer-referral resources.',
    });
  }

  if (intake.userQuestions.some((q) => q.category === 'judge_explanation')) {
    issues.push({
      issue: 'Judge explanation',
      priority: 'medium',
      whatItMeans: 'The judge-ready version needs current order, timeline, proof, impact, and requested relief.',
      nextStep: 'Turn the story into short date-order facts with exhibits.',
    });
  }

  return issues.length > 0 ? issues : [{
    issue: 'Main legal issue',
    priority: 'medium',
    whatItMeans: 'The issue needs to be tied back to the order, facts, and next court or communication step.',
    nextStep: 'Identify the controlling order language and the immediate next action.',
  }];
}
