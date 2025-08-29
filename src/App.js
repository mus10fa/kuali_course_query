import React, { useState } from 'react';

function App() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:5000/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Course Query System</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter your course query..."
          style={{ width: '300px', padding: '0.5rem' }}
        />
        <button type="submit" disabled={loading} style={{ marginLeft: '1rem' }}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {result?.response && (
        <div style={{ marginTop: '2rem' }}>
          <h2>Response:</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{result.response}</pre>
        </div>
      )}

    </div>
  );
}

export default App;
