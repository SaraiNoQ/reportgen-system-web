import {
  extractedFields,
  logs,
  parseEvents,
  projectMetrics,
  projects,
  rawFiles,
  reportSections,
  ruleTemplates,
  users
} from "@/lib/mock/data";

const wait = async () => new Promise((resolve) => setTimeout(resolve, 120));

export const projectApi = {
  async list() {
    await wait();
    return projects;
  },
  async metrics() {
    await wait();
    return projectMetrics;
  }
};

export const recordApi = {
  async files() {
    await wait();
    return rawFiles;
  },
  async parseTimeline() {
    await wait();
    return parseEvents;
  },
  async fields() {
    await wait();
    return extractedFields;
  }
};

export const ruleApi = {
  async templates() {
    await wait();
    return ruleTemplates;
  },
  async saveRule() {
    await wait();
    return { ok: true, message: "规则已保存，并记录版本变更" };
  }
};

export const reportApi = {
  async sections() {
    await wait();
    return reportSections;
  },
  async submit() {
    await wait();
    return { ok: true, status: "待审核" as const };
  }
};

export const systemApi = {
  async users() {
    await wait();
    return users;
  },
  async logs() {
    await wait();
    return logs;
  }
};
