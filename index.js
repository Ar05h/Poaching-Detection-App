// Import the Express.js framework to build the backend server
const express = require('express');
// Import required Node.js modules and libraries
const multer = require('multer'); // Middleware for handling file uploads
const cors = require('cors'); // Enables Cross-Origin requests
const { OpenAI } = require('openai'); // OpenAI SDK
const fs = require('fs'); // File system operations
const path = require('path'); // File path utilities

// Create an Express application instance and define the port number for the server 
const app = express();
const port = 3000;

// Create an uploads folder if it doesn't exist
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Configure multer for handling file uploads
const upload = multer({ dest: uploadDir });

// Initialize OpenAI client with API key
const openai = new OpenAI({
apiKey: 'YOUR_OPENAI_API_KEY_HERE', // Replace with your actual OpenAI API key
});

// Enable CORS and JSON body parsing
app.use(cors());
app.use(express.json());

// Checks if server is running
app.get('/test', (req, res) => {
  res.json({ status: 'ok' });
});

// Image analysis endpoint
app.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    // Check for file upload
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileData = fs.readFileSync(filePath); // Read the uploaded image

    // Get coordinates from the request
    const latitude = req.body.latitude;
    const longitude = req.body.longitude;

    // Prompt to instruct OpenAI image model
    const prompt = 'You are a wildlife expert specializing in animal behavior and health. Analyze the animal shown and first say either The animal is in distress! OR say The animal is not in distress Then describe why their behavior or condition appears normal or abnormal. Explain your reasoning very briefly and in plain language.';

    // Send image and prompt to OpenAI GPT-4o
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${fileData.toString('base64')}`, // Encode image in base64
              },
            },
          ],
        },
      ],
      max_tokens: 300,
    });

    fs.unlinkSync(filePath); // Delete the uploaded image after use

    const analysis = response.choices?.[0]?.message?.content ?? 'No analysis returned.';

    // Send analysis and original coordinates back
    res.json({ analysis, latitude, longitude });
  } catch (error) {
    console.error('Error analyzing image:', error);
    res.status(500).json({ error: 'Failed to analyze image', details: error.message });
  }
});

// Audio analysis endpoint
app.post('/analyze-audio', upload.single('file'), async (req, res) => {
  try {
    // Ensure an audio file is uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    // Rename file if needed based on MIME type
    const originalPath = req.file.path;
    const ext = req.file.mimetype === 'audio/mpeg' ? '.mp3' :
                req.file.mimetype === 'audio/wav' ? '.wav' :
                path.extname(req.file.originalname) || '.mp3';
    const renamedPath = `${originalPath}${ext}`;
    fs.renameSync(originalPath, renamedPath);

    // Create stream for transcription
    const audioStream = fs.createReadStream(renamedPath);

    // Transcribe audio using Whisper model
    const transcript = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: audioStream,
      response_format: 'text',
    });

    const cleanedTranscript = transcript.trim().toLowerCase();

    // Filter out unclear, short, or non-animal audio
    const isBadTranscript =
      cleanedTranscript.length < 8 ||
      /^[\d\s.cm]+$/.test(cleanedTranscript) ||
      ['you', 'uh', 'uh uh', 'hello', 'hi', 'hey, oh, oh oh you'].includes(cleanedTranscript) ||
      cleanedTranscript.split(' ').length <= 2;

    if (isBadTranscript) {
      fs.unlinkSync(renamedPath);
      return res.json({
        analysis: 'The audio was too short, unclear, or not recognized as an animal sound. Please upload a different recording.',
      });
    }

    // Prompt for GPT-4o with transcript as input
    const messages = [
      {
        role: 'system',
        content: 'You are a wildlife expert. Respond with only one of the following: This behavior is normal, no distress recognized. OR This behavior is abnormal, the animal is in distress!'
      },
      {
        role: 'user',
        content: `Animal vocalization transcription: ${transcript}`
      }
    ];

    // Get analysis from GPT
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 300,
      temperature: 0.5,
    });

    fs.unlinkSync(renamedPath); // Delete audio file

    const analysisText = response.choices?.[0]?.message?.content ?? 'No analysis returned.';

    // Get coordinates from the request
    const latitude = req.body.latitude;
    const longitude = req.body.longitude;

    // Return analysis and coordinates
    res.json({ analysis: analysisText, latitude, longitude });
  } catch (error) {
    console.error('Error analyzing audio:', error);
    res.status(500).json({ error: 'Failed to analyze audio', details: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
});
