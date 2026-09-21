"use client";
import { useEffect, useRef, useState } from "react";

/** Recording only prepares editable text. It never sends an assistant request. */
export function VoiceInput({
  onInsert,
  disabled,
}: {
  onInsert: (text: string) => void;
  disabled: boolean;
}) {
  const [status, setStatus] = useState<
      "idle" | "requesting" | "recording" | "transcribing"
    >("idle"),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    request = useRef<AbortController | null>(null),
    epoch = useRef(0),
    timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const release = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  const cancel = () => {
    epoch.current++;
    request.current?.abort();
    request.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null;
    release();
    setStatus("idle");
  };
  useEffect(
    () => () => {
      epoch.current++;
      request.current?.abort();
      if (recorder.current?.state === "recording") recorder.current.stop();
      release();
    },
    [],
  );
  async function start() {
    if (status !== "idle" || disabled) return;
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
      setError(
        "Recording is unavailable in this browser. You can still type your message.",
      );
      return;
    }
    const token = ++epoch.current;
    setError("");
    setStatus("requesting");
    setSeconds(0);
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (token !== epoch.current) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = mic;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
        (m) => MediaRecorder.isTypeSupported(m),
      );
      const r = new MediaRecorder(mic, mime ? { mimeType: mime } : undefined);
      recorder.current = r;
      const chunks: Blob[] = [];
      let size = 0;
      const began = Date.now();
      r.ondataavailable = (e) => {
        if (token !== epoch.current) return;
        size += e.data.size;
        if (size > 10 * 1024 * 1024) {
          cancel();
          setError("Recording exceeded 10 MB. Record a shorter message.");
          return;
        }
        if (e.data.size) chunks.push(e.data);
      };
      r.onerror = () => {
        if (token === epoch.current) {
          cancel();
          setError("Recording failed. Your typed message is unchanged.");
        }
      };
      r.onstop = async () => {
        if (token !== epoch.current) return;
        release();
        recorder.current = null;
        setStatus("transcribing");
        const abort = new AbortController();
        request.current = abort;
        try {
          const blob = new Blob(chunks, {
            type: r.mimeType || mime || "audio/webm",
          });
          if (!blob.size) throw new Error("No audio was recorded.");
          const form = new FormData();
          form.append(
            "file",
            new File(
              [blob],
              blob.type.includes("mp4")
                ? "exhibit-dictation.m4a"
                : "exhibit-dictation.webm",
              { type: blob.type },
            ),
          );
          const result = await fetch("/api/audio/transcribe", {
            method: "POST",
            body: form,
            signal: abort.signal,
          });
          const data = await result.json();
          if (!result.ok || typeof data.text !== "string")
            throw new Error("Transcription failed. Try recording again.");
          if (token === epoch.current) setText(data.text);
        } catch (e) {
          if (token === epoch.current)
            setError(e instanceof Error ? e.message : "Transcription failed.");
        } finally {
          if (token === epoch.current) {
            request.current = null;
            setStatus("idle");
          }
        }
      };
      r.start(1000);
      setStatus("recording");
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - began) / 1000);
        setSeconds(elapsed);
        if (elapsed >= 120 && r.state === "recording") r.stop();
      }, 500);
    } catch (e) {
      if (token === epoch.current) {
        release();
        setStatus("idle");
        setError(e instanceof Error ? e.message : "Microphone unavailable.");
      }
    }
  }
  return (
    <div className="space-y-2 text-xs">
      <p>
        Dictation is transcribed by the existing audio service. Review and
        insert the text before sending. Audio is not added to your evidence.
      </p>
      {status === "idle" ? (
        <button
          type="button"
          disabled={disabled}
          className="rounded border p-2"
          onClick={start}
        >
          Record exhibit message
        </button>
      ) : (
        <>
          <p role="status">
            {status === "recording"
              ? `Recording ${seconds}s / 120s`
              : status === "requesting"
                ? "Waiting for microphone permission…"
                : "Transcribing…"}
          </p>
          {status === "recording" && (
            <button type="button" onClick={() => recorder.current?.stop()}>
              Stop recording
            </button>
          )}
          <button type="button" onClick={cancel}>
            Cancel dictation
          </button>
        </>
      )}
      {text && (
        <>
          <textarea
            aria-label="Review dictated text"
            className="min-h-24 w-full rounded bg-slate-900 p-2"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            type="button"
            disabled={disabled || status !== "idle"}
            onClick={() => {
              onInsert(text);
              setText("");
            }}
          >
            Insert reviewed dictation
          </button>
          <button type="button" onClick={() => setText("")}>
            Discard transcript
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
