/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { User, Award, Palette, Save, Clock, Bell, Type, Lock, Eye, EyeOff, LogOut } from 'lucide-react';
import { ThemeKey } from '../types';
import { authApi } from '../lib/api';

interface Props {
  theme: ThemeKey;
  onThemeChange: (t: ThemeKey) => void;
  chefName: string;
  onChefNameChange: (name: string) => void;
  expiryPushTime: string;
  onExpiryPushTimeChange: (time: string) => void;
  fontSize: 'sm' | 'md' | 'lg';
  onFontSizeChange: (size: 'sm' | 'md' | 'lg') => void;
  onLogout: () => void;
}

const THEME_OPTIONS: { key: ThemeKey; label: string; dark: string; light: string }[] = [
  { key: 'brown', label: '棕色', dark: '#5b3a2e', light: '#e8d6c4' },
  { key: 'emerald', label: '深墨綠', dark: '#022c22', light: '#065f46' },
  { key: 'teal', label: '海洋藍', dark: '#0c3547', light: '#155e7a' },
  { key: 'charcoal', label: '深灰色', dark: '#334155', light: '#475569' },
  { key: 'sky', label: '淺藍', dark: '#e0f2fe', light: '#bae6fd' },
  { key: 'rose', label: '粉紅色', dark: '#ad6a7f', light: '#fde2ea' },
];

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'));
const timeWheelButtonClassName =
  'h-9 w-full snap-center rounded-lg text-xs font-bold transition-colors';
const MAX_CHEF_NAME_LENGTH = 15;

const parseScheduleTime = (value: string) => {
  const [hourText = '0', minute = '00'] = value.split(':');
  const hour24 = Number(hourText);
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;

  return {
    period,
    hour: String(hour12),
    minute: MINUTE_OPTIONS.includes(minute) ? minute : '00',
  };
};

const toScheduleTime = (period: string, hour: string, minute: string) => {
  const hourNumber = Number(hour);
  const hour24 = period === 'PM'
    ? (hourNumber === 12 ? 12 : hourNumber + 12)
    : (hourNumber === 12 ? 0 : hourNumber);

  return `${String(hour24).padStart(2, '0')}:${minute}`;
};

