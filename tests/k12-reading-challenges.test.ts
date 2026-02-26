import { beforeEach, describe, expect, it, vi } from "vitest";

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
      // First call: get goal_value
      querySingleMock.mockResolvedValueOnce({ goal_value: 10 });
      // Second call: upsert progress
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
      expect(querySingleMock).toHaveBeenCalledTimes(2);
    });

    it("throws when challenge not found", async () => {
      querySingleMock.mockResolvedValueOnce(null);

      await expect(updateChallengeProgress(999, 1, 1)).rejects.toThrow("Challenge not found");
    });

    it("throws when progress upsert returns null", async () => {
      querySingleMock.mockResolvedValueOnce({ goal_value: 10 });
      querySingleMock.mockResolvedValueOnce(null);

      await expect(updateChallengeProgress(1, 1, 1)).rejects.toThrow(
        "Failed to update challenge progress"
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Export format test (CSV structure)
// ---------------------------------------------------------------------------

describe("export CSV format", () => {
  it("produces valid CSV with headers", () => {
    // Simulate CSV generation similar to the export route
    const stats = {
      totalCheckouts: 15,
      booksPerStudent: 3,
      avgCheckoutDurationDays: 7.5,
      overdueCount: 2,
      mostActiveReader: 'Jane "The Reader" Doe',
    };

    const csvLines: string[] = [];
    csvLines.push("Section,Metric,Value");
    csvLines.push(`Stats,Total Checkouts,${stats.totalCheckouts}`);
    csvLines.push(`Stats,Books Per Student,${stats.booksPerStudent}`);
    csvLines.push(`Stats,Avg Checkout Duration (days),${stats.avgCheckoutDurationDays}`);
    csvLines.push(`Stats,Overdue Count,${stats.overdueCount}`);
    csvLines.push(
      `Stats,Most Active Reader,"${(stats.mostActiveReader || "N/A").replace(/"/g, '""')}"`
    );

    const csv = csvLines.join("\n");
    expect(csv).toContain("Section,Metric,Value");
    expect(csv).toContain("Stats,Total Checkouts,15");
    // Verify double-quote escaping for CSV
    expect(csv).toContain('""The Reader""');
  });
});

// ---------------------------------------------------------------------------
// Overdue grouping test
// ---------------------------------------------------------------------------

describe("overdue grouping", () => {
  it("groups overdue items by student", () => {
    type OverdueRow = {
      checkout_id: number;
      student_id: number;
      student_name: string;
      copy_barcode: string;
      title: string | null;
      checkout_ts: string;
      due_ts: string;
      days_overdue: number;
    };

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

    // Replicate grouping logic from overdue-dashboard route
    type OverdueGroup = {
      studentId: number;
      studentName: string;
      items: OverdueRow[];
      totalOverdue: number;
    };

    const groupMap = new Map<number, OverdueGroup>();
    for (const row of rows) {
      const existing = groupMap.get(row.student_id);
      if (existing) {
        existing.items.push(row);
        existing.totalOverdue = existing.items.length;
      } else {
        groupMap.set(row.student_id, {
          studentId: row.student_id,
          studentName: row.student_name,
          items: [row],
          totalOverdue: 1,
        });
      }
    }

    const groups = Array.from(groupMap.values());

    expect(groups).toHaveLength(2);
    expect(groups[0]!.studentId).toBe(10);
    expect(groups[0]!.totalOverdue).toBe(2);
    expect(groups[1]!.studentId).toBe(20);
    expect(groups[1]!.totalOverdue).toBe(1);
  });
});
