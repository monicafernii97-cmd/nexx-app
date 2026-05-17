'use client';

import { motion } from 'framer-motion';
import { useState, useCallback, useRef, useEffect, useMemo, type ChangeEvent } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { Id } from '@convex/_generated/dataModel';
import {
    ClipboardText,
    ArrowRight,
    Microphone,
    MicrophoneSlash,
    PlusCircle,
    ArrowClockwise,
    CheckCircle,
    Check,
    PencilSimple,
    CalendarBlank,
    Clock,
    WarningCircle,
    ArrowLeft,
    Clock as TimelineIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    PAGE_SUBTITLE_CLASS_NAME,
    PAGE_TITLE_CLASS_NAME,
    PageContainer,
} from '@/components/layout/PageLayout';
import { useWorkspace } from '@/lib/workspace-context';
import { useToast } from '@/components/feedback/ToastProvider';

import '@/styles/pipelines.css';

/** Structured error for stable code-based matching instead of brittle string comparisons. */
type ProcessError = { code: 'empty_narrative' | 'missing_case' | 'invalid_datetime' | 'generic'; message: string } | null;
type CaptureStep = 'describe' | 'review' | 'confirmed';
type MediaAttachmentStatus = 'uploading' | 'analyzing' | 'ready' | 'failed';
type MediaAttachment = {
    id: string;
    caseId: Id<'cases'>;
    fileName: string;
    mimeType: string;
    size: number;
    status: MediaAttachmentStatus;
    documentId?: Id<'documents'>;
    analysis?: string;
    error?: string;
};

const ACCEPTED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_MEDIA_SIZE = 10 * 1024 * 1024;
const CONCURRENT_UPLOADS = 3;

const getAttachmentId = (file: File) => {
    const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    return `${file.name}-${file.size}-${file.lastModified}-${randomPart}`;
};

const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const analyzeImageLocally = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve([
                `Image attachment "${file.name}" was stored as photo evidence for this incident.`,
                `File type: ${file.type}. Size: ${formatFileSize(file.size)}. Dimensions: ${image.naturalWidth} x ${image.naturalHeight}px.`,
                'Image metadata was captured and saved with the incident record for review.',
            ].join(' '));
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('The image could not be read. Try a different image file.'));
        };
        image.src = objectUrl;
    });

const captureSteps: { id: CaptureStep; label: string }[] = [
    { id: 'describe', label: 'Describe' },
    { id: 'review', label: 'Review' },
    { id: 'confirmed', label: 'Confirmed' },
];

const isValidIncidentDateTime = (dateValue: string, timeValue: string) => {
    const normalizedDate = dateValue.trim();
    const normalizedTime = timeValue.trim();
    if (!normalizedDate || !normalizedTime) return false;
    return !Number.isNaN(new Date(`${normalizedDate}T${normalizedTime}`).getTime());
};

const getLocalNow = () => {
    const now = new Date();
    return {
        date: [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
        ].join('-'),
        time: now.toTimeString().slice(0, 5),
    };
};

