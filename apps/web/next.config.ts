import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mh/agent", "@mh/tools", "@mh/data", "@mh/shared", "@mh/llm"]
};

export default nextConfig;
