"use client";

import * as React from "react";
import { useState } from "react";
import { fetchWithAuth } from "@/lib/client-fetch";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { NotificationPreferences } from "@/components/patron/notification-preferences";
import { Mail, Send, Clock, CheckCircle2, XCircle } from "lucide-react";

interface PatronNoticesTabProps {
  patronId: number;
  patronEmail?: string;
}

export function PatronNoticesTab({ patronId, patronEmail }: PatronNoticesTabProps) {
  const [noticeType, setNoticeType] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const [lastSent, setLastSent] = useState<{ type: string; status: string; time: Date } | null>(null);

  const handleSendNotice = async () => {
    if (!noticeType) {
      toast.error("Please select a notice type");
      return;
    }

    if (!patronEmail) {
      toast.error("Patron has no email address");
      return;
    }

    setIsSending(true);
    try {
      const response = await fetchWithAuth("/api/evergreen/notices", {
        method: "POST",
        body: JSON.stringify({
          patron_id: patronId,
          notice_type: noticeType,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to send notice");
      }

      setLastSent({
        type: noticeType,
        status: "sent",
        time: new Date(),
      });

      toast.success(`Notice sent successfully to ${data.recipient}`);
      setNoticeType("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send notice";
      toast.error(message);

      setLastSent({
        type: noticeType,
        status: "failed",
        time: new Date(),
      });
    } finally {
      setIsSending(false);
    }
  };

  const noticeTypes = [
    { value: "hold_ready", label: "Hold Ready", description: "Notify patron their hold is ready" },
    { value: "overdue", label: "Overdue Items", description: "Send overdue notice" },
    { value: "pre_overdue", label: "Pre-Overdue Courtesy", description: "Send courtesy reminder" },
    { value: "card_expiration", label: "Card Expiration", description: "Remind about card expiration" },
    { value: "fine_bill", label: "Fines & Bills", description: "Send bill notice" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <CardTitle>Send Email Notice</CardTitle>
          </div>
          <CardDescription>
            Send an email notification to the patron
            {patronEmail ? ` (${patronEmail})` : " (no email on file)"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notice-type">Notice Type</Label>
            <Select value={noticeType} onValueChange={setNoticeType} disabled={!patronEmail}>
              <SelectTrigger id="notice-type">
                <SelectValue placeholder="Select a notice type..." />
              </SelectTrigger>
              <SelectContent>
                {noticeTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{type.label}</span>
                      <span className="text-xs text-muted-foreground">{type.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleSendNotice}
            disabled={!noticeType || isSending || !patronEmail}
            className="w-full"
          >
            <Send className="mr-2 h-4 w-4" />
            {isSending ? "Sending..." : "Send Notice"}
          </Button>

          {!patronEmail && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <p className="text-sm text-yellow-800">
                This patron does not have an email address on file. Email notices cannot be sent.
              </p>
            </div>
          )}

          {lastSent && (
            <div className="bg-muted/30 border rounded-md p-3">
              <div className="flex items-center gap-2 text-sm">
                {lastSent.status === "sent" ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-green-600">Last notice sent successfully</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="font-medium text-red-600">Last notice failed</span>
                  </>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                <Badge variant="outline" className="mr-2">
                  {noticeTypes.find((t) => t.value === lastSent.type)?.label}
                </Badge>
                <Clock className="inline h-3 w-3 mr-1" />
                {lastSent.time.toLocaleString()}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <NotificationPreferences patronId={patronId} />

      <Card>
        <CardHeader>
          <CardTitle>Notice History</CardTitle>
          <CardDescription>
            Recent email notifications sent to this patron
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground text-center py-8">
            Notice history tracking will be available once notices are logged to the database.
            <br />
            Currently notices are logged via audit system.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
