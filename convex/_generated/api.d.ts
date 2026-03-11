/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as conversations from "../conversations.js";
import type * as courtSettings from "../courtSettings.js";
import type * as documents from "../documents.js";
import type * as generatedDocuments from "../generatedDocuments.js";
import type * as incidents from "../incidents.js";
import type * as lib_auth from "../lib/auth.js";
import type * as messages from "../messages.js";
import type * as nexProfiles from "../nexProfiles.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  conversations: typeof conversations;
  courtSettings: typeof courtSettings;
  documents: typeof documents;
  generatedDocuments: typeof generatedDocuments;
  incidents: typeof incidents;
  "lib/auth": typeof lib_auth;
  messages: typeof messages;
  nexProfiles: typeof nexProfiles;
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
