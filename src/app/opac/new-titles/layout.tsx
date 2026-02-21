import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Titles",
  description: "Discover the latest additions to our library collection.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
