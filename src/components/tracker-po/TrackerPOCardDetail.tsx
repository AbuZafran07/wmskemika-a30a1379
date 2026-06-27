import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Tag, MessageSquare, Send, X, Plus, Trash2, Paperclip,
  FileText, Image, Download, Loader2, Check, Search, ExternalLink, Eye,
  Truck, AtSign,
} from "lucide-react";
import { DialogFooter } from "@/components/ui/dialog";
import { format, formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { notifyKanbanComment, notifyKanbanMention } from "@/lib/pushNotifications";
import type { PlanOrderHeader } from "@/hooks/usePlanOrders";
import type { ChecklistItem } from "@/hooks/useTrackerPO";

// ─── constants ────────────────────────────────────────────────────────────────

const LABEL_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#6366f1", "#64748b",
];

const CHECKLIST_LABELS_BY_COLUMN: Record<string, string[]> = {
  plan_order: ["submitted"],
  processing: ["vendor_confirmation", "payment_process"],
  in_stock: [],
};

const CHECKLIST_LABEL_NAMES: Record<string, string> = {
  submitted: "Submitted",
  vendor_confirmation: "Vendor Confirmation",
  payment_process: "Payment Process",
};

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-blue-100 text-blue-800",
  partially_received: "bg-yellow-100 text-yellow-800",
  received: "bg-emerald-100 text-emerald-800",
};

const STATUS_LABELS: Record<string, string> = {
  approved: "Approved",
  partially_received: "Partially Received",
  received: "Received",
};

const LABEL_MANAGE_ROLES = ["super_admin", "admin", "purchasing", "warehouse"];
const LABEL_EDIT_ROLES = ["super_admin", "admin"];

// ─── types ────────────────────────────────────────────────────────────────────

interface TrackerLabel {
  id: string;
  name: string;
  color: string;
}

interface Comment {
  id: string;
  user_id: string;
  message: string;
  type: string;
  created_at: string;
  user_name?: string;
  user_avatar?: string | null;
}

interface Attachment {
  id: string;
  file_key: string;
  file_name: string | null;
  url: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_at: string | null;
  uploaded_by: string | null;
  uploader_name?: string;
}

interface POItem {
  id: string;
  product_name: string;
  planned_qty: number;
  qty_received: number;
  unit: string;
}

