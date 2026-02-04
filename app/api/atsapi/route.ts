export const runtime = "nodejs";

import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import pdf from "pdf-parse";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const resumeFile = formData.get("resume") as File;
    const jobDescription = formData.get("jobDescription") as string;

    if (!resumeFile || !jobDescription) {
      return Response.json(
        { error: "Resume and job description are required." },
        { status: 400 }
      );
    }

 
    if (resumeFile.size > 5 * 1024 * 1024) {
      return Response.json(
        { error: "File too large. Max allowed size is 5MB." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await resumeFile.arrayBuffer());
    const pdfData = await pdf(buffer);
    const resumeText = pdfData.text;

    if (!resumeText || resumeText.trim().length < 50) {
      return Response.json(
        { error: "Failed to extract text from resume. Ensure it's a readable PDF." },
        { status: 400 }
      );
    }

    const { text: parsedText } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: `
You are a precise resume parser.

Extract and return a clear, structured textual version of the resume below. Maintain all details exactly as written, without summarizing or guessing.
At the end, include a JSON summary with:
{
  "is_experienced": true|false,
  "approx_years_of_experience": number,
  "detected_sections": ["Education", "Skills", "Projects", "Experience", ...],
  "extracted_links": ["https://...", "https://..."]
}

--- RESUME TEXT START ---
${resumeText}
--- RESUME TEXT END ---
`
    });
    const atsPrompt = `
You are an ATS evaluator.

Compare this resume data with the job description. Return a VALID JSON object with:
{
  "score": integer (0-100),
  "picked_skills": [],
  "picked_experience": [],
  "missing_keywords": [],
  "strengths": [],
  "weaknesses": [],
  "improvement_tips": []
}

Scoring criteria:
- Skill & keyword match
- Education fit
- Relevant project/experience match
- Tools & libraries overlap
- Mentioned technologies relevant to JD

Avoid hallucinations. Use only information present in the resume.

--- JOB DESCRIPTION ---
${jobDescription}

--- PARSED RESUME DATA ---
${parsedText}
`;

    const { text: geminiResponse } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: atsPrompt,
    });


    let parsedResponse;
    try {
      parsedResponse = JSON.parse(
        geminiResponse
          .replace(/```(?:json)?/gi, "")
          .replace(/```/g, "")
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]")
          .trim()
      );
    } catch (err) {
      console.error("Gemini JSON parse error:", geminiResponse);
      return Response.json(
        { error: "Invalid response from Gemini", raw: geminiResponse },
        { status: 500 }
      );
    }

    const {
      score = 0,
      strengths = [],
      weaknesses = [],
      picked_skills = [],
      picked_experience = [],
      missing_keywords = [],
      improvement_tips = [],
    } = parsedResponse || {};

    return Response.json(
      {
        score,
        strengths,
        weaknesses,
        picked_skills,
        picked_experience,
        missing_keywords,
        improvement_tips,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in ATS route:", error);
    return Response.json(
      {
        error: "Internal server error",
        detail: error instanceof Error ? error.stack : String(error),
      },
      { status: 500 }
    );
  }
}
