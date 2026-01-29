"use client";

import {
    PageContainer,
    PageHeader,
    PageContent,
    EmptyState,
    StatusBadge,
} from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { useApi } from "@/hooks";
import { Send, Link as LinkIcon } from "lucide-react";

export default function ILLPage() {
    const { data } = useApi<any>("/api/evergreen/ping", { immediate: true });

    return (
        <PageContainer>
            <PageHeader
                title="Interlibrary Loan"
                subtitle="Connect an ILL provider to manage borrowing and lending workflows."
                breadcrumbs={[{ label: "ILL" }]}
            >
                <StatusBadge label={data?.ok ? "Evergreen Online" : "Evergreen Offline"} status={data?.ok ? "success" : "error"} />
            </PageHeader>
            <PageContent>
                <Card>
                    <CardContent className="py-12">
                        <EmptyState
                            icon={Send}
                            title="No ILL provider connected"
                            description="StacksOS surfaces ILL data once a provider is configured in Evergreen or via an integration service."
                            action={{
                                label: "Configure Provider",
                                onClick: () => window.location.assign("/staff/help#ill"),
                                icon: LinkIcon,
                            }}
                        />
                    </CardContent>
                </Card>
            </PageContent>
        </PageContainer>
    );
}
