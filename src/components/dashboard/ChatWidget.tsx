import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Send,
  X,
  Maximize2,
  Minimize2,
  Clock,
  Smile,
  Reply,
  AtSign,
  Paperclip,
  Image,
  FileText,
  Download,
  Loader2,
  Pin,
  PinOff,
  Pencil,
  Check,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { useTheme } from "@/contexts/ThemeContext";
import ktalkIcon from "@/assets/ktalk-icon.png";

interface ChatReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string | null;
  message: string;
  is_global: boolean;
  created_at: string;
  read_at: string | null;
  reply_to_id: string | null;
  mentions: string[] | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  is_pinned?: boolean;
  edited_at?: string | null;
  sender?: {
    email?: string; // Optional - not exposed in chat view for privacy
    full_name: string | null;
    avatar_url: string | null;
  };
  reply_to?: ChatMessage | null;
  reactions?: ChatReaction[];
}

interface OnlineUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

interface TypingUser {
  id: string;
  name: string;
  isTyping: boolean;
  chatTarget: string | null;
}

interface ChatWidgetProps {
  onlineUsers?: OnlineUser[];
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

export const ChatWidget = ({ onlineUsers = [] }: ChatWidgetProps) => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [selectedUser, setSelectedUser] = useState<OnlineUser | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [allUsers, setAllUsers] = useState<OnlineUser[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editText, setEditText] = useState("");
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
  const [globalUnreadCount, setGlobalUnreadCount] = useState(0);
  const [unreadByUser, setUnreadByUser] = useState<Record<string, number>>({});
  const [globalChatUnread, setGlobalChatUnread] = useState(0);
  const [lastSeenGlobal, setLastSeenGlobal] = useState<string>(() => {
    return localStorage.getItem('ktalk_last_seen_global') || new Date(0).toISOString();
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const chatCardRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    if (isMinimized) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (chatCardRef.current && !chatCardRef.current.contains(target)) {
        // Don't close if clicking inside a popover portal (emoji picker, reaction picker, etc.)
        const popoverContent = (target as Element)?.closest?.('[data-radix-popper-content-wrapper], [role="dialog"], .EmojiPickerReact');
        if (popoverContent) return;
        setIsMinimized(true);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMinimized]);

  // Fetch all users for mentions using secure view (excludes email for privacy)
  useEffect(() => {
    const fetchUsers = async () => {
      // Use profiles_chat_view which only exposes id, full_name, avatar_url (no email)
      const { data } = await supabase.from("profiles_chat_view").select("id, full_name, avatar_url");

      if (data) {
        setAllUsers(
          data.map((u) => ({
            id: u.id,
            email: "", // Email not exposed in chat view for privacy
            name: u.full_name || "User",
            avatar_url: u.avatar_url,
          })),
        );
      }
    };
    fetchUsers();
  }, []);

  const filteredMentionUsers = useMemo(() => {
    if (!mentionSearch) return allUsers.filter((u) => u.id !== user?.id);
    const search = mentionSearch.toLowerCase();
    return allUsers.filter(
      (u) => u.id !== user?.id && u.name.toLowerCase().includes(search),
    );
  }, [allUsers, mentionSearch, user?.id]);

  // Fetch messages with reactions
  const fetchMessages = async () => {
    if (!user) return;

    let query = supabase.from("chat_messages").select("*").order("created_at", { ascending: true });

    if (selectedUser) {
      query = query.or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${user.id})`,
      );
    } else {
      query = query.eq("is_global", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching messages:", error);
      return;
    }

    const messageIds = data?.map((m) => m.id) || [];
    const senderIds = [...new Set(data?.map((m) => m.sender_id) || [])];
    const replyIds = [...new Set(data?.filter((m) => m.reply_to_id).map((m) => m.reply_to_id) || [])];

    // Fetch profiles using secure view (excludes email for privacy)
    const { data: profiles } = await supabase
      .from("profiles_chat_view")
      .select("id, full_name, avatar_url")
      .in("id", senderIds);

    // Fetch reactions
    let reactions: ChatReaction[] = [];
    if (messageIds.length > 0) {
      const { data: reactionsData } = await supabase.from("chat_reactions").select("*").in("message_id", messageIds);
      reactions = reactionsData || [];
    }

    // Fetch replied messages
    let repliedMessages: ChatMessage[] = [];
    if (replyIds.length > 0) {
      const { data: replies } = await supabase
        .from("chat_messages")
        .select("*")
        .in("id", replyIds as string[]);

      if (replies) {
        const replySenderIds = [...new Set(replies.map((r) => r.sender_id))];
        // Fetch profiles using secure view (excludes email for privacy)
        const { data: replyProfiles } = await supabase
          .from("profiles_chat_view")
          .select("id, full_name, avatar_url")
          .in("id", replySenderIds);

        repliedMessages = replies.map((msg) => ({
          ...msg,
          sender: replyProfiles?.find((p) => p.id === msg.sender_id),
        }));
      }
    }

    const messagesWithSender =
      data?.map((msg) => ({
        ...msg,
        sender: profiles?.find((p) => p.id === msg.sender_id),
        reply_to: repliedMessages.find((r) => r.id === msg.reply_to_id) || null,
        reactions: reactions.filter((r) => r.message_id === msg.id),
      })) || [];

    setMessages(messagesWithSender);

    const unread = messagesWithSender.filter((m) => m.receiver_id === user.id && !m.read_at).length;
    setUnreadCount(unread);
    
    // Extract pinned messages
    const pinned = messagesWithSender.filter((m) => m.is_pinned);
    setPinnedMessages(pinned);
  };

  // Fetch global unread count (for badge when chat minimized)
  const fetchGlobalUnreadCount = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact" })
      .eq("receiver_id", user.id)
      .is("read_at", null);
    
    if (!error && data) {
      setGlobalUnreadCount(data.length);
    }
  };

  // Fetch unread count per user (for badge on each user tab)
  const fetchUnreadByUser = async () => {
    if (!user) return;
    
    // Fetch private unread messages grouped by sender
    const { data: privateUnread, error: privateError } = await supabase
      .from("chat_messages")
      .select("sender_id")
      .eq("receiver_id", user.id)
      .is("read_at", null)
      .eq("is_global", false);
    
    if (!privateError && privateUnread) {
      const countByUser: Record<string, number> = {};
      privateUnread.forEach((msg) => {
        countByUser[msg.sender_id] = (countByUser[msg.sender_id] || 0) + 1;
      });
      setUnreadByUser(countByUser);
    }

    // Fetch global chat unread (messages in global chat not from current user, after last seen)
    const { data: globalUnread, error: globalError } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("is_global", true)
      .neq("sender_id", user.id)
      .gt("created_at", lastSeenGlobal);
    
    if (!globalError && globalUnread) {
      setGlobalChatUnread(globalUnread.length);
    }
  };

  useEffect(() => {
    fetchGlobalUnreadCount();
    fetchUnreadByUser();
  }, [user]);

  // Mark messages as read when viewing a chat
  const markMessagesAsRead = async () => {
    if (!user) return;

    if (selectedUser) {
      // Mark private messages from selected user as read
      await supabase
        .from("chat_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("receiver_id", user.id)
        .eq("sender_id", selectedUser.id)
        .is("read_at", null);
    }
    
    // Refresh unread counts after marking as read
    // Small delay to let the DB update propagate
    setTimeout(() => {
      fetchGlobalUnreadCount();
      fetchUnreadByUser();
    }, 300);
  };

  // Mark messages as read when opening a chat or switching users
  useEffect(() => {
    if (!isMinimized && user) {
      markMessagesAsRead();
      // Mark global chat as seen when viewing it
      if (selectedUser === null) {
        const now = new Date().toISOString();
        localStorage.setItem('ktalk_last_seen_global', now);
        setLastSeenGlobal(now);
        setGlobalChatUnread(0);
      }
    }
  }, [isMinimized, selectedUser, user]);

  // Setup typing indicator
  useEffect(() => {
    if (!user) return;

    const typingChannel = supabase.channel("typing-indicators", {
      config: { presence: { key: user.id } },
    });

    typingChannel
      .on("presence", { event: "sync" }, () => {
        const state = typingChannel.presenceState();
        const typing: TypingUser[] = [];

        Object.keys(state).forEach((key) => {
          if (key === user.id) return;
          const presences = state[key] as unknown as TypingUser[];
          if (presences && presences.length > 0 && presences[0].isTyping) {
            typing.push(presences[0]);
          }
        });

        setTypingUsers(typing);
      })
      .subscribe();

    typingChannelRef.current = typingChannel;

    return () => {
      typingChannel.unsubscribe();
    };
  }, [user]);

  // Auto-mark as read when chat is open and new messages arrive
  const autoMarkReadIfOpen = useCallback(async (newMsg: any) => {
    if (!user || isMinimized) return;
    
    // If viewing global chat and a new global message arrives, update lastSeenGlobal
    if (!selectedUser && newMsg.is_global && newMsg.sender_id !== user.id) {
      const now = new Date().toISOString();
      localStorage.setItem('ktalk_last_seen_global', now);
      setLastSeenGlobal(now);
      setGlobalChatUnread(0);
    }
    
    // If viewing private chat with selectedUser and a message from them arrives, mark as read
    if (selectedUser && newMsg.sender_id === selectedUser.id && newMsg.receiver_id === user.id) {
      await supabase
        .from("chat_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", newMsg.id)
        .is("read_at", null);
    }
  }, [user, isMinimized, selectedUser]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!user) return;

    fetchMessages();

    const channel = supabase
      .channel("chat-realtime-combined")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, (payload) => {
        const newMsg = payload.new as any;
        
        // Play sound for any new message not from current user
        if (payload.eventType === "INSERT" && newMsg.sender_id !== user.id) {
          const isForMe = newMsg.is_global || newMsg.receiver_id === user.id || newMsg.mentions?.includes(user.id);
          
          // Only play sound if chat is minimized or viewing different chat
          const isCurrentlyViewing = !isMinimized && (
            (newMsg.is_global && !selectedUser) ||
            (selectedUser && newMsg.sender_id === selectedUser.id)
          );
          
          if (isForMe && !isCurrentlyViewing) {
            try {
              const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
              const oscillator = audioContext.createOscillator();
              const gainNode = audioContext.createGain();
              oscillator.connect(gainNode);
              gainNode.connect(audioContext.destination);
              
              // Different sound for mentions vs regular messages
              if (newMsg.mentions?.includes(user.id)) {
                oscillator.frequency.value = 880;
                gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.3);
                toast.info("Anda dimention dalam chat!");
              } else {
                oscillator.frequency.value = 600;
                gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.15);
              }
            } catch (e) {}
          }
          
          // Auto-mark as read if chat is open and viewing this conversation
          if (payload.eventType === "INSERT") {
            autoMarkReadIfOpen(newMsg);
          }
        }
        
        fetchMessages();
        fetchGlobalUnreadCount();
        fetchUnreadByUser();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions" }, () => {
        fetchMessages();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, selectedUser, isMinimized, autoMarkReadIfOpen]);

  useEffect(() => {
    // ScrollArea uses an internal viewport div for scrolling
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      setTimeout(() => {
        viewport.scrollTop = viewport.scrollHeight;
      }, 50);
    }
  }, [messages]);

  useEffect(() => {
    if (!isMinimized) {
      if (inputRef.current) inputRef.current.focus();
      // Scroll to bottom when chat is opened
      const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        setTimeout(() => {
          viewport.scrollTop = viewport.scrollHeight;
        }, 100);
      }
    }
  }, [isMinimized]);

  const updateTypingStatus = useCallback(
    async (isTyping: boolean) => {
      if (!user || !typingChannelRef.current) return;
      await typingChannelRef.current.track({
        id: user.id,
        name: user.name || user.email,
        isTyping,
        chatTarget: selectedUser?.id || null,
      });
    },
    [user, selectedUser],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart || 0;
    setNewMessage(value);

    const textBeforeCursor = value.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      if (!textAfterAt.includes(" ")) {
        setShowMentionList(true);
        setMentionStartIndex(lastAtIndex);
        setMentionSearch(textAfterAt);
      } else {
        setShowMentionList(false);
        setMentionStartIndex(-1);
        setMentionSearch("");
      }
    } else {
      setShowMentionList(false);
      setMentionStartIndex(-1);
      setMentionSearch("");
    }

    updateTypingStatus(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => updateTypingStatus(false), 2000);
  };

  const insertMention = (mentionUser: OnlineUser) => {
    if (mentionStartIndex === -1) return;

    const beforeMention = newMessage.slice(0, mentionStartIndex);
    const afterMention = newMessage.slice(mentionStartIndex + mentionSearch.length + 1);
    const mentionText = `@${mentionUser.name.split(" ")[0]} `;

    setNewMessage(beforeMention + mentionText + afterMention);
    setShowMentionList(false);
    setMentionStartIndex(-1);
    setMentionSearch("");
    inputRef.current?.focus();
  };

  const extractMentions = (text: string): string[] => {
    const mentionedIds: string[] = [];
    const mentionRegex = /@(\S+)/g;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      const mentionName = match[1].toLowerCase();
      const mentionedUser = allUsers.find(
        (u) =>
          u.name.split(" ")[0].toLowerCase() === mentionName || u.email.split("@")[0].toLowerCase() === mentionName,
      );
      if (mentionedUser && !mentionedIds.includes(mentionedUser.id)) {
        mentionedIds.push(mentionedUser.id);
      }
    }

    return mentionedIds;
  };

  // File upload handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File terlalu besar. Maksimal 10MB");
      return;
    }

    setSelectedFile(file);
  };

  const uploadFile = async (): Promise<{ url: string; name: string; type: string; size: number } | null> => {
    if (!selectedFile || !user) return null;

    setUploading(true);
    try {
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from("chat-attachments").upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      return {
        url: fileName,
        name: selectedFile.name,
        type: selectedFile.type,
        size: selectedFile.size,
      };
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Gagal mengupload file");
      return null;
    } finally {
      setUploading(false);
    }
  };

  const sendMessage = async () => {
    if (!user || (!newMessage.trim() && !selectedFile)) return;

    updateTypingStatus(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    let fileData = null;
    if (selectedFile) {
      fileData = await uploadFile();
      if (!fileData && !newMessage.trim()) return;
    }

    const mentions = extractMentions(newMessage);

    const messageData: any = {
      sender_id: user.id,
      receiver_id: selectedUser?.id || null,
      message: newMessage.trim() || (fileData ? `📎 ${fileData.name}` : ""),
      is_global: !selectedUser,
      reply_to_id: replyingTo?.id || null,
      mentions: mentions.length > 0 ? mentions : null,
      file_url: fileData?.url || null,
      file_name: fileData?.name || null,
      file_type: fileData?.type || null,
      file_size: fileData?.size || null,
    };

    const { error } = await supabase.from("chat_messages").insert(messageData);

    if (error) {
      console.error("Error sending message:", error);
      toast.error("Gagal mengirim pesan");
      return;
    }

    // Send Web Push notification to recipients (background)
    try {
      const senderName = user.name || user.email;
      const msgPreview = newMessage.trim().substring(0, 100) || (fileData ? `📎 ${fileData.name}` : "Pesan baru");
      
      const pushPayload: any = {
        title: selectedUser ? `💬 K'talk: ${senderName}` : `💬 K'talk Global: ${senderName}`,
        body: msgPreview,
        data: { tag: 'ktalk', link: '/', type: 'chat' },
        exclude_user_id: user.id, // Don't notify sender
      };

      // If private message, only notify the receiver
      if (selectedUser) {
        pushPayload.user_ids = [selectedUser.id];
      }

      // If mentions, send dedicated mention notification
      if (mentions.length > 0) {
        const { notifyKtalkMention } = await import('@/lib/pushNotifications');
        notifyKtalkMention(mentions, senderName, msgPreview, user.id);
      }

      // For private/global messages (non-mention), send general chat push
      if (mentions.length === 0) {
        if (selectedUser) {
          pushPayload.user_ids = [selectedUser.id];
        }
        supabase.functions.invoke('send-push-notification', {
          body: pushPayload,
        }).catch(err => console.log('Push notification send failed (non-critical):', err));
      }
    } catch (e) {
      // Non-critical - don't block chat
      console.log('Push notification error (non-critical):', e);
    }

    setNewMessage("");
    setReplyingTo(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Reaction handlers
  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;

    const message = messages.find((m) => m.id === messageId);
    const existingReaction = message?.reactions?.find((r) => r.user_id === user.id && r.emoji === emoji);

    if (existingReaction) {
      await supabase.from("chat_reactions").delete().eq("id", existingReaction.id);
    } else {
      await supabase.from("chat_reactions").insert({
        message_id: messageId,
        user_id: user.id,
        emoji,
      });
    }

    setShowReactionPicker(null);
  };

  // Pin/Unpin message
  const togglePinMessage = async (messageId: string, isPinned: boolean) => {
    const { error } = await supabase
      .from("chat_messages")
      .update({ is_pinned: !isPinned })
      .eq("id", messageId);
    
    if (error) {
      console.error("Error toggling pin:", error);
      toast.error("Gagal mengubah pin pesan");
    } else {
      toast.success(isPinned ? "Pesan di-unpin" : "Pesan di-pin");
      fetchMessages();
    }
  };

  // Edit message
  const startEditMessage = (msg: ChatMessage) => {
    setEditingMessage(msg);
    setEditText(msg.message);
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setEditText("");
  };

  const saveEditMessage = async () => {
    if (!editingMessage || !editText.trim()) return;
    
    const { error } = await supabase
      .from("chat_messages")
      .update({ 
        message: editText.trim(), 
        edited_at: new Date().toISOString() 
      })
      .eq("id", editingMessage.id);
    
    if (error) {
      console.error("Error editing message:", error);
      toast.error("Gagal mengedit pesan");
    } else {
      toast.success("Pesan berhasil diedit");
      setEditingMessage(null);
      setEditText("");
      fetchMessages();
    }
  };

  // Handle paste for images
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          if (file.size > 10 * 1024 * 1024) {
            toast.error("File terlalu besar. Maksimal 10MB");
            return;
          }
          setSelectedFile(file);
          toast.info("Gambar dari clipboard siap dikirim");
        }
        break;
      }
    }
  };

  const getFileSignedUrl = async (filePath: string): Promise<string | null> => {
    const { data } = await supabase.storage.from("chat-attachments").createSignedUrl(filePath, 3600);
    return data?.signedUrl || null;
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showMentionList && filteredMentionUsers.length > 0) {
        insertMention(filteredMentionUsers[0]);
      } else {
        sendMessage();
      }
    } else if (e.key === "Escape") {
      setShowMentionList(false);
      setReplyingTo(null);
      setSelectedFile(null);
    }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setNewMessage((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    if (diffHours < 24) return format(date, "HH:mm");
    return format(date, "dd/MM HH:mm");
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderMessageContent = (text: string) => {
    const parts = text.split(/(@\S+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        const mentionName = part.slice(1).toLowerCase();
        const isMentionedUser = allUsers.some(
          (u) => u.name.split(" ")[0].toLowerCase() === mentionName,
        );
        const isCurrentUser =
          user && user.name?.split(" ")[0].toLowerCase() === mentionName;

        if (isMentionedUser) {
          return (
            <span
              key={i}
              className={`font-semibold ${isCurrentUser ? "bg-primary/20 text-primary px-1 rounded" : "text-primary"}`}
            >
              {part}
            </span>
          );
        }
      }
      return part;
    });
  };

  const activeTypingUsers = typingUsers.filter((t) => {
    if (selectedUser) return t.chatTarget === user?.id || t.id === selectedUser.id;
    return t.chatTarget === null;
  });

  const groupReactions = (reactions: ChatReaction[]) => {
    const grouped: Record<string, { count: number; users: string[]; hasOwn: boolean }> = {};
    reactions.forEach((r) => {
      if (!grouped[r.emoji]) {
        grouped[r.emoji] = { count: 0, users: [], hasOwn: false };
      }
      grouped[r.emoji].count++;
      grouped[r.emoji].users.push(r.user_id);
      if (r.user_id === user?.id) grouped[r.emoji].hasOwn = true;
    });
    return grouped;
  };

  const totalUnread = globalUnreadCount + unreadCount + globalChatUnread;
  const floatingWidgetStyle = {
    bottom: "max(1rem, env(safe-area-inset-bottom))",
    right: "max(1rem, env(safe-area-inset-right))",
  } as const;

  if (isMinimized) {
    return (
      <Button
        onClick={() => setIsMinimized(false)}
        className={`fixed h-16 w-16 rounded-full shadow-lg z-50 p-0 bg-background border border-border transition-all duration-300 ease-out hover:scale-110 hover:shadow-[0_0_20px_hsl(var(--primary)/0.45)] ${totalUnread > 0 ? "animate-bounce" : ""}`}
        size="icon"
        style={floatingWidgetStyle}
      >
        <img src={ktalkIcon} alt="K'talk" className="h-full w-full rounded-full object-cover" />
        {totalUnread > 0 && (
          <Badge
            variant="destructive"
            className="absolute top-0 right-0 h-6 w-6 flex items-center justify-center p-0 text-xs font-bold"
          >
            {totalUnread > 99 ? "99+" : totalUnread}
          </Badge>
        )}
      </Button>
    );
  }

  return (
    <Card
      ref={chatCardRef}
      className={`fixed shadow-xl z-50 transition-all duration-300 ${isExpanded ? "w-[500px] h-[600px]" : "w-[350px] h-[450px]"}`}
      style={floatingWidgetStyle}
    >
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <img src={ktalkIcon} alt="K'talk" className="h-9 w-9 object-contain" />
          {selectedUser ? (
            <span className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                {selectedUser.avatar_url && <AvatarImage src={selectedUser.avatar_url} />}
                <AvatarFallback className="text-xs">
                  {getInitials(selectedUser.name || selectedUser.email)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate max-w-[120px]">{selectedUser.name || selectedUser.email}</span>
            </span>
          ) : (
            "Chat Global"
          )}
        </CardTitle>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mr-2">
            <Clock className="h-3 w-3" />
            <span>Auto-hapus 3 hari</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsMinimized(true)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col h-[calc(100%-60px)] p-3 pt-0">
        {/* Online users tabs */}
        <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
          <Button
            variant={selectedUser === null ? "default" : "outline"}
            size="sm"
            className="shrink-0 text-xs h-7 relative"
            onClick={() => setSelectedUser(null)}
          >
            Global
            {globalChatUnread > 0 && selectedUser !== null && (
              <Badge
                variant="destructive"
                className="absolute -top-1.5 -right-1.5 h-4 min-w-4 flex items-center justify-center p-0 text-[10px] font-bold"
              >
                {globalChatUnread > 99 ? "99+" : globalChatUnread}
              </Badge>
            )}
          </Button>
          {onlineUsers
            .filter((u) => u.id !== user?.id)
            .map((onlineUser) => {
              const userUnread = unreadByUser[onlineUser.id] || 0;
              return (
                <Button
                  key={onlineUser.id}
                  variant={selectedUser?.id === onlineUser.id ? "default" : "outline"}
                  size="sm"
                  className="shrink-0 text-xs h-7 relative"
                  onClick={() => setSelectedUser(onlineUser)}
                >
                  {onlineUser.name?.split(" ")[0] || onlineUser.email.split("@")[0]}
                  {userUnread > 0 && selectedUser?.id !== onlineUser.id && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-1.5 -right-1.5 h-4 min-w-4 flex items-center justify-center p-0 text-[10px] font-bold"
                    >
                      {userUnread > 99 ? "99+" : userUnread}
                    </Badge>
                  )}
                </Button>
              );
            })}
        </div>

        {/* Pinned Messages */}
        {pinnedMessages.length > 0 && (
          <div className="mb-2 p-2 bg-warning/10 rounded-lg border border-warning/30">
            <div className="flex items-center gap-1 text-xs text-warning font-medium mb-1">
              <Pin className="h-3 w-3" />
              Pesan Terpin ({pinnedMessages.length})
            </div>
            <div className="space-y-1 max-h-20 overflow-y-auto">
              {pinnedMessages.map((msg) => (
                <div key={msg.id} className="text-xs text-muted-foreground truncate">
                  <span className="font-medium">{msg.sender?.full_name || "User"}:</span> {msg.message.slice(0, 50)}{msg.message.length > 50 ? "..." : ""}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1 pr-2" ref={scrollRef}>
          <div className="space-y-3">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada pesan. Mulai percakapan!</p>
            ) : (
              messages.map((msg) => {
                const isOwnMessage = msg.sender_id === user?.id;
                const groupedReactions = groupReactions(msg.reactions || []);

                return (
                  <div
                    key={msg.id}
                    id={`msg-${msg.id}`}
                    className={`flex gap-2 ${isOwnMessage ? "flex-row-reverse" : ""} group transition-colors rounded-lg`}
                  >
                    {!isOwnMessage && (
                      <Avatar className="h-7 w-7 shrink-0">
                        {msg.sender?.avatar_url && <AvatarImage src={msg.sender.avatar_url} />}
                        <AvatarFallback className="text-xs">
                          {getInitials(msg.sender?.full_name || "U")}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className={`max-w-[75%] ${isOwnMessage ? "text-right" : ""}`}>
                      {!isOwnMessage && (
                        <p className="text-xs text-muted-foreground mb-0.5">
                          {msg.sender?.full_name || "User"}
                        </p>
                      )}

                      {/* Reply preview */}
                      {msg.reply_to && (
                        <button
                          type="button"
                          onClick={() => {
                            const el = document.getElementById(`msg-${msg.reply_to!.id}`);
                            if (el) {
                              el.scrollIntoView({ behavior: "smooth", block: "center" });
                              el.classList.add("ring-2", "ring-primary", "bg-primary/10");
                              setTimeout(() => {
                                el.classList.remove("ring-2", "ring-primary", "bg-primary/10");
                              }, 1500);
                            }
                          }}
                          className={`text-xs bg-muted/50 hover:bg-muted rounded px-2 py-1 mb-1 border-l-2 border-primary cursor-pointer text-left w-full ${isOwnMessage ? "ml-auto" : ""}`}
                        >
                          <p className="text-muted-foreground font-medium">
                            {msg.reply_to.sender?.full_name || "User"}
                          </p>
                          <p className="truncate text-muted-foreground">
                            {msg.reply_to.message.slice(0, 50)}
                            {msg.reply_to.message.length > 50 ? "..." : ""}
                          </p>
                        </button>
                      )}

                      <div className="relative">
                        <div
                          className={`rounded-lg px-3 py-2 text-sm ${isOwnMessage ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                        >
                          {/* File attachment */}
                          {msg.file_url && (
                            <div
                              className={`mb-2 ${msg.message && msg.message !== `📎 ${msg.file_name}` ? "pb-2 border-b border-current/20" : ""}`}
                            >
                              {msg.file_type?.startsWith("image/") ? (
                                <button
                                  className="block rounded overflow-hidden max-w-[200px]"
                                  onClick={async () => {
                                    const url = await getFileSignedUrl(msg.file_url!);
                                    if (url) window.open(url, "_blank");
                                  }}
                                >
                                  <div className="flex items-center gap-2 text-xs opacity-80 mb-1">
                                    <Image className="h-3 w-3" />
                                    <span className="truncate">{msg.file_name}</span>
                                  </div>
                                </button>
                              ) : (
                                <button
                                  className="flex items-center gap-2 p-2 rounded bg-background/20 hover:bg-background/30 transition-colors"
                                  onClick={async () => {
                                    const url = await getFileSignedUrl(msg.file_url!);
                                    if (url) window.open(url, "_blank");
                                  }}
                                >
                                  <FileText className="h-5 w-5 shrink-0" />
                                  <div className="text-left min-w-0">
                                    <p className="text-xs font-medium truncate">{msg.file_name}</p>
                                    <p className="text-[10px] opacity-70">{formatFileSize(msg.file_size || 0)}</p>
                                  </div>
                                  <Download className="h-4 w-4 shrink-0" />
                                </button>
                              )}
                            </div>
                          )}
                          {msg.message && msg.message !== `📎 ${msg.file_name}` && renderMessageContent(msg.message)}
                        </div>

                        {/* Action buttons */}
                        <div
                          className={`absolute -top-1 ${isOwnMessage ? "-left-24" : "-right-24"} flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity`}
                        >
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReplyingTo(msg)}>
                            <Reply className="h-3 w-3" />
                          </Button>
                          <Popover
                            open={showReactionPicker === msg.id}
                            onOpenChange={(open) => setShowReactionPicker(open ? msg.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <Smile className="h-3 w-3" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent side="top" className="w-auto p-2">
                              <div className="flex gap-1">
                                {QUICK_REACTIONS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    className="text-lg hover:scale-125 transition-transform"
                                    onClick={() => toggleReaction(msg.id, emoji)}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6" 
                            onClick={() => togglePinMessage(msg.id, msg.is_pinned || false)}
                          >
                            {msg.is_pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                          </Button>
                          {isOwnMessage && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEditMessage(msg)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                        </div>

                        {/* Reactions display */}
                        {Object.keys(groupedReactions).length > 0 && (
                          <div
                            className={`flex flex-wrap gap-1 mt-1 ${isOwnMessage ? "justify-end" : "justify-start"}`}
                          >
                            {Object.entries(groupedReactions).map(([emoji, data]) => (
                              <button
                                key={emoji}
                                onClick={() => toggleReaction(msg.id, emoji)}
                                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-colors ${data.hasOwn ? "bg-primary/20 border border-primary/40" : "bg-muted hover:bg-muted/80"}`}
                              >
                                <span>{emoji}</span>
                                <span className="text-muted-foreground">{data.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 mt-0.5">
                        <p className="text-[10px] text-muted-foreground">{formatMessageTime(msg.created_at)}</p>
                        {msg.edited_at && (
                          <span className="text-[10px] text-muted-foreground italic">(diedit)</span>
                        )}
                        {msg.is_pinned && (
                          <Pin className="h-2.5 w-2.5 text-warning" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {activeTypingUsers.length > 0 && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="flex -space-x-1">
                  {activeTypingUsers.slice(0, 3).map((t) => (
                    <Avatar key={t.id} className="h-5 w-5 border-2 border-background">
                      <AvatarFallback className="text-[8px]">{getInitials(t.name)}</AvatarFallback>
                    </Avatar>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs">
                    {activeTypingUsers.length === 1
                      ? `${activeTypingUsers[0].name.split(" ")[0]} sedang mengetik`
                      : `${activeTypingUsers.length} orang sedang mengetik`}
                  </span>
                  <span className="flex gap-0.5">
                    <span
                      className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Edit message preview */}
        {editingMessage && (
          <div className="flex items-center gap-2 p-2 bg-info/10 rounded-t-lg border-l-2 border-info mt-2">
            <Pencil className="h-4 w-4 text-info shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-info">Mengedit pesan</p>
              <Input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="h-7 text-xs mt-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEditMessage();
                  if (e.key === "Escape") cancelEdit();
                }}
              />
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-success" onClick={saveEditMessage}>
              <Check className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={cancelEdit}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Reply preview */}
        {replyingTo && !editingMessage && (
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-t-lg border-l-2 border-primary mt-2">
            <Reply className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">Membalas {replyingTo.sender?.full_name || "User"}</p>
              <p className="text-xs text-muted-foreground truncate">
                {replyingTo.message.slice(0, 50)}
                {replyingTo.message.length > 50 ? "..." : ""}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setReplyingTo(null)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Selected file preview */}
        {selectedFile && (
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-t-lg mt-2">
            <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => {
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Mention autocomplete */}
        {showMentionList && filteredMentionUsers.length > 0 && (
          <div className="absolute bottom-20 left-3 right-3 bg-popover border rounded-lg shadow-lg max-h-32 overflow-y-auto z-10">
            {filteredMentionUsers.slice(0, 5).map((mentionUser) => (
              <button
                key={mentionUser.id}
                className="w-full flex items-center gap-2 p-2 hover:bg-muted transition-colors text-left"
                onClick={() => insertMention(mentionUser)}
              >
                <Avatar className="h-6 w-6">
                  {mentionUser.avatar_url && <AvatarImage src={mentionUser.avatar_url} />}
                  <AvatarFallback className="text-xs">{getInitials(mentionUser.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{mentionUser.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{mentionUser.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className={`flex gap-2 ${replyingTo || selectedFile ? "" : "mt-2"}`}>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          />

          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <Smile className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-auto p-0 border-0" sideOffset={8}>
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                theme={theme === "dark" ? Theme.DARK : Theme.LIGHT}
                width={300}
                height={350}
                searchPlaceholder="Cari emoji..."
                previewConfig={{ showPreview: false }}
              />
            </PopoverContent>
          </Popover>

          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => {
              setNewMessage((prev) => prev + "@");
              setShowMentionList(true);
              setMentionStartIndex(newMessage.length);
              setMentionSearch("");
              inputRef.current?.focus();
            }}
          >
            <AtSign className="h-5 w-5" />
          </Button>

          <Input
            ref={inputRef}
            value={newMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            onPaste={handlePaste}
            placeholder={replyingTo ? "Ketik balasan..." : "Ketik pesan... (Ctrl+V untuk paste gambar)"}
            className="flex-1"
            disabled={!!editingMessage}
          />

          <Button size="icon" onClick={sendMessage} disabled={(!newMessage.trim() && !selectedFile) || uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
