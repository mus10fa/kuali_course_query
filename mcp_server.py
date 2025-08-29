# MCP Server for Course Data System
# This converts your existing course data functions into an MCP server

import asyncio
import json
from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationOptions
import mcp.server.stdio
from mcp.types import (
    Resource,
    Tool,
    TextContent,
    ImageContent,
    EmbeddedResource,
    LoggingLevel
)
import requests
from typing import Any, Sequence
import os

# Your existing configuration
TOKEN = os.getenv("KUALI_TOKEN", "your-token-here")
URL = "https://york-sbx.kuali.co/api/v0/cm/search"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json"
}

# Create the MCP server
server = Server("kuali-curriculum-server")

class CourseDataManager:
    """Manages course data operations"""
    
    def __init__(self):
        self.prefixes = ["mech", "eng", "esse", "eecs", "tron", "civl"]
        self.limit = 1000
        self.max_limit = 10000
    
    async def fetch_courses_for_prefix(self, prefix: str, status: str = "active"):
        """Fetch courses for a specific prefix"""
        skip = 0
        courses = []
        
        while True:
            batch_limit = min(self.limit, self.max_limit - skip)
            if batch_limit <= 0:
                break
                
            params = {
                "limit": batch_limit,
                "skip": skip,
                "status": status,
                "index": "courses_latest",
                "q": prefix
            }
            
            try:
                response = requests.get(URL, headers=HEADERS, params=params)
                response.raise_for_status()
                data = response.json()
                
                if not isinstance(data, list) or len(data) == 0:
                    break
                    
                # Filter for LE/ courses only
                filtered_courses = [
                    course for course in data 
                    if course.get("subjectCode", "").startswith("LE/")
                ]
                
                courses.extend(filtered_courses)
                skip += len(data)
                
            except requests.RequestException as e:
                print(f"Error fetching courses for prefix '{prefix}': {e}")
                break
                
        return courses
    
    async def search_courses(self, **filters):
        """Search courses with various filters"""
        all_courses = []
        seen_ids = set()
        
        # Determine which prefixes to search
        subject_code = filters.get('subjectCode', '')
        if subject_code:
            # Extract prefix from subject code (e.g., "LE/MECH" -> "mech")
            prefix = subject_code.replace("LE/", "").lower()
            prefixes_to_search = [prefix] if prefix in self.prefixes else self.prefixes
        else:
            prefixes_to_search = self.prefixes
        
        for prefix in prefixes_to_search:
            courses = await self.fetch_courses_for_prefix(
                prefix, 
                status=filters.get('status', 'active')
            )
            
            for course in courses:
                course_id = course.get("id")
                if course_id and course_id not in seen_ids:
                    # Apply additional filters
                    if self._matches_filters(course, filters):
                        all_courses.append(course)
                        seen_ids.add(course_id)
        
        return all_courses[:100]  # Limit results
    
    def _matches_filters(self, course, filters):
        """Check if course matches the given filters"""
        # Title filter
        if 'title' in filters:
            title_query = filters['title'].lower()
            course_title = course.get('title', '').lower()
            if title_query not in course_title:
                return False
        
        # Description filter
        if 'description' in filters:
            desc_query = filters['description'].lower()
            course_desc = course.get('description', '').lower()
            if desc_query not in course_desc:
                return False
        
        # Prerequisites filter
        if 'hasPrerequisites' in filters:
            has_prereqs = bool(course.get('prerequisites'))
            if filters['hasPrerequisites'] != has_prereqs:
                return False
        
        # Outcomes filter
        if 'hasOutcomes' in filters:
            has_outcomes = bool(course.get('outcomes'))
            if filters['hasOutcomes'] != has_outcomes:
                return False
        
        return True
    
    def get_course_details(self, course_code: str):
        """Get detailed information about a specific course"""
        # Implementation would fetch specific course by code
        # For now, search and find matching course
        params = {
            "limit": 10,
            "skip": 0,
            "status": "active",
            "index": "courses_latest",
            "q": course_code
        }
        
        try:
            response = requests.get(URL, headers=HEADERS, params=params)
            response.raise_for_status()
            data = response.json()
            
            for course in data:
                if course.get('code') == course_code:
                    return course
            
            return None
            
        except requests.RequestException as e:
            raise Exception(f"Error fetching course details: {e}")
    
    def analyze_course_completeness(self, course_code: str):
        """Analyze how complete a course's information is"""
        course = self.get_course_details(course_code)
        if not course:
            return {"error": "Course not found"}
        
        completeness = {}
        fields_to_check = [
            'title', 'description', 'creditHours', 'prerequisites', 
            'outcomes', 'subjectCode', 'courseNumber'
        ]
        
        total_fields = len(fields_to_check)
        completed_fields = 0
        
        for field in fields_to_check:
            value = course.get(field)
            is_complete = bool(value and (
                isinstance(value, str) and value.strip() or
                isinstance(value, (list, dict)) and len(value) > 0 or
                isinstance(value, (int, float))
            ))
            completeness[field] = is_complete
            if is_complete:
                completed_fields += 1
        
        completeness_percentage = (completed_fields / total_fields) * 100
        
        return {
            "course_code": course_code,
            "completeness_percentage": round(completeness_percentage, 1),
            "completed_fields": completed_fields,
            "total_fields": total_fields,
            "field_completeness": completeness,
            "missing_fields": [
                field for field, complete in completeness.items() 
                if not complete
            ]
        }
    
    def compare_courses(self, course_code1: str, course_code2: str):
        """Compare two courses side by side"""
        course1 = self.get_course_details(course_code1)
        course2 = self.get_course_details(course_code2)
        
        if not course1:
            return {"error": f"Course {course_code1} not found"}
        if not course2:
            return {"error": f"Course {course_code2} not found"}
        
        comparison = {
            "course1": {
                "code": course1.get('code'),
                "title": course1.get('title'),
                "creditHours": course1.get('creditHours'),
                "description": course1.get('description', '')[:200] + "..." if len(course1.get('description', '')) > 200 else course1.get('description', ''),
                "outcomes_count": len(course1.get('outcomes', []))
            },
            "course2": {
                "code": course2.get('code'),
                "title": course2.get('title'),
                "creditHours": course2.get('creditHours'),
                "description": course2.get('description', '')[:200] + "..." if len(course2.get('description', '')) > 200 else course2.get('description', ''),
                "outcomes_count": len(course2.get('outcomes', []))
            }
        }
        
        return comparison

