import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Library Locations",
  description: "Find library branches near you with hours, directions, and contact information.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
