import { z } from "zod";

export const contactCategories = [
  "GENERAL",
  "PRODUCT_SUPPORT",
  "BILLING",
  "PARTNERSHIP",
  "PRIVACY",
  "SECURITY",
] as const;

export const contactRequestSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Please enter your name.").max(80),
    email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
    company: z.string().trim().max(120).optional().default(""),
    category: z.enum(contactCategories),
    subject: z.string().trim().min(4, "Add a short subject.").max(140),
    message: z.string().trim().min(20, "Please add a little more detail.").max(5000),
    consent: z.literal(true, { message: "Please agree to be contacted about this request." }),
    website: z.string().max(0).optional().default(""),
  }),
});

export type ContactRequestInput = z.infer<typeof contactRequestSchema>["body"];
