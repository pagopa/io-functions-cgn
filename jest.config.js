module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  modulePathIgnorePatterns: ["dist"], 
  testPathIgnorePatterns: ["dist", "/node_modules"]
};
