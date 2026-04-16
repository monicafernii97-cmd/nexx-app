/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as assemblyQueries from "../assemblyQueries.js";
import type * as caseGraphs from "../caseGraphs.js";
import type * as caseMemory from "../caseMemory.js";
import type * as casePins from "../casePins.js";
import type * as cases from "../cases.js";
import type * as conversationSummaries from "../conversationSummaries.js";
import type * as conversations from "../conversations.js";
import type * as courtSettings from "../courtSettings.js";
import type * as crons from "../crons.js";
import type * as debugTraces from "../debugTraces.js";
import type * as detectedPatterns from "../detectedPatterns.js";
import type * as documents from "../documents.js";
import type * as exportOverrides from "../exportOverrides.js";
import type * as generatedDocuments from "../generatedDocuments.js";
import type * as generatedDocumentsExport from "../generatedDocumentsExport.js";
import type * as incidents from "../incidents.js";
import type * as lib_auth from "../lib/auth.js";
import type * as messages from "../messages.js";
import type * as nexProfiles from "../nexProfiles.js";
import type * as resourcesCache from "../resourcesCache.js";
import type * as retrievedSources from "../retrievedSources.js";
import type * as stripe from "../stripe.js";
import type * as timelineCandidates from "../timelineCandidates.js";
import type * as toolRuns from "../toolRuns.js";
import type * as uploadedFiles from "../uploadedFiles.js";
import type * as userStyleProfiles from "../userStyleProfiles.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  assemblyQueries: typeof assemblyQueries;
  caseGraphs: typeof caseGraphs;
  caseMemory: typeof caseMemory;
  casePins: typeof casePins;
  cases: typeof cases;
  conversationSummaries: typeof conversationSummaries;
  conversations: typeof conversations;
  courtSettings: typeof courtSettings;
  crons: typeof crons;
  debugTraces: typeof debugTraces;
  detectedPatterns: typeof detectedPatterns;
  documents: typeof documents;
  exportOverrides: typeof exportOverrides;
  generatedDocuments: typeof generatedDocuments;
  generatedDocumentsExport: typeof generatedDocumentsExport;
  incidents: typeof incidents;
  "lib/auth": typeof lib_auth;
  messages: typeof messages;
  nexProfiles: typeof nexProfiles;
  resourcesCache: typeof resourcesCache;
  retrievedSources: typeof retrievedSources;
  stripe: typeof stripe;
  timelineCandidates: typeof timelineCandidates;
  toolRuns: typeof toolRuns;
  uploadedFiles: typeof uploadedFiles;
  userStyleProfiles: typeof userStyleProfiles;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
