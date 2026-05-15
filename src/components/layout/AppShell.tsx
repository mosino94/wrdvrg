import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { TopBar } from './TopBar';
import { FriendOnlinePopup } from '../friends/FriendOnlinePopup';
import { AuthModal } from '../auth/AuthModal';

export function AppShell() {
  return (
    <div className="fixed inset-0 flex flex-col bg-[#080808] text-zinc-100 overflow-hidden">
      <TopBar />
      <FriendOnlinePopup />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto relative bg-[radial-gradient(circle_at_center,_rgba(242,125,38,0.03)_0%,_transparent_70%)]">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <AuthModal />
    </div>
  );
}
