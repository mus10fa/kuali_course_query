const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Configuration
const MCP_BASE_URL = 'http://localhost:3001'; // MCP server URL
const GOOGLE_API_KEY = 'AIzaSyB0CeJObJKK_8UX4x1w7KHJWXMhx7t77kQ';

// Helper function to fetch course data by code
async function fetchCourseByCode(code) {
  try {
    const encodedCode = encodeURIComponent(code);
    const response = await axios.get(`${MCP_BASE_URL}/courses/search?code=${encodedCode}`);

    if (response.data && response.data.length > 0) {
      return response.data[0];
    }

    return null;
  } catch (error) {
    console.error('Error fetching course from MCP:', error.message || error);
    return null;
  }
}

// Helper function to fetch all courses (try different endpoints)
async function fetchAllCourses() {
  const possibleEndpoints = [
    `${MCP_BASE_URL}/courses`,
    `${MCP_BASE_URL}/courses/all`,
    `${MCP_BASE_URL}/api/courses`,
    `${MCP_BASE_URL}/courses/search`,
    `${MCP_BASE_URL}/courses/search?q=`
  ];

  for (const endpoint of possibleEndpoints) {
    try {
      console.log(`Trying endpoint: ${endpoint}`);
      const response = await axios.get(endpoint);
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        console.log(`Success with endpoint: ${endpoint}, found ${response.data.length} courses`);
        return response.data;
      }
    } catch (error) {
      console.log(`Failed endpoint ${endpoint}:`, error.message);
      continue;
    }
  }
  
  return null;
}

// Helper function to search for courses with common prefixes
async function searchCoursesByPrefixes() {
  const commonPrefixes = [
    'LE/EECS', 'EECS', 'LE/ENG', 'ENG', 'LE/CSE', 'CSE', 
    'LE/MATH', 'MATH', 'LE/PHYS', 'PHYS', 'LE/CHEM', 'CHEM',
    'SC/MATH', 'SC/PHYS', 'SC/CHEM', 'SC/BIOL', 'AP/ECON',
    'HH/PSYC', 'FA/VISA', 'GL/POLS'
  ];
  
  const allCourses = [];
  
  for (const prefix of commonPrefixes) {
    try {
      const response = await axios.get(`${MCP_BASE_URL}/courses/search?code=${encodeURIComponent(prefix)}`);
      if (response.data && Array.isArray(response.data)) {
        allCourses.push(...response.data);
      }
    } catch (error) {
      console.log(`Failed to search with prefix ${prefix}:`, error.message);
    }
  }
  
  // Remove duplicates based on course id
  const uniqueCourses = allCourses.filter((course, index, self) => 
    index === self.findIndex(c => c.id === course.id)
  );
  
  return uniqueCourses;
}

// Helper function to format course outcomes
function formatOutcomes(outcomes) {
  if (!outcomes || outcomes.length === 0) return 'No specific outcomes listed.';
  
  return outcomes.map((outcome, index) => `${index + 1}. ${outcome.value}`).join('\n');
}

// Helper function to format credits
function formatCredits(meta) {
  if (!meta || !meta.credits) return 'Not specified';
  
  if (meta.credits.min === meta.credits.max) {
    return `${meta.credits.min} credits`;
  }
  return `${meta.credits.min}-${meta.credits.max} credits`;
}

