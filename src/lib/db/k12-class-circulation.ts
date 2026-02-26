import { query, querySingle } from "@/lib/db/evergreen";
import { logger } from "@/lib/logger";

export interface K12ClassOverview {
  id: number;
  name: string;
  teacherName: string;
  gradeLevel: string | null;
  homeOu: number;
  active: boolean;
  studentCount: number;
  activeCheckoutCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface K12Student {
  id: number;
  classId: number;
  firstName: string;
  lastName: string;
  studentIdentifier: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface K12Checkout {
  id: number;
  classId: number;
  studentId: number | null;
  studentName: string | null;
  copyBarcode: string;
  copyId: number | null;
  title: string | null;
  checkoutTs: string;
  dueTs: string | null;
  returnedTs: string | null;
  notes: string | null;
}

type ClassRow = {
  id: number;
  name: string;
  teacher_name: string;
  grade_level: string | null;
  home_ou: number;
  active: boolean;
  student_count: number;
  active_checkout_count: number;
  created_at: string;
  updated_at: string;
};

type StudentRow = {
  id: number;
  class_id: number;
  first_name: string;
  last_name: string;
  student_identifier: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type CheckoutRow = {
  id: number;
  class_id: number;
  student_id: number | null;
  student_name: string | null;
  copy_barcode: string;
  copy_id: number | null;
  title: string | null;
  checkout_ts: string;
  due_ts: string | null;
  returned_ts: string | null;
  notes: string | null;
};

type CatalogLookupRow = {
  copy_id: number | null;
  title: string | null;
};

function toClass(row: ClassRow): K12ClassOverview {
  return {
    id: row.id,
    name: row.name,
    teacherName: row.teacher_name,
    gradeLevel: row.grade_level,
    homeOu: row.home_ou,
    active: Boolean(row.active),
    studentCount: Number(row.student_count || 0),
    activeCheckoutCount: Number(row.active_checkout_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStudent(row: StudentRow): K12Student {
  return {
    id: row.id,
    classId: row.class_id,
    firstName: row.first_name,
    lastName: row.last_name,
    studentIdentifier: row.student_identifier,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCheckout(row: CheckoutRow): K12Checkout {
  return {
    id: row.id,
    classId: row.class_id,
    studentId: row.student_id,
    studentName: row.student_name,
    copyBarcode: row.copy_barcode,
    copyId: row.copy_id,
    title: row.title,
    checkoutTs: row.checkout_ts,
    dueTs: row.due_ts,
    returnedTs: row.returned_ts,
    notes: row.notes,
  };
}

export async function listK12Classes(homeOu?: number | null): Promise<K12ClassOverview[]> {
  const rows = await query<ClassRow>(
    `
      SELECT
        c.id,
        c.name,
        c.teacher_name,
        c.grade_level,
        c.home_ou,
        c.active,
        c.created_at,
        c.updated_at,
        COALESCE(s.student_count, 0)::int AS student_count,
        COALESCE(ch.active_checkout_count, 0)::int AS active_checkout_count
      FROM library.k12_classes c
      LEFT JOIN (
        SELECT class_id, COUNT(*)::int AS student_count
        FROM library.k12_students
        WHERE active = TRUE
        GROUP BY class_id
      ) s ON s.class_id = c.id
      LEFT JOIN (
        SELECT class_id, COUNT(*)::int AS active_checkout_count
        FROM library.k12_class_checkouts
        WHERE returned_ts IS NULL
        GROUP BY class_id
      ) ch ON ch.class_id = c.id
      WHERE c.active = TRUE
        AND ($1::int IS NULL OR c.home_ou = $1)
      ORDER BY lower(c.name), c.id
    `,
    [homeOu ?? null]
  );
  return rows.map(toClass);
}

export async function listK12Students(classId: number): Promise<K12Student[]> {
  const rows = await query<StudentRow>(
    `
      SELECT
        id,
        class_id,
        first_name,
        last_name,
        student_identifier,
        active,
        created_at,
        updated_at
      FROM library.k12_students
      WHERE class_id = $1
        AND active = TRUE
      ORDER BY lower(last_name), lower(first_name), id
    `,
    [classId]
  );
  return rows.map(toStudent);
}

export async function listK12ActiveCheckouts(classId: number): Promise<K12Checkout[]> {
  const rows = await query<CheckoutRow>(
    `
      SELECT
        co.id,
        co.class_id,
        co.student_id,
        co.copy_barcode,
        co.copy_id,
        co.title,
        co.checkout_ts,
        co.due_ts,
        co.returned_ts,
        co.notes,
        CASE
          WHEN s.id IS NULL THEN NULL
          ELSE concat_ws(' ', s.first_name, s.last_name)
        END AS student_name
      FROM library.k12_class_checkouts co
      LEFT JOIN library.k12_students s ON s.id = co.student_id
      WHERE co.class_id = $1
        AND co.returned_ts IS NULL
      ORDER BY co.checkout_ts DESC, co.id DESC
    `,
    [classId]
  );
  return rows.map(toCheckout);
}

export async function createK12Class(args: {
  name: string;
  teacherName: string;
  gradeLevel?: string | null;
  homeOu: number;
  actorId?: number | null;
}): Promise<K12ClassOverview> {
  const row = await querySingle<ClassRow>(
    `
      INSERT INTO library.k12_classes (
        name,
        teacher_name,
        grade_level,
        home_ou,
        active,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, TRUE, $5, $5, NOW(), NOW())
      RETURNING
        id,
        name,
        teacher_name,
        grade_level,
        home_ou,
        active,
        created_at,
        updated_at,
        0::int AS student_count,
        0::int AS active_checkout_count
    `,
    [
      args.name.trim(),
      args.teacherName.trim(),
      args.gradeLevel?.trim() || null,
      args.homeOu,
      args.actorId ?? null,
    ]
  );

  if (!row) throw new Error("Failed to create class");
  return toClass(row);
}

export async function createK12Student(args: {
  classId: number;
  firstName: string;
  lastName: string;
  studentIdentifier?: string | null;
  actorId?: number | null;
}): Promise<K12Student> {
  const row = await querySingle<StudentRow>(
    `
      INSERT INTO library.k12_students (
        class_id,
        first_name,
        last_name,
        student_identifier,
        active,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, TRUE, $5, $5, NOW(), NOW())
      RETURNING
        id,
        class_id,
        first_name,
        last_name,
        student_identifier,
        active,
        created_at,
        updated_at
    `,
    [
      args.classId,
      args.firstName.trim(),
      args.lastName.trim(),
      args.studentIdentifier?.trim() || null,
      args.actorId ?? null,
    ]
  );

  if (!row) throw new Error("Failed to create student");
  return toStudent(row);
}

async function resolveCopyMetadata(copyBarcode: string): Promise<CatalogLookupRow> {
  const row = await querySingle<CatalogLookupRow>(
    `
      SELECT
        cp.id AS copy_id,
        bre.title
      FROM asset.copy cp
      LEFT JOIN asset.call_number acn ON acn.id = cp.call_number
      LEFT JOIN biblio.record_entry bre ON bre.id = acn.record
      WHERE cp.barcode = $1
      LIMIT 1
    `,
    [copyBarcode]
  );
  return row || { copy_id: null, title: null };
}

export async function createK12Checkout(args: {
  classId: number;
  studentId?: number | null;
  copyBarcode: string;
  title?: string | null;
  dueTs?: string | null;
  notes?: string | null;
  actorId?: number | null;
}): Promise<K12Checkout> {
  const copyBarcode = args.copyBarcode.trim();
  const lookup = await resolveCopyMetadata(copyBarcode);
  const title = (args.title || lookup.title || "").trim() || null;

  const row = await querySingle<CheckoutRow>(
    `
      INSERT INTO library.k12_class_checkouts (
        class_id,
        student_id,
        copy_barcode,
        copy_id,
        title,
        checkout_ts,
        due_ts,
        created_by,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)
      RETURNING
        id,
        class_id,
        student_id,
        NULL::text AS student_name,
        copy_barcode,
        copy_id,
        title,
        checkout_ts,
        due_ts,
        returned_ts,
        notes
    `,
    [
      args.classId,
      args.studentId ?? null,
      copyBarcode,
      lookup.copy_id,
      title,
      args.dueTs || null,
      args.actorId ?? null,
      args.notes || null,
    ]
  );

  if (!row) throw new Error("Failed to create class checkout");
  return toCheckout(row);
}

export async function returnK12CheckoutsByIds(checkoutIds: number[]): Promise<number> {
  if (!checkoutIds.length) return 0;

  const normalized = checkoutIds
    .map((id) => Math.trunc(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (!normalized.length) return 0;

  const row = await querySingle<{ count: number }>(
    `
      WITH updated AS (
        UPDATE library.k12_class_checkouts
        SET returned_ts = NOW()
        WHERE id = ANY($1::bigint[])
          AND returned_ts IS NULL
        RETURNING id
      )
      SELECT COUNT(*)::int AS count FROM updated
    `,
    [normalized]
  );

  return Number(row?.count || 0);
}

export async function returnAllActiveK12CheckoutsForClass(classId: number): Promise<number> {
  const row = await querySingle<{ count: number }>(
    `
      WITH updated AS (
        UPDATE library.k12_class_checkouts
        SET returned_ts = NOW()
        WHERE class_id = $1
          AND returned_ts IS NULL
        RETURNING id
      )
      SELECT COUNT(*)::int AS count FROM updated
    `,
    [classId]
  );
  return Number(row?.count || 0);
}

export async function getK12ClassById(classId: number): Promise<K12ClassOverview | null> {
  const row = await querySingle<ClassRow>(
    `
      SELECT
        c.id,
        c.name,
        c.teacher_name,
        c.grade_level,
        c.home_ou,
        c.active,
        c.created_at,
        c.updated_at,
        COALESCE(s.student_count, 0)::int AS student_count,
        COALESCE(ch.active_checkout_count, 0)::int AS active_checkout_count
      FROM library.k12_classes c
      LEFT JOIN (
        SELECT class_id, COUNT(*)::int AS student_count
        FROM library.k12_students
        WHERE active = TRUE
        GROUP BY class_id
      ) s ON s.class_id = c.id
      LEFT JOIN (
        SELECT class_id, COUNT(*)::int AS active_checkout_count
        FROM library.k12_class_checkouts
        WHERE returned_ts IS NULL
        GROUP BY class_id
      ) ch ON ch.class_id = c.id
      WHERE c.id = $1
      LIMIT 1
    `,
    [classId]
  );

  if (!row) return null;
  return toClass(row);
}

export async function logK12Summary(homeOu?: number | null): Promise<void> {
  try {
    const classes = await listK12Classes(homeOu);
    const activeCheckouts = classes.reduce((sum, row) => sum + row.activeCheckoutCount, 0);
    logger.info(
      {
        component: "k12-class-circulation",
        homeOu: homeOu ?? null,
        classes: classes.length,
        activeCheckouts,
      },
      "Loaded K-12 class circulation summary"
    );
  } catch (error) {
    logger.warn(
      { component: "k12-class-circulation", error: String(error) },
      "K-12 summary failed"
    );
  }
}
