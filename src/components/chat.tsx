"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { Message } from "../app/types";

const DEFAULT_USERNAME = "Guest";

export default function Chat() {
  const { user, username: authUsername, signOut, loading: authLoading } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

  const username = authUsername || user?.email?.split("@")[0] || DEFAULT_USERNAME;

  // 1. GÜVENLİK: Private Route (Login Olmayan Girerse Atar)
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/"); 
    }
  }, [user, authLoading, router]);

  // 2. Mesajları Çek
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

  // 3. REALTIME: Yeni Mesajlar & Yazıyor... Dinleyicisi
  useEffect(() => {
    if (!supabase || !user) return;

    const client = supabase;

    // Mesaj Dinleyici (Postgres Changes)
    const msgChannel = client.channel("db-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as Message;
        setMessages((prev) => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
      })
      .subscribe();

    // Yazıyor Dinleyici (Broadcast)
    const tChannel = client.channel("typing-room", {
      config: { broadcast: { self: false } }
    })
    .on("broadcast", { event: "typing" }, (payload) => {
      const typingUser = payload.payload.username;
      if (!typingUser || typingUser === username) return;

      setTypingUsers((prev) => (prev.includes(typingUser) ? prev : [...prev, typingUser]));

      if (typingTimeoutsRef.current[typingUser]) clearTimeout(typingTimeoutsRef.current[typingUser]);
      typingTimeoutsRef.current[typingUser] = setTimeout(() => {
        setTypingUsers((prev) => prev.filter((u) => u !== typingUser));
      }, 3000);
    })
    .subscribe();

    typingChannelRef.current = tChannel;

    return () => {
      client.removeChannel(msgChannel);
      client.removeChannel(tChannel);
    };
  }, [user, username]);

  // Otomatik Scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  // Mesaj Gönderme (hemen listeye yansıt + Realtime yine de çalışsın)
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

    if (data) {
      const inserted = data as Message;
      setMessages((prev) =>
        prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]
      );
    }

    setNewMessage(""); // Input'u temizle
  };

  // Yazıyor Sinyali
  const handleTyping = (val: string) => {
    setNewMessage(val);
    typingChannelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { username },
    });
  };

  if (authLoading || !user) return null; // Yüklenirken boş ekran (flicker önleyici)

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-surface to-background p-2 sm:p-4 flex flex-col sm:items-center sm:justify-center">
      <div className="w-full max-w-2xl mx-auto flex flex-col flex-1 sm:max-h-[calc(100dvh-2rem)]">
        
        {/* Header - Senin Tasarımın */}
        <div className="glass rounded-t-2xl p-3 sm:p-6 border border-border flex-shrink-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-text-primary bg-gradient-to-r from-primary to-accent-light bg-clip-text text-transparent">
                Realtime Chat
              </h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex items-center space-x-2">
                <div className="w-9 h-9 bg-gradient-to-br from-primary to-primary-dark rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold">{username.charAt(0).toUpperCase()}</span>
                </div>
                <p className="text-sm font-medium text-text-primary">{username}</p>
              </div>
              <button onClick={() => signOut()} className="px-3 py-2 rounded-lg border border-border text-text-secondary hover:bg-surface/50 text-sm">
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Mesaj Alanı */}
        <div className="glass border-x border-border p-2 sm:p-4 flex-1 overflow-y-auto custom-scrollbar min-h-[300px]">
  <div className="flex flex-col gap-4"> {/* Flex-col ve gap eklendi */}
    {messages.map((msg) => {
      const isMe = msg.username === username; // Mesaj bana mı ait?

      return (
        <div 
          key={msg.id} 
          className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-fade-in`}
        >
          <div className={`flex items-end gap-2 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
            
            {/* Avatar - Sadece başkasının mesajında veya istersen her ikisinde */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${isMe ? 'bg-primary-dark' : 'bg-accent'}`}>
              <span className="text-white text-[10px] font-bold">
                {msg.username.charAt(0).toUpperCase()}
              </span>
            </div>

            {/* Mesaj Balonu */}
            <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div className={`px-4 py-2 rounded-2xl shadow-sm ${
                isMe 
                  ? 'bg-primary text-white rounded-tr-none' // Benim mesajım: Mavi/Primary ve sağ üst köşe keskin
                  : 'bg-surface border border-border text-text-primary rounded-tl-none' // Onun mesajı: Gri/Surface ve sol üst köşe keskin
              }`}>
                <p className="text-sm leading-relaxed">{msg.content}</p>
              </div>
              
              {/* Zaman ve İsim */}
              <div className="flex items-center gap-2 mt-1 px-1">
                {!isMe && <span className="text-[10px] font-medium text-text-muted">{msg.username}</span>}
                <span className="text-[9px] text-text-muted/70">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

        {/* Yazıyor Göstergesi */}
        <div className="glass border-x border-border px-4 py-1">
           {typingUsers.length > 0 && (
             <p className="text-xs italic text-text-muted animate-pulse">
               {typingUsers.join(", ")} yazıyor...
             </p>
           )}
        </div>

        {/* Input - Senin Tasarımın */}
        <div className="glass rounded-b-2xl border border-t-0 border-border p-2 sm:p-4">
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => handleTyping(e.target.value)}
              placeholder="Mesajınızı yazın..."
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
    </div>
  );
}