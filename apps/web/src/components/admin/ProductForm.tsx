"use client";

import { useEffect, useRef, useState } from "react";
import { ProductDetailsFields, type NutritionText } from "@/components/admin/ProductDetailsFields";
import { apiFetch, apiUrl, ApiError } from "@/lib/api-client";
import { ImageResizeError, resizeProductPhoto, type ResizedImage } from "@/lib/imageResize";
import { instructionChipsFor } from "@/lib/instructionChips";
import { AdmButton, admInputClass, admLabelClass, admModalActionsClass, admModalBackdropClass, admModalPanelClass } from "./ui";
import { formatMaterialQty } from "@/lib/units";
import type { Category, Product, RawMaterialDTO } from "@zaks/shared-types";

// Add/Edit Product modal: name, category, price, cost (for the profitability analysis),
// description, and the dish's bill of materials. Every dish's stock comes from its
// recipe of raw materials (panel feedback; docs/design/raw-material-stock.md), so the
// recipe is required and there's no stock count of its own. The exception is the
// built-in Ready-made category (bottled drinks sold as they are): those items have no
// recipe and are counted in pieces, with a minimum. The special-instruction options the
// kiosk offers are set per product here too.

type FieldKey = "name" | "price" | "cost" | "prepMinutes" | "stockQty" | "minStockThreshold" | "recipe" | "instructions";
type FieldErrors = Partial<Record<FieldKey, string>>;

// The order the fields appear in, so focus goes to the first problem on the form.
const FIELD_ORDER: FieldKey[] = ["name", "price", "cost", "prepMinutes", "stockQty", "minStockThreshold", "recipe", "instructions"];
const MAX_PREP_MINUTES = 120;
const MAX_PIECES = 100_000;
// Matches the API: up to 8 quick options of up to 30 characters each.
const MAX_OPTIONS = 8;
const MAX_OPTION_LENGTH = 30;

const isWholeNumber = (value: string) => /^\d+$/.test(value.trim());

// The photo is saved after the product itself (it needs the product's id): keep the
// current one, upload a new one, or remove it.
type PhotoChange = { kind: "keep" } | { kind: "new"; image: ResizedImage } | { kind: "remove" };

interface ProductFormProps {
  product: Product | null; // null = create mode
  categories: Category[];
  onClose: () => void;
  /** Called with the saved product; `created` is true for a new one. */
  onSaved: (saved: Product, created: boolean) => void;
}

