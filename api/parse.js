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
            content: `You are an expert timetable parser. Your task is to analyze OCR text extracted from a timetable image or PDF and return a structured JSON array of all unique subjects.

CRITICAL INSTRUCTIONS:
1. GROUP BY SUBJECT: Each subject must appear EXACTLY ONCE in the returned list. Do not create separate entries for the same subject taught on different days.
2. COMBINE DAYS AND TIMINGS: If a subject is taught multiple times a week (e.g. Applied Chemistry on Monday and Thursday), compile ALL those days into the "days" array, and map each day to its specific start and end time inside the "timings" object.
3. ACCURATE DAY MAPPING:
   - Monday = 1
   - Tuesday = 2
   - Wednesday = 3
   - Thursday = 4
   - Friday = 5
   - Saturday = 6
   - Sunday = 0
4. TIME FORMATTING: Convert all start and end times to 24-hour HH:MM format (e.g., "1:30 PM" -> "13:30", "10:00 - 11:00" -> start "10:00", end "11:00").
5. CONFIDENCE SCORE: Output a confidence float between 0.0 and 1.0 reflecting your certainty of the parse based on text legibility.

Return ONLY raw JSON matching this schema, without any markdown formatting or extra explanation:
{
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
