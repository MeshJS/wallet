import type { Config } from "jest";

const jestConfig: Config = {
  clearMocks: true,
  maxWorkers: 1,
  testEnvironment: "node",
  testMatch: ["**/test/**/*.test.ts"],
  testPathIgnorePatterns: ["<rootDir>/_backup/"],
  setupFiles: ["dotenv/config"],
  setupFilesAfterEnv: ["<rootDir>/test/setup-sodium.ts"],
  preset: "ts-jest",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^libsodium-wrappers-sumo$": "<rootDir>/node_modules/libsodium-wrappers-sumo",
    "^libsodium-sumo$": "<rootDir>/node_modules/libsodium-sumo",
  },
  transform: {
    "^.+\\.[jt]s?$": "ts-jest",
  },
  transformIgnorePatterns: ["/node_modules/(?!@meshsdk/.*)"],
  passWithNoTests: true,
};

export default jestConfig;
