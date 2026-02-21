import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse the Collection",
  description: "Browse our library collection by subject, author, genre, and more.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
