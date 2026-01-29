/**
 * Circulation Desk - Unified checkout/checkin interface
 */

import { CirculationDesk } from "@/components/circulation";
import { PageContainer, PageHeader, PageContent } from "@/components/shared";

export default function CirculationPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Circulation Desk"
        subtitle="Unified checkout and checkin workflows"
        breadcrumbs={[{ label: "Circulation" }, { label: "Desk" }]}
      />
      <PageContent>
        <CirculationDesk />
      </PageContent>
    </PageContainer>
  );
}
