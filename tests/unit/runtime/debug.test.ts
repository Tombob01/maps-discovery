import { describe, it } from "vitest";
import { createServices } from "../../../src/runtime/createServices.js";

describe("debug", () => {
  it("prints module source", () => {
    console.log("function source:", createServices.toString().slice(0, 500));
  });
});
