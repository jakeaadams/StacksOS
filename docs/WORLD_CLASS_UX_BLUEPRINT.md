# StacksOS World-Class UX Blueprint
**Date:** January 2026  
**Scope:** Competitive Research, UX Teardown, Design System, AI Strategy, Roadmap

---

## Executive Summary

StacksOS has a solid technical foundation built on Next.js 16 with a comprehensive component library. However, to achieve "world-class" status and surpass competitors like Polaris, Alma, Sierra, and Koha, the UI/UX needs strategic refinement focused on **power-user workflows**, **information density**, and **scan-first design**.

**Key Findings:**
- Current UI uses modern shadcn/ui components but lacks library-specific optimizations
- Navigation is comprehensive but not optimized for "tunnel vision" circulation workflows
- Missing key differentiators: audio feedback, keyboard-first design, AI assistance
- Strong foundation in shared components (PatronCard, DataTable, BarcodeInput)

---

# Part 1: Competitive UX Research

## 1.1 Major ILS/LSP Systems Analysis

### Polaris LEAP
**Strengths to Copy:**
- Training time: hours not days ("visually stunning compared to other ILSes")
- Color-coded messaging: green = success, red = error (instant feedback)
- Mobile-first tablet design for stacks, bookmobiles, community events
- Multiple check-in modes: Bulk, In-House, Inventory, Damaged, Missing Part
- "Ask me later" hold management (acknowledges real-world interruptions)
- Offline capability for when internet is unavailable

**Weaknesses to Avoid:**
- "Sometimes there are glitches — searching can be a hassle"
- Error correction can be difficult
- Not all traditional client functionality in web version

