"use client";

import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface ActionIconProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon | React.ComponentType<any>;
  children?: React.ReactNode;
  size?: number;
  variant?: 'muted' | 'danger' | 'primary';
  title?: string;
}

export default function ActionIcon({ icon: Icon, children, size = 18, variant = 'muted', className = '', title, ...rest }: ActionIconProps) {
  const variantClass =
    variant === 'danger'
      ? 'text-red-600 hover:text-red-700'
      : variant === 'primary'
      ? 'text-blue-600 hover:text-blue-700'
      : 'text-slate-500 hover:text-slate-700';

  return (
    <button
      {...rest}
      title={title}
      className={`p-1 ${variantClass} transition-colors rounded ${className}`.trim()}
      type={(rest as any).type || 'button'}
    >
      {/* If children are passed (existing usage), render them; otherwise render the provided Icon */}
      {children ? children : Icon ? <Icon size={size} /> : null}
    </button>
  );
}

