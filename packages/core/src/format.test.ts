import { describe, expect, it } from "vitest";
import { normalizeLogoUrl } from "./format";

describe("normalizeLogoUrl", () => {
  it("converts standard Google Drive file/d/.../view link to direct lh3 image stream", () => {
    const input =
      "https://drive.google.com/file/d/1qMvBTaFeQbnMLooPLaGQv3Lkv1JBOFrr/view?usp=sharing";
    expect(normalizeLogoUrl(input)).toBe(
      "https://lh3.googleusercontent.com/d/1qMvBTaFeQbnMLooPLaGQv3Lkv1JBOFrr",
    );
  });

  it("converts Google Drive open?id=... links", () => {
    const input = "https://drive.google.com/open?id=1Rv418Wj7HHbrIXKEnp-36ntbxb0XyH8A";
    expect(normalizeLogoUrl(input)).toBe(
      "https://lh3.googleusercontent.com/d/1Rv418Wj7HHbrIXKEnp-36ntbxb0XyH8A",
    );
  });

  it("converts Dropbox dl=0 to raw=1", () => {
    const input = "https://www.dropbox.com/s/sample/logo.png?dl=0";
    expect(normalizeLogoUrl(input)).toBe("https://www.dropbox.com/s/sample/logo.png?raw=1");
  });

  it("leaves standard HTTPS direct image URLs untouched", () => {
    const input = "https://cdn.example.com/assets/logo.png";
    expect(normalizeLogoUrl(input)).toBe(input);
  });

  it("handles null, empty, or whitespace strings safely", () => {
    expect(normalizeLogoUrl(null)).toBeNull();
    expect(normalizeLogoUrl(undefined)).toBeNull();
    expect(normalizeLogoUrl("   ")).toBeNull();
  });
});
