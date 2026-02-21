import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get a Library Card",
  description: "Register for a free library card and start borrowing books, movies, and more.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
