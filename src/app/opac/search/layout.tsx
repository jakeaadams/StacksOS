import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search the Catalog",
  description: "Search our library catalog for books, movies, music, and more.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
