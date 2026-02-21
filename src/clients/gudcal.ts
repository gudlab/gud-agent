import { config } from "../config.js";

interface TimeSlot {
  start: string;
  end: string;
}

interface DaySlots {
  date: string;
  slots: TimeSlot[];
}

interface AvailabilityResponse {
  slots: DaySlots[];
  timezone: string;
}

interface BookingResponse {
  uid: string;
  status: string;
}

export const gudcal = {
  /**
   * Fetch available time slots from GudCal.
   * Returns slots grouped by date.
   */
  async getSlots(
    from: string,
    to: string,
    timezone = "America/New_York",
  ): Promise<AvailabilityResponse> {
    const params = new URLSearchParams({
      eventSlug: config.gudcal.eventSlug,
      from,
      to,
      timezone,
    });

    const url = `${config.gudcal.url}/api/availability/${config.gudcal.username}?${params}`;
    const res = await fetch(url);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(
        `GudCal availability check failed (${res.status}): ${err.error || "Unknown error"}`,
      );
    }

    return res.json();
  },

  /**
   * Book a meeting via GudCal.
   * Returns the booking UID and status.
   */
  async book(data: {
    startTime: string;
    guestName: string;
    guestEmail: string;
    guestTimezone?: string;
    notes?: string;
  }): Promise<BookingResponse> {
    const res = await fetch(`${config.gudcal.url}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventTypeId: config.gudcal.eventTypeId,
        startTime: data.startTime,
        guestName: data.guestName,
        guestEmail: data.guestEmail,
        guestTimezone: data.guestTimezone || "America/New_York",
        notes: data.notes,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(
        `GudCal booking failed (${res.status}): ${err.error || "Unknown error"}`,
      );
    }

    return res.json();
  },
};
