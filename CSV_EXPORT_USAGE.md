# CSV Export Utilities - Usage Guide

## Overview

The CSV export functionality provides a reusable pattern for exporting data to CSV files across the StacksOS application. The utilities are located in `/home/jake/projects/stacksos/src/lib/csv.ts`.

## Features

- **Proper CSV Escaping**: Handles special characters (commas, quotes, newlines)
- **UTF-8 BOM**: Ensures Excel compatibility
- **Custom Headers**: Rename columns with user-friendly labels
- **Column Selection**: Export only specific columns in a defined order
- **Loading States**: Built-in hook for managing export state
- **Large Dataset Support**: Prevents UI blocking for datasets > 1000 rows
- **Timestamped Filenames**: Automatic filename generation with timestamps

## Quick Start

### Basic Export

```typescript
import { exportToCSV } from "@/lib/csv";

const data = [
  { id: 1, name: "John Doe", email: "john@example.com" },
  { id: 2, name: "Jane Smith", email: "jane@example.com" },
];

// Export with default settings
exportToCSV("users.csv", data);
```

### Export with Custom Headers

```typescript
import { exportToCSV } from "@/lib/csv";

const data = [
  { user_id: 1, full_name: "John Doe", email_address: "john@example.com" },
  { user_id: 2, full_name: "Jane Smith", email_address: "jane@example.com" },
];

exportToCSV("users.csv", data, {
  headers: {
    user_id: "ID",
    full_name: "Full Name",
    email_address: "Email Address",
  },
});
```

### Export Specific Columns

```typescript
import { exportToCSV } from "@/lib/csv";

const data = [
  { id: 1, name: "John", email: "john@example.com", password: "secret" },
  { id: 2, name: "Jane", email: "jane@example.com", password: "secret" },
];

// Only export id, name, and email (exclude password)
exportToCSV("users.csv", data, {
  columns: ["id", "name", "email"],
  headers: {
    id: "User ID",
    name: "Full Name",
    email: "Email Address",
  },
});
```

### Using the Export Hook (with Loading State)

```typescript
import { useCSVExport } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";

function MyComponent() {
  const { exportData, isExporting, error } = useCSVExport();
  const [data, setData] = useState([]);

  const handleExport = async () => {
    try {
      await exportData("report.csv", data, {
        headers: {
          created_at: "Created Date",
          updated_at: "Updated Date",
        },
      });
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  return (
    <Button onClick={handleExport} disabled={isExporting}>
      {isExporting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Exporting...
        </>
      ) : (
        <>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </>
      )}
    </Button>
  );
}
```

### Timestamped Filenames

```typescript
import { exportToCSV, generateExportFilename } from "@/lib/csv";

const data = [...];

// Generates: "users-2024-01-25-143022.csv"
const filename = generateExportFilename("users");
exportToCSV(filename, data);
```

## Advanced Usage

### Separate Conversion and Download

```typescript
import { convertToCSV, downloadCSV } from "@/lib/csv";

const data = [...];

// Convert to CSV string
const csvContent = convertToCSV(data, {
  headers: { id: "ID", name: "Name" },
});

// Do something with the CSV string (e.g., send to API)
await sendToBackend(csvContent);

// Or download it
downloadCSV("export.csv", csvContent);
```

### Export Without Headers

```typescript
import { exportToCSV } from "@/lib/csv";

const data = [...];

exportToCSV("data.csv", data, {
  includeHeaders: false,
});
```

## Implementation Example: Reports Page

The reports page demonstrates all CSV export patterns:

### 1. Individual Section Exports

Each dashboard section has its own export button:

```typescript
// Export circulation statistics only
const handleDownloadCirculationStats = useCallback(async () => {
  if (!stats) return;

  const data = [{
    date: new Date().toISOString().split("T")[0],
    org_id: orgId,
    checkouts_today: stats.checkouts_today ?? 0,
    checkins_today: stats.checkins_today ?? 0,
    // ... other fields
  }];

  await exportData(
    generateExportFilename(`stacksos-circulation-org${orgId}`),
    data,
    {
      headers: {
        date: "Date",
        org_id: "Organization ID",
        checkouts_today: "Checkouts Today",
        // ... other headers
      },
    }
  );
}, [stats, orgId, exportData]);
```

### 2. Full Report Export

Combines all dashboard data into a single CSV:

```typescript
const handleDownloadFullReport = useCallback(async () => {
  if (!stats || !holds) return;

  const data = [{
    // Combine circulation and holds data
    ...circulationData,
    ...holdsData,
  }];

  await exportData(generateExportFilename("stacksos-full-report"), data);
}, [stats, holds, exportData]);
```

### 3. Loading States in UI

```typescript
<Button
  variant="outline"
  onClick={handleDownloadCirculationStats}
  disabled={isExporting}
>
  Circulation CSV
  {isExporting ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <Download className="h-4 w-4" />
  )}
</Button>
```

## API Reference

### `convertToCSV<T>(data, options)`

Converts an array of objects to CSV format.

**Parameters:**
- `data`: Array of objects to convert
- `options` (optional):
  - `headers`: Record<string, string> - Custom column labels
  - `columns`: string[] - Specific columns to include (in order)
  - `includeHeaders`: boolean - Include header row (default: true)

**Returns:** CSV string

### `downloadCSV(filename, csvContent)`

Triggers browser download of a CSV file.

**Parameters:**
- `filename`: Name of the file (auto-appends .csv if missing)
- `csvContent`: CSV content as string

### `exportToCSV<T>(filename, data, options)`

Converts data to CSV and triggers download in one step.

**Parameters:**
- `filename`: Name of the file
- `data`: Array of objects to export
- `options`: Same as `convertToCSV` options

### `generateExportFilename(base, extension)`

Generates a timestamped filename.

**Parameters:**
- `base`: Base filename (without extension)
- `extension`: File extension (default: "csv")

**Returns:** Filename with timestamp (e.g., "report-2024-01-25-143022.csv")

### `useCSVExport()`

React hook for managing CSV export state.

**Returns:**
- `exportData`: Function to export data (same signature as `exportToCSV`)
- `isExporting`: boolean - Whether export is in progress
- `error`: Error | null - Export error if any

## Best Practices

1. **Use the hook for user-initiated exports**: Provides loading states and error handling
2. **Generate timestamped filenames**: Prevents overwriting existing files
3. **Provide custom headers**: Make column names user-friendly
4. **Select specific columns**: Don't export sensitive data or internal IDs
5. **Show loading states**: Especially for large datasets
6. **Handle errors gracefully**: Always wrap exports in try-catch when using the hook

## Browser Compatibility

The CSV export utilities work in all modern browsers:
- Chrome/Edge 88+
- Firefox 85+
- Safari 14+

The utilities use:
- Blob API for file creation
- URL.createObjectURL for downloads
- UTF-8 BOM for Excel compatibility
