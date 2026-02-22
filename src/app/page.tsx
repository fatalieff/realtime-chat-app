"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

type Tab = "login" | "register";

export default function LandingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("login");

  // Giriş yapmış kullanıcıyı /chat'e yönlendir (ters koruma)
  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace("/chat");
      return;
    }
  }, [user, loading, router]);

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Register state
  const [regEmail, setRegEmail] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!supabase) {
      setLoginError("Supabase connection not found. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file.");
      return;
    }
    setLoginLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (error) {
        setLoginError(error.message);
        return;
      }
      router.push("/chat");
      router.refresh();
    } catch {
      setLoginError("An error occurred during login. Please try again.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegSuccess(false);

    if (!supabase) {
      setRegError("Supabase connection not found. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file.");
      return;
    }

    const email = regEmail.trim();
    const username = regUsername.trim();
    const password = regPassword;

    if (!email || !username || !password) {
      setRegError("Email, username and password are required.");
      return;
    }

    if (password.length < 6) {
      setRegError("Password must be at least 6 characters.");
      return;
    }

    setRegLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: { user_name: username },
        },
      });

      if (error) {
        setRegError(error.message);
        return;
      }

      if (typeof window !== "undefined") {
        sessionStorage.setItem("auth_pending_email", email);
        sessionStorage.setItem("auth_pending_username", username);
        sessionStorage.setItem("auth_pending_password", password);
      }
      setRegSuccess(true);
      setTimeout(() => {
        router.push(`/verify?email=${encodeURIComponent(email)}`);
        router.refresh();
      }, 2500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred during registration. Please try again.";
      setRegError(message);
    } finally {
      setRegLoading(false);
    }
  };

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

  if (user) {
    return null; // Redirect to /chat in progress
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-background via-surface to-background flex items-center justify-center p-3 sm:p-4 safe-area-inset">
      <div className="w-full max-w-md mx-auto">
        {!supabase && (
          <div className="mb-3 sm:mb-4 p-3 sm:p-4 rounded-xl bg-warning/20 border border-warning/50 text-warning text-xs sm:text-sm text-center break-words">
            Supabase connection not found. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file.
          </div>
        )}
        {/* Info / Hero card */}
        <div className="glass rounded-t-2xl sm:rounded-t-2xl border border-border p-5 sm:p-8 text-center animate-fade-in">
          <div className="w-14 h-14 sm:w-20 sm:h-20 mx-auto mb-3 sm:mb-4 bg-gradient-to-br from-primary to-primary-dark rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg">
            <svg
              className="w-7 h-7 sm:w-10 sm:h-10 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary bg-gradient-to-r from-primary to-accent-light bg-clip-text text-transparent">
            Realtime Chat
          </h1>
          <p className="text-text-muted mt-1 sm:mt-2 text-sm sm:text-base">
            Sign in to chat in real-time or create an account.
          </p>
        </div>

        {/* Tabs */}
        <div className="glass border-x border-border p-1.5 sm:p-2 flex gap-1 animate-slide-in">
          <button
            type="button"
            onClick={() => setTab("login")}
            className={`flex-1 py-3 sm:py-2.5 rounded-lg font-medium transition-all min-h-[44px] touch-manipulation ${
              tab === "login"
                ? "bg-primary text-white"
                : "text-text-muted hover:bg-surface/50 hover:text-text-primary"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setTab("register")}
            className={`flex-1 py-3 sm:py-2.5 rounded-lg font-medium transition-all min-h-[44px] touch-manipulation ${
              tab === "register"
                ? "bg-primary text-white"
                : "text-text-muted hover:bg-surface/50 hover:text-text-primary"
            }`}
          >
            Register
          </button>
        </div>

        {/* Forms */}
        <div className="glass rounded-b-2xl border border-t-0 border-border p-4 sm:p-6 animate-fade-in">
          {tab === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              {loginError && (
                <div className="p-3 rounded-lg bg-error/10 border border-error/30 text-error text-sm">
                  {loginError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="example@email.com"
                  required
                  className="w-full bg-surface/50 border border-border rounded-xl px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-surface/50 border border-border rounded-xl px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                />
              </div>
              <button
                type="submit"
                disabled={loginLoading}
                className="w-full bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white py-3 rounded-xl font-medium transition-all disabled:opacity-50 min-h-[48px] touch-manipulation"
              >
                {loginLoading ? "Logging in..." : "Login"}
              </button>
            </form>
          )}

          {tab === "register" && (
            <>
              {regSuccess ? (
                <div className="space-y-4 text-center py-4 animate-fade-in">
                  <div className="w-16 h-16 mx-auto rounded-full bg-success/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary">Code has been sent to your email</h3>
                  <p className="text-text-muted text-sm">
                    We sent a 6-digit OTP code to <strong className="text-text-secondary">{regEmail}</strong>.
                  </p>
                  <p className="text-text-muted text-sm">
                    Redirecting you to the verification page… You will enter the <strong>6 digits</strong> there.
                  </p>
                  <div className="flex justify-center gap-1">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
                  </div>
                </div>
              ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              {regError && (
                <div className="p-3 rounded-lg bg-error/10 border border-error/30 text-error text-sm">
                  {regError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="example@email.com"
                  required
                  className="w-full bg-surface/50 border border-border rounded-xl px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="username"
                  required
                  className="w-full bg-surface/50 border border-border rounded-xl px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Password (min 6 characters)
                </label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full bg-surface/50 border border-border rounded-xl px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                />
              </div>
              <button
                type="submit"
                disabled={regLoading}
                className="w-full bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white py-3 rounded-xl font-medium transition-all disabled:opacity-50 min-h-[48px] touch-manipulation"
              >
                {regLoading ? "Sending..." : "Register (send OTP)"}
              </button>
              <p className="text-xs text-text-muted text-center px-1">
                A 6-digit code will be sent to your email after registration. Please enter this code on the verification page.
              </p>
            </form>
              )}
            </>
          )}
        </div>

        <p className="text-center text-text-muted text-xs sm:text-sm mt-3 sm:mt-4 px-1">
          Continue to {" "}
          <Link href="/chat" className="text-primary hover:underline">
            chat
          </Link>{" "}
          after logging in.
        </p>
      </div>
    </div>
  );
}
