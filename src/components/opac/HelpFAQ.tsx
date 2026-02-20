"use client";

import { useState } from "react";
import {
  Search,
  User,
  BookOpen,
  Clock,
  Smartphone,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

const faqs: FAQItem[] = [
  {
    category: "Account & Library Card",
    question: "How do I get a library card?",
    answer:
      "You can apply for a free library card online through our Register page, or visit any branch with a valid ID and proof of address. Cards are available to all residents in our service area.",
  },
  {
    category: "Account & Library Card",
    question: "I forgot my PIN/password. How do I reset it?",
    answer:
      'Click "Forgot PIN" on the login page and enter your library card number. We will send a reset link to the email address on file. If you dont have an email on file, visit any branch with your library card and ID.',
  },
  {
    category: "Account & Library Card",
    question: "Can I access my account from my phone?",
    answer:
      "Yes! Our catalog works great on mobile devices. You can also download our mobile app for iOS and Android to manage your account, search the catalog, and download eBooks and audiobooks.",
  },
  {
    category: "Account & Library Card",
    question: "How do I update my contact information?",
    answer:
      "Log in to your account and go to My Account > Profile. You can update your email, phone number, and notification preferences. For address changes, please visit a branch with proof of your new address.",
  },
  {
    category: "Borrowing & Returns",
    question: "How long can I keep items?",
    answer:
      "Loan periods vary by item type: Books (3 weeks), DVDs (1 week), Magazines (1 week), New releases (2 weeks). Most items can be renewed up to 3 times unless another patron has placed a hold.",
  },
  {
    category: "Borrowing & Returns",
    question: "How do I renew my items?",
    answer:
      'Log in to your account, go to My Checkouts, and click Renew next to items you want to extend. You can also use the "Renew All" button. Items cannot be renewed if they are overdue, at maximum renewals, or another patron has placed a hold.',
  },
  {
    category: "Borrowing & Returns",
    question: "What are the fines for late items?",
    answer:
      "Overdue fines are $0.25/day for most items (max $5.00) and $1.00/day for DVDs (max $10.00). Items returned in the book drop before opening are not charged for that day. We offer fine forgiveness programs - ask at any branch!",
  },
  {
    category: "Borrowing & Returns",
    question: "I lost or damaged an item. What do I do?",
    answer:
      "Please contact us or visit a branch. You will be charged the replacement cost of the item plus a $5.00 processing fee. If you later find the item, we may be able to adjust the charge.",
  },
  {
    category: "Holds & Requests",
    question: "How do I place a hold?",
    answer:
      'Search for the item, click on the title to view details, then click "Place Hold." Choose your preferred pickup location and confirm. You will be notified when the item is ready.',
  },
  {
    category: "Holds & Requests",
    question: "How long are holds kept at the pickup location?",
    answer:
      "Holds are kept for 7 days. You will receive a notification when your hold is ready and a reminder before it expires. You can also suspend or cancel holds from your account.",
  },
  {
    category: "Holds & Requests",
    question: "Can I request items from other libraries?",
    answer:
      "Yes! We participate in interlibrary loan (ILL). If we dont own an item, contact us or visit any branch and staff can submit an ILL request for you. ILL requests typically take 1-2 weeks to arrive.",
  },
  {
    category: "Digital Resources",
    question: "How do I borrow eBooks and audiobooks?",
    answer:
      "We offer eBooks and audiobooks through Libby/OverDrive and hoopla. Log in with your library card number and PIN. Items are automatically returned, so no late fees! Download the Libby or hoopla app for the best experience.",
  },
  {
    category: "Digital Resources",
    question: "Why cant I download an eBook?",
    answer:
      "Popular titles may have waitlists. Place a hold and youll be notified when its available. Also check that your device is compatible and has enough storage. Contact us if you need help troubleshooting.",
  },
  {
    category: "Digital Resources",
    question: "Do you have streaming video services?",
    answer:
      "Yes! Kanopy offers thousands of films including documentaries, classics, and indie films. Each library card gets a set number of play credits per month. Access Kanopy through our Digital Resources page.",
  },
  {
    category: "Search & Catalog",
    question: "How do I search for items?",
    answer:
      "Use the search box at the top of any page. You can search by keyword, title, author, or subject. Use filters on the left to narrow results by format, availability, location, or audience.",
  },
  {
    category: "Search & Catalog",
    question: "What do the availability indicators mean?",
    answer:
      "Green = Available now at one or more locations. Yellow = Some copies available. Red = All copies checked out (place a hold!). The copy count shows total holdings across all branches.",
  },
  {
    category: "Search & Catalog",
    question: "Can I save my favorite books?",
    answer:
      "Yes! Create lists to organize items you want to read, have read, or want to recommend. Click the heart icon on any item to add it to your default list, or create custom lists in My Account.",
  },
];

const categories = [...new Set(faqs.map((f) => f.category))];

const categoryIcons: Record<string, React.ElementType> = {
  "Account & Library Card": User,
  "Borrowing & Returns": BookOpen,
  "Holds & Requests": Clock,
  "Digital Resources": Smartphone,
  "Search & Catalog": Search,
};

export function HelpFAQ() {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const toggleItem = (index: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const filteredFaqs = faqs.filter((faq) => {
    const matchesCategory = !activeCategory || faq.category === activeCategory;
    const matchesSearch =
      !searchQuery ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <>
      {/* Search box */}
      <div className="max-w-xl mx-auto">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/70" />
          <input
            type="text"
            placeholder="Search help topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-border rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Main content area with sidebar + FAQ */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-4 gap-8">
          {/* Category sidebar */}
          <div className="md:col-span-1">
            <h2 className="font-semibold text-foreground mb-4">Categories</h2>
            <nav className="space-y-1">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${!activeCategory ? "bg-primary-100 text-primary-700" : "text-foreground/80 hover:bg-muted/50"}`}
              >
                All Topics
              </button>
              {categories.map((category) => {
                const Icon = categoryIcons[category] || HelpCircle;
                return (
                  <button
                    type="button"
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
                      ${activeCategory === category ? "bg-primary-100 text-primary-700" : "text-foreground/80 hover:bg-muted/50"}`}
                  >
                    <Icon className="h-4 w-4" />
                    {category}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* FAQ content */}
          <div className="md:col-span-3">
            {filteredFaqs.length === 0 ? (
              <div className="text-center py-12 bg-card rounded-xl border border-border">
                <AlertCircle className="h-12 w-12 text-muted-foreground/70 mx-auto mb-4" />
                <p className="text-muted-foreground">
                  No results found for &quot;{searchQuery}&quot;
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="mt-4 text-primary-600 hover:underline"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredFaqs.map((faq, index) => (
                  <div
                    key={index}
                    className="bg-card rounded-xl border border-border overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleItem(index)}
                      className="w-full px-6 py-4 text-left flex items-center justify-between gap-4
                               hover:bg-muted/30 transition-colors"
                    >
                      <span className="font-medium text-foreground">{faq.question}</span>
                      {expandedItems.has(index) ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground/70 shrink-0" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground/70 shrink-0" />
                      )}
                    </button>
                    {expandedItems.has(index) && (
                      <div className="px-6 pb-4">
                        <p className="text-muted-foreground">{faq.answer}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