# Initialize the course manager
course_manager = CourseDataManager()

# Define MCP tools
@server.list_tools()
async def handle_list_tools() -> list[Tool]:
    """List available tools"""
    return [
        Tool(
            name="search_courses",
            description="Search for courses based on various criteria",
            inputSchema={
                "type": "object",
                "properties": {
                    "subjectCode": {
                        "type": "string",
                        "description": "Search by subject code (e.g., 'LE/MECH', 'MECH')"
                    },
                    "title": {
                        "type": "string", 
                        "description": "Search in course titles"
                    },
                    "description": {
                        "type": "string",
                        "description": "Search in course descriptions"
                    },
                    "status": {
                        "type": "string",
                        "description": "Filter by course status (e.g., 'active', 'inactive')"
                    },
                    "hasPrerequisites": {
                        "type": "boolean",
                        "description": "Filter courses that have prerequisites"
                    },
                    "hasOutcomes": {
                        "type": "boolean", 
                        "description": "Filter courses that have learning outcomes"
                    }
                }
            }
        ),
        Tool(
            name="get_course_details",
            description="Get detailed information about a specific course",
            inputSchema={
                "type": "object",
                "properties": {
                    "courseCode": {
                        "type": "string",
                        "description": "Course code (e.g., 'LE/MECH 2201', 'MECH 2201')"
                    }
                },
                "required": ["courseCode"]
            }
        ),
        Tool(
            name="analyze_course_completeness",
            description="Analyze how complete a course's information is",
            inputSchema={
                "type": "object",
                "properties": {
                    "courseCode": {
                        "type": "string",
                        "description": "Course code to analyze"
                    }
                },
                "required": ["courseCode"]
            }
        ),
        Tool(
            name="compare_courses", 
            description="Compare two courses side by side",
            inputSchema={
                "type": "object",
                "properties": {
                    "courseCode1": {
                        "type": "string",
                        "description": "First course code"
                    },
                    "courseCode2": {
                        "type": "string", 
                        "description": "Second course code"
                    }
                },
                "required": ["courseCode1", "courseCode2"]
            }
        ),
        Tool(
            name="get_statistics",
            description="Get overall statistics about the course data",
            inputSchema={
                "type": "object",
                "properties": {}
            }
        )
    ]

