'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import 'react-quill/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });

/**
 * Rich Text Editor Component
 * Provides a rich text editing experience with basic formatting options
 */

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  maxLength?: number;
  error?: string;
}

const modules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ color: [] }, { background: [] }],
    ['link'],
    ['clean'],
  ],
  clipboard: {
    matchVisual: false,
  },
};

const formats = [
  'header',
  'bold',
  'italic',
  'underline',
  'strike',
  'list',
  'bullet',
  'color',
  'background',
  'link',
];

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Enter text...',
  readOnly = false,
  maxLength = 50000,
  error,
}: RichTextEditorProps) {
  const [mounted, setMounted] = useState(false);
  const quillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleChange = (content: string) => {
    // Check max length
    if (content.length > maxLength) {
      return;
    }
    onChange(content);
  };

  if (!mounted) {
    return (
      <div className="min-h-[200px] rounded-md border border-input bg-background p-3">
        <div className="text-muted-foreground">{placeholder}</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={quillRef} className={`rich-text-editor ${error ? 'border-destructive' : ''}`}>
        <ReactQuill
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          readOnly={readOnly}
          modules={readOnly ? { toolbar: false } : modules}
          formats={formats}
          theme="snow"
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        {error && <span className="text-destructive">{error}</span>}
        <span className="ml-auto">
          {value.length} / {maxLength} characters
        </span>
      </div>
    </div>
  );
}
