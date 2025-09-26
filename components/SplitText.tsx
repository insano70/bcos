'use client'

import React, { useRef, useEffect, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { useNonce } from '@/app/nonce-context';

gsap.registerPlugin(ScrollTrigger, useGSAP);

export interface SplitTextProps {
  text: string;
  className?: string;
  delay?: number;
  duration?: number;
  ease?: string | ((t: number) => number);
  splitType?: 'chars' | 'words' | 'lines' | 'words, chars';
  from?: gsap.TweenVars;
  to?: gsap.TweenVars;
  threshold?: number;
  rootMargin?: string;
  tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span';
  textAlign?: React.CSSProperties['textAlign'];
  onLetterAnimationComplete?: () => void;
}

const SplitText: React.FC<SplitTextProps> = ({
  text,
  className = '',
  delay = 100,
  duration = 0.6,
  ease = 'power3.out',
  splitType = 'chars',
  from = { opacity: 0, y: 40 },
  to = { opacity: 1, y: 0 },
  threshold = 0.1,
  rootMargin = '-100px',
  tag = 'p',
  textAlign = 'center',
  onLetterAnimationComplete
}) => {
  const ref = useRef<HTMLParagraphElement>(null);
  const animationCompletedRef = useRef(false);
  const [fontsLoaded, setFontsLoaded] = useState<boolean>(false);
  const nonce = useNonce();

  useEffect(() => {
    if (document.fonts.status === 'loaded') {
      setFontsLoaded(true);
    } else {
      document.fonts.ready.then(() => {
        setFontsLoaded(true);
      });
    }
  }, []);

  useGSAP(
    () => {
      if (!ref.current || !text || !fontsLoaded) return;
      const el = ref.current as HTMLElement;

      // Get all the char spans we created
      const chars = el.querySelectorAll('.split-char');
      if (chars.length === 0) return;

      // Set initial state
      gsap.set(chars, from);

      // Create the animation
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: 'top 80%',
          once: true,
        }
      });

      tl.to(chars, {
        ...to,
        duration,
        ease,
        stagger: delay / 1000,
        onComplete: () => {
          animationCompletedRef.current = true;
          onLetterAnimationComplete?.();
        }
      });

      return () => {
        ScrollTrigger.getAll().forEach(st => {
          if (st.trigger === el) st.kill();
        });
      };
    },
    {
      dependencies: [
        text,
        delay,
        duration,
        ease,
        splitType,
        JSON.stringify(from),
        JSON.stringify(to),
        threshold,
        rootMargin,
        fontsLoaded,
        onLetterAnimationComplete
      ],
      scope: ref
    }
  );

  // Function to split text into characters or words
  const splitText = (text: string, type: string) => {
    if (type.includes('chars')) {
      return text.split('').map((char, index) => (
        <span key={index} className="split-char inline-block" style={{ display: 'inline-block' }} nonce={nonce}>
          {char === ' ' ? '\u00A0' : char}
        </span>
      ));
    } else if (type.includes('words')) {
      return text.split(' ').map((word, index) => (
        <span key={index} className="split-word inline-block" style={{ display: 'inline-block' }} nonce={nonce}>
          {word}
          {index < text.split(' ').length - 1 && '\u00A0'}
        </span>
      ));
    }
    return text;
  };

  const renderTag = () => {
    const style: React.CSSProperties = {
      textAlign,
      wordWrap: 'break-word',
      willChange: 'transform, opacity'
    };
    const classes = `split-parent overflow-hidden inline-block whitespace-normal ${className}`;
    const content = splitText(text, splitType);
    
    switch (tag) {
      case 'h1':
        return (
          <h1 ref={ref} style={style} className={classes} nonce={nonce}>
            {content}
          </h1>
        );
      case 'h2':
        return (
          <h2 ref={ref} style={style} className={classes} nonce={nonce}>
            {content}
          </h2>
        );
      case 'h3':
        return (
          <h3 ref={ref} style={style} className={classes} nonce={nonce}>
            {content}
          </h3>
        );
      case 'h4':
        return (
          <h4 ref={ref} style={style} className={classes} nonce={nonce}>
            {content}
          </h4>
        );
      case 'h5':
        return (
          <h5 ref={ref} style={style} className={classes} nonce={nonce}>
            {content}
          </h5>
        );
      case 'h6':
        return (
          <h6 ref={ref} style={style} className={classes} nonce={nonce}>
            {content}
          </h6>
        );
      default:
        return (
          <p ref={ref} style={style} className={classes} nonce={nonce}>
            {content}
          </p>
        );
    }
  };

  return renderTag();
};

export default SplitText;
