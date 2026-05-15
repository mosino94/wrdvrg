import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Users, Clock, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export function Sidebar() {
  const navItems = [
    { to: '/', icon: Home, label: 'Home' },
    { to: '/friends', icon: Users, label: 'Friends' },
    { to: '/history', icon: Clock, label: 'History' },
    { to: '/settings', icon: SettingsIcon, label: 'Settings' },
  ];

  return (
    <aside className="hidden md:flex flex-col w-[52px] h-full bg-[#0A0A0A] border-r border-zinc-800 py-4 items-center gap-4 flex-shrink-0">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => cn(
            "p-3 rounded-[10px] transition-colors",
            isActive ? "bg-zinc-800 text-orange-500" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900"
          )}
          title={item.label}
        >
          <item.icon size={22} strokeWidth={2} />
        </NavLink>
      ))}
    </aside>
  );
}
