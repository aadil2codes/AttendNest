export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { text, apiKey } = req.body;

  if (!text || !apiKey) {
    return res.status(400).json({ error: 'Missing text or apiKey' });
  }

  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-70b-instruct",
        messages: [
          {
            role: "system",
            content: `You are an expert timetable parser. Your task is to analyze raw OCR text extracted from a timetable image or PDF and reconstruct the schedule grid to output a structured JSON object containing a scratchpad and all unique subjects.

OCR TEXT CHARACTERISTICS:
- Timetable text extracted via OCR can be noisy, contain typos, and be read in either horizontal rows OR vertical columns (or a mix of both).
- You must search the text for day names (Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday) and time intervals (e.g. "10:00 - 11:00", "1:30 - 2:30").
- Reconstruct the relationship between each subject, its day, and its time slot. For example, if "Applied Chemistry" is aligned with "Monday" and "10:00 - 11:00", it runs on Monday from 10:00 to 11:00.

CRITICAL INSTRUCTIONS:
1. DETAILED SCRATCHPAD: In the "scratchpad" field of the JSON, document your analysis. First, list each day of the week found, and for each day, write down the chronological sequence of classes and timings. This helps you verify column vs row read direction before outputting the final JSON.
2. GROUP BY SUBJECT: Each subject must appear EXACTLY ONCE in the returned "subjects" list.
3. COMBINE DAYS AND TIMINGS: If a subject is taught multiple times a week, compile all those days into the "days" array: [1, 2, 3, 4, 5], and map each day to its specific start and end time inside the "timings" object in 24-hour HH:MM format (e.g., "1:30 PM" -> "13:30", "1:30 - 2:30" -> start "13:30", end "14:30").
4. DAY MAPPING: Monday = 1, Tuesday = 2, Wednesday = 3, Thursday = 4, Friday = 5, Saturday = 6, Sunday = 0.
5. CONFIDENCE SCORE: Output a confidence float between 0.0 and 1.0 reflecting your certainty of the parse.

Return ONLY raw JSON matching this schema, without any markdown formatting or extra text:
{
  "scratchpad": "Analysis: Monday classes: 10-11 Applied Chemistry, 11-12 Engineering Graphics, 12:30-1:30 Electrical Science, 1:30-2:30 Applied Maths. Tuesday classes: 10-11 Applied Maths, 11-12 Electrical Science...",
  "subjects": [
    {
      "name": "Applied Chemistry",
      "confidence": 0.95,
      "days": [1, 4],
      "timings": {
        "1": {"start": "10:00", "end": "11:00"},
        "4": {"start": "10:00", "end": "11:00"}
      }
    }
  ]
}`
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.1,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `NVIDIA API error: ${errText}` });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
