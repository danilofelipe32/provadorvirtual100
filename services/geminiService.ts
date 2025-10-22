/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";

const fileToPart = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
    const { mimeType, data } = dataUrlToParts(dataUrl);
    return { inlineData: { mimeType, data } };
};

const dataUrlToParts = (dataUrl: string) => {
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error("URL de dados inválida");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Não foi possível extrair o tipo MIME da URL de dados");
    return { mimeType: mimeMatch[1], data: arr[1] };
}

const dataUrlToPart = (dataUrl: string) => {
    const { mimeType, data } = dataUrlToParts(dataUrl);
    return { inlineData: { mimeType, data } };
}

const handleApiResponse = (response: GenerateContentResponse): string => {
    if (response.promptFeedback?.blockReason) {
        const { blockReason, blockReasonMessage } = response.promptFeedback;
        const errorMessage = `A solicitação foi bloqueada. Motivo: ${blockReason}. ${blockReasonMessage || ''}`;
        throw new Error(errorMessage);
    }

    // Find the first image part in any candidate
    for (const candidate of response.candidates ?? []) {
        const imagePart = candidate.content?.parts?.find(part => part.inlineData);
        if (imagePart?.inlineData) {
            const { mimeType, data } = imagePart.inlineData;
            return `data:${mimeType};base64,${data}`;
        }
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
        const errorMessage = `A geração de imagem parou inesperadamente. Motivo: ${finishReason}. Isso geralmente está relacionado às configurações de segurança.`;
        throw new Error(errorMessage);
    }
    const textFeedback = response.text?.trim();
    const errorMessage = `O modelo de IA não retornou uma imagem. ` + (textFeedback ? `O modelo respondeu com o texto: "${textFeedback}"` : "Isso pode acontecer devido a filtros de segurança ou se a solicitação for muito complexa. Por favor, tente uma imagem diferente.");
    throw new Error(errorMessage);
};

const ai = new GoogleGenAI({ apiKey: "AIzaSyC3euwpuF0aniDS9rxsBzwn0YAEUk7TgpM" });
const model = 'gemini-2.5-flash-image';

export const generateModelImage = async (userImage: File): Promise<string> => {
    const userImagePart = await fileToPart(userImage);
    const prompt = "Você é uma IA especialista em fotografia de moda. Transforme a pessoa nesta imagem em uma foto de modelo de corpo inteiro, adequada para um site de e-commerce. O fundo deve ser um cenário de estúdio limpo e neutro (cinza claro, #f0f0f0). A pessoa deve ter uma expressão de modelo neutra e profissional. Preserve a identidade, características únicas e tipo de corpo da pessoa, mas coloque-a em uma pose de modelo padrão, relaxada e em pé. A imagem final deve ser fotorrealista. Retorne APENAS a imagem final.";
    const response = await ai.models.generateContent({
        model,
        contents: { parts: [userImagePart, { text: prompt }] },
        config: {
            // FIX: responseModalities must be an array with a single `Modality.IMAGE` element.
            responseModalities: [Modality.IMAGE],
        },
    });
    return handleApiResponse(response);
};

export const generateVirtualTryOnImage = async (modelImageUrl: string, garmentImage: File): Promise<string> => {
    const modelImagePart = dataUrlToPart(modelImageUrl);
    const garmentImagePart = await fileToPart(garmentImage);
    const prompt = `Você é uma IA especialista em provador virtual. Você receberá uma 'imagem de modelo' e uma 'imagem de peça de roupa'. Sua tarefa é criar uma nova imagem fotorrealista onde a pessoa da 'imagem de modelo' está vestindo a roupa da 'imagem de peça de roupa'.

**Regras Cruciais:**
1.  **Substituição Completa da Peça:** Você DEVE REMOVER e SUBSTITUIR completamente a peça de roupa usada pela pessoa na 'imagem de modelo' pela nova peça. Nenhuma parte da roupa original (por exemplo, golas, mangas, estampas) deve ser visível na imagem final.
2.  **Preservar o Modelo:** O rosto, cabelo, formato do corpo e pose da pessoa da 'imagem de modelo' DEVEM permanecer inalterados.
3.  **Preservar o Fundo:** Todo o fundo da 'imagem de modelo' DEVE ser preservado perfeitamente.
4.  **Aplicar a Peça:** Vista a nova peça na pessoa de forma realista. Ela deve se adaptar à pose com dobras, sombras e iluminação naturais, consistentes com a cena original.
5.  **Saída:** Retorne APENAS a imagem final editada. Não inclua nenhum texto.`;
    const response = await ai.models.generateContent({
        model,
        contents: { parts: [modelImagePart, garmentImagePart, { text: prompt }] },
        config: {
            // FIX: responseModalities must be an array with a single `Modality.IMAGE` element.
            responseModalities: [Modality.IMAGE],
        },
    });
    return handleApiResponse(response);
};

export const generatePoseVariation = async (tryOnImageUrl: string, poseInstruction: string): Promise<string> => {
    const tryOnImagePart = dataUrlToPart(tryOnImageUrl);
    const prompt = `Você é uma IA especialista em fotografia de moda. Pegue esta imagem e gere-a novamente de uma perspectiva diferente. A pessoa, a roupa e o estilo do fundo devem permanecer idênticos. A nova perspectiva deve ser: "${poseInstruction}". Retorne APENAS a imagem final.`;
    const response = await ai.models.generateContent({
        model,
        contents: { parts: [tryOnImagePart, { text: prompt }] },
        config: {
            // FIX: responseModalities must be an array with a single `Modality.IMAGE` element.
            responseModalities: [Modality.IMAGE],
        },
    });
    return handleApiResponse(response);
};