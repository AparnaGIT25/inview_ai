import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { db } from "@/firebase/admin";
import { getRandomInterviewCover } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/actions/auth.action";
import pdf from "pdf-parse";
import { z } from "zod";

export const runtime = "nodejs";

// Force specific configuration for body parsing if needed
export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("resume") as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file uploaded" },
        { status: 400 }
      );
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    // --- STEP 1: PDF Text Extraction ---
    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfData = await pdf(buffer);
    const resumeText = pdfData.text;

    if (!resumeText || resumeText.trim().length < 30) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Could not extract text. Please upload a text-based PDF." 
        },
        { status: 400 }
      );
    }

    // --- STEP 2: Extract Resume Details ---
    // We wrap everything in a z.object to prevent the 'items' proto error
    const { object: parsedDetails } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: z.object({
        fullName: z.string().describe("The candidate's full name"),
        skills: z.array(z.string()).describe("List of technical skills"),
        level: z.enum(["Fresher", "Junior", "Mid-level", "Senior", "Lead"]),
        techStack: z.array(z.string()).describe("Unique technologies mentioned"),
      }),
      prompt: `Extract structured data from the following resume text:\n\n${resumeText}`,
    });

    // --- STEP 3: Generate Interview Questions ---
    // Fix: We wrap the array in an object called 'questions'
    const { object: questionData } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: z.object({
        questions: z.array(z.string()).length(5).describe("5 technical questions"),
      }),
      prompt: `Generate 5 technical interview questions for a ${parsedDetails.level} role. 
               Focus on these skills: ${parsedDetails.skills.join(", ")}. 
               The questions should be challenging but relevant to their experience.`,
    });

    // --- STEP 4: Save to Firestore ---
    const interviewData = {
      role: parsedDetails.fullName || "Candidate",
      type: "resume-based",
      level: parsedDetails.level,
      techstack: parsedDetails.techStack,
      questions: questionData.questions, // This is now the array of strings
      userId: user.id,
      finalized: true,
      coverImage: getRandomInterviewCover(),
      createdAt: new Date().toISOString(),
    };

    const docRef = await db.collection("interviews").add(interviewData);

    return NextResponse.json(
      { 
        success: true, 
        interview: { ...interviewData, id: docRef.id } 
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error("InView AI Resume API Error:", error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || "An unexpected error occurred during processing." 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { success: true, message: "InView.AI Resume API is active." },
    { status: 200 }
  );
}