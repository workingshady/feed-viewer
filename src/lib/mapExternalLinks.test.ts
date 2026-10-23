import { describe, expect, it } from "vitest";
import { googleMapsQueryUrl, googleMapsSatelliteUrl, openStreetMapPinUrl } from "./mapExternalLinks";

describe("mapExternalLinks", () => {
  it("builds OSM pin URL", () => {
    expect(openStreetMapPinUrl(25.2, 55.27, 17)).toBe("https://www.openstreetmap.org/?mlat=25.2&mlon=55.27&zoom=17");
  });

  it("builds Google query URL", () => {
    expect(googleMapsQueryUrl(25.2, 55.27)).toBe("https://www.google.com/maps?q=25.2,55.27");
  });

  it("builds Google satellite URL", () => {
    expect(googleMapsSatelliteUrl(25.2, 55.27, 18)).toBe(
      "https://www.google.com/maps/@25.2,55.27,18z/data=!3m1!1e3",
    );
  });
});
