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
            content: `You are an expert timetable parser. Your task is to analyze OCR text extracted from a timetable image and reconstruct the grid structure to output a structured JSON array of all unique subjects.

OCR TEXT STRUCTURE:
The input text is extracted from a table with columns for days (e.g. Monday, Tuesday, Wednesday, Thursday, Friday) and rows for class timings (e.g., 10:00 - 11:00, 11:00 - 12:00).
Because OCR reads left-to-right, a row of text will list the subjects for each day in order of the columns.
For example, if the header is: "Monday Tuesday Wednesday Thursday Friday"
Use this column-matching rule to correctly align each subject with its day of the week!

Day mapping:
Monday = 1, Tuesday = 2, Wednesday = 3, Thursday = 4, Friday = 5, Saturday = 6, Sunday = 0

CRITICAL INSTRUCTIONS:
1. STEP-BY-STEP REASONING: In the "scratchpad" field of the JSON, document your row-by-row extraction. Write down exactly what subject is in each column (1 to 5) for every time row.
2. GROUP BY SUBJECT: Each subject must appear EXACTLY ONCE in the returned "subjects" list.
3. COMBINE DAYS AND TIMINGS: If a subject is taught multiple times a week, compile all those days into the "days" array: [1, 2, 3, 4, 5], and map each day to its specific start and end time inside the "timings" object in 24-hour HH:MM format.
4. DO NOT SKIP COLUMNS: Count column positions carefully. If a subject appears twice in the same row, make sure to record it for both days!

Return ONLY raw JSON matching this schema, without any markdown formatting or extra text:
{
  "scratchpad": "Row 1 (10:00 - 11:00): Column 1 is Applied Chemistry, Column 2 is Applied Maths, Column 3 is Applied Physics, Column 4 is Applied Chemistry, Column 5 is Electrical Science. Row 2 ...",
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
