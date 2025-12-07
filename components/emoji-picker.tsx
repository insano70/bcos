'use client';

import { useMemo, useState } from 'react';

interface EmojiPickerProps {
  label: string;
  value: string;
  onChange: (emoji: string) => void;
  description?: string;
}

interface EmojiCategory {
  name: string;
  emojis: Array<{ emoji: string; keywords: string[] }>;
}

// Curated emoji categories relevant for work item types
const emojiCategories: EmojiCategory[] = [
  {
    name: 'Work Items',
    emojis: [
      { emoji: '📋', keywords: ['clipboard', 'task', 'list', 'todo'] },
      { emoji: '✓', keywords: ['check', 'done', 'complete', 'task'] },
      { emoji: '✅', keywords: ['check', 'done', 'complete', 'approved'] },
      { emoji: '⭐', keywords: ['star', 'feature', 'favorite', 'important'] },
      { emoji: '🐛', keywords: ['bug', 'insect', 'error', 'defect'] },
      { emoji: '🔧', keywords: ['wrench', 'fix', 'repair', 'maintenance'] },
      { emoji: '📝', keywords: ['memo', 'note', 'document', 'write'] },
      { emoji: '📌', keywords: ['pin', 'pinned', 'important', 'sticky'] },
      { emoji: '🎯', keywords: ['target', 'goal', 'objective', 'aim'] },
      { emoji: '💡', keywords: ['idea', 'lightbulb', 'suggestion', 'insight'] },
      { emoji: '🚀', keywords: ['rocket', 'launch', 'deploy', 'release'] },
      { emoji: '📖', keywords: ['book', 'story', 'documentation', 'guide'] },
    ],
  },
  {
    name: 'Status',
    emojis: [
      { emoji: '⏳', keywords: ['hourglass', 'waiting', 'pending', 'time'] },
      { emoji: '🔄', keywords: ['refresh', 'sync', 'update', 'cycle'] },
      { emoji: '⚠️', keywords: ['warning', 'alert', 'caution', 'attention'] },
      { emoji: '🚫', keywords: ['prohibited', 'blocked', 'stopped', 'no'] },
      { emoji: '❌', keywords: ['x', 'cancel', 'rejected', 'close'] },
      { emoji: '❓', keywords: ['question', 'unknown', 'help', 'inquiry'] },
      { emoji: '💬', keywords: ['speech', 'comment', 'discussion', 'chat'] },
      { emoji: '📢', keywords: ['announcement', 'megaphone', 'broadcast', 'notify'] },
      { emoji: '🔔', keywords: ['bell', 'notification', 'alert', 'reminder'] },
      { emoji: '⏸️', keywords: ['pause', 'hold', 'suspended', 'wait'] },
    ],
  },
  {
    name: 'Objects',
    emojis: [
      { emoji: '📁', keywords: ['folder', 'directory', 'file', 'organize'] },
      { emoji: '📂', keywords: ['folder', 'open', 'directory', 'files'] },
      { emoji: '📄', keywords: ['document', 'page', 'file', 'paper'] },
      { emoji: '📊', keywords: ['chart', 'graph', 'statistics', 'data'] },
      { emoji: '📈', keywords: ['chart', 'growth', 'increase', 'trending'] },
      { emoji: '📉', keywords: ['chart', 'decrease', 'decline', 'down'] },
      { emoji: '🗂️', keywords: ['dividers', 'index', 'organize', 'tabs'] },
      { emoji: '📦', keywords: ['package', 'box', 'delivery', 'module'] },
      { emoji: '🔗', keywords: ['link', 'chain', 'connection', 'url'] },
      { emoji: '🏷️', keywords: ['tag', 'label', 'price', 'category'] },
    ],
  },
  {
    name: 'Symbols',
    emojis: [
      { emoji: '⚡', keywords: ['lightning', 'fast', 'power', 'energy'] },
      { emoji: '🔥', keywords: ['fire', 'hot', 'urgent', 'trending'] },
      { emoji: '💎', keywords: ['diamond', 'gem', 'premium', 'valuable'] },
      { emoji: '🎨', keywords: ['art', 'palette', 'design', 'creative'] },
      { emoji: '🔒', keywords: ['lock', 'secure', 'private', 'protected'] },
      { emoji: '🔓', keywords: ['unlock', 'open', 'public', 'access'] },
      { emoji: '⚙️', keywords: ['gear', 'settings', 'config', 'system'] },
      { emoji: '🛠️', keywords: ['tools', 'build', 'construct', 'develop'] },
      { emoji: '🧪', keywords: ['test', 'experiment', 'lab', 'science'] },
      { emoji: '📐', keywords: ['ruler', 'measure', 'design', 'architecture'] },
    ],
  },
  {
    name: 'Priority',
    emojis: [
      { emoji: '🔴', keywords: ['red', 'circle', 'critical', 'high'] },
      { emoji: '🟠', keywords: ['orange', 'circle', 'medium', 'warning'] },
      { emoji: '🟡', keywords: ['yellow', 'circle', 'low', 'caution'] },
      { emoji: '🟢', keywords: ['green', 'circle', 'done', 'go'] },
      { emoji: '🔵', keywords: ['blue', 'circle', 'info', 'normal'] },
      { emoji: '⬆️', keywords: ['up', 'arrow', 'high', 'increase'] },
      { emoji: '⬇️', keywords: ['down', 'arrow', 'low', 'decrease'] },
      { emoji: '➡️', keywords: ['right', 'arrow', 'next', 'forward'] },
      { emoji: '🏃', keywords: ['run', 'sprint', 'fast', 'hurry'] },
      { emoji: '🐢', keywords: ['turtle', 'slow', 'patience', 'steady'] },
    ],
  },
  {
    name: 'Actions',
    emojis: [
      { emoji: '✏️', keywords: ['pencil', 'edit', 'write', 'modify'] },
      { emoji: '🗑️', keywords: ['trash', 'delete', 'remove', 'discard'] },
      { emoji: '📤', keywords: ['outbox', 'send', 'export', 'upload'] },
      { emoji: '📥', keywords: ['inbox', 'receive', 'import', 'download'] },
      { emoji: '🔍', keywords: ['search', 'magnify', 'find', 'look'] },
      { emoji: '👀', keywords: ['eyes', 'look', 'review', 'watch'] },
      { emoji: '👍', keywords: ['thumbs', 'up', 'approve', 'like'] },
      { emoji: '👎', keywords: ['thumbs', 'down', 'reject', 'dislike'] },
      { emoji: '🤝', keywords: ['handshake', 'deal', 'agreement', 'partner'] },
      { emoji: '💪', keywords: ['muscle', 'strength', 'effort', 'power'] },
    ],
  },
];

