"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import type { DecodeHintType as HintType } from "@zxing/library";
import { AdmButton, admButtonClass, admModalBackdropClass, admModalPanelClass } from "@/components/admin/ui";

// Reads a barcode with the device's camera (a phone's back camera, or a laptop webcam),
// for when there's no barcode reader at hand. Uses ZXing, loaded only when this opens so
// the barcode page itself stays light. Covers the barcodes on packaged goods (EAN/UPC),
// printed shelf labels (Code 128/39, ITF) and QR codes.
//
// Browsers allow the camera only on HTTPS (or localhost) and after the user allows it,
// so each way that can fail gets its own plain message.

type Status = { state: "starting" } | { state: "scanning" } | { state: "error"; message: string };

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access is blocked. Allow the camera for this site in the browser's settings, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") {
    return "No camera was found on this device. Use the barcode reader or type the code instead.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera is being used by another app. Close it, then try again.";
  }
  return "The camera couldn't be started. Try again, or type the code instead.";
}

export function CameraScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // The latest callbacks, so the camera effect runs once and isn't restarted by a re-render.
  const handlers = useRef({ onDetected, onClose });
  const [status, setStatus] = useState<Status>({ state: "starting" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    handlers.current = { onDetected, onClose };
  });

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handlers.current.onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let controls: IScannerControls | null = null;

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus({ state: "error", message: "The camera only works when the site is opened over HTTPS. Use the barcode reader or type the code instead." });
        return;
      }
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (cancelled || !videoRef.current) return;

        const hints = new Map<HintType, unknown>([
          [
            DecodeHintType.POSSIBLE_FORMATS,
            [
              BarcodeFormat.EAN_13,
              BarcodeFormat.EAN_8,
              BarcodeFormat.UPC_A,
              BarcodeFormat.UPC_E,
              BarcodeFormat.CODE_128,
              BarcodeFormat.CODE_39,
              BarcodeFormat.ITF,
              BarcodeFormat.QR_CODE,
            ],
          ],
          [DecodeHintType.TRY_HARDER, true],
        ]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });

        let done = false;
        const started = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          videoRef.current,
          (result, _error, ctrl) => {
            if (!result || done) return;
            done = true;
            ctrl.stop();
            navigator.vibrate?.(80);
            handlers.current.onDetected(result.getText());
          }
        );
        // Closed while the camera was still starting: release it straight away.
        if (cancelled) {
          started.stop();
          return;
        }
        controls = started;
        setStatus({ state: "scanning" });
      } catch (err) {
        if (!cancelled) setStatus({ state: "error", message: cameraErrorMessage(err) });
      }
    }

    start();
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [attempt]);

  return (
    <div className={admModalBackdropClass}>
      <div role="dialog" aria-modal="true" aria-labelledby="camera-scan-title" className={`${admModalPanelClass} max-w-lg`}>
        <div className="mb-1 text-xs tracking-[.13em] text-adm-ink-3 uppercase">Barcode lookup</div>
        <h2 id="camera-scan-title" className="mb-3 text-lg font-semibold tracking-tight">
          Scan with camera
        </h2>

        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[6px] bg-[#141310]">
          <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover" />
          {status.state === "scanning" && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-[10%] top-1/2 h-[38%] -translate-y-1/2 rounded-[6px] border-2 border-white/85 shadow-[0_0_0_9999px_rgba(20,19,16,0.35)]">
              <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 bg-[#e5484d]/80" />
            </div>
          )}
          {status.state === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-base text-white/85 md:text-sm">
              Starting the camera… If the browser asks, allow it.
            </div>
          )}
        </div>

        <div aria-live="polite" className="mt-3 min-h-6 text-base md:text-sm">
          {status.state === "scanning" && (
            <p className="text-adm-ink-2">Point the camera at the barcode and hold it steady inside the frame. It reads on its own.</p>
          )}
          {status.state === "error" && (
            <p role="alert" className="text-adm-bad">
              {status.message}
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5">
          <button ref={closeRef} type="button" onClick={onClose} className={admButtonClass({ variant: "secondary" })}>
            Close
          </button>
          {status.state === "error" && (
            <AdmButton
              variant="primary"
              onClick={() => {
                setStatus({ state: "starting" });
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </AdmButton>
          )}
        </div>
      </div>
    </div>
  );
}
