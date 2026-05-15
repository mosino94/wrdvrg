import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Users, Clock, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export function BottomNav() {
  const navItems = [
    { to: '/', icon: Home, label: 'Home' },
    { to: '/friends', icon: Users, label: 'Friends' },
    { to: '/history', icon: Clock, label: 'History' },
    { to: '/settings', icon: SettingsIcon, label: 'Settings' },
  ];

  return (
    <nav className="md:hidden flex items-center justify-around w-full bg-[#0C0C0C] border-t border-zinc-800 pb-safe pt-1 px-2 flex-shrink-0 z-50">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => cn(
            "flex flex-col items-center justify-center p-2 min-w-[64px] min-h-[44px] gap-1 transition-colors",
            isActive ? "text-orange-500" : "text-zinc-600"
          )}
        >
          <item.icon size={20} strokeWidth={2} />
          <span className="text-[10px] font-medium leading-none">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
