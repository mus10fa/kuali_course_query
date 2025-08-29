// json-mcp-server.js
import fs from "fs";
import path from "path";
import express from "express";
import { fileURLToPath } from "url";

// Enable __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load config + datasets
const configPath = path.join(__dirname, "config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const datasets = {};
for (const ds of config.datasets) {
  const datasetPath = path.join(__dirname, ds.path);
  datasets[ds.name] = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
}

// Express app setup
const app = express();
const port = config.port || 3001;

// Endpoint: all courses
app.get("/courses", (req, res) => {
  res.json(datasets["courses"]);
});

// Endpoint: search course by code
// In json-mcp-server.js
app.get('/courses/search', (req, res) => {
  const codeQuery = req.query.code;
  if (!codeQuery) {
    return res.status(400).json({ error: 'Missing "code" query parameter' });
  }

  const norm = (str) =>
    str.replace(/\s+/g, ' ').replace(/^LE\//i, '').trim().toLowerCase();

  const courses = datasets['courses'] || [];
  const result = courses.filter(
    (course) => course.code && norm(course.code) === norm(codeQuery)
  );

  if (result.length === 0) {
    return res
      .status(404)
      .json({ error: `No course found for code "${codeQuery}"` });
  }

  res.json(result);
});


// Start server
app.listen(port, () => {
  console.log(`✅ JSON MCP Server running on port ${port}`);
});
