"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import Chat from "../../components/chat";

export default function ChatPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/"); // Giriş səhifəsinə yönləndir (login əsas səhifədədir)
      return;
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-background via-surface to-background flex items-center justify-center p-4 safe-area-inset">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-text-muted text-sm sm:text-base">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <Chat />;
}
