
import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedData } from "../types";

export async function extractDataFromPhotos(photos: string[]): Promise<ExtractedData> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const prepareImagePart = (base64: string) => {
      const match = base64.match(/^data:(image\/[a-zA-Z0-9\-\+\.]+);base64,/);
      const mimeType = match ? match[1] : "image/jpeg";
      const data = base64.includes(',') ? base64.split(',')[1] : base64;
      return { inlineData: { mimeType, data } };
    };

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: "Extraia rigorosamente as 14 informações contidas nesta embalagem para a Lista de Prospecção Industrial. \n\nMANUTENÇÃO DE PADRÃO:\n1. MOLDAGEM: Analise se é 'TERMOFORMADO' (paredes finas) ou 'INJETADO' (rígido/pesado).\n2. FORMATO: Apenas 'REDONDO', 'RETANGULAR', 'QUADRADO' ou 'OVAL'.\n3. TIPO: 'BALDE', 'COPO' ou 'POTE'.\n4. FABRICANTE: Verifique o fundo da embalagem. Fabricantes conhecidos: FIBRASA, BOMIX, REAL PLASTIC, JAGUAR, IDM, AMCOR, RIOPLASTIC (RP), BARRIPACK, UP&IB, METAL G." },
            ...photos.map(prepareImagePart)
          ]
        }
      ],
      config: {
        systemInstruction: "Você é um auditor de prospecção técnica. Gere um JSON com os 14 campos: razaoSocial, cnpj (array), marca, descricaoProduto, conteudo, endereco, cep, telefone, site, fabricanteEmbalagem, moldagem, formatoEmbalagem, tipoEmbalagem, modeloEmbalagem. Se não houver dado, use 'N/I'. No campo fabricanteEmbalagem, busque por logotipos ou nomes no fundo da peça plástica como FIBRASA, BOMIX, REAL PLASTIC, JAGUAR, IDM, AMCOR, RIOPLASTIC (RP), BARRIPACK, UP&IB ou METAL G.",
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
          required: ["razaoSocial", "cnpj", "tipoEmbalagem", "moldagem"]
        }
      }
    });

    const raw = JSON.parse(response.text || "{}");
    
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
      moldagem: (raw.moldagem || "TERMOFORMADO").toUpperCase(),
      formatoEmbalagem: (raw.formatoEmbalagem || "REDONDO").toUpperCase(),
      tipoEmbalagem: (raw.tipoEmbalagem || "POTE").toUpperCase(),
      modeloEmbalagem: raw.modeloEmbalagem || "N/I",
      dataLeitura: new Date().toLocaleString('pt-BR')
    };
  } catch (error) {
    throw new Error("Falha na extração de dados via IA.");
  }
}