export function ProductForm({ product, categories, onClose, onSaved }: ProductFormProps) {
  // The product as last saved here. A new product whose photo failed to upload is already
  // created, so saving again must update it rather than create a second one.
  const [savedProduct, setSavedProduct] = useState<Product | null>(product);
  const [photo, setPhoto] = useState<PhotoChange>({ kind: "keep" });
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? 0);
  const [price, setPrice] = useState(product?.price.toString() ?? "");
  const [cost, setCost] = useState(product?.cost?.toString() ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [icon, setIcon] = useState(product?.icon ?? "🍽️");
  const [prepMinutes, setPrepMinutes] = useState(product?.prepMinutes.toString() ?? "10");
  // A new dish starts with its category's usual options; editing them (or choosing a
  // category on an existing dish) leaves them as they are.
  const [instructionOptions, setInstructionOptions] = useState<string[]>(
    product?.instructionOptions ?? instructionChipsFor(categories.find((c) => c.id === (categories[0]?.id ?? 0))?.name)
  );
  const [optionsEdited, setOptionsEdited] = useState(Boolean(product));
  const [allowInstructions, setAllowInstructions] = useState(product?.allowInstructions ?? true);
  const [recipe, setRecipe] = useState<{ rawMaterialId: string; qty: string }[]>(
    product?.recipe?.map((r) => ({ rawMaterialId: r.rawMaterialId, qty: String(r.qtyPerServing) })) ?? []
  );
  // Ready-made items only: pieces on hand and the minimum before it needs restocking.
  const countedInPieces = product?.tracking === "unit";
  const initialPieces = countedInPieces ? String(product?.stockQty ?? 0) : "0";
  const [pieces, setPieces] = useState(initialPieces);
  const [minPieces, setMinPieces] = useState(countedInPieces ? String(product?.minStockThreshold ?? 0) : "0");
  const [materials, setMaterials] = useState<RawMaterialDTO[]>([]);
  const [ingredients, setIngredients] = useState<string[]>(product?.ingredients ?? []);
  const [allergens, setAllergens] = useState<string[]>(product?.allergens ?? []);
  const [nutrition, setNutrition] = useState<NutritionText>({
    calories: product?.nutrition.calories?.toString() ?? "",
    protein: product?.nutrition.protein?.toString() ?? "",
    carbs: product?.nutrition.carbs?.toString() ?? "",
    sugar: product?.nutrition.sugar?.toString() ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Free the preview's memory when it's replaced or the form closes.
  const previewUrl = photo.kind === "new" ? photo.image.previewUrl : null;
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handlePhotoChosen(file: File | undefined) {
    if (!file) return;
    setPhotoError(null);
    setPreparingPhoto(true);
    try {
      setPhoto({ kind: "new", image: await resizeProductPhoto(file) });
    } catch (err) {
      setPhotoError(err instanceof ImageResizeError ? err.message : "Could not prepare the photo.");
    } finally {
      setPreparingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = ""; // choosing the same file again still fires
    }
  }

  useEffect(() => {
    apiFetch<RawMaterialDTO[]>("/api/raw-materials", { auth: "staff" })
      .then(setMaterials)
      .catch(() => setMaterials([]));
  }, []);

  const readyMade = categories.find((c) => c.id === Number(categoryId))?.isReadyMade === true;
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const recipeValid = recipe.length > 0 && recipe.every((r) => r.rawMaterialId && Number(r.qty) > 0);
  // Servings the current stock can make with this recipe, limited by the scarcest ingredient.
  const servingsNow = recipeValid
    ? Math.min(...recipe.map((r) => Math.floor((materialById.get(r.rawMaterialId)?.stockQty ?? 0) / Number(r.qty))))
    : null;

  function clearError(key: FieldKey) {
    setFieldErrors((errors) => (errors[key] ? { ...errors, [key]: undefined } : errors));
  }

  function updateRecipeRow(index: number, patch: Partial<{ rawMaterialId: string; qty: string }>) {
    setRecipe((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    clearError("recipe");
  }

  // Checked here rather than by the browser, so each message sits under its own field in
  // plain words instead of a tooltip that disappears (UI review #18).
  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = "Enter the product's name.";
    if (price.trim() === "") errors.price = "Enter a price.";
    else if (!(Number(price) >= 0)) errors.price = "Enter a price of ₱0.00 or more.";
    if (cost.trim() !== "" && !(Number(cost) >= 0)) errors.cost = "Enter a cost of ₱0.00 or more, or leave it blank.";
    if (!isWholeNumber(prepMinutes) || Number(prepMinutes) > MAX_PREP_MINUTES) {
      errors.prepMinutes = `Enter whole minutes from 0 to ${MAX_PREP_MINUTES}.`;
    }
    if (readyMade) {
      if (!isWholeNumber(pieces) || Number(pieces) > MAX_PIECES) errors.stockQty = "Enter whole pieces from 0 to 100,000.";
      if (!isWholeNumber(minPieces) || Number(minPieces) > MAX_PIECES) errors.minStockThreshold = "Enter whole pieces from 0 to 100,000.";
    } else if (!recipeValid) {
      errors.recipe =
        recipe.length === 0
          ? "Add at least one raw material. Every dish's stock comes from its recipe."
          : "Choose a raw material and an amount per serving on every row, or remove the row.";
    }
    return errors;
  }

  // The recipe has no single control, so focus whatever needs filling in first.
  function focusField(key: FieldKey) {
    let id = `pf-${key}`;
    if (key === "instructions") id = "pf-option-new";
    if (key === "recipe") {
      const index = recipe.findIndex((r) => !r.rawMaterialId || !(Number(r.qty) > 0));
      id = index === -1 ? "pf-recipe-add" : recipe[index].rawMaterialId ? `pf-recipe-qty-${index}` : `pf-recipe-material-${index}`;
    }
    document.getElementById(id)?.focus();
  }

  /** id, invalid state and error link for a field's input. */
  function inputProps(key: FieldKey) {
    const invalid = Boolean(fieldErrors[key]);
    return {
      id: `pf-${key}`,
      "aria-invalid": invalid || undefined,
      "aria-describedby": invalid ? `pf-${key}-error` : undefined,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    const firstInvalid = FIELD_ORDER.find((key) => errors[key]);
    if (firstInvalid) {
      setError(null);
      focusField(firstInvalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        categoryId: Number(categoryId),
        price: Number(price),
        cost: cost === "" ? undefined : Number(cost),
        description: description || undefined,
        icon: icon || undefined,
        prepMinutes: Number(prepMinutes),
        // A ready-made item is counted in pieces; the count is sent only when it was
        // changed here, so a sale made while the form was open isn't written over.
        ...(readyMade
          ? {
              ...(pieces.trim() !== initialPieces || !countedInPieces ? { stockQty: Number(pieces) } : {}),
              minStockThreshold: Number(minPieces),
            }
          : { recipe: recipe.map((r) => ({ rawMaterialId: r.rawMaterialId, qtyPerServing: Number(r.qty) })) }),
        instructionOptions,
        allowInstructions,
        ingredients,
        allergens,
        // Blank = not known (the kiosk shows a dash).
        nutrition: {
          calories: nutrition.calories === "" ? null : Math.round(Number(nutrition.calories)),
          protein: nutrition.protein === "" ? null : Number(nutrition.protein),
          carbs: nutrition.carbs === "" ? null : Number(nutrition.carbs),
          sugar: nutrition.sugar === "" ? null : Number(nutrition.sugar),
        },
      };
      let saved = savedProduct
        ? await apiFetch<Product>(`/api/products/${savedProduct.id}`, { method: "PUT", auth: "staff", body: JSON.stringify(body) })
        : await apiFetch<Product>("/api/products", { method: "POST", auth: "staff", body: JSON.stringify(body) });
      setSavedProduct(saved);
      try {
        if (photo.kind === "new") {
          saved = await apiFetch<Product>(`/api/products/${saved.id}/image`, {
            method: "PUT",
            auth: "staff",
            body: JSON.stringify({ contentType: photo.image.contentType, imageBase64: photo.image.base64 }),
          });
        } else if (photo.kind === "remove") {
          saved = await apiFetch<Product>(`/api/products/${saved.id}/image`, { method: "DELETE", auth: "staff" });
        }
      } catch (err) {
        const reason = err instanceof ApiError ? err.message : "the server didn't respond";
        setError(`${saved.name} was saved, but the photo wasn't (${reason}). Save again to retry, or choose another photo.`);
        return;
      }
      onSaved(saved, !product);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={admModalBackdropClass}>
      <form onSubmit={handleSubmit} noValidate className={`${admModalPanelClass} max-w-lg`}>
        <div className="font-adm-mono mb-1 text-xs tracking-[.14em] text-adm-ink-3 uppercase">
          {product ? "Edit product" : "New product"}
        </div>
        <h2 className="mb-1 text-lg font-semibold tracking-tight break-words">{product ? product.name : "Add a product"}</h2>
        <p className="mb-5 text-sm text-adm-ink-3">
          Fields marked <span className="text-adm-bad">*</span> are required.
        </p>

        <Field label="Name" required error={fieldErrors.name} errorId="pf-name-error">
          <input
            {...inputProps("name")}
            aria-required
            maxLength={150}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearError("name");
            }}
            className={admInputClass}
          />
        </Field>

        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <Field label="Category" required>
            <select
              aria-required
              value={categoryId}
              onChange={(e) => {
                const next = Number(e.target.value);
                setCategoryId(next);
                if (!optionsEdited) setInstructionOptions(instructionChipsFor(categories.find((c) => c.id === next)?.name));
              }}
              className={admInputClass}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Icon (emoji)">
            <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} className={admInputClass} />
          </Field>
        </div>

        <PhotoField
          currentUrl={photo.kind === "new" ? photo.image.previewUrl : photo.kind === "keep" && savedProduct?.imageUrl ? apiUrl(savedProduct.imageUrl) : null}
          icon={icon}
          isNew={photo.kind === "new"}
          preparing={preparingPhoto}
          error={photoError}
          inputRef={photoInputRef}
          onChoose={handlePhotoChosen}
          onRemove={() => {
            setPhotoError(null);
            setPhoto(savedProduct?.imageUrl ? { kind: "remove" } : { kind: "keep" });
          }}
          onUndo={photo.kind !== "keep" ? () => setPhoto({ kind: "keep" }) : undefined}
        />

        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <Field label="Price (₱)" required error={fieldErrors.price} errorId="pf-price-error">
            <input
              {...inputProps("price")}
              aria-required
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                clearError("price");
              }}
              className={`font-adm-mono ${admInputClass}`}
            />
          </Field>
          <Field label="Cost (₱)" error={fieldErrors.cost} errorId="pf-cost-error">
            <input
              {...inputProps("cost")}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="Optional"
              value={cost}
              onChange={(e) => {
                setCost(e.target.value);
                clearError("cost");
              }}
              className={`font-adm-mono ${admInputClass}`}
            />
          </Field>
        </div>

        <Field label="Preparation time (minutes)" required error={fieldErrors.prepMinutes} errorId="pf-prepMinutes-error">
          <input
            {...inputProps("prepMinutes")}
            aria-required
            aria-describedby={fieldErrors.prepMinutes ? "pf-prepMinutes-error" : "pf-prepMinutes-hint"}
            type="number"
            inputMode="numeric"
            min="0"
            max={MAX_PREP_MINUTES}
            step="1"
            value={prepMinutes}
            onChange={(e) => {
              setPrepMinutes(e.target.value);
              clearError("prepMinutes");
            }}
            className={`font-adm-mono sm:max-w-40 ${admInputClass}`}
          />
          <span id="pf-prepMinutes-hint" className="mt-1 block text-sm text-adm-ink-3">
            For one serving. Use 0 for items served as they are, like bottled drinks. Orders use it to estimate when they&apos;ll
            be ready.
          </span>
        </Field>

        {readyMade ? (
          <div role="group" aria-labelledby="pf-pieces-label" className="mb-3 rounded-[6px] border border-adm-line-soft bg-adm-bg p-3">
            <span id="pf-pieces-label" className={admLabelClass}>
              Stock (counted in pieces)
            </span>
            <p className="mb-2 text-base text-adm-ink-2 md:text-sm">
              Ready-made items are sold as they are, so they have no recipe. Each order takes one piece, and the item shows as sold
              out at 0. Restock it on Raw materials &rsaquo; Ready-made.
            </p>
            {product?.recipe && product.recipe.length > 0 && (
              <p className="mb-2 text-base text-adm-warn md:text-sm">Saving removes this dish&apos;s recipe.</p>
            )}
            <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
              <Field label="Pieces on hand" required error={fieldErrors.stockQty} errorId="pf-stockQty-error">
                <input
                  {...inputProps("stockQty")}
                  aria-required
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={pieces}
                  onChange={(e) => {
                    setPieces(e.target.value);
                    clearError("stockQty");
                  }}
                  className={`font-adm-mono ${admInputClass}`}
                />
              </Field>
              <Field label="Minimum" required error={fieldErrors.minStockThreshold} errorId="pf-minStockThreshold-error">
                <input
                  {...inputProps("minStockThreshold")}
                  aria-required
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={minPieces}
                  onChange={(e) => {
                    setMinPieces(e.target.value);
                    clearError("minStockThreshold");
                  }}
                  className={`font-adm-mono ${admInputClass}`}
                />
              </Field>
            </div>
            <p className="text-sm text-adm-ink-3">At or below the minimum, it counts as needing restock on the dashboard.</p>
          </div>
        ) : (
          <div
            role="group"
            aria-labelledby="pf-recipe-label"
            aria-describedby={fieldErrors.recipe ? "pf-recipe-error" : undefined}
            className={`mb-3 rounded-[6px] border bg-adm-bg p-3 ${fieldErrors.recipe ? "border-adm-bad" : "border-adm-line-soft"}`}
          >
            <span id="pf-recipe-label" className={admLabelClass}>
              Recipe (bill of materials)
              <RequiredMark />
            </span>
            <p className="mb-2 text-base text-adm-ink-2 md:text-sm">
              Raw materials used by <strong>one serving</strong>. The dish&apos;s stock is the servings these can make: paying for an
              order deducts them, and the dish shows as sold out when they can&apos;t make another serving.
            </p>
            {recipe.map((row, index) => {
              const material = materialById.get(row.rawMaterialId);
              const choices = materials.filter((m) => m.isActive || m.id === row.rawMaterialId);
              const missingMaterial = Boolean(fieldErrors.recipe) && !row.rawMaterialId;
              const missingQty = Boolean(fieldErrors.recipe) && !(Number(row.qty) > 0);
              return (
                <div key={index} className="mb-2 grid grid-cols-[minmax(0,1fr)_6rem_1.75rem_auto] items-center gap-2">
                  <select
                    id={`pf-recipe-material-${index}`}
                    aria-invalid={missingMaterial || undefined}
                    value={row.rawMaterialId}
                    onChange={(e) => updateRecipeRow(index, { rawMaterialId: e.target.value })}
                    aria-label={`Raw material ${index + 1}`}
                    className={`min-w-0 ${admInputClass}`}
                  >
                    <option value="">Choose…</option>
                    {choices.map((m) => (
                      <option key={m.id} value={m.id} disabled={recipe.some((r, i) => i !== index && r.rawMaterialId === m.id)}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <input
                    id={`pf-recipe-qty-${index}`}
                    aria-invalid={missingQty || undefined}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={row.qty}
                    onChange={(e) => updateRecipeRow(index, { qty: e.target.value })}
                    aria-label={`Amount per serving ${index + 1}`}
                    placeholder="Amount"
                    className={`font-adm-mono min-w-0 ${admInputClass}`}
                  />
                  <span className="font-adm-mono text-sm text-adm-ink-3">{material?.unit ?? ""}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setRecipe((rows) => rows.filter((_, i) => i !== index));
                      clearError("recipe");
                    }}
                    aria-label={`Remove raw material ${index + 1}`}
                    className="h-11 w-11 rounded-[5px] border border-adm-line text-lg text-adm-ink-3 md:h-9 md:w-9"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AdmButton
                id="pf-recipe-add"
                type="button"
                variant="secondary"
                size="compact"
                onClick={() => {
                  setRecipe((rows) => [...rows, { rawMaterialId: "", qty: "" }]);
                  clearError("recipe");
                }}
              >
                + Add raw material
              </AdmButton>
              {servingsNow !== null && (
                <span className="font-adm-mono text-sm text-adm-ink-2">
                  Current stock makes <strong className={servingsNow > 0 ? "text-adm-ok" : "text-adm-bad"}>{servingsNow}</strong>{" "}
                  serving{servingsNow !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {fieldErrors.recipe && <FieldError id="pf-recipe-error" message={fieldErrors.recipe} />}
            {materials.length === 0 && (
              <p className="mt-2 text-sm text-adm-ink-3">No raw materials yet. Add them on the Raw materials page first.</p>
            )}
            {recipeValid && (
              <p className="mt-2 text-sm text-adm-ink-3">
                Per serving:{" "}
                {recipe
                  .map((r) => {
                    const m = materialById.get(r.rawMaterialId);
                    return m ? `${m.name} ${formatMaterialQty(Number(r.qty), m.unit)}` : "";
                  })
                  .join(", ")}
              </p>
            )}
          </div>
        )}

        <InstructionOptionsField
          options={instructionOptions}
          allowed={allowInstructions}
          error={fieldErrors.instructions}
          onAllowedChange={setAllowInstructions}
          onChange={(next) => {
            setInstructionOptions(next);
            setOptionsEdited(true);
            clearError("instructions");
          }}
          onError={(message) => setFieldErrors((errors) => ({ ...errors, instructions: message }))}
        />

        <Field label="Description">
          <textarea
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`h-20 resize-none py-2 ${admInputClass}`}
          />
        </Field>

        <ProductDetailsFields
          ingredients={ingredients}
          onIngredientsChange={setIngredients}
          allergens={allergens}
          onAllergensChange={setAllergens}
          nutrition={nutrition}
          onNutritionChange={setNutrition}
          productName={name}
          recipeNames={readyMade ? [] : recipe.flatMap((r) => materialById.get(r.rawMaterialId)?.name ?? [])}
          recipe={!readyMade && recipeValid ? recipe.map((r) => ({ rawMaterialId: r.rawMaterialId, qtyPerServing: Number(r.qty) })) : null}
        />

        {error && (
          <p role="alert" className="mb-3 text-base text-adm-bad md:text-sm">
            {error}
          </p>
        )}

        <div className={`mt-2 ${admModalActionsClass}`}>
          <AdmButton type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdmButton>
          <AdmButton type="submit" variant="primary" disabled={saving}>
            {product ? (saving ? "Saving…" : "Save changes") : saving ? "Adding…" : "Add product"}
          </AdmButton>
        </div>
      </form>
    </div>
  );
}

interface InstructionOptionsFieldProps {
  options: string[];
  allowed: boolean;
  error?: string;
  onAllowedChange: (allowed: boolean) => void;
  onChange: (options: string[]) => void;
  onError: (message: string) => void;
}

/**
 * The quick special-instruction options the kiosk offers for this dish, as removable
 * chips plus a field to add one, and a switch to offer no special instructions at all
 * (the typed note is hidden too), e.g. for bottled drinks.
 */
function InstructionOptionsField({ options, allowed, error, onAllowedChange, onChange, onError }: InstructionOptionsFieldProps) {
  const [draft, setDraft] = useState("");

  function add() {
    const text = draft.trim().replace(/\s+/g, " ");
    if (!text) return;
    if (options.some((o) => o.toLowerCase() === text.toLowerCase())) return onError(`"${text}" is already an option.`);
    if (options.length >= MAX_OPTIONS) return onError(`Up to ${MAX_OPTIONS} options. Remove one to add another.`);
    onChange([...options, text]);
    setDraft("");
  }

  return (
    <div
      role="group"
      aria-labelledby="pf-instructions-label"
      className={`mb-3 rounded-[6px] border bg-adm-bg p-3 ${error ? "border-adm-bad" : "border-adm-line-soft"}`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span id="pf-instructions-label" className={`${admLabelClass} mb-0!`}>
          Special instructions on the kiosk
        </span>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-base md:min-h-0 md:text-sm">
          <input type="checkbox" checked={allowed} onChange={(e) => onAllowedChange(e.target.checked)} className="h-4.5 w-4.5" />
          Offer special instructions
        </label>
      </div>
      {allowed ? (
        <>
          <p className="mb-2 text-base text-adm-ink-2 md:text-sm">
            Quick options customers can tap, sent to the kitchen with the order. Customers can also type a note.
          </p>
          {options.length > 0 ? (
            <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Options">
              {options.map((option) => (
                <li key={option} className="inline-flex items-center gap-1 rounded-full border border-adm-line bg-adm-surface py-0.5 pr-1 pl-3 text-sm">
                  {option}
                  <button
                    type="button"
                    onClick={() => onChange(options.filter((o) => o !== option))}
                    aria-label={`Remove option ${option}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-adm-ink-3 hover:bg-adm-bg md:h-6 md:w-6"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-2 text-sm text-adm-ink-3">No quick options: customers can only type a note.</p>
          )}
          <div className="flex gap-2">
            <input
              id="pf-option-new"
              value={draft}
              maxLength={MAX_OPTION_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="e.g. No onions"
              aria-label="New special-instruction option"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "pf-instructions-error" : undefined}
              className={`min-w-0 flex-1 ${admInputClass}`}
            />
            <AdmButton type="button" variant="secondary" size="compact" onClick={add} disabled={!draft.trim()}>
              Add
            </AdmButton>
          </div>
        </>
      ) : (
        <p className="text-base text-adm-ink-2 md:text-sm">The kiosk won&apos;t offer special instructions for this dish.</p>
      )}
      {error && <FieldError id="pf-instructions-error" message={error} />}
    </div>
  );
}

interface PhotoFieldProps {
  /** What the kiosk will show: the chosen photo, the current one, or null for the icon. */
  currentUrl: string | null;
  icon: string;
  isNew: boolean;
  preparing: boolean;
  error: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChoose: (file: File | undefined) => void;
  onRemove: () => void;
  /** Present when the photo was changed or removed, to go back to the saved one. */
  onUndo?: () => void;
}

function PhotoField({ currentUrl, icon, isNew, preparing, error, inputRef, onChoose, onRemove, onUndo }: PhotoFieldProps) {
  return (
    <div className="mb-3">
      <span id="pf-photo-label" className={admLabelClass}>
        Photo
      </span>
      <div className="flex items-center gap-3">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-adm-line bg-adm-bg">
          {currentUrl ? (
            // A local preview (blob:) or the API's photo; next/image adds nothing for either.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} alt="Product photo" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden="true" className="text-4xl">
              {icon}
            </span>
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
          <input
            ref={inputRef}
            id="pf-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => onChoose(e.target.files?.[0])}
          />
          <AdmButton
            type="button"
            variant="secondary"
            size="compact"
            disabled={preparing}
            aria-describedby={error ? "pf-photo-error" : "pf-photo-hint"}
            onClick={() => inputRef.current?.click()}
          >
            {preparing ? "Preparing…" : currentUrl ? "Change photo" : "Choose photo"}
          </AdmButton>
          {currentUrl && !isNew && (
            <AdmButton type="button" variant="secondary" size="compact" onClick={onRemove}>
              Remove photo
            </AdmButton>
          )}
          {onUndo && (
            <AdmButton type="button" variant="secondary" size="compact" onClick={onUndo}>
              {isNew ? "Don't change" : "Keep photo"}
            </AdmButton>
          )}
        </div>
      </div>
      {error ? (
        <FieldError id="pf-photo-error" message={error} />
      ) : (
        <span id="pf-photo-hint" className="mt-1 block text-sm text-adm-ink-3">
          {isNew
            ? "New photo, saved when you save the product."
            : currentUrl
              ? "Shown on the kiosk menu."
              : onUndo
                ? "The photo will be removed when you save; the kiosk shows the icon instead."
                : "Optional. Without a photo, the kiosk shows the icon. JPEG, PNG or WebP; it's made smaller before uploading."}
        </span>
      )}
    </div>
  );
}

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  /** Matches the input's aria-describedby. */
  errorId?: string;
  children: React.ReactNode;
}

function Field({ label, required, error, errorId, children }: FieldProps) {
  return (
    <label className="mb-3 block">
      <span className={admLabelClass}>
        {label}
        {required && <RequiredMark />}
      </span>
      {children}
      {error && errorId && <FieldError id={errorId} message={error} />}
    </label>
  );
}

// The input's aria-required already tells screen readers, so the star itself is hidden from them.
function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-adm-bad">
      {" *"}
    </span>
  );
}

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <span id={id} className="mt-1 block text-base text-adm-bad md:text-sm">
      {message}
    </span>
  );
}
