"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { Message } from "../app/types";

const DEFAULT_USERNAME = "Guest";

type OnlineUser = {
  username: string;
  presenceInfo: unknown;
};

export default function Chat() {
  const {
    user,
    username: authUsername,
    signOut,
    loading: authLoading,
  } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const notificationSoundRef = useRef<HTMLAudioElement | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [isOnlineDrawerOpen, setIsOnlineDrawerOpen] = useState(false);
  const presenceKeyRef = useRef<string | null>(null);

  const username =
    authUsername || user?.email?.split("@")[0] || DEFAULT_USERNAME;

  const onlineCount = onlineUsers.length;

  const avatarGradients = [
    "from-primary to-primary-dark",
    "from-accent to-accent-light",
    "from-fuchsia-500 to-purple-600",
    "from-sky-500 to-indigo-600",
    "from-rose-500 to-orange-500",
    "from-emerald-500 to-teal-600",
  ];

  const hashString = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  };

  const avatarGradientFor = (name: string) =>
    avatarGradients[hashString(name) % avatarGradients.length];

  // 1. TƏHLÜKƏSİZLİK: Şəxsi marşrut (daxil olmayan istifadəçi atılır)
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
    }
  }, [user, authLoading, router]);

  // Bildiriş icazəsi istə (yalnız müştəri tərəfində)
  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined")
      return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Bildiriş səsi üçün audio obyektini hazırla
  useEffect(() => {
    if (typeof window === "undefined") return;
    notificationSoundRef.current = new Audio(
      "/notify.mp3",
    );
  }, []);

  // 2. Mesajları gətir
  useEffect(() => {
    const fetchMessages = async () => {
      if (!supabase || !user) return;
      const { data, error: fetchError } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true });

      if (fetchError) setError(fetchError.message);
      else if (data) setMessages(data as Message[]);
    };
    fetchMessages();
  }, [user]);

  // 3. REALTIME: Yeni mesajlar və "yazır..." dinləyicisi
  useEffect(() => {
    if (!supabase || !user) return;

    const client = supabase;

    // Mesaj dinləyicisi (Postgres dəyişiklikləri)
    const msgChannel = client
      .channel("db-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;

          const isMe = msg.username === username;

          // Yalnız başqasının mesajında səs və brauzer bildirişi
          if (!isMe) {
            // Səs effekti
            if (notificationSoundRef.current) {
              notificationSoundRef.current.currentTime = 0;
              notificationSoundRef.current.play().catch(() => {});
            }

            // Brauzer bildirişi (səkmə gizli olanda)
            if (
              typeof document !== "undefined" &&
              typeof Notification !== "undefined" &&
              document.hidden &&
              Notification.permission === "granted"
            ) {
              new Notification("Yeni mesaj", {
                body: `${msg.username}: ${msg.content}`,
              });
            }
          }

          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
          );
        },
      )
      .subscribe();

    // "Yazır" dinləyicisi (broadcast)
    const tChannel = client
      .channel("typing-room", {
        config: { broadcast: { self: false } },
      })
      .on("broadcast", { event: "typing" }, (payload) => {
        const typingUser = payload.payload.username;
        if (!typingUser || typingUser === username) return;

        setTypingUsers((prev) =>
          prev.includes(typingUser) ? prev : [...prev, typingUser],
        );

        if (typingTimeoutsRef.current[typingUser])
          clearTimeout(typingTimeoutsRef.current[typingUser]);
        typingTimeoutsRef.current[typingUser] = setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u !== typingUser));
        }, 3000);
      })
      .subscribe();

    typingChannelRef.current = tChannel;

    return () => {
      client.removeChannel(msgChannel);
      client.removeChannel(tChannel);

      // Yazma timeout-larını təmizlə
      Object.values(typingTimeoutsRef.current).forEach((timeoutId) =>
        clearTimeout(timeoutId),
      );
      typingTimeoutsRef.current = {};

      typingChannelRef.current = null;
    };
  }, [user, username]);

  // Avtomatik scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  // Mesaj göndərmə (dərhal siyahıya əlavə et, Realtime yenə də işləsin)
  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const content = newMessage.trim();
    if (!content || !supabase) return;

    setLoading(true);
    setError(null);

    const { data, error: insError } = await supabase
      .from("messages")
      .insert({ username, content })
      .select("*")
      .single();

    setLoading(false);

    if (insError) {
      setError(insError.message);
      return;
    }

    // Mesajın dərhal görünməsi üçün optimistik yeniləmə
    if (data) {
      const inserted = data as Message;
      setMessages((prev) =>
        prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted],
      );
    }

    setNewMessage(""); // Input-u təmizlə
  };

  // "Yazır" siqnalı
  const handleTyping = (val: string) => {
    setNewMessage(val);
    typingChannelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { username },
    });
  };

  // Onlayn istifadəçilər
  useEffect(() => {
    if (!supabase || !user || !username) return;

    const client = supabase;
    // Hər tab / brauzer üçün stabil və unikal presence açarı
    if (!presenceKeyRef.current) {
      presenceKeyRef.current = `${username}-${Math.random()
        .toString(36)
        .slice(2)}`;
    }

    const roomOne = client.channel("room-1", {
      config: { presence: { key: presenceKeyRef.current } },
    });

    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const updateOnlineUsersFromState = () => {
      const state = roomOne.presenceState() as Record<
        string,
        { username?: string; online_at?: string }[]
      >;

      const allMetas = Object.values(state).flat();

      const uniqueByUsername = new Map<
        string,
        { username?: string; online_at?: string }
      >();

      for (const meta of allMetas) {
        const name = (meta.username || "Unknown") as string;
        if (!uniqueByUsername.has(name)) {
          uniqueByUsername.set(name, meta);
        }
      }

      const formattedUsers: OnlineUser[] = Array.from(
        uniqueByUsername.entries(),
      ).map(([name, meta]) => ({
        username: name,
        presenceInfo: meta,
      }));

      setOnlineUsers(formattedUsers);
    };

    roomOne
      .on("presence", { event: "sync" }, updateOnlineUsersFromState)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await roomOne.track({
            username,
            online_at: new Date().toISOString(),
          });
          // Yeniləmədən sonra sync bəzən gec gəlir; track() sonrası əl ilə yenilə
          updateOnlineUsersFromState();
          // Server state propagation üçün qısa gecikmə (digər istifadəçiləri görmək üçün)
          retryTimeoutId = setTimeout(updateOnlineUsersFromState, 600);
        }
      });

    return () => {
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
      client.removeChannel(roomOne);
    };
  }, [user, username]);

  // Mobil onlayn siyahı: ESC + scroll kilidi
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isOnlineDrawerOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOnlineDrawerOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOnlineDrawerOpen]);

  if (authLoading || !user) return null; // Yüklənərkən boş ekran (flicker-in qarşısını almaq üçün)

  const onlineUsersContent =
    onlineUsers.length > 0 ? (
      <div className="flex flex-col gap-1">
        {onlineUsers.map((u) => {
          const name = String(u.username || "");
          const isMe = name === username;
          const initial = (name?.trim()?.charAt(0) || "?").toUpperCase();
          const gradient = avatarGradientFor(name || "user");

          return (
            <div
              key={name}
              className="group flex items-center gap-3 rounded-xl px-3 py-2 border border-transparent hover:border-border hover:bg-surface/40 hover:brightness-110 transition will-change-transform"
            >
              <div className="relative flex-shrink-0">
                <div
                  className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md`}
                >
                  <span className="text-white text-sm font-bold">{initial}</span>
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.85)] ring-2 ring-background/40" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-text-primary">
                    {name}
                  </span>
                  {isMe && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 border border-primary/25 text-primary">
                      You
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-text-muted">Online</span>
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="px-3 py-10 text-center">
        <p className="text-sm text-text-muted">You must be feeling lonely...</p>
        <p className="text-[11px] text-text-muted/80 mt-1">No one is online.</p>
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-surface to-background p-2 sm:p-4">
      <div className="w-full max-w-6xl mx-auto flex flex-col lg:flex-row gap-3 sm:gap-4">
        {/* Əsas söhbət sahəsi */}
        <div className="w-full flex flex-col flex-1 lg:max-h-[calc(100dvh-2rem)] min-w-0">
          {/* Başlıq */}
          <div className="glass rounded-t-2xl p-3 sm:p-6 border border-border flex-shrink-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h1 className="text-lg sm:text-2xl font-bold text-text-primary bg-gradient-to-r from-primary to-accent-light bg-clip-text text-transparent">
                    Realtime Chat
                  </h1>
                </div>

                {/* Mobil: onlayn siyahını açan düymə */}
                <button
                  type="button"
                  onClick={() => setIsOnlineDrawerOpen(true)}
                  className="lg:hidden inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-surface/30 hover:bg-surface/40 hover:brightness-110 transition min-h-[44px]"
                  aria-haspopup="dialog"
                  aria-expanded={isOnlineDrawerOpen}
                >
                  <svg
                    className="w-4 h-4 text-text-secondary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a4 4 0 00-4-4h-1m-6 6H2v-2a4 4 0 014-4h5m6-4a4 4 0 10-8 0 4 4 0 008 0zm6 4a3 3 0 10-6 0 3 3 0 006 0z"
                    />
                  </svg>
                  <span className="text-xs font-medium text-text-primary">
                    Online - {onlineCount}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-2 sm:gap-4">
                <div className="flex items-center space-x-2">
                  <div className="w-9 h-9 bg-gradient-to-br from-primary to-primary-dark rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold">
                      {username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-text-primary">
                    {username}
                  </p>
                </div>
                <button
                  onClick={() => signOut()}
                  className="px-3 py-2 rounded-lg border border-border text-text-secondary hover:bg-surface/50 text-sm"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>

          {/* Mesaj sahəsi */}
          <div className="glass border-x border-border p-2 sm:p-4 flex-1 overflow-y-auto custom-scrollbar min-h-[300px]">
            <div className="flex flex-col gap-4">
              {" "}
              {/* Flex-col və gap əlavə edildi */}
              {error && (
                <div className="p-3 rounded-xl bg-error/10 border border-error/30 text-error text-sm">
                  {error}
                </div>
              )}
              {messages.map((msg) => {
                const isMe = msg.username === username; // Mesaj mənəmi aiddir?

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMe ? "justify-end" : "justify-start"} animate-fade-in`}
                  >
                    <div
                      className={`flex items-end gap-2 max-w-[85%] ${isMe ? "flex-row-reverse" : "flex-row"}`}
                    >
                      {/* Avatar - yalnız başqasının mesajında və ya istəsən hər ikisində */}
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${isMe ? "bg-primary-dark" : "bg-accent"}`}
                      >
                        <span className="text-white text-[10px] font-bold">
                          {msg.username.charAt(0).toUpperCase()}
                        </span>
                      </div>

                      {/* Mesaj "balonu" */}
                      <div
                        className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`px-4 py-2 rounded-2xl shadow-sm ${
                            isMe
                              ? "bg-primary text-white rounded-tr-none" // Benim mesajım: Mavi/Primary ve sağ üst köşe keskin
                              : "bg-surface border border-border text-text-primary rounded-tl-none" // Onun mesajı: Gri/Surface ve sol üst köşe keskin
                          }`}
                        >
                          <p className="text-sm leading-relaxed">{msg.content}</p>
                        </div>

                        {/* Vaxt və ad */}
                        <div className="flex items-center gap-2 mt-1 px-1">
                          {!isMe && (
                            <span className="text-[10px] font-medium text-text-muted">
                              {msg.username}
                            </span>
                          )}
                          <span className="text-[9px] text-text-muted/70">
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* "Yazır" göstəricisi */}
          <div className="glass border-x border-border px-4 py-1">
            {typingUsers.length > 0 && (
              <p className="text-xs italic text-text-muted animate-pulse">
                {typingUsers.join(", ")} typing...
              </p>
            )}
          </div>

          {/* Input sahəsi */}
          <div className="glass rounded-b-2xl border border-t-0 border-border p-2 sm:p-4">
            <form onSubmit={handleSend} className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => handleTyping(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 bg-surface/50 border border-border rounded-xl px-4 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                disabled={loading || !newMessage.trim()}
                className="bg-primary text-white px-6 py-2 rounded-xl text-sm font-medium hover:scale-105 transition-transform disabled:opacity-50"
              >
                {loading ? "..." : "Send"}
              </button>
            </form>
          </div>
        </div>

        {/* Desktop yan panel */}
        <aside className="hidden lg:flex lg:w-80 xl:w-96">
          <div className="glass w-full rounded-2xl border border-border overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-text-primary">
                  Online{" "}
                  <span className="text-text-muted font-medium">
                    - {onlineCount}
                  </span>
                </span>
                <span className="text-[11px] text-text-muted">
                  Updates via live presence
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.85)]" />
                Live
              </div>
            </div>
            <div className="p-2 flex-1 overflow-y-auto custom-scrollbar">
              {onlineUsersContent}
            </div>
          </div>
        </aside>
      </div>

      {/* Mobil siyahı (drawer) */}
      {isOnlineDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setIsOnlineDrawerOpen(false)}
            aria-label="Close"
          />

          <div
            role="dialog"
            aria-modal="true"
            className="absolute right-0 top-0 h-full w-[88%] max-w-sm glass border-l border-border shadow-2xl flex flex-col"
          >
            <div className="p-4 border-b border-border flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-text-primary">
                  Online{" "}
                  <span className="text-text-muted font-medium">
                    - {onlineCount}
                  </span>
                </span>
                <span className="text-[11px] text-text-muted">
                  See who’s here at a glance
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsOnlineDrawerOpen(false)}
                className="px-3 py-2 rounded-xl border border-border bg-surface/30 hover:bg-surface/40 hover:brightness-110 transition min-h-[44px]"
              >
                Close
              </button>
            </div>

            <div className="p-2 flex-1 overflow-y-auto custom-scrollbar">
              {onlineUsersContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
