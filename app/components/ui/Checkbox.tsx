"use client";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
}

export default function Checkbox({ checked, onChange, label, className = "" }: CheckboxProps) {
  return (
    <div
      onClick={() => onChange(!checked)}
      className={`flex items-center h-[42px] px-4 bg-gray-800/40 border border-gray-700/40 rounded-xl hover:bg-gray-800/60 transition-all cursor-pointer select-none ${className}`}
    >
      <div
        className={`w-4.5 h-4.5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
          checked
            ? "bg-indigo-600 border-indigo-600"
            : "bg-gray-700/50 border-gray-600"
        }`}
      >
        {checked && (
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span className="ml-3 text-sm text-gray-300">
        {label}
      </span>
    </div>
  );
}
