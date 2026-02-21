import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Advanced Search",
  description: "Use advanced search options to find exactly what you are looking for in our catalog.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
