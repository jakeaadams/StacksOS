import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Account",
  description: "View your checkouts, holds, fines, and manage your library account.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
