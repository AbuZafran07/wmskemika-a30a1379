import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, Info, Package, Building2, Upload, Loader2, X, AlertTriangle } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile } from "@/lib/storage";
import { generateUniqueStockOutNumber } from "@/lib/transactionNumberUtils";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface SalesOrderHeader {
  id: string;
  sales_order_number: string;
  customer: { id: string; name: string; code: string } | null;
  status: string;
  ship_to_address: string | null;
}

interface SalesOrderItem {
  id: string;
  product_id: string;
  ordered_qty: number;
  qty_delivered: number;
  qty_remaining: number;
  unit_price: number;
  product: {
    id: string;
    name: string;
    sku: string | null;
    category: { name: string } | null;
    unit: { name: string } | null;
  } | null;
}

interface BatchSelection {
  batch_id: string;
  batch_no: string;
  qty_available: number;
  expired_date: string | null;
  qty_out: number;
}

interface StockOutItem {
  sales_order_item_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  category: string;
  unit: string;
  qty_ordered: number;
  qty_remaining: number;
  qty_out: number;
  batches: BatchSelection[];
}

export default function StockOut() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { canCreate, canUpload } = usePermissions();

  const [salesOrders, setSalesOrders] = useState<SalesOrderHeader[]>([]);
  const [selectedSalesOrderId, setSelectedSalesOrderId] = useState<string>("");
  const [selectedSalesOrder, setSelectedSalesOrder] = useState<SalesOrderHeader | null>(null);
  const [items, setItems] = useState<StockOutItem[]>([]);
  const [loadingSalesOrders, setLoadingSalesOrders] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [stockOutNumber, setStockOutNumber] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [deliveryNoteUrl, setDeliveryNoteUrl] = useState("");
  const [deliveryNoteFileName, setDeliveryNoteFileName] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const fetchSalesOrders = useCallback(async () => {
    setLoadingSalesOrders(true);
    const { data, error } = await supabase
      .from("sales_order_headers")
      .select(
        `
        id, sales_order_number, status, ship_to_address,
        customer:customers(id, name, code)
      `,
      )
      .in("status", ["approved", "partially_delivered"])
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load sales orders");
      console.error(error);
    } else {
      setSalesOrders(data || []);
    }
    setLoadingSalesOrders(false);
  }, []);

  // Fetch approved sales orders with remaining qty
  useEffect(() => {
    fetchSalesOrders();
    generateStockOutNumber();
  }, [fetchSalesOrders]);

  // Fetch items when sales order selected
  useEffect(() => {
    if (!selectedSalesOrderId) {
      setItems([]);
      setSelectedSalesOrder(null);
      return;
    }

    const fetchItems = async () => {
      setLoadingItems(true);
      const so = salesOrders.find((s) => s.id === selectedSalesOrderId);
      setSelectedSalesOrder(so || null);

      // Fetch SO items with remaining qty > 0
      const { data: soItems, error: soError } = await supabase
        .from("sales_order_items")
        .select(
          `
          id, product_id, ordered_qty, qty_delivered, qty_remaining, unit_price,
          product:products(
            id, name, sku,
            category:categories(name),
            unit:units(name)
          )
        `,
        )
        .eq("sales_order_id", selectedSalesOrderId)
        .gt("qty_remaining", 0);

      if (soError) {
        toast.error("Failed to load items");
        console.error(soError);
        setLoadingItems(false);
        return;
      }

      // For each item, fetch available batches (FEFO - First Expired, First Out)
      const stockOutItems: StockOutItem[] = [];

      for (const item of (soItems as SalesOrderItem[]) || []) {
        const { data: batches } = await supabase
          .from("inventory_batches")
          .select("*")
          .eq("product_id", item.product_id)
          .gt("qty_on_hand", 0)
          .order("expired_date", { ascending: true, nullsFirst: false });

        const batchSelections: BatchSelection[] = (batches || []).map((b) => ({
          batch_id: b.id,
          batch_no: b.batch_no,
          qty_available: b.qty_on_hand,
          expired_date: b.expired_date,
          qty_out: 0,
        }));

        stockOutItems.push({
          sales_order_item_id: item.id,
          product_id: item.product_id,
          product_name: item.product?.name || "",
          sku: item.product?.sku || "-",
          category: item.product?.category?.name || "-",
          unit: item.product?.unit?.name || "-",
          qty_ordered: item.ordered_qty,
          qty_remaining: item.qty_remaining,
          qty_out: 0,
          batches: batchSelections,
        });
      }

      setItems(stockOutItems);
      setLoadingItems(false);
    };

    fetchItems();
  }, [selectedSalesOrderId, salesOrders]);

  const generateStockOutNumber = async () => {
    const number = await generateUniqueStockOutNumber();
    setStockOutNumber(number);
  };

  const handleBatchQtyChange = (itemIndex: number, batchIndex: number, value: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex) return item;

        const newBatches = item.batches.map((batch, bi) => {
          if (bi !== batchIndex) return batch;
          const qty = Math.min(value, batch.qty_available);
          return { ...batch, qty_out: qty };
        });

        const totalQtyOut = newBatches.reduce((sum, b) => sum + b.qty_out, 0);

        return { ...item, batches: newBatches, qty_out: totalQtyOut };
      }),
    );
  };

  const handleAutoAllocateFEFO = (itemIndex: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex) return item;

        let remaining = item.qty_remaining;
        const newBatches = item.batches.map((batch) => {
          if (remaining <= 0) return { ...batch, qty_out: 0 };

          const allocate = Math.min(remaining, batch.qty_available);
          remaining -= allocate;
          return { ...batch, qty_out: allocate };
        });

        const totalQtyOut = newBatches.reduce((sum, b) => sum + b.qty_out, 0);

        return { ...item, batches: newBatches, qty_out: totalQtyOut };
      }),
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const result = await uploadFile(file, "documents", "delivery-notes");

    if (result) {
      setDeliveryNoteUrl(result.url);
      setDeliveryNoteFileName(result.originalName);
      toast.success(language === "en" ? "File uploaded successfully" : "File berhasil diupload");
    } else {
      toast.error(language === "en" ? "Failed to upload file" : "Gagal upload file");
    }
    setIsUploading(false);
  };

  const handleClearDeliveryNote = () => {
    setDeliveryNoteUrl("");
    setDeliveryNoteFileName("");
  };

  const handleSave = async () => {
    if (!selectedSalesOrderId) {
      toast.error(language === "en" ? "Please select a Sales Order" : "Silakan pilih Sales Order");
      return;
    }

    const validItems = items.filter((item) => item.qty_out > 0);
    if (validItems.length === 0) {
      toast.error(
        language === "en" ? "Please enter at least one item quantity" : "Masukkan minimal satu kuantitas item",
      );
      return;
    }

    // Validate quantities
    for (const item of validItems) {
      if (item.qty_out > item.qty_remaining) {
        toast.error(
          language === "en"
            ? `Quantity out cannot exceed remaining for ${item.product_name}`
            : `Kuantitas keluar tidak boleh melebihi sisa untuk ${item.product_name}`,
        );
        return;
      }

      // Check if batches are selected
      const batchesWithQty = item.batches.filter((b) => b.qty_out > 0);
      if (batchesWithQty.length === 0) {
        toast.error(
          language === "en"
            ? `Please select batch for ${item.product_name}`
            : `Silakan pilih batch untuk ${item.product_name}`,
        );
        return;
      }
    }

    setIsSaving(true);

    try {
      // Build header data for RPC
      const headerPayload = {
        stock_out_number: stockOutNumber,
        sales_order_id: selectedSalesOrderId,
        delivery_date: deliveryDate,
        notes: notes || null,
        delivery_note_url: deliveryNoteUrl || null,
      };

      // Build items data for RPC - each item with its batches and total qty
      const itemsPayload = validItems.map((item) => ({
        sales_order_item_id: item.sales_order_item_id,
        product_id: item.product_id,
        total_qty_out: item.qty_out,
        batches: item.batches
          .filter((b) => b.qty_out > 0)
          .map((b) => ({
            batch_id: b.batch_id,
            qty_out: b.qty_out,
            notes: `Delivered to ${selectedSalesOrder?.customer?.name}`,
          })),
      }));

      // Call RPC function - entire operation is atomic (transactional)
      const { data: result, error: rpcError } = await supabase.rpc("stock_out_create", {
        header_data: headerPayload,
        items_data: itemsPayload,
      });

      if (rpcError) throw rpcError;

      const rpcResult = result as { success: boolean; error?: string; id?: string };
      if (!rpcResult?.success) {
        throw new Error(rpcResult?.error || "Unknown error occurred");
      }

      toast.success(language === "en" ? "Stock Out saved successfully" : "Stock Out berhasil disimpan");

      // === AUTOMATION: Move delivery card from Checking → Approval Delivery ===
      try {
        // Find delivery card for this SO in "checking" status
        const { data: deliveryCards, error: findError } = await supabase
          .from("delivery_requests")
          .select("id")
          .eq("sales_order_id", selectedSalesOrderId)
          .eq("board_status", "checking")
          .order("created_at", { ascending: true })
          .limit(1);

        const deliveryCard = deliveryCards?.[0] || null;

        if (findError) {
          console.error("Failed to find delivery card:", findError);
          toast.warning("Gagal menemukan card delivery untuk otomasi. Silakan pindahkan manual.");
        }

        if (deliveryCard) {
          const { data: currentUser } = await supabase.auth.getUser();
          const userId = currentUser?.user?.id;

          // Check WIB time to determine target column
          const nowWib = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
          const wibHour = nowWib.getHours();
          const isOnHoldHours = wibHour >= 15 || wibHour < 10;
          const targetStatus = isOnHoldHours ? "on_hold_delivery" : "approval_delivery";

          // Move card to appropriate column based on time
          const { error: moveError } = await supabase
            .from("delivery_requests")
            .update({
              board_status: targetStatus,
              moved_by: userId,
              moved_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", deliveryCard.id);

          if (moveError) {
            console.error("Failed to move delivery card:", moveError);
            toast.warning("Gagal memindahkan card delivery secara otomatis. Silakan pindahkan manual.");
          } else {
            // Auto-create checklist "Verifikasi Administrasi Finance"
            const { error: checklistError } = await supabase.from("delivery_checklists").insert({
              delivery_request_id: deliveryCard.id,
              label: "Verifikasi Administrasi Finance",
            });

            if (checklistError) {
              console.error("Failed to create finance checklist:", checklistError);
            }

            // Log activity
            if (userId) {
              await supabase.from("delivery_comments").insert({
                delivery_request_id: deliveryCard.id,
                user_id: userId,
                message: `📦 Stock Out "${stockOutNumber}" telah dibuat. Card otomatis dipindahkan ke ${isOnHoldHours ? "On Hold Delivery Order (di luar jam operasional)" : "Approval Delivery Order"}.`,
                type: "activity",
              });
            }

            // Check if SO still has remaining items (partial delivery)
            // IMPORTANT: Karena Stock Out sekarang hanya booking (qty_delivered baru di-update
            // saat confirm_delivery), kita harus hitung sisa = ordered_qty - qty_delivered
            // - total qty_out dari semua stock_out_items aktif (booked/delivered, bukan cancelled).
            const { data: remainingItems } = await supabase
              .from("sales_order_items")
              .select("id, ordered_qty, qty_delivered")
              .eq("sales_order_id", selectedSalesOrderId);

            // Ambil semua stock_out_items aktif untuk SO ini (lewat header)
            const { data: activeStockOuts } = await supabase
              .from("stock_out_headers")
              .select("id, booking_status, stock_out_items(sales_order_item_id, qty_out)")
              .eq("sales_order_id", selectedSalesOrderId)
              .in("booking_status", ["booked", "delivered"]);

            const bookedByItem = new Map<string, number>();
            (activeStockOuts || []).forEach((h: any) => {
              (h.stock_out_items || []).forEach((si: any) => {
                const cur = bookedByItem.get(si.sales_order_item_id) || 0;
                bookedByItem.set(si.sales_order_item_id, cur + (si.qty_out || 0));
              });
            });

            const hasRemaining = remainingItems?.some((item) => {
              const booked = bookedByItem.get(item.id) || 0;
              const remaining = item.ordered_qty - (item.qty_delivered || 0) - booked;
              return remaining > 0;
            });

            if (hasRemaining) {
              // Auto-attach "Partial Delivery" label to current card (the partial shipment)
              try {
                const { data: partialLabel } = await supabase
                  .from("delivery_labels")
                  .select("id")
                  .ilike("name", "Partial Delivery")
                  .maybeSingle();
                if (partialLabel?.id) {
                  const { data: existing } = await supabase
                    .from("delivery_card_labels")
                    .select("id")
                    .eq("delivery_request_id", deliveryCard.id)
                    .eq("label_id", partialLabel.id)
                    .maybeSingle();
                  if (!existing) {
                    await supabase.from("delivery_card_labels").insert({
                      delivery_request_id: deliveryCard.id,
                      label_id: partialLabel.id,
                    });
                  }
                }
              } catch (labelErr) {
                console.error("Failed to auto-attach Partial Delivery label:", labelErr);
              }

              // Create new card in checking for remaining items (ready for next stock out)
              const { data: newCard, error: newCardError } = await supabase
                .from("delivery_requests")
                .insert({
                  sales_order_id: selectedSalesOrderId,
                  board_status: "checking",
                  notes: `Sisa pengiriman dari Stock Out ${stockOutNumber}`,
                  created_by: userId,
                })
                .select("id")
                .single();

              if (newCardError) {
                console.error("Failed to create partial delivery card:", newCardError);
                toast.warning("Gagal membuat card partial otomatis.");
              } else if (newCard?.id) {
                if (userId) {
                  await supabase.from("delivery_comments").insert({
                    delivery_request_id: newCard.id,
                    user_id: userId,
                    message: `🔄 Card baru dibuat otomatis di Checking untuk sisa barang dari pengiriman partial (Stock Out: ${stockOutNumber}).`,
                    type: "activity",
                  });
                }
              }

              toast.info("Pengiriman partial: Card baru dibuat di New Orders untuk sisa barang");
            } else {
              // FULL/FINAL shipment — cek apakah SO ini sebelumnya pernah partial
              // (ada >1 stock_out_headers aktif). Jika ya, tempel "Final Partial Delivery".
              try {
                const totalStockOuts = (activeStockOuts || []).length;
                if (totalStockOuts > 1) {
                  const { data: finalLabel } = await supabase
                    .from("delivery_labels")
                    .select("id")
                    .ilike("name", "Final Partial Delivery")
                    .maybeSingle();
                  if (finalLabel?.id) {
                    const { data: existing } = await supabase
                      .from("delivery_card_labels")
                      .select("id")
                      .eq("delivery_request_id", deliveryCard.id)
                      .eq("label_id", finalLabel.id)
                      .maybeSingle();
                    if (!existing) {
                      await supabase.from("delivery_card_labels").insert({
                        delivery_request_id: deliveryCard.id,
                        label_id: finalLabel.id,
                      });
                    }
                  }
                }
              } catch (labelErr) {
                console.error("Failed to auto-attach Final Partial Delivery label:", labelErr);
              }
            }
          }
        } else if (!findError) {
          console.warn("No delivery card found in checking status for SO:", selectedSalesOrderId);
        }
      } catch (automationErr) {
        console.error("Delivery board automation error:", automationErr);
        toast.warning("Otomasi delivery board gagal. Silakan periksa dan pindahkan card secara manual.");
      }

      // Reset form + refresh list so the status/availability updates immediately
      await fetchSalesOrders();
      setSelectedSalesOrderId("");
      setSelectedSalesOrder(null);
      setItems([]);
      setNotes("");
      setDeliveryNoteUrl("");
      setDeliveryNoteFileName("");
      setDeliveryDate(new Date().toISOString().split("T")[0]);
      await generateStockOutNumber();
    } catch (error: any) {
      console.error(error);
      const errorMessage =
        error?.message || (language === "en" ? "Failed to save Stock Out" : "Gagal menyimpan Stock Out");
      toast.error(errorMessage);
    }

    setIsSaving(false);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("id-ID");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-destructive/10 rounded-lg">
            <Package className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">
              Stock Out ({language === "en" ? "Outbound" : "Pengiriman"})
            </h1>
            <p className="text-muted-foreground text-sm">
              {language === "en"
                ? "Deliver goods from approved Sales Orders with FEFO batch selection"
                : "Kirim barang dari Sales Order yang disetujui dengan pemilihan batch FEFO"}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSalesOrders([]);
            setLoadingSalesOrders(true);
          }}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Step 1: Select Sales Order */}
      <Card className="border-info/30 bg-info/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-info" />
            <CardTitle className="text-base text-info">
              {language === "en" ? "Step 1: Select Sales Order" : "Langkah 1: Pilih Sales Order"}
            </CardTitle>
          </div>
          <CardDescription>
            {language === "en"
              ? "Stock Out MUST be created from an approved Sales Order. Batches will be allocated using FEFO (First Expired, First Out) method."
              : "Stock Out HARUS dibuat dari Sales Order yang sudah disetujui. Batch akan dialokasikan menggunakan metode FEFO (First Expired, First Out)."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Sales Order *</Label>
            <SearchableSelect
              value={selectedSalesOrderId}
              onValueChange={setSelectedSalesOrderId}
              options={salesOrders.map((so) => ({
                value: so.id,
                label: `${so.sales_order_number} - ${so.customer?.name || ""}`,
                description: so.status,
              }))}
              placeholder={
                loadingSalesOrders
                  ? "Loading..."
                  : language === "en"
                    ? "-- Select Sales Order --"
                    : "-- Pilih Sales Order --"
              }
              searchPlaceholder={language === "en" ? "Search sales order..." : "Cari sales order..."}
              emptyMessage={language === "en" ? "No sales order found" : "Sales order tidak ditemukan"}
              disabled={loadingSalesOrders}
            />
          </div>
        </CardContent>
      </Card>

      {/* Outbound Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-muted-foreground" />
            <CardTitle className="text-base">{language === "en" ? "Outbound Header" : "Header Pengiriman"}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>{language === "en" ? "Stock Out Number" : "Nomor Stock Out"} *</Label>
              <Input
                value={stockOutNumber}
                onChange={(e) => setStockOutNumber(e.target.value)}
                className="bg-muted font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>{language === "en" ? "Delivery Date" : "Tanggal Kirim"} *</Label>
              <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{language === "en" ? "Sales Order No." : "No. Sales Order"}</Label>
              <Input value={selectedSalesOrder?.sales_order_number || ""} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Customer</Label>
              <Input value={selectedSalesOrder?.customer?.name || ""} disabled className="bg-muted" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="space-y-2">
              <Label>{language === "en" ? "Delivery Note" : "Surat Jalan"}</Label>
              <div className="flex gap-2">
                <Input
                  value={deliveryNoteFileName || ""}
                  disabled
                  placeholder={language === "en" ? "Upload delivery note" : "Upload surat jalan"}
                  className="bg-muted truncate"
                  title={deliveryNoteFileName || undefined}
                />
                <Button
                  variant="outline"
                  onClick={() => document.getElementById("delivery-note-input")?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                </Button>
                {deliveryNoteUrl && (
                  <Button variant="outline" size="icon" onClick={handleClearDeliveryNote}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
                <input
                  id="delivery-note-input"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{language === "en" ? "Notes" : "Catatan"}</Label>
              <Textarea
                placeholder={language === "en" ? "Enter notes..." : "Masukkan catatan..."}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items to Deliver */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-muted-foreground" />
            <CardTitle className="text-base">{language === "en" ? "Items to Deliver" : "Item yang Dikirim"}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingItems ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {language === "en" ? "Select a Sales Order to view items" : "Pilih Sales Order untuk melihat item"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === "en" ? "Product" : "Produk"}</TableHead>
                    <TableHead className="text-center">{language === "en" ? "Ordered" : "Dipesan"}</TableHead>
                    <TableHead className="text-center">{language === "en" ? "Remaining" : "Sisa"}</TableHead>
                    <TableHead>{language === "en" ? "Batch Selection (FEFO)" : "Pilih Batch (FEFO)"}</TableHead>
                    <TableHead className="text-center">{language === "en" ? "Qty Out" : "Qty Keluar"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, itemIndex) => (
                    <TableRow key={item.sales_order_item_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.sku} | {item.category} | {item.unit}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{item.qty_ordered}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="pending">{item.qty_remaining}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          {item.batches.length === 0 ? (
                            <div className="flex items-center gap-2 text-warning">
                              <AlertTriangle className="w-4 h-4" />
                              <span className="text-sm">
                                {language === "en" ? "No stock available" : "Stok tidak tersedia"}
                              </span>
                            </div>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAutoAllocateFEFO(itemIndex)}
                                className="mb-2"
                              >
                                {language === "en" ? "Auto FEFO" : "Otomatis FEFO"}
                              </Button>
                              {item.batches.map((batch, batchIndex) => (
                                <div key={batch.batch_id} className="flex items-center gap-2 text-sm">
                                  <span className="min-w-[100px] font-mono">{batch.batch_no}</span>
                                  <Badge
                                    variant={
                                      batch.expired_date && new Date(batch.expired_date) < new Date()
                                        ? "cancelled"
                                        : "secondary"
                                    }
                                  >
                                    Exp: {formatDate(batch.expired_date)}
                                  </Badge>
                                  <span className="text-muted-foreground">Avail: {batch.qty_available}</span>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={batch.qty_available}
                                    className="w-20"
                                    value={batch.qty_out}
                                    onChange={(e) =>
                                      handleBatchQtyChange(itemIndex, batchIndex, parseInt(e.target.value) || 0)
                                    }
                                  />
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={item.qty_out > 0 ? "success" : "draft"}>{item.qty_out}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <Button 
          variant="outline" 
          onClick={() => {
            setSelectedSalesOrderId("");
            setSelectedSalesOrder(null);
            setItems([]);
            setNotes("");
            setDeliveryNoteUrl("");
            setDeliveryNoteFileName("");
            setDeliveryDate(new Date().toISOString().split("T")[0]);
            generateStockOutNumber();
          }}
        >
          {language === "en" ? "Cancel" : "Batal"}
        </Button>
        {canCreate('stock_out') && (
          <Button onClick={handleSave} disabled={isSaving || items.length === 0}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {language === "en" ? "Save Stock Out" : "Simpan Stock Out"}
          </Button>
        )}
      </div>
    </div>
  );
}
