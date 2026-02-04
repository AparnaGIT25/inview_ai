import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { db } from "@/firebase/admin";
import { getRandomInterviewCover } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/actions/auth.action";
import pdf from "pdf-parse"; 

export const runtime = "nodejs"; 
export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("resume") as File;

    if (!file)
      return NextResponse.json(
        { success: false, error: "No file uploaded" },
        { status: 400 }
      );

    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfData = await pdf(buffer);
    const resumeText = pdfData.text;

    if (!resumeText || resumeText.trim().length < 30) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Failed to extract readable text from resume. Make sure it's a real text-based PDF, not an image scan.",
        },
        { status: 400 }
      );
    }

    const { text: extractedDetails } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: `
You are a resume information extractor.

Given the following resume text, extract structured data:
- Full Name
- Contact Information (Phone, Email)
- Skills (list all)
- Work Experience (company, title, duration)
- Projects (titles, technologies, brief descriptions)
- Education (degree, institute, year)
- Certifications & Achievements
- Years of experience

Also include:
- Level: "Fresher" | "Junior" | "Mid-level" | "Senior" | "Lead"
- Tech Stack: a deduplicated array of technologies mentioned anywhere.

Return a **valid JSON object only**.

--- RESUME TEXT START ---
${resumeText}
--- RESUME TEXT END ---
`,
    });

    let parsedDetails;
    try {
      const cleanJson = extractedDetails
        .replace(/```(?:json)?/gi, "")
        .replace(/```/g, "")
        .trim();
      parsedDetails = JSON.parse(cleanJson);
    } catch (error) {
      console.error("Gemini parse error:", extractedDetails);
      return NextResponse.json(
        { success: false, error: "Invalid JSON format from Gemini" },
        { status: 500 }
      );
    }
    const { text: questions } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: `
Generate 5 technical interview questions based on this candidate's resume:

Skills: ${JSON.stringify(parsedDetails.Skills || [])}
Projects: ${JSON.stringify(parsedDetails.Projects || [])}
Work Experience: ${JSON.stringify(parsedDetails["Work Experience"] || [])}
Education: ${JSON.stringify(parsedDetails.Education || [])}
Certifications: ${JSON.stringify(parsedDetails["Certifications & Achievements"] || [])}
Level: ${parsedDetails.Level || "Unknown"}

Rules:
- All questions must be technical and relevant.
- If Fresher, ask beginner-to-intermediate questions.
- Return ONLY a JSON array of strings, e.g. ["Question 1", "Question 2", ...]
- No markdown, no code blocks, no explanations.
`,
    });

    let parsedQuestions;
    try {
      const cleanJson = questions
        .replace(/```(?:json)?/gi, "")
        .replace(/```/g, "")
        .trim();
      parsedQuestions = JSON.parse(cleanJson);
      if (!Array.isArray(parsedQuestions))
        throw new Error("Expected array of strings");
    } catch (error) {
      console.error("Gemini question parse error:", questions);
      return NextResponse.json(
        { success: false, error: "Invalid question JSON format" },
        { status: 500 }
      );
    }

    const interview = {
      role: parsedDetails["Full Name"] || "Candidate",
      type: "resume-based",
      level: parsedDetails.Level || "Unknown",
      techstack: parsedDetails["Tech Stack"] || [],
      questions: parsedQuestions,
      userId: user.id,
      finalized: true,
      coverImage: getRandomInterviewCover(),
      createdAt: new Date().toISOString(),
    };

    await db.collection("interviews").add(interview);

    return NextResponse.json({ success: true, interview }, { status: 200 });
  } catch (error) {
    console.error("Unexpected Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unknown error occurred",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { success: true, data: "Resume API is working!" },
    { status: 200 }
  );
}
