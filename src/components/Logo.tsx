// EM Launchpad-logo uit de config; zolang het bestand ontbreekt een "EM"-monogram in dezelfde vorm.
import { useState } from 'react';
import { fileUrl } from '../config';

export function Logo({ src, size }: { src?: string; size: number }) {
  const [failed, setFailed] = useState(false);
  const radius = Math.round(size * 0.28);

  if (src && !failed) {
    return (
      <img
        src={fileUrl(src)}
        onError={() => setFailed(true)}
        alt="EM Launchpad"
        draggable={false}
        className="shrink-0 object-cover"
        style={{ width: size, height: size, borderRadius: radius, boxShadow: '0 0 18px rgba(19,199,230,0.25)' }}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: 'linear-gradient(145deg, var(--ink-3), var(--ink-1))',
        border: '1px solid var(--line-2)',
        boxShadow: '0 0 18px rgba(19,199,230,0.2)',
      }}
    >
      <span className="grad-text font-extrabold" style={{ fontSize: size * 0.42, letterSpacing: '-0.04em' }}>
        EM
      </span>
    </div>
  );
}
