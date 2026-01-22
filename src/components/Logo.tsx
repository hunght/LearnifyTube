import React from "react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: number;
}

export function Logo({ className, size = 24 }: LogoProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="50 60 100 90"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
      </defs>

      {/* Book */}
      <rect x="50" y="60" width="100" height="90" rx="4" fill="#3B82F6" opacity="0.9" />
      <rect x="52" y="62" width="96" height="86" rx="3" fill="white" />
      <line x1="100" y1="60" x2="100" y2="150" stroke="#3B82F6" strokeWidth="2" />
      <line x1="65" y1="80" x2="90" y2="80" stroke="#3B82F6" strokeWidth="2" opacity="0.3" />
      <line x1="65" y1="95" x2="90" y2="95" stroke="#3B82F6" strokeWidth="2" opacity="0.3" />
      <line x1="110" y1="80" x2="135" y2="80" stroke="#3B82F6" strokeWidth="2" opacity="0.3" />
      <line x1="110" y1="95" x2="135" y2="95" stroke="#3B82F6" strokeWidth="2" opacity="0.3" />

      {/* Play button screen */}
      <rect x="70" y="110" width="60" height="40" rx="4" fill="url(#logo-grad)" />
      <path d="M 92 120 L 92 140 L 108 130 Z" fill="white" />
    </svg>
  );
}
