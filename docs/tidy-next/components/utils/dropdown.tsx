'use client'

import { useRef, useState } from "react";
import { Transition } from '@headlessui/react'

type DropdownProps = {
  children: React.ReactNode;
  title: string;
};

export default function Dropdown({ children, title }: DropdownProps) {
  const dropdownRef = useRef<HTMLUListElement | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setDropdownOpen(!dropdownOpen);
  };

  const handleFocusOut = (e: React.FocusEvent) => {
    if (
      dropdownRef.current &&
      !dropdownRef.current.contains(e.relatedTarget as Node)
    ) {
      setDropdownOpen(false);
    }
  };

  return (
    <li
      className="group relative flex items-center gap-0.5 px-3 lg:px-5 py-2"
      onMouseEnter={() => setDropdownOpen(true)}
      onMouseLeave={() => setDropdownOpen(false)}
    >
      <span className="flex cursor-pointer items-center text-slate-800 dark:text-slate-400 transition">
        {title}
      </span>      
      <button
        aria-expanded={dropdownOpen}
        onClick={handleClick}
      >
        <span className="sr-only">Show submenu for "{title}"</span>
        <svg className="w-3 h-3 fill-current text-slate-400 dark:text-slate-500 cursor-pointer ml-1 shrink-0" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
          <path d="M10.28 4.305L5.989 8.598 1.695 4.305A1 1 0 00.28 5.72l5 5a1 1 0 001.414 0l5-5a1 1 0 10-1.414-1.414z" />
        </svg>
      </button>
      <span className="absolute right-0 top-full origin-top-left"> 
        <Transition
          ref={dropdownRef}
          show={dropdownOpen}
          as="ul"
          className="origin-top-right absolute top-full right-0 w-40 bg-white py-2 ml-4 rounded-sm shadow-lg transform transition ease-out data-enter:data-closed:-translate-y-2 data-closed:opacity-0"
          onBlur={handleFocusOut}
        >
        {children}
      </Transition>
      </span>
    </li>
  )
}
