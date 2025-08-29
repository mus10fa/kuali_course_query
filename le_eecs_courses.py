import requests
import json

# Your API token (replace with your actual token)
token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4NzU1M2I4MTY4NDkzMDUxYTY4M2MxNCIsImlzcyI6Imt1YWxpLmNvIiwiZXhwIjoxNzg0MDU1NjA4LCJpYXQiOjE3NTI1MTk2MDh9.TyeX1xYsJyOuSNl7XHK-PuEMkN34eujLuNIlVeCTlb4"

# API endpoint
url = "https://york-sbx.kuali.co/api/v0/cm/search?index=courses_latest&limit=1000"

# Headers including the token
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {token}"
}

# Request body
payload = {
    "filters": {
        "code": {
            "startsWith": "LE/EECS"
        }
    }
}


# Send GET request
response = requests.get(url, headers=headers, data=json.dumps(payload))

# Check response



if response.status_code == 200:
    data = response.json()
    print("EECS Courses:")
    for course in data:
        if "LE/EECS" in course.get("code", ""):
            print(course)
else:
    print(f"Request failed with status code {response.status_code}")
    print(response.text)
