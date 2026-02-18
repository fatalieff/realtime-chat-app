"use client";

/**
 * Realtime Chat – Supabase v2, Next.js App Router, "use client".
 *
 * Supabase kurulumu:
 * 1. Dashboard → Database → Replication → "messages" tablosu için Realtime AÇIK olmalı.
 * 2. RLS: Dashboard → Authentication → Policies veya SQL Editor'da aşağıdaki politikaları ekleyin:
 *
 *   create policy "Allow anon read messages"
 *     on public.messages for select to anon using (true);
 *   create policy "Allow anon insert messages"
 *     on public.messages for insert to anon with check (true);
 *
 * 3. Tablo: id (uuid, default gen_random_uuid()), username (text), content (text), created_at (timestamptz, default now()).
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Message } from "../app/types";

const DEFAULT_USERNAME = "Guest";

// localStorage'dan username'i al
const getStoredUsername = (): string => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('chat-username');
    return stored || DEFAULT_USERNAME;
  }
  return DEFAULT_USERNAME;
};

// localStorage'a username'i kaydet
const saveUsername = (username: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('chat-username', username);
  }
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [username, setUsername] = useState(DEFAULT_USERNAME);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Client-side'da localStorage'dan username'i yükle
  useEffect(() => {
    const storedUsername = getStoredUsername();
    setUsername(storedUsername);
  }, []);

  // İlk yüklemede mesajları çek
  useEffect(() => {
    const fetchMessages = async () => {
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

  // Realtime: yeni mesajlara subscribe (başka kullanıcılar + kendi insert'in Realtime'ı)
  useEffect(() => {
    const channel = supabase
      .channel("messages-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            // Aynı mesaj zaten varsa ekleme (kendi insert'ten hem .select() hem Realtime gelebilir)
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") setError("Realtime bağlantı hatası.");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Mesaj listesi değişince en alta scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const content = newMessage.trim();
    if (!content) return;

    setLoading(true);
    setError(null);

    // Username boşsa default kullan
    const finalUsername = username.trim() || DEFAULT_USERNAME;

    // Insert ve dönen satırı al (id, created_at dahil). Böylece hemen UI'da görünür.
    const { data, error: insertError } = await supabase
      .from("messages")
      .insert({ username: finalUsername, content })
      .select("*")
      .single();

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    if (data) {
      setMessages((prev) => {
        const msg = data as Message;
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setNewMessage("");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-surface to-background p-4 flex items-center justify-center">
      <div className="w-full max-w-2xl mx-auto">
        {/* Header */}
        <div className="glass rounded-t-2xl p-6 border border-border animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-text-primary bg-gradient-to-r from-primary to-accent-light bg-clip-text text-transparent">
                Realtime Chat
              </h1>
              <p className="text-sm text-text-muted mt-1">Connect with others in real-time</p>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-success rounded-full animate-pulse"></div>
              <span className="text-sm text-text-secondary">Online</span>
            </div>
          </div>
        </div>

        {/* User Section */}
        <div className="glass border-x border-border p-6 animate-slide-in">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary-dark rounded-full flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-lg">
                  {(username.trim() || DEFAULT_USERNAME).charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-success rounded-full border-2 border-surface"></div>
            </div>
            <div className="flex-1">
              <label className="text-xs text-text-secondary uppercase tracking-wide font-semibold mb-1 block">
                Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={(e) => {
                    const trimmed = e.target.value.trim();
                    const finalUsername = trimmed || DEFAULT_USERNAME;
                    setUsername(finalUsername);
                    saveUsername(finalUsername);
                  }}
                  placeholder={DEFAULT_USERNAME}
                  className="w-full bg-surface/30 border border-border/50 rounded-lg px-4 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all pr-10"
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs text-success font-medium">Active</span>
              <span className="text-xs text-text-muted">Online</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="glass border-x border-border p-4 animate-slide-in">
            <div className="flex items-center space-x-2 text-error">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* Messages Container */}
        <div className="glass border-x border-border p-4 animate-fade-in">
          <div
            ref={scrollContainerRef}
            className="h-96 overflow-y-auto space-y-3 pr-2 custom-scrollbar"
          >
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted">
                <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-center">No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={msg.id}
                  className={`flex items-start space-x-3 p-3 rounded-lg transition-all hover:bg-surface/50 animate-slide-in ${
                    index === messages.length - 1 ? 'bg-surface/30' : ''
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-accent to-accent-light rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-semibold">
                      {msg.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-semibold text-text-primary text-sm">
                        {msg.username}
                      </span>
                      <span className="text-xs text-text-muted">
                        {new Date(msg.created_at).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-text-primary break-words">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Message Input */}
        <div className="glass rounded-b-2xl border border-t-0 border-border p-4 animate-fade-in">
          <form onSubmit={handleSend} className="flex items-end space-x-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Type your message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="w-full bg-surface/50 border border-border rounded-xl px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all resize-none"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !newMessage.trim()}
              className="bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white px-6 py-3 rounded-xl font-medium transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg hover:shadow-xl"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Sending...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  <span>Send</span>
                </div>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
