/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, LockKeyhole, UserRound, ArrowLeft, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { authApi, type AuthUser } from '../lib/api';

interface AuthScreenProps {
  onSuccess: (chefName: string, isRegisterMode: boolean) => void;
}

const MAX_CHEF_NAME_LENGTH = 15;
const GOOGLE_OTP_MAX_LENGTH = 9;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GMAIL_RE = /^[^\s@]+@gmail\.com$/i;
const logoImage = new URL('../../assets/logo-mark-transparent.png', import.meta.url).href;

export default function AuthScreen({ onSuccess }: AuthScreenProps) {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [newResetPasswordConfirm, setNewResetPasswordConfirm] = useState('');

  const [googleEmail, setGoogleEmail] = useState('');
  const [googleSent, setGoogleSent] = useState(false);
  const [googleCode, setGoogleCode] = useState('');
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const [pendingPasswordUser, setPendingPasswordUser] = useState<AuthUser | null>(null);
  const [firstPassword, setFirstPassword] = useState('');
  const [firstPasswordConfirm, setFirstPasswordConfirm] = useState('');
  const [firstPasswordSubmitting, setFirstPasswordSubmitting] = useState(false);
  const [showFirstPassword, setShowFirstPassword] = useState(false);

  const finishLogin = (account: string, chefName?: string, createdFromRegisterMode = false) => {
    const nextName = (chefName || account.split('@')[0] || '主廚').slice(0, MAX_CHEF_NAME_LENGTH);
    onSuccess(nextName, createdFromRegisterMode);
  };

  const continueAfterGmailLogin = (user: AuthUser, fallbackAccount: string) => {
    const account = (user.username || fallbackAccount).trim().toLowerCase();
    if (user.mustSetPassword) {
      setPendingPasswordUser({ ...user, username: account });
      setFirstPassword('');
      setFirstPasswordConfirm('');
      setShowFirstPassword(false);
      setError('');
      return;
    }
    finishLogin(account, user.chefName, Boolean(user.isNewAccount));
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const recoveryAccessToken = hashParams.get('access_token') || params.get('access_token') || '';
    const recoveryRefreshToken = hashParams.get('refresh_token') || params.get('refresh_token') || '';
    const recoveryType = hashParams.get('type') || params.get('type') || '';
    if (recoveryType === 'recovery' && recoveryAccessToken && recoveryRefreshToken) {
      let cancelled = false;
      setIsForgotMode(true);
      setResetToken('supabase-session');
      setResetSent(false);
      setResetComplete(false);
      authApi.setPasswordRecoverySession(recoveryAccessToken, recoveryRefreshToken)
        .then(account => {
          if (!cancelled) setResetEmail((account || '').trim().toLowerCase());
        })
        .catch(err => {
          if (!cancelled) setError(err instanceof Error ? err.message : '重設連結已失效，請重新寄送。');
        });
      window.history.replaceState(null, '', window.location.pathname);
      return () => {
        cancelled = true;
      };
    }

    const token = params.get('resetToken') || '';
    const account = (params.get('email') || '').trim().toLowerCase();
    if (!token) return;

    setIsForgotMode(true);
    setResetToken(token);
    setResetEmail(account);
    setResetSent(false);
    setResetComplete(false);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('googleLoginToken') || '';
    const account = (params.get('email') || '').trim().toLowerCase();
    if (!token || !account) return;

    let cancelled = false;
    setGoogleSubmitting(true);
    authApi.confirmGoogleLoginToken(account, token)
      .then(user => {
        if (cancelled) return;
        window.history.replaceState(null, '', window.location.pathname);
        continueAfterGmailLogin(user, account);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : '登入連結失敗，請重新寄送。');
      })
      .finally(() => {
        if (!cancelled) setGoogleSubmitting(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('resetToken') || params.get('googleLoginToken')) return;

    let cancelled = false;
    authApi.me()
      .then(user => {
        if (!cancelled && user.mustSetPassword) {
          continueAfterGmailLogin(user, user.username);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const account = email.trim().toLowerCase();
    if (!EMAIL_RE.test(account)) {
      setError('請輸入正確的 Email 格式。');
      return;
    }
    if (password.length < 8) {
      setError('密碼至少需要 8 碼。');
      return;
    }

    setSubmitting(true);
    try {
      const user = isRegisterMode
        ? await authApi.register(account, password, nickname.trim().slice(0, MAX_CHEF_NAME_LENGTH))
        : await authApi.login(account, password);

      finishLogin(account, user.chefName, isRegisterMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const account = resetEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(account)) {
      setError('請輸入正確的 Email 格式。');
      return;
    }
    setResetSubmitting(true);
    try {
      await authApi.requestPasswordReset(account);
      setResetSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '寄送重設信失敗，請稍後再試。');
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const account = resetEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(account)) {
      setError('請輸入正確的 Email 格式。');
      return;
    }
    if (newResetPassword.length < 8) {
      setError('新密碼至少需要 8 碼。');
      return;
    }
    if (newResetPassword !== newResetPasswordConfirm) {
      setError('兩次輸入的新密碼不一致。');
      return;
    }

    setResetSubmitting(true);
    try {
      if (resetToken === 'supabase-session') {
        await authApi.completePasswordRecovery(newResetPassword);
      } else {
        await authApi.confirmPasswordReset(account, resetToken, newResetPassword);
      }
      setResetComplete(true);
      setResetToken('');
      window.history.replaceState(null, '', window.location.pathname);
    } catch (err) {
      setError(err instanceof Error ? err.message : '重設密碼失敗，請重新寄送重設信。');
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleGoogleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const account = (googleEmail || email).trim().toLowerCase();
    if (!GMAIL_RE.test(account)) {
      setError('目前 Gmail 驗證登入只支援 @gmail.com 信箱。');
      return;
    }

    setGoogleSubmitting(true);
    try {
      await authApi.requestGoogleLogin(account);
      setGoogleEmail(account);
      setGoogleCode('');
      setGoogleSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '寄送 Gmail 驗證信失敗，請稍後再試。');
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleGoogleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const account = googleEmail.trim().toLowerCase();
    const code = googleCode.trim();
    if (!GMAIL_RE.test(account)) {
      setError('目前 Gmail 驗證登入只支援 @gmail.com 信箱。');
      return;
    }
    if (!/^\d{6,9}$/.test(code)) {
      setError('請輸入信中收到的驗證碼。');
      return;
    }

    setGoogleSubmitting(true);
    try {
      const user = await authApi.confirmGoogleLogin(account, '', code);
      continueAfterGmailLogin(user, account);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入驗證失敗，請重新寄送。');
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleFirstPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingPasswordUser) return;
    setError('');
    if (firstPassword.length < 8) {
      setError('新密碼至少需要 8 碼。');
      return;
    }
    if (firstPassword !== firstPasswordConfirm) {
      setError('兩次輸入的新密碼不一致。');
      return;
    }

    setFirstPasswordSubmitting(true);
    try {
      await authApi.changePassword('', firstPassword);
      finishLogin(
        pendingPasswordUser.username,
        pendingPasswordUser.chefName,
        Boolean(pendingPasswordUser.isNewAccount),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定密碼失敗，請稍後再試。');
    } finally {
      setFirstPasswordSubmitting(false);
    }
  };

  const enterForgotMode = () => {
    setIsForgotMode(true);
    setResetEmail(email);
    setResetToken('');
    setNewResetPassword('');
    setNewResetPasswordConfirm('');
    setResetSent(false);
    setResetComplete(false);
    setError('');
  };

  const exitForgotMode = () => {
    setIsForgotMode(false);
    setResetToken('');
    setNewResetPassword('');
    setNewResetPasswordConfirm('');
    setResetSent(false);
    setResetComplete(false);
    setError('');
    window.history.replaceState(null, '', window.location.pathname);
  };

  const resetGoogleFlow = () => {
    setGoogleSent(false);
    setGoogleCode('');
    setError('');
  };

  const inputClass = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-[var(--theme-main)] focus:bg-white focus:ring-2 focus:ring-[var(--theme-soft)]';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-[var(--theme-tint)] p-4 text-slate-800 sm:p-6 md:p-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md rounded-3xl border border-[var(--theme-soft)] bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.10)]"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-2xl border border-[var(--theme-soft)] bg-[var(--theme-tint)] p-2 shadow-sm">
            <img src={logoImage} alt="Smart Fridge logo" className="h-full w-full object-contain" />
          </div>
          <h1 className="font-sans text-3xl font-extrabold tracking-tight text-slate-900">AI食代</h1>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--theme-text)]">Smart Fridge</p>
        </div>

        <AnimatePresence mode="wait">
          {pendingPasswordUser ? (
            <motion.div key="gmail-password" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <form onSubmit={handleFirstPasswordSubmit} className="space-y-4">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">設定登入密碼</h2>
                  <p className="mt-1 text-xs text-slate-500">這個 Gmail 是新帳號。請先設定密碼，之後也可以用 Gmail 驗證或密碼登入。</p>
                </div>
                <label className="block">
                  <span className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </span>
                  <input type="email" value={pendingPasswordUser.username} className={inputClass} disabled />
                </label>
                <label className="block">
                  <span className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
                    <LockKeyhole className="h-3.5 w-3.5" />
                    新密碼
                  </span>
                  <div className="relative">
                    <input
                      type={showFirstPassword ? 'text' : 'password'}
                      placeholder="至少 8 碼"
                      value={firstPassword}
                      minLength={8}
                      onChange={e => { setFirstPassword(e.target.value); setError(''); }}
                      className={`${inputClass} pr-12`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowFirstPassword(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      tabIndex={-1}
                    >
                      {showFirstPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </label>
                <label className="block">
                  <span className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
                    <LockKeyhole className="h-3.5 w-3.5" />
                    再輸入一次新密碼
                  </span>
                  <input
                    type="password"
                    placeholder="再次輸入新密碼"
                    value={firstPasswordConfirm}
                    minLength={8}
                    onChange={e => { setFirstPasswordConfirm(e.target.value); setError(''); }}
                    className={inputClass}
                    required
                  />
                </label>
                {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-center text-xs font-bold text-rose-600">{error}</p>}
                <button
                  type="submit"
                  disabled={firstPasswordSubmitting}
                  className="w-full cursor-pointer rounded-2xl bg-[var(--theme-main)] px-4 py-4 text-sm font-extrabold text-white shadow-sm transition-all hover:bg-[var(--theme-dark)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {firstPasswordSubmitting ? '設定中...' : '設定密碼並進入'}
                </button>
              </form>
            </motion.div>
          ) : isForgotMode ? (
            <motion.div key="forgot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <button type="button" onClick={exitForgotMode} className="mb-4 flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer">
                <ArrowLeft className="h-3.5 w-3.5" />
                返回登入
              </button>

              {resetComplete ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                  <p className="text-base font-extrabold text-slate-900">密碼已重設</p>
                  <p className="text-sm text-slate-500">請回到登入畫面，使用新密碼登入。</p>
                  <button type="button" onClick={exitForgotMode} className="mt-2 rounded-2xl bg-[var(--theme-main)] px-6 py-3 text-sm font-bold text-white cursor-pointer">
                    返回登入
                  </button>
                </div>
              ) : resetToken ? (
                <form onSubmit={handleResetConfirm} className="space-y-4">
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">設定新密碼</h2>
                    <p className="mt-1 text-xs text-slate-500">請確認信箱並輸入新的登入密碼。</p>
                  </div>
                  <label className="block">
                    <span className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </span>
                    <input
                      type="email"
                      placeholder="name@example.com"
                      value={resetEmail}
                      onChange={e => { setResetEmail(e.target.value.trim()); setError(''); }}
                      className={inputClass}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
                      <LockKeyhole className="h-3.5 w-3.5" />
                      新密碼
                    </span>
                    <input
                      type="password"
                      placeholder="至少 8 碼"
                      value={newResetPassword}
                      minLength={8}
                      onChange={e => { setNewResetPassword(e.target.value); setError(''); }}
                      className={inputClass}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
                      <LockKeyhole className="h-3.5 w-3.5" />
                      再輸入一次新密碼
                    </span>
                    <input
                      type="password"
                      placeholder="再次輸入新密碼"
                      value={newResetPasswordConfirm}
                      minLength={8}
                      onChange={e => { setNewResetPasswordConfirm(e.target.value); setError(''); }}
                      className={inputClass}
                      required
                    />
                  </label>
                  {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-center text-xs font-bold text-rose-600">{error}</p>}
                  <button
                    type="submit"
                    disabled={resetSubmitting}
                    className="w-full cursor-pointer rounded-2xl bg-[var(--theme-main)] px-4 py-4 text-sm font-extrabold text-white shadow-sm transition-all hover:bg-[var(--theme-dark)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {resetSubmitting ? '重設中...' : '重設密碼'}
                  </button>
                </form>
              ) : resetSent ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                  <p className="text-base font-extrabold text-slate-900">重設連結已寄出</p>
                  <p className="text-sm text-slate-500">請查看 <span className="font-bold text-slate-700">{resetEmail}</span> 的信箱，並依信件連結設定新密碼。</p>
                  <button type="button" onClick={exitForgotMode} className="mt-2 rounded-2xl bg-[var(--theme-main)] px-6 py-3 text-sm font-bold text-white cursor-pointer">
                    返回登入
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetRequest} className="space-y-4">
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">忘記密碼</h2>
                    <p className="mt-1 text-xs text-slate-500">輸入你的 Email，我們會寄送密碼重設連結。</p>
                  </div>
                  <label className="block">
                    <span className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </span>
                    <input
                      type="email"
                      placeholder="name@example.com"
                      value={resetEmail}
                      onChange={e => { setResetEmail(e.target.value.trim()); setError(''); }}
                      className={inputClass}
                      required
                    />
                  </label>
                  {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-center text-xs font-bold text-rose-600">{error}</p>}
                  <button
                    type="submit"
                    disabled={resetSubmitting}
                    className="w-full cursor-pointer rounded-2xl bg-[var(--theme-main)] px-4 py-4 text-sm font-extrabold text-white shadow-sm transition-all hover:bg-[var(--theme-dark)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {resetSubmitting ? '寄送中...' : '寄送重設連結'}
                  </button>
                </form>
              )}
            </motion.div>
          ) : (
            <motion.div key="auth" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
              <div className="mb-5 grid grid-cols-2 rounded-full bg-slate-100 p-1 text-sm font-extrabold text-slate-600">
                <button type="button" onClick={() => { setIsRegisterMode(false); setError(''); }}
                  className={`rounded-full py-3 transition-all cursor-pointer ${!isRegisterMode ? 'bg-[var(--theme-main)] text-white shadow-sm' : 'hover:text-[var(--theme-text)]'}`}>
                  登入
                </button>
                <button type="button" onClick={() => { setIsRegisterMode(true); setError(''); }}
                  className={`rounded-full py-3 transition-all cursor-pointer ${isRegisterMode ? 'bg-[var(--theme-main)] text-white shadow-sm' : 'hover:text-[var(--theme-text)]'}`}>
                  註冊
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {isRegisterMode && (
                  <label className="block">
                    <span className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
                      <UserRound className="h-3.5 w-3.5" />
                      暱稱
                    </span>
                    <input type="text" placeholder="例如：Momo" value={nickname} maxLength={MAX_CHEF_NAME_LENGTH}
                      onChange={e => setNickname(e.target.value.slice(0, MAX_CHEF_NAME_LENGTH))}
                      className={inputClass} required />
                  </label>
                )}

                <label className="block">
                  <span className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </span>
                  <input type="email" placeholder="you@example.com" value={email}
                    onChange={e => { setEmail(e.target.value.trim()); setError(''); }}
                    className={inputClass} required />
                </label>

                <label className="block">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
                      <LockKeyhole className="h-3.5 w-3.5" />
                      密碼
                    </span>
                    {!isRegisterMode && (
                      <button type="button" onClick={enterForgotMode}
                        className="text-xs font-bold text-[var(--theme-text)] hover:underline cursor-pointer">
                        忘記密碼？
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="至少 8 碼"
                      value={password}
                      minLength={8}
                      onChange={e => { setPassword(e.target.value); setError(''); }}
                      className={`${inputClass} pr-12`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </label>

                {error && (
                  <p className="rounded-2xl bg-rose-50 px-4 py-3 text-center text-xs font-bold text-rose-600">{error}</p>
                )}

                <button type="submit" disabled={submitting}
                  className="mt-2 w-full cursor-pointer rounded-2xl bg-[var(--theme-main)] px-4 py-4 text-sm font-extrabold text-white shadow-sm transition-all hover:bg-[var(--theme-dark)] disabled:cursor-not-allowed disabled:opacity-60">
                  {submitting ? '處理中...' : isRegisterMode ? '建立帳號' : '登入'}
                </button>
              </form>

              <div className="mt-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-semibold text-slate-400">或</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3">
                  <p className="text-sm font-extrabold text-slate-800">使用 Gmail 登入</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">我們會寄送驗證碼到你的 Gmail。</p>
                </div>

                {googleSent ? (
                  <form onSubmit={handleGoogleConfirm} className="space-y-3">
                    <p className="text-xs text-slate-500">驗證碼已寄到 <span className="font-bold text-slate-700">{googleEmail}</span>。</p>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="輸入信中的驗證碼"
                      value={googleCode}
                      maxLength={GOOGLE_OTP_MAX_LENGTH}
                      onChange={e => { setGoogleCode(e.target.value.replace(/\D/g, '').slice(0, GOOGLE_OTP_MAX_LENGTH)); setError(''); }}
                      className={inputClass}
                      required
                    />
                    <button
                      type="submit"
                      disabled={googleSubmitting}
                      className="w-full cursor-pointer rounded-2xl bg-white px-4 py-3 text-sm font-extrabold text-[var(--theme-text)] ring-1 ring-slate-200 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {googleSubmitting ? '驗證中...' : '完成登入'}
                    </button>
                    <button type="button" onClick={resetGoogleFlow} className="w-full text-xs font-bold text-slate-500 hover:text-slate-700">
                      更換信箱 / 重新寄送
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleGoogleRequest} className="space-y-3">
                    <input
                      type="email"
                      placeholder="name@gmail.com"
                      value={googleEmail || (GMAIL_RE.test(email) ? email : '')}
                      onChange={e => { setGoogleEmail(e.target.value.trim()); setError(''); }}
                      className={inputClass}
                      required
                    />
                    <button
                      type="submit"
                      disabled={googleSubmitting}
                      className="w-full cursor-pointer rounded-2xl bg-white px-4 py-3 text-sm font-extrabold text-[var(--theme-text)] ring-1 ring-slate-200 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {googleSubmitting ? '寄送中...' : '寄送登入驗證碼'}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
