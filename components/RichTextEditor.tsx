import { useRef, useEffect } from 'react';
import { Bold, Italic, Underline, Type, List, Link as LinkIcon } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const execCommand = (command: string, value: string | undefined = undefined) => {
    // Note: document.execCommand is deprecated but still works in many browsers.
    document.execCommand(command, false, value as any);
    editorRef.current?.focus();
    handleInput();
  };

  const insertLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      execCommand('createLink', url);
    }
  };

  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="bg-slate-50 border-b border-slate-300 p-2 flex gap-1 flex-wrap">
        <button
          type="button"
          onClick={() => execCommand('bold')}
          className="p-2 hover:bg-slate-200 rounded transition-colors"
          title="Bold"
        >
          <Bold size={18} />
        </button>
        <button
          type="button"
          onClick={() => execCommand('italic')}
          className="p-2 hover:bg-slate-200 rounded transition-colors"
          title="Italic"
        >
          <Italic size={18} />
        </button>
        <button
          type="button"
          onClick={() => execCommand('underline')}
          className="p-2 hover:bg-slate-200 rounded transition-colors"
          title="Underline"
        >
          <Underline size={18} />
        </button>

        <div className="w-px bg-slate-300 mx-1" />

        <button
          type="button"
          onClick={() => execCommand('formatBlock', '<h1>')}
          className="px-3 py-2 hover:bg-slate-200 rounded transition-colors text-sm font-semibold"
          title="Heading 1"
        >
          H1
        </button>
        <button
          type="button"
          onClick={() => execCommand('formatBlock', '<h2>')}
          className="px-3 py-2 hover:bg-slate-200 rounded transition-colors text-sm font-semibold"
          title="Heading 2"
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => execCommand('formatBlock', '<p>')}
          className="p-2 hover:bg-slate-200 rounded transition-colors"
          title="Paragraph"
        >
          <Type size={18} />
        </button>

        <div className="w-px bg-slate-300 mx-1" />

        <button
          type="button"
          onClick={() => execCommand('insertUnorderedList')}
          className="p-2 hover:bg-slate-200 rounded transition-colors"
          title="Bullet List"
        >
          <List size={18} />
        </button>
        <button
          type="button"
          onClick={insertLink}
          className="p-2 hover:bg-slate-200 rounded transition-colors"
          title="Insert Link"
        >
          <LinkIcon size={18} />
        </button>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="p-4 min-h-[300px] focus:outline-none prose prose-sm max-w-none"
        style={{
          wordWrap: 'break-word',
          overflowWrap: 'break-word'
        }}
        data-placeholder={placeholder}
      />

      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
          display: block;
        }
        [contenteditable] h1 {
          font-size: 2em;
          font-weight: bold;
          margin: 0.67em 0;
        }
        [contenteditable] h2 {
          font-size: 1.5em;
          font-weight: bold;
          margin: 0.75em 0;
        }
        [contenteditable] p {
          margin: 1em 0;
        }
        [contenteditable] ul {
          margin: 1em 0;
          padding-left: 2em;
        }
        [contenteditable] a {
          color: #2563eb;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
