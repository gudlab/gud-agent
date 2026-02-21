import { tool } from "ai";
import { z } from "zod";
import { gudform } from "../clients/gudform.js";

export const collectInfo = tool({
  description:
    "Collect and save visitor/lead information (name, email, company, phone) by submitting it to a form. Use this when you have gathered enough information from the visitor to capture them as a lead. You should have at least their name and email before calling this.",
  parameters: z.object({
    name: z.string().describe("The visitor's full name"),
    email: z.string().email().describe("The visitor's email address"),
    company: z
      .string()
      .optional()
      .describe("The visitor's company or organization name"),
    phone: z
      .string()
      .optional()
      .describe("The visitor's phone number"),
  }),
  execute: async ({ name, email, company, phone }) => {
    try {
      const answers = gudform.buildAnswers({ name, email, company, phone });

      if (answers.length === 0) {
        return {
          success: false,
          message:
            "Form field mappings are not configured. Could not save lead info.",
        };
      }

      const result = await gudform.submit(answers);

      return {
        success: true,
        message: `Successfully captured lead information for ${name} (${email}).`,
        responseId: result.id,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to save lead information: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});
