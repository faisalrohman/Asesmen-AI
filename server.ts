import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Schema } from "@google/genai";

function getGenAIClient(req: express.Request) {
  const customKey = req.headers['x-gemini-api-key'] as string;
  const apiKey = customKey || process.env.GEMINI_API_KEY;
  return new GoogleGenAI({ apiKey });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API endpoints
  app.post("/api/generate-assessment", async (req, res) => {
    try {
      const ai = getGenAIClient(req);
      const { 
        materiUtama, subMateri, tingkat, kelas, 
        jumlahMudah, jumlahSedang, jumlahSukar, 
        bentukSoal, stimulus,
        fileBase64, fileMimeType, fileName
      } = req.body;

      const totalSoal = jumlahMudah + jumlahSedang + jumlahSukar;
      let parts: any[] = [];

      if (fileBase64 && fileMimeType) {
        const prompt = `Anda adalah seorang ahli pembuat soal evaluasi dan asesmen (Guru Profesional). 
Diberikan sebuah dokumen terlampir berupa kisi-kisi (blueprint) asesmen. 
Tugas Anda adalah MEMBACA dengan teliti dokumen tersebut dan MEMBUAT bank soal asesmen yang SESUAI EXACTLY dengan spesifikasi dan indikator soal yang ada di dalamnya (mencakup jumlah soal tiap materi, bentuk soal, dan tingkat kesukaran/level kognitif).

PENTING: 
  1. WAJIB pastikan minimal 75% dari total soal memiliki "stimulus" berupa CERITA NARASI KONTEKS DUNIA NYATA DAN SEHARI-HARI yang PANJANG (WAJIB minimal 3 paragraf yang terdiri dari beberapa kalimat per paragraf). Cerita harus logis, deskriptif, informatif, dan realistis kehidupan nyata (format soal literasi AKM/PISA), BUKAN sekadar abstrak atau merangkum pertanyaan dari kisi-kisi. JANGAN HANYA 1 ATAU 2 KALIMAT. Buatlah cerita latar belakang yang sangat utuh dan bermakna!
  2. Untuk SETIAP stimulus cerita/paragraf, WAJIB sertakan ilustrasi gambar! Tuliskan deskripsi visualnya di atribut "imagePrompt" dengan format BAHASA INGGRIS yang pendek, murni huruf/angka tanpa karakter spesial (maksimal 15 kata). Contoh: "students buying food at school canteen".
  3. Ambil informasi nama materi/topik dari kisi-kisi dan jadikan materiUtama. 

Format output WAJIB JSON MURNI tanpa markdown blok, dengan struktur object schema berikut:
{
  "materiUtama": "Nama Materi/Mata Pelajaran (atau judul file)",
  "subMateri": "Sub materi (jika ada)",
  "tingkat": "Tingkat Pendidikan",
  "kelas": "Kelas",
  "questions": [
    {
      "id": "uuid",
      "difficulty": "Mudah|Sedang|Sukar",
      "type": "Pilihan Ganda|Pilihan Ganda Kompleks|Benar Salah|Isian Singkat|Essay",
      "stimulus": "Teks bacaan berupa cerita panjang...",
      "imagePrompt": "Deskripsi visual gambar (inggris, ringkas)...",
      "question": "Pertanyaan inti",
      "options": ["A. Opsi", "B. Opsi", "C. Opsi"],
      "answer": "Jawaban benar",
      "explanation": "Pembahasan rinci"
    }
  ]
}`;
        parts = [
          { inlineData: { data: fileBase64, mimeType: fileMimeType } },
          { text: prompt }
        ];

      } else {

        const prompt = `Anda adalah seorang ahli pembuat soal evaluasi dan asesmen (Guru Profesional). 
Buatkan soal asesmen dengan ketentuan berikut:
- Topik/Materi Utama: ${materiUtama}
- Sub Materi: ${subMateri}
- Tingkat Pendidikan: ${tingkat} (Kelas ${kelas})
- Total Soal: ${totalSoal} butir
  * Mudah: ${jumlahMudah} soal
  * Sedang: ${jumlahSedang} soal
  * Sukar (HOTS): ${jumlahSukar} soal
- Bentuk Soal yang diizinkan meliputi: ${bentukSoal.join(", ")}. Variasikan secara proporsional.
- Stimulus yang digunakan: ${stimulus.length > 0 ? stimulus.join(", ") : "Tidak ada stimulus khusus, gunakan kalimat langsung"}. 
  PENTING: 
  1. WAJIB pastikan minimal 75% dari total soal memiliki "stimulus" berupa CERITA NARASI KONTEKS DUNIA NYATA DAN SEHARI-HARI yang PANJANG (WAJIB minimal 3 paragraf yang terdiri dari beberapa kalimat per paragraf). Cerita harus logis, deskriptif, informatif, dan realistis kehidupan nyata (format soal literasi AKM/PISA), BUKAN sekadar pengantar 1-2 kalimat. Buatlah cerita latar belakang yang sangat utuh dan bermakna yang relevan dengan pertanyaan!
  2. Untuk SETIAP stimulus cerita/paragraf, WAJIB sertakan ilustrasi gambar! Tuliskan deskripsi visualnya di atribut "imagePrompt" dengan format BAHASA INGGRIS yang pendek, murni huruf/angka tanpa karakter spesial (maksimal 15 kata). Contoh: "students buying food at school canteen".
  3. Sisanya (maksimal 25% soal) boleh berupa soal langsung tanpa stimulus paragraf panjang.

 Format output harus berupa JSON murni dengan struktur persis seperti schema ini:
[
  {
    "id": "uuid atau angka unik",
    "difficulty": "Mudah|Sedang|Sukar",
    "type": "Pilihan Ganda|Pilihan Ganda Kompleks|Benar Salah|Isian Singkat|Essay",
    "stimulus": "Teks bacaan berupa cerita logis, tabel data, dll. Boleh kosong jika tidak ada teks.",
    "imagePrompt": "Deskripsi visual gambar yang sangat detail dalam Bahasa Inggris untuk meng-generate gambar ilustrasi sesungguhnya. Kosongkan jika tidak butuh gambar.",
    "question": "Pertanyaan inti",
    "options": ["A. Opsi 1", "B. Opsi 2", "C. Opsi 3", "D. Opsi 4", "E. Opsi 5"] -> hanya untuk Pilihan Ganda & Pilihan Ganda Kompleks. Kosongkan untuk tipe lain.,
    "answer": "Jawaban yang benar. Untuk Pilihan Ganda, sebutkan opsi yang benar (misal: A. Opsi 1). Untuk BS, sebutkan Benar/Salah.",
    "explanation": "Pembahasan rinci dari jawaban yang benar."
  }
]`;
        parts = [{ text: prompt }];
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: parts,
        config: {
          temperature: 0.7,
          responseMimeType: "application/json",
          systemInstruction: "You are an expert Indonesian teacher who writes high-quality assessment questions according to Indonesian curriculum standards.",
        }
      });
      
      const rawText = response.text;
      let parsed: any = [];
      try {
        parsed = JSON.parse(rawText || "[]");
      } catch (e) {
        console.error("Failed to parse JSON", rawText);
        // Fallback or cleanup
        const jsonMatch = rawText?.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      }

      let questionsArray = Array.isArray(parsed) ? parsed : (parsed.questions || []);
      let meta = !Array.isArray(parsed) ? parsed : {};

      // Add unique IDs if not present correctly
      questionsArray = questionsArray.map((item: any, idx: number) => ({
        ...item,
        id: item.id || `gen-${Date.now()}-${idx}`
      }));

      res.json({ questions: questionsArray, meta });
    } catch (error: any) {
      const isQuotaError = error.status === 429 || error.status === "RESOURCE_EXHAUSTED" || error.message?.toLowerCase().includes('quota') || error.message?.toLowerCase().includes('429') || JSON.stringify(error).includes('429') || JSON.stringify(error).includes('quota');
      if (!isQuotaError) {
        console.error(error);
      }
      res.status(isQuotaError ? 429 : 500).json({ 
        error: error.message || "Failed to generate assessment",
        isQuotaError: !!isQuotaError
      });
    }
  });

  app.post("/api/regenerate-question", async (req, res) => {
    try {
      const ai = getGenAIClient(req);
      const { question, action, customPrompt } = req.body;
      let actionPrompt = "";

      if (action === "stimulus") {
        actionPrompt = `Buatkan ulang bagian "stimulus" berupa teks/cerita dari soal berikut agar menjadi cerita paragraf kontekstual yang panjang (2-3 paragraf), logis, dan relevan (khususnya untuk literasi/numerasi). Pertahankan tingkat kesukaran dan materi.`;
      } else if (action === "image") {
        actionPrompt = `Ubah nilai atribut "imagePrompt" dengan deskripsi visual BARU yang SANGAT BERBEDA dari sebelumnya untuk menghasilkan gambar baru, namun tetap relevan dengan isi stimulus. Gunakan BAHASA INGGRIS, format ringkas (maks 15 kata), hanya huruf dan spasi (tanpa karakter spesial). JANGAN SAMA DENGAN imagePrompt SEBELUMNYA. Jika soal tidak punya imagePrompt, tambahkan.`;
      } else if (action === "full") {
         actionPrompt = `Buatkan ulang seluruh soal ini (termasuk pertanyaan, opsi jika ada, dan pembahasan) dengan konsep yang sama namun sudut pandang yang berbeda. Tingkat kesukaran: ${question.difficulty}, Tipe: ${question.type}.`;
      } else if (action === "custom") {
         actionPrompt = `Revisi soal berikut berdasarkan instruksi tambahan ini: "${customPrompt}". Pastikan memperbaiki bagian yang diminta. Tingkat kesukaran: ${question.difficulty}, Tipe: ${question.type}.`;
      } else {
        return res.status(400).json({ error: "Invalid action" });
      }

      const prompt = `${actionPrompt}

Data Soal Saat Ini:
` + JSON.stringify(question, null, 2) + `

PENTING:
Wajib kembalikan HANYA 1 buah objek JSON murni (TIDAK dalam bentuk array). Struktur KEY harus sama persis dengan aslinya (id, type, difficulty, stimulus, imagePrompt, question, options, answer, explanation). Pastikan semua nilai diperbarui jika perlu, dan untuk action="image", pastikan properti imagePrompt diubah ke string bahasa inggris yang baru.`;

      const response = await ai.models.generateContent({
             model: "gemini-3-flash-preview",
             contents: prompt,
             config: {
               temperature: 0.8,
               responseMimeType: "application/json",
             }
      });

      const parsed = JSON.parse(response.text || "{}");
      res.json({ question: { ...question, ...parsed, id: question.id }}); // preserve ID
    } catch (error: any) {
      const isQuotaError = error.status === 429 || error.status === "RESOURCE_EXHAUSTED" || error.message?.toLowerCase().includes('quota') || error.message?.toLowerCase().includes('429') || JSON.stringify(error).includes('429') || JSON.stringify(error).includes('quota');
      if (!isQuotaError) {
        console.error(error);
      }
      res.status(isQuotaError ? 429 : 500).json({ 
        error: error.message || "Failed to regenerate",
        isQuotaError: !!isQuotaError
      });
    }
  });


  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
