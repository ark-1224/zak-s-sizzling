"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { downloadAuthenticated } from "@/lib/download";
import { PageHeader, Card, AdmButton, StatusPill } from "@/components/admin/ui";
import type { BulkImportSummary } from "@zaks/shared-types";

type Template = "xlsx" | "products" | "recipes";
type TableName = "products" | "recipes";

/** Must match MAX_XLSX_BYTES in the API's products/xlsxImport.ts. */
const MAX_XLSX_BYTES = 2 * 1024 * 1024;

const PRODUCT_HEADERS = "name,category,price,cost,description";
const RECIPE_HEADERS = "product,rawMaterial,qtyPerServing";

const isExcel = (name: string) => /\.xlsx$/i.test(name);

/** A CSV file whose header names product, raw material and amount is a Recipes table. */
function looksLikeRecipes(csv: string): boolean {
  const header = (csv.split(/\r?\n/, 1)[0] ?? "").toLowerCase().replace(/[\s_"-]+/g, "");
  return header.includes("rawmaterial") && header.includes("qtyperserving");
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // In chunks: spreading a whole file into one call overflows the call stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const rowsIn = (csv: string) => (csv ? csv.split(/\r?\n/).filter((l) => l.trim()).length - 1 : 0);

interface ConvertedTable {
  sheetName: string;
  csvText: string;
  rows: number;
  ignoredColumns: string[];
}

// Bulk import of dishes and their bills of materials, per the manuscript's Product
// Management requirement ("bulk product import through CSV or Excel file uploads").
// Every dish's stock comes from its recipe (panel feedback), so an import has two tables:
//   - Products: name, category, price, cost, description
//   - Recipes: product, rawMaterial, qtyPerServing (one row per raw material of a dish)
// An Excel workbook holds both as sheets; the server turns them into CSV
// (POST /api/products/import-xlsx) and they load into the two boxes below, where a row
// can still be fixed. A CSV file goes into the box its header matches.
//
// Dishes are matched by name: a name that matches an existing product updates it,
// otherwise a new product is created, and a new dish needs its recipe in the same import.
// Recipe rows replace a dish's whole recipe.
//
// Before anything is saved, the server checks every row (a dry run of the same import)
// and the page shows what each row will do, with the reason for any error. Import stays
// disabled until no row has an error (UI review #21).
export default function BulkImportPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  // For an Excel file: which sheets were read, and any columns that were left out.
  const [sheetNote, setSheetNote] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [fileEdited, setFileEdited] = useState(false);
  const [productsCsv, setProductsCsv] = useState("");
  const [recipesCsv, setRecipesCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<BulkImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Each preview remembers the texts it was made for, so an edit never shows a stale one.
  const [preview, setPreview] = useState<{ key: string; summary: BulkImportSummary } | null>(null);
  const [previewError, setPreviewError] = useState<{ key: string; message: string } | null>(null);
  const [importedKey, setImportedKey] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<Template | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const products = productsCsv.trim();
  const recipes = recipesCsv.trim();
  const key = `${products}\u0000${recipes}`;
  const hasInput = Boolean(products || recipes);
  const currentPreview = preview && preview.key === key ? preview.summary : null;
  const currentPreviewError = previewError && previewError.key === key ? previewError.message : null;
  const checking = hasInput && !currentPreview && !currentPreviewError;
  const alreadyImported = importedKey === key;

  // Check the rows shortly after a table is loaded or edited (a dry run: nothing is saved).
  useEffect(() => {
    if (!products && !recipes) return;
    let cancelled = false;
    const requestKey = `${products}\u0000${recipes}`;
    const timer = setTimeout(() => {
      apiFetch<BulkImportSummary>("/api/products/bulk-import", {
        method: "POST",
        auth: "staff",
        body: JSON.stringify({ csvText: products, recipesCsvText: recipes, dryRun: true }),
      })
        .then((result) => {
          if (!cancelled) setPreview({ key: requestKey, summary: result });
        })
        .catch((err) => {
          if (!cancelled) setPreviewError({ key: requestKey, message: err instanceof ApiError ? err.message : "Couldn't check the file." });
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [products, recipes]);

  function loaded(name: string, note: string | null) {
    setFileName(name);
    setSheetNote(note);
    setFileEdited(false);
    setSummary(null);
  }

  // A file that can't be used only shows why; whatever was loaded before stays as it was.
  async function handleFile(file: File) {
    setError(null);
    if (/\.xls$/i.test(file.name)) {
      setError("That's an older Excel file (.xls). In Excel, use Save As → Excel Workbook (.xlsx), or save it as CSV.");
      return;
    }
    if (!isExcel(file.name)) {
      const text = await file.text();
      if (looksLikeRecipes(text)) {
        setRecipesCsv(text);
        loaded(file.name, "Loaded as the Recipes table");
      } else {
        setProductsCsv(text);
        loaded(file.name, "Loaded as the Products table");
      }
      return;
    }
    if (file.size > MAX_XLSX_BYTES) {
      setError("That Excel file is larger than 2 MB. Split it into smaller files.");
      return;
    }
    setReading(true);
    try {
      const converted = await apiFetch<ConvertedTable & { recipes: ConvertedTable | null }>("/api/products/import-xlsx", {
        method: "POST",
        auth: "staff",
        body: JSON.stringify({ fileBase64: toBase64(await file.arrayBuffer()) }),
      });
      setProductsCsv(converted.csvText);
      setRecipesCsv(converted.recipes?.csvText ?? "");
      const notes = [converted, converted.recipes]
        .filter((t): t is ConvertedTable => Boolean(t && t.rows > 0))
        .map(
          (t) =>
            `"${t.sheetName}" (${t.rows} row${t.rows !== 1 ? "s" : ""}${t.ignoredColumns.length ? `; left out: ${t.ignoredColumns.join(", ")}` : ""})`
        );
      loaded(file.name, `Read from ${notes.join(" and ")}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't read the Excel file.");
    } finally {
      setReading(false);
    }
  }

  // A failed download used to do nothing visible; now it says why (UI review #12).
  async function handleDownloadTemplate(template: Template) {
    setDownloading(template);
    setDownloadError(null);
    try {
      if (template === "xlsx") await downloadAuthenticated("/api/products/import-template?format=xlsx", "product_import_template.xlsx");
      else if (template === "recipes") await downloadAuthenticated("/api/products/import-template?type=recipes", "recipe_import_template.csv");
      else await downloadAuthenticated("/api/products/import-template", "product_import_template.csv");
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "The download failed. Try again.");
    } finally {
      setDownloading(null);
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
        body: JSON.stringify({ csvText: products, recipesCsvText: recipes }),
      });
      setSummary(result);
      setImportedKey(key);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  function edit(table: TableName, value: string) {
    if (table === "products") setProductsCsv(value);
    else setRecipesCsv(value);
    if (fileName) setFileEdited(true);
    setSummary(null);
  }

  function clearAll() {
    setProductsCsv("");
    setRecipesCsv("");
    setFileName(null);
    setSheetNote(null);
    setFileEdited(false);
    setSummary(null);
    setError(null);
  }

  const productRows = currentPreview?.total ?? rowsIn(products);
  const recipeRows = currentPreview?.recipes.total ?? rowsIn(recipes);
  const canImport = Boolean(currentPreview) && currentPreview!.errors === 0 && !importing && !alreadyImported;
  const sourceLabel = fileName ? (fileEdited ? `${fileName} (edited)` : fileName) : hasInput ? "Pasted CSV" : "No file selected";

  return (
    <div className="flex flex-col gap-4.5">
      <PageHeader eyebrow="Bulk product import" title="Import from CSV or Excel" />

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
                <span className="font-adm-mono text-xs">{fileName && isExcel(fileName) ? "XLSX" : "CSV"}</span>
              </div>
              <div className="min-w-0 flex-1 basis-40">
                <div className="text-base font-medium break-all md:text-sm">{sourceLabel}</div>
                <div className="font-adm-mono mt-1 text-sm text-adm-ink-3">
                  {reading
                    ? "Reading the Excel file…"
                    : hasInput
                      ? `${productRows} dish${productRows !== 1 ? "es" : ""} · ${recipeRows} recipe row${recipeRows !== 1 ? "s" : ""}`
                      : "Drop an Excel (.xlsx) or CSV file here, browse, or paste CSV below"}
                </div>
                {sheetNote && hasInput && <div className="mt-1 text-sm text-adm-ink-3">{sheetNote}</div>}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFile(e.target.files[0]);
                  e.target.value = ""; // so choosing the same file again still loads it
                }}
              />
              {hasInput && (
                <AdmButton variant="secondary" className="w-full sm:w-auto" onClick={clearAll}>
                  Clear
                </AdmButton>
              )}
              <AdmButton variant="secondary" className="w-full sm:w-auto" disabled={reading} onClick={() => fileInputRef.current?.click()}>
                Browse file
              </AdmButton>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4.5 xl:grid-cols-2">
            <Card title="Products">
              <textarea
                value={productsCsv}
                onChange={(e) => edit("products", e.target.value)}
                aria-label="Products CSV"
                placeholder={PRODUCT_HEADERS}
                className="font-adm-mono h-40 w-full resize-none bg-adm-bg p-4 text-base md:text-sm"
              />
            </Card>
            <Card title="Recipes (bill of materials)">
              <textarea
                value={recipesCsv}
                onChange={(e) => edit("recipes", e.target.value)}
                aria-label="Recipes CSV"
                placeholder={RECIPE_HEADERS}
                className="font-adm-mono h-40 w-full resize-none bg-adm-bg p-4 text-base md:text-sm"
              />
            </Card>
          </div>

          {error && <div className="text-base text-adm-bad md:text-sm">{error}</div>}

          {hasInput && !alreadyImported && (
            <Card title="Preview — nothing is saved until you press Import">
              {checking ? (
                <div className="p-4 text-base text-adm-ink-3 md:text-sm">Checking rows…</div>
              ) : currentPreviewError ? (
                <div className="p-4 text-base text-adm-bad md:text-sm">{currentPreviewError}</div>
              ) : (
                currentPreview && <PreviewTables summary={currentPreview} />
              )}
            </Card>
          )}

          {summary && (
            <Card title="Import result">
              <div className="flex flex-wrap gap-2 border-b border-adm-line p-4 md:gap-4">
                <StatusPill tone="ok">{summary.created} CREATED</StatusPill>
                <StatusPill tone="warn">{summary.updated} UPDATED</StatusPill>
                <StatusPill tone="ok">
                  {summary.recipes.dishes} RECIPE{summary.recipes.dishes !== 1 ? "S" : ""} SET
                </StatusPill>
                <StatusPill tone="bad">{summary.errors} ERRORS</StatusPill>
              </div>
              {summary.errors > 0 && <PreviewTables summary={summary} errorsOnly />}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4.5">
          <Card title="Template">
            <div className="p-4">
              <p className="mb-2 text-base leading-relaxed text-adm-ink-3 md:text-sm">
                <strong>Products</strong>: name, category (an existing category), price; optional cost and description.
              </p>
              <p className="mb-3 text-base leading-relaxed text-adm-ink-3 md:text-sm">
                <strong>Recipes</strong>: product, rawMaterial (an existing raw material), qtyPerServing (in its unit: g, ml or pc).
                One row per raw material of a dish.
              </p>
              <p className="mb-2 text-base leading-relaxed text-adm-ink-3 md:text-sm">
                The Excel template holds both sheets, with lists of your categories and raw materials to pick from.
              </p>
              <div className="flex flex-col items-start gap-1 md:gap-2">
                {(
                  [
                    ["xlsx", "product_import_template.xlsx"],
                    ["products", "product_import_template.csv"],
                    ["recipes", "recipe_import_template.csv"],
                  ] as const
                ).map(([template, label]) => (
                  <button
                    key={template}
                    onClick={() => handleDownloadTemplate(template)}
                    disabled={downloading !== null}
                    className="font-adm-mono inline-flex min-h-11 items-center text-left text-sm font-medium break-all text-adm-accent disabled:opacity-60 md:min-h-0 md:text-sm"
                  >
                    {downloading === template ? "Downloading…" : `${label} ↓`}
                  </button>
                ))}
              </div>
              {downloadError && (
                <p role="alert" className="mt-2 text-base text-adm-bad md:text-sm">
                  {downloadError}
                </p>
              )}
            </div>
          </Card>
          <Card title="How matching works">
            <div className="flex flex-col gap-2 p-4 text-base leading-relaxed text-adm-ink-3 md:text-sm">
              <p>A dish whose name matches an existing product (ignoring capitals) updates it. Any other name adds a new dish.</p>
              <p>
                Every dish&apos;s stock comes from its recipe, so a new dish needs its rows in Recipes. Recipe rows replace that
                dish&apos;s whole recipe, and can update a dish already on the menu without listing it in Products.
              </p>
              <p>
                Items in the Ready-made category (bottled drinks) are counted in pieces, so they take no recipe. They start at 0
                pieces: restock them on Raw materials &rsaquo; Ready-made.
              </p>
            </div>
          </Card>
          <AdmButton variant="primary" size="large" disabled={!canImport} onClick={handleImport}>
            {importing ? "Importing…" : alreadyImported ? "Imported" : checking ? "Checking rows…" : "Import"}
          </AdmButton>
          {currentPreview && currentPreview.errors > 0 && !alreadyImported && (
            <p className="-mt-2 text-base text-adm-ink-3 md:text-sm">Import turns on once no row has an error.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** What each row of both tables will do (or did), with the reason for any error. */
function PreviewTables({ summary, errorsOnly = false }: { summary: BulkImportSummary; errorsOnly?: boolean }) {
  const products = errorsOnly ? summary.results.filter((r) => r.status === "error") : summary.results;
  const recipes = errorsOnly ? summary.recipes.results.filter((r) => r.status === "error") : summary.recipes.results;

  return (
    <>
      {!errorsOnly && (
        <div className="flex flex-wrap items-center gap-2 border-b border-adm-line p-4 md:gap-4">
          <StatusPill tone="ok">{summary.created} NEW</StatusPill>
          <StatusPill tone="warn">{summary.updated} UPDATE</StatusPill>
          <StatusPill tone="ok">
            {summary.recipes.dishes} RECIPE{summary.recipes.dishes !== 1 ? "S" : ""}
          </StatusPill>
          <StatusPill tone="bad">
            {summary.errors} ERROR{summary.errors !== 1 ? "S" : ""}
          </StatusPill>
          {summary.warnings > 0 && (
            <StatusPill tone="warn">
              {summary.warnings} WARNING{summary.warnings !== 1 ? "S" : ""}
            </StatusPill>
          )}
          <span className="text-base text-adm-ink-2 md:text-sm">
            {summary.errors > 0
              ? `Fix the ${summary.errors} row${summary.errors !== 1 ? "s" : ""} marked ERROR, in the boxes above or in your file, and the preview updates.`
              : summary.warnings > 0
                ? `All rows can be imported. Check the ${summary.warnings} row${summary.warnings !== 1 ? "s" : ""} with a warning first.`
                : "All rows are ready to import."}
          </span>
        </div>
      )}
      {products.length > 0 && (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-base md:text-sm">
            <caption className="px-4.5 pt-3 pb-1 text-left text-xs font-medium tracking-[.07em] text-adm-ink-3 uppercase">Products</caption>
            <thead>
              <tr className="text-left text-xs tracking-[.07em] text-adm-ink-3 uppercase">
                <th className="px-4.5 py-2 font-medium">Row</th>
                <th className="px-3 py-2 font-medium">Dish</th>
                <th className="px-3 py-2 font-medium">Will</th>
                <th className="px-4.5 py-2 font-medium">Problem or warning</th>
              </tr>
            </thead>
            <tbody>
              {products.map((r) => (
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
                  <td className={`px-4.5 py-2 ${r.message ? "text-adm-bad" : "text-adm-warn"}`}>{r.message ?? (r.warning ? `Warning: ${r.warning}` : "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {recipes.length > 0 && (
        <div className="max-h-72 overflow-auto border-t border-adm-line">
          <table className="w-full text-base md:text-sm">
            <caption className="px-4.5 pt-3 pb-1 text-left text-xs font-medium tracking-[.07em] text-adm-ink-3 uppercase">Recipes</caption>
            <thead>
              <tr className="text-left text-xs tracking-[.07em] text-adm-ink-3 uppercase">
                <th className="px-4.5 py-2 font-medium">Row</th>
                <th className="px-3 py-2 font-medium">Dish</th>
                <th className="px-3 py-2 font-medium">Raw material</th>
                <th className="px-4.5 py-2 font-medium">Problem or warning</th>
              </tr>
            </thead>
            <tbody>
              {recipes.map((r) => (
                <tr key={r.row} className={`border-t border-adm-line-soft ${r.status === "error" ? "bg-adm-bad-soft" : ""}`}>
                  <td className="font-adm-mono px-4.5 py-2">{r.row}</td>
                  <td className="px-3 py-2 break-words">{r.product ?? "—"}</td>
                  <td className="px-3 py-2 break-words">{r.rawMaterial ?? "—"}</td>
                  <td className={`px-4.5 py-2 ${r.message ? "text-adm-bad" : "text-adm-warn"}`}>{r.message ?? (r.warning ? `Warning: ${r.warning}` : "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
