"use client";

import { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  className?: string;
}

const variantStyles = {
  primary: "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 text-white",
  secondary: "bg-gray-800/40 hover:bg-gray-700/50 border border-gray-700/40 text-gray-300 hover:text-white",
  danger: "bg-red-800/20 hover:bg-red-800/40 border border-red-700/40 text-red-300",
};

export default function Button({
  children,
  onClick,
  type = "button",
  disabled = false,
  variant = "primary",
  loading = false,
  className = "",
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        w-full py-3.5 px-6
        ${variantStyles[variant]}
        disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:shadow-none
        font-medium rounded-xl text-sm
        transition-all duration-200 cursor-pointer
        disabled:cursor-not-allowed
        hover:scale-[1.01] active:scale-[0.99]
        disabled:hover:scale-100
        ${className}
      `}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
