import { afterEach, describe, expect, it } from "vitest";

import { buildWalletEnrollmentLink, createWalletEnrollmentToken } from "@/lib/opac-wallet";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

const FIXTURE = {
  patronId: 42,
  cardNumber: "24568000123456",
  firstName: "Jake",
  lastName: "Adams",
  homeLibrary: "Jake's Demo Library",
  email: "jake@example.org",
};

describe("opac-wallet", () => {
  it("creates a signed enrollment token when secret is configured", () => {
    process.env.STACKSOS_WALLET_TOKEN_SECRET = "test-secret-should-be-long-enough";
    const token = createWalletEnrollmentToken(FIXTURE);
    expect(token).toBeTruthy();
    expect(token).toContain(".");
  });

  it("returns null token when no secret exists", () => {
    delete process.env.STACKSOS_WALLET_TOKEN_SECRET;
    delete process.env.STACKSOS_PASSKEY_SECRET;
    delete process.env.SESSION_SECRET;
    expect(createWalletEnrollmentToken(FIXTURE)).toBeNull();
  });

  it("builds Apple and Google links from templates", () => {
    process.env.STACKSOS_WALLET_TOKEN_SECRET = "test-secret-should-be-long-enough";
    process.env.STACKSOS_WALLET_APPLE_URL_TEMPLATE =
      "https://wallet.example.org/apple?token={token}&card={card_number}&name={full_name}";
    process.env.STACKSOS_WALLET_GOOGLE_URL_TEMPLATE =
      "https://wallet.example.org/google?token={token}&tenant={tenant_id}";

    const apple = buildWalletEnrollmentLink("apple", FIXTURE);
    const google = buildWalletEnrollmentLink("google", FIXTURE);

    expect(apple).toContain("wallet.example.org/apple");
    expect(apple).toContain("card=24568000123456");
    expect(apple).toContain("name=Jake%20Adams");

    expect(google).toContain("wallet.example.org/google");
    expect(google).toContain("tenant=");
  });
});
