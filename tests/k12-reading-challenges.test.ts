import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildStatsCsvRows,
  CSV_STATS_HEADER,
  escapeCsvValue,
  groupOverdueByStudent,
  type OverdueRow,
} from "@/lib/k12/export-helpers";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const queryMock = vi.fn();
const querySingleMock = vi.fn();

vi.mock("@/lib/db/evergreen", () => ({
  query: (...args: any[]) => queryMock(...args),
  querySingle: (...args: any[]) => querySingleMock(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks are set up
import {
  createReadingChallenge,
  getChallengeLeaderboard,
  getChallengeStats,
  listClassChallenges,
  updateChallengeProgress,
} from "@/lib/db/k12-reading-challenges";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("k12-reading-challenges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createReadingChallenge", () => {
    it("inserts a challenge and returns mapped result", async () => {
      querySingleMock.mockResolvedValueOnce({
        id: 1,
        class_id: 10,
        title: "March Marathon",
        description: "Read 10 books",
        goal_type: "books",
        goal_value: 10,
        start_date: "2026-03-01",
        end_date: "2026-03-31",
        created_by: 5,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T00:00:00Z",
      });

      const result = await createReadingChallenge({
        classId: 10,
        title: "March Marathon",
        description: "Read 10 books",
        goalType: "books",
        goalValue: 10,
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        createdBy: 5,
      });

      expect(result).toEqual({
        id: 1,
        classId: 10,
        title: "March Marathon",
        description: "Read 10 books",
        goalType: "books",
        goalValue: 10,
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        createdBy: 5,
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      });

      expect(querySingleMock).toHaveBeenCalledTimes(1);
    });

    it("throws when insert returns null", async () => {
      querySingleMock.mockResolvedValueOnce(null);

      await expect(
        createReadingChallenge({
          classId: 10,
          title: "Test",
          startDate: "2026-03-01",
          endDate: "2026-03-31",
        })
      ).rejects.toThrow("Failed to create reading challenge");
    });
  });

  describe("listClassChallenges", () => {
    it("returns mapped challenges for a class", async () => {
      queryMock.mockResolvedValueOnce([
        {
          id: 1,
          class_id: 10,
          title: "Challenge A",
          description: null,
          goal_type: "books",
          goal_value: 5,
          start_date: "2026-03-01",
          end_date: "2026-04-01",
          created_by: null,
          created_at: "2026-03-01T00:00:00Z",
          updated_at: "2026-03-01T00:00:00Z",
        },
      ]);

      const result = await listClassChallenges(10);
      expect(result).toHaveLength(1);
      expect(result[0]!.title).toBe("Challenge A");
      expect(result[0]!.classId).toBe(10);
    });
  });

  describe("getChallengeLeaderboard", () => {
    it("returns entries sorted by rank", async () => {
      queryMock.mockResolvedValueOnce([
        {
          student_id: 1,
          student_name: "Alice Smith",
          progress_value: 8,
          completed: false,
          rank: 1,
        },
        { student_id: 2, student_name: "Bob Jones", progress_value: 5, completed: false, rank: 2 },
        {
          student_id: 3,
          student_name: "Charlie Brown",
          progress_value: 3,
          completed: false,
          rank: 3,
        },
      ]);

      const result = await getChallengeLeaderboard(1);
      expect(result).toHaveLength(3);
      expect(result[0]!.studentName).toBe("Alice Smith");
      expect(result[0]!.rank).toBe(1);
      expect(result[1]!.rank).toBe(2);
      expect(result[2]!.rank).toBe(3);
      expect(result[0]!.progressValue).toBeGreaterThan(result[1]!.progressValue);
    });
  });

  describe("getChallengeStats", () => {
    it("returns aggregate statistics", async () => {
      querySingleMock.mockResolvedValueOnce({
        total_students: 20,
        completed_count: 5,
        avg_progress: 6.5,
        goal_value: 10,
      });

      const result = await getChallengeStats(1);
      expect(result).toEqual({
        totalStudents: 20,
        completedCount: 5,
        avgProgress: 6.5,
        goalValue: 10,
      });
    });

    it("returns zeros when no data", async () => {
      querySingleMock.mockResolvedValueOnce(null);

      const result = await getChallengeStats(999);
      expect(result).toEqual({
        totalStudents: 0,
        completedCount: 0,
        avgProgress: 0,
        goalValue: 0,
      });
    });
  });

  describe("updateChallengeProgress", () => {
    it("upserts progress for a student", async () => {
      // Single atomic CTE query returns the upserted row
      querySingleMock.mockResolvedValueOnce({
        id: 1,
        challenge_id: 1,
        student_id: 5,
        progress_value: 3,
        completed_at: null,
        updated_at: "2026-03-15T00:00:00Z",
      });

      const result = await updateChallengeProgress(1, 5, 3);
      expect(result.progressValue).toBe(3);
      expect(result.completedAt).toBeNull();
      expect(querySingleMock).toHaveBeenCalledTimes(1);
    });

    it("throws when challenge not found or CTE returns null", async () => {
      querySingleMock.mockResolvedValueOnce(null);

      await expect(updateChallengeProgress(999, 1, 1)).rejects.toThrow(
        "Challenge not found or failed to update progress"
      );
    });

    it("returns completed_at when progress reaches goal", async () => {
      querySingleMock.mockResolvedValueOnce({
        id: 2,
        challenge_id: 1,
        student_id: 5,
        progress_value: 10,
        completed_at: "2026-03-20T12:00:00Z",
        updated_at: "2026-03-20T12:00:00Z",
      });

      const result = await updateChallengeProgress(1, 5, 2);
      expect(result.progressValue).toBe(10);
      expect(result.completedAt).toBe("2026-03-20T12:00:00Z");
    });
  });
});

// ---------------------------------------------------------------------------
// Export format test (CSV structure) — uses production helpers
// ---------------------------------------------------------------------------

describe("export CSV format", () => {
  it("produces valid CSV with headers using production buildStatsCsvRows", () => {
    const stats = {
      totalCheckouts: 15,
      booksPerStudent: 3,
      avgCheckoutDurationDays: 7.5,
      overdueCount: 2,
      mostActiveReader: 'Jane "The Reader" Doe',
    };

    const rows = buildStatsCsvRows(stats);
    const csv = rows.join("\n");

    expect(rows[0]).toBe(CSV_STATS_HEADER);
    expect(csv).toContain("Section,Metric,Value");
    expect(csv).toContain("Stats,Total Checkouts,15");
    expect(csv).toContain("Stats,Books Per Student,3");
    expect(csv).toContain("Stats,Avg Checkout Duration (days),7.5");
    expect(csv).toContain("Stats,Overdue Count,2");
    // Verify double-quote escaping for CSV
    expect(csv).toContain('""The Reader""');
  });

  it("handles null mostActiveReader", () => {
    const stats = {
      totalCheckouts: 0,
      booksPerStudent: 0,
      avgCheckoutDurationDays: 0,
      overdueCount: 0,
      mostActiveReader: null,
    };

    const rows = buildStatsCsvRows(stats);
    const csv = rows.join("\n");
    expect(csv).toContain("N/A");
  });

  it("escapeCsvValue handles embedded quotes", () => {
    expect(escapeCsvValue('He said "hello"')).toBe('"He said ""hello"""');
  });

  it("escapeCsvValue prefixes values starting with =", () => {
    expect(escapeCsvValue('=CMD("calc")')).toBe(`"'=CMD(""calc"")"`);
  });

  it("escapeCsvValue prefixes values starting with +", () => {
    expect(escapeCsvValue("+1234")).toBe(`"'+1234"`);
  });

  it("escapeCsvValue prefixes values starting with -", () => {
    expect(escapeCsvValue("-1+1")).toBe(`"'-1+1"`);
  });

  it("escapeCsvValue prefixes values starting with @", () => {
    expect(escapeCsvValue("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
  });

  it("escapeCsvValue does NOT prefix normal values", () => {
    expect(escapeCsvValue("Hello World")).toBe(`"Hello World"`);
    expect(escapeCsvValue("42")).toBe(`"42"`);
  });
});

// ---------------------------------------------------------------------------
// Overdue grouping test — uses production groupOverdueByStudent
// ---------------------------------------------------------------------------

describe("overdue grouping", () => {
  it("groups overdue items by student using production helper", () => {
    const rows: OverdueRow[] = [
      {
        checkout_id: 1,
        student_id: 10,
        student_name: "Alice Smith",
        copy_barcode: "BC001",
        title: "Book A",
        checkout_ts: "2026-02-01",
        due_ts: "2026-02-15",
        days_overdue: 11,
      },
      {
        checkout_id: 2,
        student_id: 10,
        student_name: "Alice Smith",
        copy_barcode: "BC002",
        title: "Book B",
        checkout_ts: "2026-02-01",
        due_ts: "2026-02-15",
        days_overdue: 11,
      },
      {
        checkout_id: 3,
        student_id: 20,
        student_name: "Bob Jones",
        copy_barcode: "BC003",
        title: "Book C",
        checkout_ts: "2026-02-05",
        due_ts: "2026-02-20",
        days_overdue: 6,
      },
    ];

    const groups = groupOverdueByStudent(rows);

    expect(groups).toHaveLength(2);
    expect(groups[0]!.studentId).toBe(10);
    expect(groups[0]!.totalOverdue).toBe(2);
    expect(groups[0]!.items).toHaveLength(2);
    expect(groups[0]!.items[0]!.checkoutId).toBe(1);
    expect(groups[1]!.studentId).toBe(20);
    expect(groups[1]!.totalOverdue).toBe(1);
  });

  it("returns empty array for empty input", () => {
    const groups = groupOverdueByStudent([]);
    expect(groups).toHaveLength(0);
  });

  it("maps OverdueRow fields to camelCase correctly", () => {
    const rows: OverdueRow[] = [
      {
        checkout_id: 99,
        student_id: 5,
        student_name: "Test Student",
        copy_barcode: "BC999",
        title: null,
        checkout_ts: "2026-01-01",
        due_ts: "2026-01-10",
        days_overdue: 20,
      },
    ];

    const groups = groupOverdueByStudent(rows);
    expect(groups).toHaveLength(1);
    const item = groups[0]!.items[0]!;
    expect(item.checkoutId).toBe(99);
    expect(item.studentId).toBe(5);
    expect(item.studentName).toBe("Test Student");
    expect(item.copyBarcode).toBe("BC999");
    expect(item.title).toBeNull();
    expect(item.daysOverdue).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Overdue notice schema tests
// ---------------------------------------------------------------------------

describe("overdue notice schema", () => {
  const bulkNoticeSchema = z.object({
    classId: z.number().int().positive(),
    studentIds: z.array(z.number().int().positive()).min(1).max(200),
  });

  it("accepts valid input", () => {
    const result = bulkNoticeSchema.safeParse({ classId: 1, studentIds: [10, 20] });
    expect(result.success).toBe(true);
  });

  it("rejects empty studentIds", () => {
    const result = bulkNoticeSchema.safeParse({ classId: 1, studentIds: [] });
    expect(result.success).toBe(false);
  });

  it("rejects negative classId", () => {
    const result = bulkNoticeSchema.safeParse({ classId: -1, studentIds: [1] });
    expect(result.success).toBe(false);
  });

  it("rejects more than 200 studentIds", () => {
    const ids = Array.from({ length: 201 }, (_, i) => i + 1);
    const result = bulkNoticeSchema.safeParse({ classId: 1, studentIds: ids });
    expect(result.success).toBe(false);
  });
});