// API endpoint to handle course queries
app.post('/api/query', async (req, res) => {
  try {
    const userQuery = req.body.query;
    if (!userQuery) {
      return res.status(400).json({ success: false, error: 'Missing query' });
    }

    console.log('User query:', userQuery);

    // Check if this is a query about courses without outcomes
    const isOutcomeQuery = userQuery.toLowerCase().includes('no outcomes') || 
                          userQuery.toLowerCase().includes('without outcomes') ||
                          userQuery.toLowerCase().includes('missing outcomes') ||
                          userQuery.toLowerCase().includes('no learning outcome') ||
                          userQuery.toLowerCase().includes('missing learning outcome');

    if (isOutcomeQuery) {
      console.log('Detected outcomes query, fetching all courses...');
      
      // Try to get all courses
      let allCourses = await fetchAllCourses();
      
      // If that fails, try searching by common prefixes
      if (!allCourses || allCourses.length === 0) {
        console.log('Falling back to prefix search...');
        allCourses = await searchCoursesByPrefixes();
      }

      if (!allCourses || allCourses.length === 0) {
        return res.status(500).json({ 
          success: false, 
          error: 'Unable to fetch courses from the server. Please check if the MCP server is running and accessible.' 
        });
      }

      console.log(`Found ${allCourses.length} total courses`);

      // Filter courses without outcomes
      const coursesWithoutOutcomes = allCourses.filter(course => {
        return !course.outcomes || course.outcomes.length === 0;
      });

      console.log(`Found ${coursesWithoutOutcomes.length} courses without outcomes`);

      if (coursesWithoutOutcomes.length === 0) {
        return res.json({ 
          success: true, 
          response: 'All courses in the database have learning outcomes defined.' 
        });
      }

      // Format the results
      const courseList = coursesWithoutOutcomes
        .slice(0, 50) // Limit to first 50 to avoid overwhelming response
        .map(course => {
          const code = course.code || `${course.subjectCode || ''}${course.number || ''}`;
          const title = course.title || 'No title';
          return `• ${code}: ${title}`;
        }).join('\n');

      const responseText = `Found ${coursesWithoutOutcomes.length} courses with no learning outcomes${coursesWithoutOutcomes.length > 50 ? ' (showing first 50)' : ''}:\n\n${courseList}`;

      return res.json({ success: true, response: responseText });
    }

    // Original logic for specific course queries
    const codeMatch = userQuery.match(/\b([A-Z]{2}\/)?[A-Z]{3,5}\s?\d{4}\b/i);
    if (!codeMatch) {
      return res.status(400).json({ 
        success: false, 
        error: 'Please specify a course code (e.g., "EECS 4214" or "LE/ENG 1500") or ask about courses without outcomes' 
      });
    }

    const rawCode = codeMatch[0].toUpperCase();
    let courseCode;
    
    if (rawCode.includes('/')) {
      courseCode = rawCode;
    } else {
      courseCode = rawCode.replace(/([A-Z]{3,5})\s?(\d{4})/, '$1 $2');
    }

    let course = await fetchCourseByCode(courseCode);
    
    // If not found, try with LE/ prefix
    if (!course && !courseCode.includes('/')) {
      const altCourseCode = `LE/${courseCode}`;
      course = await fetchCourseByCode(altCourseCode);
      if (course) {
        courseCode = altCourseCode;
      }
    }

    if (!course) {
      return res.json({ success: false, error: `Course ${courseCode} not found.` });
    }

    // Build comprehensive course information
    const courseInfo = {
      title: course.title || 'Not specified',
      code: course.code || courseCode,
      description: course.description || 'No description available',
      credits: formatCredits(course.meta),
      outcomes: formatOutcomes(course.outcomes),
      subjectCode: course.subjectCode || 'Not specified',
      courseNumber: course.number || 'Not specified',
      status: course.status || 'Not specified',
      dateStart: course.dateStart || 'Not specified'
    };

    const prompt = `
You are a helpful assistant providing information about university courses.

Course Information:
Title: ${courseInfo.title}
Code: ${courseInfo.code}
Credits: ${courseInfo.credits}
Status: ${courseInfo.status}
Start Date: ${courseInfo.dateStart}

Description:
${courseInfo.description}

Learning Outcomes:
${courseInfo.outcomes}

User question: ${userQuery}

Please answer the user's question based on the above course information. Be specific and comprehensive in your response.
`;

    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    const apiResponse = await axios.post(
      apiUrl,
      { contents: [{ parts: [{ text: prompt }] }] },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': GOOGLE_API_KEY,
        },
      }
    );

    const aiText = apiResponse.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from AI';

    return res.json({ success: true, response: aiText.trim() });

  } catch (error) {
    console.error('Error in API:', error.message || error);
    return res.status(500).json({ 
      success: false, 
      error: 'Server error occurred while processing your request' 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

// Start the server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});