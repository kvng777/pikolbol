import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    // Allow loading images from your Supabase storage bucket
    domains: ["dprvaqtjyhfoquuvfuxv.supabase.co"],
  },
};

export default nextConfig;
