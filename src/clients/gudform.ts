import { config } from "../config.js";

interface FormResponse {
  id: string;
}

export const gudform = {
  /**
   * Submit a form response to GudForm.
   * Used to capture lead information (name, email, company, etc.)
   */
  async submit(
    answers: { questionId: string; value: string }[],
  ): Promise<FormResponse> {
    const res = await fetch(
      `${config.gudform.url}/api/forms/${config.gudform.formId}/responses`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(
        `GudForm submission failed (${res.status}): ${err.error || "Unknown error"}`,
      );
    }

    return res.json();
  },

  /**
   * Helper to build the answers array from structured lead data.
   * Maps field names to their configured question IDs.
   */
  buildAnswers(data: {
    name?: string;
    email?: string;
    company?: string;
    phone?: string;
  }): { questionId: string; value: string }[] {
    const answers: { questionId: string; value: string }[] = [];
    const fields = config.gudform.fields;

    if (data.name && fields.name) {
      answers.push({ questionId: fields.name, value: data.name });
    }
    if (data.email && fields.email) {
      answers.push({ questionId: fields.email, value: data.email });
    }
    if (data.company && fields.company) {
      answers.push({ questionId: fields.company, value: data.company });
    }
    if (data.phone && fields.phone) {
      answers.push({ questionId: fields.phone, value: data.phone });
    }

    return answers;
  },
};
