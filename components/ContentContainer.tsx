"use client";

import React, { PropsWithChildren } from 'react';

interface Props {
  className?: string;
}

export default function ContentContainer({ children, className = '' }: PropsWithChildren<Props>) {
  // Centralized container to ensure consistent horizontal alignment across pages
  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>
  );
}