interface Props {
  planOrder: PlanOrderHeader;
  column: "plan_order" | "processing" | "in_stock" | "cancelled";
  checklists: ChecklistItem[];
  canToggleChecklist: boolean;
  onClose: () => void;
  toggleChecklist: (planOrderId: string, checklistKey: string) => Promise<void>;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function getDisplayFileName(att: { file_key: string; file_name?: string | null }): string {
  if (att.file_name) return att.file_name;
  const raw = att.file_key.split("/").pop() || "attachment";
  const match = raw.match(/^\d+_(.+)$/);
  return match ? match[1] : raw;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(Math.round(value));
}

// ─── component ────────────────────────────────────────────────────────────────

export default function TrackerPOCardDetail({
  planOrder,
  column,
  checklists,
  canToggleChecklist,
  onClose,
  toggleChecklist,
}: Props) {
  const { user } = useAuth();

  // Labels state
  const [allLabels, setAllLabels] = useState<TrackerLabel[]>([]);
  const [cardLabelIds, setCardLabelIds] = useState<string[]>([]);
  const [labelPopoverOpen, setLabelPopoverOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0]);
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [labelSearchQuery, setLabelSearchQuery] = useState("");
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editLabelName, setEditLabelName] = useState("");
  const [editLabelColor, setEditLabelColor] = useState("");

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [allMentionUsers, setAllMentionUsers] = useState<{ id: string; name: string; avatar_url: string | null }[]>([]);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Attachments state
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PO Items
  const [poItems, setPOItems] = useState<POItem[]>([]);

  // User role
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setUserRole(data?.role ?? null));
  }, [user]);

  const canManageLabels = userRole ? LABEL_MANAGE_ROLES.includes(userRole) : false;
  const canEditLabels = userRole ? LABEL_EDIT_ROLES.includes(userRole) : false;

  // ─── fetch functions ─────────────────────────────────────────────────────

  const fetchLabels = useCallback(async () => {
    const { data: all } = await supabase.from("po_tracker_labels").select("id, name, color").order("name");
    setAllLabels((all as TrackerLabel[]) || []);

    const { data: cardLabels } = await supabase
      .from("po_tracker_card_labels")
      .select("label_id")
      .eq("plan_order_id", planOrder.id);
    setCardLabelIds((cardLabels || []).map((cl: any) => cl.label_id));
  }, [planOrder.id]);

  const fetchComments = useCallback(async () => {
    const { data } = await supabase
      .from("po_tracker_comments")
      .select("id, user_id, message, type, created_at")
      .eq("plan_order_id", planOrder.id)
      .order("created_at", { ascending: true });

    if (!data) { setComments([]); return; }

    const userIds = [...new Set(data.map((c: any) => c.user_id).filter(Boolean))] as string[];
    const { data: profiles } = userIds.length > 0
      ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds)
      : { data: [] };

    const profileMap: Record<string, { name: string; avatar: string | null }> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.id] = { name: p.full_name, avatar: p.avatar_url }; });

    setComments(
      data.map((c: any) => ({
        ...c,
        user_name: profileMap[c.user_id]?.name || "Unknown",
        user_avatar: profileMap[c.user_id]?.avatar || null,
      }))
    );
  }, [planOrder.id]);

  const fetchAttachments = useCallback(async () => {
    const { data } = await supabase
      .from("attachments")
      .select("*")
      .eq("ref_table", "plan_order_headers")
      .eq("ref_id", planOrder.id)
      .order("uploaded_at", { ascending: false });

    if (!data) { setAttachments([]); return; }

    const userIds = [...new Set(data.map((a: any) => a.uploaded_by).filter(Boolean))] as string[];
    const { data: profiles } = userIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] };

    const profileMap: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.id] = p.full_name; });

    const withUrls = await Promise.all(
      data.map(async (a: any) => {
        const { data: signed } = await supabase.storage.from("documents").createSignedUrl(a.file_key, 1800);
        return {
          ...a,
          url: signed?.signedUrl || a.url,
          uploader_name: a.uploaded_by ? profileMap[a.uploaded_by] || "Unknown" : undefined,
        };
      })
    );
    setAttachments(withUrls);
  }, [planOrder.id]);

  const fetchPOItems = useCallback(async () => {
    const { data } = await supabase
      .from("plan_order_items")
      .select(`
        id, planned_qty, qty_received,
        product:products(
          id, name, sku,
          unit:units(name)
        )
      `)
      .eq("plan_order_id", planOrder.id);

    setPOItems(
      (data || []).map((item: any) => ({
        id: item.id,
        product_name: item.product?.name || "-",
        planned_qty: item.planned_qty,
        qty_received: item.qty_received || 0,
        unit: item.product?.unit?.name || "-",
      }))
    );
  }, [planOrder.id]);

  // Mention users
  useEffect(() => {
    supabase.from("profiles_chat_view").select("id, full_name, avatar_url").then(({ data }) => {
      if (data) {
        setAllMentionUsers(data.map((u: any) => ({ id: u.id || "", name: u.full_name || "User", avatar_url: u.avatar_url })));
      }
    });
  }, []);

  const filteredMentionUsers = useMemo(() => {
    const q = mentionSearch.toLowerCase();
    return allMentionUsers.filter((u) => u.id !== user?.id && (!q || u.name.toLowerCase().includes(q)));
  }, [allMentionUsers, mentionSearch, user?.id]);

  // Mark as read
  const markCommentsAsRead = useCallback(async () => {
    if (!user) return;
    await supabase.from("po_tracker_comment_reads").upsert(
      { plan_order_id: planOrder.id, user_id: user.id, last_read_at: new Date().toISOString() },
      { onConflict: "plan_order_id,user_id" }
    );
  }, [planOrder.id, user]);

  // Initial fetch
  useEffect(() => {
    fetchLabels();
    fetchComments();
    fetchAttachments();
    fetchPOItems();
    markCommentsAsRead();
  }, [fetchLabels, fetchComments, fetchAttachments, fetchPOItems, markCommentsAsRead]);

  // Realtime comments
  useEffect(() => {
    const ch = supabase
      .channel(`tracker-po-comments-${planOrder.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "po_tracker_comments",
        filter: `plan_order_id=eq.${planOrder.id}`,
      }, () => { fetchComments(); markCommentsAsRead(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [planOrder.id, fetchComments, markCommentsAsRead]);

  // Auto-scroll comments to bottom
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  // ─── label handlers ──────────────────────────────────────────────────────

  const toggleLabel = async (labelId: string) => {
    if (!canManageLabels) return;
    const isAssigned = cardLabelIds.includes(labelId);
    const label = allLabels.find((l) => l.id === labelId);

    if (isAssigned) {
      await supabase.from("po_tracker_card_labels")
        .delete()
        .eq("plan_order_id", planOrder.id)
        .eq("label_id", labelId);

      // Activity log
      if (user && label) {
        const userName = (user as any).name || (user as any).email || "User";
        await supabase.from("po_tracker_comments").insert({
          plan_order_id: planOrder.id,
          user_id: user.id,
          message: `${userName} menghapus label '${label.name}'`,
          type: "activity",
        });
      }
    } else {
      await supabase.from("po_tracker_card_labels")
        .insert({ plan_order_id: planOrder.id, label_id: labelId });

      if (user && label) {
        const userName = (user as any).name || (user as any).email || "User";
        await supabase.from("po_tracker_comments").insert({
          plan_order_id: planOrder.id,
          user_id: user.id,
          message: `${userName} menambahkan label '${label.name}'`,
          type: "activity",
        });
      }
    }
    fetchLabels();
    fetchComments();
  };

  const createLabel = async () => {
    if (!newLabelName.trim() || !user) return;
    setCreatingLabel(true);
    try {
      await supabase.from("po_tracker_labels").insert({
        name: newLabelName.trim(),
        color: newLabelColor,
        created_by: user.id,
      });
      setNewLabelName("");
      setNewLabelColor(LABEL_COLORS[0]);
      await fetchLabels();
    } finally {
      setCreatingLabel(false);
    }
  };

  const saveEditLabel = async (labelId: string) => {
    if (!editLabelName.trim()) return;
    await supabase.from("po_tracker_labels")
      .update({ name: editLabelName.trim(), color: editLabelColor })
      .eq("id", labelId);
    setEditingLabelId(null);
    await fetchLabels();
  };

  const deleteLabel = async (labelId: string) => {
    await supabase.from("po_tracker_labels").delete().eq("id", labelId);
    await fetchLabels();
  };

  // ─── comment handlers ─────────────────────────────────────────────────────

  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !showMentionList) {
      e.preventDefault();
      sendComment();
    }
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewComment(val);

    const cursor = e.target.selectionStart ?? 0;
    const textBefore = val.slice(0, cursor);
    const atIdx = textBefore.lastIndexOf("@");
    if (atIdx !== -1 && !textBefore.slice(atIdx + 1).includes(" ")) {
      setMentionStartIndex(atIdx);
      setMentionSearch(textBefore.slice(atIdx + 1));
      setShowMentionList(true);
    } else {
      setShowMentionList(false);
    }
  };

  const insertMention = (u: { id: string; name: string }) => {
    const before = newComment.slice(0, mentionStartIndex);
    const after = newComment.slice(commentRef.current?.selectionStart ?? newComment.length);
    setNewComment(`${before}@${u.name} ${after}`);
    setShowMentionList(false);
    commentRef.current?.focus();
  };

  const sendComment = async () => {
    if (!newComment.trim() || !user) return;
    setSendingComment(true);
    const text = newComment.trim();

    const { error } = await supabase.from("po_tracker_comments").insert({
      plan_order_id: planOrder.id,
      user_id: user.id,
      message: text,
      type: "comment",
    });

    if (error) {
      toast.error("Gagal mengirim komentar");
      setSendingComment(false);
      return;
    }

    setNewComment("");
    setShowMentionList(false);

    try {
      const senderName = (user as any).name || (user as any).email || "User";
      notifyKanbanComment(planOrder.plan_number, senderName, text, planOrder.id, user.id);

      // Check mentions
      const mentions = text.match(/@[\w\s]+/g) || [];
      const mentionedNames = mentions.map((m: string) => m.slice(1).trim());
      const mentionedUsers = allMentionUsers.filter((u2) =>
        mentionedNames.some((n) => u2.name.toLowerCase() === n.toLowerCase())
      );
      if (mentionedUsers.length > 0) {
        notifyKanbanMention(
          mentionedUsers.map((u2) => u2.id),
          planOrder.plan_number,
          senderName,
          text,
          planOrder.id,
          user.id
        );
      }

      await markCommentsAsRead();
    } catch {
      toast.error("Gagal mengirim komentar");
    } finally {
      setSendingComment(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    await supabase.from("po_tracker_comments").delete().eq("id", commentId);
    fetchComments();
  };

  // ─── attachment handlers ──────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingFile(true);

    try {
      const fileKey = `tracker-po/${planOrder.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(fileKey, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = await supabase.storage.from("documents").createSignedUrl(fileKey, 1800);

      await supabase.from("attachments").insert({
        file_key: fileKey,
        file_name: file.name,
        url: urlData?.signedUrl || "",
        mime_type: file.type,
        file_size: file.size,
        module_name: "Tracker PO",
        ref_table: "plan_order_headers",
        ref_id: planOrder.id,
        uploaded_by: user.id,
      });

      // Activity log
      const userName = (user as any).name || (user as any).email || "User";
      await supabase.from("po_tracker_comments").insert({
        plan_order_id: planOrder.id,
        user_id: user.id,
        message: `${userName} menambahkan lampiran '${file.name}'`,
        type: "activity",
      });

      await fetchAttachments();
      await fetchComments();
      toast.success("File berhasil diupload");
    } catch {
      toast.error("Gagal mengupload file");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const downloadAttachment = async (att: Attachment) => {
    setDownloadingId(att.id);
    try {
      const { data } = await supabase.storage.from("documents").download(att.file_key);
      if (!data) throw new Error("No data");
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = getDisplayFileName(att);
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Gagal mengunduh file");
    } finally {
      setDownloadingId(null);
    }
  };

  const deleteAttachment = async (att: Attachment) => {
    if (!user) return;
    const canDelete =
      att.uploaded_by === user.id ||
      (userRole && LABEL_EDIT_ROLES.includes(userRole));
    if (!canDelete) { toast.error("Anda tidak dapat menghapus file ini"); return; }

    await supabase.storage.from("documents").remove([att.file_key]);
    await supabase.from("attachments").delete().eq("id", att.id);

    const userName = (user as any).name || (user as any).email || "User";
    await supabase.from("po_tracker_comments").insert({
      plan_order_id: planOrder.id,
      user_id: user.id,
      message: `${userName} menghapus lampiran '${getDisplayFileName(att)}'`,
      type: "activity",
    });

    await fetchAttachments();
    await fetchComments();
    toast.success("File dihapus");
  };

  // ─── derived ─────────────────────────────────────────────────────────────

  const activeCardLabels = useMemo(
    () => allLabels.filter((l) => cardLabelIds.includes(l.id)),
    [allLabels, cardLabelIds]
  );

  const checklistKeys = CHECKLIST_LABELS_BY_COLUMN[column] || [];

  const filteredLabels = useMemo(() => {
    const q = labelSearchQuery.toLowerCase();
    return q ? allLabels.filter((l) => l.name.toLowerCase().includes(q)) : allLabels;
  }, [allLabels, labelSearchQuery]);

  // ─── render ──────────────────────────────────────────────────────────────

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[100dvh] md:max-h-[90vh] flex flex-col p-0 w-[100vw] md:w-auto h-[100dvh] md:h-auto rounded-none md:rounded-lg">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            {planOrder.plan_number}
          </DialogTitle>
        </DialogHeader>

        {/* Labels row (Trello-style inline like Delivery card) */}
        <div className="flex flex-wrap items-center gap-1.5 px-6 pb-2">
          <Badge className={STATUS_COLORS[planOrder.status] ?? "bg-gray-100 text-gray-700"}>
            {STATUS_LABELS[planOrder.status] ?? planOrder.status}
          </Badge>
          {activeCardLabels.map((l) => (
            <Badge
              key={l.id}
              className="text-[11px] text-white border-0 gap-1"
              style={{ backgroundColor: l.color }}
            >
              {l.name}
              {canManageLabels && (
                <X className="h-3 w-3 cursor-pointer hover:opacity-70" onClick={() => toggleLabel(l.id)} />
              )}
            </Badge>
          ))}
          {canManageLabels && (
            <Popover open={labelPopoverOpen} onOpenChange={setLabelPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 gap-1">
                  <Tag className="h-3 w-3" /> Label
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="start">
                <div className="space-y-2">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      placeholder="Cari label..."
                      value={labelSearchQuery}
                      onChange={(e) => setLabelSearchQuery(e.target.value)}
                      className="pl-7 h-7 text-sm"
                    />
                  </div>

                  {/* Label list */}
                  <div className="max-h-36 overflow-y-auto space-y-0.5">
                    {filteredLabels.map((label) => (
                      <div key={label.id} className="flex items-center gap-2 group">
                        {editingLabelId === label.id ? (
                          <div className="flex-1 flex items-center gap-1">
                            <Input
                              value={editLabelName}
                              onChange={(e) => setEditLabelName(e.target.value)}
                              className="h-6 text-xs flex-1"
                              onKeyDown={(e) => { if (e.key === "Enter") saveEditLabel(label.id); }}
                            />
                            {LABEL_COLORS.map((c) => (
                              <div
                                key={c}
                                className={`w-4 h-4 rounded-full cursor-pointer border-2 ${editLabelColor === c ? "border-gray-700" : "border-transparent"}`}
                                style={{ backgroundColor: c }}
                                onClick={() => setEditLabelColor(c)}
                              />
                            ))}
                            <button onClick={() => saveEditLabel(label.id)} className="text-green-600 hover:text-green-700">
                              <Check className="w-3 h-3" />
                            </button>
                            <button onClick={() => setEditingLabelId(null)} className="text-gray-400 hover:text-gray-600">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <Checkbox
                              checked={cardLabelIds.includes(label.id)}
                              onCheckedChange={() => toggleLabel(label.id)}
                              disabled={!canManageLabels}
                            />
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                            <span className="text-sm flex-1 truncate">{label.name}</span>
                            {canEditLabels && (
                              <div className="hidden group-hover:flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setEditingLabelId(label.id);
                                    setEditLabelName(label.name);
                                    setEditLabelColor(label.color);
                                  }}
                                  className="text-gray-400 hover:text-gray-600"
                                >
                                  <Search className="w-3 h-3" />
                                </button>
                                <button onClick={() => deleteLabel(label.id)} className="text-red-400 hover:text-red-600">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Create label */}
                  {canManageLabels && (
                    <div className="border-t pt-2 space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Buat label baru</Label>
                      <Input
                        placeholder="Nama label"
                        value={newLabelName}
                        onChange={(e) => setNewLabelName(e.target.value)}
                        className="h-7 text-sm"
                        onKeyDown={(e) => { if (e.key === "Enter") createLabel(); }}
                      />
                      <div className="flex items-center gap-1 flex-wrap">
                        {LABEL_COLORS.map((c) => (
                          <div
                            key={c}
                            className={`w-5 h-5 rounded-full cursor-pointer border-2 ${newLabelColor === c ? "border-gray-700 scale-110" : "border-transparent"}`}
                            style={{ backgroundColor: c }}
                            onClick={() => setNewLabelColor(c)}
                          />
                        ))}
                      </div>
                      <Button size="sm" className="w-full h-7 text-xs" disabled={!newLabelName.trim() || creatingLabel} onClick={createLabel}>
                        {creatingLabel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
                        Buat Label
                      </Button>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 border-t overflow-y-auto md:overflow-hidden">
          {/* LEFT PANEL */}
          <ScrollArea className="md:flex-1 min-w-0 md:border-r">
            <div className="space-y-5 p-4">

              {/* PO Info */}
              <section>
                <h3 className="text-sm font-semibold text-foreground mb-2">Informasi PO</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  <div className="text-muted-foreground">Supplier</div>
                  <div className="font-medium">{planOrder.supplier?.name ?? "-"}</div>
                  <div className="text-muted-foreground">Tanggal Plan</div>
                  <div>{planOrder.plan_date ? format(new Date(planOrder.plan_date), "d MMM yyyy", { locale: idLocale }) : "-"}</div>
                  <div className="text-muted-foreground">Expected Delivery</div>
                  <div>{planOrder.expected_delivery_date ? format(new Date(planOrder.expected_delivery_date), "d MMM yyyy", { locale: idLocale }) : "-"}</div>
                  <div className="text-muted-foreground">Grand Total</div>
                  <div className="font-semibold">{formatCurrency(planOrder.grand_total)}</div>
                  {planOrder.reference_no && (
                    <>
                      <div className="text-muted-foreground">Reference No</div>
                      <div>{planOrder.reference_no}</div>
                    </>
                  )}
                  {planOrder.notes && (
                    <>
                      <div className="text-muted-foreground">Catatan</div>
                      <div className="col-span-1 whitespace-pre-wrap">{planOrder.notes}</div>
                    </>
                  )}
                </div>
              </section>

              {/* Checklist */}
              {checklistKeys.length > 0 && (
                <section className="border border-border rounded-lg p-3 bg-card/50">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary" /> Checklist
                  </h3>
                  <div className="space-y-2">
                    {checklistKeys.map((key) => {
                      const item = checklists.find((c) => c.checklist_key === key);
                      return (
                        <div key={key} className="flex items-start gap-2 p-2 rounded-md border border-border bg-background">
                          <Checkbox
                            checked={!!item?.is_checked}
                            disabled={!canToggleChecklist || !!item?.is_checked}
                            onCheckedChange={() => toggleChecklist(planOrder.id, key)}
                            className="mt-0.5"
                          />
                          <div>
                            <p className={`text-sm ${item?.is_checked ? "line-through text-gray-400" : "text-gray-800"}`}>
                              {CHECKLIST_LABEL_NAMES[key]}
                            </p>
                            {item?.is_checked && item.checker_name && (
                              <p className="text-xs text-gray-400">
                                Oleh {item.checker_name}{item.checked_at ? ` · ${format(new Date(item.checked_at), "d MMM yyyy HH:mm")}` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* PO Items */}
              {poItems.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Items</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 text-gray-600 font-medium">Produk</th>
                          <th className="text-right px-3 py-2 text-gray-600 font-medium">Qty Plan</th>
                          <th className="text-right px-3 py-2 text-gray-600 font-medium">Qty Diterima</th>
                          <th className="text-left px-3 py-2 text-gray-600 font-medium">Satuan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {poItems.map((item) => (
                          <tr key={item.id} className="border-t">
                            <td className="px-3 py-2">{item.product_name}</td>
                            <td className="px-3 py-2 text-right">{item.planned_qty}</td>
                            <td className="px-3 py-2 text-right">{item.qty_received}</td>
                            <td className="px-3 py-2">{item.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Attachments */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    Lampiran <Badge variant="secondary" className="h-5 text-[10px] px-1.5">{attachments.length}</Badge>
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                  >
                    {uploadingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Upload
                  </Button>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
                </div>

                {/* Attachment list */}
                <div className="space-y-2">
                  {attachments.map((att) => {
                    const name = getDisplayFileName(att);
                    const nameLower = name.toLowerCase();
                    const isImage = att.mime_type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(nameLower);
                    const isPdf = att.mime_type === "application/pdf" || nameLower.endsWith(".pdf");
                    return (
                      <div key={att.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                        {isImage ? <Image className="w-4 h-4 text-primary shrink-0" /> : <FileText className="w-4 h-4 text-muted-foreground shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <p className="text-xs text-muted-foreground">
                            {att.uploader_name}{att.file_size ? ` · ${formatBytes(att.file_size)}` : ""}
                            {att.uploaded_at ? ` · ${format(new Date(att.uploaded_at), "d MMM")}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {(isImage || isPdf) && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="w-7 h-7"
                              onClick={() => setPreviewAttachment(att)}
                              title="Lihat"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-7 h-7"
                            disabled={downloadingId === att.id}
                            onClick={() => downloadAttachment(att)}
                            title="Download"
                          >
                            {downloadingId === att.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-7 h-7 text-destructive hover:text-destructive/80"
                            onClick={() => deleteAttachment(att)}
                            title="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {attachments.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">Belum ada lampiran</p>
                  )}
                </div>
              </section>
            </div>
          </ScrollArea>

          {/* RIGHT PANEL - Comments & Activity */}
          <div className="w-full md:w-[340px] flex-shrink-0 flex flex-col md:min-h-0 border-t md:border-t-0">
            <div className="flex items-center gap-2 px-4 py-3 border-b">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold">Comments & Activity</span>
              {comments.length > 0 && (
                <Badge variant="secondary" className="h-4 text-[10px] px-1.5">{comments.length}</Badge>
              )}
            </div>

            {/* Comment input (at TOP, mirip Delivery card) */}
            <div className="px-4 py-3 border-b relative">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Textarea
                    ref={commentRef}
                    value={newComment}
                    onChange={handleCommentChange}
                    onKeyDown={handleCommentKeyDown}
                    placeholder="Tulis komentar... (ketik @ untuk mention)"
                    className="text-xs min-h-[50px] resize-none"
                  />
                  {showMentionList && filteredMentionUsers.length > 0 && (
                    <div className="absolute top-full left-0 right-8 mt-1 bg-popover border rounded-lg shadow-xl max-h-40 overflow-y-auto z-[9999]">
                      {filteredMentionUsers.slice(0, 8).map((u) => (
                        <button
                          key={u.id}
                          className="w-full flex items-center gap-2 p-2 hover:bg-muted transition-colors text-left"
                          onClick={() => insertMention(u)}
                        >
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[9px]">{u.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs font-medium truncate">{u.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 self-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setNewComment((prev) => prev + "@");
                      setShowMentionList(true);
                      setMentionStartIndex(newComment.length);
                      setMentionSearch("");
                      commentRef.current?.focus();
                    }}
                  >
                    <AtSign className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={!newComment.trim() || sendingComment}
                    onClick={sendComment}
                  >
                    {sendingComment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            </div>

            {/* Comments list */}
            <ScrollArea className="md:flex-1">
              <div className="px-4 py-3">
                {comments.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <p className="text-xs">Belum ada komentar</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                  {comments.map((c) => {
                    if (c.type === "activity") {
                      return (
                        <div key={c.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <div className="w-1 h-1 bg-muted-foreground/40 rounded-full mt-1.5 shrink-0" />
                          <div className="flex-1">
                            <span className="italic">{c.message}</span>
                            <span className="ml-1 text-muted-foreground/60">
                              · {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: idLocale })}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    const isOwn = c.user_id === user?.id;
                    return (
                      <div key={c.id} className="flex gap-2 group">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-primary">
                            {(c.user_name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold">{c.user_name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: idLocale })}
                            </span>
                            {(isOwn || (userRole && LABEL_EDIT_ROLES.includes(userRole))) && (
                              <button
                                onClick={() => deleteComment(c.id)}
                                className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 ml-auto"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          <p className="text-xs mt-0.5 whitespace-pre-wrap break-words">
                            {c.message}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={commentsEndRef} />
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t flex-col sm:flex-row gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} className="sm:ml-auto">Tutup</Button>
        </DialogFooter>
      </DialogContent>

      {/* Attachment Preview Dialog */}
      <Dialog open={!!previewAttachment} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
        <DialogContent className="max-w-5xl max-h-[92vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle className="flex items-center justify-between pr-8 gap-2">
              <span className="truncate text-sm">{previewAttachment ? getDisplayFileName(previewAttachment) : ""}</span>
              {previewAttachment && (
                <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => window.open(previewAttachment.url, "_blank", "noopener,noreferrer")}>
                  <ExternalLink className="w-3.5 h-3.5" /> Buka di tab baru
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-muted/30 flex items-center justify-center">
            {(() => {
              if (!previewAttachment) return null;
              const n = getDisplayFileName(previewAttachment).toLowerCase();
              const isImg = previewAttachment.mime_type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(n);
              const isPdf = previewAttachment.mime_type === "application/pdf" || n.endsWith(".pdf");
              if (isImg) return <img src={previewAttachment.url} alt={getDisplayFileName(previewAttachment)} className="max-w-full max-h-[80vh] object-contain" />;
              if (isPdf) return <iframe src={previewAttachment.url} title={getDisplayFileName(previewAttachment)} className="w-full h-[80vh] border-0 bg-white" />;
              return null;
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
