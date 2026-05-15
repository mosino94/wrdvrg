import React from 'react';
import { cn } from '@/src/lib/utils';

interface StatusDotProps {
  status: 'online' | 'offline' | 'in_call' | 'searching';
  className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
  const bgColors = {
    online: 'bg-emerald-500',
    offline: 'bg-[#ef4444]',
    in_call: 'bg-orange-500',
    searching: 'bg-amber-500'
  };

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <div 
        className={cn(
          "w-[10px] h-[10px] rounded-full border-[2px] border-[#080808]", 
          bgColors[status]
        )} 
      />
    </div>
  );
}
