"use client";

import { useRef, useState } from "react";
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
export default function BulkImportPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<BulkImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setFileName(file.name);
    setSummary(null);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function handleImport() {
    setImporting(true);
    setError(null);
    setSummary(null);
    try {
      const result = await apiFetch<BulkImportSummary>("/api/products/bulk-import", {
        method: "POST",
        auth: "staff",
        body: JSON.stringify({ csvText }),
      });
      setSummary(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  const rowCount = csvText.trim() ? csvText.trim().split("\n").length - 1 : 0;

  return (
    <div className="flex flex-col gap-4.5">
      <PageHeader eyebrow="Bulk product import" title="Import from CSV" />

      <div className="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4.5">
          <Card>
            <div
              className="flex flex-wrap items-center gap-4 border-2 border-dashed border-adm-line p-5.5"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
              }}
            >
              <div className="flex h-10.5 w-10.5 flex-shrink-0 items-center justify-center rounded-[5px] border border-adm-accent text-adm-accent">
                <span className="font-adm-mono text-[10px]">CSV</span>
              </div>
              <div className="min-w-45 flex-1">
                <div className="text-[13.5px] font-medium">{fileName ?? "No file selected"}</div>
                <div className="font-adm-mono mt-1 text-[11px] text-adm-ink-3">
                  {csvText ? `${(csvText.length / 1024).toFixed(0)} KB · ${rowCount} rows` : "Drop a CSV here, or browse"}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <AdmButton variant="secondary" onClick={() => fileInputRef.current?.click()}>
                Browse file
              </AdmButton>
            </div>
          </Card>

          <Card title="Or paste CSV directly">
            <textarea
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setFileName(null);
                setSummary(null);
              }}
              placeholder={"name,barcode,category,price,cost,stockQty,minStockThreshold,description"}
              className="font-adm-mono h-40 w-full resize-none bg-adm-bg p-4 text-[12px] outline-none"
            />
          </Card>

          {error && <div className="text-sm text-adm-bad">{error}</div>}

          {summary && (
            <Card title={`Import result — ${summary.total} row${summary.total !== 1 ? "s" : ""} processed`}>
              <div className="flex gap-4 border-b border-adm-line p-4">
                <StatusPill tone="ok">{summary.created} CREATED</StatusPill>
                <StatusPill tone="warn">{summary.updated} UPDATED</StatusPill>
                <StatusPill tone="bad">{summary.errors} ERRORS</StatusPill>
              </div>
              {summary.results.filter((r) => r.status === "error").length > 0 && (
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
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
              <p className="mb-3 text-[11.5px] leading-relaxed text-adm-ink-3">
                Required columns: <strong>name</strong>, <strong>category</strong> (must match an existing category
                name), <strong>price</strong>. Optional: barcode, cost, stockQty, minStockThreshold, description.
              </p>
              <button
                onClick={() => downloadAuthenticated("/api/products/import-template", "product_import_template.csv")}
                className="font-adm-mono text-[12px] font-medium text-adm-accent"
              >
                product_import_template.csv ↓
              </button>
            </div>
          </Card>
          <Card title="How matching works">
            <p className="p-4 text-[11.5px] leading-relaxed text-adm-ink-3">
              A row with a barcode that matches an existing product updates it. A row with no barcode, or a barcode
              that doesn&apos;t match anything, creates a new product.
            </p>
          </Card>
          <AdmButton variant="primary" disabled={!csvText.trim() || importing} onClick={handleImport} className="py-2.75">
            {importing ? "Importing…" : `Import ${rowCount || ""} row${rowCount !== 1 ? "s" : ""}`}
          </AdmButton>
        </div>
      </div>
    </div>
  );
}