/** Incident Intake Hub - The primary pipeline for event recording. */
export default function IncidentReportPage() {
    const { activeCaseId } = useWorkspace();
    const router = useRouter();
    const { showToast } = useToast();
    const [step, setStep] = useState<CaptureStep>('describe');
    const [narrative, setNarrative] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [speechSupported, setSpeechSupported] = useState<boolean | null>(null);
    const [mediaAttachments, setMediaAttachments] = useState<MediaAttachment[]>([]);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const mediaInputRef = useRef<HTMLInputElement | null>(null);
    const stepRef = useRef<CaptureStep>(step);
    const mediaAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
    const mediaDocumentsRef = useRef<Set<Id<'documents'>>>(new Set());
    const removedMediaIdsRef = useRef<Set<string>>(new Set());

    const [processError, setProcessError] = useState<ProcessError>(null);
    const [isPinning, setIsPinning] = useState<string | null>(null);
    const pinningRef = useRef<string | null>(null);
    const [isExportingIncident, setIsExportingIncident] = useState<string | null>(null);
    const exportingIncidentRef = useRef<string | null>(null);
    const [pinError, setPinError] = useState<string | null>(null);

    // Derive displayed error — automatically suppresses stale "no case" message once case is selected
    const displayedError = processError?.code === 'missing_case' && activeCaseId
        ? null
        : processError?.message ?? null;

    // Live data from Convex
    const incidents = useQuery(
        api.incidents.list,
        activeCaseId ? { caseId: activeCaseId } : 'skip',
    );
    const createIncident = useMutation(api.incidents.create);
    const createCasePin = useMutation(api.casePins.create);
    const saveCaseMemory = useMutation(api.caseMemory.save);
    const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
    const createDocument = useMutation(api.documents.create);
    const updateDocument = useMutation(api.documents.update);
    const removeDocument = useMutation(api.documents.remove);
    const removeDocumentRef = useRef(removeDocument);
    const dateTimeIsValid = isValidIncidentDateTime(date, time);

    useEffect(() => {
        removeDocumentRef.current = removeDocument;
    }, [removeDocument]);

    const stopSpeechRecognition = useCallback(() => {
        try {
            recognitionRef.current?.stop();
        } catch (err) {
            console.error('[IncidentIntake] Failed to stop speech recognition:', err);
        }
        setIsListening(false);
    }, []);

    useEffect(() => {
        stepRef.current = step;
        if (step !== 'describe') {
            try {
                recognitionRef.current?.stop();
            } catch (err) {
                console.error('[IncidentIntake] Failed to stop speech recognition:', err);
            }
        }
    }, [step]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const mountTimer = window.setTimeout(() => {
            const localNow = getLocalNow();
            setDate(localNow.date);
            setTime(localNow.time);
            setSpeechSupported(Boolean(SpeechRecognition));
        }, 0);

        if (!SpeechRecognition) {
            return () => window.clearTimeout(mountTimer);
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            if (stepRef.current !== 'describe') return;

            const finalChunks: string[] = [];
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalChunks.push(result[0].transcript.trim());
                }
            }
            if (finalChunks.length) {
                setNarrative((prev) => `${prev}${prev ? ' ' : ''}${finalChunks.join(' ')}`);
                setProcessError(null);
            }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.error('[IncidentIntake] Speech recognition error:', event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current = recognition;

        return () => {
            window.clearTimeout(mountTimer);
            recognition.abort();
        };
    }, []);

    useEffect(() => {
        const controllers = mediaAbortControllersRef.current;
        const documents = mediaDocumentsRef.current;
        return () => {
            controllers.forEach((controller) => controller.abort());
            controllers.clear();
            documents.forEach((documentId) => {
                void removeDocumentRef.current({ id: documentId }).catch((err) => {
                    console.error('[IncidentIntake] Failed to remove abandoned media document:', err);
                });
            });
            documents.clear();
        };
    }, []);

    const toggleListening = useCallback(() => {
        if (!recognitionRef.current) return;
        if (isListening) {
            stopSpeechRecognition();
            return;
        }

        try {
            recognitionRef.current.start();
            setIsListening(true);
        } catch (err) {
            console.error('[IncidentIntake] Failed to start speech recognition:', err);
        }
    }, [isListening, stopSpeechRecognition]);

    /** Advance to review after validating the local capture fields. */
    const handleReview = useCallback(() => {
        const trimmed = narrative.trim();
        if (!trimmed || !activeCaseId) {
            if (!trimmed) {
                setProcessError({ code: 'empty_narrative', message: 'Please enter a narrative.' });
            } else if (!activeCaseId) {
                setProcessError({ code: 'missing_case', message: 'Please select or create a case first.' });
            }
            return;
        }
        if (!isValidIncidentDateTime(date, time)) {
            setProcessError({ code: 'invalid_datetime', message: 'Please enter a valid date and time.' });
            return;
        }

        setProcessError(null);
        stopSpeechRecognition();
        setStep('review');
    }, [narrative, activeCaseId, date, time, stopSpeechRecognition]);

    const updateAttachment = useCallback((id: string, patch: Partial<MediaAttachment>) => {
        setMediaAttachments((prev) =>
            prev.map((attachment) => attachment.id === id ? { ...attachment, ...patch } : attachment)
        );
    }, []);

    const hasPendingMedia = mediaAttachments.some(
        (attachment) => attachment.status === 'uploading' || attachment.status === 'analyzing'
    );
    const hasMismatchedMedia = mediaAttachments.some(
        (attachment) => Boolean(activeCaseId) && attachment.caseId !== activeCaseId
    );

    const handleAttachMedia = useCallback(() => {
        if (isProcessing) return;
        mediaInputRef.current?.click();
    }, [isProcessing]);

    const handleMediaSelected = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (!selectedFiles.length) return;
        if (isProcessing) return;
        if (!activeCaseId) {
            setProcessError({ code: 'missing_case', message: 'Please select or create a case before attaching media.' });
            return;
        }
        setProcessError(null);

        const queuedFiles = selectedFiles.map((file) => ({ file, id: getAttachmentId(file) }));
        const baseAttachments: MediaAttachment[] = queuedFiles.map(({ file, id }) => ({
            id,
            caseId: activeCaseId,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            status: 'uploading',
        }));

        queuedFiles.forEach(({ id }) => {
            removedMediaIdsRef.current.delete(id);
        });
        setMediaAttachments((prev) => [...prev, ...baseAttachments]);

        const processFile = async (file: File, id: string) => {
            if (!ACCEPTED_MEDIA_TYPES.has(file.type)) {
                updateAttachment(id, {
                    status: 'failed',
                    error: 'Unsupported file type. Attach JPG, PNG, WEBP, or GIF images.',
                });
                return;
            }

            if (file.size > MAX_MEDIA_SIZE) {
                updateAttachment(id, {
                    status: 'failed',
                    error: 'File is too large. Attach an image under 10 MB.',
                });
                return;
            }

            const controller = new AbortController();
            mediaAbortControllersRef.current.set(id, controller);
            const isCurrentAttachment = () => !controller.signal.aborted && !removedMediaIdsRef.current.has(id);

            try {
                const uploadUrl = await generateUploadUrl({});
                if (!isCurrentAttachment()) return;
                const uploadResponse = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': file.type },
                    body: file,
                    signal: controller.signal,
                });
                if (!uploadResponse.ok) {
                    const errorBody = await uploadResponse.text().catch(() => '');
                    throw new Error(`Media upload failed (${uploadResponse.status}). ${errorBody}`.trim());
                }
                if (!isCurrentAttachment()) return;
                const uploadResult = await uploadResponse.json();
                const storageId = uploadResult?.storageId as Id<'_storage'> | undefined;
                if (!storageId) {
                    throw new Error('Media upload returned no storage ID.');
                }

                updateAttachment(id, { status: 'analyzing' });
                const analysis = await analyzeImageLocally(file);
                if (!isCurrentAttachment()) return;
                const documentId = await createDocument({
                    title: file.name,
                    type: 'photo_evidence',
                    content: analysis,
                    storageId,
                    mimeType: file.type,
                    fileSize: file.size,
                    caseId: activeCaseId,
                });
                mediaDocumentsRef.current.add(documentId);
                if (!isCurrentAttachment()) {
                    mediaDocumentsRef.current.delete(documentId);
                    void removeDocument({ id: documentId }).catch((err) => {
                        console.error('[IncidentIntake] Failed to remove canceled media document:', err);
                    });
                    return;
                }
                updateAttachment(id, {
                    status: 'ready',
                    documentId,
                    analysis,
                    error: undefined,
                });
            } catch (err) {
                if (controller.signal.aborted || removedMediaIdsRef.current.has(id)) return;
                updateAttachment(id, {
                    status: 'failed',
                    error: err instanceof Error ? err.message : 'Media analysis failed.',
                });
            } finally {
                mediaAbortControllersRef.current.delete(id);
            }
        };

        for (let index = 0; index < queuedFiles.length; index += CONCURRENT_UPLOADS) {
            const batch = queuedFiles.slice(index, index + CONCURRENT_UPLOADS);
            await Promise.all(batch.map(({ file, id }) => processFile(file, id)));
        }
    }, [activeCaseId, createDocument, generateUploadUrl, isProcessing, removeDocument, updateAttachment]);

    const handleRemoveMedia = useCallback((id: string) => {
        if (isProcessing) return;
        const attachment = mediaAttachments.find((item) => item.id === id);
        removedMediaIdsRef.current.add(id);
        mediaAbortControllersRef.current.get(id)?.abort();
        mediaAbortControllersRef.current.delete(id);
        setMediaAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
        if (attachment?.documentId) {
            mediaDocumentsRef.current.delete(attachment.documentId);
            void removeDocument({ id: attachment.documentId }).catch((err) => {
                console.error('[IncidentIntake] Failed to remove attached media document:', err);
            });
        }
    }, [isProcessing, mediaAttachments, removeDocument]);

    const mediaEvidence = useMemo(
        () => mediaAttachments
            .filter((attachment) => attachment.caseId === activeCaseId && attachment.status === 'ready' && attachment.analysis)
            .map((attachment) => `Attached media (${attachment.fileName}): ${attachment.analysis}`),
        [activeCaseId, mediaAttachments],
    );

    /** Process the incident narrative and save to Convex. */
    const handleProcess = useCallback(async () => {
        const trimmed = narrative.trim();
        if (!trimmed || !activeCaseId) {
            handleReview();
            return;
        }
        if (!isValidIncidentDateTime(date, time)) {
            setProcessError({ code: 'invalid_datetime', message: 'Please enter a valid date and time.' });
            setStep('describe');
            return;
        }
        if (hasPendingMedia) {
            setProcessError({ code: 'generic', message: 'Please wait for attached media to finish processing before saving.' });
            return;
        }
        if (hasMismatchedMedia) {
            setProcessError({ code: 'generic', message: 'Attached media belongs to a different case. Remove it before saving this incident.' });
            return;
        }

        const normalizedDate = date.trim();
        const normalizedTime = time.trim();

        setIsProcessing(true);
        setProcessError(null);
        stopSpeechRecognition();

        try {
            const incidentId = await createIncident({
                narrative: trimmed,
                severity: 1,
                date: normalizedDate,
                time: normalizedTime,
                caseId: activeCaseId,
                evidence: mediaEvidence.length ? mediaEvidence : undefined,
            });

            const linkedDocuments = mediaAttachments.filter(
                (attachment): attachment is MediaAttachment & { documentId: Id<'documents'> } =>
                    attachment.caseId === activeCaseId && Boolean(attachment.documentId)
            );
            if (linkedDocuments.length) {
                const linkResults = await Promise.allSettled(
                    linkedDocuments.map((attachment) =>
                        updateDocument({
                            id: attachment.documentId,
                            incidentId,
                        })
                    )
                );
                const failures = linkResults
                    .map((result, index) => ({ result, attachment: linkedDocuments[index] }))
                    .filter(({ result }) => result.status === 'rejected');
                if (failures.length) {
                    console.error('[IncidentIntake] Some media documents failed to link:', {
                        incidentId,
                        documents: failures.map(({ attachment }) => attachment.documentId),
                        failures,
                    });
                }
                linkResults.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        mediaDocumentsRef.current.delete(linkedDocuments[index].documentId);
                    }
                });
            }

            setNarrative('');
            setMediaAttachments([]);
            setStep('confirmed');
        } catch (err) {
            console.error('[IncidentIntake] Create failed:', err);
            setProcessError({ code: 'generic', message: err instanceof Error ? err.message : 'Failed to save incident' });
        } finally {
            setIsProcessing(false);
        }
    }, [narrative, activeCaseId, date, time, hasPendingMedia, hasMismatchedMedia, createIncident, handleReview, stopSpeechRecognition, mediaEvidence, mediaAttachments, updateDocument]);

    /** Pin an incident to the case workspace. Prevents duplicate clicks. */
    const handleAddToWorkspace = useCallback(async (incident: { _id: Id<'incidents'>; narrative: string; date: string; time?: string }) => {
        if (pinningRef.current) return;
        if (!activeCaseId) {
            showToast({
                variant: 'warning',
                title: 'Select a case first',
                description: 'Choose an active case before saving this incident to the workspace.',
            });
            return;
        }
        pinningRef.current = incident._id;
        setIsPinning(incident._id);

        try {
            setPinError(null);
            await createCasePin({
                caseId: activeCaseId,
                type: 'timeline_anchor',
                title: `Incident — ${incident.date}`,
                content: incident.narrative,
                rawSourceText: incident.narrative,
                confidence: 'high',
                detectedDate: incident.date,
                aiVersion: 'incident-intake-actions-v1',
                requestId: `incident:${incident._id}:workspace`,
            });
            showToast({
                variant: 'success',
                title: 'Saved to Case Workspace',
                description: 'The incident is pinned as a timeline anchor for this case.',
                destination: { label: 'Open workspace', href: '/chat/overview' },
            });
        } catch (err) {
            console.error('[IncidentIntake] Pin creation failed:', err);
            setPinError('Failed to add incident to workspace. Please try again.');
            showToast({
                variant: 'error',
                title: 'Workspace save failed',
                description: err instanceof Error ? err.message : 'Please try again.',
            });
        } finally {
            pinningRef.current = null;
            setIsPinning(null);
        }
    }, [activeCaseId, createCasePin, showToast]);

    /** Save an incident as an exhibit note for the existing Exhibit Hub/DocuVault flow. */
    const handleExportToExhibit = useCallback(async (incident: { _id: Id<'incidents'>; narrative: string; date: string; time?: string; evidence?: string[] }) => {
        if (exportingIncidentRef.current) return;
        if (!activeCaseId) {
            showToast({
                variant: 'warning',
                title: 'Select a case first',
                description: 'Choose an active case before sending this incident to Exhibit Hub.',
            });
            return;
        }

        exportingIncidentRef.current = incident._id;
        setIsExportingIncident(incident._id);

        try {
            setPinError(null);
            const evidenceText = incident.evidence?.length
                ? `\n\nLinked evidence:\n${incident.evidence.map((item) => `- ${item}`).join('\n')}`
                : '';
            await saveCaseMemory({
                type: 'exhibit_note',
                title: `Exhibit source - Incident ${incident.date}`,
                content: `Incident date: ${incident.date}${incident.time ? ` at ${incident.time}` : ''}\n\n${incident.narrative}${evidenceText}`,
                caseId: activeCaseId,
                metadataJson: JSON.stringify({
                    source: 'incident_report_timeline_intake',
                    incidentId: incident._id,
                    eventDate: incident.date,
                    eventTime: incident.time ?? null,
                    evidenceCount: incident.evidence?.length ?? 0,
                }),
                requestId: `incident:${incident._id}:exhibit-note`,
            });
            showToast({
                variant: 'success',
                title: 'Sent to Exhibit Hub',
                description: 'Saved as an exhibit note for DocuVault/exhibit assembly.',
                destination: { label: 'Open Exhibit Hub', href: '/docuvault/exhibits' },
            });
        } catch (err) {
            console.error('[IncidentIntake] Exhibit note creation failed:', err);
            setPinError('Failed to send incident to Exhibit Hub. Please try again.');
            showToast({
                variant: 'error',
                title: 'Exhibit export failed',
                description: err instanceof Error ? err.message : 'Please try again.',
            });
        } finally {
            exportingIncidentRef.current = null;
            setIsExportingIncident(null);
        }
    }, [activeCaseId, saveCaseMemory, showToast]);



    return (
        <PageContainer>
            <div className="max-w-5xl mx-auto flex-1 min-h-0 flex flex-col w-full gap-6 pb-4">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col gap-8"
                >
                    <div className="flex items-center gap-5">
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-105 bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] shadow-md border border-[rgba(255,255,255,0.2)] hover:border-[rgba(255,255,255,0.4)]"
                            aria-label="Go back"
                        >
                            <ArrowLeft size={20} weight="bold" className="text-white" />
                        </button>
                        <div>
                            <h1 className={`${PAGE_TITLE_CLASS_NAME} m-0`}>
                                Evidence & <span className="text-white shimmer">Pattern Log</span>
                            </h1>
                            <p className={`${PAGE_SUBTITLE_CLASS_NAME} mt-1.5`}>
                                Documenting patterns of behavior with precision for court.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-1">
                        {captureSteps.map((captureStep, i) => {
                            const activeIndex = captureSteps.findIndex((item) => item.id === step);
                            const isActive = activeIndex >= i;
                            const isPast = activeIndex > i;
                            return (
                                <div key={captureStep.id} className="flex items-center gap-3 flex-1 min-w-[120px]">
                                    <div
                                        className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold transition-all duration-500 shrink-0 shadow-sm ${
                                            isActive
                                                ? 'bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] text-white scale-110 shadow-[0_4px_12px_rgba(18,61,126,0.3)] border border-[rgba(255,255,255,0.3)]'
                                                : 'bg-[#0A1128] text-white/50 border border-white/20'
                                        }`}
                                    >
                                        {isPast ? <Check size={14} weight="bold" /> : i + 1}
                                    </div>
                                    <span className={`text-[13px] tracking-wide font-bold uppercase whitespace-nowrap ${isActive ? 'text-white' : 'text-white/60'}`}>
                                        {captureStep.label}
                                    </span>
                                    {i < captureSteps.length - 1 && (
                                        <div className="flex-1 h-px min-w-[20px] bg-white/10" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="hyper-glass p-6 md:p-8 flex flex-col gap-8 floating-element glow-slate border border-white/10"
                >
                    {step === 'describe' && (
                        <>
                            <div className="text-center">
                                {speechSupported === null ? null : speechSupported ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={toggleListening}
                                            className={`w-24 h-24 rounded-full mx-auto flex items-center justify-center cursor-pointer transition-all hover:scale-105 shadow-[0_8px_32px_rgba(26,75,155,0.5)] border-[4px] group relative overflow-hidden ${
                                                isListening
                                                    ? 'bg-[linear-gradient(135deg,#C75A5A,#8B3A3A)] border-[rgba(199,90,90,0.5)] animate-pulse shadow-[0_0_30px_rgba(199,90,90,0.5)]'
                                                    : 'bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] border-[rgba(255,255,255,0.12)] hover:border-[rgba(255,255,255,0.3)]'
                                            }`}
                                            title={isListening ? 'Stop recording' : 'Start voice recording'}
                                            aria-label={isListening ? 'Stop recording' : 'Start voice recording'}
                                            aria-pressed={isListening}
                                        >
                                            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            {isListening ? (
                                                <MicrophoneSlash size={34} weight="fill" className="text-white drop-shadow-md" />
                                            ) : (
                                                <Microphone size={34} weight="duotone" className="text-white group-hover:scale-110 transition-all drop-shadow-md" />
                                            )}
                                        </button>
                                        <p className={`text-[13px] font-bold tracking-widest uppercase mt-5 ${isListening ? 'text-rose' : 'text-white'}`}>
                                            {isListening ? 'Listening... Tap to Stop' : 'Tap to Record Testimony'}
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-24 h-24 rounded-full mx-auto flex items-center justify-center bg-white/5 border-[4px] border-white/10 opacity-60">
                                            <MicrophoneSlash size={34} className="text-white/50" />
                                        </div>
                                        <p className="text-[12px] font-medium text-white/40 mt-5">
                                            Voice recording is not supported in this browser.
                                        </p>
                                    </>
                                )}
                            </div>

                            <div>
                                <label htmlFor="incident-narrative" className="text-[12px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2 text-white">
                                    <PencilSimple size={14} /> Manual Narrative
                                </label>
                                <div className="relative">
                                    <textarea
                                        id="incident-narrative"
                                        value={narrative}
                                        onChange={(e) => {
                                            setNarrative(e.target.value);
                                            if (processError) setProcessError(null);
                                        }}
                                        aria-label="Incident narrative"
                                        placeholder="Describe the incident with precision - what happened, who was present, what was said or done..."
                                        rows={7}
                                        maxLength={5000}
                                        className="w-full resize-none bg-white text-[#0A1128] placeholder:text-[#0A1128]/50 text-[15px] leading-relaxed rounded-[1.25rem] focus:ring-2 focus:ring-[#1A4B9B] border-none shadow-inner px-5 py-4 outline-none"
                                    />
                                    <p className={`absolute bottom-3 right-4 text-[11px] font-bold ${narrative.length > 4500 ? 'text-rose' : 'text-[#0A1128]/40'}`}>
                                        {narrative.length}/5000
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div>
                                    <label htmlFor="incident-date" className="text-[12px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2 text-white">
                                        <CalendarBlank size={14} /> Date
                                    </label>
                                    <input
                                        id="incident-date"
                                        type="date"
                                        value={date}
                                        onChange={(e) => {
                                            setDate(e.target.value);
                                            if (processError?.code === 'invalid_datetime') setProcessError(null);
                                        }}
                                        className="w-full rounded-[1.25rem] border-none bg-white px-5 py-4 text-[#0A1128] shadow-inner outline-none focus:ring-2 focus:ring-[#1A4B9B]"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="incident-time" className="text-[12px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2 text-white">
                                        <Clock size={14} /> Time
                                    </label>
                                    <input
                                        id="incident-time"
                                        type="time"
                                        value={time}
                                        onChange={(e) => {
                                            setTime(e.target.value);
                                            if (processError?.code === 'invalid_datetime') setProcessError(null);
                                        }}
                                        className="w-full rounded-[1.25rem] border-none bg-white px-5 py-4 text-[#0A1128] shadow-inner outline-none focus:ring-2 focus:ring-[#1A4B9B]"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2 border-t border-white/5">
                                <div className="flex flex-col gap-2">
                                    <input
                                        ref={mediaInputRef}
                                        type="file"
                                        accept={MEDIA_ACCEPT}
                                        multiple
                                        className="sr-only"
                                        onChange={handleMediaSelected}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAttachMedia}
                                        className="flex items-center justify-center sm:justify-start gap-2 text-white/65 hover:text-white text-[11px] font-bold uppercase tracking-[0.2em] transition-all"
                                        title="Attach media"
                                    >
                                        <PlusCircle size={18} weight="light" />
                                        Attach Media
                                    </button>
                                    {mediaAttachments.length > 0 && (
                                        <div className="flex flex-wrap gap-2 max-w-xl">
                                            {mediaAttachments.map((attachment) => (
                                                <div
                                                    key={attachment.id}
                                                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/70"
                                                >
                                                    <span className="max-w-[160px] truncate font-semibold">{attachment.fileName}</span>
                                                    <span className={`font-bold uppercase ${
                                                        attachment.status === 'ready'
                                                            ? 'text-emerald-300'
                                                            : attachment.status === 'failed'
                                                                ? 'text-red-300'
                                                                : 'text-amber-300'
                                                    }`}>
                                                        {attachment.status === 'ready' ? 'Analyzed' : attachment.status}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveMedia(attachment.id)}
                                                        className="text-white/35 hover:text-white transition-colors"
                                                        aria-label={`Remove ${attachment.fileName}`}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleReview}
                                    disabled={!narrative.trim() || !activeCaseId || !dateTimeIsValid}
                                    aria-label="Review incident"
                                    className={`flex items-center justify-center gap-3 px-6 py-3 rounded-xl font-bold uppercase tracking-[0.2em] text-[10px] transition-all shadow-2xl ${
                                        narrative.trim() && activeCaseId && dateTimeIsValid
                                            ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                                            : 'bg-white/5 text-white/20 border border-white/5 cursor-not-allowed'
                                    }`}
                                >
                                    Review Incident <ArrowRight size={16} weight="bold" />
                                </button>
                            </div>
                        </>
                    )}

                    {step === 'review' && (
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                                    <ClipboardText size={20} className="text-indigo-300" />
                                </div>
                                <div>
                                    <h2 className="font-serif text-xl text-white">Review captured testimony</h2>
                                    <p className="text-[12px] text-white/45 font-bold uppercase tracking-[0.2em]">Confirm before saving to the timeline</p>
                                </div>
                            </div>
                            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 space-y-4">
                                <div className="flex flex-wrap gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                                    <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10">{date}</span>
                                    <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10">{time}</span>
                                </div>
                                <p className="text-[15px] leading-relaxed text-white/80 whitespace-pre-wrap font-serif">
                                    {narrative}
                                </p>
                                {mediaAttachments.length > 0 && (
                                    <div className="rounded-xl bg-black/15 border border-white/10 p-4 space-y-3">
                                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/45">Attached media analysis</p>
                                        {mediaAttachments.map((attachment) => (
                                            <div key={attachment.id} className="space-y-1 text-[13px] leading-relaxed text-white/70">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-bold text-white/85">{attachment.fileName}</span>
                                                    <span className={`text-[10px] font-bold uppercase tracking-[0.16em] ${
                                                        attachment.status === 'ready'
                                                            ? 'text-emerald-300'
                                                            : attachment.status === 'failed'
                                                                ? 'text-red-300'
                                                                : 'text-amber-300'
                                                    }`}>
                                                        {attachment.status === 'ready' ? 'Analysis complete' : attachment.status}
                                                    </span>
                                                </div>
                                                {attachment.analysis && <p className="text-white/65">{attachment.analysis}</p>}
                                                {attachment.error && <p className="text-red-300">{attachment.error}</p>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                    type="button"
                                    onClick={() => setStep('describe')}
                                    disabled={isProcessing}
                                    className="flex-1 py-4 uppercase text-[12px] font-bold tracking-widest rounded-xl transition-all text-white bg-white/5 border border-white/20 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Back to Edit
                                </button>
                                <button
                                    type="button"
                                    onClick={handleProcess}
                                    disabled={isProcessing || !activeCaseId || !dateTimeIsValid || hasPendingMedia || hasMismatchedMedia}
                                    aria-busy={isProcessing}
                                    aria-label={isProcessing ? 'Saving incident' : 'Confirm and log incident'}
                                    className="flex-[1.5] flex items-center justify-center gap-2 disabled:opacity-50 py-4 uppercase text-[12px] font-bold tracking-widest rounded-xl transition-all shadow-md text-white bg-indigo-600 hover:bg-indigo-500"
                                >
                                    {isProcessing ? <ArrowClockwise size={18} className="animate-spin" /> : <CheckCircle size={18} weight="fill" />}
                                    {isProcessing ? 'Saving...' : 'Confirm & Log'}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'confirmed' && (
                        <div className="text-center py-4">
                            <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center bg-emerald-500 shadow-[0_8px_24px_rgba(90,158,111,0.25)]">
                                <Check size={26} weight="bold" className="text-white" />
                            </div>
                            <h2 className="font-serif text-2xl font-bold mb-3 text-white">
                                Incident Documented
                            </h2>
                            <p className="text-[15px] font-medium mb-8 text-white/60 max-w-sm mx-auto leading-relaxed">
                                This record has been saved to your incident timeline.
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    stopSpeechRecognition();
                                    setStep('describe');
                                    setNarrative('');
                                    setProcessError(null);
                                    const localNow = getLocalNow();
                                    setDate(localNow.date);
                                    setTime(localNow.time);
                                }}
                                className="inline-flex items-center justify-center px-6 py-3.5 gap-2 shadow-[0_4px_20px_rgba(26,75,155,0.4)] text-[13px] font-bold tracking-widest uppercase rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all"
                            >
                                <PlusCircle size={16} weight="bold" /> Log Another
                            </button>
                        </div>
                    )}
                </motion.div>

                {/* Error & Warnings */}
                <div className="px-4 space-y-4 shrink-0">
                    {displayedError && (
                        <div role="alert" aria-live="assertive" className="px-6 py-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                            <WarningCircle size={16} weight="fill" />
                            {displayedError}
                        </div>
                    )}
                    {!activeCaseId && !displayedError && (
                        <div className="px-6 py-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-widest text-center">
                            Select an active case to begin recording incidents
                        </div>
                    )}
                </div>

                {/* 3. Live Timeline (Luxury Glass) */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex-[0.5] min-h-0 hyper-glass p-6 flex flex-col"
                >
                    <div className="flex items-center justify-between border-b border-white/5 pb-4 shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                                <TimelineIcon size={20} className="text-indigo-400" />
                            </div>
                            <div>
                                <h3 className="font-serif text-lg text-white tracking-tight">Timeline Intake</h3>
                                <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em] mt-1">Chronological Fact Logging</p>
                            </div>
                        </div>
                        <Link href="/incident-report/history" className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-[0.2em] flex items-center gap-2 group transition-all">
                            Historical Archive <ArrowRight size={14} weight="bold" className="group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>

                    <div className="flex-1 min-h-0 overflow-hidden space-y-6 pt-4">
                        {/* No case selected state */}
                        {!activeCaseId && (
                            <p className="text-center text-white/20 text-[10px] uppercase tracking-[0.3em] font-bold py-10">
                                Case isolation active
                            </p>
                        )}

                        {/* Loading state */}
                        {activeCaseId && incidents === undefined && (
                            <div className="flex items-center justify-center py-10">
                                <div className="w-6 h-6 border-2 border-white/10 border-t-indigo-400 rounded-full animate-spin" />
                            </div>
                        )}

                        {/* Empty state */}
                        {incidents && incidents.length === 0 && (
                            <p className="text-center text-white/20 text-[10px] uppercase tracking-[0.3em] font-bold py-10">
                                Queue clear • Awaiting entries
                            </p>
                        )}

                        {/* Pin error */}
                        {pinError && (
                            <div role="alert" aria-live="assertive" className="px-6 py-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-widest">
                                {pinError}
                            </div>
                        )}

                        {/* Live incidents */}
                        {incidents?.slice(0, 3).map((incident, i) => (
                            <div key={incident._id} className="flex gap-8 relative group">
                                {/* Vertical Timeline Line */}
                                {i !== Math.min((incidents?.length ?? 0) - 1, 2) && (
                                    <div className="absolute left-[7px] top-8 bottom-[-2.5rem] w-[1px] bg-white/5" />
                                )}
                                
                                <div className="mt-2 w-4 h-4 rounded-full border border-indigo-500/50 bg-[#020617] z-10 shrink-0 group-hover:scale-125 transition-transform shadow-[0_0_8px_rgba(99,102,241,0.3)]" />
                                
                                <div className="flex-1 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <span className="text-[11px] font-bold text-white tracking-[0.1em] uppercase">{incident.date}</span>
                                            <span className="text-[11px] font-medium text-white/20 uppercase tracking-widest">{incident.time}</span>
                                            {incident.status === 'confirmed' && (
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-400 uppercase tracking-widest">Verified</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button disabled className="text-[10px] font-bold text-white/30 hover:text-white uppercase tracking-widest transition-colors cursor-not-allowed">Edit</button>
                                        </div>
                                    </div>
                                    <p className="text-[15px] text-white/60 leading-relaxed font-serif max-w-2xl group-hover:text-white/80 transition-colors">
                                        {incident.narrative.length > 250
                                            ? incident.narrative.slice(0, 250) + '...'
                                            : incident.narrative}
                                    </p>
                                    <div className="flex gap-3 pt-2">
                                        <button
                                            onClick={() => handleAddToWorkspace(incident)}
                                            disabled={Boolean(isPinning)}
                                            className={`px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-[0.2em] border transition-all ${
                                                isPinning
                                                    ? 'bg-indigo-500/10 text-indigo-400/60 border-indigo-500/20 cursor-not-allowed'
                                                    : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10 hover:border-white/20 hover:text-white'
                                            }`}
                                        >
                                            {isPinning === incident._id ? 'Securing...' : isPinning ? 'Please wait' : 'Case Workspace'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleExportToExhibit(incident)}
                                            disabled={Boolean(isExportingIncident)}
                                            className={`px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-[0.2em] border transition-all ${
                                                isExportingIncident
                                                    ? 'bg-amber-500/10 text-amber-400/60 border-amber-500/20 cursor-not-allowed'
                                                    : 'bg-amber-500/10 text-amber-300 border-amber-500/20 hover:bg-amber-500/15 hover:border-amber-400/40 hover:text-amber-200'
                                            }`}
                                        >
                                            {isExportingIncident === incident._id ? 'Sending...' : isExportingIncident ? 'Please wait' : 'Export to Exhibit'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </PageContainer>
    );
}
