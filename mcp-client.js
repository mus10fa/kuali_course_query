const axios = require('axios');

class MCPClient {
  constructor() {
    this.kualiClient = axios.create({
      baseURL: process.env.KUALI_API_URL,
      headers: {
        Authorization: `Bearer ${process.env.KUALI_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async searchCourses(criteria = {}) {
    try {
      const filters = {};
      if (criteria.subjectCode) {
        filters.subjectCode = [`LE/${criteria.subjectCode}`];
      }
      if (criteria.hasPrerequisites) {
        filters.prerequisites = { exists: true };
      }
      if (criteria.hasOutcomes) {
        filters.outcomes = { exists: true };
      }

      const response = await this.kualiClient.post('/v0/cm/search', {
        index: 'courses_latest',
        limit: 1000,
        status: 'active',
        filters,
      });

      const courses = response.data.map((course) => ({
        code: course.number,
        title: course.title,
        description: course.description || '',
        creditHours: course.creditHours || null,
        hasPrerequisites: course.prerequisites?.length > 0 || false,
      }));

      return { courses };
    } catch (error) {
      throw new Error(`Kuali searchCourses failed: ${error.message}`);
    }
  }

  async getCourseDetails(courseCode) {
    try {
      // Search course by code to get pid
      const searchResp = await this.kualiClient.post('/v0/cm/search', {
        index: 'courses_latest',
        limit: 1,
        q: courseCode,
      });

      if (!searchResp.data || searchResp.data.length === 0) {
        throw new Error(`Course not found for code: ${courseCode}`);
      }

      const course = searchResp.data[0];
      const pid = course.id;

      // Fetch full course details by pid
      const fullResp = await this.kualiClient.get(`/cm/courses/${pid}/latestActive`);
      const data = fullResp.data;

      return {
        code: data.number,
        title: data.title,
        subjectCode: data.subjectCode,
        creditHours: data.creditHours,
        description: data.description || '',
        extendedDescription: data.extendedCourseDescription || '',
        prerequisites: data.prerequisites || [],
        learningOutcomes: data.outcomes || [],
      };
    } catch (error) {
      throw new Error(`Kuali getCourseDetails failed: ${error.message}`);
    }
  }

  async compareCourses(courseCode1, courseCode2) {
    try {
      const course1 = await this.getCourseDetails(courseCode1);
      const course2 = await this.getCourseDetails(courseCode2);

      const similarities = [];
      const differences = [];

      if (course1.creditHours === course2.creditHours) {
        similarities.push(`Both are ${course1.creditHours} credit courses`);
      } else {
        differences.push(`Credit hours differ: ${course1.creditHours} vs ${course2.creditHours}`);
      }

      if (course1.prerequisites.length > 0 && course2.prerequisites.length > 0) {
        similarities.push('Both have prerequisites');
      } else if (course1.prerequisites.length !== course2.prerequisites.length) {
        differences.push('Prerequisite requirements differ');
      }

      if (course1.subjectCode === course2.subjectCode) {
        similarities.push(`Both belong to subject ${course1.subjectCode}`);
      } else {
        differences.push(`Different subjects: ${course1.subjectCode} vs ${course2.subjectCode}`);
      }

      const outcomes1 = new Set(course1.learningOutcomes);
      const outcomes2 = new Set(course2.learningOutcomes);
      const commonOutcomes = [...outcomes1].filter((o) => outcomes2.has(o));
      if (commonOutcomes.length > 0) {
        similarities.push(`Both share ${commonOutcomes.length} similar learning outcomes`);
      } else {
        differences.push('Learning outcomes differ');
      }

      return {
        course1,
        course2,
        comparison: { similarities, differences },
      };
    } catch (error) {
      throw new Error(`Kuali compareCourses failed: ${error.message}`);
    }
  }

  async getStatistics() {
    try {
      const response = await this.kualiClient.post('/v0/cm/search', {
        index: 'courses_latest',
        limit: 1000,
        status: 'active',
      });

      const courses = response.data;
      const totalCourses = courses.length;
      const coursesWithOutcomes = courses.filter((c) => c.outcomes?.length > 0).length;
      const coursesWithPrerequisites = courses.filter((c) => c.prerequisites?.length > 0).length;

      const subjectBreakdown = {};
      for (const course of courses) {
        const subj = course.subjectCode || 'Unknown';
        subjectBreakdown[subj] = (subjectBreakdown[subj] || 0) + 1;
      }

      return {
        totalCourses,
        coursesWithOutcomes,
        coursesWithPrerequisites,
        subjectBreakdown,
      };
    } catch (error) {
      throw new Error(`Kuali getStatistics failed: ${error.message}`);
    }
  }
}

module.exports = MCPClient;
