"use client";

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  formDefinition: any;
  prefillData?: Record<string, any>;
  onSubmit: (data: Record<string, any>) => Promise<void> | void;
  onClose: () => void;
  loading?: boolean;
}

export default function FormDisplayModal({ isOpen, formDefinition, prefillData = {}, onSubmit, onClose, loading }: Props) {
  const [values, setValues] = useState<Record<string, any>>({});

  useEffect(() => {
    if (formDefinition && formDefinition.fields_json) {
      const initial: Record<string, any> = {};
      formDefinition.fields_json.forEach((f: any) => {
        initial[f.id] = prefillData?.[f.id] ?? f.default ?? '';
      });
      setValues(initial);
    }
  }, [formDefinition, prefillData]);

  if (!isOpen) return null;

  const handleChange = (id: string, val: any) => setValues(v => ({ ...v, [id]: val }));

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    await onSubmit(values);
  };

  if (!isOpen) return null;

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl max-w-2xl w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">{formDefinition?.title || 'Form'}</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {formDefinition?.fields_json?.map((f: any) => (
            <div key={f.id}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{f.label}</label>
              <input
                value={values[f.id] ?? ''}
                onChange={(e) => handleChange(f.id, e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          ))}

          <div className="flex gap-3">
            {/* Removed bottom close button; form can be dismissed via X or backdrop */}
            <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg">{loading ? 'Processing...' : 'Submit'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
