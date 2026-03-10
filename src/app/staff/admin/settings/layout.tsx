import type { ReactNode } from "react";

import { StaffSettingsNav } from "@/components/layout/staff-settings-nav";

export default function StaffSettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StaffSettingsNav />
      {children}
    </>
  );
}
