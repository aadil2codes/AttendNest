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

  const { text, imageDataUrl, isImage, apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'Missing apiKey' });
  }

  try {
    let payload = {};

    if (isImage) {
      // Use Llama 3.2 Vision model to read the image directly
      payload = {
        model: "meta/llama-3.2-11b-vision-instruct",
        messages: [
          {
            role: "system",
            content: `You are an expert timetable parser. Your task is to analyze the uploaded timetable image and return a structured JSON object containing all unique subjects.

TIMETABLE STRUCTURE RULES:
- The timetable contains columns for class timings. A vertical "LUNCH BREAK" section divides the morning classes from the afternoon classes.
- Morning classes run BEFORE the lunch break (e.g. 10:00 AM to 1:00 PM).
- Afternoon classes run AFTER the lunch break (e.g. 2:00 PM to 6:00 PM).
- You MUST scan all columns on BOTH sides of the lunch break. Do not stop scanning at the lunch break!

CRITICAL INSTRUCTIONS:
1. SCAN ALL TIMINGS: Scan every single column from start to end (e.g. 10:00-11:00 AM, 11:00-12:00 Noon, 12:00 Noon-1:00 PM, LUNCH, 2:00-3:00 PM, 3:00-5:00 PM, 5:00-6:00 PM). Ignore empty cells or cells containing only dashes ("-").
2. CLEAN SUBJECT NAMES: Strip all teacher initials, room numbers, or abbreviations in parentheses from the subject name (e.g., "Industrial Engineering (GS)" becomes "Industrial Engineering", "Electronics Devices (CT)" becomes "Electronics Devices", "Open Elective (DKR)" becomes "Open Elective"). The name must be the clean, full name of the subject.
3. STRICT GROUPING BY NAME: Each subject must appear EXACTLY ONCE in the returned "subjects" list. Even if a subject has different timings on different days (e.g. Industrial Engineering runs Mon/Tue at 10:00-11:00, and Fri at 12:00-13:00), you MUST compile them into a single subject entry in the array. Group all days in the "days" array: [1, 2, 5], and map each day to its specific timing in the "timings" object.
4. DAY MAPPING: Monday = 1, Tuesday = 2, Wednesday = 3, Thursday = 4, Friday = 5, Saturday = 6, Sunday = 0.
5. TIME MAPPING: Convert all timings to 24-hour HH:MM format (e.g. "12:00 Noon to 1:00 PM" -> start "12:00", end "13:00"; "10:00 AM to 11:00 AM" -> start "10:00", end "11:00"; "2:00 PM to 3:00 PM" -> start "14:00", end "15:00"; "3:00 PM to 5:00 PM" -> start "15:00", end "17:00").
6. CONFIDENCE SCORE: Output a confidence float between 0.0 and 1.0 reflecting your certainty of the parse.

Return ONLY raw JSON matching this schema, without any markdown formatting, explanations, or extra text:
{
  "subjects": [
    {
      "name": "Industrial Engineering",
      "confidence": 0.95,
      "days": [1, 2, 5],
      "timings": {
        "1": {"start": "10:00", "end": "11:00"},
        "2": {"start": "10:00", "end": "11:00"},
        "5": {"start": "12:00", "end": "13:00"}
      }
    }
  ]
}`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Parse this timetable image and extract all subjects with their days and times in the requested JSON format."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl // Base64 data URL
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 2048,
        response_format: { type: "json_object" }
      };
    } else {
      // Use Llama 3.1 Text model to parse PDF text
      payload = {
        model: "meta/llama-3.1-70b-instruct",
        messages: [
          {
            role: "system",
            content: `You are an expert timetable parser. Your task is to analyze timetable text and return a structured JSON object containing all unique subjects.

CRITICAL INSTRUCTIONS:
1. GROUP BY SUBJECT: Each subject must appear EXACTLY ONCE in the returned "subjects" list.
2. COMBINE DAYS AND TIMINGS: If a subject is taught multiple times a week, compile all those days into the "days" array: [1, 2, 3, 4, 5], and map each day to its specific start and end time inside the "timings" object in 24-hour HH:MM format.
3. DAY MAPPING: Monday = 1, Tuesday = 2, Wednesday = 3, Thursday = 4, Friday = 5, Saturday = 6, Sunday = 0.
4. TIME MAPPING: Convert all timings to 24-hour HH:MM format (e.g. "12:30 - 1:30" -> start "12:30", end "13:30").
5. CONFIDENCE SCORE: Output a confidence float between 0.0 and 1.0 reflecting your certainty of the parse.

Return ONLY raw JSON matching this schema, without any markdown formatting, explanations, or extra text:
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
        max_tokens: 2048,
        response_format: { type: "json_object" }
      };
    }

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
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
