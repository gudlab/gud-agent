import { tool } from "ai";
import { z } from "zod";
import { gudcal } from "../clients/gudcal.js";

/**
 * Format a date range for the next N days starting from today.
 */
function getDateRange(daysAhead: number): { from: string; to: string } {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + daysAhead);

  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

/**
 * Format an ISO timestamp to a human-readable time string.
 */
function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export const checkSlots = tool({
  description:
    "Check available meeting/demo time slots. Use this when a visitor wants to schedule a meeting or demo. Returns available slots for the requested date range.",
  parameters: z.object({
    date: z
      .string()
      .optional()
      .describe(
        "Specific date to check (YYYY-MM-DD format). If not provided, checks the next 3 business days.",
      ),
    timezone: z
      .string()
      .optional()
      .describe(
        "The visitor's timezone (IANA format, e.g. 'America/New_York'). Defaults to America/New_York.",
      ),
  }),
  execute: async ({ date, timezone }) => {
    try {
      const tz = timezone || "America/New_York";

      let from: string;
      let to: string;

      if (date) {
        // Check a specific date
        from = date;
        to = date;
      } else {
        // Check next 5 days
        const range = getDateRange(5);
        from = range.from;
        to = range.to;
      }

      const result = await gudcal.getSlots(from, to, tz);

      // Format the results for the LLM
      const formatted = result.slots
        .filter((day) => day.slots.length > 0)
        .map((day) => ({
          date: day.date,
          availableSlots: day.slots.map((slot) => ({
            start: slot.start,
            displayTime: formatTime(slot.start),
          })),
        }));

      if (formatted.length === 0) {
        return {
          available: false,
          message: `No available slots found between ${from} and ${to} (${tz}). Try a different date range.`,
          timezone: tz,
        };
      }

      return {
        available: true,
        timezone: tz,
        days: formatted,
        message: `Found available slots across ${formatted.length} day(s).`,
      };
    } catch (error) {
      return {
        available: false,
        message: `Failed to check availability: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});