*Sources: [G2 Reviews](https://www.g2.com/products/polaris-ils/reviews), [Polaris Help](https://help.polarislibrary.com/leap)*

### Ex Libris Alma
**Strengths to Copy:**
- Slide-out panels keep work in context (edit without switching pages)
- Customizable UI density (users choose information level)
- Unified search across all resource types
- Best-in-class analytics and benchmarking
- Community Zone for shared metadata (2,365+ libraries)
- WCAG 2.1 Level A and AA compliance

**Weaknesses to Avoid:**
- "Slowness and complexity" - most common complaints
- "None of the devs are library-people" perception
- "Overly baroque" circulation settings (Georgia Southern study)
- Multi-tiered support where users repeat information
- Forced UI changes without opt-out

*Sources: [Library Automation Survey 2024](https://librarytechnology.org/perceptions/2024/comments/), [Code4Lib Journal](https://journal.code4lib.org/articles/18293)*

### Innovative Sierra
**Strengths to Copy:**
- Clean, organized visual hierarchy
- Color-coded status indicators (red tabs for overdue/fines)
- Customizable function keys (F1-F12) per user
- Fast learning curve: "less than a couple days"
- Strong consortium support

**Weaknesses to Avoid:**
- "Stuck with Java-based system requiring SSH for certain tasks"
- "Freezes occasionally, slow for broad search terms"
- "More wizards than necessary" that must be closed individually
- "Half-baked features" rolled out without improvements

*Sources: [TrustRadius](https://www.trustradius.com/products/sierra-ils/reviews), [G2](https://www.g2.com/products/sierra-ils/reviews)*

### SirsiDynix Symphony/BLUEcloud
**Strengths to Copy:**
- RFID integration (automatic item detection)
- Color scheme customization options
- Wizard-driven interface with customizable toolbars
- Works for single sites or multi-type consortia
- No data migration for existing customers

**Weaknesses to Avoid:**
- "Training is time-consuming and complicated"
- "Rather antiquated reporting features"
- "Core has not changed much in 20 years"
- Lacks Electronic Resource Management module

*Sources: [Capterra](https://www.capterra.com/p/8965/SirsiDynix-Symphony/), [G2](https://www.g2.com/products/sirsidynix-symphony/reviews)*

### Koha (Open Source)
**Strengths to Copy:**
- Bootstrap responsive grid system
- Color-coded alerts (info, warning, error)
- Self-checkout module included at no cost
- SQL-based custom reports
- Community-driven development

**Weaknesses to Avoid:**
- "Cataloguing module is clunky with tabbed MARC fields"
- Requires Linux/database expertise for installation
- "Majority of students found VuFind more usable than Koha OPAC"
- Limited development support for edge cases

*Sources: [Koha Wiki](https://wiki.koha-community.org), [Code4Lib](https://journal.code4lib.org/articles/28)*

### FOLIO LSP
**Strengths to Copy:**
- MOTIF design system with React components
- Microservices architecture (language-agnostic)
- Resizable panes for workspace customization
- Strong ERM capabilities (EBSCO Knowledge Base integration)
- 3,800+ community contributors

**Weaknesses to Avoid:**
- "Very slow when working with large number of records"
- No built-in discovery layer (requires VuFind, Blacklight, or EBSCO Locate)
- Browser compatibility issues outside Chrome
- "Steep learning curve" complaints

*Sources: [FOLIO UX Docs](https://ux.folio.org/docs/), [Code4Lib](https://journal.code4lib.org/articles/17433)*

### K-12 Systems (Follett Destiny, Alexandria, Surpass)

**Follett Destiny - Market Leader**
- Visual OPAC for elementary students (pictures instead of text)
- Destiny Discover Engage: gamification, badges, challenges
- Destiny AI (Feb 2025): conversational reporting with natural language
- Integration with Accelerated Reader, Lexile, Reading Counts

**Alexandria - Best Support**
- WCAG/ADA compliant (only K-12 ILS to meet standards)
- Three search interfaces: Scout, Explore, Search
- "Amazing tech support" consistently praised

**Surpass - Most Affordable**
- Starting at $900/year for K-12
- Class circulation feature with photo-based patron selection
- Minimal IT requirements

---

## 1.2 Common Pain Points Across All Systems

| Pain Point | Affected Systems | Impact |
|------------|------------------|--------|
| Slowness/Performance | Alma, Sierra, FOLIO | High frustration, workflow disruption |
| Complex Training | Alma, Symphony, FOLIO | High onboarding costs |
| Poor Search | Sierra, Koha | Staff inefficiency |
| Dated Interface | Symphony, Sierra | Perception of obsolescence |
| Limited Reporting | Symphony, Surpass | Decision-making gaps |
| Wizard/Click Fatigue | Sierra, Destiny | Workflow inefficiency |

---

# Part 2: StacksOS UX Teardown

## 2.1 Current Architecture Analysis

**Component Library (25+ components):**
```
src/components/ui/          # Base shadcn/ui components
├── button.tsx              # Standard variants
├── card.tsx                # Consistent card patterns
├── dialog.tsx              # Modal dialogs
├── table.tsx               # Basic table structure
├── dropdown-menu.tsx       # Context menus
├── command.tsx             # Command palette base
└── ...

src/components/shared/      # Domain-specific components
├── barcode-input.tsx       # Scan-first input (GOOD)
├── patron-card.tsx         # Patron display (GOOD)
├── data-table.tsx          # TanStack table wrapper (GOOD)
├── page-header.tsx         # Consistent headers (GOOD)
├── empty-state.tsx         # Empty states (GOOD)
├── patron-cockpit.tsx      # Patron context panel (GOOD)
├── record-cockpit.tsx      # Record context panel (GOOD)
├── marc-diff.tsx           # MARC comparison (GOOD)
└── ...
```

**What's Working Well:**
1. **BarcodeInput** - Scan-first design with proper focus handling
2. **PatronCockpit/RecordCockpit** - Contextual slide-out panels (like Alma)
3. **DataTable** - Consistent table patterns with TanStack
4. **PageContainer/PageHeader/PageContent** - Consistent page structure
5. **StatusBadge** - Semantic status indicators
6. **EmptyState** - Helpful empty states with actions
7. **UniversalSearch** - Command palette for quick navigation

## 2.2 UX Issues Identified

### Issue 1: Information Density Too Low
**Location:** Most staff pages  
**Problem:** Default Tailwind spacing creates "blog-like" feel, not "power tool"  
**Evidence:** Compare to Polaris LEAP which shows more rows per screen  
**Recommendation:** Create density modes (compact/comfortable/spacious)

### Issue 2: Missing Audio Feedback
**Location:** Checkout/Checkin pages  
**Problem:** No audio cues for success/error (Polaris has this)  
**Evidence:** Library staff expect audible confirmation during scanning  
**Recommendation:** Add configurable beep tones for actions

### Issue 3: Keyboard Shortcuts Not Discoverable
**Location:** Global  
**Problem:** Shortcuts exist (F1-F5) but not visible in UI  
**Evidence:** Sidebar shows shortcuts but they're hidden until hover  
**Recommendation:** Add keyboard shortcut overlay (? key) like GitHub

### Issue 4: Checkout/Checkin Not Unified
**Location:** /staff/circulation/checkout, /staff/circulation/checkin  
**Problem:** Separate pages require navigation between  
**Evidence:** Polaris has "Circulation Desk" combining all functions  
**Recommendation:** Create unified CirculationDesk component with tabs

### Issue 5: OPAC Search Not Faceted
**Location:** /opac/search  
**Problem:** Basic search without refinement facets  
**Evidence:** All modern discovery systems use faceted search  
**Recommendation:** Add format, availability, location, date facets

### Issue 6: No "Power User" Density Toggle
**Location:** Global  
**Problem:** Fixed spacing doesn't adapt to user preference  
**Evidence:** Alma allows density customization per user  
**Recommendation:** Add density preference in user settings

### Issue 7: Tables Lack Row Actions
**Location:** DataTable implementations  
**Problem:** Actions require row selection then toolbar button  
**Evidence:** Users expect right-click or hover actions  
**Recommendation:** Add action column with dropdown per row

### Issue 8: No Offline Mode Indicator
**Location:** Global  
**Problem:** When offline, unclear what works  
**Evidence:** Polaris has dedicated offline mode  
**Recommendation:** Add visible offline banner with sync status

---

# Part 3: Redesign Blueprint

## 3.1 Brand Directions (Choose One)

### Option A: "Calm, Precise, High-Density"
**Adjectives:** Professional, Efficient, Trustworthy  
**Vibe:** Bloomberg Terminal meets Notion  
**Colors:** Neutral grays, teal accents, white backgrounds  
**Typography:** Inter Tight headers, JetBrains Mono for data  
**Best For:** Academic libraries, research institutions

### Option B: "Warm Institutional, Friendly, Accessible"
**Adjectives:** Welcoming, Clear, Helpful  
**Vibe:** Modern public library with personality  
**Colors:** Warm beige backgrounds, forest green accents  
**Typography:** Source Sans Pro, large touch targets  
**Best For:** Public libraries, K-12 schools

### Option C: "Premium Command Center, Confident, Luminous" ⭐ RECOMMENDED
**Adjectives:** Powerful, Modern, Dense  
**Vibe:** Linear meets Figma meets Stripe Dashboard  
**Colors:** Dark surfaces (#0A0A0A), teal-500 primary, amber-500 warnings  
**Typography:** Geist/Inter Tight (-0.02em tracking), Geist Mono for codes  
**Best For:** All library types, positions as premium product

---

## 3.2 Design System Spec: "StacksDS"

### Color Tokens
```css
/* Semantic Colors */
--surface: #0A0A0A;           /* Not pure black */
--surface-elevated: #141414;   /* Cards, modals */
--surface-glass: rgba(20, 20, 20, 0.7);  /* With backdrop blur */

--text-primary: #FAFAFA;
--text-secondary: #A1A1AA;
--text-muted: #52525B;

--brand-primary: #14B8A6;     /* Teal-500 */
--brand-secondary: #F59E0B;   /* Amber-500 */
--brand-tertiary: #3B82F6;    /* Blue-500 */

--success: #22C55E;           /* Green-500 */
--warning: #F59E0B;           /* Amber-500 */
--error: #EF4444;             /* Red-500 */
--info: #3B82F6;              /* Blue-500 */

/* Status-specific */
--status-available: #22C55E;
--status-checked-out: #F59E0B;
--status-on-hold: #3B82F6;
--status-lost: #EF4444;
--status-in-transit: #8B5CF6; /* Purple */
```

### Typography Scale
```css
/* Headers */
--font-display: "Geist", "Inter Tight", system-ui;
--font-body: "Geist", "Inter", system-ui;
--font-mono: "Geist Mono", "JetBrains Mono", monospace;

/* Sizes */
--text-xs: 0.75rem;   /* 12px - labels, badges */
--text-sm: 0.8125rem; /* 13px - table cells */
--text-base: 0.875rem;/* 14px - body text */
--text-lg: 1rem;      /* 16px - subheadings */
--text-xl: 1.125rem;  /* 18px - section titles */
--text-2xl: 1.5rem;   /* 24px - page titles */

/* Letter Spacing */
--tracking-tight: -0.02em;    /* Headers */
--tracking-normal: -0.01em;   /* Body */
--tracking-wide: 0.05em;      /* Uppercase labels */
```

### Spacing Scale (4px base)
```css
--space-0: 0;
--space-1: 4px;
--space-2: 8px;    /* Default gap */
--space-3: 12px;
--space-4: 16px;   /* Section padding */
--space-5: 20px;
--space-6: 24px;   /* Card padding */
--space-8: 32px;   /* Page margins */
--space-10: 40px;
--space-12: 48px;
```

### Border Radius
```css
--radius-sm: 4px;    /* Buttons, inputs */
--radius-md: 6px;    /* Cards */
--radius-lg: 8px;    /* Modals */
--radius-xl: 12px;   /* Large cards */
--radius-full: 9999px; /* Pills, avatars */
```

### Elevation (Dark Mode)
```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
--shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
--shadow-glow: 0 0 20px rgba(20, 184, 166, 0.15); /* Brand glow */
```

### Component Patterns

#### Data Tables (Power User Optimized)
```
┌──────────────────────────────────────────────────────────────┐
│ [Filter] [Column Picker] [Density: ◉ Compact ○ Normal]  [⋮] │
├──────────────────────────────────────────────────────────────┤
│ ☐ │ Barcode     │ Title              │ Status    │ Actions  │
├───┼─────────────┼────────────────────┼───────────┼──────────┤
│ ☐ │ 30035001234 │ The Great Gatsby   │ 🟢 Avail  │ [⋮]      │
│ ☐ │ 30035001235 │ 1984               │ 🟡 Out    │ [⋮]      │
│ ☐ │ 30035001236 │ To Kill a Mock...  │ 🔵 Hold   │ [⋮]      │
└───┴─────────────┴────────────────────┴───────────┴──────────┘
│ Showing 1-50 of 1,234 │ [< Prev] [1] [2] [3] ... [Next >]   │
└──────────────────────────────────────────────────────────────┘
```

**Requirements:**
- Row height: 32px (compact), 40px (normal), 48px (spacious)
- Sticky header on scroll
- Keyboard navigation (arrow keys, Enter to select)
- Right-click context menu
- Shift+click for range selection
- Column resizing via drag

#### Form Patterns
```
┌─ Patron Registration ────────────────────────────────────────┐
│                                                              │
│  ┌─ Required Fields ──────────────────────────────────────┐  │
│  │                                                        │  │
│  │  First Name *              Last Name *                 │  │
│  │  ┌────────────────┐        ┌────────────────┐          │  │
│  │  │                │        │                │          │  │
│  │  └────────────────┘        └────────────────┘          │  │
│  │                                                        │  │
│  │  Email *                   Phone                       │  │
│  │  ┌────────────────┐        ┌────────────────┐          │  │
│  │  │                │        │                │          │  │
│  │  └────────────────┘        └────────────────┘          │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ Address (optional) ──────────────────────────[Expand]─┐  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│                           [Cancel]  [Save & Close] [Save +]  │
└──────────────────────────────────────────────────────────────┘
```

**Requirements:**
- Required fields marked with * and bold labels
- Inline validation on blur
- Tab order follows visual flow
- Collapsible sections for optional fields
- Save shortcuts: Cmd+S (save), Cmd+Shift+S (save and new)

---

## 3.3 Navigation & Information Architecture

### Staff Module Structure
```
┌─────────────────────────────────────────────────────────────────┐
│ [☰] StacksOS          [🔍 Search... ⌘K]      [🔔] [👤 Jake]    │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────────────────────────────────────────────┐ │
│ │         │ │                                                 │ │
│ │ HOME    │ │                                                 │ │
│ │   ⌘1    │ │                                                 │ │
│ │         │ │              MAIN CONTENT AREA                  │ │
│ ├─────────┤ │                                                 │ │
│ │ CIRC    │ │                                                 │ │
│ │   F1-F2 │ │                                                 │ │
│ │ ├ Out   │ │                                                 │ │
│ │ ├ In    │ │                                                 │ │
│ │ ├ Renew │ │                                                 │ │
│ │ └ Holds │ │                                                 │ │
│ ├─────────┤ │                                                 │ │
│ │ PATRONS │ │                                                 │ │
│ │   F3-F4 │ │                                                 │ │
│ ├─────────┤ │                                                 │ │
│ │ CATALOG │ │                                                 │ │
│ │   F5    │ │                                                 │ │
│ ├─────────┤ │                                                 │ │
│ │ REPORTS │ │                                                 │ │
│ ├─────────┤ │                                                 │ │
│ │ ADMIN   │ │                                                 │ │
│ └─────────┘ └─────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ [🟢 Online] [📍 Main Branch] [⌨️ Scanner Ready] [12ms latency] │
└─────────────────────────────────────────────────────────────────┘
```

### Keyboard Shortcut Map
| Key | Action | Context |
|-----|--------|---------|
| ⌘K | Universal search | Global |
| F1 | Checkout | Global |
| F2 | Checkin | Global |
| F3 | Patron search | Global |
| F4 | New patron | Global |
| F5 | Catalog search | Global |
| F8 | Reprint last receipt | Circulation |
| F9 | Print slip | Circulation |
| Esc | Close modal/panel | Global |
| ? | Show all shortcuts | Global |

---

# Part 4: World-Class Workflow Wireframes

## 4.1 Circulation Desk (Unified)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Circulation Desk                                        [F8 Reprint] [?]│
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─ Patron ─────────────────────────────┐ ┌─ Session ───────────────────┐│
│ │                                      │ │                             ││
│ │  Scan patron barcode or search...    │ │  Mode: ◉ Checkout ○ Checkin ││
│ │  ┌──────────────────────────────┐    │ │        ○ Renew   ○ In-House ││
│ │  │ 🔍 _________________________│    │ │                             ││
│ │  └──────────────────────────────┘    │ │  Scan item barcode...       ││
│ │                                      │ │  ┌───────────────────────┐  ││
│ │  ┌─ SMITH, JANE ──────────────────┐  │ │  │ 🔊 ___________________│  ││
│ │  │ 🟢 Good Standing               │  │ │  └───────────────────────┘  ││
│ │  │ Card: 29999000123456           │  │ │                             ││
│ │  │ Expires: 2027-06-15            │  │ │  ┌─────────────────────────┐││
│ │  │                                │  │ │  │ The Great Gatsby        │││
│ │  │ ⚠️ 2 holds ready for pickup    │  │ │  │ Due: Feb 8, 2026        │││
│ │  │ 💳 $0.00 owed                  │  │ │  │ ✅ Checked out          │││
│ │  │                                │  │ │  ├─────────────────────────┤││
│ │  │ Currently Out: 5 items         │  │ │  │ 1984                    │││
│ │  │ [View All] [Quick Actions ▾]   │  │ │  │ Due: Feb 8, 2026        │││
│ │  └────────────────────────────────┘  │ │  │ ✅ Checked out          │││
│ │                                      │ │  ├─────────────────────────┤││
│ │  ┌─ Alerts ───────────────────────┐  │ │  │ ...                     │││
│ │  │ (none)                         │  │ │  └─────────────────────────┘││
│ │  └────────────────────────────────┘  │ │                             ││
│ └──────────────────────────────────────┘ │  Session: 3 items           ││
│                                          │  [Clear] [Print Slip F9]    ││
│                                          └─────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────────┤
│ 🟢 Scanner ready │ Last: The Great Gatsby → SMITH, JANE │ 12ms         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- Split-screen: Patron context always visible
- Mode toggle without page navigation
- Running session log
- Audio feedback on scan (configurable)
- Keyboard-only operation possible

## 4.2 Patron Profile

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ← Back to Search          Patron: SMITH, JANE            [Edit] [More ▾]│
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─ Overview ────────────────────────────────────────────────────────────┐
│ │  ┌──────┐                                                             │
│ │  │ 👤   │  JANE SMITH                              🟢 Good Standing  │
│ │  │      │  jane.smith@email.com │ (555) 123-4567                      │
│ │  └──────┘  Card: 29999000123456 │ Expires: Jun 15, 2027               │
│ │            Home: Main Branch │ Type: Adult │ Since: 2019              │
│ └───────────────────────────────────────────────────────────────────────┘
│                                                                         │
│ ┌─ Quick Stats ─────────────────────────────────────────────────────────┐
│ │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐│
│ │  │ 📚 5      │ │ 📋 2      │ │ 💳 $0.00  │ │ ⚠️ 0      │ │ 📅 147   ││
│ │  │ Checked   │ │ Holds     │ │ Balance   │ │ Blocks    │ │ Lifetime ││
│ │  │ Out       │ │ (2 ready) │ │ Owed      │ │           │ │ Checkouts││
│ │  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └──────────┘│
│ └───────────────────────────────────────────────────────────────────────┘
│                                                                         │
│ ┌─ Tabs ────────────────────────────────────────────────────────────────┐
│ │ [Checkouts (5)] [Holds (2)] [Fines ($0)] [History] [Messages] [Notes] │
│ ├───────────────────────────────────────────────────────────────────────┤
│ │                                                                       │
│ │  ☐ │ Barcode     │ Title              │ Due Date  │ Renewals │ [⋮]   │
│ │  ──┼─────────────┼────────────────────┼───────────┼──────────┼─────  │
│ │  ☐ │ 30035001234 │ The Great Gatsby   │ Feb 8     │ 2 left   │ [⋮]   │
│ │  ☐ │ 30035001235 │ 1984               │ Feb 8     │ 2 left   │ [⋮]   │
│ │  ☐ │ 30035001236 │ Brave New World    │ Feb 1 ⚠️  │ 0 left   │ [⋮]   │
│ │                                                                       │
│ │  [Select All]  [Renew Selected]  [Print List]                        │
│ └───────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────┘
```

## 4.3 Item/Title Record

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ← Back to Search                                    [MARC] [Edit] [⋮]   │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─ Title ───────────────────────────────────────────────────────────────┐
│ │  ┌────────┐                                                           │
│ │  │  📕    │  THE GREAT GATSBY                                        │
│ │  │ [img]  │  F. Scott Fitzgerald                                     │
│ │  │        │  Scribner, 1925 │ 180 pages │ Fiction                    │
│ │  └────────┘                                                           │
│ │                                                                       │
│ │  ISBN: 978-0-7432-7356-5 │ OCLC: 1234567 │ TCN: 00001234             │
│ │                                                                       │
│ │  Subjects: American fiction │ 1920s │ Jazz Age │ Long Island         │
│ └───────────────────────────────────────────────────────────────────────┘
│                                                                         │
│ ┌─ Availability ────────────────────────────────────────────────────────┐
│ │  Total: 8 copies │ 🟢 3 Available │ 🟡 4 Out │ 🔵 1 On Hold          │
│ │                                                                       │
│ │  Location        │ Call #      │ Barcode     │ Status    │ Due      │
│ │  ────────────────┼─────────────┼─────────────┼───────────┼────────  │
│ │  Main - Fiction  │ FIC FIT     │ 30035001234 │ 🟢 Avail  │ —        │
│ │  Main - Fiction  │ FIC FIT     │ 30035001235 │ 🟡 Out    │ Feb 8    │
│ │  North Branch    │ FIC FIT     │ 30035001300 │ 🔵 Hold   │ —        │
│ │  [+ 5 more...]                                                       │
│ └───────────────────────────────────────────────────────────────────────┘
│                                                                         │
│ ┌─ Actions ─────────────────────────────────────────────────────────────┐
│ │  [Place Hold] [Add to List] [Print Spine Labels] [View MARC]         │
│ └───────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────┘
```

## 4.4 OPAC Search Results

```
┌─────────────────────────────────────────────────────────────────────────┐
│ StacksOS                    [🔍 gatsby                    ] [👤 Login]  │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─ Filters ────────────┐ ┌─ Results ────────────────────────────────────┐
│ │                      │ │                                              │
│ │  Format              │ │  Showing 1-20 of 47 results for "gatsby"    │
│ │  ☑ Books (32)        │ │  Sort: Relevance ▾                          │
│ │  ☐ eBooks (8)        │ │                                              │
│ │  ☐ Audiobooks (5)    │ │  ┌────────────────────────────────────────┐  │
│ │  ☐ DVDs (2)          │ │  │ 📕 THE GREAT GATSBY                   │  │
│ │                      │ │  │    F. Scott Fitzgerald │ 1925          │  │
│ │  Availability        │ │  │    🟢 Available at Main Branch         │  │
│ │  ☑ Available Now (12)│ │  │    ⭐⭐⭐⭐☆ (42 reviews)               │  │
│ │  ☐ All Items         │ │  │    [Place Hold] [More Info]            │  │
│ │                      │ │  └────────────────────────────────────────┘  │
│ │  Location            │ │                                              │
│ │  ☑ All Locations     │ │  ┌────────────────────────────────────────┐  │
│ │  ☐ Main Branch       │ │  │ 🎧 THE GREAT GATSBY (Audiobook)       │  │
│ │  ☐ North Branch      │ │  │    Narrated by Jake Gyllenhaal         │  │
│ │  ☐ South Branch      │ │  │    🟡 All copies checked out           │  │
│ │                      │ │  │    [Place Hold] [More Info]            │  │
│ │  Publication Year    │ │  └────────────────────────────────────────┘  │
│ │  [2020] ━━━━● [2025] │ │                                              │
│ │                      │ │  [Load More...]                              │
│ └──────────────────────┘ └──────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────┘
```

---

# Part 5: AI-First UX Plan

## 5.1 AI Features (Embedded & Auditable)

### Feature 1: Cataloging Copilot
**What it does:** Suggests MARC fields, subject headings, and classification when importing/creating records  
**Where it appears:** MARC Editor sidebar panel, "✨ AI Suggestions" tab  
**Data needed:** Existing MARC record, title, author, publisher, ISBN  
**Review/Approval:** Staff must click "Accept" for each suggestion; bulk accept available  
**Auditability:** Logs: timestamp, suggestion_type, original_value, suggested_value, accepted (bool), user_id

```
┌─ AI Suggestions ──────────────────┐
│ ✨ 3 suggestions for this record  │
│                                   │
│ 650 Subject Heading               │
│ Current: (empty)                  │
│ Suggested: American fiction       │
│ [Accept] [Reject] [Edit]          │
│                                   │
│ 082 Dewey Classification          │
│ Current: (empty)                  │
│ Suggested: 813.52                 │
│ [Accept] [Reject] [Edit]          │
└───────────────────────────────────┘
```

### Feature 2: Policy Explainer
**What it does:** When a circulation action is blocked, explains exactly why and cites policy  
**Where it appears:** Inline error message with "Why?" link  
**Data needed:** Patron type, item type, circulation rules, block reason  
**Review/Approval:** Informational only, no approval needed  
**Auditability:** Logs: query timestamp, patron_id (hashed), block_code, policy_cited

```
┌─ Checkout Blocked ─────────────────────────────────────────┐
│ ⚠️ This patron has reached maximum checkouts              │
│                                                            │
│ [Why?] → Policy: Adult patrons may have 25 items maximum. │
│          This patron has 25 items checked out.            │
│          See: Circulation Policy §3.2.1                   │
│                                                            │
│ [Override (requires supervisor)] [Cancel]                  │
└────────────────────────────────────────────────────────────┘
```

### Feature 3: Smart Hold Prediction
**What it does:** Predicts when a hold will be filled based on circulation patterns  
**Where it appears:** Hold placement confirmation, patron hold list  
**Data needed:** Item circulation history, hold queue length, renewal patterns  
**Review/Approval:** Display only, no action required  
**Auditability:** Logs: prediction_timestamp, hold_id, predicted_date, actual_date (updated later)

```
┌─ Place Hold ───────────────────────────────────────────────┐
│ The Great Gatsby                                           │
│                                                            │
│ Current queue: 3 patrons ahead of you                      │
│ 📊 Estimated availability: February 15-22, 2026            │
│    Based on: 4 copies, avg checkout 14 days                │
│                                                            │
│ 💡 A copy at North Branch may be available sooner.         │
│    [Place hold at North Branch instead]                    │
│                                                            │
│ [Confirm Hold] [Cancel]                                    │
└────────────────────────────────────────────────────────────┘
```

### Feature 4: Natural Language Reports
**What it does:** Generate reports from plain English queries  
**Where it appears:** Reports module search bar  
**Data needed:** Report schema, historical report data  
**Review/Approval:** Preview before export; staff can modify generated SQL  
**Auditability:** Logs: query_text, generated_sql, results_count, user_id, export_format

```
┌─ Reports ──────────────────────────────────────────────────┐
│ Ask a question...                                          │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ "Show me overdue items by patron type for January"    │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ 📊 Generated Report Preview:                               │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Patron Type │ Overdue Items │ Total Value │            │ │
│ │ ────────────┼───────────────┼─────────────┤            │ │
│ │ Adult       │ 234           │ $4,680      │            │ │
│ │ Teen        │ 89            │ $1,335      │            │ │
│ │ Child       │ 156           │ $1,560      │            │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ [View SQL] [Export CSV] [Schedule] [Save as Template]     │
└────────────────────────────────────────────────────────────┘
```

### Feature 5: OPAC Semantic Search
**What it does:** Understands natural language queries beyond keyword matching  
**Where it appears:** OPAC search bar (opt-in toggle)  
**Data needed:** MARC records, subject headings, descriptions  
**Review/Approval:** Results are standard catalog records  
**Auditability:** Logs: search_query, semantic_interpretation, result_ids, click_through

```
Search: "books about overcoming anxiety for teens"

Results (Semantic):
1. "My Anxious Mind: A Teen's Guide to Managing Anxiety"
2. "The Anxiety Survival Guide for Teens"
3. "Freaking Out: Real-life Stories About Anxiety"
→ AI understood: topic=anxiety, audience=teens, format=self-help
```

---

# Part 6: Feature Gap Matrix & Roadmap

## 6.1 Feature Parity Matrix

| Feature | Polaris | Alma | Sierra | Koha | FOLIO | StacksOS | Gap |
|---------|---------|------|--------|------|-------|----------|-----|
| **Circulation** |
| Checkout/Checkin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Audio feedback | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | P1 |
| Offline mode | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | — |
| Self-checkout | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | P1 |
| RFID support | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | P2 |
| **Patrons** |
| Registration | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Photo ID cards | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | P2 |
| Duplicate detection | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | P1 |
| **Cataloging** |
| MARC editor | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Z39.50 import | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Authority control | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | P1 |
| AI cataloging assist | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | P2 ⭐ |
| **Acquisitions** |
| Purchase orders | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | P1 |
| EDI integration | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | P2 |
| Invoice processing | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | P1 |
| **Serials** |
| Subscription mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | P1 |
| Prediction patterns | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | P2 |
| **Reporting** |
| Canned reports | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | P0 |
| Custom SQL | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | P1 |
| Natural language | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | P2 ⭐ |
| **OPAC** |
| Faceted search | ✅ | ✅ | ✅ | ✅ | N/A | ⚠️ | P0 |
| Patron account | ✅ | ✅ | ✅ | ✅ | N/A | ✅ | — |
| Reviews/ratings | ✅ | ❌ | ❌ | ✅ | N/A | ❌ | P1 |
| Reading lists | ✅ | ✅ | ❌ | ✅ | N/A | ⚠️ | P1 |

Legend: ✅ Complete | ⚠️ Partial | ❌ Missing | ⭐ Differentiator

## 6.2 Prioritized Roadmap

### P0: Pilot-Ready (No Broken Workflows)
*Must complete before any production deployment*

| Feature | Acceptance Criteria |
|---------|---------------------|
| **Circulation desk completion** | Unified checkout/checkin/renew in one view; sub-2s per transaction |
| **OPAC faceted search** | Filter by format, availability, location, date range |
| **Canned reports** | Circulation stats, overdue, holds queue, collection stats |
| **Patron duplicate detection** | Warning on registration if email/name/DOB match exists |
| **Error handling** | All API errors show user-friendly messages with recovery actions |
| **Print receipts** | Checkout slip, hold slip, fine receipt templates working |
| **Keyboard navigation** | All primary workflows completable without mouse |

### P1: Competitive Parity
*Match core features of major competitors*

| Feature | Acceptance Criteria |
|---------|---------------------|
| **Audio feedback** | Configurable beeps for success/error/warning on scan |
| **Self-checkout module** | Patron-facing kiosk mode with barcode and PIN login |
| **Authority control** | Link headings to LC/VIAF authorities; validation on save |
| **Custom SQL reports** | Safe read-only query builder with export to CSV/PDF |
| **OPAC reviews/ratings** | Patron-submitted reviews with moderation queue |
| **Acquisitions completion** | Full PO → Invoice → Receive workflow |
| **Serials check-in** | Prediction patterns, claiming, binding |
| **Mobile app** | React Native app for staff circulation (iOS/Android) |

### P2: World-Class Differentiation
*Features that make StacksOS the clear leader*

| Feature | Acceptance Criteria |
|---------|---------------------|
| **AI Cataloging Copilot** | 80%+ acceptance rate on suggestions; audit log complete |
| **Natural language reports** | Plain English → SQL with preview and export |
| **Smart hold prediction** | Predicted dates within 3-day accuracy 70% of time |
| **Policy explainer** | Every block/error includes policy citation |
| **Semantic OPAC search** | "Books for anxious teens" returns relevant results |
| **RFID integration** | Support for 3M, Bibliotheca, EnvisionWare readers |
| **Photo ID cards** | Generate patron cards with barcode and photo |
| **Real-time analytics dashboard** | Live circulation, holds, collection stats |
| **Multi-tenant K-12 mode** | Age-appropriate interfaces, reading level filters |

---

# Appendix A: Accessibility Checklist (WCAG 2.2 AA)

| Requirement | Status | Notes |
|-------------|--------|-------|
| Color contrast 4.5:1 (text) | ⚠️ | Audit needed on dark theme |
| Color contrast 3:1 (UI) | ⚠️ | Audit needed |
| Keyboard navigable | ✅ | Tab order follows visual |
| Focus visible | ✅ | Custom focus ring styles |
| Skip links | ❌ | Need to add |
| ARIA labels | ⚠️ | Inconsistent on icons |
| Screen reader tested | ❌ | Need to test with NVDA/VoiceOver |
| Reduced motion | ✅ | prefers-reduced-motion respected |
| Text resizable 200% | ⚠️ | Some layouts break |

---

# Appendix B: Technical Dependencies

| Dependency | Current | Recommended | Notes |
|------------|---------|-------------|-------|
| Next.js | 16.1.2 | 16.x | Stay current |
| React | 19.x | 19.x | Latest |
| TanStack Table | 8.x | 8.x | For data tables |
| Radix UI | Latest | Latest | Accessible primitives |
| Tailwind CSS | 4.x | 4.x | Latest with @theme |
| Sonner | Latest | Latest | Toast notifications |
| Lucide Icons | Latest | Latest | Consistent iconography |

---

*Document generated: January 2026*  
*Next review: After P0 completion*
