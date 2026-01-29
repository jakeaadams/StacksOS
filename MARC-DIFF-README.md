# MARC Diff Component

## Overview

A comprehensive MARC XML diff viewer component created at `/home/jake/projects/stacksos/src/components/shared/marc-diff.tsx`.

## Features

✅ **Field-by-field comparison** - Parses MARC XML and compares each field individually
✅ **Subfield-level diffs** - Shows exact changes within MARC subfields
✅ **Color-coded changes**:
  - 🟢 Green: Added fields/subfields
  - 🔴 Red: Removed fields/subfields
  - 🟡 Yellow/Amber: Modified fields/subfields
  - ⚪ Gray: Unchanged fields

✅ **Dialog-based UI** - Clean modal interface with Dialog component
✅ **Statistics summary** - Shows count of added, removed, modified, and unchanged fields
✅ **Error handling** - Gracefully handles invalid MARC XML with error messages
✅ **Accessible** - Keyboard navigable, ARIA compliant
✅ **Field labels** - Human-readable descriptions for common MARC tags (245, 100, 650, etc.)
✅ **Indicators display** - Shows ind1/ind2 for data fields

## Props

```typescript
interface MarcDiffProps {
  oldMarc: string;        // Original MARC XML
  newMarc: string;        // Modified MARC XML
  open: boolean;          // Dialog open state
  onOpenChange: (open: boolean) => void;  // Dialog state handler
  onConfirm?: () => void; // Callback when "Save Changes" is clicked
}
```

## Usage

### Basic Example

```tsx
import { MarcDiff } from "@/components/shared";
import { useState } from "react";

function MyComponent() {
  const [showDiff, setShowDiff] = useState(false);

  const handleSave = () => {
    console.log("Saving changes...");
    // Your save logic here
  };

  return (
    <>
      <button onClick={() => setShowDiff(true)}>
        Review Changes
      </button>

      <MarcDiff
        oldMarc={originalMarcXml}
        newMarc={modifiedMarcXml}
        open={showDiff}
        onOpenChange={setShowDiff}
        onConfirm={handleSave}
      />
    </>
  );
}
```

### MARC Editor Integration

```tsx
import { MarcDiff } from "@/components/shared";

function MarcEditor() {
  const [originalMarc, setOriginalMarc] = useState("");
  const [editedMarc, setEditedMarc] = useState("");
  const [showDiff, setShowDiff] = useState(false);

  const handleSaveClick = () => {
    // Show diff before saving
    setShowDiff(true);
  };

  const handleConfirmSave = async () => {
    // Actually save to database
    await saveMarcRecord(editedMarc);
    toast.success("MARC record saved");
  };

  return (
    <>
      {/* Your MARC editor UI */}
      <button onClick={handleSaveClick}>Save</button>

      <MarcDiff
        oldMarc={originalMarc}
        newMarc={editedMarc}
        open={showDiff}
        onOpenChange={setShowDiff}
        onConfirm={handleConfirmSave}
      />
    </>
  );
}
```

## Component Structure

### Main Component: `MarcDiff`
- Parses MARC XML using browser DOMParser
- Computes field-by-field diffs
- Displays changes in scrollable dialog
- Shows statistics badges
- Provides Cancel/Save Changes buttons

### Helper Components

1. **`FieldDiffRow`** - Renders a single MARC field comparison
2. **`SubfieldDisplay`** - Shows subfields for added/removed/unchanged fields
3. **`SubfieldDiff`** - Shows subfield-level changes for modified fields

### Helper Functions

1. **`parseMarcXml()`** - Parses MARC XML into structured format
2. **`diffMarcRecords()`** - Compares two MARC records
3. **`fieldsEqual()`** - Checks field equality
4. **`diffSubfields()`** - Compares subfields within a field

## MARC Field Support

The component recognizes and labels common MARC fields:

