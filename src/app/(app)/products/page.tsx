"use client";

import { Suspense, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, Eye, ImagePlus, Package, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { useApp } from "@/components/app-context";
import { fromCents, toCents } from "@/lib/money";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  SelectField,
  Skeleton,
  StatCard,
  Tabs,
  TextAreaField,
  TextField,
  useToast,
} from "@/components/ui";
import { ApiError, apiFetch, fileToResizedDataUrl, qs, uid, useApi, useDebounced } from "@/lib/client";

interface Prod {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  imageUrl: string | null;
  price: string;
  costPrice: string | null;
  stockQty: number;
  lowStockThreshold: number | null;
  effectiveThreshold: number;
  isLow: boolean;
  isActive: boolean;
  categoryId: string | null;
  categoryName: string | null;
}
interface Res {
  products: Prod[];
  categories: { id: string; name: string }[];
  valuation: { products: number; units: number; valueAtCost: number; valueAtRetail: number; lowStock: number } | null;
  summary: { activeProducts: number; units: number; lowStock: number };
  settings: { defaultLowStockThreshold: number; allowNegativeStock: boolean };
}
interface Movement {
  id: string;
  type: string;
  quantityChange: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: string;
  productName: string;
  sku: string | null;
  userName: string | null;
}

const EMPTY = { name: "", sku: "", barcode: "", categoryName: "", description: "", price: "", costPrice: "", stockQty: "0", lowStockThreshold: "", imageUrl: "" };

function unitProfit(price: string, cost: string) {
  const priceCents = toCents(price);
  const profitCents = priceCents - toCents(cost);
  return {
    profit: fromCents(profitCents),
    margin: priceCents === 0 ? null : `${((profitCents / priceCents) * 100).toFixed(2)}%`,
  };
}

