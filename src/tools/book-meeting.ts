import { tool } from "ai";
import { z } from "zod";
import { gudcal } from "../clients/gudcal.js";

export const bookMeeting = tool({
  description:
    "Book a meeting or demo with the visitor. Use this after checking available slots and confirming the visitor's preferred time. You MUST have the visitor's name, email, and chosen time slot before calling this.",
  parameters: z.object({
    startTime: z
      .string()
      .describe(
        "The meeting start time as an ISO 8601 string (e.g. '2024-03-15T14:00:00Z'). Must be one of the available slots from check_slots.",
      ),
    guestName: z.string().describe("The visitor's full name"),
    guestEmail: z.string().email().describe("The visitor's email address"),
    guestTimezone: z
      .string()
      .optional()
      .describe(
        "The visitor's timezone (IANA format). Defaults to America/New_York.",
      ),
    notes: z
      .string()
      .optional()
      .describe(
        "Any additional notes about the meeting, such as what the visitor wants to discuss.",
      ),
  }),
  execute: async ({ startTime, guestName, guestEmail, guestTimezone, notes }) => {
    try {
      const result = await gudcal.book({
        startTime,
        guestName,
        guestEmail,
        guestTimezone: guestTimezone || "America/New_York",
        notes,
      });

      return {
        success: true,
        bookingId: result.uid,
        status: result.status,
        message: `Meeting booked successfully for ${guestName} (${guestEmail}) at ${new Date(startTime).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}. Booking ID: ${result.uid}`,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";

      // Check for common booking errors
      if (message.includes("409") || message.includes("conflict")) {
        return {
          success: false,
          message:
            "That time slot is no longer available. Please check availability again and choose a different time.",
        };
      }

      return {
        success: false,
        message: `Failed to book meeting: ${message}`,
      };
    }
  },
});
