import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Shield, 
  Loader2, 
  KeyRound, 
  AlertTriangle, 
  FileText, 
  ArrowLeft, 
  ArrowRight, 
  Clock, 
  Lock, 
  Unlock, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  CheckCircle2,
  Info
} from 'lucide-react';

interface PaperDocInfo {
  paper_title: string;
  unit_code: string;
  total_pages: number;
}

interface OrderDocInfo {
  id: string;
  purchased_pages: number[] | null;
  page_quantity: number | null;
  customer_name: string;
}

function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '00000000-0000-4000-8000-000000000000';
  let id = localStorage.getItem('godrery_device_id');
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!id || !uuidRegex.test(id.trim())) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      id = crypto.randomUUID();
    } else {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    localStorage.setItem('godrery_device_id', id);
  }
  return id;
}

export function DocumentAccessView() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const [requireNames, setRequireNames] = useState(false);
  
  const [firstName, setFirstName] = useState('');
  const [secondName, setSecondName] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const [paperInfo, setPaperInfo] = useState<PaperDocInfo | null>(null);
  const [orderInfo, setOrderInfo] = useState<OrderDocInfo | null>(null);
  const [activeDeviceId, setActiveDeviceId] = useState<string>('');

  // 10-Minute Single Page Viewer State
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(600); // 10 minutes default
  const [isPageUnlocked, setIsPageUnlocked] = useState<boolean>(false);
  const [pageLoadTime, setPageLoadTime] = useState<number>(Date.now());

  const PAGE_VIEW_DURATION_SECONDS = 600; // Exactly 10 minutes required per page

  // Calculate list of available pages (restricted if purchased_pages, else 1..total_pages)
  const availablePages = useMemo<number[]>(() => {
    if (orderInfo?.purchased_pages && Array.isArray(orderInfo.purchased_pages) && orderInfo.purchased_pages.length > 0) {
      return [...orderInfo.purchased_pages].sort((a, b) => a - b);
    }
    const total = paperInfo?.total_pages && paperInfo.total_pages > 0 ? paperInfo.total_pages : 1;
    return Array.from({ length: total }, (_, i) => i + 1);
  }, [paperInfo?.total_pages, orderInfo?.purchased_pages]);

  const currentPageNumber = availablePages[currentPageIndex] || 1;
  const isLastPage = currentPageIndex >= availablePages.length - 1;
  const isFirstPage = currentPageIndex === 0;

  // Extract access token on mount
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/\/document\/access\/(.+)/);
    if (match && match[1]) {
      const t = decodeURIComponent(match[1]);
      setToken(t);
      const devId = getOrCreateDeviceId();
      setActiveDeviceId(devId);
      verifyToken(t, devId);
    } else {
      setError("Invalid or missing document access link.");
      setLoading(false);
    }
  }, []);

  // Block right click, screenshot and print key shortcuts to prevent unauthorized extraction
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 's' || e.key === 'u')) {
        e.preventDefault();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const verifyToken = async (t: string, devId: string) => {
    try {
      const res = await fetch('/api/document/verify', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Device-Id': devId
        },
        credentials: 'include',
        body: JSON.stringify({ token: t, deviceId: devId })
      });
      const data = await res.json();
      if (data.success) {
        if (data.deviceId) {
          localStorage.setItem('godrery_device_id', data.deviceId);
          setActiveDeviceId(data.deviceId);
        }
        if (data.paper) setPaperInfo(data.paper);
        if (data.order) setOrderInfo(data.order);
        setVerified(true);
      } else if (data.requireNames) {
        setRequireNames(true);
      } else {
        setError(data.error || 'Access denied');
      }
    } catch (err) {
      setError('Network connection error. Please refresh the page to retry.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyNames = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setError('');
    const devId = activeDeviceId || getOrCreateDeviceId();
    try {
      const res = await fetch('/api/document/register-device', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Device-Id': devId
        },
        credentials: 'include',
        body: JSON.stringify({ 
          token, 
          firstName: firstName.trim(), 
          secondName: secondName.trim(),
          deviceId: devId
        })
      });
      const data = await res.json();
      if (data.success) {
        if (data.deviceId) {
          localStorage.setItem('godrery_device_id', data.deviceId);
          setActiveDeviceId(data.deviceId);
        }
        if (data.paper) setPaperInfo(data.paper);
        if (data.order) setOrderInfo(data.order);
        setRequireNames(false);
        setVerified(true);
      } else {
        setError(data.error || 'Verification failed. Please check the names entered.');
      }
    } catch (err) {
      setError('Network connection error. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  // 10-Minute Lock Timer Logic per Page
  useEffect(() => {
    if (!verified || !token) return;

    const storageKey = `godrery_unlocked_pages_${orderInfo?.id || token}`;
    let unlockedMap: Record<string, number> = {};
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) unlockedMap = JSON.parse(raw);
    } catch (e) {
      unlockedMap = {};
    }

    const pageKey = String(currentPageNumber);
    const now = Date.now();

    if (!unlockedMap[pageKey]) {
      unlockedMap[pageKey] = now;
      try {
        localStorage.setItem(storageKey, JSON.stringify(unlockedMap));
      } catch (e) {}
    }

    const firstViewedAt = unlockedMap[pageKey];
    const elapsedSeconds = Math.floor((now - firstViewedAt) / 1000);
    const remaining = Math.max(0, PAGE_VIEW_DURATION_SECONDS - elapsedSeconds);

    setSecondsRemaining(remaining);
    setIsPageUnlocked(remaining === 0);
    setPageLoadTime(now);

    const interval = setInterval(() => {
      const currentNow = Date.now();
      const currentElapsed = Math.floor((currentNow - firstViewedAt) / 1000);
      const currentRemaining = Math.max(0, PAGE_VIEW_DURATION_SECONDS - currentElapsed);

      setSecondsRemaining(currentRemaining);
      if (currentRemaining === 0) {
        setIsPageUnlocked(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [verified, token, currentPageNumber, orderInfo?.id]);

  const handleNextPage = () => {
    if (!isPageUnlocked) return;
    if (currentPageIndex < availablePages.length - 1) {
      setCurrentPageIndex(prev => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(prev => prev - 1);
    }
  };

  const formatTimer = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = Math.min(
    100, 
    Math.floor(((PAGE_VIEW_DURATION_SECONDS - secondsRemaining) / PAGE_VIEW_DURATION_SECONDS) * 100)
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#052b1b] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-[#00D26A]" />
        <p className="text-sm font-semibold text-emerald-200/80">Securing examination session...</p>
      </div>
    );
  }

  // --- SECURE SINGLE-PAGE DOCUMENT PREVIEW & VIEWING ROOM ---
  if (verified) {
    const customerNameDisplay = orderInfo?.customer_name || 'Authorized Student';
    const paperTitleDisplay = paperInfo?.paper_title || 'Examination Document';
    const unitCodeDisplay = paperInfo?.unit_code || 'EXAM';
    const totalPagesDisplay = availablePages.length;

    // Single page PDF streaming URL - delivers strictly 1 page at a time so user cannot scroll to last page!
    const pagePdfUrl = `/api/document/page/${encodeURIComponent(token)}/${currentPageNumber}?deviceId=${encodeURIComponent(activeDeviceId)}&t=${pageLoadTime}#toolbar=0&navpanes=0&scrollbar=1`;

    return (
      <div className="w-full h-screen bg-[#031d12] flex flex-col overflow-hidden select-none">
        {/* Top Control Bar */}
        <header className="w-full bg-[#02140b] border-b border-emerald-900/60 px-4 py-2.5 sm:px-6 flex flex-wrap items-center justify-between gap-3 shadow-lg shrink-0 z-20">
          {/* Document & Branding Info */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#00D26A]/20 border border-[#00D26A]/40 text-[#00D26A] flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-black text-white truncate max-w-xs sm:max-w-md">
                  {paperTitleDisplay}
                </h1>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-950 text-[#00D26A] border border-emerald-800/80 px-2 py-0.5 rounded-md">
                  {unitCodeDisplay}
                </span>
              </div>
              <p className="text-[11px] text-emerald-300/70 truncate">
                Licensed to: <strong className="text-white font-semibold">{customerNameDisplay}</strong> • Single-Page Controlled DRM
              </p>
            </div>
          </div>

          {/* Page Counter & 10-Minute Lock Status Badge */}
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            {/* Page Count Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/90 border border-slate-700/80 rounded-xl shadow-xs">
              <FileText className="w-3.5 h-3.5 text-[#00D26A]" />
              <span className="text-xs font-bold text-white font-mono">
                Page <span className="text-[#00D26A] font-black">{currentPageIndex + 1}</span> of {totalPagesDisplay}
              </span>
            </div>

            {/* 10-Minute Reading Lock Status */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
              isPageUnlocked
                ? 'bg-emerald-950/90 border-[#00D26A]/60 text-[#00D26A]'
                : 'bg-amber-950/80 border-amber-600/50 text-amber-300'
            }`}>
              {isPageUnlocked ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-[#00D26A] shrink-0" />
                  <span>Next Page Unlocked</span>
                </>
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
                  <span className="font-mono">
                    Page Locked: {formatTimer(secondsRemaining)}
                  </span>
                </>
              )}
            </div>

            {/* Zoom Controls */}
            <div className="hidden md:flex items-center bg-slate-900/90 border border-slate-700/80 rounded-xl p-1 gap-1">
              <button 
                onClick={() => setZoomLevel(prev => Math.max(75, prev - 15))}
                className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono px-1.5 text-slate-300 font-bold">{zoomLevel}%</span>
              <button 
                onClick={() => setZoomLevel(prev => Math.min(160, prev + 15))}
                className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setZoomLevel(100)}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors ml-0.5 border-l border-slate-700"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            {/* Return to Home */}
            <button 
              onClick={() => window.location.href = '/'} 
              className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </header>

        {/* 10-Minute Lock Banner & Progress Bar (Restricts jumping to future pages) */}
        <div className="w-full bg-[#041a0f] border-b border-emerald-950/80 px-4 py-1.5 flex items-center justify-between text-[11px] shrink-0">
          <div className="flex items-center gap-2 text-emerald-200/80">
            <Info className="w-3.5 h-3.5 text-[#00D26A] shrink-0" />
            <span className="hidden sm:inline">
              Anti-Screen-Sharing Security: Each page is displayed for a mandatory 10 minutes before advancing to ensure thorough examination review.
            </span>
            <span className="sm:hidden">
              10-minute viewing lock active for Page {currentPageIndex + 1}.
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-mono text-emerald-400/90 font-bold">
              {progressPercent}% Complete
            </span>
            <div className="w-24 sm:w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-1000 ${isPageUnlocked ? 'bg-[#00D26A]' : 'bg-amber-400'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Document Display Canvas with Anti-Screen-Share Watermark */}
        <div className="flex-grow w-full relative bg-slate-950 flex flex-col items-center justify-center overflow-auto p-2 sm:p-4">
          {/* Security Dynamic Watermark Overlay (Repeated diagonally across entire view) */}
          <div 
            className="absolute inset-0 pointer-events-none z-10 overflow-hidden flex flex-wrap items-center justify-around opacity-15 select-none"
            style={{ 
              backgroundImage: `radial-gradient(rgba(0, 210, 106, 0.08) 1px, transparent 0)`,
              backgroundSize: '24px 24px'
            }}
          >
            {Array.from({ length: 16 }).map((_, i) => (
              <div 
                key={i} 
                className="transform -rotate-25 text-white font-mono text-[11px] sm:text-xs font-black tracking-widest whitespace-nowrap p-8"
              >
                GODRERY SECURE DRM • {customerNameDisplay.toUpperCase()} • PAGE {currentPageNumber} • SCREEN CAPTURE PROHIBITED
              </div>
            ))}
          </div>

          {/* Secure Single-Page PDF View Container */}
          <div 
            className="w-full h-full max-w-5xl bg-white rounded-xl shadow-2xl overflow-hidden relative transition-all duration-200 flex flex-col"
            style={{ 
              transform: zoomLevel !== 100 ? `scale(${zoomLevel / 100})` : undefined,
              transformOrigin: 'top center'
            }}
          >
            <iframe 
              src={pagePdfUrl}
              className="w-full h-full border-none"
              title={`Document Page ${currentPageNumber}`}
            />
          </div>
        </div>

        {/* Bottom Navigation & Page Advancement Bar */}
        <footer className="w-full bg-[#02140b] border-t border-emerald-900/60 px-4 py-3 sm:px-8 flex items-center justify-between gap-4 shrink-0 z-20">
          {/* Previous Page Button (Always available for previously unlocked pages) */}
          <button
            onClick={handlePrevPage}
            disabled={isFirstPage}
            className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm flex items-center gap-2 transition-all shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Previous Page</span>
          </button>

          {/* Center Info on Current Page */}
          <div className="text-center hidden sm:block">
            <span className="text-xs text-slate-300 font-medium">
              Viewing Page <strong className="text-white font-bold">{currentPageIndex + 1}</strong> of <strong className="text-white font-bold">{totalPagesDisplay}</strong>
            </span>
          </div>

          {/* Next Page Button (Strictly Locked for 10 minutes) */}
          {isLastPage ? (
            <div className="flex items-center gap-2 px-5 py-2.5 bg-emerald-950 border border-[#00D26A]/50 text-[#00D26A] rounded-xl text-xs sm:text-sm font-bold shadow-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>Final Page Reached</span>
            </div>
          ) : (
            <button
              onClick={handleNextPage}
              disabled={!isPageUnlocked}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all shadow-md ${
                isPageUnlocked
                  ? 'bg-[#00D26A] hover:bg-[#00E676] text-slate-950 shadow-[#00D26A]/30 cursor-pointer animate-pulse'
                  : 'bg-slate-800/90 text-slate-400 border border-slate-700/60 cursor-not-allowed opacity-80'
              }`}
            >
              {isPageUnlocked ? (
                <>
                  <span>Next Page (Page {currentPageIndex + 2})</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>Next Page Locked ({formatTimer(secondsRemaining)})</span>
                </>
              )}
            </button>
          )}
        </footer>
      </div>
    );
  }

  // --- VERIFY IDENTITY & DEVICE REGISTRATION SCREEN ---
  return (
    <div className="min-h-screen bg-[#052b1b] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-emerald-900/20">
        <div className="p-6 sm:p-8 space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center mx-auto mb-2 shadow-xs">
            {error ? (
              <AlertTriangle className="w-8 h-8 text-rose-500" />
            ) : (
              <Shield className="w-8 h-8 text-[#00D26A]" />
            )}
          </div>
          
          <div className="text-center space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900">
              {error ? "Access Verification" : "Verify Document Identity"}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 leading-snug">
              {error 
                ? error 
                : "Please enter the student First Name and Second Name used during purchase to register this device."}
            </p>
            {!error && requireNames && (
              <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3 mt-3 text-left">
                <p className="text-xs text-emerald-950 font-medium flex items-start gap-2 leading-relaxed">
                  <Shield className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                  <span>
                    <strong>Device Security:</strong> This document link is cryptographically protected and can be registered on up to 3 authorized student devices.
                  </span>
                </p>
              </div>
            )}
          </div>

          {!error && requireNames && (
            <form onSubmit={handleVerifyNames} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Student First Name
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-[#00D26A] focus:ring-2 focus:ring-[#00D26A]/20 text-slate-900 outline-none transition-all text-sm font-semibold"
                  placeholder="e.g. John"
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Student Second Name
                </label>
                <input
                  type="text"
                  required
                  value={secondName}
                  onChange={e => setSecondName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-[#00D26A] focus:ring-2 focus:ring-[#00D26A]/20 text-slate-900 outline-none transition-all text-sm font-semibold"
                  placeholder="e.g. Kamau"
                  autoComplete="family-name"
                />
              </div>
              
              <button
                type="submit"
                disabled={isVerifying || !firstName.trim() || !secondName.trim()}
                className="w-full py-3.5 mt-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Verifying Identity...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-5 h-5 text-[#00D26A]" />
                    <span>OPEN EXAMINATION DOCUMENT</span>
                  </>
                )}
              </button>
            </form>
          )}

          {error && (
            <div className="space-y-3 pt-2">
              <button
                onClick={() => {
                  setError('');
                  setRequireNames(true);
                }}
                className="w-full py-3 bg-[#00D26A] hover:bg-[#00E676] text-slate-950 font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <KeyRound className="w-4 h-4" />
                <span>Retry Verification</span>
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all text-xs"
              >
                Return to Search Papers
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
