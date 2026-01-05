
import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedData } from "../types";

export async function extractDataFromPhotos(photos: string[]): Promise<ExtractedData> {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    console.error("CRITICAL: API_KEY is undefined in process.env");
    throw new Error("Chave de API (API_KEY) não configurada no ambiente.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const prepareImagePart = (base64: string) => {
      const match = base64.match(/^data:(image\/[a-zA-Z0-9\-\+\.]+);base64,/);
      const mimeType = match ? match[1] : "image/jpeg";
      const data = base64.includes(',') ? base64.split(',')[1] : base64;
      return { inlineData: { mimeType, data } };
    };

    // Usando gemini-3-flash-preview para maior velocidade e estabilidade em OCR
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: "Analise as imagens desta embalagem industrial e extraia os dados técnicos em JSON puro. \n\nREGRAS:\n1. MOLDAGEM: 'TERMOFORMADO' ou 'INJETADO'.\n2. FORMATO: 'REDONDO', 'RETANGULAR', 'QUADRADO' ou 'OVAL'.\n3. FABRICANTE: Verifique logotipos no fundo da peça (ex: FIBRASA, BOMIX, RIOPLASTIC).\n4. CNPJ: Extraia todos os CNPJs encontrados." },
            ...photos.map(prepareImagePart)
          ]
        }
      ],
      config: {
        systemInstruction: "Você é um auditor técnico de embalagens. Responda APENAS com um objeto JSON válido contendo: razaoSocial, cnpj (array), marca, descricaoProduto, conteudo, endereco, cep, telefone, site, fabricanteEmbalagem, moldagem, formatoEmbalagem, tipoEmbalagem, modeloEmbalagem. Use 'N/I' para valores não encontrados.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            razaoSocial: { type: Type.STRING },
            cnpj: { type: Type.ARRAY, items: { type: Type.STRING } },
            marca: { type: Type.STRING },
            descricaoProduto: { type: Type.STRING },
            conteudo: { type: Type.STRING },
            endereco: { type: Type.STRING },
            cep: { type: Type.STRING },
            telefone: { type: Type.STRING },
            site: { type: Type.STRING },
            fabricanteEmbalagem: { type: Type.STRING },
            moldagem: { type: Type.STRING },
            formatoEmbalagem: { type: Type.STRING },
            tipoEmbalagem: { type: Type.STRING },
            modeloEmbalagem: { type: Type.STRING }
          },
          required: ["razaoSocial", "cnpj"]
        }
      }
    });

    const text = response.text || "";
    if (!text) throw new Error("A IA retornou uma resposta vazia.");
    
    const raw = JSON.parse(text.trim());
    
    return {
      razaoSocial: raw.razaoSocial || "N/I",
      cnpj: Array.isArray(raw.cnpj) ? raw.cnpj : [raw.cnpj].filter(Boolean),
      marca: raw.marca || "N/I",
      descricaoProduto: raw.descricaoProduto || "N/I",
      conteudo: raw.conteudo || "N/I",
      endereco: raw.endereco || "N/I",
      cep: raw.cep || "N/I",
      telefone: raw.telefone || "N/I",
      site: raw.site || "N/I",
      fabricanteEmbalagem: raw.fabricanteEmbalagem || "N/I",
      moldagem: (raw.moldagem || "N/I").toUpperCase(),
      formatoEmbalagem: (raw.formatoEmbalagem || "N/I").toUpperCase(),
      tipoEmbalagem: (raw.tipoEmbalagem || "POTE").toUpperCase(),
      modeloEmbalagem: raw.modeloEmbalagem || "N/I",
      dataLeitura: new Date().toLocaleString('pt-BR')
    };
  } catch (error: any) {
    console.error("DETALHES DO ERRO IA:", error);
    const errorMsg = error.message || "Erro desconhecido na API";
    throw new Error(`Erro Gemini: ${errorMsg}`);
  }
}
