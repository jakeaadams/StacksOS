import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Lists",
  description: "Create and manage reading lists to organize your favorite books and materials.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
