import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const surfaces: HTMLElement[] = [];
let unlockPage: (() => void) | null = null;
const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function lockBackground() {
  const root = document.getElementById('root');
  const rootInert = root?.hasAttribute('inert') ?? false;
  const rootHidden = root?.getAttribute('aria-hidden') ?? null;
  const body = document.body;
  const { scrollX, scrollY } = window;
  const previous = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    width: body.style.width,
    overflow: body.style.overflow,
    paddingRight: body.style.paddingRight,
  };
  const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
  root?.setAttribute('inert', '');
  root?.setAttribute('aria-hidden', 'true');
  Object.assign(body.style, {
    position: 'fixed',
    top: `${-scrollY}px`,
    left: `${-scrollX}px`,
    width: '100%',
    overflow: 'hidden',
    paddingRight: `${padding + scrollbar}px`,
  });
  return () => {
    Object.assign(body.style, previous);
    if (!rootInert) root?.removeAttribute('inert');
    if (rootHidden === null) root?.removeAttribute('aria-hidden');
    else root?.setAttribute('aria-hidden', rootHidden);
    const behavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(scrollX, scrollY);
    document.documentElement.style.scrollBehavior = behavior;
  };
}

function updateStack() {
  surfaces.forEach((surface, index) => {
    const active = index === surfaces.length - 1;
    if (active) {
      surface.removeAttribute('inert');
      surface.removeAttribute('aria-hidden');
    } else {
      surface.setAttribute('inert', '');
      surface.setAttribute('aria-hidden', 'true');
    }
    const layer = surface.parentElement;
    if (layer) layer.style.zIndex = String(1000 + index);
  });
}
function visibleControls(surface: HTMLElement) {
  return [...surface.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) =>
      element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden',
  );
}
function viewport() {
  const visible = window.visualViewport;
  return {
    top: visible?.offsetTop ?? 0,
    left: visible?.offsetLeft ?? 0,
    width: visible?.width || window.innerWidth,
    height: visible?.height || window.innerHeight,
  };
}

/** Modal portaleado a body: compatible con iOS, sin depender de dialog.showModal(). */
export default function Modal({
  children,
  className,
  labelledBy,
  describedBy,
  onDismiss,
  dismissOnBackdrop = false,
  returnFocusTo,
}: {
  children: ReactNode;
  className: string;
  labelledBy: string;
  describedBy?: string;
  onDismiss?: () => void;
  dismissOnBackdrop?: boolean;
  returnFocusTo?: HTMLElement | null;
}) {
  const ref = useRef<HTMLElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const [visibleViewport, setVisibleViewport] = useState(viewport);

  useLayoutEffect(() => {
    const update = () => setVisibleViewport(viewport());
    const visible = window.visualViewport;
    visible?.addEventListener('resize', update);
    visible?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      visible?.removeEventListener('resize', update);
      visible?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  useLayoutEffect(() => {
    const surface = ref.current;
    if (!surface) return;
    // Safari no enfoca los botones al tocarlos: conservar también el disparador explícito.
    const previousFocus =
      returnFocusTo ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (!surfaces.length) unlockPage = lockBackground();
    surfaces.push(surface);
    updateStack();
    const focusFirst = () =>
      (
        surface.querySelector<HTMLElement>('[data-autofocus]') ??
        visibleControls(surface)[0] ??
        surface
      ).focus({ preventScroll: true });
    focusFirst();
    const keydown = (event: KeyboardEvent) => {
      if (surfaces[surfaces.length - 1] !== surface) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        dismissRef.current?.();
      }
      if (event.key !== 'Tab') return;
      const controls = visibleControls(surface);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) {
        event.preventDefault();
        surface.focus({ preventScroll: true });
      } else if (
        event.shiftKey &&
        (document.activeElement === first ||
          !controls.includes(document.activeElement as HTMLElement))
      ) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !controls.includes(document.activeElement as HTMLElement))
      ) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    const keepFocus = (event: FocusEvent) => {
      if (
        surfaces[surfaces.length - 1] === surface &&
        event.target instanceof Node &&
        !surface.contains(event.target)
      )
        focusFirst();
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', keepFocus);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', keepFocus);
      const index = surfaces.indexOf(surface);
      if (index >= 0) surfaces.splice(index, 1);
      updateStack();
      if (!surfaces.length) {
        unlockPage?.();
        unlockPage = null;
      }
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const style = {
    top: visibleViewport.top,
    left: visibleViewport.left,
    width: visibleViewport.width,
    height: visibleViewport.height,
    '--modal-height': `${visibleViewport.height}px`,
  } as CSSProperties;
  return createPortal(
    <div className="modal-layer" style={style}>
      <div
        className="modal-backdrop"
        aria-hidden="true"
        onClick={() => {
          if (dismissOnBackdrop) dismissRef.current?.();
        }}
      />
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`modal-surface ${className}`}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}