function ProductForm({ product, categories, canSeeCost, onClose, onSaved }: { product: Prod | null; categories: string[]; canSeeCost: boolean; onClose: () => void; onSaved: () => void }) {
  const app = useApp();
  const toast = useToast();
  const formId = `product-form-${product?.id ?? "new"}`;
  const formRef = useRef<HTMLFormElement>(null);
  const savingRef = useRef(false);
  const createRequest = useRef({ signature: "", key: "" });
  const [v, setV] = useState(
    product
      ? { name: product.name, sku: product.sku ?? "", barcode: product.barcode ?? "", categoryName: product.categoryName ?? "", description: product.description ?? "", price: product.price, costPrice: product.costPrice ?? "", stockQty: String(product.stockQty), lowStockThreshold: product.lowStockThreshold === null ? "" : String(product.lowStockThreshold), imageUrl: product.imageUrl ?? "" }
      : EMPTY,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));

  async function pickImage(file?: File) {
    if (!file) return;
    try {
      setErr("");
      const url = await fileToResizedDataUrl(file, 320, "image/jpeg", 0.75);
      setV((p) => ({ ...p, imageUrl: url }));
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (savingRef.current) return;
    const errors: Record<string, string> = {};
    if (!v.name.trim()) errors.name = "Product name is required.";
    const price = Number(v.price);
    if (!v.price.trim()) errors.price = "Selling price is required.";
    else if (!Number.isFinite(price) || price < 0) errors.price = "Enter a valid nonnegative price.";
    const stock = Number(v.stockQty);
    if (!product && (!Number.isInteger(stock) || stock < 0)) errors.stockQty = "Opening stock must be a nonnegative whole number.";
    if (v.lowStockThreshold.trim() && (!Number.isInteger(Number(v.lowStockThreshold)) || Number(v.lowStockThreshold) < 0)) {
      errors.lowStockThreshold = "Low-stock threshold must be a nonnegative whole number.";
    }
    if (Object.keys(errors).length) {
      setFields(errors);
      setErr("Please correct the highlighted fields.");
      formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    savingRef.current = true;
    setBusy(true);
    setErr("");
    setFields({});
    const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
    const body: Record<string, unknown> = {
      name: v.name,
      sku: v.sku,
      barcode: v.barcode,
      categoryName: v.categoryName,
      description: v.description,
      imageUrl: v.imageUrl || null,
      price: num(v.price),
      lowStockThreshold: v.lowStockThreshold.trim() === "" ? null : Number(v.lowStockThreshold),
    };
    if (canSeeCost) body.costPrice = num(v.costPrice) ?? 0;
    if (!product) body.stockQty = num(v.stockQty) ?? 0;
    if (!product) {
      const signature = JSON.stringify(body);
      if (createRequest.current.signature !== signature) {
        createRequest.current = { signature, key: uid() };
      }
      body.requestKey = createRequest.current.key;
    }
    try {
      await apiFetch(product ? `/api/products/${product.id}` : "/api/products", { method: product ? "PATCH" : "POST", body });
      toast.success(product ? "Product updated" : "Product created");
      onSaved();
      onClose();
    } catch (e) {
      const ae = e as ApiError;
      setErr(ae.message);
      setFields(ae.fieldErrors ?? {});
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={product ? "Edit product" : "New product"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form={formId} loading={busy}>{product ? "Save changes" : "Create product"}</Button>
        </>
      }
    >
      <form id={formId} ref={formRef} onSubmit={save} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {err && <div className="sm:col-span-2"><Alert tone="error">{err}</Alert></div>}
        <TextField className="sm:col-span-2" label="Product name" name="name" value={v.name} onChange={set("name")} error={fields.name} required autoFocus />
        <TextField label="SKU" name="sku" value={v.sku} onChange={set("sku")} error={fields.sku} hint="Unique stock-keeping code (optional)." />
        <TextField label="Barcode" name="barcode" value={v.barcode} onChange={set("barcode")} error={fields.barcode} hint="Scan or type (optional)." />
        <div>
          <TextField label="Category" name="categoryName" value={v.categoryName} onChange={set("categoryName")} error={fields.categoryName} list="category-options" hint="Pick one or type a new category." />
          <datalist id="category-options">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <TextField label="Selling price" name="price" type="number" min="0" step="0.01" inputMode="decimal" value={v.price} onChange={set("price")} error={fields.price} required />
        {canSeeCost && <TextField label="Cost price" name="costPrice" type="number" min="0" step="0.01" inputMode="decimal" value={v.costPrice} onChange={set("costPrice")} error={fields.costPrice} hint="Used for profit and valuation." />}
        {canSeeCost && v.price !== "" && v.costPrice !== "" && Number.isFinite(Number(v.price)) && Number.isFinite(Number(v.costPrice)) && (
          <p className="self-end pb-2 text-xs text-slate-600">
            Gross profit per unit: <strong>{app.money(unitProfit(v.price, v.costPrice).profit)}</strong>
            {" · "}Gross margin: <strong>{unitProfit(v.price, v.costPrice).margin ?? "—"}</strong>
          </p>
        )}
        {!product ? (
          <TextField label="Opening stock" name="stockQty" type="number" min="0" step="1" inputMode="numeric" value={v.stockQty} onChange={set("stockQty")} error={fields.stockQty} hint="Recorded as an inventory movement." />
        ) : (
          <TextField label="Current stock" value={String(product.stockQty)} disabled hint="Use “Adjust stock” to change quantities." readOnly />
        )}
        <TextField label="Low-stock alert at" name="lowStockThreshold" type="number" min="0" step="1" inputMode="numeric" value={v.lowStockThreshold} onChange={set("lowStockThreshold")} error={fields.lowStockThreshold} hint="Leave empty to use the business default." />
        <TextAreaField className="sm:col-span-2" label="Description" name="description" value={v.description} onChange={set("description")} error={fields.description} maxLength={500} />
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Product image (optional)</span>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
              {v.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.imageUrl} alt="Product preview" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus className="h-6 w-6 text-slate-400" aria-hidden />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 focus-within:outline focus-within:outline-2 focus-within:outline-emerald-600 hover:bg-slate-50">
                Upload image
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pickImage(e.target.files?.[0])} />
              </label>
              {v.imageUrl && <Button variant="ghost" size="sm" onClick={() => setV((p) => ({ ...p, imageUrl: "" }))}><Trash2 className="h-4 w-4" /> Remove</Button>}
            </div>
          </div>
        </div>
      </div>
      </form>
    </Modal>
  );
}

function ProductDetails({ product, canSeeCost, onClose }: { product: Prod; canSeeCost: boolean; onClose: () => void }) {
  const app = useApp();
  const profit = unitProfit(product.price, product.costPrice ?? "0");
  return (
    <Modal open onClose={onClose} title={product.name} description={product.isActive ? "Active product" : "Archived product"} size="md"
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="space-y-5">
        {product.imageUrl && (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.imageUrl} alt={product.name} className="max-h-56 max-w-full rounded-xl object-contain" />
          </div>
        )}
        {product.description && <p className="whitespace-pre-wrap text-sm text-slate-600">{product.description}</p>}
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div><dt className="text-xs font-medium text-slate-500">SKU</dt><dd className="mt-1 text-sm text-slate-900">{product.sku || "—"}</dd></div>
          <div><dt className="text-xs font-medium text-slate-500">Barcode</dt><dd className="mt-1 text-sm text-slate-900">{product.barcode || "—"}</dd></div>
          <div><dt className="text-xs font-medium text-slate-500">Category</dt><dd className="mt-1 text-sm text-slate-900">{product.categoryName || "—"}</dd></div>
          <div><dt className="text-xs font-medium text-slate-500">Selling price</dt><dd className="mt-1 text-sm text-slate-900">{app.money(product.price)}</dd></div>
          {canSeeCost && <div><dt className="text-xs font-medium text-slate-500">Cost price</dt><dd className="mt-1 text-sm text-slate-900">{app.money(product.costPrice)}</dd></div>}
          {canSeeCost && <div><dt className="text-xs font-medium text-slate-500">Gross profit per unit</dt><dd className="mt-1 text-sm text-slate-900">{app.money(profit.profit)}</dd></div>}
          {canSeeCost && <div><dt className="text-xs font-medium text-slate-500">Gross margin</dt><dd className="mt-1 text-sm text-slate-900">{profit.margin ?? "—"}</dd></div>}
          <div><dt className="text-xs font-medium text-slate-500">Available stock</dt><dd className="mt-1 text-sm text-slate-900">{product.stockQty}</dd></div>
          <div><dt className="text-xs font-medium text-slate-500">Low-stock alert</dt><dd className="mt-1 text-sm text-slate-900">{product.effectiveThreshold}</dd></div>
        </dl>
      </div>
    </Modal>
  );
}

