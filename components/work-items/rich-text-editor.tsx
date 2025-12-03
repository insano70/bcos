'use client';

import { useCallback, useEffect } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { LinkNode, AutoLinkNode } from '@lexical/link';
import { clientErrorLog } from '@/lib/utils/debug-client';
import {
	$getRoot,
	$createParagraphNode,
	$createTextNode,
	type EditorState,
	FORMAT_TEXT_COMMAND,
	UNDO_COMMAND,
	REDO_COMMAND,
} from 'lexical';
import { INSERT_UNORDERED_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND } from '@lexical/list';
import { $createHeadingNode } from '@lexical/rich-text';
import { TOGGLE_LINK_COMMAND } from '@lexical/link';
import {
	Bold,
	Italic,
	Underline,
	Strikethrough,
	List,
	ListOrdered,
	Link as LinkIcon,
	Heading1,
	Heading2,
	Heading3,
	Undo,
	Redo,
} from 'lucide-react';

/**
 * Rich Text Editor Component using Lexical
 * Provides a rich text editing experience with formatting options
 * Replaces the deprecated Quill implementation with modern, secure Lexical framework
 */

interface RichTextEditorProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	readOnly?: boolean;
	maxLength?: number;
	error?: string;
}

// Editor theme configuration for Tailwind styling
const theme = {
	paragraph: 'mb-2 text-sm',
	quote: 'border-l-4 border-gray-300 pl-4 italic my-2',
	heading: {
		h1: 'text-2xl font-bold mb-3',
		h2: 'text-xl font-bold mb-2',
		h3: 'text-lg font-bold mb-2',
	},
	list: {
		nested: {
			listitem: 'list-none',
		},
		ol: 'list-decimal list-inside ml-4 mb-2',
		ul: 'list-disc list-inside ml-4 mb-2',
		listitem: 'mb-1',
	},
	link: 'text-primary underline cursor-pointer',
	text: {
		bold: 'font-bold',
		italic: 'italic',
		underline: 'underline',
		strikethrough: 'line-through',
		code: 'bg-gray-100 px-1 py-0.5 rounded font-mono text-sm',
	},
};

// Initial editor configuration
function getInitialConfig(editable: boolean) {
	return {
		namespace: 'RichTextEditor',
		theme,
		editable,
		onError: (error: Error) => {
			clientErrorLog('Lexical Editor Error:', error);
		},
		nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, AutoLinkNode],
	};
}

// Toolbar component
function ToolbarPlugin({ readOnly }: { readOnly: boolean }) {
	const [editor] = useLexicalComposerContext();

	const formatText = useCallback(
		(format: 'bold' | 'italic' | 'underline' | 'strikethrough') => {
			editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
		},
		[editor],
	);

	const formatHeading = useCallback(
		(headingSize: 'h1' | 'h2' | 'h3') => {
			editor.update(() => {
				const selection = editor.getEditorState()._selection;
				if (selection) {
					const heading = $createHeadingNode(headingSize);
					selection.insertNodes([heading]);
				}
			});
		},
		[editor],
	);

	const formatList = useCallback(
		(listType: 'bullet' | 'number') => {
			if (listType === 'bullet') {
				editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
			} else {
				editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
			}
		},
		[editor],
	);

	const undo = useCallback(() => {
		editor.dispatchCommand(UNDO_COMMAND, undefined);
	}, [editor]);

	const redo = useCallback(() => {
		editor.dispatchCommand(REDO_COMMAND, undefined);
	}, [editor]);

	const insertLink = useCallback(() => {
		const url = window.prompt('Enter URL:');
		if (url) {
			editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
		}
	}, [editor]);

	if (readOnly) {
		return null;
	}

	const buttonClass =
		'p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
	const dividerClass = 'w-px h-6 bg-gray-300 dark:bg-gray-600';

	return (
		<div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 flex items-center gap-1 flex-wrap rounded-t-md">
			{/* History */}
			<button type="button" onClick={undo} className={buttonClass} title="Undo">
				<Undo className="w-4 h-4" />
			</button>
			<button type="button" onClick={redo} className={buttonClass} title="Redo">
				<Redo className="w-4 h-4" />
			</button>

			<div className={dividerClass} />

			{/* Headings */}
			<button type="button" onClick={() => formatHeading('h1')} className={buttonClass} title="Heading 1">
				<Heading1 className="w-4 h-4" />
			</button>
			<button type="button" onClick={() => formatHeading('h2')} className={buttonClass} title="Heading 2">
				<Heading2 className="w-4 h-4" />
			</button>
			<button type="button" onClick={() => formatHeading('h3')} className={buttonClass} title="Heading 3">
				<Heading3 className="w-4 h-4" />
			</button>

			<div className={dividerClass} />

			{/* Text formatting */}
			<button type="button" onClick={() => formatText('bold')} className={buttonClass} title="Bold">
				<Bold className="w-4 h-4" />
			</button>
			<button type="button" onClick={() => formatText('italic')} className={buttonClass} title="Italic">
				<Italic className="w-4 h-4" />
			</button>
			<button type="button" onClick={() => formatText('underline')} className={buttonClass} title="Underline">
				<Underline className="w-4 h-4" />
			</button>
			<button type="button" onClick={() => formatText('strikethrough')} className={buttonClass} title="Strikethrough">
				<Strikethrough className="w-4 h-4" />
			</button>

			<div className={dividerClass} />

			{/* Lists */}
			<button type="button" onClick={() => formatList('bullet')} className={buttonClass} title="Bullet List">
				<List className="w-4 h-4" />
			</button>
			<button type="button" onClick={() => formatList('number')} className={buttonClass} title="Numbered List">
				<ListOrdered className="w-4 h-4" />
			</button>

			<div className={dividerClass} />

			{/* Link */}
			<button type="button" onClick={insertLink} className={buttonClass} title="Insert Link">
				<LinkIcon className="w-4 h-4" />
			</button>
		</div>
	);
}

