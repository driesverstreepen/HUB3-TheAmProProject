"use client";

interface Props {
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  id?: string;
  className?: string;
}

export default function Checkbox({ checked, onChange, id, className = '' }: Props) {
  return (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className={`w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 ${className}`}
    />
  );
}
