/**
 * Mock Events Data for OPAC Events Calendar
 *
 * TODO: Replace with LibCal API integration
 * ==========================================
 * When ready to integrate with Springshare LibCal:
 * 1. Use the LibCal Events API: https://api2.libcal.com/1.1/events
 * 2. Authentication: OAuth2 client credentials flow
 *    - POST https://api2.libcal.com/1.1/oauth/token
 *    - Body: { grant_type: "client_credentials", client_id: "...", client_secret: "..." }
 * 3. Fetch events: GET https://api2.libcal.com/1.1/events?cal_id={calendarId}&limit=20
 * 4. Map LibCal response fields to our LibraryEvent type:
 *    - id -> id
 *    - title -> title
 *    - description -> description (HTML, strip tags)
 *    - start -> date + startTime
 *    - end -> endTime
 *    - location.name -> branch
 *    - category.name -> type
 *    - registration -> registrationRequired / registrationUrl
 *    - seats.taken / seats.total -> spotsAvailable / capacity
 *
 * Environment variables needed:
 *   LIBCAL_CLIENT_ID - LibCal API client ID
 *   LIBCAL_CLIENT_SECRET - LibCal API client secret
 *   LIBCAL_CALENDAR_ID - Your library's LibCal calendar ID
 */

export type EventType =
  | "Storytime"
  | "Book Club"
  | "Tech Help"
  | "Workshop"
  | "Author Visit"
  | "Teen"
  | "Kids"
  | "Adult";

export type AgeGroup = "All Ages" | "Kids" | "Teens" | "Adults" | "Seniors";

export interface LibraryEvent {
  id: string;
  title: string;
  description: string;
  date: string; // ISO date string (YYYY-MM-DD)
  startTime: string; // e.g. "10:00 AM"
  endTime: string; // e.g. "11:00 AM"
  branch: string;
  type: EventType;
  ageGroup: AgeGroup;
  registrationRequired: boolean;
  registrationUrl?: string;
  spotsAvailable?: number;
  capacity?: number;
  featured: boolean;
  imageUrl?: string;
}

// Helper to generate dates relative to today
function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0]!;
}