// Plugin to initialize editor with HTML content
function InitialContentPlugin({ html }: { html: string }) {
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		if (!html) return;

		editor.update(() => {
			const root = $getRoot();
			root.clear();

			// Simple HTML to Lexical conversion
			// For production, consider using @lexical/html for proper HTML parsing
			const paragraph = $createParagraphNode();
			const text = $createTextNode(html.replace(/<[^>]*>/g, ''));
			paragraph.append(text);
			root.append(paragraph);
		});
	}, [editor, html]);

	return null;
}

// Character count plugin
function CharacterCountPlugin({ maxLength }: { maxLength: number }) {
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		return editor.registerUpdateListener(({ editorState }) => {
			editorState.read(() => {
				const root = $getRoot();
				const textContent = root.getTextContent();
				const length = textContent.length;

				// Prevent exceeding max length
				if (length > maxLength) {
					editor.update(() => {
						const root = $getRoot();
						const text = root.getTextContent();
						const truncated = text.substring(0, maxLength);
						root.clear();
						const paragraph = $createParagraphNode();
						const textNode = $createTextNode(truncated);
						paragraph.append(textNode);
						root.append(paragraph);
					});
				}
			});
		});
	}, [editor, maxLength]);

	return null;
}

// Error boundary component for Lexical
function LexicalErrorBoundary({ children }: { children: React.ReactNode }): React.ReactElement {
	return <>{children}</>;
}

export function RichTextEditor({
	value,
	onChange,
	placeholder = 'Enter text...',
	readOnly = false,
	maxLength = 50000,
	error,
}: RichTextEditorProps) {
	const handleChange = useCallback(
		(editorState: EditorState) => {
			editorState.read(() => {
				const root = $getRoot();
				const textContent = root.getTextContent();

				// For now, we'll store plain text
				// In production, consider using $generateHtmlFromNodes from @lexical/html
				// to preserve rich formatting
				onChange(textContent);
			});
		},
		[onChange],
	);

	const initialConfig = getInitialConfig(!readOnly);

	return (
		<div className="space-y-2">
			<LexicalComposer initialConfig={initialConfig}>
				<div
					className={`border rounded-md ${error ? 'border-destructive' : 'border-input'} bg-background overflow-hidden`}
				>
					<ToolbarPlugin readOnly={readOnly} />
					<div className="relative">
						<RichTextPlugin
							contentEditable={
								<ContentEditable
									className="min-h-[200px] max-h-[500px] overflow-y-auto p-3 outline-none prose prose-sm max-w-none dark:prose-invert"
									aria-placeholder={placeholder}
									placeholder={
										<div className="absolute top-3 left-3 text-muted-foreground pointer-events-none select-none">
											{placeholder}
										</div>
									}
								/>
							}
							ErrorBoundary={LexicalErrorBoundary}
						/>
						<HistoryPlugin />
						<OnChangePlugin onChange={handleChange} />
						<ListPlugin />
						<LinkPlugin />
						<InitialContentPlugin html={value} />
						<CharacterCountPlugin maxLength={maxLength} />
					</div>
				</div>
			</LexicalComposer>
			<div className="flex justify-between text-xs text-muted-foreground">
				{error && <span className="text-destructive">{error}</span>}
				<span className="ml-auto">
					{value.length} / {maxLength} characters
				</span>
			</div>
		</div>
	);
}
