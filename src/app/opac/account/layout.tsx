import type { Metadata } from "next";

import { AccountNav } from "@/components/opac/account-nav";

export const metadata: Metadata = {
  title: "My Account",
  description: "View your checkouts, holds, fines, and manage your library account.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AccountNav />
      {children}
    </>
  );
}
