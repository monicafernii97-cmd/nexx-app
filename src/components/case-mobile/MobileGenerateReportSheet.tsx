'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileBottomSheet } from '@/components/mobile-shell';
import { trackMobileEvent } from '@/lib/mobile/mobileAnalytics';
import {
  defaultMobileReportPayload,
  type BuildReportPayload,
  type BuildReportResponse,
  type PatternHandling,
  type ReportBuildState,
  type ReportOutputType,
  type ReportTone,
} from '@/lib/mobile/reportTypes';
import { usePersistentMobileState } from '@/lib/mobile/usePersistentMobileState';

const REPORT_BUILD_TIMEOUT_MS = 75_000;

type MobileGenerateReportSheetProps = {
  caseId: string;
  isOpen: boolean;
  onClose: () => void;
};

const outputOptions: Array<{
  value: ReportOutputType;
  label: string;
  description: string;
}> = [
  {
    value: 'summary_pdf',
    label: 'Summary PDF',
    description: 'A readable case summary for review.',
  },
  {
    value: 'court_document',
    label: 'Court Document',
    description: 'A court-oriented draft to refine in DocuVault.',
  },
  {
    value: 'both',
    label: 'Both',
    description: 'Create the summary and court draft together.',
  },
];

const toneOptions: Array<{ value: ReportTone; label: string }> = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'attorney_ready', label: 'Attorney-ready' },
];

const patternOptions: Array<{ value: PatternHandling; label: string }> = [
  { value: 'include_supported_only', label: 'Include supported only' },
  { value: 'exclude_patterns', label: 'Exclude patterns' },
];

/** Create a per-build idempotency key before any model generation starts. */
function createClientBuildId(caseId: string) {
  const randomPart = Math.random().toString(36).slice(2);
  return `mobile-report-${caseId}-${Date.now().toString(36)}-${randomPart}`;
}

/** Semantic radio row with the contract-required 44px minimum hit area. */
function RadioRow<T extends string>({
  name,
  value,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  name: string;
  value: T;
  label: string;
  description?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex min-h-11 w-full items-center justify-between gap-4 rounded-2xl border border-neutral-200 px-4 py-3 active:bg-neutral-100">
      <span>
        <span className="block text-sm font-medium text-neutral-900">{label}</span>
        {description ? (
          <span className="mt-1 block text-xs leading-5 text-neutral-500">{description}</span>
        ) : null}
      </span>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="h-5 w-5 shrink-0 accent-neutral-900"
      />
    </label>
  );
}

