'use client';

import type React from 'react';

/**
 * CSP-compliant SplitText component using pure CSS animations
 * No inline styles or GSAP required - fully secure for production CSP
 */
export interface SplitTextProps {
  text: string;
  className?: string;
  tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span';
  textAlign?: 'left' | 'center' | 'right';
}

const SplitText: React.FC<SplitTextProps> = ({
  text,
  className = '',
  tag = 'p',
  textAlign = 'center',
}) => {
  // Split text into individual characters for animation
  let charCounter = 0;
  const splitChars = text.split('').map((char) => {
    const currentKey = charCounter++;
    // Preserve spaces with proper spacing
    if (char === ' ') {
      return (
        <span key={`space-${currentKey}`} className="split-space" aria-hidden="true">
          &nbsp;
        </span>
      );
    }

    return (
      <span key={`char-${currentKey}`} className="split-char" aria-hidden="true">
        {char}
      </span>
    );
  });

  // Build class names based on text alignment
  const alignmentClass =
    textAlign === 'left' ? 'text-left' : textAlign === 'right' ? 'text-right' : 'text-center';
  const classes = `${alignmentClass} ${className}`;

  // Render the appropriate tag with split characters
  const content = (
    <>
      {splitChars}
      {/* Hidden text for screen readers */}
      <span className="sr-only">{text}</span>
    </>
  );

  switch (tag) {
    case 'h1':
      return <h1 className={classes}>{content}</h1>;
    case 'h2':
      return <h2 className={classes}>{content}</h2>;
    case 'h3':
      return <h3 className={classes}>{content}</h3>;
    case 'h4':
      return <h4 className={classes}>{content}</h4>;
    case 'h5':
      return <h5 className={classes}>{content}</h5>;
    case 'h6':
      return <h6 className={classes}>{content}</h6>;
    case 'span':
      return <span className={classes}>{content}</span>;
    default:
      return <p className={classes}>{content}</p>;
  }
};

export default SplitText;
