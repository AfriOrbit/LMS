'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import type { NavItem } from '@/content/site-pages';

/**
 * The Products dropdown.
 *
 * The static site did this with a small inline script. Porting the header to
 * React without porting that script left the menu permanently `hidden`, which
 * meant the four vertical pages — rocketry, robotics, EduSat, spaceport, the
 * whole point of the site — were unreachable from the navigation. The browser
 * test caught it by trying to click the link and finding it invisible.
 *
 * Rebuilt as a component rather than re-inlined, which also lets it do the
 * things the inline version did not: close on Escape, close on outside click,
 * close after navigating, and move focus correctly.
 */
export function NavProducts({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        // Return focus to the trigger, or the keyboard user is stranded at the
        // top of the document with no idea where they are.
        wrap.current?.querySelector<HTMLButtonElement>('.ao-nav__trigger')?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="ao-nav__group" ref={wrap}>
      <button
        type="button"
        className="ao-nav__item ao-nav__trigger"
        aria-expanded={open}
        aria-controls="nav-products"
        onClick={() => setOpen((v) => !v)}
      >
        Products
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M3 6l5 5 5-5" />
        </svg>
      </button>
      <div className="ao-nav__panel" id="nav-products" hidden={!open}>
        {items.map((item) => (
          <Link className="ao-nav__link" href={item.href} key={item.href} onClick={() => setOpen(false)}>
            <span>{item.label}</span>
            <em>{item.hint}</em>
          </Link>
        ))}
      </div>
    </div>
  );
}
