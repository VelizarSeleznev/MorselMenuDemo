'use client';
import { useEffect, useRef } from 'react';

/** One spring owns the presentation value, including interruptions and drag release. */
export function useArrivalDrawer(open: boolean, onChange: (open: boolean) => void) {
  const panel = useRef<HTMLElement>(null);
  const edge = useRef<HTMLDivElement>(null);
  const state = useRef({ x: open ? 1 : 0, velocity: 0, target: open ? 1 : 0, dragging: false });
  const wake = useRef<() => void>(() => {});
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => { state.current.target = open ? 1 : 0; wake.current(); }, [open]);
  useEffect(() => {
    const el = panel.current!, grip = edge.current!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, last = 0, active: { id: number; x: number; y: number; base: number; samples: { x: number; time: number }[]; claimed: boolean } | null = null;
    const width = () => el.offsetWidth + 24;
    const render = () => {
      const x = state.current.x;
      el.style.transform = reduced.matches ? 'none' : `translate3d(${(x - 1) * width()}px,0,0)`;
      el.style.opacity = String(reduced.matches ? Math.max(0, Math.min(1, x)) : 1);
      el.style.visibility = x < .001 && state.current.target === 0 && !state.current.dragging ? 'hidden' : 'visible';
    };
    const tick = (now: number) => {
      const dt = Math.min((now - (last || now)) / 1000, .025); last = now;
      const s = state.current;
      if (!s.dragging) {
        if (reduced.matches) { s.x = s.target; s.velocity = 0; }
        else {
          // Critically damped response; keep velocity when the target reverses.
          s.velocity += ((s.target - s.x) * 380 - s.velocity * 39) * dt;
          s.x += s.velocity * dt;
          if (Math.abs(s.target - s.x) < .0005 && Math.abs(s.velocity) < .002) { s.x = s.target; s.velocity = 0; }
        }
      }
      render();
      frame = !s.dragging && (s.x !== s.target || s.velocity !== 0) ? requestAnimationFrame(tick) : 0;
    };
    wake.current = () => { if (!frame) { last = 0; frame = requestAnimationFrame(tick); } };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary || document.querySelector('[role="dialog"]')) return;
      active = { id: e.pointerId, x: e.clientX, y: e.clientY, base: state.current.x, samples: [{ x: e.clientX, time: e.timeStamp }], claimed: false };
    };
    const move = (e: PointerEvent) => {
      if (!active || active.id !== e.pointerId) return;
      const dx = e.clientX - active.x, dy = e.clientY - active.y;
      if (!active.claimed) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { active = null; return; }
        if (Math.abs(dx) < 8) return;
        active.claimed = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        state.current.dragging = true;
      }
      const raw = active.base + dx / width();
      state.current.x = raw < 0 ? raw / (1 + Math.abs(raw) * 8) * .2 : raw > 1 ? 1 + (raw - 1) / (1 + (raw - 1) * 8) * .2 : raw;
      active.samples.push({ x: e.clientX, time: e.timeStamp });
      active.samples = active.samples.filter(p => e.timeStamp - p.time < 100);
      render();
    };
    const end = (e: PointerEvent) => {
      if (!active || active.id !== e.pointerId) return;
      if (active.claimed) {
        const sample = active.samples[0];
        const v = e.type === 'pointercancel' ? 0 : (e.clientX - sample.x) / Math.max(16, e.timeStamp - sample.time) * 1000 / width();
        const s = state.current;
        s.velocity = v; s.dragging = false;
        const next = e.type === 'pointercancel' ? s.target === 1 : s.x + v * .18 > .5;
        s.target = next ? 1 : 0;
        change.current(next);
        wake.current();
        // A drag ending over a control must not also activate that control.
        el.addEventListener('click', cancelClick, { capture: true, once: true });
        setTimeout(() => el.removeEventListener('click', cancelClick, true), 0);
      }
      active = null;
    };
    const cancelClick = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    for (const node of [el, grip]) {
      node.addEventListener('pointerdown', down);
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', end);
      node.addEventListener('pointercancel', end);
    }
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      wake.current = () => {};
      for (const node of [el, grip]) {
        node.removeEventListener('pointerdown', down); node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', end); node.removeEventListener('pointercancel', end);
      }
    };
  }, []);
  return { panel, edge };
}
