import React from "react";
import { cn } from "@/lib/utils";

interface SupportAvatarProps {
  className?: string;
  isOnline?: boolean;
}

export function SupportAvatar({ className, isOnline = true }: SupportAvatarProps) {
  return (
    <div className={cn("relative flex items-center justify-center bg-gradient-to-br from-primary to-blue-600 rounded-full overflow-hidden shadow-inner", className)}>
      {/* Bot Head/Body */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-3/5 h-3/5 text-white"
      >
        <path
          d="M12 2C7.58172 2 4 5.58172 4 10V14C4 18.4183 7.58172 22 12 22C16.4183 22 20 18.4183 20 14V10C20 5.58172 16.4183 2 12 2Z"
          fill="currentColor"
          fillOpacity="0.2"
        />
        <rect x="7" y="9" width="10" height="8" rx="2" fill="currentColor" />
        <circle cx="10" cy="12.5" r="1" fill="#3B82F6" />
        <circle cx="14" cy="12.5" r="1" fill="#3B82F6" />
        <path
          d="M11 15C11 15 11.5 15.5 12 15.5C12.5 15.5 13 15C13 15"
          stroke="#3B82F6"
          strokeWidth="0.5"
          strokeLinecap="round"
        />
        <path
          d="M12 2V6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="12" cy="2" r="1" fill="currentColor" />
      </svg>
      
      {/* Shine effect */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/20 pointer-events-none" />
      
      {/* Online indicator */}
      {isOnline && (
        <div className="absolute bottom-1 right-1 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full shadow-sm" />
      )}
    </div>
  );
}
