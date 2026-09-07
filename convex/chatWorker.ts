import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import {
    persistConversationMemoryRuntime,
    processChatGenerationJobRuntime,
} from './chatGenerationRuntime';

/** Thin Convex registration layer. Conversation behavior lives in tested kernel/runtime modules. */
export const persistConversationMemory = internalAction({
    args: { turnId: v.id('chatTurns') },
    handler: persistConversationMemoryRuntime,
});

/** Thin Convex registration layer. Job orchestration is isolated from the public function surface. */
export const processChatGenerationJob = internalAction({
    args: { jobId: v.id('chatGenerationJobs') },
    handler: processChatGenerationJobRuntime,
});