function AdjustModal({ product, allowNegative, onClose, onSaved }: { product: Prod; allowNegative: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<"restock" | "damage" | "adjustment">("restock");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const n = Number(qty);
  const delta = type === "restock" ? Math.abs(n) : type === "damage" ? -Math.abs(n) : n;
  const after = product.stockQty + (Number.isFinite(delta) ? delta : 0);
  const valid = Number.isInteger(n) && n !== 0 && reason.trim().length >= 3 && (allowNegative || after >= 0);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      await apiFetch("/api/inventory", { method: "POST", body: { productId: product.id, type, quantityChange: delta, reason } });
      toast.success("Stock updated");
      onSaved();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title="Adjust stock" description={`${product.name} · currently ${product.stockQty} in stock`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} loading={busy} disabled={!valid}>Save adjustment</Button></>}>
      <div className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="restock">Add stock (restock)</option>
          <option value="damage">Remove stock (damaged / lost)</option>
          <option value="adjustment">Correction (+ or −)</option>
        </SelectField>
        <TextField label={type === "adjustment" ? "Quantity change (use − to remove)" : "Quantity"} type="number" step="1" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} required autoFocus />
        <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={200} hint="e.g. Supplier delivery, stock count, broken in store" />
        {Number.isFinite(delta) && n !== 0 && (
          <p className={`tabular text-sm font-medium ${!allowNegative && after < 0 ? "text-red-600" : "text-slate-700"}`}>
            New stock level: {after}{!allowNegative && after < 0 ? " — cannot go below zero" : ""}
          </p>
        )}
      </div>
    </Modal>
  );
}

