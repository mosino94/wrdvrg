import React from 'react';

export function Flag({ code, size = 20 }: { code: string; size?: number }) {
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/24x18/${code.toLowerCase()}.png`}
      alt={code.toUpperCase()}
      style={{ width: size * 1.33, height: size, objectFit: 'cover', borderRadius: 2 }}
      onError={(e) => (e.currentTarget.style.display = 'none')}
    />
  );
}