const MOCK_EVENTS: LibraryEvent[] = [
  {
    id: "evt-001",
    title: "Toddler Storytime",
    description:
      "Join us for songs, rhymes, and short stories perfect for toddlers ages 18 months to 3 years. Caregivers participate too!",
    date: futureDate(1),
    startTime: "10:00 AM",
    endTime: "10:30 AM",
    branch: "Main Library",
    type: "Storytime",
    ageGroup: "Kids",
    registrationRequired: false,
    featured: true,
  },
  {
    id: "evt-002",
    title: "Adult Book Club: Contemporary Fiction",
    description:
      "This month we are reading and discussing a contemporary fiction bestseller. New members always welcome. Copies available at the circulation desk.",
    date: futureDate(3),
    startTime: "6:30 PM",
    endTime: "8:00 PM",
    branch: "Main Library",
    type: "Book Club",
    ageGroup: "Adults",
    registrationRequired: false,
    featured: true,
  },
  {
    id: "evt-003",
    title: "Tech Help: Smartphone Basics",
    description:
      "Bring your smartphone or tablet and get one-on-one help with basics like email, texting, taking photos, and downloading apps.",
    date: futureDate(2),
    startTime: "2:00 PM",
    endTime: "4:00 PM",
    branch: "Westside Branch",
    type: "Tech Help",
    ageGroup: "Adults",
    registrationRequired: true,
    spotsAvailable: 5,
    capacity: 10,
    featured: false,
  },
  {
    id: "evt-004",
    title: "Creative Writing Workshop for Teens",
    description:
      "Explore your creativity through guided writing exercises, peer feedback, and fun prompts. All skill levels welcome!",
    date: futureDate(5),
    startTime: "3:30 PM",
    endTime: "5:00 PM",
    branch: "Main Library",
    type: "Teen",
    ageGroup: "Teens",
    registrationRequired: true,
    spotsAvailable: 8,
    capacity: 15,
    featured: true,
  },
  {
    id: "evt-005",
    title: "Author Visit: Local Mystery Writer",
    description:
      "Meet a local mystery author for a reading, Q&A session, and book signing. Books will be available for purchase.",
    date: futureDate(7),
    startTime: "7:00 PM",
    endTime: "8:30 PM",
    branch: "Main Library",
    type: "Author Visit",
    ageGroup: "Adults",
    registrationRequired: true,
    spotsAvailable: 30,
    capacity: 75,
    featured: true,
  },
  {
    id: "evt-006",
    title: "LEGO Building Club",
    description:
      "Kids ages 5-12 can build, create, and play with our LEGO collection. A different theme each week!",
    date: futureDate(4),
    startTime: "3:00 PM",
    endTime: "4:30 PM",
    branch: "Eastside Branch",
    type: "Kids",
    ageGroup: "Kids",
    registrationRequired: false,
    featured: false,
  },
  {
    id: "evt-007",
    title: "Resume Writing Workshop",
    description:
      "Learn how to create a standout resume and cover letter. Bring a laptop or use one of ours. Individual feedback provided.",
    date: futureDate(6),
    startTime: "10:00 AM",
    endTime: "12:00 PM",
    branch: "Westside Branch",
    type: "Workshop",
    ageGroup: "Adults",
    registrationRequired: true,
    spotsAvailable: 3,
    capacity: 12,
    featured: false,
  },
  {
    id: "evt-008",
    title: "Baby Storytime",
    description:
      "A gentle storytime for babies from birth to 18 months with songs, bouncing rhymes, and board books.",
    date: futureDate(2),
    startTime: "10:30 AM",
    endTime: "11:00 AM",
    branch: "Eastside Branch",
    type: "Storytime",
    ageGroup: "Kids",
    registrationRequired: false,
    featured: false,
  },
  {
    id: "evt-009",
    title: "Teen Gaming Night",
    description:
      "Hang out, play video games on the big screen, and enjoy snacks. Nintendo Switch and PS5 available.",
    date: futureDate(8),
    startTime: "5:00 PM",
    endTime: "7:00 PM",
    branch: "Main Library",
    type: "Teen",
    ageGroup: "Teens",
    registrationRequired: false,
    featured: false,
  },
  {
    id: "evt-010",
    title: "Intro to 3D Printing",
    description:
      "Learn the basics of 3D printing in our makerspace. Design a simple object and watch it print! No experience needed.",
    date: futureDate(9),
    startTime: "1:00 PM",
    endTime: "3:00 PM",
    branch: "Main Library",
    type: "Workshop",
    ageGroup: "All Ages",
    registrationRequired: true,
    spotsAvailable: 6,
    capacity: 8,
    featured: false,
  },
  {
    id: "evt-011",
    title: "Preschool Storytime",
    description:
      "Stories, songs, and a simple craft for children ages 3-5. Helps build early literacy skills in a fun group setting.",
    date: futureDate(3),
    startTime: "10:00 AM",
    endTime: "10:45 AM",
    branch: "Main Library",
    type: "Storytime",
    ageGroup: "Kids",
    registrationRequired: false,
    featured: false,
  },
  {
    id: "evt-012",
    title: "Senior Tech Drop-In",
    description:
      "No appointment needed! Volunteers are available to help with computers, tablets, phones, and e-readers.",
    date: futureDate(4),
    startTime: "10:00 AM",
    endTime: "12:00 PM",
    branch: "Westside Branch",
    type: "Tech Help",
    ageGroup: "Seniors",
    registrationRequired: false,
    featured: false,
  },
  {
    id: "evt-013",
    title: "YA Book Club: Fantasy & Sci-Fi",
    description:
      "For readers ages 13-18. We pick a new fantasy or sci-fi title each month. Snacks provided! Check the catalog for this month's pick.",
    date: futureDate(10),
    startTime: "4:00 PM",
    endTime: "5:00 PM",
    branch: "Main Library",
    type: "Book Club",
    ageGroup: "Teens",
    registrationRequired: false,
    featured: false,
  },
  {
    id: "evt-014",
    title: "Family Movie Afternoon",
    description:
      "Enjoy a family-friendly film on the big screen in our community room. Popcorn provided! Title announced one week before the event.",
    date: futureDate(12),
    startTime: "2:00 PM",
    endTime: "4:00 PM",
    branch: "Eastside Branch",
    type: "Kids",
    ageGroup: "All Ages",
    registrationRequired: false,
    featured: false,
  },
  {
    id: "evt-015",
    title: "Digital Photography Basics",
    description:
      "Learn composition, lighting, and editing basics for your phone or camera. Bring your own device.",
    date: futureDate(14),
    startTime: "6:00 PM",
    endTime: "7:30 PM",
    branch: "Main Library",
    type: "Workshop",
    ageGroup: "Adults",
    registrationRequired: true,
    spotsAvailable: 10,
    capacity: 20,
    featured: false,
  },
  {
    id: "evt-016",
    title: "Homework Help",
    description:
      "Free tutoring for students in grades K-12. Volunteers help with all subjects. First come, first served.",
    date: futureDate(1),
    startTime: "3:30 PM",
    endTime: "5:30 PM",
    branch: "Westside Branch",
    type: "Kids",
    ageGroup: "Kids",
    registrationRequired: false,
    featured: false,
  },
  {
    id: "evt-017",
    title: "Knitting & Crochet Circle",
    description:
      "Bring your current project or learn a new skill. Yarn and needles available for beginners. All levels welcome.",
    date: futureDate(6),
    startTime: "1:00 PM",
    endTime: "3:00 PM",
    branch: "Eastside Branch",
    type: "Adult",
    ageGroup: "Adults",
    registrationRequired: false,
    featured: false,
  },
  {
    id: "evt-018",
    title: "Coding Club for Kids",
    description:
      "Kids ages 8-14 learn programming with Scratch and Python through fun projects and games. Laptops provided.",
    date: futureDate(11),
    startTime: "10:00 AM",
    endTime: "11:30 AM",
    branch: "Main Library",
    type: "Workshop",
    ageGroup: "Kids",
    registrationRequired: true,
    spotsAvailable: 4,
    capacity: 12,
    featured: false,
  },
];

