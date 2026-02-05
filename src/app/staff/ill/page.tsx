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
import { featureFlags } from "@/lib/feature-flags";
import { Send, Link as LinkIcon } from "lucide-react";

export default function ILLPage() {
    const { data } = useApi<any>("/api/evergreen/ping", { immediate: true });

    if (!featureFlags.ill) {
        return (
            <PageContainer>
                <PageHeader
                    title="Interlibrary Loan"
                    subtitle="Interlibrary loan is behind a feature flag until a provider is integrated."
                    breadcrumbs={[{ label: "ILL" }]}
                />
                <PageContent>
                    <Card>
                        <CardContent className="py-12">
                            <EmptyState
                                icon={Send}
                                title="ILL is disabled"
                                description="This route is hidden by default to avoid dead UI. Enable ILL once a provider workflow is fully integrated."
                            />
                        </CardContent>
                    </Card>
                </PageContent>
            </PageContainer>
        );
    }

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
