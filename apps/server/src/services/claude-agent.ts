import Anthropic from "@anthropic-ai/sdk";
import type { Intent } from "../types/index.js";

const SYSTEM_PROMPT = `You are an AI assistant that analyzes voice commands from developers to extract their intent for code generation.

Your task is to:
1. Identify the type of request (generate_ui, modify_code, create_project, or unknown)
2. Extract key details about what component or feature they want
3. Identify any styling preferences (dark mode, specific colors, Tailwind classes, etc.)
4. Determine the appropriate file path for the generated code

Respond ONLY with valid JSON in this exact format:
{
  "type": "generate_ui" | "modify_code" | "create_project" | "unknown",
  "description": "A clear, concise description of what to build",
  "componentType": "The type of component (e.g., 'Button', 'LoginForm', 'DarkModeToggle')",
  "filePath": "Suggested file path (e.g., 'src/components/DarkModeToggle.tsx')",
  "styling": ["Array of styling hints like 'dark mode', 'rounded corners', 'gradient background'"],
  "context": "Any additional context about the request",
  "confidence": 0.0 to 1.0
}

Examples:
- "Add a dark mode toggle to the header" -> generate_ui, DarkModeToggle
- "Create a login page with email and password" -> generate_ui, LoginForm
- "Make the button blue and add hover effects" -> modify_code, Button styling
- "Hello, how are you?" -> unknown, not a code request`;

export class ClaudeAgent {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async analyzeIntent(transcript: string): Promise<Intent> {
    try {
      const response = await this.client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Analyze this voice command and extract the developer's intent:\n\n"${transcript}"`,
          },
        ],
      });

      // Extract text content from response
      const textContent = response.content.find((c) => c.type === "text");
      if (!textContent || textContent.type !== "text") {
        throw new Error("No text response from Claude");
      }

      // Parse JSON response
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Could not parse intent from response");
      }

      const intent = JSON.parse(jsonMatch[0]) as Intent;
      return intent;
    } catch (error) {
      console.error("Claude analysis error:", error);

      // Return unknown intent on error
      return {
        type: "unknown",
        description: transcript,
        confidence: 0,
      };
    }
  }

  async refinePrompt(intent: Intent): Promise<string> {
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Based on this intent, create a detailed prompt for v0 to generate the UI component:

Intent:
- Type: ${intent.type}
- Description: ${intent.description}
- Component Type: ${intent.componentType || "Not specified"}
- Styling: ${intent.styling?.join(", ") || "Default styling"}
- Context: ${intent.context || "None"}

Create a detailed, specific prompt that v0 can use to generate production-ready React code with Tailwind CSS. Include specific requirements for:
1. Component structure
2. Props and state
3. Styling with Tailwind classes
4. Accessibility considerations
5. Responsive design

Return only the prompt text, no explanations.`,
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    return textContent.text;
  }
}
