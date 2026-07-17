import "@testing-library/jest-dom/vitest";

// Never allow destructive tests against a production origin.
process.env.NODE_ENV ??= "test";
