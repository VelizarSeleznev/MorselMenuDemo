'use client';
import { useLocale } from '@/lib/i18n';
import { createElement, useEffect, useRef, useState } from 'react';
export default function FoodModel({
  model,
  name,
  interactive = false,
  portion = 'small',
}: {
  model: string;
  name: string;
  interactive?: boolean;
  portion?: 'small' | 'regular';
}) {
  const { t } = useLocale();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    import('@google/model-viewer')
      .then(() => setReady(true))
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    const e = ref.current;
    if (!e) return;
    const error = () => setFailed(true);
    e.addEventListener('error', error);
    return () => e.removeEventListener('error', error);
  }, [ready]);
  return (
    <div className="food-model">
      {ready && !failed ? (
        createElement('model-viewer', {
          ref,
          src: `/models/morsel/${model}-${portion}.glb`,
          alt: `3D: ${name}`,
          loading: 'eager',
          'camera-orbit': '-25deg 58deg 7m',
          'camera-target': '0m 0.8m 0m',
          'field-of-view': '28deg',
          'shadow-intensity': '1',
          'shadow-softness': '1',
          'environment-image': 'neutral',
          exposure: '1.15',
          ...(interactive
            ? {
                'camera-controls': true,
                'touch-action': 'pan-y',
                'auto-rotate': true,
                'auto-rotate-delay': '3000',
                'rotation-per-second': '12deg',
              }
            : {}),
          'interaction-prompt': 'none',
          style: { width: '100%', height: '100%' },
        })
      ) : (
        <div className="model-fallback">
          {t(failed ? '3D unavailable · details below' : 'Plating up…')}
        </div>
      )}
    </div>
  );
}