function Movements({ products }: { products: Prod[] }) {
  const app = useApp();
  const [productId, setProductId] = useState("");
  const [type, setType] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 25;
  const { data, error, reload } = useApi<{ movements: Movement[]; total: number }>(`/api/inventory${qs({ productId, type, limit, offset })}`);
  const tone = (t: string) => (t === "sale" || t === "damage" ? "red" : t === "refund" || t === "restock" || t === "initial" ? "emerald" : "navy") as "red" | "emerald" | "navy";
  return (
    <Card>
      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2">
        <Select aria-label="Filter by product" value={productId} onChange={(e) => { setProductId(e.target.value); setOffset(0); }}>
          <option value="">All products</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select aria-label="Filter by movement type" value={type} onChange={(e) => { setType(e.target.value); setOffset(0); }}>
          <option value="">All movement types</option>
          {["initial", "restock", "adjustment", "damage", "sale", "refund"].map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
        </Select>
      </div>
      {error && !data ? <ErrorState message={error} onRetry={reload} /> : !data ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div> : data.movements.length === 0 ? (
        <EmptyState icon={<SlidersHorizontal className="h-6 w-6" />} title="No stock movements yet" description="Sales, restocks, adjustments and refunds will be listed here." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th scope="col" className="px-5 py-3 font-medium">Date</th><th scope="col" className="px-3 py-3 font-medium">Product</th><th scope="col" className="px-3 py-3 font-medium">Type</th><th scope="col" className="px-3 py-3 text-right font-medium">Change</th><th scope="col" className="px-3 py-3 text-right font-medium">Balance</th><th scope="col" className="px-3 py-3 font-medium">Reason</th><th scope="col" className="px-5 py-3 font-medium">By</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.movements.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600">{app.dateTime(m.createdAt)}</td>
                    <td className="px-3 py-3 font-medium text-slate-900">{m.productName}</td>
                    <td className="px-3 py-3"><Badge tone={tone(m.type)}>{m.type}</Badge></td>
                    <td className={`tabular px-3 py-3 text-right font-semibold ${m.quantityChange < 0 ? "text-red-600" : "text-emerald-700"}`}>{m.quantityChange > 0 ? "+" : ""}{m.quantityChange}</td>
                    <td className="tabular px-3 py-3 text-right text-slate-700">{m.balanceAfter}</td>
                    <td className="px-3 py-3 text-slate-600">{m.reason ?? "—"}</td>
                    <td className="px-5 py-3 text-slate-600">{m.userName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination offset={offset} limit={limit} total={data.total} onChange={setOffset} />
        </>
      )}
    </Card>
  );
}

function ProductsInner() {
  const app = useApp();
  const toast = useToast();
  const initialFilter = useSearchParams().get("filter") === "low" ? "low" : "active";
  const [tab, setTab] = useState<"products" | "movements">("products");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [filter, setFilter] = useState<"active" | "low" | "out" | "archived">(initialFilter);
  const [editing, setEditing] = useState<Prod | "new" | null>(null);
  const [viewing, setViewing] = useState<Prod | null>(null);
  const [adjusting, setAdjusting] = useState<Prod | null>(null);
  const [archiving, setArchiving] = useState<Prod | null>(null);
  const [busy, setBusy] = useState(false);
  const dsearch = useDebounced(search, 250);
  const manage = app.can("products.manage");
  const showCost = app.can("cost.view");

  const { data, error, loading, reload } = useApi<Res>(`/api/products${qs({ q: dsearch.trim(), categoryId, status: filter === "archived" ? "archived" : "active", stockStatus: filter === "low" || filter === "out" ? filter : undefined })}`);
  const all = useApi<Res>(tab === "movements" && app.can("inventory.adjust") ? "/api/products?status=all" : null);
  const cats = useMemo(() => data?.categories.map((c) => c.name) ?? [], [data]);

  async function toggleArchive(p: Prod) {
    setBusy(true);
    try {
      await apiFetch(`/api/products/${p.id}`, { method: "PATCH", body: { isActive: !p.isActive } });
      toast.success(p.isActive ? "Product archived" : "Product restored");
      setArchiving(null);
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tabs = [{ id: "products" as const, label: "Products" }, ...(app.can("inventory.adjust") ? [{ id: "movements" as const, label: "Stock movements" }] : [])];

  return (
    <div>
      <PageHeader
        title="Products & inventory"
        description="Manage your catalogue, prices and stock levels."
        actions={manage && <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New product</Button>}
      />
      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}

      {tab === "movements" ? (
        <Movements products={all.data?.products ?? []} />
      ) : (
        <>
          {data && (
            <div className={`mb-5 grid gap-4 sm:grid-cols-2 ${showCost ? "xl:grid-cols-4" : ""}`}>
              <StatCard label="Active products" value={data.summary.activeProducts} hint={`${data.summary.units} units in stock`} icon={<Package className="h-5 w-5" />} />
              {showCost && data.valuation && <StatCard label="Stock value (cost)" value={app.money(data.valuation.valueAtCost)} hint="Units × cost price" tone="emerald" />}
              {showCost && data.valuation && <StatCard label="Stock value (retail)" value={app.money(data.valuation.valueAtRetail)} hint="Units × selling price" tone="emerald" />}
              <StatCard label="Low stock" value={data.summary.lowStock} hint="At or below alert level" tone={data.summary.lowStock ? "amber" : "navy"} />
            </div>
          )}
          <Card>
            <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_200px_200px]">
              <Input aria-label="Search products" placeholder="Search name, SKU or barcode…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <Select aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">All categories</option>
                {data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select aria-label="Status filter" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
                <option value="active">Active products</option>
                <option value="low">Low stock only</option>
                <option value="out">Out of stock</option>
                <option value="archived">Archived</option>
              </Select>
            </div>

            {error && !data ? (
              <ErrorState message={error} onRetry={reload} />
            ) : !data ? (
              <div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : data.products.length === 0 ? (
              <EmptyState
                icon={<Package className="h-6 w-6" />}
                title={search || categoryId || filter !== "active" ? "No products match" : "No products yet"}
                description={search || categoryId || filter !== "active" ? "Try changing your search or filters." : "Add your first product to start selling."}
                action={manage && !search && filter === "active" ? <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add product</Button> : undefined}
              />
            ) : (
              <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th scope="col" className="px-5 py-3 font-medium">Product</th>
                        <th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">Category</th>
                        <th scope="col" className="px-3 py-3 text-right font-medium">Price</th>
                        {showCost && <th scope="col" className="hidden px-3 py-3 text-right font-medium lg:table-cell">Cost</th>}
                        <th scope="col" className="px-3 py-3 text-right font-medium">Stock</th>
                        <th scope="col" className="px-5 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.products.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/70">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-navy-50 text-sm font-semibold text-navy-400">
                                {p.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={p.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                                ) : p.name.slice(0, 1).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-900">{p.name}</p>
                                <p className="truncate text-xs text-slate-500">{[p.sku, p.barcode].filter(Boolean).join(" · ") || "No SKU"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-3 py-3 text-slate-600 md:table-cell">{p.categoryName ?? "—"}</td>
                          <td className="tabular px-3 py-3 text-right font-medium text-slate-900">{app.money(p.price)}</td>
                          {showCost && <td className="tabular hidden px-3 py-3 text-right text-slate-600 lg:table-cell">{app.money(p.costPrice)}</td>}
                          <td className="px-3 py-3 text-right">
                            <span className="tabular font-medium text-slate-900">{p.stockQty}</span>
                            {p.isActive && p.isLow && <div><Badge tone={p.stockQty <= 0 ? "red" : "amber"}>{p.stockQty <= 0 ? "Out" : "Low"}</Badge></div>}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => setViewing(p)} aria-label={`View ${p.name}`} title="View details"><Eye className="h-4 w-4" /></Button>
                              {manage && <>
                                {p.isActive && app.can("inventory.adjust") && <Button variant="ghost" size="sm" onClick={() => setAdjusting(p)} aria-label={`Adjust stock for ${p.name}`} title="Adjust stock"><SlidersHorizontal className="h-4 w-4" /></Button>}
                                <Button variant="ghost" size="sm" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`} title="Edit"><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="sm" onClick={() => setArchiving(p)} aria-label={`${p.isActive ? "Archive" : "Restore"} ${p.name}`} title={p.isActive ? "Archive" : "Restore"}>
                                  {p.isActive ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                                </Button>
                              </>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="px-5 py-3 text-xs text-slate-500">{data.products.length} product{data.products.length === 1 ? "" : "s"}</p>
              </div>
            )}
          </Card>
        </>
      )}

      {editing && <ProductForm product={editing === "new" ? null : editing} categories={cats} canSeeCost={showCost} onClose={() => setEditing(null)} onSaved={reload} />}
      {viewing && <ProductDetails product={viewing} canSeeCost={showCost} onClose={() => setViewing(null)} />}
      {adjusting && <AdjustModal product={adjusting} allowNegative={app.settings.allowNegativeStock} onClose={() => setAdjusting(null)} onSaved={reload} />}
      <ConfirmDialog
        open={!!archiving}
        title={archiving?.isActive ? "Archive product?" : "Restore product?"}
        message={archiving?.isActive ? `“${archiving?.name}” will no longer appear at checkout. Past sales and stock history are kept, and you can restore it any time.` : `“${archiving?.name}” will appear at checkout again.`}
        confirmLabel={archiving?.isActive ? "Archive" : "Restore"}
        danger={archiving?.isActive}
        loading={busy}
        onConfirm={() => archiving && toggleArchive(archiving)}
        onClose={() => setArchiving(null)}
      />
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <ProductsInner />
    </Suspense>
  );
}