- **Control fields**: 001, 003, 005, 008
- **ISBN/ISSN**: 020, 022
- **Classification**: 050 (LC), 082 (Dewey)
- **Main entries**: 100 (Personal), 110 (Corporate)
- **Title**: 245, 246
- **Publication**: 250, 264
- **Physical**: 300
- **Content types**: 336, 337, 338
- **Series**: 490
- **Notes**: 500, 520
- **Subjects**: 600, 650, 651
- **Added entries**: 700
- **Electronic**: 856

Unknown fields display as "Unknown Field" with the tag number.

## Diff Algorithm

1. **Parse both MARC XML strings** into structured records
2. **Group fields by tag** (allows multiple fields with same tag)
3. **Compare field-by-field**:
   - Missing in old = ADDED
   - Missing in new = REMOVED
   - Different content = MODIFIED (with subfield diffs)
   - Same content = UNCHANGED
4. **For modified fields**, compute subfield-level diffs
5. **Sort results** by MARC tag for consistent display

## Styling

Uses Tailwind CSS with color-coded backgrounds:

- **Added**: `bg-green-50 border-green-200 dark:bg-green-950/20`
- **Removed**: `bg-red-50 border-red-200 dark:bg-red-950/20`
- **Modified**: `bg-amber-50 border-amber-200 dark:bg-amber-950/20`
- **Unchanged**: `bg-background border-border`

Badges use consistent color scheme:
- Added: Green
- Removed: Red
- Modified: Amber/Yellow
- Unchanged: Muted gray

## Dependencies

- `@/components/ui/dialog` - Dialog primitives
- `@/components/ui/button` - Button component
- `@/components/ui/scroll-area` - Scrollable content area
- `@/components/ui/badge` - Status badges
- `@/lib/utils` - cn() utility for classnames
- `lucide-react` - Icons (FileText, AlertCircle)
- `react` - Core React hooks

## Export

The component is exported from the shared components index:

```tsx
// Available as named export
import { MarcDiff } from "@/components/shared";

// Or default export from the file
import MarcDiff from "@/components/shared/marc-diff";
```

## File Location

- **Component**: `/home/jake/projects/stacksos/src/components/shared/marc-diff.tsx`
- **Export**: `/home/jake/projects/stacksos/src/components/shared/index.ts`
- **Size**: 607 lines, ~18KB

## Example Output

When viewing changes, the component shows:

```
MARC Record Changes
Review the changes to the MARC record before saving.

[+2 added] [-0 removed] [~3 modified] [5 unchanged]

┌─ 100 Main Entry - Personal Name ─────────────── [modified] ─┐
│ Ind1: 1 | Ind2:                                              │
│ $a Smith, John          [strikethrough, red]                 │
│ $a Smith, John A.       [green]                              │
└──────────────────────────────────────────────────────────────┘

┌─ 245 Title Statement ────────────────────────── [modified] ─┐
│ Ind1: 1 | Ind2: 0                                            │
│ $a Introduction to Library Science     [strikethrough, red]  │
│ $a Introduction to Library and Info... [green]               │
│ $c by John Smith                       [strikethrough, red]  │
│ $c by John A. Smith                    [green]               │
└──────────────────────────────────────────────────────────────┘

┌─ 250 Edition Statement ──────────────────────── [added] ────┐
│ Ind1:   | Ind2:                                              │
│ $a 2nd edition                         [green]               │
└──────────────────────────────────────────────────────────────┘

[Cancel] [Save Changes]
```

## Testing

To test the component, you can use the example file provided or integrate it into your MARC editor workflow. The component handles:

- ✅ Empty MARC records
- ✅ Malformed XML (shows error)
- ✅ Records with no changes
- ✅ Multiple fields with same tag
- ✅ Control fields vs data fields
- ✅ Fields with multiple subfields
- ✅ Dark mode styling

## Future Enhancements

Potential improvements:

- [ ] Side-by-side view option
- [ ] Export diff as text/PDF
- [ ] Ignore specific fields (e.g., timestamps)
- [ ] Highlight specific change types
- [ ] Undo/redo navigation through changes
- [ ] Integration with MARC validation
