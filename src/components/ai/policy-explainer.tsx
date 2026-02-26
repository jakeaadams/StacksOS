/**
 * Policy Explainer AI - Explains library policies in plain language
 * World-class UX: Contextual help for patrons and staff
 */

"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sparkles,
  Send,
  Loader2,
  BookOpen,
  Clock,
  DollarSign,
  Shield,
  HelpCircle,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/client-fetch";

interface PolicyQuestion {
  id: string;
  category: string;
  question: string;
  answer: string;
  sources?: string[];
  helpful?: boolean;
}

interface PolicyExplainerProps {
  context?: {
    patronType?: string;
    itemType?: string;
    situation?: string;
  };
  trigger?: React.ReactNode;
  variant?: "dialog" | "sheet" | "inline";
  className?: string;
}

const QUICK_QUESTIONS = [
  {
    category: "Borrowing",
    icon: BookOpen,
    questions: [
      "How many items can I check out?",
      "How long can I keep library materials?",
      "Can I renew my items?",
      "What if I return items late?",
    ],
  },
  {
    category: "Fines & Fees",
    icon: DollarSign,
    questions: [
      "How much are late fees?",
      "What happens if I lose an item?",
      "Can fines be waived?",
      "How do I pay my fines?",
    ],
  },
  {
    category: "Holds",
    icon: Clock,
    questions: [
      "How do I place a hold?",
      "How long are holds kept?",
      "Can I cancel a hold?",
      "How many holds can I have?",
    ],
  },
  {
    category: "Account",
    icon: Shield,
    questions: [
      "How do I get a library card?",
      "What ID do I need?",
      "Can I use my card at other branches?",
      "How do I update my information?",
    ],
  },
];

function QuickQuestionButton({
  question,
  onClick,
  isLoading,
}: {
  question: string;
  onClick: () => void;
  isLoading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={cn(
        "w-full text-left px-3 py-2 rounded-lg text-sm bg-muted/50 hover:bg-muted transition-colors flex items-center justify-between gap-2",
        isLoading && "opacity-50 cursor-not-allowed"
      )}
    >
      <span className="truncate">{question}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </button>
  );
}

function PolicyResponse({
  question,
  answer,
  sources,
  onFeedback,
}: PolicyQuestion & { onFeedback: (helpful: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<boolean | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  };

  const handleFeedback = (helpful: boolean) => {
    setFeedback(helpful);
    onFeedback(helpful);
    toast.success(helpful ? "Thanks for your feedback!" : "We will improve this answer");
  };

  return (
    <div className="space-y-3 animate-in fade-in-50 slide-in-from-bottom-2">
      <div className="bg-muted/30 rounded-lg p-3">
        <div className="flex items-start gap-2 mb-2">
          <HelpCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
          <span className="text-sm font-medium">{question}</span>
        </div>
      </div>

      <div className="bg-primary/5 border border-primary/10 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-primary">Policy Explainer</span>
        </div>

        <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
          {answer}
        </div>

        {sources && sources.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground">Sources:</span>
              {sources.map((source) => (
                <Badge key={source} variant="outline" className="text-[10px]">
                  {source}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Was this helpful?</span>
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-7 px-2", feedback === true && "text-green-600 bg-green-50")}
              onClick={() => handleFeedback(true)}
              disabled={feedback !== null}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-7 px-2", feedback === false && "text-red-600 bg-red-50")}
              onClick={() => handleFeedback(false)}
              disabled={feedback !== null}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PolicyExplainer({ trigger, variant = "dialog", className }: PolicyExplainerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [responses, setResponses] = useState<PolicyQuestion[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleAsk = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setIsLoading(true);
    setQuestion("");
    try {
      const res = await fetchWithAuth("/api/ai/policy-explain", {
        method: "POST",
        body: JSON.stringify({
          action: "policy_question",
          desc: q,
          context: {
            question: q,
          },
        }),
      });

      const data = await res.json();
      if (!data?.ok) {
        throw new Error(data?.error || "AI response failed");
      }

      const r = data.response;
      const answer =
        `${r.explanation}\n\n` +
        `Next steps:\n- ${Array.isArray(r.nextSteps) ? r.nextSteps.join("\n- ") : "Ask a librarian."}` +
        (r.suggestedNote ? `\n\nDraft note:\n${r.suggestedNote}` : "");

      setResponses((prev) => [
        ...prev,
        {
          id: `q-${Date.now()}`,
          category: "General",
          question: q,
          answer,
          sources: r.sources || [],
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI request failed";
      toast.error(message);
    } finally {
      setIsLoading(false);
      setTimeout(
        () =>
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }),
        100
      );
    }
  }, []);

  const handleFeedback = useCallback((questionId: string, helpful: boolean) => {
    setResponses((prev) => prev.map((r) => (r.id === questionId ? { ...r, helpful } : r)));
  }, []);

  const content = (
    <div className={cn("flex flex-col h-full", className)}>
      {responses.length === 0 && (
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">
            Ask me anything about library policies! Here are some common questions:
          </p>
          <div className="grid gap-4">
            {QUICK_QUESTIONS.map((category) => (
              <div key={category.category}>
                <div className="flex items-center gap-2 mb-2">
                  <category.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {category.category}
                  </span>
                </div>
                <div className="space-y-1">
                  {category.questions.map((q) => (
                    <QuickQuestionButton
                      key={q}
                      question={q}
                      onClick={() => handleAsk(q)}
                      isLoading={isLoading}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {responses.length > 0 && (
        <ScrollArea ref={scrollRef} className="flex-1 p-4">
          <div className="space-y-4">
            {responses.map((response) => (
              <PolicyResponse
                key={response.id}
                {...response}
                onFeedback={(helpful) => handleFeedback(response.id, helpful)}
              />
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 p-4 bg-muted/30 rounded-lg animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  Looking up policy information...
                </span>
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      <div className="border-t p-4 bg-background">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk(question);
          }}
          className="flex gap-2"
        >
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about library policies..."
            className="min-h-[44px] max-h-[120px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAsk(question);
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!question.trim() || isLoading}
            aria-label="Send question"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          AI-powered. Answers are based on current library policies.
        </p>
      </div>
    </div>
  );

  const defaultTrigger = (
    <Button variant="outline" size="sm" className="gap-2">
      <Sparkles className="h-4 w-4" />
      Policy Help
    </Button>
  );

  if (variant === "inline") {
    return (
      <div className="bg-card border rounded-xl overflow-hidden h-[500px]">
        <div className="flex items-center gap-2 p-3 border-b bg-muted/30">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Policy Explainer</span>
          <Badge variant="secondary" className="text-[10px]">
            AI
          </Badge>
        </div>
        {content}
      </div>
    );
  }

  if (variant === "sheet") {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>{trigger || defaultTrigger}</SheetTrigger>
        <SheetContent className="w-full sm:w-[400px] p-0 flex flex-col">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Policy Explainer
              <Badge variant="secondary" className="text-[10px]">
                AI
              </Badge>
            </SheetTitle>
            <SheetDescription>Get instant answers about library policies</SheetDescription>
          </SheetHeader>
          <div className="flex-1 flex flex-col min-h-0">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="max-w-lg h-[600px] p-0 flex flex-col">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Policy Explainer
            <Badge variant="secondary" className="text-[10px]">
              AI
            </Badge>
          </DialogTitle>
          <DialogDescription>Get instant answers about library policies</DialogDescription>
        </DialogHeader>
        <div className="flex-1 flex flex-col min-h-0">{content}</div>
      </DialogContent>
    </Dialog>
  );
}

export type { PolicyExplainerProps };
