
import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedData } from "../types";

// Função para extrair dados técnicos de embalagens a partir de fotos usando o Gemini 3 Pro
export async function extractDataFromPhotos(photos: string[]): Promise<ExtractedData> {
  // Inicializa o cliente Gemini com a chave de API do ambiente diretamente na criação da instância
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    // Prepara as partes de imagem para o modelo
    const prepareImagePart = (base64: string) => {
      const match = base64.match(/^data:(image\/[a-zA-Z0-9\-\+\.]+);base64,/);
      const mimeType = match ? match[1] : "image/jpeg";
      const data = base64.includes(',') ? base64.split(',')[1] : base64;
      return { inlineData: { mimeType, data } };
    };

    // Solicita a extração de dados técnicos usando o modelo Gemini 3 Pro para tarefas complexas
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: [
        {
          parts: [
            { text: "Analise as imagens desta embalagem industrial e extraia os dados técnicos. \n\nREGRAS DE NEGÓCIO:\n1. MOLDAGEM: Identifique se é 'TERMOFORMADO' ou 'INJETADO'.\n2. FORMATO: 'REDONDO', 'RETANGULAR', 'QUADRADO' ou 'OVAL'.\n3. FABRICANTE DA PEÇA: Procure por logotipos no fundo da peça plástica. Exemplos comuns: FIBRASA, BOMIX, REAL PLASTIC, JAGUAR, IDM, AMCOR, RIOPLASTIC, BARRIPACK, UP&IB, METAL G.\n4. CNPJ: Extraia todos os CNPJs visíveis e coloque no array." },
            ...photos.map(prepareImagePart)
          ]
        }
      ],
      config: {
        systemInstruction: "Você é um especialista em auditoria de embalagens plásticas. Gere um JSON puro com os campos: razaoSocial, cnpj (array), marca, descricaoProduto, conteudo, endereco, cep, telefone, site, fabricanteEmbalagem, moldagem, formatoEmbalagem, tipoEmbalagem, modeloEmbalagem. Use 'N/I' para campos não identificados.",
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

    // Extrai o texto da resposta utilizando a propriedade .text recomendada
    const text = response.text || "";
    
    // Converte a string JSON para objeto
    const raw = JSON.parse(text.trim() || "{}");
    
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
  } catch (error: any) {
    console.error("DETALHES DO ERRO IA:", error);
    throw new Error(error.message || "Falha na comunicação com o servidor de IA.");
  }
}
