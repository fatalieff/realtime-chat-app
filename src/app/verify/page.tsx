"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email");

  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? sessionStorage.getItem("auth_pending_email") : null;
    setEmail(emailParam || stored || "");
  }, [emailParam]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !email || !otp.trim()) return;
    setLoading(true);
    setError(null);

    const {
      data: { session },
      error: verifyError,
    } = await supabase.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: "email",
    });

    if (verifyError) {
      setError(verifyError.message);
      setLoading(false);
      return;
    }

    const pendingUsername =
      typeof window !== "undefined" ? sessionStorage.getItem("auth_pending_username") : null;
    const pendingPassword =
      typeof window !== "undefined" ? sessionStorage.getItem("auth_pending_password") : null;

    if (session?.user && pendingUsername != null && pendingPassword != null) {
      await supabase.auth.updateUser({
        password: pendingPassword,
        data: { user_name: pendingUsername },
      });
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("auth_pending_email");
        sessionStorage.removeItem("auth_pending_username");
        sessionStorage.removeItem("auth_pending_password");
      }
    }

    setLoading(false);
    router.push("/chat");
    router.refresh();
  };

  if (!email) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-background via-surface to-background flex items-center justify-center p-3 sm:p-4 safe-area-inset">
        <div className="glass rounded-2xl border border-border p-5 sm:p-8 max-w-md w-full text-center">
          <p className="text-text-muted mb-4 text-sm sm:text-base">Email information not found.</p>
          <Link
            href="/"
            className="text-primary hover:underline font-medium inline-block min-h-[44px] leading-[44px] touch-manipulation"
          >
            Return to login page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-background via-surface to-background flex items-center justify-center p-3 sm:p-4 safe-area-inset">
      <div className="glass rounded-2xl border border-border p-5 sm:p-8 max-w-md w-full animate-fade-in mx-auto">
        <div className="text-center mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Enter 6-digit code here</h1>
          <p className="text-text-muted mt-2 text-xs sm:text-sm break-all px-1">
            <span className="text-text-secondary">{email}</span> Enter the <strong>6-digit</strong> OTP code sent to this address below.
          </p>
        </div>
        <form onSubmit={handleVerify} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-error/10 border border-error/30 text-error text-xs sm:text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2 text-center">
              6 digits from your email
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              required
              autoFocus
              className="w-full bg-surface/50 border-2 border-primary/50 rounded-xl px-3 sm:px-4 py-3 sm:py-4 text-text-primary placeholder-text-muted text-center text-2xl sm:text-3xl tracking-[0.2em] sm:tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary touch-manipulation"
            />
            <p className="text-xs text-text-muted text-center mt-2">Enter numbers only (e.g: 847291)</p>
          </div>
          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="w-full bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white py-3 rounded-xl font-medium transition-all disabled:opacity-50 min-h-[48px] touch-manipulation"
          >
            {loading ? "Verifying..." : "Verify and enter chat"}
          </button>
        </form>
        <p className="text-center text-text-muted text-xs sm:text-sm mt-4">
          <Link href="/" className="text-primary hover:underline touch-manipulation">
            Return to login page
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-background via-surface to-background flex items-center justify-center p-4">
          <div className="animate-pulse text-text-muted text-sm sm:text-base">Loading...</div>
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
