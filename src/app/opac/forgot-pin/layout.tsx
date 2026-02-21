import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Your PIN",
  description: "Reset your library account PIN to regain access to your account.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
