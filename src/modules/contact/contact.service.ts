import { envVars } from "../../config/env";
import { sendContactNotification } from "../../lib/mailer";
import { sectionSettings, tickets } from "../admin/admin.operations.service";
import { normalizeContactRecipients } from "./contact.logic";
import type { ContactRequestInput } from "./contact.schema";

export async function submitContactRequest(input: ContactRequestInput) {
  const ticket = await tickets.createFromContact({
    name: input.name,
    email: input.email,
    company: input.company,
    subject: input.subject,
    category: input.category,
    message: input.message,
  });

  const [emailSettings, brandingSettings] = await Promise.all([
    sectionSettings.get("email"),
    sectionSettings.get("branding"),
  ]);
  const recipients = normalizeContactRecipients(
    emailSettings.contactRecipients,
    emailSettings.replyToAddress,
    brandingSettings.supportEmail,
    envVars.EMAIL_SENDER.SMTP_USER,
  );

  let notificationStatus: "SENT" | "FAILED" | "NOT_CONFIGURED" = "NOT_CONFIGURED";
  if (recipients.length > 0 && envVars.EMAIL_SENDER.SMTP_HOST) {
    try {
      await sendContactNotification({
        recipients,
        ticketId: ticket.id,
        name: input.name,
        email: input.email,
        company: input.company,
        category: input.category,
        subject: input.subject,
        message: input.message,
      });
      notificationStatus = "SENT";
    } catch (error) {
      notificationStatus = "FAILED";
      console.error("[contact] admin email notification failed", error);
    }
  }

  await tickets.update(ticket.id, {
    notificationDelivery: {
      status: notificationStatus,
      recipientCount: recipients.length,
      attemptedAt: new Date().toISOString(),
    },
  });

  return {
    ticketId: ticket.id,
    reference: ticket.id.slice(-8).toUpperCase(),
  };
}
