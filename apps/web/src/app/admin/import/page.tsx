"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { downloadAuthenticated } from "@/lib/download";
import { PageHeader, Card, AdmButton, StatusPill } from "@/components/admin/ui";
import type { BulkImportSummary } from "@zaks/shared-types";

// Bulk CSV product import, per the manuscript's Product Management requirement
// ("bulk product import through CSV or Excel file uploads, reducing the need for
// manual data entry"). Matching is by barcode: a row whose barcode matches an
// existing product updates it, otherwise a new product is created — there's no
// spreadsheet column-mapping UI here (that's a much bigger feature); the fixed
// header set is documented via the downloadable template.
//
// Before anything is saved, the server checks every row (a dry run of the same import)
// and the page shows what each row will do, with the reason for any error. Import stays
// disabled until the file has no errors (UI review #21).
export default function BulkImportPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  // True once a loaded file's text is changed in the box below, so the card says so.
  const [fileEdited, setFileEdited] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<BulkImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Each preview remembers the text it was made for, so an edit never shows a stale one.
  const [preview, setPreview] = useState<{ text: string; summary: BulkImportSummary } | null>(null);
  const [previewError, setPreviewError] = useState<{ text: string; message: string } | null>(null);
  const [importedText, setImportedText] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const text = csvText.trim();
  const currentPreview = preview && preview.text === text ? preview.summary : null;
  const currentPreviewError = previewError && previewError.text === text ? previewError.message : null;
  const checking = Boolean(text) && !currentPreview && !currentPreviewError;
  const alreadyImported = importedText === text;

  // Check the rows shortly after the CSV is loaded or edited (a dry run: nothing is saved).
  useEffect(() => {
    if (!text) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      apiFetch<BulkImportSummary>("/api/products/bulk-import", {
        method: "POST",
        auth: "staff",
        body: JSON.stringify({ csvText: text, dryRun: true }),
      })
        .then((summary) => {
          if (!cancelled) setPreview({ text, summary });
        })
        .catch((err) => {
          if (!cancelled) setPreviewError({ text, message: err instanceof ApiError ? err.message : "Couldn't check the file." });
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);

  function handleFile(file: File) {
    setFileName(file.name);
    setFileEdited(false);
    setSummary(null);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  // A failed download used to do nothing visible; now it says why (UI review #12).
  async function handleDownloadTemplate() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadAuthenticated("/api/products/import-template", "product_import_template.csv");
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "The download failed. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleImport() {
    setImporting(true);
    setError(null);
    setSummary(null);
    try {
      const result = await apiFetch<BulkImportSummary>("/api/products/bulk-import", {
        method: "POST",
        auth: "staff",
        body: JSON.stringify({ csvText: text }),
      });
      setSummary(result);
      setImportedText(text);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  const rowCount = currentPreview?.total ?? (text ? text.split("\n").length - 1 : 0);
  const canImport = Boolean(currentPreview) && currentPreview!.errors === 0 && !importing && !alreadyImported;

  // The file card describes whatever is in the box, whether it came from a file or was
  // pasted, so pasted CSV no longer shows "No file selected · 0 KB" (UI review #21).
  const sourceLabel = fileName ? (fileEdited ? `${fileName} (edited)` : fileName) : text ? "Pasted CSV" : "No file selected";
  const bytes = new TextEncoder().encode(csvText).length;
  const sizeLabel = bytes < 1024 ? `${bytes} byte${bytes !== 1 ? "s" : ""}` : `${(bytes / 1024).toFixed(1)} KB`;

  function clearCsv() {
    setCsvText("");
    setFileName(null);
    setFileEdited(false);
    setSummary(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-4.5">
      <PageHeader eyebrow="Bulk product import" title="Import from CSV" />

      <div className="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4.5">
          <Card>
            <div
              className="flex flex-wrap items-center gap-4 border-2 border-dashed border-adm-line p-4 md:p-5.5"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
              }}
            >
              <div className="flex h-10.5 w-10.5 flex-shrink-0 items-center justify-center rounded-[5px] border border-adm-accent text-adm-accent">
                <span className="font-adm-mono text-xs md:text-[10px]">CSV</span>
              </div>
              <div className="min-w-0 flex-1 basis-40">
                <div className="text-base font-medium break-all md:text-[13.5px]">{sourceLabel}</div>
                <div className="font-adm-mono mt-1 text-sm text-adm-ink-3 md:text-[11px]">
                  {text ? `${sizeLabel} · ${rowCount} row${rowCount !== 1 ? "s" : ""}` : "Drop a CSV here, browse, or paste below"}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFile(e.target.files[0]);
                  e.target.value = ""; // so choosing the same file again still loads it
                }}
              />
              {text && (
                <AdmButton variant="secondary" className="w-full sm:w-auto" onClick={clearCsv}>
                  Clear
                </AdmButton>
              )}
              <AdmButton variant="secondary" className="w-full sm:w-auto" onClick={() => fileInputRef.current?.click()}>
                Browse file
              </AdmButton>
            </div>
          </Card>

          <Card title="Or paste CSV directly">
            <textarea
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                if (fileName) setFileEdited(true);
                setSummary(null);
              }}
              aria-label="CSV contents"
              placeholder={"name,barcode,category,price,cost,stockQty,minStockThreshold,description"}
              className="font-adm-mono h-40 w-full resize-none bg-adm-bg p-4 text-base md:text-[12px]"
            />
          </Card>

          {error && <div className="text-base text-adm-bad md:text-sm">{error}</div>}

          {text && !alreadyImported && (
            <Card title="Preview — nothing is saved until you press Import">
              {checking ? (
                <div className="p-4 text-base text-adm-ink-3 md:text-sm">Checking rows…</div>
              ) : currentPreviewError ? (
                <div className="p-4 text-base text-adm-bad md:text-sm">{currentPreviewError}</div>
              ) : (
                currentPreview && (
                  <>
                    <div className="flex flex-wrap items-center gap-2 border-b border-adm-line p-4 md:gap-4">
                      <StatusPill tone="ok">{currentPreview.created} NEW</StatusPill>
                      <StatusPill tone="warn">{currentPreview.updated} UPDATE</StatusPill>
                      <StatusPill tone="bad">{currentPreview.errors} ERROR{currentPreview.errors !== 1 ? "S" : ""}</StatusPill>
                      <span className="text-base text-adm-ink-2 md:text-sm">
                        {currentPreview.errors > 0
                          ? `Fix the ${currentPreview.errors} row${currentPreview.errors !== 1 ? "s" : ""} marked ERROR, in the box above or in your file, and the preview updates.`
                          : "All rows are ready to import."}
                      </span>
                    </div>
                    <div className="max-h-80 overflow-auto">
                      <table className="w-full text-base md:text-sm">
                        <thead>
                          <tr className="text-left text-[10.5px] tracking-[.07em] text-adm-ink-3 uppercase">
                            <th className="px-4.5 py-2 font-medium">Row</th>
                            <th className="px-3 py-2 font-medium">Name</th>
                            <th className="px-3 py-2 font-medium">Will</th>
                            <th className="px-4.5 py-2 font-medium">Problem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentPreview.results.map((r) => (
                            <tr key={r.row} className={`border-t border-adm-line-soft ${r.status === "error" ? "bg-adm-bad-soft" : ""}`}>
                              <td className="font-adm-mono px-4.5 py-2">{r.row}</td>
                              <td className="px-3 py-2 break-words">{r.name ?? "—"}</td>
                              <td className="px-3 py-2">
                                {r.status === "error" ? (
                                  <StatusPill tone="bad">ERROR</StatusPill>
                                ) : r.status === "updated" ? (
                                  <StatusPill tone="warn">UPDATE</StatusPill>
                                ) : (
                                  <StatusPill tone="ok">NEW</StatusPill>
                                )}
                              </td>
                              <td className="px-4.5 py-2 text-adm-bad">{r.message ?? ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              )}
            </Card>
          )}

          {summary && (
            <Card title={`Import result — ${summary.total} row${summary.total !== 1 ? "s" : ""} processed`}>
              <div className="flex flex-wrap gap-2 border-b border-adm-line p-4 md:gap-4">
                <StatusPill tone="ok">{summary.created} CREATED</StatusPill>
                <StatusPill tone="warn">{summary.updated} UPDATED</StatusPill>
                <StatusPill tone="bad">{summary.errors} ERRORS</StatusPill>
              </div>
              {summary.results.filter((r) => r.status === "error").length > 0 && (
                <div className="max-h-64 overflow-auto">
                  <table className="w-full text-base md:text-sm">
                    <thead>
                      <tr className="text-left text-[10.5px] tracking-[.07em] text-adm-ink-3 uppercase">
                        <th className="px-4.5 py-2 font-medium">Row</th>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-4.5 py-2 font-medium">Problem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.results
                        .filter((r) => r.status === "error")
                        .map((r) => (
                          <tr key={r.row} className="border-t border-adm-line-soft">
                            <td className="font-adm-mono px-4.5 py-2">{r.row}</td>
                            <td className="px-3 py-2">{r.name ?? "—"}</td>
                            <td className="px-4.5 py-2 text-adm-bad">{r.message}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4.5">
          <Card title="Template">
            <div className="p-4">
              <p className="mb-3 text-base leading-relaxed text-adm-ink-3 md:text-[11.5px]">
                Required columns: <strong>name</strong>, <strong>category</strong> (must match an existing category
                name), <strong>price</strong>. Optional: barcode, cost, stockQty, minStockThreshold, description.
              </p>
              <button
                onClick={handleDownloadTemplate}
                disabled={downloading}
                className="font-adm-mono inline-flex min-h-11 items-center text-left text-sm font-medium break-all text-adm-accent disabled:opacity-60 md:min-h-0 md:text-[12px]"
              >
                {downloading ? "Downloading…" : "product_import_template.csv ↓"}
              </button>
              {downloadError && (
                <p role="alert" className="mt-2 text-base text-adm-bad md:text-[12px]">
                  {downloadError}
                </p>
              )}
            </div>
          </Card>
          <Card title="How matching works">
            <p className="p-4 text-base leading-relaxed text-adm-ink-3 md:text-[11.5px]">
              A row with a barcode that matches an existing product updates it. A row with no barcode, or a barcode
              that doesn&apos;t match anything, creates a new product.
            </p>
          </Card>
          <AdmButton variant="primary" size="large" disabled={!canImport} onClick={handleImport}>
            {importing
              ? "Importing…"
              : alreadyImported
                ? "Imported"
                : checking
                  ? "Checking rows…"
                  : `Import ${rowCount || ""} row${rowCount !== 1 ? "s" : ""}`}
          </AdmButton>
          {currentPreview && currentPreview.errors > 0 && !alreadyImported && (
            <p className="-mt-2 text-base text-adm-ink-3 md:text-[11.5px]">Import turns on once no row has an error.</p>
          )}
        </div>
      </div>
    </div>
  );
}
