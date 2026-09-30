"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { PageHeader, Card, AdmButton, admInputClass, admLabelClass } from "@/components/admin/ui";

// Kiosk access by QR code (manuscript Scope, p. 7; Requirements Analysis, p. 51;
// Figure 1.2): customers scan a printed code with their phone camera and the kiosk
// menu opens in their browser, where they order exactly as on the in-store kiosk.
// The code is generated in the browser; nothing is sent to an outside service.

const STORAGE_KEY = "zaks.kioskQrUrl";
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

function defaultKioskUrl(): string {
  if (process.env.NEXT_PUBLIC_KIOSK_URL) return process.env.NEXT_PUBLIC_KIOSK_URL;
  return typeof window === "undefined" ? "" : `${window.location.origin}/`;
}

function savedKioskUrl(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || defaultKioskUrl();
  } catch {
    return defaultKioskUrl();
  }
}

/** Returns the URL if it's a usable http(s) address, or null. */
function parseUrl(text: string): URL | null {
  try {
    const url = new URL(text.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export default function KioskQrPage() {
  const [urlText, setUrlText] = useState(() => (typeof window === "undefined" ? "" : savedKioskUrl()));
  const [qr, setQr] = useState<{ url: string; dataUrl: string } | null>(null);

  const url = parseUrl(urlText);
  const href = url?.href ?? null;
  const isLocal = url ? LOCAL_HOSTS.includes(url.hostname) : false;

  useEffect(() => {
    if (!href) return;
    let cancelled = false;
    QRCode.toDataURL(href, { errorCorrectionLevel: "M", margin: 2, width: 1024, color: { dark: "#1c1b18", light: "#ffffff" } })
      .then((dataUrl) => {
        if (!cancelled) setQr({ url: href, dataUrl });
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [href]);

  function updateUrl(text: string) {
    setUrlText(text);
    try {
      if (parseUrl(text)) window.localStorage.setItem(STORAGE_KEY, text.trim());
    } catch {
      // Storage can be blocked; the address still works for this visit.
    }
  }

  function resetUrl() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setUrlText(defaultKioskUrl());
  }

  function downloadPng() {
    if (!qr) return;
    const link = document.createElement("a");
    link.href = qr.dataUrl;
    link.download = "zaks-kiosk-qr.png";
    link.click();
  }

  // Only the poster is printed: the sidebar and controls are hidden on paper.
  const printCss = `
    @media print {
      @page { size: A4 portrait; margin: 12mm; }
      body * { visibility: hidden !important; }
      #kiosk-qr-poster, #kiosk-qr-poster * { visibility: visible !important; }
      #kiosk-qr-poster { position: absolute; inset: 0; margin: 0 auto; max-width: 160mm; zoom: 1.35; border: none !important; box-shadow: none !important; }
    }`;
  const shownQr = qr && qr.url === href ? qr : null;

  return (
    <div className="flex flex-col gap-4.5">
      <style>{printCss}</style>
      <PageHeader
        eyebrow="Kiosk access"
        title="Kiosk QR code"
        actions={
          <>
            <AdmButton variant="secondary" onClick={downloadPng} disabled={!shownQr}>
              Download PNG
            </AdmButton>
            <AdmButton variant="primary" onClick={() => window.print()} disabled={!shownQr}>
              Print poster
            </AdmButton>
          </>
        }
      />

      <Card>
        <div className="p-4 md:p-4.5">
          <label className="block">
            <span className={admLabelClass}>Kiosk address the code opens</span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                inputMode="url"
                value={urlText}
                onChange={(e) => updateUrl(e.target.value)}
                placeholder="https://your-kiosk-address/"
                aria-invalid={!url}
                className={`font-adm-mono min-w-0 flex-1 ${admInputClass}`}
              />
              <AdmButton type="button" variant="secondary" onClick={resetUrl}>
                Use this site
              </AdmButton>
            </div>
          </label>
          {!url && <p className="mt-2 text-base text-adm-bad md:text-sm">Enter a full web address starting with https:// or http://.</p>}
          {isLocal && (
            <p className="mt-2 rounded-[5px] border border-adm-warn bg-adm-warn-soft p-2.5 text-base text-adm-ink md:text-sm">
              This address only works on this computer, so a phone that scans it won&apos;t open the kiosk. Print the poster from the
              deployed site, or enter the address customers&apos; phones can reach.
            </p>
          )}
        </div>
      </Card>

      <div className="flex justify-center">
        <div
          id="kiosk-qr-poster"
          className="flex w-full max-w-[420px] flex-col items-center gap-4 rounded-[10px] border border-adm-line bg-white px-6 py-8 text-center text-[#1c1b18] shadow-sm"
        >
          <Image src="/logo.jpg" alt="" width={80} height={80} className="h-20 w-20 rounded-[50%_50%_50%_12px] object-cover" />
          <div>
            <div className="text-[26px] leading-tight font-bold tracking-tight">Zak&apos;s Sizzling Hub</div>
            <div className="mt-1 text-[15px] text-[#5a5750]">Skip the line. Order from your phone.</div>
          </div>
          <div className="text-[30px] leading-none font-extrabold tracking-tight text-[#b5502a]">Scan to order</div>
          {shownQr ? (
            <Image
              src={shownQr.dataUrl}
              alt={`QR code that opens ${shownQr.url}`}
              width={300}
              height={300}
              unoptimized
              className="aspect-square w-full max-w-[300px]"
            />
          ) : (
            <div className="flex aspect-square w-full max-w-[300px] items-center justify-center rounded-[6px] border border-dashed border-adm-line text-sm text-adm-ink-3">
              {url ? "Making the code…" : "Enter a valid address"}
            </div>
          )}
          <ol className="w-full max-w-[300px] space-y-1.5 text-left text-[15px]">
            <li>
              <b>1.</b> Point your phone camera at the code.
            </li>
            <li>
              <b>2.</b> Choose your meal on the menu that opens.
            </li>
            <li>
              <b>3.</b> Pay at the counter, or online with GCash or Maya.
            </li>
          </ol>
          {shownQr && <div className="font-adm-mono max-w-full text-[12px] break-all text-[#5a5750]">{shownQr.url}</div>}
        </div>
      </div>
    </div>
  );
}
