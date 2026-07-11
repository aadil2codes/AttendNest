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
            content: `You are an expert timetable parser. Extract all subjects.
For every subject return:
- subject name
- confidence score (a float between 0.0 and 1.0 based on how clear the text was for this subject)
- class days (array of numbers)
- timings (object mapping day number to start/end times in 24h format HH:MM)

Day mapping:
Monday = 1, Tuesday = 2, Wednesday = 3, Thursday = 4, Friday = 5, Saturday = 6, Sunday = 0

Return ONLY valid JSON matching this schema:
{
  "subjects": [
    {
      "name": "Mathematics",
      "confidence": 0.95,
      "days": [1, 3, 5],
      "timings": {
        "1": {"start": "09:00", "end": "10:00"},
        "3": {"start": "09:00", "end": "10:00"},
        "5": {"start": "09:00", "end": "10:00"}
      }
    }
  ]
}
Make sure the timings object keys are strings ("1", "3", "5") matching the selected days. Do not include any explanation or markdown formatting in your response. Return raw JSON.`
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
