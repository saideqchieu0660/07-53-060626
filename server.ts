console.log("Initializing API Server...");
import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();
console.log("Environment configuration loaded.");

// --- DEFENSIVE BOOT STRAPPING MECHANISM ---
import admin from 'firebase-admin';

function initializeGoogleServiceAccount() {
  try {
    const rawServiceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    
    if (!rawServiceAccount) {
      console.warn("⚠️ [Service Account] GOOGLE_SERVICE_ACCOUNT_KEY is missing. Firebase Admin integrations will not work until configured.");
      return;
    }

    // Defensively target both Vercel newline anomalies and literal slash escapes
    const sanitizedServiceAccount = rawServiceAccount
      .replace(/\\n/g, '\n')
      .trim();

    const serviceAccountObj = JSON.parse(sanitizedServiceAccount);
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = sanitizedServiceAccount; // Inject sanitized payload back to ENV
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountObj)
      });
    }

    console.log("🚀 [Service Account SDK] Initialized successfully with defensive regex parsing.");
  } catch (error: any) {
    console.error("🚨 [CRITICAL BACKEND CRASH] Service Account initialization failed on boot:", error.message);
    // Do not let the raw exception crash the worker thread silently, wrap it cleanly
  }
}
initializeGoogleServiceAccount();

// Rate Limit Defense: Dynamic Round-Robin API Key Manager
const GEMINI_KEYS = Object.keys(process.env)
  .filter(key => key.startsWith('GEMINI_API_KEY_'))
  .sort((a, b) => {
    const numA = parseInt(a.replace('GEMINI_API_KEY_', '')) || 0;
    const numB = parseInt(b.replace('GEMINI_API_KEY_', '')) || 0;
    return numA - numB;
  })
  .map(key => process.env[key])
  .filter(Boolean) as string[];

// Fallback to GEMINI_API_KEY if no numbered keys found
if (GEMINI_KEYS.length === 0 && process.env.GEMINI_API_KEY) {
    GEMINI_KEYS.push(process.env.GEMINI_API_KEY);
}

interface KeyState {
  index: number;
  key: string;
  maskedKey: string;
  status: "active" | "rate_limited" | "failed";
  errorCount: number;
  usageCount: number;
  lastUsed: Date | null;
}

const geminiKeyStates: KeyState[] = GEMINI_KEYS.map((key, i) => ({
  index: i + 1,
  key,
  maskedKey: `***${key.slice(-4)}`,
  status: "active",
  errorCount: 0,
  usageCount: 0,
  lastUsed: null
}));

let currentKeyIndex = 0;

interface RotationLog {
  id: string;
  timestamp: string;
  fromKeyIndex?: number;
  toKeyIndex: number;
  reason: string;
}

const rotationLogs: RotationLog[] = [];

