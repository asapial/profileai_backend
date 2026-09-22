import assert from "node:assert/strict";
import test from "node:test";
import { normalizeContactRecipients } from "./contact.logic";
import { contactRequestSchema } from "./contact.schema";

test("contact request accepts a safe, complete visitor message", () => {
  const result = contactRequestSchema.safeParse({
    body: {
      name: "Alex Morgan",
      email: "ALEX@example.com",
      company: "Example Studio",
      category: "PARTNERSHIP",
      subject: "Career program partnership",
      message: "We would like to discuss a career program for our graduating cohort.",
      consent: true,
      website: "",
    },
  });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.body.email, "alex@example.com");
});

test("contact request rejects spam traps, short messages and missing consent", () => {
  const result = contactRequestSchema.safeParse({
    body: {
      name: "A",
      email: "not-an-email",
      category: "GENERAL",
      subject: "Hi",
      message: "Too short",
      consent: false,
      website: "spam.example",
    },
  });
  assert.equal(result.success, false);
});

test("contact recipients support lists, separators, deduplication and validation", () => {
  assert.deepEqual(
    normalizeContactRecipients(
      ["Admin@One.test", "invalid"],
      "admin@one.test; support@two.test\nthird@three.test",
    ),
    ["admin@one.test", "support@two.test", "third@three.test"],
  );
});
