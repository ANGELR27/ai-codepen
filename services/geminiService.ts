
import { GoogleGenAI, Type } from "@google/genai";
import type { GeneratedCode } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const codeGenerationSchema = {
    type: Type.OBJECT,
    properties: {
        html: {
            type: Type.STRING,
            description: "The HTML code for the component. It should be a single string, containing only the body content, without <html>, <head>, or <body> tags.",
        },
        css: {
            type: Type.STRING,
            description: "The CSS code to style the component. It should be a single string, without <style> tags.",
        },
        javascript: {
            type: Type.STRING,
            description: "The JavaScript code for interactivity. It should be a single string, without <script> tags. It should be vanilla JS that can run directly in the browser.",
        },
    },
    required: ["html", "css", "javascript"],
};

export const generateCode = async (prompt: string): Promise<GeneratedCode> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Generate web code for this prompt: "${prompt}". Provide HTML, CSS, and JavaScript.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: codeGenerationSchema,
                systemInstruction: "You are an expert web developer assistant. Your task is to generate HTML, CSS, and JavaScript code based on a user's prompt. You must return the code in a JSON object with the keys 'html', 'css', and 'javascript'. The code should be clean, efficient, and modern."
            },
        });
        
        const jsonText = response.text.trim();
        const parsedJson = JSON.parse(jsonText);
        
        return {
            html: parsedJson.html || '',
            css: parsedJson.css || '',
            javascript: parsedJson.javascript || '',
        };

    } catch (error) {
        console.error("Error generating code with Gemini:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to generate code: ${error.message}`);
        }
        throw new Error("An unknown error occurred while generating code.");
    }
};
