/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  images: { unoptimized: true },
  transpilePackages: [
    "react-force-graph-2d",
    "force-graph",
    "kapsule",
    "accessor-fn",
    "d3-force-3d",
  ],
};

export default nextConfig;