const updateKeyMetrics = async (index: number, metric: "usage" | "error") => {
  // Use Firebase Client SDK to hit firestore REST API directly
  // avoiding firebase-admin entirely to assure it works on Vercel without admin cert
  if (process.env.VITE_FIREBASE_PROJECT_ID) {
     try {
        const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
        const docId = `api_key_${index}`;
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/system_metrics/${docId}?updateMask=${metric}Count`;
        
        // This relies on the public write rule we added to firestore.rules
        // Using HTTP REST API to avoid bundling full firebase client in the backend
        
        // Let's first read the current to see if it exists
        const getRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/system_metrics/${docId}`);
        const currentData = getRes.ok ? await getRes.json() : null;
        
        let currentCount = 0;
        if (currentData && currentData.fields && currentData.fields[`${metric}Count`]) {
            currentCount = parseInt(currentData.fields[`${metric}Count`].integerValue || 0);
        }
        
        const fields: any = {};
        fields[`${metric}Count`] = { integerValue: currentCount + 1 };
        
        if (metric === "usage") {
           fields["lastUsed"] = { timestampValue: new Date().toISOString() };
           url.replace(`updateMask=${metric}Count`, `updateMask=${metric}Count&updateMask=lastUsed`);
        }

        await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/system_metrics/${docId}`, {
           method: "PATCH",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ fields })
        });
     } catch (err) {
        console.error("Firestore global metrics error:", err);
     }
  }
};

function addRotationLog(log: Omit<RotationLog, "timestamp" | "id">) {
  rotationLogs.unshift({ 
    ...log, 
    id: Math.random().toString(36).substring(7),
    timestamp: new Date().toISOString() 
  });
  if (rotationLogs.length > 20) {
    rotationLogs.pop();
  }
}

function getGeminiClient(): { ai: any, state: KeyState } {
  if (geminiKeyStates.length === 0) {
    throw new Error("No Gemini API keys configured.");
  }
  
  // 1. Recover keys that have been rate limited for over 60 seconds
  const now = Date.now();
  geminiKeyStates.forEach(s => {
    if (s.status === "rate_limited" && s.lastUsed && (now - s.lastUsed.getTime() > 60000)) {
       s.status = "active";
       addRotationLog({
         toKeyIndex: s.index,
         reason: "Key auto-recovered from rate limit cooldown (60s)"
       });
    }
  });

  // 2. Find the next active key
  let attempts = 0;
  let selectedState: KeyState | null = null;
  let originalIndex = currentKeyIndex;
  let skippedIndices: number[] = [];
  
  while (attempts < geminiKeyStates.length) {
    const s = geminiKeyStates[currentKeyIndex];
    if (s.status !== "rate_limited") {
       selectedState = s;
       break;
    }
    skippedIndices.push(currentKeyIndex);
    currentKeyIndex = (currentKeyIndex + 1) % geminiKeyStates.length;
    attempts++;
  }

  // 3. Fallback: If all keys are rate limited, pick the one with the lowest usage or the one we are at
  if (!selectedState) {
    selectedState = geminiKeyStates[currentKeyIndex];
    addRotationLog({
       fromKeyIndex: originalIndex,
       toKeyIndex: selectedState.index,
       reason: "All keys rate limited. Forced fallback to current index."
    });
  } else if (skippedIndices.length > 0) {
    addRotationLog({
       fromKeyIndex: originalIndex,
       toKeyIndex: selectedState.index,
       reason: `Skipped rate-limited keys: [${skippedIndices.join(', ')}]`
    });
  }
  
  selectedState.usageCount++;
  selectedState.lastUsed = new Date();
  updateKeyMetrics(selectedState.index, "usage");
  
  const ai = new GoogleGenAI({ apiKey: selectedState.key });
  currentKeyIndex = (currentKeyIndex + 1) % geminiKeyStates.length;
  
  return { ai, state: selectedState };
}

function handleGeminiError(state: KeyState, err: any) {
  state.errorCount++;
  updateKeyMetrics(state.index, "error");
  const msg = err?.message || err?.toString() || "";
  if (err?.status === 429 || msg.includes("429") || msg.includes("quota") || msg.toLowerCase().includes("too many requests") || msg.toLowerCase().includes("exhausted") || msg.toLowerCase().includes("limit exceed")) {
    state.status = "rate_limited";
    addRotationLog({
      toKeyIndex: state.index,
      reason: `Rate Limited / Quota Exceeded. Error: ${msg.substring(0, 100)}`
    });
  } else if (err?.status === 503 || msg.includes("503") || msg.includes("high demand") || msg.includes("overloaded")) {
    // 503 often happens on specific models, marking as rate limited to force rotation
    state.status = "rate_limited";
    addRotationLog({
      toKeyIndex: state.index,
      reason: `503 High Demand / Overloaded. Error: ${msg.substring(0, 100)}`
    });
  } else {
    state.status = "failed";
    addRotationLog({
      toKeyIndex: state.index,
      reason: `API Error. Msg: ${msg.substring(0, 100)}`
    });
  }
}

async function executeGeminiWithRetry<T>(operation: (ai: any) => Promise<T>): Promise<T> {
  const maxAttempts = Math.max(1, geminiKeyStates.length);
  let lastError: any;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { ai, state } = getGeminiClient();
    try {
      return await operation(ai);
    } catch (error: any) {
      handleGeminiError(state, error);
      lastError = error;
      const msg = error?.message || error?.toString() || "";
      const isRetryable = error?.status === 429 || msg.includes("429") || msg.includes("quota") || msg.toLowerCase().includes("too many requests") || msg.toLowerCase().includes("exhausted") || msg.toLowerCase().includes("limit exceed") || error?.status === 503 || msg.includes("503") || msg.includes("high demand") || msg.includes("overloaded");
      if (isRetryable && attempt < maxAttempts - 1) {
        console.warn(`[Gemini Retry] Key ${state.index} failed with ${error?.status || msg.substring(0, 50)}. Retrying with next key... (${attempt + 1}/${maxAttempts})`);
        await delay(500); // short backoff before trying next key
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// JWT Helper for Firebase ID Tokens
  const decodeFirebaseToken = (token: string) => {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const payload = Buffer.from(parts[1], "base64").toString("utf8");
      return JSON.parse(payload);
    } catch (e) {
      return null;
    }
  };

  // Safe Firestore REST API fetch for securing user roles
  const getUserRoleFromFirestore = async (userId: string, idToken: string): Promise<string | null> => {
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
    if (!projectId) {
      return null;
    }
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}`;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${idToken}`
        }
      });
      if (!res.ok) {
        console.error(`Firestore API check failed for user ${userId}:`, res.status);
        return null;
      }
      const docData = await res.json();
      return docData?.fields?.role?.stringValue || null;
    } catch (error) {
      console.error(`Error fetching user role from Firestore REST API:`, error);
      return null;
    }
  };

  // Rate Limit Defense: In-memory store for student AI cooldown tracking (5 seconds)
  const studentAICooldowns = new Map<string, number>();

  // Simple periodic cleanup to prevent memory growth (removes expired keys older than 1 minute)
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of studentAICooldowns.entries()) {
      if (now - timestamp > 60000) {
        studentAICooldowns.delete(key);
      }
    }
  }, 60000);

  // Authenticated Robust Cooldown Filter
  const aiCooldownMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    let userId = req.headers["x-user-id"] as string;
    let userRole = req.headers["x-user-role"] as string;

    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const idToken = authHeader.substring(7);
      const decoded = decodeFirebaseToken(idToken);
      if (decoded && decoded.user_id) {
        userId = decoded.user_id;
        // Authenticate token to fetch exact role from Firestore DB
        const dbRole = await getUserRoleFromFirestore(userId, idToken);
        if (dbRole) {
          userRole = dbRole;
        }
      }
    }

    if (userRole === "student" && userId) {
      const lastRequest = studentAICooldowns.get(userId);
      const now = Date.now();
      if (lastRequest && now - lastRequest < 5000) {
        const timeLeft = Math.ceil((5000 - (now - lastRequest)) / 1000);
        return res.status(429).json({
          error: `Bạn đang trong trạng thái đóng băng thời gian gọi AI (Cooldown 5 giây). Hãy đợi thêm ${timeLeft} giây nữa.`
        });
      }
      studentAICooldowns.set(userId, now);
    }
    next();
  };





  // Agent 2: Dynamic Router Agent (Deep Extract)
  app.post("/api/agent2/explain", aiCooldownMiddleware, async (req, res, next) => {
    try {
      const { term, definition, subject } = req.body;
      
      let prompt = "";
      if (subject === "english") {
        prompt = `Phân tích từ vựng tiếng Anh "${term}" (Định nghĩa: ${definition}). 
YÊU CẦU QUAN TRỌNG NHẤT:
1. ĐI THẲNG VÀO NỘI DUNG, TUYỆT ĐỐI KHÔNG xài lời chào hỏi xã giao (như "Chào bạn", "Đây là...").
2. Giải thích CỰC KỲ NGẮN GỌN, độ dài khoảng tối đa 100 chữ.
3. BẮT BUỘC kết thúc bằng 1 câu hỏi gợi mở để giúp học sinh mở rộng và phát triển kiến thức liên quan đến từ/cụm từ này.
Cấu trúc yêu cầu (có dùng emoji cho sinh động): 
- Ý nghĩa & Phiên âm.
- 1 Ví dụ minh hoạ thực tế.
- Câu hỏi gợi mở.
Chỉ trả ra nội dung phân tích (markdown).`;
      } else {
        prompt = `Phân tích khái niệm "${term}" (Định nghĩa: ${definition}).
YÊU CẦU QUAN TRỌNG NHẤT:
1. ĐI THẲNG VÀO NỘI DUNG, TUYỆT ĐỐI KHÔNG có lời chào hỏi xã giao hay câu mào đầu.
2. Dài khoảng tối đa 100 chữ, giải thích bản chất cốt lõi cực kỳ súc tích, dễ hiểu.
3. BẮT BUỘC kết thúc bằng 1 câu hỏi gợi mở liên quan đến ứng dụng hoặc tính chất cốt lõi để thúc đẩy học sinh tự suy nghĩ và phát triển kiến thức.
Bọc công thức Toán/Lý/Hóa bằng LaTeX (dấu $ hoặc $$). Chỉ trả ra nội dung (markdown).`;
      }

      const responseText = await executeGeminiWithRetry(async (ai) => {
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
          });
          return response.text;
      });
      
      res.json({ result: responseText });
    } catch (error) {
      console.error("Agent 2 Error:", error);
      next(error);
    }
  });

  // Mock Exam Generator
  app.post("/api/exam/generate", aiCooldownMiddleware, async (req, res, next) => {
    try {
      const { decks, examType, count } = req.body;

      const contextData = JSON.stringify(decks.map((d: any) => ({
        deckId: d.id,
        deckTitle: d.title,
        cards: d.cards.map((c: any) => ({ cardId: c.id, front: c.front, back: c.back }))
      })));

      let prompt = `Bạn là một AI được thiết kế để tạo bài kiểm tra tự động từ các thẻ (flashcards) được cung cấp.
Dữ liệu Flashcards:
${contextData}

Yêu cầu: Hãy tạo một đề thi gồm ${count || 10} câu hỏi trắc nghiệm (Multiple Choice) từ các flashcards này. Mỗi thẻ có thể dùng để tạo câu hỏi về nội dung "front" hỏi "back" hoặc ngược lại, hoặc suy luận từ nội dung. Các lựa chọn sai (distractors) phải hợp lý và không quá dễ đoán. Đảo lộn vị trí đáp án đúng.
ĐIỀU KIỆN TIÊN QUYẾT: Khi sinh ra các tùy chọn A, B, C, D cho câu hỏi trắc nghiệm, câu trả lời đúng PHẢI ĐƯỢC PHÂN PHỐI NGẪU NHIÊN hoàn toàn giữa 4 vị trí A, B, C, D đối với từng câu hỏi riêng biệt. Tuyệt đối không được cố định đáp án đúng vào bất kỳ một vị trí nào.

BẮT BUỘC ĐỊNH DẠNG: Chỉ trả về ĐÚNG MỘT MẢNG JSON duy nhất, không markdown code block, không text thừa.
Định dạng JSON:
[
  {
    "cardId": "string - ID của thẻ đang được kiểm tra",
    "deckId": "string - ID của deck chứa thẻ này",
    "question": "string - Câu hỏi trắc nghiệm",
    "options": ["string", "string", "string", "string"],
    "correctAnswerIndex": number - Chỉ số của đáp án đúng (từ 0 đến 3),
    "explanation": "string - Giải thích ngắn vì sao lại chọn đáp án này"
  }
]`;

      const responseText = await executeGeminiWithRetry(async (ai) => {
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: 0.3
            }
          });
          return response.text;
      });

      res.json({ result: responseText });
    } catch (error) {
      console.error("Exam Generation Error:", error);
      next(error);
    }
  });

  // Agent 4: Convert Document to JSON (Streaming API + Chunking)
  app.post("/api/convert-document", aiCooldownMiddleware, async (req, res, next) => {
    try {
      const { fileData, mimeType } = req.body;

      if (!fileData) {
        return res.status(400).json({ error: true, message: "Không tìm thấy dữ liệu file", path: req.originalUrl });
      }

      const base64Data = fileData.split(',').pop() || fileData;

      // Start streaming response to prevent timeout
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      res.write(JSON.stringify({ status: "Đang đọc nội dung gốc từ file..." }) + "\n");
      
      let rawText = "";
      
      let extractRetryAttempts = 0;
      while (extractRetryAttempts < 3) {
         try {
            const extractRes = await executeGeminiWithRetry(async (ai) => {
                return await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: [
                       { text: "Extract ALL text from this document comprehensively and literally. Do not summarize or explain." },
                       { inlineData: { data: base64Data, mimeType: mimeType || "application/pdf" } }
                    ]
                });
            });
            rawText = extractRes.text || "";
            break;
         } catch (err: any) {
            extractRetryAttempts++;
            console.error(`Lỗi Extract File (Lần ${extractRetryAttempts}/3):`, err);
            if (extractRetryAttempts < 3) {
               res.write(JSON.stringify({ status: `Hệ thống AI đang quá tải (High Demand). Đang hoãn nhịp 20 giây trước khi thử lại... (Lần thử ${extractRetryAttempts}/3)` }) + "\n");
               await delay(20000);
            } else {
               throw new Error("Lỗi khi đọc text từ file: " + err.message);
            }
         }
      }

      if (!rawText.trim()) {
         throw new Error("Không thể trích xuất văn bản từ file. Vui lòng đảm bảo file rõ nét và không bị mã hoá.");
      }

      // 1. Phân tách toàn bộ text thành mảng từ tiếng Anh (tạm thời cắt theo line hoặc cụm nhỏ)
      // Cắt theo dữ liệu dòng (mỗi dòng tương ứng 1 từ vựng thô) để đảm bảo tính toàn vẹn của từng mục
      const rawWords = rawText.split(/\n+/).map(w => w.trim()).filter(w => w.length > 0);
      
      const CHUNK_SIZE = 20;
      const chunks = [];
      for (let i = 0; i < rawWords.length; i += CHUNK_SIZE) {
         chunks.push(rawWords.slice(i, i + CHUNK_SIZE));
      }

      res.write(JSON.stringify({ status: `Đã băm file thành ${chunks.length} cụm cục bộ (Mỗi cụm tối đa 20 từ). Bắt đầu xử lý AI...` }) + "\n");

      for (let i = 0; i < chunks.length; i++) {
         const chunkWords = chunks[i];
         res.write(JSON.stringify({ status: `Đang gửi Cụm ${i+1}/${chunks.length} cho AI bóc tách...` }) + "\n");

         const prompt = `[STRICT DETERMINISTIC MODE] Bạn là một cỗ máy biên dịch dữ liệu (Data Compiler).
Hãy trích xuất và tối ưu hoá Flashcard từ cụm ${chunkWords.length} từ thô dưới đây.
BẮT BUỘC ĐỊNH DẠNG JSON MẢNG TƯƠNG THÍCH HOÀN TOÀN NHƯ SAU:
[
  {
    "front": "Từ khóa / Cụm từ tiếng Anh",
    "wordForm": "noun / verb / adjective / adverb / idiom / collocation",
    "back": "Phiên âm IPA - Nghĩa tiếng Việt ngắn gọn - Ví dụ cụ thể"
  }
]
- Tách riêng Từ loại (Word Form) CHÍNH XÁC. KHÔNG gộp từ loại vào trường front hay back.
- TRẢ VỀ ĐÚNG MỘT MẢNG JSON, KHÔNG CÓ MARKDOWN CODE BLOCK (\`\`\`json). KHÔNG GIẢI THÍCH GÌ THÊM.
- BẮT BUỘC TRẢ VỀ SỐ LƯỢNG THẺ FLASHCARDS BẰNG CHÍNH XÁC SỐ LƯỢNG TỪ GỐC GỬI LÊN. Không được gộp, không được bỏ sót. Số lượng thẻ phải đúng bằng ${chunkWords.length}!

CỤM TỪ THÔ CẦN XỬ LÝ (Mỗi dòng là một phần tử yêu cầu 1 flashcard tương ứng):
${chunkWords.join("\n")}`;

         let chunkJsonText = "";
         let retryAttempts = 0;
         let parseSuccess = false;
         
         while (retryAttempts < 3 && !parseSuccess) {
            try {
               const { ai, state } = getGeminiClient();
               const chunkRes = await ai.models.generateContent({
                  model: "gemini-2.5-flash",
                  contents: [{ text: prompt }],
                  config: {
                     temperature: 0.1
                  }
               });
               chunkJsonText = (chunkRes.text || "").trim();
               
               // Loại bỏ markdown block nếu có
               const cleanJsonText = chunkJsonText.replace(/```(?:json)?/g, "").trim();
               
               const chunkArr = JSON.parse(cleanJsonText);
               if (Array.isArray(chunkArr) && chunkArr.length > 0) {
                  // KIỂM ĐỊNH BIÊN LAI DỮ LIỆU: Số lượng thẻ phải khớp chính xác 100% với số lượng từ gốc trong cụm
                  const isValidLength = chunkArr.length === chunkWords.length; 
                  
                  if (isValidLength) {
                     res.write(JSON.stringify({ 
                        flashcards: chunkArr
                     }) + "\n");
                     parseSuccess = true;
                  } else {
                     throw new Error(`Số lượng thẻ JSON sinh ra (${chunkArr.length}) KHÔNG KHỚP ĐÚNG với lượng từ gốc (${chunkWords.length}). Tự động xoay tua API Key để Retry...`);
                  }
               } else {
                  throw new Error("Không trả về mảng JSON hợp lệ");
               }
            } catch (chunkErr: any) {
               retryAttempts++;
               console.error(`Lỗi Cụm ${i+1} (Lần ${retryAttempts}/3):`, chunkErr.message);
               
               if (retryAttempts < 3) {
                  res.write(JSON.stringify({ status: `Lỗi sai lệch dữ liệu JSON chặn cụt. Xoay sang API Key kế tiếp và thử lại cụm ${i+1}... (Lần ${retryAttempts}/3)` }) + "\n");
               } else {
                  res.write(JSON.stringify({ status: `Warning: Bỏ qua Cụm ${i+1} do lỗi liên tục 3 lần.` }) + "\n");
               }
            }
         }
         
         const percent = Math.round(((i + 1) / chunks.length) * 100);
         res.write(JSON.stringify({ progress: percent }) + "\n");

         if (i < chunks.length - 1 && parseSuccess) {
            res.write(JSON.stringify({ status: `Cụm ${i+1} thành công! Đang hoãn nhịp an toàn 20s (Sequential Delay) trước khi lấy cụm ${i+2}...` }) + "\n");
            await delay(20000);
         }
      }

      res.write(JSON.stringify({ done: true, status: "Hoàn tất phân tích 100%!" }) + "\n");
      res.end();

    } catch (error: any) {
      console.error("Agent 4 Convert Document Error:", error);
      if (!res.headersSent) {
          next(error);
      } else {
          res.write(JSON.stringify({ error: true, message: error.message || "Lỗi xử lý luồng stream", path: req.originalUrl }) + "\n");
          res.end();
      }
    }
  });

  // AI Quick Lesson Plan Generator (Tạo Giáo Án Nhanh)
  app.post("/api/agent/lesson-plan", aiCooldownMiddleware, async (req, res, next) => {
    try {
      const { topic } = req.body;
      if (!topic) return res.status(400).json({ error: "No topic provided." });
      
      let prompt = `Bạn là một chuyên gia thiết kế chương trình giảng dạy (Instructional Designer).
Hãy tạo một giáo án học tập tối ưu cho chủ đề: "${topic}".
Giáo án cần đảm bảo đủ kiến thức sâu sắc, logic và dễ hiểu.
KHÔNG sử dụng Markdown code block. TRẢ VỀ ĐÚNG MỘT OBJECT JSON DUY NHẤT.

Định dạng JSON:
{
  "roadmap": [
    { "step": 1, "title": "Tên bài học", "description": "Mô tả ngắn gọn" }
  ],
  "concepts": [
    { "term": "Khái niệm", "definition": "Định nghĩa hoặc giải thích dễ hiểu" }
  ],
  "flashcards": [
    { "front": "Câu hỏi/Từ khóa", "back": "Câu trả lời/Định nghĩa", "subject": "${topic}" }
  ]
}`;

      const responseText = await executeGeminiWithRetry(async (ai) => {
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: 0.3
            }
          });
          return response.text;
      });
      
      res.json({ result: responseText });
    } catch (error: any) {
      console.error("Lesson Plan Error:", error);
      next(error);
    }
  });

  // Agent 3: Socratic & Context-Aware Assistant
  app.post("/api/agent3/chat", aiCooldownMiddleware, async (req, res, next) => {
    try {
      const { message, history, context, mode, mcqData, difficulty, sessionId } = req.body;
      
      let systemPrompt = `Mày là Agent 3 - 'Socrates AI Coach', gia sư học tập chủ động. QUY TẮC BẮT BUỘC CỐT LÕI:
1. TRẢ LỜI NGẮN GỌN (Dưới 100 chữ). ĐI THẲNG VÀO NỘI DUNG, TUYỆT ĐỐI BỎ QUA MỌI LỜI CHÀO HỎI (VD: Không được nói "Chào em", "Chào bạn", "Tôi là...").
2. SOCRATIC METHOD: KHÔNG BAO GIỜ giải bài tập hộ hay cho đáp án trực tiếp. LUÔN KẾT THÚC BẰNG 1 CÂU HỎI GỢI MỞ để học sinh tự suy luận và phát triển kiến thức.
3. CONTEXT-AWARE: Mày sẽ nhận được Context ẩn. Tự động liên kết với Context đó để trả lời nếu học sinh hỏi trống không.
4. FORMATTING: Dùng LaTeX ($$, $) cho mọi công thức Toán/Lý/Hóa.`;

      if (mode === "quiz") {
          const diffLevel = difficulty || "medium";
          systemPrompt += `\n\nNhiệm vụ: Tạo một trò chơi trắc nghiệm 3 câu hỏi liên tiếp dựa trên context thẻ yếu được cung cấp. Cấp độ khó: ${diffLevel}. Đầu vào là yêu cầu người dùng: ${message}`;
          if (mcqData) {
            let difficultyGuidance = "Cấp độ trung bình.";
            if (diffLevel === "easy") difficultyGuidance = "Cấp độ dễ: Hỏi trực tiếp định nghĩa cơ bản, nhận biết trực tiếp.";
            if (diffLevel === "medium") difficultyGuidance = "Cấp độ trung bình: Yêu cầu hiểu sâu hơn, áp dụng cơ bản.";
            if (diffLevel === "hard") difficultyGuidance = "Cấp độ khó: Đánh đố, vận dụng cao, suy luận logic tổng hợp.";
            
            const mcqPrompt = `Tạo một bài Test 15 câu trắc nghiệm MCQ dựa trên danh sách các thẻ yếu sau đây. \nĐộ khó: ${difficultyGuidance}\nTrả về đúng 1 mảng JSON chứa các object: {"question": "...", "options": ["A...","B...","C...","D..."], "correctIndex": 0..3, "explanation": "..."}. KHÔNG trả về gì khác ngoài JSON.\nDữ liệu hổng kiến thức: ${JSON.stringify(mcqData)}`;
            
            const responseText = await executeGeminiWithRetry(async (ai) => {
                 const response = await ai.models.generateContent({
                     model: "gemini-2.5-flash",
                     contents: mcqPrompt,
                     config: { responseMimeType: "application/json" }
                 });
                 return response.text;
            });
            return res.json({ result: responseText });
          }
      }
      
      const fullPrompt = `Ngữ cảnh ẩn (Hidden Context): ${context}\n\nHọc sinh: ${message}`;

      // Convert client history format to Gemini format
      let previousHistory: any[] = [];
      if (history && Array.isArray(history)) {
        previousHistory = history.map(msg => ({
          role: msg.role === "ai" ? "model" : "user",
          parts: [{ text: msg.text }]
        }));
      }

      const contents = [
          { role: "user", parts: [{ text: systemPrompt }] },
          { role: "model", parts: [{ text: "Đã hiểu." }] },
          ...previousHistory,
          { role: "user", parts: [{ text: fullPrompt }] }
      ];

      const responseText = await executeGeminiWithRetry(async (ai) => {
          const response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: contents
          });
          return response.text || "";
      });

      res.json({ result: responseText });
    } catch (error: any) {
      console.error("Agent 3 Error:", error);
      next(error);
    }
  });

  // Admin Keys Status Endpoint
  let cachedFirestoreMetrics: Record<number, { usageCount: number, errorCount: number, lastUsed: Date | null }> = {};
  let lastFirestoreMetricsCacheTime = 0;

  app.get("/api/admin/keys-status", async (req, res) => {
    const adminKey = req.headers["x-admin-key"];
    if (adminKey !== process.env.VITE_ADMIN_KEY) {
      return res.status(403).json({ error: "Thao tác không hợp lệ. Sai admin key." });
    }
    
    // reset rate_limited to active if passed 60s
    const now = Date.now();
    geminiKeyStates.forEach(state => {
       if (state.status === "rate_limited" && state.lastUsed && (now - state.lastUsed.getTime() > 60000)) {
           state.status = "active";
       }
    });

    if (process.env.VITE_FIREBASE_PROJECT_ID && (now - lastFirestoreMetricsCacheTime > 15000)) {
      try {
        const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
        const resFb = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/system_metrics`);
        if (resFb.ok) {
           const data = await resFb.json();
           if (data.documents) {
              const freshMetrics: Record<number, any> = {};
              data.documents.forEach((doc: any) => {
                 const idMatch = doc.name.match(/api_key_(\d+)$/);
                 if (idMatch) {
                    const index = parseInt(idMatch[1]);
                    const fields = doc.fields || {};
                    freshMetrics[index] = {
                       usageCount: fields.usageCount ? parseInt(fields.usageCount.integerValue) : 0,
                       errorCount: fields.errorCount ? parseInt(fields.errorCount.integerValue) : 0,
                       lastUsed: fields.lastUsed ? new Date(fields.lastUsed.timestampValue) : null
                    };
                 }
              });
              cachedFirestoreMetrics = freshMetrics;
              lastFirestoreMetricsCacheTime = now;
           }
        }
      } catch (err) {
        console.error("Error fetching metrics from Firestore:", err);
      }
    }

    res.json({
       totalKeys: geminiKeyStates.length,
       currentIndex: currentKeyIndex,
       logs: rotationLogs,
       keys: geminiKeyStates.map(s => {
          const fsData = cachedFirestoreMetrics[s.index];
          return {
            index: s.index,
            maskedKey: s.maskedKey,
            status: s.status,
            usageCount: fsData ? Math.max(s.usageCount, fsData.usageCount) : s.usageCount,
            errorCount: fsData ? Math.max(s.errorCount, fsData.errorCount) : s.errorCount,
            lastUsed: fsData && fsData.lastUsed && (!s.lastUsed || fsData.lastUsed > s.lastUsed) 
                        ? fsData.lastUsed 
                        : s.lastUsed
          };
       })
    });
  });

  app.post("/api/daily-quest", express.json(), async (req, res, next) => {
    try {
      const { allCards } = req.body;
      if (!allCards || !Array.isArray(allCards)) {
        return res.status(400).json({ error: "Missing or invalid allCards array" });
      }

      const limit = 20;
      const newCardLimit = Math.floor(limit * 0.2); // 4 cards
      let reviewCardLimit = limit - newCardLimit;   // 16 cards

      const now = Date.now();

      // Process cards to determine New vs Review explicitly
      const processedCards = allCards.map(card => {
        const isNewCard = card.isNewCard !== undefined 
          ? card.isNewCard 
          : (card.repetitionCount === undefined || card.repetitionCount === 0);
        return { ...card, isNewCard };
      });

      const newCards = processedCards.filter(c => c.isNewCard);
      // Sort review cards so oldest due dates come first
      const reviewCards = processedCards
        .filter(c => !c.isNewCard && c.nextReviewDate && c.nextReviewDate <= now)
        .sort((a, b) => (a.nextReviewDate || 0) - (b.nextReviewDate || 0));

      let selectedNewCards = newCards.slice(0, newCardLimit);
      let selectedReviewCards = reviewCards.slice(0, reviewCardLimit);

      // Edge Cases: Not enough Review Cards
      if (selectedReviewCards.length < reviewCardLimit) {
         const missing = reviewCardLimit - selectedReviewCards.length;
         const additionalNewCards = newCards.slice(selectedNewCards.length, selectedNewCards.length + missing);
         selectedNewCards = [...selectedNewCards, ...additionalNewCards];
      }

      // Edge Cases: Not enough New Cards
      if (selectedNewCards.length < newCardLimit) {
         const missing = newCardLimit - selectedNewCards.length;
         const remainingReviewCards = reviewCards.slice(selectedReviewCards.length);
         const additionalReviewCards = remainingReviewCards.slice(0, missing);
         selectedReviewCards = [...selectedReviewCards, ...additionalReviewCards];
      }

      const combined = [...selectedNewCards, ...selectedReviewCards];
      
      // Shuffle combined sets
      for (let i = combined.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combined[i], combined[j]] = [combined[j], combined[i]];
      }

      return res.json({ cards: combined });
    } catch (error: any) {
      console.error("Daily Quest Error:", error);
      next(error);
    }
  });

// Global Error Handling Middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Error Caught:", err);
  
  const statusCode = err.status || 500;
  const isDev = process.env.NODE_ENV === "development";
  
  if (isDev) {
    res.status(statusCode).json({
      error: true,
      message: err.message || "Internal Server Error",
      path: req.originalUrl,
      stack: err.stack
    });
  } else {
    // Production: Hide stack trace details, show generic error if it's a 500 without a safe message
    res.status(statusCode).json({
      error: true,
      message: statusCode === 500 ? "Lỗi hệ thống máy chủ." : (err.message || "Lỗi không xác định"),
      path: req.originalUrl
    });
  }
});

// Vite middleware for development
async function setupViteAndStart() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

if (!process.env.VERCEL) {
  setupViteAndStart();
}

export default app;
