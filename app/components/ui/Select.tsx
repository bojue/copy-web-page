"use client";

import { ReactNode } from "react";

interface SelectProps<T extends string | number> {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  label?: string;
  className?: string;
}

export default function Select<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className = "",
}: SelectProps<T>) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-semibold text-gray-300 mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => {
            const newValue = typeof options[0].value === "number"
              ? Number(e.target.value)
              : e.target.value;
            onChange(newValue as T);
          }}
          style={{ WebkitAppearance: "none", MozAppearance: "none", appearance: "none" }}
          className="w-full px-4 py-3.5 pr-10 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 focus:bg-gray-800 transition-all cursor-pointer"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-gray-800 text-white">
              {option.label}
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
