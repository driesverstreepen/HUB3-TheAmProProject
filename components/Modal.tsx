"use client";

import { X } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  // optional class applied to the inner content box
  contentClassName?: string;
  // optional inline styles applied to the inner content box (can override default sizing)
  contentStyle?: React.CSSProperties;
  ariaLabel?: string;
  // optional backdrop class for custom styling
  backdropClassName?: string;
}

export default function Modal({ isOpen, onClose, children, contentClassName, contentStyle, ariaLabel, backdropClassName }: ModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [visible, setVisible] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      setVisible(false);
      return;
    }

    // trigger entrance animation
    setVisible(false);
    const enterTimer = setTimeout(() => setVisible(true), 10);

    // store previously focused element so we can restore focus when modal closes
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const el = modalRef.current;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab' && el) {
        // basic focus trap
        const focusableEls = Array.from(
          el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])')
        ).filter((f) => !!(f.offsetWidth || f.offsetHeight || f.getClientRects().length));
        if (focusableEls.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusableEls[0];
        const last = focusableEls[focusableEls.length - 1];

        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(enterTimer);
      document.removeEventListener('keydown', handleKeyDown);
      // restore focus
      try {
        previouslyFocusedRef.current?.focus();
      } catch {
        // ignore
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Ensure we only portal on the client.
  if (!mounted || typeof document === 'undefined') return null;

  const backdropClass = `${backdropClassName ?? "fixed inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"} z-[9999]`;

  return createPortal(
    <div
      className={backdropClass}
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? 'Dialog'}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-h-[90vh] overflow-y-auto ${contentClassName ?? 'bg-white dark:bg-slate-950 rounded-2xl elev-2'}`}
        style={{
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(8px) scale(.995)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 180ms ease-out, transform 180ms ease-out',
          // sensible defaults for modal sizing when caller doesn't provide explicit sizes
          minWidth: 0,
          maxWidth: '95vw',
          minHeight: 220,
          maxHeight: '90vh',
          ...(contentStyle ?? {}),
        }}
      >
        <div className="bg-white dark:bg-slate-950 rounded-lg p-6 md:p-8 t-body text-slate-900 dark:text-slate-100">
          {children}
        </div>

        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 p-2 rounded-md text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
        >
          <X size={18} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