export default function SettingsView({
  theme,
  onThemeChange,
  chefName,
  onChefNameChange,
  expiryPushTime,
  onExpiryPushTimeChange,
  fontSize,
  onFontSizeChange,
  onLogout,
}: Props) {
  const [draftName, setDraftName] = useState(chefName);
  const [nameSaved, setNameSaved] = useState(false);
  const [draftExpiryPushTime, setDraftExpiryPushTime] = useState(expiryPushTime);
  const [timeSaved, setTimeSaved] = useState(false);
  const activeTheme = THEME_OPTIONS.find(opt => opt.key === theme) ?? THEME_OPTIONS[0];
  const avatarIconColor = theme === 'sky' ? '#0f172a' : '#ffffff';

  useEffect(() => {
    setDraftName(chefName);
  }, [chefName]);

  useEffect(() => {
    setDraftExpiryPushTime(expiryPushTime);
    setTimeSaved(false);
  }, [expiryPushTime]);

  const handleSaveName = () => {
    const nextName = draftName.trim().slice(0, MAX_CHEF_NAME_LENGTH) || '頂級執行星廚';
    setDraftName(nextName);
    onChefNameChange(nextName);
    setNameSaved(true);
    window.setTimeout(() => setNameSaved(false), 1400);
  };

  const handleSavePushTime = () => {
    onExpiryPushTimeChange(draftExpiryPushTime);
    setTimeSaved(true);
    window.setTimeout(() => setTimeSaved(false), 1400);
  };

  return (
    <div className="animate-fade-in max-w-3xl mx-auto">
      <div className="bg-white border border-slate-150 rounded-2xl p-8 shadow-sm text-center">
        <div className="text-left mb-5">
          <h2 className="font-sans font-bold text-2xl text-[var(--theme-text)]">個人設定</h2>
        </div>

        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 md:p-5 text-left">
          <label className="mb-2 block text-sm font-bold text-slate-700">暱稱</label>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 items-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center shadow-sm relative border-2 shrink-0 transition-colors"
              style={{
                background: `linear-gradient(135deg, ${activeTheme.dark}, ${activeTheme.light})`,
                borderColor: `${activeTheme.light}55`,
              }}
            >
              <User className="w-8 h-8" style={{ color: avatarIconColor }} />
              <div
                className="absolute -top-1 -right-1 p-1.5 rounded-full border border-white shadow-sm transition-colors"
                style={{ backgroundColor: activeTheme.light }}
              >
                <Award className="w-3 h-3" style={{ color: activeTheme.dark }} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 min-w-0">
              <input
                value={draftName}
                maxLength={MAX_CHEF_NAME_LENGTH}
                onChange={e => {
                  setDraftName(e.target.value.slice(0, MAX_CHEF_NAME_LENGTH));
                  setNameSaved(false);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveName();
                }}
                placeholder="輸入您的暱稱"
                className="w-full min-w-0 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--theme-main)]"
              />
              <button
                onClick={handleSaveName}
                className="inline-flex min-w-0 items-center justify-center gap-2 bg-[var(--theme-dark)] hover:bg-[var(--theme-main)] text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{nameSaved ? '已儲存' : '儲存'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 text-left">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4" style={{ color: 'var(--theme-text)' }} />
            <h4 className="font-semibold text-lg text-slate-900">自動排程</h4>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Bell className="w-4 h-4" style={{ color: 'var(--theme-text)' }} />
              即期食材推播時間
            </span>
            <span className="block text-xs text-slate-400 mt-1">系統會依您設定的時間提醒即將到期的食材。</span>
            <ScheduleTimeSelect
              value={draftExpiryPushTime}
              onChange={value => {
                setDraftExpiryPushTime(value);
                setTimeSaved(false);
              }}
            />
            <button
              onClick={handleSavePushTime}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--theme-dark)] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--theme-main)] cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {timeSaved ? '已儲存' : '儲存推播時間'}
            </button>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 text-left">
          <div className="flex items-center gap-2 mb-4">
            <Type className="w-4 h-4" style={{ color: 'var(--theme-text)' }} />
            <h4 className="font-semibold text-lg text-slate-900">字體大小</h4>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {([
              { key: 'sm', label: '小', preview: '文字' },
              { key: 'md', label: '中', preview: '文字' },
              { key: 'lg', label: '大', preview: '文字' },
            ] as const).map(opt => (
              <button
                key={opt.key}
                onClick={() => onFontSizeChange(opt.key)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 transition-colors ${
                  fontSize === opt.key
                    ? 'border-[var(--theme-main)] bg-[var(--theme-tint)] text-[var(--theme-text)]'
                    : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                <span style={{ fontSize: opt.key === 'sm' ? '12px' : opt.key === 'lg' ? '20px' : '16px' }} className="font-bold leading-none">{opt.preview}</span>
                <span className="text-xs font-semibold">{opt.label}</span>
                {fontSize === opt.key && <span className="text-[10px] font-bold" style={{ color: 'var(--theme-text)' }}>使用中</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 text-left">
          <div className="flex items-center gap-2 mb-5">
            <Palette className="w-4 h-4" style={{ color: 'var(--theme-text)' }} />
            <h4 className="font-semibold text-lg text-slate-900">介面色系主題</h4>
          </div>

          <div className="grid grid-cols-3 gap-5">
            {THEME_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => onThemeChange(opt.key)}
                className="flex flex-col items-center gap-2 cursor-pointer group"
                title={opt.label}
              >
                <div
                  className={`w-14 h-14 rounded-xl transition-all duration-200 ${
                    theme === opt.key ? 'scale-110' : 'opacity-70 hover:opacity-100 hover:scale-105'
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${opt.dark} 50%, ${opt.light} 50%)`,
                    boxShadow: theme === opt.key ? `0 0 0 2px #ffffff, 0 0 0 5px ${opt.light}` : undefined,
                  }}
                />
                <span className={`text-xs font-semibold transition-colors ${
                  theme === opt.key ? 'text-slate-900' : 'text-slate-400'
                }`}>
                  {opt.label}
                </span>
                {theme === opt.key && (
                  <span className="text-[10px] font-bold" style={{ color: 'var(--theme-text)' }}>使用中</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 text-left">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4" style={{ color: 'var(--theme-text)' }} />
            <h4 className="font-semibold text-lg text-slate-900">修改密碼</h4>
          </div>
          <ChangePasswordForm />
        </div>

        {/* 登出（手機版唯一可達的登出入口；桌面版另有側邊欄登出鈕） */}
        <div className="mt-8 pt-6 border-t border-slate-100 text-left">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4" style={{ color: 'var(--theme-text)' }} />
            <h4 className="font-semibold text-lg text-slate-900">帳號</h4>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:border-[var(--theme-main)] hover:bg-[var(--theme-tint)] hover:text-[var(--theme-text)] cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>登出</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMsg('請填寫所有欄位');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMsg('新密碼至少需要 8 個字元');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('兩次輸入的新密碼不一致');
      return;
    }
    setStatus('loading');
    setErrorMsg('');
    authApi.changePassword(currentPassword, newPassword)
      .then(() => {
        setStatus('success');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        window.setTimeout(() => setStatus('idle'), 2500);
      })
      .catch(err => {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : '修改失敗，請確認舊密碼是否正確');
      });
  };

  const inputClass = 'w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 pr-10 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--theme-main)]';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="relative">
        <input
          type={showCurrent ? 'text' : 'password'}
          value={currentPassword}
          onChange={e => { setCurrentPassword(e.target.value); setStatus('idle'); }}
          placeholder="目前密碼"
          className={inputClass}
        />
        <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
          {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <div className="relative">
        <input
          type={showNew ? 'text' : 'password'}
          value={newPassword}
          onChange={e => { setNewPassword(e.target.value); setStatus('idle'); }}
          placeholder="新密碼（至少 8 字元）"
          className={inputClass}
        />
        <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
          {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <input
        type="password"
        value={confirmPassword}
        onChange={e => { setConfirmPassword(e.target.value); setStatus('idle'); }}
        placeholder="再次輸入新密碼"
        className={inputClass}
      />

      {errorMsg && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{errorMsg}</p>
      )}
      {status === 'success' && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-600">密碼已成功修改！</p>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--theme-dark)] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--theme-main)] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
      >
        {status === 'loading' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        {status === 'loading' ? '修改中...' : '確認修改密碼'}
      </button>
    </form>
  );
}

function ScheduleTimeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = parseScheduleTime(value);

  const update = (next: Partial<typeof selected>) => {
    const merged = { ...selected, ...next };
    onChange(toScheduleTime(merged.period, merged.hour, merged.minute));
  };

  return (
    <div className="mt-3 grid grid-cols-[1fr_1fr_1fr] gap-2 rounded-2xl border border-slate-200 bg-white p-2">
      <TimeWheelColumn
        label="時段"
        options={[
          { value: 'AM', label: '上午' },
          { value: 'PM', label: '下午' },
        ]}
        value={selected.period}
        onChange={period => update({ period })}
      />
      <TimeWheelColumn
        label="小時"
        options={HOUR_OPTIONS.map(hour => ({ value: hour, label: hour }))}
        value={selected.hour}
        onChange={hour => update({ hour })}
      />
      <TimeWheelColumn
        label="分鐘"
        options={MINUTE_OPTIONS.map(minute => ({ value: minute, label: minute }))}
        value={selected.minute}
        onChange={minute => update({ minute })}
      />
    </div>
  );
}

function TimeWheelColumn({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      <div className="h-28 overflow-y-auto rounded-xl bg-slate-50 p-1.5 snap-y snap-mandatory">
        <div className="space-y-1">
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`${timeWheelButtonClassName} ${
                value === option.value
                  ? 'bg-[var(--theme-tint)] text-[var(--theme-text)] ring-1 ring-[var(--theme-main)]'
                  : 'text-slate-500 hover:bg-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