/**
 * Get upcoming events, optionally filtered.
 * In production, replace this with a call to LibCal API.
 */
export function getUpcomingEvents(options?: {
  branch?: string;
  type?: EventType;
  startDate?: string;
  endDate?: string;
  limit?: number;
  featuredOnly?: boolean;
}): LibraryEvent[] {
  let events = [...MOCK_EVENTS];

  // Sort by date then time
  events.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.startTime.localeCompare(b.startTime);
  });

  if (options?.branch) {
    events = events.filter((e) => e.branch.toLowerCase() === options.branch!.toLowerCase());
  }

  if (options?.type) {
    events = events.filter((e) => e.type.toLowerCase() === options.type!.toLowerCase());
  }

  if (options?.startDate) {
    events = events.filter((e) => e.date >= options.startDate!);
  }

  if (options?.endDate) {
    events = events.filter((e) => e.date <= options.endDate!);
  }

  if (options?.featuredOnly) {
    events = events.filter((e) => e.featured);
  }

  if (options?.limit) {
    events = events.slice(0, options.limit);
  }

  return events;
}

/**
 * Get distinct branch names from events.
 */
export function getEventBranches(): string[] {
  const branches = new Set(MOCK_EVENTS.map((e) => e.branch));
  return Array.from(branches).sort();
}

/**
 * Get all event type values.
 */
export function getEventTypes(): EventType[] {
  return [
    "Storytime",
    "Book Club",
    "Tech Help",
    "Workshop",
    "Author Visit",
    "Teen",
    "Kids",
    "Adult",
  ];
}
