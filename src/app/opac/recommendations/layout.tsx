import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Recommended for You",
  description: "Personalized reading recommendations based on your borrowing history and interests.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
