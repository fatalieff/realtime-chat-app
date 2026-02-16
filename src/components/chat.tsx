"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Message } from "@/app/types";

function chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [username, setUsername] = useState("");

  //Useeffect to fetch messages from supabase
  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from<Message>("messages")
        .select("*")
        .order("created_at", { ascending: true });
      if (data) setMessages(data);
    };
    fetchMessages();
  }, []);

  //Realtime subscription to new messages
  useEffect(() => {
    const channel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message])
        }
      )
      .subscribe()
  
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])
  

  //Handle form submission
  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newMessage.trim() === "") return;
    const { data, error } = await supabase
      .from("messages")
      .insert({ username, content: newMessage });
  };
  return (
    <div>
      <div className="max-w-md mx-auto p-4 border rounded">
        <h2 className="text-xl font-bold mb-2">Realtime Chat</h2>

        <div className="h-64 overflow-y-auto border p-2 mb-2">
          {messages.map((msg) => (
            <div key={msg.id}>
              <strong>{msg.username}:</strong> {msg.content}
            </div>
          ))}
        </div>

        <input
          type="text"
          placeholder="Your message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          className="border p-1 mr-2"
        />
        <button
          onClick={handleSend}
          className="bg-blue-500 text-white px-2 py-1"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default chat;