/** Accessible mobile report configuration sheet with retry-safe build state. */
export function MobileGenerateReportSheet({
  caseId,
  isOpen,
  onClose,
}: MobileGenerateReportSheetProps) {
  const router = useRouter();
  const defaultPayload = useMemo(() => defaultMobileReportPayload(caseId), [caseId]);
  const {
    value: payload,
    setValue: setPayload,
  } = usePersistentMobileState<BuildReportPayload>({
    key: `mobile-report-options:${caseId}`,
    initialValue: defaultPayload,
  });
  const [buildState, setBuildState] = useState<ReportBuildState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<'cancelled' | 'timeout' | null>(null);
  const isBuilding = buildState === 'building';

  useEffect(() => {
    if (!isOpen) return;
    trackMobileEvent('mobile_report_sheet_opened', { caseId });
  }, [caseId, isOpen]);

  /** Persist one mobile report option while keeping required payload fields intact. */
  const updatePayload = <K extends keyof BuildReportPayload>(
    key: K,
    value: BuildReportPayload[K],
  ) => {
    setPayload({
      ...payload,
      caseId,
      source: 'workspace_mobile',
      [key]: value,
    });
  };

  /** Build the report draft, require a saved draft id, and hand off to DocuVault. */
  const buildReport = async () => {
    if (isBuilding) return;

    const startedAt = performance.now();
    const clientBuildId = payload.clientBuildId ?? createClientBuildId(caseId);
    const requestPayload: BuildReportPayload = {
      ...payload,
      caseId,
      source: 'workspace_mobile',
      clientBuildId,
    };
    setPayload(requestPayload);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    abortReasonRef.current = null;
    const timeoutId = window.setTimeout(() => {
      abortReasonRef.current = 'timeout';
      abortController.abort();
    }, REPORT_BUILD_TIMEOUT_MS);

    setBuildState('building');
    setErrorMessage('');
    trackMobileEvent('mobile_report_build_started', { caseId });

    try {
      const response = await fetch('/api/workspace/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify(requestPayload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error("We couldn't build the draft. Your selections are saved. Try again.");
      }
      const result = data as Partial<BuildReportResponse>;
      if (!result.reportDraftId || result.status === 'failed') {
        throw new Error("We couldn't build the draft. Your selections are saved. Try again.");
      }

      setBuildState('success');
      trackMobileEvent('mobile_report_build_succeeded', {
        caseId,
        draftId: result.reportDraftId,
        status: result.status,
        durationMs: Math.round(performance.now() - startedAt),
      });
      trackMobileEvent('mobile_docuvault_opened_from_workspace', {
        caseId,
        draftId: result.reportDraftId,
      });

      const searchParams = new URLSearchParams({
        source: 'workspace',
        prefill: '1',
        draftId: result.reportDraftId,
        outputType: requestPayload.outputType,
      });
      router.push(`/case/${caseId}/docuvault?${searchParams.toString()}`);
    } catch (error) {
      if (abortReasonRef.current === 'cancelled') {
        trackMobileEvent('mobile_report_build_failed', {
          caseId,
          status: 'aborted',
          durationMs: Math.round(performance.now() - startedAt),
        });
        return;
      }

      const didTimeout = abortReasonRef.current === 'timeout';
      const fallbackMessage = "We couldn't build the draft. Your selections are saved. Try again.";
      setBuildState('error');
      setErrorMessage(
        didTimeout
          ? "We couldn't build the draft before the connection timed out. Your selections are saved. Try again."
          : error instanceof Error && error.message
            ? error.message
            : fallbackMessage,
      );
      trackMobileEvent('mobile_report_build_failed', {
        caseId,
        status: didTimeout ? 'timeout' : 'error',
        durationMs: Math.round(performance.now() - startedAt),
      });
    } finally {
      window.clearTimeout(timeoutId);
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      abortReasonRef.current = null;
    }
  };

  /** Close the sheet only when a report build is not actively in flight. */
  const closeSheet = () => {
    if (isBuilding) {
      abortReasonRef.current = 'cancelled';
      abortControllerRef.current?.abort();
    }
    setBuildState('idle');
    setErrorMessage('');
    onClose();
  };

  const footer = (
    <div className="flex gap-3">
      <button
        type="button"
        className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 active:bg-neutral-100"
        onClick={closeSheet}
      >
        Cancel
      </button>
      <button
        type="button"
        disabled={isBuilding}
        className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl bg-neutral-900 px-4 text-sm font-semibold text-white active:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={buildReport}
      >
        {isBuilding ? 'Building...' : buildState === 'error' ? 'Try Again' : 'Build Report'}
      </button>
    </div>
  );

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      title="Generate Report"
      description="Create a structured draft from your saved facts, timeline, and source-backed events."
      footer={footer}
      onClose={closeSheet}
    >
      <fieldset disabled={isBuilding} className="space-y-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Output
        </legend>
        {outputOptions.map((option) => (
          <RadioRow
            key={option.value}
            name="mobile-report-output"
            value={option.value}
            label={option.label}
            description={option.description}
            checked={payload.outputType === option.value}
            disabled={isBuilding}
            onChange={(value) => updatePayload('outputType', value)}
          />
        ))}
      </fieldset>

      <fieldset disabled={isBuilding} className="space-y-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Tone
        </legend>
        {toneOptions.map((option) => (
          <RadioRow
            key={option.value}
            name="mobile-report-tone"
            value={option.value}
            label={option.label}
            checked={payload.tone === option.value}
            disabled={isBuilding}
            onChange={(value) => updatePayload('tone', value)}
          />
        ))}
      </fieldset>

      <fieldset disabled={isBuilding} className="space-y-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Patterns
        </legend>
        {patternOptions.map((option) => (
          <RadioRow
            key={option.value}
            name="mobile-report-patterns"
            value={option.value}
            label={option.label}
            checked={payload.patternHandling === option.value}
            disabled={isBuilding}
            onChange={(value) => updatePayload('patternHandling', value)}
          />
        ))}
      </fieldset>

      {buildState === 'building' ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-600"
        >
          Building your draft...
        </p>
      ) : null}

      {buildState === 'error' ? (
        <p
          role="alert"
          className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-700"
        >
          {errorMessage || "We couldn't build the draft. Your selections are saved. Try again."}
        </p>
      ) : null}
    </MobileBottomSheet>
  );
}