@server.call_tool()
async def handle_call_tool(name: str, arguments: dict | None) -> list[TextContent]:
    """Handle tool calls"""
    if not arguments:
        arguments = {}
    
    try:
        if name == "search_courses":
            courses = await course_manager.search_courses(**arguments)
            return [TextContent(
                type="text",
                text=json.dumps({
                    "total_results": len(courses),
                    "courses": [
                        {
                            "code": course.get("code"),
                            "title": course.get("title"),
                            "creditHours": course.get("creditHours"),
                            "subjectCode": course.get("subjectCode"),
                            "description": course.get("description", "")[:150] + "..." if len(course.get("description", "")) > 150 else course.get("description", "")
                        }
                        for course in courses
                    ]
                }, indent=2)
            )]
        
        elif name == "get_course_details":
            course_code = arguments.get("courseCode")
            course = course_manager.get_course_details(course_code)
            
            if not course:
                return [TextContent(type="text", text=f"Course {course_code} not found")]
            
            return [TextContent(
                type="text",
                text=json.dumps(course, indent=2)
            )]
        
        elif name == "analyze_course_completeness":
            course_code = arguments.get("courseCode")
            analysis = course_manager.analyze_course_completeness(course_code)
            return [TextContent(
                type="text",
                text=json.dumps(analysis, indent=2)
            )]
        
        elif name == "compare_courses":
            course_code1 = arguments.get("courseCode1")
            course_code2 = arguments.get("courseCode2") 
            comparison = course_manager.compare_courses(course_code1, course_code2)
            return [TextContent(
                type="text",
                text=json.dumps(comparison, indent=2)
            )]
        
        elif name == "get_statistics":
            # Get some basic statistics
            all_courses = await course_manager.search_courses()
            
            subject_codes = {}
            with_outcomes = 0
            with_prereqs = 0
            
            for course in all_courses:
                subject_code = course.get("subjectCode", "Unknown")
                subject_codes[subject_code] = subject_codes.get(subject_code, 0) + 1
                
                if course.get("outcomes"):
                    with_outcomes += 1
                if course.get("prerequisites"):
                    with_prereqs += 1
            
            stats = {
                "total_courses": len(all_courses),
                "courses_with_outcomes": with_outcomes,
                "courses_with_prerequisites": with_prereqs,
                "subject_code_breakdown": subject_codes
            }
            
            return [TextContent(
                type="text",
                text=json.dumps(stats, indent=2)
            )]
        
        else:
            return [TextContent(
                type="text", 
                text=f"Unknown tool: {name}"
            )]
    
    except Exception as e:
        return [TextContent(
            type="text",
            text=f"Error executing {name}: {str(e)}"
        )]

async def main():
    # Run the server using stdin/stdout streams
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="kuali-curriculum-server",
                server_version="1.0.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )

if __name__ == "__main__":
    asyncio.run(main())