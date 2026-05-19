/* eslint-disable @typescript-eslint/no-require-imports */
import type { NextConfig } from "next"
const path = require("path")
const CopyWebpackPlugin = require("copy-webpack-plugin")
const webpack = require("webpack")

const cesiumSource = path.join(
  path.dirname(require.resolve("cesium/package.json")),
  "Build",
  "Cesium"
)

const nextConfig: NextConfig = {
  webpack: (config: any, { isServer }: { isServer: boolean }) => {
    if (!isServer) {
      // Tell Cesium where to find static assets at runtime
      config.plugins.push(
        new webpack.DefinePlugin({
          CESIUM_BASE_URL: JSON.stringify("/cesium"),
        })
      )

      // Copy Cesium Workers, Assets, Widgets, ThirdParty into /public/cesium
      config.plugins.push(
        new CopyWebpackPlugin({
          patterns: [
            { from: path.join(cesiumSource, "Workers"),    to: path.join(__dirname, "public/cesium/Workers") },
            { from: path.join(cesiumSource, "ThirdParty"), to: path.join(__dirname, "public/cesium/ThirdParty") },
            { from: path.join(cesiumSource, "Assets"),     to: path.join(__dirname, "public/cesium/Assets") },
            { from: path.join(cesiumSource, "Widgets"),    to: path.join(__dirname, "public/cesium/Widgets") },
          ],
        })
      )
    }

    return config
  },
}

export default nextConfig