export default function EmojiPicker({
  label,
  value,
  onChange,
  description,
}: EmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter emojis based on search query
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return emojiCategories;
    }

    const query = searchQuery.toLowerCase();
    return emojiCategories
      .map((category) => ({
        ...category,
        emojis: category.emojis.filter(
          (item) =>
            item.emoji.includes(query) ||
            item.keywords.some((keyword) => keyword.includes(query))
        ),
      }))
      .filter((category) => category.emojis.length > 0);
  }, [searchQuery]);

  const handleSelect = (emoji: string) => {
    onChange(emoji);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = () => {
    onChange('');
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      {description && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center space-x-3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:ring-2 focus:ring-blue-500"
        >
          {value ? (
            <span className="text-xl">{value}</span>
          ) : (
            <span className="text-gray-400 dark:text-gray-500 text-sm">No icon</span>
          )}
          <span className="text-gray-600 dark:text-gray-300 text-sm flex-1 text-left">
            {value ? 'Change icon' : 'Select an icon'}
          </span>
          <svg
            className="w-4 h-4 text-gray-400 ml-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
            {/* Search input */}
            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search icons..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
            </div>

            {/* Emoji grid */}
            <div className="max-h-64 overflow-y-auto p-3 space-y-4">
              {filteredCategories.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No icons found for &quot;{searchQuery}&quot;
                </p>
              ) : (
                filteredCategories.map((category) => (
                  <div key={category.name}>
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                      {category.name}
                    </h4>
                    <div className="grid grid-cols-8 gap-1">
                      {category.emojis.map((item) => (
                        <button
                          key={item.emoji}
                          type="button"
                          onClick={() => handleSelect(item.emoji)}
                          className={`w-8 h-8 flex items-center justify-center text-lg rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                            value === item.emoji
                              ? 'bg-blue-100 dark:bg-blue-900/30 ring-2 ring-blue-500'
                              : ''
                          }`}
                          title={item.keywords.join(', ')}
                        >
                          {item.emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Clear button */}
            {value && (
              <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handleClear}
                  className="w-full text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 py-1"
                >
                  Clear icon
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

