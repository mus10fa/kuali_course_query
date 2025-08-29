from fastapi import FastAPI
from mcp.server.fastmcp import FastMCP

app = FastAPI()
mcp = FastMCP(name="course_outcomes", host="127.0.0.1", port=5000, app=app)

@mcp.tool()
def get_outcomes(course_code: str) -> str:
    outcomes = {
        "LE/EECS2021": "Understand computer architecture, pipelining, and memory hierarchies.",
        "LE/EECS3401": "Apply AI techniques including logic programming and search algorithms."
    }
    return outcomes.get(course_code, "Outcomes not found.")

@app.get("/test")
def test():
    return {"outcome": get_outcomes("LE/EECS2021")}

@app.get("/")
def root():
    return {"message": "MCP server is running"}


if __name__ == "__main__":
    print("Starting MCP server...")
    print("Before run")
    mcp.run()

