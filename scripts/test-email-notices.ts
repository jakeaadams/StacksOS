/**
 * Test script for email notification system
 * Run with: npx tsx scripts/test-email-notices.ts
 */

import { sendNotice } from "../src/lib/email";

async function testHoldReadyNotice() {
  console.log("\n=== Testing Hold Ready Notice ===\n");

  await sendNotice({
    type: "hold_ready",
    context: {
      patron: {
        id: 1,
        firstName: "Jane",
        lastName: "Doe",
        email: "jane.doe@example.com",
        barcode: "123456789",
      },
      library: {
        name: "Main Library",
        phone: "(555) 123-4567",
        email: "library@example.org",
        website: "https://library.example.org",
      },
      holds: [
        {
          id: 1,
          title: "The Great Gatsby",
          author: "F. Scott Fitzgerald",
          pickupLibrary: "Main Library",
          shelfExpireTime: "2026-02-15T23:59:59Z",
        },
        {
          id: 2,
          title: "To Kill a Mockingbird",
          author: "Harper Lee",
          pickupLibrary: "Main Library",
          shelfExpireTime: "2026-02-15T23:59:59Z",
        },
      ],
      preferencesUrl: "http://localhost:3000/opac/account/settings",
      unsubscribeUrl: "http://localhost:3000/opac/account/settings?unsubscribe=email",
    },
  });
}

async function testOverdueNotice() {
  console.log("\n=== Testing Overdue Notice ===\n");

  await sendNotice({
    type: "overdue",
    context: {
      patron: {
        id: 1,
        firstName: "John",
        lastName: "Smith",
        email: "john.smith@example.com",
      },
      library: {
        name: "Main Library",
        phone: "(555) 123-4567",
        email: "library@example.org",
      },
      items: [
        {
          title: "1984",
          author: "George Orwell",
          barcode: "BC123456",
          dueDate: "2026-01-20",
          callNumber: "FIC ORW",
        },
      ],
    },
  });
}

async function testPreOverdueNotice() {
  console.log("\n=== Testing Pre-Overdue Notice ===\n");

  await sendNotice({
    type: "pre_overdue",
    context: {
      patron: {
        id: 2,
        firstName: "Alice",
        lastName: "Johnson",
        email: "alice.j@example.com",
      },
      library: {
        name: "Main Library",
        phone: "(555) 123-4567",
      },
      items: [
        {
          title: "The Catcher in the Rye",
          author: "J.D. Salinger",
          barcode: "BC789012",
          dueDate: "2026-02-03",
          callNumber: "FIC SAL",
        },
        {
          title: "Pride and Prejudice",
          author: "Jane Austen",
          barcode: "BC345678",
          dueDate: "2026-02-03",
        },
      ],
    },
  });
}

async function testCardExpirationNotice() {
  console.log("\n=== Testing Card Expiration Notice ===\n");

  await sendNotice({
    type: "card_expiration",
    context: {
      patron: {
        id: 3,
        firstName: "Bob",
        lastName: "Williams",
        email: "bob.w@example.com",
        barcode: "987654321",
      },
      library: {
        name: "Main Library",
        phone: "(555) 123-4567",
        email: "library@example.org",
        website: "https://library.example.org",
      },
      expirationDate: "2026-03-15",
    },
  });
}

async function testFineBillNotice() {
  console.log("\n=== Testing Fine/Bill Notice ===\n");

  await sendNotice({
    type: "fine_bill",
    context: {
      patron: {
        id: 4,
        firstName: "Carol",
        lastName: "Davis",
        email: "carol.d@example.com",
      },
      library: {
        name: "Main Library",
        phone: "(555) 123-4567",
        email: "library@example.org",
      },
      bills: [
        {
          id: 1,
          title: "Lost Item: The Hobbit",
          amount: 25.0,
          balance: 25.0,
          billedDate: "2026-01-15",
        },
        {
          id: 2,
          title: "Overdue Fine",
          amount: 3.5,
          balance: 3.5,
          billedDate: "2026-01-20",
        },
      ],
    },
  });
}

async function main() {
  console.log("Email Notification System Test");
  console.log("===============================");
  console.log("\nNOTE: Make sure STACKSOS_EMAIL_DRY_RUN=true in .env.local");
  console.log("Emails will be logged to console, not actually sent.\n");

  try {
    await testHoldReadyNotice();
    await testOverdueNotice();
    await testPreOverdueNotice();
    await testCardExpirationNotice();
    await testFineBillNotice();

    console.log("\n=== All Tests Complete ===\n");
    console.log("Check the console output above to see the email content.");
    console.log("To actually send emails:");
    console.log("1. Set up an email provider (Resend recommended)");
    console.log("2. Set STACKSOS_EMAIL_PROVIDER and STACKSOS_EMAIL_API_KEY");
    console.log("3. Set STACKSOS_EMAIL_DRY_RUN=false");
    console.log("4. Run this script again\n");
  } catch (error) {
    console.error("Error running tests:", error);
    process.exit(1);
  }
}

main();
