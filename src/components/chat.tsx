"use client";

/**
 * Realtime Chat – Supabase v2, Next.js App Router, "use client".
 * Auth: Only logged in users can see this component on /chat page; username comes from auth.
 *
 * Supabase setup:
 * 1. Dashboard → Database → Replication → Realtime ENABLE for "messages" table.
 * 2. RLS: Select/insert policies for authenticated users.
 * 3. Table: id (uuid), username (text), content (text), created_at (timestamptz).
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { Message } from "../app/types";

const DEFAULT_USERNAME = "Guest";

export default function Chat() {
  const { user, username: authUsername, signOut } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const username = authUsername || user?.email?.split("@")[0] || DEFAULT_USERNAME;

  // Initial load messages
  useEffect(() => {
    const fetchMessages = async () => {
      if (!supabase) return;
      
      const { data, error: fetchError } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      if (data) setMessages((data as Message[]) ?? []);
    };
    fetchMessages();
  }, []);

  // Realtime: subscribe to new messages & typing indicator
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const channel = client
      .channel("messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          setMessages((prev) => {
            const msg = payload.new as Message;
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .on("broadcast", { event: "typing" }, (payload) => {
        const typingUser = (payload.payload as { username?: string } | null)?.username;
        if (!typingUser || typingUser === username) return;

        setTypingUsers((prev) => {
          if (prev.includes(typingUser)) return prev;
          return [...prev, typingUser];
        });

        if (typingTimeoutsRef.current[typingUser]) {
          clearTimeout(typingTimeoutsRef.current[typingUser]);
        }

        typingTimeoutsRef.current[typingUser] = setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u !== typingUser));
          delete typingTimeoutsRef.current[typingUser];
        }, 2500);
      })
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });

    channelRef.current = channel;

    return () => {
      Object.values(typingTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId));
      typingTimeoutsRef.current = {};
      client.removeChannel(channel);
      channelRef.current = null;
    };
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const content = newMessage.trim();
    if (!content) return;

    setLoading(true);
    setError(null);

    const finalUsername = username.trim() || DEFAULT_USERNAME;

    if (!supabase) {
      setError("Supabase client not initialized");
      setLoading(false);
      return;
    }

    // Insert and get row so we can show it immediately. Subscription also receives INSERT
    // but dedupes by id, so no duplicate.
    const { data: inserted, error: insertError } = await supabase
      .from("messages")
      .insert({ username: finalUsername, content })
      .select("*")
      .single();

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    if (inserted) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === (inserted as Message).id)) return prev;
        return [...prev, inserted as Message];
      });
    }
    setNewMessage("");
  };

  const handleTypingChange = (value: string) => {
    setNewMessage(value);

    const finalUsername = (username.trim() || DEFAULT_USERNAME);
    const channel = channelRef.current;
    if (!channel) return;

    channel.send({
      type: "broadcast",
      event: "typing",
      payload: { username: finalUsername },
    });
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-background via-surface to-background p-2 sm:p-4 flex flex-col sm:items-center sm:justify-center safe-area-inset">
      <div className="w-full max-w-2xl mx-auto flex flex-col flex-1 min-h-0 sm:flex-initial sm:max-h-[calc(100dvh-2rem)]">
        {/* Header */}
        <div className="glass rounded-t-2xl sm:rounded-t-2xl p-3 sm:p-6 border border-border animate-fade-in flex-shrink-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-text-primary bg-gradient-to-r from-primary to-accent-light bg-clip-text text-transparent truncate">
                Realtime Chat
              </h1>
              <p className="text-xs sm:text-sm text-text-muted mt-0.5 hidden sm:block">Connect with others in real-time</p>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4 flex-shrink-0">
              <div className="flex items-center space-x-2 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-primary to-primary-dark rounded-full flex items-center justify-center shadow-lg flex-shrink-0">
                  <span className="text-white font-bold text-sm sm:text-base">
                    {(username.trim() || DEFAULT_USERNAME).charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{username}</p>
                  <p className="text-xs text-text-muted hidden sm:block">Logged in</p>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  router.push("/");
                  router.refresh();
                }}
                className="px-3 py-2 sm:px-4 rounded-lg border border-border text-text-secondary hover:bg-surface/50 hover:text-text-primary transition-all text-sm font-medium touch-manipulation min-h-[44px]"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="glass border-x border-border p-3 sm:p-4 animate-slide-in flex-shrink-0">
            <div className="flex items-center space-x-2 text-error min-w-0">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span className="text-xs sm:text-sm break-words">{error}</span>
            </div>
          </div>
        )}

        {/* Messages Container */}
        <div className="glass border-x border-border p-2 sm:p-4 animate-fade-in flex-1 min-h-0 flex flex-col">
          <div
            ref={scrollContainerRef}
            className="flex-1 min-h-[200px] h-[40vh] sm:h-96 overflow-y-auto overflow-x-hidden space-y-2 sm:space-y-3 pr-1 sm:pr-2 custom-scrollbar"
          >
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[180px] sm:min-h-full text-text-muted px-2">
                <svg className="w-12 h-12 sm:w-16 sm:h-16 mb-3 sm:mb-4 opacity-50 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-center text-sm sm:text-base">No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg transition-all hover:bg-surface/50 animate-slide-in ${
                    index === messages.length - 1 ? 'bg-surface/30' : ''
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-accent to-accent-light rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs sm:text-sm font-semibold">
                      {msg.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0 mb-0.5 sm:mb-1">
                      <span className="font-semibold text-text-primary text-xs sm:text-sm truncate max-w-[120px] sm:max-w-none">
                        {msg.username}
                      </span>
                      <span className="text-xs text-text-muted flex-shrink-0">
                        {new Date(msg.created_at).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-text-primary break-words text-sm sm:text-base">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Message Input */}
        <div className="glass rounded-b-2xl border border-t-0 border-border p-2 sm:p-4 animate-fade-in flex-shrink-0">
          <form onSubmit={handleSend} className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-end">
            <div className="flex-1 w-full min-w-0">
              <input
                type="text"
                placeholder="Type your message..."
                value={newMessage}
                onChange={(e) => handleTypingChange(e.target.value)}
                className="w-full bg-surface/50 border border-border rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all resize-none touch-manipulation"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !newMessage.trim()}
              className="bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-medium transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg hover:shadow-xl min-h-[48px] touch-manipulation flex items-center justify-center gap-2 flex-shrink-0"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-sm sm:text-base">Sending...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  <span className="text-sm sm:text-base">Send</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
