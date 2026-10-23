/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { TourStep } from '../types';
import { TOUR_STEPS } from '../data';
import { AnimatePresence, motion } from 'motion/react';
import { HelpCircle, ChevronRight, ChevronLeft, X } from 'lucide-react';

interface TourOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TourOverlay({ isOpen, onClose }: TourOverlayProps) {
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [coords, setCoords] = useState<{
    top: number; left: number; width: number; height: number;
  } | null>(null);
  const [elementHidden, setElementHidden] = useState(false);

  const activeStep: TourStep = TOUR_STEPS[currentStepIdx];

  useEffect(() => {
    if (!isOpen || !activeStep) return;

    const updatePosition = () => {
      const el = document.getElementById(activeStep.targetId);
      if (!el) {
        setCoords(null);
        setElementHidden(true);
        return;
      }

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setCoords(null);
        setElementHidden(true);
        return;
      }

      setElementHidden(false);
      setCoords({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const timer = window.setTimeout(updatePosition, 300);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.clearTimeout(timer);
    };
  }, [isOpen, currentStepIdx, activeStep]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentStepIdx < TOUR_STEPS.length - 1) {
      setCurrentStepIdx(prev => prev + 1);
    } else {
      onClose();
      setCurrentStepIdx(0);
    }
  };

  const handlePrev = () => {
    if (currentStepIdx > 0) setCurrentStepIdx(prev => prev - 1);
  };

  const showTooltip = coords !== null || elementHidden;
  const isMobile = window.innerWidth <= 768;
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  const desktopTooltipStyle = (target: NonNullable<typeof coords>): React.CSSProperties => {
    const cardWidth = 360;
    const cardHeight = 260;
    const gap = 18;
    const minEdge = 16;
    const maxLeft = window.innerWidth - cardWidth - minEdge;
    const maxTop = window.innerHeight - cardHeight - minEdge;

    if (activeStep.position === 'left') {
      return {
        position: 'fixed',
        top: `${clamp(target.top + target.height / 2 - cardHeight / 2, minEdge, maxTop)}px`,
        left: `${clamp(target.left - cardWidth - gap, minEdge, maxLeft)}px`,
      };
    }

    if (activeStep.position === 'right') {
      return {
        position: 'fixed',
        top: `${clamp(target.top + target.height / 2 - cardHeight / 2, minEdge, maxTop)}px`,
        left: `${clamp(target.left + target.width + gap, minEdge, maxLeft)}px`,
      };
    }

    if (activeStep.position === 'top') {
      return {
        position: 'fixed',
        top: `${clamp(target.top - cardHeight - gap, minEdge, maxTop)}px`,
        left: `${clamp(target.left, minEdge, maxLeft)}px`,
      };
    }

    return {
      position: 'fixed',
      top: `${clamp(target.top + target.height + gap, minEdge, maxTop)}px`,
      left: `${clamp(target.left, minEdge, maxLeft)}px`,
    };
  };

  const tooltipStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        left: '1rem',
        right: '1rem',
        bottom: '5.75rem',
        width: 'auto',
      }
    : coords
      ? desktopTooltipStyle(coords)
      : {
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        };

  const getArrowClassName = () => {
    return 'absolute h-0 w-0 pointer-events-none hidden md:block';
  };

  const getArrowStyle = (): React.CSSProperties => {
    if (!coords || isMobile) return {};
    const styleLeft = typeof tooltipStyle.left === 'string' ? parseFloat(tooltipStyle.left) : 0;
    const styleTop = typeof tooltipStyle.top === 'string' ? parseFloat(tooltipStyle.top) : 0;
    const cardWidth = 360;
    const cardHeight = 260;
    const targetCenterX = coords.left + coords.width / 2;
    const targetCenterY = coords.top + coords.height / 2;

    if (activeStep.position === 'top') {
      return {
        bottom: '-12px',
        left: `${clamp(targetCenterX - styleLeft - 8, 24, cardWidth - 24)}px`,
        borderLeft: '10px solid transparent',
        borderRight: '10px solid transparent',
        borderTop: '12px solid white',
      };
    }

    if (activeStep.position === 'bottom') {
      return {
        top: '-12px',
        left: `${clamp(targetCenterX - styleLeft - 8, 24, cardWidth - 24)}px`,
        borderLeft: '10px solid transparent',
        borderRight: '10px solid transparent',
        borderBottom: '12px solid white',
      };
    }

    if (activeStep.position === 'left') {
      return {
        right: '-12px',
        top: `${clamp(targetCenterY - styleTop - 8, 24, cardHeight - 24)}px`,
        borderTop: '10px solid transparent',
        borderBottom: '10px solid transparent',
        borderLeft: '12px solid white',
      };
    }

    return {
      left: '-12px',
      top: `${clamp(targetCenterY - styleTop - 8, 24, cardHeight - 24)}px`,
      borderTop: '10px solid transparent',
      borderBottom: '10px solid transparent',
      borderRight: '12px solid white',
    };
  };

  return (
    <div className="fixed inset-0 z-[100] pointer-events-auto">
      <div
        className={`absolute inset-0 transition-colors duration-300 ${elementHidden ? 'bg-black/50' : ''}`}
        onClick={onClose}
      />

      {coords && (
        <motion.div
          layout
          className="absolute rounded-xl border-2 border-emerald-400 pointer-events-none z-[101]"
          style={{
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.48), 0 0 20px rgba(52,211,153,0.35)',
          }}
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            top: coords.top - 6,
            left: coords.left - 6,
            width: coords.width + 12,
            height: coords.height + 12,
          }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        />
      )}

      <AnimatePresence mode="wait">
        {showTooltip && (
          <motion.div
            key={currentStepIdx}
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -15 }}
            transition={{ duration: 0.2 }}
            className="z-[102] bg-white text-slate-800 rounded-2xl shadow-2xl p-6 border border-emerald-100 w-[min(22rem,90vw)]"
            style={tooltipStyle}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                <HelpCircle className="w-5 h-5 text-emerald-600 animate-pulse" />
                <span>新手指南 {currentStepIdx + 1} / {TOUR_STEPS.length}</span>
              </div>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 p-1 transition-colors"
                title="關閉導覽"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <h4 className="font-bold text-lg text-slate-900 mb-2">{activeStep.title}</h4>
            <p className="text-sm text-slate-600 leading-relaxed mb-5">{activeStep.content}</p>

            <div className="flex items-center justify-between">
              <button
                onClick={onClose}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                跳過導覽
              </button>

              <div className="flex items-center gap-2">
                {currentStepIdx > 0 && (
                  <button
                    onClick={handlePrev}
                    className="flex items-center gap-1 text-xs text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200 transition-all"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> 上一步
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="flex items-center gap-1 text-xs bg-emerald-800 text-white hover:bg-emerald-700 px-4 py-1.5 rounded-full font-medium transition-all shadow-md shadow-emerald-900/10"
                >
                  {currentStepIdx === TOUR_STEPS.length - 1 ? '完成導覽' : '下一步'}
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {coords && (
              <div className={getArrowClassName()} style={getArrowStyle()} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
