
import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedData } from "../types";

export async function extractDataFromPhotos(photos: string[]): Promise<ExtractedData> {
  console.log("Iniciando extração com Gemini 3 Flash... Fotos recebidas:", photos.length);
  
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("ERRO: API_KEY não encontrada em process.env");
    throw new Error("Configuração ausente: Chave de API não detectada.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    // Preparar as partes de imagem
    const imageParts = photos.map(base64 => {
      const match = base64.match(/^data:(image\/[a-zA-Z0-9\-\+\.]+);base64,/);
      const mimeType = match ? match[1] : "image/jpeg";
      const data = base64.includes(',') ? base64.split(',')[1] : base64;
      return {
        inlineData: { mimeType, data }
      };
    });

    console.log("Enviando requisição ao modelo gemini-3-flash-preview...");

    // Chamada otimizada seguindo estritamente os novos padrões do SDK
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { text: "Analise estas imagens de embalagem industrial. Extraia: Razão Social da empresa, todos os CNPJs visíveis, Marca do produto, Descrição técnica, Fabricante da embalagem plástica (ex: Fibrasa, Bomix), Moldagem (TERMOFORMADO ou INJETADO) e Formato (REDONDO, RETANGULAR, etc)." },
          ...imageParts
        ]
      },
      config: {
        systemInstruction: "Você é um especialista em OCR industrial. Extraia dados técnicos e responda EXCLUSIVAMENTE em formato JSON puro. Se não encontrar um dado, use 'N/I'.",
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

    const textOutput = response.text;
    console.log("Resposta bruta da IA recebida:", textOutput ? "Sucesso" : "Vazia");

    if (!textOutput) {
      throw new Error("A IA não retornou nenhum texto processável.");
    }

    const raw = JSON.parse(textOutput.trim());
    
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
    console.error("FALHA NA EXTRAÇÃO GEMINI:", error);
    throw new Error(`Falha na análise: ${error.message || "Erro desconhecido na IA"}`);
  }
}
